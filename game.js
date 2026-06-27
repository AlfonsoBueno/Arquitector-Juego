/* ============================================================================
   ARQUITECTOR contra los FUNCIONARIOS DE URBANISMO
   Runner horizontal estilo Dino de Chrome. Vanilla JS + Canvas, sin librerias.
   ========================================================================== */
(() => {
'use strict';

// ------------------------------------------------------------------ Canvas
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const CW = canvas.width;   // 960
const CH = canvas.height;  // 540
ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = 'high';

const GROUND_Y = 470;      // linea del suelo (pies de los personajes)

// ------------------------------------------------------------------ Assets
const ASSETS = {
  player_run1:  'assets/player_run1.png',
  player_run2:  'assets/player_run2.png',
  player_run3:  'assets/player_run3.png',
  player_jump:  'assets/player_jump.png',
  player_shoot: 'assets/player_shoot.png',
  player_hit:   'assets/player_hit.png',
  explosion:    'assets/explosion.png',
  smoke:        'assets/smoke.png',
  enemy1_run1:  'assets/enemy1_run1.png',
  enemy1_run2:  'assets/enemy1_run2.png',
  enemy1_run3:  'assets/enemy1_run3.png',
  enemy2_run1:  'assets/enemy2_run1.png',
  enemy2_run2:  'assets/enemy2_run2.png',
  enemy2_run3:  'assets/enemy2_run3.png',
  enemy3_run1:  'assets/enemy3_run1.png',
  enemy3_run2:  'assets/enemy3_run2.png',
  enemy3_run3:  'assets/enemy3_run3.png',
  bg_sky:       'assets/bg_sky.png',
  bg_far:       'assets/bg_far.png',
  bg_near:      'assets/bg_near.png',
};
const IMG = {};
let assetsLoaded = 0;
const assetsTotal = Object.keys(ASSETS).length;

function loadAssets(done) {
  for (const key in ASSETS) {
    const im = new Image();
    im.onload = () => { assetsLoaded++; if (assetsLoaded === assetsTotal) done(); };
    im.onerror = () => { im._failed = true; assetsLoaded++; if (assetsLoaded === assetsTotal) done(); };
    im.src = ASSETS[key];
    IMG[key] = im;
  }
}

// ------------------------------------------------------------------ Audio (sintetizado, sin ficheros)
const Audio = (() => {
  let ac = null, master = null, musicGain = null, sfxGain = null;
  let muted = false, musicOn = true;
  let musicTimer = null, musicStep = 0;

  function ensure() {
    if (ac) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
    musicGain = ac.createGain(); musicGain.gain.value = 0.18; musicGain.connect(master);
    sfxGain = ac.createGain(); sfxGain.gain.value = 0.5; sfxGain.connect(master);
  }
  function resume() { if (ac && ac.state === 'suspended') ac.resume(); }

  function blip(freq, dur, type, gain, slideTo) {
    if (!ac || muted) return;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, ac.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), ac.currentTime + dur);
    g.gain.setValueAtTime(0.0001, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(gain || 0.3, ac.currentTime + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    o.connect(g); g.connect(sfxGain);
    o.start(); o.stop(ac.currentTime + dur + 0.02);
  }
  function noise(dur, gain, filterFreq) {
    if (!ac || muted) return;
    const n = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ac.createBufferSource(); src.buffer = buf;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq || 1200;
    const g = ac.createGain(); g.gain.value = gain || 0.4;
    src.connect(f); f.connect(g); g.connect(sfxGain);
    src.start();
  }

  const SFX = {
    jump:   () => blip(420, 0.18, 'square', 0.25, 760),
    shoot:  () => { blip(900, 0.08, 'square', 0.18, 200); noise(0.07, 0.18, 2500); },
    explosion: () => { noise(0.35, 0.6, 900); blip(120, 0.3, 'sawtooth', 0.25, 40); },
    hit:    () => { blip(200, 0.25, 'sawtooth', 0.4, 60); noise(0.2, 0.3, 700); },
    dodge:  () => blip(1200, 0.07, 'sine', 0.12, 1700),
    point:  () => blip(1400, 0.05, 'sine', 0.10),
    start:  () => { blip(523,0.1,'square',0.2); setTimeout(()=>blip(784,0.12,'square',0.2),110); setTimeout(()=>blip(1046,0.16,'square',0.2),240); },
    over:   () => { blip(440,0.18,'sawtooth',0.3,330); setTimeout(()=>blip(330,0.2,'sawtooth',0.3,220),160); setTimeout(()=>blip(220,0.35,'sawtooth',0.3,110),340); },
  };

  // Musica: linea de bajo + arpegio sencillo en bucle (chiptune)
  const bass = [55, 55, 73.42, 65.41];           // A1 A1 D2 C2
  const arp  = [220, 277.18, 329.63, 277.18, 261.63, 329.63, 392, 329.63]; // A C# E ...
  function musicTick() {
    if (!ac || muted || !musicOn) return;
    const t = ac.currentTime;
    if (musicStep % 2 === 0) {
      const b = bass[(musicStep / 2) % bass.length | 0];
      tone(b, 0.36, 'triangle', 0.5, t);
    }
    const a = arp[musicStep % arp.length];
    tone(a, 0.14, 'square', 0.10, t);
    musicStep++;
  }
  function tone(freq, dur, type, gain, t) {
    const o = ac.createOscillator(); const g = ac.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(musicGain);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function startMusic() {
    if (!ac || musicTimer) return;
    musicStep = 0;
    musicTimer = setInterval(musicTick, 180);
  }
  function stopMusic() { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } }

  return {
    init: ensure, resume,
    sfx: (name) => { ensure(); if (SFX[name]) SFX[name](); },
    startMusic: () => { ensure(); startMusic(); },
    stopMusic,
    toggleMute: () => { muted = !muted; return muted; },
    isMuted: () => muted,
  };
})();

// ------------------------------------------------------------------ Input
const Input = { jumpQueued: false, shootHeld: false, shootQueued: false };
const keys = {};

function pressJump() { Input.jumpQueued = true; Audio.resume(); }
function pressShoot() { Input.shootQueued = true; Input.shootHeld = true; Audio.resume(); }
function releaseShoot() { Input.shootHeld = false; }

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  if (k === ' ' || k === 'arrowup' || k === 'w') { e.preventDefault(); onAnyAction(); pressJump(); }
  else if (k === 'x' || k === 'j' || k === 'k' || k === 'control' || k === 'arrowdown' || k === 'f') { e.preventDefault(); onAnyAction(); pressShoot(); }
  else if (k === 'm') { const m = Audio.toggleMute(); }
  else if (k === 'enter') { onAnyAction(); }
  keys[k] = true;
});
window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'x' || k === 'j' || k === 'k' || k === 'control' || k === 'arrowdown' || k === 'f') releaseShoot();
  keys[k] = false;
});

