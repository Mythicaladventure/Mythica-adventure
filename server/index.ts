import express from "express";
import { Server, Room, Client } from "colyseus";
import { createServer } from "http";
import cors from "cors";
import mongoose from "mongoose";
import { Schema, MapSchema, type } from "@colyseus/schema";

// 1. DEFINICIÓN DE DATOS
class Player extends Schema {}
type("number")(Player.prototype, "x");
type("number")(Player.prototype, "y");
type("string")(Player.prototype, "nombre");

class MyState extends Schema {
    // Inicializamos la lista de jugadores AQUÍ para que nunca sea 'undefined'
    players = new MapSchema<Player>();
}
type({ map: Player })(MyState.prototype, "players");

// 2. CONEXIÓN DB (Silenciosa para evitar timeouts)
const mongoURL = process.env.MONGODB_URL;
if (mongoURL) {
    mongoose.connect(mongoURL).catch(() => console.log("DB en espera..."));
}

// 3. LA SALA DE JUEGO (CORREGIDA)
class SalaPrincipal extends Room<MyState> {
    onCreate() {
        // Obligamos al servidor a crear el estado antes de aceptar a nadie
        this.setState(new MyState());
        
        this.onMessage("mover", (client, pos) => {
            const p = this.state.players.get(client.sessionId);
            if (p) { p.x = pos.x; p.y = pos.y; }
        });
    }

    async onJoin(client: Client, options: any) {
        console.log("Intentando unir a:", options.nombre);
        
        const nuevoPlayer = new Player();
        nuevoPlayer.x = 100; 
        nuevoPlayer.y = 100;
        nuevoPlayer.nombre = options.nombre || "Viajero";
        
        // Ahora 'players' ya existe, el error 'reading set' desaparece
        this.state.players.set(client.sessionId, nuevoPlayer);
    }

    onLeave(client: Client) {
        if (this.state.players) {
            this.state.players.delete(client.sessionId);
        }
    }
}

// 4. ARRANQUE DEL SERVIDOR
const app = express();
app.use(cors());
const server = createServer(app);
const gameServer = new Server({ server });

gameServer.define("mundo_mythica", SalaPrincipal);

const port = Number(process.env.PORT) || 10000;
server.listen(port, "0.0.0.0", () => {
    console.log("🚀 MYTHICA ENGINE ONLINE");
});
