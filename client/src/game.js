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

    // FIX: el plugin se cargaba via <script> pero NUNCA se registraba en
    // Phaser - this.plugins.get('rexVirtualJoystickPlugin') devolvía
    // siempre null/undefined, así que this.joystick jamás se creaba y
    // getCursorKeys() siempre devolvía null. El movimiento nunca funcionó
    // hasta que se detectó y corrigió este registro faltante. El nombre
    // global exacto que expone el archivo vendor es
    // 'rexvirtualjoystickplugin' (minúsculas, confirmado inspeccionando
    // el UMD export del propio archivo).
    plugins: {
        scene: [{
            key: 'rexVirtualJoystickPlugin',
            plugin: window.rexvirtualjoystickplugin,
            mapping: 'rexVirtualJoystick'
        }]
    }
};

const game = new Phaser.Game(config);
