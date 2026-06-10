'use strict';

let _roomSeq = 1;

class Room {
  constructor(type, floor, col) {
    this.id = _roomSeq++;
    this.type = type;
    this.floor = floor;
    this.col = col;

    this.occupied = false;     // tenant / business moved in
    this.eval = 70;            // 0..100 mood of the occupant
    this.noAccess = false;     // unreachable by elevator
    this.struggling = false;   // commercial without enough foot traffic
    this.builtAtMin = 0;       // for construction shimmer

    // Hotel state
    this.dirty = false;
    this.guestsTonight = 0;

    this.variant = Math.floor(Math.random() * 3);  // visual variety
  }

  get def()  { return C.ROOMS[this.type]; }
  get w()    { return this.def.w; }
  get kind() { return this.def.kind; }
  get name() { return this.def.name; }

  get centerX() { return (this.col + this.w / 2) * C.CELL_W; }

  get population() {
    if (this.kind === 'hotel') return this.guestsTonight;
    return this.occupied ? (this.def.pop || 0) : 0;
  }

  // Quarterly rent paid on rent day (hotels earn nightly instead)
  quarterlyRent() {
    if (!this.occupied || this.struggling) return 0;
    return this.def.rent || 0;
  }

  quarterlyUpkeep() {
    return this.def.maint || 0;
  }

  get moodColor() {
    if (this.noAccess) return '#ff6b6b';
    if (this.eval >= 60) return '#6fe08f';
    if (this.eval >= 35) return '#ffce54';
    return '#ff6b6b';
  }

  serialize() {
    return {
      t: this.type, f: this.floor, c: this.col,
      o: this.occupied ? 1 : 0, e: Math.round(this.eval),
      d: this.dirty ? 1 : 0, v: this.variant,
    };
  }

  static deserialize(d) {
    const r = new Room(d.t, d.f, d.c);
    r.occupied = !!d.o;
    r.eval = d.e ?? 70;
    r.dirty = !!d.d;
    r.variant = d.v ?? 0;
    return r;
  }
}
