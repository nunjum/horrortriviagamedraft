// ─────────────────────────────────────────────────────────────
//  Don't Make a Sound — UI layer
//  Listens to the Game state machine and paints the house.
// ─────────────────────────────────────────────────────────────

import { Game } from './state.js';
import { TriviaEngine, validateQuestions } from './trivia.js';
import { AudioEngine } from './audio.js';
import * as store from './storage.js';
import { ACHIEVEMENTS } from './storage.js';
import { ROOMS, ITEMS, NOISE, HOTSPOTS, MAX_DAYS, DIFFICULTY } from './config.js';
import { ROOM_ART, HOTSPOT_POS } from './art.js';

const $ = (sel) => document.querySelector(sel);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

const saved = store.load();
const audio = new AudioEngine();
let questions = [];
let game = null;
let lastRoom = null;
let ambientTimer = null;
let encounterActive = false;
let pendingEncounter = null;
let runToken = 0;              // bumps on quit so stale async sequences stop

const el = {
  body: document.body,
  scene: $('#scene'),
  art: $('#room-art'),
  roomName: $('#room-name'),
  roomDesc: $('#room-desc'),
  hotspots: $('#hotspots'),
  exits: $('#exits'),
  inventory: $('#inventory'),
  log: $('#log'),
  day: $('#day-num'),
  noiseVal: $('#noise-val'),
  noiseFill: $('#noise-fill'),
  noiseMeter: $('#noise-meter'),
  flashlight: $('#btn-flashlight'),
  mute: $('#btn-mute'),
  enc: $('#encounter'),
  encBox: $('#enc-box'),
  encTitle: $('#enc-title'),
  encIntro: $('#enc-intro'),
  encBody: $('#enc-body'),
  encProgress: $('#enc-progress'),
  encQuestion: $('#enc-question'),
  encOptions: $('#enc-options'),
  timerFill: $('#timer-fill'),
  timerNum: $('#timer-num'),
  jumpscare: $('#jumpscare'),
  wake: $('#wake'),
  end: $('#end'),
  toast: $('#toast'),
};

// ═════════════ boot ═════════════
async function boot() {
  try {
    const res = await fetch('data/questions.json');
    const json = await res.json();
    questions = json.questions;
    const errs = validateQuestions(questions);
    if (errs.length) console.warn('[questions.json]', errs);
  } catch (err) {
    console.error(err);
    $('#btn-start').disabled = true;
    $('#title-best').textContent =
      'Could not load data/questions.json — run a local server (see README) instead of opening the file directly.';
    return;
  }
  applySettings();
  renderTitleBest();
  startStatic();
  bindGlobalInput();
}

// ═════════════ screens ═════════════
function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
}

function startRun() {
  audio.init();
  audio.setVolume(saved.settings.volume);
  audio.setMuted(saved.settings.muted);
  runToken++;
  el.log.innerHTML = '';
  lastRoom = null;
  encounterActive = false;
  pendingEncounter = null;

  const trivia = new TriviaEngine(questions);
  game = new Game(trivia, { difficulty: saved.settings.difficulty });
  game
    .on('change', render)
    .on('message', log)
    .on('sfx', (name) => audio.play(name))
    .on('noise', onNoise)
    .on('shake', () => shakeScene(true))
    .on('item', onItem)
    .on('encounter', (e) => (encounterActive ? (pendingEncounter = e) : runEncounter(e)));

  // Open the game with ?debug to poke at it from the console: window.game.state
  if (new URLSearchParams(location.search).has('debug')) window.game = game;

  [el.enc, el.wake, el.end, el.jumpscare].forEach((n) => (n.hidden = true));
  showScreen('screen-game');
  el.body.dataset.phase = 'exploring';
  log('You wake up on a bare mattress. The door is unlocked. Somewhere below, something heavy shifts its weight.', 'day');
  log(`Difficulty: ${DIFFICULTY[saved.settings.difficulty].label}. Find the keys. Reach the front door. Stay quiet.`, 'dim');
  render(game.state);
  onNoise(0, 0);
  startAmbient();
}

function quitToTitle() {
  runToken++;
  stopAmbient();
  game = null;
  encounterActive = false;
  [el.enc, el.wake, el.end, el.jumpscare].forEach((n) => (n.hidden = true));
  el.body.dataset.phase = 'title';
  el.body.dataset.day = '1';
  audio.setTension(0);
  renderTitleBest();
  showScreen('screen-title');
}

