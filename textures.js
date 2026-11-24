// ─────────────────────────────────────────────────────────────
//  Procedural textures, 64×64, generated pixel by pixel.
//  Pixels are packed ABGR (little-endian ImageData order).
//  Alpha 0xFE marks an emissive pixel (glows in the dark).
// ─────────────────────────────────────────────────────────────

export const TS = 64;
const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
const pack = (r, g, b, a = 255) => ((a << 24) | (clamp(b) << 16) | (clamp(g) << 8) | clamp(r)) >>> 0;
const mix = (a, b, t) => a + (b - a) * t;
const mixc = (c1, c2, t) => [mix(c1[0], c2[0], t), mix(c1[1], c2[1], t), mix(c1[2], c2[2], t)];
const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

function hash(x, y, s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
// tiling value noise
function vnoise(x, y, f, s) {
  const fx = (x / TS) * f, fy = (y / TS) * f;
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const w = (a) => ((a % f) + f) % f;
  const a = hash(w(x0), w(y0), s), b = hash(w(x0 + 1), w(y0), s), c = hash(w(x0), w(y0 + 1), s), d = hash(w(x0 + 1), w(y0 + 1), s);
  return mix(mix(a, b, sx), mix(c, d, sx), sy);
}
const fbm = (x, y, s, oct = 4, f = 4) => { let v = 0, amp = 0.5, tot = 0; for (let o = 0; o < oct; o++) { v += vnoise(x, y, f << o, s + o * 17) * amp; tot += amp; amp *= 0.5; } return v / tot; };
const grain = (x, y, s) => hash(x, y, s) - 0.5;

// water stains & drips from the ceiling line, darker near the floor
function grime(x, y, c, amt = 1, seed = 3) {
  const n = fbm(x, y, seed, 4, 2);
  let k = 1 - Math.max(0, n - 0.55) * 1.6 * amt;
  const drip = vnoise(x, 0, 16, seed + 5);
  if (drip > 0.72 && y < 8 + (drip - 0.72) * 160) k *= 0.78;
  k *= 1 - (y / TS) * 0.18 * amt;
  k += grain(x, y, seed) * 0.08;
  return [c[0] * k, c[1] * k * 0.98, c[2] * k * 0.94];
}

function damask(x, y, size = 16) {
  const lx = (x % size) - size / 2, ly = (y % size) - size / 2;
  const ox = ((x + size / 2) % size) - size / 2, oy = ((y + size / 2) % size) - size / 2;
  const a = Math.abs(lx) * 1.3 + Math.abs(ly) < size * 0.32 && Math.abs(lx) * 1.3 + Math.abs(ly) > size * 0.12;
  const b = Math.hypot(ox, oy * 1.4) < size * 0.13;
  return a || b;
}

function baseboard(y, c, wood = [52, 34, 22]) {
  if (y >= TS - 6) return shade(wood, y === TS - 6 ? 1.3 : 0.9);
  return c;
}

function make(fn) {
  const buf = new Uint32Array(TS * TS);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const v = fn(x, y);
    buf[y * TS + x] = v.length === 4 ? pack(v[0], v[1], v[2], v[3]) : pack(v[0], v[1], v[2]);
  }
  return buf;
}

// ── surfaces ────────────────────────────────────────────────
const T = {};

T.wood = (x, y) => {
  const plank = Math.floor(x / 11), seam = x % 11 === 0;
  const off = hash(plank, 0, 2) * 64;
  const ring = Math.sin((y + off) * 0.35 + vnoise(x, y + off, 4, plank) * 6) * 0.5 + 0.5;
  let c = mixc([70, 44, 26], [96, 62, 36], ring * 0.6 + hash(plank, 1, 3) * 0.4);
  if (seam || (y + off * 3) % 64 === 0) c = shade(c, 0.45);
  return grime(x, y, c, 0.7, 11);
};
T.woodDark = (x, y) => shade(T.wood(x, y), 0.7);
T.checker = (x, y) => {
  const on = (Math.floor(x / 16) + Math.floor(y / 16)) % 2 === 0;
  let c = on ? [150, 142, 120] : [26, 24, 22];
  if (x % 16 === 0 || y % 16 === 0) c = shade(c, 0.6);
  return grime(x, y, c, 1.2, 21);
};
T.tileSmall = (x, y) => {
  let c = [118, 128, 120];
  if (x % 8 === 0 || y % 8 === 0) c = [60, 58, 48];
  return grime(x, y, c, 1.3, 31);
};
T.concrete = (x, y) => {
  const n = fbm(x, y, 41, 5, 4);
  let c = shade([84, 88, 86], 0.7 + n * 0.5);
  if (Math.abs(vnoise(x, y, 6, 43) - 0.5) < 0.012) c = shade(c, 0.5); // cracks
  return grime(x, y, c, 1.2, 44);
};
T.plaster = (x, y) => {
  const n = fbm(x, y, 51, 4, 4);
  let c = shade([92, 88, 80], 0.75 + n * 0.4);
  const stain = fbm(x, y, 53, 3, 2);
  if (stain > 0.6) c = mixc(c, [70, 52, 30], (stain - 0.6) * 2);
  return c;
};
T.woodCeil = (x, y) => shade(T.wood(y, x), 0.55);
T.concreteCeil = (x, y) => shade(T.concrete(x, y), 0.6);