// raton: click izquierdo dispara; arriba/espacio salta. Pero damos opcion: click = disparo.
canvas.addEventListener('mousedown', (e) => {
  e.preventDefault();
  onAnyAction();
  if (e.button === 2) pressJump();
  else pressShoot();
});
canvas.addEventListener('mouseup', () => releaseShoot());
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// tactil: tercio izquierdo = saltar, resto = disparar
function touchToAction(touch) {
  const rect = canvas.getBoundingClientRect();
  const x = (touch.clientX - rect.left) / rect.width;
  onAnyAction();
  if (x < 0.35) pressJump(); else pressShoot();
}
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  for (const t of e.changedTouches) touchToAction(t);
}, { passive: false });
canvas.addEventListener('touchend', (e) => { e.preventDefault(); releaseShoot(); }, { passive: false });

// cualquier accion en TITLE/GAMEOVER avanza el estado
function onAnyAction() {
  if (game.state === 'TITLE') startGame();
  else if (game.state === 'GAMEOVER' && game.overCooldown <= 0) startGame();
}

// ------------------------------------------------------------------ Utilidades
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const choose = (arr) => arr[Math.floor(Math.random() * arr.length)];

// dibuja imagen anclada por la base-centro, escalada por 'scale'
function drawSprite(img, cx, baseY, scale, flip, alpha) {
  if (!img || img._failed) return;
  const w = img.width * scale, h = img.height * scale;
  ctx.save();
  if (alpha != null) ctx.globalAlpha = alpha;
  ctx.translate(cx, baseY - h);
  if (flip) { ctx.translate(w, 0); ctx.scale(-1, 1); }
  ctx.drawImage(img, 0, 0, w, h);
  ctx.restore();
}

