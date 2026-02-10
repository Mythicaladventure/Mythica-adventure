/* =============================================================================
   ⚔️ MYTHICAL ADVENTURE CLIENT v2.5 (FINAL STABLE)
   =============================================================================
*/

const CONFIG = {
    TILE_SIZE: 32,
    MOVE_SPEED: 250,
    ZOOM_LEVEL: 1.6,
    CAMERA_LERP: 0.08,
    COLORS: {
        HP_BG: 0x000000, HP_HIGH: 0x00ff00, HP_MID: 0xffff00, HP_LOW: 0xff0000,
        TEXT_DMG: '#ff3333', TEXT_HEAL: '#00ff00'
    }
};

class MythicaClient extends Phaser.Scene {
    constructor() {
        super("MythicaClient");
        // Conexión Segura WSS
        this.client = new Colyseus.Client("wss://mythica-adventure.onrender.com");
        this.room = null;

        this.player = null;
        this.otherPlayers = {};
        this.userData = { name: "Guest", role: "knight" };
        
        this.joystick = null;
        this.cursorKeys = null;
        this.isGameActive = false;
        this.isMoving = false;
    }

    // =========================================================================
    // 1. CARGA DE RECURSOS (RUTAS ABSOLUTAS)
    // =========================================================================
    preload() {
        console.log("📥 Cargando recursos...");

        // URL BASE: Asegura que el móvil encuentre los archivos
        const baseURL = "https://mythicaladventure.github.io/Mythica-adventure/";

        // 1. Tileset (Mapa)
        this.load.spritesheet('world-tiles', baseURL + 'client/assets/sprites/otsp_tiles_01.png', { frameWidth: 32, frameHeight: 32 });
        
        // 2. Personaje (Héroe)
        this.load.spritesheet('player', baseURL + 'client/assets/sprites/otsp_creatures_01.png', { frameWidth: 32, frameHeight: 32 });

        // Fallback: Textura blanca por si algo falla
        const graphics = this.make.graphics().fillStyle(0xffffff).fillRect(0,0,1,1);
        graphics.generateTexture('pixel', 1, 1);
        graphics.destroy();

        this.load.on('loaderror', (file) => {
            console.error("❌ ERROR CARGANDO:", file.src);
        });
    }

    // =========================================================================
    // 2. INICIALIZACIÓN
    // =========================================================================
    create() {
        console.log("⚡ Motor Gráfico Iniciado.");

        // Fondo base oscuro (para evitar pantalla negra total)
        this.add.rectangle(0, 0, 2000, 2000, 0x001100).setOrigin(0).setDepth(-100);

        // Listeners HTML
        window.addEventListener('start-game', (e) => this.handleLogin(e.detail));
        window.addEventListener('game-action', (e) => this.handleInput(e.detail));

        // Inputs
        this.initJoystick();
        this.cursorKeys = this.input.keyboard.createCursorKeys();
    }

    // =========================================================================
    // 3. CONEXIÓN
    // =========================================================================
    async handleLogin(credentials) {
        this.userData = credentials;
        
        // UI Carga
        const loadingContainer = this.add.container(this.cameras.main.centerX, this.cameras.main.centerY).setScrollFactor(0).setDepth(10000);
        const bg = this.add.rectangle(0, 0, 300, 100, 0x000000, 0.8);
        const txt = this.add.text(0, 0, "CONECTANDO...", { fontSize: '18px', color: '#ffd700' }).setOrigin(0.5);
        loadingContainer.add([bg, txt]);

        try {
            this.room = await this.client.joinOrCreate("mundo_mythica", {
                name: this.userData.name, role: this.userData.role
            });

            console.log("✅ Conexión:", this.room.sessionId);
            loadingContainer.destroy();

            // Activar Juego
            this.isGameActive = true;
            document.getElementById('login-screen').style.display = 'none';
            document.getElementById('game-ui').style.display = 'block';
            if(this.joystick) this.joystick.setVisible(true);

            this.initNetworkEvents();

        } catch (error) {
            console.error("Connection Error:", error);
            txt.setText("ERROR CONEXIÓN (Reintenta)");
            bg.setFillStyle(0x550000);
            setTimeout(() => loadingContainer.destroy(), 3000);
        }
    }

    initNetworkEvents() {
        // Debug Visual: Contador de mapa
        const debugText = this.add.text(10, 100, "CARGANDO MAPA: 0%", { fontSize: '12px', color: '#00ff00', backgroundColor: '#000' }).setScrollFactor(0).setDepth(9999);
        let tilesLoaded = 0;

        // --- MAPA (CORREGIDO) ---
        this.room.state.map.onAdd((tileID, index) => {
            // FIX: Usamos 50 fijo por si el ancho no ha llegado
            const mapWidth = this.room.state.width || 50; 
            
            const x = (index % mapWidth) * CONFIG.TILE_SIZE;
            const y = Math.floor(index / mapWidth) * CONFIG.TILE_SIZE;
            
            // A. DIBUJAR BLOQUE DE COLOR (Respaldo visible)
            // Colores según ID para diferenciar suelo/pared
            let color = 0x006400; // Verde Oscuro (Base)
            if (tileID === 2 || tileID === 101) color = 0x808080; // Gris (Pared)
            if (tileID === 3 || tileID === 105) color = 0x8B4513; // Marrón (Suelo)
            if (tileID === 1) color = 0x228B22; // Verde (Pasto)

            // Dibujar bloque (Capa 0)
            this.add.rectangle(x + 16, y + 16, 32, 32, color).setDepth(0);

            // B. INTENTAR DIBUJAR LA IMAGEN (Capa 0.5)
            if(this.textures.exists('world-tiles')) {
                this.add.image(x, y, 'world-tiles', tileID).setOrigin(0).setDepth(0.5);
            }

            // Actualizar contador debug
            tilesLoaded++;
            if(tilesLoaded % 50 === 0) debugText.setText(`MAPA: ${tilesLoaded} TILES`);
            if(tilesLoaded > 2400) debugText.destroy(); // Ocultar al terminar
        });

        // JUGADORES
        this.room.state.players.onAdd((p, sessionId) => this.createPlayerEntity(p, sessionId));
        this.room.state.players.onRemove((p, sessionId) => this.removePlayerEntity(sessionId));
        
        // COMBATE
        this.room.onMessage("combat_text", (data) => this.showFloatingText(data));
    }

