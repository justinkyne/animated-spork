'use strict';

class Tower {
  constructor() {
    // rooms: Map<id, Room>
    this.rooms     = new Map();
    // grid: Map<"floor,col", roomId>  — every cell a room occupies
    this.grid      = new Map();
    // elevators: Map<id, Elevator>
    this.elevators = new Map();
    // persons: Map<id, Person>
    this.persons   = new Map();

    this._personSpawnQueue = [];

    // Place the ground-floor lobby automatically
    this._placeLobby();
  }

  // ── Coordinate helpers ────────────────────────────────────
  static floorTopY(floor) { return floorTopY(floor); }  // re-export

  // px-X of left edge of column col
  static colX(col) { return col * C.CELL_W; }

  // ── Grid cell key ─────────────────────────────────────────
  static key(floor, col) { return `${floor},${col}`; }

  // ── Room placement ────────────────────────────────────────
  _placeLobby() {
    const lobbyCol = Math.floor(C.COLS / 2) - 4;  // centred
    const lobby = new Room('LOBBY', 1, lobbyCol);
    this._registerRoom(lobby);
  }

  _registerRoom(room) {
    this.rooms.set(room.id, room);
    for (let c = room.col; c < room.col + room.w; c++) {
      this.grid.set(Tower.key(room.floor, c), room.id);
    }
  }

  canPlace(type, floor, col) {
    const def = C.ROOMS[type];
    if (!def) return { ok: false, reason: 'Unknown room type.' };

    // Floor constraints
    if (def.floors === 'ground' && floor !== 1)
      return { ok: false, reason: 'Must be placed on floor 1 (ground).' };
    if (def.floors === 'above' && floor < 1)
      return { ok: false, reason: 'Must be placed above ground.' };
    if (def.floors === 'below' && floor >= 1)
      return { ok: false, reason: 'Underground floors only (B1–B3).' };

    // Column bounds
    if (col < 0 || col + def.w > C.COLS)
      return { ok: false, reason: 'Out of building bounds.' };

    // Floor bounds
    if (floor > C.ABOVE || floor < -C.BELOW)
      return { ok: false, reason: 'Floor out of range.' };

    // Overlap check
    for (let c = col; c < col + def.w; c++) {
      if (this.grid.has(Tower.key(floor, c)))
        return { ok: false, reason: 'Space already occupied.' };
    }

    return { ok: true };
  }

  placeRoom(type, floor, col) {
    const check = this.canPlace(type, floor, col);
    if (!check.ok) return { ok: false, reason: check.reason };

    const room = new Room(type, floor, col);
    this._registerRoom(room);

    // Spawn initial population
    this._schedulePopulation(room);

    return { ok: true, room };
  }

  demolish(floor, col) {
    const id = this.grid.get(Tower.key(floor, col));
    if (!id) return false;

    const room = this.rooms.get(id);
    if (!room) return false;

    // Remove from grid
    for (let c = room.col; c < room.col + room.w; c++) {
      this.grid.delete(Tower.key(room.floor, c));
    }
    this.rooms.delete(id);
    return true;
  }

  getRoomAt(floor, col) {
    const id = this.grid.get(Tower.key(floor, col));
    return id ? this.rooms.get(id) : null;
  }

  // ── Elevator placement ────────────────────────────────────
  canPlaceElevator(col, bottomFloor, topFloor) {
    if (col < 0 || col >= C.COLS)
      return { ok: false, reason: 'Column out of bounds.' };
    if (bottomFloor >= topFloor)
      return { ok: false, reason: 'Elevator must span at least 2 floors.' };
    if (topFloor > C.ABOVE || bottomFloor < -C.BELOW)
      return { ok: false, reason: 'Floor out of range.' };

    // Check for existing elevator at this column with overlapping range
    for (const e of this.elevators.values()) {
      if (e.col === col && !(topFloor < e.bottomFloor || bottomFloor > e.topFloor))
        return { ok: false, reason: 'Elevator shaft already exists here.' };
    }
    return { ok: true };
  }

  placeElevator(col, bottomFloor, topFloor, type = 'STANDARD') {
    const check = this.canPlaceElevator(col, bottomFloor, topFloor);
    if (!check.ok) return { ok: false, reason: check.reason };

    const elev = new Elevator(col, bottomFloor, topFloor, type);
    this.elevators.set(elev.id, elev);
    return { ok: true, elevator: elev };
  }

