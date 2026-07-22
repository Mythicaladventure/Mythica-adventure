/* ============================================================
 * GAME SCENE: conexión al servidor, renderizado del mapa, jugadores,
 * monstruos y decoración, movimiento, combate y chat.
 *
 * Los assets ya están cargados por BootScene - esta escena ya NO
 * hace su propio preload(), evitando duplicar la lógica de carga.
 * ============================================================ */
class GameScene extends Phaser.Scene {
    constructor() { super({ key: 'GameScene' }); }

    init() {
        this.client = new Colyseus.Client(SERVER_URL);
        this.players = {}; this.mapChunks = new Set(); this.monsters = {};
        this.groups = { floor: null, walls: null, chars: null };
    }

    create_keyboard() {
        // Respaldo de teclado (flechas / WASD) independiente del joystick
        // táctil - así el movimiento funciona en escritorio sin depender
        // de que el plugin táctil esté disponible/funcionando.
        this.keys = this.input.keyboard.addKeys({
            up: Phaser.Input.Keyboard.KeyCodes.UP, down: Phaser.Input.Keyboard.KeyCodes.DOWN,
            left: Phaser.Input.Keyboard.KeyCodes.LEFT, right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
            w: Phaser.Input.Keyboard.KeyCodes.W, a: Phaser.Input.Keyboard.KeyCodes.A,
            s: Phaser.Input.Keyboard.KeyCodes.S, d: Phaser.Input.Keyboard.KeyCodes.D,
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
            this.create_keyboard();

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

            // Fase 4: monstruos reales
            this.room.state.monsters.onAdd((m, id) => this.addMonster(m, id));
            this.room.state.monsters.onRemove((m, id) => this.removeMonster(id));
            this.room.state.monsters.forEach((m, id) => this.addMonster(m, id));

            // Botón de ataque (⚔️) y curación (H) del HTML.
            window.addEventListener('game-action', (e) => {
                if (e.detail === 'ATTACK') this.attackNearestMonster();
                else if (e.detail === 'HEAL') this.room.send('heal');
            });

            // Chat: se envía de verdad al servidor y se muestra cuando el
            // servidor lo retransmite a todos (incluido uno mismo).
            window.addEventListener('game-chat-send', (e) => {
                if (this.room && e.detail) this.room.send('chat', { msg: e.detail });
            });
            this.room.onMessage('chat', (d) => {
                const log = document.getElementById('chat-log');
                if (log) {
                    const div = document.createElement('div');
                    div.textContent = d.nombre + ': ' + d.msg;
                    log.appendChild(div);
                    log.scrollTop = log.scrollHeight;
                }
            });

            // Fase 2: decoración estática (árboles/flores) - ver
            // DECOR_PLACEMENTS en config.js. Client-side por ahora, no
            // afecta colisión todavía (eso llega cuando el servidor maneje
            // la capa de objetos de forma autoritativa).
            this.placeDecorations();
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

        let dx = 0, dy = 0, dir = null;

        // Teclado primero (fuente confiable en escritorio, no depende de
        // ningún plugin externo).
        if (this.keys) {
            if (this.keys.left.isDown || this.keys.a.isDown) { dx = -1; dir = 1; }
            else if (this.keys.right.isDown || this.keys.d.isDown) { dx = 1; dir = 2; }
            if (this.keys.up.isDown || this.keys.w.isDown) { dy = -1; dir = 3; }
            else if (this.keys.down.isDown || this.keys.s.isDown) { dy = 1; dir = 0; }
        }

        // Si no hubo input de teclado, probar el joystick táctil (si existe)
        if (dx === 0 && dy === 0) {
            const cursors = this.uiScene.getCursorKeys();
            if (cursors) {
                if (cursors.left.isDown) { dx = -1; dir = 1; } else if (cursors.right.isDown) { dx = 1; dir = 2; }
                if (cursors.up.isDown) { dy = -1; dir = 3; } else if (cursors.down.isDown) { dy = 1; dir = 0; }
            }
        }

        if (dx !== 0 || dy !== 0) {
            this.room.send("mover", { x: me.container.x + (dx * 4), y: me.container.y + (dy * 4), dir });
        }
    }

    renderStack(index, items) {
        if (this.mapChunks.has(index)) return;
        this.mapChunks.add(index);
        const x = (index % 20) * 32;
        const y = Math.floor(index / 20) * 32;

        items.forEach(id => {
            const mapping = TILE_FRAME_MAP[id];
            if (!mapping) return; // id desconocido - no dibujar nada en vez de asumir un frame por defecto incorrecto

            const group = mapping.isWall ? this.groups.walls : this.groups.floor;
            const depth = mapping.isWall ? y : 0;

            this.add.image(x, y, 'tiles', mapping.frame).setOrigin(0).setDepth(depth);
        });
    }

    placeDecorations() {
        DECOR_PLACEMENTS.forEach(({ id, tileX, tileY }) => {
            const px = tileX * 32 + 16;   // centro horizontal de la celda
            const py = tileY * 32 + 32;   // borde inferior de la celda (base)
            const img = this.add.image(px, py, 'decor_' + id).setOrigin(0.5, 1);
            // Profundidad = Y para que el jugador pueda pasar "detrás" o
            // "delante" de un árbol correctamente según su posición vertical,
            // igual que las paredes.
            img.setDepth(py);
        });
    }

    addPlayer(p, id) {
        if (this.players[id]) return;
        const container = this.add.container(p.x, p.y).setDepth(p.y + 10);

        const skin = p.skin || 7;
        const sprite = this.add.sprite(0, -10, 'chars', skin).setDisplaySize(48, 48);
        const name = this.add.text(0, -40, p.nombre, { fontSize: '10px', fontFamily: 'Verdana' }).setOrigin(0.5);

        // Barra de vida del jugador (propio y ajeno).
        const barBg = this.add.rectangle(0, -30, 32, 4, 0x000000, 0.6);
        const barFg = this.add.rectangle(-16, -30, 32, 4, 0x3ddc3d).setOrigin(0, 0.5);

        container.add([sprite, name, barBg, barFg]);
        this.players[id] = { container, sprite, barFg };

        if (id === this.mySessionId) {
            // FIX: sin límites, la cámara sigue al jugador libremente y con
            // zoom 2x en una ventana ancha, termina mostrando el "vacío"
            // más allá del borde del mapa (640x640px reales) como una gran
            // zona negra - no era un fallo de renderizado, faltaba decirle
            // a la cámara dónde termina el mundo.
            this.cameras.main.setBounds(0, 0, MAP_PIXEL_WIDTH, MAP_PIXEL_HEIGHT);
            this.cameras.main.startFollow(container, true, 0.1, 0.1);
            this.cameras.main.setZoom(2.0); // ZOOM TIPO TIBIA
        }

        p.onChange(() => {
            this.tweens.add({ targets: container, x: p.x, y: p.y, duration: 100 });
            container.setDepth(p.y + 10);
            if (p.isMoving) {
                if (p.direction === 0) sprite.play('walk-down', true);
                else if (p.direction === 1) sprite.play('walk-left', true);
                else if (p.direction === 2) sprite.play('walk-right', true);
                else if (p.direction === 3) sprite.play('walk-up', true);
            } else sprite.stop();

            const ratio = Math.max(0, p.hp / p.maxHp);
            barFg.width = 32 * ratio;
            barFg.fillColor = ratio > 0.5 ? 0x3ddc3d : (ratio > 0.2 ? 0xd4af37 : 0xe23b3b);
        });
    }
    removePlayer(i) { if (this.players[i]) { this.players[i].container.destroy(); delete this.players[i]; } }

    addMonster(m, id) {
        if (this.monsters[id]) return;
        const texKey = 'monster_' + (m.tipo || 'slime_green');
        const container = this.add.container(m.x + 16, m.y + 16).setDepth(m.y + 5);

        const sprite = this.add.image(0, 0, texKey);
        const barBg = this.add.rectangle(0, -22, 28, 5, 0x000000, 0.6);
        const barFg = this.add.rectangle(-14, -22, 28, 5, 0xe23b3b).setOrigin(0, 0.5);

        container.add([sprite, barBg, barFg]);
        this.monsters[id] = { container, barFg, maxHp: m.maxHp };

        m.onChange(() => {
            const ratio = Math.max(0, m.hp / this.monsters[id].maxHp);
            barFg.width = 28 * ratio;
        });
    }

    removeMonster(id) {
        if (this.monsters[id]) { this.monsters[id].container.destroy(); delete this.monsters[id]; }
    }

    attackNearestMonster() {
        const me = this.players[this.mySessionId];
        if (!me || !this.room) return;
        const meX = me.container.x, meY = me.container.y;

        let closestId = null, closestDist = Infinity;
        Object.entries(this.monsters).forEach(([id, mo]) => {
            const dist = Math.hypot(mo.container.x - meX, mo.container.y - meY);
            if (dist < closestDist) { closestDist = dist; closestId = id; }
        });

        // Rango de ataque cuerpo a cuerpo: 50px, apenas mayor al rango de
        // contraataque de los monstruos (40px, ver server/index.ts). Antes
        // era 90px, lo que permitía golpear sin nunca recibir daño de
        // vuelta ("kiting" gratuito) - se ajustó para que el combate sea
        // de dos vías real. Este valor DEBE coincidir con el chequeo
        // servidor - si se cambia acá sin cambiar el servidor, el jugador
        // vería el intento de ataque fallar en silencio.
        if (closestId && closestDist < 50) {
            this.room.send("attack", { targetId: closestId });
        }
    }

    showDmg(d) {
        const color = d.color || '#f00';
        const t = this.add.text(d.x, d.y - 20, d.val, { fontSize: '12px', color }).setOrigin(0.5).setDepth(9999);
        this.tweens.add({ targets: t, y: d.y - 50, alpha: 0, duration: 500, onComplete: () => t.destroy() });
    }

    createAnims() {
        if (this.anims.exists('walk-down')) return;
        this.anims.create({ key: 'walk-down', frames: this.anims.generateFrameNumbers('chars', { start: 0, end: 3 }), frameRate: 8, repeat: -1 });
        this.anims.create({ key: 'walk-up', frames: this.anims.generateFrameNumbers('chars', { start: 12, end: 15 }), frameRate: 8, repeat: -1 });
        this.anims.create({ key: 'walk-left', frames: this.anims.generateFrameNumbers('chars', { start: 4, end: 7 }), frameRate: 8, repeat: -1 });
        this.anims.create({ key: 'walk-right', frames: this.anims.generateFrameNumbers('chars', { start: 8, end: 11 }), frameRate: 8, repeat: -1 });
    }
}
