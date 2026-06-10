'use strict';

class Tower {
  constructor() {
    this.rooms = new Map();        // id -> Room
    this.grid = new Map();         // "floor,col" -> roomId
    this.shafts = new Map();       // id -> ElevatorShaft
    this.persons = new Map();      // id -> Person

    this.netVersion = 0;           // bumped when transport network changes
    this._routeCache = new Map();
    this._routeCacheVersion = -1;

    this.complaints = new Map();   // floor -> elevator complaint score
    this._extent = null;           // cached {minCol, maxCol}
    this._skyLobbyFloors = new Set();
    this._counts = {};
    this._foodFloors = [];
  }

  static key(floor, col) { return `${floor},${col}`; }

  // ── Extent / lobby geometry ───────────────────────────────
  get extent() {
    if (this._extent) return this._extent;
    let min = Infinity, max = -Infinity;
    for (const r of this.rooms.values()) {
      if (r.col < min) min = r.col;
      if (r.col + r.w > max) max = r.col + r.w;
    }
    for (const s of this.shafts.values()) {
      if (s.col < min) min = s.col;
      if (s.col + C.ELEV_W > max) max = s.col + C.ELEV_W;
    }
    if (min === Infinity) {  // empty tower: default pad in the middle
      min = Math.floor(C.COLS / 2) - 12;
      max = Math.floor(C.COLS / 2) + 12;
    }
    this._extent = {
      minCol: Math.max(0, min - 3),
      maxCol: Math.min(C.COLS, max + 3),
    };
    return this._extent;
  }

  get lobbyLeftX()  { return this.extent.minCol * C.CELL_W; }
  get lobbyRightX() { return this.extent.maxCol * C.CELL_W; }

  // Nearest building entrance (lobby edge) to a given x
  entranceX(x) {
    const l = this.lobbyLeftX + 4, r = this.lobbyRightX - 4;
    return Math.abs(x - l) < Math.abs(x - r) ? l : r;
  }

  _dirty() {
    this._extent = null;
  }

  // ── Placement rules ───────────────────────────────────────
  canPlace(type, floor, col) {
    const def = C.ROOMS[type];
    if (!def) return { ok: false, reason: 'Unknown room type.' };

    if (floor === 0) return { ok: false, reason: 'There is no floor 0.' };
    if (floor === 1) return { ok: false, reason: 'Floor 1 is the lobby — build above or below it.' };
    if (def.floors === 'below' && floor > 0)
      return { ok: false, reason: `${def.name} goes in the basement (B1–B${C.BELOW}).` };
    if (def.floors !== 'below' && floor < 0)
      return { ok: false, reason: `${def.name} can\'t be built underground.` };
    if (def.minFloor && floor < def.minFloor)
      return { ok: false, reason: `${def.name} must be built on floor ${def.minFloor} or higher.` };
    if (floor > C.ABOVE || floor < -C.BELOW)
      return { ok: false, reason: 'Floor out of range.' };
    if (col < 0 || col + def.w > C.COLS)
      return { ok: false, reason: 'Out of buildable land.' };

    for (let c = col; c < col + def.w; c++) {
      if (this.grid.has(Tower.key(floor, c)))
        return { ok: false, reason: 'Space already occupied.' };
      if (this.shaftAtCell(floor, c))
        return { ok: false, reason: 'An elevator shaft is in the way.' };
    }
    return { ok: true };
  }

  placeRoom(type, floor, col, nowMin = 0) {
    const check = this.canPlace(type, floor, col);
    if (!check.ok) return check;

    const room = new Room(type, floor, col);
    room.builtAtMin = nowMin;
    this.rooms.set(room.id, room);
    for (let c = col; c < col + room.w; c++) {
      this.grid.set(Tower.key(floor, c), room.id);
    }
    if (type === 'SKY_LOBBY') {
      this._skyLobbyFloors.add(floor);
      this.netVersion++;
    }
    this._dirty();
    return { ok: true, room };
  }

  demolishRoom(room) {
    if (!this.rooms.has(room.id)) return false;
    for (let c = room.col; c < room.col + room.w; c++) {
      this.grid.delete(Tower.key(room.floor, c));
    }
    this.rooms.delete(room.id);
    if (room.type === 'SKY_LOBBY') {
      this._skyLobbyFloors.delete(room.floor);
      // another sky lobby may still exist on this floor
      for (const r of this.rooms.values()) {
        if (r.type === 'SKY_LOBBY') this._skyLobbyFloors.add(r.floor);
      }
      this.netVersion++;
    }
    this._dirty();
    return true;
  }

  getRoomAt(floor, col) {
    const id = this.grid.get(Tower.key(floor, col));
    return id ? this.rooms.get(id) : null;
  }

  hasSkyLobby(floor) { return this._skyLobbyFloors.has(floor); }

