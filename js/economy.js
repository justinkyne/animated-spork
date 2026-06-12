'use strict';

class Economy {
  constructor(startMoney) {
    this.money = startMoney;
    this.lastQuarterNet = 0;
    this.lastQuarterIncome = 0;
    this.lastQuarterExpense = 0;
    this.lifetimeEarned = 0;
    this.lastBreakdown = [];      // [{label, amount}]
    this.bestRentDay = 0;
    this.hotelEarnedTonight = 0;

    this.onEarn = null;           // (amount, label) hook for UI particles
  }

  canAfford(n) { return this.money >= n; }

  spend(n) {
    this.money -= n;
  }

  earn(n, label) {
    this.money += n;
    this.lifetimeEarned += n;
    if (this.onEarn && n > 0) this.onEarn(n, label);
  }

  // Rent day: collect rent from every occupied room, pay upkeep on
  // services and elevators. rentMult is the city's market level.
  // Returns {income, expense, net, breakdown}.
  collectQuarter(tower, rentMult = 1) {
    const by = new Map();
    const add = (label, amt) => by.set(label, (by.get(label) || 0) + amt);

    let income = 0, expense = 0;
    for (const r of tower.rooms.values()) {
      const rent = Math.round(r.quarterlyRent() * rentMult);
      if (rent > 0) { income += rent; add(r.name, rent); }
      const up = r.quarterlyUpkeep();
      if (up > 0) { expense += up; add(r.name + ' upkeep', -up); }
    }
    for (const s of tower.shafts.values()) {
      const m = s.def.maint;
      expense += m;
      add(s.def.name + ' upkeep', -m);
    }

    const net = income - expense;
    this.money += net;
    if (income > 0) this.lifetimeEarned += income;
    this.lastQuarterIncome = income;
    this.lastQuarterExpense = expense;
    this.lastQuarterNet = net;
    this.bestRentDay = Math.max(this.bestRentDay, income);
    this.lastBreakdown = [...by.entries()]
      .map(([label, amount]) => ({ label, amount }))
      .sort((a, b) => b.amount - a.amount);

    return { income, expense, net, breakdown: this.lastBreakdown };
  }

  serialize() {
    return {
      money: this.money,
      net: this.lastQuarterNet,
      inc: this.lastQuarterIncome,
      exp: this.lastQuarterExpense,
      life: this.lifetimeEarned,
      best: this.bestRentDay,
    };
  }

  static deserialize(d) {
    const e = new Economy(d.money ?? C.START_MONEY);
    e.lastQuarterNet = d.net || 0;
    e.lastQuarterIncome = d.inc || 0;
    e.lastQuarterExpense = d.exp || 0;
    e.lifetimeEarned = d.life || 0;
    e.bestRentDay = d.best || 0;
    return e;
  }
}
