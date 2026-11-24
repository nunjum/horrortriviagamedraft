// ─────────────────────────────────────────────────────────────
//  Trivia engine — DOM-free so it can be unit-tested in Node.
//  Pulls random, non-repeating questions weighted by difficulty.
// ─────────────────────────────────────────────────────────────

export const DIFFICULTIES = ['easy', 'medium', 'hard'];

export function validateQuestions(list) {
  const errors = [];
  const ids = new Set();
  list.forEach((q, i) => {
    const where = q.id ?? `#${i}`;
    if (!q.id) errors.push(`${where}: missing id`);
    if (ids.has(q.id)) errors.push(`${where}: duplicate id`);
    ids.add(q.id);
    if (!DIFFICULTIES.includes(q.difficulty)) errors.push(`${where}: bad difficulty "${q.difficulty}"`);
    if (!Array.isArray(q.tags) || q.tags.length === 0) errors.push(`${where}: needs at least one tag`);
    if (typeof q.question !== 'string' || !q.question.trim()) errors.push(`${where}: empty question`);
    if (!Array.isArray(q.options) || q.options.length < 2) errors.push(`${where}: needs 2+ options`);
    else if (new Set(q.options).size !== q.options.length) errors.push(`${where}: duplicate options`);
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= (q.options?.length ?? 0)) {
      errors.push(`${where}: answer index out of range`);
    }
  });
  return errors;
}

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class TriviaEngine {
  /**
   * @param {Array} questions  raw entries from questions.json
   * @param {Object} opts      { rng, tags } — tags filters the pool (empty = all)
   */
  constructor(questions, { rng = Math.random, tags = [] } = {}) {
    this.rng = rng;
    this.all = tags.length
      ? questions.filter(q => q.tags.some(t => tags.includes(t)))
      : questions.slice();
    if (this.all.length === 0) this.all = questions.slice();
    this.used = new Set();
  }

  get remaining() {
    return this.all.length - this.used.size;
  }

  /** Weighted pick of a difficulty that still has unused questions. */
  #pickDifficulty(weights) {
    const avail = DIFFICULTIES.filter(d => this.all.some(q => q.difficulty === d && !this.used.has(q.id)));
    if (avail.length === 0) return null;
    const total = avail.reduce((s, d) => s + (weights[d] ?? 1), 0);
    let roll = this.rng() * total;
    for (const d of avail) {
      roll -= weights[d] ?? 1;
      if (roll <= 0) return d;
    }
    return avail[avail.length - 1];
  }

  /**
   * Draw `count` unseen questions. When the pool runs dry it is reshuffled,
   * but never repeats inside a single draw.
   * @returns {Array<{id, question, options, correctIndex, difficulty, tags}>}
   */
  draw(count = 1, weights = { easy: 1, medium: 1, hard: 1 }) {
    const out = [];
    const thisDraw = new Set();
    for (let n = 0; n < count; n++) {
      if (this.remaining === 0) {
        // Recycle everything except what's in this draw
        this.used = new Set(thisDraw);
      }
      const diff = this.#pickDifficulty(weights);
      const pool = this.all.filter(q => !this.used.has(q.id) && (diff ? q.difficulty === diff : true));
      if (pool.length === 0) break;
      const q = pool[Math.floor(this.rng() * pool.length)];
      this.used.add(q.id);
      thisDraw.add(q.id);
      out.push(this.#prepare(q));
    }
    return out;
  }

  #prepare(q) {
    const order = shuffle(q.options.map((_, i) => i), this.rng);
    return {
      id: q.id,
      question: q.question,
      difficulty: q.difficulty,
      tags: q.tags,
      options: order.map(i => q.options[i]),
      correctIndex: order.indexOf(q.answer),
    };
  }
}
