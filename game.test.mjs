// Run with:  npm test
// Headless tests for the house, the creature and the rules.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/js/game.js';
import { World, ROOM_DEFS, INTERACTABLES } from '../src/js/world.js';
import { TriviaEngine, validateQuestions } from '../src/js/trivia.js';

const { questions } = JSON.parse(readFileSync(new URL('../src/data/questions.json', import.meta.url)));
function seeded(seed = 42) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }
const newGame = (opts) => new Game(new TriviaEngine(questions, { rng: seeded() }), { rng: seeded(9), ...opts });
const resolve = (g, correct = true) => {
  while (g.phase === 'encounter') {
    const q = g.currentQuestion;
    g.answer(correct ? q.correctIndex : (q.correctIndex + 1) % q.options.length);
  }
};
const place = (g, x, y, a) => Object.assign(g.player, { x, y, a, lastCell: `${Math.floor(x)},${Math.floor(y)}` });
const it = (id) => INTERACTABLES.find((i) => i.id === id);
const faceAndUse = (g, id) => {
  const t = it(id);
  // stand ~1 tile away on a free side, facing it
  for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const x = t.x + dx * 1.0, y = t.y + dy * 1.0;
    if (!g.world.solid(Math.floor(x), Math.floor(y))) { place(g, x, y, Math.atan2(-dy, -dx)); break; }
  }
  return g.interact();
};

test('question bank is valid', () => {
  assert.deepEqual(validateQuestions(questions), []);
  assert.ok(questions.length >= 80);
});

test('trivia never repeats until the pool is exhausted', () => {
  const t = new TriviaEngine(questions, { rng: seeded(7) });
  const seen = new Set();
  for (let i = 0; i < questions.length; i++) { const [q] = t.draw(1); assert.ok(!seen.has(q.id)); seen.add(q.id); }
});

test('every room is reachable by the creature, including the basement via the stairs', () => {
  const w = new World();
  for (const [id, def] of Object.entries(ROOM_DEFS)) {
    if (id === 'stairwell') continue;
    const [x1, y1, x2, y2] = def.rect;
    let target = null;
    for (let y = y1; y <= y2 && !target; y++) for (let x = x1; x <= x2 && !target; x++) if (w.walkableForCreature(x, y)) target = [x, y];
    assert.ok(w.path(3.5, 4.5, target[0] + 0.5, target[1] + 0.5), `no path to ${id}`);
  }
});

test('walls and closed doors stop the player', () => {
  const g = newGame();
  place(g, 3.5, 6.5, Math.PI / 2);                       // facing the closed bedroom door
  for (let i = 0; i < 60; i++) g.update(0.033, { fwd: 1 });
  assert.ok(g.player.y < 7, 'walked through a closed door');
  g.interact();                                            // open it
  for (let i = 0; i < 40; i++) g.update(0.033, {});
  for (let i = 0; i < 60; i++) g.update(0.033, { fwd: 1 });
  assert.ok(g.player.y > 7.6, 'could not walk through the open door');
});

test('running is loud, sneaking is silent', () => {
  const g = newGame();
  place(g, 1.6, 4.5, 0);
  for (let i = 0; i < 30; i++) g.update(0.033, { fwd: 1, crouch: true });
  assert.equal(Math.round(g.noise), 0);
  for (let i = 0; i < 30; i++) g.update(0.033, { fwd: 1, run: true });
  assert.ok(g.noise > 8);
});

test('100% noise sends her straight for you', () => {
  const g = newGame();
  g.addNoise(100);
  assert.equal(g.creature.state, 'hunt');
});

test('she sees a flashlight down the hall, chases, grabs — breaking free stuns her', () => {
  const g = newGame();
  g.inventory.push('flashlight');
  g.player.flashlight = true;
  place(g, 4.5, 8.5, 0);
  Object.assign(g.creature, { x: 12.5, y: 8.5, a: Math.PI, state: 'patrol', target: null });
  let spotted = false;
  g.on('spotted', () => (spotted = true));
  for (let i = 0; i < 400 && g.phase === 'play'; i++) g.update(0.033, {});
  assert.ok(spotted);
  assert.equal(g.encounter.kind, 'grab');
  resolve(g, true);
  assert.equal(g.creature.state, 'stunned');
  assert.equal(g.phase, 'play');
});

