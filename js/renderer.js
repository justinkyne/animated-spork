'use strict';

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // cam = what's drawn; camT = target, eased toward each frame
    this.cam = { x: C.COLS * C.CELL_W / 2, y: floorTopY(4), zoom: 1 };
    this.camT = { ...this.cam };
    this.W = 0; this.H = 0;

    this.selected = null;        // {kind:'room'|'shaft', obj}
    this.hover = null;           // set by Input each frame

    // Effects
    this.moneyPops = [];
    this.confetti = [];
    this.precip = [];

    this._glowCache = new Map();
    this._vignette = null;
    this._shellRects = [];       // screen-space rects of the building, per frame
    this._litGlows = [];         // night window glows, per frame

    // Deterministic background decorations
    this._stars = [];
    for (let i = 0; i < 150; i++) {
      this._stars.push({ x: Math.random(), y: Math.random() * 0.72, s: Math.random() });
    }
    this._clouds = [];
    for (let i = 0; i < 10; i++) {
      this._clouds.push({
        x: Math.random() * 4800, y: 150 + Math.random() * 1800,
        w: 170 + Math.random() * 260, speed: 2 + Math.random() * 5,
        puff: 0.8 + Math.random() * 0.5,
      });
    }
    this.city = null;
    this._skyline = [];
    this._skyline2 = [];
    this._buildSkyline({ tall: 0.15, maxH: 300, gap: 1.0 });

    // Street life
    const carColors = ['#d8dde6', '#5a6e8a', '#b04848', '#caa84c', '#4c7eb0', '#3c3f4a'];
    this._cars = [];
    for (let i = 0; i < 6; i++) {
      this._cars.push({
        x: Math.random() * C.COLS * C.CELL_W * 1.6 - C.COLS * C.CELL_W * 0.3,
        dir: i % 2 === 0 ? 1 : -1,
        speed: 90 + Math.random() * 70,
        color: carColors[i % carColors.length],
      });
    }
    this._birds = [];
    for (let i = 0; i < 2; i++) {
      this._birds.push({
        x: Math.random() * 2000, y: floorTopY(20 + Math.random() * 25),
        speed: 26 + Math.random() * 14, n: 4 + Math.floor(Math.random() * 3),
        phase: Math.random() * 10,
      });
    }
    this._shoot = null;          // shooting star
    this._shootCooldown = 8;

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  // Shape the backdrop to the chosen city's real silhouette character:
  // how dense the blocks are, how high they run, and how often a true
  // high-rise punctures the skyline.
  setCity(city) {
    this.city = city;
    this._buildSkyline(city.skyline || { tall: 0.15, maxH: 300, gap: 1.0 });
  }

  _buildSkyline(s) {
    this._skyline.length = 0;
    this._skyline2.length = 0;
    let sx = -2400;
    while (sx < 4800) {
      const isTall = Math.random() < s.tall;
      const w = (isTall ? 50 : 70) + Math.random() * 130;
      const h = isTall
        ? s.maxH * (0.7 + Math.random() * 0.5)
        : 60 + Math.random() * s.maxH * 0.45;
      this._skyline.push({ x: sx, w, h });
      sx += w + (8 + Math.random() * 70) * s.gap;
    }
    sx = -2400;
    while (sx < 4800) {
      const w = 90 + Math.random() * 190;
      this._skyline2.push({ x: sx, w, h: 50 + Math.random() * s.maxH * 0.55 });
      sx += w + (20 + Math.random() * 120) * s.gap;
    }
  }

  resize() {
    const wrap = this.canvas.parentElement;
    // Cap DPR at 2 — full 3× retina costs far more than it shows on a phone
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = wrap.clientWidth;
    this.H = wrap.clientHeight;
    this.isSmall = this.W < 760;
    this.canvas.width = this.W * dpr;
    this.canvas.height = this.H * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Pre-render the vignette overlay
    this._vignette = document.createElement('canvas');
    this._vignette.width = this.W; this._vignette.height = this.H;
    const vctx = this._vignette.getContext('2d');
    const g = vctx.createRadialGradient(
      this.W / 2, this.H * 0.44, Math.min(this.W, this.H) * 0.42,
      this.W / 2, this.H * 0.5, Math.max(this.W, this.H) * 0.78);
    g.addColorStop(0, 'rgba(4,7,14,0)');
    g.addColorStop(1, 'rgba(4,7,14,0.42)');
    vctx.fillStyle = g;
    vctx.fillRect(0, 0, this.W, this.H);
  }

  // Soft radial glow sprite, cached per rgb string
  _glow(rgb) {
    if (this._glowCache.has(rgb)) return this._glowCache.get(rgb);
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0, `rgba(${rgb},0.9)`);
    grad.addColorStop(0.4, `rgba(${rgb},0.28)`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    this._glowCache.set(rgb, c);
    return c;
  }

  // ── Coordinate transforms ─────────────────────────────────
  sx(wx) { return (wx - this.cam.x) * this.cam.zoom + this.W / 2; }
  sy(wy) { return (wy - this.cam.y) * this.cam.zoom + this.H / 2; }
  wx(sx) { return (sx - this.W / 2) / this.cam.zoom + this.cam.x; }
  wy(sy) { return (sy - this.H / 2) / this.cam.zoom + this.cam.y; }

  screenToFloor(sy) {
    const wy = this.wy(sy);
    const raw = C.ABOVE - Math.floor(wy / C.FLOOR_H);
    const floor = raw <= 0 ? raw - 1 : raw;
    if (floor > C.ABOVE || floor < -C.BELOW) return null;
    return floor;
  }
  screenToCol(sx) {
    return Math.floor(this.wx(sx) / C.CELL_W);
  }

  centerOnLobby() {
    this.camT.x = C.COLS * C.CELL_W / 2;
    this.camT.y = floorTopY(5);
    this.camT.zoom = 1;
    this.cam = { ...this.camT };
  }

  zoomAt(screenX, screenY, factor) {
    // anchor math against the target camera so zooming accumulates smoothly
    const t = this.camT;
    const beforeX = (screenX - this.W / 2) / t.zoom + t.x;
    const beforeY = (screenY - this.H / 2) / t.zoom + t.y;
    t.zoom = clamp(t.zoom * factor, 0.28, 2.4);
    t.x = beforeX - (screenX - this.W / 2) / t.zoom;
    t.y = beforeY - (screenY - this.H / 2) / t.zoom;
  }

  clampCamera() {
    const margin = 600;
    for (const c of [this.cam, this.camT]) {
      c.x = clamp(c.x, -margin, C.COLS * C.CELL_W + margin);
      c.y = clamp(c.y, floorTopY(C.ABOVE) - margin, floorTopY(-C.BELOW) + C.FLOOR_H + margin);
    }
  }

  _easeCamera(dtReal) {
    const k = 1 - Math.exp(-dtReal / 1000 * 11);
    this.cam.x = lerp(this.cam.x, this.camT.x, k);
    this.cam.y = lerp(this.cam.y, this.camT.y, k);
    this.cam.zoom = lerp(this.cam.zoom, this.camT.zoom, k);
  }

  // ── Effects API ───────────────────────────────────────────
  popMoney(x, y, text, color = '#ffe28a') {
    this.moneyPops.push({ x, y, text, age: 0, color });
    if (this.moneyPops.length > 40) this.moneyPops.shift();
  }

  burstConfetti(n = 80) {
    const colors = ['#ffce54', '#4cc2ff', '#5fe39a', '#f07ac4', '#ff8a66', '#8b7bff'];
    for (let i = 0; i < n; i++) {
      this.confetti.push({
        x: Math.random() * this.W, y: -10 - Math.random() * 220,
        vx: (Math.random() - 0.5) * 50, vy: 60 + Math.random() * 90,
        color: colors[i % colors.length], age: 0,
        spin: (Math.random() - 0.5) * 9, sway: Math.random() * 6,
      });
    }
  }

  // ── Main draw ─────────────────────────────────────────────
  draw(game, dtReal) {
    const { tower, time } = game;
    const ctx = this.ctx;
    const hour = time.hourFloat;
    const night = this._nightFactor(hour);
    // Cars & birds run on game time, but stay watchable at 8×
    const envDt = Math.min(time.gameDt, dtReal * 2.2);

    this._easeCamera(dtReal);

    this._drawSky(ctx, hour, night, dtReal);
    this._drawBackdrop(ctx, night);
    this._drawGround(ctx, time, night);
    this._drawStreet(ctx, tower, time, night, envDt);
    this._drawBirds(ctx, night, time, envDt);

    this._drawTowerShadow(ctx, tower, night);
    this._drawTowerShell(ctx, tower, night);
    this._drawRooms(ctx, tower, time, night);
    this._drawLobby(ctx, tower, night);
    this._drawShafts(ctx, tower, night);
    this._drawSheen(ctx, tower, hour, night);
    this._drawRoofDetail(ctx, tower, night);
    this._drawWindowBloom(ctx, night);
    this._drawPersons(ctx, tower, time);
    this._drawFloorLabels(ctx, tower);

    this._drawWeather(ctx, time, dtReal);
    this._drawGhost(ctx, game);
    this._drawPending(ctx, game);
    this._drawSelection(ctx, dtReal);
    this._drawEffects(ctx, dtReal);

    ctx.drawImage(this._vignette, 0, 0);
  }

  _nightFactor(hour) {
    if (hour >= 7 && hour <= 18) return 0;
    if (hour > 18 && hour < 21) return (hour - 18) / 3;
    if (hour >= 21 || hour <= 5) return 1;
    return 1 - (hour - 5) / 2;
  }

  // ── Sky ───────────────────────────────────────────────────
  static HORIZON = [
    [0, '#0a0f1e'], [4.5, '#0e1426'], [6, '#3a4470'], [6.8, '#ff9a5a'],
    [7.5, '#c2d8ee'], [12, '#b4d0ec'], [16.5, '#c2d8ee'], [18.5, '#ffb46a'],
    [19.5, '#c06a72'], [20.5, '#323a60'], [22, '#121830'], [24, '#0a0f1e'],
  ];

  _stopColor(stops, hour) {
    for (let i = 0; i < stops.length - 1; i++) {
      const [h0, c0] = stops[i], [h1, c1] = stops[i + 1];
      if (hour >= h0 && hour <= h1) {
        return this._lerpHex(c0, c1, (hour - h0) / Math.max(0.001, h1 - h0));
      }
    }
    return stops[0][1];
  }

  // Accepts '#rrggbb' or 'rgb(r,g,b)' so blended colors can be re-blended
  _rgbOf(c) {
    if (c[0] === '#') {
      const p = parseInt(c.slice(1), 16);
      return [p >> 16, (p >> 8) & 255, p & 255];
    }
    const m = c.match(/\d+/g);
    return [+m[0], +m[1], +m[2]];
  }

  _lerpHex(a, b, t) {
    const A = this._rgbOf(a), B = this._rgbOf(b);
    const r = Math.round(lerp(A[0], B[0], t));
    const g = Math.round(lerp(A[1], B[1], t));
    const bl = Math.round(lerp(A[2], B[2], t));
    return `rgb(${r},${g},${bl})`;
  }

  _drawSky(ctx, hour, night, dtReal) {
    const top = this._stopColor(C.SKY, hour);
    const hz = this._stopColor(Renderer.HORIZON, hour);
    const horizonY = clamp(this.sy(groundY()), this.H * 0.3, this.H * 1.5);

    const grad = ctx.createLinearGradient(0, 0, 0, horizonY);
    grad.addColorStop(0, top);
    grad.addColorStop(0.62, this._lerpHex(top, hz, 0.45));
    grad.addColorStop(1, hz);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.W, this.H);

    // Stars + occasional shooting star
    if (night > 0.05) {
      const t = performance.now() / 1000;
      for (const s of this._stars) {
        const alpha = night * (0.35 + 0.65 * Math.abs(Math.sin(t * 0.8 + s.s * 20)));
        ctx.fillStyle = `rgba(255,255,255,${alpha * 0.85})`;
        const px = (s.x * this.W * 1.4 - this.cam.x * 0.04) % this.W;
        ctx.fillRect((px + this.W) % this.W, s.y * this.H, s.s > 0.85 ? 2 : 1, s.s > 0.85 ? 2 : 1);
      }
      this._shootCooldown -= dtReal / 1000;
      if (!this._shoot && this._shootCooldown <= 0) {
        this._shoot = { x: Math.random() * this.W * 0.7 + this.W * 0.2, y: Math.random() * this.H * 0.25, age: 0 };
        this._shootCooldown = 14 + Math.random() * 22;
      }
      if (this._shoot) {
        const sh = this._shoot;
        sh.age += dtReal / 1000;
        const d = sh.age * 600;
        ctx.strokeStyle = `rgba(255,255,255,${clamp(0.9 - sh.age, 0, 1) * night})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(sh.x - d, sh.y + d * 0.38);
        ctx.lineTo(sh.x - d - 46, sh.y + (d + 46) * 0.38);
        ctx.stroke();
        if (sh.age > 0.9) this._shoot = null;
      }
    }

    // Sun / moon
    const isDay = hour > 5.5 && hour < 20.5;
    const t = isDay ? (hour - 5.5) / 15 : ((hour >= 20.5 ? hour - 20.5 : hour + 3.5) / 9);
    const px = this.W * (0.08 + 0.84 * t);
    const py = this.H * (0.42 - 0.34 * Math.sin(t * Math.PI));
    if (isDay) {
      const low = Math.abs(t - 0.5) * 2;           // 1 near horizon
      const warm = clamp((low - 0.55) / 0.45, 0, 1);
      const bloom = this._glow(warm > 0.4 ? '255,170,110' : '255,236,170');
      ctx.drawImage(bloom, px - 130, py - 130, 260, 260);
      ctx.drawImage(bloom, px - 70, py - 70, 140, 140);
      ctx.fillStyle = this._lerpHex('#fff4c8', '#ffb070', warm);
      ctx.beginPath(); ctx.arc(px, py, 17, 0, 7); ctx.fill();
    } else {
      ctx.drawImage(this._glow('190,210,255'), px - 60, py - 60, 120, 120);
      ctx.fillStyle = '#e9edf6';
      ctx.beginPath(); ctx.arc(px, py, 13, 0, 7); ctx.fill();
      // craters
      ctx.fillStyle = 'rgba(170,182,205,0.7)';
      ctx.beginPath();
      ctx.arc(px - 4, py - 3, 2.6, 0, 7);
      ctx.arc(px + 5, py + 2, 1.8, 0, 7);
      ctx.arc(px + 1, py + 7, 1.4, 0, 7);
      ctx.fill();
    }

    // Clouds, tinted by the sky
    const now = performance.now() / 1000;
    const cloudTint = night > 0.5
      ? `rgba(36,44,66,${0.5 - night * 0.12})`
      : hour < 8 || hour > 17.5
        ? `rgba(255,214,190,${0.5 - night * 0.25})`
        : `rgba(255,255,255,${0.55})`;
    ctx.fillStyle = cloudTint;
    for (const c of this._clouds) {
      const cx = ((c.x + now * c.speed - this.cam.x * 0.1) % 5200 + 5200) % 5200 - 600;
      const cy = c.y - this.cam.y * 0.08;
      if (cx > this.W + 320 || cy < -90 || cy > this.H + 90) continue;
      ctx.beginPath();
      ctx.ellipse(cx, cy, c.w / 2, c.w / 7 * c.puff, 0, 0, 7);
      ctx.ellipse(cx - c.w / 4, cy + 7, c.w / 3.1, c.w / 9 * c.puff, 0, 0, 7);
      ctx.ellipse(cx + c.w / 4, cy + 5, c.w / 3.4, c.w / 10 * c.puff, 0, 0, 7);
      ctx.ellipse(cx + c.w / 9, cy - c.w / 14, c.w / 3.6, c.w / 9 * c.puff, 0, 0, 7);
      ctx.fill();
    }
  }

  _drawBackdrop(ctx, night) {
    const groundScreenY = this.sy(groundY());

    // Far layer — hazier, bluer
    ctx.fillStyle = this._lerpHex('#5a6c8c', '#141b30', Math.max(night, 0.18));
    for (const b of this._skyline2) {
      const px = (b.x - this.cam.x * 0.22) + this.W / 2;
      if (px + b.w < -60 || px > this.W + 60) continue;
      const h = b.h * this.cam.zoom * 0.8;
      ctx.fillRect(px, groundScreenY - h, b.w, h + 400);
    }

    // Near layer
    ctx.fillStyle = this._lerpHex('#3c4c6a', '#0f1628', night);
    for (const b of this._skyline) {
      const px = (b.x - this.cam.x * 0.35) + this.W / 2;
      if (px + b.w < -60 || px > this.W + 60) continue;
      const h = b.h * this.cam.zoom * 0.8;
      ctx.fillRect(px, groundScreenY - h, b.w, h + 400);
    }

    // Lit windows in the near silhouette at night
    if (night > 0.3) {
      ctx.fillStyle = `rgba(255,214,140,${0.28 * night})`;
      for (const b of this._skyline) {
        const px = (b.x - this.cam.x * 0.35) + this.W / 2;
        if (px + b.w < -60 || px > this.W + 60) continue;
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
    ctx.fillStyle = this._lerpHex('#33271d', '#150f08', night * 0.6);
    ctx.fillRect(0, Math.max(0, gy), this.W, this.H - Math.max(0, gy));

    const season = time.season;
    const grass = season === 'Winter' ? '#d4dde8'
      : season === 'Autumn' ? '#8a7a3a'
      : season === 'Summer' ? '#4e8a44' : '#5a9a50';
    ctx.fillStyle = this._lerpHex(grass, '#0e141c', night * 0.55);
    ctx.fillRect(0, gy, this.W, Math.max(2, 5 * this.cam.zoom));

    // City nameplate carved into the ground beside the tower
    if (this.city && this.cam.zoom > 0.5) {
      const z = this.cam.zoom;
      ctx.font = `800 ${Math.max(9, 11 * z)}px 'Outfit', sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(220,230,245,0.4)';
      ctx.fillText(
        `${this.city.name.toUpperCase()} · ${this.city.region.toUpperCase()}`,
        this.sx(C.COLS * C.CELL_W / 2) + 130 * z, gy + 16 * z);
    }
  }

  // Sidewalk, lamps, trees & cars outside the tower footprint
  _drawStreet(ctx, tower, time, night, envDt) {
    const z = this.cam.zoom;
    const gy = this.sy(groundY());
    if (gy > this.H + 60 || gy < -60) {
      // still advance the cars so they don't teleport when scrolled back
      for (const car of this._cars) car.x += car.dir * car.speed * envDt / 1000;
      return;
    }
    const exL = tower.lobbyLeftX, exR = tower.lobbyRightX;
    const sExL = this.sx(exL), sExR = this.sx(exR);

    // Sidewalk strips left & right of the building
    const walkH = Math.max(3, 6 * z);
    ctx.fillStyle = this._lerpHex('#8d92a0', '#23262e', night * 0.7);
    if (sExL > 0) ctx.fillRect(0, gy, sExL, walkH);
    if (sExR < this.W) ctx.fillRect(sExR, gy, this.W - sExR, walkH);

    // Lamps & trees at fixed world positions
    const worldL = this.wx(0), worldR = this.wx(this.W);
    const lampGlow = this._glow('255,214,150');
    for (let wxp = Math.floor(worldL / 200) * 200; wxp < worldR + 200; wxp += 200) {
      if (wxp > exL - 26 && wxp < exR + 26) continue;
      const lx = this.sx(wxp);
      const poleH = 22 * z;
      ctx.fillStyle = this._lerpHex('#4a505c', '#15181e', night * 0.5);
      ctx.fillRect(lx - 1 * z, gy - poleH, 2 * z, poleH);
      ctx.fillRect(lx - 4 * z, gy - poleH, 8 * z, 2 * z);
      if (night > 0.25) {
        ctx.fillStyle = `rgba(255,224,160,${0.95 * night})`;
        ctx.fillRect(lx - 2.5 * z, gy - poleH + 1.5 * z, 5 * z, 2.5 * z);
        ctx.globalAlpha = 0.5 * night;
        ctx.drawImage(lampGlow, lx - 24 * z, gy - poleH - 18 * z, 48 * z, 48 * z);
        ctx.globalAlpha = 1;
      }
    }
    const season = time.season;
    const leaf = season === 'Winter' ? '#cdd8e4'
      : season === 'Autumn' ? '#c08a3a'
      : season === 'Summer' ? '#3f7a3a' : '#54964c';
    for (let wxp = Math.floor(worldL / 320) * 320 + 96; wxp < worldR + 320; wxp += 320) {
      if (wxp > exL - 30 && wxp < exR + 30) continue;
      const tx = this.sx(wxp);
      ctx.fillStyle = this._lerpHex('#5a4632', '#1c150e', night * 0.6);
      ctx.fillRect(tx - 1.2 * z, gy - 10 * z, 2.4 * z, 10 * z);
      ctx.fillStyle = this._lerpHex(leaf, '#11181c', night * 0.6);
      ctx.beginPath();
      ctx.arc(tx, gy - 14 * z, 7 * z, 0, 7);
      ctx.arc(tx - 4 * z, gy - 11 * z, 5 * z, 0, 7);
      ctx.arc(tx + 4 * z, gy - 11 * z, 5 * z, 0, 7);
      ctx.fill();
    }

    // Cars (fade out near the building)
    const span = C.COLS * C.CELL_W;
    for (const car of this._cars) {
      car.x += car.dir * car.speed * envDt / 1000;
      if (car.x > span * 1.35) car.x = -span * 0.35;
      if (car.x < -span * 0.35) car.x = span * 1.35;

      const fade = car.x > exL - 90 && car.x < exR + 90
        ? clamp(Math.max(exL - car.x, car.x - exR) / 90, 0, 1) : 1;
      if (fade <= 0.02) continue;

      const cx = this.sx(car.x);
      if (cx < -40 || cx > this.W + 40) continue;
      const cw = 24 * z, chh = 7 * z;
      const cy = gy - chh - 1 * z;
      ctx.globalAlpha = fade;
      ctx.fillStyle = this._lerpHex(car.color, '#10141c', night * 0.45);
      ctx.beginPath();
      ctx.roundRect(cx - cw / 2, cy, cw, chh, 2.5 * z);
      ctx.fill();
      ctx.fillStyle = this._lerpHex('#bcd2e8', '#2a3854', night * 0.6);
      ctx.beginPath();
      ctx.roundRect(cx - cw * 0.22, cy - 3.4 * z, cw * 0.46, 4 * z, 1.6 * z);
      ctx.fill();
      ctx.fillStyle = '#15181e';
      ctx.beginPath();
      ctx.arc(cx - cw * 0.3, gy - 1.2 * z, 2.1 * z, 0, 7);
      ctx.arc(cx + cw * 0.3, gy - 1.2 * z, 2.1 * z, 0, 7);
      ctx.fill();
      if (night > 0.3) {
        const hx = cx + car.dir * cw / 2;
        ctx.fillStyle = `rgba(255,240,190,${0.9 * night})`;
        ctx.fillRect(hx - 1 * z, cy + chh * 0.4, 2 * z, 2 * z);
        ctx.globalAlpha = fade * 0.32 * night;
        ctx.drawImage(this._glow('255,230,170'),
          hx + (car.dir > 0 ? 0 : -26 * z), cy - 8 * z, 26 * z, 22 * z);
      }
      ctx.globalAlpha = 1;
    }
  }

  _drawBirds(ctx, night, time, envDt) {
    if (night > 0.2 || time.season === 'Winter') return;
    const z = this.cam.zoom;
    const t = performance.now() / 1000;
    ctx.strokeStyle = 'rgba(30,38,52,0.8)';
    ctx.lineWidth = Math.max(1, 1.1 * z);
    for (const fl of this._birds) {
      fl.x += fl.speed * envDt / 1000;
      if (fl.x > C.COLS * C.CELL_W + 800) fl.x = -800;
      for (let i = 0; i < fl.n; i++) {
        const bx = this.sx(fl.x - i * 26 - (i % 2) * 9);
        const by = this.sy(fl.y + (i % 2) * 18 + i * 4);
        if (bx < -20 || bx > this.W + 20 || by < -20 || by > this.H + 20) continue;
        const flap = Math.sin(t * 7 + fl.phase + i) * 2.4 * z;
        ctx.beginPath();
        ctx.moveTo(bx - 4 * z, by - flap);
        ctx.quadraticCurveTo(bx, by + 1.6 * z, bx + 0.2, by);
        ctx.quadraticCurveTo(bx, by + 1.6 * z, bx + 4 * z, by - flap);
        ctx.stroke();
      }
    }
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

  _drawTowerShadow(ctx, tower, night) {
    if (tower.rooms.size === 0) return;
    const gy = this.sy(groundY());
    if (gy < -40 || gy > this.H + 40) return;
    const cx = (this.sx(tower.lobbyLeftX) + this.sx(tower.lobbyRightX)) / 2;
    const w = (this.sx(tower.lobbyRightX) - this.sx(tower.lobbyLeftX)) * 0.62;
    ctx.fillStyle = `rgba(0,0,0,${0.22 - night * 0.1})`;
    ctx.beginPath();
    ctx.ellipse(cx, gy + 3, w, Math.max(3, 7 * this.cam.zoom), 0, 0, 7);
    ctx.fill();
  }

  // Per-floor backdrop so the building reads as one structure
  _drawTowerShell(ctx, tower, night) {
    const [lo, hi] = this._visibleFloorRange();
    this._spans = new Map();   // floor -> [minCol, maxCol] (kept for roof pass)
    const widen = (f, c0, c1) => {
      const s = this._spans.get(f);
      if (!s) this._spans.set(f, [c0, c1]);
      else { s[0] = Math.min(s[0], c0); s[1] = Math.max(s[1], c1); }
    };
    for (const r of tower.rooms.values()) widen(r.floor, r.col, r.col + r.w);
    for (const s of tower.shafts.values()) {
      for (let f = s.bottom; f <= s.top; f++) {
        if (f !== 0) widen(f, s.col, s.col + C.ELEV_W);
      }
    }

    this._shellRects.length = 0;
    const shellTop = this._lerpHex('#2a3550', '#161e30', night);
    const z = this.cam.zoom;
    for (const [f, [c0, c1]] of this._spans) {
      if (f < lo || f > hi) continue;
      const x = this.sx(c0 * C.CELL_W) - 3 * z;
      const y = this.sy(floorTopY(f));
      const w = (c1 - c0) * C.CELL_W * z + 6 * z;
      const h = C.FLOOR_H * z;
      ctx.fillStyle = shellTop;
      ctx.fillRect(x, y, w, h + 1);
      // Slab shading: light top lip, dark base
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(x, y, w, Math.max(1, 1.5 * z));
      ctx.fillStyle = 'rgba(0,0,0,0.38)';
      ctx.fillRect(x, y + h - 2 * z, w, 2 * z);
      this._shellRects.push([x, y, w, h]);
    }
  }

  _drawRooms(ctx, tower, time, night) {
    const [lo, hi] = this._visibleFloorRange();
    const z = this.cam.zoom;
    const showText = z >= 0.75;
    const isWorkHours = time.hour >= 8 && time.hour < 18 && !time.isWeekend;
    this._litGlows.length = 0;

    for (const r of tower.rooms.values()) {
      if (r.floor < lo || r.floor > hi) continue;
      const x = this.sx(r.col * C.CELL_W);
      const y = this.sy(floorTopY(r.floor));
      const w = r.w * C.CELL_W * z;
      const h = C.FLOOR_H * z;
      if (x + w < -20 || x > this.W + 20) continue;

      const def = r.def;

      if (!r.occupied && (r.kind === 'tenant' || r.kind === 'commercial')) {
        ctx.fillStyle = night > 0.5 ? '#171f30' : '#283349';
        ctx.fillRect(x, y, w, h - 2 * z);
        ctx.strokeStyle = 'rgba(134,148,179,0.45)';
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(x + 1, y + 1, w - 2, h - 4 * z);
        ctx.setLineDash([]);
        if (showText && w > 50) {
          ctx.fillStyle = 'rgba(134,148,179,0.85)';
          ctx.font = `700 ${Math.max(8, 9 * z)}px 'Space Grotesk', sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(r.noAccess ? 'NO ELEVATOR' : 'FOR LEASE', x + w / 2, y + h / 2 + 3);
        }
      } else {
        const base = this._lerpHex(def.color, '#0a0e16', night * 0.45);
        ctx.fillStyle = base;
        ctx.fillRect(x, y, w, h - 2 * z);
        // Soft top-light gradient for depth
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(x, y, w, h * 0.3);

        const lit = this._drawRoomInterior(ctx, r, x, y, w, h, z, night, isWorkHours, time);
        if (lit && night > 0.35) {
          this._litGlows.push([x + w / 2, y + h / 2, Math.max(w, 46 * z), night]);
        }

        if (r.kind === 'commercial' || r.kind === 'service' || r.kind === 'special') {
          ctx.fillStyle = def.accent;
          ctx.fillRect(x, y, w, Math.max(2, 3.5 * z));
          if (showText && w > 56) {
            ctx.fillStyle = night > 0.4 ? def.accent : 'rgba(255,255,255,0.92)';
            ctx.font = `800 ${Math.max(7, 8.5 * z)}px 'Outfit', sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText(def.name.toUpperCase(), x + w / 2, y + Math.max(10, 13 * z));
          }
        }
      }

      if (r.occupied && r.kind !== 'service' && r.kind !== 'special' && z > 0.5) {
        ctx.fillStyle = r.moodColor;
        ctx.beginPath();
        ctx.arc(x + 5 * z, y + 6 * z, 2.2 * z, 0, 7);
        ctx.fill();
      }

      if (r.kind === 'hotel' && r.dirty && z > 0.5) {
        ctx.fillStyle = '#c87832';
        ctx.beginPath();
        ctx.moveTo(x + w - 2, y + 2);
        ctx.lineTo(x + w - 2 - 9 * z, y + 2);
        ctx.lineTo(x + w - 2, y + 2 + 9 * z);
        ctx.fill();
      }

      if (time.totalMin - r.builtAtMin < 60 && r.builtAtMin > 0) {
        const p = (time.totalMin - r.builtAtMin) / 60;
        ctx.fillStyle = `rgba(255,206,84,${0.35 * (1 - p)})`;
        ctx.fillRect(x, y, w * p, h - 2 * z);
      }
    }
  }

  // Returns true when the room's windows are lit
  _drawRoomInterior(ctx, r, x, y, w, h, z, night, isWorkHours, time) {
    const lit = night > 0.35 && (
      (r.kind === 'hotel' && r.guestsTonight > 0) ||
      r.type === 'CONDO' ||
      (r.kind === 'commercial' && time.hour >= 8 && time.hour <= 22) ||
      (r.type === 'OFFICE' && time.hour < 21 && time.hour >= 7)
    );

    // LOD: distant rooms are just facade window strips
    if (z < 0.8) {
      const glass = lit
        ? `rgba(255,220,150,${0.6 + 0.2 * Math.sin(r.id * 7)})`
        : this._lerpHex('#a8c4de', '#141d2a', Math.max(night, 0.22));
      const pad = 2.5 * z;
      const winY = y + h * 0.22, winH = h * 0.5;
      const cellPx = C.CELL_W * z;
      for (let i = 0; i < r.w; i++) {
        if ((i + r.variant) % 3 === 2) continue;
        ctx.fillStyle = glass;
        ctx.fillRect(x + i * cellPx + pad / 2, winY, cellPx - pad, winH);
        if (!lit) {
          ctx.fillStyle = 'rgba(255,255,255,0.18)';
          ctx.fillRect(x + i * cellPx + pad / 2, winY, Math.max(1, (cellPx - pad) * 0.22), winH);
        }
      }
      return lit;
    }

    // Close-up: cutaway interior scene
    this._drawScene(ctx, r, x, y, w, h, z, night, isWorkHours, time, lit);
    return lit;
  }

  // ── Interior scenes (cutaway dollhouse view) ──────────────
  _wallColor(type, night) {
    if (!this._wallCache) this._wallCache = new Map();
    const key = type + '|' + Math.round(night * 8);
    if (!this._wallCache.has(key)) {
      const def = C.ROOMS[type];
      const day = this._lerpHex(def.color, '#e7ebf2', 0.62);
      this._wallCache.set(key, this._lerpHex(day, '#1a2030', night * 0.55));
    }
    return this._wallCache.get(key);
  }

  // A tiny standing/seated person inside a room
  _figure(ctx, fx, footY, z, color, seated = false) {
    const bh = seated ? 4.5 * z : 6.5 * z;
    ctx.fillStyle = color;
    ctx.fillRect(fx - 1.5 * z, footY - bh, 3 * z, bh);
    ctx.fillStyle = '#e8c4a0';
    ctx.beginPath(); ctx.arc(fx, footY - bh - 1.8 * z, 1.9 * z, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(40,30,22,0.85)';
    ctx.beginPath(); ctx.arc(fx, footY - bh - 2.5 * z, 1.7 * z, Math.PI, 0); ctx.fill();
  }

  _drawScene(ctx, r, x, y, w, h, z, night, isWorkHours, time, lit) {
    const def = r.def;
    const fy = y + h - 3 * z;                  // interior floor line
    const dark = 'rgba(16,20,30,0.85)';
    const wood = this._lerpHex('#8a6a48', '#241c12', night * 0.5);
    const accent = def.accent;

    // Wall + floor + ambient light wash
    ctx.fillStyle = this._wallColor(r.type, night);
    ctx.fillRect(x, y + 2 * z, w, h - 4 * z);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x, fy, w, 3 * z);
    if (lit) {
      ctx.fillStyle = 'rgba(255,214,150,0.16)';
      ctx.fillRect(x, y + 2 * z, w, h - 4 * z);
    }
    // Faint mullions keep the "behind glass" feel
    ctx.fillStyle = `rgba(255,255,255,${night > 0.4 ? 0.04 : 0.1})`;
    for (let i = 1; i < r.w; i += 2) {
      ctx.fillRect(x + i * C.CELL_W * z, y + 2 * z, Math.max(1, 0.8 * z), h - 4 * z);
    }

    const seed = r.id * 7919;
    const rng = n => ((seed + n * 2654435761) % 1000) / 1000;

    switch (r.type) {
      case 'OFFICE': {
        for (let i = 0; i < 3; i++) {
          const dx = x + w * (0.14 + i * 0.3);
          ctx.fillStyle = wood;
          ctx.fillRect(dx, fy - 7 * z, 13 * z, 1.6 * z);            // desktop
          ctx.fillRect(dx + 1 * z, fy - 7 * z, 1.2 * z, 7 * z);     // legs
          ctx.fillRect(dx + 10.5 * z, fy - 7 * z, 1.2 * z, 7 * z);
          ctx.fillStyle = lit || isWorkHours ? '#bfe3ff' : '#3a4a60';
          ctx.fillRect(dx + 3 * z, fy - 12 * z, 5 * z, 3.6 * z);    // monitor
          ctx.fillStyle = dark;
          ctx.fillRect(dx + 5 * z, fy - 8.4 * z, 1 * z, 1.6 * z);   // stand
          if (r.occupied && isWorkHours) {
            this._figure(ctx, dx - 2.5 * z, fy, z, '#86b4f0', true);
          }
        }
        ctx.fillStyle = lit ? '#ffe9b0' : 'rgba(255,255,255,0.25)'; // ceiling light
        ctx.fillRect(x + w * 0.3, y + 4 * z, w * 0.4, 1.4 * z);
        break;
      }
      case 'CONDO': {
        ctx.fillStyle = accent;                                      // sofa
        ctx.beginPath();
        ctx.roundRect(x + w * 0.12, fy - 6 * z, 16 * z, 6 * z, 2 * z);
        ctx.roundRect(x + w * 0.12, fy - 9.5 * z, 4 * z, 6 * z, 1.5 * z);
        ctx.fill();
        ctx.fillStyle = dark;                                        // TV + stand
        ctx.fillRect(x + w * 0.62, fy - 11 * z, 9 * z, 5.5 * z);
        ctx.fillStyle = wood;
        ctx.fillRect(x + w * 0.6, fy - 4.5 * z, 12 * z, 1.4 * z);
        if (lit && time.hour >= 18) {                                // TV glow
          ctx.fillStyle = `rgba(150,200,255,${0.5 + 0.3 * Math.sin(performance.now() / 300 + r.id)})`;
          ctx.fillRect(x + w * 0.63, fy - 10.6 * z, 8.2 * z, 4.7 * z);
        }
        ctx.fillStyle = '#3f7a3a';                                   // plant
        ctx.beginPath(); ctx.arc(x + w * 0.9, fy - 7 * z, 3 * z, 0, 7); ctx.fill();
        ctx.fillStyle = '#7a5a3a';
        ctx.fillRect(x + w * 0.9 - 1.4 * z, fy - 4.5 * z, 2.8 * z, 4.5 * z);
        if (lit) {                                                   // floor lamp
          ctx.fillStyle = '#ffd98a';
          ctx.beginPath(); ctx.arc(x + w * 0.45, fy - 12 * z, 2.2 * z, 0, 7); ctx.fill();
        }
        if (r.occupied && (time.hour >= 18 || time.hour < 8)) {
          this._figure(ctx, x + w * 0.3, fy, z, '#8fe0a0', true);
        }
        break;
      }
      case 'HOTEL': case 'SUITE': {
        const beds = r.type === 'SUITE' ? 2 : 1;
        for (let i = 0; i < beds; i++) {
          const bx = x + w * (0.12 + i * 0.42);
          ctx.fillStyle = dark;                                      // headboard
          ctx.fillRect(bx, fy - 9 * z, 1.8 * z, 9 * z);
          ctx.fillStyle = r.dirty ? '#b8a890' : '#e8e4da';           // mattress
          ctx.beginPath();
          ctx.roundRect(bx + 1.8 * z, fy - 5.5 * z, 14 * z, 4 * z, 1.5 * z);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.fillRect(bx + 2.6 * z, fy - 6.5 * z, 3.5 * z, 2 * z);  // pillow
          if (r.guestsTonight > 0 && (time.hour >= 22 || time.hour < 8)) {
            ctx.fillStyle = accent;                                  // sleeping guest
            ctx.beginPath();
            ctx.roundRect(bx + 6 * z, fy - 6.8 * z, 8 * z, 2.4 * z, 1.2 * z);
            ctx.fill();
          }
        }
        ctx.fillStyle = wood;                                        // nightstand
        ctx.fillRect(x + w * 0.78, fy - 5 * z, 4.5 * z, 5 * z);
        ctx.fillStyle = lit ? '#ffd98a' : '#5a5a6a';                 // lamp
        ctx.beginPath(); ctx.arc(x + w * 0.81, fy - 7 * z, 1.6 * z, 0, 7); ctx.fill();
        if (r.type === 'SUITE') {                                    // chandelier
          ctx.fillStyle = lit ? '#ffe9b0' : '#8a8a70';
          for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.arc(x + w * 0.5 + (i - 1) * 3 * z, y + 7 * z, 1.2 * z, 0, 7);
            ctx.fill();
          }
        }
        if (r.dirty) {                                               // mess
          ctx.fillStyle = 'rgba(140,110,70,0.7)';
          for (let i = 0; i < 4; i++) {
            ctx.fillRect(x + w * (0.2 + rng(i) * 0.6), fy - 1.5 * z, 2.5 * z, 1.5 * z);
          }
        }
        break;
      }
      case 'FAST_FOOD': {
        ctx.fillStyle = accent;                                      // counter
        ctx.fillRect(x + w * 0.55, fy - 7 * z, w * 0.32, 1.8 * z);
        ctx.fillStyle = dark;
        ctx.fillRect(x + w * 0.57, fy - 5.2 * z, 1.4 * z, 5.2 * z);
        ctx.fillRect(x + w * 0.83, fy - 5.2 * z, 1.4 * z, 5.2 * z);
        ctx.fillStyle = lit ? '#fff2c8' : '#cfd4dc';                 // menu board
        ctx.fillRect(x + w * 0.58, y + 5 * z, w * 0.28, 5 * z);
        ctx.fillStyle = 'rgba(60,50,40,0.7)';
        for (let i = 0; i < 3; i++) {
          ctx.fillRect(x + w * 0.6, y + (6 + i * 1.3) * z, w * 0.22, 0.6 * z);
        }
        for (let i = 0; i < 3; i++) {                                // stools
          const sx2 = x + w * (0.12 + i * 0.13);
          ctx.fillStyle = accent;
          ctx.beginPath(); ctx.arc(sx2, fy - 4.5 * z, 1.8 * z, 0, 7); ctx.fill();
          ctx.fillStyle = dark;
          ctx.fillRect(sx2 - 0.7 * z, fy - 4 * z, 1.4 * z, 4 * z);
        }
        if (r.occupied && time.hour >= 7 && time.hour <= 22) {
          this._figure(ctx, x + w * 0.25, fy, z, '#e096d8', true);
        }
        break;
      }
      case 'SHOP': {
        for (let i = 0; i < 2; i++) {                                // shelf units
          const sx2 = x + w * (0.1 + i * 0.38);
          ctx.fillStyle = wood;
          ctx.fillRect(sx2, fy - 11 * z, w * 0.28, 11 * z);
          ctx.fillStyle = this._wallColor(r.type, night);
          ctx.fillRect(sx2 + 1 * z, fy - 10 * z, w * 0.28 - 2 * z, 3.6 * z);
          ctx.fillRect(sx2 + 1 * z, fy - 5.4 * z, w * 0.28 - 2 * z, 3.6 * z);
          const goods = ['#e87f8a', '#7fb2e8', '#e8d36a', '#8fd9a0'];
          for (let g = 0; g < 4; g++) {
            ctx.fillStyle = goods[(g + i) % 4];
            ctx.fillRect(sx2 + (1.6 + g * 3) * z, fy - 9.4 * z, 2.2 * z, 2.6 * z);
            ctx.fillStyle = goods[(g + i + 2) % 4];
            ctx.fillRect(sx2 + (1.6 + g * 3) * z, fy - 4.8 * z, 2.2 * z, 2.6 * z);
          }
        }
        ctx.fillStyle = accent;                                      // register
        ctx.fillRect(x + w * 0.82, fy - 6 * z, 7 * z, 6 * z);
        break;
      }
      case 'RESTAURANT': {
        for (let i = 0; i < 3; i++) {
          const tx = x + w * (0.14 + i * 0.28);
          ctx.fillStyle = '#ece8e0';                                 // tablecloth
          ctx.beginPath();
          ctx.moveTo(tx - 5 * z, fy - 6 * z);
          ctx.lineTo(tx + 5 * z, fy - 6 * z);
          ctx.lineTo(tx + 6.5 * z, fy - 2 * z);
          ctx.lineTo(tx - 6.5 * z, fy - 2 * z);
          ctx.fill();
          ctx.fillStyle = dark;
          ctx.fillRect(tx - 0.8 * z, fy - 2 * z, 1.6 * z, 2 * z);
          ctx.fillStyle = lit ? '#ffd98a' : '#9a9a8a';               // pendant light
          ctx.beginPath(); ctx.arc(tx, y + 7 * z, 1.6 * z, 0, 7); ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.25)';
          ctx.beginPath(); ctx.moveTo(tx, y + 2 * z); ctx.lineTo(tx, y + 5.5 * z); ctx.stroke();
          const dinner = time.hour >= 18 && time.hour <= 22;
          const lunch = time.hour >= 11 && time.hour <= 14;
          if (r.occupied && (dinner || lunch)) {
            this._figure(ctx, tx - 7.5 * z, fy, z, '#e096d8', true);
            this._figure(ctx, tx + 7.5 * z, fy, z, '#f0c876', true);
          }
        }
        break;
      }
      case 'CINEMA': {
        ctx.fillStyle = '#0c0f18';                                   // dark hall
        ctx.fillRect(x + 1 * z, y + 2 * z, w - 2 * z, h - 5 * z);
        const flick = 0.55 + 0.35 * Math.sin(performance.now() / 180 + r.id);
        ctx.fillStyle = `rgba(190,215,255,${time.hour >= 10 && time.hour <= 23 ? flick : 0.08})`;
        ctx.fillRect(x + w * 0.06, y + 5 * z, w * 0.2, h * 0.55);    // screen
        for (let row = 0; row < 3; row++) {                          // tiered seats
          for (let s = 0; s < 5; s++) {
            ctx.fillStyle = '#5d3a8f';
            ctx.fillRect(
              x + w * (0.38 + row * 0.2) + s * 2.8 * z,
              fy - (3 + row * 2.5) * z, 2.2 * z, 3 * z + row * 2.5 * z * 0);
          }
        }
        break;
      }
      case 'PARTY_HALL': {
        const colors = ['#ffce54', '#4cc2ff', '#f07ac4', '#8fd9a0'];
        for (let i = 0; i < 8; i++) {                                // bunting
          ctx.fillStyle = colors[i % 4];
          const bx = x + w * (0.08 + i * 0.115);
          ctx.beginPath();
          ctx.moveTo(bx, y + 4 * z);
          ctx.lineTo(bx + 3 * z, y + 4 * z);
          ctx.lineTo(bx + 1.5 * z, y + 7.5 * z);
          ctx.fill();
        }
        if (night > 0.3) {                                           // disco ball
          ctx.fillStyle = '#cdd6e4';
          ctx.beginPath(); ctx.arc(x + w / 2, y + 10 * z, 2.5 * z, 0, 7); ctx.fill();
          const tt = performance.now() / 400;
          for (let i = 0; i < 4; i++) {
            ctx.fillStyle = `rgba(${colors[i % 4] === '#ffce54' ? '255,206,84' : '140,200,255'},${0.3 + 0.3 * Math.sin(tt + i)})`;
            ctx.fillRect(x + w * (0.2 + 0.2 * i) + Math.sin(tt * 2 + i) * 4 * z, fy - 12 * z + Math.cos(tt + i) * 4 * z, 1.6 * z, 1.6 * z);
          }
        }
        for (let i = 0; i < 2; i++) {                                // round tables
          const tx = x + w * (0.25 + i * 0.45);
          ctx.fillStyle = '#ece8e0';
          ctx.beginPath(); ctx.ellipse(tx, fy - 4 * z, 6 * z, 1.8 * z, 0, 0, 7); ctx.fill();
          ctx.fillStyle = dark;
          ctx.fillRect(tx - 0.8 * z, fy - 4 * z, 1.6 * z, 4 * z);
        }
        break;
      }
      case 'MEDICAL': {
        for (let i = 0; i < 2; i++) {
          const bx = x + w * (0.12 + i * 0.4);
          ctx.fillStyle = '#dfe5ee';                                 // bed
          ctx.beginPath();
          ctx.roundRect(bx, fy - 5.5 * z, 13 * z, 3.5 * z, 1.2 * z);
          ctx.fill();
          ctx.fillStyle = dark;
          ctx.fillRect(bx + 1 * z, fy - 2 * z, 1.2 * z, 2 * z);
          ctx.fillRect(bx + 11 * z, fy - 2 * z, 1.2 * z, 2 * z);
          ctx.strokeStyle = 'rgba(200,210,225,0.6)';                 // curtain rail
          ctx.beginPath();
          ctx.moveTo(bx + 14.5 * z, y + 5 * z);
          ctx.lineTo(bx + 14.5 * z, fy - 2 * z);
          ctx.stroke();
        }
        ctx.fillStyle = '#e05a6a';                                   // wall cross
        ctx.fillRect(x + w * 0.86, y + 6 * z, 5 * z, 1.8 * z);
        ctx.fillRect(x + w * 0.86 + 1.6 * z, y + 4.4 * z, 1.8 * z, 5 * z);
        break;
      }
      case 'SECURITY': {
        for (let i = 0; i < 4; i++) {                                // monitor wall
          const mx = x + w * 0.12 + (i % 2) * 6.5 * z;
          const my = y + 5 * z + Math.floor(i / 2) * 5 * z;
          ctx.fillStyle = `rgba(110,180,255,${0.4 + 0.3 * Math.sin(performance.now() / 500 + i * 2)})`;
          ctx.fillRect(mx, my, 5.5 * z, 4 * z);
          ctx.strokeStyle = dark;
          ctx.strokeRect(mx, my, 5.5 * z, 4 * z);
        }
        ctx.fillStyle = wood;                                        // desk + guard
        ctx.fillRect(x + w * 0.55, fy - 6.5 * z, 14 * z, 1.6 * z);
        this._figure(ctx, x + w * 0.62, fy, z, '#9a9ae0', true);
        break;
      }
      case 'HOUSEKEEPING': {
        for (let i = 0; i < 2; i++) {                                // washers
          const wx2 = x + w * (0.12 + i * 0.16);
          ctx.fillStyle = '#cfd6e0';
          ctx.fillRect(wx2, fy - 8 * z, 7 * z, 8 * z);
          ctx.fillStyle = '#3a4a60';
          ctx.beginPath(); ctx.arc(wx2 + 3.5 * z, fy - 4 * z, 2.2 * z, 0, 7); ctx.fill();
        }
        ctx.fillStyle = wood;                                        // towel shelf
        ctx.fillRect(x + w * 0.55, fy - 10 * z, w * 0.34, 10 * z);
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = ['#e8e4da', '#c4d2e8', '#e8d8c4'][i];
          ctx.fillRect(x + w * 0.57, fy - (8.6 - i * 2.8) * z, w * 0.3, 1.8 * z);
        }
        break;
      }
      case 'PARKING': {
        ctx.fillStyle = '#3a3f48';                                   // concrete
        ctx.fillRect(x, y + 2 * z, w, h - 4 * z);
        ctx.fillStyle = 'rgba(232,211,106,0.6)';                     // lane line
        ctx.fillRect(x + 2 * z, fy - 0.5 * z, w - 4 * z, 0.8 * z);
        if (rng(1) > 0.3) {                                          // parked car
          const cc = ['#b04848', '#4c7eb0', '#caa84c', '#d8dde6'][Math.floor(rng(2) * 4)];
          ctx.fillStyle = cc;
          ctx.beginPath();
          ctx.roundRect(x + w * 0.18, fy - 5.5 * z, 16 * z, 4 * z, 1.8 * z);
          ctx.fill();
          ctx.fillStyle = '#15181e';
          ctx.beginPath();
          ctx.arc(x + w * 0.18 + 3.5 * z, fy - 1.4 * z, 1.6 * z, 0, 7);
          ctx.arc(x + w * 0.18 + 12.5 * z, fy - 1.4 * z, 1.6 * z, 0, 7);
          ctx.fill();
        }
        break;
      }
      case 'SKY_LOBBY': {
        ctx.fillStyle = this._lerpHex('#dce4ee', '#2a3244', night * 0.6);  // marble
        ctx.fillRect(x, fy - 1.5 * z, w, 1.5 * z);
        for (let i = 0; i < 3; i++) {                                // tall windows
          const wx2 = x + w * (0.1 + i * 0.32);
          ctx.fillStyle = night > 0.4
            ? 'rgba(20,28,44,0.8)' : 'rgba(190,220,245,0.55)';
          ctx.fillRect(wx2, y + 4 * z, w * 0.22, h - 10 * z);
        }
        ctx.fillStyle = '#3f7a3a';                                   // planters
        ctx.beginPath();
        ctx.arc(x + w * 0.08, fy - 5 * z, 2.6 * z, 0, 7);
        ctx.arc(x + w * 0.92, fy - 5 * z, 2.6 * z, 0, 7);
        ctx.fill();
        ctx.fillStyle = wood;                                        // bench
        ctx.fillRect(x + w * 0.42, fy - 4 * z, 14 * z, 1.4 * z);
        ctx.fillRect(x + w * 0.44, fy - 2.6 * z, 1.2 * z, 2.6 * z);
        ctx.fillRect(x + w * 0.42 + 12 * z, fy - 2.6 * z, 1.2 * z, 2.6 * z);
        break;
      }
      case 'CROWN': {
        const glow = this._glow('255,220,120');
        const t2 = performance.now() / 900;
        ctx.globalAlpha = 0.55 + 0.25 * Math.sin(t2);
        ctx.drawImage(glow, x + w / 2 - h * 0.9, y - h * 0.4, h * 1.8, h * 1.8);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffe28a';                                   // spire
        ctx.beginPath();
        ctx.moveTo(x + w / 2, y + 3 * z);
        ctx.lineTo(x + w / 2 + 6 * z, fy);
        ctx.lineTo(x + w / 2 - 6 * z, fy);
        ctx.fill();
        ctx.fillStyle = '#fff4cc';                                   // orb
        ctx.beginPath(); ctx.arc(x + w / 2, y + 6 * z, 3 * z, 0, 7); ctx.fill();
        for (let i = 0; i < 5; i++) {                                // sparkles
          const a = t2 * 1.4 + i * 1.26;
          ctx.fillStyle = `rgba(255,236,170,${0.4 + 0.4 * Math.sin(a * 3)})`;
          ctx.fillRect(
            x + w / 2 + Math.cos(a) * w * 0.3,
            y + h / 2 + Math.sin(a * 1.7) * h * 0.3, 1.8 * z, 1.8 * z);
        }
        break;
      }
    }
  }

  // Soft additive bloom for lit windows — batched after the room pass
  _drawWindowBloom(ctx, night) {
    if (night <= 0.35 || this._litGlows.length === 0) return;
    const sprite = this._glow('255,200,120');
    ctx.globalCompositeOperation = 'lighter';
    for (const [cx, cy, size, n] of this._litGlows) {
      ctx.globalAlpha = 0.10 * n;
      ctx.drawImage(sprite, cx - size, cy - size * 0.8, size * 2, size * 1.6);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // Diagonal sun reflection sweeping across the glass during the day
  _drawSheen(ctx, tower, hour, night) {
    if (night > 0.15 || this._shellRects.length === 0) return;
    const dayT = clamp((hour - 7) / 12, 0, 1);
    const x0 = this.sx(tower.lobbyLeftX), x1 = this.sx(tower.lobbyRightX);
    if (x1 - x0 < 10) return;
    const bandX = lerp(x0 - 140, x1 + 60, dayT);

    ctx.save();
    ctx.beginPath();
    for (const [x, y, w, h] of this._shellRects) ctx.rect(x, y, w, h);
    ctx.clip();
    const grad = ctx.createLinearGradient(bandX, 0, bandX + 170, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, `rgba(255,255,255,${0.07 * (1 - night)})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.restore();
  }

  // Roof parapets + a blinking antenna on the summit
  _drawRoofDetail(ctx, tower, night) {
    if (!this._spans || this._spans.size === 0) return;
    const z = this.cam.zoom;

    let topFloor = -Infinity, topSpan = null;
    for (const [f, span] of this._spans) {
      if (f > 0 && f > topFloor) { topFloor = f; topSpan = span; }
    }

    const cap = this._lerpHex('#46557a', '#1c2438', night);
    const box = this._lerpHex('#5d6b8c', '#222a40', night);
    for (const [f, [c0, c1]] of this._spans) {
      if (f <= 0) continue;
      const above = this._spans.get(f + 1);
      if (above && above[0] <= c0 && above[1] >= c1) continue;
      const x = this.sx(c0 * C.CELL_W) - 3 * z;
      const y = this.sy(floorTopY(f));
      const w = (c1 - c0) * C.CELL_W * z + 6 * z;
      ctx.fillStyle = cap;
      ctx.fillRect(x, y - 2.5 * z, w, 3 * z);

      // AC units & vents on exposed roofs when zoomed in
      if (z >= 0.8 && w > 60 * z) {
        ctx.fillStyle = box;
        ctx.fillRect(x + w * 0.18, y - 7 * z, 8 * z, 4.5 * z);
        ctx.fillRect(x + w * 0.6, y - 6 * z, 6 * z, 3.5 * z);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        for (let i = 0; i < 3; i++) {
          ctx.fillRect(x + w * 0.18 + (1 + i * 2.4) * z, y - 6 * z, 1.1 * z, 2.6 * z);
        }
      }
    }

    if (topSpan && topFloor >= 8) {
      const cx = this.sx((topSpan[0] + topSpan[1]) / 2 * C.CELL_W);
      const ry = this.sy(floorTopY(topFloor)) - 2.5 * z;
      ctx.strokeStyle = this._lerpHex('#5a6a90', '#222c44', night);
      ctx.lineWidth = Math.max(1, 1.6 * z);
      ctx.beginPath();
      ctx.moveTo(cx, ry);
      ctx.lineTo(cx, ry - 26 * z);
      ctx.stroke();
      const blink = (Math.sin(performance.now() / 480) + 1) / 2;
      ctx.fillStyle = `rgba(255,70,70,${0.35 + 0.65 * blink})`;
      ctx.beginPath(); ctx.arc(cx, ry - 27 * z, 2.2 * z, 0, 7); ctx.fill();
      if (night > 0.3) {
        ctx.globalAlpha = blink * 0.5 * night;
        ctx.drawImage(this._glow('255,80,80'), cx - 12 * z, ry - 39 * z, 24 * z, 24 * z);
        ctx.globalAlpha = 1;
      }
    }
  }

  _drawLobby(ctx, tower, night) {
    const y = this.sy(floorTopY(1));
    const h = C.FLOOR_H * this.cam.zoom;
    if (y > this.H || y + h < 0) return;
    const x0 = this.sx(tower.lobbyLeftX);
    const x1 = this.sx(tower.lobbyRightX);
    const z = this.cam.zoom;

    const grad = ctx.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, this._lerpHex('#ded6c4', '#403c32', night * 0.7));
    grad.addColorStop(1, this._lerpHex('#b8b0a0', '#2c2a24', night * 0.7));
    ctx.fillStyle = grad;
    ctx.fillRect(x0, y, x1 - x0, h);

    ctx.fillStyle = this._lerpHex('#988e7c', '#242220', night * 0.7);
    const colSpacing = 10 * C.CELL_W * z;
    for (let px = x0 + colSpacing / 2; px < x1; px += colSpacing) {
      ctx.fillRect(px, y, Math.max(2, 3 * z), h);
    }
    if (night > 0.3) {
      ctx.fillStyle = `rgba(255,214,140,${0.2 * night})`;
      ctx.fillRect(x0, y, x1 - x0, h);
    }

    // Close-up dressing: reception, planters, revolving doors, chandeliers
    if (z >= 0.8 && x1 - x0 > 120) {
      const fy = y + h - 2 * z;
      const cx = (x0 + x1) / 2;
      ctx.fillStyle = this._lerpHex('#7a5a3a', '#241c12', night * 0.5);  // reception
      ctx.beginPath();
      ctx.roundRect(cx - 11 * z, fy - 7 * z, 22 * z, 7 * z, [2 * z, 2 * z, 0, 0]);
      ctx.fill();
      ctx.fillStyle = this._lerpHex('#cfc4ac', '#3a352a', night * 0.6);
      ctx.fillRect(cx - 12 * z, fy - 7.8 * z, 24 * z, 1.6 * z);
      this._figure(ctx, cx, fy, z, '#b0b8c8', true);

      for (const px of [x0 + 24 * z, x1 - 24 * z]) {                     // planters
        ctx.fillStyle = '#3f7a3a';
        ctx.beginPath();
        ctx.arc(px, fy - 6.5 * z, 3.2 * z, 0, 7);
        ctx.arc(px - 2 * z, fy - 4.5 * z, 2.4 * z, 0, 7);
        ctx.arc(px + 2 * z, fy - 4.5 * z, 2.4 * z, 0, 7);
        ctx.fill();
        ctx.fillStyle = '#6a5038';
        ctx.fillRect(px - 2.4 * z, fy - 3 * z, 4.8 * z, 3 * z);
      }

      ctx.strokeStyle = `rgba(180,200,220,${night > 0.4 ? 0.5 : 0.7})`;  // revolving doors
      ctx.lineWidth = Math.max(1, 1.1 * z);
      for (const px of [x0 + 8 * z, x1 - 8 * z]) {
        ctx.beginPath();
        ctx.arc(px, fy, 6 * z, Math.PI, 0);
        ctx.moveTo(px, fy);
        ctx.lineTo(px, fy - 6 * z);
        ctx.stroke();
      }

      if (night > 0.3) {                                                 // chandeliers
        ctx.fillStyle = `rgba(255,224,160,${0.85 * night})`;
        const span = x1 - x0;
        for (let i = 1; i <= 3; i++) {
          const px = x0 + span * i / 4;
          ctx.beginPath();
          ctx.arc(px, y + 6 * z, 1.8 * z, 0, 7);
          ctx.arc(px - 3 * z, y + 7.5 * z, 1.2 * z, 0, 7);
          ctx.arc(px + 3 * z, y + 7.5 * z, 1.2 * z, 0, 7);
          ctx.fill();
        }
      }
    }
    // Branding over the doors when zoomed in
    if (z > 0.85 && x1 - x0 > 220) {
      ctx.fillStyle = night > 0.4 ? '#ffd98a' : '#8a7a50';
      ctx.font = `800 ${Math.max(8, 9 * z)}px 'Outfit', sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('S K Y R I S E', (x0 + x1) / 2, y + h * 0.42);
    }
    ctx.fillStyle = '#b03838';
    ctx.fillRect(x0 - 4 * z, y - 3 * z, 14 * z, 4 * z);
    ctx.fillRect(x1 - 10 * z, y - 3 * z, 14 * z, 4 * z);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(x0, y + h - 2 * z, x1 - x0, 2 * z);
  }

  _drawShafts(ctx, tower, night) {
    const z = this.cam.zoom;
    for (const s of tower.shafts.values()) {
      const x = this.sx(s.col * C.CELL_W);
      const w = C.ELEV_W * C.CELL_W * z;
      const yTop = this.sy(floorTopY(s.top));
      const yBot = this.sy(floorTopY(s.bottom)) + C.FLOOR_H * z;
      if (x + w < 0 || x > this.W || yTop > this.H || yBot < 0) continue;

      const wellGrad = ctx.createLinearGradient(x, 0, x + w, 0);
      if (s.type === 'EXPRESS') {
        wellGrad.addColorStop(0, '#1c1018'); wellGrad.addColorStop(0.5, '#2a1822'); wellGrad.addColorStop(1, '#1c1018');
      } else {
        wellGrad.addColorStop(0, '#141a28'); wellGrad.addColorStop(0.5, '#1e2638'); wellGrad.addColorStop(1, '#141a28');
      }
      ctx.fillStyle = wellGrad;
      ctx.fillRect(x, yTop, w, yBot - yTop);
      ctx.strokeStyle = s.def.color;
      ctx.lineWidth = Math.max(1, 1.2 * z);
      ctx.strokeRect(x, yTop, w, yBot - yTop);

      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      for (let f = s.bottom; f <= s.top; f++) {
        if (f === 0) continue;
        const fy = this.sy(floorTopY(f)) + C.FLOOR_H * z - 1;
        ctx.fillRect(x, fy, w, 1);
        if (s.type === 'EXPRESS' && s.servesFloor(f, tower)) {
          ctx.fillStyle = s.def.color;
          ctx.fillRect(x - 3 * z, fy - 2, 3 * z, 3);
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
        }
      }

      for (const car of s.cars) {
        const cy = this.sy(floorTopY(car.floor));
        const ch = C.FLOOR_H * z;
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + w / 2, yTop);
        ctx.lineTo(x + w / 2, cy);
        ctx.stroke();
        const doorOpen = car.doorT > 0;
        ctx.fillStyle = doorOpen ? '#ffe9a8' : s.def.color;
        ctx.beginPath();
        ctx.roundRect(x + 1.5 * z, cy + 2 * z, w - 3 * z, ch - 5 * z, 1.5 * z);
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(x + 1.5 * z, cy + 2 * z, w - 3 * z, 3 * z);
        if (doorOpen && night > 0.3) {
          ctx.globalAlpha = 0.4 * night;
          ctx.drawImage(this._glow('255,224,150'), x - w * 0.4, cy - ch * 0.3, w * 1.8, ch * 1.6);
          ctx.globalAlpha = 1;
        }
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
      let px = p.x;
      if (p.state === 'wait' && p.shaft) {
        const qi = p.shaft.queueIndex(p);
        const side = p.x >= p.shaft.centerX ? 1 : -1;
        px = p.shaft.centerX + side * (C.CELL_W * 2 + qi * 5);
      }
      const sx = this.sx(px);
      const sy = this.sy(floorTopY(p.floor)) + C.FLOOR_H * z;
      if (sx < -10 || sx > this.W + 10 || sy < -10 || sy > this.H + 20) continue;

      const walking = p.state === 'walk';
      const phase = t * 10 + p.bob;
      const bob = walking ? Math.abs(Math.sin(phase)) * 1.2 * z : 0;
      const legH = 3.4 * z, torsoH = 5.2 * z, pw = 3 * z;
      const hipY = sy - 1.2 * z - legH - bob;

      let color = p.color;
      if (p.state === 'wait' && time.totalMin - p.waitStart > 40) color = '#ff7a6b';

      // ground contact shadow
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(sx, sy - 1 * z, 2.6 * z, 0.9 * z, 0, 0, 7);
      ctx.fill();

      // legs (scissor while walking)
      const swing = walking ? Math.sin(phase) * 1.8 * z : 0.7 * z;
      ctx.strokeStyle = this._lerpHex(color, '#10141c', 0.45);
      ctx.lineWidth = Math.max(1, 1.1 * z);
      ctx.beginPath();
      ctx.moveTo(sx, hipY);
      ctx.lineTo(sx - swing, sy - 1 * z);
      ctx.moveTo(sx, hipY);
      ctx.lineTo(sx + swing, sy - 1 * z);
      ctx.stroke();

      // torso
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(sx - pw / 2, hipY - torsoH, pw, torsoH + 0.6 * z, pw / 2);
      ctx.fill();

      // head + hair
      ctx.fillStyle = '#e8c4a0';
      ctx.beginPath();
      ctx.arc(sx, hipY - torsoH - 1.7 * z, 1.9 * z, 0, 7);
      ctx.fill();
      ctx.fillStyle = ['#2a2018', '#5a3a1c', '#777777', '#1a1a22'][Math.floor(p.tint * 4)];
      ctx.beginPath();
      ctx.arc(sx, hipY - torsoH - 2.3 * z, 1.75 * z, Math.PI, 0);
      ctx.fill();
    }
  }

  _drawFloorLabels(ctx, tower) {
    const z = this.cam.zoom;
    if (z < 0.55) return;
    const [lo, hi] = this._visibleFloorRange();
    const x = this.sx(tower.lobbyLeftX) - 10;
    ctx.font = `${Math.max(8, 9 * z)}px 'Space Grotesk', monospace`;
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(160,176,200,0.55)';
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

    const target = (wantSnow ? 130 : 170) * (this.isSmall ? 0.5 : 1);
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
      const { col, f0, f1, type, valid } = hv.elevDrag;
      const lo = Math.min(f0, f1), hi = Math.max(f0, f1);
      const x = this.sx(col * C.CELL_W);
      const yTop = this.sy(floorTopY(hi));
      const yBot = this.sy(floorTopY(lo)) + C.FLOOR_H * z;
      ctx.fillStyle = valid ? 'rgba(95,227,154,0.22)' : 'rgba(255,107,125,0.22)';
      ctx.fillRect(x, yTop, C.ELEV_W * C.CELL_W * z, yBot - yTop);
      ctx.strokeStyle = valid ? '#5fe39a' : '#ff6b7d';
      ctx.lineWidth = 1.6;
      ctx.strokeRect(x, yTop, C.ELEV_W * C.CELL_W * z, yBot - yTop);
      ctx.lineWidth = 1;
      ctx.fillStyle = '#fff';
      ctx.font = `700 ${Math.max(10, 11 * z)}px 'Space Grotesk', sans-serif`;
      ctx.textAlign = 'center';
      const def = C.ELEVATORS[type];
      const span = hi - lo;
      ctx.fillText(
        `${span} floors · ${fmt$(game.cost(def.base + def.perFloor * span))}`,
        x + C.ELEV_W * C.CELL_W * z / 2, yTop - 8,
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
      ctx.fillStyle = 'rgba(255,80,90,0.28)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#ff5060';
      ctx.strokeRect(x, y, w, h);
      return;
    }

    const def = C.ROOMS[hv.tool];
    if (!def) return;
    const x = this.sx(hv.col * C.CELL_W);
    const y = this.sy(floorTopY(hv.floor));
    const w = def.w * C.CELL_W * z, h = C.FLOOR_H * z;
    ctx.fillStyle = hv.valid ? 'rgba(95,227,154,0.26)' : 'rgba(255,107,125,0.26)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = hv.valid ? '#5fe39a' : '#ff6b7d';
    ctx.lineWidth = 1.6;
    ctx.strokeRect(x, y, w, h);
    ctx.lineWidth = 1;
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${Math.max(10, 11 * z)}px 'Space Grotesk', sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(fmt$(game.cost(def.cost)), x + w / 2, y - 8);
  }

  // Touch flow: a movable, pulsing ghost awaiting ✓/✕
  _drawPending(ctx, game) {
    const p = game.input && game.input.pending;
    if (!p) return;
    const z = this.cam.zoom;
    const pulse = 0.55 + 0.3 * Math.sin(performance.now() / 280);
    let x, y, w, h;

    if (p.kind === 'room') {
      const def = C.ROOMS[p.type];
      x = this.sx(p.col * C.CELL_W); y = this.sy(floorTopY(p.floor));
      w = def.w * C.CELL_W * z; h = C.FLOOR_H * z;
    } else if (p.kind === 'elev') {
      x = this.sx(p.col * C.CELL_W); y = this.sy(floorTopY(p.f1));
      w = C.ELEV_W * C.CELL_W * z;
      h = this.sy(floorTopY(p.f0)) + C.FLOOR_H * z - y;
    } else {  // demolish target
      const t = p.target;
      if (t.kind === 'room') {
        x = this.sx(t.obj.col * C.CELL_W); y = this.sy(floorTopY(t.obj.floor));
        w = t.obj.w * C.CELL_W * z; h = C.FLOOR_H * z;
      } else {
        x = this.sx(t.obj.col * C.CELL_W); y = this.sy(floorTopY(t.obj.top));
        w = C.ELEV_W * C.CELL_W * z;
        h = this.sy(floorTopY(t.obj.bottom)) + C.FLOOR_H * z - y;
      }
      ctx.fillStyle = `rgba(255,80,90,${0.25 * pulse + 0.12})`;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#ff5060';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
      ctx.lineWidth = 1;
      return;
    }

    const col = p.valid ? '95,227,154' : '255,107,125';
    ctx.fillStyle = `rgba(${col},${0.2 + 0.14 * pulse})`;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = `rgba(${col},${0.65 + 0.35 * pulse})`;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([7, 5]);
    ctx.lineDashOffset = -performance.now() / 60;
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
    ctx.lineWidth = 1;

    // Drag affordance: little move arrows at the centre
    ctx.fillStyle = `rgba(255,255,255,${0.5 + 0.3 * pulse})`;
    ctx.font = `${Math.max(11, 13 * z)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('⇠ ⇢', x + w / 2, y + h / 2 + 4 * z);
  }

  _drawSelection(ctx, dtReal) {
    const sel = this.selected;
    if (!sel) return;
    const z = this.cam.zoom;
    this._dashOff = (this._dashOff || 0) + dtReal / 40;
    ctx.strokeStyle = '#4cc2ff';
    ctx.shadowColor = 'rgba(76,194,255,0.7)';
    ctx.shadowBlur = 10;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.lineDashOffset = -this._dashOff;
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
    ctx.lineDashOffset = 0;
    ctx.shadowBlur = 0;
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
      const popScale = m.age < 0.18 ? 0.6 + (m.age / 0.18) * 0.4 : 1;
      const rise = 1 - Math.pow(1 - Math.min(m.age / 1.6, 1), 2);   // ease-out
      ctx.globalAlpha = alpha;
      ctx.fillStyle = m.color;
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 5;
      ctx.font = `800 ${Math.max(11, 14 * this.cam.zoom * popScale)}px 'Outfit', sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(m.text, this.sx(m.x), this.sy(m.y) - rise * 52);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    for (let i = this.confetti.length - 1; i >= 0; i--) {
      const c = this.confetti[i];
      c.age += dt;
      c.x += (c.vx + Math.sin(c.age * 4 + c.sway) * 22) * dt;
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
