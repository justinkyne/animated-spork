'use strict';

const SaveSystem = {
  KEY: 'skyrise.save.v1',

  save(game) {
    try {
      const data = {
        v: 1,
        city: game.city ? game.city.id : 'burlington',
        lvl: game._levelDone ? 1 : 0,
        totalMin: game.time.totalMin,
        tower: game.tower.serialize(),
        economy: game.economy.serialize(),
        goals: game.goals.serialize(),
        stars: game.stars,
        won: game.won ? 1 : 0,
      };
      localStorage.setItem(this.KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.warn('Save failed:', e);
      return false;
    }
  },

  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (data.v !== 1) return null;
      return data;
    } catch (e) {
      console.warn('Load failed:', e);
      return null;
    }
  },

  clear() {
    localStorage.removeItem(this.KEY);
  },
};
