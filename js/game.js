'use strict';

class Game {
  constructor() {
    this.canvas   = document.getElementById('canvas');
    this.tower    = new Tower();
    this.time     = new GameTime();
    this.economy  = new Economy(C.START_MONEY);
    this.renderer = new Renderer(this.canvas);
    this.ui       = new UI();
    this.input    = new Input(this.canvas, this);

    this._lastTs  = null;

    // Wire up time callbacks
    this.time.onHour    = (h, t) => this._onHour(h, t);
    this.time.onDay     = (d, t) => this._onDay(d, t);
    this.time.onQuarter = (q, t) => this._onQuarter(q, t);

    // Centre the view on floor 1
    this.renderer.resize();
    this.renderer.centreOnGround();

    // Initial status
    this.ui.setStatus('Welcome to The Tower! Select a tool from the sidebar to build.');

    // Handle room clicks for inspector
    this.canvas.addEventListener('click', e => this._handleClick(e));

    // Start loop
    requestAnimationFrame(ts => this._loop(ts));
  }

  // ── Main loop ─────────────────────────────────────────────
  _loop(ts) {
    const dt = this._lastTs ? Math.min(ts - this._lastTs, 100) : 16;
    this._lastTs = ts;

    this.time.update(dt);
    this.tower.update(dt, this.time);
    this.ui.update(this.economy, this.tower, this.time);
    this.ui.tickFlash();
    this.renderer.draw(this.tower, this.time);

    requestAnimationFrame(ts2 => this._loop(ts2));
  }

  // ── Time callbacks ────────────────────────────────────────
  _onHour(hour, time) {
    this.tower.hourTick(time);

    // Morning: spawn workers / residents arriving at their rooms
    if (hour === 8 && !time.isWeekend) {
      this._spawnMorningRush();
    }

    // Evening: rooms empty out
    if (hour === 18 && !time.isWeekend) {
      this._triggerEveningDeparture();
    }

    // Midnight quiet
    if (hour === 0) {
      this.tower.dayTick(time);
    }
  }

  _onDay(day, time) {
    // Nothing extra needed here — hotel occupancy handled in dayTick
  }

  _onQuarter(quarter, time) {
    const income = this.economy.collectRent(this.tower);
    if (income > 0) {
      this.ui.flash(
        `Quarter ${quarter} income: +$${income.toLocaleString()}! 🎉`
      );
    } else {
      this.ui.flash(`Quarter ${quarter} — no tenants yet. Build more rooms!`);
    }
  }

  // ── Population events ─────────────────────────────────────
  _spawnMorningRush() {
    // Respawn workers/residents who should be arriving
    for (const room of this.tower.rooms.values()) {
      if (room.type !== 'OFFICE' && room.type !== 'CONDO') continue;
      if (room.floor === 1) continue;  // no travel needed

      const count = room.maxOccupancy;
      const centerX = (room.col + room.w / 2) * C.CELL_W;

      for (let i = 0; i < count; i++) {
        const type = room.type === 'OFFICE' ? 'WORKER' : 'RESIDENT';
        const p = new Person(type, 1, room.floor, centerX);
        // Stay until evening rush
        p.stayDuration = (room.type === 'OFFICE') ? 60_000 * 9 : 60_000 * 14;
        // Randomise starting x a bit
        p.x = (90 + Math.random() * 20) * C.CELL_W;
        this.tower.persons.set(p.id, p);
      }
    }
  }

  _triggerEveningDeparture() {
    // Tell workers to go home (they'll do so naturally via stayTimer)
    for (const p of this.tower.persons.values()) {
      if (p.type === 'WORKER' && !p.goingHome) {
        p.stayTimer = 0;  // trigger immediate departure
      }
    }
  }

  // ── Room inspector click ──────────────────────────────────
  _handleClick(e) {
    if (this.input.activeTool) return;  // building mode, no inspect

    const r = this.canvas.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    const floor = this.renderer.screenToFloor(sy);
    const col   = this.renderer.screenToCol(sx);

    if (floor === null) return;

    const room = this.tower.getRoomAt(floor, col);
    this.renderer.selectedRoom = room || null;
    this.ui.showRoomInfo(room);

    if (!room) {
      // Check elevator
      for (const e of this.tower.elevators.values()) {
        if (e.col === col && e.serves(floor)) {
          const floors = e.floorCount;
          const cost   = C.ELEV_BASE_COST + floors * C.ELEV_PER_FLOOR;
          this.ui.elInfo.innerHTML =
            `<div><b>${e.type} Elevator</b></div>` +
            `<div>Col ${e.col}</div>` +
            `<div>Floors ${e.bottomFloor}–${e.topFloor}</div>` +
            `<div>Passengers: ${e.passengers.length}/${e.maxPassengers}</div>` +
            `<div>Cost: $${cost.toLocaleString()}</div>`;
          return;
        }
      }
    }
  }
}

// ── Boot ──────────────────────────────────────────────────────
window.addEventListener('load', () => {
  window.game = new Game();
});
