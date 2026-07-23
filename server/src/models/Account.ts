import mongoose from "mongoose";

/** Sub-documento de un slot de inventario guardado. Espejo de
 * InventoryItem en schema.ts, pero como esquema de Mongo (no de
 * Colyseus) - son cosas distintas que viven en capas distintas, no
 * conviene acoplarlas. */
const InventoryItemSubSchema = new mongoose.Schema(
    {
        itemId: { type: String, required: true },
        nombre: { type: String, required: true },
        qty: { type: Number, required: true, default: 1 },
    },
    { _id: false }
);

const AccountSchema = new mongoose.Schema({
    nombre: { type: String, required: true, unique: true, index: true, trim: true },
    passwordHash: { type: String, required: true },
    passwordSalt: { type: String, required: true },

    level: { type: Number, default: 1 },
    xp: { type: Number, default: 0 },
    maxHp: { type: Number, default: 100 },

    // Última posición conocida, para que el jugador reaparezca donde
    // se desconectó en vez de siempre en el spawn central.
    x: { type: Number, default: 320 },
    y: { type: Number, default: 320 },

    inventory: { type: [InventoryItemSubSchema], default: [] },

    createdAt: { type: Date, default: Date.now },
    lastLogin: { type: Date, default: Date.now },
});

export const AccountModel = mongoose.model("Account", AccountSchema);
