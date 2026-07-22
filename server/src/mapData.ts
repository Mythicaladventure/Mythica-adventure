/**
 * Mapa de prueba "Temple City" (20x20).
 *
 * Leyenda: 0 = Nada (hueco/puerta), 1 = Pasto, 2 = Pared Piedra,
 *          3 = Piso Losas, 4 = Agua
 *
 * Un pequeño templo con dos alas simétricas, rodeado de pasto y un
 * borde de agua. Cuando existan más mapas, esto debería migrar a
 * archivos de datos cargados dinámicamente (ej. JSON exportado desde
 * Tiled) en vez de arrays hardcodeados en el código fuente.
 */
export const TEMPLE_CITY_MAP: number[][] = [
    [4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4],
    [4,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,4],
    [4,1,2,2,2,2,2,2,2,1,1,2,2,2,2,2,2,1,1,4],
    [4,1,2,3,3,3,3,3,2,1,1,2,3,3,3,3,2,1,1,4],
    [4,1,2,3,3,3,3,3,2,1,1,2,3,3,3,3,2,1,1,4],
    [4,1,2,3,3,3,3,3,2,1,1,2,3,3,3,3,2,1,1,4],
    [4,1,2,2,2,0,2,2,2,1,1,2,2,0,2,2,2,1,1,4], // Puertas (0 es hueco)
    [4,1,1,1,3,3,3,1,1,1,1,1,3,3,3,1,1,1,1,4],
    [4,1,1,1,3,3,3,1,1,3,1,1,3,3,3,1,1,1,1,4], // Plaza Central
    [4,1,1,1,3,3,3,3,3,3,3,3,3,3,3,1,1,1,1,4],
    [4,1,1,1,3,3,3,1,1,3,1,1,3,3,3,1,1,1,1,4],
    [4,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,4],
    [4,1,2,2,2,2,2,1,1,1,1,1,2,2,2,2,2,1,1,4],
    [4,1,2,3,3,3,2,1,1,1,1,1,2,3,3,3,2,1,1,4],
    [4,1,2,3,3,3,2,1,1,1,1,1,2,3,3,3,2,1,1,4],
    [4,1,2,2,0,2,2,1,1,1,1,1,2,2,0,2,2,1,1,4],
    [4,1,1,1,3,1,1,1,1,1,1,1,1,1,3,1,1,1,1,4],
    [4,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,4],
    [4,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,4],
    [4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4],
];

export const MAP_WIDTH = 20;
export const MAP_HEIGHT = 20;

/** Spawns iniciales de monstruos: posición en tiles + tipo + vida. */
export const MONSTER_SPAWNS = [
    { tileX: 6,  tileY: 9, tipo: "slime_green", hp: 30 },
    { tileX: 9,  tileY: 9, tipo: "slime_red",   hp: 45 },
    { tileX: 12, tileY: 9, tipo: "slime_green", hp: 30 },
];
