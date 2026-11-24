// ─────────────────────────────────────────────────────────────
//  Don't Make a Sound — UI, input and the frame loop.
// ─────────────────────────────────────────────────────────────

import { Game, DIFFICULTY, MAX_DAYS } from './game.js';
import { ROOM_DEFS, OBJECTS, ITEMS } from './world.js';
import { TriviaEngine, validateQuestions } from './trivia.js';
import { AudioEngine } from './audio.js';
import { Renderer } from './render.js';
import { Renderer3D } from './render3d.js';
import { hdTexturesAsync } from './texhd.js';
import { sprites as loadSprites } from './sprites.js';
import { paintScareFace, playScare } from './scare.js';
import * as store from './storage.js';
import { ACHIEVEMENTS } from './storage.js';
import { TITLE_ART } from './art.js';

const $ = (s) => document.querySelector(s);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

const saved = store.load();
saved.settings.sens ??= 1;
const audio = new AudioEngine();
let questions = [];
let game = null, renderer = null, SPR = null, scareFace = null;
let runToken = 0;
let paused = false;
let encounterActive = false;

const el = {
  body: document.body,
  view: $('#view'),
  hideOverlay: $('#hide-overlay'),
  redFlash: $('#red-flash'),
  day: $('#day-num'),
  noiseVal: $('#noise-val'),
  noiseFill: $('#noise-fill'),
  noiseMeter: $('#noise-meter'),
  inventory: $('#inventory'),
  prompt: $('#prompt'),
  subtitle: $('#subtitle'),
  chip: $('#status-chip'),
  pause: $('#click-to-play'),
  enc: $('#encounter'), encBox: $('#enc-box'), encTitle: $('#enc-title'), encIntro: $('#enc-intro'), encBody: $('#enc-body'),
  encProgress: $('#enc-progress'), encQuestion: $('#enc-question'), encOptions: $('#enc-options'), timerFill: $('#timer-fill'), timerNum: $('#timer-num'),
  scare: $('#jumpscare'), sub: $('#subliminal'), wake: $('#wake'), end: $('#end'), toast: $('#toast'),
};

// ═════════════ boot ═════════════
async function boot() {
  try {
    const json = window.__QUESTIONS__ ?? (await (await fetch('data/questions.json')).json());
    questions = json.questions;
    const errs = validateQuestions(questions);
    if (errs.length) console.warn('[questions.json]', errs);
  } catch (err) {
    console.error(err);
    $('#btn-start').disabled = true;
    $('#title-best').textContent = 'Could not load the questions. Open the root index.html (the built single file).';
    return;
  }
  $('#title-art').innerHTML = TITLE_ART;
  applySettings();
  renderTitleBest();
  bindUI();
  bindInput();
  requestAnimationFrame(frame);
  // build the house's textures and characters in the background while the title screen is up
  if (wants3D()) prebuild = hdTexturesAsync((k) => (loadProgress = k)).then(() => { SPR ??= loadSprites(); });
}

let prebuild = null, loadProgress = 0;
function wants3D() { return (saved.settings.graphics ?? (isTouch ? 'medium' : 'high')) !== 'retro' && Renderer3D.supported(); }

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
}

