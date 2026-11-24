// ─────────────────────────────────────────────────────────────
//  The scare director: things that linger where you aren't looking.
//  Apparitions are harmless — they exist to be half-seen.
//
//  watcher   — a pale woman at the far end of what you're looking at; vanishes when you look straight at her
//  behind    — something standing right behind you; only there if you turn around in time
//  crosser   — a child runs across a doorway ahead
//  crawler   — something on the ceiling in the dark; flees the flashlight
//  slam      — a door you left open slams shut
//  whisper   — a voice right next to your ear
//  blackout  — the nearest light dies, and something stands in its place when it comes back
//  writing   — words appear on a wall you walked past
//  smiler    — a tall man at the end of the hall, staring. He doesn't vanish when you look.
//              He only moves when you don't — and every time, he's closer. Then he smiles.
//  eyes      — pairs of eyes in the dark that blink, and flee from the flashlight
//  girl      — a little girl, head bowed. Look long enough and she looks back up at you.
//  underbed  — a face on the floor under the bed, and a hand reaching out
//  flicker   — your flashlight dies; when it comes back, something is right in front of you
//  corner    — a woman standing in a corner, face to the wall. Look away, and when you look back
//              she has turned around. Look away again and she's somewhere else. Maybe behind you.
//  follower  — for a while, your footsteps have an echo. It stops a step after you do.
// ─────────────────────────────────────────────────────────────

import { RESIDENT_SPOTS } from './world.js';

const RESIDENTS = [
  { sprite: 'bride', w: 0.56, h: 0.95 },
  { sprite: 'gardener', w: 0.6, h: 1.0 },
  { sprite: 'drowned', w: 0.55, h: 0.92 },
  { sprite: 'nurse', w: 0.52, h: 0.92 },
  { sprite: 'ghost', w: 0.55, h: 0.92 },
];

const angDiff = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

export class Scares {
  constructor(game) {
    this.g = game;
    this.timer = 22;           // first scare comes fairly soon
    this.recent = [];
    this.wrote = new Set();
    this.clock = 0;
    this.lastJolt = -999;
    this.followT = 0;
    this.newDay();
  }

  /**
   * The residents: still, silent figures in dark corners. They never chase you and
   * nothing points them out. They're only there if you happen to look — and when
   * you look away, they may be standing somewhere else.
   */
  newDay() {
    const g = this.g;
    g.apparitions = g.apparitions.filter((a) => a.kind !== 'resident');
    const n = Math.min(RESIDENT_SPOTS.length, 1 + g.day * 2);
    const spots = [...RESIDENT_SPOTS].sort(() => this.rng() - 0.5).slice(0, n);
    spots.forEach(([x, y], i) => {
      const r = RESIDENTS[(i + g.day) % RESIDENTS.length];
      g.apparitions.push({ kind: 'resident', sprite: r.sprite, x, y, w: r.w, h: r.h, alpha: 0.82, maxAlpha: 0.82, ttl: Infinity, age: 0, seenT: 0, moveT: 6 + this.rng() * 10 });
    });
  }

  get rng() { return this.g.rng; }

  /** A jump scare — at most one every ~20 seconds, so they keep their bite. */
  jolt(variant) {
    if (this.clock - this.lastJolt < 20) return false;
    this.lastJolt = this.clock;
    this.g.emit('jolt', variant);
    return true;
  }
  get joltReady() { return this.clock - this.lastJolt >= 20; }

  update(dt) {
    const g = this.g;
    this.clock += dt;
    this.followT = Math.max(0, this.followT - dt);
    this.#tickApparitions(dt);
    if (g.player.hidden) return;
    if (['chase', 'hunt'].includes(g.creature.state)) return;
    this.timer -= dt * (1 + (g.day - 1) * 0.3);
    if (this.timer > 0) return;
    this.timer = 18 + this.rng() * 22;
    this.trigger();
  }

