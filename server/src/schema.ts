import { Schema, MapSchema, ArraySchema, type } from "@colyseus/schema";

/** Una celda del mapa puede tener varias capas apiladas (ej: pasto + pared). */
export class TileStack extends Schema {
    @type(["number"]) items = new ArraySchema<number>();
}

export class Player extends Schema {
    @type("number") x: number = 0;
    @type("number") y: number = 0;
    @type("string") nombre: string = "";
    @type("number") skin: number = 7;
    @type("number") hp: number = 100;
    @type("number") maxHp: number = 100;
    @type("number") direction: number = 0;
    @type("boolean") isMoving: boolean = false;

    /** Cooldown interno de curación - NO se sincroniza al cliente (sin @type). */
    _lastHeal: number = 0;
}

export class Monster extends Schema {
    @type("string") tipo: string = "slime_green";
    @type("number") x: number = 0;
    @type("number") y: number = 0;
    @type("number") hp: number = 30;
    @type("number") maxHp: number = 30;
}

export class GameState extends Schema {
    @type("number") width: number = 20;
    @type("number") height: number = 20;
    @type({ map: TileStack }) map = new MapSchema<TileStack>();
    @type({ map: Player }) players = new MapSchema<Player>();
    @type({ map: Monster }) monsters = new MapSchema<Monster>();
}
