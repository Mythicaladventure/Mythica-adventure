/* ============================================================
 * UI SCENE: joystick virtual táctil. Ver game.js para el registro
 * del plugin rexVirtualJoystickPlugin en la config de Phaser
 * (plugins.global, no plugins.scene - es un BasePlugin). Sin ese
 * registro correcto, this.plugins.get(...) siempre devuelve
 * undefined y el joystick nunca se crea (bug real que tuvimos y
 * corregimos - ver HANDOFF.md sección 5 para el diagnóstico completo).
 * ============================================================ */
class UIScene extends Phaser.Scene {
    constructor() { super({ key: 'UIScene', active: true }); }

    create() {
        if (this.plugins.get('rexVirtualJoystickPlugin')) {
            this.joystick = this.plugins.get('rexVirtualJoystickPlugin').add(this, {
                x: 120, y: this.scale.height - 120, radius: 60,
                base: this.add.circle(0, 0, 60, 0x000, 0.2).setStrokeStyle(2, 0xffffff),
                thumb: this.add.circle(0, 0, 30, 0xffffff, 0.5),
                dir: '8dir', forceMin: 16
            });
            this.scale.on('resize', (s) => this.joystick.setPosition(120, s.height - 120));
        } else {
            console.warn('rexVirtualJoystickPlugin no disponible - solo funcionará el teclado.');
        }
    }

    getCursorKeys() { return this.joystick ? this.joystick.createCursorKeys() : null; }
}
