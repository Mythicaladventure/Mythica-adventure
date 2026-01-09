import express from "express";
import { Server, Room, Client } from "colyseus";
import { createServer } from "http";
import cors from "cors";
import { Schema, MapSchema, type } from "@colyseus/schema";

// 1. ESQUEMA DE DATOS CON PROTECCIÓN DE MEMORIA
class Player extends Schema {
    @type("string") id: string;
    @type("string") nombre: string;
    @type("number") x: number = 0;
    @type("number") y: number = 0;
    @type("number") z: number = 0; // Añadimos profundidad para mundos complejos
    @type("number") hp: number = 100;
    @type("number") maxHp: number = 100;
    @type("number") nivel: number = 1;
    @type("number") exp: number = 0;
    @type("uint32") latencia: number = 0; // Monitoreo de lag en tiempo real
    @type("boolean") esAdmin: boolean = false;
}

class WorldState extends Schema {
    @type({ map: Player }) players = new MapSchema<Player>();
    @type("string") serverStatus: string = "OPTIMAL";
}

// 2. NÚCLEO DE PROCESAMIENTO ASÍNCRONO (EL "MOTOR")
class MythicaGodEngine extends Room<WorldState> {
    
    // Configuración de límites físicos del mundo
    readonly WORLD_BOUNDS = 2000;
    readonly MAX_SPEED = 15; // Unidades por tick

    onCreate() {
        this.setState(new WorldState());

        // TICK RATE ULTRA: 30 Ticks por segundo (Nivel Competitivo)
        this.setSimulationInterval((dt) => this.intelectoArtificial(dt), 33);

        // MANEJO DE MENSAJES CON VALIDACIÓN DE INTEGRIDAD
        this.onMessage("mover", (client, data) => {
            const p = this.state.players.get(client.sessionId);
            if (!p || p.hp <= 0) return;

            // LÓGICA DE PROTECCIÓN ANTI-CHEAT (Validación Vectorial)
            const dx = data.x - p.x;
            const dy = data.y - p.y;
            const distanciaIntento = Math.sqrt(dx * dx + dy * dy);

            if (distanciaIntento <= this.MAX_SPEED) {
                // Teletransporte bloqueado: Solo se mueve si la física es lógica
                p.x = data.x;
                p.y = data.y;
                p.latencia = client.ping; // Sync de latencia
            } else {
                console.warn(`[SEGURIDAD] Intento de SpeedHack detectado: ${p.nombre}`);
                // Opcional: client.send("error", "Movimiento inválido detectado");
            }
        });

        this.onMessage("ping", (client) => {
            // Echo para medir estabilidad de conexión
            client.send("pong", Date.now());
        });
    }

    // Bucle de Inteligencia del Servidor (Simulación Autoritaria)
    intelectoArtificial(deltaTime: number) {
        this.state.players.forEach(player => {
            // 1. Sistema de Regeneración Avanzado basado en Nivel
            if (player.hp > 0 && player.hp < player.maxHp) {
                player.hp += (0.05 * player.nivel); 
            }

            // 2. Limpieza de mapa: Si el jugador cae fuera del mundo, lo reposicionamos
            if (Math.abs(player.x) > this.WORLD_BOUNDS || Math.abs(player.y) > this.WORLD_BOUNDS) {
                player.x = 0;
                player.y = 0;
            }
        });
    }

    onJoin(client: Client, options: any) {
        const p = new Player();
        p.id = client.sessionId;
        p.nombre = options.nombre || `Legendario_${client.sessionId.substring(0, 3)}`;
        
        // El servidor decide el punto de entrada (Spawn autoritario)
        p.x = 0; 
        p.y = 0;
        
        this.state.players.set(client.sessionId, p);
        console.log(`[MYTHICA] Núcleo vinculado a: ${p.nombre}`);
    }

    onLeave(client: Client) {
        console.log(`[DESCONEXIÓN] Liberando memoria de: ${client.sessionId}`);
        this.state.players.delete(client.sessionId);
    }
}

// 3. INFRAESTRUCTURA DE ALTO IMPACTO
const app = express();
app.use(cors());
app.use(express.json());

// API de Salud de Microservicios
app.get("/health", (req, res) => {
    res.status(200).json({ 
        uptime: process.uptime(),
        memory: process.memoryUsage().rss,
        engine: "Mythica God-Tier 2.0" 
    });
});

const server = createServer(app);
const gameServer = new Server({
    server,
    pingInterval: 1500, // Detecta desconexiones en milisegundos
    pingMaxRetries: 3
});

gameServer.define("mundo_mythica", MythicaGodEngine).enableRealtimeListing();

const PORT = Number(process.env.PORT) || 10000;
server.listen(PORT, "0.0.0.0", () => {
    console.log("------------------------------------------");
    console.log("   SISTEMA MYTHICA: MODO OMNIPOTENTE      ");
    console.log("   PROCESAMIENTO VECTORIAL ACTIVADO       ");
    console.log("------------------------------------------");
});
