'use strict';

let _personSeq = 1;

// Visible agents. Population is tracked statistically on rooms; agents
// exist to make the tower feel alive and to measure real elevator waits.
//
// States: walk → wait → ride → (walk …) → inside → (reverse trip) → gone
class Person {
  constructor(type, floor, x) {
    this.id = _personSeq++;
    this.type = type;              // worker | resident | guest | shopper | visitor
    this.floor = floor;
    this.x = x;                    // world px
    this.state = 'walk';
    this.route = null;             // [{shaftId, from, to}]
    this.legIdx = 0;
    this.legTo = 0;                // current leg destination floor
    this.targetX = x;
    this.destRoom = null;          // Room ref (may be demolished — check!)
    this.destFloor = floor;
    this.destX = x;
    this.afterArrive = 'enter';    // enter | exit
    this.stayUntilMin = 0;         // when 'inside', leave at this time
    this.waitStart = 0;
    this.shaft = null;
    this.car = null;
    this.gone = false;

    this.speed = 60 + Math.random() * 30;   // world px per game-second
    this.tint = Math.random();
    this.bob = Math.random() * 10;
  }

  static COLORS = {
    worker:   '#86b4f0',
    resident: '#8fe0a0',
    guest:    '#f0c876',
    shopper:  '#e096d8',
    visitor:  '#b0b8c8',
  };
  get color() { return Person.COLORS[this.type] || '#cccccc'; }

  // ── Trip setup ────────────────────────────────────────────
  // Returns false if there is no route (caller should not spawn).
  startTrip(tower, destFloor, destX, afterArrive) {
    this.afterArrive = afterArrive;
    this.destFloor = destFloor;
    this.destX = destX;

    if (destFloor === this.floor) {
      this.route = [];
      this.legIdx = 0;
      this.state = 'walk';
      this.targetX = destX;
      return true;
    }

    const route = tower.findRoute(this.floor, destFloor);
    if (!route) return false;
    this.route = route;
    this.legIdx = 0;
    this._walkToLeg(tower);
    return true;
  }

  _walkToLeg(tower) {
    const leg = this.route[this.legIdx];
    const shaft = tower.shafts.get(leg.shaftId);
    if (!shaft) { this.giveUp(tower, true); return; }
    this.state = 'walk';
    this.targetX = shaft.centerX;
  }

  // ── Per-frame update ──────────────────────────────────────
  update(gameDt, tower, time) {
    if (this.gone) return;

    switch (this.state) {
      case 'walk': {
        const step = this.speed * (gameDt / 1000);
        const diff = this.targetX - this.x;
        if (Math.abs(diff) <= step) {
          this.x = this.targetX;
          this._onWalkArrive(tower, time);
        } else {
          this.x += Math.sign(diff) * step;
        }
        break;
      }
      case 'wait': {
        // Lose patience after ~100 game-minutes
        if (time.totalMin - this.waitStart > 100) this.giveUp(tower);
        break;
      }
      case 'ride': {
        if (this.car) {
          this.floor = this.car.floor;
          this.x = this.shaft.centerX;
        }
        break;
      }
      case 'inside': {
        if (time.totalMin >= this.stayUntilMin) this._leaveBuilding(tower);
        break;
      }
    }
  }

  _onWalkArrive(tower, time) {
    // More legs to ride?
    if (this.route && this.legIdx < this.route.length) {
      const leg = this.route[this.legIdx];
      const shaft = tower.shafts.get(leg.shaftId);
      if (!shaft) { this.giveUp(tower, true); return; }
      this.legTo = leg.to;
      this.state = 'wait';
      this.waitStart = time.totalMin;
      this.shaft = shaft;
      shaft.enqueue(this, this.floor);
      return;
    }

    // Final destination reached
    if (this.afterArrive === 'exit') {
      this.gone = true;
    } else {
      // Enter the room (or vanish if it was demolished)
      const room = this.destRoom;
      if (!room || !tower.rooms.has(room.id)) { this._leaveBuilding(tower); return; }
      this.state = 'inside';
    }
  }

  onBoard(shaft, car, time) {
    this.state = 'ride';
    this.shaft = shaft;
    this.car = car;
  }

  onAlight(floor, tower) {
    this.floor = floor;
    this.car = null;
    this.shaft = null;
    this.legIdx++;
    if (this.route && this.legIdx < this.route.length) {
      this._walkToLeg(tower);
    } else {
      this.state = 'walk';
      this.targetX = this.afterArrive === 'exit' ? this.destX
        : (this.destRoom ? this.destRoom.centerX : this.destX);
    }
  }

  _leaveBuilding(tower) {
    this.destRoom = null;
    const exitX = tower.entranceX(this.x);
    if (!this.startTrip(tower, 1, exitX, 'exit')) this.despawnNow();
  }

  giveUp(tower, silent = false) {
    if (this.state === 'wait' && this.shaft) {
      this.shaft.dequeue(this);
      if (!silent) tower.recordComplaint(this.floor);
    }
    this.shaft = null;
    this.car = null;
    this.route = null;
    // Stranded above ground with no elevator — just fade out
    this.despawnNow();
  }

  despawnNow() { this.gone = true; }
}
