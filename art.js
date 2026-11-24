// ─────────────────────────────────────────────────────────────
//  Room art — procedural SVG scenes (no image files).
//  Every room is drawn on a fixed 1600×900 canvas with one-point
//  perspective, filter-based textures (grain, water stains) and
//  layered light. Each room has two layers:
//    base — static, heavy filters (rendered once)
//    fx   — light animated overlay (rain, flicker, drips, shadows)
//  Hotspot positions are in the same 1600×900 space, so they
//  always line up with the objects they belong to.
// ─────────────────────────────────────────────────────────────

const W = 1600, H = 900;
const VP = [800, 420];

const pts = (arr) => arr.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
const poly = (arr, attrs = '') => `<polygon points="${pts(arr)}" ${attrs}/>`;
const wrap = (body) =>
  `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

// ── shared texture filters ──────────────────────────────────
const FILTERS = `
<defs>
  <filter id="t-grain" x="0" y="0" width="100%" height="100%" filterUnits="userSpaceOnUse">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" stitchTiles="stitch"/>
    <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.4 0 0 0 -0.55"/>
  </filter>
  <filter id="t-stain" x="0" y="0" width="100%" height="100%" filterUnits="userSpaceOnUse">
    <feTurbulence type="fractalNoise" baseFrequency="0.004 0.011" numOctaves="4" seed="21"/>
    <feColorMatrix values="0 0 0 0 0.07  0 0 0 0 0.045  0 0 0 0 0.02  3.2 0 0 0 -1.62"/>
  </filter>
  <filter id="t-mottle" x="0" y="0" width="100%" height="100%" filterUnits="userSpaceOnUse">
    <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="3" seed="8"/>
    <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.9 0 0 0 -0.3"/>
  </filter>
  <filter id="b3"><feGaussianBlur stdDeviation="3"/></filter>
  <filter id="b8" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="8"/></filter>
  <filter id="b20" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="20"/></filter>
  <filter id="b40" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="40"/></filter>
  <radialGradient id="glow-warm"><stop offset="0" stop-color="#ffd9a0" stop-opacity="0.9"/><stop offset="0.25" stop-color="#ffb060" stop-opacity="0.35"/><stop offset="1" stop-color="#ff9030" stop-opacity="0"/></radialGradient>
  <radialGradient id="glow-sick"><stop offset="0" stop-color="#e6ffc0" stop-opacity="0.9"/><stop offset="0.25" stop-color="#b8d890" stop-opacity="0.3"/><stop offset="1" stop-color="#90b070" stop-opacity="0"/></radialGradient>
  <radialGradient id="glow-moon"><stop offset="0" stop-color="#eaf2ff" stop-opacity="1"/><stop offset="0.12" stop-color="#cfdcf5" stop-opacity="0.8"/><stop offset="0.4" stop-color="#8ea6d0" stop-opacity="0.15"/><stop offset="1" stop-color="#8ea6d0" stop-opacity="0"/></radialGradient>
  <radialGradient id="glow-ember"><stop offset="0" stop-color="#ffb347" stop-opacity="0.95"/><stop offset="0.3" stop-color="#ff5a1a" stop-opacity="0.45"/><stop offset="1" stop-color="#ff2a00" stop-opacity="0"/></radialGradient>
  <radialGradient id="vig" cx="50%" cy="48%" r="70%"><stop offset="0.45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.85"/></radialGradient>