async function startRun() {
  audio.init();
  if (prebuild && loadProgress < 1) {
    const btn = $('#btn-start');
    btn.disabled = true;
    const tick = setInterval(() => (btn.textContent = `Building the house… ${Math.round(loadProgress * 100)}%`), 100);
    await prebuild;
    clearInterval(tick);
    btn.disabled = false;
    btn.textContent = 'Enter the house';
  }
  audio.setVolume(saved.settings.volume);
  audio.setMuted(saved.settings.muted);
  SPR ??= loadSprites();
  scareFace ??= Object.fromEntries(['mother', 'bride', 'drowned', 'smiler', 'girl'].map((v) => [v, paintScareFace(v)]));
  runToken++;
  encounterActive = false;

  game = new Game(new TriviaEngine(questions), { difficulty: saved.settings.difficulty });
  if (new URLSearchParams(location.search).has('debug')) { window.game = game; window.__unpause = () => setPaused(false); window.__subliminal = (hold = 0.05) => { subT = 0; window.__subHold = hold; }; }
  if (!renderer) {
    const quality = saved.settings.graphics ?? (isTouch ? 'medium' : 'high');
    if (quality !== 'retro' && Renderer3D.supported()) {
      try {
        renderer = new Renderer3D($('#view3d'), { scale: quality === 'medium' ? 0.8 : 1 });
        el.body.classList.add('hd');
      } catch (err) {
        console.warn('WebGL renderer failed, falling back to retro', err);
        renderer = null;
      }
    }
    renderer ??= new Renderer(el.view);
  }
  renderer.setWorld(game.world, game.lights);
  audio.occlude = (pos) => game && !game.world.los(game.player.x, game.player.y, pos.x, pos.y);

  game
    .on('message', subtitle)
    .on('sfx', (name, pos) => audio.play(name, pos))
    .on('step', (s) => {
      const surface = ROOM_DEFS[s.room ?? 'hall']?.steps;
      audio.play('step', { surface, run: s.run, crouch: s.crouch });
      // something walking behind you, in step — and one step more when you stop
      if (game.scares?.followT > 0) {
        const behind = () => { const pp = game.player; return { x: pp.x - Math.cos(pp.a) * 2.2, y: pp.y - Math.sin(pp.a) * 2.2, surface }; };
        setTimeout(() => audio.play('echoStep', behind()), 260 + Math.random() * 60);
        clearTimeout(echoTimer);
        echoTimer = setTimeout(() => audio.play('echoStep', behind()), 1100);
      }
    })
    .on('creatureStep', onCreatureStep)
    .on('creatureStairs', (pos) => audio.play('stairs', pos))
    .on('spotted', onSpotted)
    .on('pursuit', () => { audio.stinger(1); flashRed(0.5); })
    .on('glimpse', onGlimpse)
    .on('jolt', onJolt)
    .on('flashFail', (dur) => { flashOutT = dur; audio.play('flashDie'); })
    .on('scare', onScare)
    .on('shake', (k) => shake(k))
    .on('item', (id, it) => { toast(`${it.icon}  ${it.name}`); audio.play('pickup'); renderInventory(); })
    .on('hide', (spot) => { el.hideOverlay.dataset.view = spot.hide.view; el.body.dataset.hidden = '1'; })
    .on('unhide', () => { el.hideOverlay.dataset.view = ''; el.body.dataset.hidden = ''; })
    .on('room', onRoom)
    .on('stairs', () => { audio.play('stairs'); fadeBlack(); })
    .on('encounter', runEncounter);

  [el.enc, el.wake, el.end, el.scare].forEach((n) => (n.hidden = true));
  el.hideOverlay.dataset.view = '';
  el.body.dataset.hidden = '';
  showScreen('screen-game');
  el.body.dataset.phase = 'play';
  el.body.dataset.day = '1';
  renderInventory();
  subtitle('You wake on a bare mattress. Somewhere below, something heavy shifts its weight.', 'day');
  setTimeout(() => game && subtitle('There’s a note on the floor by the door.', 'dim'), 5200);
  if (!isTouch) setPaused(true); else setPaused(false);
}

function quitToTitle() {
  runToken++;
  game = null;
  encounterActive = false;
  audio.setChase(false);
  audio.setTension(0);
  document.exitPointerLock?.();
  [el.enc, el.wake, el.end, el.scare].forEach((n) => (n.hidden = true));
  el.pause.hidden = true;
  el.body.dataset.phase = 'title';
  el.body.dataset.day = '1';
  renderTitleBest();
  showScreen('screen-title');
}

// ═════════════ frame loop ═════════════
let last = performance.now();
let camRoll = 0, camFov = 58;
const twitchState = new WeakMap();
let echoTimer = 0, subT = 70 + Math.random() * 60;
let breathT = 0, flashPower = 1, flashOutT = 0, humT = 18, pianoT = 30, lastJolt = 0;
function frame(t) {
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  if (game && renderer) {
    if (!paused && game.phase === 'play' && !encounterActive) game.update(dt, readInput(dt));
    draw(dt);
    if (game.phase === 'play' || game.phase === 'encounter') updateAudio(dt);
    updateHud();
  }
  requestAnimationFrame(frame);
}

/** Now and then a face is on the screen for two frames. Not long enough to be sure. */
let subOn = 0;
function subliminal(dt) {
  const cv = el.sub;
  if (subOn > 0) {
    subOn -= dt;
    if (subOn <= 0) cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
    return;
  }
  subT -= dt * (1 + (game.day - 1) * 0.35);
  if (subT > 0 || !scareFace || saved.settings.reducedMotion || encounterActive || game.player.hidden) return;
  subT = 55 + Math.random() * 80;
  const W = (cv.width = cv.clientWidth), H = (cv.height = cv.clientHeight);
  const ctx = cv.getContext('2d');
  const faces = Object.values(scareFace), f = faces[Math.floor(Math.random() * faces.length)];
  const h = H * (0.45 + Math.random() * 0.4), w = (h * f.width) / f.height;
  const x = Math.random() < 0.5 ? W * (0.05 + Math.random() * 0.2) : W * (0.75 - Math.random() * 0.2) - w * 0.5;
  ctx.globalAlpha = 0.16 + Math.random() * 0.1;
  ctx.drawImage(f, x, (H - h) * (0.3 + Math.random() * 0.4), w, h);
  subOn = window.__subHold ?? 0.05 + Math.random() * 0.03;
}

