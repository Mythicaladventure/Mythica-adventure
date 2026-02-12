import { Server, Room, Client } from "colyseus";
import { Schema, MapSchema, ArraySchema, type } from "@colyseus/schema";
import http from "http";
import express from "express";
import cors from "cors";

class TileStack extends Schema {
    @type(["number"]) items = new ArraySchema<number>();
}

class Player extends Schema {
    @type("number") x: number = 0;
    @type("number") y: number = 0;
    @type("string") nombre: string = "";
    @type("number") skin: number = 7;
    @type("number") hp: number = 100;
    @type("number") maxHp: number = 100;
    // Agregamos dirección para animación (0:Abajo, 1:Izq, 2:Der, 3:Arriba)
    @type("number") direction: number = 0; 
    @type("boolean") isMoving: boolean = false;
}

class GameState extends Schema {
    @type("number") width: number = 60;
    @type("number") height: number = 60;
    @type({ map: TileStack }) map = new MapSchema<TileStack>();
    @type({ map: Player }) players = new MapSchema<Player>();
}

class MyRoom extends Room<GameState> {
    onCreate(_options: any) {
        console.log("🛡️ SERVIDOR v11: Sistema de Colisiones Activo");
        const state = new GameState();
        state.width = 60; state.height = 60;

        // --- GENERADOR DE MAPA ---
        for (let x = 0; x < 60; x++) {
            for (let y = 0; y < 60; y++) {
                const i = y * 60 + x;
                const stack = new TileStack();
                
                // Suelo base
                let ground = 1; // Pasto
                if (x>25 && x<35 && y>25 && y<35) ground = 3; // Piedra
                stack.items.push(ground);

                // Paredes (Obstáculos)
                let wall = 0;
                // Muralla externa
                if (x==20 || x==40 || y==20 || y==40) {
                     if(x>20 && x<40 && y>20 && y<40) { // Solo el cuadrado central
                        if (x!==30 && y!==30) wall = 2; // Puertas
                     }
                }
                // Árboles/Rocas aleatorias
                if (ground === 1 && Math.random() < 0.03) wall = 2; // Usamos 2 como obstáculo genérico

                if (wall > 0) stack.items.push(wall);
                
                state.map.set(i.toString(), stack);
            }
        }
        this.setState(state);

        // --- MOVIMIENTO CON VALIDACIÓN ---
        this.onMessage("mover", (client, data) => {
            const p = this.state.players.get(client.sessionId);
            if (!p) return;

            // 1. Validar Colisión
            if (this.isWalkable(data.x, data.y)) {
                p.x = data.x;
                p.y = data.y;
                p.direction = data.dir; // Guardar hacia dónde mira
                p.isMoving = true;
            } else {
                // Si choca, no se mueve, pero actualizamos dirección si quieres
                p.isMoving = false;
            }
            
            // Timeout para dejar de "mover" la animación si deja de enviar paquetes
            this.clock.setTimeout(() => { p.isMoving = false; }, 100);
        });

        this.onMessage("attack", (client) => {
            const p = this.state.players.get(client.sessionId);
            if (p) this.broadcast("combat_text", { x: p.x, y: p.y-30, val: "HIT!" });
        });
    }

    // FUNCIÓN CRÍTICA: ¿SE PUEDE CAMINAR AQUÍ?
    isWalkable(pixelX: number, pixelY: number) {
        // Convertir pixel a grid
        const tileX = Math.round(pixelX / 32);
        const tileY = Math.round(pixelY / 32);
        const index = tileY * 60 + tileX;

        const stack = this.state.map.get(index.toString());
        if (!stack) return false; // Fuera del mapa

        // Revisar si hay algo sólido en el stack
        // Asumimos que ID 2 (Pared) y ID 4 (Roca) son sólidos
        for (let i = 0; i < stack.items.length; i++) {
            const item = stack.items[i];
            if (item === 2 || item === 4) return false; // ¡CHOQUE!
        }
        return true; // Camino libre
    }

    onJoin(client: Client, options: any) {
        console.log("➕", client.sessionId);
        const p = new Player();
        p.x = 30 * 32; p.y = 30 * 32;
        p.nombre = options.name || "Héroe";
        this.state.players.set(client.sessionId, p);

        const mapData: any[] = [];
        this.state.map.forEach((stack, key) => mapData.push({ i: parseInt(key), s: stack.items.toArray() }));
        client.send("map_chunk", mapData);
    }

    onLeave(client: Client) { this.state.players.delete(client.sessionId); }
}

const app = express();
app.use(cors());
app.use(express.json());
const server = http.createServer(app);
const gameServer = new Server({ server: server });
gameServer.define("mundo_mythica", MyRoom);
server.listen(Number(process.env.PORT || 3000), () => console.log("🚀 ONLINE"));
