import express from "express";
import { Server, Room, Client } from "colyseus";
import { createServer } from "http";
import cors from "cors";
import mongoose from "mongoose";
import { Schema, MapSchema, type } from "@colyseus/schema";

class Player extends Schema {}
type("number")(Player.prototype, "x");
type("number")(Player.prototype, "y");
type("string")(Player.prototype, "nombre");

class MyState extends Schema {}
type({ map: Player })(MyState.prototype, "players");

const mongoURL = process.env.MONGODB_URL;
if (mongoURL) {
    mongoose.connect(mongoURL, { serverSelectionTimeoutMS: 5000 })
        .then(() => console.log("🍃 MongoDB Conectado"))
        .catch(err => console.log("⚠️ Corriendo sin DB persistente por ahora."));
}

const PlayerAccount = mongoose.model('PlayerAccount', new mongoose.Schema({
    userId: String, nombre: String, x: Number, y: Number
}));

class SalaPrincipal extends Room<MyState> {
    onCreate() {
        this.setState(new MyState());
        this.onMessage("mover", (client, pos) => {
            const p = this.state.players.get(client.sessionId);
            if (p) {
                p.x = pos.x; p.y = pos.y;
                PlayerAccount.updateOne({ userId: client.sessionId }, { x: pos.x, y: pos.y }).catch(() => {});
            }
        });
    }

    async onJoin(client: Client, options: any) {
        const nombreInput = options.nombre || "Viajero";
        const nuevoPlayer = new Player();
        nuevoPlayer.x = 64; nuevoPlayer.y = 64;
        nuevoPlayer.nombre = nombreInput;
        
        this.state.players.set(client.sessionId, nuevoPlayer);
        console.log(`✅ Entró: ${nuevoPlayer.nombre}`);
    }

    onLeave(client: Client) {
        if (this.state && this.state.players) {
            this.state.players.delete(client.sessionId);
        }
    }
}

const app = express();
app.use(cors());
const server = createServer(app);
const gameServer = new Server({ server });
gameServer.define("mundo_mythica", SalaPrincipal);

server.listen(Number(process.env.PORT) || 10000, "0.0.0.0", () => {
    console.log(`🚀 SERVIDOR LISTO`);
});