function draw(dt) {
  const p = game.player, c = game.creature;
  const dist = Math.hypot(c.x - p.x, c.y - p.y);
  // the flashlight stutters when she's close
  if (p.flashlight) {
    const near = Math.max(0, 1 - dist / 6);
    if (flashOutT > 0) {
      // dying: a few stutters, then nothing
      flashOutT -= dt;
      flashPower = flashOutT > 0.85 ? (Math.random() < 0.5 ? 0.05 : 0.6) : 0;
      if (flashOutT <= 0) flashPower = 1;
    } else if (Math.random() < near * 0.15) flashPower = Math.random() * 0.4;
    else flashPower += (1 - flashPower) * Math.min(1, dt * 8);
  }
  const moving = p.moving > 0.1 && !p.hidden;
  const bobZ = moving ? Math.sin(p.bob) * (p.run ? 0.03 : 0.015) : 0;
  const breathe = Math.sin(performance.now() / 900) * (p.hidden ? 1.6 : 0.6);
  // smooth camera extras: a slight lean into strafes and sway with each step, a wider view when running
  const targetRoll = moving ? Math.sin(p.bob * 0.5) * 0.006 + (p.strafeLean ?? 0) : 0;
  camRoll += (targetRoll - camRoll) * Math.min(1, dt * 8);
  camFov += ((p.run && moving ? 64 : p.crouch ? 55 : 58) - camFov) * Math.min(1, dt * 5);
  const cam = { x: p.x, y: p.y, a: p.a + (shakeAmt ? (Math.random() - 0.5) * shakeAmt * 0.05 : 0), z: p.z + bobZ, pitch: p.pitch + breathe + (shakeAmt ? (Math.random() - 0.5) * shakeAmt * 14 : 0), flash: p.flashlight ? flashPower : 0, roll: camRoll + (shakeAmt ? (Math.random() - 0.5) * shakeAmt * 0.03 : 0), fov: camFov };
  shakeAmt = Math.max(0, shakeAmt - dt * 2.5);
  subliminal(dt);

  const list = [];
  for (const o of game.world.objects) {
    if (renderer.handles?.(o.sprite)) continue;   // drawn as a 3D model
    let img = SPR[o.sprite];
    if (Array.isArray(img)) img = img[Math.floor((o.phase ?? 0) * 3) % img.length];
    list.push({ img, x: o.x, y: o.y, w: o.w, h: o.h, z: 0 });
  }
  const e = game.encounter;
  const reach = (e && (e.kind === 'grab' || e.kind === 'found')) || c.state === 'stunned';
  const walking = ['chase', 'hunt', 'investigate', 'patrol', 'leaving'].includes(c.state);
  const cimg = reach ? SPR.creatureReach : SPR.creature[walking ? Math.floor(c.anim * (c.state === 'chase' || c.state === 'hunt' ? 7 : 4)) % 4 : 0];
  // stop-motion: every few seconds they jerk — a sideways twitch, a stretch — then they're still again
  const rx = -Math.sin(p.a), ry = Math.cos(p.a);
  const twitch = (o, k = 1) => {
    let t = twitchState.get(o);
    if (!t) { t = { next: 1 + Math.random() * 4, on: 0, dx: 0, sy: 1 }; twitchState.set(o, t); }
    t.next -= dt;
    if (t.next <= 0) { t.on = 0.06 + Math.random() * 0.1; t.next = 1.5 + Math.random() * 4.5; }
    if (t.on > 0) {
      t.on -= dt;
      if (Math.random() < 0.6) { t.dx = (Math.random() - 0.5) * 0.11 * k; t.sy = 1 + (Math.random() - 0.3) * 0.06 * k; }
      return t;
    }
    t.dx = 0; t.sy = 1;
    return t;
  };
  const ct = c.state === 'chase' || c.state === 'hunt' ? { dx: 0, sy: 1 } : twitch(c, 0.8);
  list.push({ img: cimg, x: c.x + rx * ct.dx, y: c.y + ry * ct.dx, w: 0.6, h: 1.0 * ct.sy, z: 0, glow: e && (e.kind === 'found' || e.kind === 'grab') ? 0.32 : 0.07 });
  for (const ap of game.apparitions) {
    let img = SPR[ap.sprite];
    if (Array.isArray(img)) img = ap.frame !== undefined ? img[Math.min(ap.frame, img.length - 1)] : img[Math.floor(ap.age * 8) % img.length];
    const glow = ap.kind === 'resident' ? 0.2 : ({ ghost: 0.42, child: 0.28, crawler: 0.2, peeker: 0.3, smiler: 0.22, girl: 0.3, eyes: 0, underbed: 0.26, corner: 0.24 }[ap.sprite] ?? 0.3);
    const tw = ['eyes', 'crosser', 'slam', 'writing'].includes(ap.kind) ? { dx: 0, sy: 1 } : twitch(ap);
    const item = { img, x: ap.x + rx * tw.dx, y: ap.y + ry * tw.dx, w: ap.w, h: ap.h * tw.sy, z: ap.z ?? 0, alpha: ap.alpha, glow, flip: ap.flip };
    // eyes catch what little light there is, and bloom
    if (ap.kind === 'eyes') item.halo = { z: (ap.z ?? 0) + ap.h * 0.53, sep: ap.w * 0.16, size: 0.06, c: [0.9, 0.82, 0.5], k: ap.alpha };
    if (ap.sprite === 'smiler') {
      // two pale points at the end of the hall, long before you can make out the rest of him
      const d = Math.hypot(ap.x - p.x, ap.y - p.y);
      item.halo = { z: (ap.z ?? 0) + ap.h * 0.9, sep: ap.w * 0.062, size: 0.065, c: [0.9, 0.9, 0.85], k: ap.alpha * Math.max(0.08, Math.min(1, (d - 1.5) / 3)) };
    }
    list.push(item);
  }
  const day = game.day;
  const danger = Math.max(0, 1 - dist / 6) + (['chase', 'hunt'].includes(c.state) ? 0.6 : 0);
  renderer.render(cam, list, {
    grain: 6 + day * 2.5, redness: (day - 1) * 0.12 + (game.noise > 80 ? 0.15 : 0), desat: 0.15 + day * 0.05,
    aberration: 0.008 + danger * 0.018 + shakeAmt * 0.02,
  });
}

