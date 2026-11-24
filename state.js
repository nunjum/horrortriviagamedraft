// ─────────────────────────────────────────────────────────────
//  Game state machine — DOM-free. The UI listens to events and
//  calls methods; nothing in here touches the page or audio.
//
//  Phases:  exploring → encounter → (exploring | caught | won)
//           caught → exploring (next day)  |  gameover (after Day 5)
// ─────────────────────────────────────────────────────────────

import { MAX_DAYS, START_ROOM, NOISE, DIFFICULTY, ITEMS, ROOMS, HOTSPOTS } from './config.js';

export class Game {
  constructor(trivia, { difficulty = 'normal', now = () => Date.now() } = {}) {
    this.trivia = trivia;
    this.now = now;
    this.listeners = {};
    this.setDifficulty(difficulty);
    this.reset();
  }

  // ── tiny event emitter ────────────────────────────────────
  on(evt, fn) { (this.listeners[evt] ??= []).push(fn); return this; }
  emit(evt, ...args) { (this.listeners[evt] ?? []).forEach(fn => fn(...args)); }

  setDifficulty(key) {
    this.difficultyKey = DIFFICULTY[key] ? key : 'normal';
    this.difficulty = DIFFICULTY[this.difficultyKey];
  }

  reset() {
    this.state = {
      phase: 'exploring',
      currentDay: 1,
      noiseLevel: 0,
      currentRoom: START_ROOM,
      inventory: [],
      flashlightOn: false,
      isPursued: false,
      searched: [],        // hotspot ids already used up
      hideUsed: false,     // bed can be used once per visit to the bedroom
      encounter: null,
      stats: { correct: 0, wrong: 0, caught: 0, pursuitsSurvived: 0, startedAt: this.now(), endedAt: null },
    };
    this.emit('change', this.state);
  }

  // ── read helpers ──────────────────────────────────────────
  get room() { return ROOMS[this.state.currentRoom]; }
  has(item) { return this.state.inventory.includes(item); }
  isDark() { return !!this.room.dark && !this.state.flashlightOn; }
  canAct() { return this.state.phase === 'exploring'; }

  /** Hotspots visible in the current room, with a display status. */
  visibleHotspots() {
    if (this.isDark()) return [{ id: 'fumble', label: 'Feel around in the dark', type: 'fumble', status: 'available' }];
    return this.room.hotspots.map(id => {
      const h = HOTSPOTS[id];
      const used = this.state.searched.includes(id);
      return { id, ...h, status: used ? 'used' : 'available' };
    });
  }

  exits() {
    return this.room.exits.map(id => ({
      id,
      name: ROOMS[id].name,
      locked: !!ROOMS[id].requires && !this.has(ROOMS[id].requires),
    }));
  }

  // ── noise ─────────────────────────────────────────────────
  addNoise(amount, reason = '') {
    const scaled = amount > 0 ? Math.round(amount * this.difficulty.noiseMult) : amount;
    const before = this.state.noiseLevel;
    this.state.noiseLevel = Math.max(0, Math.min(NOISE.max, before + scaled));
    this.emit('noise', this.state.noiseLevel, scaled, reason);
    if (this.state.noiseLevel >= NOISE.max && this.state.phase === 'exploring') {
      this.startEncounter('pursuit');
    }
  }

  // ── player actions ────────────────────────────────────────
  move(roomId) {
    if (!this.canAct()) return false;
    if (!this.room.exits.includes(roomId)) return false;
    const target = ROOMS[roomId];
    if (target.requires && !this.has(target.requires)) {
      this.emit('message', `The ${target.name.toLowerCase()} door is locked. You need the ${ITEMS[target.requires].name}.`, 'warn');
      this.emit('sfx', 'rattle');
      return false;
    }
    const prev = this.state.currentRoom;
    this.state.currentRoom = roomId;
    if (roomId === 'bedroom' && prev !== 'bedroom') this.state.hideUsed = false;

    let noise = NOISE.move;
    if (target.creaky) noise += NOISE.creakyBonus;
    if (this.state.flashlightOn) noise += NOISE.flashlightMove;

    this.emit('sfx', target.creaky ? 'creak' : 'step');
    this.emit('message', `You creep into the ${target.name.toLowerCase()}.`, 'move');
    this.emit('change', this.state);
    this.addNoise(noise, target.creaky ? 'creaky floorboards' : 'footsteps');
    return true;
  }

