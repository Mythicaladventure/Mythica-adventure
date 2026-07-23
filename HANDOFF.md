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

## 5. BUG ABIERTO - sin resolver, este es el estado exacto donde quedamos

**Síntoma:** la consola del navegador muestra repetidamente:
```
rexVirtualJoystickPlugin no disponible - solo funcionará el teclado.
```
Este es un `console.warn` que nosotros mismos agregamos en
`client/src/scenes/UIScene.js` cuando `this.plugins.get('rexVirtualJoystickPlugin')`
devuelve falsy. El registro del plugin está en `client/src/game.js`:

```js
plugins: {
    scene: [{
        key: 'rexVirtualJoystickPlugin',
        plugin: window.rexvirtualjoystickplugin,
        mapping: 'rexVirtualJoystick'
    }]
}
```

**Lo que YA se verificó y descartó como causa:**
- El archivo `client/vendor/rexvirtualjoystickplugin.min.js` SÍ está
  correctamente publicado en GitHub (13965 bytes, idéntico local vs
  remoto, contenido correcto confirmado byte a byte vía
  `raw.githubusercontent.com`).
- El orden de los `<script>` en `index.html` es correcto (vendor libs
  ANTES de `client/src/*`, confirmado en el HTML publicado).
- El nombre global exportado por el UMD del archivo vendor es
  `rexvirtualjoystickplugin` (todo minúsculas) - confirmado inspeccionando
  el propio archivo: `(t=...).rexvirtualjoystickplugin=e()`.

**Lo que NO se pudo verificar:** no se logró instalar Puppeteer en el
sandbox (descarga de Chrome headless bloqueada por la red restringida
del entorno - error 403 en `storage.googleapis.com`), así que no se pudo
correr un navegador real controlado por código para ver el estado
EXACTO de `window.rexvirtualjoystickplugin` en tiempo de ejecución.

**Impacto real:** BAJO. El teclado (flechas/WASD) funciona de forma
independiente y confirmada - el juego es jugable sin el joystick. Esto
solo afecta la UX en dispositivos móviles/táctiles (sin joystick
visible, no hay forma de moverse en celular). Arreglar esto es
importante antes de anunciar el juego como "listo para móvil", pero no
bloquea seguir desarrollando en escritorio.

**Próximos pasos sugeridos para atacarlo:**
1. Pedirle al usuario que en la consola del navegador (F12 → Console)
   escriba directamente `typeof window.rexvirtualjoystickplugin` y
   `window.rexvirtualjoystickplugin` (Enter) DESPUÉS de que cargue la
   página, y mande captura del resultado - esto dice de una vez si el
   problema es que la variable global nunca existe, o si existe pero
   Phaser no la está aceptando en el `plugins.scene` config.
2. Si la variable SÍ existe: revisar la versión exacta de la API de
   `phaser3-rex-plugins` 1.1.84 - es posible que el patrón de
   registro correcto sea distinto (algunas versiones de plugins rex
   esperan `plugin: window.rexvirtualjoystickplugin.default` si el
   UMD envuelve un default export, o directamente instanciarlo distinto).
   Revisar la documentación oficial: https://rexrainbow.github.io/phaser3-rex-notes/docs/site/virtualjoystick/
3. Si la variable NO existe: puede ser un problema de timing real (poco
   probable dado que son `<script>` bloqueantes en orden, pero
   verificable agregando un `console.log(typeof window.rexvirtualjoystickplugin)`
   justo al inicio de `client/src/game.js`, antes de construir `config`).
4. Alternativa pragmática si esto sigue sin resolverse rápido: dejar el
   joystick como "mejora futura" y enfocar el desarrollo en
   funcionalidades de escritorio/teclado, ya que el juego es completamente
   jugable sin él.

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

## 7. Qué falta (fuera del alcance hasta ahora, según el GDD original)

- Sistema de razas/clases (el GDD original menciona 6 razas, 6 clases)
- Inventario / items reales
- Más de un mapa (todo vive hardcodeado en `mapData.ts` para un solo
  mapa de prueba, "Temple City")
- Persistencia de cuenta real (hoy solo se pide un nombre, sin
  contraseña ni guardado entre sesiones - mongoose instalado pero sin usar)
- Niveles / experiencia
- Más tipos de monstruos con arte propio (hoy solo 2 variantes de slime)
- Arreglar el joystick táctil (bug abierto, sección 5)

## 8. Contexto de decisiones importantes (para no deshacerlas sin querer)

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