function updateAudio(dt) {
  const p = game.player, c = game.creature;
  audio.setListener(p.x, p.y, p.a);
  const dist = Math.hypot(c.x - p.x, c.y - p.y);
  const chasing = ['chase', 'hunt'].includes(c.state);
  const t = chasing ? 1 : Math.max(Math.max(0, 1 - dist / 9) * 0.85, game.noise / 160);
  audio.setTension(game.phase === 'encounter' ? 1 : t);
  audio.setChase(chasing && game.phase === 'play');
  humT -= dt; pianoT -= dt;
  if (humT <= 0 && ['patrol', 'leaving', 'search'].includes(c.state) && dist < 15) { audio.hum({ x: c.x, y: c.y }); humT = rand(24, 42); }
  if (pianoT <= 0) { audio.piano(); pianoT = rand(50, 95); }
  breathT -= dt;
  if (dist < 7 && breathT <= 0) { audio.creatureBreath({ x: c.x, y: c.y }, Math.max(0, 1 - dist / 7)); breathT = rand(2.6, 4); }
}

// ═════════════ input ═════════════
const keys = new Set();
let mouseDX = 0, mouseDY = 0;
const touchState = { mx: 0, my: 0, lookDX: 0, lookDY: 0, run: false, crouch: false };

let turnVel = 0;
function readInput(dt = 1 / 60) {
  const k = (c) => keys.has(c);
  let fwd = (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0);
  let strafe = (k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0);
  const keyTurn = (k('ArrowRight') ? 1 : 0) - (k('ArrowLeft') ? 1 : 0);
  turnVel += (keyTurn * 2.6 - turnVel) * Math.min(1, dt * 10);
  let turn = turnVel * dt;
  fwd += -touchState.my;
  strafe += touchState.mx;
  const sens = saved.settings.sens;
  turn += mouseDX * 0.0022 * sens + touchState.lookDX * 0.006 * sens;
  const pitch = -mouseDY * 0.35 * sens - touchState.lookDY * 0.8 * sens;
  mouseDX = mouseDY = touchState.lookDX = touchState.lookDY = 0;
  if (game) game.player.strafeLean = -Math.max(-1, Math.min(1, strafe)) * 0.018;
  return {
    fwd: Math.max(-1, Math.min(1, fwd)), strafe: Math.max(-1, Math.min(1, strafe)), turn, pitch,
    run: k('ShiftLeft') || k('ShiftRight') || touchState.run,
    crouch: k('KeyC') || k('ControlLeft') || touchState.crouch,
  };
}

