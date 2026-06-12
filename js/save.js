'use strict';

const SaveSystem = {
  KEY: 'skyrise.save.v1',

  // On iOS, copy native-stored saves back into localStorage before boot
  // (WebView storage can be evicted under disk pressure; Preferences can't).
  async restoreFromNative() {
    if (!Native.isNative) return;
    for (const key of [this.KEY, Campaign.KEY]) {
      try {
        if (!localStorage.getItem(key)) {
          const v = await Native.kvGet(key);
          if (v) localStorage.setItem(key, v);
        }
      } catch {}
    }
  },

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
      const json = JSON.stringify(data);
      localStorage.setItem(this.KEY, json);
      Native.kvSet(this.KEY, json);                       // async mirror
      Native.kvSet(Campaign.KEY, localStorage.getItem(Campaign.KEY) || '');
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
    Native.kvRemove(this.KEY);
  },
};