// ═════════════ rendering ═════════════
function render(state) {
  if (!game) return;
  const room = ROOMS[state.currentRoom];
  el.body.dataset.day = String(state.currentDay);
  el.day.textContent = state.currentDay;

  if (lastRoom !== state.currentRoom) {
    el.scene.dataset.room = state.currentRoom;
    el.art.innerHTML = ROOM_ART[state.currentRoom] ?? '';
    lastRoom = state.currentRoom;
  }
  const dark = game.isDark();
  el.scene.classList.toggle('pitch', dark);
  el.scene.classList.toggle('torch', !!room.dark && state.flashlightOn);
  el.roomName.textContent = room.name;
  el.roomDesc.textContent = dark ? room.darkDesc : room.desc;

  // hotspots
  el.hotspots.innerHTML = '';
  for (const h of game.visibleHotspots()) {
    const b = document.createElement('button');
    b.className = 'hotspot' + (h.status === 'used' ? ' used' : '');
    const [x, y] = HOTSPOT_POS[h.id] ?? [50, 50];
    b.style.left = `${x}%`;
    b.style.top = `${y}%`;
    b.textContent = h.label;
    const cost = costHint(h);
    if (cost) {
      const c = document.createElement('span');
      c.className = 'cost';
      c.textContent = cost;
      b.append(c);
    }
    b.addEventListener('click', () => game?.interact(h.id));
    el.hotspots.append(b);
  }

  // exits
  el.exits.innerHTML = '';
  for (const x of game.exits()) {
    const b = document.createElement('button');
    b.className = 'exit' + (x.locked ? ' locked' : '');
    b.textContent = x.name;
    b.title = x.locked ? 'Locked' : `Go to ${x.name}`;
    b.addEventListener('click', () => game?.move(x.id));
    el.exits.append(b);
  }

  // inventory
  el.inventory.innerHTML = state.inventory.length
    ? state.inventory.map((i) => `<li data-item="${i}">${ITEMS[i].name}<small>${ITEMS[i].desc}</small></li>`).join('')
    : '<li class="empty">Nothing. Just shaking hands.</li>';

  el.flashlight.disabled = !game.has('flashlight');
  el.flashlight.classList.toggle('on', state.flashlightOn);
}

function costHint(h) {
  if (h.status === 'used' && h.type !== 'read') return '';
  switch (h.type) {
    case 'search': return `+${NOISE.search}%`;
    case 'smash': return game.has(h.requires) ? `+${NOISE.loudTool}%` : '';
    case 'hide': return game.state.hideUsed ? '' : `${NOISE.hideRelief}%`;
    case 'fumble': return `+${NOISE.fumbleDark}%`;
    case 'lockpick': return 'pick lock';
    default: return '';
  }
}

function log(text, kind = '') {
  const li = document.createElement('li');
  li.textContent = text;
  if (kind) li.className = kind;
  el.log.prepend(li);
  while (el.log.children.length > 14) el.log.lastElementChild.remove();
}

function onNoise(level, delta) {
  el.noiseFill.style.width = `${level}%`;
  el.noiseVal.textContent = `${level}%`;
  el.noiseMeter.setAttribute('aria-valuenow', String(level));
  el.noiseMeter.classList.toggle('hot', level >= 75);
  if (delta > 0) {
    el.noiseMeter.classList.remove('bump');
    void el.noiseMeter.offsetWidth;
    el.noiseMeter.classList.add('bump');
  }
  if (delta >= NOISE.search) shakeScene(false);
  if (game?.state.phase === 'exploring') audio.setTension(level / 100);
}

function onItem(item) {
  toast(`Found: ${ITEMS[item].name}`);
  requestAnimationFrame(() => el.inventory.querySelector(`[data-item="${item}"]`)?.classList.add('new'));
}

function shakeScene(big) {
  if (saved.settings.reducedMotion) return;
  const cls = big ? 'shake-big' : 'shake';
  el.scene.classList.remove('shake', 'shake-big');
  void el.scene.offsetWidth;
  el.scene.classList.add(cls);
}

let toastTimer;
function toast(text) {
  el.toast.textContent = text;
  el.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('show'), 2600);
}

// ═════════════ ambience: the house is alive ═════════════
function startAmbient() {
  stopAmbient();
  const tick = () => {
    if (!game || game.state.phase !== 'exploring') return;
    const n = game.state.noiseLevel;
    const day = game.state.currentDay;
    const roll = Math.random();
    if (n >= 35 && roll < 0.35 + n / 160) {
      // the pursuer roaming the house — closer the louder you've been
      const steps = 2 + Math.floor(Math.random() * 3);
      const pan = rand(-0.9, 0.9);
      for (let i = 0; i < steps; i++) audio.footstep(0.04 + (n / 100) * 0.3, pan, i * 0.6);
    } else if (roll < 0.55) {
      audio.play('creak');
    }
    if (day >= 3 && Math.random() < 0.12 * (day - 2)) audio.play('whisper');
    if (el.scene.classList.contains('torch') && Math.random() < 0.15 * day) {
      el.scene.classList.add('flicker');
      setTimeout(() => el.scene.classList.remove('flicker'), 600);
    }
    ambientTimer = setTimeout(tick, rand(3500, 8500) / (1 + day * 0.1));
  };
  ambientTimer = setTimeout(tick, 3000);
}
function stopAmbient() { clearTimeout(ambientTimer); }

