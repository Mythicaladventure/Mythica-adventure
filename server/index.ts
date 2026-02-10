import { Server, Room, Client } from "colyseus";
import { Schema, MapSchema, type } from "@colyseus/schema";
import http from "http";
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { XMLParser } from "fast-xml-parser"; 

// =============================================================================
// 1. SISTEMA DE DATOS
// =============================================================================

const itemCache: any = {};

function loadServerData() {
    console.log("📥 Iniciando carga de datos del servidor...");
    const itemsPath = path.join(__dirname, "../server/data/items.xml");
    
    if (fs.existsSync(itemsPath)) {
        try {
            const xmlData = fs.readFileSync(itemsPath, "utf8");
            const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
            const result = parser.parse(xmlData);
            if(result.items && result.items.item) {
                result.items.item.forEach((it: any) => {
                    const id = parseInt(it.id); 
                    itemCache[id] = { name: it.name || "Unknown", type: it.type || "none" };
                });
                console.log(`✅ Items cargados: ${result.items.item.length}`);
            }
        } catch (e) { console.error("❌ Error items.xml:", e); }
    }
}

// =============================================================================
// 2. ESQUEMA
// =============================================================================

class Player extends Schema {
    @type("number") x: number = 0;
    @type("number") y: number = 0;
    @type("string") nombre: string = "Guest";
    // 🎨 CAMBIO 1: Usamos la Skin 0 (El primer dibujo de la hoja)
    @type("number") skin: number = 0; 
    @type("number") hp: number = 100;
    @type("number") maxHp: number = 100;
}

class GameState extends Schema {
    @type({ map: Player }) players = new MapSchema<Player>();
    @type("number") width: number = 50; 
    @type("number") height: number = 50;
    @type({ map: "number" }) map = new MapSchema<number>(); 
}

// =============================================================================
// 3. LÓGICA DE LA SALA
// =============================================================================

class MyRoom extends Room<GameState> {
    
    onCreate(_options: any) {
        console.log("⚔️ Sala iniciada: mundo_mythica");
        this.setState(new GameState());
        loadServerData();

        const w = this.state.width;
        const h = this.state.height;

        // 🎨 CAMBIO 2: Usamos IDs bajos para asegurar que se vean
        const SUELO_ID = 1;  // Frame #1 de tu imagen
        const PARED_ID = 2;  // Frame #2 de tu imagen
        const CIUDAD_ID = 3; // Frame #3

        // 1. Rellenar todo con Suelo (ID 1)
        for (let x = 0; x < w; x++) {
            for (let y = 0; y < h; y++) {
                this.setTile(x, y, SUELO_ID);
            }
        }

        // 2. Construir Ciudad (ID 3 y 2)
        for (let x = 15; x < 35; x++) {
            for (let y = 15; y < 35; y++) {
                this.setTile(x, y, CIUDAD_ID); // Piso Ciudad

                if (x === 15 || x === 34 || y === 15 || y === 34) {
                    this.setTile(x, y, PARED_ID); // Paredes
                }
            }
        }

        // Puerta
        this.setTile(25, 34, CIUDAD_ID); 
        this.setTile(25, 35, CIUDAD_ID);

        // LISTENERS
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
                    x: attacker.x, y: attacker.y - 20, value: "HIT!", type: "DAMAGE"
                });
            }
        });
    }

    setTile(x: number, y: number, id: number) {
        const index = y * this.state.width + x;
        this.state.map.set(index.toString(), id);
    }

    onJoin(client: Client, options: any) {
        const playerName = options && options.name ? options.name : "Héroe";
        console.log(`➕ Jugador ${playerName} conectado.`);
        
        const player = new Player();
        player.x = (this.state.width / 2) * 32;
        player.y = (this.state.height / 2) * 32;
        player.nombre = playerName;
        
        // 🎨 CAMBIO 3: Skin segura
        player.skin = 0; 
        
        this.state.players.set(client.sessionId, player);
    }

    onLeave(client: Client) {
        this.state.players.delete(client.sessionId);
    }
}

// =============================================================================
// 4. SERVIDOR HTTP
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
