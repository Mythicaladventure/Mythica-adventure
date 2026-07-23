import mongoose from "mongoose";

let connected = false;
let attempted = false;

/**
 * Conecta a MongoDB usando la variable de entorno MONGO_URI.
 *
 * DECISIÓN IMPORTANTE: si la conexión falla (o la variable no está
 * configurada), el servidor NO se cae - sigue corriendo en "modo
 * degradado" sin persistencia (el comportamiento que ya existía antes
 * de este cambio: personajes efímeros, todo se resetea al reiniciar).
 * Es preferible un MMO sin memoria a un MMO caído. Los logs dejan bien
 * claro en qué modo está corriendo para que no sea un misterio en
 * producción.
 */
export async function connectDB(): Promise<boolean> {
    if (attempted) return connected;
    attempted = true;

    const uri = process.env.MONGO_URI;
    if (!uri) {
        console.warn(
            "⚠️  MONGO_URI no configurada - el servidor corre SIN persistencia " +
            "(los personajes NO se guardan entre sesiones)."
        );
        return false;
    }

    try {
        await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
        connected = true;
        console.log("💾 MongoDB conectado - persistencia de cuentas ACTIVA.");
        return true;
    } catch (err) {
        console.error(
            "❌ No se pudo conectar a MongoDB, el servidor sigue SIN persistencia:",
            (err as Error).message
        );
        connected = false;
        return false;
    }
}

export function isDBConnected(): boolean {
    return connected;
}
