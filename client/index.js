/* CLIENTE v16.0 - REDISEÑO: carga real con Phaser nativo, sin eventos improvisados */

// ============================================================
// BOOT SCENE: única responsable de cargar assets y mostrar
// progreso real. Reemplaza el esquema anterior donde el HTML
// intentaba "adivinar" cuándo Phaser estaba listo mediante
// eventos custom - ahora usamos this.load (LoaderPlugin) de
// Phaser directamente, que es la fuente de verdad nativa y
// bien probada del framework.
// ============================================================
class BootScene extends Phaser.Scene {
    constructor() { super({ key: 'BootScene' }); }

    preload() {
        const base = "https://mythicaladventure.github.io/Mythica-adventure/client/";

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

        // --- Assets reales del juego (antes vivían en GameScene.preload) ---
        this.load.spritesheet('tiles', base + 'assets/sprites/tiles_nuevo_v2_vivo.png', { frameWidth: 32, frameHeight: 32 });
        this.load.spritesheet('chars', base + 'assets/sprites/otsp_creatures_01.png', { frameWidth: 32, frameHeight: 32 });
        this.load.binary('otsp-dat', base + 'Assets/Mythical/otsp.dat');
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

// UI (Joystick)
class UIScene extends Phaser.Scene {
    constructor() { super({ key: 'UIScene', active: true }); }
    create() {
        if (this.plugins.get('rexVirtualJoystickPlugin')) {
            // Joystick invisible (o muy sutil) para no tapar la estética
            this.joystick = this.plugins.get('rexVirtualJoystickPlugin').add(this, {
                x: 120, y: this.scale.height - 120, radius: 60,
                base: this.add.circle(0,0,60,0x000,0.2).setStrokeStyle(2, 0xffffff),
                thumb: this.add.circle(0,0,30,0xffffff,0.5),
                dir: '8dir', forceMin: 16
            });
            this.scale.on('resize', (s) => this.joystick.setPosition(120, s.height - 120));
        }
    }
    getCursorKeys() { return this.joystick ? this.joystick.createCursorKeys() : null; }
}

// JUEGO
class GameScene extends Phaser.Scene {
    constructor() { super({ key: 'GameScene' }); }
    init() {
        this.client = new Colyseus.Client("wss://mythica-adventure.onrender.com");
        this.players = {}; this.mapChunks = new Set();
        this.groups = { floor: null, walls: null, chars: null };
    }

    // Los assets ya están cargados por BootScene - GameScene ya no necesita
    // preload() propio, evitando duplicar la lógica de carga.

    async create() {
        try {
            // FONDO NEGRO DE TIBIA
            this.add.rectangle(0, 0, 4000, 4000, 0x000000).setOrigin(0).setDepth(-100);

            this.groups.floor = this.add.group();
            this.groups.walls = this.add.group();
            this.groups.chars = this.add.group();

            this.createAnims();
            this.uiScene = this.scene.get('UIScene');

            window.addEventListener('start-game', (e) => this.connect(e.detail));

            // BootScene ya garantizó que todos los assets están cargados
            // antes de arrancar esta escena (this.scene.start('GameScene')
            // solo se llama en BootScene.create(), que a su vez solo corre
            // tras el evento nativo 'complete' del loader de Phaser). Este
            // punto es entonces la señal real y confiable de que el juego
            // está listo para recibir el click de ENTRAR.
            window.dispatchEvent(new CustomEvent('game-ready'));
        } catch (e) {
            // Si algo revienta acá, antes la escena quedaba a medias en silencio
            // total (sin listener, sin aviso). Ahora se reporta explícitamente.
            console.error('Error inicializando GameScene.create():', e);
            window.dispatchEvent(new CustomEvent('game-connect-error', {
                detail: 'Error inicializando el juego: ' + (e && e.message ? e.message : e)
            }));
        }
    }

    async connect(userData) {
        // Evita crear una SEGUNDA conexión fantasma si el jugador le da a
        // REINTENTAR mientras el primer intento sigue colgado en segundo
        // plano (sin resolver ni fallar todavía).
        if (this._connecting) {
            console.warn('Ya hay un intento de conexión en curso, se ignora el nuevo click.');
            return;
        }
        this._connecting = true;

        try {
            // FIX: joinOrCreate() puede quedarse colgado indefinidamente si
            // el servidor está a medio reiniciar (ej. durante un deploy) sin
            // emitir un error de red claro. Promise.race fuerza un límite
            // real de 85s, así SIEMPRE resolvemos o fallamos explícitamente,
            // sincronizado con el timeout visual de 90s del HTML.
            const timeout = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Tiempo de espera agotado (85s) esperando al servidor')), 85000)
            );
            this.room = await Promise.race([
                this.client.joinOrCreate("mundo_mythica", userData),
                timeout
            ]);
            this.mySessionId = this.room.sessionId;

            document.getElementById('login-overlay').style.display = 'none';
            window.dispatchEvent(new CustomEvent('game-connect-success'));

            this.room.onMessage("map_chunk", (d) => d.forEach(t => this.renderStack(t.i, t.s)));
            this.room.state.players.onAdd((p, i) => this.addPlayer(p, i));
            this.room.state.players.onRemove((p, i) => this.removePlayer(i));
            this.room.state.players.forEach((p, i) => this.addPlayer(p, i));
            this.room.onMessage("combat_text", (d) => this.showDmg(d));
        } catch (e) {
            console.error('Error de conexión al servidor:', e);
            window.dispatchEvent(new CustomEvent('game-connect-error', {
                detail: (e && e.message) ? e.message : 'No se pudo conectar al servidor (puede estar dormido, reintenta en 1 minuto)'
            }));
        } finally {
            this._connecting = false;
        }
    }

    update() {
        if (!this.room || !this.players[this.mySessionId]) return;
        const me = this.players[this.mySessionId];
        const cursors = this.uiScene.getCursorKeys();

        if (cursors) {
            let dx=0, dy=0, dir=0;
            if (cursors.left.isDown) { dx=-1; dir=1; } else if (cursors.right.isDown) { dx=1; dir=2; }
            if (cursors.up.isDown) { dy=-1; dir=3; } else if (cursors.down.isDown) { dy=1; dir=0; }

            if (dx!==0 || dy!==0) {
                this.room.send("mover", { x: me.container.x + (dx*4), y: me.container.y + (dy*4), dir });
            }
        }
    }

    renderStack(index, items) {
        if(this.mapChunks.has(index)) return;
        this.mapChunks.add(index);
        const x = (index % 20) * 32;
        const y = Math.floor(index / 20) * 32;

        items.forEach(id => {
            let frame=0, group=this.groups.floor, depth=0;
            
            // MAPEO PARA "TEMPLE CITY"
            if(id===4) { frame=8; } // Agua (azul en tu png?)
            if(id===1) { frame=0; } // Pasto
            if(id===3) { frame=1; } // Piso Losa (Gris claro)
            if(id===2) { frame=6; group=this.groups.walls; depth=y; } // Pared

            const img = this.add.image(x, y, 'tiles', frame).setOrigin(0).setDepth(depth);
            // Tinte gris removido: las paredes ahora tienen arte real (arenisca
            // cálida) con su propia paleta viva - el tinte las apagaba sin motivo.
        });
    }

    addPlayer(p, id) {
        if(this.players[id]) return;
        const container = this.add.container(p.x, p.y).setDepth(p.y+10);
        
        const skin = p.skin || 7;
        const sprite = this.add.sprite(0, -10, 'chars', skin).setDisplaySize(48,48);
        const name = this.add.text(0, -40, p.nombre, { fontSize:'10px', fontFamily:'Verdana' }).setOrigin(0.5);

        container.add([sprite, name]);
        this.players[id] = { container, sprite };

        if(id === this.mySessionId) {
            this.cameras.main.startFollow(container, true, 0.1, 0.1);
            this.cameras.main.setZoom(2.0); // ZOOM TIPO TIBIA
        }

        p.onChange(() => {
            this.tweens.add({ targets:container, x:p.x, y:p.y, duration:100 });
            container.setDepth(p.y+10);
            if(p.isMoving) {
                if(p.direction===0) sprite.play('walk-down', true);
                else if(p.direction===1) sprite.play('walk-left', true);
                else if(p.direction===2) sprite.play('walk-right', true);
                else if(p.direction===3) sprite.play('walk-up', true);
            } else sprite.stop();
        });
    }
    removePlayer(i) { if(this.players[i]) { this.players[i].container.destroy(); delete this.players[i]; } }
    showDmg(d) { 
        const t = this.add.text(d.x, d.y-20, d.val, { fontSize:'12px', color:'#f00' }).setOrigin(0.5).setDepth(9999);
        this.tweens.add({ targets:t, y:d.y-50, alpha:0, duration:500, onComplete:()=>t.destroy() });
    }
    createAnims() {
        if(this.anims.exists('walk-down')) return;
        this.anims.create({ key:'walk-down', frames:this.anims.generateFrameNumbers('chars', { start:0, end:3 }), frameRate:8, repeat:-1 });
        this.anims.create({ key:'walk-up', frames:this.anims.generateFrameNumbers('chars', { start:12, end:15 }), frameRate:8, repeat:-1 });
        this.anims.create({ key:'walk-left', frames:this.anims.generateFrameNumbers('chars', { start:4, end:7 }), frameRate:8, repeat:-1 });
        this.anims.create({ key:'walk-right', frames:this.anims.generateFrameNumbers('chars', { start:8, end:11 }), frameRate:8, repeat:-1 });
    }
}
const config = { type:Phaser.AUTO, parent:'game-view', backgroundColor:'#000', 
    scale:{ mode:Phaser.Scale.RESIZE, autoCenter:Phaser.Scale.CENTER_BOTH },
    render:{ pixelArt:true, roundPixels:true }, scene:[BootScene, UIScene, GameScene] };
const game = new Phaser.Game(config);
