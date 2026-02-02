import Phaser from "phaser";
import * as Colyseus from "colyseus.js";

// =============================================================================
// MOTOR CLIENTE MYTHICA - VERSIÓN "PRO MAX" (RPG CORE + VISUALS + PERSISTENCIA)
// =============================================================================
class MythicaClient extends Phaser.Scene {
    constructor() {
        super("MythicaClient");
        
        // --- CONEXIÓN Y RED ---
        this.client = new Colyseus.Client("wss://mythica-adventure.onrender.com");
        this.room = null;
        
        // --- ESTADO DEL JUGADOR ---
        this.player = null;          // Mi contenedor (Sprite + UI)
        this.otherPlayers = {};      // Mapa de otros jugadores
        this.userData = { name: "Guest", role: "knight" }; // Datos del Login
        
        // --- INPUTS ---
        this.joystick = null;
        this.cursorKeys = null;
        this.isGameActive = false;   // Bloqueo de seguridad hasta loguearse
        
        // --- CONFIGURACIÓN TIBIA (GRID) ---
        this.tileSize = 32;
        this.moveSpeed = 250;        // Ms por paso (Sincronizado con servidor)
        this.isMoving = false;       // Semáforo de movimiento
    }

    // 1. CARGA DE RECURSOS (PRELOAD ROBUSTO)
    preload() {
        // Carga segura del plugin Joystick
        const urlJoystick = 'https://raw.githubusercontent.com/rexrainbow/phaser3-rex-notes/master/dist/rexvirtualjoystickplugin.min.js';
        this.load.plugin('rexvirtualjoystickplugin', urlJoystick, true);

        // Assets Gráficos
        this.load.spritesheet('world-tiles', 'client/assets/tileset.png', { frameWidth: 32, frameHeight: 32 });
        this.load.spritesheet('player', 'client/assets/player.png', { frameWidth: 64, frameHeight: 64 }); 
        
        // Asset de respaldo (Pixel blanco) para evitar crash si faltan imágenes
        this.load.image('pixel', 'https://labs.phaser.io/assets/sprites/white_pixel.png');
    }

    // 2. INICIALIZACIÓN (MOTOR GRÁFICO)
    create() {
        console.log("⚡ Motor Gráfico Iniciado. Esperando credenciales...");
        
        // Crear suelo base (Para que no se vea negro mientras carga)
        this.createProceduralGround();

        // A. LISTENER DE LOGIN (HTML -> PHASER)
        // Espera a que el usuario presione "Crear Personaje" en la interfaz HTML
        window.addEventListener('start-game', (e) => {
            console.log("✅ Credenciales recibidas:", e.detail);
            this.userData = e.detail; // Guardamos Nombre y Clase
            this.connectToServer();   // Iniciamos la conexión real
        });

        // B. LISTENER DE ACCIONES (HTML UI -> PHASER)
        window.addEventListener('game-action', (e) => this.handleGameAction(e.detail));

        // C. INICIALIZAR INPUTS (Ocultos por ahora)
        this.initInputSystem();
    }

    // 3. CONEXIÓN AL SERVIDOR (HANDSHAKE)
    async connectToServer() {
        // Feedback visual de carga
        const loadingTxt = this.add.text(this.cameras.main.centerX, this.cameras.main.centerY, "CONECTANDO AL REINO...", {
            fontFamily: 'Verdana', fontSize: '20px', color: '#ffd700', stroke: '#000', strokeThickness: 4
        }).setOrigin(0.5).setScrollFactor(0).setDepth(9999);

        try {
            // Conexión enviando los datos del Login para crear/cargar personaje
            this.room = await this.client.joinOrCreate("mundo_mythica", { 
                name: this.userData.name,
                role: this.userData.role 
            });

            console.log("🚀 Conexión Exitosa. ID Sesión:", this.room.sessionId);
            
            // Limpieza de UI
            loadingTxt.destroy();
            this.isGameActive = true;
            
            // Ocultar Login HTML, Mostrar HUD de Juego
            if(document.getElementById('login-screen')) document.getElementById('login-screen').style.display = 'none';
            if(document.getElementById('game-ui')) document.getElementById('game-ui').style.display = 'block';

            // Mostrar Joystick
            if(this.joystick) this.joystick.setVisible(true);

            // INICIAR SISTEMAS DEL JUEGO
            this.initMapSystem();
            this.initPlayerSystem();
            this.initCombatVisuals();

        } catch (error) {
            console.error("❌ Error de Conexión:", error);
            loadingTxt.setText("ERROR DE CONEXIÓN.\nRevisa tu internet o servidor.");
            loadingTxt.setColor('#ff0000');
        }
    }

    // --- SISTEMAS MODULARES ---

