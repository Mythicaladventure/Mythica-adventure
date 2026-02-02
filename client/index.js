import Phaser from "phaser";
import * as Colyseus from "colyseus.js";

// =============================================================================
// MOTOR CLIENTE MYTHICA - VERSIÓN "HEAVY DUTY" (GRID + UI + MULTIPLAYER)
// =============================================================================
class MythicaClient extends Phaser.Scene {
    constructor() {
        super("MythicaClient");
        
        // --- SISTEMA DE RED ---
        this.client = new Colyseus.Client("wss://mythica-adventure.onrender.com");
        this.room = null;
        
        // --- ENTIDADES ---
        this.player = null;       // Mi avatar local
        this.otherPlayers = {};   // Mapa de otros jugadores (SessionID -> Sprite)
        this.tileSprites = [];    // Cache visual del mapa (Optimización)
        
        // --- INPUT & UI ---
        this.joystick = null;     // Plugin RexVirtualJoystick
        this.cursorKeys = null;   // Teclado (Backup para PC)
        
        // --- LÓGICA TIBIA (GRID MOVEMENT) ---
        this.isMoving = false;    // Bloqueo de acción mientras camina
        this.tileSize = 32;       // Tamaño de la celda (Standard Tibia)
        this.moveSpeed = 250;     // Milisegundos por paso (Ritmo del juego)
        this.nextMove = null;     // Buffer de movimiento (Para fluidez)
    }

    // 1. CARGA DE RECURSOS (ROBUSTA CON FALLBACKS)
    preload() {
        // Plugin Joystick: Verificación de seguridad antes de cargar
        if (!this.plugins.get('rexVirtualJoystick')) {
            this.load.plugin('rexvirtualjoystickplugin', 'https://raw.githubusercontent.com/rexrainbow/phaser3-rex-notes/master/dist/rexvirtualjoystickplugin.min.js', true);
        }

        // Assets Visuales: Spritesheets configurados para animación
        // Asegúrate de que las imágenes existan en 'client/assets/'
        this.load.spritesheet('world-tiles', 'client/assets/tileset.png', { frameWidth: 32, frameHeight: 32 });
        this.load.spritesheet('player', 'client/assets/player.png', { frameWidth: 64, frameHeight: 64 }); 
        
        // Assets de Sistema (Debug/Fallback)
        this.load.image('pixel', 'https://labs.phaser.io/assets/sprites/white_pixel.png');
    }

    // 2. INICIALIZACIÓN DEL ENTORNO
    async create() {
        try {
            console.log("Inicializando Núcleo Mythica...");
            
            // A. CONEXIÓN AL SERVIDOR (Handshake)
            this.room = await this.client.joinOrCreate("mundo_mythica", { 
                name: "MobileHero",
                device: "Android",
                version: "1.0.0"
            });
            console.log("Conexión Establecida. ID de Sesión:", this.room.sessionId);

            // B. RENDERIZADO DEL MAPA (SISTEMA DE CAPAS)
            this.createProceduralGround(); // Capa 0: Suelo base (evita fondo negro)
            this.initializeMapRenderer();  // Capa 1: Objetos dinámicos del servidor

            // C. SISTEMA DE ANIMACIONES
            this.createAnimations();

            // D. GESTIÓN DE JUGADORES (MULTIPLAYER STATE)
            this.initializePlayerSync();

            // E. SISTEMA DE INPUT (HÍBRIDO: JOYSTICK + HTML UI)
            this.initializeInputs();
            this.initializeUIListener();

            // F. SISTEMA ANTI-CHEAT (CORRECCIÓN DE SERVIDOR)
            this.room.onMessage("corregir_posicion", (pos) => {
                if (this.player) {
                    console.warn("Corrección de servidor recibida:", pos);
                    // Forzamos la posición visual para coincidir con la lógica
                    this.tweens.add({
                        targets: this.player,
                        x: pos.x,
                        y: pos.y,
                        duration: 100,
                        onComplete: () => { this.isMoving = false; } // Desbloqueamos input
                    });
                }
            });

        } catch (error) {
            console.error("ERROR CRÍTICO DE CONEXIÓN:", error);
            this.add.text(10, 10, "ERROR: NO SE PUDO CONECTAR AL SERVIDOR", { color: '#ff0000', fontSize: '20px' });
        }
    }

    // --- SUB-SISTEMAS (PARA MANTENER EL CÓDIGO ORGANIZADO Y COMPLEJO) ---

