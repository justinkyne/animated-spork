'use strict';

// Sequential goal chain + side achievements. Pure-original design:
// each goal has a check(game) predicate and a cash reward.
const GOAL_DEFS = [
  { id: 'offices3',  title: 'Open for business — build 3 Offices', reward: 25_000,
    check: g => g.tower.countRooms('OFFICE') >= 3 },
  { id: 'elevator1', title: 'Get connected — build an elevator', reward: 25_000,
    check: g => g.tower.shafts.size >= 1 },
  { id: 'pop50',     title: 'Reach 50 population', reward: 30_000,
    check: g => g.tower.population >= 50 },
  { id: 'food1',     title: 'Feed the crowd — build a Fast Food', reward: 20_000,
    check: g => g.tower.countRooms('FAST_FOOD') >= 1 },
  { id: 'star2',     title: 'Earn your second star (150 pop)', reward: 50_000,
    check: g => g.stars >= 2 },
  { id: 'hotel1',    title: 'Hospitality — Hotel Room + Housekeeping', reward: 40_000,
    check: g => g.tower.countRooms('HOTEL') >= 1 && g.tower.countRooms('HOUSEKEEPING') >= 1 },
  { id: 'rent150k',  title: 'Collect $150,000 on a single rent day', reward: 50_000,
    check: g => g.economy.bestRentDay >= 150_000 },
  { id: 'pop300',    title: 'Reach 300 population', reward: 60_000,
    check: g => g.tower.population >= 300 },
  { id: 'star3',     title: 'Earn your third star (500 pop + Security)', reward: 100_000,
    check: g => g.stars >= 3 },
  { id: 'express1',  title: 'Go vertical — Sky Lobby + Express Elevator', reward: 80_000,
    check: g => g.tower.countRooms('SKY_LOBBY') >= 1 &&
                [...g.tower.shafts.values()].some(s => s.type === 'EXPRESS') },
  { id: 'pop800',    title: 'Reach 800 population', reward: 100_000,
    check: g => g.tower.population >= 800 },
  { id: 'star4',     title: 'Earn your fourth star (1,200 pop + Medical)', reward: 200_000,
    check: g => g.stars >= 4 },
  { id: 'pop2000',   title: 'Reach 2,000 population', reward: 250_000,
    check: g => g.tower.population >= 2_000 },
  { id: 'star5',     title: 'Earn your fifth star (2,500 pop)', reward: 500_000,
    check: g => g.stars >= 5 },
  { id: 'crown',     title: 'Build The Crown on floor 50+ — become a MEGATOWER', reward: 0,
    check: g => g.tower.countRooms('CROWN') >= 1 },
];

const ACHIEVEMENT_DEFS = [
  { id: 'millionaire', title: 'Millionaire — hold $1,000,000 cash', reward: 10_000,
    check: g => g.economy.money >= 1_000_000 },
  { id: 'landlord',    title: 'Landlord — 50 rooms built', reward: 15_000,
    check: g => g.tower.rooms.size >= 50 },
  { id: 'magnate',     title: 'Magnate — 150 rooms built', reward: 40_000,
    check: g => g.tower.rooms.size >= 150 },
  { id: 'skyline25',   title: 'Skyline — build above floor 25', reward: 10_000,
    check: g => [...g.tower.rooms.values()].some(r => r.floor >= 25) },
  { id: 'skyline60',   title: 'Stratosphere — build above floor 60', reward: 30_000,
    check: g => [...g.tower.rooms.values()].some(r => r.floor >= 60) },
  { id: 'deepdig',     title: 'Bedrock — build on basement 5', reward: 10_000,
    check: g => [...g.tower.rooms.values()].some(r => r.floor === -C.BELOW) },
  { id: 'fleet',       title: 'Fleet — 8 elevator shafts', reward: 20_000,
    check: g => g.tower.shafts.size >= 8 },
  { id: 'fullhouse',   title: 'Full House — 10+ hotel rooms all booked', reward: 25_000,
    check: g => {
      const hotels = [...g.tower.rooms.values()].filter(r => r.kind === 'hotel');
      return hotels.length >= 10 && hotels.every(r => r.guestsTonight > 0);
    } },
];

class Goals {
  constructor() {
    this.done = new Set();          // goal ids
    this.achieved = new Set();      // achievement ids
  }

  get currentGoal() {
    return GOAL_DEFS.find(d => !this.done.has(d.id)) || null;
  }

  // Returns array of newly completed {def, isAchievement}
  update(game) {
    const fresh = [];

    const cur = this.currentGoal;   // only the next goal in the chain can fire
    if (cur && cur.check(game)) {
      this.done.add(cur.id);
      fresh.push({ def: cur, isAchievement: false });
    }

    for (const d of ACHIEVEMENT_DEFS) {
      if (this.achieved.has(d.id)) continue;
      if (d.check(game)) {
        this.achieved.add(d.id);
        fresh.push({ def: d, isAchievement: true });
      }
    }
    return fresh;
  }

  serialize() {
    return { done: [...this.done], ach: [...this.achieved] };
  }

  static deserialize(d) {
    const goals = new Goals();
    for (const id of d.done || []) goals.done.add(id);
    for (const id of d.ach || []) goals.achieved.add(id);
    return goals;
  }
}
