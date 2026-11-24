// ─────────────────────────────────────────────────────────────
//  High-resolution procedural textures for the 3D renderer.
//  Surfaces are painted with resolution-independent functions
//  (anti-aliased seams, layered noise), then a normal map is
//  derived from a height channel so the flashlight rakes across
//  grout, planks and peeling paper.
//  Anything without a dedicated painter is upscaled from the
//  64px set and given fresh fine detail.
// ─────────────────────────────────────────────────────────────

import { textures, TS as LOW } from './textures.js';

const N = 256;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => a + (b - a) * t;
const mixc = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const PX = 1 / N;
// 1 inside a line of half-width w around distance 0, anti-aliased
const line = (d, w) => 1 - sstep(w, w + PX * 1.5, Math.abs(d));

function hash(x, y, s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise(u, v, f, s) {
  const x = u * f, y = v * f, x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0;
  const w = (a) => ((a % f) + f) % f;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  return mix(mix(hash(w(x0), w(y0), s), hash(w(x0 + 1), w(y0), s), sx), mix(hash(w(x0), w(y0 + 1), s), hash(w(x0 + 1), w(y0 + 1), s), sx), sy);
}
const fbm = (u, v, s, oct = 5, f = 4) => { let t = 0, a = 0.5, n = 0; for (let o = 0; o < oct; o++) { t += noise(u, v, f << o, s + o * 31) * a; n += a; a *= 0.5; } return t / n; };

// stains, drips and fine grain shared by every wall
function weather(u, v, c, seed, amt = 1) {
  const blot = fbm(u, v, seed, 5, 2);
  let k = 1 - Math.max(0, blot - 0.52) * 1.3 * amt;
  const drip = noise(u, 0, 24, seed + 3);
  if (drip > 0.7 && v < 0.08 + (drip - 0.7) * 1.8) k *= 0.82 + 0.18 * sstep(0, 1, v * 3);
  k *= 1 - v * 0.16 * amt;
  k *= 0.94 + fbm(u, v, seed + 9, 3, 64) * 0.12;
  return [c[0] * k, c[1] * k * 0.98, c[2] * k * 0.95];
}

function damask(u, v, cells) {
  // a repeating fleur motif in each cell, anti-aliased
  const cu = (u * cells) % 1, cv = (v * cells * 1.3) % 1;
  const x = cu - 0.5, y = cv - 0.5;
  const petal = Math.abs(x) * 1.4 + Math.abs(y + 0.08) * 0.9;
  const ring = Math.abs(petal - 0.26);
  const dot = Math.hypot(x, y + 0.2) - 0.045;
  const off = Math.hypot(((u * cells + 0.5) % 1) - 0.5, ((v * cells * 1.3 + 0.5) % 1) - 0.5) - 0.06;
  return Math.max(line(ring, 0.03), 1 - sstep(0, PX * cells * 1.5, dot), 1 - sstep(0, PX * cells * 1.5, off));
}

function baseboard(v, c, h, wood = [70, 46, 30]) {
  if (v > 0.9) {
    const top = line(v - 0.905, 0.005);
    return { c: mixc(wood.map((x) => x * (0.85 + fbm(v, v, 3, 2, 32) * 0.2)), [110, 78, 52], top), h: 0.75 + top * 0.25 };
  }
  return { c, h };
}

const P = {};

P.wood = (u, v) => {
  const planks = 6, pu = u * planks, i = Math.floor(pu), fu = pu - i;
  const off = hash(i, 0, 11);
  const vv = (v + off) % 1;
  const warp = fbm(u, vv, 5 + i, 3, 4) * 1.2;
  const grain = Math.sin((fu * 1.4 + warp) * 26 + vv * 2) * 0.5 + 0.5;
  const fine = fbm(fu * 0.15, vv, 20 + i, 5, 32);
  let c = mixc([86, 56, 34], [118, 80, 48], grain * 0.18 + fine * 0.45 + hash(i, 1, 12) * 0.37);
  const seam = Math.max(line(fu - 0, 0.005 * planks), line(fu - 1, 0.005 * planks));
  const joint = line(vv - (0.3 + hash(i, 2, 13) * 0.5), 0.004);
  let h = 0.6 + grain * 0.04 + fine * 0.06;
  c = mixc(c, [24, 14, 8], Math.max(seam, joint) * 0.85);
  h -= Math.max(seam, joint) * 0.55;
  return { c: weather(u, v, c, 41, 0.6), h };
};
P.woodDark = (u, v) => { const r = P.wood(u, v); return { c: r.c.map((x) => x * 0.62), h: r.h }; };
P.woodCeil = (u, v) => { const r = P.wood(v, u); return { c: r.c.map((x) => x * 0.48), h: r.h }; };

P.checker = (u, v) => {
  const n = 4, cu = Math.floor(u * n), cv = Math.floor(v * n);
  const dark = (cu + cv) % 2 === 1;
  const vein = Math.abs(fbm(u + cu, v, 51, 5, 3) - 0.5);
  let c = dark ? mixc([22, 20, 19], [44, 40, 38], fbm(u, v, 52, 4, 8)) : mixc([196, 186, 160], [150, 142, 120], fbm(u, v, 53, 4, 8));
  if (!dark && vein < 0.02) c = mixc(c, [120, 110, 96], 1 - vein / 0.02);
  if (dark && vein < 0.012) c = mixc(c, [90, 86, 80], 0.6);
  const g = Math.max(line(((u * n) % 1), 0.02), line(((u * n) % 1) - 1, 0.02), line(((v * n) % 1), 0.02), line(((v * n) % 1) - 1, 0.02));
  c = mixc(c, [40, 36, 30], g);
  return { c: weather(u, v, c, 54, 0.9), h: 0.7 - g * 0.5 + (dark ? 0 : 0.02) };
};

P.tileSmall = (u, v) => {
  const n = 8, fu = (u * n) % 1, fv = (v * n) % 1;
  const t = hash(Math.floor(u * n), Math.floor(v * n), 61);
  let c = mixc([132, 146, 138], [160, 170, 160], t);
  const g = Math.max(line(fu, 0.04), line(fu - 1, 0.04), line(fv, 0.04), line(fv - 1, 0.04));
  c = mixc(c, [58, 56, 46], g);
  const mould = fbm(u, v, 62, 5, 3);
  if (mould > 0.56) c = mixc(c, [34, 44, 26], (mould - 0.56) * 2.6);
  return { c: weather(u, v, c, 63, 0.6), h: 0.75 - g * 0.5 };
};

P.concrete = (u, v) => {
  const n = fbm(u, v, 71, 6, 4);
  let c = [88 * (0.7 + n * 0.5), 92 * (0.7 + n * 0.5), 90 * (0.7 + n * 0.5)];
  const pore = hash(Math.floor(u * 180), Math.floor(v * 180), 72) > 0.992;
  if (pore) c = c.map((x) => x * 0.7);
  const crack = Math.abs(fbm(u, v, 73, 5, 3) - 0.5);
  const ck = line(crack, 0.002) * sstep(0.5, 0.65, fbm(u, v, 75, 3, 2));
  c = mixc(c, [30, 30, 28], ck * 0.7);
  return { c: weather(u, v, c, 74, 0.8), h: 0.6 + n * 0.12 - ck * 0.15 - (pore ? 0.05 : 0) };
};
P.concreteCeil = (u, v) => { const r = P.concrete(u, v); return { c: r.c.map((x) => x * 0.6), h: r.h }; };

P.plaster = (u, v) => {
  const n = fbm(u, v, 81, 5, 6);
  let c = [150 * (0.78 + n * 0.3), 144 * (0.78 + n * 0.3), 130 * (0.78 + n * 0.3)];
  const stain = fbm(u, v, 82, 4, 2);
  if (stain > 0.55) c = mixc(c, [110, 84, 52], (stain - 0.55) * 1.6);
  const crack = line(Math.abs(fbm(u, v, 83, 5, 3) - 0.5), 0.0016) * sstep(0.55, 0.7, fbm(u, v, 84, 3, 2));
  c = mixc(c, [70, 62, 52], crack * 0.6);
  return { c, h: 0.6 + n * 0.08 - crack * 0.08 };
};

P.paperRose = (u, v) => {
  const m = damask(u, v, 4);
  const stripe = 0.96 + 0.04 * Math.sin(u * Math.PI * 16);
  let c = mixc([112, 80, 88], [146, 112, 116], m * 0.75).map((x) => x * stripe);
  let h = 0.6 + m * 0.06;
  const r = baseboard(v, weather(u, v, c, 91, 1.1), h);
  return r;
};
P.paperNursery = (u, v) => {
  const s = Math.floor(u * 12) % 2;
  let c = s ? [168, 158, 112] : [150, 142, 104];
  const du = ((u * 6) % 1) - 0.5, dv = ((v * 5) % 1) - 0.5;
  if (Math.hypot(du, dv) < 0.11 || Math.hypot(du + 0.1, dv - 0.12) < 0.12) c = mixc(c, [176, 140, 80], 0.7);
  // crayon scribbles near the floor
  const sc = Math.abs(Math.sin(u * 60 + v * 8) * 0.04 + 0.75 - v);
  if (v > 0.62 && v < 0.86 && sc < 0.006) c = [150, 30, 30];
  return baseboard(v, weather(u, v, c, 101, 1), 0.6, [96, 84, 60]);
};
P.paperRed = (u, v) => {
  const m = damask(u, v, 3);
  let c = mixc([92, 26, 22], [150, 98, 50], m * 0.55);
  if (v < 0.05) c = [60, 36, 20];
  return baseboard(v, weather(u, v, c, 111, 1), 0.6 + m * 0.07);
};
P.wainscot = (u, v) => {
  let c, h = 0.6;
  if (v < 0.52) { const s = Math.floor(u * 10) % 2; c = s ? [104, 76, 52] : [90, 64, 44]; }
  else if (v < 0.57) { c = [52, 32, 18]; h = 0.85 - Math.abs(v - 0.545) * 6; }
  else {
    const pu = (u * 2) % 1, pv = (v - 0.57) / 0.33;
    const inside = pu > 0.1 && pu < 0.9 && pv > 0.1 && pv < 0.9;
    c = inside ? [74, 46, 28] : [86, 56, 34];
    h = inside ? 0.5 : 0.7;
    const bevel = inside ? Math.min(pu - 0.1, 0.9 - pu, pv - 0.1, 0.9 - pv) : 1;
    if (inside && bevel < 0.03) { h = 0.5 + (0.03 - bevel) * 6; c = c.map((x) => x * 1.12); }
  }
  return baseboard(v, weather(u, v, c, 121, 0.9), h);
};
P.kitchen = (u, v) => {
  let c, h = 0.6;
  if (v < 0.42) c = [98, 110, 80];
  else if (v < 0.46) { c = [44, 50, 36]; h = 0.8; }
  else {
    const row = Math.floor((v - 0.46) * 16), off = row % 2 ? 0.5 : 0;
    const fu = ((u * 4 + off) % 1), fv = ((v - 0.46) * 16) % 1;
    const g = Math.max(line(fu, 0.03), line(fu - 1, 0.03), line(fv, 0.06), line(fv - 1, 0.06));
    c = mixc(mixc([150, 160, 130], [128, 138, 112], hash(Math.floor(u * 4 + off), row, 7)), [60, 64, 50], g);
    h = 0.75 - g * 0.5;
  }
  return baseboard(v, weather(u, v, c, 131, 1.4), h, [44, 40, 30]);
};
P.bathTile = (u, v) => {
  const n = 6, fu = (u * n) % 1, fv = (v * n) % 1;
  const g = Math.max(line(fu, 0.035), line(fu - 1, 0.035), line(fv, 0.035), line(fv - 1, 0.035));
  let c = mixc(mixc([170, 180, 168], [150, 160, 150], hash(Math.floor(u * n), Math.floor(v * n), 3)), [70, 72, 60], g);
  const mould = fbm(u, v, 141, 5, 3);
  if (mould > 0.57) c = mixc(c, [30, 40, 24], (mould - 0.57) * 2.8);
  return { c: weather(u, v, c, 142, 0.6), h: 0.75 - g * 0.5 };
};
P.brick = (u, v) => {
  const rows = 6, row = Math.floor(v * rows), off = row % 2 ? 0.25 : 0;
  const fu = ((u * 2 + off) % 1), fv = (v * rows) % 1;
  const m = Math.max(line(fu, 0.02), line(fu - 1, 0.02), line(fv, 0.035), line(fv - 1, 0.035));
  const t = hash(Math.floor(u * 2 + off), row, 151);
  let c = mixc([84, 90, 90], [110, 114, 112], t).map((x) => x * (0.82 + fbm(u, v, 152, 4, 16) * 0.3));
  c = mixc(c, [46, 48, 46], m);
  const wet = fbm(u, v, 153, 5, 2);
  if (wet > 0.52) c = c.map((x) => x * (1 - (wet - 0.52) * 1.2));
  return { c: weather(u, v, c, 154, 1.3), h: 0.75 - m * 0.5 + fbm(u, v, 155, 3, 32) * 0.08 };
};
const panelDoor = (u, v, base, seed) => {
  const panel = (u0, u1, v0, v1) => {
    if (u < u0 || u > u1 || v < v0 || v > v1) return null;
    const b = Math.min(u - u0, u1 - u, v - v0, v1 - v);
    return b;
  };
  let c = base, h = 0.75;
  for (const [u0, u1, v0, v1] of [[0.12, 0.44, 0.08, 0.42], [0.56, 0.88, 0.08, 0.42], [0.12, 0.44, 0.5, 0.9], [0.56, 0.88, 0.5, 0.9]]) {
    const b = panel(u0, u1, v0, v1);
    if (b !== null) { h = b < 0.03 ? 0.75 - b * 8 : 0.5; c = base.map((x) => x * (b < 0.03 ? 0.8 + b * 4 : 0.88)); }
  }
  const grain = Math.sin((v * 30 + fbm(u, v, seed, 3, 4) * 6)) * 0.5 + 0.5;
  c = c.map((x) => x * (0.9 + grain * 0.12));
  return { c: weather(u, v, c, seed, 0.8), h };
};
P.door = (u, v) => {
  const r = panelDoor(u, v, [104, 68, 40], 161);
  const k = Math.hypot(u - 0.86, v - 0.52);
  if (k < 0.028) { r.c = mixc([200, 168, 90], [120, 96, 40], k / 0.028); r.h = 1 - k * 10; }
  return r;
};
P.doorBasement = (u, v) => {
  const pl = Math.floor(u * 5), fu = (u * 5) % 1;
  let c = mixc([78, 70, 58], [94, 84, 70], hash(pl, 0, 171)).map((x) => x * (0.85 + fbm(u, v, 172, 4, 8) * 0.3));
  let h = 0.65;
  const seam = Math.max(line(fu, 0.03), line(fu - 1, 0.03));
  c = mixc(c, [26, 22, 18], seam); h -= seam * 0.4;
  for (const sv of [0.15, 0.82]) if (Math.abs(v - sv) < 0.025) { c = [44, 44, 46]; h = 0.9; }
  if (u > 0.75 && u < 0.88 && v > 0.45 && v < 0.58) { c = [150, 128, 64]; h = 0.95; }
  const letters = Math.abs(Math.sin(u * 55) * 0.03 + 0.3 - v);
  if (u > 0.2 && u < 0.78 && letters < 0.006) { c = [140, 22, 18]; h = 0.4; }
  return { c: weather(u, v, c, 173, 1.4), h };
};

// furniture materials for the 3D models
P.fabric = (u, v) => {
  const weave = (Math.sin(u * N * 0.9) * Math.sin(v * N * 0.9)) * 0.5 + 0.5;
  let c = [150, 142, 124].map((x) => x * (0.86 + weave * 0.08 + fbm(u, v, 181, 4, 6) * 0.15));
  const st = fbm(u, v, 182, 5, 3);
  if (st > 0.6) c = mixc(c, [120, 90, 56], (st - 0.6) * 1.4);
  if (fbm(u, v, 183, 5, 6) > 0.72) c = mixc(c, [96, 30, 24], 0.35);
  return { c, h: 0.6 + weave * 0.1 };
};
P.linen = (u, v) => { const r = P.fabric(v, u); return { c: r.c.map((x, i) => x * [1.08, 1.06, 1.02][i]), h: r.h }; };
P.iron = (u, v) => {
  const n = fbm(u, v, 191, 5, 8);
  let c = [34, 34, 36].map((x) => x * (0.8 + n * 0.5));
  if (fbm(u, v, 192, 4, 4) > 0.6) c = mixc(c, [92, 50, 26], 0.6);
  return { c, h: 0.6 + n * 0.3 };
};
P.enamel = (u, v) => {
  const n = fbm(u, v, 201, 4, 4);
  // old, yellowed enamel: grime gathered in streaks, chips down to black iron, rust weeping from them
  let c = [184, 180, 160].map((x) => x * (0.86 + n * 0.12));
  const grime = fbm(u * 3, v * 0.6, 203, 4, 4);
  c = mixc(c, [120, 108, 78], sstep(0.45, 0.8, grime) * 0.55);
  const rust = fbm(u, v, 202, 5, 6);
  if (rust > 0.6) c = mixc(c, [128, 82, 44], Math.min(1, (rust - 0.6) * 3));
  const chip = fbm(u, v, 204, 3, 16);
  if (chip > 0.74) c = mixc(c, [26, 24, 22], Math.min(1, (chip - 0.74) * 12));
  return { c, h: 0.7 - (chip > 0.74 ? 0.25 : 0) };
};
// the outside of a clawfoot tub: dark painted iron, chipped and scuffed
P.tubOuter = (u, v) => {
  const n = fbm(u, v, 251, 5, 6);
  let c = [44, 50, 44].map((x) => x * (0.75 + n * 0.45));
  const chip = fbm(u, v, 252, 4, 12);
  if (chip > 0.76) c = mixc(c, [118, 112, 96], Math.min(1, (chip - 0.76) * 5));
  const drip = fbm(u * 8, v * 0.5, 253, 3, 4);
  c = mixc(c, [80, 56, 34], sstep(0.62, 0.85, drip) * 0.6);
  return { c, h: 0.55 + n * 0.2 - (chip > 0.76 ? 0.15 : 0) };
};
P.curtain = (u, v) => {
  const fold = Math.sin(u * Math.PI * 14 + fbm(u, v, 231, 2, 2) * 2) * 0.5 + 0.5;
  let c = [150, 160, 140].map((x) => x * (0.7 + fold * 0.35));
  const mould = sstep(0.75, 1, v) * fbm(u, v, 232, 4, 6);
  c = mixc(c, [50, 60, 36], mould);
  return { c, h: 0.5 + fold * 0.4 };
};
P.tubInside = (u, v) => {
  // a ring of filth where the water stood, and a dark stain at the drain end
  let c = mixc([150, 140, 112], [92, 82, 58], fbm(u, v, 241, 4, 4));
  const ring = Math.min(1, Math.min(u, 1 - u, v, 1 - v) * 14);
  c = mixc([70, 60, 40], c, ring);
  c = mixc(c, [48, 30, 20], sstep(0.55, 0.85, fbm(u, v * 0.5, 242, 4, 3)) * sstep(0.5, 1, v));
  return { c, h: 0.5 };
};
P.frontDoor = (u, v) => {
  // frame + heavy panelled door with a stained-glass fanlight, chain and deadbolt
  if (u < 0.08 || u > 0.92 || v < 0.04) return { c: weather(u, v, [60, 22, 16], 251, 0.8), h: 0.85 };
  const fu = (u - 0.08) / 0.84;
  if (v < 0.3) {
    const dx = fu - 0.5, dy = (0.3 - v) / 0.26;
    const r = Math.hypot(dx * 2, dy);
    if (r < 1) {
      const ang = Math.atan2(dy, dx * 2), seg = Math.floor(ang / (Math.PI / 6));
      const lead = line((ang / (Math.PI / 6)) % 1, 0.06) + line(r - 0.45, 0.03) + line(r - 1, 0.04);
      const glass = [[200, 50, 30], [210, 140, 40], [150, 30, 30], [220, 170, 60], [170, 60, 30], [200, 120, 40]][((seg % 6) + 6) % 6];
      const tint = 0.75 + fbm(u, v, 252, 3, 16) * 0.4;
      if (lead > 0.5) return { c: [24, 14, 10], h: 0.9 };
      return { c: glass.map((x) => x * tint), h: 0.55, e: 1 };
    }
    return { c: weather(u, v, [60, 22, 16], 253, 0.8), h: 0.85 };
  }
  const dv = (v - 0.3) / 0.7;
  const r = panelDoor(fu, dv, [92, 30, 20], 254);
  // brass deadbolt and knob
  const db = Math.max(Math.abs(fu - 0.86) / 0.035, Math.abs(dv - 0.32) / 0.05);
  if (db < 1) { r.c = mixc([210, 176, 92], [130, 100, 40], db); r.h = 1; }
  const kn = Math.hypot(fu - 0.86, (dv - 0.46) * 0.7);
  if (kn < 0.035) { r.c = mixc([220, 186, 100], [110, 84, 30], kn / 0.035); r.h = 1 - kn * 6; }
  // the chain, hanging in a loop across the gap
  const cy = 0.22 + Math.pow((fu - 0.83) / 0.25, 2) * 0.06;
  if (fu > 0.6 && fu < 0.9) {
    const link = ((fu * 60) % 1);
    if (Math.abs(dv - cy) < 0.018 && Math.abs(link - 0.5) < 0.38) { r.c = [140, 140, 136].map((x) => x * (0.7 + link * 0.4)); r.h = 1; }
  }
  return r;
};
P.window = (u, v) => {
  const wall = P.paperRose(u, v);
  if (u < 0.17 || u > 0.83 || v < 0.1 || v > 0.72) {
    const frame = (u > 0.14 && u < 0.86 && v > 0.07 && v < 0.78);
    return frame ? { c: [44, 30, 24], h: 0.9 } : wall;
  }
  const bars = line(u - 0.5, 0.012) + line(v - 0.41, 0.012);
  if (bars > 0.5) return { c: [36, 26, 20], h: 0.9 };
  let c = mixc([8, 12, 24], [40, 56, 92], (v - 0.1) / 0.62);
  const m = Math.hypot(u - 0.66, v - 0.24);
  c = mixc(c, [150, 170, 220], Math.max(0, 1 - m / 0.16) * 0.6);
  if (m < 0.055) c = mixc([236, 240, 248], [200, 208, 226], fbm(u, v, 261, 3, 24));
  const hills = 0.6 + Math.sin(u * 18) * 0.03 + fbm(u, 0, 262, 3, 6) * 0.08;
  if (v > hills) c = [4, 5, 8];
  // rain on the glass
  const drop = fbm(u, v * 0.3, 263, 2, 40);
  if (drop > 0.72) c = c.map((x) => x * 1.25 + 8);
  return { c, h: 0.5, e: 1 };
};
P.bulb = () => ({ c: [255, 238, 196], h: 0.5, e: 1 });
P.shade = (u, v) => ({ c: weather(u, v, [60, 78, 52], 271, 1.2), h: 0.6 });
P.redPaint = (u, v) => ({ c: weather(u, v, [140, 40, 22], 211, 1.3), h: 0.6 + fbm(u, v, 212, 3, 16) * 0.2 });
P.brass = (u, v) => ({ c: [190, 150, 70].map((x) => x * (0.8 + fbm(u, v, 221, 3, 8) * 0.3)), h: 0.8 });

// ── build ────────────────────────────────────────────────────
function toCanvas(fn) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(N, N);
  const d = img.data;
  const H = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const r = fn((x + 0.5) / N, (y + 0.5) / N);
    const i = (y * N + x) * 4;
    d[i] = r.c[0]; d[i + 1] = r.c[1]; d[i + 2] = r.c[2]; d[i + 3] = r.e ? 255 * (1 - r.e * 0.5) : 255;
    H[y * N + x] = r.h ?? (r.c[0] + r.c[1] + r.c[2]) / 765;
  }
  ctx.putImageData(img, 0, 0);
  return { albedo: cv, height: H };
}

