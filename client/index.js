import Phaser from "phaser";
import * as Colyseus from "colyseus.js";

// =============================================================================
// MOTOR CLIENTE MYTHICA - VERSIÓN "LEGENDARY" (LOGIN + CLASSES + GRID)
// =============================================================================
class MythicaClient extends Phaser.Scene {
    constructor() {
        super("MythicaClient");
        
        // --- RED ---
        this.client = new Colyseus.Client("wss://mythica-adventure.onrender.com");
        this.room = null;
        
        // --- DATA JUGADOR ---
        this.player = null;
        this.otherPlayers = {};
        this.tileSprites = [];
        this.userData = { name: "Guest", role: "knight" }; // Datos temporales
        
        // --- INPUTS ---
        this.joystick = null;
        this.cursorKeys = null;
        this.isGameActive = false; // Bloqueo hasta loguearse
        
        // --- LÓGICA TIBIA ---
        this.isMoving = false;
        this.tileSize = 32;
        this.moveSpeed = 250; 
    }

    preload() {
        // Plugin Joystick
        if (!this.plugins.get('rexVirtualJoystick')) {
            this.load.plugin('rexvirtualjoystickplugin', 'https://raw.githubusercontent.com/rexrainbow/phaser3-rex-notes/master/dist/rexvirtualjoystickplugin.min.js', true);
        }

        // Assets
        this.load.spritesheet('world-tiles', 'client/assets/tileset.png', { frameWidth: 32, frameHeight: 32 });
        this.load.spritesheet('player', 'client/assets/player.png', { frameWidth: 64, frameHeight: 64 }); 
        this.load.image('pixel', 'https://labs.phaser.io/assets/sprites/white_pixel.png');
    }

    create() {
        // 1. INICIALIZAR PERO NO CONECTAR AÚN
        console.log("Motor Gráfico Listo. Esperando Login...");
        this.createProceduralGround(); // Fondo visible detrás del login
        
        // 2. ESCUCHAR EVENTO DE LOGIN (Desde HTML)
        window.addEventListener('start-game', (e) => {
            console.log("Datos de Creación recibidos:", e.detail);
            this.userData = e.detail;
            this.startGameSequence();
        });

        // 3. CONFIGURAR INPUTS (Pero desactivados visualmente)
        this.initializeInputs();
        this.initializeUIListener();
        
        // Ocultar Joystick hasta entrar al juego
        this.joystick.setVisible(false);
    }

