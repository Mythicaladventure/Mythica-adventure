/* =============================================================================
   ⚔️ CLIENTE v11.0 - ANIMACIONES, COLISIONES Y ATMÓSFERA
   =============================================================================
*/

// --- UI SCENE ---
class UIScene extends Phaser.Scene {
    constructor() { super({ key: 'UIScene', active: true }); }
    create() {
        if (this.plugins.get('rexVirtualJoystickPlugin')) {
            const joyX = 100; const joyY = this.scale.height - 100;
            this.joystick = this.plugins.get('rexVirtualJoystickPlugin').add(this, {
                x: joyX, y: joyY, radius: 50,
                base: this.add.circle(0,0,50,0x000000,0.4).setStrokeStyle(3, 0xffd700),
                thumb: this.add.circle(0,0,25,0xffd700,0.6),
                dir: '8dir', forceMin: 16
            });
            this.scale.on('resize', (s) => this.joystick.setPosition(100, s.height - 100));
        }
    }
    getCursorKeys() { return this.joystick ? this.joystick.createCursorKeys() : null; }
}

// --- GAME SCENE ---
class GameScene extends Phaser.Scene {
    constructor() { super({ key: 'GameScene' }); }

    init() {
        this.client = new Colyseus.Client("wss://mythica-adventure.onrender.com");
        this.room = null;
        this.players = {};
        this.mapChunks = new Set();
        this.mySessionId = null;
        
        // Capas visuales
        this.groups = { ground: null, walls: null, chars: null, lights: null };
    }

    preload() {
        const base = "https://mythicaladventure.github.io/Mythica-adventure/client/";
        this.load.spritesheet('tiles', base + 'assets/sprites/otsp_tiles_01.png', { frameWidth: 32, frameHeight: 32 });
        // Cargar spritesheet de personajes (Asumimos formato 3x4 o 4x4 frames)
        this.load.spritesheet('chars', base + 'assets/sprites/otsp_creatures_01.png', { frameWidth: 32, frameHeight: 32 });
    }

    async create() {
        // Inicializar Capas
        this.groups.ground = this.add.group();
        this.groups.walls = this.add.group();
        this.groups.chars = this.add.group(); // Sort Y activado después

        this.add.rectangle(0, 0, 4000, 4000, 0x000000).setOrigin(0).setDepth(-100);

        // Crear animaciones globales (Solo un ejemplo básico, ajusta los frames a tu PNG real)
        // Tibia suele usar: 0-3 Abajo, 4-7 Izq, etc. 
        // Como el placeholder es simple, haremos una simulación
        this.anims.create({ key: 'walk-down', frames: this.anims.generateFrameNumbers('chars', { start: 0, end: 3 }), frameRate: 8, repeat: -1 });
        this.anims.create({ key: 'walk-up', frames: this.anims.generateFrameNumbers('chars', { start: 12, end: 15 }), frameRate: 8, repeat: -1 });
        this.anims.create({ key: 'walk-left', frames: this.anims.generateFrameNumbers('chars', { start: 4, end: 7 }), frameRate: 8, repeat: -1 });
        this.anims.create({ key: 'walk-right', frames: this.anims.generateFrameNumbers('chars', { start: 8, end: 11 }), frameRate: 8, repeat: -1 });

        this.uiScene = this.scene.get('UIScene');
        window.addEventListener('start-game', (e) => this.connect(e.detail));
        
        // ATMÓSFERA: VIGNETTE (Sombra en los bordes)
        // Creamos una textura dinámica
        const shadowTexture = this.make.graphics().fillStyle(0x000000, 1).fillRect(0, 0, 2000, 2000);
        const mask = this.make.graphics().fillCircle(1000, 1000, 150); // Agujero de luz
        const rt = this.make.renderTexture({ x: 0, y: 0, width: 2000, height: 2000 }).setDepth(9000).setAlpha(0.6);
        rt.draw(shadowTexture);
        rt.erase(mask); // Borrar el centro
        this.lightLayer = rt;
    }

    async connect(userData) {
        try {
            this.room = await this.client.joinOrCreate("mundo_mythica", userData);
            this.mySessionId = this.room.sessionId;
            document.getElementById('login-screen').style.display = 'none';
            document.getElementById('game-ui').style.display = 'block';

            this.room.onMessage("map_chunk", (d) => d.forEach(t => this.renderStack(t.i, t.s)));
            this.room.state.players.onAdd((p, id) => this.addPlayer(p, id));
            this.room.state.players.onRemove((p, id) => this.removePlayer(id));
            this.room.state.players.forEach((p, id) => this.addPlayer(p, id));
            this.room.onMessage("combat_text", (d) => this.showDamage(d));
        } catch (e) { console.error(e); }
    }

