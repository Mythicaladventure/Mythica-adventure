import Phaser from "phaser";
import * as Colyseus from "colyseus.js";

// =============================================================================
// MOTOR CLIENTE MYTHICA - VERSIÓN "ULTIMATE" (NON-BLOCKING IO + GRID + UI)
// =============================================================================
class MythicaClient extends Phaser.Scene {
    constructor() {
        super("MythicaClient");
        
        // --- SISTEMA DE RED ---
        this.client = new Colyseus.Client("wss://mythica-adventure.onrender.com");
        this.room = null;
        
        // --- ENTIDADES ---
        this.player = null;       // Mi avatar local
        this.otherPlayers = {};   // Mapa de otros jugadores
        this.tileSprites = [];    // Cache visual del mapa
        
        // --- INPUT & UI ---
        this.joystick = null;     
        this.cursorKeys = null;   
        this.statusText = null;   // HUD de estado de conexión
        
        // --- LÓGICA TIBIA (GRID MOVEMENT) ---
        this.isMoving = false;    
        this.tileSize = 32;       
        this.moveSpeed = 250;     
    }

    // 1. CARGA DE RECURSOS
    preload() {
        // Plugin Joystick
        if (!this.plugins.get('rexVirtualJoystick')) {
            this.load.plugin('rexvirtualjoystickplugin', 'https://raw.githubusercontent.com/rexrainbow/phaser3-rex-notes/master/dist/rexvirtualjoystickplugin.min.js', true);
        }

        // Assets Visuales
        this.load.spritesheet('world-tiles', 'client/assets/tileset.png', { frameWidth: 32, frameHeight: 32 });
        this.load.spritesheet('player', 'client/assets/player.png', { frameWidth: 64, frameHeight: 64 }); 
        this.load.image('pixel', 'https://labs.phaser.io/assets/sprites/white_pixel.png');
    }

    // 2. INICIALIZACIÓN (ARQUITECTURA NO BLOQUEANTE)
    create() {
        // PASO A: Renderizar lo visual INMEDIATAMENTE (Sin esperar internet)
        console.log("Inicializando motor gráfico...");
        
        this.createProceduralGround(); // Suelo base
        this.initializeInputs();       // Joystick
        this.initializeUIListener();   // Botones HTML
        
        // PASO B: Mostrar estado de carga (Feedback al usuario)
        this.statusText = this.add.text(window.innerWidth / 2, window.innerHeight / 2, "INICIANDO ENLACE...", {
            fontFamily: 'monospace',
            fontSize: '18px',
            color: '#00ff00',
            backgroundColor: '#000000aa',
            padding: { x: 10, y: 5 }
        }).setOrigin(0.5).setDepth(2000).setScrollFactor(0);

        // PASO C: Iniciar conexión en segundo plano
        this.connectToGameServer();
    }

    // 3. LÓGICA DE CONEXIÓN ASÍNCRONA (EL SECRETO DE LA POTENCIA)
    async connectToGameServer() {
        try {
            this.statusText.setText("CONECTANDO AL SERVIDOR...\n(Esto puede tardar 30s si está despertando)");
            
            // Aquí ocurre la magia: Esperamos la conexión pero el juego YA se dibujó
            this.room = await this.client.joinOrCreate("mundo_mythica", { 
                name: "MobileHero",
                device: "Android"
            });
            
            console.log("¡Conexión exitosa! ID:", this.room.sessionId);
            this.statusText.setText("¡CONECTADO!");
            this.statusText.setColor('#00ffff');
            
            // Efecto de desvanecimiento del texto
            this.tweens.add({
                targets: this.statusText,
                alpha: 0,
                duration: 1000,
                delay: 500,
                onComplete: () => this.statusText.destroy()
            });

            // PASO D: Inicializar sistemas que dependen del servidor
            this.initializeMapRenderer();
            this.initializePlayerSync();
            this.setupAntiCheat();

        } catch (error) {
            console.error("Error de conexión:", error);
            this.statusText.setText("ERROR DE CONEXIÓN.\nRevisa tu internet o intenta de nuevo.");
            this.statusText.setColor('#ff0000');
        }
    }

    // --- SUB-SISTEMAS ROBUSTOS ---