// ── walls ───────────────────────────────────────────────────
T.paperRose = (x, y) => {
  let c = [104, 74, 80];
  if (damask(x, y)) c = [128, 96, 100];
  if (x % 16 === 0) c = shade(c, 0.88);
  // a peeling strip
  if (x > 40 && x < 47 && y > 10 && y < 30 + (x - 40) * 3) c = (x === 46 || y === 29 + (x - 40) * 3) ? [40, 30, 26] : [150, 140, 120];
  return baseboard(y, grime(x, y, c, 1.1, 61));
};
T.paperNursery = (x, y) => {
  const stripe = Math.floor(x / 8) % 2 === 0;
  let c = stripe ? [140, 132, 96] : [124, 116, 90];
  // little faded ducks
  const lx = x % 16 - 8, ly = y % 20 - 10;
  if (Math.hypot(lx, ly) < 2.6 || Math.hypot(lx + 2.5, ly - 3) < 3) c = [150, 120, 70];
  // crayon scribbles low on the wall
  if (y > 40 && y < 56 && Math.abs(Math.sin(x * 0.7 + y * 0.2) * 6 + 48 - y) < 0.8) c = [140, 30, 30];
  return baseboard(y, grime(x, y, c, 1.0, 71), [80, 70, 50]);
};
T.kitchen = (x, y) => {
  let c;
  if (y < 30) c = [92, 102, 74];
  else if (y < 33) c = [40, 46, 34];
  else { c = [128, 138, 112]; if (x % 8 === 0 || (y - 33) % 8 === 0) c = [62, 66, 52]; }
  return baseboard(y, grime(x, y, c, 1.4, 81), [40, 36, 28]);
};
T.wainscot = (x, y) => {
  let c;
  if (y < 34) { c = Math.floor(x / 6) % 2 ? [92, 66, 44] : [80, 56, 38]; }
  else if (y < 37) c = [38, 24, 14];
  else {
    c = [64, 40, 24];
    const px = x % 32, py = y - 37;
    if (px < 3 || px > 28 || py < 3 || py > 22) c = [78, 50, 30];
    if (px === 3 || py === 3) c = [44, 28, 16];
  }
  return baseboard(y, grime(x, y, c, 1.0, 91));
};
T.bathTile = (x, y) => {
  let c = [150, 160, 150];
  if (x % 10 === 0 || y % 10 === 0) c = [70, 72, 60];
  if (y > 42) c = shade(c, 0.85);
  const mould = fbm(x, y, 95, 4, 3);
  if (mould > 0.58) c = mixc(c, [30, 42, 24], (mould - 0.58) * 3);
  return grime(x, y, c, 1.3, 96);
};
T.paperRed = (x, y) => {
  let c = [96, 30, 26];
  if (damask(x, y, 20)) c = [124, 52, 36];
  if (y < 4) c = [50, 30, 16];
  return baseboard(y, grime(x, y, c, 1.0, 101));
};
T.brick = (x, y) => {
  const row = Math.floor(y / 10), off = row % 2 ? 10 : 0;
  const mortar = y % 10 === 0 || (x + off) % 20 === 0;
  let c = mortar ? [44, 46, 46] : shade([88, 92, 92], 0.75 + hash(Math.floor((x + off) / 20), row, 5) * 0.35);
  const wet = fbm(x, y, 111, 4, 2);
  if (wet > 0.55) c = shade(c, 1 - (wet - 0.55) * 1.6);
  return grime(x, y, c, 1.4, 112);
};