  toggleFlashlight() {
    if (!this.has('flashlight')) return false;
    if (this.state.phase !== 'exploring') return false;
    this.state.flashlightOn = !this.state.flashlightOn;
    this.emit('sfx', 'click');
    this.emit('change', this.state);
    return true;
  }

  interact(hotspotId) {
    if (!this.canAct()) return false;
    if (hotspotId === 'fumble') return this.#fumble();
    if (!this.room.hotspots.includes(hotspotId) || this.isDark()) return false;

    const h = HOTSPOTS[hotspotId];
    const used = this.state.searched.includes(hotspotId);

    switch (h.type) {
      case 'read':
        this.emit('message', h.text, 'clue');
        this.emit('sfx', 'paper');
        return true;

      case 'hide':
        if (this.state.hideUsed) { this.emit('message', h.usedText, 'warn'); return false; }
        this.state.hideUsed = true;
        this.emit('message', h.text, 'calm');
        this.emit('sfx', 'breath');
        this.addNoise(NOISE.hideRelief, 'holding your breath');
        this.emit('change', this.state);
        return true;

      case 'search':
        if (used) { this.emit('message', h.emptyText, 'dim'); return false; }
        this.#markUsed(hotspotId);
        this.emit('sfx', 'rummage');
        this.emit('message', h.text, h.gives ? 'item' : 'dim');
        if (h.gives) this.#give(h.gives);
        this.addNoise(NOISE.search, 'searching');
        return true;

      case 'smash':
        if (used) { this.emit('message', h.emptyText, 'dim'); return false; }
        if (!this.has(h.requires)) { this.emit('message', h.lockedText, 'warn'); return false; }
        this.#markUsed(hotspotId);
        this.emit('sfx', 'smash');
        this.emit('shake', 'big');
        this.emit('message', h.text, 'item');
        this.#give(h.gives);
        this.addNoise(NOISE.loudTool, 'the hammer');
        return true;

      case 'lockpick':
        if (used) { this.emit('message', h.emptyText, 'dim'); return false; }
        this.startEncounter('lockpick', { hotspotId, count: h.questions });
        return true;

      case 'exit':
        if (!h.requires.every(i => this.has(i))) {
          this.emit('message', h.lockedText, 'warn');
          this.emit('sfx', 'rattle');
          return false;
        }
        this.startEncounter('standoff', { count: h.questions });
        return true;
    }
    return false;
  }

