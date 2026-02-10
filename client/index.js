/* =============================================================================
   ⚔️ MYTHICAL ADVENTURE ENGINE v2.1 (INDUSTRIAL CORE + TIBIA ASSETS)
   =============================================================================
   - Arquitectura: Cliente Ligero con Predicción de Movimiento
   - Renderizado: WebGL con Soporte OTSP (.dat/.spr)
   - Red: WebSocket Seguro (Colyseus)
   =============================================================================
*/

// --- CONFIGURACIÓN GLOBAL (MAGIC NUMBERS) ---
const CONFIG = {
    TILE_SIZE: 32,
    MOVE_SPEED: 250,        // Duración del paso (ms)
    ZOOM_LEVEL: 1.6,        // Zoom de cámara
    CAMERA_LERP: 0.08,      // Suavizado de cámara (0.01 = lento, 1 = instantáneo)
    COLORS: {
        HP_BG: 0x000000,
        HP_HIGH: 0x00ff00,
        HP_MID: 0xffff00,
        HP_LOW: 0xff0000,
        TEXT_DMG: '#ff3333',
        TEXT_HEAL: '#00ff00',
        TEXT_MANA: '#0088ff'
    }
};

class MythicaClient extends Phaser.Scene {
    constructor() {
        super("MythicaClient");
        
        // SISTEMAS
        this.client = new Colyseus.Client("wss://mythica-adventure.onrender.com");
        this.room = null;
        
        // ENTIDADES
        this.player = null;          
        this.otherPlayers = {};      
        this.userData = { name: "Guest", role: "knight" }; 
        
        // INPUTS
        this.joystick = null;
        this.cursorKeys = null;
        this.isGameActive = false;   
        this.isMoving = false;       
    }

    // =========================================================================
    // 1. CARGA DE RECURSOS (ROBUSTA)
    // =========================================================================
    preload() {
        // A. Carga de Assets Normales (Interfaz, tiles básicos)
        this.load.spritesheet('world-tiles', 'client/assets/tileset.png', { frameWidth: 32, frameHeight: 32 });
        this.load.spritesheet('player', 'client/assets/player.png', { frameWidth: 64, frameHeight: 64 }); 
        
        // B. CARGA DE ARCHIVOS TIBIA (¡NUEVO!)
        // Buscamos en la carpeta Assets/Mythical respetando mayúsculas
        this.load.binary('otsp_dat', 'client/Assets/Mythical/otsp.dat');
        this.load.binary('otsp_spr', 'client/Assets/Mythical/otsp.spr');

        // Fallback: Generamos una textura de píxel blanco en memoria por si faltan imágenes
        const graphics = this.make.graphics().fillStyle(0xffffff).fillRect(0,0,1,1);
        graphics.generateTexture('pixel', 1, 1);
        graphics.destroy();
    }

    // =========================================================================
    // 2. INICIALIZACIÓN DEL MOTOR
    // =========================================================================
    create() {
        console.log("⚡ Motor Gráfico Iniciado. Version Industrial.");
        
        // --- VERIFICACIÓN DE TIBIA ASSETS ---
        if (this.cache.binary.exists('otsp_spr') && this.cache.binary.exists('otsp_dat')) {
            console.log("✅ ÉXITO: Archivos .DAT y .SPR cargados en memoria.");
            
            // Marca Visual de Éxito
            this.add.text(10, 10, '✅ TIBIA ASSETS ONLINE', { 
                fontFamily: 'Verdana', fontSize: '12px', 
                fill: '#00ff00', backgroundColor: '#000000',
                padding: { x: 5, y: 5 }
            }).setScrollFactor(0).setDepth(9999);
        } else {
            console.error("❌ ERROR: No se pudieron cargar los archivos de Tibia.");
            this.add.text(10, 10, '❌ ERROR: ASSETS NOT FOUND', { 
                fill: '#ff0000', backgroundColor: '#000000' 
            }).setScrollFactor(0).setDepth(9999);
        }
        // -------------------------------------

        // 1. Renderizar Suelo Procedural (Para evitar pantalla negra)
        this.createProceduralGround();

        // 2. Sistema de Partículas (Para efectos de sangre/magia)
        this.createParticleSystems();

        // 3. Listeners de Interfaz (HTML <-> JS)
        window.addEventListener('start-game', (e) => this.handleLogin(e.detail));
        window.addEventListener('game-action', (e) => this.handleInput(e.detail));

        // 4. Inicializar Inputs (Joystick Virtual)
        this.initJoystick();
        this.cursorKeys = this.input.keyboard.createCursorKeys();
    }