    createProceduralGround() {
        // Genera suelo infinito visual para que no se vea negro
        const mapW = 50; const mapH = 50;
        for(let x = 0; x < mapW; x++) {
            for(let y = 0; y < mapH; y++) {
                const color = (x + y) % 2 === 0 ? 0x004400 : 0x005500; 
                this.add.rectangle(x * this.tileSize, y * this.tileSize, this.tileSize, this.tileSize, color)
                    .setOrigin(0).setDepth(-1);
            }
        }
    }

    initializeMapRenderer() {
        if (!this.room) return;
        
        this.room.state.map.onAdd((tileID, index) => {
            const x = (index % this.room.state.width) * this.tileSize;
            const y = Math.floor(index / this.room.state.width) * this.tileSize;
            
            if (this.textures.exists('world-tiles')) {
                const tile = this.add.image(x, y, 'world-tiles', tileID).setOrigin(0);
                tile.setDepth(0); 
                this.tileSprites[index] = tile;
            }
        });

        this.room.state.map.onChange((tileID, index) => {
            if (this.tileSprites[index]) this.tileSprites[index].setFrame(tileID);
        });
    }

    initializePlayerSync() {
        // Crear animaciones si existen
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

            // Factory: Sprite o Geometría
            if (this.textures.exists('player')) {
                entity = this.add.sprite(playerState.x, playerState.y, 'player');
                entity.setDisplaySize(this.tileSize, this.tileSize);
            } else {
                entity = this.add.rectangle(playerState.x, playerState.y, 28, 28, isMe ? 0x00ff00 : 0xff0000);
            }
            entity.setDepth(10);

            if (isMe) {
                this.player = entity;
                this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
                this.cameras.main.setZoom(1.8);

                // Sync UI Vida
                playerState.onChange(() => {
                    const hpBar = document.getElementById('hp-bar');
                    if (hpBar) hpBar.style.width = Math.max(0, playerState.hp) + '%';
                });
            } else {
                this.otherPlayers[sessionId] = entity;
                if(entity.setTint) entity.setTint(0xffaaaa);

                // Interpolación
                playerState.onChange(() => {
                    this.tweens.add({
                        targets: entity,
                        x: playerState.x, y: playerState.y,
                        duration: this.moveSpeed, ease: 'Linear'
                    });
                });
            }
        });

        this.room.state.players.onRemove((p, sessionId) => {
            if (this.otherPlayers[sessionId]) {
                this.otherPlayers[sessionId].destroy();
                delete this.otherPlayers[sessionId];
            }
        });
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
            if (!this.room || !this.player) return; // Protección si no ha conectado
            
            const action = e.detail;
            if (action === 'ATTACK') {
                this.room.send("attack");
                this.tweens.add({ targets: this.player, scale: 1.2, duration: 50, yoyo: true });
            }
            if (action === 'HEAL') {
                this.room.send("use_spell", { id: "exura" });
            }
        });
    }

    setupAntiCheat() {
        this.room.onMessage("corregir_posicion", (pos) => {
            if (this.player) {
                this.tweens.add({
                    targets: this.player,
                    x: pos.x, y: pos.y,
                    duration: 100,
                    onComplete: () => { this.isMoving = false; }
                });
            }
        });
    }

    // 4. BUCLE PRINCIPAL (GAME LOOP)
    update(time, delta) {
        // Si no hemos conectado o no tenemos jugador, no hacemos nada de lógica
        if (!this.player || !this.joystick) return;

        // LÓGICA GRID-BASED
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

        // Feedback visual inmediato
        if (dx < 0) this.player.setFlipX(true);
        if (dx > 0) this.player.setFlipX(false);
        if (this.player.play && this.anims.exists('walk_down')) this.player.play('walk_down', true);

        // Movimiento local (Predicción)
        this.tweens.add({
            targets: this.player,
            x: targetX, y: targetY,
            duration: this.moveSpeed,
            ease: 'Linear',
            onComplete: () => { this.isMoving = false; }
        });

        // Red
        if (this.room) this.room.send("mover", { x: targetX, y: targetY });
    }
}

// CONFIGURACIÓN FINAL
const config = {
    type: Phaser.AUTO,
    backgroundColor: '#001100', // Verde muy oscuro (Tech style)
    parent: 'game-container',
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: window.innerWidth,
        height: window.innerHeight
    },
    physics: { default: 'arcade', arcade: { debug: false } },
    render: { pixelArt: true, antialias: false, roundPixels: true },
    scene: MythicaClient
};

const game = new Phaser.Game(config);
window.addEventListener('resize', () => game.scale.resize(window.innerWidth, window.innerHeight));
            
