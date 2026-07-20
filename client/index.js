/* CLIENTE v15.0 - PROTOTIPO VISUAL */

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

    preload() {
        const base = "https://mythicaladventure.github.io/Mythica-adventure/client/";
        // ARTE PROPIO v2 - paleta viva bioma bosque
        this.load.spritesheet('tiles', base + 'assets/sprites/tiles_nuevo_v2_vivo.png', { frameWidth: 32, frameHeight: 32 });
        this.load.spritesheet('chars', base + 'assets/sprites/otsp_creatures_01.png', { frameWidth: 32, frameHeight: 32 });

        // FIX: la ruta anterior (base + 'otsp.dat') no existía -> 404 -> el loader
        // se quedaba colgado y create() nunca corría, dejando el botón ENTRAR sin
        // ningún listener activo (parecía "no reaccionar"). Ruta real corregida:
        this.load.binary('otsp-dat', base + 'Assets/Mythical/otsp.dat');

        // Si CUALQUIER asset falla, avisamos explícitamente en vez de quedar en
        // silencio - así el jugador ve un mensaje real en vez de un botón muerto.
        this.load.on('loaderror', (file) => {
            console.error('Fallo al cargar asset:', file.key, file.src);
            window.dispatchEvent(new CustomEvent('game-connect-error', {
                detail: 'No se pudo cargar un recurso gráfico (' + file.key + ')'
            }));
        });
    }

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

            // FIX CRÍTICO: preload()+create() de Phaser corren de forma ASÍNCRONA
            // en segundo plano (new Phaser.Game() no espera a que terminen). El
            // HTML anterior habilitaba el botón ENTRAR solo cuando los <script>
            // terminaban de DESCARGARSE, no cuando Phaser terminaba de preparar
            // la escena real. Eso dejaba una ventana donde el botón se veía
            // habilitado pero el listener de 'start-game' AÚN no existía -> el
            // dispatchEvent() se perdía en silencio, sin error, sin red, sin nada.
            // Ahora avisamos explícitamente cuando el listener YA está registrado.
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
            if(group===this.groups.walls) img.setTint(0xcccccc);
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
    render:{ pixelArt:true, roundPixels:true }, scene:[UIScene, GameScene] };
const game = new Phaser.Game(config);
