// ─────────────────────────────────────────────────────────────
//  Billboard sprites, painted with Canvas 2D at load time.
//  Each sprite: { w, h, data: Uint32Array (ABGR) }.
//  Anything painted on the `glow` layer becomes emissive
//  (alpha 0xFE) — eyes and flames that shine in the dark.
//  The 3D renderer gets a hi-res copy (4×, characters 6×) with a
//  generated normal map, so the flashlight wraps around them.
// ─────────────────────────────────────────────────────────────

const HI = 4;   // default hi-res factor; characters use 6

function paint(w, h, draw, { fadeFrom = null, hi = HI } = {}) {
  const mk = (cw, ch) => { const c = document.createElement('canvas'); c.width = cw; c.height = ch; return c; };
  const layers = (S) => {
    const base = mk(w * S, h * S), glow = mk(w * S, h * S);
    const ctx = base.getContext('2d', { willReadFrequently: true }), g = glow.getContext('2d', { willReadFrequently: true });
    ctx.scale(S, S); g.scale(S, S);
    ctx.lineCap = g.lineCap = 'round';
    ctx.lineJoin = g.lineJoin = 'round';
    draw(ctx, g, w, h);
    return { base, glow, ctx, g };
  };
  // low-res: hard-edged pixels for the retro renderer
  const lo = layers(1);
  const a = lo.ctx.getImageData(0, 0, w, h).data, b = lo.g.getImageData(0, 0, w, h).data;
  const out = new Uint32Array(w * h);
  for (let i = 0, p = 0; p < out.length; p++, i += 4) {
    const y = (p / w) | 0;
    if (b[i + 3] > 110) { out[p] = (254 << 24 | b[i + 2] << 16 | b[i + 1] << 8 | b[i]) >>> 0; continue; }
    let alpha = a[i + 3];
    if (fadeFrom !== null && y > fadeFrom) {
      const t = (y - fadeFrom) / (h - fadeFrom);
      const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5][(y % 4) * 4 + ((p % w) % 4)] / 16;
      if (t > bayer) alpha = 0;
    }
    out[p] = alpha < 120 ? 0 : (255 << 24 | a[i + 2] << 16 | a[i + 1] << 8 | a[i]) >>> 0;
  }
  // hi-res: smooth, anti-aliased, soft fade at the bottom
  const S = hi;
  const H2L = layers(S);
  const W2 = w * S, H2 = h * S;
  const img = H2L.ctx.getImageData(0, 0, W2, H2), d = img.data;
  for (let y = 0; y < H2; y++) {
    const fk = fadeFrom !== null && y > fadeFrom * S ? (1 - (y - fadeFrom * S) / ((h - fadeFrom) * S)) ** 2 : 1;
    for (let x = 0; x < W2; x++) {
      const i = (y * W2 + x) * 4;
      if (!d[i + 3]) continue;
      d[i + 3] *= fk;
      // film-like grain and darkened edges so they don't look like flat vector cut-outs
      const n = 0.86 + Math.random() * 0.18;
      const edge = 0.78 + 0.22 * Math.min(1, Math.min(x, W2 - x) / (W2 * 0.25));
      const k = n * edge * (0.86 + 0.14 * (1 - y / H2));
      d[i] *= k; d[i + 1] *= k; d[i + 2] *= k;
    }
  }
  H2L.ctx.putImageData(img, 0, 0);
  return { w, h, data: out, canvas: H2L.base, glowCanvas: H2L.glow, normalCanvas: bulgeNormals(H2L.base, Math.round(S * 1.5)) };
}

// Rounded normals from the silhouette: blur the alpha into a height field and take its slope.
// Running-sum box blur, so the cost doesn't grow with the radius.
function bulgeNormals(cv, r = 6) {
  const W = cv.width, H = cv.height;
  const a = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  let h = new Float32Array(W * H);
  for (let i = 0; i < h.length; i++) h[i] = a[i * 4 + 3] / 255;
  const blur = (src, horiz) => {
    const out = new Float32Array(W * H);
    const n = horiz ? W : H, m = horiz ? H : W;
    for (let j = 0; j < m; j++) {
      const at = (k) => (horiz ? j * W + k : k * W + j);
      let sum = 0, cnt = 0;
      for (let k = 0; k <= Math.min(r, n - 1); k++) { sum += src[at(k)]; cnt++; }
      for (let k = 0; k < n; k++) {
        out[at(k)] = sum / cnt;
        const add = k + r + 1, rem = k - r;
        if (add < n) { sum += src[at(add)]; cnt++; }
        if (rem >= 0) { sum -= src[at(rem)]; cnt--; }
      }
    }
    return out;
  };
  h = blur(blur(blur(blur(h, true), false), true), false);
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const ctx = out.getContext('2d'), img = ctx.createImageData(W, H), d = img.data;
  const k = 5 * (6 / r);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const gx = (h[y * W + Math.min(W - 1, x + 1)] - h[y * W + Math.max(0, x - 1)]) * k;
    const gy = (h[Math.min(H - 1, y + 1) * W + x] - h[Math.max(0, y - 1) * W + x]) * k;
    let nx = -gx, ny = -gy, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * W + x) * 4;
    d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

// ── painting helpers ────────────────────────────────────────
const strands = (ctx, x, y, len, spread, n, color = '#0a0808', width = 1.6, sway = 0) => {
  ctx.strokeStyle = color;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1) - 0.5;
    const sx = x + t * spread * 0.6, ex = x + t * spread + Math.sin(i * 1.7) * 2 + sway;
    ctx.lineWidth = width * (0.55 + ((i * 7) % 5) / 8);
    ctx.globalAlpha = 0.75 + ((i * 3) % 4) / 16;
    ctx.beginPath();
    ctx.moveTo(sx, y);
    ctx.bezierCurveTo(sx + t * 4, y + len * 0.3, ex - t * 3, y + len * 0.7, ex, y + len * (0.85 + Math.sin(i * 2.3) * 0.15));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
};

const qpt = (p0, p1, p2, t) => { const u = 1 - t; return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]; };

/** A tapered, filled limb along a curve — knobbly at the joint, shaded on one side. */
function limb(c, p0, p1, p2, w0, w1, col, { joint = 0.18, shadow = 'rgba(0,0,0,0.38)', light = 'rgba(255,250,235,0.10)' } = {}) {
  const N = 18, L = [], R = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const [px, py] = qpt(p0, p1, p2, t);
    const [ax, ay] = qpt(p0, p1, p2, Math.max(0, t - 0.03)), [bx, by] = qpt(p0, p1, p2, Math.min(1, t + 0.03));
    let tx = bx - ax, ty = by - ay; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    const w = ((w0 + (w1 - w0) * t) * (1 + joint * Math.exp(-((t - 0.5) ** 2) / 0.006))) / 2;
    L.push([px - ty * w, py + tx * w]); R.push([px + ty * w, py - tx * w]);
  }
  const path = new Path2D();
  path.moveTo(...L[0]); L.forEach((p) => path.lineTo(...p));
  for (let i = R.length - 1; i >= 0; i--) path.lineTo(...R[i]);
  path.closePath();
  c.fillStyle = col; c.fill(path);
  c.save(); c.clip(path);
  const lw = Math.max(w0, w1);
  c.lineWidth = lw * 0.7; c.strokeStyle = shadow;
  c.beginPath(); c.moveTo(...R[0]); R.forEach((p) => c.lineTo(...p)); c.stroke();
  c.lineWidth = lw * 0.25; c.strokeStyle = light;
  c.beginPath(); c.moveTo(...L[0]); L.forEach((p) => c.lineTo(...p)); c.stroke();
  c.restore();
  return path;
}

/** A hand: a narrow palm and long, slightly curled fingers fanning out along `ang`. */
function hand(c, x, y, ang, len, col, { spread = 0.32, curl = 0.25, width = 1.2, nails = '#140c08' } = {}) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const palmX = x + ca * len * 0.28, palmY = y + sa * len * 0.28;
  limb(c, [x, y], [(x + palmX) / 2, (y + palmY) / 2], [palmX, palmY], width * 1.9, width * 2.2, col, { joint: 0 });
  for (let i = 0; i < 4; i++) {
    const a = ang + (i - 1.5) * spread * 0.5;
    const fl = len * (0.72 + (i === 1 || i === 2 ? 0.12 : 0));
    const ox = palmX + Math.cos(a + Math.PI / 2) * (i - 1.5) * width * 0.55, oy = palmY + Math.sin(a + Math.PI / 2) * (i - 1.5) * width * 0.55;
    const ex = ox + Math.cos(a) * fl, ey = oy + Math.sin(a) * fl;
    const mx = ox + Math.cos(a + curl) * fl * 0.55, my = oy + Math.sin(a + curl) * fl * 0.55;
    limb(c, [ox, oy], [mx, my], [ex, ey], width * 0.75, width * 0.38, col, { joint: 0.35, shadow: 'rgba(0,0,0,0.3)' });
    // long, dark, broken nails
    if (nails) { c.strokeStyle = nails; c.lineWidth = width * 0.34; c.beginPath(); c.moveTo(ex - (ex - mx) * 0.12, ey - (ey - my) * 0.12); c.lineTo(ex + (ex - mx) * 0.16, ey + (ey - my) * 0.16); c.stroke(); }
  }
}

/** Soft line: the same stroke three times, wide and faint to narrow and darker. */
function soft(c, pts, rgb, alpha, width = 1) {
  for (const [w, k] of [[width * 3.2, 0.25], [width * 1.8, 0.45], [width * 0.7, 0.8]]) {
    c.strokeStyle = `rgba(${rgb},${alpha * k})`; c.lineWidth = w;
    c.beginPath(); c.moveTo(...pts[0]);
    if (pts.length === 3) c.quadraticCurveTo(...pts[1], ...pts[2]); else pts.slice(1).forEach((p) => c.lineTo(...p));
    c.stroke();
  }
}