// ── doors & furniture blocks ────────────────────────────────
const panelDoor = (x, y, base, seed) => {
  let c = base;
  const inPanel = (x > 8 && x < 28 && ((y > 6 && y < 28) || (y > 34 && y < 58))) || (x > 36 && x < 56 && ((y > 6 && y < 28) || (y > 34 && y < 58)));
  if (inPanel) c = shade(base, 0.82);
  if ((x === 8 || x === 36 || y === 6 || y === 34) && inPanel) c = shade(base, 0.55);
  return grime(x, y, c, 0.9, seed);
};
T.door = (x, y) => {
  let c = panelDoor(x, y, [86, 56, 34], 121);
  if (Math.hypot(x - 52, y - 34) < 2.6) c = [170, 140, 70];
  return c;
};
T.doorBasement = (x, y) => {
  let c = grime(x, y, Math.floor(y / 8) % 2 ? [70, 62, 52] : [62, 54, 46], 1.5, 131);
  if (x < 3 || x > 60) c = [30, 26, 22];
  if (x > 46 && x < 56 && y > 28 && y < 38) c = [140, 120, 60];
  if ((y === 12 || y === 50) && x > 4 && x < 60) c = [36, 36, 36];
  if (y > 14 && y < 24 && x > 14 && x < 50 && Math.abs(Math.sin(x * 0.6) * 3 + 19 - y) < 1) c = [130, 20, 20]; // scratched letters
  return c;
};
T.wardrobe = (x, y) => {
  let c = [64, 42, 28];
  if (x === 31 || x === 32) c = [24, 16, 10];
  const slat = x > 6 && x < 26 || x > 37 && x < 58;
  if (slat && y > 8 && y < 40 && y % 4 === 0) c = [20, 12, 8];
  if (slat && y > 8 && y < 40 && y % 4 === 1) c = [90, 62, 40];
  if (Math.hypot(x - 28, y - 32) < 1.8 || Math.hypot(x - 35, y - 32) < 1.8) c = [160, 130, 60];
  return grime(x, y, c, 0.9, 141);
};
T.closet = (x, y) => {
  let c = panelDoor(x, y, [74, 50, 32], 145);
  if (x > 10 && x < 54 && y > 10 && y < 30 && y % 4 < 2) c = [18, 12, 8];
  if (Math.hypot(x - 52, y - 36) < 2.4) c = [160, 130, 60];
  return c;
};
T.pantry = (x, y) => { let c = T.closet(x, y); if (x < 4) c = [10, 8, 6, 254]; return c; };
T.fridge = (x, y) => {
  let c = [150, 150, 132];
  if (y === 24) c = [60, 60, 52];
  if (x > 6 && x < 9 && ((y > 6 && y < 20) || (y > 28 && y < 44))) c = [80, 80, 72];
  if (x > 30 && x < 48 && y > 8 && y < 22) c = y === 9 ? [160, 40, 40] : [196, 190, 160];   // the note
  if (x > 32 && x < 46 && y > 12 && y < 21 && y % 3 === 0) c = [60, 50, 40];
  const rust = fbm(x, y, 151, 4, 3);
  if (rust > 0.6) c = mixc(c, [90, 50, 20], (rust - 0.6) * 2.5);
  return grime(x, y, c, 1.1, 152);
};
T.counter = (x, y) => {
  let c;
  if (y < 26) { c = (x % 32 < 2) ? [30, 22, 14] : [76, 58, 36]; if (y > 4 && y < 22 && x % 32 > 4 && x % 32 < 29 && y === 5) c = [40, 30, 20]; }
  else if (y < 30) c = [100, 100, 86];
  else { c = [70, 52, 32]; if (y === 31 || y === 44 || x % 32 === 0) c = [30, 22, 14]; if (y > 36 && y < 39 && x % 32 > 12 && x % 32 < 20) c = [24, 20, 14]; }
  return grime(x, y, c, 1.2, 161);
};
T.counterLock = (x, y) => {
  let c = T.counter(x, y);
  if (y > 31 && y < 44 && x > 2 && x < 62 && (x === 3 || x === 61 || y === 32 || y === 43)) c = [150, 120, 50];
  if (x > 28 && x < 36 && y > 34 && y < 42) c = [190, 155, 70];
  if (x > 31 && x < 33 && y > 36 && y < 40) c = [30, 20, 6];
  return c;
};
T.counterSink = (x, y) => {
  let c = T.counter(x, y);
  if (y > 6 && y < 20 && x > 26 && x < 30) c = [150, 150, 140];
  if (y > 6 && y < 9 && x > 26 && x < 38) c = [150, 150, 140];
  return c;
};
T.clock = (x, y) => {
  let c = [56, 30, 18];
  if (x < 8 || x > 56) c = [0, 0, 0, 0] && [10, 6, 4];
  const d = Math.hypot(x - 32, y - 16);
  if (d < 11) c = [190, 180, 150];
  if (d >= 11 && d < 13) c = [120, 90, 40];
  if (d < 11 && ((Math.abs(x - 32) < 1 && y < 16 && y > 8) || (Math.abs(y - 16) < 1 && x > 32 && x < 38))) c = [20, 14, 8];
  if (y > 32 && y < 58 && x > 22 && x < 42) c = [8, 6, 4];
  if (y > 32 && y < 50 && Math.abs(x - 32 - Math.sin(y * 0.1) * 3) < 1) c = [140, 110, 50];
  return grime(x, y, c, 0.8, 171);
};
T.bench = (x, y) => {
  let c = [70, 56, 38];
  if (y < 34 && (x % 6 === 3 && y % 6 === 3)) c = [26, 20, 14];
  if (y < 34 && x > 6 && x < 12 && y > 6 && y < 26) c = [36, 36, 36];
  if (y < 34 && x > 20 && x < 40 && y > 10 && y < 14) c = [44, 44, 44];
  if (y >= 34 && y < 38) c = [96, 76, 50];
  if (y >= 38) c = (x < 6 || x > 58) ? [40, 30, 20] : [14, 10, 8];
  if (y > 30 && y < 34 && x > 16 && x < 46) c = x < 30 ? [150, 30, 20] : [130, 134, 136];   // bolt cutters
  return grime(x, y, c, 1.2, 181);
};
T.shelves = (x, y) => {
  let c = [12, 10, 8];
  if (y % 16 > 13) c = [70, 52, 34];
  else if (y % 16 > 3) {
    const jar = Math.floor(x / 10), jx = x % 10;
    if (jx > 1 && jx < 9 && hash(jar, Math.floor(y / 16), 7) > 0.3) c = shade([[90, 70, 30], [60, 80, 40], [100, 40, 30], [70, 90, 90]][Math.floor(hash(jar, Math.floor(y / 16), 8) * 4)], 0.6 + (jx === 3 ? 0.4 : 0));
  }
  return grime(x, y, c, 1.2, 191);
};
T.boiler = (x, y) => {
  const cyl = 0.55 + Math.sin((x / 64) * Math.PI) * 0.45;
  let c = shade([84, 92, 92], cyl);
  if (y % 16 === 0) c = [30, 34, 34];
  if (y > 38 && y < 52 && x > 18 && x < 46) c = x % 5 < 2 ? [20, 8, 4] : [255, 110, 30, 254];
  if (Math.hypot(x - 32, y - 18) < 5) c = [30, 30, 30];
  return grime(x, y, c, 1.5, 201);
};
T.frontDoor = (x, y) => {
  let c = panelDoor(x, y, [70, 26, 18], 211);
  if (y < 16) {
    const d = Math.hypot(x - 32, y - 16);
    c = d < 15 ? ((Math.floor(Math.atan2(16 - y, x - 32) * 3) % 2) ? [200, 60, 30, 254] : [170, 110, 30, 254]) : [30, 12, 8];
    if (d < 15 && Math.abs((Math.atan2(16 - y, x - 32) * 3) % 1) < 0.08) c = [20, 8, 6];
  }
  if (x > 46 && x < 52 && y > 30 && y < 38) c = [180, 150, 70];
  if (Math.abs(y - (26 + (x - 40) * 0.3)) < 1.5 && x > 30 && x < 58 && x % 4 < 3) c = [150, 150, 146];   // chain
  return c;
};
T.stairsDown = (x, y) => {
  let c = [6, 5, 4];
  if (x < 6 || x > 58 || y < 4) c = [50, 34, 22];
  else { const step = Math.floor((y - 4) / 8); const k = Math.max(0, 0.5 - step * 0.09); if ((y - 4) % 8 === 0) c = shade([90, 70, 50], k); }
  return c;
};
T.stairsUp = (x, y) => {
  let c = [20, 16, 12];
  const step = Math.floor(y / 7);
  c = shade([92, 72, 50], 0.25 + step * 0.06);
  if (y % 7 === 0) c = [20, 14, 10];
  if (x < 4 || x > 60) c = [40, 30, 20];
  if (y < 6 && x > 20 && x < 44) c = [180, 140, 80, 254];   // light from the door at the top
  return c;
};
T.window = (x, y) => {
  let c = T.paperRose(x, y);
  if (x > 12 && x < 52 && y > 8 && y < 46) {
    c = mixc([10, 14, 26], [36, 48, 80], y / 46);
    const m = Math.hypot(x - 40, y - 18);
    if (m < 5) c = [220, 228, 240];
    else if (m < 14) c = mixc(c, [120, 140, 190], (14 - m) / 30);
    if (y > 32 && Math.sin(x * 0.4) * 4 + 36 < y) c = [4, 5, 8];   // dead trees
    if (hash(x, y, 9) > 0.985) c = [140, 150, 180];                   // rain beads
    c = [...c, 254];
    if (x === 32 || y === 27) c = [24, 18, 16];
  }
  if ((x === 12 || x === 52) && y > 8 && y < 46 || (y === 8 || y === 46) && x >= 12 && x <= 52) c = [24, 18, 16];
  return c;
};
const framed = (base, face) => (x, y) => {
  let c = base(x, y);
  if (x > 18 && x < 46 && y > 6 && y < 32) {
    if (x < 21 || x > 43 || y < 9 || y > 29) c = [110, 80, 30];
    else c = face(x - 21, y - 9);
  }
  return c;
};
T.portrait = framed(T.wainscot, (x, y) => {
  let c = [40, 34, 26];
  [3, 8, 13, 18].forEach((fx, i) => {
    if (Math.hypot(x - fx, y - 7) < 2.4) c = i === 1 ? [190, 170, 140] : [70, 60, 40];
    if (y > 9 && Math.abs(x - fx) < 3) c = [24, 20, 16];
    if (i !== 1 && Math.abs(x - fx + y - 7) < 0.6 && y < 10 && y > 4) c = [150, 140, 120];  // scratched out
  });
  return c;
});
T.portrait2 = framed(T.wainscot, (x, y) => {
  let c = [50, 40, 34];
  if (Math.hypot((x - 11) * 1.1, y - 8) < 5) c = [170, 160, 140];
  if (Math.hypot(x - 9, y - 7) < 1.3 || Math.hypot(x - 13, y - 7) < 1.3) c = [0, 0, 0];
  if (y > 13) c = [30, 26, 24];
  if (Math.abs(x - 11) < 2 && y > 10 && y < 12) c = [60, 10, 10];
  return c;
});

