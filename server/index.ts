import { Server, Room, Client } from "colyseus";
import { Schema, MapSchema, type } from "@colyseus/schema";
import http from "http";
import express from "express";
import cors from "cors";

// =============================================================================
// 1. DEFINICIÓN DEL ESTADO (Schema)
// =============================================================================

class Player extends Schema {
    @type("number") x: number = 0;
    @type("number") y: number = 0;
    @type("string") nombre: string = "Guest";
    @type("number") skin: number = 0; 
    @type("number") hp: number = 100;
    @type("number") maxHp: number = 100;
}

class GameState extends Schema {
    @type("number") width: number = 20; 
    @type("number") height: number = 20;
    @type({ map: "number" }) map = new MapSchema<number>(); 
    @type({ map: Player }) players = new MapSchema<Player>();
}

// =============================================================================
// 2. LÓGICA DE LA SALA (MAPA INSTANTÁNEO)
// =============================================================================

class MyRoom extends Room<GameState> {
    
    onCreate(_options: any) {
        console.log("⚔️ SALA INICIADA: Generando mundo...");

        // 1. PREPARAR EL ESTADO (EN MEMORIA)
        const state = new GameState();
        state.width = 20;  
        state.height = 20; 

        // 2. LLENAR EL MAPA *ANTES* DE PUBLICARLO
        console.log("🔨 Construyendo terreno...");
        for (let x = 0; x < state.width; x++) {
            for (let y = 0; y < state.height; y++) {
                const index = y * state.width + x;
                
                let tileID = 1; // Pasto

                // Paredes en los bordes
                if (x === 0 || x === state.width - 1 || y === 0 || y === state.height - 1) {
                    tileID = 2; 
                }
                
                // Zona central (Suelo)
                if (x > 5 && x < 15 && y > 5 && y < 15) {
                    tileID = 3;
                }

                state.map.set(index.toString(), tileID);
            }
        }

        // 3. ¡AHORA SÍ! PUBLICAR EL ESTADO AL MUNDO
        // Al hacer esto aquí, el cliente recibe el mapa lleno desde el milisegundo 0
        this.setState(state);
        
        console.log(`✅ Mapa publicado: ${state.map.size} bloques.`);

        // 4. MANEJADORES DE MENSAJES
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
        player.x = 10 * 32;
        player.y = 10 * 32;
        player.nombre = playerName;
        player.skin = 0; 
        
        this.state.players.set(client.sessionId, player);
    }

    onLeave(client: Client) {
        console.log(`➖ Desconectado: ${client.sessionId}`);
        this.state.players.delete(client.sessionId);
    }
}

// =============================================================================
// 3. SERVIDOR HTTP
// =============================================================================
const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const gameServer = new Server({ server: server });

gameServer.define("mundo_mythica", MyRoom);

const port = Number(process.env.PORT || 3000);

server.listen(port, () => {
    console.log(`🚀 SERVIDOR INDUSTRIAL ONLINE en puerto ${port}`);
});
