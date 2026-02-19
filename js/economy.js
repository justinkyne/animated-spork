'use strict';

class Economy {
  constructor(startMoney) {
    this.money          = startMoney;
    this.totalIncome    = 0;
    this.totalExpenses  = 0;
    this.lastQuarterIncome = 0;

    // Log of events
    this.log = [];
  }

  spend(amount, label) {
    if (this.money < amount) return false;
    this.money         -= amount;
    this.totalExpenses += amount;
    this._log(`-$${amount.toLocaleString()}`, label, '#ff6666');
    return true;
  }

  earn(amount, label) {
    this.money       += amount;
    this.totalIncome += amount;
    this._log(`+$${amount.toLocaleString()}`, label, '#66ff88');
  }

  _log(amount, label, color) {
    this.log.push({ amount, label, color, ts: Date.now() });
    if (this.log.length > 40) this.log.shift();
  }

  // Called each quarter by the game
  collectRent(tower) {
    const income = tower.quarterlyIncome();
    this.lastQuarterIncome = income;
    if (income > 0) this.earn(income, 'Quarterly rent');
    return income;
  }

  // Rating based on population + facilities
  rating(tower) {
    const pop = tower.population;
    const ratings = C.RATINGS;
    let r = ratings[0];
    for (const entry of ratings) {
      if (pop >= entry.pop) r = entry;
    }
    return r;
  }

  get formattedMoney() {
    return '$' + Math.abs(this.money).toLocaleString();
  }
}