// ═════════════ encounters ═════════════
const ENC_COPY = {
  pursuit: { title: 'It heard you' },
  lockpick: { title: 'Picking the lock' },
  standoff: { title: 'The front door' },
};

let timerRAF = null;
let answered = false;

async function runEncounter(e) {
  const token = runToken;
  encounterActive = true;
  stopAmbient();
  el.body.dataset.phase = 'encounter';
  el.enc.hidden = false;
  el.enc.className = `overlay encounter ${e.kind}`;
  el.encTitle.textContent = ENC_COPY[e.kind].title;
  el.encBody.hidden = true;
  el.encIntro.hidden = false;
  el.encBox.classList.remove('shaking');
  el.encBox.style.setProperty('--shake', '0px');

  const intro = async (text, ms) => {
    el.encIntro.textContent = text;
    await wait(ms);
    return token === runToken;
  };

  if (e.kind === 'pursuit') {
    audio.setTension(0.9);
    audio.play('stinger');
    const dur = audio.approach(6, 0.5, 0.1, 0.95) * 1000;
    if (!(await intro('Heavy footsteps. Coming fast. Coming here.', 1300))) return;
    if (!(await intro(`You throw yourself ${e.hideSpot} and press a hand over your mouth.`, dur - 1100))) return;
    if (!(await intro('The footsteps stop. Right outside. Breathing.', 900))) return;
  } else if (e.kind === 'lockpick') {
    audio.setTension(0.6);
    if (!(await intro('You slide a bent hairpin into the lock. Slowly. Every scrape is deafening.', 1500))) return;
  } else {
    audio.setTension(1);
    audio.play('stinger');
    if (!(await intro('Chain cut. Deadbolt turned. Your hand is on the handle —', 1500))) return;
    audio.approach(4, 0.35, 0.5, 1);
    if (!(await intro('— and behind you, on the stairs, something starts to laugh.', 1600))) return;
  }
  el.encIntro.textContent = '';
  el.encIntro.hidden = true;
  el.encBody.hidden = false;
  askQuestion(token);
}

function askQuestion(token) {
  const e = game.state.encounter;
  const q = game.currentQuestion;
  answered = false;
  el.encProgress.textContent = `QUESTION ${e.index + 1} / ${e.questions.length}`;
  el.encQuestion.textContent = q.question;
  el.encOptions.innerHTML = '';
  q.options.forEach((opt, i) => {
    const b = document.createElement('button');
    b.className = 'enc-opt';
    b.dataset.i = i;
    b.innerHTML = `<span class="num">${i + 1}</span><span></span>`;
    b.lastChild.textContent = opt;
    b.addEventListener('click', () => submitAnswer(i, token));
    el.encOptions.append(b);
  });
  el.encBox.setAttribute('tabindex', '-1');
  el.encBox.focus({ preventScroll: true });

  const total = e.seconds * 1000;
  const start = performance.now();
  const hostile = e.kind !== 'lockpick';
  let lastSecond = e.seconds;
  let nextStep = start + 1400;
  if (!saved.settings.reducedMotion) el.encBox.classList.add('shaking');

  const frame = (now) => {
    if (answered || token !== runToken) return;
    const elapsed = now - start;
    const left = Math.max(0, total - elapsed);
    const k = elapsed / total;
    el.timerFill.style.transform = `scaleX(${left / total})`;
    const secs = Math.ceil(left / 1000);
    el.timerNum.textContent = secs;
    el.timerNum.classList.toggle('panic', secs <= 3);
    el.encBox.style.setProperty('--shake', `${(hostile ? 1 + k * 9 : 0.5 + k * 2).toFixed(2)}px`);
    if (secs < lastSecond) {
      lastSecond = secs;
      if (secs <= 3) audio.play('tick');
    }
    if (hostile && now >= nextStep) {
      audio.footstep(0.35 + k * 0.55, rand(-0.4, 0.4));
      nextStep = now + 1600 - k * 900;
    }
    if (left <= 0) return submitAnswer(-1, token);
    timerRAF = requestAnimationFrame(frame);
  };
  timerRAF = requestAnimationFrame(frame);
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

  await wait(res.correct ? 600 : 1100);
  if (token !== runToken) return;
  if (!res.done) return askQuestion(token);
  closeEncounter(res.outcome, token);
}