    // --- SECUENCIA DE INICIO (AL DARLE A 'CREAR PERSONAJE') ---
    async startGameSequence() {
        this.isGameActive = true;
        this.joystick.setVisible(true); // Mostrar Joystick

        // Feedback de carga
        const loadingText = this.add.text(window.innerWidth/2, window.innerHeight/2, "INVOCANDO HÉROE...", {
            fontSize: '20px', color: '#ffd700', backgroundColor: '#000000aa'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(3000);

        try {
            // CONEXIÓN CON DATOS DE CLASE
            this.room = await this.client.joinOrCreate("mundo_mythica", { 
                name: this.userData.name,
                role: this.userData.role, // Enviamos si es Knight, Mage, etc.
                device: "Mobile"
            });

            loadingText.destroy();
            console.log("¡Conectado al servidor!", this.room.sessionId);
            
            // INICIAR SISTEMAS
            this.initializeMapRenderer();
            this.initializePlayerSync();
            this.setupAntiCheat();

        } catch (error) {
            console.error(error);
            loadingText.setText("ERROR DE CONEXIÓN");
            loadingText.setColor('#ff0000');
        }
    }

    // --- SISTEMAS DE JUEGO ---

    createProceduralGround() {
        // Tablero de ajedrez verde infinito
        const mapW = 60; const mapH = 60;
        for(let x = 0; x < mapW; x++) {
            for(let y = 0; y < mapH; y++) {
                const color = (x + y) % 2 === 0 ? 0x003300 : 0x004400; 
                this.add.rectangle(x * 32, y * 32, 32, 32, color).setOrigin(0).setDepth(-1);
            }
        }
    }

    initializeMapRenderer() {
        if(!this.room) return;
        this.room.state.map.onAdd((tileID, index) => {
            const x = (index % this.room.state.width) * 32;
            const y = Math.floor(index / this.room.state.width) * 32;
            if (this.textures.exists('world-tiles')) {
                const tile = this.add.image(x, y, 'world-tiles', tileID).setOrigin(0).setDepth(0);
                this.tileSprites[index] = tile;
            }
        });
        this.room.state.map.onChange((tileID, index) => {
            if(this.tileSprites[index]) this.tileSprites[index].setFrame(tileID);
        });
    }

    initializePlayerSync() {
        // Animaciones
        if (this.textures.exists('player') && !this.anims.exists('walk_down')) {
            this.anims.create({
                key: 'walk_down',
                frames: this.anims.generateFrameNumbers('player', { start: 0, end: 3 }),
                frameRate: 8, repeat: -1
            });
        }

        this.room.state.players.onAdd((playerState, sessionId) => {
            const isMe = (sessionId === this.room.sessionId);
            let entity;

            if (this.textures.exists('player')) {
                entity = this.add.sprite(playerState.x, playerState.y, 'player');
                entity.setDisplaySize(32, 32);
            } else {
                entity = this.add.rectangle(playerState.x, playerState.y, 28, 28, isMe ? 0x00ff00 : 0xff0000);
            }
            entity.setDepth(10);

            if (isMe) {
                this.player = entity;
                // Cámara MMORPG
                this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
                this.cameras.main.setZoom(1.8);
                
                // Aplicar stats visuales según clase (Solo visual local por ahora)
                this.applyClassVisuals(this.userData.role);

                // Sincronizar UI HTML
                playerState.onChange(() => {
                    this.updateHUD(playerState.hp);
                });
            } else {
                this.otherPlayers[sessionId] = entity;
                if(entity.setTint) entity.setTint(0xffaaaa);
                
                // Interpolación
                playerState.onChange(() => {
                    this.tweens.add({
                        targets: entity, x: playerState.x, y: playerState.y,
                        duration: this.moveSpeed, ease: 'Linear'
                    });
                });
            }
        });

        this.room.state.players.onRemove((p, sessionId) => {
            if(this.otherPlayers[sessionId]) {
                this.otherPlayers[sessionId].destroy();
                delete this.otherPlayers[sessionId];
            }
        });
    }

    applyClassVisuals(role) {
        // Ajustes visuales según clase
        const hpText = document.getElementById('hp-text');
        const mpText = document.getElementById('mp-text');
        
        if(role === 'knight') {
            hpText.innerText = "150/150"; mpText.innerText = "30/30";
            this.moveSpeed = 260; // Knight es pesado/lento
        } else if(role === 'mage') {
            hpText.innerText = "80/80"; mpText.innerText = "200/200";
        } else if(role === 'healer') {
            // Healer brilla un poco
            this.player.setTint(0xffffcc);
        }
    }

    updateHUD(hp) {
        const hpBar = document.getElementById('hp-bar');
        const hpText = document.getElementById('hp-text');
        if (hpBar) {
            hpBar.style.width = Math.max(0, hp) + '%';
            hpText.innerText = Math.floor(hp) + '%';
        }
    }

    initializeInputs() {
        this.joystick = this.plugins.get('rexvirtualjoystickplugin').add(this, {
            x: 80, y: window.innerHeight - 100,
            radius: 60,
            base: this.add.circle(0, 0, 60, 0x888888, 0.3).setStrokeStyle(2, 0xffffff),
            thumb: this.add.circle(0, 0, 30, 0xcccccc, 0.8),
            dir: '4dir',
            forceMin: 16
        });
        this.joystick.base.setScrollFactor(0).setDepth(2000);
        this.joystick.thumb.setScrollFactor(0).setDepth(2001);

        this.cursorKeys = this.input.keyboard.createCursorKeys();
    }

    initializeUIListener() {
        window.addEventListener('game-action', (e) => {
            if (!this.room || !this.player) return;
            const action = e.detail;
            
            // Lógica de ataque
            if (action === 'ATTACK') {
                this.room.send("attack");
                this.tweens.add({ targets: this.player, scale: 1.2, duration: 50, yoyo: true });
            }
            // Lógica de Hechizos
            if (action === 'SPELL_1' || action === 'HEAL') {
                // Aquí podrías validar maná antes de enviar
                this.room.send("use_spell", { id: action });
                // Efecto visual
                const fx = this.add.circle(this.player.x, this.player.y, 30, 0x00ffff, 0.5);
                this.tweens.add({ targets: fx, alpha: 0, scale: 1.5, duration: 300, onComplete:()=>fx.destroy() });
            }
        });
    }

    setupAntiCheat() {
        this.room.onMessage("corregir_posicion", (pos) => {
            if (this.player) {
                this.tweens.add({
                    targets: this.player, x: pos.x, y: pos.y, duration: 100,
                    onComplete: () => { this.isMoving = false; }
                });
            }
        });
    }

    update() {
        if (!this.player || !this.isGameActive) return;

        // GRID MOVEMENT
        if (!this.isMoving) {
            const joyCursor = this.joystick.createCursorKeys();
            let dx = 0; let dy = 0;

            if (joyCursor.right.isDown || this.cursorKeys.right.isDown) dx = 1;
            else if (joyCursor.left.isDown || this.cursorKeys.left.isDown) dx = -1;
            else if (joyCursor.down.isDown || this.cursorKeys.down.isDown) dy = 1;
            else if (joyCursor.up.isDown || this.cursorKeys.up.isDown) dy = -1;

            if (dx !== 0 || dy !== 0) {
                this.executeGridStep(dx, dy);
            } else {
                if (this.player.anims && this.player.anims.isPlaying) this.player.stop();
            }
        }
    }

    executeGridStep(dx, dy) {
        this.isMoving = true;
        const targetX = this.player.x + (dx * this.tileSize);
        const targetY = this.player.y + (dy * this.tileSize);

        if (dx < 0) this.player.setFlipX(true);
        if (dx > 0) this.player.setFlipX(false);
        if (this.player.play && this.anims.exists('walk_down')) this.player.play('walk_down', true);

        // Movimiento local (Predicción)
        this.tweens.add({
            targets: this.player, x: targetX, y: targetY,
            duration: this.moveSpeed, ease: 'Linear',
            onComplete: () => { this.isMoving = false; }
        });

        // Enviar al servidor
        if (this.room) this.room.send("mover", { x: targetX, y: targetY });
    }
}

const config = {
    type: Phaser.AUTO,
    backgroundColor: '#000000', // Negro puro para el login
    parent: 'game-container',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: window.innerWidth, height: window.innerHeight },
    render: { pixelArt: true, antialias: false, roundPixels: true },
    scene: MythicaClient
};

const game = new Phaser.Game(config);
window.addEventListener('resize', () => game.scale.resize(window.innerWidth, window.innerHeight));
                        
