'use strict';

// ─────────────────────────────────────────────────────────────
//  City Mode — location-driven campaign & free play.
//
//  Each city profile is tuned from its real-world population and
//  density: land/construction costs, rent levels, how fast tenants
//  arrive, hotel/tourism demand, and the foot traffic that commerce
//  needs. The skyline backdrop is generated to match the city's
//  real silhouette character.
//
//  This shape is also the contract for live map data later: a
//  fetched OSM/Census profile just needs to produce the same fields.
// ─────────────────────────────────────────────────────────────

const CITIES = {
  // ── Campaign ───────────────────────────────────────────────
  burlington: {
    id: 'burlington', campaign: 1,
    name: 'Burlington', region: 'Vermont, USA', emoji: '🍁',
    population: 45_000,
    tagline: 'A friendly lakeside town. Cheap land, gentle pace — learn the ropes.',
    startMoney: 900_000, costMult: 0.85, rentMult: 0.8,
    fillRate: 1.3, hotelDemand: 0.85, trafficMult: 0.8,
    skyline: { tall: 0.03, maxH: 130, gap: 1.6 },
    win: { stars: 2, pop: 150 },
  },
  portland: {
    id: 'portland', campaign: 2,
    name: 'Portland', region: 'Oregon, USA', emoji: '🌲',
    population: 650_000,
    tagline: 'A real city with real appetites. Shops and restaurants thrive here.',
    startMoney: 750_000, costMult: 1.0, rentMult: 1.0,
    fillRate: 1.0, hotelDemand: 1.0, trafficMult: 1.05,
    skyline: { tall: 0.12, maxH: 260, gap: 1.0 },
    win: { stars: 3, pop: 600 },
  },
  chicago: {
    id: 'chicago', campaign: 3,
    name: 'Chicago', region: 'Illinois, USA', emoji: '🌆',
    population: 2_700_000,
    tagline: 'Big shoulders, big rents, big expectations. Keep those elevators moving.',
    startMoney: 700_000, costMult: 1.15, rentMult: 1.25,
    fillRate: 0.95, hotelDemand: 1.15, trafficMult: 1.25,
    skyline: { tall: 0.22, maxH: 420, gap: 0.8 },
    win: { stars: 4, pop: 1_500 },
  },

  // ── Finale (pick one once the campaign is cleared) ─────────
  manhattan: {
    id: 'manhattan', campaign: 4, finale: true,
    name: 'Manhattan', region: 'New York, USA', emoji: '🗽',
    population: 1_600_000,
    tagline: 'The final boss. Brutal costs, sky-high rents. Crown the skyline.',
    startMoney: 650_000, costMult: 1.45, rentMult: 1.75,
    fillRate: 0.9, hotelDemand: 1.35, trafficMult: 1.5,
    skyline: { tall: 0.4, maxH: 560, gap: 0.55 },
    win: { stars: 5, pop: 2_500, crown: true },
  },
  tokyo: {
    id: 'tokyo', campaign: 4, finale: true,
    name: 'Tokyo', region: 'Japan', emoji: '🗼',
    population: 14_000_000,
    tagline: 'Fourteen million people, zero patience for slow elevators.',
    startMoney: 650_000, costMult: 1.4, rentMult: 1.6,
    fillRate: 1.05, hotelDemand: 1.4, trafficMult: 1.6,
    skyline: { tall: 0.3, maxH: 460, gap: 0.5 },
    win: { stars: 5, pop: 2_500, crown: true },
  },
  london: {
    id: 'london', campaign: 4, finale: true,
    name: 'London', region: 'United Kingdom', emoji: '🇬🇧',
    population: 8_800_000,
    tagline: 'Historic streets, modern money. Mind the gap between income and upkeep.',
    startMoney: 650_000, costMult: 1.5, rentMult: 1.65,
    fillRate: 0.92, hotelDemand: 1.45, trafficMult: 1.35,
    skyline: { tall: 0.18, maxH: 380, gap: 0.75 },
    win: { stars: 5, pop: 2_500, crown: true },
  },
  hong_kong: {
    id: 'hong_kong', campaign: 4, finale: true,
    name: 'Hong Kong', region: 'China', emoji: '🏮',
    population: 7_500_000,
    tagline: 'The densest skyline on Earth. Vertical is the only direction.',
    startMoney: 650_000, costMult: 1.35, rentMult: 1.7,
    fillRate: 1.1, hotelDemand: 1.3, trafficMult: 1.55,
    skyline: { tall: 0.45, maxH: 540, gap: 0.45 },
    win: { stars: 5, pop: 2_500, crown: true },
  },
  dubai: {
    id: 'dubai', campaign: 4, finale: true,
    name: 'Dubai', region: 'UAE', emoji: '🏜️',
    population: 3_600_000,
    tagline: 'Where towers race each other. Hotels print money under the desert sun.',
    startMoney: 700_000, costMult: 1.3, rentMult: 1.5,
    fillRate: 0.95, hotelDemand: 1.7, trafficMult: 1.2,
    skyline: { tall: 0.35, maxH: 600, gap: 0.9 },
    win: { stars: 5, pop: 2_500, crown: true },
  },

  // ── Free play ──────────────────────────────────────────────
  austin: {
    id: 'austin', freePlay: true,
    name: 'Austin', region: 'Texas, USA', emoji: '🎸',
    population: 980_000,
    tagline: 'Booming and hungry — tenants arrive fast.',
    startMoney: 750_000, costMult: 1.05, rentMult: 1.1,
    fillRate: 1.25, hotelDemand: 1.1, trafficMult: 1.1,
    skyline: { tall: 0.15, maxH: 300, gap: 1.0 },
  },
  miami: {
    id: 'miami', freePlay: true,
    name: 'Miami', region: 'Florida, USA', emoji: '🌴',
    population: 450_000,
    tagline: 'Tourists year-round. Hotels and party halls shine.',
    startMoney: 750_000, costMult: 1.1, rentMult: 1.1,
    fillRate: 1.0, hotelDemand: 1.6, trafficMult: 1.15,
    skyline: { tall: 0.2, maxH: 320, gap: 1.1 },
  },
  paris: {
    id: 'paris', freePlay: true,
    name: 'Paris', region: 'France', emoji: '🥐',
    population: 2_100_000,
    tagline: 'Low skyline, high standards. Restaurants are everything.',
    startMoney: 700_000, costMult: 1.3, rentMult: 1.4,
    fillRate: 0.95, hotelDemand: 1.5, trafficMult: 1.3,
    skyline: { tall: 0.05, maxH: 200, gap: 0.7 },
  },
  singapore: {
    id: 'singapore', freePlay: true,
    name: 'Singapore', region: 'Singapore', emoji: '🦁',
    population: 5_900_000,
    tagline: 'Immaculate, efficient, demanding. Keep moods high.',
    startMoney: 700_000, costMult: 1.35, rentMult: 1.55,
    fillRate: 1.05, hotelDemand: 1.35, trafficMult: 1.4,
    skyline: { tall: 0.3, maxH: 440, gap: 0.6 },
  },
  sydney: {
    id: 'sydney', freePlay: true,
    name: 'Sydney', region: 'Australia', emoji: '🦘',
    population: 5_300_000,
    tagline: 'Harbour views make condo tenants very happy.',
    startMoney: 750_000, costMult: 1.15, rentMult: 1.3,
    fillRate: 1.0, hotelDemand: 1.25, trafficMult: 1.2,
    skyline: { tall: 0.18, maxH: 340, gap: 0.9 },
  },
  toronto: {
    id: 'toronto', freePlay: true,
    name: 'Toronto', region: 'Canada', emoji: '🍁',
    population: 2_800_000,
    tagline: 'Cranes everywhere. Join the condo boom.',
    startMoney: 720_000, costMult: 1.2, rentMult: 1.3,
    fillRate: 1.1, hotelDemand: 1.1, trafficMult: 1.25,
    skyline: { tall: 0.25, maxH: 420, gap: 0.7 },
  },
};

