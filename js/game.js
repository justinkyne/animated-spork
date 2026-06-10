'use strict';

class Game {
  constructor() {
    this.canvas = document.getElementById('canvas');

    const saved = SaveSystem.load();
    if (saved) {
      this.tower = Tower.deserialize(saved.tower);
      this.economy = Economy.deserialize(saved.economy);
      this.goals = Goals.deserialize(saved.goals);
      this.time = new GameTime();
      this.time.totalMin = saved.totalMin || this.time.totalMin;
      this.stars = saved.stars || 1;
      this.won = !!saved.won;
    } else {
      this.tower = new Tower();
      this.economy = new Economy(C.START_MONEY);
      this.goals = new Goals();
      this.time = new GameTime();
      this.stars = 1;
      this.won = false;
    }

    this.renderer = new Renderer(this.canvas);
    this.ui = new UI(this);
    this.input = new Input(this.canvas, this);

    this.time.onMinute = t => this._minuteTick(t);
    this.time.onHour = (h, t) => this._hourTick(h, t);
    this.time.onDay = (d, t) => this._dayTick(d, t);
    this.time.onQuarter = (q, t) => this._quarterTick(q, t);

    // Money particles on income
    this.economy.onEarn = (amount, label) => {
      // pop near the top of the visible tower
      this.renderer.popMoney(
        this.renderer.cam.x + (Math.random() - 0.5) * 120,
        this.renderer.cam.y - 60 + Math.random() * 60,
        `+${fmt$(amount)}`,
      );
    };

    this.renderer.centerOnLobby();
    this._lastTs = null;
    this._autosaveTimer = 0;
    this.started = false;

    this.ui.markGoalsDirty();
    this.tower.evalPass();

    // Title screen first; the world idles behind it until the player starts
    this.time.setSpeed(0);
    const skipSplash = sessionStorage.getItem('skyrise.fresh');
    if (skipSplash) {
      sessionStorage.removeItem('skyrise.fresh');
      document.getElementById('splash').classList.add('gone');
      this._begin(true);
    } else {
      this.ui.showSplash(!!saved, isNew => {
        if (isNew && saved) {
          // wipe and reboot straight into a fresh tower
          SaveSystem.clear();
          sessionStorage.setItem('skyrise.fresh', '1');
          location.reload();
          return;
        }
        this._begin(!saved);
      });
    }

    window.addEventListener('beforeunload', () => {
      if (this.started) SaveSystem.save(this);
    });
    requestAnimationFrame(ts => this._loop(ts));
  }

  _begin(isNew) {
    this.started = true;
    this.time.setSpeed(1);
    if (isNew) {
      this.ui.showHelp();
      this.ui.setStatus('Start with a few Offices on floor 2, then connect an Elevator to the lobby.');
    } else {
      this.ui.toast('Welcome back — your tower missed you!', 'success');
    }

    // One-time hint for iOS Safari: installing makes it fullscreen
    const isiOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
    if (isiOS && !navigator.standalone && !localStorage.getItem('skyrise.a2hs')) {
      localStorage.setItem('skyrise.a2hs', '1');
      setTimeout(() => this.ui.toast(
        '📲 Tip: tap Share → "Add to Home Screen" to play fullscreen', 'info', 9000), 4000);
    }
  }

  // ── Main loop ─────────────────────────────────────────────
  _loop(ts) {
    const dtReal = this._lastTs ? Math.min(ts - this._lastTs, 100) : 16;
    this._lastTs = ts;

    this.time.update(dtReal);
    this.tower.update(this.time.gameDt, this.time);
    this.ui.update();
    this.renderer.draw(this, dtReal);

    this._autosaveTimer += dtReal;
    if (this._autosaveTimer > 25_000) {
      this._autosaveTimer = 0;
      if (this.started) SaveSystem.save(this);
    }

    requestAnimationFrame(ts2 => this._loop(ts2));
  }

