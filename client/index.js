/* =============================================================================
   ⚔️ MYTHICAL ADVENTURE CLIENT v7.0 (JOYSTICK FIX & CITY UPDATE)
   =============================================================================
*/

const CONFIG = {
    TILE_SIZE: 32,
    MOVE_SPEED: 250,
    ZOOM_LEVEL: 1.4, // Un poco más lejos para ver la ciudad
    CAMERA_LERP: 0.1
};

class MythicaClient extends Phaser.Scene {
    constructor() {
        super("MythicaClient");
        this.client = new Colyseus.Client("wss://mythica-adventure.onrender.com");
        this.room = null;
        this.player = null;
        this.otherPlayers = {};
        this.userData = { name: "Guest", role: "knight" };
        this.drawnTiles = new Set();
        
        this.joystick = null;
        this.cursorKeys = null;
        this.isGameActive = false;
    }

    preload() {
        console.log("📥 Cargando recursos...");
        const baseURL = "https://mythicaladventure.github.io/Mythica-adventure/";

        this.load.spritesheet('world-tiles', baseURL + 'client/assets/sprites/otsp_tiles_01.png', { frameWidth: 32, frameHeight: 32 });
        this.load.spritesheet('player', baseURL + 'client/assets/sprites/otsp_creatures_01.png', { frameWidth: 32, frameHeight: 32 });
    }

    create() {
        console.log("⚡ Motor Gráfico Iniciado.");
        this.add.rectangle(0, 0, 4000, 4000, 0x050505).setOrigin(0).setDepth(-100); // Fondo Negro Infinito

        window.addEventListener('start-game', (e) => this.handleLogin(e.detail));
        window.addEventListener('game-action', (e) => this.handleInput(e.detail));

        this.cursorKeys = this.input.keyboard.createCursorKeys();
        
        // Crear Joystick al inicio (invisible)
        this.initJoystick();
        
        // Ajustar Joystick si cambia la pantalla
        this.scale.on('resize', this.resizeJoystick, this);
    }

    async handleLogin(credentials) {
        this.userData = credentials;
        
        const loadingContainer = this.add.container(this.cameras.main.centerX, this.cameras.main.centerY).setScrollFactor(0).setDepth(10000);
        const bg = this.add.rectangle(0, 0, 300, 100, 0x000000, 0.8);
        const txt = this.add.text(0, 0, "VIAJANDO A LA CAPITAL...", { fontSize: '18px', color: '#ffd700' }).setOrigin(0.5);
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
        // ESCUCHAR MAPA GRANDE
        this.room.onMessage("force_map_load", (data) => {
            console.log("📦 CIUDAD RECIBIDA:", data.length, "bloques");
            data.forEach(item => this.drawTile(item.t, item.i));
        });

        // JUGADORES
        this.room.state.players.onAdd((p, sid) => this.createPlayerEntity(p, sid));
        this.room.state.players.onRemove((p, sid) => this.removePlayerEntity(sid));
        this.room.state.players.forEach((p, sid) => this.createPlayerEntity(p, sid));

        // COMBATE
        this.room.onMessage("combat_text", (data) => this.showFloatingText(data));
    }

    drawTile(tileID, index) {
        if(this.drawnTiles.has(index)) return;
        this.drawnTiles.add(index);

        const mapWidth = 80; // ANCHO DEL NUEVO MAPA
        const x = (index % mapWidth) * CONFIG.TILE_SIZE;
        const y = Math.floor(index / mapWidth) * CONFIG.TILE_SIZE;
        
        // Bloque Base (Por si falla la imagen)
        let color = 0x113311; // Pasto oscuro
        if (tileID === 2) color = 0x555555; // Pared
        if (tileID === 3) color = 0x887755; // Piedra

        this.add.rectangle(x + 16, y + 16, 32, 32, color).setDepth(0);

        if(this.textures.exists('world-tiles')) {
            // Mapeo básico de tiles (Ajustar según tu imagen PNG real)
            // ID 1 (Pasto) -> Frame 0
            // ID 2 (Pared) -> Frame 5 (Ejemplo)
            // ID 3 (Piedra) -> Frame 2 (Ejemplo)
            let frame = 0; 
            if(tileID === 2) frame = 6; // Pared
            if(tileID === 3) frame = 2; // Piedra
            
            this.add.image(x, y, 'world-tiles', frame).setOrigin(0).setDepth(0.5);
        }
    }

