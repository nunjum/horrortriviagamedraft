// ─────────────────────────────────────────────────────────────
//  Room silhouettes (inline SVG) and hotspot positions.
//  Placeholder art — swap for illustrated backgrounds later.
// ─────────────────────────────────────────────────────────────

const svg = (body) =>
  `<svg viewBox="0 0 800 450" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

// A figure that fades in more each day (opacity driven by CSS --bloodiness)
const watcher = (x, y, s = 1) => `
  <g class="watcher" transform="translate(${x} ${y}) scale(${s})">
    <ellipse cx="0" cy="-118" rx="13" ry="16" fill="#000"/>
    <path d="M-20 -100 Q0 -108 20 -100 L26 -20 Q12 -4 8 0 L-8 0 Q-12 -4 -26 -20Z" fill="#000"/>
    <circle cx="-5" cy="-120" r="1.6" fill="#f22"/><circle cx="5" cy="-120" r="1.6" fill="#f22"/>
  </g>`;

export const ROOM_ART = {
  bedroom: svg(`
    <defs><linearGradient id="moon" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#9fb4d8" stop-opacity="0.22"/><stop offset="1" stop-color="#9fb4d8" stop-opacity="0"/>
    </linearGradient></defs>
    <rect x="520" y="60" width="150" height="190" fill="#0d1420" stroke="#1d2533" stroke-width="8"/>
    <line x1="595" y1="60" x2="595" y2="250" stroke="#1d2533" stroke-width="6"/>
    <line x1="520" y1="155" x2="670" y2="155" stroke="#1d2533" stroke-width="6"/>
    <circle cx="630" cy="105" r="18" fill="#c9d4e6" opacity="0.5"/>
    <polygon points="520,250 670,250 560,450 260,450" fill="url(#moon)"/>
    ${watcher(560, 245, 0.75)}
    <rect x="0" y="380" width="800" height="70" fill="#07080b"/>
    <path d="M60 300 h20 v-60 h10 v60 h340 v-30 h10 v30 h20 v110 h-400z" fill="#020203"/>
    <rect x="80" y="290" width="350" height="30" rx="8" fill="#0a0c10"/>
    <rect x="110" y="275" width="90" height="25" rx="10" fill="#0e1117"/>
    <rect x="120" y="390" width="270" height="22" fill="#000"/>
    <rect x="460" y="330" width="70" height="80" fill="#040506"/>
    <rect x="466" y="345" width="58" height="18" fill="#0b0d11"/>
    <circle cx="495" cy="354" r="2.5" fill="#3a3a3a"/>
  `),

  hallway: svg(`
    <polygon points="0,0 800,0 520,140 280,140" fill="#080605"/>
    <polygon points="0,450 800,450 520,300 280,300" fill="#0a0806"/>
    <polygon points="0,0 280,140 280,300 0,450" fill="#0d0a07"/>
    <polygon points="800,0 520,140 520,300 800,450" fill="#0c0906"/>
    <rect x="280" y="140" width="240" height="160" fill="#030202"/>
    ${watcher(400, 298, 0.9)}
    <polygon points="70,105 190,165 190,345 70,395" fill="#050403" stroke="#1a140e" stroke-width="3"/>
    <polygon points="630,165 730,115 730,385 630,335" fill="#050403" stroke="#1a140e" stroke-width="3"/>
    <rect x="600" y="160" width="0" height="0"/>
    <polygon points="560,150 610,128 610,190 560,205" fill="#120d08" stroke="#2c2015" stroke-width="3"/>
    <g stroke="#140f0a" stroke-width="2">
      <line x1="400" y1="300" x2="400" y2="450"/><line x1="340" y1="300" x2="200" y2="450"/>
      <line x1="460" y1="300" x2="600" y2="450"/><line x1="300" y1="300" x2="60" y2="450"/><line x1="500" y1="300" x2="740" y2="450"/>
    </g>
    <circle cx="400" cy="60" r="10" fill="#3a2e1c" opacity="0.6"/>
  `),

  kitchen: svg(`
    <line x1="400" y1="0" x2="400" y2="70" stroke="#111" stroke-width="2"/>
    <path d="M370 70 h60 l-12 22 h-36z" fill="#101510"/>
    <ellipse cx="400" cy="95" rx="10" ry="5" fill="#cfe0b0" opacity="0.5"/>
    <polygon points="388,95 412,95 600,450 200,450" fill="#b9d49a" opacity="0.05"/>
    <rect x="40" y="150" width="300" height="90" fill="#060806" stroke="#141a12" stroke-width="3"/>
    <line x1="140" y1="150" x2="140" y2="240" stroke="#141a12" stroke-width="3"/>
    <line x1="240" y1="150" x2="240" y2="240" stroke="#141a12" stroke-width="3"/>
    <rect x="0" y="300" width="560" height="16" fill="#0f130e"/>
    <rect x="20" y="316" width="540" height="134" fill="#050605"/>
    <rect x="360" y="330" width="140" height="40" fill="#0a0d09" stroke="#1d241a" stroke-width="2"/>
    <rect x="422" y="343" width="16" height="14" fill="#5a4a22"/>
    <rect x="620" y="150" width="130" height="300" rx="6" fill="#0b0e0b" stroke="#161c14" stroke-width="3"/>
    <line x1="620" y1="250" x2="750" y2="250" stroke="#161c14" stroke-width="3"/>
    <rect x="730" y="190" width="6" height="40" fill="#222"/>
    <rect x="660" y="270" width="40" height="30" fill="#d8d0b8" opacity="0.25" transform="rotate(-6 680 285)"/>
  `),

  basement: svg(`
    <polygon points="0,0 230,0 230,40 190,40 190,80 150,80 150,120 110,120 110,160 70,160 70,200 0,200" fill="#050707"/>
    <rect x="0" y="0" width="800" height="18" fill="#030404"/>
    <g stroke="#0f1517" stroke-width="10" fill="none">
      <path d="M260 30 H760 V120"/><path d="M300 30 V90 H420"/>
    </g>
    <rect x="560" y="140" width="150" height="250" rx="14" fill="#070a0b" stroke="#121a1c" stroke-width="3"/>
    <circle cx="635" cy="230" r="22" fill="#0b0f10" stroke="#1a2326" stroke-width="3"/>
    <rect x="620" y="300" width="30" height="10" fill="#3a1a0a" opacity="0.6"/>
    <rect x="120" y="290" width="260" height="14" fill="#0c1012"/>
    <rect x="135" y="304" width="12" height="100" fill="#080b0c"/><rect x="355" y="304" width="12" height="100" fill="#080b0c"/>
    <rect x="460" y="330" width="80" height="55" fill="#0a0d0e" stroke="#1b2427" stroke-width="2"/>
    <rect x="490" y="345" width="20" height="18" rx="3" fill="#2b2a24"/>
    <rect x="0" y="400" width="800" height="50" fill="#030505"/>
    <ellipse cx="420" cy="420" rx="90" ry="10" fill="#0d1416"/>
    ${watcher(90, 400, 0.85)}
  `),

  foyer: svg(`
    <rect x="290" y="80" width="220" height="320" fill="#0a0403" stroke="#2a0f0c" stroke-width="10"/>
    <rect x="310" y="100" width="180" height="140" fill="#060202"/>
    <rect x="310" y="255" width="180" height="130" fill="#060202"/>
    <path d="M330 110 q70 -40 140 0" stroke="#3a1612" stroke-width="2" fill="none"/>
    <g stroke="#6a6a66" stroke-width="5" fill="none">
      <ellipse cx="470" cy="220" rx="8" ry="5"/><ellipse cx="458" cy="232" rx="5" ry="8"/>
      <ellipse cx="446" cy="246" rx="8" ry="5"/><ellipse cx="434" cy="258" rx="5" ry="8"/>
    </g>
    <rect x="420" y="268" width="26" height="30" rx="4" fill="#5a4a22"/>
    <circle cx="470" cy="300" r="7" fill="#7a6630"/>
    <rect x="80" y="120" width="120" height="280" fill="#060303" stroke="#1f0b09" stroke-width="3"/>
    <line x1="140" y1="120" x2="140" y2="400" stroke="#1f0b09" stroke-width="2"/>
    <rect x="600" y="200" width="90" height="120" fill="#090403" stroke="#1d0a08" stroke-width="3"/>
    <rect x="0" y="400" width="800" height="50" fill="#050202"/>
    <rect x="300" y="405" width="200" height="12" fill="#1a0707"/>
    ${watcher(645, 400, 0.8)}
  `),
};

// [x%, y%] centre of each hotspot button inside the scene
export const HOTSPOT_POS = {
  nightstand:   [62, 70],
  note:         [44, 52],
  bed:          [28, 80],
  linenCloset:  [17, 58],
  portrait:     [74, 40],
  cupboards:    [24, 42],
  lockedDrawer: [54, 70],
  fridge:       [86, 56],
  workbench:    [30, 62],
  toolbox:      [64, 72],
  fumble:       [48, 58],
  frontDoor:    [50, 56],
};
