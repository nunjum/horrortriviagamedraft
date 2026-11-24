// ─────────────────────────────────────────────────────────────
//  The jump scare: her face, painted once at load, then thrown
//  at the screen with zoom, shake, slice-glitch, RGB split and
//  strobing. ~1.4 seconds. "gentle" = no strobe, no shake.
// ─────────────────────────────────────────────────────────────

const rnd = (a, b) => a + Math.random() * (b - a);

const FACES = {
  mother:  { skin: ['#cfcabb', '#948d7e', '#3a362e'], eyes: 'pin',   mouth: 'maw',  overlay: null, tears: 'blood' },
  bride:   { skin: ['#cec5a6', '#8c8060', '#342c1e'], eyes: 'milky', mouth: 'grin', overlay: 'veil', tears: 'black' },
  drowned: { skin: ['#a4b8bc', '#5e767c', '#1c2830'], eyes: 'milky', mouth: 'gape', overlay: 'wet' },
  smiler:  { skin: ['#e0d8c2', '#aa9e84', '#443c2e'], eyes: 'wide',  mouth: 'smileWide', overlay: null, bald: true, tears: 'blood' },
  girl:    { skin: ['#d0d0c8', '#8c8c84', '#2e2e28'], eyes: 'black', mouth: 'scream', overlay: null, round: true, tears: 'black' },
};