function upscale(low) {
  // 64px source → 256px: smooth, sharpen, add fine grain; keep emissive pixels in alpha
  const src = document.createElement('canvas');
  src.width = src.height = LOW;
  const sctx = src.getContext('2d');
  const simg = sctx.createImageData(LOW, LOW);
  const emis = new Uint8Array(LOW * LOW);
  for (let i = 0; i < low.length; i++) {
    const c = low[i];
    simg.data[i * 4] = c & 255; simg.data[i * 4 + 1] = (c >> 8) & 255; simg.data[i * 4 + 2] = (c >> 16) & 255; simg.data[i * 4 + 3] = 255;
    emis[i] = (c >>> 24) === 0xfe ? 1 : 0;
  }
  sctx.putImageData(simg, 0, 0);
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, N, N);
  const img = ctx.getImageData(0, 0, N, N), d = img.data;
  const blur = new Uint8ClampedArray(d);
  const H = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 4;
    for (let ch = 0; ch < 3; ch++) {
      // unsharp mask against a 4-neighbour average
      const n = (blur[((y * N + ((x + 1) % N)) * 4) + ch] + blur[((y * N + ((x + N - 1) % N)) * 4) + ch] + blur[((((y + 1) % N) * N + x) * 4) + ch] + blur[((((y + N - 1) % N) * N + x) * 4) + ch]) / 4;
      const g = (fbm(x / N, y / N, 7 + ch, 3, 64) - 0.5) * 18;
      d[i + ch] = blur[i + ch] + (blur[i + ch] - n) * 0.9 + g;
    }
    const e = emis[((y * LOW / N) | 0) * LOW + ((x * LOW / N) | 0)];
    d[i + 3] = e ? 127 : 255;   // alpha < 1 = emissive
    H[y * N + x] = (d[i] + d[i + 1] + d[i + 2]) / 765;
  }
  ctx.putImageData(img, 0, 0);
  return { albedo: cv, height: H };
}

