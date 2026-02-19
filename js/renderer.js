'use strict';

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');

    // Camera offset in building-space px
    this.camX = 0;
    this.camY = 0;

    // Ghost preview for building placement
    this.ghost = null;  // { type, floor, col } or null

    // Highlight a clicked room
    this.selectedRoom = null;

    // Elevator drag preview
    this.elevDrag = null;  // { col, startFloor, endFloor }

    // Pre-built gradient stops cache
    this._gradCache = null;
    this._gradCacheKey = '';

    this.resize();
  }

  // ── canvas sizing ──────────────────────────────────────────
  resize() {
    this.canvas.width  = this.canvas.offsetWidth  || window.innerWidth - 140;
    this.canvas.height = this.canvas.offsetHeight || window.innerHeight - 80;
    this.w = this.canvas.width;
    this.h = this.canvas.height;
  }

  // Centre camera on floor 1 at start
  centreOnGround() {
    this.camX = (C.BUILDING_W - this.w) / 2;
    this.camY = floorTopY(1) - this.h * 0.78;
    this._clampCamera();
  }

  _clampCamera() {
    const maxX = C.BUILDING_W - this.w;
    const maxY = C.BUILDING_H - this.h;
    this.camX = Math.max(0, Math.min(maxX, this.camX));
    this.camY = Math.max(0, Math.min(maxY, this.camY));
  }

  pan(dx, dy) {
    this.camX += dx;
    this.camY += dy;
    this._clampCamera();
  }

  // ── coordinate helpers ────────────────────────────────────
  // Building px → screen px
  bx(bpx) { return bpx - this.camX; }
  by(bpx) { return bpx - this.camY; }

  // Screen px → building floor/col
  screenToFloor(sy) {
    const by = sy + this.camY;
    const idx = Math.floor(by / C.FLOOR_H);
    if (idx < 0 || idx >= C.TOTAL_FLOORS) return null;
    if (idx < C.ABOVE) return C.ABOVE - idx;
    return -(idx - C.ABOVE + 1);
  }
  screenToCol(sx) {
    const bx = sx + this.camX;
    return Math.floor(bx / C.CELL_W);
  }

  // ── main draw ─────────────────────────────────────────────
  draw(tower, gameTime) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);

    this._drawSky(ctx, gameTime);
    this._drawBuilding(ctx, tower, gameTime);
    this._drawElevators(ctx, tower);
    this._drawRooms(ctx, tower, gameTime);
    this._drawPersons(ctx, tower);
    this._drawGhost(ctx);
    this._drawElevDrag(ctx);
    this._drawGround(ctx);
    this._drawFloorNumbers(ctx);
  }

  // ── sky ───────────────────────────────────────────────────
  _drawSky(ctx, gameTime) {
    const sky = gameTime.skyColor();
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.w, this.h);

    // Subtle star field at night
    const h = gameTime.hour + gameTime.minute / 60;
    if (h < 6 || h > 20) {
      const opacity = h < 6 ? Math.min(1, (6 - h) / 2) : Math.min(1, (h - 20) / 2);
      ctx.save();
      ctx.globalAlpha = opacity * 0.6;
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 80; i++) {
        // Deterministic "random" stars
        const sx = ((i * 137) % 1000) / 1000 * this.w;
        const sy = ((i * 97)  % 1000) / 1000 * (this.h * 0.6);
        ctx.fillRect(sx, sy, 1, 1);
      }
      ctx.restore();
    }
  }

  // ── building shell (empty floor bands) ────────────────────
  _drawBuilding(ctx, tower, gameTime) {
    const visTop    = this.camY;
    const visBottom = this.camY + this.h;

    // Determine floor range visible
    const topFloor    = Math.min(C.ABOVE,  Math.ceil(C.ABOVE - visTop / C.FLOOR_H));
    const bottomFloor = Math.max(-C.BELOW, Math.floor(C.ABOVE - visBottom / C.FLOOR_H));

    for (let f = bottomFloor; f <= topFloor; f++) {
      if (f === 0) continue;
      const fy = this.by(floorTopY(f));

      // Below-ground floors darker
      if (f < 0) {
        ctx.fillStyle = '#1a1a1a';
      } else {
        ctx.fillStyle = '#2a2a3e';
      }
      ctx.fillRect(this.bx(0), fy, C.BUILDING_W, C.FLOOR_H);

      // Floor line
      ctx.strokeStyle = f < 0 ? '#1c1c2c' : '#22223a';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(this.bx(0), fy + C.FLOOR_H);
      ctx.lineTo(this.bx(C.BUILDING_W), fy + C.FLOOR_H);
      ctx.stroke();
    }
  }

  // ── rooms ────────────────────────────────────────────────
  _drawRooms(ctx, tower, gameTime) {
    for (const room of tower.rooms.values()) {
      const x = this.bx(room.col * C.CELL_W);
      const y = this.by(floorTopY(room.floor));
      const w = room.w * C.CELL_W;
      const h = C.FLOOR_H;

      if (x + w < 0 || x > this.w) continue;
      if (y + h < 0 || y > this.h) continue;

      const isOpen = room.isOpen(gameTime.hour, gameTime.isWeekend);
      const alpha  = isOpen ? 1 : 0.55;

      ctx.save();
      ctx.globalAlpha = alpha;

      // Main fill
      ctx.fillStyle = room.color;
      ctx.fillRect(x + 1, y + 1, w - 2, h - 2);

      // Windows / detail
      this._drawRoomDetails(ctx, room, x, y, w, h, isOpen, gameTime);

      // Stress tint (red overlay)
      if (room.stress > 50) {
        ctx.globalAlpha = alpha * ((room.stress - 50) / 100) * 0.4;
        ctx.fillStyle = '#ff2200';
        ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
      }

      ctx.restore();

      // Border
      const isSelected = this.selectedRoom && this.selectedRoom.id === room.id;
      ctx.strokeStyle = isSelected ? '#ffffff' : '#00000088';
      ctx.lineWidth   = isSelected ? 2 : 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

      // Label
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle   = '#ffffffcc';
      ctx.font        = '9px monospace';
      ctx.textAlign   = 'center';
      ctx.textBaseline = 'middle';
      const label = w > 20 ? room.name : '';
      if (label) ctx.fillText(label, x + w / 2, y + h / 2, w - 4);
      ctx.restore();
    }
  }

  _drawRoomDetails(ctx, room, x, y, w, h, isOpen, gameTime) {
    // Little window squares
    const hr = gameTime.hour;
    const windowLight = isOpen && (hr >= 8 && hr < 20) ? '#ffffcc' : '#334455';
    const windowCount = Math.max(1, Math.floor(w / 14));
    const ww = 6, wh = 8;

    ctx.fillStyle = windowLight;
    for (let i = 0; i < windowCount; i++) {
      const wx = x + 4 + i * (w / windowCount);
      const wy = y + (h - wh) / 2;
      if (wx + ww < x + w - 2) ctx.fillRect(wx, wy, ww, wh);
    }

    // Special: lobby door
    if (room.type === 'LOBBY') {
      ctx.fillStyle = '#aaaaaa';
      ctx.fillRect(x + w / 2 - 4, y + h - 12, 8, 12);
    }
  }

  // ── elevators ────────────────────────────────────────────
  _drawElevators(ctx, tower) {
    for (const e of tower.elevators.values()) {
      const x  = this.bx(e.col * C.CELL_W);
      const yT = this.by(floorTopY(e.topFloor));
      const yB = this.by(floorTopY(e.bottomFloor) + C.FLOOR_H);
      const w  = C.CELL_W;

      if (x + w < 0 || x > this.w) continue;

      // Shaft background
      ctx.fillStyle = '#1c1c30';
      ctx.fillRect(x, yT, w, yB - yT);

      // Shaft rails
      ctx.strokeStyle = '#444466';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 1, yT); ctx.lineTo(x + 1, yB);
      ctx.moveTo(x + w - 1, yT); ctx.lineTo(x + w - 1, yB);
      ctx.stroke();

      // Door markers at each served floor
      for (let f = e.bottomFloor; f <= e.topFloor; f++) {
        const fy = this.by(floorTopY(f));
        ctx.fillStyle = '#2a2a4a';
        ctx.fillRect(x, fy, w, 3);
      }

      // Car
      const carY = this.by(e.carPixelY());
      const carPad = 2;
      const isLoading = e.state === 'LOADING';

      ctx.fillStyle = isLoading ? '#ddddff' : '#9999cc';
      ctx.fillRect(x + carPad, carY + carPad, w - carPad * 2, C.FLOOR_H - carPad * 2);

      // Car door line (open when loading)
      if (isLoading) {
        ctx.strokeStyle = '#ffffff88';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x + w / 2, carY + carPad + 2);
        ctx.lineTo(x + w / 2, carY + C.FLOOR_H - carPad - 2);
        ctx.stroke();
      }

      // Passenger count badge
      if (e.passengers.length > 0) {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(e.passengers.length, x + w / 2, carY + C.FLOOR_H / 2);
      }

      // Express indicator
      if (e.type === 'EXPRESS') {
        ctx.fillStyle = '#ffdd44';
        ctx.fillRect(x, yT, w, 4);
        ctx.fillRect(x, yB - 4, w, 4);
      }
    }
  }

  // ── persons ──────────────────────────────────────────────
  _drawPersons(ctx, tower) {
    ctx.save();
    for (const p of tower.persons.values()) {
      if (p.state === PersonState.IN_ELEVATOR) continue;

      const f = typeof p.floor === 'number' ? Math.round(p.floor) : p.floor;
      if (!Number.isFinite(f)) continue;

      const px = this.bx(p.x);
      const py = this.by(floorTopY(f) + C.FLOOR_H - 10);

      if (px < -4 || px > this.w + 4) continue;
      if (py < -4 || py > this.h + 4) continue;

      // Body
      ctx.fillStyle = p.color;
      ctx.fillRect(px - 2, py + 4, 4, 8);

      // Head
      ctx.beginPath();
      ctx.arc(px, py + 2, 3, 0, Math.PI * 2);
      ctx.fill();

      // Stress indicator
      if (p.stress > 60) {
        ctx.fillStyle = '#ff4400';
        ctx.fillRect(px - 1, py - 3, 2, 2);
      }
    }
    ctx.restore();
  }

  // ── ghost preview ─────────────────────────────────────────
  _drawGhost(ctx) {
    if (!this.ghost) return;
    const { type, floor, col, valid } = this.ghost;
    const def = C.ROOMS[type];
    if (!def) return;

    const x = this.bx(col * C.CELL_W);
    const y = this.by(floorTopY(floor));
    const w = def.w * C.CELL_W;
    const h = C.FLOOR_H;

    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle   = valid ? def.color : '#ff2222';
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = valid ? '#ffffff' : '#ff4444';
    ctx.lineWidth   = 1.5;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    // Cost label
    ctx.fillStyle   = '#ffffffcc';
    ctx.font        = '10px monospace';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`$${def.cost.toLocaleString()}`, x + w / 2, y + h / 2);
    ctx.restore();
  }

  // ── elevator drag preview ────────────────────────────────
  _drawElevDrag(ctx) {
    if (!this.elevDrag) return;
    const { col, startFloor, endFloor } = this.elevDrag;

    const lo = Math.min(startFloor, endFloor);
    const hi = Math.max(startFloor, endFloor);

    const x  = this.bx(col * C.CELL_W);
    const yT = this.by(floorTopY(hi));
    const yB = this.by(floorTopY(lo) + C.FLOOR_H);

    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle   = '#8888cc';
    ctx.fillRect(x, yT, C.CELL_W, yB - yT);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#aaaaff';
    ctx.lineWidth   = 1.5;
    ctx.strokeRect(x + 0.5, yT + 0.5, C.CELL_W - 1, yB - yT - 1);

    const floors  = hi - lo + 1;
    const cost    = C.ELEV_BASE_COST + floors * C.ELEV_PER_FLOOR;
    ctx.fillStyle = '#ffffffcc';
    ctx.font      = '10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`$${cost.toLocaleString()}`, x + C.CELL_W / 2, (yT + yB) / 2);
    ctx.restore();
  }

  // ── ground line ───────────────────────────────────────────
  _drawGround(ctx) {
    const gy = this.by(floorTopY(1) + C.FLOOR_H);
    ctx.fillStyle = '#5c4a28';
    ctx.fillRect(0, gy, this.w, 6);
    ctx.fillStyle = '#3a2a10';
    ctx.fillRect(0, gy + 6, this.w, this.h - gy - 6);
  }

  // ── floor numbers ────────────────────────────────────────
  _drawFloorNumbers(ctx) {
    ctx.font        = '9px monospace';
    ctx.textAlign   = 'right';
    ctx.textBaseline = 'middle';

    const lo = this.screenToFloor(this.h);
    const hi = this.screenToFloor(0);
    if (lo === null || hi === null) return;

    for (let f = lo; f <= hi; f++) {
      if (f === 0) continue;
      const fy = this.by(floorTopY(f) + C.FLOOR_H / 2);
      if (fy < 0 || fy > this.h) continue;

      ctx.fillStyle = '#44446688';
      ctx.fillRect(0, fy - 6, 22, 12);

      ctx.fillStyle = '#8888aa';
      const label = f > 0 ? String(f) : `B${Math.abs(f)}`;
      ctx.fillText(label, 20, fy);
    }
  }
}