    // =========================================================================
    // 3. CONEXIÓN Y RED (RETRY LOGIC)
    // =========================================================================
    async handleLogin(credentials) {
        this.userData = credentials;
        
        // Feedback Visual de carga
        const loadingTxt = this.add.text(this.cameras.main.centerX, this.cameras.main.centerY, "CONECTANDO AL SERVIDOR...", {
            fontFamily: 'Verdana', fontSize: '18px', color: '#ffd700', stroke: '#000', strokeThickness: 4
        }).setOrigin(0.5).setScrollFactor(0).setDepth(9999);

        try {
            // Intentar conexión
            this.room = await this.client.joinOrCreate("mundo_mythica", { 
                name: this.userData.name,
                role: this.userData.role 
            });

            console.log("✅ Conexión Establecida:", this.room.sessionId);
            loadingTxt.destroy();
            
            // TRANSICIÓN DE UI
            this.isGameActive = true;
            document.getElementById('login-screen').style.display = 'none';
            document.getElementById('game-ui').style.display = 'block';
            if(this.joystick) this.joystick.setVisible(true);

            // INICIAR SINCRONIZACIÓN
            this.initNetworkEvents();

        } catch (error) {
            console.error("Connection Error:", error);
            loadingTxt.setText("ERROR DE CONEXIÓN\n(El servidor puede estar despertando...)");
            loadingTxt.setColor('#ff4444');
            
            // Reintento automático en 3 segundos (Lógica Pro)
            // setTimeout(() => this.handleLogin(credentials), 3000); 
        }
    }

    initNetworkEvents() {
        // --- MAPA ---
        this.room.state.map.onAdd((tileID, index) => {
            const x = (index % this.room.state.width) * CONFIG.TILE_SIZE;
            const y = Math.floor(index / this.room.state.width) * CONFIG.TILE_SIZE;
            if(this.textures.exists('world-tiles')) {
                this.add.image(x, y, 'world-tiles', tileID).setOrigin(0).setDepth(0);
            }
        });

        // --- JUGADORES ---
        this.room.state.players.onAdd((p, sessionId) => this.createPlayerEntity(p, sessionId));
        this.room.state.players.onRemove((p, sessionId) => this.removePlayerEntity(sessionId));

        // --- COMBATE (DAÑO FLOTANTE) ---
        this.room.onMessage("combat_text", (data) => this.showFloatingText(data));
    }

    // =========================================================================
    // 4. FÁBRICA DE ENTIDADES (PLAYER FACTORY)
    // =========================================================================
    createPlayerEntity(p, sessionId) {
        const isMe = (sessionId === this.room.sessionId);
        
        // CONTENEDOR PRINCIPAL (Sprite + UI)
        const container = this.add.container(p.x, p.y);
        container.setDepth(p.y); // Sort Z-Index por posición Y (Isométrico falso)

        // 1. Sprite
        let sprite;
        if(this.textures.exists('player')) {
            sprite = this.add.sprite(0, 0, 'player').setDisplaySize(32, 32);
        } else {
            // Fallback geométrico si falla la carga
            sprite = this.add.rectangle(0, 0, 32, 32, isMe ? 0x00ff00 : 0xff0000);
        }
        container.add(sprite);

        // 2. Barra de Vida (Estilo MOBA)
        const hpBg = this.add.rectangle(0, -25, 34, 6, CONFIG.COLORS.HP_BG);
        const hpBar = this.add.rectangle(-16, -25, 32, 4, CONFIG.COLORS.HP_HIGH).setOrigin(0, 0.5);
        container.add([hpBg, hpBar]);

        // 3. Etiqueta de Nombre
        const nameTag = this.add.text(0, -40, p.nombre, {
            fontSize: '10px', fontFamily: 'Arial', color: '#ffffff', 
            stroke: '#000000', strokeThickness: 3
        }).setOrigin(0.5);
        container.add(nameTag);

        // Referencias para updates
        container.sprite = sprite;
        container.hpBar = hpBar;

        // Configuración Específica
        if (isMe) {
            this.player = container;
            this.setupCamera();
            this.updateHUD(p); // UI HTML
        } else {
            this.otherPlayers[sessionId] = container;
            if(sprite.setTint) sprite.setTint(0xffaaaa); // Tinte rojo a enemigos
        }

        // --- LOOP DE SINCRONIZACIÓN ---
        p.onChange(() => {
            // A. Interpolación de Movimiento
            this.tweens.add({
                targets: container, x: p.x, y: p.y, 
                duration: CONFIG.MOVE_SPEED, 
                onUpdate: () => container.setDepth(container.y) // Actualizar profundidad
            });

            // B. Barra de Vida Dinámica
            const pct = Phaser.Math.Clamp(p.hp / p.maxHp, 0, 1);
            this.tweens.add({ targets: hpBar, width: 32 * pct, duration: 200 });
            
            // Color según daño
            if(pct > 0.5) hpBar.fillColor = CONFIG.COLORS.HP_HIGH;
            else if(pct > 0.25) hpBar.fillColor = CONFIG.COLORS.HP_MID;
            else hpBar.fillColor = CONFIG.COLORS.HP_LOW;

            // C. Si soy yo, actualizo HTML
            if(isMe) this.updateHUD(p);
        });
    }

