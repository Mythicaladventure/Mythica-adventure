import Phaser from "phaser";
import * as Colyseus from "colyseus.js";

// ==========================================
// CONFIGURACIÓN ROBUSTA PARA MÓVILES
// ==========================================
class MythicaClient extends Phaser.Scene {
    constructor() {
        super("MythicaClient");
        // 1. CONEXIÓN A LA NUBE (Render)
        this.client = new Colyseus.Client("wss://mythica-adventure.onrender.com");
        this.room = null;
        this.player = null;     // Mi personaje local
        this.otherPlayers = {}; // Mapa de otros jugadores conectados
        this.tileSprites = [];  // Mapa visual
    }

    preload() {
        // Carga optimizada de assets
        this.load.spritesheet('world-tiles', 'client/assets/tileset.png', { frameWidth: 32, frameHeight: 32 });
        this.load.spritesheet('player', 'client/assets/player.png', { frameWidth: 32, frameHeight: 32 });
    }

    async create() {
        try {
            console.log("Conectando al servidor...");
            
            // Unirse a la sala oficial
            this.room = await this.client.joinOrCreate("mundo_mythica", { name: "Héroe Móvil" });
            console.log("¡Conexión exitosa!", this.room.sessionId);

            // ------------------------------------
            // A. RENDERIZADO DEL MAPA (Optimizado)
            // ------------------------------------
            this.room.state.map.onAdd((tileID, index) => {
                const x = (index % this.room.state.width) * 32;
                const y = Math.floor(index / this.room.state.width) * 32;
                
                // Creamos el tile y lo guardamos
                const tile = this.add.image(x, y, 'world-tiles', tileID).setOrigin(0);
                tile.setDepth(0); // Capa de suelo
                this.tileSprites[index] = tile;
            });

            // Actualización de tiles en tiempo real (si el mapa cambia)
            this.room.state.map.onChange((tileID, index) => {
                if (this.tileSprites[index]) {
                    this.tileSprites[index].setFrame(tileID);
                }
            });

            // ------------------------------------
            // B. GESTIÓN DE JUGADORES (Robusta)
            // ------------------------------------
            this.room.state.players.onAdd((playerState, sessionId) => {
                // Crear sprite
                const sprite = this.add.sprite(playerState.x, playerState.y, 'player');
                sprite.setDepth(10); // Capa de personajes (arriba del suelo)

                // ¿SOY YO O ES OTRO?
                if (sessionId === this.room.sessionId) {
                    this.player = sprite;
                    
                    // Cámara con seguimiento suave (0.1 de suavizado)
                    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
                    this.cameras.main.setZoom(1.5); // Zoom ideal para Pixel Art
                } else {
                    // Es otro jugador: Lo pintamos de rojo para diferenciar
                    sprite.setTint(0xff0000); 
                    this.otherPlayers[sessionId] = sprite;

                    // INTERPOLACIÓN (La clave de la fluidez)
                    // En lugar de moverlo de golpe, escuchamos cambios y lo deslizamos
                    playerState.onChange(() => {
                        this.tweens.add({
                            targets: sprite,
                            x: playerState.x,
                            y: playerState.y,
                            duration: 200, // 200ms para llegar al destino (suaviza el lag)
                            ease: 'Linear'
                        });
                    });
                }
            });

            // Eliminar jugadores que se desconectan
            this.room.state.players.onRemove((playerState, sessionId) => {
                if (this.otherPlayers[sessionId]) {
                    this.otherPlayers[sessionId].destroy();
                    delete this.otherPlayers[sessionId];
                }
            });

            // Corrección de posición (Anti-Cheat del servidor)
            this.room.onMessage("corregir_posicion", (pos) => {
                if (this.player) {
                    // Si el servidor dice que estamos mal, nos deslizamos a la posición real
                    this.tweens.add({
                        targets: this.player,
                        x: pos.x,
                        y: pos.y,
                        duration: 100
                    });
                }
            });

            // ------------------------------------
            // C. CONTROLES (Touch / Clic)
            // ------------------------------------
            this.input.on('pointerdown', (pointer) => {
                // Convertir toque de pantalla a coordenadas del mundo
                const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);

                // Enviar intención al servidor
                this.room.send("mover", {
                    x: worldPoint.x,
                    y: worldPoint.y
                });

                // Predicción local (Moverme inmediatamente para que se sienta rápido)
                // El servidor me corregirá si hago trampa
                if (this.player) {
                    this.tweens.add({
                        targets: this.player,
                        x: worldPoint.x,
                        y: worldPoint.y,
                        duration: 200 // Simular tiempo de caminata
                    });
                }
            });

        } catch (e) {
            console.error("Error crítico:", e);
            // Mostrar error en pantalla del celular
            this.add.text(10, 10, "ERROR DE CONEXIÓN", { fill: '#ff0000', backgroundColor: '#000' });
        }
    }
}

// Configuración de Phaser optimizada para tu Poco X7
const config = {
    type: Phaser.AUTO,
    backgroundColor: '#000000',
    scale: {
        mode: Phaser.Scale.FIT,      // Se ajusta a la pantalla sin deformar
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: 480,  // Resolución interna baja para rendimiento
        height: 640
    },
    render: {
        pixelArt: true, // ¡Vital para que los sprites se vean nítidos!
        antialias: false
    },
    scene: MythicaClient
};

const game = new Phaser.Game(config);