async function closeEncounter(outcome, token) {
  el.enc.hidden = true;
  encounterActive = false;

  switch (outcome) {
    case 'escaped':
      toast('It walked away.');
      afterEncounter();
      break;
    case 'unlocked':
    case 'lockFailed':
      afterEncounter();
      break;
    case 'caught':
    case 'gameover':
      await jumpScare(token);
      if (token !== runToken) return;
      if (store.unlockNow(saved, 'firstBlood')) toast(`Achievement: ${ACHIEVEMENTS.firstBlood.name}`);
      outcome === 'caught' ? showWake() : showEnd();
      break;
    case 'won':
      audio.setTension(0);
      audio.play('door');
      await wait(900);
      if (token === runToken) showEnd();
      break;
  }
}

function afterEncounter() {
  el.body.dataset.phase = 'exploring';
  if (pendingEncounter) {
    const next = pendingEncounter;
    pendingEncounter = null;
    return runEncounter(next);
  }
  audio.setTension(game.state.noiseLevel / 100);
  startAmbient();
}

async function jumpScare(token) {
  stopAmbient();
  el.body.dataset.phase = 'caught';
  el.jumpscare.hidden = false;
  audio.play('jumpscare', { gentle: saved.settings.reducedMotion });
  await wait(1350);
  if (token === runToken) el.jumpscare.hidden = true;
}

const WAKE_TEXT = {
  2: 'It dragged you back to bed. It wants you to try again.',
  3: 'Your wrists are bruised. Someone sang to you while you slept.',
  4: 'There are scratch marks on the inside of the door. Some of them are yours.',
  5: 'Last chance. It’s done playing.',
};

function showWake() {
  const next = game.state.currentDay + 1;
  $('#wake-day').textContent = `DAY ${next}`;
  $('#wake-text').textContent = WAKE_TEXT[next] ?? 'You wake again.';
  el.wake.hidden = false;
  audio.setTension(0.2);
  setTimeout(() => $('#btn-wake').focus(), 50);
}

function wakeUp() {
  el.wake.hidden = true;
  game.wake();
  el.body.dataset.phase = 'exploring';
  lastRoom = null;
  render(game.state);
  startAmbient();
}

function showEnd() {
  stopAmbient();
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
    ? (s.day === 1 && s.pursuitsSurvived === 0 ? 'Not a single sound. It never even knew you were gone.'
      : s.day === 1 ? 'It came looking — more than once — but it never found you. Cold air. Freedom.' : `Day ${s.day}. Cold air on your face. Behind you, the door slams — and locks itself.`)
    : 'Five days. It was patient. The bedroom door locks from the outside now.';

  const rows = [
    ['Score', `${s.score.toLocaleString()}${newBest ? '  ★ new best' : ''}`],
    ['Day reached', `${s.day} / ${MAX_DAYS}`],
    ['Questions right', `${s.correct}`],
    ['Questions wrong', `${s.wrong}`],
    ['Pursuits survived', `${s.pursuitsSurvived}`],
    ['Time', fmtTime(s.seconds)],
    ['Difficulty', DIFFICULTY[s.difficulty].label],
  ];
  $('#end-stats').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  $('#end-unlocks').innerHTML = unlocked
    .map((id) => `<div class="unlock">Achievement unlocked — <strong>${ACHIEVEMENTS[id].name}</strong><br><small>${ACHIEVEMENTS[id].desc}</small></div>`)
    .join('');
  setTimeout(() => $('#btn-again').focus(), 50);
}

// ═════════════ title, panels, settings ═════════════
function renderTitleBest() {
  const st = saved.stats;
  const parts = [];
  if (st.bestScore) parts.push(`Best score ${st.bestScore.toLocaleString()}`);
  if (st.fastestEscape !== null) parts.push(`Fastest escape ${fmtTime(st.fastestEscape)}`);
  if (st.runs) parts.push(`${st.escapes} escape${st.escapes === 1 ? '' : 's'} in ${st.runs} run${st.runs === 1 ? '' : 's'}`);
  $('#title-best').textContent = parts.join('  ·  ');
}

