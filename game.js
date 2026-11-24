// ─────────────────────────────────────────────────────────────
//  Core game logic — DOM-free. The UI feeds it input every frame
//  and listens to events; tests drive it directly.
//
//  phase: play → encounter → (play | caught | won)
//         caught → play (next day) | gameover (after Day 5)
// ─────────────────────────────────────────────────────────────

import { World, ROOM_DEFS, INTERACTABLES, ITEMS, PLAYER_START, WAKE_POS, MONSTER_START, PORTAL, WAYPOINTS, LIGHTS } from './world.js';
import { Scares } from './scares.js';

export const MAX_DAYS = 5;

export const DIFFICULTY = {
  easy:      { label: 'Easy',      seconds: 15, noiseMult: 0.8,  speed: 0.85, sight: 0.8, weights: { easy: 6, medium: 3, hard: 1 } },
  normal:    { label: 'Normal',    seconds: 10, noiseMult: 1.0,  speed: 1.0,  sight: 1.0, weights: { easy: 4, medium: 4, hard: 2 } },
  nightmare: { label: 'Nightmare', seconds: 7,  noiseMult: 1.25, speed: 1.15, sight: 1.25, weights: { easy: 2, medium: 4, hard: 4 } },
};

export const NOISE = {
  walk: 2.0,         // per second while walking
  run: 16,           // per second while running
  creak: 10,         // stepping on a loose floorboard
  door: 6,
  search: 25,
  loudTool: 50,
  lockpickFail: 25,
  stairs: 8,
  decay: 5,          // per second when still or sneaking
  hiddenDecay: 10,
  afterEscape: 20,
};

// loose floorboards
const CREAKY = new Set(['5,8', '9,9', '13,8', '18,9', '3,4', '10,3', '11,14', '16,5']);

const angDiff = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

export class Game {
  constructor(trivia, { difficulty = 'normal', rng = Math.random, now = () => Date.now() } = {}) {
    this.trivia = trivia;
    this.rng = rng;
    this.now = now;
    this.listeners = {};
    this.setDifficulty(difficulty);
    this.reset();
  }

  on(evt, fn) { (this.listeners[evt] ??= []).push(fn); return this; }
  emit(evt, ...args) { (this.listeners[evt] ?? []).forEach((fn) => fn(...args)); }

  setDifficulty(key) {
    this.difficultyKey = DIFFICULTY[key] ? key : 'normal';
    this.difficulty = DIFFICULTY[this.difficultyKey];
  }

  reset() {
    this.world = new World();
    this.time = 0;
    this.phase = 'play';
    this.day = 1;
    this.noise = 0;
    this.inventory = [];
    this.searched = new Set();
    this.encounter = null;
    this.player = { ...PLAYER_START, z: 0.5, pitch: 0, bob: 0, moving: 0, crouch: false, run: false, hidden: null, flashlight: false, stepAcc: 0, lastCell: '' };
    this.lights = LIGHTS.map((l) => ({ ...l, level: 1, killT: 0 }));
    this.creature = this.#newCreature(MONSTER_START.x, MONSTER_START.y);
    this.creature.waitT = 14;   // a moment to read the note before she starts moving
    this.apparitions = [];
    this.scares = new Scares(this);
    this.stats = { correct: 0, wrong: 0, caught: 0, escapesFromHer: 0, startedAt: this.now(), endedAt: null };
    this.visitedNursery = 0;
  }

