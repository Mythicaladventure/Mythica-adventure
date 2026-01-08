import express from "express";
import { Server, Room, Client } from "colyseus";
import { createServer } from "http";
import cors from "cors";
import mongoose from "mongoose";
import { Schema, MapSchema, defineSchema } from "@colyseus/schema";

// --- 1. ESTADO SIN DECORADORES (Evita el error de Render) ---
class Player extends Schema {}
defineSchema(Player, {
    x: "number",
    y: "number",
    nombre: "string"
});

class MyState extends Schema {}
defineSchema(MyState, {
    players: { map: Player }
});

// --- 2. BASE DE DATOS ---
const mongoURL = process.env.MONGODB_URL;
if (mongoURL) {
    mongoose.connect(mongoURL)
        .then(() => console.log("🍃 MongoDB Conectado"))
        .catch(err => console.error("❌ Error DB:", err));
}

const PlayerAccount = mongoose.model('PlayerAccount', new mongoose.Schema({
    userId: String, nombre: String, x: Number, y: Number
}));

// --- 3. LÓGICA DE LA SALA ---
class SalaPrincipal extends Room {
    onCreate() {
        this.setState(new MyState());
        
        this.onMessage("mover", async (client, pos) => {
            const p = this.state.players.get(client.sessionId);
            if (p) {
                p.x = pos.x; p.y = pos.y;
                await PlayerAccount.updateOne({ userId: client.sessionId }, { x: pos.x, y: pos.y });
            }
        });

        this.onMessage("chat", (client, msg) => {
            const p = this.state.players.get(client.sessionId);
            this.broadcast("mensaje_chat", { desde: p?.nombre || "Nadie", texto: msg });
        });
    }

    async onJoin(client: Client, options: any) {
        const nombreInput = options.nombre || "Viajero";
        let acc = await PlayerAccount.findOne({ userId: client.sessionId });
        
        if (!acc) {
            acc = await PlayerAccount.create({ userId: client.sessionId, nombre: nombreInput, x: 64, y: 64 });
        }

        const nuevoPlayer = new Player();
        nuevoPlayer.x = acc.x || 64;
        nuevoPlayer.y = acc.y || 64;
        nuevoPlayer.nombre = acc.nombre || nombreInput;
        
        this.state.players.set(client.sessionId, nuevoPlayer);
        console.log(`✅ ${nuevoPlayer.nombre} unido con éxito.`);
    }

    onLeave(client: Client) {
        this.state.players.delete(client.sessionId);
    }
}

// --- 4. SERVIDOR WEB ---
const app = express();
app.use(cors());
const server = createServer(app);
const gameServer = new Server({ server });

gameServer.define("mundo_mythica", SalaPrincipal);

const port = Number(process.env.PORT) || 10000;
server.listen(port, "0.0.0.0", () => {
    console.log(`🚀 SERVIDOR ACTIVO EN PUERTO ${port}`);
});
