'use strict';

const C = {
  // Grid
  CELL_W: 8,      // px per grid column
  FLOOR_H: 36,    // px per floor
  COLS: 200,      // total building columns (0–199)
  ABOVE: 100,     // floors above ground (floor 1–100)
  BELOW: 3,       // underground floors (B1–B3)

  // Building px dimensions
  get BUILDING_W() { return this.COLS * this.CELL_W; },        // 1600
  get TOTAL_FLOORS() { return this.ABOVE + this.BELOW; },       // 103
  get BUILDING_H() { return this.TOTAL_FLOORS * this.FLOOR_H; }, // 3708

  // Finance
  START_MONEY: 2_000_000,

  // Speed: real milliseconds per game-minute at 1× speed
  // 1 game-day = 24 h × 60 min = 1440 game-min
  // At 120 ms/game-min  →  1 day ≈ 2.9 min real time
  BASE_MS_PER_MIN: 120,

  // Room definitions
  ROOMS: {
    LOBBY: {
      name: 'Lobby', w: 8, h: 1,
      cost: 0, rent: 0, capacity: 0,
      floors: 'ground',
      desc: 'Main entrance — auto-placed at start.',
      color: '#888888',
    },
    OFFICE: {
      name: 'Office', w: 4, h: 1,
      cost: 50_000, rent: 2_000, capacity: 1,
      floors: 'above',
      desc: 'Generates quarterly rent. Workers 9 AM–6 PM weekdays.',
      color: '#3a6daa',
    },
    CONDO: {
      name: 'Condo', w: 8, h: 1,
      cost: 120_000, rent: 5_000, capacity: 2,
      floors: 'above',
      desc: 'Residential. Tenants pay quarterly rent.',
      color: '#3a9a50',
    },
    HOTEL_ROOM: {
      name: 'Hotel Room', w: 4, h: 1,
      cost: 80_000, rent: 3_000, capacity: 2,
      floors: 'above',
      desc: 'Nightly income. Requires Housekeeping every 50 rooms.',
      color: '#b87020',
    },
    SHOP: {
      name: 'Shop', w: 8, h: 1,
      cost: 100_000, rent: 4_000, capacity: 5,
      floors: 'above',
      desc: 'Open 10 AM–8 PM. Attracts customers.',
      color: '#aaaa20',
    },
    RESTAURANT: {
      name: 'Restaurant', w: 16, h: 1,
      cost: 300_000, rent: 10_000, capacity: 20,
      floors: 'above',
      desc: 'Busy at lunch and dinner. Reduces tenant stress.',
      color: '#aa3030',
    },
    FAST_FOOD: {
      name: 'Fast Food', w: 8, h: 1,
      cost: 150_000, rent: 5_000, capacity: 10,
      floors: 'above',
      desc: 'Open 7 AM–11 PM. Quick meal option.',
      color: '#cc6010',
    },
    MEDICAL: {
      name: 'Medical Ctr', w: 16, h: 1,
      cost: 500_000, rent: 0, capacity: 0,
      floors: 'above',
      desc: 'Reduces stress of all tenants. Required for ★★★★.',
      color: '#cc2060',
    },
    SECURITY: {
      name: 'Security', w: 8, h: 1,
      cost: 200_000, rent: 0, capacity: 0,
      floors: 'above',
      desc: 'Reduces crime and stress. Required for ★★★.',
      color: '#5030a0',
    },
    HOUSEKEEPING: {
      name: 'Housekeeping', w: 8, h: 1,
      cost: 150_000, rent: 0, capacity: 0,
      floors: 'above',
      desc: 'One per 50 hotel rooms. Required for hotel income.',
      color: '#1090a0',
    },
    PARKING: {
      name: 'Parking', w: 4, h: 1,
      cost: 30_000, rent: 1_000, capacity: 2,
      floors: 'below',
      desc: 'Underground only. Reduces condo tenant stress.',
      color: '#606060',
    },
    SKY_LOBBY: {
      name: 'Sky Lobby', w: 8, h: 1,
      cost: 200_000, rent: 0, capacity: 0,
      floors: 'above',
      desc: 'Required for Express Elevators. Every 15 floors.',
      color: '#707080',
    },
  },

  // Elevator cost: base + per-floor
  ELEV_BASE_COST: 50_000,
  ELEV_PER_FLOOR: 10_000,
  ELEV_MAX_PASSENGERS: 6,
  ELEV_SPEED: 2.5,   // floors per second

  // Rating thresholds [min population, label, stars]
  RATINGS: [
    { pop: 0,      label: '★',               stars: 1 },
    { pop: 300,    label: '★★',              stars: 2 },
    { pop: 1000,   label: '★★★',             stars: 3 },
    { pop: 5000,   label: '★★★★',            stars: 4 },
    { pop: 10000,  label: '★★★★★  TOWER',    stars: 5 },
  ],

  // Sky colour stops [hour, hex]
  SKY: [
    [0,  '#02060f'],
    [5,  '#0a1525'],
    [6,  '#1a3560'],
    [7,  '#ff8844'],
    [8,  '#5599dd'],
    [12, '#4488cc'],
    [17, '#5599dd'],
    [19, '#ff6633'],
    [20, '#cc3322'],
    [21, '#551122'],
    [22, '#0a1525'],
    [24, '#02060f'],
  ],
};
