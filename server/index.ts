import { Server, Room, Client } from "colyseus";
import { Schema, MapSchema, type } from "@colyseus/schema";
import http from "http";
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { XMLParser } from "fast-xml-parser"; // ¡El traductor nuevo!

// =============================================================================
// 1. SISTEMA DE DATOS (Items y Mapa)
// =============================================================================

// Diccionario de Items (Cargado desde items.xml)
const itemCache: any = {};

function loadServerData() {
    console.log("📥 Cargando datos del servidor...");

    const itemsPath = path.join(__dirname, "data", "items.xml");
    const mapPath = path.join(__dirname, "data", "world", "otsp.otbm");

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
                        type: it.type || "none"
                    };
                });
                console.log(`✅ Items cargados: ${result.items.item.length} objetos en memoria.`);
            }
        } catch (e) {
            console.error("❌ Error leyendo items.xml:", e);
        }
    } else {
        console.warn("⚠️ No se encontró items.xml en server/data/");
    }

    // 2. Verificar Mapa
    if (fs.existsSync(mapPath)) {
        console.log("✅ MAPA DETECTADO: otsp.otbm está listo para ser procesado.");
        // Nota: El parser de OTBM es binario y complejo. 
        // Por ahora, el servidor sabe que existe. En la v2.2 implementaremos el lector binario.
    } else {
        console.warn("⚠️ No se encontró el mapa .otbm en server/data/world/");
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

        // GENERACIÓN DE MAPA HÍBRIDO
        // Usamos IDs reales basados en tu items.xml si es posible
        for (let x = 0; x < this.state.width; x++) {
            for (let y = 0; y < this.state.height; y++) {
                const index = y * this.state.width + x;
                
                // ID 4526 = Piso de piedra común (Ejemplo de Tibia)
                // ID 4471 = Pared de piedra
                let tileID = 100; // ID genérico de piso
                
                // Bordes
                if (x === 0 || x === this.state.width - 1 || y === 0 || y === this.state.height - 1) {
                    tileID = 101; // ID genérico de pared
                }

                this.state.map.set(index.toString(), tileID);
            }
        }

        // INPUTS
        this.onMessage("mover", (client, data) => {
            const player = this.state.players.get(client.sessionId);
            if (player) {
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
    console.log(`📂 Leyendo datos desde: ${path.join(__dirname, "data")}`);
});