    // =========================================================================
    // 4. ENTIDADES
    // =========================================================================
    createPlayerEntity(p, sessionId) {
        const isMe = (sessionId === this.room.sessionId);
        const container = this.add.container(p.x, p.y).setDepth(10);
        
        // Sprite
        let sprite;
        if(this.textures.exists('player')) {
            // Usamos frame 0 o la skin del server
            sprite = this.add.sprite(0, 0, 'player', p.skin || 0).setDisplaySize(32, 32);
        } else {
            // Fallback: Cuadro Azul (Yo) o Rojo (Otros)
            sprite = this.add.rectangle(0, 0, 32, 32, isMe ? 0x0000ff : 0xff0000);
        }
        container.add(sprite);

        // Nombre
        const nameTag = this.add.text(0, -25, p.nombre, { fontSize: '10px', color: '#fff', stroke: '#000', strokeThickness: 2 }).setOrigin(0.5);
        container.add(nameTag);

        container.sprite = sprite;

        if(isMe) {
            this.player = container;
            this.cameras.main.startFollow(container);
            this.cameras.main.setZoom(1.5);
            this.updateHUD(p);
        } else {
            this.otherPlayers[sessionId] = container;
        }

        // Movimiento Suave
        p.onChange(() => {
            this.tweens.add({ targets: container, x: p.x, y: p.y, duration: 200 });
            if(isMe) this.updateHUD(p);
        });
    }

    removePlayerEntity(sessionId) {
        if (this.otherPlayers[sessionId]) {
            this.otherPlayers[sessionId].destroy();
            delete this.otherPlayers[sessionId];
        }
    }

    // =========================================================================
    // 5. EXTRAS
    // =========================================================================
    showFloatingText(data) {
        const txt = this.add.text(data.x, data.y, data.value, { fontSize: '14px', color: '#ff0000', stroke: '#fff', strokeThickness: 2 }).setOrigin(0.5).setDepth(999);
        this.tweens.add({ targets: txt, y: data.y - 50, alpha: 0, duration: 800, onComplete: () => txt.destroy() });
    }

    initJoystick() {
        if (window.rexvirtualjoystickplugin) {
            this.joystick = this.plugins.get('rexVirtualJoystickPlugin').add(this, {
                x: 80, y: window.innerHeight - 80, radius: 50,
                base: this.add.circle(0, 0, 50, 0x888888, 0.5),
                thumb: this.add.circle(0, 0, 25, 0xcccccc, 0.8),
                dir: '4dir', forceMin: 16
            }).on('update', this.handleJoystick, this);
            this.joystick.setVisible(false);
        }
    }

    handleJoystick() {
        if(!this.player || !this.isGameActive) return;
        const cursors = this.joystick.createCursorKeys();
        let dx=0, dy=0;
        if(cursors.right.isDown) dx=1;
        if(cursors.left.isDown) dx=-1;
        if(cursors.down.isDown) dy=1;
        if(cursors.up.isDown) dy=-1;
        
        if(dx!==0 || dy!==0) {
            const tx = this.player.x + (dx * 32);
            const ty = this.player.y + (dy * 32);
            this.room.send("mover", { x: tx, y: ty });
            
            // Animación simple (Flip)
            if(this.player.sprite && dx !== 0) {
                this.player.sprite.setFlipX(dx < 0);
            }
        }
    }

    handleInput(action) {
        if(action === 'ATTACK') {
             this.room.send("attack");
             if(this.player && this.player.sprite) {
                this.tweens.add({ targets: this.player.sprite, scale: 1.2, duration: 50, yoyo: true });
             }
        }
    }

    updateHUD(p) {
        const hpBar = document.getElementById('hp-bar');
        const mpBar = document.getElementById('mp-bar');
        const hpText = document.getElementById('hp-text');
        
        if(hpBar) {
            hpBar.style.width = `${(p.hp/p.maxHp)*100}%`;
            if(hpText) hpText.innerText = `${Math.floor(p.hp)}/${p.maxHp}`;
        }
        if(mpBar) mpBar.style.width = `${(p.mp/p.maxMp)*100}%`;
    }
}

// Configuración Phaser
const config = {
    type: Phaser.AUTO,
    backgroundColor: '#001100',
    parent: 'game-container',
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { pixelArt: true }, 
    scene: MythicaClient
};

const game = new Phaser.Game(config);
window.addEventListener('resize', () => game.scale.resize(window.innerWidth, window.innerHeight));
