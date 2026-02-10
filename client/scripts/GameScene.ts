import Phaser from 'phaser';
import TibiaLoader from './TibiaLoader';

export default class GameScene extends Phaser.Scene {
    loader: TibiaLoader;

    constructor() {
        super('GameScene');
        // Inicializamos el cargador
        this.loader = new TibiaLoader(this);
    }

    preload() {
        // Le pedimos al loader que cargue los archivos
        this.loader.preload();
    }

    create() {
        // Verificamos si cargaron
        this.loader.create();
        
        // Mensaje de bienvenida
        this.add.text(50, 50, 'Bienvenido a Mythical Adventure', { 
            fontSize: '20px',
            fontFamily: 'Arial'
        });
    }
}
