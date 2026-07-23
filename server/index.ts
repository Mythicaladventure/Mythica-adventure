/**
 * Punto de entrada del servidor. Toda la lógica del juego vive en
 * server/src/ (schema, mapa, balance, la sala en sí) - este archivo
 * solo levanta Express + Colyseus y registra la sala.
 *
 * IMPORTANTE: esta ruta (server/index.ts) es la que arranca Render en
 * producción (ver package.json: "dev" y el comando de deploy usan
 * exactamente "server/index.ts"). No mover sin actualizar también el
 * comando de arranque en package.json / panel de Render.
 */
import http from "http";
import express from "express";
import cors from "cors";
import { Server } from "colyseus";
import { MundoMythicaRoom } from "./src/MundoMythicaRoom";
import { connectDB } from "./src/db";

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const gameServer = new Server({ server });

gameServer.define("mundo_mythica", MundoMythicaRoom);

const PORT = Number(process.env.PORT || 3000);

(async () => {
    // Se intenta conectar a Mongo ANTES de aceptar conexiones, para que
    // el primer jugador que entre ya tenga persistencia disponible (o
    // ya se sepa con certeza, desde el log, que se está corriendo en
    // modo degradado sin ella).
    await connectDB();
    server.listen(PORT, () => console.log("ONLINE"));
})();
