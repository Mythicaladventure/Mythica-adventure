import express from "express";
import { Server, Room, Client } from "colyseus";
import { createServer } from "http";
import cors from "cors";
import mongoose from "mongoose";
import { MyState, Player } from "./MyState";

// 1. CONFIGURACIÓN DE BASE DE DATOS
const mongoURL = process.env.MONGODB_URL;
if (mongoURL) {
    mongoose.connect(mongoURL)
        .then(() => console.log("🍃 MongoDB Conectado: ¡El disco duro está listo!"))
        .catch((err) => console.log("❌ Error en MongoDB:", err));
}

// Esquema de la cuenta del jugador (Lo que se guarda permanentemente)
const PlayerAccount = mongoose.model('PlayerAccount', new mongoose.Schema({
    userId: String,
    x: Number,
    y: Number,
    level: { type: Number, default: 1 },
    gold: { type: Number, default: 0 }
}));

const port = Number(process.env.PORT) || 10000;
const app = express();
app.use(cors());
app.use(express.json());

// 2. LÓGICA DEL MMORPG
class SalaPrincipal extends Room<MyState> {
    onCreate(options: any) {
        this.setState(new MyState());
        console.log("🏰 Mundo de Mythica sincronizado.");

        // Escuchar movimientos y actualizar base de datos cada cierto tiempo
        this.onMessage("mover", async (client, datos) => {
            const player = this.state.players.get(client.sessionId);
            if (player) {
                player.x = datos.x;
                player.y = datos.y;
                
                // Actualizar posición en la base de datos
                await PlayerAccount.updateOne(
                    { userId: client.sessionId }, 
                    { x: datos.x, y: datos.y }
                );
            }
        });
    }

    async onJoin(client: Client, options: any) {
        console.log("👤 Jugador entrando:", client.sessionId);

        // BUSCAR O CREAR PERSONAJE: Si el jugador ya existía, cargamos sus datos
        let account = await PlayerAccount.findOne({ userId: client.sessionId });
        
        if (!account) {
            account = await PlayerAccount.create({ 
                userId: client.sessionId, 
                x: 0, 
                y: 0 
            });
            console.log("🆕 Nueva cuenta creada para:", client.sessionId);
        }

        const player = new Player();
        player.x = account.x || 0;
        player.y = account.y || 0;
        
        this.state.players.set(client.sessionId, player);
    }

    onLeave(client: Client) {
        console.log("🏃 Jugador salió:", client.sessionId);
        this.state.players.delete(client.sessionId);
    }
}

const servidorWeb = createServer(app);
const gameServer = new Server({ server: servidorWeb });
gameServer.define("mundo_mythica", SalaPrincipal);

app.get("/", (req, res) => res.send("⚔️ Servidor MMORPG con Auto-Guardado Activo"));

gameServer.listen(port);