/** Fabric: a gradient fill, clipped folds, darker sides for volume, grime at the hem. */
function cloth(c, path, { top, bottom, x0, x1, light, dark, folds = [], hem = 'rgba(40,30,20,0.6)' }) {
  const g = c.createLinearGradient(0, top, 0, bottom);
  g.addColorStop(0, light); g.addColorStop(1, dark);
  c.fillStyle = g; c.fill(path);
  c.save(); c.clip(path);
  for (const [xt, xb, k] of folds) soft(c, [[xt, top], [(xt + xb) / 2 + (xb - xt) * 0.15, (top + bottom) / 2], [xb, bottom]], k > 0 ? '255,250,235' : '0,0,0', Math.abs(k), 1.4);
  const sg = c.createLinearGradient(x0, 0, x1, 0);
  sg.addColorStop(0, 'rgba(0,0,0,0.55)'); sg.addColorStop(0.3, 'rgba(0,0,0,0)'); sg.addColorStop(0.62, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,0.6)');
  c.fillStyle = sg; c.fillRect(x0 - 2, top - 2, x1 - x0 + 4, bottom - top + 4);
  const hg = c.createLinearGradient(0, bottom - (bottom - top) * 0.3, 0, bottom);
  hg.addColorStop(0, 'rgba(0,0,0,0)'); hg.addColorStop(1, hem);
  c.fillStyle = hg; c.fillRect(x0 - 2, top, x1 - x0 + 4, bottom - top + 4);
  c.restore();
}

/** A soft-edged blot: blood, mud, water. */
function stain(c, x, y, rx, ry, rgb, a) {
  const g = c.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
  g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(0.6, `rgba(${rgb},${a * 0.6})`); g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g;
  c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, 7); c.fill();
}

/**
 * A face, painted around (0,0). Everything is relative to the head's radii.
 *   eyes:  hollow | wide | black | milky | slits | none
 *   mouth: gape | gapeWide | line | smile | grin | o | none
 *   glow:  colour of what shines in the dark (eyes), or null
 *   tears: 'black' | 'blood' | null — streaks running from the eyes
 *   rot:   0..1 — mottled, bruised, dead skin
 */
function face(c, g, rx, ry, { skin = ['#e6dfd0', '#a8a090', '#5a544a'], eyes = 'hollow', mouth = 'none', glow = null, glowK = 1, look = 0, tears = null, rot = 0.6, lids = 0.25 } = {}) {
  const rnd = mulberry(Math.round(rx * 97 + ry * 13 + (eyes.length * 7) + (mouth.length * 3)));
  // an unhinged jaw hangs below the chin
  if (mouth === 'gapeWide') {
    const jg = c.createLinearGradient(0, ry * 0.5, 0, ry * 1.5);
    jg.addColorStop(0, skin[1]); jg.addColorStop(1, skin[2]);
    c.fillStyle = jg; c.beginPath(); c.ellipse(0, ry * 0.95, rx * 0.48, ry * 0.55, 0, 0, 7); c.fill();
  }
  // skull: wide brow, hollow temples, narrow jaw
  const head = new Path2D();
  head.moveTo(0, -ry);
  head.bezierCurveTo(rx * 1.05, -ry, rx * 1.08, -ry * 0.15, rx * 0.9, ry * 0.25);
  head.bezierCurveTo(rx * 0.75, ry * 0.75, rx * 0.35, ry, 0, ry);
  head.bezierCurveTo(-rx * 0.35, ry, -rx * 0.75, ry * 0.75, -rx * 0.9, ry * 0.25);
  head.bezierCurveTo(-rx * 1.08, -ry * 0.15, -rx * 1.05, -ry, 0, -ry);
  const sk = c.createRadialGradient(-rx * 0.25, -ry * 0.3, rx * 0.1, 0, 0, ry * 1.1);
  sk.addColorStop(0, skin[0]); sk.addColorStop(0.55, skin[1]); sk.addColorStop(1, skin[2]);
  c.fillStyle = sk; c.fill(head);
  c.save(); c.clip(head);
  // sunken cheeks, hollow temples, a skull pressing up through the skin
  stain(c, -rx * 0.62, ry * 0.3, rx * 0.34, ry * 0.36, '16,12,10', 0.6);
  stain(c, rx * 0.62, ry * 0.3, rx * 0.34, ry * 0.36, '16,12,10', 0.65);
  stain(c, -rx * 0.88, -ry * 0.35, rx * 0.28, ry * 0.34, '16,12,10', 0.5);
  stain(c, rx * 0.88, -ry * 0.35, rx * 0.28, ry * 0.34, '16,12,10', 0.55);
  soft(c, [[-rx * 0.85, ry * 0.05], [-rx * 0.55, ry * 0.12], [-rx * 0.3, ry * 0.05]], '255,250,235', 0.12, rx * 0.06);
  soft(c, [[rx * 0.85, ry * 0.05], [rx * 0.55, ry * 0.12], [rx * 0.3, ry * 0.05]], '255,250,235', 0.1, rx * 0.06);
  // dead skin: grey-green mottling and bruises
  for (let i = 0; i < Math.round(rot * 14); i++) {
    const x = (rnd() - 0.5) * rx * 1.8, y = (rnd() - 0.5) * ry * 1.8;
    stain(c, x, y, rx * (0.1 + rnd() * 0.25), ry * (0.08 + rnd() * 0.2), rnd() < 0.5 ? '60,72,50' : '70,40,60', 0.12 + rnd() * 0.14);
  }
  // veins, dark under the skin
  c.lineWidth = rx * 0.035;
  for (let i = 0; i < 2 + Math.round(rot * 4); i++) {
    const x = (rnd() - 0.5) * rx * 1.4, y = -ry * (0.3 + rnd() * 0.6);
    c.strokeStyle = 'rgba(50,55,85,0.3)';
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + (rnd() - 0.5) * rx * 0.4, y + ry * 0.2, x + (rnd() - 0.5) * rx * 0.5, y + ry * 0.4); c.stroke();
  }
  c.restore();
  const ey = -ry * 0.12, ex = rx * 0.42;
  // sockets, and bruised bags under them
  for (const sx of [-ex, ex]) {
    stain(c, sx, ey, rx * 0.42, ry * 0.28, '8,4,4', eyes === 'wide' ? 0.7 : 0.9);
    stain(c, sx, ey + ry * 0.17, rx * 0.3, ry * 0.09, '60,30,50', 0.5);
    soft(c, [[sx - rx * 0.24, ey + ry * 0.16], [sx, ey + ry * 0.25], [sx + rx * 0.24, ey + ry * 0.16]], '20,10,14', 0.6, rx * 0.04);
  }
  const almond = (sx, ew, eh) => { const p = new Path2D(); p.moveTo(sx - ew, ey + eh * 0.1); p.quadraticCurveTo(sx - ew * 0.1, ey - eh * 1.5, sx + ew, ey - eh * 0.1); p.quadraticCurveTo(sx + ew * 0.1, ey + eh * 1.35, sx - ew, ey + eh * 0.1); return p; };
  for (const sx of [-ex, ex]) {
    const side = sx < 0 ? -1 : 1;
    if (eyes === 'hollow') {
      c.fillStyle = '#000'; c.beginPath(); c.ellipse(sx, ey, rx * 0.25, ry * 0.16, 0, 0, 7); c.fill();
      if (glow) { g.fillStyle = glow; g.globalAlpha = glowK; g.beginPath(); g.arc(sx + rx * 0.03, ey, rx * 0.07, 0, 7); g.fill(); g.globalAlpha = 1; }
    } else if (eyes === 'wide' || eyes === 'milky') {
      // almond-shaped, yellowed, bloodshot; a pale iris and a pinprick pupil that never moves off you
      const ew = rx * 0.25, eh = ry * 0.12;
      const eye = almond(sx, ew, eh);
      const wg = c.createRadialGradient(sx, ey, 0, sx, ey, ew);
      wg.addColorStop(0, eyes === 'milky' ? '#dfe6e2' : '#ece4cc'); wg.addColorStop(0.7, eyes === 'milky' ? '#aebcba' : '#cfc19c'); wg.addColorStop(1, '#7a5a48');
      c.fillStyle = wg; c.fill(eye);
      c.save(); c.clip(eye);
      c.strokeStyle = 'rgba(160,20,20,0.6)'; c.lineWidth = rx * 0.02;
      for (let k = 0; k < 6; k++) {
        const fx = sx + side * ew * (rnd() < 0.5 ? 1 : -1), fy = ey + (rnd() - 0.5) * eh;
        c.beginPath(); c.moveTo(fx, fy); c.quadraticCurveTo((fx + sx) / 2, fy + (rnd() - 0.5) * eh, sx + (fx - sx) * 0.35, ey + (rnd() - 0.5) * eh * 0.6); c.stroke();
      }
      const ix = sx + look * rx * 0.06;
      if (eyes === 'wide') {
        c.fillStyle = '#6a6e64'; c.beginPath(); c.arc(ix, ey, rx * 0.085, 0, 7); c.fill();
        c.fillStyle = '#000'; c.beginPath(); c.arc(ix, ey, rx * 0.032, 0, 7); c.fill();
      } else {
        c.fillStyle = 'rgba(150,170,170,0.55)'; c.beginPath(); c.arc(ix, ey, rx * 0.1, 0, 7); c.fill();
      }
      // a heavy upper lid
      if (lids > 0) { c.fillStyle = skin[2]; c.globalAlpha = 0.85; c.fillRect(sx - ew * 1.1, ey - eh * 1.6, ew * 2.2, eh * 1.6 * lids * 1.6); c.globalAlpha = 1; }
      c.restore();
      c.strokeStyle = 'rgba(30,8,8,0.85)'; c.lineWidth = rx * 0.035; c.stroke(eye);
      if (glow) {
        g.save(); g.clip(eye);
        g.globalAlpha = 0.12 * glowK; g.fillStyle = glow; g.fillRect(sx - ew, ey - eh * 1.5, ew * 2, eh * 3);
        g.restore();
        g.globalAlpha = glowK; g.fillStyle = '#ffffff'; g.beginPath(); g.arc(ix - rx * 0.035, ey - ry * 0.025, rx * 0.025, 0, 7); g.fill();
        g.globalAlpha = 1;
      }
    } else if (eyes === 'black') {
      c.fillStyle = '#020101'; c.fill(almond(sx, rx * 0.27, ry * 0.15));
      c.strokeStyle = 'rgba(70,10,10,0.6)'; c.lineWidth = rx * 0.04; c.stroke(almond(sx, rx * 0.27, ry * 0.15));
      if (glow) { g.globalAlpha = glowK; g.fillStyle = glow; g.beginPath(); g.arc(sx - rx * 0.07, ey - ry * 0.04, rx * 0.04, 0, 7); g.fill(); g.globalAlpha = 1; }
    } else if (eyes === 'slits') {
      c.fillStyle = '#000'; c.fillRect(sx - rx * 0.22, ey - ry * 0.03, rx * 0.44, ry * 0.07);
      if (glow) { g.globalAlpha = glowK; g.fillStyle = glow; g.fillRect(sx - rx * 0.06, ey - ry * 0.02, rx * 0.12, ry * 0.05); g.globalAlpha = 1; }
    }
    // streaks running down from the eyes
    if (tears) {
      const col = tears === 'blood' ? '90,4,4' : '6,4,4';
      const x0 = sx + (rnd() - 0.5) * rx * 0.1;
      soft(c, [[x0, ey + ry * 0.1], [x0 + side * rx * 0.06, ey + ry * 0.45], [x0 + side * rx * 0.02 + (rnd() - 0.5) * rx * 0.1, ey + ry * (0.75 + rnd() * 0.3)]], col, 0.9, rx * 0.05);
      soft(c, [[x0 - side * rx * 0.08, ey + ry * 0.12], [x0 - side * rx * 0.06, ey + ry * 0.35], [x0 - side * rx * 0.1, ey + ry * 0.5]], col, 0.7, rx * 0.03);
    }
  }
  // nose: barely there — a shadow and two dark nostrils
  stain(c, rx * 0.05, ry * 0.3, rx * 0.16, ry * 0.08, '16,10,8', 0.6);
  c.fillStyle = 'rgba(8,4,4,0.9)';
  c.beginPath(); c.ellipse(-rx * 0.08, ry * 0.32, rx * 0.055, ry * 0.03, 0.3, 0, 7); c.ellipse(rx * 0.1, ry * 0.32, rx * 0.055, ry * 0.03, -0.3, 0, 7); c.fill();
  // mouth
  const my = ry * 0.55;
  const lipCracks = (x0, x1, y) => { c.strokeStyle = 'rgba(20,6,6,0.6)'; c.lineWidth = rx * 0.02; for (let x = x0; x < x1; x += rx * 0.07) { c.beginPath(); c.moveTo(x, y - ry * 0.025); c.lineTo(x + rx * 0.01, y + ry * 0.025); c.stroke(); } };
  if (mouth === 'gape' || mouth === 'gapeWide') {
    const h = mouth === 'gapeWide' ? ry * 0.95 : ry * 0.3, mw = mouth === 'gapeWide' ? rx * 0.3 : rx * 0.26;
    const cy = my + h * 0.42 - ry * 0.05;
    c.fillStyle = 'rgba(60,40,50,0.8)'; c.beginPath(); c.ellipse(0, cy, mw + rx * 0.05, h / 2 + ry * 0.03, 0, 0, 7); c.fill();
    const mg = c.createLinearGradient(0, cy - h / 2, 0, cy + h / 2);
    mg.addColorStop(0, '#2a0404'); mg.addColorStop(0.25, '#050000'); mg.addColorStop(1, '#000');
    c.fillStyle = mg; c.beginPath(); c.ellipse(0, cy, mw, h / 2, 0, 0, 7); c.fill();
    // too many teeth, uneven, top and bottom
    for (let i = -3; i <= 3; i++) {
      const tl = ry * (0.06 + rnd() * 0.06);
      c.fillStyle = rnd() < 0.3 ? '#8a7a54' : '#cfc29c';
      c.beginPath(); c.moveTo(i * mw * 0.24 - mw * 0.09, cy - h / 2 + ry * 0.03); c.lineTo(i * mw * 0.24 + (rnd() - 0.5) * mw * 0.05, cy - h / 2 + ry * 0.03 + tl); c.lineTo(i * mw * 0.24 + mw * 0.09, cy - h / 2 + ry * 0.03); c.fill();
      if (Math.abs(i) < 3 && mouth === 'gapeWide') { c.beginPath(); c.moveTo(i * mw * 0.24 - mw * 0.08, cy + h / 2 - ry * 0.03); c.lineTo(i * mw * 0.24, cy + h / 2 - ry * 0.03 - tl * 0.8); c.lineTo(i * mw * 0.24 + mw * 0.08, cy + h / 2 - ry * 0.03); c.fill(); }
    }
    // something dark running from the corners
    soft(c, [[mw * 0.7, cy], [mw * 0.8, cy + h * 0.5], [mw * 0.75, cy + h * 0.5 + ry * 0.35]], '40,4,4', 0.8, rx * 0.04);
  } else if (mouth === 'line') {
    soft(c, [[-rx * 0.36, my - ry * 0.02], [0, my + ry * 0.08], [rx * 0.36, my - ry * 0.04]], '40,20,30', 0.5, rx * 0.12);
    soft(c, [[-rx * 0.34, my], [0, my + ry * 0.06], [rx * 0.34, my - ry * 0.02]], '20,6,6', 0.95, rx * 0.04);
    lipCracks(-rx * 0.28, rx * 0.28, my + ry * 0.03);
  } else if (mouth === 'smile' || mouth === 'grin') {
    // far too wide — the corners reach past the cheeks, and the skin splits to make room
    const w = mouth === 'grin' ? rx * 0.98 : rx * 0.55, d = mouth === 'grin' ? ry * 0.32 : ry * 0.08;
    const lift = mouth === 'grin' ? ry * 0.28 : ry * 0.1;
    const m = new Path2D();
    m.moveTo(-w, my - lift); m.quadraticCurveTo(0, my + d * 2.1, w, my - lift); m.quadraticCurveTo(0, my + d * 0.55, -w, my - lift);
    c.fillStyle = 'rgba(50,30,40,0.7)'; c.lineWidth = rx * 0.1; c.strokeStyle = 'rgba(70,40,50,0.5)'; c.stroke(m);
    c.fillStyle = '#0a0101'; c.fill(m);
    if (mouth === 'grin') {
      c.save(); c.clip(m);
      for (let i = -11; i <= 11; i++) {
        const x = (i / 11) * w * 0.96, t = 1 - (x / w) ** 2;
        const top = my - lift + d * 0.55 * t, bot = my - lift + d * 2.1 * t * 0.98;
        c.fillStyle = rnd() < 0.25 ? '#8c7a50' : '#d6c9a2';
        const tw = w * 0.07;
        c.fillRect(x - tw / 2, top - ry * 0.01, tw * 0.9, (bot - top) * (0.4 + rnd() * 0.12));
        c.fillRect(x - tw / 2 + tw * 0.3, top + (bot - top) * 0.58, tw * 0.9, (bot - top) * 0.45);
      }
      c.fillStyle = 'rgba(80,0,0,0.6)'; c.fillRect(-w, my - lift + d * 1.05, w * 2, ry * 0.03);
      c.restore();
      // the cheeks bunch up into the eyes; the corners have torn
      soft(c, [[-w * 1.02, my - lift], [-w * 0.95, my - ry * 0.32], [-w * 0.55, my - ry * 0.48]], '24,14,10', 0.7, rx * 0.05);
      soft(c, [[w * 1.02, my - lift], [w * 0.95, my - ry * 0.32], [w * 0.55, my - ry * 0.48]], '24,14,10', 0.7, rx * 0.05);
      soft(c, [[-w, my - lift], [-w * 1.08, my - lift - ry * 0.04], [-w * 1.16, my - lift - ry * 0.1]], '90,6,6', 0.9, rx * 0.035);
      soft(c, [[w, my - lift], [w * 1.08, my - lift - ry * 0.04], [w * 1.16, my - lift - ry * 0.1]], '90,6,6', 0.9, rx * 0.035);
    } else lipCracks(-w * 0.8, w * 0.8, my);
    c.strokeStyle = 'rgba(60,10,14,0.8)'; c.lineWidth = rx * 0.03; c.stroke(m);
  } else if (mouth === 'o') {
    c.fillStyle = 'rgba(60,40,50,0.7)'; c.beginPath(); c.ellipse(0, my + ry * 0.06, rx * 0.17, ry * 0.2, 0, 0, 7); c.fill();
    c.fillStyle = '#030101'; c.beginPath(); c.ellipse(0, my + ry * 0.06, rx * 0.13, ry * 0.16, 0, 0, 7); c.fill();
  }
  return head;
}

