import express from "express";
import { Server } from "colyseus";
import { createServer } from "http";
import cors from "cors";
import { monitor } from "@colyseus/monitor";
// Si usas una sala personalizada, asegúrate de que el nombre del archivo coincida
// import { MyRoom } from "./MyRoom"; 

// --- RED DE SEGURIDAD PARA EVITAR CRASHES ---
process.on('unhandledRejection', (reason, promise) => {
    console.log('⚠️ Rechazo no manejado en:', promise, 'razón:', reason);
});

process.on('uncaughtException', (err) => {
    console.log('⚠️ Excepción no capturada:', err);
});

const port = Number(process.env.PORT) || 10000;
const app = express();

app.use(cors());
app.use(express.json());

// Ruta básica para verificar que el servidor está vivo
app.get("/", (req, res) => {
    res.send("¡El servidor de Mythica está funcionando! 🚀");
});

const gameServer = new Server({
    server: createServer(app),
});

// Registrar salas (Ejemplo: define tu sala aquí o impórtala)
// gameServer.define("my_room", MyRoom);

// Panel de monitoreo (opcional)
app.use("/colyseus", monitor());

gameServer.listen(port).then(() => {
    console.log(`🚀 Mythica Server escuchando en el puerto: ${port}`);
}).catch((err) => {
    console.error("❌ Error al iniciar el servidor:", err);
});
