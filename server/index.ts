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
}
class GameState extends Schema {
    @type("number") width: number = 20; @type("number") height: number = 20;
    @type({ map: TileStack }) map = new MapSchema<TileStack>();
    @type({ map: Player }) players = new MapSchema<Player>();
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

        this.onMessage("mover", (client, data) => {
            const p = this.state.players.get(client.sessionId);
            if (!p) return;
            if (this.isWalkable(data.x, data.y)) {
                p.x = data.x; p.y = data.y; p.direction = data.dir; p.isMoving = true;
            }
            this.clock.setTimeout(() => { p.isMoving = false; }, 100);
        });

        this.onMessage("attack", (c) => {
            const p = this.state.players.get(c.sessionId);
            if(p) this.broadcast("combat_text", {x:p.x, y:p.y-30, val:"15"});
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
