# Arquitectura de Mythica Adventure

Este documento explica cómo está organizado el proyecto tras la
reestructuración completa, y sobre todo **por qué** está organizado así -
varios de estos patrones existen específicamente para no repetir bugs
reales que ya tuvimos.

## Principio rector: nunca "adivinar"

El bug más caro de este proyecto fue el login que "no reaccionaba": el
HTML intentaba adivinar cuándo Phaser estaba listo usando temporizadores
y conteo de scripts cargados, en vez de escuchar una señal real y
confiable. Esa clase de bug (sincronizar dos sistemas asíncronos
"a ojo" en vez de con un evento explícito) se repitió varias veces
disfrazada de formas distintas: el plugin del joystick nunca registrado,
el rango de ataque del cliente desalineado del servidor, assets con rutas
rotas silenciosas.

**Regla de ahora en adelante:** cualquier sincronización entre dos partes
del sistema (cliente↔servidor, HTML↔Phaser, UI↔lógica de juego) debe
pasar por un evento/mensaje explícito y verificable, nunca por timing
asumido. Si dos números deben coincidir en dos archivos distintos (como
el rango de ataque), se deja un comentario cruzado en AMBOS lugares
señalando la dependencia.

## Estructura de carpetas

```
index.html                  Punto de entrada, UI de login/chat/HUD
client/
  vendor/                   Phaser, Colyseus.js, plugin de joystick
                             (auto-hospedados, no CDN externo - ver abajo)
  src/
    config.js                Constantes compartidas (rutas, IDs, mapeos)
    scenes/
      BootScene.js            Precarga de assets con barra de progreso real
      UIScene.js               Joystick virtual táctil
      GameScene.js             Conexión, render, movimiento, combate, chat
    game.js                   Config final de Phaser.Game + arranque
  assets/sprites/            Arte del juego (tiles, personaje, monstruos,
                              decoración por bioma)
server/
  index.ts                   Bootstrap: Express + Colyseus, nada más
  src/
    schema.ts                 Definiciones de estado sincronizado (Player,
                               Monster, TileStack, GameState)
    mapData.ts                 Diseño del mapa "Temple City" + spawns
    balance.ts                  Constantes de combate (daño, rangos, cooldowns)
    MundoMythicaRoom.ts          La sala: toda la lógica de juego
```

## Por qué el cliente NO usa un bundler (todavía)

`webpack.config.js` existe en el repo pero nunca estuvo conectado (sin
`webpack` en las dependencias). En vez de introducir un paso de build
nuevo ahora mismo (más riesgo, más piezas móviles), el cliente se dividió
en archivos `<script>` planos cargados en orden de dependencia. Esto es
suficiente para el tamaño actual del proyecto. Si el cliente sigue
creciendo, migrar a un bundler real (con CI que compile y publique) es el
siguiente paso lógico - dejarlo anotado acá para no tener que
redescubrirlo.

## Por qué Phaser/Colyseus/joystick están auto-hospedados

Se midieron cargas de hasta 7+ segundos desde `cdn.jsdelivr.net` en
pruebas reales. Los archivos viven en `client/vendor/` (descargados una
vez vía `npm install` y copiados), eliminando esa fuente de lentitud e
inestabilidad.

## Por qué las rutas de assets son relativas, no absolutas

Antes: `"https://mythicaladventure.github.io/Mythica-adventure/client/"`
hardcodeado. Si el repo cambia de nombre/organización, o el juego se
sirve desde otro dominio, esto se rompe en silencio. Ahora: `ASSET_BASE =
'client/'` en `config.js`, relativo a donde vive `index.html`. La única
URL absoluta que queda es `SERVER_URL` (el servidor de Colyseus en
Render), porque ese sí es necesariamente un servicio externo.

## El patrón `game-ready`: cómo sincronizar HTML con Phaser sin adivinar

1. `BootScene` precarga todo con la API nativa de Phaser (`this.load`).
2. Solo cuando `BootScene.create()` corre (lo cual Phaser garantiza que
   pasa después de que el loader terminó), se arranca `GameScene`.
3. `GameScene.create()` registra el listener de `'start-game'` y **recién
   entonces** dispara `window.dispatchEvent(new CustomEvent('game-ready'))`.
4. El HTML tiene una bandera `window._gameReady` seteada por un listener
   registrado ANTES de cargar Phaser (cubre el caso de que el evento
   llegue antes de que el HTML llegue a escucharlo) + un listener normal
   (cubre el caso contrario). El botón ENTRAR solo se habilita ahí.

Ningún paso de esta cadena depende de cuánto tarden los `<script>` en
descargarse - todo depende de eventos reales que Phaser garantiza.

## Combate: valores que deben coincidir en dos archivos

`PLAYER_ATTACK_RANGE_PX` (server/src/balance.ts, valor 50) debe coincidir
con el chequeo de rango en `client/src/scenes/GameScene.js`
(`attackNearestMonster()`). El servidor es la fuente de verdad real (es
quien decide si el golpe conecta), pero si el cliente permite intentar
ataques fuera de ese rango, el jugador ve el botón "fallar" sin
explicación. Ambos lugares tienen comentarios cruzados señalando esto.

## Qué se eliminó y por qué

Se removieron ~33 archivos heredados del repo original que ya no se usan
en ningún lado del código actual: sprites OTSP sin referenciar
(`otsp_doors`, `otsp_equipment`, `otsp_misc`, `otsp_nature_01`,
`otsp_tiles_01`, `otsp_town`, `otsp_walls_*`, `otsp_creatures_02/03/04`),
el binario `otsp.dat` (se cargaba pero nunca se usaba en ninguna lógica),
y datos de mapas/items en formato OpenTibia (`server/data/`,
`server/database/`) que nunca se conectaron a la lógica del servidor (el
mapa real vive hardcodeado en `mapData.ts`). La dependencia
`fast-xml-parser` también se quitó de `package.json` por el mismo motivo.
Todo sigue disponible en el historial de git si hace falta retomarlo.

**Nota:** `mongoose` sigue instalado en `package.json` aunque no se usa
todavía en el servidor - se dejó porque probablemente haga falta pronto
para persistencia de cuentas/inventario, a diferencia de los archivos
anteriores que no tenían ningún plan de uso claro.

## Estado del juego (qué existe, qué falta)

**Existe:** mundo visual coherente (paredes/agua/césped/tierra con
paleta viva), decoración estática, un jugador controlable (teclado +
joystick), combate cuerpo a cuerpo de dos vías contra 3 slimes con
respawn, chat en tiempo real, curación con cooldown, muerte/respawn de
jugador.

**Falta** (fuera del alcance de esta sesión): sistema de razas/clases del
GDD, inventario/items, más de un mapa, persistencia de cuenta (login
real, no solo un nombre), niveles/experiencia, más tipos de monstruos con
arte propio.