export function paintScareFace(variant = 'mother') {
  const F = FACES[variant] ?? FACES.mother;
  const W = 512, H = 640, K = 1.75;   // painted at 1.75× so it stays sharp full-screen
  const cv = document.createElement('canvas');
  cv.width = W * K; cv.height = H * K;
  const c = cv.getContext('2d');
  c.scale(K, K);
  c.lineCap = 'round';
  c.fillStyle = '#000';
  c.fillRect(0, 0, W, H);

  // hair behind the head
  c.strokeStyle = '#050404';
  for (let i = 0; i < (F.bald ? 0 : 160); i++) {
    const x = rnd(40, 470);
    c.lineWidth = rnd(2, 6);
    c.beginPath(); c.moveTo(256 + (x - 256) * 0.4, 40); c.bezierCurveTo(x, 200, x + rnd(-40, 40), 420, x + rnd(-60, 60), 640); c.stroke();
  }
  // the head: long, gaunt
  const skin = c.createRadialGradient(256, 250, 30, 256, 300, 260);
  skin.addColorStop(0, F.skin[0]); skin.addColorStop(0.45, F.skin[1]); skin.addColorStop(0.8, F.skin[2]); skin.addColorStop(1, '#0a0908');
  c.fillStyle = skin;
  const headPath = new Path2D();
  if (F.round) {
    headPath.moveTo(256, 70);
    headPath.bezierCurveTo(420, 70, 450, 230, 430, 360);
    headPath.bezierCurveTo(410, 500, 340, 590, 256, 600);
    headPath.bezierCurveTo(172, 590, 102, 500, 82, 360);
    headPath.bezierCurveTo(62, 230, 92, 70, 256, 70);
  } else {
    headPath.moveTo(256, 40);
    headPath.bezierCurveTo(400, 44, 440, 200, 420, 330);
    headPath.bezierCurveTo(400, 470, 330, 610, 256, 630);
    headPath.bezierCurveTo(182, 610, 112, 470, 92, 330);
    headPath.bezierCurveTo(72, 200, 112, 44, 256, 40);
  }
  c.fill(headPath);
  // light falling from above: a sheen on the brow, the jaw sinking into black
  const sheen = c.createRadialGradient(236, 150, 10, 236, 170, 140);
  sheen.addColorStop(0, 'rgba(255,252,240,0.28)'); sheen.addColorStop(1, 'rgba(255,252,240,0)');
  c.fillStyle = sheen; c.fillRect(80, 40, 360, 300);
  // hollow cheeks
  c.fillStyle = 'rgba(20,18,14,0.55)';
  c.beginPath(); c.ellipse(150, 400, 40, 90, 0.1, 0, 7); c.fill();
  c.beginPath(); c.ellipse(362, 400, 40, 90, -0.1, 0, 7); c.fill();
  // cracked skin
  c.strokeStyle = 'rgba(30,20,16,0.7)';
  for (let k = 0; k < 26; k++) {
    let x = rnd(130, 380), y = rnd(90, 520);
    c.lineWidth = rnd(0.8, 2);
    c.beginPath(); c.moveTo(x, y);
    for (let s = 0; s < 6; s++) { x += rnd(-14, 14); y += rnd(-4, 16); c.lineTo(x, y); }
    c.stroke();
  }
  // sockets: deep, bleeding into the skin
  const socket = (x, y, rx, ry) => {
    const g = c.createRadialGradient(x, y, 4, x, y, rx * 1.6);
    g.addColorStop(0, '#000'); g.addColorStop(0.55, '#000'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.beginPath(); c.ellipse(x, y, rx * 1.6, ry * 1.5, 0, 0, 7); c.fill();
  };
  if (F.eyes === 'wide') { socket(180, 255, 40, 40); socket(334, 250, 40, 42); }
  else { socket(180, 255, 52, 64); socket(334, 245, 48, 70); }
  if (F.eyes === 'wide') {
    // far too much white, tiny pupils fixed on you
    for (const [x, y] of [[182, 262], [332, 256]]) {
      // deep bruised sockets, then a narrow almond of yellowed white — wide open, never blinking
      const sg = c.createRadialGradient(x, y, 10, x, y, 78);
      sg.addColorStop(0, 'rgba(20,8,10,0.85)'); sg.addColorStop(1, 'rgba(20,8,10,0)');
      c.fillStyle = sg; c.beginPath(); c.ellipse(x, y + 6, 78, 60, 0, 0, 7); c.fill();
      const eye = new Path2D();
      eye.moveTo(x - 50, y + 4); eye.quadraticCurveTo(x - 6, y - 40, x + 50, y - 4); eye.quadraticCurveTo(x + 6, y + 34, x - 50, y + 4);
      const g = c.createRadialGradient(x, y, 2, x, y, 50);
      g.addColorStop(0, '#efe6cc'); g.addColorStop(0.7, '#cdbc94'); g.addColorStop(1, '#7a5040');
      c.fillStyle = g; c.fill(eye);
      c.save(); c.clip(eye);
      c.strokeStyle = 'rgba(170,20,20,0.6)'; c.lineWidth = 1.6;
      for (let k = 0; k < 12; k++) { const sx = x + (Math.random() < 0.5 ? -48 : 48), sy = y + rnd(-14, 14); c.beginPath(); c.moveTo(sx, sy); c.quadraticCurveTo((sx + x) / 2 + rnd(-8, 8), sy + rnd(-10, 10), x + (sx - x) * 0.3, y + rnd(-8, 8)); c.stroke(); }
      c.fillStyle = '#5e625a'; c.beginPath(); c.arc(x + 1, y, 15, 0, 7); c.fill();
      c.fillStyle = '#000'; c.beginPath(); c.arc(x + 1, y, 4.5, 0, 7); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(x - 5, y - 5, 2.2, 0, 7); c.fill();
      c.restore();
      c.strokeStyle = 'rgba(30,8,8,0.95)'; c.lineWidth = 3.5; c.stroke(eye);
      c.strokeStyle = 'rgba(70,30,50,0.6)'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(x - 40, y + 26); c.quadraticCurveTo(x, y + 44, x + 40, y + 22); c.stroke();
    }
    // brows lifted in delight
    c.strokeStyle = 'rgba(60,40,24,0.8)'; c.lineWidth = 6;
    c.beginPath(); c.moveTo(130, 200); c.quadraticCurveTo(180, 168, 226, 196); c.stroke();
    c.beginPath(); c.moveTo(286, 192); c.quadraticCurveTo(334, 162, 384, 196); c.stroke();
    c.strokeStyle = 'rgba(60,40,24,0.3)'; c.lineWidth = 2;
    for (let k = 0; k < 4; k++) { c.beginPath(); c.moveTo(170, 120 + k * 16); c.quadraticCurveTo(256, 108 + k * 16, 342, 120 + k * 16); c.stroke(); }
  } else if (F.eyes === 'black') {
    // entirely black, wet, a pinprick of light in each
    for (const [x, y, r] of [[182, 262, 46], [330, 256, 44]]) {
      c.fillStyle = '#000'; c.beginPath(); c.ellipse(x, y, r, r * 0.78, x < 256 ? 0.12 : -0.12, 0, 7); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.85)'; c.beginPath(); c.arc(x - r * 0.3, y - r * 0.25, 4.5, 0, 7); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.25)'; c.beginPath(); c.ellipse(x + r * 0.2, y + r * 0.3, r * 0.3, r * 0.08, 0.3, 0, 7); c.fill();
    }
  } else if (F.eyes === 'pin') {
    // pinprick eyes
    c.fillStyle = '#fff';
    c.beginPath(); c.arc(188, 262, 6, 0, 7); c.fill();
    c.beginPath(); c.arc(326, 254, 5, 0, 7); c.fill();
    c.fillStyle = 'rgba(255,40,30,0.5)';
    c.beginPath(); c.arc(188, 262, 14, 0, 7); c.fill();
    c.beginPath(); c.arc(326, 254, 12, 0, 7); c.fill();
  } else {
    // milky, blind, wide open
    for (const [x, y, r] of [[184, 258, 30], [330, 250, 28]]) {
      const g = c.createRadialGradient(x, y, 2, x, y, r);
      g.addColorStop(0, '#f4f2ea'); g.addColorStop(0.7, '#c8c6ba'); g.addColorStop(1, 'rgba(60,50,40,0)');
      c.fillStyle = g; c.beginPath(); c.ellipse(x, y, r, r * 0.8, 0, 0, 7); c.fill();
      c.fillStyle = 'rgba(120,130,130,0.45)'; c.beginPath(); c.arc(x + 2, y + 2, r * 0.35, 0, 7); c.fill();
    }
  }
  // black tears
  c.strokeStyle = 'rgba(10,0,0,0.85)';
  [[178, 320, 6], [196, 318, 3], [330, 316, 5], [346, 320, 3]].forEach(([x, y, w]) => {
    c.lineWidth = w; c.beginPath(); c.moveTo(x, y); c.bezierCurveTo(x + rnd(-8, 8), y + 80, x + rnd(-10, 10), y + 160, x + rnd(-12, 12), y + rnd(180, 300)); c.stroke();
  });
  // dead skin: mottling, bruises and veins under the surface
  c.save(); c.clip(headPath);
  for (let i = 0; i < 40; i++) {
    const x = rnd(110, 400), y = rnd(80, 600), r = rnd(14, 48);
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    const col = Math.random() < 0.5 ? '50,64,42' : '70,34,56';
    g.addColorStop(0, `rgba(${col},${rnd(0.1, 0.24)})`); g.addColorStop(1, `rgba(${col},0)`);
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
  }
  c.strokeStyle = 'rgba(40,46,80,0.32)'; c.lineWidth = 2.2;
  for (let i = 0; i < 9; i++) {
    let x = rnd(130, 380), y = rnd(80, 200);
    c.beginPath(); c.moveTo(x, y);
    for (let k = 0; k < 5; k++) { x += rnd(-14, 14); y += rnd(10, 22); c.lineTo(x, y); }
    c.stroke();
  }
  c.restore();
  // streaks running from the eyes
  if (F.tears) {
    const col = F.tears === 'blood' ? '100,4,4' : '6,3,3';
    for (const [x0, y0] of [[182, 290], [330, 284]]) {
      for (let k = 0; k < 3; k++) {
        let x = x0 + rnd(-22, 22), y = y0;
        c.strokeStyle = `rgba(${col},${rnd(0.6, 0.95)})`; c.lineWidth = rnd(3, 9);
        c.beginPath(); c.moveTo(x, y);
        const len = rnd(90, 260);
        while (y < y0 + len) { x += rnd(-4, 4); y += 12; c.lineTo(x, y); }
        c.stroke();
        c.fillStyle = `rgba(${col},0.9)`; c.beginPath(); c.arc(x, y + 3, c.lineWidth * 0.7, 0, 7); c.fill();
      }
    }
  }
  // nose: two slits
  c.fillStyle = '#000';
  c.beginPath(); c.moveTo(246, 330); c.lineTo(234, 372); c.lineTo(248, 366); c.fill();
  c.beginPath(); c.moveTo(266, 330); c.lineTo(278, 372); c.lineTo(264, 366); c.fill();
  if (F.mouth === 'maw') {
    const maw = c.createLinearGradient(0, 400, 0, 620);
    maw.addColorStop(0, '#2a0000'); maw.addColorStop(0.25, '#050000'); maw.addColorStop(1, '#000');
    c.fillStyle = maw;
    c.beginPath(); c.moveTo(170, 410); c.quadraticCurveTo(256, 380, 342, 410); c.quadraticCurveTo(360, 560, 256, 625); c.quadraticCurveTo(152, 560, 170, 410); c.fill();
    c.fillStyle = '#5a0a0a';
    c.beginPath(); c.moveTo(172, 412); c.quadraticCurveTo(256, 386, 340, 412); c.quadraticCurveTo(256, 400, 172, 420); c.fill();
    c.fillStyle = '#d8cfae';
    for (let x = 180; x < 334; x += rnd(9, 15)) {
      const top = 402 - Math.sin(((x - 170) / 172) * Math.PI) * 18;
      c.beginPath(); c.moveTo(x, top + 4); c.lineTo(x + rnd(3, 6), top + rnd(26, 52)); c.lineTo(x + rnd(7, 12), top + 6); c.fill();
    }
    for (let x = 196; x < 318; x += rnd(10, 16)) {
      const bot = 590 - Math.abs(x - 256) * 0.9;
      c.beginPath(); c.moveTo(x, bot); c.lineTo(x + rnd(3, 6), bot - rnd(20, 40)); c.lineTo(x + rnd(7, 12), bot); c.fill();
    }
  } else if (F.mouth === 'grin') {
    // a smile far too wide, lips split at the corners
    c.fillStyle = '#120404';
    c.beginPath(); c.moveTo(120, 430); c.quadraticCurveTo(256, 560, 392, 430); c.quadraticCurveTo(256, 500, 120, 430); c.fill();
    c.fillStyle = '#d2c8a2';
    for (let x = 136; x < 376; x += rnd(9, 14)) {
      const y = 438 + Math.sin(((x - 120) / 272) * Math.PI) * 50;
      if (Math.random() < 0.15) continue;   // missing teeth
      c.beginPath(); c.moveTo(x, y - 20); c.lineTo(x + rnd(3, 5), y + rnd(4, 14)); c.lineTo(x + rnd(7, 10), y - 18); c.fill();
    }
    c.strokeStyle = '#4a0808'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(120, 430); c.lineTo(84, 410); c.moveTo(392, 430); c.lineTo(428, 408); c.stroke();
  } else if (F.mouth === 'smileWide') {
    // ear to ear; every tooth showing; the cheeks bunched up into the eyes
    const m = new Path2D();
    m.moveTo(96, 380); m.quadraticCurveTo(256, 600, 416, 380); m.quadraticCurveTo(256, 470, 96, 380);
    c.fillStyle = '#100303'; c.fill(m);
    c.save(); c.clip(m);
    for (let x = 100; x < 412; x += 15) {
      const t = 1 - ((x - 256) / 160) ** 2;
      const top = 380 + t * 48, bot = 380 + t * 108;
      c.fillStyle = x % 4 ? '#e6dcbc' : '#b8a880';
      c.fillRect(x, top - 4, 13, (bot - top) * 0.48);
      c.fillRect(x + 4, top + (bot - top) * 0.55, 13, (bot - top) * 0.5);
    }
    c.fillStyle = 'rgba(80,10,10,0.5)'; c.fillRect(90, 380 + 44, 340, 10);
    c.restore();
    c.strokeStyle = '#5a1a14'; c.lineWidth = 3; c.stroke(m);
    c.strokeStyle = 'rgba(40,20,10,0.7)'; c.lineWidth = 5;
    c.beginPath(); c.moveTo(92, 384); c.quadraticCurveTo(86, 320, 128, 290); c.stroke();
    c.beginPath(); c.moveTo(420, 384); c.quadraticCurveTo(426, 320, 384, 290); c.stroke();
  } else if (F.mouth === 'scream') {
    const g = c.createLinearGradient(0, 400, 0, 580);
    g.addColorStop(0, '#2a0404'); g.addColorStop(0.3, '#050000'); g.addColorStop(1, '#000');
    c.fillStyle = g; c.beginPath(); c.ellipse(256, 480, 62, 96, 0, 0, 7); c.fill();
    c.fillStyle = '#d8d0b8';
    for (let x = 214; x < 300; x += 14) { c.beginPath(); c.moveTo(x, 392); c.lineTo(x + 6, 412); c.lineTo(x + 12, 392); c.fill(); }
  } else {
    // a drowned gape, water running out
    c.fillStyle = '#05080a';
    c.beginPath(); c.ellipse(256, 480, 52, 86, 0, 0, 7); c.fill();
    c.strokeStyle = 'rgba(140,170,180,0.6)'; c.lineWidth = 3;
    for (const x of [230, 252, 276]) { c.beginPath(); c.moveTo(x, 560); c.lineTo(x + rnd(-6, 6), 640); c.stroke(); }
  }
  // hair falling across the face
  c.strokeStyle = '#030202';
  for (let i = 0; i < (F.bald ? 0 : 70); i++) {
    const x = rnd(100, 420);
    c.lineWidth = rnd(1, 3.5);
    c.beginPath(); c.moveTo(256 + (x - 256) * 0.5, 50); c.bezierCurveTo(x - 30, 160, x + rnd(-30, 30), 300, x + rnd(-50, 50), rnd(330, 640));
    if (x > 150 && x < 360 && Math.random() < 0.6) continue;
    c.stroke();
  }
  if (F.overlay === 'veil') {
    c.fillStyle = 'rgba(236,232,220,0.28)';
    c.beginPath(); c.moveTo(256, 20); c.quadraticCurveTo(40, 200, 30, 640); c.lineTo(482, 640); c.quadraticCurveTo(472, 200, 256, 20); c.fill();
    c.strokeStyle = 'rgba(255,255,250,0.18)'; c.lineWidth = 1;
    for (let i = 0; i < 40; i++) { c.beginPath(); c.arc(rnd(60, 450), rnd(60, 620), rnd(6, 18), 0, 7); c.stroke(); }
  }
  if (F.overlay === 'wet') {
    c.strokeStyle = 'rgba(8,12,14,0.9)';
    for (let i = 0; i < 60; i++) { const x = rnd(110, 400); c.lineWidth = rnd(2, 5); c.beginPath(); c.moveTo(x, 40); c.bezierCurveTo(x + rnd(-10, 10), 200, x + rnd(-20, 20), 380, x + rnd(-10, 10), rnd(300, 560)); if (x < 180 || x > 330) c.stroke(); }
    c.fillStyle = 'rgba(30,50,60,0.35)';
    for (let i = 0; i < 14; i++) { c.beginPath(); c.ellipse(rnd(120, 390), rnd(120, 560), rnd(10, 30), rnd(8, 22), 0, 0, 7); c.fill(); }
  }
  // grain
  const img = c.getImageData(0, 0, cv.width, cv.height), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 40; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  c.putImageData(img, 0, 0);
  return cv;
}