</defs>`;

// ── geometry helpers ────────────────────────────────────────
// A room is a back wall rect (bx1..bx2, by1..by2) seen from the centre.
function geom(bx1, by1, bx2, by2) {
  const g = { bx1, by1, bx2, by2 };
  // y on the left wall at screen-x, v = 0 (ceiling line) … 1 (floor line)
  g.ly = (x, v) => { const t = by1 * x / bx1, b = H - (H - by2) * x / bx1; return t + (b - t) * v; };
  g.ry = (x, v) => { const d = W - x, r = W - bx2; const t = by1 * d / r, b = H - (H - by2) * d / r; return t + (b - t) * v; };
  // floor point along the perspective line that meets the back wall at xb
  g.fx = (xb, y) => VP[0] + (xb - VP[0]) * (y - VP[1]) / (by2 - VP[1]);
  g.wallQuadL = (x1, x2, v1, v2) => [[x1, g.ly(x1, v1)], [x2, g.ly(x2, v1)], [x2, g.ly(x2, v2)], [x1, g.ly(x1, v2)]];
  g.wallQuadR = (x1, x2, v1, v2) => [[x1, g.ry(x1, v1)], [x2, g.ry(x2, v1)], [x2, g.ry(x2, v2)], [x1, g.ry(x1, v2)]];
  g.ceil = [[0, 0], [W, 0], [bx2, by1], [bx1, by1]];
  g.floor = [[0, H], [W, H], [bx2, by2], [bx1, by2]];
  g.left = [[0, 0], [bx1, by1], [bx1, by2], [0, H]];
  g.right = [[W, 0], [bx2, by1], [bx2, by2], [W, H]];
  g.back = [[bx1, by1], [bx2, by1], [bx2, by2], [bx1, by2]];
  return g;
}

function shell(g, c) {
  return `
  <defs>
    <linearGradient id="s-l" x1="0" x2="1"><stop offset="0" stop-color="${c.sideFar}"/><stop offset="1" stop-color="${c.side}"/></linearGradient>
    <linearGradient id="s-r" x1="1" x2="0"><stop offset="0" stop-color="${c.sideFar}"/><stop offset="1" stop-color="${c.side}"/></linearGradient>
    <linearGradient id="s-c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="${c.ceil}"/></linearGradient>
    <linearGradient id="s-f" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${c.floorNear}"/><stop offset="1" stop-color="${c.floor}"/></linearGradient>
    <linearGradient id="s-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.backTop ?? c.back}"/><stop offset="1" stop-color="${c.back}"/></linearGradient>
    <clipPath id="c-walls">${poly(g.left)}${poly(g.right)}${poly(g.back)}</clipPath>
    <clipPath id="c-floor">${poly(g.floor)}</clipPath>
    <clipPath id="c-back">${poly(g.back)}</clipPath>
  </defs>
  ${poly(g.ceil, 'fill="url(#s-c)"')}
  ${poly(g.left, 'fill="url(#s-l)"')}
  ${poly(g.right, 'fill="url(#s-r)"')}
  ${poly(g.back, 'fill="url(#s-b)"')}
  ${poly(g.floor, 'fill="url(#s-f)"')}`;
}

// Weathering on walls + film grain over everything
function weather(stain = 0.9, grain = 0.55) {
  return `
  <rect width="${W}" height="${H}" filter="url(#t-stain)" clip-path="url(#c-walls)" opacity="${stain}"/>
  <rect width="${W}" height="${H}" filter="url(#t-mottle)" opacity="0.35"/>
  <rect width="${W}" height="${H}" filter="url(#t-grain)" opacity="${grain}"/>`;
}

// Corner shadows + baseboards so the box reads as a room
function edges(g, trim = '#0a0806') {
  const { bx1, by1, bx2, by2 } = g;
  return `
  <g stroke="#000" stroke-opacity="0.55" stroke-width="6" filter="url(#b3)">
    <line x1="0" y1="0" x2="${bx1}" y2="${by1}"/><line x1="${W}" y1="0" x2="${bx2}" y2="${by1}"/>
    <line x1="${bx1}" y1="${by1}" x2="${bx1}" y2="${by2}"/><line x1="${bx2}" y1="${by1}" x2="${bx2}" y2="${by2}"/>
  </g>
  ${poly([[0, H], [bx1, by2], [bx1, by2 - 14], [0, H - 50]], `fill="${trim}"`)}
  ${poly([[W, H], [bx2, by2], [bx2, by2 - 14], [W, H - 50]], `fill="${trim}"`)}
  <rect x="${bx1}" y="${by2 - 14}" width="${bx2 - bx1}" height="14" fill="${trim}"/>`;
}

function planks(g, color = '#000', n = 14) {
  let s = `<g clip-path="url(#c-floor)" stroke="${color}" stroke-opacity="0.55">`;
  const step = (g.bx2 - g.bx1) / n;
  for (let i = -4; i <= n + 4; i++) {
    const xb = g.bx1 + i * step;
    s += `<line x1="${xb}" y1="${g.by2}" x2="${g.fx(xb, H)}" y2="${H}" stroke-width="${1 + Math.abs(i - n / 2) * 0.25}"/>`;
  }
  // staggered butt joints
  const rows = [g.by2 + 18, g.by2 + 44, g.by2 + 80, g.by2 + 130, g.by2 + 200];
  rows.forEach((y, r) => {
    for (let i = -4 + (r % 2); i <= n + 4; i += 2) {
      const a = g.fx(g.bx1 + i * step, y), b = g.fx(g.bx1 + (i + 1) * step, y);
      s += `<line x1="${a}" y1="${y}" x2="${b}" y2="${y}" stroke-width="${1 + r * 0.6}"/>`;
    }
  });
  return s + '</g>';
}

function checker(g, c1, c2, n = 9) {
  const step = (g.bx2 - g.bx1) / n;
  const ys = [0, 1, 2, 3, 4, 5, 6].map((j) => VP[1] + (g.by2 - VP[1]) / (1 - j * 0.12));
  let s = `<g clip-path="url(#c-floor)">`;
  for (let i = -5; i < n + 5; i++) {
    for (let j = 0; j < ys.length - 1; j++) {
      const xa = g.bx1 + i * step, xb = xa + step;
      const q = [[g.fx(xa, ys[j]), ys[j]], [g.fx(xb, ys[j]), ys[j]], [g.fx(xb, ys[j + 1]), ys[j + 1]], [g.fx(xa, ys[j + 1]), ys[j + 1]]];
      s += poly(q, `fill="${(i + j) % 2 ? c1 : c2}"`);
    }
  }
  return s + '</g>';
}

// Damask-ish wallpaper on the back wall
function wallpaper(id, color, opacity = 0.18, clip = 'c-back') {
  return `
  <defs><pattern id="${id}" width="70" height="96" patternUnits="userSpaceOnUse">
    <path d="M35 6 C46 20 52 30 35 44 C18 30 24 20 35 6Z M35 52 C42 62 60 64 62 78 C50 76 42 70 35 90 C28 70 20 76 8 78 C10 64 28 62 35 52Z" fill="${color}"/>
    <circle cx="0" cy="48" r="4" fill="${color}"/><circle cx="70" cy="48" r="4" fill="${color}"/>
  </pattern></defs>
  <rect width="${W}" height="${H}" fill="url(#${id})" opacity="${opacity}" clip-path="url(#${clip})"/>`;
}

// A shadowy figure. Opacity is driven by CSS (--bloodiness rises each day)
const watcher = (x, y, s = 1) => `
  <g class="watcher" transform="translate(${x} ${y}) scale(${s})">
    <ellipse cx="0" cy="-2" rx="34" ry="6" fill="#000" opacity="0.6" filter="url(#b3)"/>
    <path d="M-16 -150 C-16 -172 16 -172 16 -150 C16 -136 10 -130 6 -127 L28 -112 C34 -80 34 -40 30 -2 L-30 -2 C-34 -40 -34 -80 -28 -112 L-6 -127 C-10 -130 -16 -136 -16 -150Z" fill="#020202"/>
    <path d="M-28 -110 C-44 -70 -40 -30 -42 10" stroke="#020202" stroke-width="9" fill="none" stroke-linecap="round"/>
    <path d="M28 -110 C44 -70 42 -30 44 12" stroke="#020202" stroke-width="9" fill="none" stroke-linecap="round"/>
    <circle cx="-6" cy="-152" r="2.2" fill="#ff2a2a"/><circle cx="6" cy="-152" r="2.2" fill="#ff2a2a"/>
    <circle cx="-6" cy="-152" r="7" fill="#ff2a2a" opacity="0.25" filter="url(#b3)"/><circle cx="6" cy="-152" r="7" fill="#ff2a2a" opacity="0.25" filter="url(#b3)"/>
  </g>`;

const bulb = (x, y1, y2, glow = 'glow-warm', lit = true, r = 260) => `
  <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="#050505" stroke-width="3"/>
  <rect x="${x - 7}" y="${y2}" width="14" height="14" fill="#1a1612"/>
  <ellipse cx="${x}" cy="${y2 + 26}" rx="13" ry="16" fill="${lit ? '#fff3d6' : '#2a2620'}" opacity="${lit ? 0.95 : 0.9}"/>
  ${lit ? `<circle cx="${x}" cy="${y2 + 26}" r="${r}" fill="url(#${glow})" class="fx-flicker-target"/>` : ''}`;

// ═════════════════════ BEDROOM ═════════════════════
function bedroom() {
  const g = geom(430, 190, 1170, 650);
  const door = g.wallQuadR(1270, 1470, 0.2, 1);
  const win = { x: 950, y: 235, w: 180, h: 250 };
  const strips = [[230, 0.15, 0.62], [300, 0.1, 0.44], [120, 0.2, 0.8]]
    .map(([x, v1, v2]) => poly([[x, g.ly(x, v1)], [x + 28, g.ly(x + 28, v1)], [x + 18, g.ly(x + 18, v2)], [x - 6, g.ly(x - 6, v2 - 0.08)]],
      'fill="#5c4a46" opacity="0.8"') + `<path d="M${x - 6} ${g.ly(x - 6, v2 - 0.08)} q 10 30 34 22" stroke="#1a1210" stroke-width="5" fill="none" opacity="0.7"/>`).join('');

  const base = `
  ${FILTERS}
  ${shell(g, { sideFar: '#1c1515', side: '#3a2c2b', back: '#45353a', backTop: '#2a2125', ceil: '#1a1515', floor: '#3a2618', floorNear: '#120b07' })}
  ${wallpaper('wp-bed', '#7a5a62', 0.22)}
  <defs><pattern id="wp-bed-s" width="70" height="96" patternUnits="userSpaceOnUse" patternTransform="skewY(24)">
    <path d="M35 6 C46 20 52 30 35 44 C18 30 24 20 35 6Z" fill="#7a5a62"/></pattern>
    <clipPath id="c-left">${poly(g.left)}</clipPath></defs>
  <rect width="${W}" height="${H}" fill="url(#wp-bed-s)" opacity="0.14" clip-path="url(#c-left)"/>
  ${strips}
  ${planks(g, '#0a0604')}
  ${edges(g, '#140d0a')}

  <!-- window: night sky, moon -->
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05070d"/><stop offset="1" stop-color="#18243a"/></linearGradient>
    <clipPath id="c-win"><rect x="${win.x}" y="${win.y}" width="${win.w}" height="${win.h}"/></clipPath>
    <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a9c0ea" stop-opacity="0.32"/><stop offset="1" stop-color="#a9c0ea" stop-opacity="0"/></linearGradient>
  </defs>
  <rect x="${win.x - 16}" y="${win.y - 16}" width="${win.w + 32}" height="${win.h + 40}" fill="#120d0c"/>
  <rect x="${win.x}" y="${win.y}" width="${win.w}" height="${win.h}" fill="url(#sky)"/>
  <g clip-path="url(#c-win)">
    <circle cx="${win.x + 120}" cy="${win.y + 70}" r="130" fill="url(#glow-moon)"/>
    <circle cx="${win.x + 120}" cy="${win.y + 70}" r="26" fill="#e9eefa"/>
    <circle cx="${win.x + 112}" cy="${win.y + 64}" r="6" fill="#c6cfe0"/><circle cx="${win.x + 130}" cy="${win.y + 80}" r="4" fill="#c6cfe0"/>
    <path d="M${win.x - 10} ${win.y + 200} q 40 -60 80 -20 q 30 -50 70 -10 q 20 -30 60 0 v 80 h -210z" fill="#020305"/>
    ${watcher(win.x + 60, win.y + 262, 0.55)}
  </g>
  <g stroke="#120d0c" stroke-width="10"><line x1="${win.x + win.w / 2}" y1="${win.y}" x2="${win.x + win.w / 2}" y2="${win.y + win.h}"/><line x1="${win.x}" y1="${win.y + win.h / 2}" x2="${win.x + win.w}" y2="${win.y + win.h / 2}"/></g>
  <rect x="${win.x - 24}" y="${win.y + win.h + 14}" width="${win.w + 48}" height="12" fill="#1c1412"/>
  <!-- moonlight falling into the room -->
  ${poly([[win.x, win.y + win.h], [win.x + win.w, win.y + win.h], [win.x + 60, H], [win.x - 520, H]], 'fill="url(#beam)" style="mix-blend-mode:screen"')}
  ${poly([[g.fx(win.x - 40, 720), 720], [g.fx(win.x + 120, 720), 720], [g.fx(win.x + 60, 860), 860], [g.fx(win.x - 170, 860), 860]], 'fill="#9fb6e0" opacity="0.10" filter="url(#b8)"')}
  <!-- curtains -->
  <path d="M${win.x - 40} ${win.y - 26} h 70 c -6 80 10 170 -4 300 l -14 -16 -10 22 -12 -14 -14 24 c -12 -110 -24 -220 -16 -316z" fill="#3a1015"/>
  <path d="M${win.x + win.w - 30} ${win.y - 26} h 70 c 8 100 -4 200 10 310 l -14 -12 -12 20 -10 -16 -16 18 c -12 -100 -24 -200 -28 -320z" fill="#330d12"/>
  <rect x="${win.x - 60}" y="${win.y - 34}" width="${win.w + 120}" height="8" rx="4" fill="#0e0a08"/>

  <!-- picture frame, crooked -->
  <g transform="rotate(-7 640 330)"><rect x="580" y="275" width="120" height="150" fill="#1a120c" stroke="#3a2a18" stroke-width="10"/>
    <ellipse cx="640" cy="335" rx="26" ry="34" fill="#0b0807"/><rect x="606" y="372" width="68" height="44" fill="#0b0807"/></g>

  <!-- door (right wall), ajar with hall light -->
  ${poly(door, 'fill="#0d0907"')}
  ${poly([[door[0][0] + 8, door[0][1] + 6], [door[0][0] + 22, door[0][1] + 4], [door[3][0] + 22, door[3][1] - 4], [door[3][0] + 8, door[3][1] - 2]], 'fill="#ffb868" opacity="0.55" filter="url(#b3)"')}
  ${poly([[door[0][0] + 22, door[0][1] + 4], door[1], door[2], [door[3][0] + 22, door[3][1] - 4]], 'fill="#22170f"')}
  <circle cx="${door[0][0] + 50}" cy="${(door[0][1] + door[3][1]) / 2 + 10}" r="7" fill="#7a6234"/>
  ${poly([[door[3][0] + 10, door[3][1]], [door[3][0] - 140, H], [door[3][0] - 60, H], [door[3][0] + 22, door[3][1]]], 'fill="#ffb868" opacity="0.08" filter="url(#b8)"')}

  <!-- nightstand + dead lamp -->
  <ellipse cx="900" cy="650" rx="80" ry="10" fill="#000" opacity="0.7" filter="url(#b8)"/>
  <rect x="840" y="540" width="120" height="110" fill="#22160e"/>
  <rect x="840" y="540" width="120" height="10" fill="#3a2716"/>
  <rect x="852" y="566" width="96" height="34" fill="#1a110a" stroke="#0a0604" stroke-width="2"/>
  <circle cx="900" cy="583" r="4" fill="#8a6a3a"/>
  <rect x="852" y="608" width="96" height="34" fill="#1a110a" stroke="#0a0604" stroke-width="2"/>
  <rect x="893" y="480" width="8" height="60" fill="#120c08"/>
  <path d="M866 482 h 62 l -12 -44 h -38z" fill="#4a3a2a"/>
  <path d="M866 482 h 62 l -12 -44 h -38z" fill="url(#beam)" opacity="0.5"/>

  <!-- iron bed -->
  <ellipse cx="560" cy="800" rx="380" ry="40" fill="#000" opacity="0.85" filter="url(#b20)"/>
  ${poly([[470, 640], [800, 640], [860, 800], [300, 800]], 'fill="#020101"')}
  <g stroke="#0c0c0c" stroke-width="9" stroke-linecap="round">
    <line x1="468" y1="440" x2="468" y2="660"/><line x1="802" y1="440" x2="802" y2="660"/>
    <path d="M468 450 Q635 395 802 450" fill="none"/>
    ${[510, 550, 590, 635, 680, 720, 760].map((x) => `<line x1="${x}" y1="${455 - Math.sin((x - 468) / 334 * Math.PI) * 38}" x2="${x}" y2="560" stroke-width="5"/>`).join('')}
  </g>
  <circle cx="468" cy="436" r="11" fill="#0c0c0c"/><circle cx="802" cy="436" r="11" fill="#0c0c0c"/>
  <!-- mattress -->
  ${poly([[478, 560], [794, 560], [880, 742], [292, 742]], 'fill="#6e6656"')}
  ${poly([[292, 742], [880, 742], [880, 790], [292, 790]], 'fill="#4a4336"')}
  <ellipse cx="640" cy="660" rx="120" ry="40" fill="#5a3a20" opacity="0.55" filter="url(#b8)"/>
  <ellipse cx="520" cy="700" rx="70" ry="18" fill="#3a2010" opacity="0.5" filter="url(#b8)"/>
  <path d="M300 742 C 380 700 420 760 520 720 C 600 690 640 760 760 712 C 820 690 860 730 880 742 L 880 800 L 300 800Z" fill="#8a8474" opacity="0.9"/>
  <path d="M330 760 C 420 740 470 790 560 752 M600 770 C 680 740 740 790 840 760" stroke="#5a5446" stroke-width="5" fill="none"/>
  <path d="M500 572 h 120 c 14 0 18 34 0 38 h -126 c -14 -4 -10 -38 6 -38z" fill="#8f8878"/>
  <!-- the note on the mattress -->
  <g transform="rotate(-14 590 650)"><rect x="562" y="632" width="56" height="40" fill="#d8cfb4"/><path d="M568 642 h 40 M568 650 h 34 M568 658 h 38" stroke="#4a3a2a" stroke-width="2"/></g>
  <!-- the gap under the bed -->
  ${poly([[300, 790], [880, 790], [900, 830], [280, 830]], 'fill="#000"')}
  <rect x="296" y="790" width="10" height="56" fill="#0b0b0b"/><rect x="870" y="790" width="10" height="56" fill="#0b0b0b"/>

  <!-- ceiling crack + dead bulb -->
  <path d="M600 60 l 40 30 -18 26 50 40 -10 30" stroke="#000" stroke-width="3" fill="none" opacity="0.7"/>
  ${bulb(800, 0, 120, 'glow-warm', false)}
  ${weather(0.9, 0.5)}
  <rect width="${W}" height="${H}" fill="url(#vig)"/>`;

  const fx = `
  <defs><clipPath id="fx-win"><rect x="${win.x}" y="${win.y}" width="${win.w}" height="${win.h}"/></clipPath></defs>
  <g clip-path="url(#fx-win)">
    <g class="fx-rain">${Array.from({ length: 34 }, (_, i) => `<line x1="${win.x - 40 + (i * 37) % (win.w + 80)}" y1="${(i * 53) % 300 - 300}" x2="${win.x - 52 + (i * 37) % (win.w + 80)}" y2="${(i * 53) % 300 - 262}" stroke="#9fb3d8" stroke-opacity="0.35" stroke-width="1.5"/>`).join('')}</g>
    <g class="fx-rain fx-rain-2">${Array.from({ length: 34 }, (_, i) => `<line x1="${win.x - 20 + (i * 41) % (win.w + 80)}" y1="${(i * 61) % 300 - 300}" x2="${win.x - 32 + (i * 41) % (win.w + 80)}" y2="${(i * 61) % 300 - 270}" stroke="#9fb3d8" stroke-opacity="0.25" stroke-width="1"/>`).join('')}</g>
  </g>
  <rect class="fx-lightning" x="0" y="0" width="${W}" height="${H}" fill="#cfe0ff"/>
  <path class="fx-sway" d="M${win.x - 40} ${win.y - 26} h 70 c -6 80 10 170 -4 300 l -14 -16 -10 22 -12 -14 -14 24 c -12 -110 -24 -220 -16 -316z" fill="#3a1015"/>
  ${poly([[door[0][0] + 8, door[0][1] + 6], [door[0][0] + 22, door[0][1] + 4], [door[3][0] + 22, door[3][1] - 4], [door[3][0] + 8, door[3][1] - 2]], 'class="fx-shadowpass" fill="#000"')}
  ${motes(18, 760, 520, 560, 360)}`;

  return { base: wrap(base), fx: wrap(fx) };
}

// floating dust in a light shaft
function motes(n, cx, cy, w, h) {
  return `<g class="fx-motes">${Array.from({ length: n }, (_, i) => {
    const x = cx - w / 2 + ((i * 97) % w), y = cy - h / 2 + ((i * 59) % h);
    return `<circle class="fx-mote" style="animation-delay:${-(i * 1.7) % 12}s" cx="${x}" cy="${y}" r="${1 + (i % 3) * 0.7}" fill="#e8ecf5" opacity="0.5"/>`;
  }).join('')}</g>`;
}

// ═════════════════════ HALLWAY ═════════════════════
function hallway() {
  const g = geom(690, 320, 910, 540);
  const doorL = (x1, x2, open, lit) => {
    const q = g.wallQuadL(x1, x2, 0.16, 1);
    return `${poly(q, `fill="${open ? '#030202' : '#1c120b'}" stroke="#0a0604" stroke-width="5"`)}
      ${open && lit ? poly([q[0], [q[0][0] + (q[1][0] - q[0][0]) * 0.25, q[1][1] + (q[0][1] - q[1][1]) * 0.75], [q[0][0] + (q[1][0] - q[0][0]) * 0.25, q[2][1] + (q[3][1] - q[2][1]) * 0.75], q[3]], 'fill="#ffa64d" opacity="0.15"') : ''}
      ${!open ? `<circle cx="${q[1][0] - (q[1][0] - q[0][0]) * 0.2}" cy="${(q[1][1] + q[2][1]) / 2 + 10}" r="${(x2 - x1) / 30}" fill="#6e5530"/>` : ''}`;
  };
  const doorR = (x1, x2, open) => {
    const q = g.wallQuadR(x1, x2, 0.16, 1);
    return `${poly(q, `fill="${open ? '#030202' : '#1c120b'}" stroke="#0a0604" stroke-width="5"`)}
      ${!open ? `<circle cx="${q[0][0] + (q[1][0] - q[0][0]) * 0.2}" cy="${(q[0][1] + q[3][1]) / 2 + 10}" r="${(x2 - x1) / 30}" fill="#6e5530"/>` : ''}`;
  };
  const frameR = (x1, x2, v1, v2, fill) => poly(g.wallQuadR(x1, x2, v1, v2), `fill="${fill}" stroke="#3a2812" stroke-width="7"`);
  const wains = (side) => {
    const xs = side === 'L' ? [0, 690] : [910, 1600];
    const y = side === 'L' ? g.ly : g.ry;
    return `<line x1="${xs[0]}" y1="${y(xs[0], 0.58)}" x2="${xs[1]}" y2="${y(xs[1], 0.58)}" stroke="#120b06" stroke-width="6"/>
      ${poly([[xs[0], y(xs[0], 0.58)], [xs[1], y(xs[1], 0.58)], [xs[1], y(xs[1], 1)], [xs[0], y(xs[0], 1)]], 'fill="#1a110a" opacity="0.55"')}`;
  };
  const runner = [[g.fx(760, 540), 540], [g.fx(840, 540), 540], [g.fx(840, H), H], [g.fx(760, H), H]];

  const base = `
  ${FILTERS}
  ${shell(g, { sideFar: '#0d0906', side: '#3c2a1a', back: '#0a0705', ceil: '#140e09', floor: '#1a120b', floorNear: '#0a0604' })}
  <defs><clipPath id="c-lw">${poly(g.left)}</clipPath><clipPath id="c-rw">${poly(g.right)}</clipPath>
    <pattern id="stripe" width="40" height="40" patternUnits="userSpaceOnUse"><rect width="20" height="40" fill="#5a4026" opacity="0.18"/></pattern></defs>
  <rect width="${W}" height="${H}" fill="url(#stripe)" clip-path="url(#c-lw)"/>
  <rect width="${W}" height="${H}" fill="url(#stripe)" clip-path="url(#c-rw)"/>
  ${wains('L')}${wains('R')}
  ${planks(g, '#050302', 8)}
  ${poly(runner, 'fill="#3a0e0e"')}
  <g clip-path="url(#c-floor)">${poly([[g.fx(772, 540), 540], [g.fx(828, 540), 540], [g.fx(828, H), H], [g.fx(772, H), H]], 'fill="none" stroke="#7a5a20" stroke-width="3" opacity="0.5"')}</g>
  ${edges(g, '#0d0805')}

  <!-- far end: an open doorway into nothing -->
  <rect x="740" y="370" width="120" height="170" fill="#000"/>
  ${watcher(800, 540, 0.95)}
  <rect x="736" y="366" width="128" height="6" fill="#1a110a"/>

  <!-- doors receding -->
  ${doorL(40, 270, true, false)}
  ${doorL(380, 500, false)}
  ${doorL(585, 645, true, true)}
  ${doorR(1300, 1520, false)}
  ${doorR(1070, 1160, true)}
  ${doorR(950, 990, false)}

  <!-- linen closet, foreground left: door hanging open, towels inside -->
  ${poly(g.wallQuadL(40, 270, 0.16, 1), 'fill="#140e0a"')}
  ${[0.3, 0.45, 0.6, 0.75].map((v) => poly(g.wallQuadL(60, 250, v, v + 0.012), 'fill="#2a1c12"')).join('')}
  ${poly(g.wallQuadL(70, 240, 0.33, 0.44), 'fill="#5a5448" opacity="0.8"')}
  ${poly(g.wallQuadL(80, 230, 0.48, 0.59), 'fill="#4e4a40" opacity="0.8"')}
  ${poly([[270, g.ly(270, 0.16)], [360, g.ly(270, 0.16) - 60], [360, g.ly(270, 1) + 120], [270, g.ly(270, 1)]], 'fill="#22160d" stroke="#0a0604" stroke-width="5"')}

  <!-- family portraits on the right wall -->
  ${frameR(1170, 1270, 0.24, 0.5, '#120c08')}
  ${(() => { const q = g.wallQuadR(1182, 1258, 0.28, 0.46); const cx = (q[0][0] + q[1][0]) / 2, cy = (q[0][1] + q[3][1]) / 2;
      return poly(q, 'fill="#2a2116"') + [-22, -7, 8, 22].map((d, i) => `<ellipse cx="${cx + d}" cy="${cy - 6}" rx="6" ry="8" fill="${i === 2 ? '#c9b89a' : '#0b0806'}"/><rect x="${cx + d - 8}" y="${cy + 2}" width="16" height="26" fill="#0b0806"/>`).join('') +
        [-22, -7, 22].map((d) => `<path d="M${cx + d - 7} ${cy - 14} l 14 14 M${cx + d + 7} ${cy - 14} l -14 14" stroke="#6a5a40" stroke-width="2"/>`).join(''); })()}
  ${frameR(1380, 1470, 0.28, 0.44, '#1a120a')}
  ${frameR(1010, 1050, 0.26, 0.42, '#1a120a')}

  <!-- sconces -->
  ${(() => { const x = 1240, y = g.ry(x, 0.18); return `<rect x="${x - 6}" y="${y}" width="12" height="40" fill="#2a1e10"/><circle cx="${x}" cy="${y}" r="80" fill="url(#glow-warm)" opacity="0.25"/>`; })()}

  <!-- bulb in the middle distance -->
  ${bulb(800, 160, 230, 'glow-warm', true, 330)}
  ${poly([[790, 270], [810, 270], [g.fx(900, 760), 760], [g.fx(700, 760), 760]], 'fill="#ffcf8a" opacity="0.06" filter="url(#b20)"')}
  <ellipse cx="800" cy="700" rx="260" ry="50" fill="#ffb060" opacity="0.10" filter="url(#b40)"/>
  ${weather(0.85, 0.5)}
  <rect width="${W}" height="${H}" fill="url(#vig)"/>`;

  const fx = `
  <circle class="fx-flicker" cx="800" cy="256" r="360" fill="url(#glow-warm)"/>
  <rect class="fx-dim" width="${W}" height="${H}" fill="#000"/>
  <defs>${FILTERS.match(/<radialGradient id="glow-warm"[\s\S]*?<\/radialGradient>/)[0]}</defs>
  ${motes(14, 800, 380, 500, 300)}`;

  return { base: wrap(base), fx: wrap(fx) };
}

// ═════════════════════ KITCHEN ═════════════════════
function kitchen() {
  const g = geom(440, 190, 1160, 640);
  const tiles = () => {
    let s = `<g clip-path="url(#c-back)">`;
    for (let y = 400; y < 500; y += 24) for (let x = 440 + ((y / 24) % 2) * 14; x < 1160; x += 28)
      s += `<rect x="${x}" y="${y}" width="27" height="23" fill="#6f7a60" opacity="${0.35 + ((x * y) % 7) / 40}"/>`;
    return s + '</g>';
  };
  const base = `
  ${FILTERS}
  ${shell(g, { sideFar: '#0b0e09', side: '#2c3324', back: '#38412e', backTop: '#20261a', ceil: '#141810', floor: '#2a2d22', floorNear: '#0b0c08' })}
  ${checker(g, '#5c5f4c', '#16170f', 9)}
  ${edges(g, '#0e110b')}
  ${tiles()}

  <!-- window over the sink -->
  <rect x="890" y="232" width="190" height="150" fill="#0d1a10"/>
  <rect x="890" y="232" width="190" height="150" fill="none" stroke="#1a2014" stroke-width="12"/>
  <line x1="985" y1="232" x2="985" y2="382" stroke="#1a2014" stroke-width="8"/>
  <path d="M900 380 q 30 -80 50 -120 q 10 40 40 70 q 20 -60 70 -90 v 140z" fill="#040805"/>

  <!-- upper cupboards: one hanging open -->
  <rect x="470" y="215" width="340" height="160" fill="#2a2214" stroke="#120e08" stroke-width="5"/>
  <rect x="482" y="228" width="98" height="134" fill="#3a2e1a"/><rect x="595" y="228" width="98" height="134" fill="#050403"/>
  ${['#6a5a3a', '#4a3a2a', '#7a6a4a', '#3e4a32'].map((c, i) => `<rect x="${605 + i * 21}" y="${300 - (i % 2) * 20}" width="17" height="${46 + (i % 2) * 20}" rx="3" fill="${c}"/>`).join('')}
  <circle cx="618" cy="262" r="10" fill="#c9c2ae" opacity="0.6"/><circle cx="640" cy="266" r="7" fill="#c9c2ae" opacity="0.5"/>
  ${poly([[693, 228], [760, 210], [760, 390], [693, 362]], 'fill="#3e311c" stroke="#120e08" stroke-width="4"')}
  <rect x="705" y="228" width="98" height="134" fill="#3a2e1a" opacity="0"/>
  <rect x="708" y="228" width="92" height="0"/>
  <rect x="704" y="228" width="98" height="134" fill="none"/>
  <rect x="806" y="228" width="0" height="0"/>
  <circle cx="570" cy="300" r="4" fill="#8a7040"/>

  <!-- counter run with drawers -->
  <rect x="440" y="480" width="720" height="22" fill="#4a4a3a"/>
  <rect x="440" y="500" width="720" height="140" fill="#2a2214"/>
  ${[460, 620, 780, 940].map((x) => `<rect x="${x}" y="512" width="146" height="48" fill="#33291a" stroke="#120e08" stroke-width="3"/><rect x="${x}" y="570" width="146" height="62" fill="#33291a" stroke="#120e08" stroke-width="3"/><rect x="${x + 58}" y="532" width="30" height="5" fill="#0e0b07"/>`).join('')}
  <!-- the locked drawer: brass lock catching the light -->
  <rect x="780" y="512" width="146" height="48" fill="#3c301c" stroke="#a88a3a" stroke-width="2"/>
  <rect x="842" y="525" width="22" height="22" rx="3" fill="#b8963e"/><rect x="851" y="531" width="4" height="10" fill="#2a1e08"/>
  <circle cx="853" cy="536" r="30" fill="url(#glow-warm)" opacity="0.35"/>
  <!-- sink + tap -->
  <rect x="940" y="478" width="160" height="10" fill="#7d8070"/>
  <path d="M1012 478 v -46 q 0 -14 14 -14 h 26 v 10" stroke="#8d9080" stroke-width="7" fill="none"/>
  <rect x="955" y="468" width="20" height="10" fill="#111"/>

  <!-- fridge on the right -->
  ${poly([[1210, 250], [1400, 210], [1400, 790], [1210, 730]], 'fill="#a7a78e"')}
  ${poly([[1210, 250], [1400, 210], [1400, 790], [1210, 730]], 'fill="url(#s-r)" opacity="0.7"')}
  ${poly([[1170, 262], [1210, 250], [1210, 730], [1170, 700]], 'fill="#5a5a48"')}
  <line x1="1210" y1="430" x2="1400" y2="404" stroke="#3a3a2e" stroke-width="4"/>
  <rect x="1226" y="300" width="8" height="90" rx="3" fill="#4a4a3a"/>
  <!-- note stuck on the fridge -->
  <g transform="rotate(-5 1310 330)"><rect x="1282" y="300" width="58" height="66" fill="#e2dcc0"/><rect x="1304" y="294" width="14" height="12" fill="#b03030"/>
    <path d="M1290 318 h 40 M1290 328 h 34 M1290 338 h 38 M1290 348 h 22" stroke="#3a3020" stroke-width="2"/></g>
  <path d="M1250 600 q 20 40 10 90 M1330 560 q 30 60 -6 140" stroke="#5a2a10" stroke-width="7" fill="none" opacity="0.5"/>

  <!-- table + chairs in the foreground -->
  <ellipse cx="380" cy="850" rx="300" ry="40" fill="#000" opacity="0.8" filter="url(#b20)"/>
  ${poly([[150, 690], [560, 690], [620, 760], [80, 760]], 'fill="#1e150c"')}
  <rect x="80" y="760" width="540" height="18" fill="#120c07"/>
  <rect x="110" y="776" width="16" height="124" fill="#0a0704"/><rect x="580" y="776" width="16" height="124" fill="#0a0704"/>
  <path d="M640 900 v -260 h 18 v 150 h 90 v -150 h 18 v 260" fill="#080604"/>
  <rect x="640" y="780" width="126" height="16" fill="#0c0905"/>
  <!-- a plate, something rotting -->
  <ellipse cx="330" cy="722" rx="56" ry="14" fill="#b8b2a0"/><ellipse cx="330" cy="718" rx="30" ry="7" fill="#3a2a10"/>

  <!-- hanging lamp -->
  <line x1="800" y1="0" x2="800" y2="110" stroke="#050505" stroke-width="3"/>
  <path d="M758 150 h 84 l -16 -40 h -52z" fill="#1c2416"/>
  <ellipse cx="800" cy="152" rx="20" ry="7" fill="#f2ffd8"/>
  ${poly([[770, 155], [830, 155], [1040, 640], [560, 640]], 'fill="#d8f0b0" opacity="0.07" filter="url(#b20)"')}
  <ellipse cx="800" cy="650" rx="330" ry="70" fill="#d8f0b0" opacity="0.08" filter="url(#b40)"/>
  ${weather(1, 0.55)}
  <rect width="${W}" height="${H}" fill="#2a3a10" opacity="0.10" style="mix-blend-mode:multiply"/>
  <rect width="${W}" height="${H}" fill="url(#vig)"/>`;

  const fx = `
  <defs>${FILTERS.match(/<radialGradient id="glow-sick"[\s\S]*?<\/radialGradient>/)[0]}</defs>
  <circle class="fx-flicker" cx="800" cy="160" r="420" fill="url(#glow-sick)" opacity="0.55"/>
  <rect class="fx-dim" width="${W}" height="${H}" fill="#000"/>
  <ellipse class="fx-drip" cx="965" cy="482" rx="2.5" ry="4" fill="#cfe0d0"/>
  ${motes(10, 800, 420, 420, 360)}`;
  return { base: wrap(base), fx: wrap(fx) };
}

// ═════════════════════ BASEMENT ═════════════════════
function basement() {
  const g = geom(470, 210, 1130, 650);
  const steps = Array.from({ length: 9 }, (_, i) => {
    const x = 20 + i * 44, y = 170 + i * 58;
    return `${poly([[x, y], [x + 150, y + 10], [x + 150, y + 22], [x, y + 14]], 'fill="#3a2c1e"')}${poly([[x, y + 14], [x + 150, y + 22], [x + 150, y + 64], [x, y + 58]], 'fill="#130d08"')}`;
  }).join('');
  const base = `
  ${FILTERS}
  ${shell(g, { sideFar: '#090c0d', side: '#2a3234', back: '#343d3f', backTop: '#1c2224', ceil: '#0e1112', floor: '#262c2c', floorNear: '#090b0b' })}
  <!-- cinder block lines -->
  <g clip-path="url(#c-back)" stroke="#1a2022" stroke-width="3">
    ${Array.from({ length: 10 }, (_, r) => `<line x1="470" y1="${230 + r * 44}" x2="1130" y2="${230 + r * 44}"/>` +
      Array.from({ length: 8 }, (_, c) => `<line x1="${470 + c * 88 + (r % 2) * 44}" y1="${230 + r * 44}" x2="${470 + c * 88 + (r % 2) * 44}" y2="${274 + r * 44}"/>`).join('')).join('')}
  </g>
  ${edges(g, '#0b0e0f')}
  <!-- puddle -->
  <ellipse cx="760" cy="760" rx="210" ry="34" fill="#0b1214"/>
  <ellipse cx="760" cy="756" rx="160" ry="20" fill="#5a7880" opacity="0.18" filter="url(#b8)"/>

  <!-- pipes -->
  <g stroke-linecap="round" fill="none">
    <path d="M0 60 H 1600" stroke="#1d2426" stroke-width="26"/><path d="M0 60 H 1600" stroke="#3b4649" stroke-width="5" transform="translate(0 -6)"/>
    <path d="M520 60 V 300 H 640" stroke="#1d2426" stroke-width="18"/>
    <path d="M1250 60 V 900" stroke="#181f21" stroke-width="30"/><path d="M1240 60 V 900" stroke="#3b4649" stroke-width="4"/>
    ${[200, 480, 760, 1060, 1380].map((x) => `<rect x="${x - 9}" y="40" width="18" height="40" fill="#121718" stroke="none"/>`).join('')}
  </g>

  <!-- boiler -->
  <defs><linearGradient id="cyl" x1="0" x2="1"><stop offset="0" stop-color="#0c0f10"/><stop offset="0.35" stop-color="#3a4446"/><stop offset="0.6" stop-color="#20282a"/><stop offset="1" stop-color="#070909"/></linearGradient></defs>
  <ellipse cx="1050" cy="680" rx="140" ry="20" fill="#000" opacity="0.8" filter="url(#b8)"/>
  <rect x="940" y="320" width="220" height="360" rx="30" fill="url(#cyl)"/>
  <ellipse cx="1050" cy="322" rx="110" ry="22" fill="#2c3537"/>
  <path d="M1050 300 V 60" stroke="#1d2426" stroke-width="30"/>
  <rect x="995" y="540" width="110" height="70" rx="6" fill="#120806"/>
  ${[0, 1, 2, 3, 4].map((i) => `<rect x="${1003 + i * 21}" y="548" width="11" height="54" fill="#ff6a20" opacity="0.8"/>`).join('')}
  <circle cx="1050" cy="400" r="22" fill="#0c0f10" stroke="#4a5456" stroke-width="5"/><line x1="1050" y1="400" x2="1062" y2="388" stroke="#c33" stroke-width="3"/>

  <!-- shelves with jars (right wall) -->
  ${[0.32, 0.5, 0.68].map((v) => poly(g.wallQuadR(1300, 1560, v, v + 0.02), 'fill="#2a1e14"')).join('')}
  ${[0.32, 0.5, 0.68].map((v, r) => [1320, 1380, 1440, 1500].map((x, i) => { const y = g.ry(x, v); return `<rect x="${x}" y="${y - 52 + (i % 2) * 8}" width="34" height="${52 - (i % 2) * 8}" rx="5" fill="${['#4a3a20', '#3a4a2a', '#5a2a1a', '#2a3a3a'][(i + r) % 4]}" opacity="0.85"/><rect x="${x + 3}" y="${y - 60 + (i % 2) * 8}" width="28" height="8" fill="#555"/>`; }).join('')).join('')}

  <!-- workbench + pegboard -->
  <rect x="540" y="300" width="330" height="190" fill="#3a2e1e"/>
  ${Array.from({ length: 70 }, (_, i) => `<circle cx="${552 + (i % 14) * 23}" cy="${314 + Math.floor(i / 14) * 34}" r="2.5" fill="#1a130b"/>`).join('')}
  <path d="M580 330 h 20 v 90 h -20z M620 330 l 30 0 -6 120 -18 0z" fill="#0d0b09"/>
  <path d="M700 340 l 60 0 0 16 -50 0 0 80 -10 0z" fill="#0d0b09"/>
  <path d="M790 330 q 30 30 0 60 q -30 -30 0 -60z" fill="#0d0b09"/>
  <rect x="830" y="330" width="10" height="100" fill="#0d0b09" opacity="0.4" stroke="#6a5a40" stroke-dasharray="4 4"/>
  ${poly([[520, 500], [890, 500], [920, 540], [490, 540]], 'fill="#4a3824"')}
  <rect x="490" y="540" width="430" height="18" fill="#2a1e12"/>
  <rect x="505" y="558" width="18" height="110" fill="#1a120a"/><rect x="890" y="558" width="18" height="110" fill="#1a120a"/>
  <!-- bolt cutters on the bench -->
  <g transform="rotate(-8 700 515)"><path d="M610 520 L 760 508" stroke="#b02a1a" stroke-width="10" stroke-linecap="round"/><path d="M612 532 L 760 516" stroke="#b02a1a" stroke-width="10" stroke-linecap="round"/>
    <path d="M760 508 L 810 500 M760 516 L 812 512" stroke="#8a8f90" stroke-width="12" stroke-linecap="round"/></g>
  <rect x="540" y="510" width="40" height="18" fill="#6a6040" opacity="0.6"/>

  <!-- padlocked toolbox -->
  <ellipse cx="890" cy="812" rx="150" ry="18" fill="#000" opacity="0.8" filter="url(#b8)"/>
  ${poly([[780, 720], [990, 720], [1020, 740], [810, 740]], 'fill="#a03018"')}
  <rect x="780" y="720" width="0" height="0"/>
  ${poly([[780, 720], [810, 740], [810, 810], [780, 790]], 'fill="#5a1a0c"')}
  <rect x="810" y="740" width="210" height="70" fill="#7a2410"/>
  <rect x="810" y="760" width="210" height="4" fill="#3a1206"/>
  <path d="M870 728 q 45 -26 90 0" stroke="#222" stroke-width="8" fill="none"/>
  <path d="M905 748 q 10 -22 20 0" stroke="#9a9a9a" stroke-width="5" fill="none"/>
  <rect x="898" y="748" width="34" height="30" rx="5" fill="#b8963e"/><circle cx="915" cy="762" r="4" fill="#2a1e08"/>

  <!-- stairs coming down from the house -->
  ${steps}
  <path d="M10 120 L 440 640" stroke="#1e160e" stroke-width="12"/>
  ${Array.from({ length: 9 }, (_, i) => `<line x1="${40 + i * 46}" y1="${156 + i * 55}" x2="${40 + i * 46}" y2="${210 + i * 55}" stroke="#1e160e" stroke-width="6"/>`).join('')}
  ${poly([[20, 690], [440, 690], [440, 900], [0, 900]], 'fill="#030404"')}
  ${watcher(250, 700, 1.05)}

  <!-- dead bulb on a pull chain -->
  ${bulb(780, 60, 170, 'glow-warm', false)}
  <line x1="790" y1="200" x2="790" y2="280" stroke="#3a3a3a" stroke-width="2" stroke-dasharray="3 3"/>
  ${weather(1, 0.6)}
  <rect width="${W}" height="${H}" fill="#001018" opacity="0.18" style="mix-blend-mode:multiply"/>
  <rect width="${W}" height="${H}" fill="url(#vig)"/>`;

  const fx = `
  <defs>${FILTERS.match(/<radialGradient id="glow-ember"[\s\S]*?<\/radialGradient>/)[0]}</defs>
  <circle class="fx-pulse" cx="1050" cy="575" r="260" fill="url(#glow-ember)"/>
  <ellipse class="fx-pulse" cx="1050" cy="700" rx="300" ry="60" fill="#ff6a20" opacity="0.12"/>
  <ellipse class="fx-drip" style="--fall:660px" cx="700" cy="80" rx="3" ry="5" fill="#9fb8c0"/>`;
  return { base: wrap(base), fx: wrap(fx) };
}

// ═════════════════════ FOYER ═════════════════════
function foyer() {
  const g = geom(460, 170, 1140, 650);
  const stairs = Array.from({ length: 11 }, (_, i) => {
    const x = 30 + i * 36, y = 860 - i * 52;
    return `${poly([[x, y], [x + 260 - i * 8, y - 8], [x + 260 - i * 8, y + 6], [x, y + 14]], 'fill="#3a1c12"')}${poly([[x, y + 14], [x + 260 - i * 8, y + 6], [x + 260 - i * 8, y + 52], [x, y + 60]], 'fill="#160906"')}`;
  }).reverse().join('');
  const base = `
  ${FILTERS}
  ${shell(g, { sideFar: '#120605', side: '#3c1814', back: '#4a1c18', backTop: '#26100e', ceil: '#140807', floor: '#2a1e18', floorNear: '#080505' })}
  ${wallpaper('wp-foy', '#a04a3a', 0.16)}
  ${checker(g, '#8a7e68', '#0e0a08', 8)}
  ${edges(g, '#100605')}

  <!-- rug -->
  ${poly([[g.fx(690, 660), 660], [g.fx(910, 660), 660], [g.fx(930, 820), 820], [g.fx(670, 820), 820]], 'fill="#4a0e0e"')}
  ${poly([[g.fx(705, 668), 668], [g.fx(895, 668), 668], [g.fx(912, 808), 808], [g.fx(688, 808), 808]], 'fill="none" stroke="#9a6a2a" stroke-width="3" opacity="0.6"')}

  <!-- the front door -->
  <rect x="660" y="230" width="280" height="420" fill="#1a0a07"/>
  <path d="M680 330 a 120 100 0 0 1 240 0z" fill="#0a0403"/>
  <defs><clipPath id="c-fan"><path d="M690 330 a 110 90 0 0 1 220 0z"/></clipPath></defs>
  <g clip-path="url(#c-fan)">
    ${[0, 1, 2, 3, 4, 5].map((i) => `<path d="M800 330 L ${800 + Math.cos(Math.PI + i * Math.PI / 6) * 140} ${330 + Math.sin(Math.PI + i * Math.PI / 6) * 140} L ${800 + Math.cos(Math.PI + (i + 1) * Math.PI / 6) * 140} ${330 + Math.sin(Math.PI + (i + 1) * Math.PI / 6) * 140}z" fill="${['#7a1010', '#a0601a', '#5a0a0a', '#8a2a10', '#a0601a', '#7a1010'][i]}" stroke="#0a0403" stroke-width="5"/>`).join('')}
  </g>
  <rect x="690" y="340" width="220" height="310" fill="#2a120c"/>
  ${[[705, 356, 90, 120], [805, 356, 90, 120], [705, 492, 90, 140], [805, 492, 90, 140]].map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#220e09" stroke="#140705" stroke-width="5"/><rect x="${x + 6}" y="${y + 6}" width="${w - 12}" height="${h - 12}" fill="none" stroke="#3a1a10" stroke-width="2"/>`).join('')}
  <!-- deadbolt + knob -->
  <rect x="872" y="468" width="26" height="34" rx="4" fill="#b8963e"/><circle cx="885" cy="485" r="5" fill="#2a1e08"/>
  <circle cx="885" cy="530" r="12" fill="#8a7030"/><circle cx="881" cy="526" r="4" fill="#e0c070" opacity="0.6"/>
  <!-- chain -->
  <g fill="none" stroke="#9a9a96" stroke-width="5">
    ${[0, 1, 2, 3, 4, 5].map((i) => i % 2 ? `<ellipse cx="${905 - i * 15}" cy="${436 + i * 9}" rx="5" ry="9"/>` : `<ellipse cx="${905 - i * 15}" cy="${436 + i * 9}" rx="10" ry="5"/>`).join('')}
  </g>
  <rect x="904" y="426" width="20" height="16" fill="#6a6a66"/><rect x="814" y="474" width="16" height="12" fill="#6a6a66"/>
  <!-- red light from the fanlight falling on the floor -->
  ${poly([[700, 330], [900, 330], [1020, 900], [580, 900]], 'fill="#ff3020" opacity="0.06" filter="url(#b20)" style="mix-blend-mode:screen"')}

  <!-- grandfather clock (right) -->
  <ellipse cx="1300" cy="822" rx="110" ry="16" fill="#000" opacity="0.8" filter="url(#b8)"/>
  ${poly([[1240, 260], [1360, 236], [1360, 820], [1240, 800]], 'fill="#1e0e08"')}
  ${poly([[1210, 270], [1240, 260], [1240, 800], [1210, 790]], 'fill="#0e0604"')}
  <circle cx="1300" cy="320" r="44" fill="#c9bea0"/><circle cx="1300" cy="320" r="44" fill="none" stroke="#5a4020" stroke-width="7"/>
  <path d="M1300 320 L 1300 290 M1300 320 L 1322 330" stroke="#1a1008" stroke-width="4"/>
  ${Array.from({ length: 12 }, (_, i) => `<circle cx="${1300 + Math.cos(i * Math.PI / 6) * 36}" cy="${320 + Math.sin(i * Math.PI / 6) * 36}" r="2.5" fill="#1a1008"/>`).join('')}
  <rect x="1262" y="400" width="76" height="300" fill="#0a0504"/>

  <!-- coat rack: coats that look like someone standing -->
  <rect x="1460" y="260" width="12" height="560" fill="#0d0705"/>
  <path d="M1426 300 h 80" stroke="#0d0705" stroke-width="8"/>
  <path d="M1440 300 c -30 30 -40 160 -30 300 c 30 10 50 10 70 0 c 6 -130 0 -260 -40 -300z" fill="#1c1210"/>
  <path d="M1482 300 c 26 40 36 180 26 330 c -20 8 -40 6 -56 -2 c 4 -150 10 -280 30 -328z" fill="#140c0a"/>
  <ellipse cx="1466" cy="282" rx="34" ry="12" fill="#0d0705"/><rect x="1446" y="252" width="40" height="32" rx="6" fill="#0d0705"/>

  <!-- staircase up into the dark (left) -->
  ${stairs}
  <path d="M0 790 L 420 260" stroke="#2a0e08" stroke-width="16"/>
  ${Array.from({ length: 11 }, (_, i) => `<line x1="${34 + i * 36}" y1="${740 - i * 47}" x2="${34 + i * 36}" y2="${812 - i * 52}" stroke="#2a0e08" stroke-width="6"/>`).join('')}
  <rect x="0" y="770" width="34" height="130" fill="#2a0e08"/><circle cx="17" cy="766" r="16" fill="#3a1408"/>
  ${poly([[400, 260], [470, 230], [470, 0], [380, 0]], 'fill="#000" opacity="0.8"')}
  ${watcher(430, 330, 0.7)}

  <!-- mirror on the left wall -->
  ${poly(g.wallQuadL(120, 220, 0.25, 0.48), 'fill="#2a2e30" stroke="#5a4020" stroke-width="8"')}
  ${poly(g.wallQuadL(132, 208, 0.28, 0.45), 'fill="#5a6466" opacity="0.4"')}

  <!-- chandelier silhouette -->
  <line x1="800" y1="0" x2="800" y2="90" stroke="#050505" stroke-width="4"/>
  <path d="M720 120 Q 800 160 880 120 M740 110 v 20 M800 100 v 40 M860 110 v 20" stroke="#0a0606" stroke-width="6" fill="none"/>
  ${[740, 770, 800, 830, 860].map((x, i) => `<circle cx="${x}" cy="${128 + (i % 2) * 10}" r="${i === 2 ? 4 : 3}" fill="#ffcf8a" opacity="${i === 3 ? 0.15 : 0.7}"/>`).join('')}
  <circle cx="800" cy="130" r="220" fill="url(#glow-warm)" opacity="0.45"/>
  ${weather(0.8, 0.55)}
  <rect width="${W}" height="${H}" fill="url(#vig)"/>`;

  const fx = `
  <g class="fx-pendulum"><line x1="1300" y1="410" x2="1300" y2="600" stroke="#8a6a2a" stroke-width="4"/><circle cx="1300" cy="610" r="18" fill="#b8963e"/></g>
  <rect x="690" y="642" width="220" height="8" fill="#ffb060" opacity="0.45"/>
  <rect class="fx-underdoor" x="690" y="642" width="70" height="8" fill="#000"/>
  <rect class="fx-lightning" x="690" y="240" width="220" height="90" fill="#ffddcc"/>`;
  return { base: wrap(base), fx: wrap(fx) };
}

export const ROOM_ART = {
  bedroom: bedroom(),
  hallway: hallway(),
  kitchen: kitchen(),
  basement: basement(),
  foyer: foyer(),
};

// Hotspot anchors in the same 1600×900 space as the art
export const ART_SIZE = { w: W, h: H };
export const HOTSPOT_XY = {
  nightstand:   [900, 584],
  note:         [590, 652],
  bed:          [590, 815],
  linenCloset:  [160, 470],
  portrait:     [1220, 300],
  cupboards:    [640, 300],
  lockedDrawer: [853, 536],
  fridge:       [1311, 333],
  workbench:    [705, 430],
  toolbox:      [915, 765],
  fumble:       [760, 560],
  frontDoor:    [800, 470],
};
// Back-compat: percentages
export const HOTSPOT_POS = Object.fromEntries(
  Object.entries(HOTSPOT_XY).map(([k, [x, y]]) => [k, [(x / W) * 100, (y / H) * 100]]));

// ═════════════════════ TITLE SCREEN: the house on the hill ═════════════════════
const tree = (x, y, s, flip = 1) => `
  <g transform="translate(${x} ${y}) scale(${s * flip} ${s})" stroke="#020203" stroke-linecap="round" fill="none">
    <path d="M0 0 C 4 -80 -6 -160 4 -240" stroke-width="16"/>
    <path d="M2 -120 C 30 -150 60 -160 90 -210 M60 -165 C 80 -170 100 -165 120 -180 M0 -170 C -30 -200 -50 -230 -90 -250 M-50 -220 C -70 -230 -80 -260 -76 -290 M4 -230 C 10 -260 30 -290 20 -330 M-4 -80 C -40 -100 -70 -100 -100 -130" stroke-width="6"/>
    <path d="M90 -210 l 20 -30 M-90 -250 l -26 -10 M20 -330 l 14 -20 M-100 -130 l -20 4 M120 -180 l 16 4" stroke-width="3"/>
  </g>`;

export const TITLE_ART = wrap(`
  <defs>
    <linearGradient id="t-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#03050a"/><stop offset="0.55" stop-color="#18223a"/><stop offset="0.8" stop-color="#2c2a3a"/><stop offset="1" stop-color="#1a1418"/></linearGradient>
    <radialGradient id="t-moon"><stop offset="0" stop-color="#f2f4fa"/><stop offset="0.08" stop-color="#d9e0ee" stop-opacity="0.9"/><stop offset="0.3" stop-color="#7a8aa8" stop-opacity="0.18"/><stop offset="1" stop-color="#7a8aa8" stop-opacity="0"/></radialGradient>
    <radialGradient id="t-win"><stop offset="0" stop-color="#ffcf80"/><stop offset="0.3" stop-color="#ff9a40" stop-opacity="0.5"/><stop offset="1" stop-color="#ff7020" stop-opacity="0"/></radialGradient>
    <filter id="tb20" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="22"/></filter>
    <filter id="tb6" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
    <filter id="t-grain2" x="0" y="0" width="100%" height="100%" filterUnits="userSpaceOnUse">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="9"/>
      <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.3 0 0 0 -0.5"/>
    </filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#t-sky)"/>
  <circle cx="1260" cy="190" r="460" fill="url(#t-moon)"/>
  <circle cx="1260" cy="190" r="58" fill="#e6eaf3"/>
  <circle cx="1245" cy="178" r="12" fill="#c8cfdd"/><circle cx="1276" cy="208" r="8" fill="#c8cfdd"/>
  <g filter="url(#tb20)" fill="#2a3040" opacity="0.7" class="fx-cloud">
    <ellipse cx="1050" cy="240" rx="260" ry="34"/><ellipse cx="1350" cy="170" rx="200" ry="26"/><ellipse cx="400" cy="120" rx="300" ry="40"/>
  </g>
  <!-- distant hills -->
  <path d="M0 640 C 200 590 380 610 560 580 C 760 550 980 600 1200 570 C 1380 550 1500 580 1600 560 V 900 H 0Z" fill="#07080c"/>
  <g transform="translate(400 -10)">
  <!-- the house -->
  <g fill="#020203">
    <path d="M560 640 V 420 L 640 330 L 720 420 V 640Z"/>
    <path d="M700 640 V 380 L 820 250 L 940 380 V 640Z"/>
    <path d="M920 640 V 450 L 1010 380 L 1100 450 V 640Z"/>
    <rect x="760" y="200" width="30" height="90"/><rect x="980" y="340" width="22" height="70"/>
    <path d="M640 330 l 0 -60 l 8 0 l 0 60z"/>
    <rect x="540" y="560" width="580" height="80"/>
    <path d="M530 560 h 600 l -20 -24 h -560z"/>
  </g>
  <!-- windows: all dark except one -->
  ${[[600, 450], [660, 450], [600, 520], [740, 420], [860, 420], [740, 500], [860, 500], [960, 480], [1040, 480]].map(([x, y]) => `<rect x="${x}" y="${y}" width="34" height="50" fill="#0b0d12"/>`).join('')}
  <circle cx="817" cy="345" r="120" fill="url(#t-win)" class="t-window-glow"/>
  <rect x="800" y="320" width="34" height="50" fill="#ffb760" class="t-window"/>
  <path d="M817 370 v -36 c 0 -8 -10 -8 -10 -2 v -4 c 0 -9 20 -9 20 0 v 4 c 0 -6 -10 -6 -10 2" fill="#1a0a04"/>
  <rect x="805" y="340" width="24" height="30" fill="#1a0a04" opacity="0.9"/>
  <ellipse cx="817" cy="333" rx="7" ry="9" fill="#1a0a04"/>
  <line x1="817" y1="320" x2="817" y2="370" stroke="#020203" stroke-width="3"/><line x1="800" y1="345" x2="834" y2="345" stroke="#020203" stroke-width="3"/>
  </g>
  <!-- foreground hill, fence, dead trees -->
  <path d="M0 720 C 300 660 560 640 820 650 C 1100 660 1350 700 1600 690 V 900 H 0Z" fill="#030304"/>
  ${Array.from({ length: 26 }, (_, i) => `<rect x="${730 + i * 40}" y="${652 - Math.sin(i / 3) * 6 + (i % 3) * 3}" width="7" height="${40 + (i % 2) * 8}" fill="#030304" transform="rotate(${(i % 5) - 2} ${733 + i * 40} 690)"/>`).join('')}
  <path d="M720 668 C 1000 650 1300 652 1780 672" stroke="#030304" stroke-width="5" fill="none"/>
  ${tree(180, 760, 1.5)}${tree(1590, 780, 1.2, -1)}${tree(880, 700, 0.75)}${tree(390, 690, 0.6, -1)}
  <!-- fog -->
  <g class="fx-fog" filter="url(#tb20)" fill="#6a7088" opacity="0.18">
    <ellipse cx="400" cy="700" rx="500" ry="50"/><ellipse cx="1200" cy="720" rx="520" ry="46"/><ellipse cx="800" cy="800" rx="700" ry="60"/>
  </g>
  <g class="fx-fog fx-fog-2" filter="url(#tb20)" fill="#8088a0" opacity="0.12">
    <ellipse cx="700" cy="660" rx="420" ry="34"/><ellipse cx="1400" cy="650" rx="300" ry="30"/>
  </g>
  <rect width="${W}" height="${H}" filter="url(#t-grain2)" opacity="0.5"/>
  <rect width="${W}" height="${H}" fill="url(#vig)"/>
  <defs>${FILTERS.match(/<radialGradient id="vig"[\s\S]*?<\/radialGradient>/)[0]}</defs>`);