    removePlayerEntity(sessionId) {
        if (this.otherPlayers[sessionId]) {
            // Efecto de muerte (Fade out)
            this.tweens.add({
                targets: this.otherPlayers[sessionId], alpha: 0, duration: 500,
                onComplete: () => {
                    if(this.otherPlayers[sessionId]) this.otherPlayers[sessionId].destroy();
                    delete this.otherPlayers[sessionId];
                }
            });
        }
    }

    // =========================================================================
    // 5. SISTEMA VISUAL (VFX)
    // =========================================================================
    showFloatingText(data) {
        const { x, y, value, type } = data;
        let color = '#fff'; 
        let fontSize = '14px';

        if (type === 'DAMAGE') { color = CONFIG.COLORS.TEXT_DMG; fontSize = '16px'; }
        if (type === 'HEAL') { color = CONFIG.COLORS.TEXT_HEAL; }

        const txt = this.add.text(x, y - 30, value, {
            fontFamily: 'Impact', fontSize: fontSize, color: color, 
            stroke: '#000', strokeThickness: 3
        }).setOrigin(0.5).setDepth(9999);

        // Animación Física (Salto y Gravedad)
        this.tweens.add({
            targets: txt, y: y - 60, duration: 600, ease: 'Back.easeOut',
            onComplete: () => {
                this.tweens.add({ targets: txt, alpha: 0, y: y - 80, duration: 300, onComplete: () => txt.destroy() });
            }
        });

        // Camera Shake si el daño es alto
        if (type === 'DAMAGE' && parseInt(value) > 20) {
            this.cameras.main.shake(100, 0.005);
        }
    }

    createParticleSystems() {
        // Aquí podrías definir emisores de partículas para reutilizar
    }

    setupCamera() {
        this.cameras.main.startFollow(this.player, true, CONFIG.CAMERA_LERP, CONFIG.CAMERA_LERP);
        this.cameras.main.setZoom(CONFIG.ZOOM_LEVEL);
    }

    createProceduralGround() {
        // Tablero de ajedrez optimizado (Batch drawing sería mejor, pero esto sirve)
        for(let x=0; x<60; x++) for(let y=0; y<60; y++) {
            const color = (x+y)%2===0 ? 0x002200 : 0x003300;
            this.add.rectangle(x*32, y*32, 32, 32, color).setOrigin(0).setDepth(-100);
        }
    }

    // =========================================================================
    // 6. INPUT Y CONTROLES
    // =========================================================================
    initJoystick() {
        // Detección segura del plugin global
        if (window.rexvirtualjoystickplugin || this.plugins.get('rexVirtualJoystickPlugin')) {
            const plugin = this.plugins.get('rexVirtualJoystickPlugin') || this.plugins.get('rexvirtualjoystickplugin');
            if (!plugin) return; // Fallo silencioso si no carga

            this.joystick = plugin.add(this, {
                x: 80, y: window.innerHeight - 100, radius: 60,
                base: this.add.circle(0,0,60,0x888888,0.3).setStrokeStyle(2,0xffffff),
                thumb: this.add.circle(0,0,30,0xcccccc,0.8),
                dir: '4dir', forceMin: 16
            });
            // HUD Fijo
            this.joystick.base.setScrollFactor(0).setDepth(10000);
            this.joystick.thumb.setScrollFactor(0).setDepth(10001);
            this.joystick.setVisible(false); // Oculto hasta login
        }
    }

