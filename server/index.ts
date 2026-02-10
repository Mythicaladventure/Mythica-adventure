import { Server, Room, Client } from "colyseus";
import { Schema, MapSchema, type } from "@colyseus/schema";
import http from "http";
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";

// =============================================================================
// 1. DEFINICIÓN DEL ESTADO (Schema)
// =============================================================================

class Player extends Schema {
    @type("number") x: number = 0;
    @type("number") y: number = 0;
    @type("string") nombre: string = "Guest";
    @type("number") skin: number = 0; // ID del Sprite
    @type("number") hp: number = 100;
    @type("number") maxHp: number = 100;
}

class GameState extends Schema {
    @type("number") width: number = 20; // Mapa pequeño para carga rápida
    @type("number") height: number = 20;
    @type({ map: "number" }) map = new MapSchema<number>(); 
    @type({ map: Player }) players = new MapSchema<Player>();
}

// =============================================================================
// 2. LÓGICA DE LA SALA (Generador de Mapa)
// =============================================================================

class MyRoom extends Room<GameState> {
    
    onCreate(_options: any) {
        console.log("⚔️ SALA INICIADA: Generando mundo...");

        // 1. Inicializar Estado
        const state = new GameState();
        state.width = 20;  // Ancho fijo
        state.height = 20; // Alto fijo
        this.setState(state);

        // 2. CONSTRUIR EL MAPA (Síncrono)
        // Usamos IDs simples: 1=Pasto, 2=Pared, 3=Suelo
        console.log("🔨 Construyendo terreno...");

        for (let x = 0; x < state.width; x++) {
            for (let y = 0; y < state.height; y++) {
                const index = y * state.width + x;
                
                let tileID = 1; // Base: Pasto

                // Bordes del mapa: Paredes
                if (x === 0 || x === state.width - 1 || y === 0 || y === state.height - 1) {
                    tileID = 2; 
                }
                
                // Zona central (Ciudad): Suelo de madera/piedra
                if (x > 5 && x < 15 && y > 5 && y < 15) {
                    tileID = 3;
                }

                // Guardar en el mapa compartido
                state.map.set(index.toString(), tileID);
            }
        }
        console.log(`✅ Mapa listo: ${state.map.size} bloques.`);

        // 3. MANEJADORES DE MENSAJES (Inputs)
        this.onMessage("mover", (client, data) => {
            const player = this.state.players.get(client.sessionId);
            if (player) {
                player.x = data.x;
                player.y = data.y;
            }
        });

        this.onMessage("attack", (client, _data) => {
            const attacker = this.state.players.get(client.sessionId);
            if (attacker) {
                // Notificar golpe a todos
                this.broadcast("combat_text", { 
                    x: attacker.x,
                    y: attacker.y - 30,
                    value: "HIT!", type: "DAMAGE"
                });
            }
        });
    }

    onJoin(client: Client, options: any) {
        const playerName = options.name || "Héroe";
        console.log(`➕ Conectado: ${playerName} (${client.sessionId})`);
        
        const player = new Player();
        
        // Spawn Seguro: Centro del mapa (10, 10) x 32px
        player.x = 10 * 32;
        player.y = 10 * 32;
        player.nombre = playerName;
        player.skin = 0; // Usar primer sprite
        
        this.state.players.set(client.sessionId, player);
    }

    onLeave(client: Client) {
        console.log(`➖ Desconectado: ${client.sessionId}`);
        this.state.players.delete(client.sessionId);
    }
}

// =============================================================================
// 3. SERVIDOR HTTP (Express + Colyseus)
// =============================================================================
const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const gameServer = new Server({ server: server });

// Registrar la sala
gameServer.define("mundo_mythica", MyRoom);

// Puerto dinámico para Render
const port = Number(process.env.PORT || 3000);

server.listen(port, () => {
    console.log(`🚀 SERVIDOR INDUSTRIAL ONLINE en puerto ${port}`);
});
