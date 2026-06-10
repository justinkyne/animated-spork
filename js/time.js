'use strict';

class GameTime {
  constructor() {
    this.totalMin = 6 * 60 + 30;   // start day 1 at 6:30 AM
    this.speedIdx = 1;
    this._fracMin = 0;
    this.gameDt = 0;               // scaled ms this frame (for movement)

    this.onMinute = null;
    this.onHour = null;
    this.onDay = null;
    this.onQuarter = null;
  }

  get speed()    { return C.SPEEDS[this.speedIdx]; }
  get paused()   { return this.speed === 0; }
  get day()      { return Math.floor(this.totalMin / 1440) + 1; }
  get hour()     { return Math.floor(this.totalMin / 60) % 24; }
  get minute()   { return this.totalMin % 60; }
  get hourFloat(){ return (this.totalMin % 1440) / 60; }
  get quarter()  { return Math.floor((this.day - 1) / C.DAYS_PER_QUARTER) + 1; }
  get year()     { return Math.floor((this.quarter - 1) / 4) + 1; }
  get season()   { return C.SEASONS[(this.quarter - 1) % 4]; }
  get dayName()  { return C.DAY_NAMES[(this.day - 1) % C.DAYS_PER_QUARTER]; }
  get isWeekend(){ return this.dayName === 'SUN'; }

  get clockStr() {
    const h = this.hour, m = this.minute;
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  }
  get dateStr() {
    return `${this.dayName} · Day ${this.day} · Year ${this.year} · ${this.season}`;
  }

  setSpeed(idx) { this.speedIdx = clamp(idx, 0, C.SPEEDS.length - 1); }
  togglePause() {
    if (this.paused) this.speedIdx = this._resumeIdx || 1;
    else { this._resumeIdx = this.speedIdx; this.speedIdx = 0; }
  }

  update(dtReal) {
    this.gameDt = dtReal * this.speed;
    if (this.paused) return;

    this._fracMin += this.gameDt / C.MS_PER_MIN;
    while (this._fracMin >= 1) {
      this._fracMin -= 1;
      const prevHour = this.hour, prevDay = this.day, prevQ = this.quarter;
      this.totalMin++;
      if (this.onMinute) this.onMinute(this);
      if (this.hour !== prevHour && this.onHour) this.onHour(this.hour, this);
      if (this.day !== prevDay && this.onDay) this.onDay(this.day, this);
      if (this.quarter !== prevQ && this.onQuarter) this.onQuarter(this.quarter, this);
    }
  }
}