// ------------------------------------------------------------------ Estado del juego
const game = {
  state: 'LOADING',      // LOADING | TITLE | PLAYING | GAMEOVER
  speed: 4.6,
  baseSpeed: 4.6,
  elapsed: 0,            // segundos jugando
  score: 0,
  best: parseInt(localStorage.getItem('arquitector_best') || '0', 10) || 0,
  lives: 3,
  spawnTimer: 0,
  spawnInterval: 1.5,
  overCooldown: 0,
  shake: 0,
  titleT: 0,
};

const enemies = [];
const bullets = [];
const particles = [];
const floaters = [];

// ------------------------------------------------------------------ Jugador
const player = {
  x: 175,
  y: GROUND_Y,
  vy: 0,
  onGround: true,
  scale: 0.46,           // se recalcula al cargar (altura objetivo)
  targetH: 132,
  animT: 0,
  jumpsLeft: 2,          // doble salto
  shootCd: 0,
  shootAnim: 0,
  invuln: 0,
  dead: false,
  deadT: 0,
};

function setupPlayerScale() {
  const ref = IMG.player_run1;
  if (ref && ref.height) player.scale = player.targetH / ref.height;
}

const JUMP_V = -15.2;
const GRAVITY = 0.62;

// hitbox del jugador (mas pequena que el sprite, para ser justos)
function playerBox() {
  const h = player.targetH;
  const w = h * 0.42;
  const baseY = player.y;
  return { x: player.x - w * 0.5, y: baseY - h * 0.92, w: w, h: h * 0.9 };
}

// ------------------------------------------------------------------ Enemigos
const ENEMY_TYPES = {
  1: { frames: ['enemy1_run1','enemy1_run2','enemy1_run3'], targetH: 118, speed: 1.4, score: 120, name: 'Inspector' },
  2: { frames: ['enemy2_run1','enemy2_run2','enemy2_run3'], targetH: 120, speed: 2.1, score: 160, name: 'Funcionaria' },
  3: { frames: ['enemy3_run1','enemy3_run2','enemy3_run3'], targetH: 116, speed: 0.9, score: 100, name: 'Jefe de negociado' },
};

function spawnEnemy() {
  const t = choose([1, 1, 2, 2, 3, 3, 2, 1]);
  const def = ENEMY_TYPES[t];
  const ref = IMG[def.frames[0]];
  const scale = ref && ref.height ? def.targetH / ref.height : 0.5;
  enemies.push({
    type: t, def, scale,
    x: CW + 80,
    y: GROUND_Y + rand(-2, 2),
    speed: def.speed,
    animT: Math.random() * 1,
    dead: false,
    dodged: false,
    hp: t === 3 ? 2 : 1,
    bob: Math.random() * Math.PI * 2,
  });
}

function enemyBox(e) {
  const h = e.def.targetH;
  const w = h * 0.40;
  return { x: e.x - w * 0.5, y: e.y - h * 0.92, w: w, h: h * 0.9 };
}

