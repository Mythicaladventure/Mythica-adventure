import { randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt) as (
    password: string,
    salt: string,
    keylen: number
) => Promise<Buffer>;

/**
 * Hashea una contraseña con scrypt + salt aleatoria por cuenta.
 *
 * Se usa el módulo `crypto` nativo de Node en vez de agregar bcrypt
 * como dependencia nueva - scrypt es igual de adecuado para este caso
 * (proyecto personal, no un banco) y evita instalar/mantener un
 * paquete extra solo para esto.
 */
export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
    const salt = randomBytes(16).toString("hex");
    const derived = await scryptAsync(password, salt, 64);
    return { hash: derived.toString("hex"), salt };
}

/** Compara en tiempo constante (evita timing attacks triviales). */
export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
    const derived = await scryptAsync(password, salt, 64);
    const stored = Buffer.from(hash, "hex");
    if (derived.length !== stored.length) return false;
    return timingSafeEqual(derived, stored);
}
