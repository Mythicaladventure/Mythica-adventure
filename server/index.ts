import express from "express";
import { Server, Room, Client } from "colyseus";
import { createServer } from "http";
import cors from "cors";
import mongoose from "mongoose"; // <--- Nueva pieza
import { MyState, Player } from "./MyState"; 

// --- SEGURIDAD ---
process.on('unhandledRejection', (reason) => console.log('⚠️ Error:', reason));
process.on('uncaughtException', (err) => console.log('⚠️ Error Crítico:', err));

// --- CONEXIÓN A MONGODB ---
const mongoURL = process.env.MONGODB_URL;
if (mongoURL) {
    mongoose.connect(mongoURL)
        .then(() => console.log("🍃 MongoDB Conectado y listo para guardar datos"))
        .catch((err) => console.log("❌ Error en MongoDB:", err));
}

// --- ESQUEMA DE BASE DE DATOS (Lo que se guarda permanentemente) ---
const PlayerModel = mongoose.model('PlayerAccount', new mongoose.Schema({
    username: String,
    level: Number,
    gold: Number,
    posX: Number,
    posY: Number
}));

const port = Number(process.env.PORT) || 10000;
const app = express();
app.use(cors());
app.use(express.json());

class SalaPrincipal extends Room<MyState> {
    onCreate(options: any) {
        this.setState(new MyState());
        console.log("🏰 Mundo de Mythica sincronizado.");

        this.onMessage("mover", (client, datos) => {
            const player = this.state.players.get(client.sessionId);
            if (player) {
                player.x = datos.x;
                player.y = datos.y;
            }
        });
    }

    async onJoin(client: Client, options: any) {
        console.log("👤 Jugador entrando:", client.sessionId);
        
        // Aquí es donde ocurre la magia: busca o crea al jugador en la base de datos
        // Por ahora lo creamos de forma básica
        this.state.players.set(client.sessionId, new Player());
    }

    onLeave(client: Client) {
        this.state.players.delete(client.sessionId);
    }
}

const servidorWeb = createServer(app);
const gameServer = new Server({ server: servidorWeb });
gameServer.define("mundo_mythica", SalaPrincipal);

app.get("/", (req, res) => res.send("⚔️ Servidor MMORPG con Base de Datos Activa"));

gameServer.listen(port);