  // ── Elevators ─────────────────────────────────────────────
  canPlaceShaft(type, col, bottom, top) {
    const def = C.ELEVATORS[type];
    if (col < 0 || col + C.ELEV_W > C.COLS)
      return { ok: false, reason: 'Out of buildable land.' };
    if (bottom === top)
      return { ok: false, reason: 'Drag vertically — an elevator needs at least 2 floors.' };
    if (top > C.ABOVE || bottom < -C.BELOW)
      return { ok: false, reason: 'Floor out of range.' };
    if (top - bottom > def.maxSpan)
      return { ok: false, reason: `${def.name} can span at most ${def.maxSpan} floors.` };

    for (const s of this.shafts.values()) {
      const overlapCols = !(col + C.ELEV_W <= s.col || col >= s.col + C.ELEV_W);
      const overlapFloors = !(top < s.bottom || bottom > s.top);
      if (overlapCols && overlapFloors)
        return { ok: false, reason: 'Overlaps an existing shaft.' };
    }
    // Rooms in the way?
    for (let f = bottom; f <= top; f++) {
      if (f === 0 || f === 1) continue;   // pass through lobby freely
      for (let c = col; c < col + C.ELEV_W; c++) {
        if (this.grid.has(Tower.key(f, c)))
          return { ok: false, reason: `A room is in the way on floor ${f}.` };
      }
    }
    return { ok: true };
  }

  placeShaft(type, col, bottom, top) {
    const check = this.canPlaceShaft(type, col, bottom, top);
    if (!check.ok) return check;
    const shaft = new ElevatorShaft(type, col, bottom, top);
    this.shafts.set(shaft.id, shaft);
    this.netVersion++;
    this._dirty();
    return { ok: true, shaft };
  }

  demolishShaft(shaft) {
    if (!this.shafts.has(shaft.id)) return false;
    shaft.evacuate(this);
    this.shafts.delete(shaft.id);
    this.netVersion++;
    this._dirty();
    return true;
  }

  shaftAtCell(floor, col) {
    for (const s of this.shafts.values()) {
      if (col >= s.col && col < s.col + C.ELEV_W && s.inRange(floor)) return s;
    }
    return null;
  }

  // ── Routing (BFS over floors via shafts, max 3 legs) ──────
  findRoute(fromFloor, toFloor) {
    if (fromFloor === toFloor) return [];
    if (this._routeCacheVersion !== this.netVersion) {
      this._routeCache.clear();
      this._routeCacheVersion = this.netVersion;
    }
    const key = `${fromFloor}|${toFloor}`;
    if (this._routeCache.has(key)) return this._routeCache.get(key);

    const prev = new Map([[fromFloor, null]]);
    const queue = [fromFloor];
    while (queue.length) {
      const f = queue.shift();
      if (f === toFloor) break;
      for (const s of this.shafts.values()) {
        if (!s.servesFloor(f, this)) continue;
        for (let g = s.bottom; g <= s.top; g++) {
          if (g === 0 || g === f || prev.has(g)) continue;
          if (!s.servesFloor(g, this)) continue;
          prev.set(g, { from: f, shaft: s });
          queue.push(g);
        }
      }
    }

    let route = null;
    if (prev.has(toFloor)) {
      route = [];
      let cur = toFloor;
      while (prev.get(cur)) {
        const e = prev.get(cur);
        route.unshift({ shaftId: e.shaft.id, from: e.from, to: cur });
        cur = e.from;
      }
      if (route.length > 3) route = null;   // too many transfers
    }
    this._routeCache.set(key, route);
    return route;
  }

  hasAccess(floor) {
    return floor === 1 || this.findRoute(1, floor) !== null;
  }

  // ── Agents ────────────────────────────────────────────────
  spawnVisitor(type, destRoom, stayMin, time) {
    if (this.persons.size >= C.MAX_AGENTS) return null;
    if (!this.hasAccess(destRoom.floor)) return null;
    const p = new Person(type, 1, this.entranceX(destRoom.centerX));
    p.destRoom = destRoom;
    p.stayUntilMin = time.totalMin + stayMin;
    if (!p.startTrip(this, destRoom.floor, destRoom.centerX, 'enter')) return null;
    this.persons.set(p.id, p);
    return p;
  }

  // Someone already in a room heads for the street
  spawnLeaver(type, fromRoom, time) {
    if (this.persons.size >= C.MAX_AGENTS) return null;
    const p = new Person(type, fromRoom.floor, fromRoom.centerX);
    if (!p.startTrip(this, 1, this.entranceX(fromRoom.centerX), 'exit')) return null;
    this.persons.set(p.id, p);
    return p;
  }

  recordComplaint(floor) {
    this.complaints.set(floor, (this.complaints.get(floor) || 0) + 1);
  }

