import express from "express";
import { Server, Room, Client } from "colyseus";
import { createServer } from "http";
import cors from "cors";
import mongoose from "mongoose"; // <--- Esta es la pieza que importamos
import { MyState, Player } from "./MyState"; 

// 1. SEGURIDAD BÁSICA
process.on('unhandledRejection', (reason) => console.log('⚠️ Error:', reason));
process.on('uncaughtException', (err) => console.log('⚠️ Error Crítico:', err));

// 2. CONEXIÓN A LA BASE DE DATOS (Usando la llave que pusiste en Render)
const mongoURL = process.env.MONGODB_URL;
if (mongoURL) {
    mongoose.connect(mongoURL)
        .then(() => console.log("🍃 MongoDB Conectado con éxito"))
        .catch((err) => console.log("❌ Error al conectar MongoDB:", err));
}

const port = Number(process.env.PORT) || 10000;
const app = express();
app.use(cors());
app.use(express.json());

// 3. LÓGICA DE LA SALA (Lo que hace que tu juego sea MMORPG)
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

    onJoin(client: Client) {
        console.log("👤 Jugador conectado:", client.sessionId);
        this.state.players.set(client.sessionId, new Player());
    }

    onLeave(client: Client) {
        console.log("🏃 Jugador salió:", client.sessionId);
        this.state.players.delete(client.sessionId);
    }
}

// 4. ARRANCAR EL SERVIDOR
const servidorWeb = createServer(app);
const gameServer = new Server({ server: servidorWeb });

gameServer.define("mundo_mythica", SalaPrincipal);

app.get("/", (req, res) => res.send("⚔️ Servidor MMORPG Conectado a Base de Datos"));

gameServer.listen(port);