function renderAchievements() {
  const st = saved.stats;
  $('#stats-list').innerHTML = [
    ['Best score', st.bestScore.toLocaleString()],
    ['Fastest escape', st.fastestEscape === null ? '—' : fmtTime(st.fastestEscape)],
    ['Escapes / runs', `${st.escapes} / ${st.runs}`],
    ['Times caught', st.deaths],
    ['Questions answered right', st.totalCorrect],
  ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  $('#ach-list').innerHTML = Object.entries(ACHIEVEMENTS)
    .map(([id, a]) => `<li class="${saved.achievements[id] ? 'got' : ''}"><strong>${saved.achievements[id] ? a.name : '???'}</strong><span>${a.desc}</span></li>`)
    .join('');
}

function applySettings() {
  const s = saved.settings;
  document.querySelectorAll('input[name=difficulty]').forEach((r) => (r.checked = r.value === s.difficulty));
  $('#set-volume').value = s.volume;
  $('#set-reduced').checked = s.reducedMotion;
  el.body.classList.toggle('reduced', s.reducedMotion);
  el.mute.classList.toggle('on', !s.muted);
  el.mute.textContent = '';
  el.mute.append(s.muted ? 'Muted ' : 'Sound ');
  const k = document.createElement('kbd'); k.textContent = 'M'; el.mute.append(k);
  audio.setVolume(s.volume);
  audio.setMuted(s.muted);
}

function openPanel(id) {
  if (id === 'panel-achievements') renderAchievements();
  const p = document.getElementById(id);
  p.hidden = false;
  p.querySelector('button, input')?.focus();
}
function closePanels() {
  document.querySelectorAll('.panel').forEach((p) => (p.hidden = true));
}

// ═════════════ input ═════════════
function bindGlobalInput() {
  $('#btn-start').addEventListener('click', startRun);
  $('#btn-again').addEventListener('click', startRun);
  $('#btn-title').addEventListener('click', quitToTitle);
  $('#btn-quit').addEventListener('click', quitToTitle);
  $('#btn-wake').addEventListener('click', wakeUp);
  el.flashlight.addEventListener('click', () => game?.toggleFlashlight());
  el.mute.addEventListener('click', toggleMute);

  document.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openPanel(b.dataset.open)));
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closePanels));
  document.querySelectorAll('.panel').forEach((p) => p.addEventListener('click', (ev) => { if (ev.target === p) closePanels(); }));

  document.querySelectorAll('input[name=difficulty]').forEach((r) =>
    r.addEventListener('change', () => { saved.settings.difficulty = r.value; store.save(saved); }));
  $('#set-volume').addEventListener('input', (ev) => {
    saved.settings.volume = Number(ev.target.value);
    audio.setVolume(saved.settings.volume);
    store.save(saved);
  });
  $('#set-reduced').addEventListener('change', (ev) => {
    saved.settings.reducedMotion = ev.target.checked;
    store.save(saved);
    applySettings();
  });
  $('#btn-reset').addEventListener('click', () => {
    store.resetProgress(saved);
    renderTitleBest();
    toast('Progress wiped. The house forgets you.');
  });

  // Flashlight / cursor position
  const track = (x, y) => {
    document.documentElement.style.setProperty('--mx', `${x}px`);
    document.documentElement.style.setProperty('--my', `${y}px`);
    const r = el.scene.getBoundingClientRect();
    el.scene.style.setProperty('--mx', `${x - r.left}px`);
    el.scene.style.setProperty('--my', `${y - r.top}px`);
  };
  window.addEventListener('pointermove', (ev) => track(ev.clientX, ev.clientY), { passive: true });
  window.addEventListener('pointerdown', (ev) => track(ev.clientX, ev.clientY), { passive: true });

  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') return closePanels();
    if (!game) return;
    if (game.state.phase === 'encounter' && !el.encBody.hidden && !answered) {
      const n = Number(ev.key);
      if (n >= 1 && n <= el.encOptions.children.length) {
        ev.preventDefault();
        el.encOptions.children[n - 1].click();
      }
      return;
    }
    if (ev.key === 'f' || ev.key === 'F') game.toggleFlashlight();
    if (ev.key === 'm' || ev.key === 'M') toggleMute();
  });
}

function toggleMute() {
  saved.settings.muted = !saved.settings.muted;
  store.save(saved);
  applySettings();
}

// ═════════════ TV static ═════════════
function startStatic() {
  const c = $('#static');
  const ctx = c.getContext('2d');
  c.width = 200;
  c.height = 120;
  const img = ctx.createImageData(c.width, c.height);
  const draw = () => {
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = (Math.random() * 255) | 0;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  };
  let last = 0;
  const loop = (t) => {
    if (!saved.settings.reducedMotion && t - last > 70) { draw(); last = t; }
    requestAnimationFrame(loop);
  };
  draw();
  requestAnimationFrame(loop);
}

boot();