export function playScare(canvas, face, { gentle = false, dur: total = 1450, style = 'lunge' } = {}) {
  return new Promise((resolve) => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = (canvas.width = Math.round(innerWidth * dpr)), H = (canvas.height = Math.round(innerHeight * dpr));
    const c = canvas.getContext('2d');
    const start = performance.now(), dur = total;
    const frame = (now) => {
      const t = (now - start) / dur;
      if (t >= 1) { c.fillStyle = '#000'; c.fillRect(0, 0, W, H); resolve(); return; }
      // strobe background
      const strobe = !gentle && t < 0.35 && Math.floor(t * 40) % 3 === 0;
      c.fillStyle = strobe ? (Math.random() < 0.5 ? '#fff' : '#900') : '#000';
      c.fillRect(0, 0, W, H);
      // lunge: tiny → fills the screen in 120ms → keeps pushing
      // snap: already there, filling the screen, creeping closer
      // twitch: jerks sideways, head snapping at an angle
      let lunge, rot = 0, jx = 0;
      if (style === 'snap') lunge = 1.25 + t * 0.35;
      else if (style === 'twitch') { lunge = t < 0.06 ? 0.5 + (t / 0.06) * 0.95 : 1.45 + t * 0.2; if (!gentle && Math.floor(t * 18) % 3 === 0) { rot = rnd(-0.35, 0.35); jx = rnd(-80, 80) * dpr; } }
      else lunge = t < 0.09 ? 0.35 + (t / 0.09) * 1.05 : 1.4 + (t - 0.09) * 0.5;
      const s = (H / face.height) * lunge;
      const shakeK = gentle ? 0 : (1 - t) * (style === 'snap' ? 14 : 40) * dpr;
      const fx = W / 2 - (face.width * s) / 2 + rnd(-shakeK, shakeK) + jx;
      const fy = H / 2 - (face.height * s) / 2 + rnd(-shakeK, shakeK) + (1 - lunge / 1.9) * 40;
      if (rot) { c.save(); c.translate(W / 2, H / 2); c.rotate(rot); c.translate(-W / 2, -H / 2); }
      c.globalAlpha = t > 0.85 ? (1 - t) / 0.15 : 1;
      if (!gentle) {
        // RGB split
        c.globalCompositeOperation = 'lighter';
        c.filter = 'sepia(1) saturate(8) hue-rotate(-40deg) brightness(0.6)';
        c.drawImage(face, fx - 14 * dpr, fy, face.width * s, face.height * s);
        c.filter = 'sepia(1) saturate(6) hue-rotate(150deg) brightness(0.35)';
        c.drawImage(face, fx + 12 * dpr, fy + 4, face.width * s, face.height * s);
        c.filter = 'none';
        c.globalCompositeOperation = 'source-over';
      }
      c.globalAlpha *= gentle ? 0.85 : 0.92;
      c.drawImage(face, fx, fy, face.width * s, face.height * s);
      c.globalAlpha = 1;
      if (rot) c.restore();
      // horizontal slice glitch
      if (!gentle) {
        for (let i = 0; i < 7; i++) {
          const y = Math.random() * H, h = rnd(4, 40) * dpr, off = rnd(-60, 60) * dpr;
          c.drawImage(canvas, 0, y, W, h, off, y, W, h);
        }
        if (Math.random() < 0.3) { c.fillStyle = 'rgba(160,0,0,0.35)'; c.fillRect(0, 0, W, H); }
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}