    createPlayerEntity(p, sessionId) {
        if(this.otherPlayers[sessionId] || (sessionId === this.room.sessionId && this.player)) return;

        const isMe = (sessionId === this.room.sessionId);
        const container = this.add.container(p.x, p.y).setDepth(10);
        
        // Sombra del personaje
        const shadow = this.add.ellipse(0, 10, 20, 10, 0x000000, 0.5);
        container.add(shadow);

        // SPRITE VISIBLE
        let sprite;
        if(this.textures.exists('player')) {
            // 🔥 TRUCO: Si la skin es 0 (invisible), usamos la 7 (Guerrero)
            // Si eres Mago, usamos la 13 (ejemplo).
            let visualSkin = 7; 
            if (this.userData.role === 'mage') visualSkin = 13;
            if (p.skin > 0) visualSkin = p.skin;

            sprite = this.add.sprite(0, -10, 'player', visualSkin).setDisplaySize(48, 48);
        } else {
            sprite = this.add.rectangle(0, 0, 32, 32, isMe ? 0x0000ff : 0xff0000);
        }
        container.add(sprite);

        // Nombre y Gremio
        const nameTag = this.add.text(0, -45, p.nombre, { 
            fontSize: '10px', fontFamily: 'Verdana', color: '#ffffff', stroke: '#000', strokeThickness: 3 
        }).setOrigin(0.5);
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

    // =========================================================================
    // 🕹️ JOYSTICK REPARADO (POSICIÓN FORZADA ABAJO-IZQUIERDA)
    // =========================================================================
    initJoystick() {
        if (this.plugins.get('rexVirtualJoystickPlugin') || window.rexvirtualjoystickplugin) {
            const plugin = this.plugins.get('rexVirtualJoystickPlugin') || window.rexvirtualjoystickplugin;
            
            // Calculamos posición basada en la ventana actual
            const joyX = 120;
            const joyY = window.innerHeight - 120;

            this.joystick = plugin.add(this, {
                x: joyX,
                y: joyY,
                radius: 60,
                base: this.add.circle(0, 0, 60, 0x888888, 0.3).setDepth(9999).setScrollFactor(0).setStrokeStyle(2, 0xffb700),
                thumb: this.add.circle(0, 0, 30, 0xcccccc, 0.8).setDepth(10000).setScrollFactor(0),
                dir: '8dir', 
                forceMin: 16
            }).on('update', this.handleJoystick, this);
            
            this.joystick.setVisible(false); // Se activa al loguear
        }
    }

    resizeJoystick() {
        if(this.joystick) {
            this.joystick.setPosition(120, window.innerHeight - 120);
        }
    }

    handleJoystick() {
        if(!this.player || !this.isGameActive) return;
        const cursors = this.joystick.createCursorKeys();
        let dx=0, dy=0;
        if (cursors.right.isDown) dx=1; else if (cursors.left.isDown) dx=-1;
        if (cursors.down.isDown) dy=1; else if (cursors.up.isDown) dy=-1;
        
        if (dx !== 0 || dy !== 0) {
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
    type: Phaser.AUTO, backgroundColor: '#000000', parent: 'game-container',
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { pixelArt: true }, 
    scene: MythicaClient
};

const game = new Phaser.Game(config);
window.addEventListener('resize', () => game.scale.resize(window.innerWidth, window.innerHeight));
