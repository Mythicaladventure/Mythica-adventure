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
        this.load.spritesheet('tiles', base + 'assets/sprites/otsp_tiles_01.png', { frameWidth: 32, frameHeight: 32 });
        this.load.spritesheet('chars', base + 'assets/sprites/otsp_creatures_01.png', { frameWidth: 32, frameHeight: 32 });
        
        // Carga silenciosa de .dat (sin bloquear)
        this.load.binary('otsp-dat', base + 'otsp.dat');
    }

    async create() {
        // FONDO NEGRO DE TIBIA
        this.add.rectangle(0, 0, 4000, 4000, 0x000000).setOrigin(0).setDepth(-100);

        this.groups.floor = this.add.group();
        this.groups.walls = this.add.group();
        this.groups.chars = this.add.group();

        this.createAnims();
        this.uiScene = this.scene.get('UIScene');

        window.addEventListener('start-game', (e) => this.connect(e.detail));
    }

    async connect(userData) {
        try {
            this.room = await this.client.joinOrCreate("mundo_mythica", userData);
            this.mySessionId = this.room.sessionId;
            
            document.getElementById('login-overlay').style.display = 'none';

            this.room.onMessage("map_chunk", (d) => d.forEach(t => this.renderStack(t.i, t.s)));
            this.room.state.players.onAdd((p, i) => this.addPlayer(p, i));
            this.room.state.players.onRemove((p, i) => this.removePlayer(i));
            this.room.state.players.forEach((p, i) => this.addPlayer(p, i));
            this.room.onMessage("combat_text", (d) => this.showDmg(d));
        } catch (e) { alert("Error Conexión"); }
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
