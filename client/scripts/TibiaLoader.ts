import Phaser from 'phaser';

export default class TibiaLoader {
    scene: Phaser.Scene;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    preload() {
        // Explicación de la ruta:
        // ../  -> Sube a la carpeta 'Cliente'
        // ../  -> Sube a la raíz 'Mythical-Adventure'
        // Assets/Mythical -> Entra a la carpeta donde están tus archivos
        this.scene.load.binary('otsp_dat', '../../Assets/Mythical/otsp.dat');
        this.scene.load.binary('otsp_spr', '../../Assets/Mythical/otsp.spr');
    }

    create() {
        if (!this.scene.cache.binary.exists('otsp_spr')) {
            console.error("❌ ERROR CRÍTICO: No se encuentran los archivos en ../../Assets/Mythical");
            this.scene.add.text(10, 10, 'ERROR DE CARGA: Revisa la consola', { fill: '#ff0000', backgroundColor: '#000' });
            return;
        }

        console.log("✅ SYSTEM: Archivos de Tibia detectados y cargados en memoria.");
        this.scene.add.text(10, 10, '✅ Assets Cargados', { fill: '#00ff00', backgroundColor: '#000' });
        
        // Aquí procesaremos los sprites en el futuro
        this.debugSpriteInfo();
    }

    debugSpriteInfo() {
        const buffer = this.scene.cache.binary.get('otsp_spr');
        const view = new DataView(buffer);
        // Tibia SPR signature check (primeros 4 bytes)
        const signature = view.getUint32(0, true); 
        console.log(`Firma del archivo SPR: ${signature.toString(16)}`);
    }
}
