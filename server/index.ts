import express from "express";
import { Server, Room, Client } from "colyseus";
import { createServer } from "http";
import cors from "cors";
import mongoose from "mongoose";
import { Schema, type, MapSchema } from "@colyseus/schema";

// --- DEFINICIÓN DEL ESTADO DEL JUEGO ---
export class Player extends Schema {
    @type("number") x: number = 0;
    @type("number") y: number = 0;
    @type("string") nombre: string = "Viajero";
}

export class MyState extends Schema {
    @type({ map: Player }) players = new MapSchema<Player>();
}

// --- CONEXIÓN A BASE DE DATOS (MONGODB) ---
const mongoURL = process.env.MONGODB_URL;
if (mongoURL) {
    mongoose.connect(mongoURL)
        .then(() => console.log("🍃 MongoDB Conectado: ¡El disco duro está listo!"))
        .catch((err) => console.log("❌ Error en MongoDB:", err));
}

const PlayerAccount = mongoose.model('PlayerAccount', new mongoose.Schema({
    userId: String,
    nombre: String,
    x: Number,
    y: Number,
    level: { type: Number, default: 1 }
}));

// --- LÓGICA DE LA SALA MMORPG ---
class SalaPrincipal extends Room<MyState> {
    onCreate(options: any) {
        this.setState(new MyState());
        console.log("🏰 Mundo de Mythica sincronizado.");

        // Escuchar Movimientos
        this.onMessage("mover", async (client, datos) => {
            const player = this.state.players.get(client.sessionId);
            if (player) {
                player.x = datos.x;
                player.y = datos.y;
                // Guardado automático en DB
                await PlayerAccount.updateOne(
                    { userId: client.sessionId }, 
                    { x: datos.x, y: datos.y }
                );
            }
        });

        // Escuchar Chat Global
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
        console.log(`👤 Jugador entrando: ${nombreElegido}`);

        let account = await PlayerAccount.findOne({ userId: client.sessionId });
        if (!account) {
            account = await PlayerAccount.create({ 
                userId: client.sessionId, 
                nombre: nombreElegido,
                x: 32, y: 32 
            });
        }

        const player = new Player();
        player.x = account.x || 32;
        player.y = account.y || 32;
        player.nombre = account.nombre || nombreElegido;
        
        this.state.players.set(client.sessionId, player);
    }

    onLeave(client: Client) {
        console.log("🏃 Jugador salió:", client.sessionId);
        this.state.players.delete(client.sessionId);
    }
}

const app = express();
app.use(cors());
const servidorWeb = createServer(app);
const gameServer = new Server({ server: servidorWeb });
gameServer.define("mundo_mythica", SalaPrincipal);

gameServer.listen(Number(process.env.PORT) || 10000);
