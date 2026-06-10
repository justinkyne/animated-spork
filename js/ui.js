'use strict';

class UI {
  constructor(game) {
    this.game = game;
    this.el = {
      money: document.getElementById('hud-money'),
      flow: document.getElementById('hud-flow'),
      clock: document.getElementById('hud-clock'),
      date: document.getElementById('hud-date'),
      stars: document.getElementById('hud-stars'),
      pop: document.getElementById('hud-pop'),
      progFill: document.getElementById('star-progress-fill'),
      progLabel: document.getElementById('star-progress-label'),
      status: document.getElementById('status-text'),
      cursor: document.getElementById('cursor-pos'),
      tools: document.getElementById('tools'),
      toasts: document.getElementById('toasts'),
      modal: document.getElementById('modal'),
      modalCard: document.getElementById('modal-card'),
      tabGoals: document.getElementById('tab-goals'),
      tabInfo: document.getElementById('tab-info'),
      tabStats: document.getElementById('tab-stats'),
    };

    this._displayMoney = game.economy.money;
    this._lastMoney = game.economy.money;
    this._statusTimer = 0;
    this._lastStatsRefresh = 0;
    this._goalsDirty = true;

    this.isTouch = window.matchMedia('(pointer: coarse)').matches;

    this._buildSidebar();
    this._wireTabs();
    this._wireSpeedButtons();
    this._wireSystemButtons();
    this._wireDrawers();
    this._wireBuildControls();
  }

  // ── Mobile drawers ────────────────────────────────────────
  _wireDrawers() {
    const sidebar = document.getElementById('sidebar');
    const panel = document.getElementById('rightpanel');
    document.getElementById('mob-build').addEventListener('click', () => {
      sfx.click();
      panel.classList.remove('open');
      sidebar.classList.toggle('open');
      this._syncFabs();
    });
    document.getElementById('mob-panel').addEventListener('click', () => {
      sfx.click();
      sidebar.classList.remove('open');
      panel.classList.toggle('open');
      this._syncFabs();
    });
  }

  _syncFabs() {
    const sbOpen = document.getElementById('sidebar').classList.contains('open');
    const rpOpen = document.getElementById('rightpanel').classList.contains('open');
    document.getElementById('mob-build').textContent = sbOpen ? '✕' : '🏗️';
    document.getElementById('mob-panel').textContent = rpOpen ? '✕' : '⭐';
  }

