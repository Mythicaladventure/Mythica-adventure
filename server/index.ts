import { Server, Room, Client } from "colyseus";
import { Schema, MapSchema, type } from "@colyseus/schema";
import http from "http";
import express from "express";
import cors from "cors";

// =============================================================================
// 1. DEFINICIÓN DE DATOS (SCHEMA)
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
// 2. LÓGICA DE LA SALA
// =============================================================================

class MyRoom extends Room<GameState> {
    
    onCreate(_options: any) {
        console.log("⚔️ SALA CREADA: Iniciando sistema...");

        // 1. Configurar Estado
        const state = new GameState();
        state.width = 20;
        state.height = 20;

        // 2. Generar Mapa en Memoria
        console.log("🔨 Construyendo mapa 20x20...");
        for (let x = 0; x < 20; x++) {
            for (let y = 0; y < 20; y++) {
                const index = y * 20 + x;
                let tileID = 1; // Pasto

                // Bordes = Paredes (ID 2)
                if (x === 0 || x === 19 || y === 0 || y === 19) tileID = 2;
                
                // Centro = Suelo (ID 3)
                if (x > 5 && x < 15 && y > 5 && y < 15) tileID = 3;

                state.map.set(index.toString(), tileID);
            }
        }
        
        this.setState(state);
        console.log(`✅ Mapa listo: ${state.map.size} bloques.`);

        // 3. Listeners de Juego
        this.onMessage("mover", (client, data) => {
            const player = this.state.players.get(client.sessionId);
            if (player) {
                player.x = data.x;
                player.y = data.y;
            }
        });

        this.onMessage("attack", (client) => {
            const player = this.state.players.get(client.sessionId);
            if (player) {
                this.broadcast("combat_text", { 
                    x: player.x, y: player.y - 30, value: "HIT!", type: "DAMAGE" 
                });
            }
        });
    }

    onJoin(client: Client, options: any) {
        console.log(`➕ Jugador conectado: ${client.sessionId}`);
        
        // 1. Crear Jugador en el centro
        const player = new Player();
        player.x = 10 * 32; 
        player.y = 10 * 32;
        player.nombre = options.name || "Héroe";
        player.skin = 0;
        this.state.players.set(client.sessionId, player);

        // 🔥 2. ENVÍO FORZADO DEL MAPA (LA SOLUCIÓN FINAL)
        // Empaquetamos el mapa y se lo enviamos directamente al cliente
        const mapPackage: any[] = [];
        this.state.map.forEach((value, key) => {
            mapPackage.push({ i: parseInt(key), t: value });
        });

        console.log(`📤 Enviando paquete de mapa (${mapPackage.length} tiles) a ${client.sessionId}`);
        client.send("force_map_load", mapPackage);
    }

    onLeave(client: Client) {
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
    console.log(`🚀 SERVIDOR ONLINE en puerto ${port}`);
});