/** Deterministic randomness, so the same character is painted the same way every time. */
function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Ribs and a sternum showing through skin or thin cloth. */
function ribs(c, x, y, w, n, rgb = '20,14,10', a = 0.5) {
  soft(c, [[x, y - 1], [x, y + n * 1.2], [x, y + n * 2.2]], rgb, a * 0.7, 0.4);
  for (let i = 0; i < n; i++) {
    const yy = y + i * 2.1, ww = w * (1 - i * 0.06);
    soft(c, [[x - 0.4, yy], [x - ww * 0.6, yy + 0.3], [x - ww, yy + 1.6]], rgb, a, 0.45);
    soft(c, [[x + 0.4, yy], [x + ww * 0.6, yy + 0.3], [x + ww, yy + 1.6]], rgb, a, 0.45);
  }
}

/** Hair: a crown that hugs the skull, side curtains that thin out as they fall, then loose strands. */
function hair(c, rx, ry, len, { color = '#070505', n = 34 } = {}) {
  c.fillStyle = color;
  c.beginPath(); c.ellipse(0, -ry * 0.12, rx * 1.12, ry * 1.04, 0, Math.PI * 0.92, Math.PI * 2.08); c.fill();
  const fall = Math.max(ry * 1.2, len * 0.55);
  for (const sgn of [-1, 1]) {
    const gr = c.createLinearGradient(0, 0, 0, fall);
    gr.addColorStop(0, color); gr.addColorStop(0.7, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = gr;
    c.beginPath();
    c.moveTo(sgn * rx * 1.1, -ry * 0.3);
    c.quadraticCurveTo(sgn * rx * 1.35, fall * 0.5, sgn * rx * 1.05, fall);
    c.lineTo(sgn * rx * 0.55, fall);
    c.quadraticCurveTo(sgn * rx * 0.8, ry * 0.4, sgn * rx * 0.75, -ry * 0.2);
    c.fill();
  }
  strands(c, 0, -ry * 0.95, len + ry * 0.9, rx * 3.0, n, color, rx * 0.1);
}

/** Hair hanging straight down over the whole face, thick enough to hide it, thin enough to see shape through. */
function veilOfHair(c, rx, ry, len, { color = '#070505', gapX = null, gapW = 0 } = {}) {
  c.save();
  if (gapX !== null) { const p = new Path2D(); p.rect(-rx * 3, -ry * 3, rx * 6, ry * 8 + len); p.rect(gapX - gapW / 2, -ry * 0.45, gapW, ry * 0.75); c.clip(p, 'evenodd'); }
  const gr = c.createLinearGradient(0, -ry, 0, ry + len);
  gr.addColorStop(0, color); gr.addColorStop(0.75, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = gr; c.globalAlpha = 0.84;
  c.beginPath(); c.moveTo(-rx * 1.05, -ry * 0.5); c.quadraticCurveTo(-rx * 0.9, -ry * 1.2, 0, -ry * 1.16); c.quadraticCurveTo(rx * 0.9, -ry * 1.2, rx * 1.05, -ry * 0.5);
  c.quadraticCurveTo(rx * 1.3, ry * 0.6, rx * 1.15, ry + len * 0.7);
  for (let k = 0; k <= 10; k++) c.lineTo(rx * 1.15 - (k / 10) * rx * 2.3, ry + len * (0.7 + ((k * 7) % 5) / 14));
  c.quadraticCurveTo(-rx * 1.3, ry * 0.6, -rx * 1.05, -ry * 0.5); c.fill();
  c.globalAlpha = 1;
  for (let i = 0; i < 46; i++) {
    const t = i / 45 - 0.5, x = t * rx * 2.2;
    c.strokeStyle = color; c.lineWidth = rx * (0.05 + ((i * 7) % 5) * 0.025); c.globalAlpha = 0.7 + ((i * 3) % 4) * 0.08;
    c.beginPath(); c.moveTo(x * 0.6, -ry * 1.05); c.bezierCurveTo(x * 1.05, -ry * 0.2, x + Math.sin(i * 1.9) * rx * 0.1, ry, x + Math.sin(i * 2.7) * rx * 0.2, ry + len * (0.75 + ((i * 5) % 7) / 24));
    c.stroke();
  }
  c.globalAlpha = 1;
  c.restore();
}

/** Fringe and side curtains over the face (drawn after the face). */
function hairFront(c, rx, ry, len, { color = '#070505', gap = 0.55 } = {}) {
  c.fillStyle = color;
  c.beginPath(); c.moveTo(-rx * 1.05, -ry * 0.2); c.quadraticCurveTo(-rx * 0.9, -ry * 1.05, 0, -ry * 1.02); c.quadraticCurveTo(rx * 0.9, -ry * 1.05, rx * 1.05, -ry * 0.2);
  c.quadraticCurveTo(rx * 0.5, -ry * 0.72, 0, -ry * 0.62); c.quadraticCurveTo(-rx * 0.5, -ry * 0.72, -rx * 1.05, -ry * 0.2); c.fill();
  strands(c, -rx * (1 - gap * 0.5), -ry * 0.8, len, rx * 0.7, 9, color, rx * 0.12);
  strands(c, rx * (1 - gap * 0.5), -ry * 0.8, len, rx * 0.7, 9, color, rx * 0.12);
}

// ── HER ─────────────────────────────────────────────────────
function creature(frame, reach = false) {
  return paint(64, 128, (c, g) => {
    const bob = frame % 2;
    const swing = [-5, 0, 5, 0][frame];
    const SKIN = '#8f8a7c';
    // the neck is broken: the head lolls far over onto her shoulder
    const tilt = reach ? 0.12 : 0.62;
    const hx = reach ? 32 : 35.5, hy = 17 + bob;
    c.save(); c.translate(hx, hy); c.rotate(tilt); hair(c, 7.5, 10, 50); c.restore();
    // legs: grey, too long, knobbly knees, bruised; dirty bare feet turned inward
    limb(c, [28, 84], [26 + swing * 0.3, 104], [27 + swing, 123], 5.2, 2.4, SKIN, { joint: 0.32 });
    limb(c, [36, 84], [38 - swing * 0.3, 104], [37 - swing, 123], 5.2, 2.4, SKIN, { joint: 0.32 });
    stain(c, 27, 103, 2.2, 3, '60,40,70', 0.5); stain(c, 37.5, 110, 1.8, 2.6, '60,40,70', 0.45);
    for (const [fx, r] of [[27 + swing, 0.3], [37 - swing, -0.3]]) { c.fillStyle = '#3a342c'; c.beginPath(); c.ellipse(fx, 125, 3.8, 1.7, r, 0, 7); c.fill(); stain(c, fx, 123, 3, 2.4, '24,16,10', 0.8); }
    const s = swing * 0.6;
    const arms = () => {
      if (reach) {
        limb(c, [23, 35 + bob], [9, 36], [5, 15], 4.2, 2.4, SKIN, { joint: 0.35 });
        limb(c, [41, 35 + bob], [55, 36], [59, 15], 4.2, 2.4, SKIN, { joint: 0.35 });
        hand(c, 5, 15, -Math.PI / 2 - 0.25, 13, SKIN, { spread: 1.0, curl: -0.35 });
        hand(c, 59, 15, -Math.PI / 2 + 0.25, 13, SKIN, { spread: 1.0, curl: 0.35 });
      } else {
        // one arm hangs straight; the other bends the wrong way at the elbow
        limb(c, [23, 37 + bob], [13 - s, 68], [15 - s, 100], 4, 2.2, SKIN, { joint: 0.35 });
        limb(c, [42, 33 + bob], [56 + s, 62], [47 + s, 96], 4, 2.2, SKIN, { joint: 0.45 });
        hand(c, 15 - s, 100, Math.PI / 2 + 0.08, 15, SKIN, { spread: 0.6, curl: 0.35 });
        hand(c, 47 + s, 96, Math.PI / 2 - 0.35, 15, SKIN, { spread: 0.7, curl: -0.4 });
      }
    };
    // nightgown: filthy, torn, clinging to a body that's nothing but bone
    const gown = new Path2D();
    gown.moveTo(21, 34 + bob); gown.quadraticCurveTo(27, 40 + bob, 32, 38 + bob); gown.quadraticCurveTo(37, 40 + bob, 43, 32 + bob);
    gown.quadraticCurveTo(44, 50, 41, 60);
    gown.quadraticCurveTo(46, 74, 51, 90);
    for (let x = 51; x > 13; x -= 2.5) gown.lineTo(x - 1.2, 86 + ((x * 7) % 6) + (x % 9 < 2 ? 7 : 0));
    gown.quadraticCurveTo(18, 74, 23, 60);
    gown.quadraticCurveTo(20, 50, 21, 34 + bob);
    // bare, starved chest above the neckline
    const chest = new Path2D(); chest.moveTo(22, 32 + bob); chest.lineTo(42, 31 + bob); chest.lineTo(40, 44); chest.lineTo(24, 44); chest.closePath();
    c.fillStyle = SKIN; c.fill(chest);
    c.save(); c.clip(chest); ribs(c, 32, 34 + bob, 7, 5, '30,24,18', 0.65); c.restore();
    cloth(c, gown, { top: 32, bottom: 95, x0: 13, x1: 51, light: '#7c7666', dark: '#26221c',
      folds: [[26, 20, -0.5], [30, 28, 0.35], [34, 38, -0.45], [38, 46, 0.3], [24, 16, 0.25], [40, 50, -0.5], [32, 33, -0.4]], hem: 'rgba(35,24,14,0.9)' });
    c.save(); c.clip(gown);
    stain(c, 35, 55, 6, 9, '70,4,2', 0.9); stain(c, 27, 72, 4, 7, '60,4,2', 0.8); stain(c, 33, 66, 2, 9, '50,2,0', 0.7);
    stain(c, 41, 80, 3, 6, '60,4,2', 0.6);
    // tears in the cloth, bone showing through
    for (const [tx, ty] of [[29, 50], [38, 70]]) { c.fillStyle = SKIN; c.beginPath(); c.ellipse(tx, ty, 2, 3.2, 0.3, 0, 7); c.fill(); stain(c, tx, ty, 2, 3, '20,10,6', 0.6); soft(c, [[tx - 1.6, ty - 1], [tx, ty - 0.4], [tx + 1.6, ty - 1]], '20,14,10', 0.7, 0.3); }
    c.restore();
    arms();
    // a stringy neck, stretched where it bends
    limb(c, [32, 33 + bob], [33, 27], [hx - Math.sin(tilt) * 9, hy + Math.cos(tilt) * 6.5], 5, 3.8, '#8a8476', { joint: 0 });
    soft(c, [[24, 34 + bob], [28, 35 + bob], [31.5, 34 + bob]], '30,24,18', 0.7, 0.6);
    soft(c, [[40, 33 + bob], [36, 35 + bob], [32.5, 34 + bob]], '30,24,18', 0.7, 0.6);
    c.save(); c.translate(hx, hy); c.rotate(tilt);
    g.save(); g.translate(hx, hy); g.rotate(tilt);
    face(c, g, 7.5, 10, { skin: ['#d6d0c0', '#8e887a', '#3a342c'], eyes: 'hollow', mouth: reach ? 'gapeWide' : 'gape', glow: '#ff2a18', tears: 'blood', rot: 0.9 });
    hairFront(c, 7.5, 10, 34, { gap: 0.45 });
    c.restore(); g.restore();
  }, { hi: 6 });
}

/** The woman in white: hair over her face — except one eye, which finds you. */
function ghost() {
  return paint(48, 96, (c, g) => {
    const SKIN = '#cfd2d6';
    c.save(); c.translate(24, 14); hair(c, 6, 8, 34, { color: '#050505' }); c.restore();
    const dress = new Path2D();
    dress.moveTo(17, 25); dress.lineTo(31, 25); dress.quadraticCurveTo(38, 58, 41, 96); dress.lineTo(7, 96); dress.quadraticCurveTo(10, 58, 17, 25);
    cloth(c, dress, { top: 25, bottom: 96, x0: 7, x1: 41, light: '#eceef2', dark: '#7c808c',
      folds: [[20, 14, -0.35], [24, 24, 0.3], [28, 34, -0.35], [22, 18, 0.2], [30, 38, 0.25]], hem: 'rgba(60,64,72,0.4)' });
    limb(c, [17, 29], [12, 48], [13, 64], 3.4, 2.2, SKIN);
    limb(c, [31, 29], [36, 48], [35, 64], 3.4, 2.2, SKIN);
    hand(c, 13, 64, Math.PI / 2 + 0.05, 11, SKIN, { spread: 0.45, curl: 0.3 });
    hand(c, 35, 64, Math.PI / 2 - 0.05, 11, SKIN, { spread: 0.45, curl: -0.3 });
    limb(c, [24, 26], [24, 23], [24, 20], 4, 3.6, '#c4c8cc', { joint: 0 });
    c.save(); c.translate(24, 14); g.save(); g.translate(24, 14);
    face(c, g, 6, 8, { skin: ['#e2e6ea', '#a4a8b2', '#4a4e58'], eyes: 'wide', mouth: 'line', glow: '#e8f0ff', glowK: 0.9, tears: 'blood', lids: 0 });
    // a curtain of black hair over the face — parted just enough for one eye to find you
    veilOfHair(c, 6, 8, 26, { color: '#050505', gapX: 2.5, gapW: 2.6 });
    g.clearRect(-10, -12, 11.2, 30);   // the hidden eye doesn't shine through the hair
    c.restore(); g.restore();
  }, { fadeFrom: 72, hi: 6 });
}

/** The Smiling Man: tall, perfectly still, staring. Frame 1: the smile. */
function smiler(frame) {
  return paint(52, 118, (c, g) => {
    const SKIN = '#cfc8b4';
    // trousers and shoes, dusty from wherever he's been standing
    limb(c, [21, 70], [21, 92], [21.5, 113], 6.4, 5.4, '#1c1b1a', { joint: 0.05 });
    limb(c, [31, 70], [31, 92], [30.5, 113], 6.4, 5.4, '#1c1b1a', { joint: 0.05 });
    stain(c, 21, 108, 3.5, 5, '70,60,48', 0.4); stain(c, 31, 110, 3.5, 4, '70,60,48', 0.4);
    c.fillStyle = '#060606';
    c.beginPath(); c.ellipse(21, 115, 4.4, 2, 0, 0, 7); c.ellipse(31, 115, 4.4, 2, 0, 0, 7); c.fill();
    // jacket — a funeral suit, a size too small for arms this long
    const coat = new Path2D();
    coat.moveTo(13, 31); coat.quadraticCurveTo(26, 27, 39, 31); coat.lineTo(37, 76); coat.lineTo(15, 76); coat.closePath();
    cloth(c, coat, { top: 28, bottom: 76, x0: 13, x1: 39, light: '#34322f', dark: '#141312', folds: [[20, 18, -0.4], [32, 34, -0.4], [26, 26, 0.15]], hem: 'rgba(0,0,0,0.4)' });
    c.save(); c.clip(coat); stain(c, 18, 60, 4, 7, '60,54,44', 0.35); stain(c, 33, 44, 3, 5, '40,10,8', 0.5); c.restore();
    // shirt (stained at the collar), tie, lapels
    c.fillStyle = '#c8c0aa'; c.beginPath(); c.moveTo(22, 30); c.lineTo(30, 30); c.lineTo(26, 48); c.fill();
    stain(c, 27, 32, 2.6, 2.4, '90,10,8', 0.65); soft(c, [[27.5, 32], [27.8, 36], [27.2, 41]], '80,8,6', 0.7, 0.5);
    c.fillStyle = '#0a0a0a'; c.beginPath(); c.moveTo(25.2, 31); c.lineTo(26.8, 31); c.lineTo(27.4, 46); c.lineTo(26, 49); c.lineTo(24.6, 46); c.fill();
    soft(c, [[21, 30], [23, 40], [26, 50]], '90,88,84', 0.7, 0.6); soft(c, [[31, 30], [29, 40], [26, 50]], '90,88,84', 0.7, 0.6);
    c.fillStyle = '#8a8478'; c.beginPath(); c.arc(26, 56, 0.7, 0, 7); c.arc(26, 64, 0.7, 0, 7); c.fill();
    // arms hang dead straight, far too long, the hands past the knees
    limb(c, [14, 33], [12, 58], [13, 82], 5.6, 4.4, '#262422', { joint: 0.06 });
    limb(c, [38, 33], [40, 58], [39, 82], 5.6, 4.4, '#262422', { joint: 0.06 });
    c.fillStyle = '#b8b09c'; c.fillRect(10.6, 81, 4.8, 1.6); c.fillRect(36.6, 81, 4.8, 1.6);
    limb(c, [13, 83], [13, 85], [13, 87], 2.6, 2.4, SKIN, { joint: 0 }); limb(c, [39, 83], [39, 85], [39, 87], 2.6, 2.4, SKIN, { joint: 0 });
    hand(c, 13, 87, Math.PI / 2 + 0.04, 16, SKIN, { spread: 0.3, curl: 0.1, width: 1.2 });
    hand(c, 39, 87, Math.PI / 2 - 0.04, 16, SKIN, { spread: 0.3, curl: -0.1, width: 1.2 });
    limb(c, [26, 31], [26, 27], [26.5, 21], 6.2, 5.6, '#bab29e', { joint: 0 });
    // bald, long head, cocked to one side; pinprick pupils; brows lifted as if delighted to see you
    const tilt = frame ? 0.16 : 0.07;
    c.save(); c.translate(26.5, 13); c.rotate(tilt); g.save(); g.translate(26.5, 13); g.rotate(tilt);
    face(c, g, 7.6, 11, { skin: ['#e4dcc6', '#aca088', '#4e4636'], eyes: 'wide', mouth: frame ? 'grin' : 'smile', glow: '#fffbe8', glowK: frame ? 1 : 0.85, lids: 0, rot: 0.7 });
    soft(c, [[-5.6, -4.4 - frame], [-3.2, -6 - frame * 1.4], [-1.2, -4.8 - frame]], '40,30,20', 0.8, 0.45);
    soft(c, [[5.6, -4.4 - frame], [3.2, -6 - frame * 1.4], [1.2, -4.8 - frame]], '40,30,20', 0.8, 0.45);
    for (let k = 0; k < 3; k++) soft(c, [[-4, -7.5 - k * 1.1], [0, -8 - k * 1.1], [4, -7.5 - k * 1.1]], '60,44,30', 0.35, 0.25);
    c.restore(); g.restore();
  }, { fadeFrom: 108, hi: 6 });
}

/** The girl: head bowed, hair hiding her face (frame 0) — then she looks up (frame 1). */
function girl(frame) {
  return paint(36, 62, (c, g) => {
    const SKIN = '#b4b4ac';
    c.save(); c.translate(18, frame ? 11 : 13); c.rotate(frame ? 0.38 : 0.1); hair(c, 5.2, 6.4, 18, { color: '#0c0806', n: 20 }); c.restore();
    limb(c, [15, 44], [15, 51], [15, 58], 2.6, 2, SKIN); limb(c, [21, 44], [21, 51], [21, 58], 2.6, 2, SKIN);
    c.fillStyle = '#6a645a'; c.beginPath(); c.ellipse(15, 59.5, 2.2, 1.1, 0, 0, 7); c.ellipse(21, 59.5, 2.2, 1.1, 0, 0, 7); c.fill();
    const dress = new Path2D();
    dress.moveTo(13, 19); dress.lineTo(23, 19); dress.quadraticCurveTo(27, 32, 29, 46); dress.lineTo(7, 46); dress.quadraticCurveTo(9, 32, 13, 19);
    cloth(c, dress, { top: 19, bottom: 46, x0: 7, x1: 29, light: '#c8c6be', dark: '#5e5c56', folds: [[16, 12, -0.4], [20, 24, -0.35], [18, 18, 0.25]], hem: 'rgba(50,38,24,0.9)' });
    c.save(); c.clip(dress); stain(c, 15, 40, 4, 5, '50,36,22', 0.6); stain(c, 21, 28, 2.4, 3.6, '70,6,4', 0.75); soft(c, [[21, 30], [21.4, 35], [20.8, 41]], '60,4,2', 0.7, 0.5); c.restore();
    limb(c, [13, 21], [10, 31], [11, 39], 2.4, 1.7, SKIN); limb(c, [23, 21], [26, 31], [25, 39], 2.4, 1.7, SKIN);
    hand(c, 11, 39, Math.PI / 2 + 0.1, 4.8, SKIN, { width: 0.7, spread: 0.4, curl: 0.3 });
    hand(c, 25, 39, Math.PI / 2 - 0.1, 4.8, SKIN, { width: 0.7, spread: 0.4, curl: -0.3 });
    stain(c, 15, 53, 1.2, 2, '50,40,60', 0.5);
    c.save(); g.save();
    if (frame === 0) { c.translate(18, 13); c.rotate(0.1); g.translate(18, 13); g.rotate(0.1); }
    else { c.translate(18, 11); c.rotate(0.38); g.translate(18, 11); g.rotate(0.38); }
    hair(c, 5.2, 6.4, 16, { color: '#0c0806', n: 24 });
    face(c, g, 5.2, 6.4, { skin: ['#d4d4cc', '#8c8c84', '#34342e'], eyes: 'black', mouth: frame ? 'gape' : 'o', glow: '#ffffff', tears: 'black', rot: 0.8 });
    if (frame === 0) {
      // bowed: nothing of the face but the chin
      veilOfHair(c, 5.2, 6.4, 8, { color: '#0c0806' });
      g.clearRect(-8, -10, 16, 20);
    } else hairFront(c, 5.2, 6.4, 14, { color: '#0c0806', gap: 0.75 });
    c.restore(); g.restore();
  }, { hi: 6 });
}

/** The woman in the corner. Frame 0: face to the wall. Frame 1: she has turned around. */
function cornerWoman(frame) {
  return paint(44, 100, (c, g) => {
    const SKIN = '#a8a69c';
    limb(c, [19, 84], [19, 92], [19.5, 99], 3, 2.4, SKIN); limb(c, [25, 84], [25, 92], [24.5, 99], 3, 2.4, SKIN);
    const dress = new Path2D();
    dress.moveTo(15, 26); dress.lineTo(29, 26); dress.quadraticCurveTo(34, 56, 36, 88);
    for (let x = 36; x > 8; x -= 2.5) dress.lineTo(x - 1.2, 86 + ((x * 5) % 4));
    dress.quadraticCurveTo(10, 56, 15, 26);
    cloth(c, dress, { top: 26, bottom: 90, x0: 8, x1: 36, light: '#b8b6ac', dark: '#4a4842', folds: [[19, 14, -0.4], [22, 22, 0.3], [25, 30, -0.4]], hem: 'rgba(40,32,24,0.8)' });
    c.save(); c.clip(dress); stain(c, 22, 70, 6, 10, '50,40,30', 0.45); c.restore();
    if (frame === 0) {
      // from behind: arms limp at her sides, hair all the way to her waist, forehead almost touching the wall
      limb(c, [15, 29], [11, 46], [12, 62], 3.2, 2.2, SKIN); limb(c, [29, 29], [33, 46], [32, 62], 3.2, 2.2, SKIN);
      hand(c, 12, 62, Math.PI / 2 + 0.05, 9, SKIN, { spread: 0.3 }); hand(c, 32, 62, Math.PI / 2 - 0.05, 9, SKIN, { spread: 0.3 });
      c.save(); c.translate(22, 15); c.rotate(0.05);
      c.fillStyle = '#060404'; c.beginPath(); c.ellipse(0, -1, 6.6, 8.4, 0, 0, 7); c.fill();
      veilOfHair(c, 6, 8, 36, { color: '#060404' });
      c.restore();
    } else {
      // she has turned around. The arms are still the wrong way round.
      limb(c, [15, 29], [10, 44], [8, 58], 3.2, 2.2, SKIN, { joint: 0.4 }); limb(c, [29, 29], [34, 44], [36, 58], 3.2, 2.2, SKIN, { joint: 0.4 });
      hand(c, 8, 58, Math.PI / 2 + 0.4, 10, SKIN, { spread: 0.6, curl: 0.4 }); hand(c, 36, 58, Math.PI / 2 - 0.4, 10, SKIN, { spread: 0.6, curl: -0.4 });
      c.save(); c.translate(22, 15); c.rotate(-0.42); hair(c, 6, 8, 30, { color: '#060404' }); c.restore();
      limb(c, [22, 27], [22, 24], [21, 21], 3.6, 3.2, SKIN, { joint: 0 });
      c.save(); c.translate(22, 15); c.rotate(-0.42); g.save(); g.translate(22, 15); g.rotate(-0.42);
      face(c, g, 6, 8, { skin: ['#d2d0c6', '#8e8c82', '#2e2c26'], eyes: 'black', mouth: 'smile', glow: '#ffffff', tears: 'black', rot: 1 });
      hairFront(c, 6, 8, 26, { color: '#060404', gap: 0.7 });
      c.restore(); g.restore();
    }
  }, { fadeFrom: 90, hi: 6 });
}

/** Eyes in the dark: a shape you can barely see, and two eyes you can. */
function eyesInDark() {
  return paint(28, 18, (c, g) => {
    const bg = c.createRadialGradient(14, 9, 1, 14, 10, 13);
    bg.addColorStop(0, 'rgba(10,8,8,0.75)'); bg.addColorStop(1, 'rgba(10,8,8,0)');
    c.fillStyle = bg; c.beginPath(); c.ellipse(14, 10, 12, 9, 0, 0, 7); c.fill();
    for (const x of [9.5, 18.5]) {
      const eg = g.createRadialGradient(x, 8.5, 0, x, 8.5, 2.6);
      eg.addColorStop(0, '#fff6d8'); eg.addColorStop(0.6, '#d8c890'); eg.addColorStop(1, 'rgba(160,140,80,0)');
      g.fillStyle = eg; g.beginPath(); g.ellipse(x, 8.5, 2.6, 1.5, x < 14 ? 0.15 : -0.15, 0, 7); g.fill();
      g.globalCompositeOperation = 'destination-out';
      g.beginPath(); g.arc(x + 0.2, 8.5, 0.7, 0, 7); g.fill();
      g.globalCompositeOperation = 'source-over';
      c.fillStyle = '#000'; c.beginPath(); c.arc(x + 0.2, 8.5, 0.7, 0, 7); c.fill();
    }
  });
}

/** Under the bed: a face on its side against the floorboards, and a hand reaching for your ankle. */
function underbed() {
  return paint(72, 24, (c, g) => {
    const SKIN = '#cac2b2';
    // hair fanned out across the floor
    c.fillStyle = '#060404';
    c.beginPath(); c.ellipse(14, 17, 14, 6, 0, 0, 7); c.fill();
    for (let i = 0; i < 16; i++) { c.strokeStyle = '#060404'; c.lineWidth = 0.6 + (i % 3) * 0.3; c.beginPath(); c.moveTo(12, 14); c.quadraticCurveTo(4 - i, 14 + (i % 5), -2 + i * 0.5, 22 + (i % 3)); c.stroke(); }
    // the face, lying on its cheek, looking straight at you
    c.save(); c.translate(17, 14); c.rotate(-Math.PI / 2); g.save(); g.translate(17, 14); g.rotate(-Math.PI / 2);
    face(c, g, 6.5, 8.5, { skin: ['#d4ccbc', '#968e7e', '#3a3428'], eyes: 'wide', mouth: 'gape', glow: '#fff8e6', look: 0, tears: 'blood', lids: 0, rot: 0.9 });
    c.restore(); g.restore();
    // forearm and a long hand, flat on the boards
    limb(c, [24, 19], [40, 18], [52, 18.5], 4.2, 2.8, SKIN, { joint: 0.12 });
    hand(c, 52, 18.5, 0.04, 14, SKIN, { spread: 0.55, curl: 0.05, width: 1.2 });
    c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(20, 21.5, 50, 1.5);
  }, { hi: 6 });
}

function child(frame) {
  return paint(40, 56, (c, g) => {
    const s = frame ? 6 : -6;
    limb(c, [18, 36], [18 + s * 0.4, 45], [18 + s, 54], 3, 2.2, '#1a1614');
    limb(c, [22, 36], [22 - s * 0.4, 45], [22 - s, 54], 3, 2.2, '#1a1614');
    const coat = new Path2D(); coat.moveTo(13, 18); coat.lineTo(27, 18); coat.lineTo(30, 40); coat.lineTo(10, 40); coat.closePath();
    cloth(c, coat, { top: 18, bottom: 40, x0: 10, x1: 30, light: '#3a322c', dark: '#1a1410', folds: [[17, 15, -0.4], [23, 25, -0.4]] });
    limb(c, [14, 20], [11, 27], [10 - s * 0.5, 34], 2.6, 2, '#2a2420'); limb(c, [26, 20], [29, 27], [30 + s * 0.5, 34], 2.6, 2, '#2a2420');
    c.save(); c.translate(20, 11); g.save(); g.translate(20, 11);
    hair(c, 6, 7, 6, { color: '#1a1210', n: 14 });
    face(c, g, 6, 7, { skin: ['#c8c8c0', '#88887e', '#34342c'], eyes: 'black', mouth: 'smile', glow: '#ffffff', tears: 'black' });
    c.restore(); g.restore();
  }, { hi: 5 });
}

function crawler() {
  return paint(96, 40, (c, g) => {
    // clinging to the ceiling: limbs reach up to the top edge
    const SKIN = '#b6ae9e';
    [[30, 18, 12, 0], [36, 18, 26, 0], [62, 18, 72, 0], [66, 18, 86, 0]].forEach(([x1, y1, x2, y2], i) => {
      limb(c, [x1, y1], [(x1 + x2) / 2 + (i < 2 ? -8 : 8), 32], [x2, y2 + 1], 3.6, 2.2, SKIN, { joint: 0.35 });
    });
    const body = new Path2D(); body.ellipse(48, 15, 20, 7, 0, 0, 7);
    cloth(c, body, { top: 8, bottom: 22, x0: 28, x1: 68, light: '#6a6458', dark: '#3a362e', folds: [[40, 42, -0.4], [56, 54, -0.4]] });
    limb(c, [48, 18], [48, 21], [48, 24], 4, 3.6, '#a69e8e', { joint: 0 });
    // head hanging down, upside-down face
    c.save(); c.translate(48, 29); c.rotate(Math.PI); g.save(); g.translate(48, 29); g.rotate(Math.PI);
    face(c, g, 6, 7.5, { eyes: 'hollow', mouth: 'gape', glow: '#ff3020' });
    c.restore(); g.restore();
    strands(c, 48, 22, 18, 12, 12, '#070505', 1.0);
  }, { hi: 5 });
}


// ── the residents: original ghosts that stand where you aren't looking ──
function bride() {
  return paint(48, 100, (c, g) => {
    const dress = new Path2D();
    dress.moveTo(18, 26); dress.lineTo(30, 26); dress.quadraticCurveTo(36, 50, 44, 100); dress.lineTo(4, 100); dress.quadraticCurveTo(12, 50, 18, 26);
    cloth(c, dress, { top: 26, bottom: 100, x0: 4, x1: 44, light: '#ddd4b8', dark: '#857a62', folds: [[20, 10, -0.4], [24, 22, 0.3], [28, 38, -0.4], [22, 16, 0.25]], hem: 'rgba(70,52,30,0.7)' });
    stain(c, 20, 80, 6, 10, '90,70,40', 0.5);
    // arms holding a dead bouquet low
    limb(c, [19, 29], [17, 44], [21, 56], 3.2, 2.4, '#cfc6ae'); limb(c, [29, 29], [31, 44], [27, 56], 3.2, 2.4, '#cfc6ae');
    c.fillStyle = '#3a2c1e'; c.beginPath(); c.arc(24, 58, 5, 0, 7); c.fill();
    stain(c, 22, 57, 2.4, 2.4, '90,24,24', 0.9); stain(c, 26.5, 59, 2.2, 2.2, '80,20,20', 0.9); stain(c, 24, 55, 2, 2, '60,50,30', 0.9);
    c.save(); c.translate(24, 16); g.save(); g.translate(24, 16);
    face(c, g, 5.5, 7.2, { skin: ['#d4ccb4', '#968a70', '#3e3426'], eyes: 'milky', mouth: 'smile', glow: '#f4f0e0', glowK: 0.7, tears: 'black', lids: 0.1, rot: 0.8 });
    c.restore(); g.restore();
    // the veil, long and torn
    c.fillStyle = 'rgba(232,228,216,0.5)';
    c.beginPath(); c.moveTo(24, 7); c.quadraticCurveTo(8, 18, 6, 66); c.lineTo(42, 66); c.quadraticCurveTo(40, 18, 24, 7); c.fill();
    c.strokeStyle = 'rgba(255,255,248,0.18)'; c.lineWidth = 0.4;
    for (let i = 0; i < 10; i++) { c.beginPath(); c.moveTo(24, 8); c.quadraticCurveTo(10 + i * 3, 30, 6 + i * 4, 66); c.stroke(); }
    c.fillStyle = '#ece4cc'; c.beginPath(); c.ellipse(24, 8.5, 5, 1.6, 0, 0, 7); c.fill();
  }, { fadeFrom: 82, hi: 6 });
}

function gardener() {
  return paint(52, 110, (c, g) => {
    limb(c, [18, 94], [18, 102], [18, 110], 5, 4.6, '#2a241c', { joint: 0 });
    limb(c, [34, 94], [34, 102], [34, 110], 5, 4.6, '#2a241c', { joint: 0 });
    const coat = new Path2D(); coat.moveTo(14, 30); coat.lineTo(38, 30); coat.lineTo(44, 98); coat.lineTo(8, 98); coat.closePath();
    cloth(c, coat, { top: 30, bottom: 98, x0: 8, x1: 44, light: '#2a241c', dark: '#100e0b', folds: [[20, 16, -0.4], [30, 34, -0.45], [26, 26, 0.12]], hem: 'rgba(40,30,16,0.8)' });
    stain(c, 24, 90, 12, 6, '50,36,20', 0.7);
    limb(c, [14, 34], [10, 54], [9, 72], 5, 4.2, '#1c1814'); limb(c, [38, 34], [42, 54], [43, 72], 5, 4.2, '#1c1814');
    hand(c, 9, 73, Math.PI / 2, 7, '#8a8070', { width: 1.1 });
    hand(c, 43, 73, Math.PI / 2, 7, '#8a8070', { width: 1.1 });
    // rusted shears
    c.strokeStyle = '#6a5a40'; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(43, 74); c.lineTo(46, 102); c.moveTo(43, 74); c.lineTo(41, 102); c.stroke();
    stain(c, 44, 92, 2, 6, '90,40,20', 0.6);
    // head hanging forward under a brimmed cap, face in shadow, two pale points of eyes
    c.save(); c.translate(26, 23); c.rotate(0.28); g.save(); g.translate(26, 23); g.rotate(0.28);
    face(c, g, 6, 7.5, { skin: ['#a8a090', '#6e6658', '#2a261e'], eyes: 'hollow', mouth: 'line', glow: '#e8e6d8', glowK: 0.9 });
    stain(c, 0, -2, 7, 4, '0,0,0', 0.55);
    // a rough sacking hood, pulled low
    c.fillStyle = '#16120e';
    c.beginPath(); c.moveTo(-8.5, 8); c.quadraticCurveTo(-10, -9, 0, -10.5); c.quadraticCurveTo(10, -9, 8.5, 8);
    c.quadraticCurveTo(6.4, -1, 0, -3.6); c.quadraticCurveTo(-6.4, -1, -8.5, 8); c.fill();
    soft(c, [[-6, -6], [-3, -8], [0, -8.6]], '60,50,36', 0.5, 0.5);
    c.restore(); g.restore();
  }, { hi: 6 });
}

function drowned() {
  return paint(48, 100, (c, g) => {
    const SKIN = '#8a9ea4';
    c.save(); c.translate(24, 16); hair(c, 7, 9, 34, { color: '#0a0c0c' }); c.restore();
    limb(c, [20, 88], [20, 94], [20, 100], 3, 2.6, SKIN); limb(c, [28, 88], [28, 94], [28, 100], 3, 2.6, SKIN);
    const dress = new Path2D(); dress.moveTo(16, 28); dress.lineTo(32, 28); dress.lineTo(36, 92); dress.lineTo(12, 92); dress.closePath();
    cloth(c, dress, { top: 28, bottom: 92, x0: 12, x1: 36, light: '#36424a', dark: '#141c20', folds: [[20, 16, 0.25], [24, 24, -0.45], [29, 33, 0.25]], hem: 'rgba(10,20,24,0.8)' });
    limb(c, [16, 31], [10, 56], [13, 76], 3.4, 2.4, SKIN); limb(c, [32, 31], [38, 56], [35, 76], 3.4, 2.4, SKIN);
    hand(c, 13, 76, Math.PI / 2 + 0.05, 7, SKIN, { width: 0.95 }); hand(c, 35, 76, Math.PI / 2 - 0.05, 7, SKIN, { width: 0.95 });
    c.save(); c.translate(24, 16); g.save(); g.translate(24, 16);
    face(c, g, 7, 9, { skin: ['#a4b8bc', '#5e767c', '#1c2830'], eyes: 'milky', mouth: 'gape', glow: '#c8f0f4', glowK: 0.9, rot: 1, lids: 0.15 });
    hairFront(c, 7, 9, 26, { color: '#0a0c0c', gap: 0.6 });
    c.restore(); g.restore();
    // dripping water
    for (const x of [14, 19, 30, 35, 24]) soft(c, [[x, 80], [x, 86], [x, 92 + (x % 7)]], '170,200,210', 0.6, 0.4);
  }, { fadeFrom: 90, hi: 6 });
}

function nurse() {
  return paint(46, 100, (c, g) => {
    limb(c, [18, 86], [18, 93], [18, 100], 2.8, 2.4, '#3a3630'); limb(c, [28, 86], [28, 93], [28, 100], 2.8, 2.4, '#3a3630');
    const dress = new Path2D(); dress.moveTo(15, 28); dress.lineTo(31, 28); dress.lineTo(36, 88); dress.lineTo(10, 88); dress.closePath();
    cloth(c, dress, { top: 28, bottom: 88, x0: 10, x1: 36, light: '#beb8a8', dark: '#6e6a5e', folds: [[19, 16, -0.4], [27, 30, -0.4]] });
    c.fillStyle = '#d4cebc'; c.fillRect(14, 40, 18, 34);
    stain(c, 22, 58, 6, 10, '90,10,6', 0.8); stain(c, 18, 70, 3, 4, '80,8,4', 0.6);
    for (const x of [16, 20, 26, 29]) soft(c, [[x, 44], [x + 0.3, 52], [x - 0.2, 62 + (x % 5)]], '70,6,4', 0.5, 0.6);
    // a pocket watch and a ring of keys
    c.fillStyle = '#6a5a38'; c.beginPath(); c.arc(17.5, 43, 1.3, 0, 7); c.fill();
    limb(c, [15, 32], [12, 50], [12, 66], 3.2, 2.4, '#b8b4a6'); limb(c, [31, 32], [34, 50], [34, 66], 3.2, 2.4, '#b8b4a6');
    hand(c, 12, 66, Math.PI / 2, 6.5, '#c8c0ae', { width: 0.9 }); hand(c, 34, 66, Math.PI / 2, 6.5, '#c8c0ae', { width: 0.9 });
    // bandaged face; the eyes look out through the gaps
    c.save(); c.translate(23, 17); g.save(); g.translate(23, 17);
    face(c, g, 6.5, 8, { skin: ['#d8d2c0', '#a09880', '#4a4434'], eyes: 'slits', mouth: 'none', glow: '#f8f0d8', tears: 'blood' });
    c.strokeStyle = 'rgba(140,128,100,0.8)'; c.lineWidth = 0.7;
    for (let y = -6; y < 8; y += 2.2) { if (Math.abs(y + 1) < 1) continue; c.beginPath(); c.moveTo(-6.5, y); c.lineTo(6.5, y + 0.8); c.stroke(); }
    stain(c, 2, 4, 2.4, 2.4, '110,20,14', 0.75); stain(c, -2.5, -1, 1.6, 1.4, '110,20,14', 0.6);
    c.fillStyle = '#efeadb'; c.beginPath(); c.moveTo(-8, -7); c.lineTo(8, -7); c.lineTo(5, -13); c.lineTo(-5, -13); c.fill();
    c.restore(); g.restore();
  }, { fadeFrom: 84, hi: 6 });
}

function peeker() {
  // half a face, tipped sideways, around the edge of a door frame; fingers curled over the edge
  return paint(36, 56, (c, g) => {
    c.save(); c.beginPath(); c.rect(0, 0, 31, 56); c.clip();
    c.save(); c.translate(30, 18); c.rotate(-0.5); g.save(); g.translate(30, 18); g.rotate(-0.5);
    hair(c, 8, 10.5, 30, { color: '#070505', n: 22 });
    face(c, g, 8, 10.5, { skin: ['#d8d2c2', '#9c9482', '#3e382e'], eyes: 'wide', mouth: 'smile', glow: '#fffaea', tears: 'black', lids: 0 });
    c.restore(); g.restore();
    c.restore();
    g.clearRect(31, 0, 10, 56);
    // long fingers curled around the frame, each a different length
    for (const [y, len, droop] of [[29, 11, 1.5], [32.2, 13, 2.4], [35.6, 12, 3.2], [39, 8.5, 3.6]]) {
      limb(c, [36, y], [36 - len * 0.55, y - 0.6], [36 - len, y + droop], 1.9, 0.9, '#bab29e', { joint: 0.5 });
      c.strokeStyle = '#140c08'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(36 - len + 0.6, y + droop - 0.2); c.lineTo(36 - len - 0.6, y + droop + 0.5); c.stroke();
    }
  }, { hi: 6 });
}

// ── furniture ───────────────────────────────────────────────
const wood = (c, x, y, w, h, col = '#4a3020') => { c.fillStyle = col; c.fillRect(x, y, w, h); };

const FURNITURE = {
  bed: () => paint(96, 40, (c) => {
    c.strokeStyle = '#141414'; c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(6, 4); c.lineTo(6, 36); c.moveTo(90, 4); c.lineTo(90, 36); c.moveTo(6, 6); c.quadraticCurveTo(48, -2, 90, 6); c.stroke();
    c.lineWidth = 1.3;
    for (let x = 14; x < 90; x += 8) { c.beginPath(); c.moveTo(x, 5 - Math.sin((x - 6) / 84 * Math.PI) * 3); c.lineTo(x, 18); c.stroke(); }
    c.fillStyle = '#8a8270'; c.fillRect(4, 17, 88, 10);
    c.fillStyle = '#a09884'; c.fillRect(10, 14, 22, 5);
    c.fillStyle = '#6a5040'; c.beginPath(); c.ellipse(52, 21, 14, 3, 0, 0, 7); c.fill();
    c.fillStyle = '#5a2a1a'; c.beginPath(); c.ellipse(70, 22, 6, 2, 0, 0, 7); c.fill();
    c.fillStyle = '#6e6656'; c.beginPath(); c.moveTo(30, 17); c.quadraticCurveTo(60, 12, 92, 18); c.lineTo(92, 28); c.lineTo(28, 28); c.fill();
    c.fillStyle = '#000'; c.fillRect(6, 28, 84, 9);
    c.fillStyle = '#111'; c.fillRect(5, 27, 3, 12); c.fillRect(88, 27, 3, 12);
  }),
  nightstand: () => paint(40, 40, (c) => {
    wood(c, 4, 14, 32, 26, '#3a2618'); wood(c, 4, 14, 32, 3, '#5a3c24');
    wood(c, 7, 20, 26, 8, '#2e1e12'); wood(c, 7, 30, 26, 8, '#2e1e12');
    c.fillStyle = '#9a7a40'; c.fillRect(19, 23, 3, 2); c.fillRect(19, 33, 3, 2);
    c.fillStyle = '#16100a'; c.fillRect(18, 4, 3, 10);
    c.fillStyle = '#5a4a36'; c.beginPath(); c.moveTo(11, 6); c.lineTo(28, 6); c.lineTo(25, 0); c.lineTo(14, 0); c.fill();
  }),
  note: () => paint(16, 10, (c) => {
    c.fillStyle = '#d8cfb4'; c.beginPath(); c.moveTo(2, 9); c.lineTo(4, 2); c.lineTo(9, 1); c.lineTo(14, 4); c.lineTo(13, 9); c.fill();
    c.strokeStyle = '#7a6a50'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(5, 5); c.lineTo(11, 4); c.moveTo(5, 7); c.lineTo(10, 7); c.stroke();
  }),
  crib: () => paint(64, 48, (c) => {
    wood(c, 2, 4, 4, 44, '#6a5038'); wood(c, 58, 4, 4, 44, '#6a5038');
    wood(c, 2, 8, 60, 3, '#7a5e42'); wood(c, 2, 34, 60, 3, '#7a5e42');
    for (let x = 8; x < 58; x += 5) wood(c, x, 10, 2, 25, '#6a5038');
    c.fillStyle = '#9a8e7a'; c.fillRect(6, 30, 52, 5);
    c.fillStyle = '#6a2a2a'; c.beginPath(); c.ellipse(26, 30, 8, 3, 0, 0, 7); c.fill();
  }),
  doll: () => paint(20, 24, (c) => {
    c.fillStyle = '#7a2a3a'; c.beginPath(); c.moveTo(4, 24); c.lineTo(10, 10); c.lineTo(16, 24); c.fill();
    c.fillStyle = '#e8e0d0'; c.beginPath(); c.arc(10, 8, 5, 0, 7); c.fill();
    c.fillStyle = '#000'; c.fillRect(7, 7, 2, 2); c.fillRect(11, 7, 2, 2);
    c.strokeStyle = '#3a2a1a'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(10, 3); c.lineTo(12, 9); c.lineTo(9, 12); c.stroke();
    strands(c, 10, 3, 8, 12, 6, '#4a2a10', 1);
  }),
  table: () => paint(80, 32, (c) => {
    c.fillStyle = '#c9c2a8'; c.beginPath(); c.moveTo(2, 6); c.lineTo(78, 6); c.lineTo(76, 16); c.lineTo(4, 16); c.fill();
    c.fillStyle = '#9a9278'; for (let x = 6; x < 76; x += 8) c.fillRect(x, 6, 4, 10);
    wood(c, 8, 16, 4, 16, '#2a1a10'); wood(c, 68, 16, 4, 16, '#2a1a10');
    c.fillStyle = '#e0dccc'; c.beginPath(); c.ellipse(30, 6, 9, 2.5, 0, 0, 7); c.fill();
    c.fillStyle = '#3a2a10'; c.beginPath(); c.ellipse(30, 5.5, 5, 1.5, 0, 0, 7); c.fill();
    c.fillStyle = '#7a1a10'; c.beginPath(); c.ellipse(56, 7, 6, 1.5, 0, 0, 7); c.fill();
  }),
  chair: () => paint(32, 40, (c) => {
    wood(c, 6, 0, 3, 40, '#2e1e12'); wood(c, 23, 0, 3, 40, '#2e1e12');
    wood(c, 6, 4, 20, 3, '#3a2618'); wood(c, 6, 11, 20, 3, '#3a2618');
    wood(c, 4, 20, 24, 4, '#4a3020');
    wood(c, 5, 24, 3, 16, '#2e1e12'); wood(c, 24, 24, 3, 16, '#2e1e12');
  }),
  bathtub: () => paint(80, 60, (c) => {
    c.strokeStyle = '#555'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(2, 2); c.lineTo(78, 2); c.stroke();
    const cur = c.createLinearGradient(0, 0, 50, 0);
    cur.addColorStop(0, '#a8aea0'); cur.addColorStop(1, '#7a8070');
    c.fillStyle = cur;
    c.beginPath(); c.moveTo(2, 2); for (let x = 2; x <= 50; x += 6) c.quadraticCurveTo(x + 3, 30, x + 6, 2 + (x % 12 ? 0 : 1)); c.lineTo(50, 48); c.lineTo(2, 48); c.fill();
    c.fillStyle = 'rgba(30,40,20,0.6)'; c.fillRect(2, 38, 48, 10);
    c.fillStyle = 'rgba(20,20,20,0.45)'; c.beginPath(); c.ellipse(26, 26, 7, 16, 0, 0, 7); c.fill();   // a shape behind the curtain
    c.fillStyle = '#c8c8bc'; c.beginPath(); c.moveTo(4, 36); c.lineTo(78, 36); c.quadraticCurveTo(76, 54, 66, 54); c.lineTo(14, 54); c.quadraticCurveTo(4, 54, 4, 36); c.fill();
    c.fillStyle = '#5a4a2a'; c.beginPath(); c.ellipse(60, 37, 14, 2, 0, 0, 7); c.fill();
    c.fillStyle = '#8a7a50'; c.fillRect(12, 54, 4, 6); c.fillRect(64, 54, 4, 6);
  }),
  sink: () => paint(36, 40, (c) => {
    c.fillStyle = '#b8b8ac'; c.beginPath(); c.ellipse(18, 12, 16, 6, 0, 0, 7); c.fill();
    c.fillStyle = '#3a3626'; c.beginPath(); c.ellipse(18, 11, 11, 3.5, 0, 0, 7); c.fill();
    c.fillStyle = '#9a9a8e'; c.fillRect(14, 16, 8, 24);
    c.fillStyle = '#7a7a70'; c.fillRect(16, 2, 4, 6);
    c.fillStyle = '#6a1a10'; c.fillRect(17, 12, 2, 10);
  }),
  sidetable: () => paint(32, 40, (c, g) => {
    wood(c, 6, 18, 20, 4, '#4a3020'); wood(c, 9, 22, 3, 18, '#2e1e12'); wood(c, 20, 22, 3, 18, '#2e1e12');
    c.fillStyle = '#d8d0b0'; c.fillRect(14, 8, 4, 10);
    c.fillStyle = '#c8b890'; c.beginPath(); c.ellipse(16, 18, 6, 1.5, 0, 0, 7); c.fill();
    g.fillStyle = '#ffd27a'; g.beginPath(); g.ellipse(16, 5, 2, 3.5, 0, 0, 7); g.fill();
    g.fillStyle = '#fff4c0'; g.fillRect(15.5, 5, 1, 2);
  }),
  coatrack: () => paint(40, 60, (c) => {
    wood(c, 19, 2, 2, 58, '#1a120c');
    c.fillStyle = '#2a2220'; c.beginPath(); c.moveTo(12, 6); c.quadraticCurveTo(6, 30, 8, 52); c.lineTo(20, 52); c.lineTo(20, 6); c.fill();
    c.fillStyle = '#1e1816'; c.beginPath(); c.moveTo(22, 6); c.quadraticCurveTo(34, 26, 32, 48); c.lineTo(21, 50); c.fill();
    c.fillStyle = '#141010'; c.beginPath(); c.ellipse(20, 4, 9, 3, 0, 0, 7); c.fill(); c.fillRect(15, -1, 10, 5);
  }),
  toolbox: () => paint(40, 22, (c) => {
    c.fillStyle = '#8a2412'; c.fillRect(2, 6, 36, 16);
    c.fillStyle = '#a83018'; c.fillRect(2, 6, 36, 4);
    c.strokeStyle = '#222'; c.lineWidth = 2; c.beginPath(); c.moveTo(12, 6); c.quadraticCurveTo(20, -2, 28, 6); c.stroke();
    c.fillStyle = '#b8963e'; c.fillRect(17, 11, 7, 7);
    c.strokeStyle = '#999'; c.lineWidth = 1.4; c.beginPath(); c.arc(20.5, 11, 2.5, Math.PI, 0); c.stroke();
  }),
};

function rocker(frame) {
  const tilt = [-0.08, 0, 0.08][frame];
  return paint(48, 52, (c) => {
    c.translate(24, 48); c.rotate(tilt); c.translate(-24, -48);
    c.strokeStyle = '#3a2618'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(4, 46); c.quadraticCurveTo(24, 54, 44, 46); c.stroke();
    c.fillStyle = '#3a2618';
    c.fillRect(10, 4, 3, 42); c.fillRect(34, 4, 3, 42); c.fillRect(8, 28, 32, 4);
    for (let x = 15; x < 34; x += 5) c.fillRect(x, 6, 2, 22);
    c.fillRect(10, 2, 27, 4);
    c.fillStyle = '#6a3a3a'; c.fillRect(12, 25, 24, 4);
  });
}

let cache = null;
export function sprites() {
  if (cache) return cache;
  cache = {
    creature: [0, 1, 2, 3].map((f) => creature(f)),
    creatureReach: creature(0, true),
    ghost: ghost(),
    child: [child(0), child(1)],
    crawler: crawler(),
    bride: bride(),
    gardener: gardener(),
    drowned: drowned(),
    nurse: nurse(),
    peeker: peeker(),
    smiler: [smiler(0), smiler(1)],
    girl: [girl(0), girl(1)],
    eyes: eyesInDark(),
    corner: [cornerWoman(0), cornerWoman(1)],
    underbed: underbed(),
    rocker: [rocker(0), rocker(1), rocker(2), rocker(1)],
  };
  for (const [k, fn] of Object.entries(FURNITURE)) cache[k] = fn();
  return cache;
}
