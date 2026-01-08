import { Schema, type, MapSchema } from "@colyseus/schema";

// Esta es la información de cada jugador
export class Player extends Schema {
    @type("number") x: number = 0;
    @type("number") y: number = 0;
}

// Este es el estado global que ven todas las APKs
export class MyState extends Schema {
    @type({ map: Player }) players = new MapSchema<Player>();
}
