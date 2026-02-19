'use strict';

class Input {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.game   = game;

    this.activeTool  = null;   // e.g. 'OFFICE', 'ELEVATOR', 'DEMOLISH', null
    this.isDragging  = false;
    this.dragStart   = null;   // { x, y, floor, col } screen coords
    this.isPanning   = false;
    this.panStart    = null;   // { x, y, camX, camY }

    this._bindEvents();
    this._bindToolbar();
    this._bindSpeedButtons();
  }

  _bindEvents() {
    const c = this.canvas;
    c.addEventListener('mousedown',  e => this._onMouseDown(e));
    c.addEventListener('mousemove',  e => this._onMouseMove(e));
    c.addEventListener('mouseup',    e => this._onMouseUp(e));
    c.addEventListener('mouseleave', e => this._onMouseLeave(e));
    c.addEventListener('wheel',      e => this._onWheel(e), { passive: false });
    c.addEventListener('contextmenu',e => { e.preventDefault(); this._cancel(); });

    window.addEventListener('keydown', e => this._onKey(e));
    window.addEventListener('resize',  () => {
      this.game.renderer.resize();
      this.game.renderer.centreOnGround();
    });
  }

  _bindToolbar() {
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tool = btn.dataset.tool;
        if (this.activeTool === tool) {
          this._cancel();
        } else {
          this.activeTool = tool;
          this.game.ui.selectTool(tool);
          this._updateStatusForTool(tool);
        }
      });
    });
  }

  _bindSpeedButtons() {
    document.getElementById('btn-pause').addEventListener('click', () => {
      this.game.time.togglePause();
    });
    document.getElementById('btn-slower').addEventListener('click', () => {
      this.game.time.slower();
    });
    document.getElementById('btn-faster').addEventListener('click', () => {
      this.game.time.faster();
    });
  }

  _cancel() {
    this.activeTool = null;
    this.game.ui.selectTool(null);
    this.game.renderer.ghost    = null;
    this.game.renderer.elevDrag = null;
    this.game.ui.setStatus('Select a tool from the sidebar to build.');
  }

  _updateStatusForTool(tool) {
    const def = C.ROOMS[tool];
    if (def) {
      const floors = def.floors === 'below' ? 'Underground only'
                   : def.floors === 'ground' ? 'Floor 1 only' : 'Any floor above ground';
      this.game.ui.setStatus(
        `${def.name}  ·  $${def.cost.toLocaleString()}  ·  ${def.w} wide  ·  ${floors}  ·  Right-click to cancel`
      );
    } else if (tool === 'ELEVATOR' || tool === 'EXPRESS') {
      this.game.ui.setStatus('Elevator: click and drag vertically to set floor range. Right-click to cancel.');
    } else if (tool === 'DEMOLISH') {
      this.game.ui.setStatus('Demolish: click a room or elevator shaft to remove it. Right-click to cancel.');
    }
  }

  // ── mouse helpers ─────────────────────────────────────────
  _pos(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  _floorCol(pos) {
    const r = this.game.renderer;
    return {
      floor: r.screenToFloor(pos.y),
      col:   r.screenToCol(pos.x),
    };
  }

  // ── event handlers ────────────────────────────────────────
  _onMouseDown(e) {
    e.preventDefault();
    const pos = this._pos(e);
    const { floor, col } = this._floorCol(pos);

    if (e.button === 1 || (e.button === 0 && !this.activeTool)) {
      // Middle-click or no tool → pan
      this.isPanning = true;
      this.panStart  = { x: pos.x, y: pos.y,
                         camX: this.game.renderer.camX,
                         camY: this.game.renderer.camY };
      this.canvas.style.cursor = 'grabbing';
      return;
    }

    if (e.button !== 0) return;

    const tool = this.activeTool;
    if (!tool) return;

    if (tool === 'ELEVATOR' || tool === 'EXPRESS') {
      if (floor === null) return;
      this.isDragging = true;
      this.dragStart  = { x: pos.x, y: pos.y, floor, col };
      this.game.renderer.elevDrag = { col, startFloor: floor, endFloor: floor };
    } else if (tool === 'DEMOLISH') {
      this._demolishAt(floor, col);
    } else {
      // Place room — immediate placement on click
      this._tryPlace(tool, floor, col);
    }
  }

  _onMouseMove(e) {
    const pos = this._pos(e);
    const { floor, col } = this._floorCol(pos);

    if (this.isPanning && this.panStart) {
      const dx = pos.x - this.panStart.x;
      const dy = pos.y - this.panStart.y;
      this.game.renderer.camX = this.panStart.camX - dx;
      this.game.renderer.camY = this.panStart.camY - dy;
      this.game.renderer._clampCamera();
      return;
    }

    const tool = this.activeTool;
    if (!tool || floor === null) {
      this.game.renderer.ghost    = null;
      this.game.renderer.elevDrag = null;
      this.game.ui.setCursor('');
      return;
    }

    if (this.isDragging && (tool === 'ELEVATOR' || tool === 'EXPRESS')) {
      if (floor !== null) {
        this.game.renderer.elevDrag = {
          col:        this.dragStart.col,
          startFloor: this.dragStart.floor,
          endFloor:   floor,
        };
      }
    } else if (C.ROOMS[tool]) {
      const check = this.game.tower.canPlace(tool, floor, col);
      this.game.renderer.ghost = { type: tool, floor, col, valid: check.ok };
    }

    // Cursor info
    const floorLabel = floor > 0 ? `Floor ${floor}` : `B${Math.abs(floor)}`;
    this.game.ui.setCursor(`${floorLabel}  Col ${col}`);
  }

  _onMouseUp(e) {
    const pos = this._pos(e);

    if (this.isPanning) {
      this.isPanning = false;
      this.panStart  = null;
      this.canvas.style.cursor = 'crosshair';
      return;
    }

    const { floor, col } = this._floorCol(pos);
    const tool = this.activeTool;

    if (this.isDragging && (tool === 'ELEVATOR' || tool === 'EXPRESS')) {
      this.isDragging = false;
      if (floor !== null) {
        const lo = Math.min(this.dragStart.floor, floor);
        const hi = Math.max(this.dragStart.floor, floor);
        this._tryPlaceElevator(this.dragStart.col, lo, hi, tool);
      }
      this.game.renderer.elevDrag = null;
    }
  }

  _onMouseLeave() {
    this.game.renderer.ghost = null;
    if (!this.isDragging) this.game.renderer.elevDrag = null;
  }

  _onWheel(e) {
    e.preventDefault();
    this.game.renderer.pan(e.deltaX * 0.8, e.deltaY * 0.8);
  }

  _onKey(e) {
    switch (e.key) {
      case 'Escape': this._cancel(); break;
      case 'p': case 'P': this.game.time.togglePause(); break;
      case '+': case '=': this.game.time.faster(); break;
      case '-': case '_': this.game.time.slower(); break;
      case 'ArrowUp':    this.game.renderer.pan(0, -80); e.preventDefault(); break;
      case 'ArrowDown':  this.game.renderer.pan(0,  80); e.preventDefault(); break;
      case 'ArrowLeft':  this.game.renderer.pan(-80, 0); e.preventDefault(); break;
      case 'ArrowRight': this.game.renderer.pan( 80, 0); e.preventDefault(); break;
    }
  }

  // ── placement actions ─────────────────────────────────────
  _tryPlace(type, floor, col) {
    if (floor === null) return;
    const check = this.game.tower.canPlace(type, floor, col);
    if (!check.ok) {
      this.game.ui.flash(`Cannot place: ${check.reason}`);
      return;
    }

    const cost = C.ROOMS[type].cost;
    if (!this.game.economy.spend(cost, `Build ${C.ROOMS[type].name}`)) {
      this.game.ui.flash('Not enough funds!');
      return;
    }

    const result = this.game.tower.placeRoom(type, floor, col);
    if (result.ok) {
      this.game.ui.flash(`Built ${C.ROOMS[type].name} on floor ${floor > 0 ? floor : 'B'+Math.abs(floor)}.`);
    }
  }

  _tryPlaceElevator(col, lo, hi, tool) {
    if (hi - lo < 1) {
      this.game.ui.flash('Elevator must span at least 2 floors.');
      return;
    }

    const check = this.game.tower.canPlaceElevator(col, lo, hi);
    if (!check.ok) {
      this.game.ui.flash(`Cannot place elevator: ${check.reason}`);
      return;
    }

    const floors = hi - lo + 1;
    const cost   = C.ELEV_BASE_COST + floors * C.ELEV_PER_FLOOR;
    if (!this.game.economy.spend(cost, `Build elevator (${floors} floors)`)) {
      this.game.ui.flash('Not enough funds!');
      return;
    }

    const type = tool === 'EXPRESS' ? 'EXPRESS' : 'STANDARD';
    const result = this.game.tower.placeElevator(col, lo, hi, type);
    if (result.ok) {
      this.game.ui.flash(
        `Built ${type === 'EXPRESS' ? 'Express ' : ''}Elevator: floors ${lo}–${hi}.`
      );
    }
  }

  _demolishAt(floor, col) {
    if (floor === null) return;

    // Check for elevator shaft
    for (const e of this.game.tower.elevators.values()) {
      if (e.col === col && e.serves(floor)) {
        const floors = e.floorCount;
        const refund = Math.floor((C.ELEV_BASE_COST + floors * C.ELEV_PER_FLOOR) * 0.5);
        this.game.tower.demolishElevator(e.id);
        this.game.economy.earn(refund, 'Demolish elevator (50% refund)');
        this.game.ui.flash(`Elevator demolished. Refund: $${refund.toLocaleString()}`);
        return;
      }
    }

    // Check for room
    const room = this.game.tower.getRoomAt(floor, col);
    if (room) {
      if (room.type === 'LOBBY') {
        this.game.ui.flash('The lobby cannot be demolished!');
        return;
      }
      const refund = Math.floor(room.cost * 0.5);
      this.game.tower.demolish(floor, col);
      this.game.economy.earn(refund, `Demolish ${room.name} (50% refund)`);
      this.game.ui.flash(`${room.name} demolished. Refund: $${refund.toLocaleString()}`);
    }
  }
}