test('hiding while she watches: she finds the spot → trivia; passing sends her away', () => {
  const g = newGame();
  place(g, 3, 2.7, Math.PI / 2);
  Object.assign(g.creature, { x: 3.5, y: 5.5, a: -Math.PI / 2, state: 'chase', target: { x: 3, y: 2.7 } });
  faceAndUse(g, 'bed');
  assert.ok(g.player.hidden);
  assert.equal(g.creature.knowsHide?.id, 'bed');
  for (let i = 0; i < 300 && g.phase === 'play'; i++) g.update(0.033, {});
  assert.equal(g.encounter.kind, 'found');
  assert.equal(g.encounter.questions.length, 1);             // bedroom danger = 1
  resolve(g, true);
  assert.equal(g.creature.state, 'leaving');
  assert.equal(g.noise, 20);
});

test('she can see you climb into a wardrobe (a solid block) and come for you', () => {
  const g = newGame();
  place(g, 6.5, 2.9, -Math.PI / 2);
  Object.assign(g.creature, { x: 4, y: 4.5, a: 0, state: 'chase', target: { x: 6.5, y: 2.5 } });
  g.interact();
  assert.equal(g.creature.knowsHide?.id, 'wardrobe1');
  for (let i = 0; i < 300 && g.phase === 'play'; i++) g.update(0.033, {});
  assert.equal(g.encounter?.kind, 'found');
});

test('failing advances the day; failing on Day 5 is game over', () => {
  const g = newGame();
  for (let day = 1; day <= 5; day++) {
    place(g, 4.5, 8.5, 0);
    Object.assign(g.creature, { x: 4.9, y: 8.5, state: 'chase', target: { x: 4.5, y: 8.5 } });
    g.update(0.033, {});
    assert.equal(g.phase, 'encounter');
    resolve(g, false);
    if (day < 5) { assert.equal(g.phase, 'caught'); g.wake(); assert.equal(g.day, day + 1); }
  }
  assert.equal(g.phase, 'gameover');
});

test('the full escape route', () => {
  const g = newGame();
  let won = false;
  g.on('win', () => (won = true));
  const calm = () => { Object.assign(g.creature, { x: 30.5, y: 9.5, state: 'patrol', target: null, waitT: 999 }); g.noise = 0; };
  calm(); faceAndUse(g, 'nightstand'); assert.ok(g.has('flashlight'));
  calm(); faceAndUse(g, 'linenCloset'); assert.ok(g.has('hammer'));
  calm(); faceAndUse(g, 'lockedDrawer'); resolve(g, true); assert.ok(g.has('basementKey'));
  // unlock + open the basement door, walk down the stairs
  calm(); place(g, 21.5, 8.5, 0); g.interact(); g.interact();
  for (let i = 0; i < 40; i++) g.update(0.033, {});
  for (let i = 0; i < 40 && g.room !== 'basement'; i++) { g.creature.waitT = 999; g.update(0.033, { fwd: 1 }); }
  assert.equal(g.room, 'basement');
  calm(); faceAndUse(g, 'workbench'); assert.ok(g.has('boltCutters'));
  calm(); faceAndUse(g, 'toolbox'); resolve(g, true); calm(); assert.ok(g.has('masterKey'));
  calm(); place(g, 10.5, 16.4, Math.PI / 2); g.interact();
  assert.equal(g.encounter.kind, 'standoff');
  assert.equal(g.encounter.questions.length, 3);
  resolve(g, true);
  assert.ok(won && g.phase === 'won');
});

test('the scare director spawns apparitions and they vanish when looked at', () => {
  const g = newGame();
  const transient = () => g.apparitions.filter((a) => a.kind !== 'resident');
  place(g, 2, 8.5, 0);                                     // looking down the long hallway
  assert.ok(g.scares.trigger('watcher'));
  assert.equal(transient().length, 1);
  for (let i = 0; i < 60; i++) g.update(0.033, {});
  assert.equal(transient().length, 0, 'watcher should vanish when stared at');
  place(g, 10, 8.5, 0);
  assert.ok(g.scares.trigger('behind'));
  assert.equal(transient()[0].kind, 'behind');
});

test('residents: more of them each day, and they never stand next to you', () => {
  const g = newGame();
  const count = () => g.apparitions.filter((a) => a.kind === 'resident').length;
  assert.equal(count(), 3);                                // day 1
  g.day = 3; g.scares.newDay();
  assert.equal(count(), 7);
  const r = g.apparitions.find((a) => a.kind === 'resident');
  place(g, r.x + 0.5, r.y, Math.PI);
  g.update(0.033, {});
  assert.ok(Math.hypot(r.x - g.player.x, r.y - g.player.y) > 1.7, 'resident should be gone from beside you');
});