function aabb(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// ------------------------------------------------------------------ Particulas
function addParticle(p) { if (particles.length < 260) particles.push(p); }

function dustBurst(x, y, n, color) {
  for (let i = 0; i < n; i++) {
    addParticle({
      x, y, vx: rand(-2.4, 1.2), vy: rand(-3.2, -0.4),
      r: rand(3, 8), life: rand(0.3, 0.7), t: 0,
      color: color || 'rgba(200,200,210,', grav: 0.12, kind: 'circle',
    });
  }
}
function explosionFx(x, y) {
  particles.length < 230 && particles.push({ kind: 'sprite', img: IMG.explosion, x, y, scale: rand(0.5, 0.72), life: 0.42, t: 0, rot: rand(-0.2, 0.2) });
  for (let i = 0; i < 18; i++) {
    addParticle({
      x, y, vx: rand(-5, 5), vy: rand(-6, 1),
      r: rand(2, 6), life: rand(0.4, 0.9), t: 0,
      color: choose(['rgba(255,170,40,', 'rgba(255,90,30,', 'rgba(120,120,120,']),
      grav: 0.18, kind: 'circle',
    });
  }
}
function muzzleFlash(x, y) {
  for (let i = 0; i < 6; i++) {
    addParticle({ x, y, vx: rand(3, 9), vy: rand(-1.2, 1.2), r: rand(2, 5), life: rand(0.08, 0.2), t: 0, color: 'rgba(255,210,90,', grav: 0, kind: 'circle' });
  }
}
function addFloater(x, y, text, color) {
  floaters.push({ x, y, text, color: color || '#ffe27a', t: 0, life: 0.9 });
}

// ------------------------------------------------------------------ Parallax / fondo
let scroll = { sky: 0, far: 0, near: 0, ground: 0 };

function drawWrapped(img, scrollX, baseY, targetH) {
  if (!img || img._failed) return;
  const scale = targetH / img.height;
  const w = img.width * scale;
  let x = -(scrollX % w);
  if (x > 0) x -= w;
  for (; x < CW; x += w) ctx.drawImage(img, 0, 0, img.width, img.height, x, baseY - targetH, w, targetH);
}

function drawBackground() {
  // cielo (gradiente + imagen estirada)
  const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  g.addColorStop(0, '#bfe3ea');
  g.addColorStop(1, '#e9f3ee');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CW, GROUND_Y + 4);
  if (IMG.bg_sky && !IMG.bg_sky._failed) {
    ctx.globalAlpha = 0.9;
    drawWrapped(IMG.bg_sky, scroll.sky, GROUND_Y + 10, 360);
    ctx.globalAlpha = 1;
  }
  // sol/halo
  ctx.save();
  const sun = ctx.createRadialGradient(760, 120, 10, 760, 120, 130);
  sun.addColorStop(0, 'rgba(255,250,220,0.9)');
  sun.addColorStop(1, 'rgba(255,250,220,0)');
  ctx.fillStyle = sun; ctx.fillRect(630, 0, 260, 260);
  ctx.restore();
  // skylines parallax
  drawWrapped(IMG.bg_far, scroll.far, GROUND_Y + 8, 300);
  drawWrapped(IMG.bg_near, scroll.near, GROUND_Y + 6, 330);
}

function drawGround() {
  const top = GROUND_Y;
  // acera (banda clara)
  const pg = ctx.createLinearGradient(0, top, 0, top + 30);
  pg.addColorStop(0, '#9aa0ab');
  pg.addColorStop(1, '#7d8390');
  ctx.fillStyle = pg;
  ctx.fillRect(0, top, CW, 30);
  // bordillo
  ctx.fillStyle = '#c7ccd4';
  ctx.fillRect(0, top, CW, 4);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, top + 28, CW, 3);
  // juntas de la acera (desplazandose)
  ctx.strokeStyle = 'rgba(40,44,54,0.35)';
  ctx.lineWidth = 2;
  const slab = 74;
  let sx = -((scroll.ground) % slab);
  for (let x = sx; x < CW; x += slab) {
    ctx.beginPath(); ctx.moveTo(x, top + 4); ctx.lineTo(x, top + 28); ctx.stroke();
  }
  // asfalto (calzada)
  const ag = ctx.createLinearGradient(0, top + 30, 0, CH);
  ag.addColorStop(0, '#3a3f4a');
  ag.addColorStop(1, '#23262e');
  ctx.fillStyle = ag;
  ctx.fillRect(0, top + 30, CW, CH - top - 30);
  // linea discontinua de la calzada
  ctx.fillStyle = 'rgba(240,220,120,0.85)';
  const dash = 60, gap = 40, y = top + 58, dh = 7;
  let dx = -((scroll.ground * 1.0) % (dash + gap));
  for (let x = dx; x < CW; x += dash + gap) ctx.fillRect(x, y, dash, dh);
}

// ------------------------------------------------------------------ Logica de juego
function startGame() {
  game.state = 'PLAYING';
  game.speed = game.baseSpeed;
  game.elapsed = 0;
  game.score = 0;
  game.lives = 3;
  game.spawnTimer = 0.6;
  game.spawnInterval = 1.5;
  game.shake = 0;
  enemies.length = 0; bullets.length = 0; particles.length = 0; floaters.length = 0;
  player.y = GROUND_Y; player.vy = 0; player.onGround = true; player.jumpsLeft = 2;
  player.shootCd = 0; player.shootAnim = 0; player.invuln = 0; player.dead = false; player.deadT = 0;
  Audio.sfx('start');
  Audio.startMusic();
}

function gameOver() {
  game.state = 'GAMEOVER';
  game.overCooldown = 0.8;
  player.dead = true; player.deadT = 0;
  Audio.stopMusic();
  Audio.sfx('over');
  if (game.score > game.best) {
    game.best = Math.floor(game.score);
    localStorage.setItem('arquitector_best', String(game.best));
  }
  game.shake = 16;
}

