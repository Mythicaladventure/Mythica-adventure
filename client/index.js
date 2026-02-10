/* =============================================================================
   ⚔️ MYTHICAL ADVENTURE ENGINE v2.3 (CLIENTE FINAL)
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
        // Conexión WSS Segura
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
    // 1. CARGA DE RECURSOS (CON GPS ABSOLUTO)
    // =========================================================================
    preload() {
        console.log("📥 Cargando recursos...");

        // USAMOS LA URL COMPLETA PARA EVITAR ERRORES EN MOVIL
        const baseURL = "https://mythicaladventure.github.io/Mythica-adventure/";

        // 1. Tileset (Suelo y Paredes)
        this.load.spritesheet('world-tiles', baseURL + 'client/assets/sprites/otsp_tiles_01.png', { frameWidth: 32, frameHeight: 32 });
        
        // 2. Personaje (Héroe)
        this.load.spritesheet('player', baseURL + 'client/assets/sprites/otsp_creatures_01.png', { frameWidth: 32, frameHeight: 32 });

        // Fallback: Pixel blanco
        const graphics = this.make.graphics().fillStyle(0xffffff).fillRect(0,0,1,1);
        graphics.generateTexture('pixel', 1, 1);
        graphics.destroy();

        // Detector de errores de carga
        this.load.on('loaderror', (file) => {
            console.error("❌ ERROR CARGANDO:", file.src);
        });
    }

    // =========================================================================
    // 2. INICIALIZACIÓN
    // =========================================================================
    create() {
        console.log("⚡ Motor Gráfico Iniciado.");
        
        // 1. Suelo Procedural (Fondo verde oscuro base)
        this.createProceduralGround();

        // 2. Listeners de Interfaz
        window.addEventListener('start-game', (e) => this.handleLogin(e.detail));
        window.addEventListener('game-action', (e) => this.handleInput(e.detail));

        // 3. Inputs
        this.initJoystick();
        this.cursorKeys = this.input.keyboard.createCursorKeys();
    }

    // =========================================================================
    // 3. CONEXIÓN
    // =========================================================================
    async handleLogin(credentials) {
        this.userData = credentials;
        
        // Pantalla de Carga
        const loadingContainer = this.add.container(this.cameras.main.centerX, this.cameras.main.centerY).setScrollFactor(0).setDepth(10000);
        const bg = this.add.rectangle(0, 0, 300, 100, 0x000000, 0.8);
        const loadingTxt = this.add.text(0, 0, "CONECTANDO...", { fontFamily: 'Verdana', fontSize: '16px', color: '#ffd700' }).setOrigin(0.5);
        loadingContainer.add([bg, loadingTxt]);

        try {
            this.room = await this.client.joinOrCreate("mundo_mythica", { 
                name: this.userData.name, role: this.userData.role 
            });

            console.log("✅ Conexión Establecida:", this.room.sessionId);
            loadingContainer.destroy();
            
            // Activar UI
            this.isGameActive = true;
            document.getElementById('login-screen').style.display = 'none';
            document.getElementById('game-ui').style.display = 'block';
            if(this.joystick) this.joystick.setVisible(true);

            this.initNetworkEvents();

        } catch (error) {
            console.error("Connection Error:", error);
            loadingTxt.setText("ERROR DE CONEXIÓN\nReintentando...");
            bg.setFillStyle(0x550000);
            setTimeout(() => loadingContainer.destroy(), 3000);
        }
    }

    initNetworkEvents() {
        // --- MAPA (MODO HÍBRIDO: IMAGEN O BLOQUES) ---
        this.room.state.map.onAdd((tileID, index) => {
            const x = (index % this.room.state.width) * CONFIG.TILE_SIZE;
            const y = Math.floor(index / this.room.state.width) * CONFIG.TILE_SIZE;
            
            // A. DIBUJAR BLOQUE DE COLOR (Respaldo si falla la imagen)
            // Pared (ID 2 o 101) = Gris, Suelo (ID 3 o 105) = Marrón, Pasto = Verde
            let color = 0x2e8b57; // Verde
            if (tileID === 2 || tileID === 101) color = 0x808080; // Gris Pared
            if (tileID === 3 || tileID === 105) color = 0xdeb887; // Marrón Suelo
            
            // Dibujamos el bloque SIEMPRE en capa 0
            this.add.rectangle(x + 16, y + 16, 32, 32, color).setDepth(0);

            // B. INTENTAR DIBUJAR LA IMAGEN (Capa 1)
            if(this.textures.exists('world-tiles')) {
                this.add.image(x, y, 'world-tiles', tileID).setOrigin(0).setDepth(0.5);
            }
        });

        // --- JUGADORES ---
        this.room.state.players.onAdd((p, sessionId) => this.createPlayerEntity(p, sessionId));
        this.room.state.players.onRemove((p, sessionId) => this.removePlayerEntity(sessionId));

        // --- COMBATE ---
        this.room.onMessage("combat_text", (data) => this.showFloatingText(data));
    }

    // =========================================================================
    // 4. ENTIDADES
    // =========================================================================
    createPlayerEntity(p, sessionId) {
        const isMe = (sessionId === this.room.sessionId);
        const container = this.add.container(p.x, p.y);
        container.setDepth(10); 

        // 1. Sprite del Jugador
        let sprite;
        if(this.textures.exists('player')) {
            // Usamos frame 0 o la skin que diga el servidor
            sprite = this.add.sprite(0, 0, 'player', p.skin || 0).setDisplaySize(32, 32);
        } else {
            // Fallback: Cuadro Azul (Yo) o Rojo (Otros)
            sprite = this.add.rectangle(0, 0, 32, 32, isMe ? 0x0000ff : 0xff0000);
        }
        container.add(sprite);

        // 2. UI Nombre
        const nameTag = this.add.text(0, -35, p.nombre, {
            fontSize: '10px', fontFamily: 'Arial', color: '#ffffff', stroke: '#000000', strokeThickness: 3
        }).setOrigin(0.5);
        container.add(nameTag);

        container.sprite = sprite;

        if (isMe) {
            this.player = container;
            this.cameras.main.startFollow(this.player, true, CONFIG.CAMERA_LERP, CONFIG.CAMERA_LERP);
            this.cameras.main.setZoom(CONFIG.ZOOM_LEVEL);
            this.updateHUD(p);
        } else {
            this.otherPlayers[sessionId] = container;
        }

        // --- SINCRONIZACIÓN ---
        p.onChange(() => {
            this.tweens.add({ targets: container, x: p.x, y: p.y, duration: CONFIG.MOVE_SPEED });
            if(isMe) this.updateHUD(p);
        });
    }

    removePlayerEntity(sessionId) {
        if (this.otherPlayers[sessionId]) {
            this.otherPlayers[sessionId].destroy();
            delete this.otherPlayers[sessionId];
        }
    }

    showFloatingText(data) {
        const txt = this.add.text(data.x, data.y - 30, data.value, {
            fontFamily: 'Impact', fontSize: '14px', color: '#ff0000', stroke: '#000', strokeThickness: 3
        }).setOrigin(0.5).setDepth(9999);

        this.tweens.add({
            targets: txt, y: data.y - 60, alpha: 0, duration: 800, 
            onComplete: () => txt.destroy()
        });
    }

    createProceduralGround() {
        // Fondo base oscuro por si todo falla
        this.add.rectangle(0, 0, 2000, 2000, 0x001100).setOrigin(0).setDepth(-100);
    }

    initJoystick() {
        if (window.rexvirtualjoystickplugin || this.plugins.get('rexVirtualJoystickPlugin')) {
            const plugin = this.plugins.get('rexVirtualJoystickPlugin') || this.plugins.get('rexvirtualjoystickplugin');
            if (!plugin) return; 

            this.joystick = plugin.add(this, {
                x: 80, y: window.innerHeight - 100, radius: 50,
                base: this.add.circle(0,0,50,0x888888,0.3).setStrokeStyle(2,0xffffff),
                thumb: this.add.circle(0,0,25,0xcccccc,0.8),
                dir: '4dir', forceMin: 16
            });
            this.joystick.setVisible(false);
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

    update(time, delta) {
        if(!this.player || !this.isGameActive || this.isMoving) return;

        let dx=0, dy=0;
        if(this.joystick) {
            const c = this.joystick.createCursorKeys();
            if(c.right.isDown) dx=1; else if(c.left.isDown) dx=-1;
            else if(c.down.isDown) dy=1; else if(c.up.isDown) dy=-1;
        }
        
        if(dx!==0 || dy!==0) {
            this.isMoving = true;
            const tx = this.player.x + (dx * CONFIG.TILE_SIZE);
            const ty = this.player.y + (dy * CONFIG.TILE_SIZE);
            
            if(this.player.sprite) {
                if(dx<0) this.player.sprite.setFlipX(true);
                if(dx>0) this.player.sprite.setFlipX(false);
            }

            this.tweens.add({ 
                targets: this.player, x: tx, y: ty, duration: CONFIG.MOVE_SPEED, 
                onComplete:()=> this.isMoving=false 
            });
            this.room.send("mover", { x: tx, y: ty });
        }
    }
}

const config = {
    type: Phaser.AUTO, backgroundColor: '#000000', parent: 'game-container',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: window.innerWidth, height: window.innerHeight },
    render: { pixelArt: true, roundPixels: true },
    scene: MythicaClient
};

const game = new Phaser.Game(config);
window.addEventListener('resize', () => game.scale.resize(window.innerWidth, window.innerHeight));
