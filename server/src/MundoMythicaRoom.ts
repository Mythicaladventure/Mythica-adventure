import { Room, Client } from "colyseus";
import { GameState, TileStack, Player, Monster, InventoryItem } from "./schema";
import { TEMPLE_CITY_MAP, MAP_WIDTH, MAP_HEIGHT, MONSTER_SPAWNS } from "./mapData";
import {
    MONSTER_ATTACK_INTERVAL_MS, MONSTER_ATTACK_RANGE_PX, MONSTER_ATTACK_DAMAGE,
    PLAYER_ATTACK_RANGE_PX, PLAYER_ATTACK_DAMAGE, MONSTER_RESPAWN_MS,
    PLAYER_RESPAWN_MS, HEAL_AMOUNT, HEAL_COOLDOWN_MS, CHAT_MAX_LENGTH,
    xpForLevel, HP_PER_LEVEL, MONSTER_XP_REWARD, MONSTER_XP_REWARD_DEFAULT,
    ITEM_DROP_CHANCE, ITEM_DROP_TABLE, INVENTORY_MAX_SLOTS,
} from "./balance";
import { isDBConnected } from "./db";
import { AccountModel } from "./models/Account";
import { hashPassword, verifyPassword } from "./auth";

/** Cada cuánto se auto-guarda el estado de todos los jugadores
 * conectados (red de seguridad ante caídas/reinicios de Render, sin
 * depender solo de onLeave). */
