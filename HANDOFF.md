# HANDOFF - Estado del proyecto para continuar en otra sesión

Última actualización: commit `6ece564` (ver `git log` para historial completo).

Este documento existe para que una sesión NUEVA de Claude (u otra
persona) pueda retomar el proyecto sin tener que redescubrir todo desde
cero. Léelo completo antes de tocar código.

## 1. Qué es esto

MMORPG 2D top-down estilo Tibia ("Mythica Adventure"). Stack: Phaser 3
(cliente) + Colyseus (servidor multiplayer en tiempo real) + Node/TypeScript.
Repo: `github.com/Mythicaladventure/Mythica-adventure` (rama `main`).

- **Cliente en vivo:** https://mythicaladventure.github.io/Mythica-adventure/
  (GitHub Pages, se actualiza solo 1-2 min después de cada push a `main`)
- **Servidor en vivo:** `wss://mythica-adventure.onrender.com` (Render,
  plan gratuito - se duerme tras inactividad, tarda 50s+ en despertar,
  se redeploya solo tras cada push a `main`, tarda 3-4 min en reiniciar)

Para arquitectura completa, leer **`ARCHITECTURE.md`** en la raíz del
repo (explica la estructura de carpetas, por qué está organizado así, y
el patrón `game-ready` que reemplazó la sincronización "a ciegas" que
causaba bugs).

## 2. Acceso y credenciales

- **Token de GitHub:** el usuario ya dio un Personal Access Token
  (permisos completos, sin expiración) en un mensaje anterior de esta
  conversación. Si esa conversación no está disponible en la sesión
  nueva, **pedirle al usuario un token nuevo** (Settings → Developer
  settings → Personal access tokens → Tokens classic → Generate,
  permisos `repo` bastan).
- **Render:** el usuario tiene acceso al dashboard
  (`dashboard.render.com`), pero Claude NO tiene forma de acceder ahí
  directamente (el dominio `render.com` no está en la lista de red
  permitida de las herramientas, ni siquiera con un token de Render). Si
  hace falta revisar logs de Render, hay que pedirle capturas de
  pantalla al usuario.
- **MongoDB:** hay una `MONGO_URI` que estuvo expuesta en un `.env`
  público en el repo (ya se eliminó del repo, pero la contraseña sigue
  siendo la misma en MongoDB Atlas). Se recomendó rotarla, no se
  confirmó si el usuario lo hizo. `mongoose` está instalado pero el
  servidor NO lo usa todavía (sin persistencia real, todo vive en
  memoria y se resetea si el servidor reinicia).

## 3. Cómo trabajar en este proyecto (flujo que ya funciona)

```bash
cd /home/claude  # o donde corresponda en la sesión nueva
git clone https://TOKEN@github.com/Mythicaladventure/Mythica-adventure.git mythica_repo
cd mythica_repo
# ... hacer cambios ...
node -c client/src/scenes/GameScene.js   # validar sintaxis JS antes de commitear
npx tsc --noEmit --project tsconfig.json # validar TypeScript del servidor
npm install && timeout 4 npx ts-node --transpile-only server/index.ts  # probar arranque real
git add -A && git commit -m "..."
git push origin main
```

Después de un push, avisarle al usuario cuánto esperar:
- Cambios de servidor (`server/`) → **3-4 minutos** (Render rebuildea)
- Cambios de cliente (`client/`, `index.html`) → **1-2 minutos** (GitHub Pages)

Siempre pedir **Ctrl+Shift+R** (recarga forzada) al probar, para evitar
caché del navegador.

## 4. Lo que SÍ funciona (verificado)

- Login/conexión al servidor (con barra de progreso real, sin
  condiciones de carrera - ver patrón `game-ready` en ARCHITECTURE.md)
- Mundo visual: paredes de arenisca, agua azul, césped/tierra vivos,
  árboles y flores decorativos - todo en paleta de colores saturada
- Personaje jugable con sprite recoloreado (paleta azul/dorado, con
  transparencia real, ya no magenta)
