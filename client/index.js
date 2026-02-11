/* =============================================================================
   ⚔️ MYTHICAL ADVENTURE CLIENT v5.0 (FORCED MAP RECEPTION)
   =============================================================================
*/

const CONFIG = {
    TILE_SIZE: 32,
    MOVE_SPEED: 250,
    ZOOM_LEVEL: 1.6,
    CAMERA_LERP: 0.08
};

class MythicaClient extends Phaser.Scene {
    constructor() {
        super("MythicaClient");
        this.client = new Colyseus.Client("wss://mythica-adventure.onrender.com");
        this.room = null;
        this.player = null;
        this.otherPlayers = {};
        this.userData = { name: "Guest", role: "knight" };
        this.drawnTiles = new Set(); // Para no dibujar doble
        
        // Inputs
        this.joystick = null;
        this.cursorKeys = null;
        this.isGameActive = false;
    }

    preload() {
        console.log("📥 Cargando recursos...");
        const baseURL = "https://mythicaladventure.github.io/Mythica-adventure/";

        // Cargar Imágenes
        this.load.spritesheet('world-tiles', baseURL + 'client/assets/sprites/otsp_tiles_01.png', { frameWidth: 32, frameHeight: 32 });
        this.load.spritesheet('player', baseURL + 'client/assets/sprites/otsp_creatures_01.png', { frameWidth: 32, frameHeight: 32 });
    }

    create() {
        console.log("⚡ Motor Gráfico Iniciado.");
        this.add.rectangle(0, 0, 2000, 2000, 0x001100).setOrigin(0).setDepth(-100); // Fondo base

        window.addEventListener('start-game', (e) => this.handleLogin(e.detail));
        window.addEventListener('game-action', (e) => this.handleInput(e.detail));

        this.initJoystick();
        this.cursorKeys = this.input.keyboard.createCursorKeys();
    }

    async handleLogin(credentials) {
        this.userData = credentials;
        
        // UI de Conexión
        const loadingContainer = this.add.container(this.cameras.main.centerX, this.cameras.main.centerY).setScrollFactor(0).setDepth(10000);
        const bg = this.add.rectangle(0, 0, 300, 100, 0x000000, 0.8);
        const txt = this.add.text(0, 0, "CONECTANDO...", { fontSize: '18px', color: '#ffd700' }).setOrigin(0.5);
        loadingContainer.add([bg, txt]);

        try {
            this.room = await this.client.joinOrCreate("mundo_mythica", {
                name: this.userData.name, role: this.userData.role
            });

            console.log("✅ Conexión Exitosa:", this.room.sessionId);
            loadingContainer.destroy();

            this.isGameActive = true;
            document.getElementById('login-screen').style.display = 'none';
            document.getElementById('game-ui').style.display = 'block';
            if(this.joystick) this.joystick.setVisible(true);

            this.initNetworkEvents();

        } catch (error) {
            console.error("Connection Error:", error);
            txt.setText("ERROR CONEXIÓN (Reintenta)");
            setTimeout(() => loadingContainer.destroy(), 3000);
        }
    }

    initNetworkEvents() {
        // Debug Visual
        const debugText = this.add.text(10, 100, "ESPERANDO MAPA...", { fontSize: '12px', color: '#00ff00', backgroundColor: '#000' }).setScrollFactor(0).setDepth(9999);
        
        // 1. ESCUCHAR EL PAQUETE FORZADO (PLAN A - Prioritario)
        this.room.onMessage("force_map_load", (data) => {
            console.log("📦 ¡MAPA RECIBIDO! Tiles:", data.length);
            debugText.setText(`¡MAPA RECIBIDO! (${data.length} Tiles)`);
            
            data.forEach(item => {
                this.drawTile(item.t, item.i);
            });
            
            setTimeout(() => debugText.destroy(), 3000);
        });

        // 2. SINCRONIZACIÓN NORMAL (PLAN B - Respaldo)
        this.room.state.map.onAdd((tileID, index) => this.drawTile(tileID, index));
        this.room.state.map.forEach((tileID, index) => this.drawTile(tileID, index));

        // JUGADORES
        this.room.state.players.onAdd((p, sid) => this.createPlayerEntity(p, sid));
        this.room.state.players.onRemove((p, sid) => this.removePlayerEntity(sid));
        this.room.state.players.forEach((p, sid) => this.createPlayerEntity(p, sid)); // Cargar existentes

        // COMBATE
        this.room.onMessage("combat_text", (data) => this.showFloatingText(data));
    }

    drawTile(tileID, index) {
        if(this.drawnTiles.has(index)) return; // Evitar dibujar doble
        this.drawnTiles.add(index);

        const mapWidth = 20; // Ancho fijo del servidor
        const x = (index % mapWidth) * CONFIG.TILE_SIZE;
        const y = Math.floor(index / mapWidth) * CONFIG.TILE_SIZE;
        
        // 1. Bloque de Color (Garantía Visual)
        let color = 0x006400; // Verde Base
        if (tileID === 2) color = 0x808080; // Pared Gris
        if (tileID === 3) color = 0x8B4513; // Suelo Marrón
        
        this.add.rectangle(x + 16, y + 16, 32, 32, color).setDepth(0);

        // 2. Imagen (Si existe)
        if(this.textures.exists('world-tiles')) {
            this.add.image(x, y, 'world-tiles', tileID).setOrigin(0).setDepth(0.5);
        }
    }

    createPlayerEntity(p, sessionId) {
        if(this.otherPlayers[sessionId] || (sessionId === this.room.sessionId && this.player)) return;

        const isMe = (sessionId === this.room.sessionId);
        const container = this.add.container(p.x, p.y).setDepth(10);
        
        let sprite;
        if(this.textures.exists('player')) {
            sprite = this.add.sprite(0, 0, 'player', 0).setDisplaySize(32, 32);
        } else {
            sprite = this.add.rectangle(0, 0, 32, 32, isMe ? 0x0000ff : 0xff0000);
        }
        container.add(sprite);

        const nameTag = this.add.text(0, -25, p.nombre, { fontSize: '10px', color: '#fff', stroke: '#000', strokeThickness: 2 }).setOrigin(0.5);
        container.add(nameTag);
        container.sprite = sprite;

        if(isMe) {
            this.player = container;
            this.cameras.main.startFollow(container);
            this.cameras.main.setZoom(CONFIG.ZOOM_LEVEL);
            this.updateHUD(p);
        } else {
            this.otherPlayers[sessionId] = container;
        }

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
            if(this.player.sprite && dx !== 0) this.player.sprite.setFlipX(dx < 0);
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

const config = {
    type: Phaser.AUTO, backgroundColor: '#001100', parent: 'game-container',
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { pixelArt: true }, 
    scene: MythicaClient
};

const game = new Phaser.Game(config);
window.addEventListener('resize', () => game.scale.resize(window.innerWidth, window.innerHeight));
