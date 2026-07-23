/**
 * Constantes de balance de combate. Centralizadas acá para que ajustar
 * el juego no requiera bucear entre la lógica de red buscando números
 * sueltos - y para que quede documentado EN UN SOLO LUGAR por qué cada
 * valor es lo que es.
 */

/** Cada cuánto los monstruos intentan contraatacar (ms). */
export const MONSTER_ATTACK_INTERVAL_MS = 1000;

/** Rango de contraataque de los monstruos (px). Referencia para el
 * rango de ataque del jugador (debe ser mayor a esto, ver abajo). */
export const MONSTER_ATTACK_RANGE_PX = 40;

/** Daño que hace un monstruo por golpe. */
export const MONSTER_ATTACK_DAMAGE = 8;

/** Rango de ataque cuerpo a cuerpo del jugador (px). Debe ser un poco
 * mayor a MONSTER_ATTACK_RANGE_PX - si fuera mucho mayor, el jugador
 * podría golpear sin nunca recibir daño de vuelta ("kiting" gratuito),
 * rompiendo el combate de dos vías. */
export const PLAYER_ATTACK_RANGE_PX = 50;

/** Daño que hace el jugador por golpe. */
export const PLAYER_ATTACK_DAMAGE = 15;

/** Tiempo tras morir un monstruo hasta que reaparece (ms). */
export const MONSTER_RESPAWN_MS = 15000;

/** Tiempo tras morir el jugador hasta que reaparece (ms). */
export const PLAYER_RESPAWN_MS = 3000;

/** Cantidad de vida que restaura 'heal'. */
export const HEAL_AMOUNT = 20;

/** Cooldown entre usos de 'heal' (ms). */
export const HEAL_COOLDOWN_MS = 3000;

/** Longitud máxima de un mensaje de chat. */
export const CHAT_MAX_LENGTH = 140;

/** ============================================================
 * SISTEMA DE PROGRESIÓN (nivel/XP) - base para un MMORPG real.
 * ============================================================ */

/** XP necesaria para subir del nivel N al N+1. Curva lineal simple
 * (100 * nivel) - suficiente para un MVP jugable; si más adelante se
 * quiere una curva exponencial tipo Tibia, solo hay que cambiar esta
 * función, todo lo demás (level-up, guardado) ya la usa como fuente
 * única de verdad. */
export function xpForLevel(level: number): number {
    return level * 100;
}

/** Cuánta vida máxima (y curación completa) gana el jugador por cada
 * nivel que sube. */
export const HP_PER_LEVEL = 15;

/** XP que otorga cada tipo de monstruo al morir. Si aparece un tipo
 * nuevo sin entrada acá, se usa MONSTER_XP_REWARD_DEFAULT. */
export const MONSTER_XP_REWARD: Record<string, number> = {
    slime_green: 15,
    slime_red: 25,
};
export const MONSTER_XP_REWARD_DEFAULT = 10;

/** ============================================================
 * SISTEMA DE ITEMS/DROPS - base para el futuro inventario real.
 * ============================================================ */

/** Probabilidad (0-1) de que un monstruo suelte un item al morir. */
export const ITEM_DROP_CHANCE = 0.35;

/** Tabla de items que pueden dropear. Genérica por ahora (no varía
 * según tipo de monstruo) - mejora obvia para cuando existan más
 * tipos de enemigos con drops propios. */
export const ITEM_DROP_TABLE: { itemId: string; nombre: string }[] = [
    { itemId: "gel_slime", nombre: "Gel de Slime" },
    { itemId: "moneda_oro", nombre: "Moneda de Oro" },
];

/** Máximo de slots distintos de inventario (no de cantidad total -
 * items iguales se apilan en un mismo slot vía `qty`). */
export const INVENTORY_MAX_SLOTS = 20;