function doJump() {
  if (player.dead) return;
  if (player.jumpsLeft > 0) {
    player.vy = JUMP_V * (player.onGround ? 1 : 0.86);
    player.onGround = false;
    player.jumpsLeft--;
    Audio.sfx('jump');
    dustBurst(player.x, GROUND_Y, 8);
  }
}

function doShoot() {
  if (player.dead || player.shootCd > 0) return;
  player.shootCd = 0.26;
  player.shootAnim = 0.16;
  const mx = player.x + player.targetH * 0.34;
  const my = player.y - player.targetH * 0.52;
  bullets.push({ x: mx, y: my, vx: 15.5, life: 1.2, t: 0 });
  muzzleFlash(mx + 6, my);
  Audio.sfx('shoot');
}

// ------------------------------------------------------------------ Update
function update(dt) {
  game.titleT += dt;
  if (game.overCooldown > 0) game.overCooldown -= dt;
  if (game.shake > 0) game.shake = Math.max(0, game.shake - dt * 40);

  // velocidades de parallax (siempre algo de movimiento en titulo)
  const moving = (game.state === 'PLAYING') ? game.speed : (game.state === 'TITLE' ? 1.6 : 0.4);
  scroll.sky += moving * 0.10 * dt * 60 / 1;
  scroll.far += moving * 0.30 * dt * 60 / 1;
  scroll.near += moving * 0.6 * dt * 60 / 1;
  scroll.ground += moving * dt * 60 / 1;

  // particulas y flotantes siempre
  updateParticles(dt);

  if (game.state !== 'PLAYING') {
    // animar al jugador en idle/death incluso fuera de PLAYING
    player.animT += dt;
    if (player.dead) player.deadT += dt;
    return;
  }

  game.elapsed += dt;
  // dificultad progresiva
  game.speed = game.baseSpeed + Math.min(7.5, game.elapsed * 0.085);
  game.spawnInterval = Math.max(0.62, 1.55 - game.elapsed * 0.012);

  // puntuacion por distancia
  game.score += game.speed * dt * 6;

  // jugador: input
  if (Input.jumpQueued) { doJump(); Input.jumpQueued = false; }
  if (Input.shootQueued || Input.shootHeld) { doShoot(); Input.shootQueued = false; }

  // jugador: fisica
  player.animT += dt;
  player.vy += GRAVITY * dt * 60;
  player.y += player.vy * dt * 60;
  if (player.y >= GROUND_Y) {
    if (!player.onGround && player.vy > 4) dustBurst(player.x, GROUND_Y, 6);
    player.y = GROUND_Y; player.vy = 0;
    if (!player.onGround) { player.onGround = true; player.jumpsLeft = 2; }
  }
  if (player.shootCd > 0) player.shootCd -= dt;
  if (player.shootAnim > 0) player.shootAnim -= dt;
  if (player.invuln > 0) player.invuln -= dt;

  // polvo al correr
  if (player.onGround && Math.random() < 0.25) {
    addParticle({ x: player.x - 18, y: GROUND_Y, vx: rand(-1.5, -0.4), vy: rand(-1.2, -0.2), r: rand(2, 5), life: rand(0.25, 0.5), t: 0, color: 'rgba(200,200,210,', grav: 0.05, kind: 'circle' });
  }

  // spawn enemigos
  game.spawnTimer -= dt;
  if (game.spawnTimer <= 0) {
    spawnEnemy();
    game.spawnTimer = game.spawnInterval * rand(0.8, 1.25);
    // a veces una pareja de funcionarios (mas separada)
    if (Math.random() < 0.18 && game.elapsed > 14) {
      spawnEnemy();
      enemies[enemies.length - 1].x += rand(120, 200);
    }
  }

  // balas
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * dt * 60;
    b.t += dt;
    if (b.x > CW + 30 || b.t > b.life) { bullets.splice(i, 1); continue; }
  }

  // enemigos
  const pBox = playerBox();
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.animT += dt;
    e.bob += dt * 10;
    if (!e.dead) e.x -= (game.speed + e.speed) * dt * 60;

    // colision con balas
    if (!e.dead) {
      const eBox = enemyBox(e);
      for (let j = bullets.length - 1; j >= 0; j--) {
        const b = bullets[j];
        if (b.x > eBox.x && b.x < eBox.x + eBox.w && b.y > eBox.y && b.y < eBox.y + eBox.h) {
          bullets.splice(j, 1);
          e.hp--;
          dustBurst(b.x, b.y, 4, 'rgba(255,170,60,');
          if (e.hp <= 0) {
            e.dead = true;
            explosionFx(e.x, e.y - e.def.targetH * 0.45);
            const pts = e.def.score;
            game.score += pts;
            addFloater(e.x, e.y - e.def.targetH, '+' + pts, '#ffe27a');
            Audio.sfx('explosion');
            game.shake = Math.max(game.shake, 7);
          } else {
            Audio.sfx('shoot');
          }
          break;
        }
      }
    }

    // colision con el jugador
    if (!e.dead && player.invuln <= 0 && !player.dead) {
      if (aabb(pBox, enemyBox(e))) {
        e.dead = true;
        explosionFx(e.x, e.y - e.def.targetH * 0.4);
        game.lives--;
        player.invuln = 1.3;
        game.shake = 12;
        Audio.sfx('hit');
        addFloater(player.x, player.y - player.targetH, '¡AY!', '#ff6b6b');
        if (game.lives <= 0) { gameOver(); }
      }
    }

    // esquivado con exito (paso por encima)
    if (!e.dead && !e.dodged && e.x < player.x - 30) {
      e.dodged = true;
      game.score += 15;
      Audio.sfx('dodge');
      addFloater(e.x, e.y - e.def.targetH - 6, 'ESQUIVADO +15', '#9be29b');
    }

    // limpieza
    if (e.x < -120 || (e.dead && e.x < -60)) enemies.splice(i, 1);
    else if (e.dead) { e.x -= game.speed * 0.4 * dt * 60; }
  }

  // flotantes
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i]; f.t += dt; f.y -= 26 * dt;
    if (f.t > f.life) floaters.splice(i, 1);
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.t += dt;
    if (p.t > p.life) { particles.splice(i, 1); continue; }
    if (p.kind === 'circle') {
      p.x += p.vx * dt * 60; p.y += p.vy * dt * 60; p.vy += p.grav * dt * 60;
    }
  }
}

