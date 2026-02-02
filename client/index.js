import Phaser from "phaser";
import * as Colyseus from "colyseus.js";

// ==========================================
// CLIENTE MYTHICA: FUSIÓN FINAL (Mapa + Joystick + UI)
// ==========================================
class MythicaClient extends Phaser.Scene {
    constructor() {
        super("MythicaClient");
        this.client = new Colyseus.Client("wss://mythica-adventure.onrender.com");
        this.room = null;
        this.player = null;      // Mi personaje (Sprite)
        this.otherPlayers = {};  // Otros jugadores
        this.tileSprites = [];   // Array del mapa visual
        this.joystick = null;    // Referencia al Joystick
    }

    preload() {
        // 1. CARGAMOS EL PLUGIN DEL JOYSTICK (Nuevo)
        this.load.plugin('rexvirtualjoystickplugin', 'https://raw.githubusercontent.com/rexrainbow/phaser3-rex-notes/master/dist/rexvirtualjoystickplugin.min.js', true);

        // 2. CARGAMOS TUS ASSETS ORIGINALES (Manteniendo tu estilo)
        this.load.spritesheet('world-tiles', 'client/assets/tileset.png', { frameWidth: 32, frameHeight: 32 });
        this.load.spritesheet('player', 'client/assets/player.png', { frameWidth: 32, frameHeight: 32 });
    }

    async create() {
        try {
            console.log("Conectando al Núcleo Mythica...");
            
            // Unirse a la sala
            this.room = await this.client.joinOrCreate("mundo_mythica", { name: "Héroe Móvil" });
            console.log("¡Conectado!", this.room.sessionId);

            // ------------------------------------
            // A. RENDERIZADO DEL MAPA (TU CÓDIGO ORIGINAL)
            // ------------------------------------
            this.room.state.map.onAdd((tileID, index) => {
                const x = (index % this.room.state.width) * 32;
                const y = Math.floor(index / this.room.state.width) * 32;
                
                // Creamos el tile
                const tile = this.add.image(x, y, 'world-tiles', tileID).setOrigin(0);
                tile.setDepth(0); // Suelo
                this.tileSprites[index] = tile;
            });

            // Actualización de tiles en tiempo real
            this.room.state.map.onChange((tileID, index) => {
                if (this.tileSprites[index]) {
                    this.tileSprites[index].setFrame(tileID);
                }
            });

            // ------------------------------------
            // B. GESTIÓN DE JUGADORES (SPRITES + BARRA DE VIDA)
            // ------------------------------------
            this.room.state.players.onAdd((playerState, sessionId) => {
                // Creamos el sprite real (no un cuadrado)
                const sprite = this.add.sprite(playerState.x, playerState.y, 'player');
                sprite.setDepth(10); // Personajes arriba del suelo

                // ¿SOY YO?
                if (sessionId === this.room.sessionId) {
                    this.player = sprite;
                    
                    // Cámara MMORPG (Zoom y Seguimiento)
                    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
                    this.cameras.main.setZoom(1.5); 

                    // Conectar con la BARRA DE VIDA HTML
                    playerState.onChange(() => {
                        const hpBar = document.getElementById('hp-bar');
                        // Si el HP cambia, actualizamos el ancho del div rojo
                        if (hpBar) hpBar.style.width = playerState.hp + '%';
                    });

                } else {
                    // OTROS JUGADORES (Enemigos/Aliados)
                    sprite.setTint(0xffaaaa); // Un tono rojizo para diferenciarlos
                    this.otherPlayers[sessionId] = sprite;

                    // Interpolación Anti-Lag (Suavizado de movimiento ajeno)
                    playerState.onChange(() => {
                        this.tweens.add({
                            targets: sprite,
                            x: playerState.x,
                            y: playerState.y,
                            duration: 200 // 200ms de suavizado
                        });
                    });
                }
            });

            this.room.state.players.onRemove((playerState, sessionId) => {
                if (this.otherPlayers[sessionId]) {
                    this.otherPlayers[sessionId].destroy();
                    delete this.otherPlayers[sessionId];
                }
            });

            // ------------------------------------
            // C. CONTROLES: JOYSTICK + BOTONES HTML
            // ------------------------------------
            
            // 1. JOYSTICK VIRTUAL (Fijo en pantalla)
            this.joystick = this.plugins.get('rexvirtualjoystickplugin').add(this, {
                x: 80, y: 500, // Posición ajustada para la esquina inferior izquierda
                radius: 50,
                base: this.add.circle(0, 0, 50, 0x888888, 0.5),
                thumb: this.add.circle(0, 0, 25, 0xcccccc, 0.8),
                dir: '8dir',
                forceMin: 16
            }).on('update', this.handleJoystickMove, this);

            // ¡TRUCO DE EXPERTO! Usamos setScrollFactor(0) para que el Joystick sea HUD
            // Así, aunque la cámara se mueva por el mapa, el joystick se queda quieto en tu pantalla.
            this.joystick.base.setScrollFactor(0).setDepth(100);
            this.joystick.thumb.setScrollFactor(0).setDepth(100);


            // 2. ESCUCHAR BOTONES DE LA UI (HTML)
            // Esto recibe el evento "game-action" que envían los botones que pegaste en el HTML
            window.addEventListener('game-action', (e) => {
                const action = e.detail;
                console.log("Botón presionado:", action);
                
                if (action === 'ATTACK' && this.player) {
                    // Efecto visual de golpe
                    this.tweens.add({ targets: this.player, scale: 1.3, duration: 50, yoyo: true });
                    // Enviar al servidor
                    this.room.send("attack"); 
                }
                
                if (action === 'HEAL') {
                     // Aquí podrías enviar this.room.send("use_item", {id: "potion"})
                     this.player.setTint(0x00ff00); // Efecto visual verde temporal
                     this.time.delayedCall(200, () => this.player.clearTint());
                }
            });

            // Anti-Cheat (Corrección del servidor)
            this.room.onMessage("corregir_posicion", (pos) => {
                if (this.player) {
                    this.tweens.add({ targets: this.player, x: pos.x, y: pos.y, duration: 100 });
                }
            });

        } catch (e) {
            console.error("Error al iniciar:", e);
        }
    }