  closeDrawers() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('rightpanel').classList.remove('open');
    this._syncFabs();
  }

  // ── Build-mode pill, confirm bar, undo chip ───────────────
  _wireBuildControls() {
    document.getElementById('bp-exit').addEventListener('click', () => {
      sfx.click();
      this.game.input.setTool(null);
    });
    document.getElementById('cb-ok').addEventListener('click', () => {
      this.game.input.confirmPending();
    });
    document.getElementById('cb-cancel').addEventListener('click', () => {
      sfx.click();
      this.game.input.clearPending();
    });
    document.getElementById('undo-chip').addEventListener('click', () => {
      this.game.undoLastBuild();
    });
  }

  syncBuildPill(tool) {
    const pill = document.getElementById('build-pill');
    if (!tool) { pill.classList.add('hidden'); return; }
    let label;
    if (tool === 'DEMOLISH') label = '🔨 Demolish mode';
    else if (tool === 'ELEV_STANDARD') label = '🛗 Building: Elevator';
    else if (tool === 'ELEV_EXPRESS') label = '🚀 Building: Express';
    else label = `${C.ROOMS[tool].icon} Building: ${C.ROOMS[tool].name}`;
    document.getElementById('bp-label').textContent = label;
    pill.classList.remove('hidden');
  }

  syncPending(pending) {
    const bar = document.getElementById('confirm-bar');
    if (!pending) { bar.classList.add('hidden'); return; }
    bar.classList.remove('hidden');
    const label = document.getElementById('cb-label');
    const ok = document.getElementById('cb-ok');
    if (pending.kind === 'demolish') {
      label.textContent = pending.label;
      ok.textContent = '✓ Demolish';
      ok.disabled = false;
      bar.classList.remove('invalid');
    } else {
      label.textContent = pending.valid ? pending.label : (pending.reason || 'Can\'t build here');
      ok.textContent = '✓ Build';
      ok.disabled = !pending.valid;
      bar.classList.toggle('invalid', !pending.valid);
    }
  }

  // Route short feedback to where the player can see it
  note(msg, type = 'warn') {
    if (this.isTouch) this.toast(msg, type, 2600);
    else this.setStatus(msg);
  }

  // ── Sidebar build buttons ─────────────────────────────────
  _buildSidebar() {
    const groups = new Map(C.CATEGORIES.map(c => [c, []]));

    const cc = base => this.game.cost(base);   // city-priced construction
    groups.get('TRANSPORT').push(
      { tool: 'ELEV_STANDARD', icon: '🛗', name: 'Elevator', costStr: `${fmt$(cc(C.ELEVATORS.STANDARD.base))}+`, unlock: 1, desc: C.ELEVATORS.STANDARD.desc },
      { tool: 'ELEV_EXPRESS', icon: '🚀', name: 'Express', costStr: `${fmt$(cc(C.ELEVATORS.EXPRESS.base))}+`, unlock: 3, desc: C.ELEVATORS.EXPRESS.desc },
    );
    for (const [key, def] of Object.entries(C.ROOMS)) {
      groups.get(def.cat).push({
        tool: key, icon: def.icon, name: def.name,
        costStr: fmt$(cc(def.cost)), unlock: def.unlock, desc: def.desc, def,
      });
    }
    groups.get('TOOLS').push(
      { tool: 'DEMOLISH', icon: '🔨', name: 'Demolish', costStr: `${Math.round(C.DEMOLISH_REFUND * 100)}% refund`, unlock: 1, desc: 'Remove a room or elevator shaft.' },
    );

    this.toolButtons = new Map();
    for (const [cat, items] of groups) {
      if (items.length === 0) continue;
      const catEl = document.createElement('div');
      catEl.className = 'tool-cat';
      catEl.textContent = cat;
      this.el.tools.appendChild(catEl);

      for (const it of items) {
        const btn = document.createElement('button');
        btn.className = 'tool-btn';
        btn.dataset.tool = it.tool;
        btn.title = it.desc;
        btn.innerHTML =
          `<span class="t-icon">${it.icon}</span>` +
          `<span class="t-body"><div class="t-name">${it.name}</div>` +
          `<div class="t-cost">${it.costStr}</div></span>` +
          `<span class="t-lock"></span>`;
        if (it.def) {
          btn.querySelector('.t-icon').style.background =
            `linear-gradient(135deg, ${it.def.color}55, ${it.def.color}22)`;
        }
        btn.addEventListener('click', () => {
          if (btn.classList.contains('locked')) {
            sfx.error();
            this.toast(`Locked — reach ${'★'.repeat(it.unlock)} to unlock ${it.name}.`, 'warn');
            return;
          }
          sfx.click();
          const selecting = this.game.input.activeTool !== it.tool;
          this.game.input.setTool(selecting ? it.tool : null);
          // On phones, close the drawer so the player can place immediately
          if (selecting && this.isTouch) {
            this.closeDrawers();
            const def = it.def;
            if (def) this.toast(`${def.icon} ${def.name} — tap the tower to build`, 'info', 2200);
            else if (it.tool.startsWith('ELEV')) this.toast('🛗 Drag up/down on the tower to place', 'info', 2600);
          }
        });
        this.el.tools.appendChild(btn);
        this.toolButtons.set(it.tool, { btn, unlock: it.unlock, def: it.def });
      }
    }
  }

  refreshToolLocks() {
    const stars = this.game.stars;
    const money = this.game.economy.money;
    for (const [tool, { btn, unlock, def }] of this.toolButtons) {
      btn.classList.toggle('locked', stars < unlock);
      if (def) btn.classList.toggle('cant-afford', money < this.game.cost(def.cost));
      btn.classList.toggle('active', this.game.input.activeTool === tool);
    }
  }

  _wireTabs() {
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.addEventListener('click', () => this.showTab(b.dataset.tab));
    });
  }

  showTab(name) {
    document.querySelectorAll('.tab-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === name));
    for (const t of ['goals', 'info', 'stats']) {
      document.getElementById('tab-' + t).classList.toggle('hidden', t !== name);
    }
  }

  _wireSpeedButtons() {
    document.querySelectorAll('.spd-btn').forEach(b => {
      b.addEventListener('click', () => {
        sfx.click();
        this.game.time.setSpeed(parseInt(b.dataset.speed, 10));
      });
    });
  }

  _wireSystemButtons() {
    document.getElementById('btn-help').addEventListener('click', () => this.showHelp());
    document.getElementById('btn-sound').addEventListener('click', e => {
      sfx.muted = !sfx.muted;
      e.target.textContent = sfx.muted ? '🔇' : '🔊';
    });
    document.getElementById('btn-save').addEventListener('click', () => {
      if (SaveSystem.save(this.game)) this.toast('Game saved.', 'success');
    });
    document.getElementById('btn-new').addEventListener('click', () => {
      this.showCitySelect();
    });
  }

  // ── Per-frame HUD update ──────────────────────────────────
  update() {
    const g = this.game;

    // Animated money counter, with a little pulse on big gains
    const target = g.economy.money;
    if (target - this._lastMoney > 5_000 && this.el.money.animate) {
      this.el.money.animate(
        [{ transform: 'scale(1.14)' }, { transform: 'scale(1)' }],
        { duration: 320, easing: 'cubic-bezier(.22,1.4,.36,1)' });
    }
    this._lastMoney = target;
    const diff = target - this._displayMoney;
    this._displayMoney += Math.abs(diff) < 1 ? diff : diff * 0.18;
    this.el.money.textContent = fmt$(Math.round(this._displayMoney));
    this.el.money.classList.toggle('broke', target < 0);

    const net = g.economy.lastQuarterNet;
    if (net !== 0) {
      this.el.flow.textContent = `${net > 0 ? '+' : ''}${fmt$(net)} last rent day`;
      this.el.flow.className = 'hud-sub ' + (net >= 0 ? 'gain' : 'loss');
    }

    this.el.clock.textContent = g.time.clockStr;
    this.el.date.textContent = `${g.city.emoji} ${g.city.name} · ${g.time.dateStr}`;

    document.querySelectorAll('.spd-btn').forEach(b =>
      b.classList.toggle('active', parseInt(b.dataset.speed, 10) === g.time.speedIdx));

    // Stars + progress to next
    const stars = g.stars;
    this.el.stars.innerHTML =
      '★'.repeat(stars) + `<span class="dim">${'★'.repeat(5 - stars)}</span>` +
      (g.won ? ' 🏆' : '');
    const pop = g.tower.population;
    this.el.pop.textContent = `Population ${pop.toLocaleString()}`;

    const next = C.RATINGS.find(r => r.stars === stars + 1);
    if (next) {
      this.el.progFill.style.width = `${clamp(pop / next.pop * 100, 0, 100)}%`;
      const extra = [];
      if (next.need) for (const k of Object.keys(next.need)) extra.push(C.ROOMS[k].name);
      this.el.progLabel.textContent =
        `${pop.toLocaleString()} / ${next.pop.toLocaleString()} pop for ${'★'.repeat(next.stars)}` +
        (extra.length ? ` (+ ${extra.join(', ')})` : '');
    } else {
      this.el.progFill.style.width = '100%';
      this.el.progLabel.textContent = g.won ? 'MEGATOWER' : 'Build The Crown!';
    }

    this.refreshToolLocks();

    // Undo chip lives while the full-refund window is open
    document.getElementById('undo-chip').classList.toggle('hidden', !g.canUndo);

    if (this._goalsDirty) { this._renderGoals(); this._goalsDirty = false; }

    // Stats tab is cheap-ish but rebuild only twice a second
    const now = performance.now();
    if (now - this._lastStatsRefresh > 500) {
      this._lastStatsRefresh = now;
      if (!this.el.tabStats.classList.contains('hidden')) this._renderStats();
    }
  }

  // ── Status bar ────────────────────────────────────────────
  setStatus(msg) { this.el.status.textContent = msg; }
  setCursor(msg) { this.el.cursor.textContent = msg; }

  // ── Toasts ────────────────────────────────────────────────
  toast(msg, type = 'info', ms = 4200) {
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    this.el.toasts.appendChild(t);
    while (this.el.toasts.children.length > 5) this.el.toasts.firstChild.remove();
    setTimeout(() => {
      t.classList.add('fade');
      setTimeout(() => t.remove(), 450);
    }, ms);
  }

  // ── Goals panel ───────────────────────────────────────────
  markGoalsDirty() { this._goalsDirty = true; }

  _renderGoals() {
    const goals = this.game.goals;
    let html = '';
    const cur = goals.currentGoal;
    let shown = 0;
    for (const d of GOAL_DEFS) {
      const done = goals.done.has(d.id);
      const isCur = cur && cur.id === d.id;
      // show all completed + current + one teaser
      if (!done && !isCur && shown > 0) break;
      if (!done && !isCur) continue;
      html += `<div class="goal ${done ? 'done' : 'current'}">` +
        (done ? '<span class="g-check">✔</span>' : '') +
        `<div class="g-title">${d.title}</div>` +
        (d.reward ? `<div class="g-reward">Reward: ${fmt$(d.reward)}</div>` : '') +
        `</div>`;
      if (isCur) shown++;
    }
    if (!cur) html += `<div class="goal done"><div class="g-title">All goals complete — MEGATOWER!</div></div>`;

    const ach = ACHIEVEMENT_DEFS.filter(d => this.game.goals.achieved.has(d.id));
    html += `<div class="goal-section">ACHIEVEMENTS (${ach.length}/${ACHIEVEMENT_DEFS.length})</div>`;
    for (const d of ach) {
      html += `<div class="goal done"><span class="g-check">🏅</span><div class="g-title">${d.title}</div></div>`;
    }
    this.el.tabGoals.innerHTML = html;
  }

  // ── Stats panel ───────────────────────────────────────────
  _renderStats() {
    const g = this.game, t = g.tower;
    const row = (k, v, cls = '') =>
      `<div class="stat-row"><span>${k}</span><span class="v ${cls}">${v}</span></div>`;

    let waits = [...t.shafts.values()].map(s => s.avgWait);
    const avgWait = waits.length ? (waits.reduce((a, b) => a + b) / waits.length) : 0;

    let html = '';
    html += row('Population', t.population.toLocaleString());
    html += row('Rooms', t.rooms.size);
    html += row('Elevator shafts', t.shafts.size);
    html += row('Avg elevator wait', `${avgWait.toFixed(1)} min`, avgWait > 15 ? 'neg' : 'pos');
    html += row('Avg tenant mood', `${Math.round(t.avgEval())}/100`, t.avgEval() >= 55 ? 'pos' : 'neg');
    html += row('Hotel rooms', t.countRooms('HOTEL') + t.countRooms('SUITE'));
    html += row('Housekeeping capacity', `${t.housekeepingCapacity()}/day`);
    html += row('Lifetime earned', fmt$(g.economy.lifetimeEarned), 'pos');
    html += row('Best rent day', fmt$(g.economy.bestRentDay));

    if (g.economy.lastBreakdown.length) {
      html += `<div class="goal-section">LAST RENT DAY</div>`;
      html += row('Income', fmt$(g.economy.lastQuarterIncome), 'pos');
      html += row('Upkeep', fmt$(-g.economy.lastQuarterExpense), 'neg');
      for (const b of g.economy.lastBreakdown.slice(0, 10)) {
        html += row(b.label, fmt$(b.amount), b.amount >= 0 ? 'pos' : 'neg');
      }
    }
    this.el.tabStats.innerHTML = html;
  }

  // ── Inspector ─────────────────────────────────────────────
  showInfo(sel) {
    if (!sel) {
      this.el.tabInfo.innerHTML = '<div class="muted">Click anything in the tower to inspect it.</div>';
      return;
    }
    this.showTab('info');
    let html = '';
    if (sel.kind === 'room') {
      const r = sel.obj, def = r.def;
      html += `<h3>${def.icon} ${def.name}</h3>`;
      html += `<div class="muted">Floor ${r.floor < 0 ? 'B' + (-r.floor) : r.floor}</div>`;
      if (r.kind === 'service' || r.kind === 'special') {
        html += `<p style="margin:6px 0">${def.desc}</p>`;
        if (def.maint) html += `<div>Upkeep: ${fmt$(def.maint)}/rent day</div>`;
      } else {
        if (r.noAccess) {
          html += `<div style="color:var(--red);margin:6px 0">⚠ No elevator access!</div>`;
        } else {
          html += `<div class="eval-bar"><div style="width:${r.eval}%;background:${r.moodColor}"></div></div>`;
          html += `<div>Mood: <b style="color:${r.moodColor}">${Math.round(r.eval)}/100</b></div>`;
        }
        if (r.kind === 'hotel') {
          html += `<div>${r.dirty ? '🧺 Dirty — needs housekeeping' : r.guestsTonight > 0 ? `Guests tonight: ${r.guestsTonight}` : 'Awaiting guests'}</div>`;
          html += `<div>Rate: ${fmt$(def.nightly)}/night</div>`;
        } else {
          html += `<div>${r.occupied ? (r.struggling ? '📉 Struggling (needs more traffic)' : 'Occupied') : 'Vacant'}</div>`;
          if (def.rent) html += `<div>Rent: ${fmt$(def.rent)}/rent day</div>`;
          if (def.needsPop) html += `<div>Needs population: ${def.needsPop}+</div>`;
        }
        if (def.pop) html += `<div>Residents/workers: ${r.occupied ? def.pop : 0}/${def.pop}</div>`;
      }
      html += `<button class="danger-btn" id="info-demolish">🔨 Demolish (${fmt$(Math.round(def.cost * C.DEMOLISH_REFUND))} back)</button>`;
    } else if (sel.kind === 'shaft') {
      const s = sel.obj, def = s.def;
      html += `<h3>🛗 ${def.name}</h3>`;
      html += `<div class="muted">Floors ${s.bottom < 0 ? 'B' + (-s.bottom) : s.bottom} – ${s.top}</div>`;
      html += `<div>Cars: ${s.cars.length} · Capacity ${def.capacity} each</div>`;
      html += `<div>Riding now: ${s.totalPassengers()}</div>`;
      html += `<div>Avg wait: ${s.avgWait.toFixed(1)} min</div>`;
      html += `<div>Upkeep: ${fmt$(def.maint)}/rent day</div>`;
      html += `<button class="danger-btn" id="info-demolish">🔨 Demolish (${fmt$(Math.round(s.cost() * C.DEMOLISH_REFUND))} back)</button>`;
    }
    this.el.tabInfo.innerHTML = html;
    const btn = document.getElementById('info-demolish');
    if (btn) btn.addEventListener('click', () => this.game.demolishSelected());
  }

  // ── Modals ────────────────────────────────────────────────
  showModal(html) {
    this.el.modalCard.innerHTML = html;
    this.el.modal.classList.remove('hidden');
  }
  hideModal() { this.el.modal.classList.add('hidden'); }

  showStarUp(stars) {
    this.showModal(`
      <h1 class="gold">RATING UP!</h1>
      <div class="star-burst"><div class="big-stars">${'★'.repeat(stars)}<span class="off">${'★'.repeat(5 - stars)}</span></div></div>
      <p>Your tower earned its ${['', 'first', 'second', 'third', 'fourth', 'fifth'][stars]} star.<br>
      New rooms are now available in the build menu!</p>
      <button class="modal-btn" id="m-ok">Keep Building</button>
    `);
    document.getElementById('m-ok').addEventListener('click', () => this.hideModal());
  }

  showWin() {
    this.showModal(`
      <h1 class="gold">🏆 MEGATOWER 🏆</h1>
      <div class="star-burst"><div class="big-stars">★★★★★</div></div>
      <p>The Crown shines from your skyline. You built the ultimate tower —
      every elevator hums, every tenant smiles.</p>
      <p>The city is yours. Keep building, or start a fresh skyline.</p>
      <button class="modal-btn" id="m-ok">Continue</button>
    `);
    document.getElementById('m-ok').addEventListener('click', () => this.hideModal());
  }

  // ── Title screen ──────────────────────────────────────────
  showSplash(hasSave, onStart) {
    const splash = document.getElementById('splash');
    const btns = document.getElementById('splash-btns');
    btns.innerHTML = '';

    const dismiss = (isNew) => {
      sfx.click();
      splash.classList.add('gone');
      onStart(isNew);
    };

    if (hasSave) {
      const cont = document.createElement('button');
      cont.className = 'splash-btn';
      cont.textContent = `▶  Continue in ${this.game.city.name}`;
      cont.addEventListener('click', () => dismiss(false));
      const fresh = document.createElement('button');
      fresh.className = 'splash-btn ghost';
      fresh.textContent = '🌎 Choose City';
      fresh.addEventListener('click', () => dismiss(true));
      btns.append(cont, fresh);
    } else {
      const start = document.createElement('button');
      start.className = 'splash-btn';
      start.textContent = '▶  Start Your Climb';
      start.addEventListener('click', () => dismiss(true));
      btns.append(start);
    }
  }

  // ── City select (campaign levels + free play) ─────────────
  showCitySelect(fromSplash = false) {
    const cityCard = (c, locked, done, current) => {
      const status = done ? '<span class="cs-done">✓ COMPLETE</span>'
        : locked ? `<span class="cs-lock">🔒 ${Campaign.unlockHint(c)}</span>`
        : current ? '<span class="cs-current">▶ CURRENT TOWER</span>' : '';
      const win = c.win
        ? `<div class="cs-goal">Goal: ${'★'.repeat(c.win.stars)} · ${c.win.pop.toLocaleString()} pop${c.win.crown ? ' · 👑 Crown' : ''}</div>`
        : '<div class="cs-goal">Sandbox — no goal, just build</div>';
      return `<button class="city-card ${locked ? 'locked' : ''}" data-city="${c.id}" ${locked ? 'disabled' : ''}>
        <span class="cs-emoji">${c.emoji}</span>
        <span class="cs-body">
          <span class="cs-name">${c.name} <em>${c.region}</em> ${status}</span>
          <span class="cs-pop">Pop. ${c.population.toLocaleString()} · Costs ×${c.costMult} · Rents ×${c.rentMult}</span>
          <span class="cs-tag">${c.tagline}</span>
          ${win}
        </span>
      </button>`;
    };

    const cur = this.game.city.id;
    let html = '<h1>Choose Your City</h1>';
    html += '<p>Climb the campaign to unlock the skyline finale — or free-build anywhere.</p>';
    html += '<div class="city-list">';
    html += '<div class="goal-section">THE CLIMB</div>';
    for (const c of campaignCities()) {
      html += cityCard(c, !Campaign.isUnlocked(c), Campaign.isCompleted(c.id), c.id === cur);
    }
    html += '<div class="goal-section">THE FINALE — PICK YOUR SKYLINE</div>';
    for (const c of finaleCities()) {
      html += cityCard(c, !Campaign.isUnlocked(c), Campaign.isCompleted(c.id), c.id === cur);
    }
    html += '<div class="goal-section">FREE PLAY</div>';
    for (const c of freePlayCities()) {
      html += cityCard(c, false, false, c.id === cur);
    }
    html += '</div>';
    html += `<button class="modal-btn ghost" id="cs-close">${fromSplash ? 'Back' : 'Cancel'}</button>`;

    this.showModal(html);

    document.getElementById('cs-close').addEventListener('click', () => {
      this.hideModal();
      if (fromSplash && !this.game.started) this.game._begin(!SaveSystem.load());
    });
    document.querySelectorAll('.city-card:not(.locked)').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.city;
        if (id === cur && this.game.started) { this.hideModal(); return; }
        sfx.click();
        if (id === cur && !this.game.started) {
          this.hideModal();
          this.game._begin(!SaveSystem.load());
          return;
        }
        // Starting a different city replaces the active tower
        sessionStorage.setItem('skyrise.newcity', id);
        location.reload();
      });
    });
  }

  showLevelComplete(city) {
    const next = campaignCities().find(c => !Campaign.isCompleted(c.id)) ||
                 (Campaign.isUnlocked(finaleCities()[0]) && !city.finale ? null : null);
    const finaleReady = campaignCities().every(c => Campaign.isCompleted(c.id));
    this.showModal(`
      <h1 class="gold">${city.emoji} ${city.name.toUpperCase()} CONQUERED!</h1>
      <div class="star-burst"><div class="big-stars">${'★'.repeat(city.win.stars)}</div></div>
      <p>${city.win.pop.toLocaleString()} people now live and work in your ${city.name} tower.
      ${city.finale ? 'You beat the final skyline. You are a true tower legend.'
        : finaleReady ? 'The finale cities are unlocked — pick your skyline!'
        : next ? `Next stop: <b>${next.name}</b> — bigger city, bigger stakes.` : ''}</p>
      ${city.finale ? '' : '<button class="modal-btn" id="lc-next">🌆 Next City</button>'}
      <button class="modal-btn ghost" id="lc-stay">Keep Building Here</button>
    `);
    const nextBtn = document.getElementById('lc-next');
    if (nextBtn) nextBtn.addEventListener('click', () => this.showCitySelect());
    document.getElementById('lc-stay').addEventListener('click', () => this.hideModal());
  }

  showHelp() {
    const controls = this.isTouch ? `
      <div class="help-grid">
        <b>Drag</b><span>Pan the camera (with no tool selected)</span>
        <b>Pinch</b><span>Zoom in and out</span>
        <b>Tap</b><span>Build with selected tool / inspect</span>
        <b>Drag up/down</b><span>Set elevator range (elevator tool)</span>
        <b>Drag sideways</b><span>Paint multiple rooms in a row</span>
        <b>🏗️ button</b><span>Open the build menu</span>
        <b>⭐ button</b><span>Goals, info &amp; stats</span>
      </div>` : `
      <div class="help-grid">
        <b>Left drag</b><span>Pan the camera (with no tool selected)</span>
        <b>Mouse wheel</b><span>Zoom</span>
        <b>Left click</b><span>Build with selected tool / inspect</span>
        <b>Drag vertically</b><span>Set elevator range (elevator tool)</span>
        <b>Drag horizontally</b><span>Paint multiple rooms in a row</span>
        <b>Right click / Esc</b><span>Cancel tool</span>
        <b>Space</b><span>Pause</span>
        <b>1–5 keys</b><span>Game speed</span>
      </div>`;
    this.showModal(`
      <h1>SKYRISE</h1>
      <p>Build a skyscraper city-in-the-sky. Keep tenants happy, elevators
      fast, and your stars climbing.</p>
      ${controls}
      <p>Tips: rent is collected every 4th day. Offices need elevators before
      anyone moves in. Hotels need Housekeeping. Express elevators only stop
      at Sky Lobbies — that's how you go tall.</p>
      <button class="modal-btn" id="m-ok">Let's Build</button>
    `);
    document.getElementById('m-ok').addEventListener('click', () => this.hideModal());
  }
}
