import express from "express";
import { Server, Room, Client } from "colyseus";
import { createServer } from "http";
import cors from "cors";
import { Schema, MapSchema, ArraySchema, type } from "@colyseus/schema";

/**
 * 1. ESTRUCTURA DE DATOS EVOLUCIONADA
 */
class Player extends Schema {
    @type("string") id: string = "";
    @type("string") nombre: string = "";
    @type("number") x: number = 0;
    @type("number") y: number = 0;
    @type("number") hp: number = 100;
    @type("number") nivel: number = 1;
    @type("uint32") lastTick: number = 0;
}

class WorldState extends Schema {
    @type({ map: Player }) players = new MapSchema<Player>();
    
    // MEJORA: Sincronización de mapa integrada
    @type(["number"]) map = new ArraySchema<number>();
    @type("number") width: number = 20; 
    @type("number") height: number = 15;
}

/**
 * 2. MOTOR DE SIMULACIÓN "MYTHICA SINGULARITY" CON SOPORTE DE MAPA
 */
class MythicaSingularityEngine extends Room<WorldState> {
    readonly TICK_RATE = 33; 
    readonly VELOCIDAD_MAXIMA = 0.5; 

    onCreate() {
        this.setState(new WorldState());

        // --- INICIALIZACIÓN DINÁMICA DEL MAPA ---
        // Generamos un mapa con bordes de paredes (1) y centro de pasto (0)
        const totalTiles = this.state.width * this.state.height;
        for (let i = 0; i < totalTiles; i++) {
            const isBorder = i < this.state.width || 
                             i % this.state.width === 0 || 
                             (i + 1) % this.state.width === 0 || 
                             i > totalTiles - this.state.width;
            this.state.map.push(isBorder ? 1 : 0);
        }

        this.setSimulationInterval((deltaTime) => this.update(deltaTime), this.TICK_RATE);

        // --- SISTEMA DE MENSAJERÍA ---
        
        // Validación Anti-Cheat de movimiento
        this.onMessage("mover", (client, data) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.hp <= 0) return;

            const ahora = Date.now();
            const tiempoTranscurrido = ahora - (player.lastTick || ahora);
            
            // Física vectorial para evitar teletransportación
            const distanciaMax = this.VELOCIDAD_MAXIMA * (tiempoTranscurrido + 50);
            const dx = data.x - player.x;
            const dy = data.y - player.y;
            const distanciaReal = Math.sqrt(dx * dx + dy * dy); // $$distanciaReal = \sqrt{dx^2 + dy^2}$$

            if (distanciaReal <= distanciaMax) {
                player.x = data.x;
                player.y = data.y;
                player.lastTick = ahora;
            } else {
                client.send("corregir_posicion", { x: player.x, y: player.y });
            }
        });

        // MEJORA: Edición de mapa en tiempo real
        this.onMessage("change_tile", (client, data) => {
            const index = data.y * this.state.width + data.x;
            if (this.state.map[index] !== undefined) {
                this.state.map[index] = data.tileID;
            }
        });
    }

    update(deltaTime: number) {
        // Lógica de regeneración de vida
        this.state.players.forEach((player) => {
            if (player.hp > 0 && player.hp < 100) {
                player.hp += 0.0005 * deltaTime;
            }
        });
    }

    onJoin(client: Client, options: any) {
        const p = new Player();
        p.id = client.sessionId;
        p.nombre = options.name || "Héroe";
        p.lastTick = Date.now();
        this.state.players.set(client.sessionId, p);
    }

    onLeave(client: Client) {
        this.state.players.delete(client.sessionId);
    }
}

// --- INFRAESTRUCTURA DE RED ---
const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);
const gameServer = new Server({ server });

// IMPORTANTE: Asegúrate de que este nombre coincida con el cliente
gameServer.define("mundo_mythica", MythicaSingularityEngine);

const PORT = Number(process.env.PORT) || 10000;
server.listen(PORT, "0.0.0.0", () => {
    console.log("========================================");
    console.log("   NÚCLEO MYTHICA: SINGULARIDAD ACTIVA  ");
    console.log("   MOTOR AUTORITARIO DE ALTA PRECISIÓN  ");
    console.log("========================================");
});
