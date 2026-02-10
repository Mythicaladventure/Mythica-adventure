import Phaser from 'phaser';
import TibiaLoader from './TibiaLoader';

export default class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
    }

    preload() {
        new TibiaLoader(this).preload();
    }

    create() {
        new TibiaLoader(this).create();
        this.add.text(100, 100, 'Bienvenido a Mythical Adventure', { fontSize: '20px' });
    }
}

