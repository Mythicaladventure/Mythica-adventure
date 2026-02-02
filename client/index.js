import Phaser from "phaser";
import * as Colyseus from "colyseus.js";

class MythicaClient extends Phaser.Scene {
    constructor() {
        super("MythicaClient");
        this.client = new Colyseus.Client("ws://localhost:2567");
        this.room = null;
        this.player = null;
    }

    preload() {
        // Cargamos el Tileset (32x32 es el estándar de Tibia)
        // Asegúrate de tener este archivo en client/assets/tileset.png
        this.load.spritesheet('world-tiles', 'client/assets/tileset.png', {
            frameWidth: 32,
            frameHeight: 32
        });

        // Sprite del jugador (puedes usar un tileset de personajes luego)
        this.load.spritesheet('player', 'client/assets/player.png', {
            frameWidth: 32,
            frameHeight: 32
        });
    }

    async create() {
        try {
            this.room = await this.client.joinOrCreate("game_room", { name: "Héroe" });
            console.log("¡Conectado a Mythica-adventure!");

            // 1. GENERACIÓN DEL MAPA
            const levelMap = [
                [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
                [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
                [1, 0, 2, 2, 2, 0, 0, 0, 0, 1],
                [1, 0, 0, 0, 0, 0, 1, 1, 0, 1],
                [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
            ];

            // Dibujamos el suelo
            levelMap.forEach((row, y) => {
                row.forEach((tileID, x) => {
                    this.add.sprite(x * 32, y * 32, 'world-tiles', tileID).setOrigin(0);
                });
            });

            // 2. CREACIÓN DEL JUGADOR
            // Lo creamos con profundidad (depth) para que siempre esté sobre el suelo
            this.player = this.add.sprite(100, 100, 'player', 0).setOrigin(0);
            this.player.setDepth(10);

            // 3. CONFIGURACIÓN DE CÁMARA (Nivel Profesional)
            this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
            this.cameras.main.setZoom(1.5); // Un poco de zoom para ver mejor el pixel art

        } catch (e) {
            console.error("Error de conexión:", e);
        }
    }

    update() {
        // Aquí añadiremos el sistema de movimiento por clicks/touch más adelante
        // para que sea fiel al estilo de Tibia y Lawl.
    }
}

const config = {
    type: Phaser.AUTO,
    backgroundColor: '#000000',
    scale: {
        mode: Phaser.Scale.FIT, // Escala automáticamente para móviles
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: 480,
        height: 640
    },
    render: {
        pixelArt: true, // Vital para la estética retro
        antialias: false
    },
    scene: MythicaClient
};

new Phaser.Game(config);
        
