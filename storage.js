// ─────────────────────────────────────────────────────────────
//  localStorage persistence: settings, high scores, achievements.
//  Wrapped in try/catch — private browsing can throw on access.
// ─────────────────────────────────────────────────────────────

const KEY = 'dont-make-a-sound.v1';

const DEFAULTS = {
  settings: { difficulty: 'normal', volume: 0.8, reducedMotion: false, muted: false },
  stats: { bestScore: 0, fastestEscape: null, escapes: 0, deaths: 0, totalCorrect: 0, runs: 0 },
  achievements: {},
};

export const ACHIEVEMENTS = {
  firstBlood:  { name: 'First Blood',        desc: 'Get caught for the first time.' },
  survivor:    { name: 'Final Girl',         desc: 'Escape the house.' },
  ghost:       { name: 'Ghost',              desc: 'Escape on Day 1 without being caught.' },
  lastBreath:  { name: 'Last Breath',        desc: 'Escape on Day 5.' },
  nightmare:   { name: 'Waking Nightmare',   desc: 'Escape on Nightmare difficulty.' },
  speedrun:    { name: 'Don’t Look Back',    desc: 'Escape in under 4 minutes.' },
  scholar:     { name: 'Horror Scholar',     desc: 'Answer 50 questions correctly across all runs.' },
  cool:        { name: 'Ice in the Veins',   desc: 'Survive 5 Pursuit Events in a single run.' },
};

function clone(o) { return JSON.parse(JSON.stringify(o)); }

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return clone(DEFAULTS);
    const data = JSON.parse(raw);
    return {
      settings: { ...DEFAULTS.settings, ...data.settings },
      stats: { ...DEFAULTS.stats, ...data.stats },
      achievements: { ...data.achievements },
    };
  } catch {
    return clone(DEFAULTS);
  }
}

export function save(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* storage unavailable */ }
}

export function resetProgress(data) {
  data.stats = clone(DEFAULTS.stats);
  data.achievements = {};
  save(data);
}

/**
 * Fold a finished run into saved stats and return newly unlocked achievement ids.
 */
export function recordRun(data, summary) {
  const s = data.stats;
  const unlocked = [];
  const unlock = id => {
    if (!data.achievements[id]) { data.achievements[id] = Date.now(); unlocked.push(id); }
  };

  s.runs++;
  s.totalCorrect += summary.correct;
  s.deaths += summary.caught;
  if (summary.caught > 0) unlock('firstBlood');

  let newBest = false;
  if (summary.won) {
    s.escapes++;
    if (summary.score > s.bestScore) { s.bestScore = summary.score; newBest = true; }
    if (s.fastestEscape === null || summary.seconds < s.fastestEscape) s.fastestEscape = summary.seconds;
    unlock('survivor');
    if (summary.day === 1 && summary.caught === 0) unlock('ghost');
    if (summary.day === 5) unlock('lastBreath');
    if (summary.difficulty === 'nightmare') unlock('nightmare');
    if (summary.seconds < 240) unlock('speedrun');
  }
  if (summary.pursuitsSurvived >= 5) unlock('cool');
  if (s.totalCorrect >= 50) unlock('scholar');

  save(data);
  return { unlocked, newBest };
}

/** Called the moment you're caught, so First Blood pops even mid-run. */
export function unlockNow(data, id) {
  if (data.achievements[id]) return false;
  data.achievements[id] = Date.now();
  save(data);
  return true;
}