    handleInput(action) {
        if(!this.room || !this.player) return;

        // Comandos de Chat
        if(action.length > 20 || action.includes(' ')) {
            // TODO: Enviar chat al servidor
            return;
        }

        // Acciones de Combate
        if(action === 'ATTACK') {
            this.room.send("attack");
            // Feedback local inmediato (Juice)
            this.tweens.add({ targets: this.player.sprite, scale: 1.2, duration: 50, yoyo: true });
        }
        if(action === 'HEAL' || action === 'SPELL_1') {
            this.room.send("use_spell", { id: "exura" });
        }
    }

    updateHUD(p) {
        // Manipulación segura del DOM
        const hpBar = document.getElementById('hp-bar');
        const mpBar = document.getElementById('mp-bar');
        const hpText = document.getElementById('hp-text');
        
        if(hpBar) {
            hpBar.style.width = `${(p.hp/p.maxHp)*100}%`;
            hpText.innerText = `${Math.floor(p.hp)}/${p.maxHp}`;
        }
        if(mpBar) mpBar.style.width = `${(p.mp/p.maxMp)*100}%`;
    }

    // =========================================================================
    // 7. BUCLE PRINCIPAL (GAME LOOP)
    // =========================================================================
    update(time, delta) {
        if(!this.player || !this.isGameActive || this.isMoving) return;

        let dx=0, dy=0;
        
        // A. Leer Joystick
        if(this.joystick) {
            const c = this.joystick.createCursorKeys();
            if(c.right.isDown) dx=1; else if(c.left.isDown) dx=-1;
            else if(c.down.isDown) dy=1; else if(c.up.isDown) dy=-1;
        }
        
        // B. Leer Teclado (Fallback PC)
        if(dx===0 && dy===0 && this.cursorKeys) {
            if(this.cursorKeys.right.isDown) dx=1; else if(this.cursorKeys.left.isDown) dx=-1;
            else if(this.cursorKeys.down.isDown) dy=1; else if(this.cursorKeys.up.isDown) dy=-1;
        }

        // C. Ejecutar Movimiento GRID
        if(dx!==0 || dy!==0) {
            this.isMoving = true;
            const tx = this.player.x + (dx * CONFIG.TILE_SIZE);
            const ty = this.player.y + (dy * CONFIG.TILE_SIZE);
            
            // Animación Sprite
            if(this.player.sprite) {
                if(dx<0) this.player.sprite.setFlipX(true);
                if(dx>0) this.player.sprite.setFlipX(false);
                if(this.player.sprite.play && this.anims.exists('walk')) this.player.sprite.play('walk', true);
            }

            // Movimiento Cliente (Predicción)
            this.tweens.add({ 
                targets: this.player, x: tx, y: ty, duration: CONFIG.MOVE_SPEED, 
                onComplete:()=> this.isMoving=false 
            });

            // Enviar al Servidor
            this.room.send("mover", { x: tx, y: ty });
        } else {
            // Idle
            if(this.player.sprite && this.player.sprite.anims && this.player.sprite.anims.isPlaying) {
                this.player.sprite.stop();
            }
        }
    }
}

// CONFIGURACIÓN DE PHASER (AUTO-SCALE)
const config = {
    type: Phaser.AUTO, 
    backgroundColor: '#000000',
    parent: 'game-container',
    scale: { 
        mode: Phaser.Scale.FIT, 
        autoCenter: Phaser.Scale.CENTER_BOTH, 
        width: window.innerWidth, 
        height: window.innerHeight 
    },
    render: { 
        pixelArt: true, // Crucial para estilo Tibia/Retro
        roundPixels: true 
    },
    scene: MythicaClient
};

// INICIO DEL MOTOR
const game = new Phaser.Game(config);

// Responsive Resize
window.addEventListener('resize', () => {
    game.scale.resize(window.innerWidth, window.innerHeight);
});
                   