test('the Smiling Man only moves while you are not looking — and his smile comes when you stare', () => {
  const g = newGame();
  Object.assign(g.creature, { x: 30.5, y: 9.5, state: 'patrol', waitT: 9999 });
  g.apparitions = [];
  place(g, 2.2, 8.5, 0);
  assert.ok(g.scares.trigger('smiler'));
  const s = g.apparitions.find((a) => a.kind === 'smiler');
  assert.ok(s && s.x > 7, 'spawns far down the hall');
  const start = { x: s.x, y: s.y };
  for (let i = 0; i < 60; i++) { g.player.a = 0; g.scares.update(0.05); }      // 3 s of staring
  assert.deepEqual({ x: s.x, y: s.y }, start, 'never moves while watched');
  assert.equal(s.frame, 1, 'smiles after you stare');
  for (let i = 0; i < 80; i++) { g.player.a = Math.PI; g.scares.update(0.05); }   // turn your back
  assert.ok(Math.hypot(s.x - 2.2, s.y - 8.5) < Math.hypot(start.x - 2.2, start.y - 8.5) - 1, 'closer when you look back');
  // let him get all the way up to you, then turn around
  const jolts = [];
  g.on('jolt', (v) => jolts.push(v));
  for (let i = 0; i < 400 && Math.hypot(s.x - 2.2, s.y - 8.5) >= 1.6; i++) { g.player.a = Math.PI; g.scares.update(0.05); }
  g.player.a = Math.atan2(s.y - 8.5, s.x - 2.2);
  g.scares.update(0.05);
  assert.deepEqual(jolts, ['smiler']);
  assert.ok(!g.apparitions.includes(s));
});

test('eyes in the dark flee the flashlight; the girl looks up when watched', () => {
  const g = newGame();
  Object.assign(g.creature, { x: 30.5, y: 9.5, state: 'patrol', waitT: 9999 });
  g.apparitions = [];
  place(g, 2.2, 8.5, 0);
  g.apparitions.push({ kind: 'eyes', sprite: 'eyes', x: 6, y: 8.5, z: 0.8, w: 0.3, h: 0.19, ttl: 20, maxAlpha: 1, fadeIn: 5, alpha: 0, age: 0, seenT: 0, blinkT: 9 });
  g.player.flashlight = false;
  for (let i = 0; i < 10; i++) g.scares.update(0.05);
  assert.ok(g.apparitions.some((a) => a.kind === 'eyes'), 'stay in the dark');
  g.player.flashlight = true;
  g.scares.update(0.05);
  assert.ok(!g.apparitions.some((a) => a.kind === 'eyes'), 'gone in the beam');

  g.player.flashlight = false;
  place(g, 10.5, 5.6, -1.75);
  assert.ok(g.scares.trigger('girl'));
  const girl = g.apparitions.find((a) => a.kind === 'girl');
  g.player.a = Math.atan2(girl.y - g.player.y, girl.x - g.player.x);
  for (let i = 0; i < 30; i++) g.scares.update(0.05);
  assert.equal(girl.frame, 1);
});

test('jump scares are rationed', () => {
  const g = newGame();
  const jolts = [];
  g.on('jolt', (v) => jolts.push(v));
  assert.ok(g.scares.jolt('bride'));
  assert.ok(!g.scares.jolt('drowned'), 'not straight after another');
  for (let i = 0; i < 420; i++) g.scares.clock += 0.05;
  assert.ok(g.scares.jolt('girl'));
  assert.deepEqual(jolts, ['bride', 'girl']);
});

test('the woman in the corner turns around only while you look away', () => {
  const g = newGame();
  Object.assign(g.creature, { x: 30.5, y: 9.5, state: 'patrol', waitT: 9999 });
  g.apparitions = [];
  let ok = false;
  for (const [x, y, a] of [[10.5, 5.6, -1.75], [5, 3, 2.4], [4.4, 4.6, -2.2], [10.5, 12, Math.PI / 2], [2.2, 8.5, 0]]) {
    place(g, x, y, a);
    if (g.scares.trigger('corner')) { ok = true; break; }
  }
  assert.ok(ok, 'found a corner somewhere');
  const w = g.apparitions.find((ap) => ap.kind === 'corner');
  const look = () => { g.player.a = Math.atan2(w.y - g.player.y, w.x - g.player.x); };
  look();
  for (let i = 0; i < 40; i++) { look(); g.scares.update(0.05); }
  assert.equal(w.frame, 0, 'still facing the wall while watched');
  for (let i = 0; i < 40; i++) { g.player.a = Math.atan2(w.y - g.player.y, w.x - g.player.x) + Math.PI; g.scares.update(0.05); }
  assert.equal(w.frame, 1, 'turned around while you looked away');
});
