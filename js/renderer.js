'use strict';

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    this.cam = { x: C.COLS * C.CELL_W / 2, y: floorTopY(4), zoom: 1 };
    this.W = 0; this.H = 0;

    this.selected = null;        // {kind:'room'|'shaft', obj}
    this.hover = null;           // set by Input each frame

    // Effects
    this.moneyPops = [];         // {x, y, text, age, color}
    this.confetti = [];          // {x, y, vx, vy, color, age, spin}
    this.precip = [];            // weather particles (screen space)

    // Deterministic background decorations
    this._stars = [];
    for (let i = 0; i < 140; i++) {
      this._stars.push({ x: Math.random(), y: Math.random() * 0.7, s: Math.random() });
    }
    this._clouds = [];
    for (let i = 0; i < 9; i++) {
      this._clouds.push({
        x: Math.random() * 4000, y: 200 + Math.random() * 1600,
        w: 160 + Math.random() * 240, speed: 2 + Math.random() * 5,
      });
    }
    this._skyline = [];
    let sx = -2400;
    while (sx < 4800) {
      const w = 60 + Math.random() * 140;
      this._skyline.push({ x: sx, w, h: 120 + Math.random() * 480 });
      sx += w + 8 + Math.random() * 60;
    }

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const wrap = this.canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    this.W = wrap.clientWidth;
    this.H = wrap.clientHeight;
    this.canvas.width = this.W * dpr;
    this.canvas.height = this.H * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ── Coordinate transforms ─────────────────────────────────
  sx(wx) { return (wx - this.cam.x) * this.cam.zoom + this.W / 2; }
  sy(wy) { return (wy - this.cam.y) * this.cam.zoom + this.H / 2; }
  wx(sx) { return (sx - this.W / 2) / this.cam.zoom + this.cam.x; }
  wy(sy) { return (sy - this.H / 2) / this.cam.zoom + this.cam.y; }

  screenToFloor(sy) {
    const wy = this.wy(sy);
    const raw = C.ABOVE - Math.floor(wy / C.FLOOR_H);
    const floor = raw <= 0 ? raw - 1 : raw;   // skip floor 0 downward
    if (floor > C.ABOVE || floor < -C.BELOW) return null;
    return floor;
  }
  screenToCol(sx) {
    return Math.floor(this.wx(sx) / C.CELL_W);
  }

  centerOnLobby() {
    this.cam.x = C.COLS * C.CELL_W / 2;
    this.cam.y = floorTopY(5);
    this.cam.zoom = 1;
  }

  zoomAt(screenX, screenY, factor) {
    const beforeX = this.wx(screenX), beforeY = this.wy(screenY);
    this.cam.zoom = clamp(this.cam.zoom * factor, 0.28, 2.4);
    this.cam.x += beforeX - this.wx(screenX);
    this.cam.y += beforeY - this.wy(screenY);
  }

  clampCamera() {
    const margin = 600;
    this.cam.x = clamp(this.cam.x, -margin, C.COLS * C.CELL_W + margin);
    this.cam.y = clamp(this.cam.y, floorTopY(C.ABOVE) - margin, floorTopY(-C.BELOW) + C.FLOOR_H + margin);
  }

  // ── Effects API ───────────────────────────────────────────
  popMoney(x, y, text, color = '#ffe28a') {
    this.moneyPops.push({ x, y, text, age: 0, color });
    if (this.moneyPops.length > 40) this.moneyPops.shift();
  }

  burstConfetti(n = 80) {
    const colors = ['#ffce54', '#4cc2ff', '#6fe08f', '#f07ac4', '#ff8a66'];
    for (let i = 0; i < n; i++) {
      this.confetti.push({
        x: Math.random() * this.W, y: -10 - Math.random() * 200,
        vx: (Math.random() - 0.5) * 40, vy: 60 + Math.random() * 80,
        color: colors[i % colors.length], age: 0, spin: Math.random() * 6,
      });
    }
  }

  // ── Main draw ─────────────────────────────────────────────
  draw(game, dtReal) {
    const { tower, time } = game;
    const ctx = this.ctx;
    const hour = time.hourFloat;
    const night = this._nightFactor(hour);

    this._drawSky(ctx, hour, night);
    this._drawBackdrop(ctx, night, time);
    this._drawGround(ctx, time, night);

    this._drawTowerShell(ctx, tower, night);
    this._drawRooms(ctx, tower, time, night);
    this._drawLobby(ctx, tower, night);
    this._drawShafts(ctx, tower);
    this._drawPersons(ctx, tower, time);
    this._drawFloorLabels(ctx, tower);

    this._drawWeather(ctx, time, dtReal);
    this._drawGhost(ctx, game);
    this._drawSelection(ctx);
    this._drawEffects(ctx, dtReal);
  }

  _nightFactor(hour) {
    if (hour >= 7 && hour <= 18) return 0;
    if (hour > 18 && hour < 21) return (hour - 18) / 3;
    if (hour >= 21 || hour <= 5) return 1;
    return 1 - (hour - 5) / 2;   // 5–7 dawn
  }

  // ── Sky / background ──────────────────────────────────────
  _skyColor(hour) {
    const stops = C.SKY;
    for (let i = 0; i < stops.length - 1; i++) {
      const [h0, c0] = stops[i], [h1, c1] = stops[i + 1];
      if (hour >= h0 && hour <= h1) {
        return this._lerpHex(c0, c1, (hour - h0) / Math.max(0.001, h1 - h0));
      }
    }
    return stops[0][1];
  }

  _lerpHex(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const r = Math.round(lerp(pa >> 16, pb >> 16, t));
    const g = Math.round(lerp((pa >> 8) & 255, (pb >> 8) & 255, t));
    const bl = Math.round(lerp(pa & 255, pb & 255, t));
    return `rgb(${r},${g},${bl})`;
  }

  _drawSky(ctx, hour, night) {
    const top = this._skyColor(hour);
    const grad = ctx.createLinearGradient(0, 0, 0, this.H);
    grad.addColorStop(0, top);
    grad.addColorStop(1, this._lerpHex('#0c111b', '#9db8d8', Math.max(0, 1 - night) * 0.5));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.W, this.H);

    // Stars
    if (night > 0.05) {
      const t = performance.now() / 1000;
      for (const s of this._stars) {
        const alpha = night * (0.4 + 0.6 * Math.abs(Math.sin(t * 0.8 + s.s * 20)));
        ctx.fillStyle = `rgba(255,255,255,${alpha * 0.8})`;
        const px = (s.x * this.W * 1.4 - this.cam.x * 0.04) % this.W;
        ctx.fillRect((px + this.W) % this.W, s.y * this.H, s.s > 0.85 ? 2 : 1, s.s > 0.85 ? 2 : 1);
      }
    }

    // Sun / moon on a simple arc
    const isDay = hour > 5.5 && hour < 20.5;
    const t = isDay ? (hour - 5.5) / 15 : ((hour >= 20.5 ? hour - 20.5 : hour + 3.5) / 9);
    const px = this.W * (0.08 + 0.84 * t);
    const py = this.H * (0.42 - 0.34 * Math.sin(t * Math.PI));
    if (isDay) {
      const glow = ctx.createRadialGradient(px, py, 4, px, py, 70);
      glow.addColorStop(0, 'rgba(255,236,160,0.95)');
      glow.addColorStop(1, 'rgba(255,236,160,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(px - 70, py - 70, 140, 140);
      ctx.fillStyle = '#fff2c0';
      ctx.beginPath(); ctx.arc(px, py, 17, 0, 7); ctx.fill();
    } else {
      ctx.fillStyle = '#e8ecf4';
      ctx.beginPath(); ctx.arc(px, py, 13, 0, 7); ctx.fill();
      ctx.fillStyle = this._skyColor(hour);
      ctx.beginPath(); ctx.arc(px + 5, py - 3, 11, 0, 7); ctx.fill();
    }

    // Clouds (slow parallax)
    const now = performance.now() / 1000;
    ctx.fillStyle = `rgba(${night > 0.5 ? '40,48,68' : '255,255,255'},${0.5 - night * 0.25})`;
    for (const c of this._clouds) {
      const cx = ((c.x + now * c.speed - this.cam.x * 0.1) % 5200 + 5200) % 5200 - 600;
      const cy = c.y - this.cam.y * 0.08;
      if (cx > this.W + 300 || cy < -80 || cy > this.H + 80) continue;
      ctx.beginPath();
      ctx.ellipse(cx, cy, c.w / 2, c.w / 7, 0, 0, 7);
      ctx.ellipse(cx - c.w / 4, cy + 6, c.w / 3.2, c.w / 9, 0, 0, 7);
      ctx.ellipse(cx + c.w / 4, cy + 5, c.w / 3.5, c.w / 10, 0, 0, 7);
      ctx.fill();
    }
  }

  _drawBackdrop(ctx, night, time) {
    // Distant city silhouette, parallax 0.35
    const groundScreenY = this.sy(groundY());
    ctx.fillStyle = this._lerpHex('#3a4a66', '#10182b', night);
    for (const b of this._skyline) {
      const bx = (b.x - this.cam.x * 0.35) ;
      const px = bx + this.W / 2;
      if (px + b.w < -50 || px > this.W + 50) continue;
      const h = b.h * this.cam.zoom * 0.8;
      ctx.fillRect(px, groundScreenY - h, b.w, h + 400);
    }
    // Lit windows in the silhouette at night
    if (night > 0.3) {
      ctx.fillStyle = `rgba(255,214,140,${0.25 * night})`;
      for (const b of this._skyline) {
        const px = (b.x - this.cam.x * 0.35) + this.W / 2;
        if (px + b.w < -50 || px > this.W + 50) continue;
        const h = b.h * this.cam.zoom * 0.8;
        for (let i = 0; i < b.w / 18; i++) {
          for (let j = 0; j < h / 26; j++) {
            if (((b.x * 7 + i * 13 + j * 31) % 17) < 5) {
              ctx.fillRect(px + 4 + i * 18, groundScreenY - h + 6 + j * 26, 5, 7);
            }
          }
        }
      }
    }
  }

  _drawGround(ctx, time, night) {
    const gy = this.sy(groundY());
    if (gy > this.H) return;
    // Earth below ground level
    ctx.fillStyle = this._lerpHex('#3a2c20', '#171108', night * 0.6);
    ctx.fillRect(0, gy, this.W, this.H - gy);
    // Surface strip — season tinted
    const season = time.season;
    const grass = season === 'Winter' ? '#cfd8e2'
      : season === 'Autumn' ? '#8a7a3a'
      : season === 'Summer' ? '#4e8a44' : '#5a9a50';
    ctx.fillStyle = this._lerpHex(grass, '#101820', night * 0.55);
    ctx.fillRect(0, gy, this.W, Math.max(2, 5 * this.cam.zoom));
  }

  // ── Tower ─────────────────────────────────────────────────
  _visibleFloorRange() {
    const fTop = this.screenToFloor(-C.FLOOR_H * this.cam.zoom);
    const fBot = this.screenToFloor(this.H + C.FLOOR_H * this.cam.zoom);
    return [
      fBot === null ? -C.BELOW : fBot,
      fTop === null ? C.ABOVE : fTop,
    ];
  }

  // Per-floor backdrop so the building reads as one structure
  _drawTowerShell(ctx, tower, night) {
    const [lo, hi] = this._visibleFloorRange();
    const spans = new Map();   // floor -> [minCol, maxCol]
    const widen = (f, c0, c1) => {
      const s = spans.get(f);
      if (!s) spans.set(f, [c0, c1]);
      else { s[0] = Math.min(s[0], c0); s[1] = Math.max(s[1], c1); }
    };
    for (const r of tower.rooms.values()) widen(r.floor, r.col, r.col + r.w);
    for (const s of tower.shafts.values()) {
      for (let f = s.bottom; f <= s.top; f++) {
        if (f !== 0) widen(f, s.col, s.col + C.ELEV_W);
      }
    }

    const shell = this._lerpHex('#222d42', '#141b2c', night);
    for (const [f, [c0, c1]] of spans) {
      if (f < lo || f > hi) continue;
      const x = this.sx(c0 * C.CELL_W) - 3 * this.cam.zoom;
      const y = this.sy(floorTopY(f));
      const w = (c1 - c0) * C.CELL_W * this.cam.zoom + 6 * this.cam.zoom;
      const h = C.FLOOR_H * this.cam.zoom;
      ctx.fillStyle = shell;
      ctx.fillRect(x, y, w, h + 1);
      // Slab line
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(x, y + h - 2 * this.cam.zoom, w, 2 * this.cam.zoom);
    }
  }

  _drawRooms(ctx, tower, time, night) {
    const [lo, hi] = this._visibleFloorRange();
    const z = this.cam.zoom;
    const showText = z >= 0.75;
    const isWorkHours = time.hour >= 8 && time.hour < 18 && !time.isWeekend;

    for (const r of tower.rooms.values()) {
      if (r.floor < lo || r.floor > hi) continue;
      const x = this.sx(r.col * C.CELL_W);
      const y = this.sy(floorTopY(r.floor));
      const w = r.w * C.CELL_W * z;
      const h = C.FLOOR_H * z;
      if (x + w < -20 || x > this.W + 20) continue;

      const def = r.def;

      if (!r.occupied && (r.kind === 'tenant' || r.kind === 'commercial')) {
        // Vacant: bare concrete
        ctx.fillStyle = night > 0.5 ? '#1a2233' : '#2c3850';
        ctx.fillRect(x, y, w, h - 2 * z);
        ctx.strokeStyle = 'rgba(124,138,165,0.5)';
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(x + 1, y + 1, w - 2, h - 4 * z);
        ctx.setLineDash([]);
        if (showText && w > 50) {
          ctx.fillStyle = 'rgba(124,138,165,0.8)';
          ctx.font = `${Math.max(8, 9 * z)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(r.noAccess ? 'NO ELEVATOR' : 'FOR LEASE', x + w / 2, y + h / 2 + 3);
        }
      } else {
        // Occupied (or service/hotel/special): facade
        const base = this._lerpHex(def.color, '#0c1018', night * 0.45);
        ctx.fillStyle = base;
        ctx.fillRect(x, y, w, h - 2 * z);

        this._drawRoomInterior(ctx, r, x, y, w, h, z, night, isWorkHours, time);

        // Accent sign strip for commercial / service
        if (r.kind === 'commercial' || r.kind === 'service' || r.kind === 'special') {
          ctx.fillStyle = def.accent;
          ctx.fillRect(x, y, w, Math.max(2, 3.5 * z));
          if (showText && w > 56) {
            ctx.fillStyle = night > 0.4 ? def.accent : 'rgba(255,255,255,0.85)';
            ctx.font = `bold ${Math.max(7, 8.5 * z)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText(def.name.toUpperCase(), x + w / 2, y + Math.max(10, 13 * z));
          }
        }
      }

      // Mood dot for tenants/commercial/hotel
      if (r.occupied && r.kind !== 'service' && r.kind !== 'special' && z > 0.5) {
        ctx.fillStyle = r.moodColor;
        ctx.beginPath();
        ctx.arc(x + 5 * z, y + 6 * z, 2.2 * z, 0, 7);
        ctx.fill();
      }

      // Hotel dirty marker
      if (r.kind === 'hotel' && r.dirty && z > 0.5) {
        ctx.fillStyle = '#c87832';
        ctx.beginPath();
        ctx.moveTo(x + w - 2, y + 2);
        ctx.lineTo(x + w - 2 - 9 * z, y + 2);
        ctx.lineTo(x + w - 2, y + 2 + 9 * z);
        ctx.fill();
      }

      // Construction shimmer for ~1 game hour after building
      if (time.totalMin - r.builtAtMin < 60 && r.builtAtMin > 0) {
        const p = (time.totalMin - r.builtAtMin) / 60;
        ctx.fillStyle = `rgba(255,206,84,${0.35 * (1 - p)})`;
        ctx.fillRect(x, y, w * p, h - 2 * z);
      }
    }
  }

  _drawRoomInterior(ctx, r, x, y, w, h, z, night, isWorkHours, time) {
    const def = r.def;
    const lit = night > 0.35 && (
      (r.kind === 'hotel' && r.guestsTonight > 0) ||
      r.type === 'CONDO' ||
      (r.kind === 'commercial' && time.hour >= 8 && time.hour <= 22) ||
      (r.type === 'OFFICE' && time.hour < 21 && time.hour >= 7)
    );
    const glass = lit
      ? `rgba(255,220,150,${0.55 + 0.25 * Math.sin(r.id * 7)})`
      : this._lerpHex('#9fc0dd', '#16202e', Math.max(night, 0.25));

    // Window strip
    const pad = 2.5 * z;
    const winY = y + h * 0.22, winH = h * 0.5;
    const cellPx = C.CELL_W * z;
    for (let i = 0; i < r.w; i++) {
      if ((i + r.variant) % 3 === 2) continue;   // mullion gap
      ctx.fillStyle = glass;
      ctx.fillRect(x + i * cellPx + pad / 2, winY, cellPx - pad, winH);
    }

    // Tiny furniture silhouettes when zoomed in
    if (z >= 0.9) {
      ctx.fillStyle = 'rgba(10,14,22,0.5)';
      const fy = y + h - 8 * z;
      if (r.type === 'OFFICE' && r.occupied) {
        for (let i = 0; i < 3; i++) ctx.fillRect(x + w * (0.2 + i * 0.25), fy, 7 * z, 4 * z);
        if (isWorkHours) {
          ctx.fillStyle = '#86b4f0';
          for (let i = 0; i < 3; i++) ctx.fillRect(x + w * (0.22 + i * 0.25), fy - 5 * z, 3 * z, 5 * z);
        }
      } else if (r.kind === 'hotel') {
        ctx.fillRect(x + w * 0.15, fy, w * 0.3, 5 * z);
      } else if (r.type === 'CONDO' && r.occupied) {
        ctx.fillRect(x + w * 0.12, fy, 10 * z, 4 * z);
        ctx.fillRect(x + w * 0.7, fy - 3 * z, 6 * z, 7 * z);
      }
    }
  }

  _drawLobby(ctx, tower, night) {
    const y = this.sy(floorTopY(1));
    const h = C.FLOOR_H * this.cam.zoom;
    if (y > this.H || y + h < 0) return;
    const x0 = this.sx(tower.lobbyLeftX);
    const x1 = this.sx(tower.lobbyRightX);

    ctx.fillStyle = this._lerpHex('#cfc8b8', '#3a3830', night * 0.7);
    ctx.fillRect(x0, y, x1 - x0, h);

    // Columns
    const z = this.cam.zoom;
    ctx.fillStyle = this._lerpHex('#9a9282', '#262420', night * 0.7);
    const colSpacing = 10 * C.CELL_W * z;
    for (let px = x0 + colSpacing / 2; px < x1; px += colSpacing) {
      ctx.fillRect(px, y, Math.max(2, 3 * z), h);
    }
    // Warm interior glow at night
    if (night > 0.3) {
      ctx.fillStyle = `rgba(255,214,140,${0.18 * night})`;
      ctx.fillRect(x0, y, x1 - x0, h);
    }
    // Entrance awnings
    ctx.fillStyle = '#b03838';
    ctx.fillRect(x0 - 4 * z, y - 3 * z, 14 * z, 4 * z);
    ctx.fillRect(x1 - 10 * z, y - 3 * z, 14 * z, 4 * z);
    // Slab line
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(x0, y + h - 2 * z, x1 - x0, 2 * z);
  }

  _drawShafts(ctx, tower) {
    const z = this.cam.zoom;
    for (const s of tower.shafts.values()) {
      const x = this.sx(s.col * C.CELL_W);
      const w = C.ELEV_W * C.CELL_W * z;
      const yTop = this.sy(floorTopY(s.top));
      const yBot = this.sy(floorTopY(s.bottom)) + C.FLOOR_H * z;
      if (x + w < 0 || x > this.W || yTop > this.H || yBot < 0) continue;

      // Shaft well
      ctx.fillStyle = s.type === 'EXPRESS' ? '#241620' : '#1a2030';
      ctx.fillRect(x, yTop, w, yBot - yTop);
      ctx.strokeStyle = s.def.color;
      ctx.lineWidth = Math.max(1, 1.2 * z);
      ctx.strokeRect(x, yTop, w, yBot - yTop);

      // Floor stop ticks
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      for (let f = s.bottom; f <= s.top; f++) {
        if (f === 0) continue;
        const fy = this.sy(floorTopY(f)) + C.FLOOR_H * z - 1;
        ctx.fillRect(x, fy, w, 1);
        if (s.type === 'EXPRESS' && s.servesFloor(f, tower)) {
          ctx.fillStyle = s.def.color;
          ctx.fillRect(x - 3 * z, fy - 2, 3 * z, 3);
          ctx.fillStyle = 'rgba(255,255,255,0.14)';
        }
      }

      // Cars
      for (const car of s.cars) {
        const cy = this.sy(floorTopY(car.floor));
        const ch = C.FLOOR_H * z;
        // Cable
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + w / 2, yTop);
        ctx.lineTo(x + w / 2, cy);
        ctx.stroke();
        // Cab
        const doorOpen = car.doorT > 0;
        ctx.fillStyle = doorOpen ? '#ffe9a8' : s.def.color;
        ctx.fillRect(x + 1.5 * z, cy + 2 * z, w - 3 * z, ch - 5 * z);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(x + 1.5 * z, cy + 2 * z, w - 3 * z, 3 * z);
        // Passenger dots
        if (z > 0.5 && car.passengers.length > 0) {
          ctx.fillStyle = '#2a2418';
          const n = Math.min(car.passengers.length, 8);
          for (let i = 0; i < n; i++) {
            ctx.fillRect(
              x + 3 * z + (i % 4) * 4.5 * z,
              cy + ch - (i < 4 ? 10 : 16) * z,
              3 * z, 6 * z,
            );
          }
        }
      }
    }
  }

  _drawPersons(ctx, tower, time) {
    const z = this.cam.zoom;
    const t = performance.now() / 1000;
    for (const p of tower.persons.values()) {
      if (p.state === 'inside' || p.state === 'ride' || p.gone) continue;
      let px = p.x, offY = 0;
      if (p.state === 'wait' && p.shaft) {
        // Queue up beside the shaft
        const qi = p.shaft.queueIndex(p);
        const side = p.x >= p.shaft.centerX ? 1 : -1;
        px = p.shaft.centerX + side * (C.CELL_W * 2 + qi * 5);
      }
      const sx = this.sx(px);
      const sy = this.sy(floorTopY(p.floor)) + C.FLOOR_H * z;
      if (sx < -10 || sx > this.W + 10 || sy < -10 || sy > this.H + 20) continue;

      const walking = p.state === 'walk';
      const bob = walking ? Math.abs(Math.sin(t * 9 + p.bob)) * 1.6 * z : 0;
      const ph = 9 * z, pw = 3.2 * z;

      // Impatient people turn red-ish
      let color = p.color;
      if (p.state === 'wait' && time.totalMin - p.waitStart > 40) color = '#ff7a6b';

      ctx.fillStyle = color;
      ctx.fillRect(sx - pw / 2, sy - ph - bob - 2 * z, pw, ph);
      ctx.beginPath();
      ctx.arc(sx, sy - ph - bob - 3.5 * z, 2 * z, 0, 7);
      ctx.fill();
    }
  }

  _drawFloorLabels(ctx, tower) {
    const z = this.cam.zoom;
    if (z < 0.55) return;
    const [lo, hi] = this._visibleFloorRange();
    const x = this.sx(tower.lobbyLeftX) - 8;
    ctx.font = `${Math.max(8, 9 * z)}px monospace`;
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(160,176,200,0.6)';
    const step = z < 0.9 ? 5 : 1;
    for (let f = Math.max(lo, -C.BELOW); f <= Math.min(hi, C.ABOVE); f++) {
      if (f === 0) continue;
      if (step === 5 && f % 5 !== 0 && f !== 1) continue;
      const y = this.sy(floorTopY(f)) + C.FLOOR_H * z * 0.65;
      ctx.fillText(f < 0 ? `B${-f}` : `${f}`, x, y);
    }
  }

  // ── Weather ───────────────────────────────────────────────
  _drawWeather(ctx, time, dtReal) {
    const season = time.season;
    const wantSnow = season === 'Winter';
    const wantRain = season === 'Autumn' && (time.day % 2 === 0);
    if (!wantSnow && !wantRain) { this.precip.length = 0; return; }

    const target = wantSnow ? 120 : 160;
    while (this.precip.length < target) {
      this.precip.push({
        x: Math.random() * this.W, y: Math.random() * this.H,
        v: wantSnow ? 18 + Math.random() * 22 : 320 + Math.random() * 120,
        drift: Math.random() * 2 - 1,
      });
    }
    const dt = Math.min(dtReal, 50) / 1000;
    ctx.strokeStyle = 'rgba(190,210,235,0.5)';
    ctx.fillStyle = 'rgba(235,240,250,0.8)';
    for (const f of this.precip) {
      f.y += f.v * dt;
      f.x += f.drift * 20 * dt;
      if (f.y > this.H) { f.y = -4; f.x = Math.random() * this.W; }
      if (wantSnow) {
        ctx.fillRect(f.x, f.y, 2, 2);
      } else {
        ctx.beginPath();
        ctx.moveTo(f.x, f.y);
        ctx.lineTo(f.x - 1, f.y + 7);
        ctx.stroke();
      }
    }
  }

  // ── Build ghost & selection ───────────────────────────────
  _drawGhost(ctx, game) {
    const hv = this.hover;
    if (!hv || !hv.tool) return;
    const z = this.cam.zoom;

    if (hv.elevDrag) {
      // Elevator placement drag
      const { col, f0, f1, type, valid } = hv.elevDrag;
      const lo = Math.min(f0, f1), hi = Math.max(f0, f1);
      const x = this.sx(col * C.CELL_W);
      const yTop = this.sy(floorTopY(hi));
      const yBot = this.sy(floorTopY(lo)) + C.FLOOR_H * z;
      ctx.fillStyle = valid ? 'rgba(108,224,144,0.25)' : 'rgba(255,107,107,0.25)';
      ctx.fillRect(x, yTop, C.ELEV_W * C.CELL_W * z, yBot - yTop);
      ctx.strokeStyle = valid ? '#6fe08f' : '#ff6b6b';
      ctx.strokeRect(x, yTop, C.ELEV_W * C.CELL_W * z, yBot - yTop);
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.max(10, 11 * z)}px sans-serif`;
      ctx.textAlign = 'center';
      const def = C.ELEVATORS[type];
      const span = hi - lo;
      ctx.fillText(
        `${span} floors · ${fmt$(def.base + def.perFloor * span)}`,
        x + C.ELEV_W * C.CELL_W * z / 2, yTop - 6,
      );
      return;
    }

    if (hv.floor === null || hv.col === null) return;

    if (hv.tool === 'DEMOLISH') {
      const target = hv.demolishTarget;
      if (!target) return;
      let x, y, w, h;
      if (target.kind === 'room') {
        x = this.sx(target.obj.col * C.CELL_W);
        y = this.sy(floorTopY(target.obj.floor));
        w = target.obj.w * C.CELL_W * z; h = C.FLOOR_H * z;
      } else {
        x = this.sx(target.obj.col * C.CELL_W);
        y = this.sy(floorTopY(target.obj.top));
        w = C.ELEV_W * C.CELL_W * z;
        h = (this.sy(floorTopY(target.obj.bottom)) + C.FLOOR_H * z) - y;
      }
      ctx.fillStyle = 'rgba(255,80,80,0.3)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#ff5050';
      ctx.strokeRect(x, y, w, h);
      return;
    }

    const def = C.ROOMS[hv.tool];
    if (!def) return;
    const x = this.sx(hv.col * C.CELL_W);
    const y = this.sy(floorTopY(hv.floor));
    const w = def.w * C.CELL_W * z, h = C.FLOOR_H * z;
    ctx.fillStyle = hv.valid ? 'rgba(108,224,144,0.3)' : 'rgba(255,107,107,0.3)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = hv.valid ? '#6fe08f' : '#ff6b6b';
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.max(10, 11 * z)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(fmt$(def.cost), x + w / 2, y - 6);
  }

  _drawSelection(ctx) {
    const sel = this.selected;
    if (!sel) return;
    const z = this.cam.zoom;
    ctx.strokeStyle = '#4cc2ff';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    if (sel.kind === 'room') {
      const r = sel.obj;
      ctx.strokeRect(
        this.sx(r.col * C.CELL_W), this.sy(floorTopY(r.floor)),
        r.w * C.CELL_W * z, C.FLOOR_H * z,
      );
    } else if (sel.kind === 'shaft') {
      const s = sel.obj;
      const yTop = this.sy(floorTopY(s.top));
      ctx.strokeRect(
        this.sx(s.col * C.CELL_W), yTop,
        C.ELEV_W * C.CELL_W * z,
        this.sy(floorTopY(s.bottom)) + C.FLOOR_H * z - yTop,
      );
    }
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
  }

  // ── Floating money & confetti ─────────────────────────────
  _drawEffects(ctx, dtReal) {
    const dt = Math.min(dtReal, 50) / 1000;

    for (let i = this.moneyPops.length - 1; i >= 0; i--) {
      const m = this.moneyPops[i];
      m.age += dt;
      if (m.age > 1.6) { this.moneyPops.splice(i, 1); continue; }
      const alpha = m.age < 1.1 ? 1 : 1 - (m.age - 1.1) / 0.5;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = m.color;
      ctx.font = `bold ${Math.max(11, 13 * this.cam.zoom)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(m.text, this.sx(m.x), this.sy(m.y) - m.age * 28);
      ctx.globalAlpha = 1;
    }

    for (let i = this.confetti.length - 1; i >= 0; i--) {
      const c = this.confetti[i];
      c.age += dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.vy += 30 * dt;
      if (c.age > 5 || c.y > this.H + 20) { this.confetti.splice(i, 1); continue; }
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.age * c.spin);
      ctx.fillStyle = c.color;
      ctx.fillRect(-3, -2, 6, 4);
      ctx.restore();
    }
  }
}
