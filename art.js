// ─────────────────────────────────────────────────────────────
//  Title-screen art — procedural SVG (no image files).
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
