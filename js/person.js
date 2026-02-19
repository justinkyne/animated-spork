'use strict';

let _personSeq = 0;

const PersonState = {
  IDLE:             'IDLE',
  WALKING:          'WALKING',
  WAITING_ELEVATOR: 'WAITING_ELEVATOR',
  IN_ELEVATOR:      'IN_ELEVATOR',
  AT_DESTINATION:   'AT_DESTINATION',
  LEAVING:          'LEAVING',
};

class Person {
  constructor(type, homeFloor, destFloor, destColCenter) {
    this.id            = ++_personSeq;
    this.type          = type;  // 'WORKER'|'RESIDENT'|'GUEST'|'VISITOR'

    this.homeFloor     = homeFloor;
    this.destFloor     = destFloor;
    this.destColCenter = destColCenter;  // px x of destination room centre

    // Current position in building px space
    this.x     = destColCenter;  // start somewhere on their floor
    this.floor = homeFloor;

    this.state    = PersonState.IDLE;
    this.stress   = 0;
    this.waitTime = 0;

    this.elevator = null;  // Elevator instance while riding
    this._targetElev = null;

    // Walking speed (px/s)
    this.speed = 28 + Math.random() * 16;

    // Colour by type
    const colours = {
      WORKER:   '#5588ff',
      RESIDENT: '#44cc66',
      GUEST:    '#cc8833',
      VISITOR:  '#cc44cc',
    };
    this.color = colours[type] || '#aaaaaa';

    // How long spent at destination before going home
    this.stayDuration = 0;
    this.stayTimer    = 0;
    this.goingHome    = false;
  }

  // ── update (called every frame) ──────────────────────────
  update(dtMs, tower) {
    switch (this.state) {
      case PersonState.IDLE:             this._idle(tower); break;
      case PersonState.WALKING:          this._walk(dtMs, tower); break;
      case PersonState.WAITING_ELEVATOR: this._waitElev(dtMs, tower); break;
      case PersonState.IN_ELEVATOR:      this._inElev(); break;
      case PersonState.AT_DESTINATION:   this._atDest(dtMs, tower); break;
      case PersonState.LEAVING:          this._leaving(dtMs, tower); break;
    }

    // Stress accumulates while waiting for elevator
    if (this.state === PersonState.WAITING_ELEVATOR) {
      this.waitTime += dtMs;
      this.stress = Math.min(100, this.stress + 0.0015 * dtMs);
    } else {
      this.stress = Math.max(0, this.stress - 0.0003 * dtMs);
    }
  }

  // ── state handlers ───────────────────────────────────────
  _idle(tower) {
    this._travelTo(this.destFloor, this.destColCenter, tower);
  }

  _walk(dtMs, tower) {
    const dx = this._walkTargetX - this.x;
    if (Math.abs(dx) < 1.5) {
      this.x = this._walkTargetX;
      // Reached walk target
      if (this._targetElev) {
        // At elevator entrance — start waiting
        this.state = PersonState.WAITING_ELEVATOR;
        this._targetElev.enqueuePassenger(this);
      } else if (this.floor === this.destFloor && !this.goingHome) {
        this.state = PersonState.AT_DESTINATION;
        this.stayTimer = this.stayDuration;
      } else if (this.goingHome && this.floor === this.homeFloor) {
        tower.removePerson(this);
      } else {
        this.state = PersonState.IDLE;
      }
    } else {
      this.x += Math.sign(dx) * this.speed * (dtMs / 1000);
    }
  }

  _waitElev(dtMs, tower) {
    // If elevator never comes, give up after 5 min game-time
    if (this.waitTime > 60_000) {
      this.stress = 100;
      // Try walking again (or just leave)
      if (this._targetElev) this._targetElev.removeFromQueue(this);
      this._targetElev = null;
      tower.removePerson(this);
    }
  }

  _inElev() {
    if (this.elevator) {
      // Snap position to elevator car
      this.floor = this.elevator.carFloor;
      this.x     = this.elevator.col * C.CELL_W + C.CELL_W / 2;
    }
  }

  _atDest(dtMs, tower) {
    // Small random drift
    this.x += (Math.random() - 0.5) * 0.4;
    this.stayTimer -= dtMs;
    if (this.stayTimer <= 0) {
      this.goingHome = true;
      this.state     = PersonState.LEAVING;
      this._travelTo(this.homeFloor, this.homeFloor === 1
        ? (C.COLS / 2 * C.CELL_W) : this.destColCenter, tower);
    }
  }

  _leaving(dtMs, tower) {
    this._walk(dtMs, tower);
  }

  // ── travel helper ────────────────────────────────────────
  _travelTo(targetFloor, targetX, tower) {
    if (this.floor === targetFloor ||
        (Number.isFinite(this.floor) && Math.round(this.floor) === targetFloor)) {
      // Same floor — just walk
      this._targetElev    = null;
      this._walkTargetX   = targetX;
      this.state          = PersonState.WALKING;
      return;
    }

    // Need elevator
    const elev = tower.findElevatorFor(this.x, this.floor, targetFloor);
    if (!elev) {
      // No elevator available — give up
      tower.removePerson(this);
      return;
    }

    this._targetElev  = elev;
    this._walkTargetX = elev.col * C.CELL_W + C.CELL_W / 2;
    this.state        = PersonState.WALKING;
  }

  // ── elevator callbacks ───────────────────────────────────
  enterElevator(elev) {
    this.elevator = elev;
    this.state    = PersonState.IN_ELEVATOR;
    this._targetElev = null;
    this.waitTime = 0;
  }

  exitElevator(floor) {
    this.floor    = Math.round(floor);
    this.elevator = null;

    if (this.goingHome && this.floor === this.homeFloor) {
      this.state = PersonState.LEAVING;
      this._walkTargetX = this.homeFloor === 1
        ? (C.COLS / 2 * C.CELL_W) : this.destColCenter;
    } else if (this.floor === this.destFloor) {
      this._targetElev  = null;
      this._walkTargetX = this.destColCenter;
      this.state        = PersonState.WALKING;
    } else {
      this.state = PersonState.IDLE;
    }
  }
}