function cityById(id) {
  return CITIES[id] || CITIES.burlington;
}

function campaignCities() {
  return Object.values(CITIES)
    .filter(c => c.campaign && !c.finale)
    .sort((a, b) => a.campaign - b.campaign);
}

function finaleCities() {
  return Object.values(CITIES).filter(c => c.finale);
}

function freePlayCities() {
  return Object.values(CITIES).filter(c => c.freePlay);
}

// Campaign progress lives outside the tower save so finishing a level
// and starting the next one never loses your medals.
const Campaign = {
  KEY: 'skyrise.campaign.v1',

  load() {
    try {
      return JSON.parse(localStorage.getItem(this.KEY)) || { completed: [] };
    } catch { return { completed: [] }; }
  },

  save(prog) {
    try { localStorage.setItem(this.KEY, JSON.stringify(prog)); } catch {}
  },

  isCompleted(cityId) {
    return this.load().completed.includes(cityId);
  },

  complete(cityId) {
    const prog = this.load();
    if (!prog.completed.includes(cityId)) {
      prog.completed.push(cityId);
      this.save(prog);
    }
  },

  // Level N unlocks when level N-1 is done; all finales unlock together
  isUnlocked(city) {
    if (!city.campaign || city.campaign === 1) return true;
    const prog = this.load();
    const needed = city.campaign - 1;
    return Object.values(CITIES).some(c =>
      c.campaign === needed && prog.completed.includes(c.id));
  },

  unlockHint(city) {
    const prev = Object.values(CITIES).find(c => c.campaign === city.campaign - 1 && !c.finale);
    return prev ? `Complete ${prev.name} first` : 'Locked';
  },
};
