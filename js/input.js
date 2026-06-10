'use strict';

class Input {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.game = game;
    this.activeTool = null;       // room key | ELEV_STANDARD | ELEV_EXPRESS | DEMOLISH | null

    // Touch "place, adjust, confirm" state:
    //   {kind:'room', type, floor, col, valid, reason}
    //   {kind:'elev', type, col, f0, f1, valid, reason}
    //   {kind:'demolish', target, valid}
    this.pending = null;

    this._mouse = { x: 0, y: 0, down: false, button: 0 };
    this._panStart = null;
    this._elevDrag = null;        // {col, f0} during creation drag
    this._dragPending = null;     // {dCol, dFloor} while moving a pending ghost
    this._tapMaybe = null;        // candidate tap (touch, tool armed)
    this._lastPaintCol = null;
    this._lastPaintFloor = null;

    this._touchActive = false;
    this._pinch = null;

    canvas.addEventListener('mousedown', e => this._onDown(e));
    window.addEventListener('mousemove', e => this._onMove(e));
    window.addEventListener('mouseup', e => this._onUp(e));
    canvas.addEventListener('wheel', e => this._onWheel(e), { passive: false });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('keydown', e => this._onKey(e));

    canvas.addEventListener('touchstart', e => this._onTouchStart(e), { passive: false });
    window.addEventListener('touchmove', e => this._onTouchMove(e), { passive: false });
    window.addEventListener('touchend', e => this._onTouchEnd(e), { passive: false });
    window.addEventListener('touchcancel', e => this._onTouchEnd(e), { passive: false });
  }

  get isTouch() { return this.game.ui.isTouch; }

  setTool(tool) {
    this.activeTool = tool;
    this._elevDrag = null;
    this.clearPending();
    this.canvas.classList.toggle('tool-active', !!tool);
    const ui = this.game.ui;
    if (tool === 'DEMOLISH') {
      ui.setStatus('Demolish: click a room or elevator shaft to remove it.');
    } else if (tool === 'ELEV_STANDARD' || tool === 'ELEV_EXPRESS') {
      ui.setStatus('Elevator: press and drag vertically to set the floor range.');
    } else if (tool) {
      const def = C.ROOMS[tool];
      ui.setStatus(`${def.name}: click to build (${fmt$(def.cost)}). Drag to build several.`);
    } else {
      ui.setStatus('Drag to pan, pinch or scroll to zoom, tap to inspect.');
    }
    ui.refreshToolLocks();
    ui.syncBuildPill(tool);
  }

  // ── Pending ghost management (touch flow) ─────────────────
  clearPending() {
    this.pending = null;
    this._dragPending = null;
    this.game.ui.syncPending(null);
  }

  _setPendingRoom(type, floor, col) {
    const def = C.ROOMS[type];
    const placeCol = clamp(col - Math.floor(def.w / 2), 0, C.COLS - def.w);
    this.pending = { kind: 'room', type, floor, col: placeCol };
    this._validatePending();
  }

  _setPendingElev(type, col, f0, f1) {
    let lo = Math.min(f0, f1), hi = Math.max(f0, f1);
    if (lo === 0) lo = -1;
    if (hi === 0) hi = 1;
    this.pending = { kind: 'elev', type, col, f0: lo, f1: hi };
    this._validatePending();
  }

  _validatePending() {
    const p = this.pending;
    if (!p) return;
    const g = this.game;
    if (p.kind === 'room') {
      const def = C.ROOMS[p.type];
      const cost = g.cost(def.cost);
      const check = g.tower.canPlace(p.type, p.floor, p.col);
      const afford = g.economy.canAfford(cost);
      p.valid = check.ok && afford;
      p.reason = !check.ok ? check.reason : (!afford ? 'Not enough funds.' : null);
      p.cost = cost;
      p.label = `${def.icon} ${def.name} · ${fmt$(cost)}`;
    } else if (p.kind === 'elev') {
      const def = C.ELEVATORS[p.type];
      const cost = g.cost(def.base + def.perFloor * (p.f1 - p.f0));
      const check = g.tower.canPlaceShaft(p.type, p.col, p.f0, p.f1);
      const afford = g.economy.canAfford(cost);
      p.valid = check.ok && afford;
      p.reason = !check.ok ? check.reason : (!afford ? 'Not enough funds.' : null);
      p.cost = cost;
      p.label = `🛗 ${def.name} · ${p.f1 - p.f0} floors · ${fmt$(cost)}`;
    } else if (p.kind === 'demolish') {
      p.valid = true;
      const t = p.target;
      const refund = Math.round(g.cost(
        t.kind === 'room' ? t.obj.def.cost : t.obj.cost()) * C.DEMOLISH_REFUND);
      p.label = `🔨 Demolish ${t.kind === 'room' ? t.obj.name : t.obj.def.name} · +${fmt$(refund)}`;
    }
    this.game.ui.syncPending(p);
  }

  confirmPending() {
    const p = this.pending;
    if (!p) return;
    if (p.kind === 'demolish') {
      this.game.demolish(p.target);
      this.clearPending();
      return;
    }
    if (!p.valid) {
      sfx.error();
      if (p.reason) this.game.ui.note(`✖ ${p.reason}`);
      return;
    }
    const result = p.kind === 'room'
      ? this.game.buildRoom(p.type, p.floor, p.col)
      : this.game.buildElevator(p.type, p.col, p.f0, p.f1);
    if (result.ok) {
      this.clearPending();          // tool stays armed for the next one
    } else {
      sfx.error();
      this.game.ui.note(`✖ ${result.reason}`);
      this._validatePending();
    }
  }

  // Screen-space bounds of the pending ghost (for grab detection)
  _pendingScreenRect() {
    const p = this.pending, r = this.game.renderer;
    if (!p) return null;
    const z = r.cam.zoom;
    if (p.kind === 'room') {
      const def = C.ROOMS[p.type];
      return {
        x: r.sx(p.col * C.CELL_W), y: r.sy(floorTopY(p.floor)),
        w: def.w * C.CELL_W * z, h: C.FLOOR_H * z,
      };
    }
    if (p.kind === 'elev') {
      const y = r.sy(floorTopY(p.f1));
      return {
        x: r.sx(p.col * C.CELL_W), y,
        w: C.ELEV_W * C.CELL_W * z,
        h: r.sy(floorTopY(p.f0)) + C.FLOOR_H * z - y,
      };
    }
    return null;
  }

  _hitPending(pos, pad = 28) {
    const rect = this._pendingScreenRect();
    if (!rect) return false;
    return pos.x >= rect.x - pad && pos.x <= rect.x + rect.w + pad &&
           pos.y >= rect.y - pad && pos.y <= rect.y + rect.h + pad;
  }

  _canvasPos(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  // ── Touch-first build flow ────────────────────────────────
  _touchToolDown(pos) {
    const r = this.game.renderer;
    const floor = r.screenToFloor(pos.y);
    const col = r.screenToCol(pos.x);

    // Grab the existing ghost to drag it around
    if (this.pending && this.pending.kind !== 'demolish' && this._hitPending(pos)) {
      const p = this.pending;
      this._dragPending = {
        dCol: (p.kind === 'room' ? p.col : p.col) - (col ?? 0),
        dFloor: (p.kind === 'room' ? p.floor : p.f0) - (floor ?? 0),
      };
      return;
    }

    // Elevator with no ghost yet: vertical drag defines the range
    if (!this.pending &&
        (this.activeTool === 'ELEV_STANDARD' || this.activeTool === 'ELEV_EXPRESS')) {
      if (floor !== null) {
        this._elevDrag = { col: clamp(col - 1, 0, C.COLS - C.ELEV_W), f0: floor };
      }
      return;
    }

    // Otherwise: remember as a possible tap (move ghost there), but pan if
    // the finger travels — so touching the screen never builds by accident.
    this._tapMaybe = { pos, floor, col };
    this._panStart = { ...pos, camX: r.camT.x, camY: r.camT.y, moved: false };
  }

  _touchToolTap(floor, col) {
    if (floor === null) return;
    if (this.activeTool === 'DEMOLISH') {
      const room = this.game.tower.getRoomAt(floor, col);
      const shaft = room ? null : this.game.tower.shaftAtCell(floor, col);
      if (room || shaft) {
        this.pending = {
          kind: 'demolish',
          target: room ? { kind: 'room', obj: room } : { kind: 'shaft', obj: shaft },
        };
        this._validatePending();
      } else {
        this.clearPending();
      }
      return;
    }
    if (C.ROOMS[this.activeTool]) {
      this._setPendingRoom(this.activeTool, floor, col);
      sfx.click();
    }
  }

  // ── Shared pointer logic ──────────────────────────────────
  _primaryDown(pos) {
    this.game.ui.closeDrawers();
    const r = this.game.renderer;

    if (this.activeTool && this.isTouch) {
      this._touchToolDown(pos);
      return;
    }

    const floor = r.screenToFloor(pos.y);
    const col = r.screenToCol(pos.x);

    if (!this.activeTool) {
      this._panStart = { ...pos, camX: r.camT.x, camY: r.camT.y, moved: false };
      return;
    }

    // Desktop: immediate build (hover ghost previews placement)
    if (this.activeTool === 'ELEV_STANDARD' || this.activeTool === 'ELEV_EXPRESS') {
      if (floor !== null) this._elevDrag = { col: clamp(col - 1, 0, C.COLS - C.ELEV_W), f0: floor };
      return;
    }
    if (this.activeTool === 'DEMOLISH') {
      this._demolishAt(floor, col);
      return;
    }
    this._tryPlaceRoom(floor, col, true);
  }

  _pointerMove(pos) {
    const r = this.game.renderer;
    const floor = r.screenToFloor(pos.y);
    const col = r.screenToCol(pos.x);

    // Dragging a pending ghost
    if (this._dragPending && this.pending && floor !== null) {
      const p = this.pending;
      if (p.kind === 'room') {
        const def = C.ROOMS[p.type];
        p.floor = clamp(floor + this._dragPending.dFloor, -C.BELOW, C.ABOVE) || 2;
        p.col = clamp(col + this._dragPending.dCol, 0, C.COLS - def.w);
      } else if (p.kind === 'elev') {
        const span = p.f1 - p.f0;
        let f0 = clamp(floor + this._dragPending.dFloor, -C.BELOW, C.ABOVE - span);
        if (f0 === 0) f0 = f0 + this._dragPending.dFloor >= 0 ? 1 : -1;
        let f1 = f0 + span;
        if (f1 === 0) { f0++; f1++; }
        p.f0 = f0; p.f1 = f1;
        p.col = clamp(col + this._dragPending.dCol, 0, C.COLS - C.ELEV_W);
      }
      this._validatePending();
      return;
    }

    // Pan in progress (or click/tap-drag with no tool)
    if (this._panStart) {
      const dx = pos.x - this._panStart.x, dy = pos.y - this._panStart.y;
      if (!this._panStart.moved && Math.hypot(dx, dy) > 5) {
        this._panStart.moved = true;
        this._tapMaybe = null;        // it's a pan, not a tap
        this.canvas.classList.add('panning');
      }
      if (this._panStart.moved) {
        r.camT.x = this._panStart.camX - dx / r.camT.zoom;
        r.camT.y = this._panStart.camY - dy / r.camT.zoom;
        r.cam.x = r.camT.x;
        r.cam.y = r.camT.y;
        r.clampCamera();
      }
    }

    this._mouse.x = pos.x; this._mouse.y = pos.y;

    // Desktop drag-paint (disabled on touch — pending flow handles it)
    if (!this.isTouch && this._mouse.down && this.activeTool &&
        C.ROOMS[this.activeTool] && !this._panStart && floor !== null) {
      this._tryPlaceRoom(floor, col, false);
    }

    this._updateHover(floor, col);
    this._updateCursorLabel(floor, col);
  }

  _pointerUp(pos, button) {
    this.canvas.classList.remove('panning');
    const r = this.game.renderer;

    // Finish an elevator creation drag
    if (this._elevDrag) {
      const f1 = r.screenToFloor(pos.y);
      if (f1 !== null) {
        if (this.isTouch) {
          // Becomes a pending ghost to adjust & confirm
          this._setPendingElev(
            this.activeTool === 'ELEV_EXPRESS' ? 'EXPRESS' : 'STANDARD',
            this._elevDrag.col, this._elevDrag.f0, f1);
        } else {
          this._placeElevator(this._elevDrag, f1);
        }
      }
      this._elevDrag = null;
      r.hover = null;
    }

    // Touch tap with a tool armed → position the ghost there
    if (this._tapMaybe && (!this._panStart || !this._panStart.moved)) {
      this._touchToolTap(this._tapMaybe.floor, this._tapMaybe.col);
    }
    this._tapMaybe = null;

    // Plain tap/click with no tool → inspect
    if (this._panStart && !this._panStart.moved && button === 0 && !this.activeTool) {
      this.game.inspectAt(r.screenToFloor(pos.y), r.screenToCol(pos.x));
    }
    this._panStart = null;
    this._dragPending = null;
    this._lastPaintCol = null;
    this._lastPaintFloor = null;
  }

  // ── Mouse handlers ────────────────────────────────────────
  _onDown(e) {
    const pos = this._canvasPos(e);
    this._mouse = { ...pos, down: true, button: e.button };
    if (e.button === 1 || e.button === 2) {
      this._startPan(pos);
      return;
    }
    if (e.button !== 0) return;
    this._primaryDown(pos);
  }

  _startPan(pos) {
    const r = this.game.renderer;
    this._panStart = { ...pos, camX: r.camT.x, camY: r.camT.y, moved: true };
    this.canvas.classList.add('panning');
  }

  _onMove(e) { this._pointerMove(this._canvasPos(e)); }

  _onUp(e) {
    this._mouse.down = false;
    this._pointerUp(this._canvasPos(e), e.button);
  }

  _onWheel(e) {
    e.preventDefault();
    const pos = this._canvasPos(e);
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    this.game.renderer.zoomAt(pos.x, pos.y, factor);
    this.game.renderer.clampCamera();
  }

  // ── Touch handlers ────────────────────────────────────────
  _touchPos(t) {
    const r = this.canvas.getBoundingClientRect();
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  }

  _onTouchStart(e) {
    e.preventDefault();
    if (e.touches.length === 1) {
      const pos = this._touchPos(e.touches[0]);
      this._touchActive = true;
      this._pinch = null;
      this._mouse = { ...pos, down: true, button: 0 };
      this._primaryDown(pos);
    } else if (e.touches.length >= 2) {
      this._elevDrag = null;
      this._panStart = null;
      this._tapMaybe = null;
      this._dragPending = null;
      this._lastPaintCol = null;
      this._mouse.down = false;
      this.game.renderer.hover = null;
      this._startPinch(e.touches);
    }
  }

  _startPinch(touches) {
    const r = this.game.renderer;
    const a = this._touchPos(touches[0]), b = this._touchPos(touches[1]);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    this._pinch = {
      dist: Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)),
      zoom0: r.camT.zoom,
      worldX: (mid.x - r.W / 2) / r.camT.zoom + r.camT.x,
      worldY: (mid.y - r.H / 2) / r.camT.zoom + r.camT.y,
    };
    this._touchActive = true;
  }

  _onTouchMove(e) {
    if (!this._touchActive) return;
    e.preventDefault();
    const r = this.game.renderer;

    if (this._pinch && e.touches.length >= 2) {
      const a = this._touchPos(e.touches[0]), b = this._touchPos(e.touches[1]);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const dist = Math.max(20, Math.hypot(a.x - b.x, a.y - b.y));
      const zoom = clamp(this._pinch.zoom0 * dist / this._pinch.dist, 0.28, 2.4);
      r.camT.zoom = zoom;
      r.camT.x = this._pinch.worldX - (mid.x - r.W / 2) / zoom;
      r.camT.y = this._pinch.worldY - (mid.y - r.H / 2) / zoom;
      r.cam = { ...r.camT };
      r.clampCamera();
      return;
    }

    if (e.touches.length === 1) {
      this._pointerMove(this._touchPos(e.touches[0]));
    }
  }

  _onTouchEnd(e) {
    if (!this._touchActive) return;
    e.preventDefault();

    if (e.touches.length >= 2) return;
    if (this._pinch && e.touches.length === 1) {
      this._pinch = null;
      this._panStart = null;
      return;
    }
    if (e.touches.length === 1) return;

    this._pinch = null;
    this._touchActive = false;
    this._mouse.down = false;
    const t = e.changedTouches[0];
    this._pointerUp(t ? this._touchPos(t) : { x: this._mouse.x, y: this._mouse.y }, 0);
    this.game.renderer.hover = null;
  }

  // ── Keyboard ──────────────────────────────────────────────
  _onKey(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    const g = this.game;
    switch (e.key) {
      case 'Escape':
        if (!g.ui.el.modal.classList.contains('hidden')) g.ui.hideModal();
        else if (this.pending) this.clearPending();
        else { this.setTool(null); g.renderer.selected = null; g.ui.showInfo(null); }
        break;
      case 'Enter':
        if (this.pending) this.confirmPending();
        break;
      case ' ':
        e.preventDefault();
        g.time.togglePause();
        break;
      case 'z':
        if (g.canUndo) g.undoLastBuild();
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

  // ── Desktop immediate actions ─────────────────────────────
  _tryPlaceRoom(floor, col, firstClick) {
    if (floor === null) return;
    const def = C.ROOMS[this.activeTool];
    if (!def) return;
    const placeCol = clamp(col - Math.floor(def.w / 2), 0, C.COLS - def.w);

    if (!firstClick && this._lastPaintCol !== null &&
        this._lastPaintFloor === floor &&
        Math.abs(placeCol - this._lastPaintCol) < def.w) return;

    const result = this.game.buildRoom(this.activeTool, floor, placeCol);
    if (result.ok) {
      this._lastPaintCol = placeCol;
      this._lastPaintFloor = floor;
    } else if (firstClick) {
      sfx.error();
      this.game.ui.note(`✖ ${result.reason}`);
    }
  }

  _placeElevator(drag, f1) {
    const type = this.activeTool === 'ELEV_EXPRESS' ? 'EXPRESS' : 'STANDARD';
    let lo = Math.min(drag.f0, f1), hi = Math.max(drag.f0, f1);
    if (lo === 0) lo = -1;
    if (hi === 0) hi = 1;
    const result = this.game.buildElevator(type, drag.col, lo, hi);
    if (!result.ok) {
      sfx.error();
      this.game.ui.note(`✖ ${result.reason}`);
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

  // ── Hover state for ghost rendering (desktop) ─────────────
  _updateHover(floor, col) {
    const r = this.game.renderer;
    if (!this.activeTool || (this.isTouch && !this._elevDrag)) {
      r.hover = null;
      return;
    }

    const hover = { tool: this.activeTool, floor, col: null, valid: false };

    if (this._elevDrag) {
      const f1 = floor === null ? this._elevDrag.f0 : floor;
      let lo = Math.min(this._elevDrag.f0, f1), hi = Math.max(this._elevDrag.f0, f1);
      if (lo === 0) lo = -1;
      if (hi === 0) hi = 1;
      const type = this.activeTool === 'ELEV_EXPRESS' ? 'EXPRESS' : 'STANDARD';
      const check = this.game.tower.canPlaceShaft(type, this._elevDrag.col, lo, hi);
      const cost = this.game.cost(
        C.ELEVATORS[type].base + C.ELEVATORS[type].perFloor * (hi - lo));
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
      r.hover = null;
      return;
    }

    const def = C.ROOMS[this.activeTool];
    if (def) {
      const placeCol = clamp(col - Math.floor(def.w / 2), 0, C.COLS - def.w);
      hover.col = placeCol;
      hover.valid = this.game.tower.canPlace(this.activeTool, floor, placeCol).ok &&
                    this.game.economy.canAfford(this.game.cost(def.cost));
    }
    r.hover = hover;
  }

  _updateCursorLabel(floor, col) {
    if (floor === null) { this.game.ui.setCursor(''); return; }
    const fl = floor < 0 ? `B${-floor}` : `Floor ${floor}`;
    this.game.ui.setCursor(`${fl} · Col ${col}`);
  }
}
