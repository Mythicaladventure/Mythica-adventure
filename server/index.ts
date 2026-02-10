import { Server, Room, Client } from "colyseus";
import { Schema, MapSchema, type } from "@colyseus/schema";
import http from "http";
import express from "express";
import cors from "cors";

// 1. DEFINICIÓN DE DATOS (ESQUEMA)
// -----------------------------------------------------------------------------
class Player extends Schema {
    @type("number") x: number = 0;
    @type("number") y: number = 0;
    @type("string") nombre: string = "Guest";
    @type("number") hp: number = 100;
    @type("number") maxHp: number = 100;
    @type("number") mp: number = 50;
    @type("number") maxMp: number = 50;
}

class GameState extends Schema {
    @type({ map: Player }) players = new MapSchema<Player>();
    @type("number") width: number = 50;  // Ancho del mundo
    @type("number") height: number = 50; // Alto del mundo
    
    // Aquí guardamos el mapa (ID de cada tile)
    // 0 = Pasto, 1 = Pared, etc.
    @type({ map: "number" }) map = new MapSchema<number>();
}

// 2. LÓGICA DE LA SALA (ROOM)
// -----------------------------------------------------------------------------
class MyRoom extends Room<GameState> {
    
    onCreate(options: any) {
        console.log("⚔️ Sala creada: mundo_mythica");
        this.setState(new GameState());

        // GENERACIÓN DE MAPA PROCEDURAL (TEMPORAL)
        // Esto crea un suelo básico para que no caigas al vacío
        // hasta que carguemos el mapa real (.otbm)
        for (let x = 0; x < this.state.width; x++) {
            for (let y = 0; y < this.state.height; y++) {
                const index = y * this.state.width + x;
                // ID 0 = Pasto (o el tile que tengas en el frame 0)
                // ID 1 = Pared (borde)
                let tileID = 0; 
                
                // Bordes del mapa (Paredes)
                if (x === 0 || x === this.state.width - 1 || y === 0 || y === this.state.height - 1) {
                    tileID = 1; 
                }

                this.state.map.set(index.toString(), tileID);
            }
        }

        // MANEJO DE MENSAJES DEL CLIENTE
        this.onMessage("mover", (client, data) => {
            const player = this.state.players.get(client.sessionId);
            if (player) {
                player.x = data.x;
                player.y = data.y;
            }
        });

        this.onMessage("attack", (client, data) => {
            // Lógica de combate simple
            this.broadcast("combat_text", { 
                x: this.state.players.get(client.sessionId).x,
                y: this.state.players.get(client.sessionId).y - 20,
                value: "POW!",
                type: "DAMAGE"
            });
        });
    }

    onJoin(client: Client, options: any) {
        console.log("➕ Jugador unido:", client.sessionId);
        const player = new Player();
        
        // Posición inicial segura (centro del mapa)
        player.x = (this.state.width / 2) * 32;
        player.y = (this.state.height / 2) * 32;
        player.nombre = options.name || "Aventurero";
        
        this.state.players.set(client.sessionId, player);
    }

    onLeave(client: Client, consented: boolean) {
        console.log("➖ Jugador salió:", client.sessionId);
        this.state.players.delete(client.sessionId);
    }
}

// 3. SERVIDOR EXPRESS + COLYSEUS
// -----------------------------------------------------------------------------
const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const gameServer = new Server({
    server: server,
});

// Registrar la sala
gameServer.define("mundo_mythica", MyRoom);

// Arrancar el servidor
const port = Number(process.env.PORT || 3000);
server.listen(port, () => {
    console.log(`🚀 Servidor Mythical Adventure escuchando en puerto ${port}`);
});