- Movimiento por teclado (flechas/WASD) - CONFIRMADO independiente del
  joystick (ver bug abierto abajo)
- Combate de dos vías: 3 slimes en la Plaza Central del templo, el
  jugador los ataca (botón ⚔️), ellos contraatacan si están cerca,
  barras de vida, muerte/respawn de ambos lados
- Chat en tiempo real (Enter o botón Send)
- Curación con cooldown (botón H)
- Cámara con límites correctos (ya no muestra vacío negro fuera del
  mapa - fix reciente, commit `6ece564`)

## 5. BUG DEL JOYSTICK - RESUELTO (commit pendiente de verificar en vivo)

**Síntoma que teníamos:** la consola del navegador mostraba repetidamente:
```
rexVirtualJoystickPlugin no disponible - solo funcionará el teclado.
```

**Causa raíz encontrada:** `rexvirtualjoystickplugin` extiende
`Phaser.Plugins.BasePlugin`, NO `Phaser.Plugins.ScenePlugin` (confirmado
en el `.d.ts` oficial del paquete `phaser3-rex-plugins` y en la
documentación oficial de rexrainbow.github.io/phaser3-rex-notes). Los
plugins tipo `BasePlugin` deben registrarse en `plugins.global` en la
config de Phaser.Game - el bucket `plugins.scene` es exclusivamente para
`ScenePlugin` reales (como `rexUI`, que sí usa `mapping`). El código
tenía el plugin registrado bajo `scene:` con `mapping`, que es el
patrón equivocado para este tipo de plugin - por eso
`this.plugins.get('rexVirtualJoystickPlugin')` devolvía siempre
`undefined` pese a que el archivo vendor cargaba bien y el nombre
global `window.rexvirtualjoystickplugin` era correcto (todas las
verificaciones previas de la sesión anterior seguían siendo válidas,
solo faltaba esta pieza).

**Fix aplicado en `client/src/game.js`:**
```js
plugins: {
    global: [{
        key: 'rexVirtualJoystickPlugin',
        plugin: window.rexvirtualjoystickplugin,
        start: true
    }]
}
```
(antes estaba `scene: [{ key: ..., plugin: ..., mapping: 'rexVirtualJoystick' }]`)

`client/src/scenes/UIScene.js` NO necesitó cambios - ya usaba el patrón
correcto `this.plugins.get(key).add(this, {...})`, que es exactamente
el que documenta rexrainbow para plugins globales.

**Cómo se diagnosticó:** sin poder correr un navegador real (Puppeteer
sigue bloqueado en el sandbox, ver nota abajo), se comparó el código
directamente contra la documentación oficial y el `.d.ts` del paquete,
encontrando la discrepancia scene vs. global.

**Pendiente de verificar:** el fix se validó con `node -c` (sintaxis) y
razonamiento contra la documentación oficial, pero NO se pudo confirmar
en un navegador real corriendo (Puppeteer bloqueado por red
restringida del sandbox - error 403 en `storage.googleapis.com` al
descargar Chrome headless). **Después de este push, pedirle al usuario
que pruebe en el cliente en vivo (Ctrl+Shift+R) y confirme que ya NO
aparece el warning en consola y que el joystick es visible/funcional en
móvil o simulando touch en desktop (F12 → toggle device toolbar).**
Si el warning persiste, revisar si `start: true` necesita además algo
en el orden de arranque, o probar cargando el plugin vía
`this.load.plugin(...)` en `BootScene.js` en vez de vía config
(alternativa documentada oficialmente, sección "Load minify file").

## 6. Estructura de archivos (resumen rápido, ver ARCHITECTURE.md para detalle)