function bindInput() {
  window.addEventListener('keydown', (ev) => {
    if (ev.code === 'Escape') { closePanels(); return; }
    if (!game) return;
    if (encounterActive && !el.encBody.hidden && !answered) {
      const n = Number(ev.key);
      if (n >= 1 && n <= el.encOptions.children.length) { ev.preventDefault(); el.encOptions.children[n - 1].click(); }
      return;
    }
    keys.add(ev.code);
    if (['Space', 'ArrowUp', 'ArrowDown'].includes(ev.code)) ev.preventDefault();
    if (paused) return;
    if (ev.code === 'KeyE' || ev.code === 'Space') game.interact();
    if (ev.code === 'KeyF') game.toggleFlashlight();
    if (ev.code === 'KeyM') toggleMute();
  });
  window.addEventListener('keyup', (ev) => keys.delete(ev.code));
  window.addEventListener('blur', () => keys.clear());

  // mouse look with pointer lock
  el.view.addEventListener('click', () => { if (!isTouch && game && game.phase === 'play') el.view.requestPointerLock?.(); });
  el.pause.addEventListener('click', (ev) => { if (ev.target.id === 'btn-quit') return; if (!isTouch) el.view.requestPointerLock?.(); else setPaused(false); });
  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === el.view;
    if (locked) setPaused(false);
    else if (game && game.phase === 'play' && !encounterActive) setPaused(true);
  });
  document.addEventListener('mousemove', (ev) => {
    if (document.pointerLockElement === el.view) { mouseDX += ev.movementX; mouseDY += ev.movementY; }
  });
  el.view.addEventListener('mousedown', (ev) => { if (document.pointerLockElement === el.view && ev.button === 0) game?.interact(); });

  // touch: joystick + look pad + buttons
  if (isTouch) {
    el.body.classList.add('is-touch');
    const stick = $('#stick'), knob = $('#knob'), look = $('#lookpad');
    let stickId = null, lookId = null, lastLook = null, origin = null;
    stick.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; stickId = t.identifier; const r = stick.getBoundingClientRect(); origin = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; e.preventDefault(); }, { passive: false });
    look.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; lookId = t.identifier; lastLook = { x: t.clientX, y: t.clientY }; e.preventDefault(); }, { passive: false });
    window.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) {
          let dx = (t.clientX - origin.x) / 50, dy = (t.clientY - origin.y) / 50;
          const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
          touchState.mx = dx; touchState.my = dy;
          knob.style.transform = `translate(${dx * 38}px, ${dy * 38}px)`;
        }
        if (t.identifier === lookId) {
          touchState.lookDX += t.clientX - lastLook.x; touchState.lookDY += t.clientY - lastLook.y;
          lastLook = { x: t.clientX, y: t.clientY };
        }
      }
    }, { passive: true });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) { stickId = null; touchState.mx = touchState.my = 0; knob.style.transform = ''; }
        if (t.identifier === lookId) lookId = null;
      }
    };
    window.addEventListener('touchend', end); window.addEventListener('touchcancel', end);
    const tap = (id, fn) => $(id).addEventListener('touchstart', (e) => { e.preventDefault(); audio.init(); fn(); }, { passive: false });
    tap('#t-use', () => game?.interact());
    tap('#t-light', () => game?.toggleFlashlight());
    tap('#t-crouch', () => { touchState.crouch = !touchState.crouch; $('#t-crouch').classList.toggle('on', touchState.crouch); if (touchState.crouch) { touchState.run = false; $('#t-run').classList.remove('on'); } });
    tap('#t-run', () => { touchState.run = !touchState.run; $('#t-run').classList.toggle('on', touchState.run); if (touchState.run) { touchState.crouch = false; $('#t-crouch').classList.remove('on'); } });
  }
}

function setPaused(p) {
  paused = p;
  el.pause.hidden = !p;
  el.pause.querySelector('h2').textContent = game && game.time > 0 ? 'Paused' : 'Click to begin';
  if (p) keys.clear();
}

// ═════════════ HUD ═════════════
let lastPrompt = '';
function updateHud() {
  const n = Math.round(game.noise);
  el.noiseFill.style.width = `${n}%`;
  el.noiseVal.textContent = `${n}%`;
  el.noiseMeter.setAttribute('aria-valuenow', String(n));
  el.noiseMeter.classList.toggle('hot', n >= 75);
  el.day.textContent = game.day;
  const f = game.focus();
  const text = f ? `${isTouch ? '✋' : 'E'}  ${f.label}${f.used ? '  (searched)' : ''}` : '';
  if (text !== lastPrompt) { el.prompt.textContent = text; el.prompt.classList.toggle('show', !!text); lastPrompt = text; }
  const c = game.creature;
  const chip = ['chase', 'hunt'].includes(c.state) ? 'SHE SEES YOU — RUN · HIDE' : game.player.hidden ? `Hidden · ${isTouch ? '✋' : 'E'} to leave` : game.player.crouch ? 'Sneaking' : game.player.run ? 'Running — loud' : '';
  el.chip.textContent = chip;
  el.chip.className = 'status-chip' + (chip.startsWith('SHE') ? ' danger' : chip ? ' show' : '');
}

function renderInventory() {
  el.inventory.innerHTML = game.inventory.map((id) => `<li title="${ITEMS[id].name}"><span>${ITEMS[id].icon}</span>${ITEMS[id].name}</li>`).join('');
}

let subTimer;
function subtitle(text, kind = '') {
  el.subtitle.textContent = text;
  el.subtitle.className = `subtitle show ${kind}`;
  clearTimeout(subTimer);
  subTimer = setTimeout(() => el.subtitle.classList.remove('show'), Math.max(3500, text.length * 55));
}

let toastTimer;
function toast(text) {
  el.toast.textContent = text;
  el.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('show'), 2600);
}

let shakeAmt = 0;
function shake(k = 1) { if (!saved.settings.reducedMotion) shakeAmt = Math.max(shakeAmt, k); }
function flashRed(k = 0.6) {
  if (saved.settings.reducedMotion) k *= 0.4;
  el.redFlash.style.transition = 'none';
  el.redFlash.style.opacity = String(k);
  requestAnimationFrame(() => { el.redFlash.style.transition = 'opacity 1.2s'; el.redFlash.style.opacity = '0'; });
}
function fadeBlack() {
  el.redFlash.style.transition = 'none';
  el.redFlash.style.background = '#000';
  el.redFlash.style.opacity = '1';
  requestAnimationFrame(() => { el.redFlash.style.transition = 'opacity 1.4s'; el.redFlash.style.opacity = '0'; setTimeout(() => (el.redFlash.style.background = ''), 1400); });
}

