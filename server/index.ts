import express from "express";
import { Server, Room, Client } from "colyseus";
import { createServer } from "http";
import cors from "cors";
import { Schema, MapSchema, type } from "@colyseus/schema";

// --- 1. DEFINICIÓN DEL ESTADO (Formato compatible con Render) ---
class Player extends Schema {}
type("number")(Player.prototype, "x");
type("number")(Player.prototype, "y");
type("string")(Player.prototype, "nombre");

class MyState extends Schema {
    players = new MapSchema<Player>();
}
type({ map: Player })(MyState.prototype, "players");

// --- 2. LA SALA DE JUEGO ---
class SalaPrincipal extends Room<MyState> {
    onCreate() {
        this.setState(new MyState());
        
        this.onMessage("mover", (client, pos) => {
            const p = this.state.players.get(client.sessionId);
            if (p) {
                p.x = pos.x;
                p.y = pos.y;
            }
        });
    }

    onJoin(client: Client, options: any) {
        const nuevoPlayer = new Player();
        nuevoPlayer.x = 100;
        nuevoPlayer.y = 100;
        nuevoPlayer.nombre = options.nombre || "Héroe";
        
        this.state.players.set(client.sessionId, nuevoPlayer);
        console.log("✅ Héroe en el mundo: " + nuevoPlayer.nombre);
    }

    onLeave(client: Client) {
        this.state.players.delete(client.sessionId);
    }
}

// --- 3. ARRANQUE DEL SERVIDOR ---
const app = express();
app.use(cors());
const server = createServer(app);
const gameServer = new Server({ server });

gameServer.define("mundo_mythica", SalaPrincipal);

const port = Number(process.env.PORT) || 10000;
server.listen(port, "0.0.0.0", () => {
    console.log("🚀 MYTHICA ENGINE: ONLINE Y ESTABLE");
});
