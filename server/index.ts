import { Server, Room, Client } from "colyseus";
import { createServer } from "http";
import express from "express";
import { monitor } from "@colyseus/monitor";
import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";
import mongoose from "mongoose";
import dotenv from "dotenv";

// 1. CONFIGURACIÓN INICIAL (Variables de entorno)
dotenv.config();

const port = Number(process.env.PORT || 2567);
const MONGO_URI = process.env.MONGO_URI;

// 2. CONEXIÓN A LA BASE DE DATOS
if (MONGO_URI) {
    mongoose.connect(MONGO_URI)
        .then(() => console.log("✅ Conexión exitosa a MongoDB Atlas (Mythica DB)"))
        .catch((err) => console.error("❌ Error conectando a MongoDB:", err));
} else {
    console.warn("⚠️ Advertencia: No se encontró MONGO_URI en el archivo .env");
}

// 3. MODELO DE BASE DE DATOS (MONGODB)
const PlayerModel = mongoose.model('Player', new mongoose.Schema({
    username: String,
    level: { type: Number, default: 1 },
    position: { x: Number, y: Number },
    stats: { hp: Number, maxHp: Number },
    inventory: Array
}));

// 4. ESQUEMAS DEL ESTADO DEL JUEGO (COLYSEUS)
export class Item extends Schema {
    @type("string") id: string;
    @type("string") name: string;
    @type("string") type: string;
    @type("number") attackBonus: number = 0;
    @type("number") defenseBonus: number = 0;
    @type("boolean") equippable: boolean = false;
}

export class Player extends Schema {
    @type("string") name: string;
    @type("number") x: number;
    @type("number") y: number;
    @type("number") hp: number = 100;
    @type("number") maxHp: number = 100;
    @type("number") level: number = 1;
    @type("number") attack: number = 10;
    @type("number") defense: number = 5;
    @type("string") targetId: string = "";
    @type([Item]) inventory = new ArraySchema<Item>();
    
    @type(Item) weapon: Item;
    @type(Item) chest: Item;
}

export class MythicaState extends Schema {
    @type({ map: Player }) players = new MapSchema<Player>();
}

// 5. LÓGICA DE LA SALA DEL JUEGO
export class GameRoom extends Room<MythicaState> {
    
    onCreate(options: any) {
        this.setState(new MythicaState());

        // Ciclo de simulación: Combate cada 1 segundo
        this.setSimulationInterval((dt) => this.processCombat(), 1000);

        this.onMessage("move", (client, data) => {
            const player = this.state.players.get(client.sessionId);
            if (player && this.isValidMove(player, data.x, data.y)) {
                player.x = data.x;
                player.y = data.y;
            }
        });

        this.onMessage("setTarget", (client, data) => {
            const player = this.state.players.get(client.sessionId);
            if (player) player.targetId = data.targetId;
        });
    }

    processCombat() {
        this.state.players.forEach(player => {
            if (!player.targetId) return;
            const target = this.state.players.get(player.targetId);
            
            if (target && this.getDistance(player, target) <= 1) {
                const damage = Math.max(0, player.attack - target.defense);
                target.hp -= damage;
                this.broadcast("damageVisual", { id: player.targetId, value: damage });
            }
        });
    }

    isValidMove(player: Player, nx: number, ny: number) {
        const dist = Math.abs(player.x - nx) + Math.abs(player.y - ny);
        return dist === 1;
    }

    getDistance(a: any, b: any) {
        return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    }

    async onJoin(client: Client, options: any) {
        console.log(options.name, "se ha unido!");
        const dbData = await PlayerModel.findOne({ username: options.name });
        
        const player = new Player().assign({
            name: options.name,
            x: dbData?.position?.x || 10,
            y: dbData?.position?.y || 10,
            hp: dbData?.stats?.hp || 100
        });

        this.state.players.set(client.sessionId, player);
    }

    async onLeave(client: Client) {
        const player = this.state.players.get(client.sessionId);
        if (player) {
            await PlayerModel.updateOne({ username: player.name }, {
                $set: { 
                    "position.x": player.x, 
                    "position.y": player.y,
                    "stats.hp": player.hp
                }
            }, { upsert: true });
            this.state.players.delete(client.sessionId);
        }
    }
}

// 6. SERVIDOR EXPRESS Y MONITOR
const app = express();
app.use(express.json());
app.use("/colyseus", monitor());

const server = createServer(app);
const gameServer = new Server({ server });

// Definir la sala de juego
gameServer.define("mythica_room", GameRoom);

server.listen(port, () => console.log(`🚀 Mythica Server escuchando en http://localhost:${port}`));