function normalMap(H, strength = 2.2) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(N, N), d = img.data;
  const h = (x, y) => H[((y + N) % N) * N + ((x + N) % N)];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (h(x + 1, y - 1) + 2 * h(x + 1, y) + h(x + 1, y + 1)) - (h(x - 1, y - 1) + 2 * h(x - 1, y) + h(x - 1, y + 1));
    const dy = (h(x - 1, y + 1) + 2 * h(x, y + 1) + h(x + 1, y + 1)) - (h(x - 1, y - 1) + 2 * h(x, y - 1) + h(x + 1, y - 1));
    let nx = -dx * strength, ny = -dy * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * N + x) * 4;
    d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

// how shiny each surface is: [specular strength, glossiness]
export const MATERIAL = {
  checker: [0.6, 48], tileSmall: [0.55, 40], bathTile: [0.6, 48], kitchen: [0.35, 32], enamel: [0.6, 56], tubOuter: [0.45, 28], tubInside: [0.5, 40], fridge: [0.5, 40],
  brass: [0.9, 64], iron: [0.4, 24], door: [0.18, 16], wood: [0.25, 20], woodDark: [0.25, 20], frontDoor: [0.2, 16], counterSink: [0.4, 32],
  window: [0.7, 80], boiler: [0.4, 24],
};