  decayComplaints() {
    for (const [f, v] of this.complaints) {
      const nv = v * 0.5;
      if (nv < 0.3) this.complaints.delete(f);
      else this.complaints.set(f, nv);
    }
  }

  // ── Evaluation (tenant mood) ──────────────────────────────
  computeEval(room) {
    if (room.floor !== 1 && !this.hasAccess(room.floor)) {
      room.noAccess = true;
      return 0;
    }
    room.noAccess = false;

    let score = 70;
    const route = this.findRoute(1, room.floor) || [];
    score -= (route.length > 1 ? (route.length - 1) * 8 : 0);

    // Elevator wait + walking distance to the best serving shaft
    let bestWait = null, bestDist = null;
    for (const s of this.shafts.values()) {
      if (!s.servesFloor(room.floor, this)) continue;
      const dist = Math.abs(room.centerX - s.centerX) / C.CELL_W;
      if (bestDist === null || dist < bestDist) bestDist = dist;
      if (bestWait === null || s.avgWait < bestWait) bestWait = s.avgWait;
    }
    if (bestWait !== null) score -= Math.min(25, bestWait * 0.9);
    if (bestDist !== null) score -= Math.min(12, bestDist / 8);
    score -= Math.min(15, (this.complaints.get(room.floor) || 0) * 2);

    // Noisy neighbours on the same floor within a few cells
    for (const r of this.rooms.values()) {
      if (r.floor !== room.floor || r === room || !r.def.noisy) continue;
      const gap = Math.max(r.col - (room.col + room.w), room.col - (r.col + r.w));
      if (gap <= 3) { score -= 10; break; }
    }

    // Perks
    if (this._counts.SECURITY) score += 5;
    if (this._counts.MEDICAL) score += 5;
    if (this._foodFloors.some(f => Math.abs(f - room.floor) <= 8)) score += 8;
    if ((room.type === 'OFFICE' || room.type === 'CONDO') && this._counts.PARKING) score += 4;
    if (room.type === 'CONDO') score += Math.min(10, room.floor / 10);

    return clamp(score, 2, 100);
  }

  // Cache global facts once per eval pass
  _refreshFacts() {
    this._counts = {};
    this._foodFloors = [];
    for (const r of this.rooms.values()) {
      this._counts[r.type] = (this._counts[r.type] || 0) + 1;
      if ((r.type === 'FAST_FOOD' || r.type === 'RESTAURANT') && r.occupied)
        this._foodFloors.push(r.floor);
    }
  }

  evalPass() {
    this._refreshFacts();
    for (const r of this.rooms.values()) {
      if (r.kind === 'service' || r.kind === 'special') continue;
      r.eval = this.computeEval(r);
    }
  }

  // ── Stats ─────────────────────────────────────────────────
  get population() {
    let pop = 0;
    for (const r of this.rooms.values()) pop += r.population;
    return pop;
  }

  countRooms(type, occupiedOnly = false) {
    let n = 0;
    for (const r of this.rooms.values()) {
      if (r.type === type && (!occupiedOnly || r.occupied)) n++;
    }
    return n;
  }

  avgEval() {
    let sum = 0, n = 0;
    for (const r of this.rooms.values()) {
      if (r.kind === 'service' || r.kind === 'special') continue;
      if (!r.occupied) continue;
      sum += r.eval; n++;
    }
    return n === 0 ? 70 : sum / n;
  }

  housekeepingCapacity() {
    return this.countRooms('HOUSEKEEPING') * C.ROOMS.HOUSEKEEPING.cleans;
  }

  // ── Per-frame update ──────────────────────────────────────
  update(gameDt, time) {
    for (const s of this.shafts.values()) s.update(gameDt, this, time);
    for (const p of this.persons.values()) {
      p.update(gameDt, this, time);
      if (p.gone) this.persons.delete(p.id);
    }
  }

  // ── Save / load ───────────────────────────────────────────
  serialize() {
    return {
      rooms: [...this.rooms.values()].map(r => r.serialize()),
      shafts: [...this.shafts.values()].map(s => s.serialize()),
    };
  }

  static deserialize(d) {
    const t = new Tower();
    for (const rd of d.rooms || []) {
      const r = Room.deserialize(rd);
      t.rooms.set(r.id, r);
      for (let c = r.col; c < r.col + r.w; c++) {
        t.grid.set(Tower.key(r.floor, c), r.id);
      }
      if (r.type === 'SKY_LOBBY') t._skyLobbyFloors.add(r.floor);
    }
    for (const sd of d.shafts || []) {
      const s = ElevatorShaft.deserialize(sd);
      t.shafts.set(s.id, s);
    }
    t.netVersion++;
    t._refreshFacts();
    return t;
  }
}
