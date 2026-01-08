import { Schema, MapSchema, defineTypes } from "@colyseus/schema";

export class Player extends Schema {
    x: number = 0;
    y: number = 0;
}
defineTypes(Player, {
    x: "number",
    y: "number"
});

export class MyState extends Schema {
    players = new MapSchema<Player>();
}
defineTypes(MyState, {
    players: { map: Player }
});
