import express from "express";
import { Server, Room, Client } from "colyseus";
import { createServer } from "http";
import cors from "cors";

// --- 1. SEGURIDAD PARA QUE TU APK NO SE DESCONECTE ---
process.on('unhandledRejection', (reason) => console.log('⚠️ Error de red:', reason));
process.on('uncaughtException', (err) => console.log('⚠️ Error crítico:', err));

const port = Number(process.env.PORT) || 10000;
const app = express();

app.use(cors());
app.use(express.json());

// --- 2. DEFINICIÓN DE LA SALA DEL JUEGO (Aquí vivirán los jugadores) ---
class SalaPrincipal extends Room {
    // Esto se ejecuta cuando alguien entra al juego desde la APK
    onCreate(options: any) {
        console.log("🏰 ¡Mundo de Mythica creado!");
        
        // Aquí el servidor escucha lo que hace el jugador
        this.onMessage("mover", (client, datos) => {
            // Cuando un jugador se mueve, le avisa a todos los demás
            this.broadcast("jugador_movido", { 
                id: client.sessionId, 
                x: datos.x, 
                y: datos.y 
            });
        });
    }

    onJoin(client: Client) {
        console.log("👤 Jugador conectado con ID: " + client.sessionId);
    }

    onLeave(client: Client) {
        console.log("🏃 Jugador desconectado: " + client.sessionId);
    }
}

// --- 3. ARRANCAR EL MOTOR DEL JUEGO ---
const servidorWeb = createServer(app);
const gameServer = new Server({
    server: servidorWeb,
});

// Registramos el nombre de la sala que buscará tu APK
gameServer.define("mundo_mythica", SalaPrincipal);

app.get("/", (req, res) => res.send("⚔️ Servidor MMORPG Mythica Activo y listo para la APK"));

gameServer.listen(port).then(() => {
    console.log(`🚀 Servidor funcionando en puerto ${port}`);
});