// ═════════════ game events ═════════════
function onCreatureStep(pos) {
  audio.creatureStep(pos, pos.run);
  const d = Math.hypot(pos.x - game.player.x, pos.y - game.player.y);
  if (d < 4) shake((1 - d / 4) * 0.35);
}

function onSpotted() {
  const c = game.creature;
  audio.roar({ x: c.x, y: c.y });
  flashRed(0.45);
  shake(0.8);
  subtitle('She sees you.', 'warn');
}

function onGlimpse(kind) {
  // some things are worse in silence
  if (kind === 'corner') return;
  audio.stinger(kind === 'behind' ? 1 : 0.6);
  shake(kind === 'behind' ? 1 : 0.4);
  if (kind === 'behind') flashRed(0.3);
}

/** A non-lethal jump scare: something was right there. */
async function onJolt(variant) {
  const now = performance.now();
  if ((now - lastJolt < 15000 && !window.__joltAny) || encounterActive) return;
  lastJolt = now;
  const token = runToken;
  audio.scream(true);
  audio.stinger(1.1);
  el.scare.hidden = false;
  const style = { smiler: 'snap', girl: 'twitch' }[variant] ?? 'lunge';
  await playScare(el.scare, scareFace[variant] ?? scareFace.bride, { gentle: saved.settings.reducedMotion, dur: (style === 'snap' ? 700 : 560) * (window.__scareSlow ?? 1), style });
  if (token === runToken) el.scare.hidden = true;
  game?.addNoise(8);
}

function onScare(kind) {
  if (kind === 'slam') subtitle('A door slams somewhere close.', 'dim');
  if (kind === 'writing') setTimeout(() => game && subtitle('Something is scratching at a wall behind you.', 'dim'), 400);
}

const NURSERY_CRIB = OBJECTS.find((o) => o.id === 'crib');
function onRoom(room) {
  if (room === 'nursery' && Math.random() < 0.7) setTimeout(() => game && audio.musicBox(NURSERY_CRIB), 1200);
  if (room === 'basement') subtitle('The basement. The boiler ticks. Something drips.', 'dim');
}

// ═════════════ encounters ═════════════
const ENC_COPY = {
  found:    { title: 'She’s found your hiding place', intro: (e) => e.hideView === 'bed' ? 'Bare grey feet stop beside the bed. She kneels. Slowly. Her face lowers into view…' : 'She stops right outside. Her breath fogs the slats. Long fingers curl around the edge…' },
  grab:     { title: 'She has you', intro: () => 'Cold fingers close around your arm — answer to tear yourself free.' },
  lockpick: { title: 'Picking the lock', intro: () => 'You slide a bent hairpin into the lock. Slowly. Every scrape is deafening.' },
  standoff: { title: 'The front door', intro: () => 'Chain cut. Deadbolt turned. Your hand is on the handle — and behind you, on the stairs, something starts to laugh.' },
};

let timerRAF = null, answered = false;
async function runEncounter(e) {
  const token = runToken;
  encounterActive = true;
  document.exitPointerLock?.();
  el.pause.hidden = true;
  el.body.dataset.phase = 'encounter';
  const p = game.player, c = game.creature;
  if (e.kind === 'grab') { p.a = Math.atan2(c.y - p.y, c.x - p.x); p.pitch = 10; audio.roar({ x: c.x, y: c.y }); shake(1.2); flashRed(0.5); }
  if (e.kind === 'found') { audio.creatureBreath({ x: c.x, y: c.y }, 1); audio.stinger(0.8); }
  if (e.kind === 'standoff') { audio.stinger(1); audio.roar({ x: 10, y: 11.5 }); }
  el.enc.hidden = false;
  el.enc.className = `overlay encounter ${e.kind}`;
  el.encTitle.textContent = ENC_COPY[e.kind].title;
  el.encIntro.textContent = ENC_COPY[e.kind].intro(e);
  el.encIntro.hidden = false;
  el.encBody.hidden = true;
  await wait(e.kind === 'grab' ? 1100 : 2200);
  if (token !== runToken) return;
  el.encIntro.hidden = true;
  el.encBody.hidden = false;
  askQuestion(token);
}

