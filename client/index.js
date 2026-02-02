import Phaser from "phaser";
import * as Colyseus from "colyseus.js";

class MythicaClient extends Phaser.Scene {
    constructor() {
        super("MythicaClient");
        // Dirección del servidor (ajusta si usas un host externo)
        this.client = new Colyseus.Client("ws://localhost:2567");
        this.room = null;
        this.player = null;
        this.tileSprites = []; 
    }

    preload() {
        // Carga de Spritesheets (32x32 píxeles)
        this.load.spritesheet('world-tiles', 'client/assets/tileset.png', {
            frameWidth: 32, frameHeight: 32
        });
        this.load.spritesheet('player', 'client/assets/player.png', {
            frameWidth: 32, frameHeight: 32
        });
    }

    async create() {
        try {
            // CORRECCIÓN: Nombre de sala sincronizado con el servidor
            this.room = await this.client.joinOrCreate("mundo_mythica", { name: "Héroe" });
            console.log("¡Conexión exitosa al Núcleo Mythica!");

            // --- RENDERIZADO DEL MAPA ---
            this.room.state.map.onAdd((tileID, index) => {
                const x = index % this.room.state.width;
                const y = Math.floor(index / this.room.state.width);
                const sprite = this.add.sprite(x * 32, y * 32, 'world-tiles', tileID).setOrigin(0);
                this.tileSprites[index] = sprite;
            });

            this.room.state.map.onChange((tileID, index) => {
                if (this.tileSprites[index]) this.tileSprites[index].setFrame(tileID);
            });

            // --- JUGADOR Y CÁMARA ---
            this.player = this.add.sprite(100, 100, 'player', 0).setOrigin(0.5);
            this.player.setDepth(10); 

            this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
            this.cameras.main.setZoom(1.5);

            // --- SISTEMA ANTI-CHEAT: Escuchar corrección de posición ---
            // Si el servidor detecta un movimiento ilegal, nos regresa
            this.room.onMessage("corregir_posicion", (serverPos) => {
                this.player.x = serverPos.x;
                this.player.y = serverPos.y;
            });

            // --- INPUT TÁCTIL (Poco X7) ---
            this.input.on('pointerdown', (pointer) => {
                // Convertimos el clic/touch en coordenadas del mundo
                const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
                
                // Enviamos la intención de movimiento al servidor
                this.room.send("mover", { 
                    x: worldPoint.x, 
                    y: worldPoint.y,
                    t: Date.now() 
                });

                // Movimiento predictivo local (para fluidez)
                this.player.x = worldPoint.x;
                this.player.y = worldPoint.y;
            });

        } catch (e) {
            console.error("Error de conexión:", e);
        }
    }
}

// Configuración optimizada para rendimiento móvil en Venezuela
const config = {
    type: Phaser.AUTO,
    backgroundColor: '#000000',
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: 480,
        height: 640
    },
    render: {
        pixelArt: true, // Evita difuminado en los bordes
        antialias: false
    },
    scene: MythicaClient
};

new Phaser.Game(config);
