import Phaser from 'phaser';

export default class TibiaLoader {
    scene: Phaser.Scene;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    preload() {
        // CORRECCIÓN DE RUTA: 
        // Estamos en "Cliente/", así que usamos "../" para salir a la raíz y entrar en "Assets"
        this.scene.load.binary('otsp_dat', '../Assets/Mythical/otsp.dat');
        this.scene.load.binary('otsp_spr', '../Assets/Mythical/otsp.spr');
    }

    create() {
        // Verificación visual en pantalla
        if (!this.scene.cache.binary.exists('otsp_spr')) {
            this.scene.add.text(20, 20, '❌ ERROR: Ruta incorrecta', { fill: '#ff0000', backgroundColor: '#000' });
            console.error("No se encuentran los archivos en ../Assets/Mythical");
        } else {
            this.scene.add.text(20, 20, '✅ Assets de Tibia Cargados', { fill: '#00ff00', backgroundColor: '#000' });
            console.log("Sistema listo.");
        }
    }
}