function askQuestion(token) {
  const e = game.encounter, q = game.currentQuestion;
  answered = false;
  el.encProgress.textContent = `QUESTION ${e.index + 1} / ${e.questions.length}`;
  el.encQuestion.textContent = q.question;
  el.encOptions.innerHTML = '';
  q.options.forEach((opt, i) => {
    const b = document.createElement('button');
    b.className = 'enc-opt';
    b.innerHTML = `<span class="num">${i + 1}</span><span></span>`;
    b.lastChild.textContent = opt;
    b.addEventListener('click', () => submitAnswer(i, token));
    el.encOptions.append(b);
  });
  const total = e.seconds * 1000, start = performance.now(), hostile = e.kind !== 'lockpick';
  let lastSecond = e.seconds, nextBeat = start + 900;
  if (!saved.settings.reducedMotion) el.encBox.classList.add('shaking');
  const tick = (now) => {
    if (answered || token !== runToken) return;
    const elapsed = now - start, left = Math.max(0, total - elapsed), k = elapsed / total;
    el.timerFill.style.transform = `scaleX(${left / total})`;
    const secs = Math.ceil(left / 1000);
    el.timerNum.textContent = secs;
    el.timerNum.classList.toggle('panic', secs <= 3);
    el.encBox.style.setProperty('--shake', `${(hostile ? 1 + k * 9 : 0.5 + k * 2).toFixed(2)}px`);
    if (secs < lastSecond) { lastSecond = secs; if (secs <= 3) audio.play('tick'); }
    if (hostile && now > nextBeat) { const c = game.creature; audio.creatureBreath({ x: c.x, y: c.y }, 0.4 + k); nextBeat = now + 2600 - k * 1400; }
    if (left <= 0) return submitAnswer(-1, token);
    timerRAF = requestAnimationFrame(tick);
  };
  timerRAF = requestAnimationFrame(tick);
}

async function submitAnswer(choice, token) {
  if (answered || !game || token !== runToken) return;
  answered = true;
  cancelAnimationFrame(timerRAF);
  el.encBox.classList.remove('shaking');
  const res = game.answer(choice);
  if (!res) return;
  [...el.encOptions.children].forEach((b, i) => {
    b.disabled = true;
    if (i === res.correctIndex) b.classList.add('right');
    if (i === choice && !res.correct) b.classList.add('wrong');
  });
  if (choice === -1) el.encProgress.textContent = 'TOO SLOW';
  audio.play(res.correct ? 'correct' : 'wrong');
  await wait(res.correct ? 650 : 900);
  if (token !== runToken) return;
  if (!res.done) return askQuestion(token);
  el.enc.hidden = true;
  encounterActive = false;
  el.body.dataset.phase = game.phase === 'play' ? 'play' : game.phase;
  switch (res.outcome) {
    case 'escaped': toast('She walked away.'); break;
    case 'brokeFree': shake(0.8); break;
    case 'caught': case 'gameover':
      await caughtSequence(token);
      if (token !== runToken) return;
      if (store.unlockNow(saved, 'firstBlood')) toast(`Achievement: ${ACHIEVEMENTS.firstBlood.name}`);
      res.outcome === 'caught' ? showWake() : showEnd();
      return;
    case 'won':
      audio.setChase(false); audio.setTension(0); audio.play('door');
      await wait(1200);
      if (token === runToken) showEnd();
      return;
  }
  if (!isTouch && !paused) el.view.requestPointerLock?.();
}

async function caughtSequence(token) {
  audio.setChase(false);
  el.scare.hidden = false;
  audio.scream(saved.settings.reducedMotion);
  await playScare(el.scare, scareFace.mother, { gentle: saved.settings.reducedMotion });
  if (token !== runToken) return;
  el.scare.hidden = true;
}

const WAKE_TEXT = {
  2: 'She carried you back to bed. She wants you to try again.',
  3: 'Your wrists are bruised. Someone sang to you while you slept.',
  4: 'There are scratch marks on the inside of the wardrobe. Some of them are yours.',
  5: 'Last chance. She’s done playing.',
};
function showWake() {
  const next = game.day + 1;
  $('#wake-day').textContent = `DAY ${next}`;
  $('#wake-text').textContent = WAKE_TEXT[next] ?? 'You wake again.';
  el.wake.hidden = false;
  audio.setTension(0.2);
  setTimeout(() => $('#btn-wake').focus(), 50);
}
function wakeUp() {
  el.wake.hidden = true;
  game.wake();
  el.body.dataset.day = String(game.day);
  el.body.dataset.phase = 'play';
  el.hideOverlay.dataset.view = '';
  el.body.dataset.hidden = '';
  if (!isTouch) el.view.requestPointerLock?.();
}

function showEnd() {
  audio.setChase(false);
  document.exitPointerLock?.();
  el.pause.hidden = true;
  const s = game.summary();
  const { unlocked, newBest } = store.recordRun(saved, s);
  el.end.hidden = false;
  el.end.classList.toggle('won', s.won);
  el.end.classList.toggle('lost', !s.won);
  el.body.dataset.phase = s.won ? 'won' : 'gameover';
  const title = $('#end-title');
  title.textContent = s.won ? 'YOU ESCAPED' : 'YOU NEVER LEFT';
  title.dataset.text = title.textContent;
  $('#end-text').textContent = s.won
    ? (s.day === 1 ? 'Cold night air. You run and don’t look back. Behind you, a light comes on in an upstairs window.' : `Day ${s.day}. Cold air on your face. Behind you the door slams — and locks itself again.`)
    : 'Five days. She was patient. The bedroom door locks from the outside now.';
  const rows = [
    ['Score', `${s.score.toLocaleString()}${newBest ? '  ★ new best' : ''}`], ['Day reached', `${s.day} / ${MAX_DAYS}`],
    ['Questions right', s.correct], ['Questions wrong', s.wrong], ['Escaped her', s.pursuitsSurvived], ['Time', fmtTime(s.seconds)], ['Difficulty', DIFFICULTY[s.difficulty].label],
  ];
  $('#end-stats').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  $('#end-unlocks').innerHTML = unlocked.map((id) => `<div class="unlock">Achievement unlocked — <strong>${ACHIEVEMENTS[id].name}</strong><br><small>${ACHIEVEMENTS[id].desc}</small></div>`).join('');
  setTimeout(() => $('#btn-again').focus(), 50);
}

