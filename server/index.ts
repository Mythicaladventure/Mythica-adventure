import { Server, Room, Client } from "colyseus";
import { Schema, MapSchema, type } from "@colyseus/schema";
import http from "http";
import express from "express"
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
    @type("number") width: number = 80;  // MAPA GRANDE (80x80 = 6400 Tiles)
    @type("number") height: number = 80;
    @type({ map: "number" }) map = new MapSchema<number>(); 
    @type({ map: Player }) players = new MapSchema<Player>();
}

// =============================================================================
// 2. LÓGICA DE LA SALA (GENERADOR DE CIUDAD RPG)
// =============================================================================

class MyRoom extends Room<GameState> {
    
    onCreate(_options: any) {
        console.log("⚔️ SALA CREADA: Iniciando Arquitecto de Mundos...");

        // 1. Configurar Estado
        const state = new GameState();
        const W = 80;
        const H = 80;
        state.width = W;
        state.height = H;

        // 2. GENERACIÓN PROCEDURAL DE CIUDAD (Simulando un mapa real)
        console.log(`🔨 Construyendo Capital (${W}x${H})...`);
        
        for (let x = 0; x < W; x++) {
            for (let y = 0; y < H; y++) {
                const index = y * W + x;
                let tileID = 1; // 1 = Pasto (Base)

                // A. MURALLAS EXTERIORES (Bordes del mundo)
                if (x === 0 || x === W - 1 || y === 0 || y === H - 1) {
                    tileID = 2; // Pared
                }
                
                // B. PLAZA CENTRAL (Piedra) - Zona segura (20x20 en el centro)
                const centerX = W / 2;
                const centerY = H / 2;
                if (x > centerX - 10 && x < centerX + 10 && y > centerY - 10 && y < centerY + 10) {
                    tileID = 3; // Suelo Piedra
                }

                // C. CAMINOS PRINCIPALES (Cruz que atraviesa el mapa)
                // Camino Horizontal
                if (y > centerY - 3 && y < centerY + 3) tileID = 3;
                // Camino Vertical
                if (x > centerX - 3 && x < centerX + 3) tileID = 3;

                // D. EDIFICIOS ALEATORIOS (Bloques de paredes dispersos)
                // Solo fuera de la plaza y los caminos
                if (tileID === 1 && Math.random() < 0.05) {
                    tileID = 2; // Pared (Obstáculo/Árbol/Casa)
                }

                state.map.set(index.toString(), tileID);
            }
        }
        
        this.setState(state);
        console.log(`✅ Ciudad construida: ${state.map.size} bloques.`);

        // Listeners
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
        
        const player = new Player();
        // SPAWN EN LA PLAZA CENTRAL
        player.x = (80 / 2) * 32; 
        player.y = (80 / 2) * 32;
        player.nombre = options.name || "Héroe";
        player.skin = 0;
        this.state.players.set(client.sessionId, player);

        // 🔥 ENVÍO OPTIMIZADO DEL MAPA
        const mapPackage: any[] = [];
        this.state.map.forEach((value, key) => {
            mapPackage.push({ i: parseInt(key), t: value });
        });

        console.log(`📤 Enviando mapa (${mapPackage.length} tiles) a ${client.sessionId}`);
        client.send("force_map_load", mapPackage);
    }

    onLeave(client: Client) {
        this.state.players.delete(client.sessionId);
    }
}

// 3. SERVIDOR HTTP
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