// ------------------------------------------------------------------ Render
function render() {
  ctx.clearRect(0, 0, CW, CH);
  ctx.save();
  if (game.shake > 0.3) ctx.translate(rand(-game.shake, game.shake) * 0.4, rand(-game.shake, game.shake) * 0.4);

  drawBackground();
  drawGround();

  // El mundo (enemigos, balas, jugador) solo se dibuja fuera del titulo:
  // la pantalla de titulo dibuja su propio heroe.
  if (game.state !== 'TITLE') {
    for (const e of enemies) drawEnemy(e);

    for (const b of bullets) {
      ctx.save();
      ctx.fillStyle = '#ffd24a';
      ctx.shadowColor = '#ffae3b'; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.ellipse(b.x, b.y, 7, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    drawPlayer();
  }
  drawParticles();
  drawFloaters();

  ctx.restore();

  drawHUD();
  if (game.state === 'TITLE') drawTitle();
  else if (game.state === 'GAMEOVER') drawGameOver();
  if (game.state === 'LOADING') drawLoading();
}

function playerFrame() {
  if (player.dead) return IMG.player_hit;
  if (!player.onGround) return IMG.player_jump;
  if (player.shootAnim > 0) return IMG.player_shoot;
  // ciclo de carrera
  const f = Math.floor(player.animT * 11) % 2;
  return f === 0 ? IMG.player_run1 : IMG.player_run2;
}

function drawPlayer() {
  const blink = player.invuln > 0 && Math.floor(player.invuln * 20) % 2 === 0;
  if (blink) return;
  // pequeno bote al correr
  let baseY = player.y;
  if (player.onGround && !player.dead) baseY += Math.abs(Math.sin(player.animT * 22)) * -3;
  const img = playerFrame();
  // sombra
  drawShadow(player.x, GROUND_Y, player.targetH * 0.42);
  drawSprite(img, player.x, baseY, player.scale, false, player.invuln > 0 ? 0.85 : 1);
}

function drawEnemy(e) {
  const f = Math.floor(e.animT * 10 + e.bob) % 3;
  const img = IMG[e.def.frames[f]];
  drawShadow(e.x, GROUND_Y, e.def.targetH * 0.4);
  // enemigos miran a la izquierda (hacia el jugador) -> flip
  const baseY = e.y + (e.dead ? 0 : Math.abs(Math.sin(e.bob)) * -2);
  drawSprite(img, e.x, baseY, e.scale, true, e.dead ? 0.0 : 1);
}

function drawShadow(cx, baseY, rw) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(cx, baseY + 2, rw, rw * 0.26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawParticles() {
  for (const p of particles) {
    const a = 1 - p.t / p.life;
    if (p.kind === 'sprite') {
      if (p.img && !p.img._failed) {
        ctx.save();
        ctx.globalAlpha = clamp(a * 1.4, 0, 1);
        const w = p.img.width * p.scale, h = p.img.height * p.scale;
        ctx.translate(p.x, p.y); ctx.rotate(p.rot || 0);
        ctx.drawImage(p.img, -w / 2, -h / 2, w, h);
        ctx.restore();
      }
    } else {
      ctx.fillStyle = p.color + clamp(a, 0, 1).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (0.6 + a * 0.4), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawFloaters() {
  for (const f of floaters) {
    const a = 1 - f.t / f.life;
    ctx.save();
    ctx.globalAlpha = clamp(a, 0, 1);
    ctx.font = 'bold 22px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
    ctx.restore();
  }
}

// ------------------------------------------------------------------ HUD y pantallas
function panel(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawHUD() {
  if (game.state === 'LOADING' || game.state === 'TITLE') return;
  ctx.save();
  ctx.textAlign = 'left';
  ctx.font = 'bold 26px "Trebuchet MS", sans-serif';
  // puntuacion
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  panel(16, 14, 230, 40, 10); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText('PUNTOS ' + String(Math.floor(game.score)).padStart(6, '0'), 28, 42);
  // mejor
  ctx.font = 'bold 16px "Trebuchet MS", sans-serif';
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  panel(16, 60, 150, 26, 8); ctx.fill();
  ctx.fillStyle = '#ffe27a';
  ctx.fillText('RÉCORD ' + String(Math.floor(game.best)).padStart(6, '0'), 26, 79);

  // vidas (cascos del arquitecto)
  for (let i = 0; i < 3; i++) {
    drawHelmet(CW - 40 - i * 42, 34, i < game.lives);
  }
  // boton mute
  ctx.font = '16px sans-serif';
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  panel(CW - 150, 60, 134, 26, 8); ctx.fill();
  ctx.fillStyle = '#cfd6e0';
  ctx.fillText((Audio.isMuted() ? '🔇' : '🔊') + ' M  silencio', CW - 142, 79);
  ctx.restore();
}

function drawHelmet(cx, cy, filled) {
  ctx.save();
  ctx.translate(cx, cy);
  // casco de obra
  ctx.beginPath();
  ctx.arc(0, 2, 13, Math.PI, 0);
  ctx.lineTo(16, 6); ctx.lineTo(-16, 6); ctx.closePath();
  ctx.fillStyle = filled ? '#ffcc33' : 'rgba(255,255,255,0.18)';
  ctx.fill();
  ctx.strokeStyle = filled ? '#c98a13' : 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(0, 2);
  ctx.strokeStyle = filled ? '#e0a92a' : 'rgba(255,255,255,0.2)'; ctx.stroke();
  ctx.restore();
}

function drawTitle() {
  ctx.save();
  // velo
  ctx.fillStyle = 'rgba(10,14,22,0.42)';
  ctx.fillRect(0, 0, CW, CH);

  // jugador grande en el titulo
  const t = game.titleT;
  const by = 432 + Math.sin(t * 2) * 5;
  drawShadow(CW * 0.5, 436, 64);
  drawSprite(IMG.player_shoot, CW * 0.5, by, player.scale * 1.28, false, 1);

  ctx.textAlign = 'center';
  // titulo
  ctx.fillStyle = '#ffcc33';
  ctx.strokeStyle = '#1b1408'; ctx.lineWidth = 7;
  ctx.font = '900 64px "Trebuchet MS", sans-serif';
  ctx.strokeText('ARQUITECTOR', CW / 2, 110);
  ctx.fillText('ARQUITECTOR', CW / 2, 110);

  ctx.font = 'italic 26px "Trebuchet MS", sans-serif';
  ctx.lineWidth = 5;
  ctx.strokeText('contra los', CW / 2, 148);
  ctx.fillStyle = '#fff';
  ctx.fillText('contra los', CW / 2, 148);

  ctx.fillStyle = '#7ec8ff';
  ctx.font = '900 40px "Trebuchet MS", sans-serif';
  ctx.lineWidth = 6;
  ctx.strokeText('FUNCIONARIOS DE URBANISMO', CW / 2, 192);
  ctx.fillText('FUNCIONARIOS DE URBANISMO', CW / 2, 192);

  // instrucciones (parpadeo)
  const blink = (Math.sin(t * 4) > -0.3);
  if (blink) {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 26px "Trebuchet MS", sans-serif';
    ctx.fillText('PULSA ESPACIO  ·  CLIC  ·  TOCA  PARA EMPEZAR', CW / 2, 250);
  }

  ctx.font = '18px "Trebuchet MS", sans-serif';
  ctx.fillStyle = '#dfe6f0';
  ctx.fillText('SALTAR  =  Espacio / ↑ / W   (doble salto disponible)', CW / 2, 470);
  ctx.fillText('DISPARAR  =  Clic / X / J   ·   En móvil: izquierda salta, derecha dispara', CW / 2, 498);
  ctx.fillText('Esquiva o dispara a los funcionarios. ¡Que no te pillen el proyecto!', CW / 2, 524);
  ctx.restore();
}

function drawGameOver() {
  ctx.save();
  ctx.fillStyle = 'rgba(10,14,22,0.55)';
  ctx.fillRect(0, 0, CW, CH);
  ctx.textAlign = 'center';

  ctx.fillStyle = '#ff5d5d';
  ctx.strokeStyle = '#2a0d0d'; ctx.lineWidth = 7;
  ctx.font = '900 72px "Trebuchet MS", sans-serif';
  ctx.strokeText('¡EXPEDIENTADO!', CW / 2, 160);
  ctx.fillText('¡EXPEDIENTADO!', CW / 2, 160);

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 34px "Trebuchet MS", sans-serif';
  ctx.fillText('Puntos: ' + Math.floor(game.score), CW / 2, 230);
  ctx.fillStyle = '#ffe27a';
  ctx.font = 'bold 26px "Trebuchet MS", sans-serif';
  const recordNuevo = Math.floor(game.score) >= game.best && game.score > 0;
  ctx.fillText((recordNuevo ? '★ NUEVO RÉCORD: ' : 'Récord: ') + game.best, CW / 2, 270);

  if (game.overCooldown <= 0) {
    const blink = (Math.sin(game.titleT * 5) > -0.2);
    if (blink) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 28px "Trebuchet MS", sans-serif';
      ctx.fillText('PULSA ESPACIO / CLIC / TOCA  PARA REINTENTAR', CW / 2, 340);
    }
  }
  ctx.restore();
}

function drawLoading() {
  ctx.fillStyle = '#0d1018'; ctx.fillRect(0, 0, CW, CH);
  ctx.fillStyle = '#ffcc33';
  ctx.textAlign = 'center';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText('Cargando la obra...', CW / 2, CH / 2 - 10);
  const p = assetsLoaded / assetsTotal;
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(CW / 2 - 160, CH / 2 + 14, 320, 14);
  ctx.fillStyle = '#7ec8ff';
  ctx.fillRect(CW / 2 - 160, CH / 2 + 14, 320 * p, 14);
}

// ------------------------------------------------------------------ Bucle principal
let last = performance.now();
function loop(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05; // clamp para evitar saltos
  update(dt);
  render();
  requestAnimationFrame(loop);
}

// ------------------------------------------------------------------ Arranque
loadAssets(() => {
  setupPlayerScale();
  game.state = 'TITLE';
  // Hook de depuracion para capturas: ?shot arranca y dispara; ?run solo arranca.
  if (location.search.indexOf('shot') >= 0) { startGame(); Input.shootHeld = true; }
  else if (location.search.indexOf('run') >= 0) { startGame(); }
  else if (location.search.indexOf('over') >= 0) {
    startGame(); game.score = 12345; game.lives = 0; game.overCooldown = 0; gameOver();
  }
  else if (location.search.indexOf('enemies') >= 0) {
    startGame();
    [1, 2, 3, 2].forEach((tp, i) => {
      const def = ENEMY_TYPES[tp];
      const ref = IMG[def.frames[0]];
      enemies.push({ type: tp, def, scale: def.targetH / ref.height, x: 360 + i * 175, y: GROUND_Y, speed: def.speed, animT: i * 0.3, dead: false, dodged: false, hp: 1, bob: i });
    });
  }
});
requestAnimationFrame(loop);

})();
