'use strict';

class UI {
  constructor() {
    this.elMoney   = document.getElementById('hud-money');
    this.elClock   = document.getElementById('hud-clock');
    this.elDay     = document.getElementById('hud-day');
    this.elSeason  = document.getElementById('hud-season');
    this.elStars   = document.getElementById('hud-stars');
    this.elPop     = document.getElementById('hud-pop');
    this.elIncome  = document.getElementById('hud-qincome');
    this.elStatus  = document.getElementById('status-text');
    this.elCursor  = document.getElementById('cursor-pos');
    this.elInfo    = document.getElementById('info-box');
    this.elPause   = document.getElementById('btn-pause');

    this._flashTimer = 0;
    this._flashMsg   = '';
  }

  update(economy, tower, gameTime) {
    // Money
    this.elMoney.textContent = economy.formattedMoney;
    this.elMoney.style.color = economy.money < 0 ? '#ff4444' : '#4cff88';

    // Time
    this.elClock.textContent  = gameTime.timeString;
    this.elDay.textContent    = `${gameTime.dayName} · Day ${gameTime.day}`;
    this.elSeason.textContent = gameTime.seasonName + ' Y' + gameTime.year;

    // Pause button
    this.elPause.textContent = gameTime.paused ? '▶' : '⏸';
    this.elPause.classList.toggle('active', gameTime.paused);

    // Rating
    const rating = economy.rating(tower);
    this.elStars.textContent = rating.label;
    this.elPop.textContent   = `Pop: ${tower.population.toLocaleString()}`;

    // Quarterly income estimate
    this.elIncome.textContent = tower.quarterlyIncome().toLocaleString();
  }

  setStatus(msg) {
    this.elStatus.textContent = msg;
  }

  flash(msg) {
    this._flashMsg  = msg;
    this._flashTimer = 120;
    this.elStatus.textContent = msg;
    this.elStatus.style.color = '#ffdd44';
  }

  tickFlash() {
    if (this._flashTimer > 0) {
      this._flashTimer--;
      if (this._flashTimer === 0) {
        this.elStatus.style.color = '';
      }
    }
  }

  setCursor(info) {
    this.elCursor.textContent = info;
  }

  showRoomInfo(room) {
    if (!room) {
      this.elInfo.textContent = 'Click a room to inspect it.';
      return;
    }
    this.elInfo.innerHTML = room.infoText()
      .split('\n')
      .map(l => `<div>${l}</div>`)
      .join('');
  }

  // Highlight selected toolbar button
  selectTool(toolName) {
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.tool === toolName);
    });
  }
}