  // ── Building actions (called by Input / UI) ───────────────
  buildRoom(type, floor, col) {
    const def = C.ROOMS[type];
    if (this.stars < def.unlock)
      return { ok: false, reason: `Locked — reach ${'★'.repeat(def.unlock)} first.` };
    if (!this.economy.canAfford(def.cost))
      return { ok: false, reason: `Not enough funds (${fmt$(def.cost)} needed).` };

    const result = this.tower.placeRoom(type, floor, col, this.time.totalMin);
    if (!result.ok) return result;

    this.economy.spend(def.cost);
    sfx.build();
    this._lastBuild = { kind: 'room', obj: result.room, cost: def.cost, at: performance.now() };

    if (type === 'CROWN' && !this.won) {
      this.won = true;
      sfx.star();
      this.renderer.burstConfetti(220);
      this.ui.showWin();
    }
    this._checkGoals();
    return result;
  }

  buildElevator(type, col, bottom, top) {
    const def = C.ELEVATORS[type];
    const unlock = type === 'EXPRESS' ? 3 : 1;
    if (this.stars < unlock)
      return { ok: false, reason: `Locked — reach ${'★'.repeat(unlock)} first.` };
    const cost = def.base + def.perFloor * (top - bottom);
    if (!this.economy.canAfford(cost))
      return { ok: false, reason: `Not enough funds (${fmt$(cost)} needed).` };

    const result = this.tower.placeShaft(type, col, bottom, top);
    if (!result.ok) return result;

    this.economy.spend(cost);
    sfx.build();
    this._lastBuild = { kind: 'shaft', obj: result.shaft, cost, at: performance.now() };
    this.ui.setStatus(`${def.name} built — floors ${bottom} to ${top}.`);
    this._checkGoals();
    return result;
  }

  demolish(target) {
    if (!target) return;
    let refund = 0;
    if (target.kind === 'room') {
      if (!this.tower.demolishRoom(target.obj)) return;
      refund = Math.round(target.obj.def.cost * C.DEMOLISH_REFUND);
    } else if (target.kind === 'shaft') {
      if (!this.tower.demolishShaft(target.obj)) return;
      refund = Math.round(target.obj.cost() * C.DEMOLISH_REFUND);
    }
    if (refund > 0) this.economy.earn(refund, 'refund');
    sfx.demolish();
    if (this.renderer.selected && this.renderer.selected.obj === target.obj) {
      this.renderer.selected = null;
      this.ui.showInfo(null);
    }
  }

  demolishSelected() {
    this.demolish(this.renderer.selected);
  }

  // Full-refund undo of the most recent build, within a short window
  get canUndo() {
    return this._lastBuild &&
      performance.now() - this._lastBuild.at < C.UNDO_WINDOW_MS;
  }

  undoLastBuild() {
    const lb = this._lastBuild;
    if (!lb || !this.canUndo) return;
    this._lastBuild = null;
    let removed = false;
    if (lb.kind === 'room' && this.tower.rooms.has(lb.obj.id)) {
      removed = this.tower.demolishRoom(lb.obj);
    } else if (lb.kind === 'shaft' && this.tower.shafts.has(lb.obj.id)) {
      removed = this.tower.demolishShaft(lb.obj);
    }
    if (!removed) return;
    this.economy.earn(lb.cost, 'undo');
    sfx.demolish();
    if (this.renderer.selected && this.renderer.selected.obj === lb.obj) {
      this.renderer.selected = null;
      this.ui.showInfo(null);
    }
    this.ui.toast('Removed — full refund.', 'success', 2200);
  }

  inspectAt(floor, col) {
    if (floor === null) {
      this.renderer.selected = null;
      this.ui.showInfo(null);
      return;
    }
    const room = this.tower.getRoomAt(floor, col);
    const shaft = room ? null : this.tower.shaftAtCell(floor, col);
    const sel = room ? { kind: 'room', obj: room }
      : shaft ? { kind: 'shaft', obj: shaft } : null;
    this.renderer.selected = sel;
    this.ui.showInfo(sel);
    if (sel) sfx.click();
  }

  // ── Simulation ticks ──────────────────────────────────────
  _minuteTick(t) {
    const h = t.hourFloat;

    // Morning commute (weekdays): workers stream in 6:30–9:30
    if (!t.isWeekend && h >= 6.5 && h < 9.5) this._spawnCommuters(t, 'in');
    // Residents go out in the morning, come home in the evening
    if (!t.isWeekend && h >= 7.5 && h < 9.5) this._spawnResidents(t, 'out');
    if (h >= 17 && h < 20.5) this._spawnResidents(t, 'in');
    // Shoppers visit commercial space across the day
    if (h >= 10 && h < 20 && t.totalMin % 3 === 0) this._spawnShopper(t);
    // Hotel guests check in during the evening
    if (h >= 18 && h < 21.5) this._spawnGuests(t);
  }

