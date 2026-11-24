// ─────────────────────────────────────────────────────────────
//  Horror sound engine — everything synthesized, nothing loaded.
//  • Real 3D audio: her footsteps, breathing and doors come from
//    where they actually are (HRTF panning). Sounds behind walls
//    are muffled.
//  • A big generated reverb so the house feels hollow.
//  • The scream is a distorted vocal formant shriek layered with a
//    roar and a sub impact — not a whine.
// ─────────────────────────────────────────────────────────────

const SCALE = 2.4; // metres per tile

function distortion(k = 50) {
  const n = 2048, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i * 2) / n - 1; curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x)); }
  return curve;
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.volume = 0.85;
    this.muted = false;
    this.tension = 0;
    this.occlude = () => false;
  }

  init() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.25;
    this.master.connect(comp).connect(ctx.destination);

    this.dry = ctx.createGain();
    this.dry.connect(this.master);
    this.verb = ctx.createConvolver();
    this.verb.buffer = this.#impulse(3.2, 2.6);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.55;
    this.verb.connect(this.wet).connect(this.master);

    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.brownBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const b = this.brownBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
    this.shaper = distortion(60);

    this.#ambience();
    this.#heartbeat();
  }

  #impulse(seconds, decay) {
    const ctx = this.ctx, rate = ctx.sampleRate, len = rate * seconds;
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (i < rate * 0.012 ? 0.2 : 1);
      }
      // a few early reflections off the walls
      [0.013, 0.021, 0.034, 0.047].forEach((t, k) => { d[Math.floor(t * rate) + ch * 37] += 0.6 / (k + 1); });
    }
    return buf;
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : v, this.ctx.currentTime, 0.05); }
  setMuted(m) { this.muted = m; this.setVolume(this.volume); }

  /** Where the player's ears are. a = facing angle in the map. */
  setListener(x, y, a) {
    const L = this.ctx?.listener;
    if (!L) return;
    const fx = Math.cos(a), fz = Math.sin(a);
    if (L.positionX) {
      const t = this.ctx.currentTime;
      L.positionX.setValueAtTime(x * SCALE, t); L.positionY.setValueAtTime(1.6, t); L.positionZ.setValueAtTime(y * SCALE, t);
      L.forwardX.setValueAtTime(fx, t); L.forwardY.setValueAtTime(0, t); L.forwardZ.setValueAtTime(fz, t);
      L.upX.setValueAtTime(0, t); L.upY.setValueAtTime(1, t); L.upZ.setValueAtTime(0, t);
    } else {
      L.setPosition(x * SCALE, 1.6, y * SCALE);
      L.setOrientation(fx, 0, fz, 0, 1, 0);
    }
    this.lx = x; this.ly = y;
  }

  setTension(t) {
    this.tension = Math.max(0, Math.min(1, t));
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.droneF.frequency.setTargetAtTime(110 + this.tension * 420, now, 0.8);
    this.droneG.gain.setTargetAtTime(0.13 + this.tension * 0.12, now, 0.8);
  }

  // ── plumbing ──
  /** Output node for a sound at world position (or the listener's head if pos is null). */
  #out(pos, { wet = 0.5, gain = 1 } = {}) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = gain;
    let head = g;
    if (pos) {
      const p = ctx.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = 1.6;
      p.rolloffFactor = 1.3;
      p.maxDistance = 60;
      const t = ctx.currentTime;
      if (p.positionX) { p.positionX.setValueAtTime(pos.x * SCALE, t); p.positionY.setValueAtTime(1.0, t); p.positionZ.setValueAtTime(pos.y * SCALE, t); }
      else p.setPosition(pos.x * SCALE, 1.0, pos.y * SCALE);
      // muffled through walls
      if (this.occlude(pos)) {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 520;
        g.gain.value = gain * 0.55;
        lp.connect(p);
        g.connect(lp);
      } else g.connect(p);
      head = p;
    }
    head.connect(this.dry);
    const send = ctx.createGain();
    send.gain.value = wet;
    head.connect(send).connect(this.verb);
    return g;
  }

  #env(param, t, a, peak, d, end = 0.0001) {
    param.setValueAtTime(0.0001, t);
    param.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    param.exponentialRampToValueAtTime(end, t + a + d);
  }

  #noise(out, { when = 0, dur = 0.3, type = 'lowpass', f = 800, f2, q = 1, gain = 0.5, attack = 0.005, brown = false } = {}) {
    const ctx = this.ctx, t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = brown ? this.brownBuf : this.noiseBuf;
    src.loop = true;
    const fl = ctx.createBiquadFilter();
    fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + attack + dur);
    const g = ctx.createGain();
    this.#env(g.gain, t, attack, gain, dur);
    src.connect(fl).connect(g).connect(out);
    src.start(t, Math.random()); src.stop(t + attack + dur + 0.1);
    return fl;
  }

  #tone(out, { when = 0, f = 220, f2, dur = 0.3, type = 'sine', gain = 0.3, attack = 0.005, detune = 0 } = {}) {
    const ctx = this.ctx, t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type; o.detune.value = detune;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + attack + dur);
    const g = ctx.createGain();
    this.#env(g.gain, t, attack, gain, dur);
    o.connect(g).connect(out);
    o.start(t); o.stop(t + attack + dur + 0.1);
    return o;
  }

  // ── ambience ──
  #ambience() {
    const ctx = this.ctx;
    this.droneF = ctx.createBiquadFilter();
    this.droneF.type = 'lowpass'; this.droneF.frequency.value = 110; this.droneF.Q.value = 4;
    this.droneG = ctx.createGain(); this.droneG.gain.value = 0.13;
    this.droneF.connect(this.droneG);
    this.droneG.connect(this.dry);
    const send = ctx.createGain(); send.gain.value = 0.4; this.droneG.connect(send).connect(this.verb);
    [[36.7, 0], [36.7, 11], [51.9, -7], [55, 5]].forEach(([f, det]) => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det; o.connect(this.droneF); o.start();
    });
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 0.05; lg.gain.value = 40; lfo.connect(lg).connect(this.droneF.frequency); lfo.start();
    // wind against the house
    const wind = ctx.createBufferSource(); wind.buffer = this.brownBuf; wind.loop = true;
    const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 380; wf.Q.value = 0.8;
    const wg = ctx.createGain(); wg.gain.value = 0.05;
    const wl = ctx.createOscillator(), wlg = ctx.createGain(); wl.frequency.value = 0.09; wlg.gain.value = 0.045;
    wl.connect(wlg).connect(wg.gain); wl.start();
    const wl2 = ctx.createOscillator(), wl2g = ctx.createGain(); wl2.frequency.value = 0.13; wl2g.gain.value = 160;
    wl2.connect(wl2g).connect(wf.frequency); wl2.start();
    wind.connect(wf).connect(wg).connect(this.dry);
    wind.start();
  }

  #heartbeat() {
    const beat = () => {
      const bpm = 55 + this.tension * 95;
      const vol = Math.max(0, this.tension - 0.15) * 0.9;
      if (this.ctx.state === 'running' && vol > 0.01) {
        const out = this.#out(null, { wet: 0.1 });
        this.#tone(out, { f: 58, f2: 38, dur: 0.16, gain: vol, attack: 0.008 });
        this.#tone(out, { when: 0.19, f: 52, f2: 34, dur: 0.2, gain: vol * 0.75, attack: 0.008 });
      }
      setTimeout(beat, 60000 / bpm);
    };
    beat();
  }

  // ── HER ──
  creatureStep(pos, run = false) {
    if (!this.ctx) return;
    const out = this.#out(pos, { wet: 0.6, gain: run ? 1.3 : 1 });
    this.#tone(out, { f: 75, f2: 32, dur: 0.28, gain: 1.0 });
    this.#noise(out, { dur: 0.16, f: 260, gain: 0.8, brown: true });
    if (!run) this.#noise(out, { when: 0.12, dur: 0.38, type: 'bandpass', f: 420, f2: 260, q: 2, gain: 0.25, attack: 0.12 });   // dragging foot
    if (Math.random() < 0.3) this.#creak(out, 0.35, 0.05);
  }

  creatureBreath(pos, near = 0.5) {
    if (!this.ctx) return;
    const out = this.#out(pos, { wet: 0.35, gain: 0.5 + near });
    // wet, rattling inhale … exhale
    this.#noise(out, { dur: 0.9, type: 'bandpass', f: 700, f2: 1100, q: 3, gain: 0.35, attack: 0.5 });
    this.#noise(out, { when: 1.1, dur: 1.2, type: 'bandpass', f: 900, f2: 500, q: 2.5, gain: 0.45, attack: 0.15 });
    const g = this.#tone(out, { when: 1.1, f: 62, f2: 55, type: 'sawtooth', dur: 1.1, gain: 0.08, attack: 0.15 });
    void g;
  }

  /** She's seen you: a guttural roar from where she stands. */
  roar(pos) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const out = this.#out(pos, { wet: 0.7, gain: 1.4 });
    const ws = ctx.createWaveShaper(); ws.curve = this.shaper; ws.oversample = '4x';
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(1400, t); lp.frequency.exponentialRampToValueAtTime(500, t + 1.6);
    const vca = ctx.createGain(); this.#env(vca.gain, t, 0.08, 0.6, 1.6);
    const am = ctx.createGain(); am.gain.value = 0.6;
    const amOsc = ctx.createOscillator(); amOsc.type = 'square'; amOsc.frequency.value = 31;
    const amDepth = ctx.createGain(); amDepth.gain.value = 0.4; amOsc.connect(amDepth).connect(am.gain);
    [96, 99, 144].forEach((f) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.7, t + 1.6); o.connect(ws); o.start(t); o.stop(t + 1.8); });
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf; const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 900; nf.Q.value = 1;
    n.connect(nf).connect(ws); n.start(t); n.stop(t + 1.8);
    ws.connect(lp).connect(am).connect(vca).connect(out);
    amOsc.start(t); amOsc.stop(t + 1.8);
    this.stinger(0.9);
  }

  /** The jump scare. Loud. */
  scream(gentle = false) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime, k = gentle ? 0.35 : 1;
    const out = this.#out(null, { wet: 0.45, gain: 1.6 * k });
    // 1. sub impact
    this.#tone(out, { f: 55, f2: 22, dur: 1.2, gain: 1.2, attack: 0.002 });
    this.#noise(out, { dur: 0.35, f: 1200, f2: 150, gain: 1.2, attack: 0.002 });
    // 2. the shriek: a glottal source through vowel formants ("AAAH"), distorted
    const src = ctx.createOscillator(); src.type = 'sawtooth';
    src.frequency.setValueAtTime(330, t);
    src.frequency.linearRampToValueAtTime(460, t + 0.12);
    src.frequency.exponentialRampToValueAtTime(300, t + 0.9);
    src.frequency.exponentialRampToValueAtTime(170, t + 1.5);
    const vib = ctx.createOscillator(), vibG = ctx.createGain(); vib.frequency.value = 7.5; vibG.gain.value = 14; vib.connect(vibG).connect(src.frequency);
    const breath = ctx.createBufferSource(); breath.buffer = this.noiseBuf; breath.loop = true;
    const bG = ctx.createGain(); bG.gain.value = 0.5;
    const pre = ctx.createGain(); pre.gain.value = 0.7;
    src.connect(pre); breath.connect(bG).connect(pre);
    const ws = ctx.createWaveShaper(); ws.curve = this.shaper; ws.oversample = '4x';
    const vca = ctx.createGain(); vca.gain.setValueAtTime(0.0001, t); vca.gain.exponentialRampToValueAtTime(1, t + 0.03); vca.gain.setValueAtTime(1, t + 0.9); vca.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
    [[800, 6, 1], [1150, 7, 0.7], [2600, 9, 0.35], [3400, 10, 0.15]].forEach(([f, q, g]) => {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(f, t); bp.frequency.linearRampToValueAtTime(f * 0.85, t + 1.5); bp.Q.value = q;
      const gg = ctx.createGain(); gg.gain.value = g * 3;
      pre.connect(bp).connect(gg).connect(ws);
    });
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 3800;
    ws.connect(tone).connect(vca).connect(out);
    [src, vib, breath].forEach((n) => { n.start(t); n.stop(t + 1.8); });
    // 3. an octave-down growl underneath
    const low = ctx.createOscillator(); low.type = 'sawtooth'; low.frequency.setValueAtTime(82, t); low.frequency.exponentialRampToValueAtTime(48, t + 1.6);
    const lws = ctx.createWaveShaper(); lws.curve = this.shaper;
    const llp = ctx.createBiquadFilter(); llp.type = 'lowpass'; llp.frequency.value = 600;
    const lg = ctx.createGain(); this.#env(lg.gain, t, 0.01, 0.8, 1.6);
    low.connect(lws).connect(llp).connect(lg).connect(out); low.start(t); low.stop(t + 1.8);
    // 4. a metal scrape smear
    this.#noise(out, { when: 0.05, dur: 1.1, type: 'bandpass', f: 1800, f2: 600, q: 6, gain: 0.5, attack: 0.02 });
  }

  /** A short, low orchestral hit — for glimpses and reveals. */
  stinger(gain = 0.7) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const out = this.#out(null, { wet: 0.8, gain });
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(220, t); lp.frequency.exponentialRampToValueAtTime(2200, t + 0.06); lp.frequency.exponentialRampToValueAtTime(300, t + 1.4);
    const g = ctx.createGain(); this.#env(g.gain, t, 0.01, 0.55, 1.5);
    [55, 58.27, 82.4, 87.3, 116.5].forEach((f, i) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = (i - 2) * 9; o.connect(lp); o.start(t); o.stop(t + 1.7); });
    lp.connect(g).connect(out);
    this.#tone(out, { f: 48, f2: 28, dur: 0.9, gain: 0.9, attack: 0.002 });
    this.#noise(out, { dur: 0.6, type: 'bandpass', f: 1400, f2: 300, q: 4, gain: 0.25, attack: 0.002 });
  }

  // ── chase music: pulsing low strings + drum ──
  setChase(on) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    if (on && !this.chase) {
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.32, t + 0.6);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 3;
      const trem = ctx.createGain(); trem.gain.value = 0.5;
      const tOsc = ctx.createOscillator(); tOsc.frequency.value = 7; const tD = ctx.createGain(); tD.gain.value = 0.5; tOsc.connect(tD).connect(trem.gain); tOsc.start();
      const oscs = [55, 55.4, 82.4, 116.5, 77.8].map((f) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start(); return o; });
      lp.connect(trem).connect(g);
      g.connect(this.dry);
      const s = ctx.createGain(); s.gain.value = 0.3; g.connect(s).connect(this.verb);
      const drum = setInterval(() => { const o = this.#out(null, { wet: 0.4 }); this.#tone(o, { f: 62, f2: 36, dur: 0.35, gain: 0.7 }); this.#noise(o, { dur: 0.08, f: 300, gain: 0.3 }); }, 520);
      this.chase = { g, oscs: [...oscs, tOsc], drum };
    } else if (!on && this.chase) {
      const c = this.chase;
      this.chase = null;
      c.g.gain.cancelScheduledValues(t);
      c.g.gain.setTargetAtTime(0.0001, t, 0.6);
      clearInterval(c.drum);
      setTimeout(() => c.oscs.forEach((o) => o.stop()), 3000);
    }
  }

  // ── music box from the nursery: a lullaby, slightly out of tune, slowing down ──
  musicBox(pos) {
    if (!this.ctx || this.musicPlaying) return;
    this.musicPlaying = true;
    const out = this.#out(pos, { wet: 0.9, gain: 0.55 });
    const notes = [76, 72, 69, 71, 72, 71, 68, 64, 0, 69, 72, 76, 74, 72, 71, 72, 69];
    let t = 0;
    notes.forEach((m, i) => {
      if (m) {
        const f = 440 * Math.pow(2, (m - 69) / 12);
        this.#tone(out, { when: t, f, dur: 1.4, type: 'triangle', gain: 0.22, detune: (Math.random() - 0.5) * 30 });
        this.#tone(out, { when: t, f: f * 2.01, dur: 0.5, gain: 0.06 });
      }
      t += 0.38 * (1 + i * 0.045);
    });
    setTimeout(() => (this.musicPlaying = false), t * 1000 + 1500);
  }

  /** She hums a lullaby to herself when she's calm. When it stops… */
  hum(pos) {
    if (!this.ctx || this.humming) return;
    this.humming = true;
    const ctx = this.ctx, t0 = ctx.currentTime;
    const out = this.#out(pos, { wet: 0.75, gain: 0.9 });
    const src = ctx.createOscillator(); src.type = 'sawtooth';
    const vib = ctx.createOscillator(), vg = ctx.createGain(); vib.frequency.value = 5.2; vg.gain.value = 3.5; vib.connect(vg).connect(src.frequency);
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 320; f1.Q.value = 5;
    const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 900; f2.Q.value = 7;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100;
    const vca = ctx.createGain(); vca.gain.value = 0;
    const g1 = ctx.createGain(); g1.gain.value = 1.4; const g2 = ctx.createGain(); g2.gain.value = 0.4;
    src.connect(f1).connect(g1).connect(lp); src.connect(f2).connect(g2).connect(lp);
    lp.connect(vca).connect(out);
    // a slow minor lullaby, a little flat, dragging
    const notes = [[64, 1.0], [67, 0.6], [69, 0.5], [67, 1.1], [64, 0.6], [62, 0.6], [60, 1.6], [0, 0.6], [64, 0.8], [62, 0.6], [59, 0.6], [57, 2.0]];
    let t = t0 + 0.05;
    for (const [m, len] of notes) {
      if (m) {
        const f = 220 * Math.pow(2, (m - 57) / 12) * 0.99;
        src.frequency.setTargetAtTime(f, t, 0.06);
        vca.gain.setTargetAtTime(0.22, t, 0.08);
        vca.gain.setTargetAtTime(0.06, t + len * 0.85, 0.1);
      } else vca.gain.setTargetAtTime(0.0001, t, 0.1);
      t += len * 1.08;
    }
    vca.gain.setTargetAtTime(0.0001, t, 0.3);
    [src, vib].forEach((n) => { n.start(t0); n.stop(t + 1.5); });
    setTimeout(() => (this.humming = false), (t - t0 + 2) * 1000);
  }

  /** Sparse, grieving piano somewhere in the house. */
  piano() {
    if (!this.ctx) return;
    const out = this.#out(null, { wet: 0.95, gain: 0.35 });
    const chords = [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 56, 59]];
    const ch = chords[Math.floor(Math.random() * chords.length)];
    ch.forEach((m, i) => {
      const f = 440 * Math.pow(2, (m - 69) / 12);
      this.#tone(out, { when: i * 0.55, f, dur: 3.5, type: 'triangle', gain: 0.18, attack: 0.004 });
      this.#tone(out, { when: i * 0.55, f: f * 2, dur: 1.2, type: 'sine', gain: 0.05, attack: 0.004 });
    });
    this.#tone(out, { when: 2.2, f: 440 * Math.pow(2, (ch[0] - 81) / 12), dur: 5, type: 'triangle', gain: 0.2 });
  }

  #creak(out, gain = 0.4, when = 0) {
    const f = 140 + Math.random() * 120;
    const o = this.#tone(out, { when, type: 'sawtooth', f, f2: f * (0.6 + Math.random() * 0.25), dur: 0.55 + Math.random() * 0.4, gain: gain * 0.2, attack: 0.1 });
    void o;
    this.#noise(out, { when, type: 'bandpass', f: f * 2.5, q: 14, dur: 0.7, gain: gain * 0.5, attack: 0.12 });
  }

  /** Everything else. pos = world position or null for "in your head". */
  play(name, pos = null) {
    if (!this.ctx) return;
    const at = pos && typeof pos.x === 'number' ? { x: pos.x, y: pos.y } : null;
    switch (name) {
      case 'step': {
        const out = this.#out(null, { wet: 0.25, gain: pos?.run ? 0.5 : pos?.crouch ? 0.08 : 0.22 });
        const tile = pos?.surface === 'tile', conc = pos?.surface === 'concrete';
        this.#tone(out, { f: tile ? 140 : 95, f2: 50, dur: 0.09, gain: 0.5 });
        this.#noise(out, { dur: tile ? 0.05 : 0.08, f: tile ? 2400 : conc ? 900 : 500, gain: tile ? 0.35 : 0.3, type: tile ? 'bandpass' : 'lowpass', q: 2 });
        break;
      }
      case 'echoStep': {
        // a bare, heavy foot on the boards somewhere behind you
        const out = this.#out(at, { wet: 0.45, gain: 0.55 });
        const tile = pos?.surface === 'tile';
        this.#tone(out, { f: tile ? 120 : 80, f2: 42, dur: 0.12, gain: 0.6 });
        this.#noise(out, { dur: 0.09, f: tile ? 2000 : 420, gain: 0.32, type: tile ? 'bandpass' : 'lowpass', q: 2 });
        if (Math.random() < 0.3) this.#creak(out, 0.4);
        break;
      }
      case 'creak': { const out = this.#out(at, { wet: 0.4 }); this.#creak(out, 0.9); break; }
      case 'doorOpen': { const out = this.#out(at, { wet: 0.55 }); this.#creak(out, 1); this.#noise(out, { dur: 0.05, type: 'bandpass', f: 1200, q: 3, gain: 0.5 }); break; }
      case 'doorClose': { const out = this.#out(at, { wet: 0.55 }); this.#creak(out, 0.6); this.#tone(out, { when: 0.35, f: 90, f2: 50, dur: 0.2, gain: 0.7 }); this.#noise(out, { when: 0.35, dur: 0.1, f: 500, gain: 0.6 }); break; }
      case 'slam': {
        const out = this.#out(at, { wet: 0.9, gain: 1.6 });
        this.#tone(out, { f: 70, f2: 30, dur: 0.7, gain: 1.2, attack: 0.002 });
        this.#noise(out, { dur: 0.4, f: 1600, f2: 200, gain: 1, attack: 0.002 });
        for (let i = 0; i < 5; i++) this.#noise(out, { when: 0.1 + i * 0.05, dur: 0.04, type: 'bandpass', f: 2500, q: 5, gain: 0.25 });
        break;
      }
      case 'rattle': { const out = this.#out(at, { wet: 0.4 }); for (let i = 0; i < 5; i++) this.#noise(out, { when: i * 0.07, dur: 0.05, type: 'bandpass', f: 1800, q: 5, gain: 0.5 }); break; }
      case 'unlock': { const out = this.#out(at, { wet: 0.3 }); this.#noise(out, { dur: 0.03, type: 'highpass', f: 2000, gain: 0.6 }); this.#noise(out, { when: 0.15, dur: 0.06, type: 'bandpass', f: 1300, q: 4, gain: 0.8 }); break; }
      case 'rummage': { const out = this.#out(at, { wet: 0.4 }); for (let i = 0; i < 9; i++) this.#noise(out, { when: i * 0.08 + Math.random() * 0.05, dur: 0.07, type: 'bandpass', f: 900 + Math.random() * 1800, q: 3, gain: 0.45 }); this.#tone(out, { when: 0.3, f: 300, dur: 0.4, type: 'triangle', gain: 0.1 }); break; }
      case 'smash': {
        const out = this.#out(at, { wet: 0.9, gain: 1.5 });
        this.#noise(out, { dur: 0.5, f: 4000, f2: 300, gain: 1.2 });
        this.#tone(out, { f: 80, f2: 30, dur: 0.6, gain: 1 });
        [990, 1530, 2210].forEach((f) => this.#tone(out, { f, dur: 1.5, type: 'triangle', gain: 0.06 }));
        break;
      }
      case 'paper': { const out = this.#out(null, { wet: 0.15 }); this.#noise(out, { dur: 0.4, type: 'highpass', f: 2200, gain: 0.12, attack: 0.05 }); break; }
      case 'click': { const out = this.#out(null, { wet: 0.1 }); this.#noise(out, { dur: 0.02, type: 'bandpass', f: 2500, q: 3, gain: 0.4 }); break; }
      case 'hideIn': case 'hideOut': { const out = this.#out(null, { wet: 0.3 }); this.#noise(out, { dur: 0.5, type: 'bandpass', f: 700, q: 1, gain: 0.25, attack: 0.08 }); this.#creak(out, 0.35, 0.1); break; }
      case 'whisper': {
        const out = this.#out(at, { wet: 0.5, gain: 0.9 });
        let t = 0;
        for (let i = 0; i < 9; i++) {
          const len = 0.07 + Math.random() * 0.12;
          this.#noise(out, { when: t, dur: len, type: 'bandpass', f: 1200 + Math.random() * 2200, q: 6 + Math.random() * 6, gain: 0.35, attack: 0.02 });
          t += len + (i % 3 === 2 ? 0.22 : 0.04);
        }
        break;
      }
      case 'crying': {
        // muffled sobbing: short shuddering breaths through a voice-like filter
        const out = this.#out(at, { wet: 0.8, gain: 0.8 });
        let t = 0;
        for (let i = 0; i < 7; i++) {
          const len = 0.18 + Math.random() * 0.25;
          this.#noise(out, { when: t, dur: len, type: 'bandpass', f: 650 + Math.random() * 300, q: 4, gain: 0.3, attack: 0.04 });
          this.#tone(out, { when: t + 0.02, f: 380 + Math.random() * 60, f2: 300, dur: len, type: 'triangle', gain: 0.05, attack: 0.05 });
          t += len + (i === 3 ? 0.9 : 0.12);
        }
        break;
      }
      case 'breathBehind': { this.creatureBreath(at, 0.2); break; }
      case 'giggle': {
        // a little girl's laugh: quick breathy bursts through a high vowel formant, falling in pitch
        const out = this.#out(at, { wet: 0.7, gain: 0.9 });
        for (let i = 0; i < 6; i++) {
          const t = i * 0.11 + (i > 3 ? 0.05 : 0), f0 = 520 - i * 22;
          this.#tone(out, { when: t, f: f0, f2: f0 * 0.85, dur: 0.07, type: 'triangle', gain: 0.09, attack: 0.012 });
          this.#noise(out, { when: t, dur: 0.07, type: 'bandpass', f: 2400, q: 5, gain: 0.22, attack: 0.01 });
          this.#noise(out, { when: t, dur: 0.06, type: 'bandpass', f: 900, q: 6, gain: 0.12, attack: 0.01 });
        }
        break;
      }
      case 'stareTone': {
        // a thin, rising ring in the ears — like the silence got louder
        const out = this.#out(null, { wet: 0.6, gain: 0.7 });
        this.#tone(out, { f: 3600, f2: 4300, dur: 2.6, gain: 0.03, attack: 1.2 });
        this.#tone(out, { f: 3610, f2: 4290, dur: 2.6, gain: 0.025, attack: 1.2, detune: 9 });
        this.#tone(out, { f: 55, f2: 41, dur: 2.4, type: 'sawtooth', gain: 0.06, attack: 1.0 });
        break;
      }
      case 'dragAway': {
        // something pulled back fast across floorboards
        const out = this.#out(at, { wet: 0.5 });
        this.#noise(out, { dur: 0.45, type: 'bandpass', f: 600, f2: 260, q: 1.5, gain: 0.6, attack: 0.02, brown: true });
        for (let i = 0; i < 4; i++) this.#noise(out, { when: 0.05 + i * 0.09, dur: 0.03, type: 'bandpass', f: 1800, q: 6, gain: 0.3 });
        this.#tone(out, { when: 0.42, f: 80, f2: 45, dur: 0.15, gain: 0.5 });
        break;
      }
      case 'flashDie': {
        // the bulb fizzes and the switch clicks uselessly
        const out = this.#out(null, { wet: 0.15 });
        for (let i = 0; i < 5; i++) this.#noise(out, { when: i * 0.05 + Math.random() * 0.03, dur: 0.025, type: 'highpass', f: 3000, gain: 0.25 });
        this.#tone(out, { f: 120, dur: 0.25, type: 'sawtooth', gain: 0.03 });
        this.#noise(out, { when: 0.5, dur: 0.02, type: 'bandpass', f: 2500, q: 3, gain: 0.45 });
        this.#noise(out, { when: 0.75, dur: 0.02, type: 'bandpass', f: 2500, q: 3, gain: 0.45 });
        break;
      }
      case 'childRun': { const out = this.#out(at, { wet: 0.5, gain: 0.8 }); for (let i = 0; i < 7; i++) this.#noise(out, { when: i * 0.13, dur: 0.05, f: 700, gain: 0.5 }); break; }
      case 'skitter': { const out = this.#out(at, { wet: 0.4 }); for (let i = 0; i < 16; i++) this.#noise(out, { when: i * 0.045 + Math.random() * 0.02, dur: 0.02, type: 'bandpass', f: 2200 + Math.random() * 800, q: 8, gain: 0.35 }); break; }
      case 'bulbPop': { const out = this.#out(at, { wet: 0.5 }); this.#noise(out, { dur: 0.06, type: 'highpass', f: 1500, gain: 0.7 }); [3100, 4200].forEach((f, i) => this.#tone(out, { when: 0.05 + i * 0.04, f, dur: 0.15, gain: 0.04 })); break; }
      case 'scratch': { const out = this.#out(at, { wet: 0.6 }); for (let i = 0; i < 3; i++) this.#noise(out, { when: i * 0.5, dur: 0.4, type: 'bandpass', f: 1500, f2: 900, q: 10, gain: 0.4, attack: 0.05 }); break; }
      case 'stairs': { const out = this.#out(null, { wet: 0.5, gain: 0.5 }); for (let i = 0; i < 6; i++) { this.#tone(out, { when: i * 0.28, f: 100, f2: 50, dur: 0.12, gain: 0.5 }); if (i % 2) this.#creak(out, 0.3, i * 0.28); } break; }
      case 'pickup': { const out = this.#out(null, { wet: 0.3 }); this.#tone(out, { f: 196, dur: 0.6, type: 'triangle', gain: 0.18 }); this.#tone(out, { when: 0.08, f: 233, dur: 0.6, type: 'triangle', gain: 0.12 }); break; }
      case 'tick': { const out = this.#out(null, { wet: 0.1 }); this.#tone(out, { f: 700, dur: 0.04, type: 'sine', gain: 0.18 }); this.#noise(out, { dur: 0.02, type: 'bandpass', f: 1500, q: 4, gain: 0.2 }); break; }
      case 'correct': { const out = this.#out(null, { wet: 0.4 }); this.#tone(out, { f: 147, dur: 0.6, type: 'triangle', gain: 0.15 }); break; }
      case 'wrong': { const out = this.#out(null, { wet: 0.4 }); this.#tone(out, { type: 'sawtooth', f: 73, f2: 55, dur: 0.6, gain: 0.3 }); break; }
      case 'door': { const out = this.#out(null, { wet: 0.9 }); this.#creak(out, 1); this.#noise(out, { when: 0.8, dur: 4, f: 500, f2: 250, gain: 0.3, attack: 1.5, brown: true }); break; }
    }
  }
}
