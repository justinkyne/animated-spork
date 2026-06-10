'use strict';

class Input {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.game = game;
    this.activeTool = null;       // room key | ELEV_STANDARD | ELEV_EXPRESS | DEMOLISH | null

    this._mouse = { x: 0, y: 0, down: false, button: 0 };
    this._panning = false;
    this._panStart = null;
    this._elevDrag = null;        // {col, f0}
    this._lastPaintCol = null;
    this._lastPaintFloor = null;

    canvas.addEventListener('mousedown', e => this._onDown(e));
    window.addEventListener('mousemove', e => this._onMove(e));
    window.addEventListener('mouseup', e => this._onUp(e));
    canvas.addEventListener('wheel', e => this._onWheel(e), { passive: false });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('keydown', e => this._onKey(e));
  }

  setTool(tool) {
    this.activeTool = tool;
    this._elevDrag = null;
    this.canvas.classList.toggle('tool-active', !!tool);
    const ui = this.game.ui;
    if (tool === 'DEMOLISH') {
      ui.setStatus('Demolish: click a room or elevator shaft to remove it.');
    } else if (tool === 'ELEV_STANDARD' || tool === 'ELEV_EXPRESS') {
      ui.setStatus('Elevator: press and drag vertically to set the floor range.');
    } else if (tool) {
      const def = C.ROOMS[tool];
      ui.setStatus(`${def.name}: click to build (${fmt$(def.cost)}). Drag to build several. ${def.desc}`);
    } else {
      ui.setStatus('Drag to pan, scroll to zoom, click to inspect.');
    }
    ui.refreshToolLocks();
  }

  _canvasPos(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  // ── Mouse handlers ────────────────────────────────────────
  _onDown(e) {
    const pos = this._canvasPos(e);
    this._mouse = { ...pos, down: true, button: e.button };

    // Middle / right always pans
    if (e.button === 1 || e.button === 2) {
      this._startPan(pos);
      return;
    }
    if (e.button !== 0) return;

    const r = this.game.renderer;
    const floor = r.screenToFloor(pos.y);
    const col = r.screenToCol(pos.x);

    if (!this.activeTool) {
      // Inspect first; pan happens once the cursor moves
      this._panStart = { ...pos, camX: r.cam.x, camY: r.cam.y, moved: false };
      return;
    }

    if (this.activeTool === 'ELEV_STANDARD' || this.activeTool === 'ELEV_EXPRESS') {
      if (floor !== null) this._elevDrag = { col: clamp(col - 1, 0, C.COLS - C.ELEV_W), f0: floor };
      return;
    }

    if (this.activeTool === 'DEMOLISH') {
      this._demolishAt(floor, col);
      return;
    }

    // Room tool
    this._tryPlaceRoom(floor, col, true);
  }

  _startPan(pos) {
    const r = this.game.renderer;
    this._panning = true;
    this._panStart = { ...pos, camX: r.camT.x, camY: r.camT.y, moved: true };
    this.canvas.classList.add('panning');
  }

  _onMove(e) {
    const pos = this._canvasPos(e);
    const r = this.game.renderer;

    // Pan in progress (or click-drag with no tool)
    if (this._panStart) {
      const dx = pos.x - this._panStart.x, dy = pos.y - this._panStart.y;
      if (!this._panStart.moved && Math.hypot(dx, dy) > 4) {
        this._panStart.moved = true;
        this.canvas.classList.add('panning');
      }
      if (this._panStart.moved) {
        // Direct (unsmoothed) panning so the world sticks to the cursor
        r.camT.x = this._panStart.camX - dx / r.camT.zoom;
        r.camT.y = this._panStart.camY - dy / r.camT.zoom;
        r.cam.x = r.camT.x;
        r.cam.y = r.camT.y;
        r.clampCamera();
      }
    }

    this._mouse.x = pos.x; this._mouse.y = pos.y;
    const floor = r.screenToFloor(pos.y);
    const col = r.screenToCol(pos.x);

    // Drag-paint rooms
    if (this._mouse.down && this.activeTool && C.ROOMS[this.activeTool] &&
        !this._panStart && floor !== null) {
      this._tryPlaceRoom(floor, col, false);
    }

    // Elevator drag preview handled in hover state below
    this._updateHover(floor, col);
    this._updateCursorLabel(floor, col);
  }

  _onUp(e) {
    const pos = this._canvasPos(e);
    this._mouse.down = false;
    this.canvas.classList.remove('panning');

    // Finish elevator drag
    if (this._elevDrag) {
      const r = this.game.renderer;
      const f1 = r.screenToFloor(pos.y);
      if (f1 !== null) this._placeElevator(this._elevDrag, f1);
      this._elevDrag = null;
    }

    // Plain click (no drag) with no tool → inspect
    if (this._panStart && !this._panStart.moved && e.button === 0 && !this.activeTool) {
      const r = this.game.renderer;
      this.game.inspectAt(r.screenToFloor(pos.y), r.screenToCol(pos.x));
    }
    this._panStart = null;
    this._panning = false;
    this._lastPaintCol = null;
    this._lastPaintFloor = null;
  }

  _onWheel(e) {
    e.preventDefault();
    const pos = this._canvasPos(e);
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    this.game.renderer.zoomAt(pos.x, pos.y, factor);
    this.game.renderer.clampCamera();
  }

  _onKey(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    const g = this.game;
    switch (e.key) {
      case 'Escape':
        if (!g.ui.el.modal.classList.contains('hidden')) g.ui.hideModal();
        else { this.setTool(null); g.renderer.selected = null; g.ui.showInfo(null); }
        break;
      case ' ':
        e.preventDefault();
        g.time.togglePause();
        break;
      case '1': case '2': case '3': case '4': case '5':
        g.time.setSpeed(parseInt(e.key, 10) - 1);
        break;
      case 'ArrowLeft':  g.renderer.camT.x -= 110 / g.renderer.camT.zoom; g.renderer.clampCamera(); break;
      case 'ArrowRight': g.renderer.camT.x += 110 / g.renderer.camT.zoom; g.renderer.clampCamera(); break;
      case 'ArrowUp':    g.renderer.camT.y -= 110 / g.renderer.camT.zoom; g.renderer.clampCamera(); break;
      case 'ArrowDown':  g.renderer.camT.y += 110 / g.renderer.camT.zoom; g.renderer.clampCamera(); break;
    }
  }

  // ── Actions ───────────────────────────────────────────────
  _tryPlaceRoom(floor, col, firstClick) {
    if (floor === null) return;
    const def = C.ROOMS[this.activeTool];
    if (!def) return;
    const placeCol = clamp(col - Math.floor(def.w / 2), 0, C.COLS - def.w);

    // While drag-painting, only attempt when we've moved a full room width
    if (!firstClick && this._lastPaintCol !== null &&
        this._lastPaintFloor === floor &&
        Math.abs(placeCol - this._lastPaintCol) < def.w) return;

    const result = this.game.buildRoom(this.activeTool, floor, placeCol);
    if (result.ok) {
      this._lastPaintCol = placeCol;
      this._lastPaintFloor = floor;
    } else if (firstClick) {
      sfx.error();
      this.game.ui.setStatus(`✖ ${result.reason}`);
    }
  }

  _placeElevator(drag, f1) {
    const type = this.activeTool === 'ELEV_EXPRESS' ? 'EXPRESS' : 'STANDARD';
    let lo = Math.min(drag.f0, f1), hi = Math.max(drag.f0, f1);
    // The dead "floor 0" band can't be an endpoint
    if (lo === 0) lo = -1;
    if (hi === 0) hi = 1;
    const result = this.game.buildElevator(type, drag.col, lo, hi);
    if (!result.ok) {
      sfx.error();
      this.game.ui.setStatus(`✖ ${result.reason}`);
    }
  }

  _demolishAt(floor, col) {
    if (floor === null) return;
    const t = this.game.tower;
    const room = t.getRoomAt(floor, col);
    if (room) { this.game.demolish({ kind: 'room', obj: room }); return; }
    const shaft = t.shaftAtCell(floor, col);
    if (shaft) { this.game.demolish({ kind: 'shaft', obj: shaft }); return; }
  }

  // ── Hover state for ghost rendering ───────────────────────
  _updateHover(floor, col) {
    const r = this.game.renderer;
    if (!this.activeTool) { r.hover = null; return; }

    const hover = { tool: this.activeTool, floor, col: null, valid: false };

    if (this._elevDrag) {
      const f1 = floor === null ? this._elevDrag.f0 : floor;
      let lo = Math.min(this._elevDrag.f0, f1), hi = Math.max(this._elevDrag.f0, f1);
      if (lo === 0) lo = -1;
      if (hi === 0) hi = 1;
      const type = this.activeTool === 'ELEV_EXPRESS' ? 'EXPRESS' : 'STANDARD';
      const check = this.game.tower.canPlaceShaft(type, this._elevDrag.col, lo, hi);
      const cost = C.ELEVATORS[type].base + C.ELEVATORS[type].perFloor * (hi - lo);
      hover.elevDrag = {
        col: this._elevDrag.col, f0: lo, f1: hi, type,
        valid: check.ok && this.game.economy.canAfford(cost),
      };
      r.hover = hover;
      return;
    }

    if (floor === null) { r.hover = null; return; }

    if (this.activeTool === 'DEMOLISH') {
      const room = this.game.tower.getRoomAt(floor, col);
      const shaft = room ? null : this.game.tower.shaftAtCell(floor, col);
      hover.demolishTarget = room ? { kind: 'room', obj: room }
        : shaft ? { kind: 'shaft', obj: shaft } : null;
      r.hover = hover;
      return;
    }

    if (this.activeTool === 'ELEV_STANDARD' || this.activeTool === 'ELEV_EXPRESS') {
      r.hover = null;   // ghost appears once dragging starts
      return;
    }

    const def = C.ROOMS[this.activeTool];
    if (def) {
      const placeCol = clamp(col - Math.floor(def.w / 2), 0, C.COLS - def.w);
      hover.col = placeCol;
      hover.valid = this.game.tower.canPlace(this.activeTool, floor, placeCol).ok &&
                    this.game.economy.canAfford(def.cost);
    }
    r.hover = hover;
  }

  _updateCursorLabel(floor, col) {
    if (floor === null) { this.game.ui.setCursor(''); return; }
    const fl = floor < 0 ? `B${-floor}` : `Floor ${floor}`;
    this.game.ui.setCursor(`${fl} · Col ${col}`);
  }
}
