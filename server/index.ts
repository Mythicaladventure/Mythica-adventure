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

// Diccionario de Items (Cargado desde items.xml)
const itemCache: any = {};

function loadServerData() {
    console.log("📥 Iniciando carga de datos del servidor...");

    // --- CORRECCIÓN DE RUTAS PARA RENDER ---
    // __dirname en producción es '.../dist', así que subimos un nivel para ir a 'server/data'
    // Si estamos en local (ts-node), esto también suele funcionar o ajustamos el fallback.
    const itemsPath = path.join(__dirname, "../server/data/items.xml");
    const mapPath = path.join(__dirname, "../server/data/world/otsp.otbm");

    console.log(`🔎 Buscando items en: ${itemsPath}`);

    // 1. Cargar Items.xml
    if (fs.existsSync(itemsPath)) {
        try {
            const xmlData = fs.readFileSync(itemsPath, "utf8");
            const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
            const result = parser.parse(xmlData);

            if(result.items && result.items.item) {
                // Convertir a un mapa rápido para el juego
                result.items.item.forEach((it: any) => {
                    const id = parseInt(it.id); // ID del Servidor
                    itemCache[id] = {
                        name: it.name || "Unknown",
                        type: it.type || "none",
                        // Aquí podríamos leer atributos como 'speed', 'decay', etc.
                    };
                });
                console.log(`✅ ÉXITO: Items cargados (${result.items.item.length} objetos en memoria).`);
            }
        } catch (e) {
            console.error("❌ ERROR CRÍTICO leyendo items.xml:", e);
        }
    } else {
        console.warn(`⚠️ ALERTA: No se encontró items.xml en la ruta especificada.`);
        // Intento de fallback local por si estás probando en tu PC sin compilar
        if(fs.existsSync(path.join(__dirname, "data/items.xml"))) {
             console.log("💡 Sugerencia: Parece que los archivos están en 'data/' localmente.");
        }
    }

    // 2. Verificar Mapa
    if (fs.existsSync(mapPath)) {
        console.log("✅ MAPA DETECTADO: otsp.otbm está listo.");
        // Aquí irá el lector binario OTBM en la versión 2.2
    } else {
        console.warn(`⚠️ ALERTA: No se encontró el mapa .otbm en: ${mapPath}`);
    }
}

// =============================================================================
// 2. ESQUEMA DE ESTADO (Lo que ve el cliente)
// =============================================================================

class Player extends Schema {
    @type("number") x: number = 0;
    @type("number") y: number = 0;
    @type("string") nombre: string = "Guest";
    @type("number") hp: number = 100;
    @type("number") maxHp: number = 100;
}

class GameState extends Schema {
    @type({ map: Player }) players = new MapSchema<Player>();
    @type("number") width: number = 50; 
    @type("number") height: number = 50;
    @type({ map: "number" }) map = new MapSchema<number>(); // ID de los tiles
}

// =============================================================================
// 3. LÓGICA DE LA SALA
// =============================================================================

class MyRoom extends Room<GameState> {
    
    onCreate(options: any) {
        console.log("⚔️ Sala iniciada: mundo_mythica");
        this.setState(new GameState());

        // Cargar los datos reales al iniciar la sala
        loadServerData();

        // GENERACIÓN DE MAPA HÍBRIDO (Placeholder inteligente)
        // Mientras implementamos el lector full, creamos un suelo seguro
        for (let x = 0; x < this.state.width; x++) {
            for (let y = 0; y < this.state.height; y++) {
                const index = y * this.state.width + x;
                
                // Usamos IDs que coincidan con tu spritesheet nuevo
                // Asegúrate que el frame 100 de tu PNG sea un suelo bonito
                let tileID = 100; 
                
                // Bordes
                if (x === 0 || x === this.state.width - 1 || y === 0 || y === this.state.height - 1) {
                    tileID = 101; // Pared
                }

                this.state.map.set(index.toString(), tileID);
            }
        }

        // INPUTS
        this.onMessage("mover", (client, data) => {
            const player = this.state.players.get(client.sessionId);
            if (player) {
                // Aquí validaremos colisiones con 'itemCache' en el futuro
                player.x = data.x;
                player.y = data.y;
            }
        });

        this.onMessage("attack", (client, data) => {
            this.broadcast("combat_text", { 
                x: this.state.players.get(client.sessionId).x,
                y: this.state.players.get(client.sessionId).y - 20,
                value: "HIT!", type: "DAMAGE"
            });
        });
    }

    onJoin(client: Client, options: any) {
        console.log(`➕ Jugador ${options.name || "Guest"} conectado.`);
        const player = new Player();
        // Spawneamos en el centro seguro
        player.x = (this.state.width / 2) * 32;
        player.y = (this.state.height / 2) * 32;
        player.nombre = options.name || "Héroe";
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
    // Log para depurar rutas en Render
    console.log(`📂 Directorio base (__dirname): ${__dirname}`);
});