```
index.html                        UI de login/chat/HUD + carga de scripts
client/vendor/                    Phaser, Colyseus.js, plugin joystick (auto-hospedados)
client/src/config.js              Constantes compartidas (rutas, IDs, mapeo de tiles)
client/src/scenes/BootScene.js    Precarga con barra de progreso real
client/src/scenes/UIScene.js      Joystick táctil (el que tiene el bug abierto)
client/src/scenes/GameScene.js    Conexión, render, movimiento, combate, chat
client/src/game.js                Config final de Phaser.Game + arranque
client/assets/sprites/            Arte del juego
  ├── tiles_nuevo_v2_vivo.png       Spritesheet de suelo (pasto/piso/pared/agua)
  ├── hero_v1.png                    Sprite del jugador (paleta viva)
  ├── nature_biomas/{bioma}/         100 sprites x 4 biomas (pradera/bosque/sabana/jungla)
  └── monsters/                      Sprites de slimes (generados por código)
server/index.ts                   Bootstrap: Express + Colyseus, nada más
server/src/schema.ts              Player, Monster, TileStack, GameState
server/src/mapData.ts             Diseño del mapa "Temple City" + spawns
server/src/balance.ts             Constantes de combate (daño, rangos, cooldowns)
server/src/MundoMythicaRoom.ts    Toda la lógica de la sala/juego
```

## 7. Contexto de decisiones importantes (para no deshacerlas sin querer)

- **Arte generado por código, no packs externos:** se decidió esto tras
  fricción real descargando/verificando packs de itch.io. Paredes, agua,
  y monstruos son generados con Python/PIL, no arte "de mano". Si se
  quiere mejorar el arte, lo más consistente es seguir generando con
  este mismo método (documentado en el historial de conversación
  anterior, no en el repo) o reemplazar deliberadamente con arte hecho a
  mano, pero no mezclar fuentes sin cuidado (eso fue el problema
  original del proyecto con el pack OTSP).
- **Rango de ataque del jugador = 50px, deliberadamente ajustado** para
  que sea apenas mayor al rango de contraataque de los monstruos (40px)
  y evitar "kiting" gratuito. Este valor vive en
  `server/src/balance.ts` (`PLAYER_ATTACK_RANGE_PX`) Y en
  `client/src/scenes/GameScene.js` (`attackNearestMonster`) - si se
  cambia, cambiar en AMBOS lugares (hay comentarios cruzados marcando
  esto en el código).
- **No hay bundler (webpack) todavía**, a propósito - existe
  `webpack.config.js` en el repo pero nunca se conectó. Se decidió no
  agregar esa complejidad ahora; el cliente son `<script>` planos en
  `client/src/`. Ver ARCHITECTURE.md sección correspondiente.
## 8. Sistemas de MMORPG agregados (persistencia, niveles, inventario)

Tras resolver el joystick, se sentaron bases reales de MMORPG que antes
NO existían (ver sección 9, "Qué falta" - esto cubre varios puntos de
esa lista):

**Persistencia de cuentas (MongoDB vía mongoose):**
- `server/src/db.ts`: conecta usando `MONGO_URI`. Si no está
  configurada o falla, el servidor sigue corriendo en "modo degradado"
  (sin persistencia, comportamiento efímero de antes) en vez de
  caerse - se decidió así a propósito.
- `server/src/models/Account.ts`: esquema de Mongo (nombre único,
  passwordHash+salt, level, xp, maxHp, x/y, inventory).
- `server/src/auth.ts`: hash de contraseñas con `scrypt` nativo de
  Node (sin agregar bcrypt como dependencia nueva).
- `onJoin` en `MundoMythicaRoom.ts` ahora es async: valida
  nombre+contraseña contra Mongo (crea cuenta nueva si no existe,
  rechaza el join con un error legible si la contraseña no coincide),
  y carga level/xp/maxHp/posición/inventario guardados.
- `onLeave` guarda el estado actual a Mongo. Además hay un autosave
  cada 60s (`AUTOSAVE_INTERVAL_MS` en la sala) como red de seguridad.
- El cliente ahora pide contraseña en el login (`index.html`,
  `#char-pass`) y la manda en `start-game` → `userData.password`.

