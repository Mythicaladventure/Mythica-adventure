import { Room, Client } from "colyseus";
import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";
import mongoose from 'mongoose';

// --- 1. ESQUEMAS DE DATOS (ESTADO DEL JUEGO) ---

export class Item extends Schema {
    @type("string") id: string;
    @type("string") name: string;
    @type("string") type: string; // weapon, armor, potion
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
    
    // Slots de equipo
    @type(Item) weapon: Item;
    @type(Item) chest: Item;
}

export class MythicaState extends Schema {
    @type({ map: Player }) players = new MapSchema<Player>();
}

// --- 2. MODELO DE BASE DE DATOS (MONGODB) ---

const PlayerModel = mongoose.model('Player', new mongoose.Schema({
    username: String,
    level: Number,
    position: { x: Number, y: Number },
    stats: { hp: Number, maxHp: Number },
    inventory: Array
}));

// --- 3. LÓGICA DE LA SALA DEL JUEGO ---

export class GameRoom extends Room<MythicaState> {
    
    onCreate(options: any) {
        this.setState(new MythicaState());

        // Ciclo de simulación: Combate cada 1 segundo
        this.setSimulationInterval((dt) => this.processCombat(), 1000);

        // Mensaje de Movimiento
        this.onMessage("move", (client, data) => {
            const player = this.state.players.get(client.sessionId);
            if (this.isValidMove(player, data.x, data.y)) {
                player.x = data.x;
                player.y = data.y;
            }
        });

        // Mensaje de Target (Combate)
        this.onMessage("setTarget", (client, data) => {
            const player = this.state.players.get(client.sessionId);
            player.targetId = data.targetId;
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
        // Validación de 1 solo cuadro (Estilo Tibia)
        const dist = Math.abs(player.x - nx) + Math.abs(player.y - ny);
        return dist === 1;
    }

    getDistance(a: any, b: any) {
        return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    }

    async onJoin(client: Client, options: any) {
        console.log(options.name, "se ha unido!");
        
        // Cargar datos de DB o crear nuevo
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
            // Guardar progreso al salir
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
