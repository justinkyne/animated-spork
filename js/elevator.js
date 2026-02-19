'use strict';

let _elevSeq = 0;

class Elevator {
  constructor(col, bottomFloor, topFloor, type = 'STANDARD') {
    this.id          = ++_elevSeq;
    this.col         = col;
    this.bottomFloor = bottomFloor;
    this.topFloor    = topFloor;
    this.type        = type;   // 'STANDARD' | 'EXPRESS' | 'SERVICE'

    // Car position (floor number, can be fractional while moving)
    this.carFloor  = bottomFloor;
    this.direction = 0;      // 1=up, -1=down, 0=idle
    this.state     = 'IDLE'; // 'IDLE' | 'MOVING' | 'LOADING'
    this.doorTimer = 0;      // ms remaining with doors open

    // Passengers (Person instances)
    this.passengers    = [];
    this.maxPassengers = C.ELEV_MAX_PASSENGERS;

    // Pending floor requests (Set of floor numbers)
    this.requests = new Set();

    // Waiting queues: floor → [Person, …]
    this.waitingQueues = {};
  }

  // ── basic info ────────────────────────────────────────────
  get floorCount() { return this.topFloor - this.bottomFloor + 1; }
  serves(floor)    { return floor >= this.bottomFloor && floor <= this.topFloor; }

  cost() {
    return C.ELEV_BASE_COST + this.floorCount * C.ELEV_PER_FLOOR;
  }

  // ── external API ─────────────────────────────────────────
  addRequest(floor) {
    if (this.serves(floor)) this.requests.add(floor);
  }

  enqueuePassenger(person) {
    const f = person.floor;
    if (!this.waitingQueues[f]) this.waitingQueues[f] = [];
    this.waitingQueues[f].push(person);
    this.addRequest(f);
  }

  removeFromQueue(person) {
    const q = this.waitingQueues[person.floor];
    if (!q) return;
    const i = q.indexOf(person);
    if (i !== -1) q.splice(i, 1);
  }

  // ── update (called each animation frame) ─────────────────
  update(dtMs) {
    if (this.state === 'LOADING') {
      this.doorTimer -= dtMs;
      if (this.doorTimer <= 0) {
        this.doorTimer = 0;
        this.state = 'IDLE';
      }
      return;
    }

    if (this.state === 'IDLE') {
      this._chooseNextTarget();
    }

    if (this.state === 'MOVING') {
      const spd  = C.ELEV_SPEED * (dtMs / 1000);
      const dest = this._peekTarget();
      if (dest === null) { this.state = 'IDLE'; this.direction = 0; return; }

      const diff = dest - this.carFloor;
      if (Math.abs(diff) <= spd + 0.001) {
        this.carFloor = dest;
        this._arrivedAt(dest);
      } else {
        this.carFloor += spd * this.direction;
      }
    }
  }

  _chooseNextTarget() {
    if (this.requests.size === 0) { this.direction = 0; return; }

    // Find first request in current direction; if none, switch direction
    let target = this._nextInDirection(this.direction);
    if (target === null) {
      this.direction *= -1;
      target = this._nextInDirection(this.direction);
    }
    if (target === null) {
      // Initial direction: pick closest
      let best = null, bestDist = Infinity;
      for (const f of this.requests) {
        const d = Math.abs(f - this.carFloor);
        if (d < bestDist) { bestDist = d; best = f; }
      }
      if (best === null) return;
      target = best;
      this.direction = target > this.carFloor ? 1 : -1;
    }

    this.state = 'MOVING';
  }

  _nextInDirection(dir) {
    if (dir === 0) return null;
    let best = null, bestDist = Infinity;
    for (const f of this.requests) {
      const diff = (f - this.carFloor) * dir;
      if (diff > 0 && diff < bestDist) { bestDist = diff; best = f; }
    }
    return best;
  }

  _peekTarget() {
    return this._nextInDirection(this.direction);
  }

  _arrivedAt(floor) {
    this.requests.delete(floor);
    this.state     = 'LOADING';
    this.doorTimer = 2200; // ms doors stay open

    // Drop off passengers destined for this floor
    const leaving = this.passengers.filter(p => Math.round(p.destFloor) === floor);
    for (const p of leaving) {
      p.exitElevator(floor);
      this.passengers = this.passengers.filter(pp => pp !== p);
    }

    // Pick up people waiting on this floor
    const queue = this.waitingQueues[floor] || [];
    while (queue.length > 0 && this.passengers.length < this.maxPassengers) {
      const p = queue.shift();
      if (!this.serves(p.destFloor)) { queue.unshift(p); break; }
      p.enterElevator(this);
      this.passengers.push(p);
      this.addRequest(p.destFloor);
    }
  }

  // Pixel Y of the car's top edge, relative to building top
  carPixelY() {
    return floorTopY(this.carFloor);
  }
}

// Convert floor number → pixel Y from building top
function floorTopY(floor) {
  if (floor >= 1) {
    return (C.ABOVE - floor) * C.FLOOR_H;
  } else {
    // underground: -1 = B1, -2 = B2, -3 = B3
    return (C.ABOVE + Math.abs(floor) - 1) * C.FLOOR_H;
  }
}
