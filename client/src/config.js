/* ============================================================
 * CONFIG.JS - Constantes compartidas de todo el cliente.
 *
 * Antes, cada asset se cargaba con la URL absoluta completa de
 * GitHub Pages hardcodeada ("https://mythicaladventure.github.io/
 * Mythica-adventure/client/") dentro de BootScene. Esto es frágil:
 * si el repo cambia de nombre, de organización, o el juego se sirve
 * desde un dominio propio en el futuro, todo se rompe en silencio.
 * Ahora usamos una ruta RELATIVA a la página actual (index.html y
 * client/ siempre viven juntos), portable sin importar el dominio.
 * ============================================================ */

const ASSET_BASE = 'client/';

// URL del servidor de juego (Colyseus). Este sí necesita ser absoluto
// porque apunta a un servicio externo (Render), no a un archivo propio.
const SERVER_URL = 'wss://mythica-adventure.onrender.com';

// ------------------------------------------------------------
// FASE 2: DECORACIÓN (árboles/flores del bioma "bosque")
// IDs de sprite (ver client/assets/sprites/nature_biomas/bosque/) y
// posiciones fijas en tiles del mapa "Temple City" (20x20, ver
// server/index.ts). Colocación manual por ahora - cuando haya más mapas
// esto debería moverse al servidor como parte del mapDesign.
// Árboles: OBJ_001-003, 011-012 (64x96, 2x3 celdas, anclados por la base).
// Flores/decoración chica: OBJ_017-024 (32x32, 1x1 celda).
// ------------------------------------------------------------
const DECOR_IDS = [1, 2, 3, 11, 12, 17, 18, 20, 24];

// { id, tileX, tileY } - posiciones elegidas sobre césped (id=1) del mapa,
// evitando pisar paredes/agua/piso del templo.
const DECOR_PLACEMENTS = [
    { id: 1,  tileX: 3,  tileY: 1 },
    { id: 2,  tileX: 5,  tileY: 1 },
    { id: 11, tileX: 15, tileY: 1 },
    { id: 3,  tileX: 17, tileY: 11 },
    { id: 12, tileX: 2,  tileY: 11 },
    { id: 2,  tileX: 9,  tileY: 17 },
    { id: 17, tileX: 4,  tileY: 1 },
    { id: 18, tileX: 7,  tileY: 11 },
    { id: 20, tileX: 13, tileY: 17 },
    { id: 24, tileX: 16, tileY: 1 },
];

// ------------------------------------------------------------
// FASE 4: MONSTRUOS - tipos disponibles (sprite generado por código,
// ver notas de la sesión: control total en vez de un atlas externo
// sin verificar visualmente).
// ------------------------------------------------------------
const MONSTER_TYPES = ['slime_green', 'slime_red'];

// ------------------------------------------------------------
// MAPEO DE TILES DE SUELO - id del servidor -> frame del spritesheet
// 'tiles' (tiles_nuevo_v2_vivo.png). Centralizado acá para que
// renderStack() en GameScene no tenga números mágicos sueltos.
// ------------------------------------------------------------
const TILE_FRAME_MAP = {
    1: { frame: 0, isWall: false }, // Pasto
    3: { frame: 1, isWall: false }, // Piso Losa
    2: { frame: 6, isWall: true  }, // Pared (arenisca)
    4: { frame: 8, isWall: false }, // Agua
};