  demolishElevator(id) {
    return this.elevators.delete(id);
  }

  // Find elevator column + room id at a canvas position
  getElevatorAt(col) {
    for (const e of this.elevators.values()) {
      if (e.col === col) return e;
    }
    return null;
  }

  // ── Person management ────────────────────────────────────
  _schedulePopulation(room) {
    // Immediately add people for new rooms
    const count = room.maxOccupancy;
    if (count <= 0) return;

    for (let i = 0; i < count; i++) {
      let type;
      switch (room.type) {
        case 'OFFICE': type = 'WORKER'; break;
        case 'CONDO':  type = 'RESIDENT'; break;
        case 'HOTEL_ROOM': type = 'GUEST'; break;
        default: return;
      }

      const stayMs = this._stayDuration(room.type);
      const centerX = (room.col + room.w / 2) * C.CELL_W;
      const p = new Person(type, 1, room.floor, centerX);
      p.stayDuration = stayMs;
      this._personSpawnQueue.push(p);
    }
  }

  _stayDuration(roomType) {
    // ms of in-game time at destination before going home
    switch (roomType) {
      case 'OFFICE':     return 60_000 * 9;  // ~9 hours at 1x
      case 'CONDO':      return 60_000 * 14;
      case 'HOTEL_ROOM': return 60_000 * 20;
      default:           return 60_000 * 2;
    }
  }

  flushSpawnQueue(limit = 5) {
    let spawned = 0;
    while (this._personSpawnQueue.length > 0 && spawned < limit) {
      const p = this._personSpawnQueue.shift();
      this.persons.set(p.id, p);
      spawned++;
    }
  }

  removePerson(person) {
    this.persons.delete(person.id);
  }

  // ── Pathfinding helpers ───────────────────────────────────
  findElevatorFor(px, fromFloor, toFloor) {
    let best = null, bestScore = Infinity;
    for (const e of this.elevators.values()) {
      if (!e.serves(fromFloor) || !e.serves(toFloor)) continue;
      const ex = e.col * C.CELL_W;
      const dist = Math.abs(px - ex);
      const score = dist + e.passengers.length * 80;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  nearestElevatorToRoom(room) {
    if (room.floor === 1) return 0; // lobby floor, no elevator needed
    let minDist = null;
    const cx = (room.col + room.w / 2) * C.CELL_W;
    for (const e of this.elevators.values()) {
      if (!e.serves(room.floor)) continue;
      const ex = e.col * C.CELL_W;
      const dist = Math.abs(cx - ex) / C.CELL_W;
      if (minDist === null || dist < minDist) minDist = dist;
    }
    return minDist;
  }

  hasServiceNearFloor(floor, serviceType) {
    for (const r of this.rooms.values()) {
      if (r.type === serviceType && Math.abs(r.floor - floor) <= 10) return true;
    }
    return false;
  }

  // ── Stats ────────────────────────────────────────────────
  get population() {
    let pop = 0;
    for (const r of this.rooms.values()) pop += r.population;
    return pop;
  }

  get roomCount() {
    return this.rooms.size;
  }

  countRooms(type) {
    let n = 0;
    for (const r of this.rooms.values()) if (r.type === type) n++;
    return n;
  }

  hasHousekeeping() {
    return this.countRooms('HOUSEKEEPING') > 0;
  }

  quarterlyIncome() {
    const hk = this.hasHousekeeping();
    let income = 0;
    for (const r of this.rooms.values()) income += r.quarterlyIncome(hk);
    return income;
  }

  // ── Tick (hourly) ─────────────────────────────────────────
  hourTick(gameTime) {
    for (const r of this.rooms.values()) r.updateStress(this);
  }

  dayTick(gameTime) {
    for (const r of this.rooms.values()) r.updateHotelOccupancy();
  }

  // ── Update loop ───────────────────────────────────────────
  update(dtMs, gameTime) {
    // Spawn queued persons (throttled)
    this.flushSpawnQueue(3);

    // Update elevators
    for (const e of this.elevators.values()) e.update(dtMs);

    // Update persons
    for (const p of this.persons.values()) p.update(dtMs, this);
  }
}