    update() {
        if (!this.room || !this.players[this.mySessionId]) return;

        const me = this.players[this.mySessionId];
        const cursors = this.uiScene.getCursorKeys();

        // Mover la luz con el jugador
        if (this.lightLayer) {
            this.lightLayer.x = me.container.x - 1000;
            this.lightLayer.y = me.container.y - 1000;
        }

        if (cursors) {
            let dx = 0, dy = 0;
            let dir = 0; // 0:Down, 1:Left, 2:Right, 3:Up

            if (cursors.left.isDown) { dx = -1; dir = 1; }
            else if (cursors.right.isDown) { dx = 1; dir = 2; }
            
            if (cursors.up.isDown) { dy = -1; dir = 3; }
            else if (cursors.down.isDown) { dy = 1; dir = 0; }

            if (dx !== 0 || dy !== 0) {
                const speed = 3; // Velocidad de movimiento
                // Enviar intención de movimiento al servidor
                this.room.send("mover", { 
                    x: me.container.x + (dx * speed), 
                    y: me.container.y + (dy * speed),
                    dir: dir 
                });
            }
        }
    }

    renderStack(index, items) {
        if (this.mapChunks.has(index)) return;
        this.mapChunks.add(index);
        const x = (index % 60) * 32;
        const y = Math.floor(index / 60) * 32;

        items.forEach((id) => {
            let frame = 0, group = this.groups.ground, depth = 0;
            if (id === 1) { frame = 0; } // Pasto
            if (id === 3) { frame = 2; } // Piedra
            if (id === 2) { frame = 6; group = this.groups.walls; depth = y; } // Pared con profundidad

            const img = this.add.image(x, y, 'tiles', frame).setOrigin(0).setDepth(depth);
            // Sombreado leve a las paredes para dar volumen
            if(group === this.groups.walls) img.setTint(0xcccccc); 
        });
    }

    addPlayer(p, id) {
        if (this.players[id]) return;

        const container = this.add.container(p.x, p.y);
        container.setDepth(p.y + 10); // Profundidad dinámica

        const skin = p.skin || 7;
        const sprite = this.add.sprite(0, -12, 'chars', skin).setDisplaySize(48, 48);
        const nameBg = this.add.rectangle(0, -45, 60, 14, 0x000000, 0.5);
        const name = this.add.text(0, -45, p.nombre, { fontSize: '10px', color: '#fff' }).setOrigin(0.5);

        container.add([sprite, nameBg, name]);
        this.players[id] = { container, sprite };

        if (id === this.mySessionId) {
            this.cameras.main.startFollow(container, true, 0.1, 0.1); // Lerp suave
            this.cameras.main.setZoom(1.8);
            this.updateHUD(p);
        }

        p.onChange(() => {
            // Interpolación de posición
            this.tweens.add({ targets: container, x: p.x, y: p.y, duration: 100 });
            container.setDepth(p.y + 10);
            
            // ANIMACIONES BASADAS EN EL ESTADO
            if (p.isMoving) {
                // Seleccionar animación según dirección
                // Nota: Ajusta los nombres de anims según tus frames reales
                if (p.direction === 0) sprite.play('walk-down', true);
                else if (p.direction === 1) sprite.play('walk-left', true);
                else if (p.direction === 2) sprite.play('walk-right', true);
                else if (p.direction === 3) sprite.play('walk-up', true);
            } else {
                sprite.stop();
                // Frame estático según dirección (aprox)
                if (p.direction === 0) sprite.setFrame(skin);
            }

            if(id === this.mySessionId) this.updateHUD(p);
        });
    }

    removePlayer(id) { if (this.players[id]) { this.players[id].container.destroy(); delete this.players[id]; } }
    showDamage(d) {
        const t = this.add.text(d.x, d.y, d.val, { fontSize:'14px', color:'#f00', stroke:'#fff', strokeThickness:2 }).setOrigin(0.5).setDepth(9999);
        this.tweens.add({ targets:t, y:d.y-50, alpha:0, duration:800, onComplete:()=>t.destroy() });
    }
    updateHUD(p) { const hp = document.getElementById('hp-bar'); if(hp) hp.style.width = `${(p.hp/p.maxHp)*100}%`; }
}

const config = {
    type: Phaser.AUTO, backgroundColor: '#000', parent: 'game-container',
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { pixelArt: true, roundPixels: true },
    scene: [UIScene, GameScene]
};
const game = new Phaser.Game(config);
window.addEventListener('resize', () => game.scale.resize(window.innerWidth, window.innerHeight));