// ═════════════ title, panels, settings ═════════════
function renderTitleBest() {
  const st = saved.stats, parts = [];
  if (st.bestScore) parts.push(`Best score ${st.bestScore.toLocaleString()}`);
  if (st.fastestEscape !== null) parts.push(`Fastest escape ${fmtTime(st.fastestEscape)}`);
  if (st.runs) parts.push(`${st.escapes} escape${st.escapes === 1 ? '' : 's'} in ${st.runs} run${st.runs === 1 ? '' : 's'}`);
  $('#title-best').textContent = parts.join('  ·  ');
}
function renderAchievements() {
  const st = saved.stats;
  $('#stats-list').innerHTML = [['Best score', st.bestScore.toLocaleString()], ['Fastest escape', st.fastestEscape === null ? '—' : fmtTime(st.fastestEscape)], ['Escapes / runs', `${st.escapes} / ${st.runs}`], ['Times caught', st.deaths], ['Questions answered right', st.totalCorrect]]
    .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  $('#ach-list').innerHTML = Object.entries(ACHIEVEMENTS).map(([id, a]) => `<li class="${saved.achievements[id] ? 'got' : ''}"><strong>${saved.achievements[id] ? a.name : '???'}</strong><span>${a.desc}</span></li>`).join('');
}
function applySettings() {
  const s = saved.settings;
  document.querySelectorAll('input[name=difficulty]').forEach((r) => (r.checked = r.value === s.difficulty));
  $('#set-volume').value = s.volume;
  $('#set-sens').value = s.sens;
  $('#set-reduced').checked = s.reducedMotion;
  document.querySelectorAll('input[name=graphics]').forEach((r) => (r.checked = r.value === (s.graphics ?? (isTouch ? 'medium' : 'high'))));
  el.body.classList.toggle('reduced', s.reducedMotion);
  audio.setVolume(s.volume);
  audio.setMuted(s.muted);
}
function openPanel(id) { if (id === 'panel-achievements') renderAchievements(); const p = document.getElementById(id); p.hidden = false; p.querySelector('button, input')?.focus(); }
function closePanels() { document.querySelectorAll('.panel').forEach((p) => (p.hidden = true)); }
function toggleMute() { saved.settings.muted = !saved.settings.muted; store.save(saved); applySettings(); toast(saved.settings.muted ? 'Muted' : 'Sound on'); }

function bindUI() {
  $('#btn-start').addEventListener('click', startRun);
  $('#btn-again').addEventListener('click', startRun);
  $('#btn-title').addEventListener('click', quitToTitle);
  $('#btn-quit').addEventListener('click', (e) => { e.stopPropagation(); quitToTitle(); });
  $('#btn-wake').addEventListener('click', wakeUp);
  document.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openPanel(b.dataset.open)));
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closePanels));
  document.querySelectorAll('.panel').forEach((p) => p.addEventListener('click', (ev) => { if (ev.target === p) closePanels(); }));
  document.querySelectorAll('input[name=difficulty]').forEach((r) => r.addEventListener('change', () => { saved.settings.difficulty = r.value; store.save(saved); }));
  $('#set-volume').addEventListener('input', (ev) => { saved.settings.volume = Number(ev.target.value); audio.setVolume(saved.settings.volume); store.save(saved); });
  document.querySelectorAll('input[name=graphics]').forEach((r) => r.addEventListener('change', () => {
    saved.settings.graphics = r.value; store.save(saved);
    toast('Graphics change applies next time you load the page.');
  }));
  $('#set-sens').addEventListener('input', (ev) => { saved.settings.sens = Number(ev.target.value); store.save(saved); });
  $('#set-reduced').addEventListener('change', (ev) => { saved.settings.reducedMotion = ev.target.checked; store.save(saved); applySettings(); });
  $('#btn-reset').addEventListener('click', () => { store.resetProgress(saved); renderTitleBest(); toast('Progress wiped. The house forgets you.'); });
  window.addEventListener('pointermove', (ev) => {
    document.documentElement.style.setProperty('--mx', `${ev.clientX}px`);
    document.documentElement.style.setProperty('--my', `${ev.clientY}px`);
  }, { passive: true });
}

boot();
