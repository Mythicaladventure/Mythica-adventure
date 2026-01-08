import express from "express";
import { Server, Room, Client } from "colyseus";
import { createServer } from "http";
import cors from "cors";
import { Schema, MapSchema, type } from "@colyseus/schema";

// 1. DEFINICIÓN DEL JUGADOR
class Player extends Schema {
    @type("number") x: number = 100;
    @type("number") y: number = 100;
    @type("string") nombre: string = "";
}

// 2. DEFINICIÓN DEL ESTADO (Aquí estaba el fallo)
class MyState extends Schema {
    @type({ map: Player }) players = new MapSchema<Player>();
}

// 3. LA SALA DE JUEGO
class SalaPrincipal extends Room<MyState> {
    onCreate() {
        // Inicializamos el estado inmediatamente
        this.setState(new MyState());
        
        this.onMessage("mover", (client, pos) => {
            const p = this.state.players.get(client.sessionId);
            if (p) { p.x = pos.x; p.y = pos.y; }
        });
    }

    onJoin(client: Client, options: any) {
        console.log("-> Nuevo héroe:", options.nombre);
        
        const nuevoPlayer = new Player();
        nuevoPlayer.nombre = options.nombre || "Viajero";
        
        // Ahora 'players' existe garantizado por la clase MyState
        this.state.players.set(client.sessionId, nuevoPlayer);
    }

    onLeave(client: Client) {
        this.state.players.delete(client.sessionId);
    }
}

// 4. CONFIGURACIÓN DEL SERVIDOR
const app = express();
app.use(cors());
const server = createServer(app);
const gameServer = new Server({ server });

gameServer.define("mundo_mythica", SalaPrincipal);

server.listen(Number(process.env.PORT) || 10000, "0.0.0.0", () => {
    console.log("🚀 MYTHICA ADVENTURE SERVER ONLINE");
});
