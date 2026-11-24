// ─────────────────────────────────────────────────────────────
//  First-person raycasting renderer (software, low-res, retro).
//  Textured walls, floors, ceilings and sliding doors; billboard
//  sprites; per-pixel lighting from flickering bulbs and a
//  flashlight cone; film grain, vignette and a red tint that
//  creeps in as the days pass.
// ─────────────────────────────────────────────────────────────

import { textures, TS } from './textures.js';
import { ROOM_DEFS, ROOM_IDS, WALL, DOOR, BLOCK } from './world.js';

const LM = 4; // lightmap samples per tile

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.W = canvas.width;
    this.H = canvas.height;
    this.ctx = canvas.getContext('2d');
    this.img = this.ctx.createImageData(this.W, this.H);
    this.buf = new Uint32Array(this.img.data.buffer);
    this.zbuf = new Float32Array(this.W);
    this.tex = textures();

    const { W, H } = this;
    this.cone = new Float32Array(W * H);
    this.vig = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = (x - W / 2) / (H * 0.5), dy = (y - H / 2) / (H * 0.5);
      const r = Math.hypot(dx, dy * 1.08);
      let c = r < 0.38 ? 1 : r < 0.72 ? 1 - ((r - 0.38) / 0.34) ** 1.4 : 0;
      c = c * 0.92 + Math.max(0, 1 - r / 1.6) * 0.1;      // soft spill
      this.cone[y * W + x] = c;
      this.vig[y * W + x] = 1 - 0.62 * Math.min(1, Math.max(0, (r - 0.55) / 0.85)) ** 1.5;
    }
    this.noise = new Float32Array(16384).map(() => Math.random() * 2 - 1);
    this.lut = new Uint8Array(256).map((_, i) => Math.round(255 * Math.pow(i / 255, 0.82)));
  }

  setWorld(world, lights) {
    this.world = world;
    const n = world.w * world.h;
    const pick = (key, fallback) => ROOM_IDS.map((id) => this.tex[ROOM_DEFS[id][key]] ?? this.tex[fallback]);
    const floorT = pick('floor', 'wood'), ceilT = pick('ceil', 'plaster');
    this.cellFloor = new Array(n);
    this.cellCeil = new Array(n);
    this.cellAmb = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = world.room[i] >= 0 ? world.room[i] : ROOM_IDS.indexOf('hall');
      this.cellFloor[i] = floorT[r];
      this.cellCeil[i] = ceilT[r];
      const a = ROOM_DEFS[ROOM_IDS[r]].ambient;
      this.cellAmb[i * 3] = a[0] * 2.3; this.cellAmb[i * 3 + 1] = a[1] * 2.3; this.cellAmb[i * 3 + 2] = a[2] * 2.3;
    }
    this.roomWall = ROOM_IDS.map((id) => this.tex[ROOM_DEFS[id].wall]);

    // pre-baked light visibility per light (occluded by walls and closed doors)
    this.lw = world.w * LM; this.lh = world.h * LM;
    this.lights = lights;
    this.lightMaps = lights.map((l) => {
      const m = new Float32Array(this.lw * this.lh);
      const x0 = Math.max(0, Math.floor((l.x - l.rad) * LM)), x1 = Math.min(this.lw - 1, Math.ceil((l.x + l.rad) * LM));
      const y0 = Math.max(0, Math.floor((l.y - l.rad) * LM)), y1 = Math.min(this.lh - 1, Math.ceil((l.y + l.rad) * LM));
      for (let sy = y0; sy <= y1; sy++) for (let sx = x0; sx <= x1; sx++) {
        const wx = (sx + 0.5) / LM, wy = (sy + 0.5) / LM;
        const d = Math.hypot(wx - l.x, wy - l.y);
        if (d > l.rad) continue;
        const k = world.kind[world.i(Math.floor(wx), Math.floor(wy))];
        if (k === WALL || k === BLOCK) continue;
        if (!world.los(l.x, l.y, wx, wy)) continue;
        m[sy * this.lw + sx] = (1 - d / l.rad) ** 1.5 * 1.7 + (d < 1 ? (1 - d) * 0.6 : 0);
      }
      return m;
    });
    this.lmR = new Float32Array(this.lw * this.lh);
    this.lmG = new Float32Array(this.lw * this.lh);
    this.lmB = new Float32Array(this.lw * this.lh);
  }

  #buildLightmap() {
    const { lmR, lmG, lmB, lw, lh, world } = this;
    for (let sy = 0; sy < lh; sy++) for (let sx = 0; sx < lw; sx++) {
      const ci = world.i((sx / LM) | 0, (sy / LM) | 0) * 3, i = sy * lw + sx;
      lmR[i] = this.cellAmb[ci]; lmG[i] = this.cellAmb[ci + 1]; lmB[i] = this.cellAmb[ci + 2];
    }
    this.lights.forEach((l, li) => {
      const lev = l.level;
      if (lev < 0.03) return;
      const m = this.lightMaps[li], r = l.c[0] * lev, g = l.c[1] * lev, b = l.c[2] * lev;
      for (let i = 0; i < m.length; i++) { const v = m[i]; if (v) { lmR[i] += v * r; lmG[i] += v * g; lmB[i] += v * b; } }
    });
  }

  /**
   * @param cam {x, y, a, z (eye height 0..1), pitch (px), flash (0..1)}
   * @param sprites [{img, x, y, w, h, z, alpha}]
   * @param fx {day, grain, redness, flashFlicker}
   */
  render(cam, sprites, fx = {}) {
    const { W, H, buf, zbuf, world, lmR, lmG, lmB, lw, cone } = this;
    this.#buildLightmap();
    const dirX = Math.cos(cam.a), dirY = Math.sin(cam.a);
    const fov = 0.68;
    const planeX = -dirY * fov, planeY = dirX * fov;
    const px = cam.x, py = cam.y, camZ = cam.z;
    const horizon = (H / 2 + cam.pitch) | 0;
    const flash = cam.flash ?? 0;
    const FW = 1.0, FG = 0.93, FB = 0.8;   // warm flashlight

    // ── floor & ceiling ──
    const rdx0 = dirX - planeX, rdy0 = dirY - planeY, rdx1 = dirX + planeX, rdy1 = dirY + planeY;
    for (let y = 0; y < H; y++) {
      const isFloor = y > horizon;
      const p = isFloor ? y - horizon : horizon - y;
      if (p === 0) { for (let x = 0; x < W; x++) buf[y * W + x] = 0xff000000; continue; }
      const rowDist = (isFloor ? camZ : 1 - camZ) * H / p;
      const stepX = rowDist * (rdx1 - rdx0) / W, stepY = rowDist * (rdy1 - rdy0) / W;
      let fx0 = px + rowDist * rdx0, fy0 = py + rowDist * rdy0;
      const fall = flash * 2.8 / (1 + rowDist * rowDist * 0.1);
      const fog = 1 / (1 + rowDist * 0.06);
      for (let x = 0; x < W; x++, fx0 += stepX, fy0 += stepY) {
        const cx = fx0 | 0, cy = fy0 | 0;
        const o = y * W + x;
        if (cx < 0 || cy < 0 || cx >= world.w || cy >= world.h) { buf[o] = 0xff000000; continue; }
        const ci = cy * world.w + cx;
        const t = (isFloor ? this.cellFloor : this.cellCeil)[ci];
        const tx = ((fx0 - cx) * TS) & (TS - 1), ty = ((fy0 - cy) * TS) & (TS - 1);
        const c = t[ty * TS + tx];
        const li = ((fy0 * LM) | 0) * lw + ((fx0 * LM) | 0);
        const f = cone[o] * fall;
        const kr = (lmR[li] + f * FW) * fog, kg = (lmG[li] + f * FG) * fog, kb = (lmB[li] + f * FB) * fog;
        const r = (c & 255) * kr, g = ((c >> 8) & 255) * kg, b = ((c >> 16) & 255) * kb;
        buf[o] = 0xff000000 | (b > 255 ? 255 : b) << 16 | (g > 255 ? 255 : g) << 8 | (r > 255 ? 255 : r);
      }
    }

    // ── walls & doors ──
    for (let x = 0; x < W; x++) {
      const camX = 2 * x / W - 1;
      const rdx = dirX + planeX * camX, rdy = dirY + planeY * camX;
      let mapX = px | 0, mapY = py | 0;
      const ddx = Math.abs(1 / rdx), ddy = Math.abs(1 / rdy);
      const stepX = rdx < 0 ? -1 : 1, stepY = rdy < 0 ? -1 : 1;
      let sdx = rdx < 0 ? (px - mapX) * ddx : (mapX + 1 - px) * ddx;
      let sdy = rdy < 0 ? (py - mapY) * ddy : (mapY + 1 - py) * ddy;
      let side = 0, perp = 30, tex = null, u = 0, hit = false;
      for (let s = 0; s < 80 && !hit; s++) {
        if (sdx < sdy) { sdx += ddx; mapX += stepX; side = 0; } else { sdy += ddy; mapY += stepY; side = 1; }
        if (mapX < 0 || mapY < 0 || mapX >= world.w || mapY >= world.h) break;
        const ci = mapY * world.w + mapX, k = world.kind[ci];
        if (k === WALL || k === BLOCK) {
          perp = side === 0 ? (mapX - px + (1 - stepX) / 2) / rdx : (mapY - py + (1 - stepY) / 2) / rdy;
          let wx = side === 0 ? py + perp * rdy : px + perp * rdx;
          wx -= Math.floor(wx);
          u = wx;
          if ((side === 0 && rdx > 0) || (side === 1 && rdy < 0)) u = 1 - u;
          if (k === BLOCK) tex = this.tex[world.blockTex[ci]];
          else {
            const ov = world.override[ci];
            if (ov) tex = this.tex[ov];
            else {
              const prev = side === 0 ? ci - stepX : ci - stepY * world.w;
              const r = world.room[prev];
              tex = this.roomWall[r >= 0 ? r : 3];
            }
          }
          hit = true;
        } else if (k === DOOR) {
          const d = world.doors[world.doorAt[ci]];
          let t, along;
          if (d.axis === 'x') { t = (mapY + 0.5 - py) / rdy; along = px + t * rdx - mapX; }
          else { t = (mapX + 0.5 - px) / rdx; along = py + t * rdy - mapY; }
          if (t > 0 && along >= 0 && along < 1 && along > d.open) {
            perp = t; u = along - d.open;
            tex = d.kind === 'basement' ? this.tex.doorBasement : this.tex.door;
            side = d.axis === 'x' ? 1 : 0;
            hit = true;
          }
        }
      }
      zbuf[x] = perp;
      if (!hit) continue;
      const lineH = H / perp;
      const top = horizon - (1 - camZ) * lineH, bot = horizon + camZ * lineH;
      const y0 = Math.max(0, Math.ceil(top)), y1 = Math.min(H, Math.ceil(bot));
      const hx = px + rdx * (perp - 0.03), hy = py + rdy * (perp - 0.03);
      const li = Math.max(0, Math.min(this.lmR.length - 1, ((hy * LM) | 0) * lw + ((hx * LM) | 0)));
      const sideK = side === 1 ? 0.82 : 1;
      const fog = sideK / (1 + perp * 0.06);
      const ar = lmR[li] * fog, ag = lmG[li] * fog, ab = lmB[li] * fog;
      const fall = flash * 3.0 / (1 + perp * perp * 0.09) * fog;
      const tx = Math.min(TS - 1, (u * TS) | 0);
      const texStep = TS / lineH;
      let ty = (y0 - top) * texStep;
      for (let y = y0; y < y1; y++, ty += texStep) {
        const c = tex[((ty | 0) & (TS - 1)) * TS + tx];
        const o = y * W + x;
        if ((c >>> 24) === 0xfe) { buf[o] = c | 0xff000000; continue; }
        const f = cone[o] * fall;
        const r = (c & 255) * (ar + f * FW), g = ((c >> 8) & 255) * (ag + f * FG), b = ((c >> 16) & 255) * (ab + f * FB);
        buf[o] = 0xff000000 | (b > 255 ? 255 : b) << 16 | (g > 255 ? 255 : g) << 8 | (r > 255 ? 255 : r);
      }
    }

    // ── sprites, far to near ──
    const invDet = 1 / (planeX * dirY - dirX * planeY);
    const list = sprites.map((s) => ({ s, d: (s.x - px) ** 2 + (s.y - py) ** 2 })).sort((a, b) => b.d - a.d);
    for (const { s } of list) {
      const img = s.img;
      if (!img || (s.alpha ?? 1) <= 0.01) continue;
      const sx = s.x - px, sy = s.y - py;
      const tX = invDet * (dirY * sx - dirX * sy);
      const tY = invDet * (-planeY * sx + planeX * sy);
      if (tY < 0.12) continue;
      const scrX = (W / 2) * (1 + tX / tY);
      const scale = H / tY;
      const sh = s.h * scale, sw = s.w * scale;
      const bottom = horizon + (camZ - (s.z ?? 0)) * scale;
      const top = bottom - sh;
      const x0 = Math.max(0, Math.floor(scrX - sw / 2)), x1 = Math.min(W, Math.ceil(scrX + sw / 2));
      const y0 = Math.max(0, Math.floor(top)), y1 = Math.min(H, Math.ceil(bottom));
      if (x0 >= x1 || y0 >= y1) continue;
      const li = Math.max(0, Math.min(lmR.length - 1, ((s.y * LM) | 0) * lw + ((s.x * LM) | 0)));
      const fog = 1 / (1 + tY * 0.06);
      const glow = s.glow ?? 0;   // ghosts are faintly pale even in the dark
      const ar = Math.max(lmR[li] * fog, glow), ag = Math.max(lmG[li] * fog, glow), ab = Math.max(lmB[li] * fog, glow * 1.08);
      const fall = flash * 3.0 / (1 + tY * tY * 0.09) * fog;
      const alpha = Math.min(1, s.alpha ?? 1);
      const flip = s.flip;
      for (let x = x0; x < x1; x++) {
        if (tY >= zbuf[x]) continue;
        let tx = (((x - (scrX - sw / 2)) / sw) * img.w) | 0;
        if (flip) tx = img.w - 1 - tx;
        if (tx < 0 || tx >= img.w) continue;
        for (let y = y0; y < y1; y++) {
          const ty = (((y - top) / sh) * img.h) | 0;
          const c = img.data[ty * img.w + tx];
          const a = c >>> 24;
          if (a === 0) continue;
          const o = y * W + x;
          let r, g, b;
          if (a === 0xfe) { r = c & 255; g = (c >> 8) & 255; b = (c >> 16) & 255; }
          else {
            const f = cone[o] * fall;
            r = (c & 255) * (ar + f * FW); g = ((c >> 8) & 255) * (ag + f * FG); b = ((c >> 16) & 255) * (ab + f * FB);
          }
          if (alpha < 1) {
            const old = buf[o];
            r = (old & 255) * (1 - alpha) + r * alpha;
            g = ((old >> 8) & 255) * (1 - alpha) + g * alpha;
            b = ((old >> 16) & 255) * (1 - alpha) + b * alpha;
          }
          buf[o] = 0xff000000 | (b > 255 ? 255 : b) << 16 | (g > 255 ? 255 : g) << 8 | (r > 255 ? 255 : r);
        }
      }
    }

    // ── post: vignette, grain, dread ──
    const grain = fx.grain ?? 10, red = fx.redness ?? 0, vig = this.vig, nz = this.noise;
    let n = (Math.random() * 8000) | 0;
    const desat = fx.desat ?? 0;
    for (let i = 0; i < buf.length; i++) {
      const c = buf[i];
      let r = c & 255, g = (c >> 8) & 255, b = (c >> 16) & 255;
      if (desat) { const l = (r + g + b) / 3; r += (l - r) * desat; g += (l - g) * desat; b += (l - b) * desat; }
      const v = vig[i], gn = nz[(n + i) & 16383] * grain;
      r = r * v + gn + red * 18 * v; g = g * v * (1 - red * 0.25) + gn; b = b * v * (1 - red * 0.3) + gn;
      const L = this.lut;
      buf[i] = 0xff000000 | L[b < 0 ? 0 : b > 255 ? 255 : b | 0] << 16 | L[g < 0 ? 0 : g > 255 ? 255 : g | 0] << 8 | L[r < 0 ? 0 : r > 255 ? 255 : r | 0];
    }
    this.ctx.putImageData(this.img, 0, 0);
  }
}
