import express from "express";
import { Server, Room, Client } from "colyseus";
import { createServer } from "http";
import cors from "cors";
import mongoose from "mongoose";
import { Schema, type, MapSchema } from "@colyseus/schema";

// 1. PRIMERO DEFINIMOS EL ESTADO (Para evitar el error de Render)
export class Player extends Schema {
    @type("number") x: number = 0;
    @type("number") y: number = 0;
    @type("string") nombre: string = "Viajero";
}

export class MyState extends Schema {
    @type({ map: Player }) players = new MapSchema<Player>();
}

// 2. CONEXIÓN A BASE DE DATOS
const mongoURL = process.env.MONGODB_URL;
if (mongoURL) {
    mongoose.connect(mongoURL)
        .then(() => console.log("🍃 MongoDB Conectado con éxito"))
        .catch((err) => console.error("❌ Error MongoDB:", err));
}

const PlayerAccount = mongoose.model('PlayerAccount', new mongoose.Schema({
    userId: String,
    nombre: String,
    x: Number,
    y: Number
}));

// 3. DEFINICIÓN DE LA SALA
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
        console.log(`✅ ${player.nombre} ha entrado.`);
    }

    onLeave(client: Client) {
        this.state.players.delete(client.sessionId);
    }
}

// 4. ARRANQUE DEL SERVIDOR
const app = express();
app.use(cors());
const servidorWeb = createServer(app);
const gameServer = new Server({ server: servidorWeb });
gameServer.define("mundo_mythica", SalaPrincipal);

const PORT = Number(process.env.PORT) || 10000;
servidorWeb.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Mythica Engine operando en puerto ${PORT}`);
});