const FONT = { G: ['0111', '1000', '1011', '1001', '0111'], E: ['1111', '1000', '1110', '1000', '1111'], T: ['1111', '0110', '0110', '0110', '0110'], O: ['0110', '1001', '1001', '1001', '0110'], U: ['1001', '1001', '1001', '1001', '0110'], ' ': ['0000', '0000', '0000', '0000', '0000'] };
T.writing = (x, y) => {
  let c = T.plaster(x, y);
  const text = 'GET OUT';
  const lx = x - 2, ly = y - 18;
  const ch = Math.floor(lx / 9), col = Math.floor((lx % 9) / 2), row = Math.floor((ly - Math.sin(ch) * 2) / 3);
  if (lx >= 0 && ch < text.length && col < 4 && row >= 0 && row < 5 && FONT[text[ch]][row][col] === '1') c = [140, 16, 12];
  const drip = hash(x, 0, 77);
  if (drip > 0.7 && y > 20 && y < 24 + drip * 30 && x % 3 === 0) c = [110, 10, 8];
  return c;
};
T.handprints = (x, y) => {
  let c = T.plaster(x, y);
  for (const [hx, hy, s] of [[14, 22, 1], [34, 14, 1.1], [48, 30, 0.9], [24, 42, 1]]) {
    const dx = (x - hx) / s, dy = (y - hy) / s;
    const palm = Math.hypot(dx * 1.1, dy) < 4.2;
    const finger = dy < -2 && dy > -11 && [-4, -1.5, 1, 3.5].some((f, i) => Math.abs(dx - f - dy * 0.06 * (i - 1.5)) < 0.9) && dy > -9 - (1 - Math.abs([-4, -1.5, 1, 3.5].findIndex((f) => Math.abs(dx - f) < 1.2) - 1.5) / 2) * 2;
    const thumb = Math.abs(dx - 5 - (dy + 1) * -0.6) < 1 && dy > -4 && dy < 1;
    if (palm || finger || thumb) c = mixc([120, 12, 10], [70, 8, 6], hash(x, y, 3));
    if (Math.abs(dx) < 3 && dy > 3 && dy < 3 + hash(Math.round(x), 0, hx) * 14 && x % 2 === 0) c = [100, 10, 8];
  }
  return c;
};

const cache = {};
export function textures() {
  if (cache.ready) return cache;
  for (const [k, fn] of Object.entries(T)) cache[k] = make(fn);
  cache.door = make(T.door);
  cache.ready = true;
  return cache;
}
export const TEXTURE_NAMES = Object.keys(T);
