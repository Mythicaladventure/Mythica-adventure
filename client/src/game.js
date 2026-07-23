/* ============================================================
 * GAME.JS - Configuración final de Phaser.Game e instanciación.
 * Debe cargarse DESPUÉS de config.js y las 3 escenas (BootScene,
 * UIScene, GameScene) - ver el orden de <script> en index.html.
 * ============================================================ */
const config = {
    type: Phaser.AUTO,
    parent: 'game-view',
    backgroundColor: '#000',
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { pixelArt: true, roundPixels: true },
    scene: [BootScene, UIScene, GameScene],

    // FIX (root cause encontrada leyendo la documentación oficial y el
    // .d.ts del paquete phaser3-rex-plugins): rexvirtualjoystickplugin
    // extiende Phaser.Plugins.BasePlugin, NO Phaser.Plugins.ScenePlugin.
    // Los BasePlugin se registran en `plugins.global`, no en
    // `plugins.scene` (ese bucket es solo para ScenePlugin reales, como
    // rexUI). Estaba registrado bajo `scene:` con `mapping`, que es el
    // patrón correcto para OTRO tipo de plugin - por eso
    // this.plugins.get('rexVirtualJoystickPlugin') devolvía siempre
    // undefined pese a que el script cargaba bien y el nombre global
    // 'rexvirtualjoystickplugin' era correcto. Con `global:` + `start:
    // true`, this.plugins.get(key) sí lo encuentra y .add(scene, config)
    // funciona como documenta rexrainbow.github.io/phaser3-rex-notes.
    plugins: {
        global: [{
            key: 'rexVirtualJoystickPlugin',
            plugin: window.rexvirtualjoystickplugin,
            start: true
        }]
    }
};

const game = new Phaser.Game(config);
