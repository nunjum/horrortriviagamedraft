// Run with:  node --test tests/
// Phase 1 proof: walk rooms, trigger trivia, win and lose — no browser needed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../js/state.js';
import { TriviaEngine, validateQuestions } from '../js/trivia.js';

const { questions } = JSON.parse(readFileSync(new URL('../data/questions.json', import.meta.url)));

// Deterministic RNG so test runs are reproducible
function seeded(seed = 42) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}
const newGame = (opts) => new Game(new TriviaEngine(questions, { rng: seeded() }), opts);

// Answer any open encounter correctly (or wrongly)
function resolve(game, correct = true) {
  while (game.state.phase === 'encounter') {
    const q = game.currentQuestion;
    game.answer(correct ? q.correctIndex : (q.correctIndex + 1) % q.options.length);
  }
}

test('question bank is valid and large enough', () => {
  assert.deepEqual(validateQuestions(questions), []);
  assert.ok(questions.length >= 60);
  for (const d of ['easy', 'medium', 'hard']) {
    assert.ok(questions.filter(q => q.difficulty === d).length >= 15, `not enough ${d}`);
  }
});

test('trivia engine never repeats inside a run until the pool is exhausted', () => {
  const t = new TriviaEngine(questions, { rng: seeded(7) });
  const seen = new Set();
  for (let i = 0; i < questions.length; i++) {
    const [q] = t.draw(1);
    assert.ok(!seen.has(q.id), `repeat ${q.id}`);
    seen.add(q.id);
  }
  assert.equal(t.draw(3).length, 3, 'recycles after exhaustion');
});

test('shuffled options still point to the right answer', () => {
  const t = new TriviaEngine(questions, { rng: seeded(3) });
  for (const q of t.draw(30)) {
    const raw = questions.find(r => r.id === q.id);
    assert.equal(q.options[q.correctIndex], raw.options[raw.answer]);
  }
});

test('noise costs: move +10, hallway creaks, search +25', () => {
  const g = newGame();
  g.move('hallway');
  assert.equal(g.state.noiseLevel, 15);
  g.move('bedroom');
  assert.equal(g.state.noiseLevel, 25);
  g.interact('nightstand');
  assert.equal(g.state.noiseLevel, 50);
  assert.ok(g.has('flashlight'));
});

test('basement is locked without the key', () => {
  const g = newGame();
  g.move('hallway');
  assert.equal(g.move('basement'), false);
  assert.equal(g.state.currentRoom, 'hallway');
});

test('hitting 100% noise starts a pursuit with danger-many questions; passing resets noise to 20', () => {
  const g = newGame();
  g.move('hallway');                 // 15
  g.state.noiseLevel = 95;
  g.move('kitchen');                 // +10 → 100
  assert.equal(g.state.phase, 'encounter');
  assert.equal(g.state.encounter.kind, 'pursuit');
  assert.equal(g.state.encounter.questions.length, 2); // kitchen danger = 2
  resolve(g, true);
  assert.equal(g.state.phase, 'exploring');
  assert.equal(g.state.noiseLevel, 20);
});

test('failing a pursuit advances the day and sends you back to the bedroom', () => {
  const g = newGame();
  g.move('hallway');
  g.state.noiseLevel = 99;
  g.move('kitchen');
  resolve(g, false);
  assert.equal(g.state.phase, 'caught');
  g.wake();
  assert.equal(g.state.currentDay, 2);
  assert.equal(g.state.currentRoom, 'bedroom');
  assert.equal(g.state.noiseLevel, 0);
});

test('getting caught on Day 5 is game over', () => {
  const g = newGame();
  let over = false;
  g.on('gameover', () => (over = true));
  for (let day = 1; day <= 5; day++) {
    g.state.noiseLevel = 99;
    g.move('hallway');
    resolve(g, false);
    if (day < 5) g.wake();
  }
  assert.equal(g.state.phase, 'gameover');
  assert.ok(over);
});

test('full escape route wins the game', () => {
  const g = newGame();
  let summary = null;
  g.on('win', s => (summary = s));
  const step = (fn) => { fn(); resolve(g, true); };

  step(() => g.interact('nightstand'));     // flashlight
  step(() => g.interact('bed'));
  step(() => g.move('hallway'));
  step(() => g.interact('linenCloset'));    // hammer
  step(() => g.move('kitchen'));
  step(() => g.interact('lockedDrawer'));   // lockpick trivia → basement key
  assert.ok(g.has('basementKey'));
  step(() => g.move('hallway'));
  step(() => g.move('basement'));
  assert.equal(g.visibleHotspots()[0].id, 'fumble', 'dark without flashlight');
  g.toggleFlashlight();
  step(() => g.interact('workbench'));      // bolt cutters
  step(() => g.interact('toolbox'));        // smash → master key (+50)
  assert.ok(g.has('boltCutters') && g.has('masterKey'));
  step(() => g.move('hallway'));
  step(() => g.move('foyer'));
  g.interact('frontDoor');
  assert.equal(g.state.encounter.kind, 'standoff');
  assert.equal(g.state.encounter.questions.length, 3);
  resolve(g, true);
  assert.equal(g.state.phase, 'won');
  assert.ok(summary.won && summary.score > 0);
});
