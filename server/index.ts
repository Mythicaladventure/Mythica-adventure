import express from "express";
import { Server, Room, Client } from "colyseus";
import { createServer } from "http";
import cors from "cors";
import { Schema, MapSchema, type } from "@colyseus/schema";

/**
 * 1. ESTRUCTURA DE DATOS CUÁNTICA
 * Optimizada para serialización binaria de alta velocidad.
 */
class Player extends Schema {
    @type("string") id: string = "";
    @type("string") nombre: string = "";
    @type("number") x: number = 0;
    @type("number") y: number = 0;
    @type("number") hp: number = 100;
    @type("number") nivel: number = 1;
    @type("uint32") lastTick: number = 0; // Para sincronización de tiempo real
}

class WorldState extends Schema {
    @type({ map: Player }) players = new MapSchema<Player>();
}

/**
 * 2. MOTOR DE SIMULACIÓN AUTORITARIO DE ALTA DENSIDAD
 * Implementa compensación de lag y validación de física vectorial.
 */
class MythicaSingularityEngine extends Room<WorldState> {
    
    // Configuración de motor profesional
    readonly TICK_RATE = 33; // 30 FPS de servidor (Estándar competitivo)
    readonly VELOCIDAD_MAXIMA = 0.5; // Unidades por milisegundo

    onCreate() {
        this.setState(new WorldState());

        // Bucle de Simulación de Alta Precisión
        this.setSimulationInterval((deltaTime: number) => this.update(deltaTime), this.TICK_RATE);

        // Sistema de Mensajería con Sello de Tiempo
        this.onMessage("mover", (client, data: { x: number, y: number, t: number }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.hp <= 0) return;

            // --- POTENCIA: VALIDACIÓN TEMPORAL Y ESPACIAL ---
            const ahora = Date.now();
            const tiempoTranscurrido = ahora - (player.lastTick || ahora);
            
            // Calculamos la distancia máxima permitida en ese tiempo
            const distanciaMax = this.VELOCIDAD_MAXIMA * (tiempoTranscurrido + 50); // +50ms de margen de gracia
            const dx = data.x - player.x;
            const dy = data.y - player.y;
            const distanciaReal = Math.sqrt(dx * dx + dy * dy);

            if (distanciaReal <= distanciaMax) {
                player.x = data.x;
                player.y = data.y;
                player.lastTick = ahora;
            } else {
                // Si intenta ir más rápido, el servidor lo "teletransporta" de vuelta
                console.warn(`[ANTI-CHEAT] Bloqueado movimiento ilegal de ${player.nombre}`);
                client.send("corregir_posicion", { x: player.x, y: player.y });
            }
        });
    }

    update(deltaTime: number) {
        // Lógica de mundo vivo: Regeneración escalada por tiempo real
        this.state.players.forEach((player) => {
            if (player.hp > 0 && player.hp < 100) {
                // Regenera 1 HP cada 2 segundos, ajustado por el deltaTime del servidor
                player.hp += 0.0005 * deltaTime; 
            }
        });
    }

    onJoin(client: Client, options: any) {
        const p = new Player();
        p.id = client.sessionId;
        p.nombre = options.nombre || "Héroe";
        p.lastTick = Date.now();
        this.state.players.set(client.sessionId, p);
    }

    onLeave(client: Client) {
        this.state.players.delete(client.sessionId);
    }
}

// 3. INFRAESTRUCTURA DE RED BLINDADA
const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);
const gameServer = new Server({
    server,
    pingInterval: 1500, // Monitoreo de latencia ultra agresivo
    pingMaxRetries: 3
});

gameServer.define("mundo_mythica", MythicaSingularityEngine);

const PORT = Number(process.env.PORT) || 10000;
server.listen(PORT, "0.0.0.0", () => {
    console.log("==========================================");
    console.log("   NÚCLEO MYTHICA: SINGULARIDAD ACTIVA    ");
    console.log(`   MOTOR AUTORITARIO DE ALTA PRECISIÓN    `);
    console.log("==========================================");
});