  #newCreature(x, y) {
    return { x, y, a: Math.PI, state: 'patrol', path: null, pi: 0, target: null, repath: 0, waitT: 1.5, stunT: 0, seeT: 0, lostT: 0, huntT: 0, knowsHide: null, stepT: 0, lookT: 0, anim: 0, spotted: false };
  }

  has(item) { return this.inventory.includes(item); }
  get room() { return this.world.roomAt(this.player.x, this.player.y); }
  get dangerHere() { return ROOM_DEFS[this.room ?? 'hall']?.danger ?? 2; }

  // ═════════════ main update ═════════════
  /**
   * @param dt seconds
   * @param input { fwd, strafe (-1..1), turn (radians), pitch (px), run, crouch }
   */
  update(dt, input = {}) {
    if (this.phase !== 'play') return;
    dt = Math.min(dt, 0.05);
    this.time += dt;
    this.world.updateDoors(dt);
    this.#updateLights(dt);
    this.#updatePlayer(dt, input);
    this.#updateCreature(dt);
    this.scares.update(dt);
    this.#flickerAnim(dt);
  }

  #updateLights(dt) {
    for (const l of this.lights) {
      if (l.killT > 0) { l.killT -= dt; l.level = l.killT > 0 ? 0.02 : 1; continue; }
      const f = l.flicker;
      l.level = f > 0 && this.rng() < f * dt * 4 ? 0.15 + this.rng() * 0.4 : Math.min(1, l.level + dt * 6);
    }
  }

  #flickerAnim(dt) {
    this.world.objects.forEach((o) => { if (o.anim === 'rock') o.phase = (o.phase ?? 0) + dt; });
  }

  #updatePlayer(dt, inp) {
    const p = this.player;
    if (p.hidden) {
      this.addNoise(-NOISE.hiddenDecay * dt);
      p.pitch += (inp.pitch ?? 0);
      p.pitch = Math.max(-60, Math.min(60, p.pitch));
      p.a = p.hidden.hide.a + Math.max(-0.6, Math.min(0.6, angDiff(p.a + (inp.turn ?? 0), p.hidden.hide.a)));
      return;
    }
    p.a += inp.turn ?? 0;
    p.pitch = Math.max(-90, Math.min(90, p.pitch + (inp.pitch ?? 0)));
    p.crouch = !!inp.crouch;
    p.run = !!inp.run && !p.crouch;
    const targetZ = p.crouch ? 0.3 : 0.5;
    p.z += (targetZ - p.z) * Math.min(1, dt * 10);

    let f = inp.fwd ?? 0, s = inp.strafe ?? 0;
    const len = Math.hypot(f, s);
    if (len > 1) { f /= len; s /= len; }
    const speed = p.crouch ? 0.9 : p.run ? 3.1 : 1.7;
    const ca = Math.cos(p.a), sa = Math.sin(p.a);
    // ease into and out of movement instead of snapping to full speed
    const tvx = (ca * f - sa * s) * speed, tvy = (sa * f + ca * s) * speed;
    const k = Math.min(1, dt * (len > 0.01 ? 11 : 14));
    p.vx = (p.vx ?? 0) + (tvx - (p.vx ?? 0)) * k;
    p.vy = (p.vy ?? 0) + (tvy - (p.vy ?? 0)) * k;
    const dx = p.vx * dt, dy = p.vy * dt;
    const [nx, ny] = this.world.move(p.x, p.y, dx, dy);
    const moved = Math.hypot(nx - p.x, ny - p.y);
    if (Math.abs(nx - p.x - dx) > 1e-6) p.vx *= 0.3;   // bumped a wall
    if (Math.abs(ny - p.y - dy) > 1e-6) p.vy *= 0.3;
    p.x = nx; p.y = ny;
    p.moving = moved / dt;

    if (moved > 0.0005) {
      p.bob += moved * (p.run ? 9 : 7);
      p.stepAcc += moved;
      const stride = p.run ? 0.75 : p.crouch ? 0.5 : 0.62;
      if (p.stepAcc > stride) {
        p.stepAcc = 0;
        this.emit('step', { room: this.room, run: p.run, crouch: p.crouch });
      }
      if (!p.crouch) this.addNoise((p.run ? NOISE.run : NOISE.walk) * dt, p.x, p.y, false);
      else this.addNoise(-NOISE.decay * 0.4 * dt);
    } else {
      this.addNoise(-NOISE.decay * dt);
    }

    // floorboards, rooms, stairs
    const cell = `${Math.floor(p.x)},${Math.floor(p.y)}`;
    if (cell !== p.lastCell) {
      p.lastCell = cell;
      if (CREAKY.has(cell) && !p.crouch) { this.emit('sfx', 'creak', { x: p.x, y: p.y }); this.addNoise(NOISE.creak, p.x, p.y); }
      if (cell === `${Math.floor(PORTAL.up.x)},${Math.floor(PORTAL.up.y)}`) this.#takeStairs('down');
      const r = this.room;
      if (r !== this._lastRoom) { this._lastRoom = r; this.emit('room', r); }
    }
  }

  #takeStairs(dir) {
    const p = this.player;
    const to = dir === 'down' ? PORTAL.down : { x: 21.5, y: 8.5 };
    p.x = to.x; p.y = to.y; p.a = dir === 'down' ? Math.PI / 2 : Math.PI;
    p.lastCell = `${Math.floor(p.x)},${Math.floor(p.y)}`;
    this.emit('stairs', dir);
    this.emit('message', dir === 'down' ? 'You feel your way down the stairs. The air turns cold and wet.' : 'You climb back up into the house.', 'dim');
    this.addNoise(NOISE.stairs, p.x, p.y);
  }

  // ═════════════ noise ═════════════
  addNoise(amount, x = this.player.x, y = this.player.y, alertCreature = true) {
    const scaled = amount > 0 ? amount * this.difficulty.noiseMult : amount;
    const before = this.noise;
    this.noise = Math.max(0, Math.min(100, this.noise + scaled));
    if (amount > 0 && alertCreature) this.#hear(scaled, x, y);
    if (this.noise >= 100 && before < 100 && this.phase === 'play') this.#pursuit();
  }

  #hear(amount, x, y) {
    const c = this.creature;
    if (['chase', 'hunt', 'stunned'].includes(c.state)) return;
    const radius = 3 + amount * 0.22 + this.noise * 0.06 + this.day * 0.4;
    if (Math.hypot(c.x - x, c.y - y) <= radius) {
      c.state = 'investigate';
      c.target = { x, y };
      c.path = null;
      this.emit('creatureAlert', 'investigate');
    }
  }

  #pursuit() {
    const c = this.creature;
    c.state = 'hunt';
    c.huntT = 7;
    c.target = { x: this.player.x, y: this.player.y };
    c.path = null;
    if (this.player.hidden) c.knowsHide = this.player.hidden;
    this.emit('pursuit');
    this.emit('message', 'Too loud. She knows exactly where you are.', 'warn');
    this.noise = 80;
  }

  // ═════════════ the creature ═════════════
  #canSeePlayer() {
    const c = this.creature, p = this.player;
    if (p.hidden) return false;
    const d = Math.hypot(p.x - c.x, p.y - c.y);
    let range = 4.5;
    if (p.flashlight) range = 11;
    else if (this.lights.some((l) => l.level > 0.5 && Math.hypot(l.x - p.x, l.y - p.y) < l.rad * 0.55)) range = 8;
    if (p.crouch) range *= 0.7;
    range *= this.difficulty.sight * (1 + (this.day - 1) * 0.06);
    if (d > range) return false;
    const toP = Math.atan2(p.y - c.y, p.x - c.x);
    if (d > 2.2 && Math.abs(angDiff(toP, c.a)) > 1.25) return false;
    return this.world.los(c.x, c.y, p.x, p.y);
  }

  #updateCreature(dt) {
    const c = this.creature, p = this.player, w = this.world;
    c.anim += dt;
    if (c.state === 'stunned') { c.stunT -= dt; if (c.stunT <= 0) { c.state = 'chase'; c.path = null; } return; }

    const sees = this.#canSeePlayer();
    if (sees) {
      c.lostT = 0;
      if (c.state !== 'chase') {
        c.state = 'chase';
        c.path = null;
        if (!c.spotted) { c.spotted = true; }
        this.emit('spotted');
      }
      c.target = { x: p.x, y: p.y };
    } else if (c.state === 'chase') {
      c.lostT += dt;
      if (c.lostT > 2.5) {
        c.state = 'search';
        c.lookT = 3.5;
        this.emit('creatureAlert', 'lost');
      }
    }
    if (c.state === 'hunt') {
      c.huntT -= dt;
      if (!p.hidden) c.target = { x: p.x, y: p.y };
      if (c.huntT <= 0 && !sees) { c.state = 'search'; c.lookT = 3.5; }
    }

    // grab
    const dist = Math.hypot(p.x - c.x, p.y - c.y);
    if (!p.hidden && dist < 0.72 && ['chase', 'hunt', 'investigate', 'search'].includes(c.state)) {
      this.#startEncounter('grab', { count: 1 });
      return;
    }
    // she checks your hiding place
    if (p.hidden && c.knowsHide === p.hidden) {
      if (!['chase', 'hunt', 'investigate'].includes(c.state)) { c.state = 'investigate'; c.path = null; }
      if (!c.target || c.target.x !== p.hidden.hide.x) c.path = null;
      c.target = { x: p.hidden.hide.x, y: p.hidden.hide.y };
      if (Math.hypot(c.x - p.hidden.hide.x, c.y - p.hidden.hide.y) < 1.2) {
        this.#startEncounter('found', { count: ROOM_DEFS[this.room ?? 'hall']?.danger ?? 2 });
        return;
      }
    }

    // choose targets
    if (c.state === 'patrol' && (!c.target || this.#arrived(c))) {
      c.waitT -= dt;
      if (c.waitT > 0) return;
      const options = WAYPOINTS.filter(([x, y]) => Math.hypot(x - c.x, y - c.y) > 4);
      const [tx, ty] = options[Math.floor(this.rng() * options.length)];
      c.target = { x: tx, y: ty };
      c.path = null;
      c.waitT = 1.5 + this.rng() * 3;
    }
    if (c.state === 'investigate' && this.#arrived(c)) { c.state = 'search'; c.lookT = 3 + this.rng() * 2; }
    if (c.state === 'search') {
      c.lookT -= dt;
      c.a += Math.sin(this.time * 1.7) * dt * 1.6;
      // sometimes she opens a hiding place in the room you're in
      if (p.hidden && this.world.roomAt(c.x, c.y) === this.room && Math.hypot(c.x - p.hidden.hide.x, c.y - p.hidden.hide.y) < 3 && !c.checked) {
        c.checked = true;
        if (this.rng() < 0.3 + this.noise / 200) c.knowsHide = p.hidden;
      }
      if (c.lookT <= 0) { c.state = 'patrol'; c.target = null; c.checked = false; c.waitT = 0.5; }
      if (!c.knowsHide) return;
    }
    if (c.state === 'leaving' && this.#arrived(c)) { c.state = 'patrol'; c.target = null; }

    this.#walk(c, dt, w);
  }

  #arrived(c) { return c.target && Math.hypot(c.target.x - c.x, c.target.y - c.y) < 0.45; }

  #speed(c) {
    const base = { patrol: 1.0, leaving: 1.3, investigate: 1.6, search: 1.0, chase: 2.4, hunt: 2.5 }[c.state] ?? 1;
    return base * this.difficulty.speed * (1 + (this.day - 1) * 0.07);
  }

  #walk(c, dt, w) {
    if (!c.target) return;
    c.repath -= dt;
    if (!c.path || c.repath <= 0) {
      c.path = w.path(c.x, c.y, c.target.x, c.target.y);
      c.pi = 1;
      c.repath = ['chase', 'hunt'].includes(c.state) ? 0.4 : 2.5;
      if (!c.path) { c.target = null; return; }
    }
    if (c.pi >= c.path.length) {
      // last step: walk straight at the exact target
      this.#stepToward(c, c.target.x, c.target.y, dt);
      return;
    }
    const [nx, ny] = c.path[c.pi];
    const cur = [Math.floor(c.x), Math.floor(c.y)];
    // stairwell ↔ basement portal
    const pu = [Math.floor(PORTAL.up.x), Math.floor(PORTAL.up.y)], pd = [Math.floor(PORTAL.down.x), Math.floor(PORTAL.down.y)];
    if ((cur[0] === pu[0] && cur[1] === pu[1] && nx === pd[0] && ny === pd[1]) || (cur[0] === pd[0] && cur[1] === pd[1] && nx === pu[0] && ny === pu[1])) {
      c.x = nx + 0.5; c.y = ny + 0.5; c.pi++;
      this.emit('creatureStairs', { x: c.x, y: c.y });
      return;
    }
    // doors: she opens them
    const di = w.doorAt[w.i(nx, ny)];
    if (di >= 0) {
      const d = w.doors[di];
      if (d.open < 0.85) {
        if (d.target !== 1) { d.target = 1; this.emit('sfx', 'doorOpen', { x: d.x + 0.5, y: d.y + 0.5 }); }
        c.a = Math.atan2(ny + 0.5 - c.y, nx + 0.5 - c.x);
        return;
      }
    }
    if (this.#stepToward(c, nx + 0.5, ny + 0.5, dt) < 0.12) c.pi++;
  }

  #stepToward(c, tx, ty, dt) {
    const dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy);
    if (d < 0.001) return 0;
    const sp = this.#speed(c);
    const step = Math.min(d, sp * dt);
    c.x += (dx / d) * step;
    c.y += (dy / d) * step;
    const want = Math.atan2(dy, dx);
    c.a += angDiff(want, c.a) * Math.min(1, dt * 8);
    c.stepT -= dt * sp;
    if (c.stepT <= 0) { c.stepT = 0.62; this.emit('creatureStep', { x: c.x, y: c.y, run: sp > 2 }); }
    return d - step;
  }

  // ═════════════ interaction ═════════════
  /** What the player is looking at and close enough to use. */
  focus() {
    const p = this.player;
    if (this.phase !== 'play') return null;
    if (p.hidden) return { kind: 'unhide', label: 'Leave the hiding place' };
    let best = null, bestScore = -Infinity;
    for (const it of INTERACTABLES) {
      const dx = it.x - p.x, dy = it.y - p.y, d = Math.hypot(dx, dy);
      if (d > 1.55) continue;
      const facing = (dx * Math.cos(p.a) + dy * Math.sin(p.a)) / (d || 1);
      if (facing < 0.5) continue;
      const score = facing * 2 - d;
      if (score > bestScore) { bestScore = score; best = it; }
    }
    const door = this.world.doorNear(p.x, p.y, p.a);
    if (door && (!best || Math.hypot(door.x + 0.5 - p.x, door.y + 0.5 - p.y) < Math.hypot(best.x - p.x, best.y - p.y))) {
      return { kind: 'door', door, label: door.open > 0.5 ? 'Close the door' : door.locked ? 'Unlock the door' : 'Open the door' };
    }
    if (!best) return null;
    const used = this.searched.has(best.id);
    return { kind: 'thing', it: best, label: best.label, used };
  }

  interact() {
    if (this.phase !== 'play') return false;
    const f = this.focus();
    if (!f) return false;
    const p = this.player;
    if (f.kind === 'unhide') {
      const spot = p.hidden;
      p.hidden = null;
      p.a = spot.hide.a; p.z = 0.5;
      // step out in front of the hiding place
      const out = spot.id === 'bed' ? { x: 2.3, y: 2.9 } : { x: spot.hide.x + Math.cos(spot.hide.a) * 0.35, y: spot.hide.y + Math.sin(spot.hide.a) * 0.35 };
      p.x = out.x; p.y = out.y;
      this.emit('unhide', spot);
      this.emit('sfx', 'hideOut', { x: p.x, y: p.y });
      this.addNoise(3);
      return true;
    }
    if (f.kind === 'door') {
      const d = f.door;
      if (d.locked) {
        if (this.has(d.lock)) {
          d.locked = false;
          this.emit('sfx', 'unlock', { x: d.x + 0.5, y: d.y + 0.5 });
          this.emit('message', 'The rusty key turns. The basement door unlocks.', 'item');
        } else {
          this.emit('sfx', 'rattle', { x: d.x + 0.5, y: d.y + 0.5 });
          this.emit('message', 'Locked. Something is scratched into the wood: BASEMENT.', 'warn');
          this.addNoise(4);
          return false;
        }
      }
      d.target = d.open > 0.5 ? 0 : 1;
      this.emit('sfx', d.target ? 'doorOpen' : 'doorClose', { x: d.x + 0.5, y: d.y + 0.5 });
      this.addNoise(NOISE.door, d.x + 0.5, d.y + 0.5);
      return true;
    }
    const it = f.it;
    const used = this.searched.has(it.id);
    switch (it.type) {
      case 'read':
        this.emit('message', it.text, 'clue');
        this.emit('sfx', 'paper', it);
        return true;
      case 'hide':
        p.hidden = it;
        p.x = it.hide.x; p.y = it.hide.y; p.a = it.hide.a; p.z = it.hide.z; p.pitch = 0;
        if (['chase', 'hunt'].includes(this.creature.state) && this.world.los(this.creature.x, this.creature.y, it.hide.x, it.hide.y) && Math.hypot(this.creature.x - it.hide.x, this.creature.y - it.hide.y) < 9) {
          this.creature.knowsHide = it;  // she saw you go in
        } else if (this.creature.knowsHide !== it) {
          this.creature.knowsHide = null;
        }
        this.emit('hide', it);
        this.emit('sfx', 'hideIn', it);
        return true;
      case 'search':
        if (used) { this.emit('message', it.emptyText, 'dim'); return false; }
        this.searched.add(it.id);
        this.emit('sfx', 'rummage', it);
        this.emit('message', it.text, it.gives ? 'item' : 'dim');
        if (it.gives) this.#give(it.gives);
        this.addNoise(NOISE.search, it.x, it.y);
        return true;
      case 'smash':
        if (used) { this.emit('message', it.emptyText, 'dim'); return false; }
        if (!this.has(it.requires)) { this.emit('message', it.lockedText, 'warn'); return false; }
        this.searched.add(it.id);
        this.emit('sfx', 'smash', it);
        this.emit('shake', 1);
        this.emit('message', it.text, 'item');
        this.#give(it.gives);
        this.addNoise(NOISE.loudTool, it.x, it.y);
        return true;
      case 'lockpick':
        if (used) { this.emit('message', it.emptyText, 'dim'); return false; }
        this.#startEncounter('lockpick', { it, count: it.questions });
        return true;
      case 'exit':
        if (!it.requires.every((i) => this.has(i))) {
          this.emit('message', it.lockedText, 'warn');
          this.emit('sfx', 'rattle', it);
          this.addNoise(6);
          return false;
        }
        this.#startEncounter('standoff', { count: it.questions });
        return true;
      case 'stairs':
        this.#takeStairs('up');
        return true;
    }
    return false;
  }

  toggleFlashlight() {
    if (!this.has('flashlight') || this.phase !== 'play') return false;
    this.player.flashlight = !this.player.flashlight;
    this.emit('sfx', 'click', this.player);
    return true;
  }

  #give(item) {
    if (this.has(item)) return;
    this.inventory.push(item);
    this.emit('item', item, ITEMS[item]);
  }

  // ═════════════ trivia encounters ═════════════
  #startEncounter(kind, { it = null, count = 1 } = {}) {
    const questions = this.trivia.draw(count, this.difficulty.weights);
    const c = this.creature;
    if (kind === 'found') {
      // she's right outside your hiding place, face to the slats
      const h = this.player.hidden.hide;
      c.x = h.x + Math.cos(h.a) * 0.95; c.y = h.y + Math.sin(h.a) * 0.95;
      c.a = h.a + Math.PI;
    }
    if (kind === 'standoff') {
      this.creature.state = 'hunt';
      this.creature.huntT = 30;
    }
    this.phase = 'encounter';
    const secs = kind === 'grab' ? Math.max(5, Math.round(this.difficulty.seconds * 0.7)) : this.difficulty.seconds;
    this.encounter = { kind, it, questions, index: 0, seconds: secs, room: this.room, hideView: this.player.hidden?.hide.view ?? null };
    this.emit('encounter', this.encounter);
  }

  get currentQuestion() {
    const e = this.encounter;
    return e ? e.questions[e.index] : null;
  }

  answer(choice) {
    const e = this.encounter;
    if (this.phase !== 'encounter' || !e) return null;
    const q = e.questions[e.index];
    const correct = choice === q.correctIndex;
    correct ? this.stats.correct++ : this.stats.wrong++;
    if (!correct) return { correct, correctIndex: q.correctIndex, done: true, outcome: this.#encounterFailed() };
    e.index++;
    if (e.index < e.questions.length) return { correct, correctIndex: q.correctIndex, done: false };
    return { correct, correctIndex: q.correctIndex, done: true, outcome: this.#encounterPassed() };
  }

  #farthestWaypoint() {
    const p = this.player;
    return WAYPOINTS.map(([x, y]) => ({ x, y, d: Math.hypot(x - p.x, y - p.y) })).sort((a, b) => b.d - a.d)[this.rng() < 0.5 ? 0 : 1];
  }

  #encounterPassed() {
    const { kind, it } = this.encounter;
    const c = this.creature;
    this.encounter = null;
    this.phase = 'play';
    if (kind === 'found') {
      c.knowsHide = null;
      c.state = 'leaving';
      const far = this.#farthestWaypoint();
      c.target = { x: far.x, y: far.y };
      c.path = null;
      this.noise = NOISE.afterEscape;
      this.stats.escapesFromHer++;
      this.emit('message', 'Her breath fogs the slats… then she turns and drags herself away.', 'calm');
      return 'escaped';
    }
    if (kind === 'grab') {
      c.state = 'stunned';
      c.stunT = 3;
      c.path = null;
      // shove free, away from her
      const p = this.player, ang = Math.atan2(p.y - c.y, p.x - c.x);
      [p.x, p.y] = this.world.move(p.x, p.y, Math.cos(ang) * 0.6, Math.sin(ang) * 0.6);
      this.noise = 60;
      this.stats.escapesFromHer++;
      this.emit('message', 'You tear yourself out of her grip. RUN.', 'warn');
      return 'brokeFree';
    }
    if (kind === 'lockpick') {
      this.searched.add(it.id);
      this.emit('sfx', 'unlock', it);
      this.emit('message', it.text, 'item');
      this.#give(it.gives);
      return 'unlocked';
    }
    this.phase = 'won';
    this.stats.endedAt = this.now();
    this.emit('win', this.summary());
    return 'won';
  }

  #encounterFailed() {
    const { kind } = this.encounter;
    if (kind === 'lockpick') {
      this.encounter = null;
      this.phase = 'play';
      this.emit('sfx', 'rattle', this.player);
      this.emit('message', 'A pin snaps back with a loud CLACK. The lock holds.', 'warn');
      this.addNoise(NOISE.lockpickFail);
      return 'lockFailed';
    }
    this.encounter = null;
    this.stats.caught++;
    if (this.day >= MAX_DAYS) {
      this.phase = 'gameover';
      this.stats.endedAt = this.now();
      this.emit('caught', { final: true });
      return 'gameover';
    }
    this.phase = 'caught';
    this.emit('caught', { final: false });
    return 'caught';
  }

  /** After the jump scare: next day, back in bed. */
  wake() {
    if (this.phase !== 'caught') return false;
    this.day++;
    const p = this.player;
    Object.assign(p, { ...WAKE_POS, z: 0.5, pitch: 0, hidden: null, flashlight: false, crouch: false, run: false, lastCell: '' });
    this.noise = 0;
    const spawns = [[30.5, 6.5], [17, 5.5], [10, 15]];
    const [sx, sy] = spawns[Math.floor(this.rng() * spawns.length)];
    this.creature = this.#newCreature(sx, sy);
    this.creature.waitT = 4;
    this.world.doors.forEach((d) => { if (!d.locked && d.kind !== 'basement') d.target = d.open = 0; });
    this.apparitions = [];
    this.scares.newDay();
    this.phase = 'play';
    this.emit('message', `Day ${this.day}. You wake in the bed. Your pockets are still full. She moved the furniture while you slept.`, 'day');
    return true;
  }

  summary() {
    const s = this.stats;
    const seconds = Math.round(((s.endedAt ?? this.now()) - s.startedAt) / 1000);
    const won = this.phase === 'won';
    const score = won ? s.correct * 100 + (MAX_DAYS - this.day + 1) * 500 + Math.max(0, 1200 - seconds) * 2 + s.escapesFromHer * 150 : s.correct * 100;
    return { won, day: this.day, seconds, score, correct: s.correct, wrong: s.wrong, caught: s.caught, pursuitsSurvived: s.escapesFromHer, difficulty: this.difficultyKey };
  }
}
