import express from "express";
import { Server, Room, Client } from "colyseus";
import { createServer } from "http";
import cors from "cors";
import mongoose from "mongoose";
import { Schema, type, MapSchema } from "@colyseus/schema";

// --- ESTADO ---
export class Player extends Schema {
    @type("number") x: number = 0;
    @type("number") y: number = 0;
    @type("string") nombre: string = "Viajero";
}

export class MyState extends Schema {
    @type({ map: Player }) players = new MapSchema<Player>();
}

// --- DB ---
const mongoURL = process.env.MONGODB_URL;
if (mongoURL) {
    mongoose.connect(mongoURL)
        .then(() => console.log("🍃 MongoDB Conectado"))
        .catch((err) => console.log("❌ Error MongoDB:", err));
}

const PlayerAccount = mongoose.model('PlayerAccount', new mongoose.Schema({
    userId: String,
    nombre: String,
    x: Number,
    y: Number
}));

// --- SALA ---
class SalaPrincipal extends Room<MyState> {
    onCreate(options: any) {
        this.setState(new MyState());
        
        this.onMessage("mover", async (client, datos) => {
            const player = this.state.players.get(client.sessionId);
            if (player) {
                player.x = datos.x;
                player.y = datos.y;
                await PlayerAccount.updateOne({ userId: client.sessionId }, { x: datos.x, y: datos.y });
            }
        });

        this.onMessage("chat", (client, mensaje) => {
            const player = this.state.players.get(client.sessionId);
            this.broadcast("mensaje_chat", {
                desde: player?.nombre || "Anónimo",
                texto: mensaje
            });
        });
    }

    async onJoin(client: Client, options: any) {
        // Aquí estaba el detalle: nos aseguramos de capturar el nombre
        const nombreElegido = options.nombre || "Viajero";
        
        let account = await PlayerAccount.findOne({ userId: client.sessionId });
        if (!account) {
            account = await PlayerAccount.create({ 
                userId: client.sessionId, 
                nombre: nombreElegido,
                x: 64, y: 64 
            });
        }

        const player = new Player();
        player.x = account.x || 64;
        player.y = account.y || 64;
        player.nombre = account.nombre || nombreElegido;
        
        this.state.players.set(client.sessionId, player);
        console.log(`${player.nombre} ha entrado al mundo.`);
    }

    onLeave(client: Client) {
        this.state.players.delete(client.sessionId);
    }
}

const app = express();
app.use(cors());
const servidorWeb = createServer(app);
const gameServer = new Server({ server: servidorWeb });
gameServer.define("mundo_mythica", SalaPrincipal);

servidorWeb.listen(Number(process.env.PORT) || 10000, "0.0.0.0", () => {
    console.log("🚀 Servidor de Mythica saltando al hiperespacio...");
});
