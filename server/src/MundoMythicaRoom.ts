import { Room, Client } from "colyseus";
import { GameState, TileStack, Player, Monster } from "./schema";
import { TEMPLE_CITY_MAP, MAP_WIDTH, MAP_HEIGHT, MONSTER_SPAWNS } from "./mapData";
import {
    MONSTER_ATTACK_INTERVAL_MS, MONSTER_ATTACK_RANGE_PX, MONSTER_ATTACK_DAMAGE,
    PLAYER_ATTACK_RANGE_PX, PLAYER_ATTACK_DAMAGE, MONSTER_RESPAWN_MS,
    PLAYER_RESPAWN_MS, HEAL_AMOUNT, HEAL_COOLDOWN_MS, CHAT_MAX_LENGTH,
} from "./balance";

export class MundoMythicaRoom extends Room<GameState> {

    onCreate(_options: any) {
        console.log("🏛️ SERVIDOR: Cargando Mapa de Prueba (Temple City)...");
        const state = new GameState();
        state.width = MAP_WIDTH; state.height = MAP_HEIGHT;

        this.buildMap(state);
        this.setState(state);
        this.spawnMonsters();
        this.startMonsterAI();
        this.registerMessageHandlers();
    }

    /** Construye el mapa de tiles a partir del diseño de mapData.ts. */
    private buildMap(state: GameState) {
        for (let y = 0; y < MAP_HEIGHT; y++) {
            for (let x = 0; x < MAP_WIDTH; x++) {
                const i = y * MAP_WIDTH + x;
                const stack = new TileStack();
                const tileType = TEMPLE_CITY_MAP[y][x];

                if (tileType === 4) {
                    stack.items.push(4); // Agua
                } else {
                    stack.items.push(1); // Pasto base siempre
                    if (tileType === 3) stack.items.push(3); // Piso losa
                    if (tileType === 2) stack.items.push(2); // Pared
                }
                state.map.set(i.toString(), stack);
            }
        }
    }

    private spawnMonsters() {
        MONSTER_SPAWNS.forEach((spec, idx) => {
            const m = new Monster();
            m.tipo = spec.tipo; m.hp = spec.hp; m.maxHp = spec.hp;
            m.x = spec.tileX * 32; m.y = spec.tileY * 32;
            this.state.monsters.set("m" + idx, m);
        });
    }

    /** Combate de dos vías: los monstruos contraatacan periódicamente a
     * cualquier jugador dentro de rango, en vez de ser un saco de boxeo. */
    private startMonsterAI() {
        this.clock.setInterval(() => {
            this.state.monsters.forEach((m) => {
                this.state.players.forEach((p) => {
                    if (p.hp <= 0) return;
                    const dist = Math.hypot(p.x - m.x, p.y - m.y);
                    if (dist > MONSTER_ATTACK_RANGE_PX) return;

                    p.hp = Math.max(0, p.hp - MONSTER_ATTACK_DAMAGE);
                    this.broadcast("combat_text", {
                        x: p.x, y: p.y - 20, val: '-' + MONSTER_ATTACK_DAMAGE, color: '#ff4444'
                    });

                    if (p.hp <= 0) this.handlePlayerDeath(p);
                });
            });
        }, MONSTER_ATTACK_INTERVAL_MS);
    }

    private handlePlayerDeath(p: Player) {
        this.broadcast("combat_text", { x: p.x, y: p.y - 40, val: 'Has muerto', color: '#ffffff' });
        this.clock.setTimeout(() => {
            p.hp = p.maxHp;
            p.x = 10 * 32; p.y = 10 * 32; // respawn en el centro
        }, PLAYER_RESPAWN_MS);
    }

    private registerMessageHandlers() {
        this.onMessage("mover", (client, data) => this.handleMove(client, data));
        this.onMessage("chat", (client, data) => this.handleChat(client, data));
        this.onMessage("heal", (client) => this.handleHeal(client));
        this.onMessage("attack", (client, data) => this.handleAttack(client, data));
    }