  /** Pick a scare that fits where the player is. Exposed for testing. */
  trigger(force = null) {
    const g = this.g;
    const dark = !g.lights.some((l) => l.level > 0.5 && Math.hypot(l.x - g.player.x, l.y - g.player.y) < l.rad * 0.6);
    let pool = ['watcher', 'behind', 'crosser', 'slam', 'whisper', 'blackout', 'writing', 'peek', 'crying', 'girl', 'eyes'];
    if (dark) pool.push('crawler', 'crawler', 'eyes', 'eyes');
    if (g.day >= 3) pool.push('behind', 'watcher', 'girl');
    if (!g.apparitions.some((a) => a.kind === 'smiler')) pool.push('smiler', ...(g.day >= 2 ? ['smiler'] : []));
    if (!g.apparitions.some((a) => a.kind === 'corner')) pool.push('corner', 'corner');
    if (this.followT <= 0) pool.push('follower');
    if (g.player.flashlight && this.joltReady) pool.push('flicker', 'flicker');
    const bed = g.world.objects.find((o) => o.id === 'bed');
    if (bed && Math.hypot(bed.x - g.player.x, bed.y - g.player.y) < 4.5) pool.push('underbed', 'underbed', 'underbed');
    pool = pool.filter((k) => !this.recent.includes(k));
    const kind = force ?? pool[Math.floor(this.rng() * pool.length)];
    const ok = typeof this[kind] === 'function' && !['jolt', 'trigger', 'update', 'newDay', 'joltReady'].includes(kind) ? this[kind]() : false;
    if (ok) {
      this.recent.push(kind);
      if (this.recent.length > 3) this.recent.shift();
      g.emit('scare', kind);
    } else if (!force) {
      this.whisper();
    }
    return ok;
  }

