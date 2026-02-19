'use strict';

let _roomSeq = 0;

class Room {
  constructor(type, floor, col) {
    this.id    = ++_roomSeq;
    this.type  = type;
    this.floor = floor;    // 1–100 above ground; -1 to -3 underground
    this.col   = col;      // left column (0-based)

    const def  = C.ROOMS[type];
    this.w     = def.w;
    this.h     = def.h;
    this.def   = def;

    // Occupancy
    this.occupancy    = 0;
    this.maxOccupancy = def.capacity;

    // Stress 0–100 (affects rent and population)
    this.stress = 20;

    // Hotel-specific
    this.hotelOccupied = false;

    // For blinking / new-arrival animation
    this.ageTicks = 0;
  }

  get name()     { return this.def.name; }
  get color()    { return this.def.color; }
  get rightCol() { return this.col + this.w - 1; }
  get cost()     { return this.def.cost; }
  get rent()     { return this.def.rent; }

  // How many people this room contributes to population
  get population() {
    switch (this.type) {
      case 'OFFICE':     return this.maxOccupancy;
      case 'CONDO':      return this.maxOccupancy;
      case 'HOTEL_ROOM': return this.hotelOccupied ? this.maxOccupancy : 0;
      default:           return 0;
    }
  }

  // Is the room active / open at a given game-hour?
  isOpen(hour, isWeekend) {
    switch (this.type) {
      case 'LOBBY':        return true;
      case 'OFFICE':       return !isWeekend && hour >= 9 && hour < 18;
      case 'CONDO':        return true;
      case 'HOTEL_ROOM':   return true;
      case 'SHOP':         return hour >= 10 && hour < 20;
      case 'RESTAURANT':   return (hour >= 11 && hour < 14) || (hour >= 18 && hour < 21);
      case 'FAST_FOOD':    return hour >= 7 && hour < 23;
      case 'MEDICAL':      return !isWeekend && hour >= 9 && hour < 17;
      case 'SECURITY':     return true;
      case 'HOUSEKEEPING': return hour >= 8 && hour < 18;
      case 'PARKING':      return true;
      case 'SKY_LOBBY':    return true;
      default:             return true;
    }
  }

  // Quarterly rent the tower collects from this room
  quarterlyIncome(hasHousekeeping) {
    if (this.stress > 80) return 0;   // tenants leave at high stress
    switch (this.type) {
      case 'OFFICE':
      case 'CONDO':
      case 'SHOP':
      case 'FAST_FOOD':
      case 'RESTAURANT':
        return this.def.rent;
      case 'HOTEL_ROOM':
        return (this.hotelOccupied && hasHousekeeping) ? this.def.rent : 0;
      case 'PARKING':
        return this.def.rent;
      default:
        return 0;
    }
  }

  // Stress sources (called each hour)
  updateStress(tower) {
    let delta = 0;

    // Distance from nearest elevator
    const nearestElev = tower.nearestElevatorToRoom(this);
    if (nearestElev === null) {
      if (this.floor !== 1) delta += 2;  // no elevator access!
    } else {
      const dist = nearestElev;
      delta += dist > 10 ? 1 : 0;
    }

    // Services nearby
    if (tower.hasServiceNearFloor(this.floor, 'MEDICAL'))   delta -= 1;
    if (tower.hasServiceNearFloor(this.floor, 'SECURITY'))  delta -= 0.5;
    if (tower.hasServiceNearFloor(this.floor, 'RESTAURANT')) delta -= 0.3;
    if (tower.hasServiceNearFloor(this.floor, 'FAST_FOOD')) delta -= 0.2;

    this.stress = Math.max(0, Math.min(100, this.stress + delta));
    this.ageTicks++;
  }

  // Hotel occupancy randomly changes each day
  updateHotelOccupancy() {
    if (this.type !== 'HOTEL_ROOM') return;
    this.hotelOccupied = Math.random() > 0.35;
  }

  infoText() {
    const lines = [
      `${this.name}`,
      `Floor ${this.floor > 0 ? this.floor : 'B'+Math.abs(this.floor)}  Col ${this.col}`,
      `Stress: ${Math.round(this.stress)}%`,
      `Rent: $${this.def.rent.toLocaleString()}/qtr`,
    ];
    if (this.type === 'HOTEL_ROOM') {
      lines.push(`Occupied: ${this.hotelOccupied ? 'Yes' : 'No'}`);
    }
    return lines.join('\n');
  }
}