    private handleMove(client: Client, data: any) {
        const p = this.state.players.get(client.sessionId);
        if (!p) return;
        if (p.hp <= 0) return; // no moverse mientras está muerto/respawneando

        // Cada eje se valida por separado, permitiendo "deslizarse" a lo
        // largo de una pared (comportamiento estándar en juegos top-down)
        // en vez de quedar bloqueado en seco al cortar una esquina.
        if (this.isWalkable(data.x, p.y)) p.x = data.x;
        if (this.isWalkable(p.x, data.y)) p.y = data.y;
        p.direction = data.dir; p.isMoving = true;
        this.clock.setTimeout(() => { p.isMoving = false; }, 100);
    }

    private handleChat(client: Client, data: any) {
        const p = this.state.players.get(client.sessionId);
        if (!p) return;
        const msg = (data && data.msg || "").toString().slice(0, CHAT_MAX_LENGTH).trim();
        if (!msg) return;
        this.broadcast("chat", { nombre: p.nombre, msg });
    }

    private handleHeal(client: Client) {
        const p = this.state.players.get(client.sessionId);
        if (!p || p.hp <= 0) return;
        const now = Date.now();
        if (p._lastHeal && now - p._lastHeal < HEAL_COOLDOWN_MS) return;
        p._lastHeal = now;
        p.hp = Math.min(p.maxHp, p.hp + HEAL_AMOUNT);
        this.broadcast("combat_text", { x: p.x, y: p.y - 20, val: '+' + HEAL_AMOUNT, color: '#3ddc3d' });
    }

    private handleAttack(client: Client, data: any) {
        const p = this.state.players.get(client.sessionId);
        if (!p) return;
        const targetId = data && data.targetId;
        if (!targetId) return;
        const m = this.state.monsters.get(targetId);
        if (!m) return;

        // IMPORTANTE: este rango DEBE coincidir con el chequeo del lado
        // del cliente (client/src/scenes/GameScene.js, attackNearestMonster)
        // - si se cambia acá sin cambiar el cliente, el jugador vería
        // intentos de ataque fallar en silencio sin entender por qué.
        const dist = Math.hypot(p.x - m.x, p.y - m.y);
        if (dist > PLAYER_ATTACK_RANGE_PX) return;

        m.hp -= PLAYER_ATTACK_DAMAGE;
        this.broadcast("combat_text", { x: m.x, y: m.y - 20, val: String(PLAYER_ATTACK_DAMAGE) });

        if (m.hp <= 0) this.handleMonsterDeath(targetId, m);
    }

    private handleMonsterDeath(targetId: string, m: Monster) {
        const { tipo, x, y, maxHp } = m;
        this.state.monsters.delete(targetId);
        this.clock.setTimeout(() => {
            const respawn = new Monster();
            respawn.tipo = tipo; respawn.hp = maxHp; respawn.maxHp = maxHp;
            respawn.x = x; respawn.y = y;
            this.state.monsters.set(targetId, respawn);
        }, MONSTER_RESPAWN_MS);
    }

    isWalkable(px: number, py: number): boolean {
        const tx = Math.round(px / 32);
        const ty = Math.round(py / 32);
        const i = ty * MAP_WIDTH + tx;
        const s = this.state.map.get(i.toString());
        if (!s) return false;
        // Pared (2) y Agua (4) bloquean
        for (let j = 0; j < s.items.length; j++) {
            if (s.items[j] === 2 || s.items[j] === 4) return false;
        }
        return true;
    }

    onJoin(client: Client, options: any) {
        const p = new Player();
        p.x = 10 * 32; p.y = 10 * 32; // Spawn en el centro (Plaza)
        p.nombre = options.name || "Player";
        this.state.players.set(client.sessionId, p);

        const mapData: any[] = [];
        this.state.map.forEach((v, k) => mapData.push({ i: parseInt(k), s: v.items.toArray() }));
        client.send("map_chunk", mapData);
    }

    onLeave(client: Client) {
        this.state.players.delete(client.sessionId);
    }
}
