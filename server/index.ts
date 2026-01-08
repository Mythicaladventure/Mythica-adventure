import express from "express";
import { Server, Room, Client } from "colyseus";
import { createServer } from "http";
import cors from "cors";
import { Schema, MapSchema, type } from "@colyseus/schema";

class Player extends Schema {}
type("number")(Player.prototype, "x");
type("number")(Player.prototype, "y");
type("string")(Player.prototype, "nombre");

class MyState extends Schema {
    constructor() {
        super();
        this.players = new MapSchema<Player>();
    }
}
type({ map: Player })(MyState.prototype, "players");

class SalaPrincipal extends Room<MyState> {
    onCreate() {
        this.setState(new MyState());
        this.onMessage("mover", (client, pos) => {
            const p = this.state.players.get(client.sessionId);
            if (p) { p.x = pos.x; p.y = pos.y; }
        });
    }
    onJoin(client: Client, options: any) {
        const p = new Player();
        p.x = 100; p.y = 100;
        p.nombre = options.nombre || "Héroe";
        this.state.players.set(client.sessionId, p);
    }
    onLeave(client: Client) {
        this.state.players.delete(client.sessionId);
    }
}

const app = express();
app.use(cors());
const server = createServer(app);
const gameServer = new Server({ server });
gameServer.define("mundo_mythica", SalaPrincipal);

server.listen(Number(process.env.PORT) || 10000, "0.0.0.0");