    initMapSystem() {
        // Renderizado del mapa enviado por el servidor
        this.room.state.map.onAdd((tileID, index) => {
            const x = (index % this.room.state.width) * this.tileSize;
            const y = Math.floor(index / this.room.state.width) * this.tileSize;
            
            if(this.textures.exists('world-tiles')) {
                const tile = this.add.image(x, y, 'world-tiles', tileID).setOrigin(0).setDepth(0);
                // Aquí podrías guardar referencia si necesitas actualizar tiles después
            }
        });
    }

    initPlayerSystem() {
        // Crear animaciones globales
        if(this.textures.exists('player') && !this.anims.exists('walk')) {
            this.anims.create({
                key: 'walk', frames: this.anims.generateFrameNumbers('player', { start: 0, end: 3 }),
                frameRate: 8, repeat: -1
            });
        }

        this.room.state.players.onAdd((p, sessionId) => {
            const isMe = (sessionId === this.room.sessionId);
            
            // 1. CONTENEDOR (Agrupa Sprite + Nombre + Vida)
            const container = this.add.container(p.x, p.y);
            container.setDepth(p.y); // Profundidad isométrica

            // 2. SPRITE VISUAL
            let sprite;
            if (this.textures.exists('player')) {
                sprite = this.add.sprite(0, 0, 'player').setDisplaySize(32, 32);
            } else {
                // Fallback si no hay imagen
                sprite = this.add.rectangle(0, 0, 32, 32, isMe ? 0x00ff00 : 0xff0000);
            }
            container.add(sprite);

            // 3. BARRA DE VIDA FLOTANTE (Estilo Tibia)
            const hpBg = this.add.rectangle(0, -25, 34, 6, 0x000000); // Fondo negro
            const hpBar = this.add.rectangle(-16, -25, 32, 4, 0x00ff00).setOrigin(0, 0.5); // Barra verde
            container.add([hpBg, hpBar]);

            // 4. NOMBRE Y NIVEL
            const nameLabel = this.add.text(0, -40, `${p.nombre}`, {
                fontFamily: 'Arial', fontSize: '11px', color: '#ffffff', 
                stroke: '#000000', strokeThickness: 3
            }).setOrigin(0.5);
            container.add(nameLabel);

            // Referencias internas
            container.sprite = sprite;
            container.hpBar = hpBar;

            if (isMe) {
                this.player = container;
                // Cámara MMORPG (Zoom Táctico)
                this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
                this.cameras.main.setZoom(1.6);
                
                // Actualizar HUD HTML inicial
                this.updateHTMLHUD(p.hp, p.maxHp, p.mp, p.maxMp);
            } else {
                this.otherPlayers[sessionId] = container;
                if(sprite.setTint) sprite.setTint(0xffaaaa); // Tinte rojizo para otros
            }

            // --- SINCRONIZACIÓN DE CAMBIOS (SERVER -> CLIENTE) ---
            p.onChange(() => {
                // Movimiento Suave (Interpolación)
                this.tweens.add({
                    targets: container, x: p.x, y: p.y, duration: this.moveSpeed,
                    onUpdate: () => container.setDepth(container.y) // Actualizar capa Z
                });

                // Actualizar Barra de Vida Visual
                const pct = Math.max(0, p.hp / p.maxHp);
                this.tweens.add({ targets: hpBar, width: 32 * pct, duration: 200 });
                
                // Color dinámico (Verde -> Amarillo -> Rojo)
                hpBar.fillColor = pct > 0.5 ? 0x00ff00 : (pct > 0.2 ? 0xffff00 : 0xff0000);

                // Si soy yo, actualizo la interfaz HTML grande
                if (isMe) this.updateHTMLHUD(p.hp, p.maxHp, p.mp, p.maxMp);
            });
        });

        // Limpieza al desconectar jugadores
        this.room.state.players.onRemove((p, sid) => {
            if (this.otherPlayers[sid]) {
                this.otherPlayers[sid].destroy();
                delete this.otherPlayers[sid];
            }
        });
    }

    initCombatVisuals() {
        // Escucha eventos de "texto flotante" del servidor
        this.room.onMessage("combat_text", (data) => {
            const { x, y, value, type } = data;
            
            let color = '#ffffff';
            let fontSize = '14px';
            
            if (type === 'DAMAGE') { color = '#ff3333'; fontSize = '15px'; } // Rojo
            if (type === 'HEAL') { color = '#00ff00'; fontSize = '15px'; }   // Verde
            if (type === 'MANA') { color = '#0088ff'; }                      // Azul

            const txt = this.add.text(x, y - 30, value, {
                fontFamily: 'Verdana', fontSize: fontSize, color: color, 
                stroke: '#000', strokeThickness: 3, fontWeight: 'bold'
            }).setOrigin(0.5).setDepth(9999);

            // Animación de "Salto y Caída" (Gravedad simulada)
            this.tweens.add({
                targets: txt, y: y - 70, duration: 800, ease: 'Back.easeOut',
                onComplete: () => {
                    this.tweens.add({ targets: txt, alpha: 0, y: y - 90, duration: 200, onComplete: () => txt.destroy() });
                }
            });
        });
    }

