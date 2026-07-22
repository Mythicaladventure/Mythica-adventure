/* ============================================================
 * BOOT SCENE: única responsable de cargar assets y mostrar
 * progreso real. Reemplaza el esquema anterior donde el HTML
 * intentaba "adivinar" cuándo Phaser estaba listo mediante
 * eventos custom - ahora usamos this.load (LoaderPlugin) de
 * Phaser directamente, que es la fuente de verdad nativa y
 * bien probada del framework.
 * ============================================================ */
class BootScene extends Phaser.Scene {
    constructor() { super({ key: 'BootScene' }); }

    preload() {
        // --- Barra de carga visual (para que se sienta como un juego real) ---
        const { width, height } = this.scale;
        const boxW = 320, boxH = 28;
        const boxX = width / 2 - boxW / 2, boxY = height / 2 - boxH / 2;

        this.add.text(width / 2, boxY - 50, 'MYTHICAL ADVENTURE', {
            fontFamily: 'Cinzel, serif', fontSize: '28px', color: '#d4af37'
        }).setOrigin(0.5);

        const progressBox = this.add.graphics();
        progressBox.fillStyle(0x1a1a1a, 0.9);
        progressBox.fillRect(boxX, boxY, boxW, boxH);
        progressBox.lineStyle(2, 0xd4af37, 1);
        progressBox.strokeRect(boxX, boxY, boxW, boxH);

        const progressBar = this.add.graphics();
        const loadingText = this.add.text(width / 2, boxY + boxH + 24, 'Cargando... 0%', {
            fontFamily: 'Roboto, sans-serif', fontSize: '14px', color: '#d4af37'
        }).setOrigin(0.5);

        this.load.on('progress', (value) => {
            progressBar.clear();
            progressBar.fillStyle(0xd4af37, 1);
            progressBar.fillRect(boxX + 4, boxY + 4, (boxW - 8) * value, boxH - 8);
            loadingText.setText('Cargando... ' + Math.round(value * 100) + '%');
        });

        // Si CUALQUIER asset falla, lo mostramos explícitamente en vez de
        // quedar colgado en silencio (causa raíz de varios bugs anteriores).
        this.load.on('loaderror', (file) => {
            console.error('Fallo al cargar asset:', file.key, file.src);
            loadingText.setText('Error cargando: ' + file.key);
            loadingText.setColor('#ff4444');
            window.dispatchEvent(new CustomEvent('game-connect-error', {
                detail: 'No se pudo cargar un recurso gráfico (' + file.key + ')'
            }));
        });

        // --- Assets reales del juego ---
        this.load.spritesheet('tiles', ASSET_BASE + 'assets/sprites/tiles_nuevo_v2_vivo.png', { frameWidth: 32, frameHeight: 32 });

        // Fase 3: personaje recoloreado con paleta viva (azul/dorado) +
        // transparencia real (el original usaba magenta como color-key,
        // sin canal alpha - eso se corrigió en el recoloreado también).
        this.load.spritesheet('chars', ASSET_BASE + 'assets/sprites/hero_v1.png', { frameWidth: 32, frameHeight: 32 });

        // Fase 2: decoración (árboles/flores), bioma "bosque" para
        // combinar con el césped actual. Cada uno es una imagen individual
        // (no spritesheet) porque los tamaños varían (árboles 64x96,
        // flores/rocas 32x32) - más simple que forzar un atlas uniforme.
        const decorBase = ASSET_BASE + 'assets/sprites/nature_biomas/bosque/';
        DECOR_IDS.forEach(id => {
            this.load.image('decor_' + id, decorBase + 'OBJ_' + String(id).padStart(3, '0') + '.png');
        });

        // Fase 4: monstruos (generados por código, mismo criterio que
        // paredes/agua: control total, sin depender de un atlas externo
        // desconocido).
        MONSTER_TYPES.forEach(tipo => {
            this.load.image('monster_' + tipo, ASSET_BASE + 'assets/sprites/monsters/MONSTER_' + tipo.toUpperCase() + '.png');
        });
    }

    create() {
        // 'complete' del LoaderPlugin es el evento NATIVO de Phaser que
        // garantiza que preload() terminó por completo (éxito o error
        // manejado) - mucho más confiable que sincronizar manualmente con
        // el HTML mediante flags/timeouts propios, que es lo que causaba
        // las condiciones de carrera anteriores.
        this.scene.start('GameScene');
    }
}