  _hourTick(hour, t) {
    this.tower.evalPass();
    this._checkGoals();
    this._updateRating();

    if (hour === 17) this._rollHotelDemand();
    if (hour === 23) this._collectHotelIncome();
    if (hour === 9) this._hotelCheckout();
    if (hour === 12) this._housekeepingClean();
    // Several leasing windows a day keeps the early game snappy
    if (hour === 8 || hour === 12 || hour === 16) this._fillVacancies(t);
  }

  _dayTick(day, t) {
    this.tower.decayComplaints();
  }

  _quarterTick(q, t) {
    // Struggling check before rent: commercial without traffic earns nothing
    const pop = this.tower.population;
    for (const r of this.tower.rooms.values()) {
      if (r.kind !== 'commercial' || !r.occupied) continue;
      r.struggling = pop < r.def.needsPop;
      if (r.struggling && Math.random() < 0.3) {
        r.occupied = false;
        this.ui.toast(`${r.def.name} closed down — not enough foot traffic.`, 'warn');
      }
    }

    const res = this.economy.collectQuarter(this.tower);
    if (res.income > 0) sfx.cash();
    const sign = res.net >= 0 ? '+' : '';
    this.ui.toast(
      `Rent day! Income ${fmt$(res.income)}, upkeep ${fmt$(res.expense)} → ${sign}${fmt$(res.net)}`,
      res.net >= 0 ? 'success' : 'warn', 6000);

    // Unhappy tenants may leave
    for (const r of this.tower.rooms.values()) {
      if (!r.occupied || (r.kind !== 'tenant' && r.kind !== 'commercial')) continue;
      if (r.def.pop === 0 && r.type === 'PARKING') continue;
      const chance = r.eval < 25 ? 0.5 : r.eval < 40 ? 0.15 : 0;
      if (chance && Math.random() < chance) {
        r.occupied = false;
        this.ui.toast(`A ${r.def.name} tenant moved out (mood ${Math.round(r.eval)}).`, 'warn');
      }
    }
    this._checkGoals();
  }

  // ── Population & occupancy ────────────────────────────────
  _fillVacancies(t) {
    let moved = 0;
    for (const r of this.tower.rooms.values()) {
      if (r.occupied || r.kind === 'service' || r.kind === 'special' || r.kind === 'hotel') continue;
      if (r.floor !== 1 && !this.tower.hasAccess(r.floor)) continue;
      // Commercial won't open without the foot traffic it needs
      if (r.kind === 'commercial' && this.tower.population < r.def.needsPop * 0.6) continue;

      const potential = this.tower.computeEval(r);
      const chance = clamp(0.3 + (this.stars - 1) * 0.08 + (potential - 50) / 180, 0.05, 0.85);
      if (Math.random() < chance) {
        r.occupied = true;
        r.eval = potential;
        moved++;
      }
    }
    if (moved > 0) {
      this.ui.toast(`${moved} new ${moved === 1 ? 'tenant' : 'tenants'} moved in! 🎉`, 'success');
      this._updateRating();
      this._checkGoals();
    }
  }

  _spawnCommuters(t) {
    // Spread each office's workforce across the 3-hour morning window
    const offices = [...this.tower.rooms.values()]
      .filter(r => r.type === 'OFFICE' && r.occupied);
    if (offices.length === 0) return;
    const perMin = offices.length * C.ROOMS.OFFICE.pop / 180;
    let n = Math.floor(perMin) + (Math.random() < perMin % 1 ? 1 : 0);
    n = Math.min(n, 4);
    for (let i = 0; i < n; i++) {
      const room = offices[Math.floor(Math.random() * offices.length)];
      const stay = (17 - t.hourFloat) * 60 + Math.random() * 120;   // until ~5–7 PM
      this.tower.spawnVisitor('worker', room, stay, t);
    }
  }

  _spawnResidents(t, dir) {
    const condos = [...this.tower.rooms.values()]
      .filter(r => r.type === 'CONDO' && r.occupied);
    if (condos.length === 0) return;
    if (Math.random() > 0.5) return;
    const room = condos[Math.floor(Math.random() * condos.length)];
    if (dir === 'out') {
      this.tower.spawnLeaver('resident', room, t);
    } else {
      this.tower.spawnVisitor('resident', room, 8 * 60, t);
    }
  }