let cache = null, pending = null;
const order = () => {
  const low = textures();
  return [...new Set([...Object.keys(P), ...Object.keys(low).filter((k) => k !== 'ready')])];
};
function buildOne(name) {
  const low = textures();
  const t = P[name] ? toCanvas(P[name]) : upscale(low[name]);
  cache[name] = { albedo: t.albedo, normal: normalMap(t.height, P[name] ? 2.4 : 1.2) };
}

/** Synchronous (finishes whatever the async build hasn't done yet). */
export function hdTextures() {
  cache ??= {};
  for (const n of order()) if (!cache[n]) buildOne(n);
  return cache;
}

/** Build in small slices so the title screen stays responsive. */
export function hdTexturesAsync(onProgress = () => {}) {
  if (pending) return pending;
  cache ??= {};
  const names = order();
  pending = new Promise((resolve) => {
    let i = 0;
    const step = () => {
      const t0 = performance.now();
      while (i < names.length && performance.now() - t0 < 12) { if (!cache[names[i]]) buildOne(names[i]); i++; }
      onProgress(i / names.length);
      if (i < names.length) setTimeout(step, 0); else resolve(cache);
    };
    step();
  });
  return pending;
}

/** A tileable noise texture: R = large blotches, G = fine grain, B = vertical streaks. */
export function noiseCanvas() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(N, N), d = img.data;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, i = (y * N + x) * 4;
    d[i] = fbm(u, v, 301, 5, 2) * 255;
    d[i + 1] = fbm(u, v, 302, 3, 32) * 255;
    d[i + 2] = fbm(u * 6, v * 0.3, 303, 4, 4) * 255;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}