    initInputSystem() {
        // 1. Joystick Virtual (Rex Plugin)
        if (this.plugins.get('rexVirtualJoystick')) {
            this.joystick = this.plugins.get('rexvirtualjoystickplugin').add(this, {
                x: 80, y: window.innerHeight - 100, radius: 60,
                base: this.add.circle(0, 0, 60, 0x888888, 0.3).setStrokeStyle(2, 0xffffff),
                thumb: this.add.circle(0, 0, 30, 0xcccccc, 0.8),
                dir: '4dir', forceMin: 16
            });
            // Fijar a pantalla (HUD)
            this.joystick.base.setScrollFactor(0).setDepth(2000);
            this.joystick.thumb.setScrollFactor(0).setDepth(2001);
            this.joystick.setVisible(false); // Oculto hasta login
        }

        // 2. Teclado (Backup para PC)
        this.cursorKeys = this.input.keyboard.createCursorKeys();
    }

    handleGameAction(action) {
        if (!this.room || !this.player) return;

        if (action === 'ATTACK') {
            this.room.send("attack");
            // Feedback visual local inmediato
            this.tweens.add({ targets: this.player.sprite, scale: 1.2, duration: 50, yoyo: true });
        }
        if (action === 'HEAL' || action === 'SPELL_1') {
            this.room.send("use_spell", { id: "exura" });
        }
    }

    updateHTMLHUD(hp, maxHp, mp, maxMp) {
        const hpBar = document.getElementById('hp-bar');
        const mpBar = document.getElementById('mp-bar');
        const hpText = document.getElementById('hp-text');
        
        if (hpBar && maxHp > 0) {
            const pctHp = (hp / maxHp) * 100;
            hpBar.style.width = `${pctHp}%`;
            if(hpText) hpText.innerText = `${Math.floor(hp)}/${maxHp}`;
        }
        if (mpBar && maxMp > 0) {
            mpBar.style.width = `${(mp / maxMp) * 100}%`;
        }
    }

    createProceduralGround() {
        // Genera un fondo infinito para referencia visual
        for(let x = 0; x < 60; x++) {
            for(let y = 0; y < 60; y++) {
                const color = (x + y) % 2 === 0 ? 0x003300 : 0x004400; // Patrón ajedrez
                this.add.rectangle(x * 32, y * 32, 32, 32, color).setOrigin(0).setDepth(-1);
            }
        }
    }

    // 4. BUCLE PRINCIPAL (GAME LOOP)
    update() {
        if (!this.player || !this.isGameActive || this.isMoving) return;

        // Leer Input (Joystick o Teclado)
        let dx = 0, dy = 0;
        
        if (this.joystick) {
            const joy = this.joystick.createCursorKeys();
            if (joy.right.isDown) dx = 1;
            else if (joy.left.isDown) dx = -1;
            else if (joy.down.isDown) dy = 1;
            else if (joy.up.isDown) dy = -1;
        }

        // Backup Teclado
        if (dx === 0 && dy === 0) {
            if (this.cursorKeys.right.isDown) dx = 1;
            else if (this.cursorKeys.left.isDown) dx = -1;
            else if (this.cursorKeys.down.isDown) dy = 1;
            else if (this.cursorKeys.up.isDown) dy = -1;
        }

        // Ejecutar Movimiento (GRID)
        if (dx !== 0 || dy !== 0) {
            this.isMoving = true;
            const tx = this.player.x + (dx * this.tileSize);
            const ty = this.player.y + (dy * this.tileSize);
            
            // Animación Sprite
            if (this.player.sprite) {
                if (dx < 0) this.player.sprite.setFlipX(true);
                if (dx > 0) this.player.sprite.setFlipX(false);
                if (this.player.sprite.play && this.anims.exists('walk')) this.player.sprite.play('walk', true);
            }

            // Movimiento Predictivo Cliente
            this.tweens.add({
                targets: this.player, x: tx, y: ty, duration: this.moveSpeed,
                onComplete: () => { this.isMoving = false; }
            });

            // Enviar al Servidor
            this.room.send("mover", { x: tx, y: ty });
        } else {
            // Parar animación si no se mueve
            if (this.player.sprite && this.player.sprite.anims && this.player.sprite.anims.isPlaying) {
                this.player.sprite.stop();
            }
        }
    }
}

// Configuración Global Phaser
const config = {
    type: Phaser.AUTO,
    backgroundColor: '#000000',
    parent: 'game-container',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: window.innerWidth, height: window.innerHeight },
    render: { pixelArt: true, antialias: false, roundPixels: true },
    scene: MythicaClient
};

const game = new Phaser.Game(config);
window.addEventListener('resize', () => game.scale.resize(window.innerWidth, window.innerHeight));
