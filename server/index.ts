import { Server, Room, Client } from "colyseus";
import { Schema, MapSchema, ArraySchema, type } from "@colyseus/schema";
import http from "http";
import express from "express";
import cors from "cors";

class TileStack extends Schema { @type(["number"]) items = new ArraySchema<number>(); }
class Player extends Schema {
    @type("number") x: number = 0; @type("number") y: number = 0;
    @type("string") nombre: string = ""; @type("number") skin: number = 7;
    @type("number") hp: number = 100; @type("number") maxHp: number = 100;
    @type("number") direction: number = 0; @type("boolean") isMoving: boolean = false;
    _lastHeal: number = 0; // cooldown interno, no sincronizado al cliente
}
class Monster extends Schema {
    @type("string") tipo: string = "slime_green";
    @type("number") x: number = 0; @type("number") y: number = 0;
    @type("number") hp: number = 30; @type("number") maxHp: number = 30;
}
class GameState extends Schema {
    @type("number") width: number = 20; @type("number") height: number = 20;
    @type({ map: TileStack }) map = new MapSchema<TileStack>();
    @type({ map: Player }) players = new MapSchema<Player>();
    @type({ map: Monster }) monsters = new MapSchema<Monster>();
}

class MyRoom extends Room<GameState> {
    onCreate(_options: any) {
        console.log("🏛️ SERVIDOR: Cargando Mapa de Prueba (Temple City)...");
        const state = new GameState();
        
        // DISEÑO DEL MAPA (20x20)
        // 0 = Nada, 1 = Pasto, 2 = Pared Piedra, 3 = Piso Losas, 4 = Agua
        // Esto crea un pequeño templo rodeado de pasto y agua
        const mapDesign = [
            [4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4],
            [4,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,4],
            [4,1,2,2,2,2,2,2,2,1,1,2,2,2,2,2,2,1,1,4],
            [4,1,2,3,3,3,3,3,2,1,1,2,3,3,3,3,2,1,1,4],
            [4,1,2,3,3,3,3,3,2,1,1,2,3,3,3,3,2,1,1,4],
            [4,1,2,3,3,3,3,3,2,1,1,2,3,3,3,3,2,1,1,4],
            [4,1,2,2,2,0,2,2,2,1,1,2,2,0,2,2,2,1,1,4], // Puertas (0 es hueco)
            [4,1,1,1,3,3,3,1,1,1,1,1,3,3,3,1,1,1,1,4],
            [4,1,1,1,3,3,3,1,1,3,1,1,3,3,3,1,1,1,1,4], // Plaza Central
            [4,1,1,1,3,3,3,3,3,3,3,3,3,3,3,1,1,1,1,4],
            [4,1,1,1,3,3,3,1,1,3,1,1,3,3,3,1,1,1,1,4],
            [4,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,4],
            [4,1,2,2,2,2,2,1,1,1,1,1,2,2,2,2,2,1,1,4],
            [4,1,2,3,3,3,2,1,1,1,1,1,2,3,3,3,2,1,1,4],
            [4,1,2,3,3,3,2,1,1,1,1,1,2,3,3,3,2,1,1,4],
            [4,1,2,2,0,2,2,1,1,1,1,1,2,2,0,2,2,1,1,4],
            [4,1,1,1,3,1,1,1,1,1,1,1,1,1,3,1,1,1,1,4],
            [4,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,4],
            [4,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,4],
            [4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4]
        ];

        state.width = 20; state.height = 20;

        // CONSTRUIR EL MAPA DESDE EL DISEÑO
        for (let y = 0; y < 20; y++) {
            for (let x = 0; x < 20; x++) {
                const i = y * 20 + x;
                const stack = new TileStack();
                const tileType = mapDesign[y][x];

                // Lógica de construcción
                if (tileType === 4) stack.items.push(4); // Agua
                else {
                    stack.items.push(1); // Pasto base siempre
                    if (tileType === 3) stack.items.push(3); // Piso losa
                    if (tileType === 2) stack.items.push(2); // Pared
                }
                
                state.map.set(i.toString(), stack);
            }
        }
        this.setState(state);

        // --- Fase 4: monstruos reales (antes el botón de ataque no tenía
        // a quién golpear). 3 slimes spawneados en la Plaza Central, sobre
        // celdas de piso (id=3) confirmadas caminables.
        const monsterSpawns = [
            { tileX: 6,  tileY: 9, tipo: "slime_green", hp: 30 },
            { tileX: 9,  tileY: 9, tipo: "slime_red",   hp: 45 },
            { tileX: 12, tileY: 9, tipo: "slime_green", hp: 30 },
        ];
        monsterSpawns.forEach((spec, idx) => {
            const m = new Monster();
            m.tipo = spec.tipo; m.hp = spec.hp; m.maxHp = spec.hp;
            m.x = spec.tileX * 32; m.y = spec.tileY * 32;
            this.state.monsters.set("m" + idx, m);
        });

        // Antes los monstruos eran solo un saco de boxeo: nunca devolvían
        // el golpe. Ahora, una vez por segundo, cada monstruo vivo daña a
        // cualquier jugador dentro de rango cuerpo a cuerpo - combate real
        // de dos vías, no un tiro al blanco. Al llegar a 0 hp, el jugador
        // "muere" (queda inmóvil, ver chequeo en 'mover') y reaparece en el
        // spawn tras 3s con la vida llena.
        this.clock.setInterval(() => {
            this.state.monsters.forEach((m) => {
                this.state.players.forEach((p) => {
                    if (p.hp <= 0) return;
                    const dist = Math.hypot(p.x - m.x, p.y - m.y);
                    if (dist > 40) return;

                    const dmg = 8;
                    p.hp = Math.max(0, p.hp - dmg);
                    this.broadcast("combat_text", { x: p.x, y: p.y - 20, val: '-' + dmg, color: '#ff4444' });

                    if (p.hp <= 0) {
                        this.broadcast("combat_text", { x: p.x, y: p.y - 40, val: 'Has muerto', color: '#ffffff' });
                        this.clock.setTimeout(() => {
                            p.hp = p.maxHp;
                            p.x = 10 * 32; p.y = 10 * 32; // respawn en el centro
                        }, 3000);
                    }
                });
            });
        }, 1000);

        this.onMessage("mover", (client, data) => {
            const p = this.state.players.get(client.sessionId);
            if (!p) return;
            if (p.hp <= 0) return; // no moverse mientras está muerto/respawneando

            // FIX: antes se validaba (x,y) combinado en un solo chequeo, lo
            // cual permitía cortar esquinas de forma inconsistente cerca de
            // paredes. Ahora se valida cada eje por separado, permitiendo
            // "deslizarse" a lo largo de una pared (comportamiento estándar
            // en juegos top-down) en vez de quedar bloqueado o atravesarla.
            if (this.isWalkable(data.x, p.y)) p.x = data.x;
            if (this.isWalkable(p.x, data.y)) p.y = data.y;
            p.direction = data.dir; p.isMoving = true;
            this.clock.setTimeout(() => { p.isMoving = false; }, 100);
        });

        this.onMessage("chat", (client, data) => {
            const p = this.state.players.get(client.sessionId);
            if (!p) return;
            const msg = (data && data.msg || "").toString().slice(0, 140).trim();
            if (!msg) return;
            // Antes: el chat solo se mostraba localmente en el navegador del
            // que escribía, sin pasar nunca por el servidor - nadie más lo
            // veía. Ahora se transmite de verdad a todos los jugadores.
            this.broadcast("chat", { nombre: p.nombre, msg });
        });

        this.onMessage("heal", (client) => {
            const p = this.state.players.get(client.sessionId);
            if (!p || p.hp <= 0) return;
            const now = Date.now();
            if (p._lastHeal && now - p._lastHeal < 3000) return; // cooldown 3s
            p._lastHeal = now;
            const amount = 20;
            p.hp = Math.min(p.maxHp, p.hp + amount);
            this.broadcast("combat_text", { x: p.x, y: p.y - 20, val: '+' + amount, color: '#3ddc3d' });
        });

        this.onMessage("attack", (c, data) => {
            const p = this.state.players.get(c.sessionId);
            if (!p) return;
            const targetId = data && data.targetId;
            if (!targetId) return;
            const m = this.state.monsters.get(targetId);
            if (!m) return;

            // Rango de ataque cuerpo a cuerpo. Antes era 90px, mayor al
            // rango de contraataque de los monstruos (40px) - eso permitía
            // golpear sin nunca recibir daño de vuelta (kiting gratuito),
            // rompiendo el sentido de un combate de dos vías. Ajustado a
            // un margen pequeño sobre el rango de los monstruos.
            const dist = Math.hypot(p.x - m.x, p.y - m.y);
            if (dist > 50) return;

            const dmg = 15;
            m.hp -= dmg;
            this.broadcast("combat_text", { x: m.x, y: m.y - 20, val: String(dmg) });

            if (m.hp <= 0) {
                const { tipo, x, y, maxHp } = m;
                this.state.monsters.delete(targetId);
                // Respawn simple tras 15s, mismo lugar - loop de farmeo básico
                this.clock.setTimeout(() => {
                    const respawn = new Monster();
                    respawn.tipo = tipo; respawn.hp = maxHp; respawn.maxHp = maxHp;
                    respawn.x = x; respawn.y = y;
                    this.state.monsters.set(targetId, respawn);
                }, 15000);
            }
        });
    }

    isWalkable(px: number, py: number) {
        const tx = Math.round(px/32); const ty = Math.round(py/32);
        const i = ty * 20 + tx;
        const s = this.state.map.get(i.toString());
        if(!s) return false;
        // Pared (2) y Agua (4) bloquean
        for(let j=0; j<s.items.length; j++) if(s.items[j]===2 || s.items[j]===4) return false;
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
    onLeave(client: Client) { this.state.players.delete(client.sessionId); }
}

const app = express(); app.use(cors()); app.use(express.json());
const server = http.createServer(app); const gameServer = new Server({ server });
gameServer.define("mundo_mythica", MyRoom);
server.listen(Number(process.env.PORT || 3000), () => console.log("ONLINE"));