    createProceduralGround() {
        // Genera un fondo infinito de "tablero de ajedrez" para referencia visual
        const mapW = 100; const mapH = 100;
        for(let x = 0; x < mapW; x++) {
            for(let y = 0; y < mapH; y++) {
                const color = (x + y) % 2 === 0 ? 0x004400 : 0x005500; // Verdes oscuros
                this.add.rectangle(x * this.tileSize, y * this.tileSize, this.tileSize, this.tileSize, color)
                    .setOrigin(0).setDepth(-1);
            }
        }
    }

    initializeMapRenderer() {
        // Escucha cambios en el array del mapa del servidor y dibuja los tiles correspondientes
        this.room.state.map.onAdd((tileID, index) => {
            const x = (index % this.room.state.width) * this.tileSize;
            const y = Math.floor(index / this.room.state.width) * this.tileSize;
            
            if (this.textures.exists('world-tiles')) {
                const tile = this.add.image(x, y, 'world-tiles', tileID).setOrigin(0);
                tile.setDepth(0); // Capa de suelo/objetos
                this.tileSprites[index] = tile;
            }
        });

        // Actualización dinámica (ej: si se rompe una pared)
        this.room.state.map.onChange((tileID, index) => {
            if (this.tileSprites[index]) {
                this.tileSprites[index].setFrame(tileID);
            }
        });
    }

    createAnimations() {
        // Definimos las animaciones solo si existe la textura
        if (this.textures.exists('player') && !this.anims.exists('walk_down')) {
            this.anims.create({
                key: 'walk_down',
                frames: this.anims.generateFrameNumbers('player', { start: 0, end: 3 }),
                frameRate: 8, repeat: -1
            });
            // Aquí puedes agregar 'walk_up', 'walk_left', etc. si tienes los cuadros
        }
    }

    initializePlayerSync() {
        this.room.state.players.onAdd((playerState, sessionId) => {
            const isMe = (sessionId === this.room.sessionId);
            
            // Factory de Entidad: Sprite o Fallback geométrico
            let entity;
            if (this.textures.exists('player')) {
                entity = this.add.sprite(playerState.x, playerState.y, 'player');
                entity.setDisplaySize(this.tileSize, this.tileSize); // Ajuste a Grid
            } else {
                // Fallback robusto si no cargó la imagen
                entity = this.add.container(playerState.x, playerState.y);
                const rect = this.add.rectangle(16, 16, 28, 28, isMe ? 0x00ff00 : 0xff0000);
                entity.add(rect);
                // Nombre encima del jugador
                const nameTag = this.add.text(16, -10, playerState.nombre || "Jugador", { fontSize: '10px' }).setOrigin(0.5);
                entity.add(nameTag);
            }
            
            entity.setDepth(10); // Capa de personajes (sobre el mapa)

            if (isMe) {
                this.player = entity;
                
                // Configuración de Cámara Profesional
                this.cameras.main.startFollow(this.player, true, 0.08, 0.08); // Lerp suave
                this.cameras.main.setZoom(1.8); // Zoom táctico
                this.cameras.main.setBounds(0, 0, 3200, 3200); // Límites del mundo

                // Sync de UI (Vida)
                playerState.onChange(() => {
                    const hpBar = document.getElementById('hp-bar'); // Elemento del DOM HTML
                    if (hpBar) hpBar.style.width = Math.max(0, playerState.hp) + '%';
                });

            } else {
                this.otherPlayers[sessionId] = entity;
                if(entity.setTint) entity.setTint(0xffaaaa); // Diferenciar enemigos

                // Interpolación de Red (Suavizado de movimiento remoto)
                playerState.onChange(() => {
                    this.tweens.add({
                        targets: entity,
                        x: playerState.x,
                        y: playerState.y,
                        duration: this.moveSpeed, // Sincronizado con la velocidad de paso
                        ease: 'Linear'
                    });
                });
            }
        });

        // Limpieza al desconectar
        this.room.state.players.onRemove((playerState, sessionId) => {
            if (this.otherPlayers[sessionId]) {
                this.otherPlayers[sessionId].destroy(); // Ojo: si es Container usa destroy() igual
                delete this.otherPlayers[sessionId];
            }
        });
    }

    initializeInputs() {
        // 1. Joystick Virtual (Librería Rex)
        this.joystick = this.plugins.get('rexvirtualjoystickplugin').add(this, {
            x: 80, y: window.innerHeight - 100,
            radius: 60,
            base: this.add.circle(0, 0, 60, 0x888888, 0.3).setStrokeStyle(2, 0xffffff),
            thumb: this.add.circle(0, 0, 30, 0xcccccc, 0.8),
            dir: '4dir', // Tibia usa 4 direcciones estrictas
            forceMin: 16
        });
        
        // FIJAR A PANTALLA (HUD) - Crucial para que no se pierda al caminar
        this.joystick.base.setScrollFactor(0).setDepth(100);
        this.joystick.thumb.setScrollFactor(0).setDepth(100);

        // 2. Teclado (Para debug en PC o soporte extra)
        this.cursorKeys = this.input.keyboard.createCursorKeys();
    }