    // Loop principal (se ejecuta 60 veces por segundo)
    update() {
        if (this.player && this.joystick) {
            this.handleJoystickMove();
        }
    }

    // Lógica de movimiento del Joystick
    handleJoystickMove() {
        const cursorKeys = this.joystick.createCursorKeys();
        let moveX = 0;
        let moveY = 0;

        if (cursorKeys.up.isDown) moveY = -1;
        if (cursorKeys.down.isDown) moveY = 1;
        if (cursorKeys.left.isDown) moveX = -1;
        if (cursorKeys.right.isDown) moveX = 1;

        if (moveX !== 0 || moveY !== 0) {
            // Predicción Local (Para que se sienta instantáneo)
            const speed = 4; // Velocidad de movimiento
            this.player.x += moveX * speed;
            this.player.y += moveY * speed;

            // Enviar coordenadas al servidor
            this.room.send("mover", { x: this.player.x, y: this.player.y });
        }
    }
}

// Configuración Optimizada para Móvil + Pixel Art
const config = {
    type: Phaser.AUTO,
    backgroundColor: '#000000', // Fondo negro mientras carga
    scale: {
        mode: Phaser.Scale.FIT,       // Ajustar a pantalla sin deformar
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: 480,  // Resolución interna (estilo retro)
        height: 640
    },
    render: {
        pixelArt: true, // ¡CRUCIAL PARA QUE SE VEA COMO TIBIA!
        antialias: false
    },
    scene: MythicaClient
};

const game = new Phaser.Game(config);
