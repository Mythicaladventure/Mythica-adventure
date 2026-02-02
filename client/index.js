import Phaser from "phaser";
import * as Colyseus from "colyseus.js";

class MythicaClient extends Phaser.Scene {
    constructor() {
        super("MythicaClient");
        this.client = new Colyseus.Client("ws://localhost:2567");
        this.room = null;
        this.player = null;
        this.tileSprites = []; 
    }

    preload() {
        this.load.spritesheet('world-tiles', 'client/assets/tileset.png', {
            frameWidth: 32, frameHeight: 32
        });
        this.load.spritesheet('player', 'client/assets/player.png', {
            frameWidth: 32, frameHeight: 32
        });
    }

    async create() {
        try {
            this.room = await this.client.joinOrCreate("game_room", { name: "Héroe" });
            console.log("¡Conexión Sincronizada!");

            this.room.state.map.onAdd((tileID, index) => {
                const x = index % this.room.state.width;
                const y = Math.floor(index / this.room.state.width);
                const sprite = this.add.sprite(x * 32, y * 32, 'world-tiles', tileID).setOrigin(0);
                this.tileSprites[index] = sprite;
            });

            this.room.state.map.onChange((tileID, index) => {
                if (this.tileSprites[index]) {
                    this.tileSprites[index].setFrame(tileID);
                }
            });

            this.player = this.add.sprite(64, 64, 'player', 0).setOrigin(0);
            this.player.setDepth(10); 
            this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
            this.cameras.main.setZoom(1.5);

        } catch (e) {
            console.error("Error en la conexión:", e);
        }
    }
}

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
        pixelArt: true,
        antialias: false
    },
    scene: MythicaClient
};

new Phaser.Game(config);
