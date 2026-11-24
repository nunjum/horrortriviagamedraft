// ─────────────────────────────────────────────────────────────
//  Procedural sound design with the Web Audio API.
//  Every sound is synthesized at runtime — no audio files needed.
//  Drop real recordings into /assets/audio later and route them
//  through `this.bus` if you want (see README → Backlog).
// ─────────────────────────────────────────────────────────────

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.muted = false;
    this.tension = 0;
    this._hbTimer = null;
  }

  /** Must be called from a user gesture (click / keypress). */
  init() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);

    this.bus = ctx.createGain();     // one-shot effects
    this.bus.connect(this.master);

    // 2 seconds of white noise, reused by every noisy sound
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.#startDrone();
    this.#heartbeatLoop();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : v, this.ctx.currentTime, 0.05);
  }

  setMuted(m) {
    this.muted = m;
    this.setVolume(this.volume);
  }

  /** 0 = calm, 1 = about to be found. Drives drone + heartbeat. */
  setTension(t) {
    this.tension = Math.max(0, Math.min(1, t));
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.droneFilter.frequency.setTargetAtTime(140 + this.tension * 520, now, 0.6);
    this.droneGain.gain.setTargetAtTime(0.16 + this.tension * 0.14, now, 0.6);
    this.hissGain.gain.setTargetAtTime(0.012 + this.tension * 0.03, now, 0.6);
  }

  // ── building blocks ───────────────────────────────────────
  #out(pan = 0) {
    if (!this.ctx.createStereoPanner) return this.bus;
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    p.connect(this.bus);
    return p;
  }

  #env(gainNode, when, attack, decay, peak) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, when);
    g.exponentialRampToValueAtTime(Math.max(peak, 0.0002), when + attack);
    g.exponentialRampToValueAtTime(0.0001, when + attack + decay);
  }

  #noise({ when = 0, dur = 0.3, type = 'lowpass', freq = 800, q = 1, gain = 0.5, attack = 0.005, pan = 0, freqEnd } = {}) {
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    this.#env(g, t, attack, dur, gain);
    src.connect(f).connect(g).connect(this.#out(pan));
    src.start(t, Math.random() * 1.5);
    src.stop(t + attack + dur + 0.05);
  }

  #tone({ when = 0, freq = 440, freqEnd, dur = 0.3, type = 'sine', gain = 0.3, attack = 0.005, pan = 0, detune = 0 } = {}) {
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.detune.value = detune;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + attack + dur);
    const g = ctx.createGain();
    this.#env(g, t, attack, dur, gain);
    o.connect(g).connect(this.#out(pan));
    o.start(t);
    o.stop(t + attack + dur + 0.05);
  }

  // ── ambience ──────────────────────────────────────────────
  #startDrone() {
    const ctx = this.ctx;
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 140;
    this.droneFilter.Q.value = 6;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.16;
    this.droneFilter.connect(this.droneGain).connect(this.master);

    // Two detuned saws a tritone apart = instant unease
    [[41.2, 0], [41.2, 9], [58.27, -6]].forEach(([f, det]) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(this.droneFilter);
      o.start();
    });

    // Slow LFO breathing on the filter
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 60;
    lfo.connect(lfoGain).connect(this.droneFilter.frequency);
    lfo.start();

    // Room tone: very quiet filtered hiss
    const hiss = ctx.createBufferSource();
    hiss.buffer = this.noiseBuf;
    hiss.loop = true;
    const hf = ctx.createBiquadFilter();
    hf.type = 'bandpass';
    hf.frequency.value = 400;
    hf.Q.value = 0.5;
    this.hissGain = ctx.createGain();
    this.hissGain.gain.value = 0.012;
    hiss.connect(hf).connect(this.hissGain).connect(this.master);
    hiss.start();
  }

  #heartbeatLoop() {
    const beat = () => {
      const bpm = 52 + this.tension * 98;              // 52 → 150 bpm
      const vol = 0.05 + this.tension * 0.45;
      if (this.ctx.state === 'running') {
        this.#tone({ freq: 62, freqEnd: 40, dur: 0.14, gain: vol, attack: 0.01 });
        this.#tone({ when: 0.17, freq: 55, freqEnd: 36, dur: 0.16, gain: vol * 0.7, attack: 0.01 });
      }
      this._hbTimer = setTimeout(beat, 60000 / bpm);
    };
    beat();
  }

  // ── one-shots ─────────────────────────────────────────────
  footstep(volume = 0.5, pan = 0, when = 0) {
    if (!this.ctx) return;
    this.#tone({ when, freq: 90, freqEnd: 38, dur: 0.18, gain: volume * 0.9, pan });
    this.#noise({ when, dur: 0.12, freq: 260, q: 0.8, gain: volume * 0.6, pan });
    if (Math.random() < 0.35) this.#creak(volume * 0.25, pan, when + 0.05);
  }

  /** A sequence of steps getting closer. Returns total duration in seconds. */
  approach(steps = 6, interval = 0.55, from = 0.08, to = 0.9) {
    if (!this.ctx) return steps * interval;
    for (let i = 0; i < steps; i++) {
      const k = i / Math.max(1, steps - 1);
      this.footstep(from + (to - from) * k, (i % 2 ? 0.25 : -0.25) * (1 - k), i * interval);
    }
    return steps * interval;
  }

  #creak(gain = 0.25, pan = 0, when = 0) {
    const f = 180 + Math.random() * 160;
    this.#tone({ when, type: 'sawtooth', freq: f, freqEnd: f * (0.6 + Math.random() * 0.3), dur: 0.5 + Math.random() * 0.4, gain: gain * 0.35, attack: 0.08, pan });
    this.#noise({ when, type: 'bandpass', freq: f * 3, q: 12, dur: 0.6, gain: gain * 0.5, attack: 0.1, pan });
  }

  play(name, opts = {}) {
    if (!this.ctx) return;
    switch (name) {
      case 'step':    this.footstep(0.18, 0); break;
      case 'creak':   this.footstep(0.2, 0); this.#creak(0.7, 0, 0.05); break;
      case 'rattle':
        for (let i = 0; i < 4; i++) this.#noise({ when: i * 0.07, dur: 0.05, type: 'bandpass', freq: 2400, q: 6, gain: 0.35 });
        break;
      case 'click':   this.#noise({ dur: 0.02, type: 'highpass', freq: 3000, gain: 0.4 }); break;
      case 'paper':   this.#noise({ dur: 0.35, type: 'highpass', freq: 2500, gain: 0.12, attack: 0.05 }); break;
      case 'breath':  this.#noise({ dur: 1.6, type: 'bandpass', freq: 900, freqEnd: 500, q: 1.2, gain: 0.12, attack: 0.5 }); break;
      case 'rummage':
        for (let i = 0; i < 7; i++) this.#noise({ when: i * 0.09 + Math.random() * 0.05, dur: 0.08, type: 'bandpass', freq: 1200 + Math.random() * 2000, q: 3, gain: 0.25 });
        break;
      case 'clatter':
        this.#tone({ type: 'triangle', freq: 520, dur: 0.7, gain: 0.3 });
        this.#tone({ type: 'triangle', freq: 783, dur: 0.6, gain: 0.2 });
        this.#noise({ dur: 0.3, freq: 1800, gain: 0.5 });
        break;
      case 'smash':
        this.#noise({ dur: 0.5, freq: 3000, freqEnd: 300, gain: 1 });
        this.#tone({ freq: 70, freqEnd: 30, dur: 0.5, gain: 0.9 });
        [1240, 1873, 2610].forEach((f, i) => this.#tone({ type: 'triangle', freq: f, dur: 1.4, gain: 0.08, when: 0.01 * i }));
        break;
      case 'unlock':
        this.#noise({ dur: 0.03, type: 'highpass', freq: 2000, gain: 0.5 });
        this.#noise({ when: 0.12, dur: 0.05, type: 'bandpass', freq: 1500, q: 4, gain: 0.6 });
        break;
      case 'tick':    this.#tone({ type: 'square', freq: 1400, dur: 0.03, gain: 0.08 }); break;
      case 'correct': this.#tone({ freq: 220, dur: 0.35, gain: 0.12, attack: 0.02 }); break;
      case 'wrong':   this.#tone({ type: 'sawtooth', freq: 110, freqEnd: 70, dur: 0.4, gain: 0.25 }); break;
      case 'stinger': // pursuit begins
        this.#tone({ type: 'sawtooth', freq: 55, dur: 2.2, gain: 0.35, attack: 0.6 });
        this.#tone({ type: 'sawtooth', freq: 77.78, dur: 2.2, gain: 0.25, attack: 0.6, detune: 12 });
        this.#noise({ dur: 2, type: 'bandpass', freq: 200, freqEnd: 1200, q: 2, gain: 0.25, attack: 0.8 });
        break;
      case 'jumpscare': {
        const g = opts.gentle ? 0.35 : 1;
        this.#noise({ dur: 1.3, type: 'bandpass', freq: 1800, q: 0.7, gain: 1.0 * g, attack: 0.002 });
        [311, 329.6, 466, 622, 659].forEach((f, i) =>
          this.#tone({ type: 'sawtooth', freq: f, freqEnd: f * 1.5, dur: 1.2, gain: 0.22 * g, attack: 0.002, detune: i * 17 }));
        this.#tone({ freq: 50, freqEnd: 25, dur: 1, gain: 1 * g, attack: 0.002 });
        break;
      }
      case 'door':    // the front door finally opens
        this.#creak(0.9, 0, 0);
        this.#noise({ when: 0.6, dur: 4, type: 'lowpass', freq: 600, freqEnd: 300, gain: 0.3, attack: 1.5 });
        break;
      case 'whisper':
        this.#noise({ dur: 1.2, type: 'bandpass', freq: 3200, freqEnd: 1800, q: 8, gain: 0.08, attack: 0.4, pan: opts.pan ?? (Math.random() * 2 - 1) });
        break;
    }
  }
}