const AUTOSAVE_INTERVAL_MS = 60_000;

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
        this.startAutosave();
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

    /** Auto-guardado periódico de todas las cuentas conectadas. Si Mongo
     * no está disponible esto simplemente no hace nada (isDBConnected
     * en false) - no hay branching especial que mantener en otros
     * lados del código por esto. */
    private startAutosave() {
        this.clock.setInterval(() => {
            if (!isDBConnected()) return;
            this.state.players.forEach((p) => this.saveAccount(p));
        }, AUTOSAVE_INTERVAL_MS);
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

        if (m.hp <= 0) this.handleMonsterDeath(targetId, m, p);
    }

    private handleMonsterDeath(targetId: string, m: Monster, killer: Player) {
        const { tipo, x, y, maxHp } = m;
        this.state.monsters.delete(targetId);
        this.clock.setTimeout(() => {
            const respawn = new Monster();
            respawn.tipo = tipo; respawn.hp = maxHp; respawn.maxHp = maxHp;
            respawn.x = x; respawn.y = y;
            this.state.monsters.set(targetId, respawn);
        }, MONSTER_RESPAWN_MS);

        this.awardXP(killer, MONSTER_XP_REWARD[tipo] ?? MONSTER_XP_REWARD_DEFAULT);
        this.rollItemDrop(killer);
    }

    /** Otorga XP y procesa tantos level-ups como correspondan (por si
     * una sola muerte alcanza para subir más de un nivel de golpe). */
    private awardXP(p: Player, amount: number) {
        p.xp += amount;
        this.broadcast("combat_text", { x: p.x, y: p.y - 35, val: '+' + amount + ' XP', color: '#66d9ff' });

        while (p.xp >= p.xpToNext) {
            p.xp -= p.xpToNext;
            p.level += 1;
            p.xpToNext = xpForLevel(p.level);
            p.maxHp += HP_PER_LEVEL;
            p.hp = p.maxHp; // subir de nivel también cura del todo, como en la mayoría de MMOs
            this.broadcast("combat_text", { x: p.x, y: p.y - 55, val: '¡Nivel ' + p.level + '!', color: '#ffd700' });
        }
    }

    /** Tirada simple de drop: probabilidad fija, item al azar de la
     * tabla genérica. Si el jugador ya tiene ese item, se apila en vez
     * de ocupar un slot nuevo. */
    private rollItemDrop(p: Player) {
        if (Math.random() > ITEM_DROP_CHANCE) return;
        const drop = ITEM_DROP_TABLE[Math.floor(Math.random() * ITEM_DROP_TABLE.length)];

        const existing = p.inventory.find((it) => it.itemId === drop.itemId);
        if (existing) {
            existing.qty += 1;
        } else {
            if (p.inventory.length >= INVENTORY_MAX_SLOTS) return; // inventario lleno, se pierde el drop (mejora futura: aviso al jugador)
            const item = new InventoryItem();
            item.itemId = drop.itemId; item.nombre = drop.nombre; item.qty = 1;
            p.inventory.push(item);
        }
        this.broadcast("combat_text", { x: p.x, y: p.y - 45, val: '+ ' + drop.nombre, color: '#c9a0ff' });
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

    /**
     * Login/registro real contra MongoDB.
     *
     * - Si Mongo no está conectado (modo degradado, ver db.ts): se
     *   acepta cualquier nombre sin contraseña, igual que el
     *   comportamiento anterior a este cambio (fallback total).
     * - Si Mongo SÍ está conectado: nombre+contraseña son obligatorios.
     *   Cuenta nueva -> se crea. Cuenta existente -> se valida la
     *   contraseña; si no coincide, se rechaza el join (el cliente ve
     *   el mensaje de error vía el catch de joinOrCreate).
     */
    async onJoin(client: Client, options: any) {
        const p = new Player();
        const nombreCrudo = (options && options.name || "").toString().trim().slice(0, 16);
        const password = (options && options.password || "").toString();

        if (!nombreCrudo) throw new Error("Nombre inválido.");

        if (!isDBConnected()) {
            // Modo degradado: comportamiento original, sin cuentas reales.
            p.nombre = nombreCrudo;
            p.x = 10 * 32; p.y = 10 * 32;
        } else {
            if (password.length < 4) throw new Error("La contraseña debe tener al menos 4 caracteres.");

            let account = await AccountModel.findOne({ nombre: nombreCrudo });

            if (!account) {
                const { hash, salt } = await hashPassword(password);
                try {
                    account = await AccountModel.create({
                        nombre: nombreCrudo,
                        passwordHash: hash,
                        passwordSalt: salt,
                    });
                } catch (err: any) {
                    // Carrera: dos clientes registrando el mismo nombre al
                    // mismo tiempo. El índice unique de Mongo rechaza el
                    // segundo insert - se lo tratamos como "nombre en uso".
                    if (err && err.code === 11000) {
                        throw new Error("Ese nombre ya está en uso.");
                    }
                    throw err;
                }
            } else {
                const ok = await verifyPassword(password, account.passwordHash, account.passwordSalt);
                if (!ok) throw new Error("Contraseña incorrecta.");
            }

            account.lastLogin = new Date();
            await account.save();

            p.nombre = account.nombre;
            p.level = account.level;
            p.xp = account.xp;
            p.xpToNext = xpForLevel(account.level);
            p.maxHp = account.maxHp;
            p.hp = account.maxHp; // siempre entra con vida llena, evita respawns "muerto" raros
            p.x = account.x;
            p.y = account.y;
            account.inventory.forEach((it: any) => {
                const item = new InventoryItem();
                item.itemId = it.itemId; item.nombre = it.nombre; item.qty = it.qty;
                p.inventory.push(item);
            });
            p._accountName = account.nombre;
        }

        this.state.players.set(client.sessionId, p);

        const mapData: any[] = [];
        this.state.map.forEach((v, k) => mapData.push({ i: parseInt(k), s: v.items.toArray() }));
        client.send("map_chunk", mapData);
    }

    async onLeave(client: Client) {
        const p = this.state.players.get(client.sessionId);
        if (p) await this.saveAccount(p);
        this.state.players.delete(client.sessionId);
    }

    /** Guarda el estado actual de un Player en su cuenta de Mongo. No
     * hace nada si el jugador es de una sesión sin cuenta real (modo
     * degradado, o por algún motivo _accountName vacío) para no crear
     * documentos basura. Los errores se registran pero NUNCA tumban el
     * servidor - guardar es "best effort". */
    private async saveAccount(p: Player) {
        if (!isDBConnected() || !p._accountName) return;
        try {
            await AccountModel.updateOne(
                { nombre: p._accountName },
                {
                    level: p.level,
                    xp: p.xp,
                    maxHp: p.maxHp,
                    x: p.x,
                    y: p.y,
                    inventory: p.inventory.map((it) => ({ itemId: it.itemId, nombre: it.nombre, qty: it.qty })),
                }
            );
        } catch (err) {
            console.error(`❌ Error guardando cuenta '${p._accountName}':`, (err as Error).message);
        }
    }
}
