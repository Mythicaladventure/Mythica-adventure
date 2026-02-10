import { Server, Room, Client } from "colyseus";
import { Schema, MapSchema, type } from "@colyseus/schema";
import http from "http";
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { XMLParser } from "fast-xml-parser"; 

// =============================================================================
// 1. SISTEMA DE DATOS (Items y Mapa)
// =============================================================================

const itemCache: any = {};

function loadServerData() {
    console.log("📥 Iniciando carga de datos del servidor...");

    // RUTAS A PRUEBA DE BALAS PARA RENDER
    const itemsPath = path.join(__dirname, "../server/data/items.xml");
    
    // 1. Cargar Items.xml
    if (fs.existsSync(itemsPath)) {
        try {
            const xmlData = fs.readFileSync(itemsPath, "utf8");
            const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
            const result = parser.parse(xmlData);

            if(result.items && result.items.item) {
                result.items.item.forEach((it: any) => {
                    const id = parseInt(it.id); 
                    itemCache[id] = {
                        name: it.name || "Unknown",
                        type: it.type || "none",
                    };
                });
                console.log(`✅ ÉXITO: Items cargados (${result.items.item.length} objetos en memoria).`);
            }
        } catch (e) {
            console.error("❌ ERROR CRÍTICO leyendo items.xml:", e);
        }
    } else {
        console.warn(`⚠️ ALERTA: No se encontró items.xml en la ruta: ${itemsPath}`);
    }
}

// =============================================================================
// 2. ESQUEMA DE ESTADO
// =============================================================================

class Player extends Schema {
    @type("number") x: number = 0;
    @type("number") y: number = 0;
    @type("string") nombre: string = "Guest";
    // ✨ NUEVO: Propiedad Skin para evitar el cuadro negro
    @type("number") skin: number = 130; 
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
// 3. LÓGICA DE LA SALA (Generador de Ciudad)
// =============================================================================

class MyRoom extends Room<GameState> {
    
    onCreate(_options: any) {
        console.log("⚔️ Sala iniciada: mundo_mythica");
        this.setState(new GameState());

        // Cargar datos reales (Items)
        loadServerData();

        // --- CONSTRUCTOR DE CIUDAD PROCEDURAL ---
        // Esto crea el mapa básico mientras implementamos el lector .otbm completo
        const w = this.state.width;
        const h = this.state.height;

        // 1. Base: Todo es Pasto
        for (let x = 0; x < w; x++) {
            for (let y = 0; y < h; y++) {
                this.setTile(x, y, 100); // ID 100 = Pasto
            }
        }

        // 2. Ciudad Central: Murallas y Piso de Piedra
        const wallID = 101;  // ID Pared
        const floorID = 105; // ID Piedra (Ciudad)

        // Creamos un cuadrado de 20x20 en el centro (coordenadas 15 a 35)
        for (let x = 15; x < 35; x++) {
            for (let y = 15; y < 35; y++) {
                // Rellenar con piso de piedra
                this.setTile(x, y, floorID);

                // Si es el borde del cuadrado, poner pared
                if (x === 15 || x === 34 || y === 15 || y === 34) {
                    this.setTile(x, y, wallID); 
                }
            }
        }

        // 3. La Puerta (Salida al sur)
        this.setTile(25, 34, floorID); // Romper pared
        this.setTile(25, 35, floorID); // Camino exterior

        // LISTENERS (Inputs del cliente)
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
                    y: attacker.y - 20,
                    value: "HIT!", type: "DAMAGE"
                });
            }
        });
    }

    // Ayudante para dibujar mapa
    setTile(x: number, y: number, id: number) {
        const index = y * this.state.width + x;
        this.state.map.set(index.toString(), id);
    }

    onJoin(client: Client, options: any) {
        const playerName = options && options.name ? options.name : "Héroe";
        console.log(`➕ Jugador ${playerName} conectado.`);
        
        const player = new Player();
        // Spawneamos en el centro de la CIUDAD (Seguro)
        player.x = (this.state.width / 2) * 32;
        player.y = (this.state.height / 2) * 32;
        player.nombre = playerName;
        
        // ✨ ASIGNAMOS LA SKIN (Adiós cuadro negro)
        player.skin = 130; 
        
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
    console.log(`🚀 SERVIDOR INDUSTRIAL ONLINE en puerto ${port}`);
    console.log(`📂 Directorio base (__dirname): ${__dirname}`);
});
                  
