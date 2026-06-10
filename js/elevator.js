'use strict';

let _shaftSeq = 1;

class ElevatorShaft {
  constructor(type, col, bottom, top) {
    this.id = _shaftSeq++;
    this.type = type;            // STANDARD | EXPRESS
    this.col = col;              // left column; C.ELEV_W cells wide
    this.bottom = bottom;
    this.top = top;

    // One car per ~12 floors of span, max 3
    const n = clamp(1 + Math.floor(this.span / 12), 1, 3);
    this.cars = [];
    for (let i = 0; i < n; i++) {
      this.cars.push({
        floor: bottom + Math.floor((this.span * i) / n),
        target: null,
        doorT: 0,            // game-ms doors remain open
        passengers: [],
      });
    }

    this.waiting = new Map();    // floor -> Person[]
    this.claims = new Map();     // floor -> car index (pickup claims)
    this.avgWait = 4;            // rolling average wait, game-minutes
  }

  get def()  { return C.ELEVATORS[this.type]; }
  get span() { return this.top - this.bottom; }
  get centerX() { return (this.col + C.ELEV_W / 2) * C.CELL_W; }

  cost() { return this.def.base + this.def.perFloor * this.span; }

  inRange(floor) {
    if (floor < this.bottom || floor > this.top) return false;
    if (floor === 0) return false;
    return true;
  }

  // Express elevators only stop at lobby, basements, sky lobbies & endpoints
  servesFloor(floor, tower) {
    if (!this.inRange(floor)) return false;
    if (this.type !== 'EXPRESS') return true;
    return floor === 1 || floor < 0 || floor === this.bottom ||
           floor === this.top || tower.hasSkyLobby(floor);
  }

  enqueue(person, floor) {
    if (!this.waiting.has(floor)) this.waiting.set(floor, []);
    this.waiting.get(floor).push(person);
  }

  dequeue(person) {
    const q = this.waiting.get(person.floor);
    if (!q) return;
    const i = q.indexOf(person);
    if (i >= 0) q.splice(i, 1);
    if (q.length === 0) this.waiting.delete(person.floor);
  }

  queueIndex(person) {
    const q = this.waiting.get(person.floor);
    return q ? q.indexOf(person) : 0;
  }

  totalPassengers() {
    return this.cars.reduce((s, c) => s + c.passengers.length, 0);
  }

  _waitingFloors(exceptCarIdx) {
    const floors = [];
    for (const [f, q] of this.waiting) {
      if (q.length === 0) continue;
      const claim = this.claims.get(f);
      if (claim !== undefined && claim !== exceptCarIdx) continue;
      floors.push(f);
    }
    return floors;
  }

  _pickTarget(car, idx) {
    const cands = new Set(car.passengers.map(p => p.legTo));
    for (const f of this._waitingFloors(idx)) {
      if (car.passengers.length < this.def.capacity) cands.add(f);
    }
    let best = null, bestDist = Infinity;
    for (const f of cands) {
      const d = Math.abs(f - car.floor);
      if (d < bestDist) { bestDist = d; best = f; }
    }
    return best;
  }

  update(gameDt, tower, time) {
    const dtSec = gameDt / 1000;

    this.cars.forEach((car, idx) => {
      // Doors open: count down, then continue
      if (car.doorT > 0) {
        car.doorT -= gameDt;
        if (car.doorT > 0) return;
        car.doorT = 0;
      }

      // Choose a target if we don't have one
      if (car.target === null) {
        car.target = this._pickTarget(car, idx);
        if (car.target === null) return;        // idle
        if (this.waiting.has(car.target)) this.claims.set(car.target, idx);
      }

      // Move toward target
      const step = this.def.speed * dtSec;
      const diff = car.target - car.floor;
      if (Math.abs(diff) <= step) {
        // Arrived
        car.floor = car.target;
        car.target = null;
        this.claims.delete(car.floor);
        this._exchange(car, tower, time);
        car.doorT = 1400;                       // dwell with doors open
      } else {
        car.floor += Math.sign(diff) * step;
      }
    });
  }

  _exchange(car, tower, time) {
    const floor = Math.round(car.floor);

    // Alight
    for (let i = car.passengers.length - 1; i >= 0; i--) {
      const p = car.passengers[i];
      if (p.legTo === floor) {
        car.passengers.splice(i, 1);
        p.onAlight(floor, tower);
      }
    }

    // Board (FIFO)
    const q = this.waiting.get(floor);
    if (q) {
      while (q.length > 0 && car.passengers.length < this.def.capacity) {
        const p = q.shift();
        car.passengers.push(p);
        p.onBoard(this, car, time);
        const waited = time.totalMin - p.waitStart;
        this.avgWait = lerp(this.avgWait, waited, 0.12);
      }
      if (q.length === 0) this.waiting.delete(floor);
    }
  }

  // Drop everyone when the shaft is demolished
  evacuate(tower) {
    for (const car of this.cars) {
      for (const p of car.passengers) p.despawnNow();
      car.passengers.length = 0;
    }
    for (const q of this.waiting.values()) {
      for (const p of q) p.giveUp(tower, true);
    }
    this.waiting.clear();
  }

  serialize() {
    return { t: this.type, c: this.col, b: this.bottom, p: this.top };
  }

  static deserialize(d) {
    return new ElevatorShaft(d.t, d.c, d.b, d.p);
  }
}
