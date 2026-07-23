import { Schema, MapSchema, ArraySchema, type } from "@colyseus/schema";

/** Una celda del mapa puede tener varias capas apiladas (ej: pasto + pared). */
export class TileStack extends Schema {
    @type(["number"]) items = new ArraySchema<number>();
}

/** Un slot de inventario. Por ahora sin equipar/usar, solo "tener". */
export class InventoryItem extends Schema {
    @type("string") itemId: string = "";
    @type("string") nombre: string = "";
    @type("number") qty: number = 1;
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

    /** Progresión: nivel, xp acumulada en el nivel actual, y xp
     * necesaria para el próximo (se resincroniza cada level-up). */
    @type("number") level: number = 1;
    @type("number") xp: number = 0;
    @type("number") xpToNext: number = 100;
    @type([InventoryItem]) inventory = new ArraySchema<InventoryItem>();

    /** Cooldown interno de curación - NO se sincroniza al cliente (sin @type). */
    _lastHeal: number = 0;
    /** Nombre de cuenta asociado (para guardar/cargar de Mongo) - NO
     * sincronizado, solo uso interno del servidor. */
    _accountName: string = "";
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