**Sistema de niveles/XP:**
- `server/src/balance.ts`: `xpForLevel()` (curva lineal, 100×nivel),
  `HP_PER_LEVEL`, `MONSTER_XP_REWARD` por tipo de monstruo.
- Al morir un monstruo, el jugador que dio el golpe final gana XP
  (`awardXP` en la sala), sube de nivel automáticamente (incluso
  varios niveles de golpe si la XP alcanza), gana `HP_PER_LEVEL` de
  vida máxima y se cura del todo al subir.
- HUD nuevo en `index.html`/`GameScene.js`: `#hud-level` muestra
  "Nv. X   XP Y/Z" en la esquina del header, actualizado en tiempo
  real vía `Player.onChange`.

**Inventario básico:**
- `schema.ts`: `InventoryItem` (itemId, nombre, qty) y
  `Player.inventory` (ArraySchema).
- `balance.ts`: `ITEM_DROP_CHANCE`, `ITEM_DROP_TABLE` (genérica por
  ahora), `INVENTORY_MAX_SLOTS`.
- Al morir un monstruo hay una tirada de drop (`rollItemDrop`); si el
  jugador ya tiene ese item se apila (`qty++`), si no ocupa un slot
  nuevo (hasta el máximo).
- Panel "EQUIPO" del sidebar (`index.html`) ahora tiene 4 slots con
  ID (`inv-slot-0..3`) que se renderizan desde el inventario real del
  jugador (`GameScene.js` → `renderInventory`), con listeners tanto en
  altas/bajas del array (`onAdd`/`onRemove`) como en cambios de
  cantidad de un item ya existente (`item.onChange`).

**IMPORTANTE - pendiente de verificar en vivo:**
No fue posible probar la conexión real a MongoDB Atlas desde el
sandbox (el dominio `*.mongodb.net` no está en la lista de red
permitida de las herramientas, igual que pasa con `render.com` - ver
sección 2). Lo que SÍ se verificó:
- `npx tsc --noEmit` sin errores nuevos (solo los warnings de
  deprecación de `tsconfig.json` que ya existían antes).
- `npm install && timeout 5 npx ts-node --transpile-only server/index.ts`
  arranca limpio en modo degradado (sin `MONGO_URI`), llega a "ONLINE"
  y muestra el warning correcto de "sin persistencia".
- Sintaxis de todos los archivos `.js` del cliente tocados
  (`node -c`).

**Falta que el usuario confirme, con `MONGO_URI` real configurada en
Render:**
1. Que un jugador nuevo pueda registrarse (nombre+contraseña) y que la
   cuenta aparezca en MongoDB Atlas.
2. Que cerrar el navegador y volver a entrar con el mismo
   nombre/contraseña restaure nivel, XP, posición e inventario.
3. Que subir de nivel y recibir un drop se vean reflejados en el HUD y
   en el panel EQUIPO en tiempo real.
4. Si la `MONGO_URI` que ya estaba expuesta en el repo (ver sección 2)
   nunca se rotó, sigue siendo buena idea rotarla ahora que hay datos
   reales de cuentas de por medio.

## 9. Qué falta ahora (actualizado)

- Sistema de razas/clases (el GDD original menciona 6 razas, 6 clases)
  - el campo `role: 'knight'` ya se manda desde el login pero el
    servidor todavía no lo usa para nada.
- Usar/equipar items del inventario (hoy solo se acumulan, no hacen
  nada al usarlos).
- Drops específicos por tipo de monstruo (hoy la tabla de drops es
  genérica, no varía si matas un slime verde o uno rojo).
- Más de un mapa (sigue igual, todo hardcodeado en `mapData.ts`).
- Curva de XP más interesante que lineal (fácil de cambiar,
  `xpForLevel()` en `balance.ts` es la única fuente de verdad).
- Más tipos de monstruos con arte propio (hoy solo 2 variantes de slime).
- Arreglar el joystick táctil - aplicado el fix, pendiente de
  verificación real en navegador (ver sección 5).