  _spawnShopper(t) {
    const shops = [...this.tower.rooms.values()]
      .filter(r => r.kind === 'commercial' && r.occupied);
    if (shops.length === 0) return;
    const room = shops[Math.floor(Math.random() * shops.length)];
    this.tower.spawnVisitor('shopper', room, 30 + Math.random() * 60, t);
  }

  _spawnGuests(t) {
    const hotels = [...this.tower.rooms.values()]
      .filter(r => r.kind === 'hotel' && r.guestsTonight > 0 && !r._guestArrived);
    if (hotels.length === 0) return;
    const room = hotels[Math.floor(Math.random() * hotels.length)];
    room._guestArrived = true;
    this.tower.spawnVisitor('guest', room, 12 * 60, t);
  }

  // ── Hotels ────────────────────────────────────────────────
  _rollHotelDemand() {
    for (const r of this.tower.rooms.values()) {
      if (r.kind !== 'hotel') continue;
      r._guestArrived = false;
      if (r.dirty || (r.floor !== 1 && !this.tower.hasAccess(r.floor))) {
        r.guestsTonight = 0;
        continue;
      }
      const p = clamp(0.4 + this.stars * 0.1 + (r.eval - 50) / 250, 0.1, 0.95);
      r.guestsTonight = Math.random() < p ? r.def.pop : 0;
    }
  }

  _collectHotelIncome() {
    let total = 0, rooms = 0;
    for (const r of this.tower.rooms.values()) {
      if (r.kind !== 'hotel' || r.guestsTonight === 0) continue;
      total += Math.round(r.def.nightly * (0.85 + Math.random() * 0.3));
      rooms++;
    }
    if (total > 0) {
      this.economy.earn(total, 'hotel');
      sfx.cash();
      this.ui.toast(`Hotel night: ${rooms} rooms booked, +${fmt$(total)}`, 'success');
    }
  }

  _hotelCheckout() {
    for (const r of this.tower.rooms.values()) {
      if (r.kind !== 'hotel') continue;
      if (r.guestsTonight > 0) {
        r.guestsTonight = 0;
        r.dirty = true;
      }
    }
  }

  _housekeepingClean() {
    let capacity = this.tower.housekeepingCapacity();
    if (capacity === 0) return;
    for (const r of this.tower.rooms.values()) {
      if (capacity <= 0) break;
      if (r.kind === 'hotel' && r.dirty) {
        r.dirty = false;
        capacity--;
      }
    }
  }

  // ── Rating & goals ────────────────────────────────────────
  _updateRating() {
    const pop = this.tower.population;
    const avgEval = this.tower.avgEval();
    let stars = 1;
    for (const r of C.RATINGS) {
      if (pop < r.pop) break;
      if (r.minEval && avgEval < r.minEval) break;
      if (r.need) {
        let ok = true;
        for (const [type, n] of Object.entries(r.need)) {
          if (this.tower.countRooms(type) < n) { ok = false; break; }
        }
        if (!ok) break;
      }
      stars = r.stars;
    }

    if (stars > this.stars) {
      this.stars = stars;
      sfx.star();
      this.renderer.burstConfetti(140);
      this.ui.showStarUp(stars);
      this.ui.markGoalsDirty();
      SaveSystem.save(this);
    } else if (stars < this.stars) {
      // Rating can slip if population/mood collapses
      this.stars = stars;
      this.ui.toast('Your tower rating dropped! Keep tenants happy.', 'warn');
    }
  }

  _checkGoals() {
    const fresh = this.goals.update(this);
    for (const { def, isAchievement } of fresh) {
      if (def.reward) this.economy.earn(def.reward, 'goal');
      if (isAchievement) {
        sfx.goal();
        this.ui.toast(`🏅 Achievement: ${def.title}`, 'gold', 6000);
      } else {
        sfx.goal();
        this.renderer.burstConfetti(50);
        this.ui.toast(`✔ Goal complete: ${def.title}` +
          (def.reward ? ` (+${fmt$(def.reward)})` : ''), 'gold', 6000);
      }
      this.ui.markGoalsDirty();
    }
  }
}

// ── Boot ──────────────────────────────────────────────────────
window.addEventListener('load', () => {
  window.game = new Game();
});
