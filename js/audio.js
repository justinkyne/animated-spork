'use strict';

// Tiny WebAudio synth — no audio assets needed.
class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this._lastPlay = {};
  }

  _ac() {
    if (this.muted) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  // Rate-limit a named sound so rapid-fire events don't stack into noise
  _throttled(name, ms) {
    const now = performance.now();
    if (this._lastPlay[name] && now - this._lastPlay[name] < ms) return true;
    this._lastPlay[name] = now;
    return false;
  }

  _tone(freq, dur, { type = 'square', vol = 0.06, delay = 0, slide = 0 } = {}) {
    const ac = this._ac();
    if (!ac) return;
    const t0 = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0005, t0 + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  click()    { this._tone(900, 0.05, { type: 'square', vol: 0.03 }); }
  build()    {
    if (this._throttled('build', 90)) return;
    this._tone(170, 0.1, { type: 'square', vol: 0.07 });
    this._tone(110, 0.16, { type: 'triangle', vol: 0.09, delay: 0.04 });
  }
  demolish() {
    this._tone(90, 0.25, { type: 'sawtooth', vol: 0.07, slide: -60 });
  }
  error()    {
    if (this._throttled('error', 200)) return;
    this._tone(150, 0.16, { type: 'sawtooth', vol: 0.05 });
    this._tone(110, 0.18, { type: 'sawtooth', vol: 0.05, delay: 0.08 });
  }
  cash() {
    if (this._throttled('cash', 120)) return;
    [880, 1175, 1480].forEach((f, i) =>
      this._tone(f, 0.09, { type: 'triangle', vol: 0.06, delay: i * 0.05 }));
  }
  goal() {
    [660, 880, 1320].forEach((f, i) =>
      this._tone(f, 0.14, { type: 'square', vol: 0.05, delay: i * 0.09 }));
  }
  star() {
    [523, 659, 784, 1047, 1319].forEach((f, i) =>
      this._tone(f, 0.22, { type: 'triangle', vol: 0.08, delay: i * 0.11 }));
  }
}

const sfx = new Sfx();