    initializeUIListener() {
        // Puente entre HTML (Botones) y Phaser (Juego)
        window.addEventListener('game-action', (e) => {
            const action = e.detail;
            console.log("Comando UI recibido:", action);

            if (!this.player) return;

            switch(action) {
                case 'ATTACK':
                    this.room.send("attack");
                    // Feedback visual local (Golpe)
                    this.tweens.add({ targets: this.player, scaleX: 1.2, scaleY: 1.2, duration: 50, yoyo: true });
                    break;
                case 'HEAL':
                    this.room.send("use_spell", { id: "exura" });
                    // Feedback visual (Brillo verde)
                    const healFX = this.add.circle(this.player.x + 16, this.player.y + 16, 20, 0x00ff00, 0.5);
                    this.tweens.add({ targets: healFX, alpha: 0, scale: 2, duration: 500, onComplete: () => healFX.destroy() });
                    break;
                // Agregar más casos según tus botones HTML
            }
        });
    }

    // 3. BUCLE PRINCIPAL (GAME LOOP)
    update(time, delta) {
        if (!this.player || !this.joystick) return;

        // LÓGICA DE MOVIMIENTO POR CUADRÍCULA (GRID-BASED)
        // Solo aceptamos un nuevo input si NO nos estamos moviendo ya
        if (!this.isMoving) {
            
            // Leemos Joystick o Teclado
            const joyCursor = this.joystick.createCursorKeys();
            let dx = 0; 
            let dy = 0;

            if (joyCursor.right.isDown || this.cursorKeys.right.isDown) dx = 1;
            else if (joyCursor.left.isDown || this.cursorKeys.left.isDown) dx = -1;
            else if (joyCursor.down.isDown || this.cursorKeys.down.isDown) dy = 1;
            else if (joyCursor.up.isDown || this.cursorKeys.up.isDown) dy = -1;

            // Si hay intención de movimiento, ejecutamos el paso
            if (dx !== 0 || dy !== 0) {
                this.executeGridStep(dx, dy);
            } else {
                // Si no hay input, paramos la animación
                if (this.player.anims) this.player.stop();
            }
        }
    }

    executeGridStep(dx, dy) {
        this.isMoving = true; // Bloquear inputs hasta terminar el paso

        // 1. Calcular coordenadas destino (Matemática Grid)
        const targetX = this.player.x + (dx * this.tileSize);
        const targetY = this.player.y + (dy * this.tileSize);

        // 2. Orientación Visual (Flip sprite)
        if (dx < 0) this.player.setFlipX(true);
        if (dx > 0) this.player.setFlipX(false);
        
        // 3. Iniciar Animación
        if (this.player.play && this.anims.exists('walk_down')) {
            this.player.play('walk_down', true);
        }

        // 4. PREMISA OPTIMISTA (CLIENT-SIDE PREDICTION)
        // Movemos visualmente al jugador inmediatamente para sensación "Zero Lag"
        this.tweens.add({
            targets: this.player,
            x: targetX,
            y: targetY,
            duration: this.moveSpeed, // Duración exacta del paso
            ease: 'Linear',           // Movimiento constante (sin aceleración)
            onComplete: () => {
                this.isMoving = false; // ¡Paso completado! Listo para el siguiente
            }
        });

        // 5. ENVIAR AL SERVIDOR (Autoridad final)
        // El servidor validará colisiones y si es legal, lo aceptará.
        // Si no es legal, enviará "corregir_posicion"
        this.room.send("mover", { x: targetX, y: targetY });
    }
}

// =============================================================================
// CONFIGURACIÓN GLOBAL PHASER
// =============================================================================
const config = {
    type: Phaser.AUTO,
    backgroundColor: '#000000',
    parent: 'game-container', // Vinculación con el DIV del HTML
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: window.innerWidth, // Pantalla completa
        height: window.innerHeight
    },
    physics: {
        default: 'arcade',
        arcade: { debug: false } // Poner true para ver cajas de colisión
    },
    render: {
        pixelArt: true, // ¡CRUCIAL! Mantiene los pixeles nítidos (Estilo Tibia)
        antialias: false,
        roundPixels: true
    },
    scene: MythicaClient
};

// Inicialización
const game = new Phaser.Game(config);

// Manejo de rotación de pantalla
window.addEventListener('resize', () => {
    game.scale.resize(window.innerWidth, window.innerHeight);
});
    
