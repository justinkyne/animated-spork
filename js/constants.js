'use strict';

// ─────────────────────────────────────────────────────────────
//  SKYRISE — game configuration
// ─────────────────────────────────────────────────────────────

const C = {
  // Grid geometry (world units are px at zoom 1)
  CELL_W: 9,
  FLOOR_H: 40,
  COLS: 160,
  ABOVE: 100,        // floors 1..100 (floor 1 is the lobby)
  BELOW: 5,          // basement floors -1..-5

  START_MONEY: 750_000,

  // Real milliseconds per game-minute at 1× speed.
  // 1 day = 1440 min → ~2.2 real minutes per day at 1×.
  MS_PER_MIN: 90,
  SPEEDS: [0, 1, 2, 4, 8],
  DAYS_PER_QUARTER: 4,      // rent collected every 4th day
  DAY_NAMES: ['MON', 'TUE', 'WED', 'SUN'],
  SEASONS: ['Spring', 'Summer', 'Autumn', 'Winter'],

  MAX_AGENTS: 320,          // visible simulated people cap
  DEMOLISH_REFUND: 0.4,
  SUPPORT_RATIO: 0.6,       // fraction of a room that must rest on structure
  UNDO_WINDOW_MS: 8_000,    // full-refund undo window after building

  ELEV_W: 3,                // shaft width in cells

  ELEVATORS: {
    STANDARD: {
      name: 'Elevator', base: 40_000, perFloor: 4_000,
      maxSpan: 30, speed: 1.9, capacity: 10, maint: 3_000,
      color: '#c8a23c',
      desc: 'Drag vertically to set its range (max 30 floors). Stops at every floor.',
    },
    EXPRESS: {
      name: 'Express Elevator', base: 120_000, perFloor: 8_000,
      maxSpan: 105, speed: 4.2, capacity: 18, maint: 9_000,
      color: '#d04848',
      desc: 'Fast & high capacity, but only stops at the lobby, basements and Sky Lobbies.',
    },
  },

  // kind: tenant (quarterly rent), commercial (quarterly rent, needs foot
  // traffic), hotel (nightly income), service (quarterly upkeep), special
  ROOMS: {
    OFFICE: {
      name: 'Office', icon: '💼', w: 6, cost: 40_000, unlock: 1,
      kind: 'tenant', rent: 6_000, pop: 6, cat: 'WORKSPACE',
      color: '#39618f', accent: '#7fb2e8',
      desc: 'Reliable quarterly rent. Workers commute weekday mornings and evenings.',
    },
    CONDO: {
      name: 'Condo', icon: '🏠', w: 8, cost: 80_000, unlock: 1,
      kind: 'tenant', rent: 9_000, pop: 3, cat: 'LIVING',
      color: '#3c7d4e', accent: '#8fd9a0',
      desc: 'A family home. Higher floors give better views — and happier tenants.',
    },
    FAST_FOOD: {
      name: 'Fast Food', icon: '🍔', w: 8, cost: 60_000, unlock: 1,
      kind: 'commercial', rent: 8_000, needsPop: 25, noisy: true, cat: 'COMMERCE',
      color: '#b35a1f', accent: '#ffb066',
      desc: 'Pays rent if foot traffic is decent (25+ population). Noisy neighbour.',
    },
    SHOP: {
      name: 'Shop', icon: '🛍️', w: 6, cost: 50_000, unlock: 2,
      kind: 'commercial', rent: 7_000, needsPop: 80, cat: 'COMMERCE',
      color: '#917f24', accent: '#e8d36a',
      desc: 'Boutique retail. Needs 80+ population to stay in business.',
    },
    HOTEL: {
      name: 'Hotel Room', icon: '🛏️', w: 5, cost: 60_000, unlock: 2,
      kind: 'hotel', nightly: 1_500, pop: 2, cat: 'LIVING',
      color: '#8a5a8f', accent: '#d9a8de',
      desc: 'Earns nightly. Rooms get dirty after guests — build Housekeeping!',
    },
    HOUSEKEEPING: {
      name: 'Housekeeping', icon: '🧹', w: 10, cost: 50_000, unlock: 2,
      kind: 'service', maint: 4_000, cleans: 20, cat: 'SERVICES',
      color: '#3e7d80', accent: '#8fd4d8',
      desc: 'Cleans up to 20 hotel rooms per day. Dirty rooms earn nothing.',
    },
    SECURITY: {
      name: 'Security', icon: '🛡️', w: 8, cost: 100_000, unlock: 2,
      kind: 'service', maint: 8_000, cat: 'SERVICES',
      color: '#4a4a8f', accent: '#9a9ae0',
      desc: 'Keeps the tower safe. Boosts everyone\'s mood. Required for ★★★.',
    },
    PARKING: {
      name: 'Parking', icon: '🚗', w: 4, cost: 20_000, unlock: 2,
      kind: 'tenant', rent: 600, pop: 0, floors: 'below', cat: 'SERVICES',
      color: '#555c66', accent: '#9aa4b0',
      desc: 'Basement only. Commuters love it — offices & condos get a mood boost.',
    },
    RESTAURANT: {
      name: 'Restaurant', icon: '🍷', w: 12, cost: 120_000, unlock: 3,
      kind: 'commercial', rent: 15_000, needsPop: 200, noisy: true, cat: 'COMMERCE',
      color: '#8f3039', accent: '#e87f8a',
      desc: 'Fine dining. Needs 200+ population. Tenants love food nearby.',
    },
    SUITE: {
      name: 'Hotel Suite', icon: '👑', w: 10, cost: 150_000, unlock: 3,
      kind: 'hotel', nightly: 4_000, pop: 3, cat: 'LIVING',
      color: '#9f6a2c', accent: '#ecc079',
      desc: 'Luxury rooms with luxury rates. Keep them spotless.',
    },
    SKY_LOBBY: {
      name: 'Sky Lobby', icon: '☁️', w: 20, cost: 150_000, unlock: 3,
      kind: 'service', maint: 0, cat: 'SERVICES',
      color: '#6a7587', accent: '#c4d2e8',
      desc: 'An Express Elevator stop. Place every ~15 floors to build tall.',
    },
    MEDICAL: {
      name: 'Medical Center', icon: '🏥', w: 12, cost: 200_000, unlock: 3,
      kind: 'service', maint: 10_000, cat: 'SERVICES',
      color: '#a83a5a', accent: '#f08aa8',
      desc: 'Healthcare for the whole tower. Required for ★★★★.',
    },
    CINEMA: {
      name: 'Cinema', icon: '🎬', w: 16, cost: 300_000, unlock: 4,
      kind: 'commercial', rent: 40_000, needsPop: 600, noisy: true, cat: 'COMMERCE',
      color: '#5d3a8f', accent: '#b08ae8',
      desc: 'A huge draw. Needs 600+ population to fill the seats.',
    },
    PARTY_HALL: {
      name: 'Party Hall', icon: '🎉', w: 16, cost: 250_000, unlock: 4,
      kind: 'commercial', rent: 30_000, needsPop: 400, noisy: true, cat: 'COMMERCE',
      color: '#a8327a', accent: '#f07ac4',
      desc: 'Weddings, galas, launches. Needs 400+ population.',
    },
    CROWN: {
      name: 'The Crown', icon: '🏆', w: 20, cost: 1_000_000, unlock: 5,
      kind: 'special', minFloor: 50, cat: 'MONUMENT',
      color: '#b89230', accent: '#ffe28a',
      desc: 'A monument at floor 50+. Build it to crown your tower a MEGATOWER.',
    },
  },

  // Sidebar ordering
  CATEGORIES: ['TRANSPORT', 'WORKSPACE', 'LIVING', 'COMMERCE', 'SERVICES', 'MONUMENT', 'TOOLS'],

  // Star rating requirements (checked in order, highest match wins)
  RATINGS: [
    { stars: 1, pop: 0 },
    { stars: 2, pop: 150 },
    { stars: 3, pop: 500,  need: { SECURITY: 1 }, minEval: 45 },
    { stars: 4, pop: 1200, need: { MEDICAL: 1 },  minEval: 50 },
    { stars: 5, pop: 2500, minEval: 55 },
  ],

  // Sky colour stops [hour, hex]
  SKY: [
    [0,  '#050912'], [4.5, '#070d1a'], [6, '#27355e'], [6.8, '#c96a4a'],
    [7.5, '#7fa8d8'], [12, '#6aa1d8'], [16.5, '#7fa8d8'], [18.5, '#d8865a'],
    [19.5, '#8a4a52'], [20.5, '#1c2342'], [22, '#0a1020'], [24, '#050912'],
  ],
};

// World-space Y of the top of a floor. Floors run 1..ABOVE upward and
// -1..-BELOW downward (there is no floor 0); y grows downward.
function floorTopY(f) {
  return f > 0 ? (C.ABOVE - f) * C.FLOOR_H : (C.ABOVE - f - 1) * C.FLOOR_H;
}
function groundY() { return C.ABOVE * C.FLOOR_H; }

function fmt$(n) {
  const neg = n < 0;
  return (neg ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