  #fumble() {
    this.emit('sfx', 'clatter');
    this.emit('message', 'You sweep your hand across a shelf — a paint can hits the floor with a BANG. You need light.', 'warn');
    this.addNoise(NOISE.fumbleDark, 'fumbling in the dark');
    return true;
  }

  #markUsed(id) { if (!this.state.searched.includes(id)) this.state.searched.push(id); }

  #give(item) {
    if (this.has(item)) return;
    this.state.inventory.push(item);
    this.emit('item', item);
    this.emit('change', this.state);
  }

  // ── encounters (pursuit / lockpick / standoff) ────────────
  startEncounter(kind, { hotspotId = null, count } = {}) {
    const n = count ?? this.room.danger;
    const questions = this.trivia.draw(n, this.difficulty.weights);
    this.state.phase = 'encounter';
    this.state.isPursued = kind !== 'lockpick';
    this.state.encounter = {
      kind, hotspotId,
      room: this.state.currentRoom,
      hideSpot: this.room.hideSpot,
      questions,
      index: 0,
      seconds: this.difficulty.seconds,
    };
    this.emit('encounter', this.state.encounter);
    this.emit('change', this.state);
  }

  get currentQuestion() {
    const e = this.state.encounter;
    return e ? e.questions[e.index] : null;
  }

  /**
   * Answer the current question. Pass -1 for a timeout.
   * @returns {{correct:boolean, correctIndex:number, done:boolean, outcome?:string}}
   */
  answer(choice) {
    const e = this.state.encounter;
    if (this.state.phase !== 'encounter' || !e) return null;
    const q = e.questions[e.index];
    const correct = choice === q.correctIndex;
    correct ? this.state.stats.correct++ : this.state.stats.wrong++;

    if (!correct) {
      const outcome = this.#encounterFailed();
      return { correct, correctIndex: q.correctIndex, done: true, outcome };
    }
    e.index++;
    if (e.index < e.questions.length) {
      this.emit('change', this.state);
      return { correct, correctIndex: q.correctIndex, done: false };
    }
    const outcome = this.#encounterPassed();
    return { correct, correctIndex: q.correctIndex, done: true, outcome };
  }

  #endEncounter() {
    this.state.encounter = null;
    this.state.isPursued = false;
    this.state.phase = 'exploring';
  }

  #encounterPassed() {
    const { kind, hotspotId } = this.state.encounter;
    if (kind === 'pursuit') {
      this.#endEncounter();
      this.state.stats.pursuitsSurvived++;
      this.state.noiseLevel = NOISE.afterEscape;
      this.emit('message', 'The footsteps linger… then shuffle away down the hall. You breathe again.', 'calm');
      this.emit('noise', this.state.noiseLevel, 0, 'reset');
      this.emit('change', this.state);
      return 'escaped';
    }
    if (kind === 'lockpick') {
      this.#endEncounter();
      const h = HOTSPOTS[hotspotId];
      this.#markUsed(hotspotId);
      this.emit('sfx', 'unlock');
      this.emit('message', h.text, 'item');
      this.#give(h.gives);
      this.emit('change', this.state);
      return 'unlocked';
    }
    // standoff — you're out
    this.state.encounter = null;
    this.state.isPursued = false;
    this.state.phase = 'won';
    this.state.stats.endedAt = this.now();
    this.emit('change', this.state);
    this.emit('win', this.summary());
    return 'won';
  }

  #encounterFailed() {
    const { kind } = this.state.encounter;
    if (kind === 'lockpick') {
      this.#endEncounter();
      this.emit('sfx', 'rattle');
      this.emit('message', 'A pin snaps back with a loud CLACK. The lock holds.', 'warn');
      this.emit('change', this.state);
      this.addNoise(NOISE.lockpickFail, 'fumbling the lock');
      return 'lockFailed';
    }
    // pursuit or standoff → caught
    this.state.encounter = null;
    this.state.isPursued = false;
    this.state.stats.caught++;
    if (this.state.currentDay >= MAX_DAYS) {
      this.state.phase = 'gameover';
      this.state.stats.endedAt = this.now();
      this.emit('caught', { final: true });
      this.emit('change', this.state);
      this.emit('gameover', this.summary());
      return 'gameover';
    }
    this.state.phase = 'caught';
    this.emit('caught', { final: false });
    this.emit('change', this.state);
    return 'caught';
  }

  /** Called by the UI after the jump scare / day-transition screen. */
  wake() {
    if (this.state.phase !== 'caught') return false;
    this.state.currentDay++;
    this.state.currentRoom = START_ROOM;
    this.state.noiseLevel = 0;
    this.state.flashlightOn = false;
    this.state.hideUsed = false;
    this.state.phase = 'exploring';
    this.emit('message', `Day ${this.state.currentDay}. You wake in the bedroom with a pounding headache. Your pockets are still full.`, 'day');
    this.emit('noise', 0, 0, 'wake');
    this.emit('change', this.state);
    return true;
  }

  summary() {
    const s = this.state.stats;
    const seconds = Math.round(((s.endedAt ?? this.now()) - s.startedAt) / 1000);
    const won = this.state.phase === 'won';
    const score = won
      ? s.correct * 100 + (MAX_DAYS - this.state.currentDay + 1) * 500 + Math.max(0, 900 - seconds) * 2
      : s.correct * 100;
    return {
      won,
      day: this.state.currentDay,
      seconds,
      score,
      correct: s.correct,
      wrong: s.wrong,
      caught: s.caught,
      pursuitsSurvived: s.pursuitsSurvived,
      difficulty: this.difficultyKey,
    };
  }
}