  #spawn(a) {
    this.g.apparitions.push({ alpha: 0, seenT: 0, age: 0, vx: 0, vy: 0, ...a });
  }

  /** Walk along the view direction and find the far end of the open space. */
  #rayAhead(angle, max = 14) {
    const p = this.g.player, w = this.g.world;
    let last = null;
    for (let d = 0.6; d < max; d += 0.2) {
      const x = p.x + Math.cos(angle) * d, y = p.y + Math.sin(angle) * d;
      if (w.solid(Math.floor(x), Math.floor(y))) break;
      last = { x, y, d };
    }
    return last;
  }

  watcher() {
    const p = this.g.player;
    for (const off of [0, 0.25, -0.25, 0.45, -0.45]) {
      const end = this.#rayAhead(p.a + off);
      if (end && end.d > 5) {
        const back = Math.max(4.5, end.d - 0.7);
        this.#spawn({ kind: 'watcher', sprite: 'ghost', x: p.x + Math.cos(p.a + off) * back, y: p.y + Math.sin(p.a + off) * back, w: 0.55, h: 0.92, ttl: 9, maxAlpha: 0.85 });
        return true;
      }
    }
    return false;
  }

  behind() {
    const p = this.g.player, w = this.g.world;
    const a = p.a + Math.PI;
    for (const d of [1.4, 1.1, 0.9]) {
      const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
      if (!w.solid(Math.floor(x), Math.floor(y)) && w.los(p.x, p.y, x, y)) {
        this.#spawn({ kind: 'behind', sprite: 'ghost', x, y, w: 0.55, h: 0.92, ttl: 7, maxAlpha: 0.95, follow: true });
        this.g.emit('sfx', 'breathBehind', { x, y });
        return true;
      }
    }
    return false;
  }

  crosser() {
    const p = this.g.player;
    const end = this.#rayAhead(p.a, 9);
    if (!end || end.d < 3) return false;
    const d = Math.min(end.d - 0.4, 3 + this.rng() * 3);
    const cx = p.x + Math.cos(p.a) * d, cy = p.y + Math.sin(p.a) * d;
    const side = p.a + Math.PI / 2;
    const w = this.g.world;
    // run from one side wall to the other
    let a = null, b = null;
    for (let s = 0; s < 4; s += 0.2) { const x = cx - Math.cos(side) * s, y = cy - Math.sin(side) * s; if (w.solid(Math.floor(x), Math.floor(y))) break; a = { x, y }; }
    for (let s = 0; s < 4; s += 0.2) { const x = cx + Math.cos(side) * s, y = cy + Math.sin(side) * s; if (w.solid(Math.floor(x), Math.floor(y))) break; b = { x, y }; }
    if (!a || !b || Math.hypot(a.x - b.x, a.y - b.y) < 1) return false;
    const len = Math.hypot(b.x - a.x, b.y - a.y), spd = 4.5;
    this.#spawn({ kind: 'crosser', sprite: 'child', x: a.x, y: a.y, vx: ((b.x - a.x) / len) * spd, vy: ((b.y - a.y) / len) * spd, ttl: len / spd, w: 0.42, h: 0.55, maxAlpha: 0.9, fadeIn: 30 });
    this.g.emit('sfx', 'childRun', { x: cx, y: cy });
    return true;
  }

  crawler() {
    const p = this.g.player;
    const end = this.#rayAhead(p.a, 7);
    if (!end || end.d < 2.5) return false;
    const d = Math.min(end.d - 0.3, 4);
    this.#spawn({ kind: 'crawler', sprite: 'crawler', x: p.x + Math.cos(p.a) * d, y: p.y + Math.sin(p.a) * d, z: 0.62, w: 0.9, h: 0.38, ttl: 8, maxAlpha: 1, creep: 0.35 });
    this.g.emit('sfx', 'skitter', { x: p.x + Math.cos(p.a) * d, y: p.y + Math.sin(p.a) * d });
    return true;
  }

  slam() {
    const g = this.g, p = g.player;
    const doors = g.world.doors.filter((d) => d.open > 0.8 && !d.locked && Math.hypot(d.x + 0.5 - p.x, d.y + 0.5 - p.y) > 1.6 && Math.hypot(d.x + 0.5 - p.x, d.y + 0.5 - p.y) < 9);
    if (!doors.length) return false;
    const d = doors[Math.floor(this.rng() * doors.length)];
    d.target = 0;
    d.open = Math.min(d.open, 0.4);
    g.emit('sfx', 'slam', { x: d.x + 0.5, y: d.y + 0.5 });
    g.emit('shake', 0.6);
    return true;
  }

  /** A face peeks around the frame of a doorway ahead. */
  peek() {
    const g = this.g, p = g.player;
    const doors = g.world.doors.filter((d) => {
      const dx = d.x + 0.5 - p.x, dy = d.y + 0.5 - p.y, dist = Math.hypot(dx, dy);
      return dist > 2.5 && dist < 8 && Math.abs(angDiff(Math.atan2(dy, dx), p.a)) < 0.6 && d.open > 0.5;
    });
    if (!doors.length) return false;
    const d = doors[0];
    const side = this.rng() < 0.5 ? -1 : 1;
    let x = d.x + 0.5, y = d.y + 0.5;
    if (d.axis === 'x') { x += side * 0.4; y += Math.sign(p.y - y) * 0.6; } else { y += side * 0.4; x += Math.sign(p.x - x) * 0.6; }
    this.#spawn({ kind: 'peek', sprite: 'peeker', x, y, z: 0.42, w: 0.3, h: 0.45, ttl: 7, maxAlpha: 1, fadeIn: 40, flip: side < 0 });
    return true;
  }

  /** Someone sobbing — from where one of the residents is standing. */
  crying() {
    const res = this.g.apparitions.filter((a) => a.kind === 'resident');
    const src = res.length ? res[Math.floor(this.rng() * res.length)] : { x: 10.3, y: 1.7 };
    this.g.emit('sfx', 'crying', { x: src.x, y: src.y });
    return true;
  }

  whisper() {
    const p = this.g.player;
    const side = this.rng() < 0.5 ? -1 : 1;
    this.g.emit('sfx', 'whisper', { x: p.x + Math.cos(p.a + side * Math.PI / 2) * 0.5, y: p.y + Math.sin(p.a + side * Math.PI / 2) * 0.5 });
    return true;
  }

  blackout() {
    const g = this.g, p = g.player;
    const near = g.lights.filter((l) => l.id !== 'moon' && Math.hypot(l.x - p.x, l.y - p.y) < 6).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
    if (!near) return false;
    near.killT = 1.6;
    g.emit('sfx', 'bulbPop', { x: near.x, y: near.y });
    // when the light comes back she's standing under it — for a moment
    if (g.world.los(p.x, p.y, near.x, near.y)) {
      this.#spawn({ kind: 'blackout', sprite: 'ghost', x: near.x, y: near.y + 0.01, w: 0.55, h: 0.92, ttl: 2.2, delay: 1.55, maxAlpha: 1, fadeIn: 50 });
    }
    return true;
  }

  writing() {
    const g = this.g, p = g.player, w = g.world;
    // a wall cell behind the player, in this room
    const a = p.a + Math.PI;
    for (let d = 0.5; d < 7; d += 0.25) {
      const cx = Math.floor(p.x + Math.cos(a) * d), cy = Math.floor(p.y + Math.sin(a) * d);
      const i = w.i(cx, cy);
      if (w.kind[i] === 1) {
        if (w.override[i] || this.wrote.has(i)) return false;
        w.override[i] = this.rng() < 0.5 ? 'writing' : 'handprints';
        this.wrote.add(i);
        g.emit('sfx', 'scratch', { x: cx + 0.5, y: cy + 0.5 });
        return true;
      }
    }
    return false;
  }

  /** The Smiling Man. Spawns far down whatever you're looking along. */
  smiler() {
    const g = this.g, p = g.player;
    for (const off of [0, 0.2, -0.2, 0.4, -0.4]) {
      const end = this.#rayAhead(p.a + off, 13);
      if (end && end.d > 5.5) {
        const back = Math.min(end.d - 0.5, 8.5);
        const x = p.x + Math.cos(p.a + off) * back, y = p.y + Math.sin(p.a + off) * back;
        this.#spawn({ kind: 'smiler', sprite: 'smiler', frame: 0, x, y, w: 0.5, h: 1.14, ttl: 50, maxAlpha: 1, fadeIn: 0.8, stepT: 1.2, lookT: 0 });
        return true;
      }
    }
    return false;
  }

  /** Eyes in the dark: two to four pairs, in the darkest places you can see. */
  eyes() {
    const g = this.g, p = g.player, w = g.world;
    const isDark = (x, y) => !g.lights.some((l) => l.level > 0.3 && Math.hypot(l.x - x, l.y - y) < l.rad * 0.55 && w.los(l.x, l.y, x, y));
    const spots = [];
    for (let k = 0; k < 24 && spots.length < 2 + Math.floor(this.rng() * 3); k++) {
      const a = p.a + (this.rng() - 0.5) * 1.5;
      const end = this.#rayAhead(a, 10);
      if (!end || end.d < 3) continue;
      const d = 3 + this.rng() * (end.d - 3);
      const x = p.x + Math.cos(a) * (d - 0.25), y = p.y + Math.sin(a) * (d - 0.25);
      if (!isDark(x, y) || spots.some((s) => Math.hypot(s.x - x, s.y - y) < 1.2)) continue;
      spots.push({ x, y });
    }
    if (!spots.length) return false;
    for (const { x, y } of spots) {
      const z = [0.78, 0.8, 0.42, 0.05][Math.floor(this.rng() * 4)];
      this.#spawn({ kind: 'eyes', sprite: 'eyes', x, y, z, w: 0.3, h: 0.19, ttl: 16 + this.rng() * 6, maxAlpha: 1, fadeIn: 1.5, delay: this.rng() * 2, blinkT: 1 + this.rng() * 3 });
    }
    return true;
  }

  /** A little girl, head bowed, somewhere ahead. */
  girl() {
    const p = this.g.player;
    for (const off of [0.35, -0.35, 0.15, -0.15, 0.55, -0.55]) {
      const end = this.#rayAhead(p.a + off, 9);
      if (end && end.d > 3.5) {
        const back = Math.min(end.d - 0.4, 6.5);
        this.#spawn({ kind: 'girl', sprite: 'girl', frame: 0, x: p.x + Math.cos(p.a + off) * back, y: p.y + Math.sin(p.a + off) * back, w: 0.36, h: 0.62, ttl: 30, maxAlpha: 1, fadeIn: 1.2, awayT: 0 });
        return true;
      }
    }
    return false;
  }

  /** Under the bed: a face on the floor, looking at you, and a hand reaching out. */
  underbed() {
    const g = this.g, p = g.player;
    const bed = g.world.objects.find((o) => o.id === 'bed');
    if (!bed) return false;
    const d = Math.hypot(p.x - bed.x, p.y - bed.y);
    if (d < 1.2) return false;
    const ux = (p.x - bed.x) / d, uy = (p.y - bed.y) / d;
    const x = bed.x + ux * 0.5, y = bed.y + uy * 0.5;
    this.#spawn({ kind: 'underbed', sprite: 'underbed', x, y, z: 0, w: 0.82, h: 0.27, ttl: 24, maxAlpha: 1, fadeIn: 0.7 });
    return true;
  }

  /** The flashlight dies. When it comes back on, something is standing right in front of you. */
  flicker() {
    const g = this.g, p = g.player, w = g.world;
    if (!p.flashlight || !this.joltReady) return false;
    const end = this.#rayAhead(p.a, 3);
    if (!end || end.d < 1.3) return false;
    const x = p.x + Math.cos(p.a) * 1.05, y = p.y + Math.sin(p.a) * 1.05;
    if (w.solid(Math.floor(x), Math.floor(y))) return false;
    const smile = this.rng() < 0.5;
    g.emit('flashFail', 1.15);
    this.#spawn({ kind: 'flicker', sprite: smile ? 'smiler' : 'ghost', frame: 1, variant: smile ? 'smiler' : 'bride', x, y, w: smile ? 0.5 : 0.55, h: smile ? 1.14 : 0.92, ttl: 0.7, delay: 1.05, maxAlpha: 1, fadeIn: 60 });
    return true;
  }

  /** A woman in a corner, face to the wall. */
  corner() {
    const g = this.g, p = g.player, w = g.world;
    const wall = (x, y) => w.solid(x, y);
    let best = null;
    for (let y = Math.floor(p.y) - 8; y <= Math.floor(p.y) + 8; y++) for (let x = Math.floor(p.x) - 8; x <= Math.floor(p.x) + 8; x++) {
      if (wall(x, y)) continue;
      const dx = wall(x - 1, y) ? -1 : wall(x + 1, y) ? 1 : 0, dy = wall(x, y - 1) ? -1 : wall(x, y + 1) ? 1 : 0;
      if (!dx || !dy) continue;
      const cx = x + 0.5 + dx * 0.22, cy = y + 0.5 + dy * 0.22;
      const d = Math.hypot(cx - p.x, cy - p.y);
      if (d < 3 || d > 8.5 || !w.los(p.x, p.y, cx, cy)) continue;
      let da = Math.atan2(cy - p.y, cx - p.x) - p.a; da = Math.atan2(Math.sin(da), Math.cos(da));
      const score = Math.abs(da) + this.rng() * 0.4;
      if (Math.abs(da) < 0.75 && (!best || score < best.score)) best = { x: cx, y: cy, score };
    }
    if (!best) return false;
    this.#spawn({ kind: 'corner', sprite: 'corner', frame: 0, x: best.x, y: best.y, w: 0.44, h: 1.0, ttl: 70, maxAlpha: 1, fadeIn: 1.5, awayT: 0, stage: 0 });
    return true;
  }

  /** For a while, every step you take is answered by one behind you. */
  follower() {
    if (this.followT > 0) return false;
    this.followT = 18 + this.rng() * 14;
    return true;
  }

  #tickApparitions(dt) {
    const g = this.g, p = g.player;
    g.apparitions = g.apparitions.filter((ap) => {
      ap.age += dt;
      if (ap.kind === 'resident') return this.#tickResident(ap, dt);
      if (ap.delay && ap.age < ap.delay) { ap.alpha = 0; return true; }
      if (ap.kind === 'smiler') return this.#tickSmiler(ap, dt);
      if (ap.kind === 'girl') return this.#tickGirl(ap, dt);
      if (ap.kind === 'eyes') return this.#tickEyes(ap, dt);
      if (ap.kind === 'corner') return this.#tickCorner(ap, dt);
      if (ap.kind === 'flicker') {
        ap.alpha = 1; ap.ttl -= dt;
        if (!ap.fired && ap.age > ap.delay + 0.32) { ap.fired = true; this.lastJolt = -999; this.jolt(ap.variant); return false; }
        return ap.ttl > 0;
      }
      ap.ttl -= dt;
      if (ap.vx || ap.vy) { ap.x += ap.vx * dt; ap.y += ap.vy * dt; }
      if (ap.creep) {
        const d = Math.hypot(p.x - ap.x, p.y - ap.y);
        if (d > 1.2) { ap.x += ((p.x - ap.x) / d) * ap.creep * dt; ap.y += ((p.y - ap.y) / d) * ap.creep * dt; }
      }
      if (ap.follow && !this.#inView(ap, 0.9)) {
        // keeps standing right behind you while you don't look
        const a = p.a + Math.PI, x = p.x + Math.cos(a) * 1.2, y = p.y + Math.sin(a) * 1.2;
        if (!g.world.solid(Math.floor(x), Math.floor(y))) { ap.x += (x - ap.x) * Math.min(1, dt * 3); ap.y += (y - ap.y) * Math.min(1, dt * 3); }
      }
      const fade = ap.fadeIn ?? 2.5;
      ap.alpha = Math.min(ap.maxAlpha, ap.alpha + dt * fade);
      // looked at directly?
      const centred = this.#inView(ap, ap.kind === 'watcher' ? 0.16 : 0.32) && g.world.los(p.x, p.y, ap.x, ap.y);
      if (centred && ap.alpha > 0.3) {
        ap.seenT += dt;
        if (!ap.announced && ap.seenT > 0.05) {
          ap.announced = true;
          if (ap.kind !== 'crosser') g.emit('glimpse', ap.kind);
          // turned around and it was RIGHT there
          if (ap.kind === 'behind' && Math.hypot(p.x - ap.x, p.y - ap.y) < 1.8) this.jolt(this.rng() < 0.5 ? 'bride' : 'drowned');
        }
        // walked right up to the thing under the bed
        if (ap.kind === 'underbed' && Math.hypot(p.x - ap.x, p.y - ap.y) < 1.25 && this.jolt('drowned')) { g.emit('vanish', ap.kind); return false; }
        const tolerate = { watcher: 0.45, behind: 0.22, crawler: p.flashlight ? 0.25 : 0.9, blackout: 0.6, crosser: 9, underbed: 1.1 }[ap.kind] ?? 0.4;
        if (ap.seenT > tolerate) {
          if (ap.kind === 'underbed') g.emit('sfx', 'dragAway', { x: ap.x, y: ap.y });
          g.emit('vanish', ap.kind); return false;
        }
      }
      if (ap.kind === 'watcher' && Math.hypot(p.x - ap.x, p.y - ap.y) < 3.2) { g.emit('vanish', ap.kind); return false; }
      return ap.ttl > 0;
    });
  }

  /** He doesn't move while you look at him. He's patient. */
  #tickSmiler(ap, dt) {
    const g = this.g, p = g.player, w = g.world;
    ap.ttl -= dt;
    ap.alpha = Math.min(1, ap.alpha + dt * ap.fadeIn);
    const d = Math.hypot(p.x - ap.x, p.y - ap.y);
    const seen = this.#inView(ap, 0.5) && w.los(p.x, p.y, ap.x, ap.y);
    if (seen && ap.alpha > 0.5) {
      ap.lookT += dt;
      if (!ap.announced) { ap.announced = true; g.emit('glimpse', 'smiler'); }
      // stare at him long enough and he smiles back
      if (ap.frame === 0 && ap.lookT > 1.6) { ap.frame = 1; g.emit('sfx', 'stareTone', { x: ap.x, y: ap.y }); }
      if (d < 1.6) { this.jolt('smiler'); g.emit('vanish', 'smiler'); return false; }
      return true;
    }
    if (ap.ttl <= 0) return false;
    if (d < 1.6) {
      // standing right behind you, waiting for you to turn around
      if (!ap.breathed) { ap.breathed = true; g.emit('sfx', 'breathBehind', { x: ap.x, y: ap.y }); }
      return true;
    }
    ap.stepT -= dt;
    if (ap.stepT <= 0) {
      ap.stepT = 0.7 + this.rng() * 0.6;
      const path = w.path(ap.x, ap.y, p.x, p.y);
      if (path && path.length > 1) {
        // a few tiles closer — but never where you'd see him arrive
        for (let k = Math.min(path.length - 1, 2); k >= 1; k--) {
          const nx = path[k][0] + 0.5, ny = path[k][1] + 0.5;
          const visible = this.#inView({ x: nx, y: ny }, 0.62) && w.los(p.x, p.y, nx, ny);
          if (visible || Math.hypot(nx - p.x, ny - p.y) < 1.1) continue;
          ap.x = nx; ap.y = ny;
          if (ap.lookT > 0) ap.frame = 1;
          if (this.rng() < 0.35) g.emit('sfx', 'creak', { x: nx, y: ny });
          break;
        }
      }
    }
    return true;
  }

  /** Head bowed. Look at her and she looks up. Look away and she comes closer. */
  #tickGirl(ap, dt) {
    const g = this.g, p = g.player, w = g.world;
    ap.ttl -= dt;
    ap.alpha = Math.min(1, ap.alpha + dt * ap.fadeIn);
    const d = Math.hypot(p.x - ap.x, p.y - ap.y);
    const seen = this.#inView(ap, 0.4) && w.los(p.x, p.y, ap.x, ap.y);
    if (seen && ap.alpha > 0.4) {
      ap.seenT += dt; ap.awayT = 0;
      if (!ap.announced) { ap.announced = true; g.emit('glimpse', 'girl'); }
      if (ap.frame === 0 && ap.seenT > 0.9) { ap.frame = 1; g.emit('sfx', 'giggle', { x: ap.x, y: ap.y }); }
      if (ap.frame === 1 && d < 1.7) { this.jolt('girl'); g.emit('vanish', 'girl'); return false; }
      if (ap.seenT > 4.5) { g.emit('sfx', 'childRun', { x: ap.x, y: ap.y }); g.emit('vanish', 'girl'); return false; }
      return true;
    }
    if (ap.frame === 1) {
      ap.awayT += dt;
      if (ap.awayT > 0.6 && d > 2) {
        // she's closer now, still looking up at you
        const nx = ap.x + (p.x - ap.x) * 0.45, ny = ap.y + (p.y - ap.y) * 0.45;
        if (!w.solid(Math.floor(nx), Math.floor(ny)) && w.los(nx, ny, ap.x, ap.y)) { ap.x = nx; ap.y = ny; }
        ap.awayT = -1.5;
        ap.seenT = 1;
      }
    }
    return ap.ttl > 0;
  }

  /** She only ever moves when you aren't looking. */
  #tickCorner(ap, dt) {
    const g = this.g, p = g.player, w = g.world;
    ap.ttl -= dt;
    ap.alpha = Math.min(1, ap.alpha + dt * ap.fadeIn);
    const d = Math.hypot(p.x - ap.x, p.y - ap.y);
    const seen = this.#inView(ap, 0.55) && w.los(p.x, p.y, ap.x, ap.y);
    if (seen && ap.alpha > 0.5) {
      ap.seenT += dt; ap.awayT = 0;
      if (!ap.announced) { ap.announced = true; g.emit('glimpse', 'corner'); }
      if (ap.stage === 2 && d < 1.7) { this.jolt('girl'); g.emit('vanish', 'corner'); return false; }
      return true;
    }
    if (ap.seenT < 0.8) return ap.ttl > 0;
    ap.awayT += dt;
    // stage 0 → 1: she turns around while your back is turned
    if (ap.stage === 0 && ap.awayT > 1.2) { ap.stage = 1; ap.frame = 1; ap.seenT = 0; ap.awayT = 0; return true; }
    // stage 1 → 2: she's somewhere else now. Usually behind you.
    if (ap.stage === 1 && ap.awayT > 1.4) {
      const bx = p.x - Math.cos(p.a) * 1.3, by = p.y - Math.sin(p.a) * 1.3;
      if (this.rng() < 0.7 && !w.solid(Math.floor(bx), Math.floor(by)) && w.los(p.x, p.y, bx, by)) {
        ap.x = bx; ap.y = by; ap.stage = 2; ap.seenT = 0; ap.awayT = 0; ap.ttl = Math.min(ap.ttl, 12);
        g.emit('sfx', 'breathBehind', { x: bx, y: by });
        return true;
      }
      return false;
    }
    return ap.ttl > 0;
  }

  /** Eyes blink. Eyes don't like the light. */
  #tickEyes(ap, dt) {
    const g = this.g, p = g.player, w = g.world;
    ap.ttl -= dt;
    ap.blinkT -= dt;
    const target = ap.ttl < 1.5 ? ap.ttl / 1.5 : 1;
    ap.alpha = Math.min(target, ap.alpha + dt * ap.fadeIn);
    if (ap.blinkT < 0) { ap.alpha = 0; if (ap.blinkT < -0.13) ap.blinkT = 1.5 + this.rng() * 3.5; }
    const d = Math.hypot(p.x - ap.x, p.y - ap.y);
    const seen = this.#inView(ap, 0.45) && w.los(p.x, p.y, ap.x, ap.y);
    if (seen && ap.alpha > 0.3 && !ap.announced) { ap.announced = true; if (!g.apparitions.some((o) => o !== ap && o.kind === 'eyes' && o.announced)) g.emit('glimpse', 'eyes'); }
    // caught in the beam: gone, with a skitter
    if (p.flashlight && this.#inView(ap, 0.2) && d < 8 && w.los(p.x, p.y, ap.x, ap.y)) { g.emit('sfx', 'skitter', { x: ap.x, y: ap.y }); g.emit('vanish', 'eyes'); return false; }
    if (d < 1.4) { g.emit('vanish', 'eyes'); return false; }
    return ap.ttl > 0;
  }

  #tickResident(ap, dt) {
    const g = this.g, p = g.player;
    const d = Math.hypot(p.x - ap.x, p.y - ap.y);
    const seen = this.#inView(ap, 0.55) && g.world.los(p.x, p.y, ap.x, ap.y);
    if (d < 1.7) {
      // you walked right up to it — it's gone. Later in the week, it doesn't go quietly.
      if (g.day >= 3 && this.rng() < 0.35) this.jolt(ap.sprite === 'drowned' ? 'drowned' : 'bride');
      this.#relocate(ap);
      ap.alpha = 0;
      return true;
    }
    ap.alpha = Math.min(ap.maxAlpha, ap.alpha + dt * 0.5);
    ap.moveT -= dt;
    if (ap.moveT <= 0 && !seen && d > 5) { this.#relocate(ap); ap.moveT = 8 + this.rng() * 12; }
    return true;
  }

  #relocate(ap) {
    const g = this.g, p = g.player;
    const taken = new Set(g.apparitions.filter((a) => a.kind === 'resident' && a !== ap).map((a) => `${a.x},${a.y}`));
    const options = RESIDENT_SPOTS.filter(([x, y]) => !taken.has(`${x},${y}`) && Math.hypot(x - p.x, y - p.y) > 4 &&
      !(this.#inView({ x, y }, 0.7) && g.world.los(p.x, p.y, x, y)));
    if (!options.length) return;
    const [x, y] = options[Math.floor(this.rng() * options.length)];
    ap.x = x; ap.y = y;
  }

  #inView(ap, cone) {
    const p = this.g.player;
    const to = Math.atan2(ap.y - p.y, ap.x - p.x);
    return Math.abs(angDiff(to, p.a)) < cone;
  }
}
