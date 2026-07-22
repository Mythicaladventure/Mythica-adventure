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
