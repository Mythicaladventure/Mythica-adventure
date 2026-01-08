import express from "express";
import { Server, Room, Client } from "colyseus";
import { createServer } from "http";
import cors from "cors";
// Importamos lo que acabas de crear
import { MyState, Player } from "./MyState"; 

process.on('unhandledRejection', (reason) => console.log('⚠️ Error:', reason));
process.on('uncaughtException', (err) => console.log('⚠️ Error Crítico:', err));

const port = Number(process.env.PORT) || 10000;
const app = express();
app.use(cors());
app.use(express.json());

// --- LÓGICA DEL MUNDO ---
class SalaPrincipal extends Room<MyState> {
    onCreate(options: any) {
        // Le decimos a la sala que use tu MyState
        this.setState(new MyState());
        console.log("🏰 Mundo de Mythica sincronizado.");

        // Escucha cuando un jugador se mueve desde la APK
        this.onMessage("mover", (client, datos) => {
            const player = this.state.players.get(client.sessionId);
            if (player) {
                player.x = datos.x;
                player.y = datos.y;
            }
        });
    }

    onJoin(client: Client) {
        console.log("👤 Jugador nuevo:", client.sessionId);
        // Creamos al jugador en el mapa al entrar
        this.state.players.set(client.sessionId, new Player());
    }

    onLeave(client: Client) {
        console.log("🏃 Jugador salió:", client.sessionId);
        this.state.players.delete(client.sessionId);
    }
}

const servidorWeb = createServer(app);
const gameServer = new Server({ server: servidorWeb });

gameServer.define("mundo_mythica", SalaPrincipal);

app.get("/", (req, res) => res.send("⚔️ Servidor MMORPG Sincronizado"));

gameServer.listen(port);
