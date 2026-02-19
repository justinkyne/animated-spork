'use strict';

class GameTime {
  constructor() {
    this.hour     = 5;
    this.minute   = 0;
    this.day      = 1;         // absolute day number
    this.dayOfWeek = 1;        // 1=Mon … 7=Sun
    this.quarter  = 1;         // 1–4
    this.year     = 1;
    this.speed    = 1;         // multiplier
    this.paused   = false;

    this._acc = 0;             // ms accumulator

    // Callbacks set by game
    this.onHour    = null;
    this.onDay     = null;
    this.onQuarter = null;
  }

  // ── accessors ──────────────────────────────────────────────
  get isWeekend()   { return this.dayOfWeek >= 6; }
  get isWeekday()   { return this.dayOfWeek <= 5; }
  get isWorkHours() { return this.hour >= 9 && this.hour < 18; }
  get isMorningRush() { return this.hour === 8 && this.minute < 30; }
  get isEveningRush() { return this.hour === 17 && this.minute >= 30; }

  get seasonName() {
    return ['Spring','Summer','Autumn','Winter'][this.quarter - 1];
  }
  get dayName() {
    return ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][this.dayOfWeek - 1];
  }

  get timeString() {
    const h    = this.hour % 12 || 12;
    const m    = String(this.minute).padStart(2, '0');
    const ampm = this.hour < 12 ? 'AM' : 'PM';
    return `${h}:${m} ${ampm}`;
  }

  // 0–1 fraction through the day, for sky colour
  get dayFraction() {
    return (this.hour * 60 + this.minute) / 1440;
  }

  // ── update ─────────────────────────────────────────────────
  update(dt) {
    if (this.paused) return;
    this._acc += dt * this.speed;

    const msPerMin = C.BASE_MS_PER_MIN;
    while (this._acc >= msPerMin) {
      this._acc -= msPerMin;
      this._tick();
    }
  }

  _tick() {
    this.minute++;
    if (this.minute < 60) return;

    this.minute = 0;
    this.hour++;
    if (this.onHour) this.onHour(this.hour, this);

    if (this.hour < 24) return;

    this.hour = 0;
    this.day++;
    this.dayOfWeek = (this.dayOfWeek % 7) + 1;
    if (this.onDay) this.onDay(this.day, this);

    // One quarter every 13 game-days
    if (this.day % 13 === 0) {
      this.quarter = (this.quarter % 4) + 1;
      if (this.quarter === 1) this.year++;
      if (this.onQuarter) this.onQuarter(this.quarter, this);
    }
  }

  // ── helpers ────────────────────────────────────────────────
  faster()  { this.speed = Math.min(this.speed * 2, 16); }
  slower()  { this.speed = Math.max(this.speed / 2, 0.25); }
  togglePause() { this.paused = !this.paused; }

  // Interpolated sky colour at current time
  skyColor() {
    const stops = C.SKY;
    const h = this.hour + this.minute / 60;
    for (let i = 1; i < stops.length; i++) {
      if (h <= stops[i][0]) {
        const t = (h - stops[i-1][0]) / (stops[i][0] - stops[i-1][0]);
        return lerpColor(stops[i-1][1], stops[i][1], t);
      }
    }
    return stops[stops.length - 1][1];
  }
}

function lerpColor(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ar = (pa >> 16) & 0xff, ag = (pa >> 8) & 0xff, ab = pa & 0xff;
  const br = (pb >> 16) & 0xff, bg = (pb >> 8) & 0xff, bb = pb & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bv = Math.round(ab + (bb - ab) * t);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${bv.toString(16).padStart(2,'0')}`;
}
