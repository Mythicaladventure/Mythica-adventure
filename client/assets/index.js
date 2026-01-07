import Phaser from "phaser";
import * as Colyseus from "colyseus.js";

class MythicaClient extends Phaser.Scene {
    constructor() { super("MythicaClient"); }

    preload() {
        // Usamos los nombres exactos que veo en tu carpeta assets
        this.load.image('pasto', 'assets/pasto y grama 001.png');
        this.load.image('piedra', 'assets/piedra 001.png');
        this.load.image('tierra', 'assets/caminos de tierra.png');
    }

    async create() {
        this.client = new Colyseus.Client("ws://localhost:2567");
        try {
            this.room = await this.client.joinOrCreate("game_room", { name: "Héroe" });
            
            // Creamos un suelo de prueba con tus imágenes
            for(let i=0; i<15; i++) {
                for(let j=0; j<15; j++) {
                    this.add.image(i*32, j*32, 'pasto').setOrigin(0);
                }
            }
            console.log("¡Mythica conectado!");
        } catch (e) { console.error("Error:", e); }
    }
}

const config = {
    type: Phaser.AUTO,
    width: 480,
    height: 640,
    parent: 'game-container',
    scene: MythicaClient
};
new Phaser.Game(config);
