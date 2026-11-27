/*
 * Stack-a-Castle — game script.
 *
 * Sections (search for the banner comments):
 *   helpers · procedural textures · geometry helpers · renderer + scene · pieces ·
 *   palette icons · lights · island · world state · drawing blocks · see-through blocks ·
 *   sample castle · characters · undo + save · online save (Firebase) · sound · UI · picking ·
 *   layout · loop · boot
 *
 * Saving: every change is written to this browser's localStorage. After the player signs in
 * with Google (⋯ menu), it is also saved to Firestore and synced across devices. Firebase
 * settings are in js/firebase-config.js. See docs/ARCHITECTURE.md for the save format.
 */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const failBox = $('#fail');
  function fail(msg) { failBox.querySelector('p').textContent = msg; failBox.hidden = false; }
  if (!window.THREE || !THREE.OrbitControls) {
    fail('The 3D engine could not load. Check your internet connection, then reload the page.');
    return;
  }

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const store = {
    get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } }
  };
  const SAVE_KEY = 'stack-a-castle:v1';
  const NIGHT_KEY = 'stack-a-castle:night';
  const AT_KEY = 'stack-a-castle:edited-at';
  const CHARS_KEY = 'stack-a-castle:characters';
  const SOUND_KEY = 'stack-a-castle:sound';
  const ISLAND_KEY = 'stack-a-castle:island';
  const DUG_KEY = 'stack-a-castle:dug';
  // The island is half * 2 squares wide. Every castle starts at START_HALF and can grow by GROW
  // squares on each side (⋯ → Bigger island) up to MAX_HALF. MAXY is the height limit.
  const START_HALF = 150, GROW = 50, MAX_HALF = 500, MAXY = 32; // 300 × 300, growing to 1000 × 1000
  const BASE_HALF = 50; // the island mesh is built at this size and scaled
  let half = START_HALF;

  /* ---------- helpers ---------- */
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const tmpC = new THREE.Color(), WHITE = new THREE.Color(1, 1, 1), BLACK = new THREE.Color(0, 0, 0);
  function shade(hex, amt) { tmpC.set(hex); tmpC.lerp(amt >= 0 ? WHITE : BLACK, Math.abs(amt)); return '#' + tmpC.getHexString(); }
  function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function tex(c, rx = 1, ry = 1) {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.anisotropy = 4;
    return t;
  }
  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function drawStone(g, x, y, w, h, col, rad) {
    g.fillStyle = col; rr(g, x, y, w, h, rad); g.fill();
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(255,255,255,0.26)';
    g.beginPath(); g.moveTo(x + 2, y + h - 3); g.lineTo(x + 2, y + 2); g.lineTo(x + w - 3, y + 2); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.2)';
    g.beginPath(); g.moveTo(x + w - 2, y + 3); g.lineTo(x + w - 2, y + h - 2); g.lineTo(x + 3, y + h - 2); g.stroke();
  }
  function layBricks(g, S, rows, per, base, vary, r, gap, rad) {
    const rh = S / rows, bw = S / per;
    for (let row = 0; row < rows; row++) {
      const off = (row % 2) ? bw / 2 : 0;
      for (let i = 0; i < per; i++) {
        const col = shade(base, (r() - 0.5) * vary);
        const x = i * bw + off;
        drawStone(g, x + gap / 2, row * rh + gap / 2, bw - gap, rh - gap, col, rad);
        if (x + bw > S) drawStone(g, x - S + gap / 2, row * rh + gap / 2, bw - gap, rh - gap, col, rad);
      }
    }
  }
  function speckle(g, W, H, r, n, cols) {
    for (let i = 0; i < n; i++) {
      g.globalAlpha = 0.18 + r() * 0.3;
      g.fillStyle = cols[(r() * cols.length) | 0];
      const s = 1 + r() * 1.8;
      g.fillRect(r() * W, r() * H, s, s);
    }
    g.globalAlpha = 1;
  }

  /* ---------- procedural textures ---------- */
  function stoneCanvas() {
    const S = 128, c = cv(S, S), g = c.getContext('2d'), r = rng(11);
    g.fillStyle = '#6e717c'; g.fillRect(0, 0, S, S);
    layBricks(g, S, 2, 2, '#a7aab4', 0.24, r, 5, 7);
    speckle(g, S, S, r, 700, ['#000', '#fff', '#555a66']);
    return c;
  }
  function brickCanvas() {
    const S = 128, c = cv(S, S), g = c.getContext('2d'), r = rng(23);
    g.fillStyle = '#dccbb3'; g.fillRect(0, 0, S, S);
    layBricks(g, S, 4, 2, '#bb5b3e', 0.26, r, 5, 3);
    speckle(g, S, S, r, 500, ['#000', '#fff', '#7a2c1a']);
    return c;
  }
  function woodCanvas() {
    const S = 128, c = cv(S, S), g = c.getContext('2d'), r = rng(5);
    g.fillStyle = '#4a2f1a'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 4; i++) {
      const x = i * 32;
      g.fillStyle = shade('#ad7742', (r() - 0.5) * 0.26);
      g.fillRect(x + 1.5, 0, 29, S);
      for (let k = 0; k < 5; k++) {
        g.strokeStyle = 'rgba(70,40,15,0.28)';
        g.lineWidth = 1 + r();
        g.beginPath();
        const x0 = x + 5 + r() * 21;
        for (let y = 0; y <= S; y += 8) {
          const xx = x0 + Math.sin(y * 0.049 + k * 1.7) * 2.2;
          if (y === 0) g.moveTo(xx, y); else g.lineTo(xx, y);
        }
        g.stroke();
      }
      g.fillStyle = 'rgba(255,230,190,0.18)'; g.fillRect(x + 2, 0, 2, S);
      g.fillStyle = '#3b2a1d';
      g.beginPath(); g.arc(x + 16, 11, 2.2, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(x + 16, S - 11, 2.2, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = 'rgba(40,22,10,0.35)'; g.fillRect(0, 20, S, 3); g.fillRect(0, S - 23, S, 3);
    return c;
  }
  function windowCanvases(stoneC) {
    const S = 128, c = cv(S, S), g = c.getContext('2d');
    const e = cv(S, S), h = e.getContext('2d');
    g.drawImage(stoneC, 0, 0);
    h.fillStyle = '#000'; h.fillRect(0, 0, S, S);
    const arch = (ctx, x, y, w, hh) => {
      ctx.beginPath();
      ctx.moveTo(x, y + hh); ctx.lineTo(x, y + w / 2);
      ctx.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0);
      ctx.lineTo(x + w, y + hh); ctx.closePath();
    };
    g.fillStyle = '#d3d5dc'; arch(g, 36, 20, 56, 88); g.fill();
    g.fillStyle = '#1d2943'; arch(g, 44, 28, 40, 74); g.fill();
    g.fillStyle = 'rgba(160,200,255,0.2)';
    g.beginPath(); g.moveTo(49, 98); g.lineTo(49, 52); g.lineTo(58, 42); g.lineTo(58, 98); g.closePath(); g.fill();
    g.fillStyle = '#5a3d27'; g.fillRect(62, 28, 4, 74); g.fillRect(44, 60, 40, 4);
    g.fillStyle = '#bcbfc8'; g.fillRect(32, 104, 64, 8);
    h.fillStyle = '#ffd27a'; arch(h, 44, 28, 40, 74); h.fill();
    h.fillStyle = '#000'; h.fillRect(62, 28, 4, 74); h.fillRect(44, 60, 40, 4);
    return [c, e];
  }
  function roofCanvas() {
    const S = 128, c = cv(S, S), g = c.getContext('2d'), r = rng(7);
    g.fillStyle = '#7d2420'; g.fillRect(0, 0, S, S);
    const rowH = 16, w = 16;
    for (let row = 0; row <= S / rowH; row++) {
      const off = (row % 2) * w / 2;
      for (let i = -1; i <= S / w; i++) {
        const x = i * w + off, y = row * rowH - 4;
        g.fillStyle = shade('#c8483c', (r() - 0.5) * 0.3);
        g.beginPath();
        g.moveTo(x + 1, y); g.lineTo(x + w - 1, y); g.lineTo(x + w - 1, y + rowH - w / 2 + 2);
        g.arc(x + w / 2, y + rowH - w / 2 + 2, w / 2 - 1, 0, Math.PI);
        g.closePath(); g.fill();
        g.strokeStyle = 'rgba(70,12,8,0.45)'; g.lineWidth = 1.5; g.stroke();
      }
    }
    return c;
  }
  function goldCanvas() {
    const S = 128, c = cv(S, S), g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, S, S);
    gr.addColorStop(0, '#ffe58f'); gr.addColorStop(0.5, '#f3bb30'); gr.addColorStop(1, '#c98a12');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    g.lineWidth = 5;
    g.strokeStyle = 'rgba(255,250,215,0.75)';
    g.beginPath(); g.moveTo(10, S - 12); g.lineTo(10, 10); g.lineTo(S - 12, 10); g.stroke();
    g.strokeStyle = 'rgba(120,70,0,0.45)';
    g.beginPath(); g.moveTo(S - 10, 12); g.lineTo(S - 10, S - 10); g.lineTo(12, S - 10); g.stroke();
    g.fillStyle = 'rgba(255,255,240,0.9)';
    const star = (cx, cy, R) => { g.beginPath(); g.moveTo(cx, cy - R); g.lineTo(cx + R * 0.22, cy - R * 0.22); g.lineTo(cx + R, cy); g.lineTo(cx + R * 0.22, cy + R * 0.22); g.lineTo(cx, cy + R); g.lineTo(cx - R * 0.22, cy + R * 0.22); g.lineTo(cx - R, cy); g.lineTo(cx - R * 0.22, cy - R * 0.22); g.closePath(); g.fill(); };
    star(36, 36, 13); star(92, 84, 7);
    return c;
  }
  function waterCanvas() {
    const S = 128, c = cv(S, S), g = c.getContext('2d'), r = rng(3);
    g.fillStyle = '#2f88d4'; g.fillRect(0, 0, S, S);
    for (let k = 0; k < 9; k++) {
      const y0 = k * 14 + r() * 6;
      g.strokeStyle = k % 2 ? 'rgba(255,255,255,0.3)' : 'rgba(140,215,255,0.38)';
      g.lineWidth = 2;
      g.beginPath();
      for (let x = 0; x <= S; x += 4) {
        const y = y0 + Math.sin((x / S) * Math.PI * 4 + k) * 3;
        if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }
    return c;
  }
  function grassCanvas() {
    const S = 64, c = cv(S, S), g = c.getContext('2d'), r = rng(19);
    const cols = ['#7fc55c', '#76bc53'];
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { g.fillStyle = cols[(i + j) % 2]; g.fillRect(i * 32, j * 32, 32, 32); }
    speckle(g, S, S, r, 260, ['#5a9e3d', '#9ad57a', '#4f8f35']);
    g.strokeStyle = 'rgba(30,70,20,0.07)'; g.lineWidth = 1;
    g.strokeRect(0.5, 0.5, 31, 31); g.strokeRect(32.5, 32.5, 31, 31); g.strokeRect(32.5, 0.5, 31, 31); g.strokeRect(0.5, 32.5, 31, 31);
    return c;
  }
  function dirtCanvas() {
    const W = 64, H = 64, c = cv(W, H), g = c.getContext('2d'), r = rng(29);
    g.fillStyle = '#8b5a3a'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#7b4e33'; g.fillRect(0, 30, W, 6); g.fillRect(0, 48, W, 4);
    speckle(g, W, H, r, 220, ['#5e3c27', '#a5774f', '#6e4a33']);
    g.fillStyle = '#6db24d'; g.fillRect(0, 0, W, 9);
    for (let x = 0; x < W; x += 4) g.fillRect(x, 8, 4, 2 + r() * 6);
    return c;
  }
  function flagCanvas() {
    const W = 128, H = 80, c = cv(W, H), g = c.getContext('2d');
    g.fillStyle = '#c8372d';
    g.beginPath(); g.moveTo(0, 0); g.lineTo(W, 0); g.lineTo(W - 28, H / 2); g.lineTo(W, H); g.lineTo(0, H); g.closePath(); g.fill();
    g.fillStyle = '#f0b429'; g.fillRect(0, 0, 10, H);
    const cx = 50, cy = 40, R = 17, ri = 7.2;
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? ri : R;
      const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath(); g.fill();
    return c;
  }
  function glowCanvas() {
    const S = 64, c = cv(S, S), g = c.getContext('2d');
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(255,214,130,1)');
    gr.addColorStop(0.3, 'rgba(255,170,70,0.5)');
    gr.addColorStop(1, 'rgba(255,140,40,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    return c;
  }

  function plainCanvas(base, vary, seed, dots) {
    const S = 64, c = cv(S, S), g = c.getContext('2d'), r = rng(seed);
    g.fillStyle = base; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 14; i++) {
      g.globalAlpha = 0.5;
      g.fillStyle = shade(base, (r() - 0.5) * vary);
      g.beginPath(); g.ellipse(r() * S, r() * S, 4 + r() * 8, 3 + r() * 6, r() * 3, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
    speckle(g, S, S, r, dots || 160, [shade(base, -0.35), shade(base, 0.3)]);
    return c;
  }
  function cobbleCanvas() {
    const S = 128, c = cv(S, S), g = c.getContext('2d'), r = rng(37);
    g.fillStyle = '#5e616b'; g.fillRect(0, 0, S, S);
    for (let row = 0; row < 4; row++) {
      for (let i = 0; i < 4; i++) {
        const cx = i * 32 + 16 + (row % 2) * 12 + (r() - 0.5) * 8, cy = row * 32 + 16 + (r() - 0.5) * 6;
        const rx = 12 + r() * 5, ry = 11 + r() * 4, rot = r() * 0.6, col = shade('#9a9ca5', (r() - 0.5) * 0.3);
        for (const ox of [-S, 0, S]) {
          g.fillStyle = col;
          g.beginPath(); g.ellipse(cx + ox, cy, rx, ry, rot, 0, Math.PI * 2); g.fill();
          g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 2;
          g.beginPath(); g.arc(cx + ox - 2, cy - 2, Math.min(rx, ry) - 4, Math.PI * 1.05, Math.PI * 1.6); g.stroke();
        }
      }
    }
    speckle(g, S, S, r, 500, ['#000', '#fff']);
    return c;
  }
  function barkCanvas() {
    const S = 64, c = cv(S, S), g = c.getContext('2d'), r = rng(47);
    g.fillStyle = '#6b4428'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 12; i++) { g.fillStyle = shade('#6b4428', (r() - 0.5) * 0.45); g.fillRect(r() * S, 0, 3 + r() * 5, S); }
    g.strokeStyle = 'rgba(30,15,5,0.45)'; g.lineWidth = 1.5;
    for (let i = 0; i < 8; i++) {
      const x0 = r() * S;
      g.beginPath();
      for (let y = 0; y <= S; y += 8) { const x = x0 + Math.sin(y * 0.1 + i) * 1.5; if (y === 0) g.moveTo(x, y); else g.lineTo(x, y); }
      g.stroke();
    }
    return c;
  }
  function ringsCanvas() {
    const S = 64, c = cv(S, S), g = c.getContext('2d');
    g.fillStyle = '#6b4428'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#d8b47c'; rr(g, 5, 5, 54, 54, 8); g.fill();
    g.strokeStyle = 'rgba(130,85,40,0.55)'; g.lineWidth = 1.6;
    for (let k = 1; k <= 5; k++) { g.beginPath(); g.arc(32, 32, k * 5, 0, Math.PI * 2); g.stroke(); }
    return c;
  }
  function leavesCanvas() {
    const S = 64, c = cv(S, S), g = c.getContext('2d'), r = rng(43);
    g.fillStyle = '#3f8f3a'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 46; i++) { g.fillStyle = shade('#4a9c40', (r() - 0.5) * 0.5); g.beginPath(); g.arc(r() * S, r() * S, 3 + r() * 4, 0, Math.PI * 2); g.fill(); }
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 14; i++) { g.beginPath(); g.arc(r() * S, r() * S, 2 + r() * 2.5, 0, Math.PI * 2); g.fill(); }
    g.globalCompositeOperation = 'source-over';
    return c;
  }
  function glassCanvas() {
    const S = 64, c = cv(S, S), g = c.getContext('2d');
    g.fillStyle = 'rgba(190,225,255,0.18)'; g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(235,245,255,0.95)'; g.lineWidth = 5; g.strokeRect(2.5, 2.5, S - 5, S - 5);
    g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(14, 44); g.lineTo(28, 16); g.stroke();
    g.lineWidth = 2; g.beginPath(); g.moveTo(22, 48); g.lineTo(34, 24); g.stroke();
    return c;
  }
  function iceCanvas() {
    const S = 64, c = cv(S, S), g = c.getContext('2d'), r = rng(61);
    g.fillStyle = '#9fd3ee'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 8; i++) { g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.ellipse(r() * S, r() * S, 6 + r() * 10, 3 + r() * 5, r() * 3, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 1.2;
    for (let i = 0; i < 5; i++) {
      let x = r() * S, y = r() * S;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 22; y += (r() - 0.5) * 22; g.lineTo(x, y); }
      g.stroke();
    }
    return c;
  }
  function lavaCanvas() {
    const S = 128, c = cv(S, S), g = c.getContext('2d'), r = rng(53);
    g.fillStyle = '#c8320f'; g.fillRect(0, 0, S, S);
    const cols = ['#ff7a1a', '#ffb02e', '#e8501a', '#ffd25a'];
    for (let i = 0; i < 28; i++) {
      const x = r() * S, y = r() * S, rad = 6 + r() * 12, col = cols[(r() * cols.length) | 0];
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { g.fillStyle = col; g.beginPath(); g.arc(x + ox, y + oy, rad, 0, Math.PI * 2); g.fill(); }
    }
    g.globalAlpha = 0.45;
    for (let i = 0; i < 8; i++) {
      const x = r() * S, y = r() * S, rad = 4 + r() * 6;
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { g.fillStyle = '#6e1a08'; g.beginPath(); g.arc(x + ox, y + oy, rad, 0, Math.PI * 2); g.fill(); }
    }
    g.globalAlpha = 1;
    return c;
  }
  function paintCanvas() {
    const S = 64, c = cv(S, S), g = c.getContext('2d'), r = rng(59);
    g.fillStyle = '#e8e8e8'; g.fillRect(0, 0, S, S);
    speckle(g, S, S, r, 120, ['#cfcfcf', '#ffffff']);
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.moveTo(3, S - 4); g.lineTo(3, 3); g.lineTo(S - 4, 3); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.16)'; g.beginPath(); g.moveTo(S - 3, 4); g.lineTo(S - 3, S - 3); g.lineTo(4, S - 3); g.stroke();
    return c;
  }
  function lampCanvas() {
    const S = 64, c = cv(S, S), g = c.getContext('2d'), r = rng(67);
    g.fillStyle = '#5a3d27'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      g.fillStyle = shade('#ffd36b', (r() - 0.5) * 0.3);
      g.fillRect(6 + i * 18, 6 + j * 18, 16, 16);
    }
    g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(8, 8, 6, 3); g.fillRect(26, 26, 6, 3);
    return c;
  }
  function booksCanvas() {
    const S = 128, c = cv(S, S), g = c.getContext('2d'), r = rng(71);
    const cols = ['#c8372d', '#2d4cc0', '#3d8f3a', '#f0b429', '#7b3fb0', '#e8913a', '#2c7f8f', '#efe6d2'];
    g.fillStyle = '#6b4428'; g.fillRect(0, 0, S, S);
    for (const [top, bottom] of [[9, 59], [69, 119]]) {
      g.fillStyle = '#2a1a10'; g.fillRect(8, top, S - 16, bottom - top);
      let x = 10;
      for (;;) {
        const w = 6 + Math.floor(r() * 7), h = bottom - top - 3 - Math.floor(r() * 15);
        if (x + w > S - 10) break;
        g.fillStyle = cols[(r() * cols.length) | 0]; g.fillRect(x, bottom - h, w, h);
        g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(x + 1, bottom - h, 1.5, h);
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + w - 1.5, bottom - h, 1.5, h);
        g.fillStyle = 'rgba(255,226,150,0.7)'; g.fillRect(x, bottom - h + 5, w, 2); g.fillRect(x, bottom - 9, w, 2);
        x += w + (r() < 0.18 ? 3 : 1);
      }
      g.fillStyle = '#8a5a34'; g.fillRect(4, bottom, S - 8, 7);
      g.fillStyle = 'rgba(255,225,180,0.3)'; g.fillRect(4, bottom, S - 8, 2);
    }
    g.strokeStyle = 'rgba(40,22,10,0.5)'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, S - 3, S - 3);
    return c;
  }
  function rugCanvas() {
    const S = 128, c = cv(S, S), g = c.getContext('2d');
    const diamond = (R) => { g.beginPath(); g.moveTo(64, 64 - R); g.lineTo(64 + R, 64); g.lineTo(64, 64 + R); g.lineTo(64 - R, 64); g.closePath(); g.fill(); };
    g.fillStyle = '#b8323a'; g.fillRect(0, 0, S, S);
    g.strokeStyle = '#f0b429'; g.lineWidth = 6; g.strokeRect(10, 10, S - 20, S - 20);
    g.strokeStyle = '#2d4cc0'; g.lineWidth = 4; g.strokeRect(20, 20, S - 40, S - 40);
    g.fillStyle = '#f0b429'; diamond(31);
    g.fillStyle = '#2d4cc0'; diamond(21);
    g.fillStyle = '#f4e6c8'; diamond(9);
    for (const [x, y] of [[33, 33], [95, 33], [33, 95], [95, 95]]) { g.beginPath(); g.arc(x, y, 4.5, 0, Math.PI * 2); g.fill(); }
    for (let x = 3; x < S; x += 6) { g.fillRect(x, 0, 2, 6); g.fillRect(x, S - 6, 2, 6); }
    return c;
  }
  function latticeCanvas() { // iron girders with see-through gaps (alpha), for the Eiffel Tower
    const S = 64, c = cv(S, S), g = c.getContext('2d');
    g.strokeStyle = '#6e5846'; g.lineCap = 'square';
    g.lineWidth = 7; g.strokeRect(3.5, 3.5, S - 7, S - 7);
    g.lineWidth = 4; g.beginPath(); g.moveTo(5, 5); g.lineTo(S - 5, S - 5); g.moveTo(S - 5, 5); g.lineTo(5, S - 5); g.stroke();
    g.lineWidth = 3; g.beginPath(); g.moveTo(S / 2, 5); g.lineTo(S / 2, S - 5); g.stroke();
    g.strokeStyle = 'rgba(255,230,200,0.28)'; g.lineWidth = 1.5; g.strokeRect(1.5, 1.5, S - 3, S - 3);
    g.fillStyle = '#4a3a2e';
    for (const [x, y] of [[6, 6], [S - 6, 6], [6, S - 6], [S - 6, S - 6], [S / 2, S / 2]]) { g.beginPath(); g.arc(x, y, 2, 0, Math.PI * 2); g.fill(); }
    return c;
  }
  function clockCanvases() { // a clock face (and its glow mask for night), for Big Ben
    const S = 128, c = cv(S, S), g = c.getContext('2d'), e = cv(S, S), h = e.getContext('2d');
    g.fillStyle = '#3b3328'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#d9a63a'; g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f7f1df'; g.beginPath(); g.arc(64, 64, 50, 0, Math.PI * 2); g.fill();
    h.fillStyle = '#000'; h.fillRect(0, 0, S, S);
    h.fillStyle = '#fff2c2'; h.beginPath(); h.arc(64, 64, 50, 0, Math.PI * 2); h.fill();
    for (const ctx of [g, h]) {
      ctx.save(); ctx.translate(64, 64); ctx.fillStyle = '#1f1d22';
      for (let i = 0; i < 12; i++) { ctx.save(); ctx.rotate(i * Math.PI / 6); const big = i % 3 === 0; ctx.fillRect(big ? -3 : -1.5, -46, big ? 6 : 3, big ? 12 : 8); ctx.restore(); }
      ctx.lineCap = 'round'; ctx.strokeStyle = '#1f1d22';
      ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(-2.6) * 26, Math.sin(-2.6) * 26); ctx.stroke(); // hour hand at ten
      ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(-0.52) * 38, Math.sin(-0.52) * 38); ctx.stroke(); // minute hand at two
      ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    return [c, e];
  }
  // Glass and ice side by side in one texture, so both can be drawn as one sorted mesh.
  function clearCanvas() {
    const c = cv(128, 64), g = c.getContext('2d');
    g.drawImage(glassCanvas(), 0, 0);
    g.globalAlpha = 0.82; g.drawImage(iceCanvas(), 64, 0); g.globalAlpha = 1;
    return c;
  }

  /* ---------- geometry helpers ---------- */
  function boxUV(geo) {
    const p = geo.attributes.position, n = p.count, uv = new Float32Array(n * 2);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), ab = new THREE.Vector3(), ac = new THREE.Vector3();
    for (let i = 0; i < n; i += 3) {
      a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
      ab.subVectors(b, a); ac.subVectors(c, a); ab.cross(ac);
      const ax = Math.abs(ab.x), ay = Math.abs(ab.y), az = Math.abs(ab.z);
      [a, b, c].forEach((v, k) => {
        let u, w;
        if (ay >= ax && ay >= az) { u = v.x + 0.5; w = v.z + 0.5; }
        else if (ax >= az) { u = v.z + 0.5; w = v.y + 0.5; }
        else { u = v.x + 0.5; w = v.y + 0.5; }
        uv[(i + k) * 2] = u; uv[(i + k) * 2 + 1] = w;
      });
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return geo;
  }
  function merge(list) { // joins geometries into one (keeps UVs when every part has them)
    const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
    const withUV = parts.every((g) => g.attributes.uv);
    let total = 0; parts.forEach((g) => { total += g.attributes.position.count; });
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = withUV ? new Float32Array(total * 2) : null;
    let o = 0;
    for (const g of parts) {
      pos.set(g.attributes.position.array, o * 3);
      nor.set(g.attributes.normal.array, o * 3);
      if (uv) uv.set(g.attributes.uv.array, o * 2);
      o += g.attributes.position.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    if (uv) out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return out;
  }
  function archGeometry() {
    const s = new THREE.Shape(), r = 0.27, spring = 0.02;
    s.moveTo(-0.5, -0.5); s.lineTo(-r, -0.5); s.lineTo(-r, spring);
    s.absarc(0, spring, r, Math.PI, 0, true);
    s.lineTo(r, -0.5); s.lineTo(0.5, -0.5); s.lineTo(0.5, 0.5); s.lineTo(-0.5, 0.5); s.lineTo(-0.5, -0.5);
    let geo = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false, curveSegments: 14 });
    geo.translate(0, 0, -0.5);
    if (geo.index) geo = geo.toNonIndexed();
    geo.computeVertexNormals();
    return boxUV(geo);
  }
  function battlementGeometry() {
    const parts = [new THREE.BoxGeometry(1, 0.5, 1).translate(0, -0.25, 0)];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(new THREE.BoxGeometry(0.32, 0.44, 0.32).translate(sx * 0.34, 0.22, sz * 0.34));
    return boxUV(merge(parts));
  }
  function rockGeometry() {
    const geo = new THREE.ConeGeometry(BASE_HALF + 0.6, 26, 12, 3);
    const p = geo.attributes.position, r = rng(41);
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y < -12.9) { const k = 0.9 + r() * 0.08; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); } // the top edge stays tucked under the island
      else if (y < 12.9) { p.setX(i, p.getX(i) * (0.88 + r() * 0.24)); p.setZ(i, p.getZ(i) * (0.88 + r() * 0.24)); p.setY(i, y + (r() - 0.5) * 0.8); }
    }
    geo.computeVertexNormals();
    return geo;
  }

  /* ---------- renderer + scene ---------- */
  const stage = $('#stage');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (e) {
    fail('This browser could not start 3D graphics. Try a recent version of Chrome, Safari, Edge or Firefox.');
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); // may be lowered later (see "loop")
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.appendChild(renderer.domElement);
  const canvas = renderer.domElement;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 700);
  const controls = new THREE.OrbitControls(camera, canvas);
  controls.target.set(0, 1.4, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 5;
  controls.maxDistance = 210;
  controls.maxPolarAngle = Math.PI * 0.46;
  controls.screenSpacePanning = false;
  controls.rotateSpeed = 0.8;
  controls.autoRotateSpeed = 1.1;

  /* textures + materials */
  const stoneC = stoneCanvas();
  const [winC, winE] = windowCanvases(stoneC);
  const T = {
    stone: tex(stoneC), tower: tex(stoneC, 3, 1), brick: tex(brickCanvas()), wood: tex(woodCanvas()),
    win: tex(winC), winE: tex(winE), roof: tex(roofCanvas(), 4, 2), gold: tex(goldCanvas()),
    water: tex(waterCanvas()), grass: tex(grassCanvas(), BASE_HALF, BASE_HALF), dirt: tex(dirtCanvas(), BASE_HALF, 1),
    flag: tex(flagCanvas()), glow: new THREE.CanvasTexture(glowCanvas())
  };
  const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.9, metalness: 0 }, o));
  const M = {
    stone: std({ map: T.stone }),
    tower: std({ map: T.tower }),
    brick: std({ map: T.brick, roughness: 0.85 }),
    wood: std({ map: T.wood, roughness: 0.8 }),
    winSide: std({ map: T.win, emissive: new THREE.Color('#ffc46a'), emissiveMap: T.winE, emissiveIntensity: 0 }),
    roof: std({ map: T.roof, roughness: 0.75 }),
    gold: std({ map: T.gold, roughness: 0.32, metalness: 0.35, emissive: new THREE.Color('#3a2600'), emissiveIntensity: 0.6 }),
    water: std({ map: T.water, roughness: 0.2, metalness: 0.05, emissive: new THREE.Color('#0d3a66'), emissiveIntensity: 0.35 }),
    leafA: std({ color: '#4c9e44', flatShading: true, roughness: 0.85 }),
    leafB: std({ color: '#62b552', flatShading: true, roughness: 0.85 }),
    trunk: std({ color: '#7a4f2e' }),
    pole: std({ color: '#dfe1e8', roughness: 0.5, metalness: 0.2 }),
    iron: std({ color: '#3b3d47', roughness: 0.6, metalness: 0.3 }),
    flame: new THREE.MeshBasicMaterial({ color: '#ffb547' }),
    flag: std({ map: T.flag, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 }),
    flagDepth: new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: T.flag, alphaTest: 0.5 }),
    glow: new THREE.SpriteMaterial({ map: T.glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }),
    grass: std({ map: T.grass }),
    dirt: std({ map: T.dirt }),
    rock: std({ color: '#8a6a52', flatShading: true }),
    cloud: std({ color: '#ffffff', flatShading: true, roughness: 1, emissive: new THREE.Color('#c7d6ea'), emissiveIntensity: 0.3 }),
    hit: new THREE.MeshBasicMaterial()
  };
  M.windowFaces = [M.winSide, M.winSide, M.stone, M.stone, M.winSide, M.winSide];

  /* nature + build blocks */
  Object.assign(T, {
    grassTop: tex(plainCanvas('#78c257', 0.2, 31, 220)), grassSide: tex(dirtCanvas()), dirtB: tex(plainCanvas('#8b5a3a', 0.25, 33, 200)),
    sand: tex(plainCanvas('#e2cd93', 0.14, 35, 220)), snow: tex(plainCanvas('#f1f5fb', 0.06, 39, 120)),
    cobble: tex(cobbleCanvas()), bark: tex(barkCanvas()), rings: tex(ringsCanvas()), leaves: tex(leavesCanvas()),
    glass: tex(glassCanvas()), ice: tex(iceCanvas()), lava: tex(lavaCanvas()), paint: tex(paintCanvas()), lamp: tex(lampCanvas())
  });
  M.grassTop = std({ map: T.grassTop });
  M.grassSide = std({ map: T.grassSide });
  M.dirtB = std({ map: T.dirtB });
  M.grassFaces = [M.grassSide, M.grassSide, M.grassTop, M.dirtB, M.grassSide, M.grassSide];
  M.sand = std({ map: T.sand });
  M.snow = std({ map: T.snow, roughness: 0.7 });
  M.cobble = std({ map: T.cobble });
  M.bark = std({ map: T.bark });
  M.rings = std({ map: T.rings });
  M.logFaces = [M.bark, M.bark, M.rings, M.rings, M.bark, M.bark];
  M.leaves = std({ map: T.leaves, alphaTest: 0.5, roughness: 0.85 });
  M.leavesDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: T.leaves, alphaTest: 0.5 });
  M.glass = std({ map: T.glass, transparent: true, roughness: 0.1, metalness: 0.1, depthWrite: false });
  M.ice = std({ map: T.ice, transparent: true, opacity: 0.82, roughness: 0.15 });
  M.lava = std({ map: T.lava, emissive: new THREE.Color('#ffffff'), emissiveMap: T.lava, emissiveIntensity: 0.85, roughness: 0.6 });
  M.lamp = std({ map: T.lamp, emissive: new THREE.Color('#ffc34d'), emissiveMap: T.lamp, emissiveIntensity: 0.5 });
  M.lanternCore = new THREE.MeshBasicMaterial({ color: '#ffd77a' });
  const PAINT = { red: '#d6453b', blue: '#3a6fd8', yellow: '#f2c230', green: '#4caf50', teal: '#5fae9b', white: '#f4f4f2', black: '#2b2d35' };
  for (const k in PAINT) M['paint_' + k] = std({ map: T.paint, color: new THREE.Color(PAINT[k]), roughness: 0.8 });

  /* furniture */
  T.books = tex(booksCanvas()); T.rug = tex(rugCanvas());
  T.clear = tex(clearCanvas());
  T.clear.wrapS = T.clear.wrapT = THREE.ClampToEdgeWrapping;
  Object.assign(M, {
    books: std({ map: T.books }),
    rug: std({ map: T.rug, roughness: 1 }),
    rugEdge: std({ color: '#9a2a31', roughness: 1 }),
    trim: std({ color: '#f2c14e', roughness: 0.35, metalness: 0.25 }),
    velvet: std({ color: '#b3262e', roughness: 0.95 }),
    linen: std({ color: '#f4f1ea', roughness: 0.95 }),
    blanket: std({ color: '#3a6fd8', roughness: 0.95 }),
    gem: std({ color: '#3a6fd8', roughness: 0.2, metalness: 0.3, emissive: new THREE.Color('#1a3a9a'), emissiveIntensity: 0.4 }),
    pot: std({ color: '#c56a3c', roughness: 0.9 }),
    soil: std({ color: '#5a3a24' }),
    petalA: std({ color: '#f27fa0', roughness: 0.8 }),
    petalB: std({ color: '#f5c518', roughness: 0.8 }),
    petalC: std({ color: '#9b6fd8', roughness: 0.8 }),
    candle: std({ color: '#f6efdc', roughness: 0.7 }),
    soot: new THREE.MeshBasicMaterial({ color: '#1f1a17' }),
    flameCore: new THREE.MeshBasicMaterial({ color: '#ffe7a3' }),
    clear: std({ map: T.clear, transparent: true, depthWrite: false, roughness: 0.12, metalness: 0.08 })
  });
  M.bookshelfFaces = [M.wood, M.wood, M.wood, M.wood, M.books, M.books];
  M.rugFaces = [M.rugEdge, M.rugEdge, M.rug, M.rugEdge, M.rugEdge, M.rugEdge];
  M.barrelFaces = [M.wood, M.rings, M.rings];

  /* blocks for landmarks */
  const [clockC, clockE] = clockCanvases();
  T.lattice = tex(latticeCanvas()); T.clock = tex(clockC); T.clockE = tex(clockE);
  M.lattice = std({ map: T.lattice, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.55, metalness: 0.3 });
  M.latticeDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: T.lattice, alphaTest: 0.5 });
  M.clock = std({ map: T.clock, emissive: new THREE.Color('#ffe9a8'), emissiveMap: T.clockE, emissiveIntensity: 0, roughness: 0.6 });
  M.clockFaces = [M.clock, M.clock, M.gold, M.gold, M.clock, M.clock];

  const G = {
    box: new THREE.BoxGeometry(1, 1, 1),
    arch: archGeometry(),
    battlement: battlementGeometry(),
    cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 20, 1),
    cone: new THREE.ConeGeometry(0.64, 1.3, 12, 1).translate(0, 0.15, 0),
    water: new THREE.BoxGeometry(1, 0.82, 1).translate(0, -0.09, 0),
    trunk: new THREE.CylinderGeometry(0.09, 0.12, 0.5, 7).translate(0, -0.25, 0),
    leafA: new THREE.DodecahedronGeometry(0.42).translate(0, 0.16, 0),
    leafB: new THREE.DodecahedronGeometry(0.27).translate(0.1, 0.5, -0.05),
    pole: new THREE.CylinderGeometry(0.03, 0.035, 1.5, 8).translate(0, 0.25, 0),
    ball: new THREE.SphereGeometry(0.065, 10, 8).translate(0, 1.03, 0),
    flag: new THREE.PlaneGeometry(0.7, 0.42, 14, 4).translate(0.385, 0, 0),
    post: new THREE.BoxGeometry(0.12, 0.72, 0.12).translate(0, -0.14, 0),
    bowl: new THREE.CylinderGeometry(0.13, 0.07, 0.1, 10).translate(0, 0.27, 0),
    flame: new THREE.ConeGeometry(0.085, 0.26, 8).translate(0, 0.13, 0),
    puff: new THREE.IcosahedronGeometry(1, 1)
  };
  const flagBase = G.flag.attributes.position.array.slice();
  const Box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  Object.assign(G, {
    slab: boxUV(merge([Box(1, 0.5, 1).translate(0, -0.25, 0)])),
    stairs: boxUV(merge([Box(1, 0.5, 1).translate(0, -0.25, 0), Box(1, 0.5, 0.5).translate(0, 0.25, -0.25)])),
    fence: boxUV(merge([Box(0.2, 1, 0.2), Box(1, 0.12, 0.09).translate(0, 0.22, 0), Box(1, 0.12, 0.09).translate(0, -0.16, 0)])),
    door: boxUV(merge([Box(0.86, 0.98, 0.1).translate(0, -0.01, 0), Box(0.94, 0.08, 0.14).translate(0, 0.25, 0), Box(0.94, 0.08, 0.14).translate(0, -0.28, 0)])),
    knob: merge([new THREE.SphereGeometry(0.05, 8, 6).translate(0.3, 0, 0.09), new THREE.SphereGeometry(0.05, 8, 6).translate(0.3, 0, -0.09)]),
    lanternFrame: merge([
      Box(0.34, 0.06, 0.34).translate(0, -0.47, 0),
      Box(0.3, 0.06, 0.3).translate(0, -0.07, 0),
      new THREE.ConeGeometry(0.21, 0.12, 4).rotateY(Math.PI / 4).translate(0, 0.02, 0),
      Box(0.04, 0.38, 0.04).translate(0.14, -0.26, 0.14), Box(0.04, 0.38, 0.04).translate(-0.14, -0.26, 0.14),
      Box(0.04, 0.38, 0.04).translate(0.14, -0.26, -0.14), Box(0.04, 0.38, 0.04).translate(-0.14, -0.26, -0.14)
    ]),
    lanternCore: Box(0.2, 0.3, 0.2).translate(0, -0.27, 0)
  });

  /* furniture shapes: each fits in one square, front facing +z (turned toward the player when placed) */
  const corners = (d) => [[d, d], [d, -d], [-d, d], [-d, -d]];
  const Cyl = (rt, rb, h, seg) => new THREE.CylinderGeometry(rt, rb, h, seg || 12);
  const Sph = (r, s) => new THREE.SphereGeometry(r, s || 10, Math.max(6, (s || 10) - 2));
  const halfCyl = (r, len) => new THREE.CylinderGeometry(r, r, len, 14, 1, false, 0, Math.PI).rotateZ(Math.PI / 2); // lid shape, flat side down
  Object.assign(G, {
    table: boxUV(merge([Box(1, 0.07, 1).translate(0, 0.015, 0)].concat(corners(0.4).map(([x, z]) => Box(0.08, 0.48, 0.08).translate(x, -0.26, z))))),
    chair: boxUV(merge(corners(0.22).map(([x, z]) => Box(0.06, 0.3, 0.06).translate(x, -0.35, z)).concat([
      Box(0.54, 0.06, 0.54).translate(0, -0.17, 0),
      Box(0.06, 0.56, 0.06).translate(0.22, 0.14, -0.22), Box(0.06, 0.56, 0.06).translate(-0.22, 0.14, -0.22),
      Box(0.5, 0.12, 0.05).translate(0, 0.34, -0.22), Box(0.5, 0.06, 0.05).translate(0, 0.12, -0.22)
    ]))),
    cushion: Box(0.46, 0.04, 0.46).translate(0, -0.12, 0.01),
    bench: boxUV(merge([Box(0.94, 0.07, 0.38).translate(0, -0.165, 0), Box(0.08, 0.3, 0.32).translate(0.34, -0.35, 0), Box(0.08, 0.3, 0.32).translate(-0.34, -0.35, 0)])),
    bedFrame: boxUV(merge(corners(0.39).map(([x, z]) => Box(0.08, 0.12, 0.08).translate(x, -0.44, z * 1.1)).concat([
      Box(0.86, 0.12, 0.98).translate(0, -0.32, 0),
      Box(0.92, 0.66, 0.08).translate(0, -0.17, -0.46),
      Box(0.92, 0.36, 0.07).translate(0, -0.32, 0.465)
    ]))),
    bedLinen: merge([Box(0.8, 0.12, 0.86).translate(0, -0.2, -0.02), Box(0.845, 0.066, 0.07).translate(0, -0.118, -0.14), Sph(1, 12).scale(0.28, 0.065, 0.13).translate(0, -0.085, -0.3)]),
    blanket: Box(0.84, 0.06, 0.58).translate(0, -0.12, 0.14),
    throne: merge([
      Box(0.78, 0.34, 0.66).translate(0, -0.33, 0), Box(0.78, 0.92, 0.12).translate(0, 0.3, -0.27),
      Box(0.1, 0.2, 0.6).translate(0.39, -0.06, 0.02), Box(0.1, 0.2, 0.6).translate(-0.39, -0.06, 0.02),
      Sph(0.06).translate(0.33, 0.8, -0.27), Sph(0.06).translate(-0.33, 0.8, -0.27),
      new THREE.ConeGeometry(0.12, 0.24, 4).rotateY(Math.PI / 4).translate(0, 0.88, -0.27)
    ]),
    throneCushion: merge([Box(0.62, 0.08, 0.54).translate(0, -0.12, 0.04), Box(0.56, 0.62, 0.03).translate(0, 0.28, -0.2)]),
    gem: Sph(0.05).translate(0, 0.67, -0.205),
    chestBody: Box(0.8, 0.4, 0.56).translate(0, -0.3, 0),
    chestLid: halfCyl(0.28, 0.8).translate(0, -0.1, 0),
    chestTrim: merge([
      Box(0.07, 0.41, 0.575).translate(0.26, -0.3, 0), Box(0.07, 0.41, 0.575).translate(-0.26, -0.3, 0),
      halfCyl(0.29, 0.07).translate(0.26, -0.1, 0), halfCyl(0.29, 0.07).translate(-0.26, -0.1, 0),
      Box(0.13, 0.15, 0.04).translate(0, -0.12, 0.29)
    ]),
    keyhole: Box(0.03, 0.06, 0.02).translate(0, -0.135, 0.31),
    barrel: new THREE.LatheGeometry([[0.29, -0.5], [0.34, -0.32], [0.36, -0.1], [0.34, 0.12], [0.29, 0.3]].map(([x, y]) => new THREE.Vector2(x, y)), 18),
    barrelTop: Cyl(0.29, 0.29, 0.02, 18).translate(0, 0.29, 0),
    hoops: merge([new THREE.CylinderGeometry(0.352, 0.352, 0.05, 18, 1, true).translate(0, -0.3, 0), new THREE.CylinderGeometry(0.352, 0.352, 0.05, 18, 1, true).translate(0, 0.1, 0)]),
    hearth: boxUV(merge([
      Box(1, 1, 0.3).translate(0, 0, -0.35), Box(0.22, 1, 0.7).translate(0.39, 0, 0.15), Box(0.22, 1, 0.7).translate(-0.39, 0, 0.15),
      Box(0.56, 0.3, 0.7).translate(0, 0.35, 0.15), Box(0.56, 0.05, 0.7).translate(0, -0.475, 0.15)
    ])),
    mantel: boxUV(merge([Box(1.08, 0.08, 0.22).translate(0, 0.16, 0.45)])),
    soot: merge([Box(0.56, 0.65, 0.02).translate(0, -0.125, -0.19), Box(0.02, 0.65, 0.66).translate(0.27, -0.125, 0.14),
      Box(0.02, 0.65, 0.66).translate(-0.27, -0.125, 0.14), Box(0.56, 0.02, 0.66).translate(0, 0.19, 0.14), Box(0.54, 0.01, 0.66).translate(0, -0.445, 0.14)]),
    logs: merge([Cyl(0.05, 0.05, 0.42, 8).rotateZ(Math.PI / 2).translate(0, -0.4, 0.1), Cyl(0.045, 0.045, 0.4, 8).rotateZ(Math.PI / 2).rotateY(0.6).translate(0, -0.36, 0.13)]),
    fireBig: new THREE.ConeGeometry(0.13, 0.38, 8).translate(0, 0.19, 0),
    fireSmall: new THREE.ConeGeometry(0.07, 0.22, 8).translate(0, 0.11, 0),
    dish: merge([Cyl(0.15, 0.17, 0.03, 14).translate(0, -0.485, 0), Cyl(0.03, 0.05, 0.05, 8).translate(0, -0.445, 0)]),
    wax: merge([Cyl(0.035, 0.035, 0.26, 10).translate(0, -0.34, 0), Cyl(0.03, 0.03, 0.18, 10).translate(0.09, -0.38, 0.05), Cyl(0.03, 0.03, 0.14, 10).translate(-0.085, -0.4, 0.05)]),
    tinyFlame: new THREE.ConeGeometry(0.024, 0.075, 6).translate(0, 0.0375, 0),
    pot: merge([Cyl(0.13, 0.095, 0.2).translate(0, -0.4, 0), Cyl(0.15, 0.15, 0.045).translate(0, -0.31, 0)]),
    soil: Cyl(0.128, 0.128, 0.02).translate(0, -0.29, 0),
    sprigs: merge([[0.07, 0.04, 0.3], [-0.075, -0.01, -0.3], [0, -0.075, 0]].map(([x, z, lean]) => Cyl(0.012, 0.012, 0.24, 5).rotateZ(-lean).rotateX(z * 3).translate(x / 2, -0.17, z / 2))
      .concat([[0.06, -0.24, 0.05, 0.6], [-0.07, -0.22, -0.02, -0.6], [0.02, -0.25, -0.07, 2.2], [-0.03, -0.2, 0.07, 3.6]].map(([x, y, z, a]) => Sph(1, 8).scale(0.055, 0.016, 0.028).rotateY(a).translate(x, y, z)))),
    bloomA: merge([Sph(0.05).scale(1, 0.6, 1).translate(0.075, -0.05, 0.045), Sph(0.022).translate(0.075, -0.025, 0.045)]),
    bloomB: merge([Sph(0.05).scale(1, 0.6, 1).translate(-0.08, -0.07, -0.03), Sph(0.022).translate(-0.08, -0.045, -0.03)]),
    bloomC: merge([Sph(0.05).scale(1, 0.6, 1).translate(0, -0.03, -0.075), Sph(0.022).translate(0, -0.005, -0.075)]),
    rug: Box(0.98, 0.025, 0.98).translate(0, -0.4875, 0)
  });

  /* ---------- pieces ---------- */
  const PIECES = [
    { id: 'stone', name: 'Stone', swatch: '#a7aab4', cat: 'castle' },
    { id: 'brick', name: 'Brick', swatch: '#bb5b3e', cat: 'castle' },
    { id: 'window', name: 'Window', swatch: '#1d2943', cat: 'castle' },
    { id: 'gate', name: 'Gate', swatch: '#8d9099', cat: 'castle' },
    { id: 'battlement', name: 'Battlement', swatch: '#a7aab4', cat: 'castle' },
    { id: 'tower', name: 'Tower', swatch: '#9a9da7', cat: 'castle' },
    { id: 'roof', name: 'Roof', swatch: '#c8483c', cat: 'castle' },
    { id: 'flag', name: 'Flag', swatch: '#c8372d', cat: 'castle' },
    { id: 'torch', name: 'Torch', swatch: '#ffb547', cat: 'castle' },
    { id: 'gold', name: 'Gold', swatch: '#f3bb30', cat: 'castle' },
    { id: 'grass', name: 'Grass', swatch: '#78c257', cat: 'nature' },
    { id: 'dirt', name: 'Dirt', swatch: '#8b5a3a', cat: 'nature' },
    { id: 'sand', name: 'Sand', swatch: '#e2cd93', cat: 'nature' },
    { id: 'cobble', name: 'Cobblestone', swatch: '#9a9ca5', cat: 'nature' },
    { id: 'water', name: 'Water', swatch: '#2f88d4', cat: 'nature' },
    { id: 'tree', name: 'Tree', swatch: '#4c9e44', cat: 'nature' },
    { id: 'log', name: 'Log', swatch: '#6b4428', cat: 'nature' },
    { id: 'leaves', name: 'Leaves', swatch: '#3f8f3a', cat: 'nature' },
    { id: 'snow', name: 'Snow', swatch: '#f1f5fb', cat: 'nature' },
    { id: 'ice', name: 'Ice', swatch: '#9fd3ee', cat: 'nature' },
    { id: 'lava', name: 'Lava', swatch: '#ff7a1a', cat: 'nature' },
    { id: 'wood', name: 'Wood', swatch: '#ad7742', cat: 'build' },
    { id: 'glass', name: 'Glass', swatch: '#cfe8ff', cat: 'build' },
    { id: 'slab', name: 'Slab', swatch: '#a7aab4', cat: 'build' },
    { id: 'stairs', name: 'Stairs', swatch: '#a7aab4', cat: 'build' },
    { id: 'fence', name: 'Fence', swatch: '#ad7742', cat: 'build' },
    { id: 'door', name: 'Door', swatch: '#ad7742', cat: 'build' },
    { id: 'lamp', name: 'Lamp', swatch: '#ffd36b', cat: 'build' },
    { id: 'lantern', name: 'Lantern', swatch: '#3b3d47', cat: 'build' },
    { id: 'red', name: 'Red', swatch: '#d6453b', cat: 'build' },
    { id: 'blue', name: 'Blue', swatch: '#3a6fd8', cat: 'build' },
    { id: 'yellow', name: 'Yellow', swatch: '#f2c230', cat: 'build' },
    { id: 'green', name: 'Green', swatch: '#4caf50', cat: 'build' },
    { id: 'teal', name: 'Teal', swatch: '#5fae9b', cat: 'build' },
    { id: 'white', name: 'White', swatch: '#f4f4f2', cat: 'build' },
    { id: 'black', name: 'Black', swatch: '#2b2d35', cat: 'build' },
    { id: 'iron', name: 'Iron', swatch: '#6e5846', cat: 'build' },
    { id: 'clock', name: 'Clock', swatch: '#f7f1df', cat: 'build' },
    { id: 'table', name: 'Table', swatch: '#ad7742', cat: 'furniture' },
    { id: 'chair', name: 'Chair', swatch: '#ad7742', cat: 'furniture' },
    { id: 'bed', name: 'Bed', swatch: '#3a6fd8', cat: 'furniture' },
    { id: 'bookshelf', name: 'Bookshelf', swatch: '#6b4428', cat: 'furniture' },
    { id: 'fireplace', name: 'Fireplace', swatch: '#ff7a1a', cat: 'furniture' },
    { id: 'candles', name: 'Candles', swatch: '#f6efdc', cat: 'furniture' },
    { id: 'throne', name: 'Throne', swatch: '#e9b43c', cat: 'furniture' },
    { id: 'chest', name: 'Chest', swatch: '#ad7742', cat: 'furniture' },
    { id: 'rug', name: 'Rug', swatch: '#b8323a', cat: 'furniture' },
    { id: 'flowers', name: 'Flowers', swatch: '#f27fa0', cat: 'furniture' },
    { id: 'bench', name: 'Bench', swatch: '#ad7742', cat: 'furniture' },
    { id: 'barrel', name: 'Barrel', swatch: '#ad7742', cat: 'furniture' },
    { id: 'knight', name: 'Knight', swatch: '#c9ced8', cat: 'characters' },
    { id: 'queen', name: 'Queen', swatch: '#7b3fb0', cat: 'characters' },
    { id: 'sheep', name: 'Sheep', swatch: '#f7f5ef', cat: 'characters' },
    { id: 'chicken', name: 'Chicken', swatch: '#fbfbf8', cat: 'characters' },
    { id: 'cat', name: 'Cat', swatch: '#e8913a', cat: 'characters' },
    { id: 'dragon', name: 'Dragon', swatch: '#3fae8c', cat: 'characters' }
  ];
  const PIECE = Object.fromEntries(PIECES.map((p) => [p.id, p]));
  // How pieces turn when placed: FACE4 pieces turn their front toward the player (4 ways),
  // FACE2 pieces line up across the view (2 ways). Everything else never turns.
  const FACE4 = new Set(['stairs', 'bed', 'chair', 'bench', 'throne', 'bookshelf', 'chest', 'fireplace']);
  const FACE2 = new Set(['gate', 'fence', 'door']);
  function pieceYaw(id, r) { return FACE4.has(id) ? (r || 0) * Math.PI / 2 : (FACE2.has(id) && r ? Math.PI / 2 : 0); }
  // Top surface height of low pieces (1 = a full block). Characters stand at this height, and
  // small things placed on top (RESTS: candles, flowers, rug) sit down onto it.
  const TOP = { slab: 0.5, stairs: 0.5, table: 0.55, bed: 0.41, chest: 0.68, barrel: 0.8, bench: 0.37, chair: 0.36, rug: 0.025 };
  const RESTS = new Set(['candles', 'flowers', 'rug']);

  function mk(geo, mat, shadow = true) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow; m.receiveShadow = true;
    return m;
  }
  function flame(geo, mat, x, y, z) { const f = new THREE.Mesh(geo, mat); f.position.set(x, y, z); return f; }
  function glowAt(x, y, z, s) { const gl = new THREE.Sprite(M.glow); gl.position.set(x, y, z); gl.scale.setScalar(s); return gl; }
  function makePiece(id, rot) {
    let o;
    switch (id) {
      case 'stone': o = mk(G.box, M.stone); break;
      case 'brick': o = mk(G.box, M.brick); break;
      case 'wood': o = mk(G.box, M.wood); break;
      case 'window': o = mk(G.box, M.windowFaces); break;
      case 'gate': o = mk(G.arch, M.stone); break;
      case 'battlement': o = mk(G.battlement, M.stone); break;
      case 'tower': o = mk(G.cyl, M.tower); break;
      case 'roof': o = mk(G.cone, M.roof); break;
      case 'gold': o = mk(G.box, M.gold); break;
      case 'water': o = mk(G.water, M.water, false); break;
      case 'tree':
        o = new THREE.Group();
        o.add(mk(G.trunk, M.trunk), mk(G.leafA, M.leafA), mk(G.leafB, M.leafB));
        break;
      case 'flag': {
        o = new THREE.Group();
        const f = mk(G.flag, M.flag);
        f.customDepthMaterial = M.flagDepth;
        f.position.y = 0.77;
        o.add(mk(G.pole, M.pole), mk(G.ball, M.gold), f);
        break;
      }
      case 'torch': {
        o = new THREE.Group();
        const fl = new THREE.Mesh(G.flame, M.flame);
        fl.position.y = 0.3;
        const gl = new THREE.Sprite(M.glow);
        gl.position.y = 0.42; gl.scale.setScalar(1.4);
        o.add(mk(G.post, M.wood), mk(G.bowl, M.iron), fl, gl);
        o.userData.flicker = { flames: [fl], glow: gl, size: 1.4, phase: Math.random() * 10 };
        break;
      }
      case 'grass': o = mk(G.box, M.grassFaces); break;
      case 'dirt': o = mk(G.box, M.dirtB); break;
      case 'sand': o = mk(G.box, M.sand); break;
      case 'cobble': o = mk(G.box, M.cobble); break;
      case 'snow': o = mk(G.box, M.snow); break;
      case 'ice': o = mk(G.box, M.ice, false); break;
      case 'lava': o = mk(G.box, M.lava, false); break;
      case 'log': o = mk(G.box, M.logFaces); break;
      case 'leaves': o = mk(G.box, M.leaves); o.customDepthMaterial = M.leavesDepth; break;
      case 'glass': o = mk(G.box, M.glass, false); break;
      case 'slab': o = mk(G.slab, M.stone); break;
      case 'stairs': o = mk(G.stairs, M.stone); break;
      case 'fence': o = mk(G.fence, M.wood); break;
      case 'door':
        o = new THREE.Group();
        o.add(mk(G.door, M.wood), mk(G.knob, M.iron));
        break;
      case 'lamp': {
        o = new THREE.Group();
        const gl = new THREE.Sprite(M.glow); gl.scale.setScalar(2.6);
        o.add(mk(G.box, M.lamp), gl);
        break;
      }
      case 'lantern': {
        o = new THREE.Group();
        const gl = new THREE.Sprite(M.glow); gl.position.y = -0.27; gl.scale.setScalar(1.7);
        o.add(mk(G.lanternFrame, M.iron), mk(G.lanternCore, M.lanternCore, false), gl);
        break;
      }
      case 'table': o = mk(G.table, M.wood); break;
      case 'chair': o = new THREE.Group(); o.add(mk(G.chair, M.wood), mk(G.cushion, M.velvet)); break;
      case 'bench': o = mk(G.bench, M.wood); break;
      case 'bed': o = new THREE.Group(); o.add(mk(G.bedFrame, M.wood), mk(G.bedLinen, M.linen), mk(G.blanket, M.blanket)); break;
      case 'throne': o = new THREE.Group(); o.add(mk(G.throne, M.trim), mk(G.throneCushion, M.velvet), mk(G.gem, M.gem)); break;
      case 'bookshelf': o = mk(G.box, M.bookshelfFaces); break;
      case 'iron': o = mk(G.box, M.lattice); o.customDepthMaterial = M.latticeDepth; break;
      case 'clock': o = mk(G.box, M.clockFaces); break;
      case 'chest': o = new THREE.Group(); o.add(mk(G.chestBody, M.wood), mk(G.chestLid, M.wood), mk(G.chestTrim, M.trim), mk(G.keyhole, M.soot, false)); break;
      case 'barrel': o = new THREE.Group(); o.add(mk(G.barrel, M.wood), mk(G.barrelTop, M.barrelFaces), mk(G.hoops, M.iron)); break;
      case 'rug': o = mk(G.rug, M.rugFaces, false); break;
      case 'flowers':
        o = new THREE.Group();
        o.add(mk(G.pot, M.pot), mk(G.soil, M.soil, false), mk(G.sprigs, M.leafB), mk(G.bloomA, M.petalA), mk(G.bloomB, M.petalB), mk(G.bloomC, M.petalC));
        break;
      case 'fireplace': {
        o = new THREE.Group();
        const fl = [flame(G.fireBig, M.flame, 0, -0.44, 0.1), flame(G.fireSmall, M.flame, 0.11, -0.44, 0.14), flame(G.fireSmall, M.flame, -0.11, -0.44, 0.12), flame(G.fireSmall, M.flameCore, 0, -0.44, 0.17)];
        const gl = glowAt(0, -0.22, 0.3, 1.9);
        o.add(mk(G.hearth, M.stone), mk(G.mantel, M.wood), mk(G.soot, M.soot, false), mk(G.logs, M.trunk), gl);
        fl.forEach((f) => o.add(f));
        o.userData.flicker = { flames: fl, glow: gl, size: 1.9, phase: Math.random() * 10 };
        break;
      }
      case 'candles': {
        o = new THREE.Group();
        const fl = [flame(G.tinyFlame, M.flame, 0, -0.21, 0), flame(G.tinyFlame, M.flame, 0.09, -0.29, 0.05), flame(G.tinyFlame, M.flame, -0.085, -0.33, 0.05)];
        const gl = glowAt(0, -0.2, 0, 1.1);
        o.add(mk(G.dish, M.trim), mk(G.wax, M.candle), gl);
        fl.forEach((f) => o.add(f));
        o.userData.flicker = { flames: fl, glow: gl, size: 1.1, phase: Math.random() * 10 };
        break;
      }
      default:
        if (CHAR_SET.has(id)) return makeCharacter(id);
        o = mk(G.box, PAINT[id] ? M['paint_' + id] : M.stone);
    }
    o.rotation.y = pieceYaw(id, rot);
    return o;
  }

  /* ---------- palette icons (rendered once) ---------- */
  const ICON_VIEW = {
    flag: { y: 0.28, d: 4.1 }, roof: { y: 0.12, d: 3.6 }, tree: { y: 0.06, d: 3.0 },
    torch: { y: -0.02, d: 2.7 }, water: { y: -0.08, d: 3.4 },
    slab: { y: -0.22, d: 3.3 }, lantern: { y: -0.24, d: 2.0 }, fence: { y: 0, d: 3.5 },
    knight: { y: 0.44, d: 2.4 }, queen: { y: 0.46, d: 2.4 }, sheep: { y: 0.3, d: 2.1 },
    chicken: { y: 0.25, d: 1.5 }, cat: { y: 0.24, d: 1.6 }, dragon: { y: 0.62, d: 3.4 },
    table: { y: -0.1, d: 3.3 }, chair: { y: -0.02, d: 3.0 }, bed: { y: -0.16, d: 3.0 }, throne: { y: 0.16, d: 4.0 },
    chest: { y: -0.18, d: 2.6 }, barrel: { y: -0.1, d: 2.9 }, candles: { y: -0.3, d: 1.5 }, flowers: { y: -0.27, d: 1.5 },
    rug: { y: -0.45, d: 2.9 }, bench: { y: -0.2, d: 2.9 }
  };
  function shovelIcon() { // the Dig tool: a shovel over a hole in the grass
    const S = 112, c = cv(S, S), g = c.getContext('2d');
    g.fillStyle = '#6db24d'; g.beginPath(); g.ellipse(56, 82, 46, 20, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#5a3a24'; g.beginPath(); g.ellipse(56, 84, 26, 10, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#3b2616'; g.beginPath(); g.ellipse(56, 86, 18, 6, 0, 0, Math.PI * 2); g.fill();
    g.save(); g.translate(60, 52); g.rotate(-0.55);
    g.fillStyle = '#9a6a3a'; g.fillRect(-4, -46, 8, 50); // handle
    g.fillStyle = '#6b4428'; g.fillRect(-12, -52, 24, 8);
    g.fillStyle = '#aeb3bd'; g.beginPath(); g.moveTo(-13, 2); g.lineTo(13, 2); g.lineTo(11, 22); g.quadraticCurveTo(0, 34, -11, 22); g.closePath(); g.fill(); // blade
    g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(-9, 5, 4, 14);
    g.restore();
    return c;
  }
  function previewBlocks(list) { // a list of blocks as one InstancedMesh per piece part (for icons)
    const g = new THREE.Group(), byId = new Map(), m4 = new THREE.Matrix4(), m5 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    for (const e of list) { if (!byId.has(e[3])) byId.set(e[3], []); byId.get(e[3]).push(e); }
    for (const [id, cells] of byId) {
      const tpl = makePiece(id, 0);
      tpl.updateMatrixWorld(true);
      tpl.traverse((m) => {
        if (!m.isMesh) return;
        const im = new THREE.InstancedMesh(m.geometry, m.material, cells.length);
        cells.forEach((e, i) => {
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), pieceYaw(id, e[4]));
          m4.compose(v.set(e[0] + 0.5, e[1] + 0.5, e[2] + 0.5), q, one);
          im.setMatrixAt(i, m5.multiplyMatrices(m4, m.matrixWorld));
        });
        im.frustumCulled = false;
        g.add(im);
      });
    }
    return g;
  }
  function makeIcons() {
    const icons = {};
    let r2;
    try { r2 = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); }
    catch (e) { return icons; }
    const S = 112;
    r2.setPixelRatio(1); r2.setSize(S, S); r2.setClearColor(0x000000, 0);
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight(0xeef6ff, 0x7a8a6a, 0.75));
    const dl = new THREE.DirectionalLight(0xfff4e0, 0.8); dl.position.set(3, 5, 4); sc.add(dl);
    sc.add(new THREE.AmbientLight(0xffffff, 0.12));
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    const dir = new THREE.Vector3(1, 0.8, 1.25).normalize();
    for (const p of TILES) {
      if (p.tool) { icons[p.id] = shovelIcon().toDataURL('image/png'); continue; }
      const obj = p.landmark ? previewBlocks(p.landmark.blocks) : makePiece(p.id, 0);
      sc.add(obj);
      if (p.landmark) { // frame the whole landmark
        const l = p.landmark, c = new THREE.Vector3((l.min[0] + l.max[0] + 1) / 2, (l.max[1] + 1) / 2, (l.min[2] + l.max[2] + 1) / 2);
        const rad = 0.5 * Math.hypot(l.max[0] - l.min[0] + 1, l.max[1] + 1, l.max[2] - l.min[2] + 1);
        cam.position.copy(dir).multiplyScalar(rad * 3.7).add(c);
        cam.far = rad * 10; cam.updateProjectionMatrix();
        cam.lookAt(c);
      } else {
        const v = ICON_VIEW[p.id] || { y: 0, d: 3.6 };
        cam.position.copy(dir).multiplyScalar(v.d); cam.position.y += v.y;
        cam.far = 50; cam.updateProjectionMatrix();
        cam.lookAt(0, v.y, 0);
      }
      r2.render(sc, cam);
      try { icons[p.id] = r2.domElement.toDataURL('image/png'); } catch (e) { /* ignore */ }
      sc.remove(obj);
    }
    r2.dispose();
    if (r2.forceContextLoss) r2.forceContextLoss();
    return icons;
  }

  /* ---------- lights ---------- */
  const hemi = new THREE.HemisphereLight(0xe3f2ff, 0x6f8f4e, 0.62);
  const sun = new THREE.DirectionalLight(0xfff1d6, 0.85);
  const amb = new THREE.AmbientLight(0xffffff, 0.1);
  sun.position.set(32, 50, 22);
  sun.castShadow = true;
  const shadowRes = coarse ? 2048 : 4096;
  sun.shadow.mapSize.set(shadowRes, shadowRes);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 200 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.035;
  scene.add(hemi, sun, amb, sun.target);
  const sunOffset = new THREE.Vector3(32, 50, 22); // shadows follow the view

  const DAY = { sky: new THREE.Color('#e3f2ff'), ground: new THREE.Color('#6f8f4e'), hemiI: 0.62, sunC: new THREE.Color('#fff1d6'), sunI: 0.85, ambI: 0.1, sunPos: new THREE.Vector3(32, 50, 22), cloud: new THREE.Color('#ffffff') };
  const NIGHT = { sky: new THREE.Color('#6a7cc4'), ground: new THREE.Color('#25314d'), hemiI: 0.55, sunC: new THREE.Color('#a9bcff'), sunI: 0.3, ambI: 0.07, sunPos: new THREE.Vector3(-27, 45, -18), cloud: new THREE.Color('#5d6a94') };
  function applyNight(n) {
    hemi.color.copy(DAY.sky).lerp(NIGHT.sky, n);
    hemi.groundColor.copy(DAY.ground).lerp(NIGHT.ground, n);
    hemi.intensity = DAY.hemiI + (NIGHT.hemiI - DAY.hemiI) * n;
    sun.color.copy(DAY.sunC).lerp(NIGHT.sunC, n);
    sun.intensity = DAY.sunI + (NIGHT.sunI - DAY.sunI) * n;
    sunOffset.copy(DAY.sunPos).lerp(NIGHT.sunPos, n);
    amb.intensity = DAY.ambI + (NIGHT.ambI - DAY.ambI) * n;
    M.winSide.emissiveIntensity = n * 1.3;
    M.clock.emissiveIntensity = n * 0.9;
    M.lamp.emissiveIntensity = 0.5 + n * 0.8;
    M.glow.opacity = n * 0.95;
    M.glow.visible = n > 0.001; // glow sprites are skipped entirely in daylight
    M.cloud.color.copy(DAY.cloud).lerp(NIGHT.cloud, n);
    M.cloud.emissiveIntensity = 0.3 * (1 - n);
    M.water.emissiveIntensity = 0.35 - 0.2 * n;
  }

  /* ---------- island ---------- */
  const island = new THREE.Mesh(new THREE.BoxGeometry(BASE_HALF * 2, 1.6, BASE_HALF * 2), [M.dirt, M.dirt, M.grass, M.dirt, M.dirt, M.dirt]);
  island.position.y = -0.8;
  island.receiveShadow = true;
  scene.add(island);
  // a layer of plain dirt under the island, deep enough for holes (sides only: holes look down into it)
  T.under = tex(plainCanvas('#7b4e33', 0.25, 34, 200), BASE_HALF, 1);
  M.under = std({ map: T.under });
  const unseen = new THREE.MeshBasicMaterial({ visible: false });
  const under = new THREE.Mesh(new THREE.BoxGeometry(BASE_HALF * 2, 2, BASE_HALF * 2), [M.under, M.under, unseen, unseen, M.under, M.under]);
  under.position.y = -2.6;
  scene.add(under);
  const rock = new THREE.Mesh(rockGeometry(), M.rock);
  rock.rotation.x = Math.PI;
  rock.position.y = -3.6 - 13;
  scene.add(rock);

  // Holes: the grass skips every square whose top layer of ground is dug out (a mask texture,
  // one pixel per square of the biggest island), and dirt walls are drawn inside the holes.
  const HOLE_W = MAX_HALF * 2;
  const holeData = new Uint8Array(HOLE_W * HOLE_W);
  const holeTex = new THREE.DataTexture(holeData, HOLE_W, HOLE_W, THREE.LuminanceFormat, THREE.UnsignedByteType);
  holeTex.magFilter = holeTex.minFilter = THREE.NearestFilter;
  holeTex.generateMipmaps = false;
  holeTex.needsUpdate = true;
  M.grass.onBeforeCompile = (sh) => {
    sh.uniforms.holeMap = { value: holeTex };
    sh.vertexShader = 'varying vec2 vHoleXZ;\n' + sh.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\n  vHoleXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = 'uniform sampler2D holeMap;\nvarying vec2 vHoleXZ;\n' + sh.fragmentShader.replace('void main() {',
      'void main() {\n  if (texture2D(holeMap, (vHoleXZ + ' + MAX_HALF + '.0) / ' + HOLE_W + '.0).r > 0.5) discard;');
  };
  const pits = new THREE.Mesh(new THREE.BufferGeometry(), M.dirtB);
  pits.receiveShadow = true;
  pits.frustumCulled = false;
  pits.visible = false;
  scene.add(pits);

  const clouds = [];
  (function makeClouds() {
    const r = rng(77);
    const spots = [[-98, 14, -48], [82, 20, -88], [112, 3, 44], [-112, -8, 54], [20, 26, -122], [-44, -16, 112], [64, -12, 102]];
    for (const [x, y, z] of spots) {
      const g = new THREE.Group();
      const n = 3 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(G.puff, M.cloud);
        const s = 1 + r() * 1.3;
        m.scale.set(s * 1.3, s * 0.8, s);
        m.position.set((i - (n - 1) / 2) * 1.7 + r() * 0.6, r() * 0.6, r() * 1.2 - 0.6);
        g.add(m);
      }
      g.position.set(x, y, z);
      g.userData.speed = 0.35 + r() * 0.4;
      g.userData.z = z;
      scene.add(g);
      clouds.push(g);
    }
  })();
  let cloudSpread = 1; // clouds stay outside the island as it grows
  let shownHalf = half; // the island's drawn size; it eases toward half when the island grows
  function sizeIsland(h) {
    const k = h / BASE_HALF, ky = Math.sqrt(k);
    island.scale.set(k, 1, k);
    under.scale.set(k, 1, k);
    rock.scale.set(k, ky, k); // deeper rock under a bigger island
    rock.position.y = -3.6 - 13 * ky;
    T.under.repeat.set(h, 1); T.under.offset.set(-h / 2, 0);
    // keep one grass square per grid square, lined up with the blocks, at any size
    T.grass.repeat.set(h, h); T.grass.offset.set(-h / 2, -h / 2);
    T.dirt.repeat.set(h, 1); T.dirt.offset.set(-h / 2, 0);
    const f = (h + 60) / (BASE_HALF + 60);
    for (const c of clouds) { c.position.x *= f / cloudSpread; c.position.z = c.userData.z * f; c.scale.setScalar(Math.pow(f, 0.85)); }
    cloudSpread = f;
  }
  // Change the island's size: the edges (for building and picking), the camera's reach, and the
  // drawing (smoothly, if asked). Characters left outside walk back onto the island.
  function setIsland(h, smooth) {
    half = h;
    LO[0] = LO[2] = -h; HI[0] = HI[2] = h;
    controls.maxDistance = Math.max(210, h * 2.6);
    camera.far = Math.max(700, h * 5);
    camera.updateProjectionMatrix();
    if (!smooth || reduceMotion) { shownHalf = h; sizeIsland(h); }
    keepCharsOnIsland();
    showIslandSize();
  }
  // The island a castle needs: its saved width (or the starting size), with room for every block and character.
  function islandFor(list, charList, width, dugList) {
    let need = width > 0 ? Math.ceil(width / 2) : START_HALF;
    const fit = (x, z) => { need = Math.max(need, -x, x + 1, -z, z + 1); };
    for (const e of list || []) fit(e[0], e[2]);
    for (const c of charList || []) fit(c[1], c[3]);
    for (let i = 0; i + 2 < (dugList || []).length; i += 3) fit(dugList[i], dugList[i + 2]);
    return Math.min(MAX_HALF, Math.max(START_HALF, need));
  }

  const blockGroup = new THREE.Group();
  scene.add(blockGroup);

  /* ghost cursor */
  const ghost = new THREE.Group();
  const ghostEdgeMat = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, depthTest: false });
  const ghostFillMat = new THREE.MeshBasicMaterial({ color: '#f0b429', transparent: true, opacity: 0.28, depthWrite: false });
  ghost.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02)), ghostEdgeMat));
  ghost.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), ghostFillMat));
  ghost.children[0].renderOrder = 10;
  ghost.visible = false;
  scene.add(ghost);
  function showGhost(c, kind) {
    ghost.position.set(c.x + 0.5, c.y + 0.5, c.z + 0.5);
    if (kind === 'erase') { ghostEdgeMat.color.set('#ff5a4a'); ghostFillMat.color.set('#c8372d'); ghostFillMat.opacity = 0.32; ghost.scale.setScalar(1.05); }
    else { ghostEdgeMat.color.set('#ffffff'); ghostFillMat.color.set('#f0b429'); ghostFillMat.opacity = 0.28; ghost.scale.setScalar(1); }
    ghost.visible = true;
  }
  function showGhostBox(min, max, ok) { // the space a landmark will fill (red if it won't fit)
    ghost.position.set((min.x + max.x + 1) / 2, (min.y + max.y + 1) / 2, (min.z + max.z + 1) / 2);
    ghost.scale.set(max.x - min.x + 1, max.y - min.y + 1, max.z - min.z + 1);
    ghostEdgeMat.color.set(ok ? '#ffffff' : '#ff5a4a');
    ghostFillMat.color.set(ok ? '#f0b429' : '#c8372d');
    ghostFillMat.opacity = 0.12;
    ghost.visible = true;
  }

  /* ---------- world state ---------- */
  // world maps "x,y,z" to a block record: { t: piece, r: rotation, x, y, z } plus how it is drawn.
  const world = new Map();
  const K = (x, y, z) => x + ',' + y + ',' + z;
  // Below the grass (y < 0) is solid ground, down to DEPTH squares, except where it has been dug
  // out (the dug set). Dug squares can hold blocks, water, characters... like squares above ground.
  const DEPTH = 3;
  const dug = new Set();
  const inBounds = (x, y, z) => x >= -half && x < half && z >= -half && z < half && y >= -DEPTH && y < MAXY;
  const inMax = (x, y, z) => x >= -MAX_HALF && x < MAX_HALF && z >= -MAX_HALF && z < MAX_HALF && y >= -DEPTH && y < MAXY; // fits the biggest island
  const isEarth = (x, y, z) => y < 0 && (y < -DEPTH || !dug.has(K(x, y, z))); // solid, undug ground
  const canHold = (x, y, z) => inBounds(x, y, z) && (y >= 0 || dug.has(K(x, y, z)));
  const pops = [];
  const easeOutBack = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
  function startPop(obj, delay, rec) {
    if (reduceMotion) return;
    obj.scale.setScalar(0.001);
    pops.push({ obj, t0: performance.now() + delay, rec });
  }

  /* ---------- drawing blocks ---------- */
  // Most blocks are drawn in batches: each part of a piece (a tree's trunk, its leaves...) is one
  // InstancedMesh holding every block of that kind, so a big castle takes a few dozen draw calls
  // instead of one per block. Pieces that flicker (SOLO) are separate objects. Glass and ice are
  // one merged mesh (see "see-through blocks"). A block being placed pops in as a separate object
  // (rec.temp) and joins its batch when the pop ends.
  const SOLO = new Set(['torch', 'candles', 'fireplace']);
  const CLEAR = new Set(['glass', 'ice']);
  const flickers = new Set();
  const batches = new Map();
  const clearRecs = new Set();
  let clearDirty = false;
  const mA = new THREE.Matrix4(), mB = new THREE.Matrix4(), qY = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
  const vP = new THREE.Vector3(), vS = new THREE.Vector3(1, 1, 1);

  function restOffset(rec) { // candles, flowers and rugs sit down onto low furniture under them
    if (!RESTS.has(rec.t)) return 0;
    const b = world.get(K(rec.x, rec.y - 1, rec.z));
    return b && TOP[b.t] ? TOP[b.t] - 1 : 0;
  }
  function placeObj(o, rec) { o.position.set(rec.x + 0.5, rec.y + 0.5 + restOffset(rec), rec.z + 0.5); }
  function makeBatch(id) {
    const tpl = makePiece(id, 0);
    tpl.updateMatrixWorld(true);
    const b = { parts: [], glows: [], list: [], cap: 0 };
    tpl.traverse((m) => {
      if (m.isMesh) b.parts.push({ src: m, local: m.matrixWorld.clone(), mesh: null });
      else if (m.isSprite) b.glows.push({ pos: m.position.clone(), scale: m.scale.x });
    });
    growBatch(b, 16);
    return b;
  }
  function growBatch(b, cap) {
    for (const p of b.parts) {
      const mesh = new THREE.InstancedMesh(p.src.geometry, p.src.material, cap);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = p.src.castShadow; mesh.receiveShadow = true;
      if (p.src.customDepthMaterial) mesh.customDepthMaterial = p.src.customDepthMaterial;
      mesh.frustumCulled = false; // Three.js r128 would cull the whole batch using the first block's bounds
      if (p.mesh) {
        mesh.instanceMatrix.array.set(p.mesh.instanceMatrix.array);
        blockGroup.remove(p.mesh);
        if (p.mesh.dispose) p.mesh.dispose();
      }
      mesh.count = b.list.length;
      mesh.visible = b.list.length > 0;
      p.mesh = mesh;
      blockGroup.add(mesh);
    }
    b.cap = cap;
  }
  function batchSet(b, rec) {
    const fl = FLOW_DEPTH[rec.t], above = fl && world.get(K(rec.x, rec.y + 1, rec.z));
    const s = !fl ? 1 : above && above.t === rec.t ? FILL[rec.t] : fl[Math.min(flowStep(rec.r), fl.length - 1)]; // flowing water and lava are shallower; under more of the same they fill the square
    qY.setFromAxisAngle(UP, fl ? 0 : pieceYaw(rec.t, rec.r));
    vP.set(rec.x + 0.5, rec.y + 0.5 + restOffset(rec) - 0.5 * (1 - s), rec.z + 0.5);
    vS.set(1, s, 1);
    mA.compose(vP, qY, vS);
    for (const p of b.parts) {
      mB.multiplyMatrices(mA, p.local);
      p.mesh.setMatrixAt(rec.slot, mB);
      p.mesh.instanceMatrix.needsUpdate = true;
    }
    if (rec.glows) rec.glows.forEach((s, i) => { s.position.copy(b.glows[i].pos).applyQuaternion(qY).add(vP); });
  }
  function batchAdd(b, rec) {
    if (b.list.length >= b.cap) growBatch(b, b.cap * 2);
    rec.slot = b.list.length;
    b.list.push(rec);
    if (b.glows.length) {
      rec.glows = b.glows.map((g) => { const s = new THREE.Sprite(M.glow); s.scale.setScalar(g.scale); blockGroup.add(s); return s; });
    }
    batchSet(b, rec);
    for (const p of b.parts) { p.mesh.count = b.list.length; p.mesh.visible = true; }
  }
  function batchRemove(b, rec) {
    const i = rec.slot, last = b.list.length - 1;
    if (i !== last) { // move the last block into the gap
      const moved = b.list[last];
      for (const p of b.parts) { p.mesh.getMatrixAt(last, mA); p.mesh.setMatrixAt(i, mA); }
      b.list[i] = moved; moved.slot = i;
    }
    b.list.pop();
    for (const p of b.parts) { p.mesh.count = b.list.length; p.mesh.visible = b.list.length > 0; p.mesh.instanceMatrix.needsUpdate = true; }
    if (rec.glows) { rec.glows.forEach((s) => blockGroup.remove(s)); rec.glows = null; }
    rec.slot = -1;
  }
  function show(rec) { // draw a block in its lasting form
    if (SOLO.has(rec.t)) {
      const o = makePiece(rec.t, rec.r);
      placeObj(o, rec);
      blockGroup.add(o);
      rec.obj = o;
      if (o.userData.flicker) flickers.add(o);
    } else if (CLEAR.has(rec.t)) {
      clearRecs.add(rec); clearDirty = true;
    } else {
      let b = batches.get(rec.t);
      if (!b) { b = makeBatch(rec.t); batches.set(rec.t, b); }
      batchAdd(b, rec);
    }
  }
  function hide(rec) {
    if (rec.temp) { blockGroup.remove(rec.temp); rec.temp = null; }
    else if (rec.obj) { blockGroup.remove(rec.obj); flickers.delete(rec.obj); rec.obj = null; }
    else if (CLEAR.has(rec.t)) { clearRecs.delete(rec); clearDirty = true; }
    else if (rec.slot >= 0) batchRemove(batches.get(rec.t), rec);
  }
  function redraw(rec) { // after the block underneath changed
    if (rec.temp) placeObj(rec.temp, rec);
    else if (rec.obj) placeObj(rec.obj, rec);
    else if (rec.slot >= 0) batchSet(batches.get(rec.t), rec);
  }
  function popDone(rec) {
    blockGroup.remove(rec.temp);
    rec.temp = null;
    show(rec);
    neighborsChanged(rec.x, rec.y, rec.z);
  }
  const SIDES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  function neighborsChanged(x, y, z) {
    const up = world.get(K(x, y + 1, z)), down = world.get(K(x, y - 1, z));
    if (up && RESTS.has(up.t)) redraw(up);
    if (down && FLOW_DEPTH[down.t] && down.slot >= 0) redraw(down); // water under water is drawn full height
    if (clearRecs.size && !clearDirty) {
      for (const [dx, dy, dz] of SIDES) { const n = world.get(K(x + dx, y + dy, z + dz)); if (n && CLEAR.has(n.t)) { clearDirty = true; break; } }
    }
  }

  function addBlock(x, y, z, t, r, opts) {
    opts = opts || {};
    const k = K(x, y, z);
    if (world.has(k) || !canHold(x, y, z) || !PIECE[t] || CHAR_SET.has(t)) return false;
    const rec = { t, r: r || 0, x, y, z, slot: -1, obj: null, temp: null, glows: null };
    world.set(k, rec);
    if (opts.pop && !reduceMotion) {
      if (SOLO.has(t)) { show(rec); startPop(rec.obj, opts.delay || 0); }
      else {
        rec.temp = makePiece(t, rec.r);
        placeObj(rec.temp, rec);
        blockGroup.add(rec.temp);
        startPop(rec.temp, opts.delay || 0, rec);
      }
    } else show(rec);
    neighborsChanged(x, y, z);
    if (opts.record) pushUndo({ op: 'add', x, y, z, t, r: r || 0 });
    return true;
  }
  function removeBlock(x, y, z, opts) {
    opts = opts || {};
    const k = K(x, y, z), b = world.get(k);
    if (!b) return false;
    world.delete(k);
    hide(b);
    neighborsChanged(x, y, z);
    if (opts.record) pushUndo({ op: 'remove', x, y, z, t: b.t, r: b.r });
    return true;
  }
  function clearBlocks() {
    world.clear();
    for (const b of batches.values()) {
      b.list.length = 0;
      for (const p of b.parts) { p.mesh.count = 0; p.mesh.visible = false; }
    }
    for (const o of blockGroup.children.slice()) if (!o.isInstancedMesh) blockGroup.remove(o);
    flickers.clear();
    clearRecs.clear(); clearDirty = true;
    for (const p of pops) p.obj.scale.setScalar(1);
    pops.length = 0;
  }
  function serialize() {
    const out = [];
    for (const b of world.values()) out.push([b.x, b.y, b.z, b.t, b.r]);
    return out;
  }
  function validList(list) {
    return Array.isArray(list) && list.every((e) => Array.isArray(e) && e.length >= 4 &&
      Number.isInteger(e[0]) && Number.isInteger(e[1]) && Number.isInteger(e[2]) && inMax(e[0], e[1], e[2]) && !!PIECE[e[3]] && !CHAR_SET.has(e[3]));
  }
  function loadBlocks(list, animate) {
    clearBlocks();
    let from = 0; // which layers pop up; lower ones appear at once
    if (animate && list.length > 1200) { from = 1; if (list.filter((e) => e[1] >= 1).length > 2600) animate = false; }
    const top = list.reduce((m, e) => Math.max(m, e[1]), 0), step = Math.min(110, 2000 / (top + 1));
    for (const e of list) {
      const pop = animate && e[1] >= from;
      addBlock(e[0], e[1], e[2], e[3], e[4] || 0, pop ? { pop: true, delay: (e[1] - from) * step + Math.random() * 260 } : null);
    }
  }

  /* ---------- see-through blocks: glass and ice ---------- */
  // All glass and ice blocks are built into one mesh. Faces shared by two blocks of the same kind,
  // or pressed against a solid block, are left out, and the rest are drawn from far to near
  // (re-sorted whenever the camera moves). This keeps stacked glass and ice from flickering or
  // hiding each other.
  const FULL = new Set(['stone', 'brick', 'wood', 'window', 'gold', 'grass', 'dirt', 'sand', 'cobble', 'snow', 'log', 'lava', 'lamp',
    'bookshelf', 'clock', 'red', 'blue', 'yellow', 'green', 'teal', 'white', 'black']);
  // per face: normal, then 4 corners (x, y, z, u, v), counter-clockwise seen from outside
  const FACES = [
    [[1, 0, 0], [[1, 0, 0, 1, 0], [1, 1, 0, 1, 1], [1, 1, 1, 0, 1], [1, 0, 1, 0, 0]]],
    [[-1, 0, 0], [[0, 0, 1, 1, 0], [0, 1, 1, 1, 1], [0, 1, 0, 0, 1], [0, 0, 0, 0, 0]]],
    [[0, 1, 0], [[0, 1, 0, 0, 1], [0, 1, 1, 0, 0], [1, 1, 1, 1, 0], [1, 1, 0, 1, 1]]],
    [[0, -1, 0], [[0, 0, 0, 0, 0], [1, 0, 0, 1, 0], [1, 0, 1, 1, 1], [0, 0, 1, 0, 1]]],
    [[0, 0, 1], [[0, 0, 1, 0, 0], [1, 0, 1, 1, 0], [1, 1, 1, 1, 1], [0, 1, 1, 0, 1]]],
    [[0, 0, -1], [[1, 0, 0, 0, 0], [0, 0, 0, 1, 0], [0, 1, 0, 1, 1], [1, 1, 0, 0, 1]]]
  ];
  const clearMesh = new THREE.Mesh(new THREE.BufferGeometry(), M.clear);
  clearMesh.receiveShadow = true;
  clearMesh.frustumCulled = false;
  clearMesh.visible = false;
  scene.add(clearMesh);
  const clear = { n: 0, centers: null, dist: null, order: null, sortedAt: new THREE.Vector3(Infinity, 0, 0) };
  function buildClear() {
    clearDirty = false;
    const pos = [], nor = [], uv = [], cen = [];
    for (const rec of clearRecs) {
      const u0 = rec.t === 'glass' ? 0.004 : 0.504;
      for (const [n, cs] of FACES) {
        if (n[1] === -1 && isEarth(rec.x, rec.y - 1, rec.z)) continue; // resting on the ground
        const nb = world.get(K(rec.x + n[0], rec.y + n[1], rec.z + n[2]));
        if (nb && !nb.temp && (nb.t === rec.t || FULL.has(nb.t))) continue;
        for (const c of cs) { pos.push(rec.x + c[0], rec.y + c[1], rec.z + c[2]); nor.push(n[0], n[1], n[2]); uv.push(u0 + c[3] * 0.492, c[4]); }
        cen.push(rec.x + 0.5 + n[0] * 0.5, rec.y + 0.5 + n[1] * 0.5, rec.z + 0.5 + n[2] * 0.5);
      }
    }
    const n = cen.length / 3;
    const geo = new THREE.BufferGeometry();
    if (n) {
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      const idx = n * 4 > 65535 ? new Uint32Array(n * 6) : new Uint16Array(n * 6);
      const attr = new THREE.BufferAttribute(idx, 1);
      attr.setUsage(THREE.DynamicDrawUsage);
      geo.setIndex(attr);
    }
    clearMesh.geometry.dispose();
    clearMesh.geometry = geo;
    clearMesh.visible = n > 0;
    clear.n = n;
    clear.centers = new Float32Array(cen);
    clear.dist = new Float32Array(n);
    clear.order = new Uint32Array(n).map((v, i) => i);
    sortClear(true);
  }
  function sortClear(force) {
    if (!clear.n) return;
    const cp = camera.position;
    if (!force && cp.distanceToSquared(clear.sortedAt) < 1e-4) return;
    clear.sortedAt.copy(cp);
    const { n, centers: c, dist: d, order } = clear;
    for (let i = 0; i < n; i++) {
      const dx = c[i * 3] - cp.x, dy = c[i * 3 + 1] - cp.y, dz = c[i * 3 + 2] - cp.z;
      d[i] = dx * dx + dy * dy + dz * dz;
    }
    order.sort((a, b) => d[b] - d[a]); // far faces first
    const idx = clearMesh.geometry.index.array;
    for (let i = 0; i < n; i++) {
      const v = order[i] * 4, o = i * 6;
      idx[o] = v; idx[o + 1] = v + 1; idx[o + 2] = v + 2; idx[o + 3] = v; idx[o + 4] = v + 2; idx[o + 5] = v + 3;
    }
    clearMesh.geometry.index.needsUpdate = true;
  }

  /* ---------- digging holes ---------- */
  let pitsDirty = false;
  function setDug(x, y, z, on) {
    const k = K(x, y, z);
    if (on) dug.add(k); else dug.delete(k);
    if (y === -1 && inMax(x, y, z)) { holeData[(z + MAX_HALF) * HOLE_W + x + MAX_HALF] = on ? 255 : 0; holeTex.needsUpdate = true; }
    pitsDirty = true;
  }
  function digAt(x, y, z, opts) { // dig out one square of ground
    if (!inBounds(x, y, z) || !isEarth(x, y, z)) return false;
    setDug(x, y, z, true);
    if (opts && opts.record) pushUndo({ op: 'dig', x, y, z });
    return true;
  }
  function fillAt(x, y, z) { // put the ground back (Undo)
    if (!dug.has(K(x, y, z))) return false;
    if (world.has(K(x, y, z))) removeBlock(x, y, z);
    setDug(x, y, z, false);
    return true;
  }
  function serializeDug() { const out = []; for (const k of dug) out.push(...k.split(',').map(Number)); return out; }
  function loadDug(flat) { // replace every hole (flat list: x, y, z, x, y, z...)
    for (const k of Array.from(dug)) { const [x, y, z] = k.split(',').map(Number); setDug(x, y, z, false); }
    for (let i = 0; i + 2 < (flat || []).length; i += 3) setDug(flat[i], flat[i + 1], flat[i + 2], true);
  }
  function validDug(flat) {
    return Array.isArray(flat) && flat.length % 3 === 0 && flat.every(Number.isInteger) &&
      flat.every((v, i) => i % 3 !== 1 || (v < 0 && v >= -DEPTH)) && flat.every((v, i) => i % 3 === 1 || Math.abs(v) <= MAX_HALF);
  }
  function buildPits() { // dirt walls, floors and ceilings inside the holes, facing into them
    pitsDirty = false;
    const pos = [], nor = [], uv = [];
    for (const k of dug) {
      const [x, y, z] = k.split(',').map(Number);
      for (const [n, cs] of FACES) {
        if (!isEarth(x + n[0], y + n[1], z + n[2])) continue;
        for (const i of [0, 2, 1, 0, 3, 2]) { const c = cs[i]; pos.push(x + c[0], y + c[1], z + c[2]); nor.push(-n[0], -n[1], -n[2]); uv.push(c[3], c[4]); }
      }
    }
    const geo = new THREE.BufferGeometry();
    if (pos.length) {
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    }
    pits.geometry.dispose();
    pits.geometry = geo;
    pits.visible = pos.length > 0;
  }

  /* ---------- nature: water flows, lava cools, ice and snow melt, sand falls ---------- */
  // Nothing happens on its own: a change a player makes "wakes" the blocks around it, and each
  // woken block follows its rule after a short wait (water quickly, lava slowly). A rule's
  // changes wake the blocks around them in turn, so water keeps running until it settles.
  // Every change is stored on the undo entry of the player's action (its "cause"), so one Undo
  // takes back the action and everything it set off. For water and lava, the rotation number
  // holds how far it has flowed from where it started (0 = placed), which limits its reach.
  const NATURE_KEY = 'stack-a-castle:nature';
  const FLOW_DEPTH = { water: [1, 0.78, 0.6, 0.42], lava: [1, 0.55] }; // drawn height by flow step
  const FILL = { water: 1 / 0.82, lava: 1 }; // stretch that fills a whole square (a water block is 0.82 tall)
  const REACH = { water: 3, lava: 1 }; // squares it can run across flat ground
  const WAIT = { water: 220, lava: 750, ice: 1100, snow: 1100, sand: 70 }; // ms before a woken block acts
  const HEAT = new Set(['lava', 'torch', 'fireplace', 'candles', 'lamp', 'lantern']);
  const nature = { on: store.get(NATURE_KEY) !== 'off', queue: new Map(), dirty: false, savedAt: 0 };
  const near = (x, y, z, fn) => { // calls fn for each block in the 3 × 3 × 3 cube around a square
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const b = world.get(K(x + dx, y + dy, z + dz));
      if (b && fn(b) === true) return true;
    }
    return false;
  };
  function wakeAround(x, y, z, cause) {
    near(x, y, z, (b) => {
      if (!RULES[b.t]) return;
      const k = K(b.x, b.y, b.z), at = performance.now() + WAIT[b.t], w = nature.queue.get(k);
      if (!w || w.at > at) nature.queue.set(k, { at, cause: w ? w.cause : cause });
    });
  }
  function natureAfter(cells) { // a player just changed these squares
    const cause = undoStack[undoStack.length - 1];
    if (!nature.on || !cause) return;
    for (const c of cells) wakeAround(c[0], c[1], c[2], cause);
  }
  const SOUND_OF = { water: 'splash', ice: 'splash', snow: 'splash', cobble: 'hiss', sand: 'thud' };
  function natureSet(x, y, z, t, r, cause) { // one change made by nature, remembered for Undo
    if (cause.budget <= 0 || !inBounds(x, y, z)) return false;
    const old = world.get(K(x, y, z));
    if (!old && !t) return false;
    if (!cause.effects.length || t === 'cobble') blip(SOUND_OF[t || 'sand'] || 'splash');
    cause.effects.push({ x, y, z, from: old ? [old.t, old.r] : null, to: t ? [t, r || 0] : null });
    cause.budget--;
    if (old) removeBlock(x, y, z);
    if (t) addBlock(x, y, z, t, r || 0);
    nature.dirty = true;
    wakeAround(x, y, z, cause);
    return true;
  }
  const empty = (x, y, z) => canHold(x, y, z) && !world.has(K(x, y, z));
  // A water or lava block's number is its flow step (0 = placed, still), plus 4 while it is falling.
  const flowStep = (r) => ((r || 0) >= 4 ? r - 4 : r || 0);
  function flow(b, cause) { // water and lava: fall into the square below, or spread across what's under them
    const step = flowStep(b.r), falling = (b.r || 0) >= 4;
    if (empty(b.x, b.y - 1, b.z)) { natureSet(b.x, b.y - 1, b.z, b.t, 4 + step, cause); return; }
    const under = world.get(K(b.x, b.y - 1, b.z));
    // a falling stream doesn't spread when it lands in water, and nothing spreads on top of a falling stream;
    // the top of a pond (water on still water) does spread, so a hole dug beside a moat fills up
    if (under && FLOW_DEPTH[under.t] && (falling || (under.r || 0) >= 4)) return;
    if (step >= REACH[b.t]) return;
    for (const [dx, dz] of DIRS) if (empty(b.x + dx, b.y, b.z + dz)) natureSet(b.x + dx, b.y, b.z + dz, b.t, step + 1, cause);
  }
  const touching = (b, t) => [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]
    .some(([dx, dy, dz]) => { const n = world.get(K(b.x + dx, b.y + dy, b.z + dz)); return !!n && n.t === t; });
  const heatNear = (b) => near(b.x, b.y, b.z, (n) => HEAT.has(n.t));
  const RULES = {
    water: flow,
    lava(b, c) { if (touching(b, 'water')) natureSet(b.x, b.y, b.z, 'cobble', 0, c); else flow(b, c); }, // lava meeting water cools into rock
    ice(b, c) { if (heatNear(b)) natureSet(b.x, b.y, b.z, 'water', 0, c); },
    snow(b, c) { if (heatNear(b)) natureSet(b.x, b.y, b.z, 'water', 2, c); },
    sand(b, c) { if (empty(b.x, b.y - 1, b.z)) { natureSet(b.x, b.y, b.z, null, 0, c); natureSet(b.x, b.y - 1, b.z, 'sand', 0, c); } }
  };
  function natureStep(now) { // run the woken blocks whose wait is over (a few per frame)
    let n = 0;
    for (const [k, w] of nature.queue) {
      if (w.at > now) continue;
      nature.queue.delete(k);
      if (!nature.on || !w.cause.live) continue;
      const b = world.get(k);
      if (b && RULES[b.t]) RULES[b.t](b, w.cause);
      if (++n >= 120) break;
    }
    if (nature.dirty && (now - nature.savedAt > 700 || !nature.queue.size)) { nature.dirty = false; nature.savedAt = now; changed(); }
  }
  const sameState = (b, s) => (b ? !!s && b.t === s[0] && (b.r || 0) === (s[1] || 0) : !s);
  function undoNature(a) { // put back what nature changed, newest first, where it hasn't changed again since
    a.live = false;
    for (let i = (a.effects || []).length - 1; i >= 0; i--) {
      const e = a.effects[i], b = world.get(K(e.x, e.y, e.z));
      if (!sameState(b, e.to)) continue;
      if (b) removeBlock(e.x, e.y, e.z);
      if (e.from) addBlock(e.x, e.y, e.z, e.from[0], e.from[1]);
    }
  }
  function redoNature(a) { // replay nature's changes (when catching up after connecting)
    for (const e of a.effects || []) {
      if (world.has(K(e.x, e.y, e.z))) removeBlock(e.x, e.y, e.z);
      if (e.to) addBlock(e.x, e.y, e.z, e.to[0], e.to[1]);
    }
  }

  /* ---------- sample castle ---------- */
  // A big castle with a real moat dug into the ground and filled with water (so it has banks on
  // both sides and stays put), a bridge and gatehouse, four round towers with turrets, and a
  // three-story keep with furniture on every floor. Returns its blocks and its dug-out squares.
  function sampleWorld() {
    const base = shape(), holes = [];
    const s = { put: (x, y, z, t, r) => base.put(x, y - 1, z, t, r) }; // the castle below is written with the ground floor at y = 1
    const dig = (x, y, z, t) => { holes.push(x, y, z); if (t) base.put(x, y, z, t); };
    for (let x = -15; x <= 15; x++) for (let z = -15; z <= 15; z++) {
      if (Math.max(Math.abs(x), Math.abs(z)) >= 14) { dig(x, -1, z, 'water'); dig(x, -2, z, 'water'); } // the moat, two deep
    }
    for (let z = 16; z <= 22; z++) dig(0, -1, z, 'cobble'); // a path set into the ground
    for (let x = -4; x <= 4; x++) for (let z = -7; z <= -1; z++) dig(x, -1, z, 'cobble'); // a stone floor in the great hall
    for (let z = 14; z <= 15; z++) { for (let x = -1; x <= 1; x++) base.put(x, -1, z, 'wood'); base.put(-1, 0, z, 'fence', 1); base.put(1, 0, z, 'fence', 1); } // bridge, level with the grass
    base.put(-1, 0, 16, 'torch'); base.put(1, 0, 16, 'torch');

    // curtain wall with arrow slits and battlements
    for (let y = 1; y <= 5; y++) for (let x = -11; x <= 11; x++) for (let z = -11; z <= 11; z++) {
      if (Math.max(Math.abs(x), Math.abs(z)) !== 11) continue;
      s.put(x, y, z, y === 3 && (x + z) % 4 === 0 ? 'window' : 'stone');
      if (y === 5) s.put(x, 6, z, 'battlement');
    }
    // round corner towers
    for (const cx of [-11, 11]) for (const cz of [-11, 11]) {
      for (const [x, z] of outline(2.4, 2.4)) {
        for (let y = 1; y <= 8; y++) s.put(cx + x, y, cz + z, (y === 4 || y === 7) && (x === 0 || z === 0) ? 'window' : 'stone');
        s.put(cx + x, 9, cz + z, 'battlement');
      }
      for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) s.put(cx + x, 8, cz + z, 'stone');
      s.put(cx, 9, cz, 'tower'); s.put(cx, 10, cz, 'tower'); s.put(cx, 11, cz, 'roof'); // a little turret on top
    }
    // gatehouse with two turrets
    for (let x = -3; x <= 3; x++) for (let z = 10; z <= 12; z++) for (let y = 1; y <= 7; y++) {
      const edge = Math.abs(x) === 3 || z !== 11 || y === 7;
      if (edge) s.put(x, y, z, (y === 4 && z === 12 && Math.abs(x) === 1) ? 'window' : 'stone');
      if (y === 7) s.put(x, 8, z, Math.abs(x) === 3 && z === 12 ? 'tower' : 'battlement');
    }
    for (let x = -2; x <= 2; x++) for (let y = 1; y <= 6; y++) s.put(x, y, 11, 'stone');
    for (let z = 10; z <= 12; z++) { base.del(0, 0, z); s.put(0, 2, z, 'gate', 0); } // an open gateway, two high, with an arch on top
    for (const x of [-3, 3]) { for (let y = 1; y <= 8; y++) s.put(x, y, 12, 'tower'); s.put(x, 9, 12, 'roof'); }
    s.put(0, 9, 11, 'flag');

    // the keep: three stories, wooden floors, windows, battlements and a tower on top
    const K0 = -5, K1 = 5, Z0 = -8, Z1 = 0;
    for (let y = 1; y <= 12; y++) for (let x = K0; x <= K1; x++) for (let z = Z0; z <= Z1; z++) {
      const edge = x === K0 || x === K1 || z === Z0 || z === Z1, corner = (x === K0 || x === K1) && (z === Z0 || z === Z1);
      if (edge) {
        const win = !corner && (x + z) % 2 === 0 && (y === 2 || y === 3 || y === 6 || y === 7 || y === 10 || y === 11);
        s.put(x, y, z, win ? 'window' : y <= 4 ? 'stone' : 'brick');
      } else if (y === 5 || y === 9) s.put(x, y, z, 'wood');
    }
    for (let x = K0; x <= K1; x++) for (let z = Z0; z <= Z1; z++) {
      const edge = x === K0 || x === K1 || z === Z0 || z === Z1;
      s.put(x, 13, z, edge ? 'battlement' : 'slab');
    }
    base.del(0, 0, Z1); s.put(0, 2, Z1, 'gate', 0); // the keep's door, open, with an arch on top
    for (let y = 13; y <= 17; y++) for (let x = -1; x <= 1; x++) for (let z = -5; z <= -3; z++) {
      if (x === 0 && z === -4) continue;
      s.put(x, y, z, y === 15 && (x === 0 || z === -4) ? 'window' : 'brick');
    }
    for (let x = -1; x <= 1; x++) for (let z = -5; z <= -3; z++) s.put(x, 18, z, x === 0 && z === -4 ? 'stone' : 'battlement');
    s.put(0, 19, -4, 'flag');
    // ground floor: the great hall
    for (let z = -6; z <= -3; z++) { s.put(0, 1, z, 'table'); s.put(-1, 1, z, 'chair', 1); s.put(1, 1, z, 'chair', 3); }
    s.put(0, 2, -5, 'candles'); s.put(0, 2, -3, 'candles');
    s.put(0, 1, -7, 'throne', 0); s.put(-4, 1, -4, 'fireplace', 1); s.put(4, 1, -6, 'bookshelf', 3); s.put(4, 1, -5, 'bookshelf', 3);
    for (let x = -1; x <= 1; x++) s.put(x, 1, -1, 'rug');
    // second floor: bedrooms
    s.put(-3, 6, -7, 'bed', 0); s.put(3, 6, -7, 'bed', 0); s.put(-3, 6, -5, 'chest', 0); s.put(3, 6, -5, 'chest', 0);
    s.put(0, 6, -7, 'fireplace', 0); s.put(-4, 6, -2, 'bookshelf', 1); s.put(2, 6, -2, 'flowers'); s.put(0, 6, -3, 'rug');
    // third floor: the storeroom
    for (const [x, z] of [[-4, -7], [-3, -7], [-4, -6], [4, -7], [4, -1], [3, -1]]) s.put(x, 10, z, 'barrel');
    s.put(0, 10, -7, 'chest', 0); s.put(-4, 10, -2, 'table'); s.put(-4, 11, -2, 'candles');

    // courtyard: a fountain, trees, flowers and torches
    for (let x = -1; x <= 1; x++) for (let z = 5; z <= 7; z++) s.put(x, 1, z, x === 0 && z === 6 ? 'water' : 'cobble');
    for (const [x, z] of [[-7, 6], [7, 6], [-8, -9], [8, -9], [-8, 3], [8, 3]]) s.put(x, 1, z, 'tree');
    for (const [x, z] of [[-3, 4], [3, 4], [-6, -2], [6, -2]]) s.put(x, 1, z, 'flowers');
    for (const [x, z] of [[-1, 1], [1, 1], [-2, 9], [2, 9]]) s.put(x, 1, z, 'torch');
    // trees outside the moat, and farther out
    for (const [x, z] of [[-18, -17], [17, -18], [-18, 6], [18, -4], [-6, 18], [7, 18], [18, 17], [-17, 17],
      [-26, -22], [25, -27], [-28, 18], [27, 22], [-5, -28], [-27, -6], [28, 4], [6, 27], [-35, 30], [36, -12], [12, -38], [-38, -32]]) base.put(x, 0, z, 'tree');
    return { blocks: base.list(), dug: holes };
  }

  /* ---------- landmarks: famous places built from ordinary blocks ---------- */
  // Each landmark is a recipe of blocks around its own center (0, 0, 0), front facing +z.
  // Placing one turns its front toward the player and adds every block that fits (squares that
  // are already filled are skipped), as one step that Undo takes back. Nothing new is saved:
  // a placed landmark is just blocks.
  function shape() {
    const m = new Map();
    const s = {
      put(x, y, z, t, r) { m.set(K(x, y, z), [x, y, z, t, r || 0]); },
      del(x, y, z) { m.delete(K(x, y, z)); },
      box(x0, y0, z0, x1, y1, z1, t) { for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) s.put(x, y, z, t); },
      square(e, y, t, from) { // the ring of squares e steps out from the middle (or from..e when filled)
        for (let x = -e; x <= e; x++) for (let z = -e; z <= e; z++) { const d = Math.max(Math.abs(x), Math.abs(z)); if (d <= e && d >= (from == null ? e : from)) s.put(x, y, z, t); }
      },
      list() { return Array.from(m.values()); }
    };
    return s;
  }
  // the outline of a round (or oval) floor plan: squares inside that touch the outside
  function outline(a, b) {
    const inside = (x, z) => (x / a) * (x / a) + (z / b) * (z / b) <= 1, out = [];
    for (let x = -Math.ceil(a); x <= Math.ceil(a); x++) for (let z = -Math.ceil(b); z <= Math.ceil(b); z++) {
      if (inside(x, z) && (!inside(x + 1, z) || !inside(x - 1, z) || !inside(x, z + 1) || !inside(x, z - 1))) out.push([x, z]);
    }
    return out;
  }
  const LANDMARKS = [
    { id: 'pyramid', name: 'Pyramid', called: 'the Great Pyramid', where: 'The Great Pyramid is in Giza, Egypt.',
      build(s) {
        for (let y = 0; y <= 7; y++) {
          s.square(7 - y, y, y === 7 ? 'gold' : 'sand');
          if (7 - y >= 2) s.square(6 - y, y, 'stone'); // hidden stone that holds up the sand above (sand falls)
        }
        s.put(0, 0, 7, 'gate', 0); s.del(0, 0, 6); s.put(0, 1, 6, 'stone'); // the way in, with a stone above it
        s.put(0, 0, 0, 'chest', 0); s.put(-1, 0, -1, 'gold'); s.put(1, 0, -1, 'gold'); s.put(0, 1, -1, 'gold'); // treasure inside
      } },
    { id: 'eiffel', name: 'Eiffel Tower', called: 'the Eiffel Tower', where: 'The Eiffel Tower is in Paris, France.',
      build(s) {
        const I = 'iron';
        const legs = (a, b, y) => { for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (let i = a; i <= b; i++) for (let j = a; j <= b; j++) s.put(sx * i, y, sz * j, I); };
        for (let y = 0; y <= 1; y++) legs(4, 5, y);
        for (let y = 2; y <= 4; y++) legs(3, 4, y);
        for (const g of [-1, 1]) { // the big arches between the legs
          for (let i = -2; i <= 2; i++) { s.put(i, 4, g * 4, I); s.put(g * 4, 4, i, I); }
          for (const i of [-2, 2]) { s.put(i, 3, g * 4, I); s.put(g * 4, 3, i, I); }
        }
        s.square(4, 5, I, 3); // first floor
        for (let y = 6; y <= 8; y++) legs(2, 3, y);
        s.square(3, 9, I, 2); // second floor
        for (let y = 10; y <= 13; y++) legs(2, 2, y); // four slim legs that meet higher up
        s.square(2, 13, I);
        for (let y = 14; y <= 17; y++) legs(1, 1, y);
        for (let y = 18; y <= 20; y++) s.put(0, y, 0, I);
        s.square(1, 18, I);
        s.square(1, 21, I, 0); // top floor
        for (let y = 22; y <= 24; y++) s.put(0, y, 0, I);
        s.put(0, 25, 0, 'lantern');
      } },
    { id: 'bigben', name: 'Big Ben', called: 'Big Ben', where: 'Big Ben is in London, England.',
      build(s) {
        const W = 'sand';
        for (let y = 0; y <= 17; y++) s.square(2, y, W);
        for (let y = 3; y <= 13; y += 2) for (const a of [-1, 1]) for (const g of [-1, 1]) { s.put(a, y, g * 2, 'window'); s.put(g * 2, y, a, 'window'); }
        s.put(0, 0, 2, 'gate', 0);
        for (const g of [-1, 1]) for (let a = -1; a <= 1; a++) for (let y = 15; y <= 17; y++) { s.put(a, y, g * 2, 'gold'); s.put(g * 2, y, a, 'gold'); }
        for (const g of [-1, 1]) { s.put(0, 16, g * 2, 'clock'); s.put(g * 2, 16, 0, 'clock'); }
        for (let y = 18; y <= 19; y++) s.square(2, y, W);
        for (const g of [-1, 1]) for (const a of [-1, 0, 1]) { s.put(a, 18, g * 2, 'gate', 0); s.put(g * 2, 18, a, 'gate', 1); } // the bell room
        s.square(2, 20, 'black', 0);
        s.square(1, 21, 'black', 0); s.square(1, 22, 'black', 0);
        s.put(0, 23, 0, 'black'); s.put(0, 24, 0, 'black'); s.put(0, 25, 0, 'gold');
        for (const x of [-2, 2]) for (const z of [-2, 2]) s.put(x, 21, z, 'gold');
      } },
    { id: 'liberty', name: 'Lady Liberty', called: 'the Statue of Liberty', where: 'The Statue of Liberty is in New York, USA.',
      build(s) {
        const P = 'stone', G = 'teal';
        s.square(4, 0, P); s.square(4, 1, P, 0); // base
        for (let y = 2; y <= 7; y++) s.square(2, y, P);
        for (const g of [-1, 1]) for (let y = 4; y <= 5; y++) { s.put(0, y, g * 2, 'window'); s.put(g * 2, y, 0, 'window'); }
        s.square(2, 8, P, 0);
        s.box(-1, 9, -1, 1, 16, 0, G); // robe
        s.box(-1, 9, 1, 1, 10, 1, G); // hem and feet
        s.box(-1, 17, -1, 1, 17, 0, G); // shoulders
        s.box(0, 18, -1, 0, 19, 0, G); // head
        s.box(-1, 20, 0, 1, 20, 0, G); s.put(-1, 21, 0, G); s.put(1, 21, 0, G); // crown with points
        for (let y = 16; y <= 22; y++) s.put(-2, y, 0, G); // the raised arm (her right)
        s.put(-2, 23, 0, 'gold'); s.put(-2, 24, 0, 'torch');
        s.put(2, 15, 0, G); s.put(2, 14, 0, G); s.put(2, 13, 1, 'stone'); s.put(2, 14, 1, 'stone'); // arm and tablet
      } },
    { id: 'pisa', name: 'Leaning Tower', called: 'the Leaning Tower of Pisa', where: 'The Leaning Tower is in Pisa, Italy.',
      build(s) {
        const ring = outline(3.4, 3.4), core = outline(2.4, 2.4), W = 'white';
        for (let y = 0; y <= 15; y++) {
          const off = Math.floor(y / 4); // it leans a little more on every floor
          const gallery = y >= 3 && y % 2 === 1; // rows of columns with the wall set back behind them
          for (const [x, z] of ring) if (!gallery || (x + z) % 2 === 0) s.put(x + off, y, z, W);
          if (gallery) for (const [x, z] of core) s.put(x + off, y, z, W);
        }
        for (const [x, z] of core) { if ((x + z) % 2 === 0) s.put(x + 4, 16, z, W); s.put(x + 4, 17, z, W); } // the bell room
        s.put(4, 16, 0, 'lantern'); // the bell
      } },
    { id: 'colosseum', name: 'Colosseum', called: 'the Colosseum', where: 'The Colosseum is in Rome, Italy.',
      build(s) {
        const a = 9.5, b = 7.5;
        for (const [x, z] of outline(a, b)) {
          const ang = Math.atan2(-z, x), ruin = ang > 0.35 && ang < 1.75; // the broken side
          const top = ruin ? 2 + Math.round(Math.abs(ang - 1.05) * 3) : 5;
          const r = Math.abs(z / (b * b)) >= Math.abs(x / (a * a)) ? 0 : 1; // arches face out
          for (let y = 0; y <= Math.min(top, 5); y++) s.put(x, y, z, y === 5 ? (Math.abs(x + z) % 2 ? 'window' : 'sand') : y % 2 ? 'sand' : 'gate', y % 2 || y === 5 ? 0 : r);
        }
        for (const [x, z] of outline(a - 3, b - 3)) { s.put(x, 0, z, 'sand'); s.put(x, 1, z, 'slab'); } // the stands
        for (const [x, z] of outline(a - 4, b - 4)) s.put(x, 0, z, 'sand');
      } },
    { id: 'stonehenge', name: 'Stonehenge', called: 'Stonehenge', where: 'Stonehenge is in Wiltshire, England.',
      build(s) {
        const S = 'stone', R = 6, missing = [7, 8];
        for (let k = 0; k < 12; k++) {
          if (missing.includes(k)) continue;
          const a = k * Math.PI / 6, x = Math.round(Math.cos(a) * R), z = Math.round(Math.sin(a) * R);
          for (let y = 0; y <= 2; y++) s.put(x, y, z, S);
        }
        for (let d = 0; d < 360; d += 2) { // the lintels on top
          const a = d * Math.PI / 180;
          if (a > 3.4 && a < 4.5) continue;
          s.put(Math.round(Math.cos(a) * R), 3, Math.round(Math.sin(a) * R), S);
        }
        for (let x = -5; x <= -3; x++) s.put(x, 0, -2, S); // a fallen stone
        const tri = (x0, z0, alongX) => { // two tall stones and a stone across the top
          const at = (d, y) => s.put(alongX ? x0 + d : x0, y, alongX ? z0 : z0 + d, S);
          for (const d of [-1, 1]) for (let y = 0; y <= 3; y++) at(d, y);
          for (let d = -1; d <= 1; d++) at(d, 4);
        };
        tri(0, -3, true); tri(-3, -1, false); tri(3, -1, false);
        s.put(0, 0, 0, 'slab');
      } },
    { id: 'greatwall', name: 'Great Wall', called: 'the Great Wall', where: 'The Great Wall is in China.',
      build(s) {
        const S = 'stone';
        const hill = (x, z) => Math.max(0, Math.round(5 - Math.abs(x) * 0.55 - Math.abs(z) * 0.75));
        for (let x = -10; x <= 10; x++) for (let z = -7; z <= 7; z++) { // a grassy hill (only its outside)
          const h = hill(x, z), low = Math.min(hill(x + 1, z), hill(x - 1, z), hill(x, z + 1), hill(x, z - 1));
          for (let y = Math.max(0, Math.min(low, h - 1)); y < h; y++) s.put(x, y, z, y === h - 1 ? 'grass' : 'dirt');
        }
        const wallAt = (x, z0, z1, top) => { for (let z = z0; z <= z1; z++) for (let y = hill(x, z); y <= top; y++) s.put(x, y, z, S); };
        for (let x = -14; x <= 14; x++) { // the wall climbs over the hill
          const y0 = hill(x, 0);
          wallAt(x, -1, 1, y0 + 2);
          s.put(x, y0 + 3, -1, 'battlement'); s.put(x, y0 + 3, 1, 'battlement');
        }
        for (const tx of [-12, 0, 12]) { // watchtowers
          const base = hill(tx, 0), top = base + 4;
          for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) {
            const edge = Math.max(Math.abs(x), Math.abs(z)) === 2;
            if (edge) wallAt(tx + x, z, z, top); else s.put(tx + x, top, z, S);
            if (edge && (x === 0 || z === 0)) s.put(tx + x, top - 1, z, 'window');
            if (edge) s.put(tx + x, top + 1, z, 'battlement');
          }
        }
      } },
    { id: 'moai', name: 'Moai', called: 'the Moai', where: 'The Moai are on Easter Island (Rapa Nui), Chile.',
      build(s) {
        const H = 'cobble';
        s.box(-6, 0, -1, 6, 0, 1, 'stone'); // the platform
        for (const cx of [-4, 0, 4]) {
          s.box(cx - 1, 1, -1, cx + 1, 6, 0, H); // body and head
          for (let i = -1; i <= 1; i++) s.put(cx + i, 5, 1, H); // brow
          s.put(cx, 4, 1, H); s.put(cx, 3, 1, H); // nose
          s.del(cx - 1, 4, 0); s.del(cx + 1, 4, 0); // deep eyes under the brow
        }
        s.box(-1, 7, -1, 1, 7, 0, 'brick'); // a red topknot on the middle one
      } }
  ];
  const LANDMARK = {};
  for (const l of LANDMARKS) {
    const s = shape();
    l.build(s);
    l.blocks = s.list();
    l.min = [Infinity, Infinity, Infinity]; l.max = [-Infinity, -Infinity, -Infinity];
    for (const e of l.blocks) for (let i = 0; i < 3; i++) { l.min[i] = Math.min(l.min[i], e[i]); l.max[i] = Math.max(l.max[i], e[i]); }
    LANDMARK[l.id] = l;
  }
  // The tray shows pieces and landmarks; only pieces are ever saved.
  const TILES = [];
  for (const p of PIECES) {
    if (p.id === 'grass') TILES.push({ id: 'dig', name: 'Dig', cat: 'nature', tool: true }); // a shovel: tap the ground to dig a hole
    TILES.push(p);
  }
  TILES.push(...LANDMARKS.map((l) => ({ id: l.id, name: l.name, cat: 'landmarks', landmark: l })));
  const TILE = Object.fromEntries(TILES.map((p) => [p.id, p]));
  function turnXZ(x, z, r) { return r === 1 ? [z, -x] : r === 2 ? [-x, -z] : r === 3 ? [-z, x] : [x, z]; } // matches pieceYaw
  function turnRot(t, br, r) { return FACE4.has(t) ? (br + r) % 4 : FACE2.has(t) ? (br + r) % 2 : br; }
  function landmarkSpot(l, at, r) { // the box it would fill, and whether it fits on the island
    const [ax, az] = turnXZ(l.min[0], l.min[2], r), [bx, bz] = turnXZ(l.max[0], l.max[2], r);
    const min = { x: at.x + Math.min(ax, bx), y: at.y, z: at.z + Math.min(az, bz) };
    const max = { x: at.x + Math.max(ax, bx), y: at.y + l.max[1], z: at.z + Math.max(az, bz) };
    return { min, max, ok: inBounds(min.x, min.y, min.z) && inBounds(max.x, max.y, max.z) };
  }
  function placeLandmark(l, at, r) {
    if (!landmarkSpot(l, at, r).ok) {
      toast('There isn’t room for ' + l.called + ' here. Try a big open space' + (half < MAX_HALF ? ', or make the island bigger from the ⋯ menu.' : '.'));
      return false;
    }
    const added = [];
    for (const [x, y, z, t, br] of l.blocks) {
      const [dx, dz] = turnXZ(x, z, r), rr = turnRot(t, br, r);
      const X = at.x + dx, Y = at.y + y, Z = at.z + dz;
      if (addBlock(X, Y, Z, t, rr, { pop: true, delay: y * 45 + Math.random() * 120 })) added.push([X, Y, Z, t, rr]);
    }
    if (!added.length) return false;
    pushUndo({ op: 'many', list: added });
    toast(l.where);
    return true;
  }

  const CHAR_IDS = ['knight', 'queen', 'sheep', 'chicken', 'cat', 'dragon'];
  const CHAR_SET = new Set(CHAR_IDS);
  const MAX_CHARS = 40;
  const CM = {
    steel: std({ color: '#c9ced8', roughness: 0.35, metalness: 0.55 }),
    steelDark: std({ color: '#6c7280', roughness: 0.5, metalness: 0.4 }),
    belt: std({ color: '#5a3d27' }),
    dark: new THREE.MeshBasicMaterial({ color: '#16181f' }),
    red: std({ color: '#c8372d', roughness: 0.7 }),
    royal: std({ color: '#2d4cc0', roughness: 0.7 }),
    skin: std({ color: '#efc4a0', roughness: 0.8 }),
    hair: std({ color: '#4a2e1f' }),
    purple: std({ color: '#7b3fb0', roughness: 0.75 }),
    wool: std({ color: '#f7f5ef', flatShading: true, roughness: 1 }),
    face: std({ color: '#3b3a40', roughness: 0.8 }),
    eyeWhite: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
    white: std({ color: '#fbfbf8', roughness: 0.85 }),
    orange: std({ color: '#f39c2b', roughness: 0.7 }),
    comb: std({ color: '#e0352b', roughness: 0.7 }),
    ginger: std({ color: '#e8913a', roughness: 0.8 }),
    cream: std({ color: '#f6e3c6', roughness: 0.8 }),
    pink: std({ color: '#f29bb0', roughness: 0.8 }),
    eyeGreen: new THREE.MeshBasicMaterial({ color: '#3d8f3a' }),
    dragon: std({ color: '#3fae8c', roughness: 0.6, flatShading: true }),
    belly: std({ color: '#f4d58d', roughness: 0.7 }),
    wing: std({ color: '#2c7f8f', roughness: 0.6, side: THREE.DoubleSide, flatShading: true }),
    horn: std({ color: '#f6e7b8', roughness: 0.6 })
  };
  const CG = {
    sph: new THREE.SphereGeometry(1, 14, 10), ico: new THREE.IcosahedronGeometry(1, 1),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 12), cone: new THREE.ConeGeometry(1, 1, 12), box: new THREE.BoxGeometry(1, 1, 1)
  };
  CG.wing = (() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      0, 0, 0.14, 0.78, 0.22, -0.16, 0, 0, -0.24,
      0, 0, -0.24, 0.78, 0.22, -0.16, 0.46, 0.02, -0.46
    ]), 3));
    g.computeVertexNormals();
    return g;
  })();
  const HIT_CHAR = new THREE.BoxGeometry(0.6, 0.9, 0.6);
  const HIT_DRAGON = new THREE.BoxGeometry(1.1, 1.2, 1.7);
  function part(parent, geo, mat, sc, pos, rot) {
    const m = new THREE.Mesh(geo, mat);
    m.scale.set(sc[0], sc[1], sc[2]);
    m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    m.castShadow = true; m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  const BUILD = {
    knight(g) {
      part(g, CG.cyl, CM.steelDark, [0.055, 0.22, 0.055], [0.065, 0.11, 0]);
      part(g, CG.cyl, CM.steelDark, [0.055, 0.22, 0.055], [-0.065, 0.11, 0]);
      part(g, CG.cyl, CM.steel, [0.15, 0.3, 0.15], [0, 0.37, 0]);
      part(g, CG.cyl, CM.belt, [0.155, 0.04, 0.155], [0, 0.25, 0]);
      part(g, CG.box, CM.red, [0.2, 0.27, 0.03], [0, 0.37, 0.145]);
      part(g, CG.sph, M.gold, [0.04, 0.04, 0.012], [0, 0.39, 0.162]);
      part(g, CG.cyl, CM.steel, [0.045, 0.22, 0.045], [0.19, 0.37, 0], [0, 0, 0.12]);
      part(g, CG.cyl, CM.steel, [0.045, 0.22, 0.045], [-0.19, 0.37, 0], [0, 0, -0.12]);
      part(g, CG.sph, CM.steel, [0.14, 0.14, 0.14], [0, 0.63, 0]);
      part(g, CG.box, CM.dark, [0.17, 0.025, 0.03], [0, 0.64, 0.128]);
      part(g, CG.sph, CM.red, [0.045, 0.12, 0.1], [0, 0.8, -0.02]);
      part(g, CG.cyl, CM.royal, [0.13, 0.025, 0.13], [-0.25, 0.37, 0.04], [0, 0, Math.PI / 2]);
      part(g, CG.sph, M.gold, [0.03, 0.03, 0.03], [-0.265, 0.37, 0.04]);
      part(g, CG.box, CM.steel, [0.025, 0.3, 0.012], [0.24, 0.42, 0.09]);
      part(g, CG.box, M.gold, [0.09, 0.022, 0.022], [0.24, 0.27, 0.09]);
    },
    queen(g) {
      part(g, CG.cone, CM.purple, [0.25, 0.44, 0.25], [0, 0.22, 0]);
      part(g, CG.cyl, CM.purple, [0.1, 0.18, 0.1], [0, 0.45, 0]);
      part(g, CG.cyl, M.gold, [0.106, 0.025, 0.106], [0, 0.37, 0]);
      part(g, CG.cyl, CM.skin, [0.035, 0.2, 0.035], [0.13, 0.42, 0.02], [0, 0, 0.3]);
      part(g, CG.cyl, CM.skin, [0.035, 0.2, 0.035], [-0.13, 0.42, 0.02], [0, 0, -0.3]);
      part(g, CG.sph, CM.hair, [0.13, 0.13, 0.12], [0, 0.66, -0.03]);
      part(g, CG.sph, CM.skin, [0.115, 0.12, 0.115], [0, 0.65, 0.01]);
      part(g, CG.sph, CM.hair, [0.06, 0.06, 0.06], [0, 0.7, -0.15]);
      part(g, CG.sph, CM.dark, [0.014, 0.018, 0.01], [0.04, 0.66, 0.12]);
      part(g, CG.sph, CM.dark, [0.014, 0.018, 0.01], [-0.04, 0.66, 0.12]);
      part(g, CG.cyl, M.gold, [0.085, 0.06, 0.085], [0, 0.79, 0]);
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; part(g, CG.cone, M.gold, [0.022, 0.06, 0.022], [Math.sin(a) * 0.075, 0.85, Math.cos(a) * 0.075]); }
      part(g, CG.sph, CM.red, [0.018, 0.018, 0.018], [0, 0.8, 0.088]);
    },
    sheep(g) {
      for (const [x, y, z, r] of [[0, 0.4, 0, 0.2], [0.1, 0.36, 0.1, 0.16], [-0.1, 0.36, 0.1, 0.16], [0.1, 0.36, -0.1, 0.16], [-0.1, 0.36, -0.1, 0.16], [0, 0.46, -0.06, 0.15], [0, 0.44, 0.1, 0.14]])
        part(g, CG.ico, CM.wool, [r, r * 0.9, r], [x, y, z]);
      for (const [x, z] of [[0.09, 0.11], [-0.09, 0.11], [0.09, -0.11], [-0.09, -0.11]]) part(g, CG.cyl, CM.face, [0.035, 0.24, 0.035], [x, 0.12, z]);
      part(g, CG.sph, CM.face, [0.1, 0.11, 0.13], [0, 0.42, 0.25]);
      part(g, CG.sph, CM.face, [0.06, 0.025, 0.035], [0.11, 0.45, 0.22], [0, 0, -0.4]);
      part(g, CG.sph, CM.face, [0.06, 0.025, 0.035], [-0.11, 0.45, 0.22], [0, 0, 0.4]);
      part(g, CG.sph, CM.eyeWhite, [0.022, 0.022, 0.015], [0.045, 0.45, 0.355]);
      part(g, CG.sph, CM.eyeWhite, [0.022, 0.022, 0.015], [-0.045, 0.45, 0.355]);
      part(g, CG.ico, CM.wool, [0.07, 0.06, 0.07], [0, 0.53, 0.22]);
    },
    chicken(g) {
      part(g, CG.sph, CM.white, [0.14, 0.13, 0.17], [0, 0.22, 0]);
      part(g, CG.cone, CM.white, [0.07, 0.15, 0.07], [0, 0.31, -0.15], [-0.8, 0, 0]);
      part(g, CG.sph, CM.white, [0.085, 0.085, 0.085], [0, 0.38, 0.11]);
      part(g, CG.cone, CM.orange, [0.025, 0.07, 0.025], [0, 0.37, 0.215], [Math.PI / 2, 0, 0]);
      part(g, CG.sph, CM.comb, [0.02, 0.04, 0.05], [0, 0.47, 0.11]);
      part(g, CG.sph, CM.comb, [0.02, 0.025, 0.02], [0, 0.32, 0.18]);
      part(g, CG.sph, CM.dark, [0.014, 0.014, 0.014], [0.06, 0.4, 0.165]);
      part(g, CG.sph, CM.dark, [0.014, 0.014, 0.014], [-0.06, 0.4, 0.165]);
      part(g, CG.sph, CM.white, [0.03, 0.08, 0.11], [0.13, 0.23, 0]);
      part(g, CG.sph, CM.white, [0.03, 0.08, 0.11], [-0.13, 0.23, 0]);
      part(g, CG.cyl, CM.orange, [0.012, 0.1, 0.012], [0.05, 0.05, 0]);
      part(g, CG.cyl, CM.orange, [0.012, 0.1, 0.012], [-0.05, 0.05, 0]);
    },
    cat(g) {
      part(g, CG.sph, CM.ginger, [0.11, 0.1, 0.2], [0, 0.2, -0.02]);
      for (const [x, z] of [[0.06, 0.1], [-0.06, 0.1], [0.06, -0.12], [-0.06, -0.12]]) part(g, CG.cyl, CM.ginger, [0.03, 0.14, 0.03], [x, 0.07, z]);
      part(g, CG.sph, CM.ginger, [0.1, 0.095, 0.095], [0, 0.31, 0.19]);
      part(g, CG.cone, CM.ginger, [0.035, 0.07, 0.025], [0.055, 0.41, 0.18]);
      part(g, CG.cone, CM.ginger, [0.035, 0.07, 0.025], [-0.055, 0.41, 0.18]);
      part(g, CG.sph, CM.cream, [0.06, 0.045, 0.04], [0, 0.28, 0.26]);
      part(g, CG.sph, CM.pink, [0.014, 0.01, 0.01], [0, 0.3, 0.295]);
      part(g, CG.sph, CM.eyeGreen, [0.017, 0.02, 0.01], [0.04, 0.33, 0.275]);
      part(g, CG.sph, CM.eyeGreen, [0.017, 0.02, 0.01], [-0.04, 0.33, 0.275]);
      part(g, CG.cyl, CM.ginger, [0.022, 0.26, 0.022], [0, 0.32, -0.26], [-0.5, 0, 0]);
    },
    dragon(g) {
      part(g, CG.sph, CM.dragon, [0.3, 0.26, 0.45], [0, 0.55, 0]);
      part(g, CG.sph, CM.belly, [0.22, 0.2, 0.36], [0, 0.5, 0.07]);
      part(g, CG.cyl, CM.dragon, [0.1, 0.32, 0.1], [0, 0.78, 0.36], [0.6, 0, 0]);
      part(g, CG.sph, CM.dragon, [0.17, 0.15, 0.2], [0, 0.96, 0.5]);
      part(g, CG.sph, CM.dragon, [0.11, 0.09, 0.12], [0, 0.91, 0.66]);
      g.userData.wings = [];
      for (const sx of [1, -1]) {
        part(g, CG.sph, CM.eyeWhite, [0.045, 0.045, 0.03], [sx * 0.085, 1.0, 0.6]);
        part(g, CG.sph, CM.dark, [0.022, 0.026, 0.015], [sx * 0.09, 1.0, 0.628]);
        part(g, CG.cone, CM.horn, [0.03, 0.13, 0.03], [sx * 0.08, 1.11, 0.43], [-0.45, 0, 0]);
        part(g, CG.cyl, CM.dragon, [0.07, 0.22, 0.07], [sx * 0.17, 0.13, 0.2]);
        part(g, CG.cyl, CM.dragon, [0.07, 0.22, 0.07], [sx * 0.17, 0.13, -0.2]);
        const pivot = new THREE.Group();
        pivot.position.set(sx * 0.2, 0.72, 0.02);
        pivot.scale.x = sx;
        pivot.userData.sx = sx;
        const w = new THREE.Mesh(CG.wing, CM.wing);
        w.castShadow = true;
        pivot.add(w);
        g.add(pivot);
        g.userData.wings.push(pivot);
      }
      part(g, CG.cone, CM.dragon, [0.13, 0.62, 0.13], [0, 0.5, -0.62], [-Math.PI / 2 + 0.25, 0, 0]);
      for (const [y, z, k] of [[0.83, 0.1, 1], [0.82, -0.1, 0.9], [0.77, -0.3, 0.8]]) part(g, CG.cone, CM.horn, [0.035 * k, 0.1 * k, 0.035 * k], [0, y, z]);
    }
  };
  // Each character is built from many small shapes. Shapes with the same material are merged
  // into one mesh (once per kind), so a character costs a handful of draw calls instead of ~15.
  const charParts = {};
  function makeCharacter(kind) {
    const g = new THREE.Group();
    BUILD[kind](g);
    const shapes = g.children.filter((m) => m.isMesh); // the dragon's wings are groups and stay separate
    shapes.forEach((m) => g.remove(m));
    if (!charParts[kind]) {
      const byMat = new Map();
      for (const m of shapes) {
        m.updateMatrix();
        if (!byMat.has(m.material)) byMat.set(m.material, []);
        byMat.get(m.material).push(m.geometry.clone().applyMatrix4(m.matrix));
      }
      charParts[kind] = Array.from(byMat, ([mat, list]) => [mat, merge(list)]);
    }
    for (const [mat, geo] of charParts[kind]) g.add(mk(geo, mat));
    return g;
  }

  const CHAR_SPEC = {
    knight: { dur: 0.55, idle: [0.3, 2], hop: 0.035 },
    queen: { dur: 0.85, idle: [1, 3.5], hop: 0.012 },
    sheep: { dur: 0.95, idle: [1.2, 5], hop: 0.025 },
    chicken: { dur: 0.32, idle: [0.25, 1.6], hop: 0.07 },
    cat: { dur: 0.45, idle: [0.6, 4], hop: 0.025 },
    dragon: { fly: true }
  };
  const chars = [];
  const charHits = [];
  let charSeq = 0;
  const NOSTAND = new Set(['water', 'lava', 'roof', 'flag', 'torch', 'tree', 'fence', 'lantern', 'door',
    'table', 'chair', 'bench', 'throne', 'candles', 'flowers', 'rug']);
  const PASS = new Set(['gate', 'door', 'rug']);
  const passable = (x, y, z) => { if (isEarth(x, y, z)) return false; const b = world.get(K(x, y, z)); return !b || PASS.has(b.t); };
  const supported = (x, y, z) => { if (isEarth(x, y - 1, z)) return true; const b = world.get(K(x, y - 1, z)); return !!b && !NOSTAND.has(b.t); };
  const canStand = (x, y, z) => inBounds(x, y, z) && passable(x, y, z) && supported(x, y, z);
  function footY(x, y, z) {
    const below = world.get(K(x, y - 1, z)), here = world.get(K(x, y, z));
    return (below && TOP[below.t] ? y - 1 + TOP[below.t] : y) + (here && here.t === 'rug' ? 0.025 : 0);
  }
  function findStand(x, y, z) {
    for (let yy = Math.min(y, MAXY - 1); yy >= -DEPTH; yy--) if (canStand(x, yy, z)) return yy;
    for (let yy = y + 1; yy < MAXY; yy++) if (canStand(x, yy, z)) return yy;
    return -1;
  }
  function placeDragon(c, t) {
    const R = 7, alt = c.home.y + 7;
    c.obj.position.set(c.home.x + 0.5 + Math.cos(c.ang) * R, alt + Math.sin(t * 1.3 + c.id) * 0.4, c.home.z + 0.5 + Math.sin(c.ang) * R);
    c.obj.rotation.y = Math.atan2(-Math.sin(c.ang), Math.cos(c.ang));
  }
  function addChar(kind, x, y, z, opts) {
    opts = opts || {};
    if (!CHAR_SET.has(kind) || chars.length >= MAX_CHARS || !inBounds(x, y, z)) return null;
    const obj = makeCharacter(kind);
    const hit = new THREE.Mesh(kind === 'dragon' ? HIT_DRAGON : HIT_CHAR, M.hit);
    hit.visible = false;
    hit.position.y = kind === 'dragon' ? 0.6 : 0.4;
    obj.add(hit);
    const c = {
      id: ++charSeq, kind, obj, hit, cell: { x, y, z }, home: { x, y, z }, spec: CHAR_SPEC[kind],
      moving: false, t: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), wait: Math.random() * 1.5,
      targetYaw: null, jump: 0, ang: Math.random() * Math.PI * 2
    };
    hit.userData.char = c;
    if (kind === 'dragon') placeDragon(c, 0);
    else { obj.position.set(x + 0.5, footY(x, y, z), z + 0.5); obj.rotation.y = Math.random() * Math.PI * 2; }
    scene.add(obj);
    chars.push(c); charHits.push(hit);
    if (opts.pop) startPop(obj, 0);
    if (opts.record) pushUndo({ op: 'addChar', id: c.id, kind, x, y, z });
    return c;
  }
  const charSpot = (c) => (c.kind === 'dragon' ? c.home : c.cell);
  function removeChar(c, opts) {
    const i = chars.indexOf(c);
    if (i < 0) return false;
    chars.splice(i, 1);
    charHits.splice(charHits.indexOf(c.hit), 1);
    scene.remove(c.obj);
    if (opts && opts.record) { const s = charSpot(c); pushUndo({ op: 'removeChar', kind: c.kind, x: s.x, y: s.y, z: s.z }); }
    return true;
  }
  function keepCharsOnIsland() {
    const inside = (p) => inBounds(p.x, 0, p.z);
    const pull = (p) => { p.x = Math.max(-half, Math.min(half - 1, p.x)); p.z = Math.max(-half, Math.min(half - 1, p.z)); };
    for (const c of chars) {
      if (inside(c.home) && (c.kind === 'dragon' || inside(c.cell))) continue;
      pull(c.home);
      if (c.kind !== 'dragon') { c.cell = { x: c.home.x, y: Math.max(0, findStand(c.home.x, c.home.y, c.home.z)), z: c.home.z }; c.moving = false; }
    }
  }
  function serializeChars() { return chars.map((c) => { const s = charSpot(c); return [c.kind, s.x, s.y, s.z]; }); }
  function validChars(list) {
    return Array.isArray(list) && list.every((e) => Array.isArray(e) && e.length >= 4 && CHAR_SET.has(e[0]) &&
      Number.isInteger(e[1]) && Number.isInteger(e[2]) && Number.isInteger(e[3]) && inMax(e[1], e[2], e[3]));
  }
  function loadChars(list) {
    while (chars.length) removeChar(chars[0]);
    for (const e of (list || [])) addChar(e[0], e[1], e[2], e[3]);
  }
  function sampleChars() {
    return [['knight', 0, 0, 8], ['knight', 0, 0, 18], ['queen', 0, 0, 3], ['sheep', -18, 0, 2], ['sheep', -17, 0, 9], ['sheep', 19, 0, -8],
      ['chicken', -5, 0, 6], ['chicken', 5, 0, 7], ['cat', 2, 0, -2], ['dragon', 0, 12, -4]];
  }
  function starterChars() { // the sample cast, set down on whatever is built there
    const out = [];
    for (const [k, x, , z] of sampleChars()) {
      if (k === 'dragon') { out.push([k, x, 0, z]); continue; }
      const y = findStand(x, 20, z);
      if (y >= 0) out.push([k, x, y, z]);
    }
    return out;
  }
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  function chooseStep(c) {
    const { x, y, z } = c.cell;
    const dirs = DIRS.slice().sort(() => Math.random() - 0.5);
    if (Math.hypot(x - c.home.x, z - c.home.z) > 9 && Math.random() < 0.7)
      dirs.sort((a, b) => Math.hypot(x + a[0] - c.home.x, z + a[1] - c.home.z) - Math.hypot(x + b[0] - c.home.x, z + b[1] - c.home.z));
    for (const [dx, dz] of dirs) {
      const nx = x + dx, nz = z + dz;
      for (const ny of [y, y + 1, y - 1, y - 2]) {
        if (ny < 0) continue;
        if (ny === y + 1 && !passable(x, y + 1, z)) continue;
        if (canStand(nx, ny, nz)) {
          c.from.set(x + 0.5, footY(x, y, z), z + 0.5);
          c.to.set(nx + 0.5, footY(nx, ny, nz), nz + 0.5);
          c.cell = { x: nx, y: ny, z: nz };
          c.moving = true; c.t = 0;
          c.targetYaw = Math.atan2(dx, dz);
          return true;
        }
      }
    }
    return false;
  }
  function poke(c) { c.jump = c.kind === 'dragon' ? 0.6 : 0.45; voice(c.kind); }
  function updateChars(dt, t) {
    for (const c of chars) {
      if (c.kind === 'dragon') {
        c.ang += dt * 0.42;
        placeDragon(c, t);
        for (const w of c.obj.userData.wings) w.rotation.z = w.userData.sx * (Math.sin(t * 6 + c.id) * 0.55 + 0.15);
        if (c.jump > 0) { c.jump = Math.max(0, c.jump - dt); c.obj.rotation.z = Math.sin((1 - c.jump / 0.6) * Math.PI * 2) * 0.5; }
        else c.obj.rotation.z = 0;
        continue;
      }
      const sp = c.spec;
      let bob = 0;
      if (c.moving) {
        c.t += dt / sp.dur;
        const k = Math.min(1, c.t);
        c.obj.position.lerpVectors(c.from, c.to, k);
        if (c.to.y !== c.from.y) c.obj.position.y += Math.sin(k * Math.PI) * 0.3;
        if (!reduceMotion) bob = Math.abs(Math.sin(k * Math.PI * 2)) * sp.hop;
        if (k >= 1) { c.moving = false; c.wait = sp.idle[0] + Math.random() * (sp.idle[1] - sp.idle[0]); }
      } else {
        const { x, y, z } = c.cell;
        if (!canStand(x, y, z)) { const ny = findStand(x, y, z); if (ny >= 0) c.cell = { x, y: ny, z }; }
        c.obj.position.set(c.cell.x + 0.5, footY(c.cell.x, c.cell.y, c.cell.z), c.cell.z + 0.5);
        c.wait -= dt;
        if (c.wait <= 0 && !chooseStep(c)) c.wait = 1 + Math.random() * 2;
      }
      if (c.targetYaw !== null) {
        const d = Math.atan2(Math.sin(c.targetYaw - c.obj.rotation.y), Math.cos(c.targetYaw - c.obj.rotation.y));
        c.obj.rotation.y += d * Math.min(1, dt * 10);
      }
      if (c.jump > 0) { c.jump = Math.max(0, c.jump - dt); bob += Math.sin((1 - c.jump / 0.45) * Math.PI) * 0.45; }
      c.obj.position.y += bob;
    }
  }

  /* ---------- undo + save ---------- */
  const undoStack = [];
  const countEl = $('#count'), undoBtn = $('#undo');
  function refreshUI() {
    const n = world.size;
    countEl.textContent = n + (n === 1 ? ' block' : ' blocks') + (chars.length ? ' · ' + chars.length + (chars.length === 1 ? ' friend' : ' friends') : '');
    undoBtn.disabled = undoStack.length === 0;
  }
  function saveLocal() {
    store.set(SAVE_KEY, JSON.stringify(serialize()));
    store.set(CHARS_KEY, JSON.stringify(serializeChars()));
    store.set(NIGHT_KEY, nightTarget === 1 ? '1' : '0');
    store.set(ISLAND_KEY, String(half * 2));
    store.set(DUG_KEY, JSON.stringify(serializeDug()));
  }
  function changed() {
    refreshUI();
    store.set(AT_KEY, String(Date.now()));
    saveLocal();
    scheduleCloudSave();
  }

  /* ---------- online save: Google sign-in + Firestore (Firebase) ---------- */
  // Settings live in js/firebase-config.js. Without them, or if the Firebase scripts can't load,
  // the game keeps saving on this device only. Each player's castle is one Firestore document,
  // castles/{their user id}; the database rules let a signed-in player read and write only their own.
  const saveEl = $('#save');
  const TAB = Math.random().toString(36).slice(2, 10);
  const ASK_KEY = 'stack-a-castle:ask-on-sign-in';
  const cloud = {
    ref: null, unsub: null, user: null, writable: false, seen: false, answered: false, ask: false, hold: false,
    earlyOps: null, latest: null, resolve: null, bootHadLocal: false, bootAt: 0,
    timer: 0, waitTimer: 0, inFlight: false, pending: false, retried: false
  };
  const SAVE_TEXT = {
    loading: ['Connecting…', '', 'Looking for your saved castle. You can keep building.'],
    saving: ['Saving…', '', ''],
    saved: ['Saved online', 'ok', 'Saved to your Google account. It opens the same on any device where you sign in.'],
    device: ['Saved on this device', '', 'Saved in this browser only. Sign in from the ⋯ menu to save online.'],
    slow: ['Can’t reach your save', 'warn', 'Your online save is not answering yet. Your building is kept on this device.'],
    retry: ['Not saved yet', 'warn', 'Saving online failed. It will try again after your next change.'],
    blocked: ['Online save is off', 'warn', 'The online database refused the save. Your castle is kept on this device.'],
    big: ['Too big to save online', 'warn', 'This castle is too big for an online save. It is kept on this device.'],
    full: ['Online storage full', 'warn', 'Online storage is full. Your castle is kept on this device.'],
    newer: ['Update needed', 'warn', 'Your online castle was saved by a newer version of the game. Reload the page to get it. Online saving is paused so nothing is lost.'],
    offline: ['Offline', 'warn', 'No internet right now. Your castle is saved on this device and will save online when you’re back.']
  };
  let saveState = '';
  let online = navigator.onLine !== false;
  function setSave(state) { saveState = state; showSave(); }
  function showSave() { // while signed in and offline, say so instead of "Saving…"
    const st = !online && cloud.ref && cloud.writable ? 'offline' : saveState;
    const s = SAVE_TEXT[st] || ['', '', ''];
    saveEl.textContent = s[0];
    saveEl.className = 'save' + (s[1] ? ' ' + s[1] : '');
    saveEl.title = s[2];
  }
  // A save that uses pieces or characters this copy of the game doesn't know was made by a newer
  // version. It is never loaded over (or saved over) the castle here.
  // Saves since version 4 end with one extra entry using this made-up piece name. Versions
  // 1.1 and 1.2 don't know it, so they say "Update needed" instead of loading (and later
  // overwriting) a castle on an island bigger than they can show. This version skips it.
  const MARKER = 'needs-newer-game';
  function fromNewerGame(d) {
    if (!d || !Array.isArray(d.pieces) || !Array.isArray(d.cells)) return false;
    if ((typeof d.v === 'number' && d.v > 5) || (typeof d.island === 'number' && d.island > MAX_HALF * 2)) return true;
    for (let i = 3; i < d.cells.length; i += 5) { const id = d.pieces[d.cells[i]]; if (typeof id === 'string' && !PIECE[id] && id !== MARKER) return true; }
    if (!Array.isArray(d.charKinds) || !Array.isArray(d.chars)) return false;
    for (let i = 0; i < d.chars.length; i += 4) { const k = d.charKinds[d.chars[i]]; if (typeof k === 'string' && !CHAR_SET.has(k)) return true; }
    return false;
  }
  function cloudNewer() {
    cloud.writable = false;
    cloud.earlyOps = null;
    setSave('newer');
    toast('Your castle was saved by a newer version of the game. Reload the page to get it.');
  }
  function encodeCastle() {
    const ids = PIECES.map((p) => p.id).concat(MARKER), at = new Map(ids.map((id, i) => [id, i])), cells = [], cs = [];
    for (const b of world.values()) cells.push(b.x, b.y, b.z, at.get(b.t), b.r || 0);
    cells.push(0, 0, 0, ids.length - 1, 0); // the marker (see MARKER)
    for (const c of serializeChars()) cs.push(CHAR_IDS.indexOf(c[0]), c[1], c[2], c[3]);
    return { v: 5, island: half * 2, dug: serializeDug(), pieces: ids, cells, charKinds: CHAR_IDS, chars: cs, night: nightTarget === 1, savedAt: Date.now(), writer: TAB };
  }
  const decodeDug = (d) => (d && validDug(d.dug) ? d.dug : []); // holes (version 5 and later)
  function decodeCastle(d) {
    if (!d || !Array.isArray(d.pieces) || !Array.isArray(d.cells) || d.cells.length % 5) return null;
    const out = [];
    for (let i = 0; i < d.cells.length; i += 5) {
      const t = d.pieces[d.cells[i + 3]];
      if (t !== MARKER) out.push([d.cells[i], d.cells[i + 1], d.cells[i + 2], t, d.cells[i + 4] || 0]);
    }
    return validList(out) ? out : null;
  }
  function decodeChars(d) {
    if (!d || !Array.isArray(d.charKinds) || !Array.isArray(d.chars) || d.chars.length % 4) return [];
    const out = [];
    for (let i = 0; i < d.chars.length; i += 4) out.push([d.charKinds[d.chars[i]], d.chars[i + 1], d.chars[i + 2], d.chars[i + 3]]);
    return validChars(out) ? out : [];
  }
  function sameAsWorld(list, charList, width, dugList) {
    const kinds = (a) => a.map((c) => c[0]).sort().join(',');
    if (width > 0 && islandFor(list, charList, width, dugList) !== half) return false;
    if (dugList && (dugList.length / 3 !== dug.size || !dugList.every((v, i) => i % 3 || dug.has(K(v, dugList[i + 1], dugList[i + 2]))))) return false;
    if (charList && kinds(charList) !== kinds(serializeChars())) return false;
    if (list.length !== world.size) return false;
    return list.every((e) => { const b = world.get(K(e[0], e[1], e[2])); return !!b && b.t === e[3] && (b.r || 0) === (e[4] || 0); });
  }
  function scheduleCloudSave(delay) {
    if (!cloud.ref || !cloud.writable) return;
    cloud.pending = true;
    if (!cloud.seen || cloud.hold) return; // hold until we know what is already saved
    setSave('saving');
    clearTimeout(cloud.timer);
    cloud.timer = setTimeout(flushCloud, delay == null ? 900 : delay);
  }
  // Firestore error codes that retrying won't fix
  const FATAL = ['permission-denied', 'unauthenticated', 'not-found', 'failed-precondition', 'invalid-argument'];
  function cloudBlocked(e) {
    cloud.writable = false;
    setSave('blocked');
    const code = e && e.code;
    toast(code === 'permission-denied' ? 'Online save was refused. Check the Firestore rules in Firebase.'
      : (code === 'not-found' || code === 'failed-precondition') ? 'The online database isn’t set up yet (Firebase → Firestore).'
        : 'Online saving stopped. Your castle is kept on this device.');
  }
  async function flushCloud() {
    if (cloud.inFlight || !cloud.pending || !cloud.ref || !cloud.writable || cloud.hold) return;
    const body = encodeCastle();
    cloud.pending = false;
    if (JSON.stringify(body).length > 250000) { setSave('big'); return; }
    cloud.inFlight = true;
    let retry = false;
    try {
      await cloud.ref.set(body);
      cloud.retried = false;
      if (!cloud.pending) setSave('saved');
    } catch (e) {
      const code = e && e.code;
      if (code === 'resource-exhausted') setSave('full');
      else if (FATAL.indexOf(code) !== -1) cloudBlocked(e);
      else if (!cloud.retried) { cloud.retried = true; cloud.pending = true; retry = true; }
      else { cloud.retried = false; setSave('retry'); }
    } finally {
      cloud.inFlight = false;
      if (cloud.pending && cloud.writable) cloud.timer = setTimeout(flushCloud, retry ? 1500 + Math.random() * 1500 : 300);
    }
  }
  function applyRemote(list, d) {
    const charList = Array.isArray(d.chars) ? decodeChars(d) : null, holes = decodeDug(d);
    setIsland(islandFor(list, charList || serializeChars(), d.island, holes), true);
    loadDug(holes);
    loadBlocks(list, false);
    if (charList) loadChars(charList);
    undoStack.length = 0;
    refreshUI();
    if (typeof d.night === 'boolean' && d.night !== (nightTarget === 1)) setNight(d.night);
    saveLocal();
    store.set(AT_KEY, String(d.savedAt || 0));
    refreshGhost();
  }
  function replayOps(ops) {
    for (const a of ops) {
      if (a.op === 'add') addBlock(a.x, a.y, a.z, a.t, a.r);
      else if (a.op === 'remove') removeBlock(a.x, a.y, a.z);
      else if (a.op === 'addChar') addChar(a.kind, a.x, a.y, a.z);
      else if (a.op === 'many') for (const e of a.list) addBlock(e[0], e[1], e[2], e[3], e[4]);
      else if (a.op === 'island' && a.to > half) setIsland(a.to, true);
      else if (a.op === 'dig') digAt(a.x, a.y, a.z);
      redoNature(a);
    }
  }
  function useAccountCastle(list, d, ops, undoable) {
    const before = undoable ? { blocks: serialize(), chars: serializeChars(), island: half * 2, dug: serializeDug() } : null;
    applyRemote(list, d);
    if (before) pushUndo({ op: 'bulk', before });
    if (ops.length) { replayOps(ops); store.set(AT_KEY, String(Date.now())); saveLocal(); }
    refreshUI();
    if (ops.length || cloud.pending) scheduleCloudSave(0); else setSave('saved');
  }
  // First answer from the online save. Building is never blocked while we wait;
  // anything built meanwhile (earlyOps) is replayed on top of the saved castle.
  function firstCloud(d) {
    if (fromNewerGame(d)) { cloudNewer(); return; }
    const ops = cloud.earlyOps || [];
    cloud.earlyOps = null;
    const list = decodeCastle(d);
    if (!list) { scheduleCloudSave(0); return; }
    const charList = Array.isArray(d.chars) ? decodeChars(d) : null;
    if (sameAsWorld(list, charList, d.island, d.v >= 5 ? decodeDug(d) : null)) {
      if (typeof d.night === 'boolean' && d.night !== (nightTarget === 1)) setNight(d.night);
      const needUpgrade = !Array.isArray(d.chars) && chars.length > 0;
      if (ops.length || cloud.pending || needUpgrade) scheduleCloudSave(0); else setSave('saved');
      return;
    }
    if (ops.some((a) => a.op === 'bulk')) { scheduleCloudSave(0); return; }
    if (cloud.ask && cloud.bootHadLocal) { askWhichCastle(list, d, ops); return; } // just signed in: let the player choose
    if (cloud.bootHadLocal && cloud.bootAt > (d.savedAt || 0)) { scheduleCloudSave(0); return; } // this device has newer work
    useAccountCastle(list, d, ops, false);
  }

  /* account vs device: asked once, right after signing in, when the two castles differ */
  const conflictEl = $('#conflict');
  function shortDate(ms) {
    try { return new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
    catch (e) { return ''; }
  }
  function askWhichCastle(list, d, ops) {
    cloud.hold = true;
    $('#acct-meta').textContent = list.length + ' blocks' + (d.savedAt ? ' · saved ' + shortDate(d.savedAt) : '');
    $('#dev-meta').textContent = world.size + ' blocks · on this device';
    conflictEl.hidden = false;
    $('#keep-account').focus();
    cloud.resolve = (choice) => {
      conflictEl.hidden = true;
      cloud.hold = false;
      cloud.resolve = null;
      if (choice === 'account') {
        const dd = cloud.latest || d;
        useAccountCastle(decodeCastle(dd) || list, dd, ops, true);
        toast('Loaded your account’s castle. Undo brings back the one from this device.');
      } else {
        store.set(AT_KEY, String(Date.now()));
        scheduleCloudSave(0);
        toast('Saved this device’s castle to your account.');
      }
      cloud.latest = null;
    };
  }
  $('#keep-account').addEventListener('click', () => { if (cloud.resolve) cloud.resolve('account'); });
  $('#keep-device').addEventListener('click', () => { if (cloud.resolve) cloud.resolve('device'); });

  function onCloud(snap) {
    const md = snap.metadata || {};
    if (!md.fromCache) { cloud.answered = true; clearTimeout(cloud.waitTimer); }
    if (md.hasPendingWrites) return; // our own write, not confirmed yet
    if (!snap.exists) {
      if (md.fromCache || cloud.seen) return; // wait for the server's real answer
      cloud.seen = true; cloud.earlyOps = null;
      scheduleCloudSave(0); // first save for this account: keep what is on this device
      return;
    }
    const d = snap.data() || {};
    if (!cloud.seen) { cloud.seen = true; firstCloud(d); return; }
    if (cloud.hold) { cloud.latest = d; return; }
    if (d.writer === TAB) { if (!cloud.pending && !cloud.inFlight) setSave('saved'); return; }
    if (fromNewerGame(d)) { cloudNewer(); return; }
    if (cloud.pending || cloud.inFlight) return; // this device's newer edits will win
    const list = decodeCastle(d);
    if (!list) return;
    if (!sameAsWorld(list, Array.isArray(d.chars) ? decodeChars(d) : null, d.island, decodeDug(d))) applyRemote(list, d); // live update from another device
    else if (typeof d.night === 'boolean' && d.night !== (nightTarget === 1)) setNight(d.night);
    setSave('saved');
  }

  let fb = null;        // { auth, db } once Firebase is set up
  let askNext = false;  // the next sign-in came from the player tapping "Sign in"
  function disconnectCloud() {
    if (cloud.unsub) { try { cloud.unsub(); } catch (e) { /* already closed */ } }
    clearTimeout(cloud.timer);
    clearTimeout(cloud.waitTimer);
    conflictEl.hidden = true;
    Object.assign(cloud, {
      ref: null, unsub: null, user: null, writable: false, seen: false, answered: false, ask: false, hold: false,
      earlyOps: null, latest: null, resolve: null, inFlight: false, pending: false, retried: false
    });
  }
  function connectCloud(user, ask) {
    disconnectCloud();
    cloud.user = user;
    cloud.ask = ask;
    cloud.earlyOps = [];
    cloud.bootAt = Number(store.get(AT_KEY) || 0);
    cloud.bootHadLocal = cloud.bootAt > 0; // this device has edits of its own
    setSave('loading');
    cloud.waitTimer = setTimeout(() => { if (!cloud.answered) setSave('slow'); }, 10000);
    try {
      cloud.ref = fb.db.collection('castles').doc(user.uid);
      cloud.writable = true;
      cloud.unsub = cloud.ref.onSnapshot(onCloud, (e) => {
        clearTimeout(cloud.waitTimer);
        if (e && FATAL.indexOf(e.code) !== -1) cloudBlocked(e);
        else if (!cloud.answered) setSave('slow');
      });
    } catch (e) { cloudBlocked(e); }
  }

  const accountBtn = $('#m-account');
  function showAccount(user) {
    $('#account-label').textContent = user ? 'Sign out' : 'Sign in to save online';
    $('#account-state').textContent = user ? ((user.displayName || '').split(' ')[0] || user.email || '') : '';
  }
  function signInError(e) {
    const code = (e && e.code) || '';
    if (!code || code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
    if (code === 'auth/unauthorized-domain') toast('This website isn’t on Firebase’s allowed list yet (Authentication → Settings → Authorized domains).');
    else if (code === 'auth/operation-not-allowed' || code === 'auth/configuration-not-found') toast('Google sign-in isn’t turned on in Firebase yet (Authentication → Sign-in method).');
    else if (code === 'auth/network-request-failed') toast('No internet connection. Try again when you’re online.');
    else toast('Sign-in didn’t work. Please try again.');
  }
  async function signIn() {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    askNext = true;
    try {
      await fb.auth.signInWithPopup(provider);
    } catch (e) {
      if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) {
        try { sessionStorage.setItem(ASK_KEY, '1'); } catch (err) { /* ignore */ }
        fb.auth.signInWithRedirect(provider).catch(signInError);
        return;
      }
      askNext = false;
      signInError(e);
    }
  }
  accountBtn.addEventListener('click', () => {
    openMenu(false);
    if (!fb) return;
    if (fb.auth.currentUser) fb.auth.signOut().then(() => toast('Signed out. Your castle stays on this device.')).catch(() => {});
    else signIn();
  });
  function initOnline() {
    const cfg = window.STACK_A_CASTLE_FIREBASE;
    const noOnline = () => { accountBtn.hidden = true; accountBtn.nextElementSibling.hidden = true; setSave('device'); };
    if (!window.firebase || !cfg || !cfg.apiKey) { noOnline(); return; }
    try {
      if (!firebase.apps.length) firebase.initializeApp(cfg);
      fb = { auth: firebase.auth(), db: firebase.firestore() };
    } catch (e) { fb = null; noOnline(); return; }
    try { askNext = sessionStorage.getItem(ASK_KEY) === '1'; sessionStorage.removeItem(ASK_KEY); } catch (e) { /* ignore */ }
    fb.auth.getRedirectResult().catch(signInError);
    showAccount(null);
    setSave('device');
    fb.auth.onAuthStateChanged((user) => {
      showAccount(user);
      if (user) { if (!cloud.user || cloud.user.uid !== user.uid) connectCloud(user, askNext); }
      else { disconnectCloud(); setSave('device'); }
      askNext = false;
    });
  }
  function pushUndo(a) {
    a.effects = []; a.budget = 600; a.live = true; // for what nature does next (see "nature")
    undoStack.push(a);
    if (undoStack.length > 300) undoStack.shift();
    if (cloud.earlyOps) cloud.earlyOps.push(a);
  }
  function bulk(list, animate, charList, width, dugList) { // replace the whole castle (width: its island, or keep this one)
    const before = { blocks: serialize(), chars: serializeChars(), island: half * 2, dug: serializeDug() };
    setIsland(islandFor(list, charList, width || half * 2, dugList), true);
    loadDug(dugList || []);
    loadBlocks(list, animate);
    loadChars(charList || []);
    pushUndo({ op: 'bulk', before });
    changed();
  }
  function undo() {
    const a = undoStack.pop();
    if (!a) return;
    undoNature(a);
    if (a.op === 'add') removeBlock(a.x, a.y, a.z);
    else if (a.op === 'remove') addBlock(a.x, a.y, a.z, a.t, a.r, { pop: true });
    else if (a.op === 'addChar') { const c = chars.find((q) => q.id === a.id); if (c) removeChar(c); }
    else if (a.op === 'removeChar') addChar(a.kind, a.x, a.y, a.z, { pop: true });
    else if (a.op === 'bulk') {
      setIsland(islandFor(a.before.blocks, a.before.chars, a.before.island, a.before.dug), true);
      loadDug(a.before.dug || []);
      loadBlocks(a.before.blocks, false); loadChars(a.before.chars);
    }
    else if (a.op === 'many') for (const e of a.list) removeBlock(e[0], e[1], e[2]);
    else if (a.op === 'island') setIsland(islandFor(serialize(), null, a.from * 2, serializeDug()), true);
    else if (a.op === 'dig') fillAt(a.x, a.y, a.z);
    changed();
    blip('undo');
    refreshGhost();
  }

  /* ---------- sound ---------- */
  let actx = null;
  let soundOn = store.get(SOUND_KEY) !== 'off';
  function blip(kind) {
    if (!soundOn) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
      const spec = {
        place: ['triangle', 240, 90, 0.28, 0.16],
        remove: ['sine', 200, 480, 0.18, 0.14],
        undo: ['sine', 420, 260, 0.12, 0.12],
        snap: ['square', 1500, 500, 0.06, 0.08],
        grow: ['sine', 180, 540, 0.2, 0.6],
        splash: ['sine', 700, 180, 0.12, 0.3],
        hiss: ['sawtooth', 1200, 300, 0.035, 0.35],
        thud: ['triangle', 140, 70, 0.2, 0.12],
        dig: ['triangle', 260, 90, 0.22, 0.16]
      }[kind] || ['sine', 300, 200, 0.1, 0.1];
      o.type = spec[0];
      o.frequency.setValueAtTime(spec[1], t);
      o.frequency.exponentialRampToValueAtTime(spec[2], t + spec[4] * 0.8);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(spec[3], t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + spec[4]);
      o.connect(g); g.connect(actx.destination);
      o.start(t); o.stop(t + spec[4] + 0.02);
    } catch (e) { /* audio unavailable */ }
  }

  function voice(kind) {
    if (!soundOn) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const t = actx.currentTime;
      const tone = (type, f0, f1, at, dur, vol) => {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(f0, t + at);
        o.frequency.exponentialRampToValueAtTime(f1, t + at + dur);
        g.gain.setValueAtTime(0.0001, t + at);
        g.gain.exponentialRampToValueAtTime(vol, t + at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
        o.connect(g); g.connect(actx.destination);
        o.start(t + at); o.stop(t + at + dur + 0.02);
      };
      if (kind === 'sheep') { tone('sawtooth', 320, 300, 0, 0.45, 0.1); tone('sawtooth', 330, 290, 0.05, 0.4, 0.05); }
      else if (kind === 'chicken') { tone('square', 700, 900, 0, 0.07, 0.06); tone('square', 650, 1000, 0.1, 0.07, 0.06); tone('square', 600, 1100, 0.2, 0.12, 0.06); }
      else if (kind === 'cat') { tone('sine', 520, 880, 0, 0.18, 0.18); tone('sine', 880, 480, 0.18, 0.25, 0.16); }
      else if (kind === 'queen') { tone('sine', 523, 524, 0, 0.12, 0.14); tone('sine', 659, 660, 0.12, 0.12, 0.14); tone('sine', 784, 785, 0.24, 0.22, 0.14); }
      else if (kind === 'dragon') { tone('sawtooth', 110, 60, 0, 0.6, 0.14); tone('triangle', 160, 80, 0.05, 0.5, 0.12); }
      else { tone('triangle', 180, 140, 0, 0.12, 0.2); tone('triangle', 240, 200, 0.14, 0.12, 0.2); }
    } catch (e) { /* audio unavailable */ }
  }

  function fanfare() { // a landmark appears
    if (!soundOn) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const t = actx.currentTime;
      [523, 659, 784, 1047].forEach((f, i) => {
        const o = actx.createOscillator(), g = actx.createGain(), at = t + i * 0.11, dur = i === 3 ? 0.4 : 0.14;
        o.type = 'triangle'; o.frequency.setValueAtTime(f, at);
        g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.16, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
        o.connect(g); g.connect(actx.destination); o.start(at); o.stop(at + dur + 0.02);
      });
    } catch (e) { /* audio unavailable */ }
  }

  /* ---------- UI ---------- */
  let mode = 'build';
  let selected = 'stone';
  const palette = $('#palette');
  const hintEl = $('#hint');
  hintEl.textContent = coarse
    ? 'Drag to spin · Pinch to zoom · Tap to build'
    : 'Drag to spin · Scroll to zoom · Click to build · Right-click to remove';
  let hintGone = false;
  function hideHint() { if (!hintGone) { hintGone = true; hintEl.classList.add('gone'); } }
  let toastTimer = 0;
  function toast(msg) {
    hintGone = true;
    hintEl.textContent = msg;
    hintEl.classList.remove('gone');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => hintEl.classList.add('gone'), 2600);
  }

  const icons = makeIcons();
  let currentCat = 'castle';
  const catCount = {};
  TILES.forEach((p) => {
    const i = catCount[p.cat] = (catCount[p.cat] || 0) + 1;
    const b = document.createElement('button');
    b.dataset.cat = p.cat;
    b.hidden = p.cat !== currentCat;
    b.type = 'button';
    b.className = p.landmark ? 'tile big' : 'tile';
    b.id = 'piece-' + p.id;
    b.dataset.piece = p.id;
    b.setAttribute('aria-pressed', p.id === selected ? 'true' : 'false');
    const keyLabel = i <= 10 ? String(i % 10) : '';
    b.title = (p.landmark ? p.landmark.where : p.name) + (keyLabel ? ' (' + keyLabel + ')' : '');
    const art = icons[p.id]
      ? '<img alt="" src="' + icons[p.id] + '">'
      : '<i class="swatch" style="background:' + p.swatch + '"></i>';
    b.innerHTML = (keyLabel ? '<kbd>' + keyLabel + '</kbd>' : '') + art + '<span>' + p.name + '</span>';
    b.addEventListener('click', () => selectPiece(p.id));
    palette.appendChild(b);
  });
  const tabs = Array.from(document.querySelectorAll('.tab')), tabsEl = $('.tabs');
  function showCat(cat) {
    currentCat = cat;
    tabs.forEach((t) => {
      t.setAttribute('aria-selected', t.dataset.cat === cat ? 'true' : 'false');
      if (t.dataset.cat === cat && t.scrollIntoView) t.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
    });
    palette.querySelectorAll('.tile').forEach((t) => { t.hidden = t.dataset.cat !== cat; });
    palette.scrollLeft = 0;
  }
  tabs.forEach((t) => t.addEventListener('click', () => showCat(t.dataset.cat)));
  function tabFade() { tabsEl.classList.toggle('more', tabsEl.scrollLeft + tabsEl.clientWidth < tabsEl.scrollWidth - 2); }
  tabsEl.addEventListener('scroll', tabFade, { passive: true });
  window.addEventListener('resize', tabFade);
  tabFade();

  function selectPiece(id) {
    if (TILE[id] && TILE[id].cat !== currentCat) showCat(TILE[id].cat);
    selected = id;
    palette.querySelectorAll('.tile').forEach((t) => t.setAttribute('aria-pressed', t.dataset.piece === id ? 'true' : 'false'));
    const el = $('#piece-' + id);
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
    setMode('build');
  }
  function setMode(m) {
    mode = m;
    $('#mode-build').setAttribute('aria-pressed', m === 'build' ? 'true' : 'false');
    $('#mode-erase').setAttribute('aria-pressed', m === 'erase' ? 'true' : 'false');
    document.body.classList.toggle('is-erasing', m === 'erase');
    refreshGhost();
  }
  $('#mode-build').addEventListener('click', () => setMode('build'));
  $('#mode-erase').addEventListener('click', () => setMode('erase'));
  undoBtn.addEventListener('click', undo);

  /* day / night */
  let nightT = 0, nightTarget = 0;
  function setNight(on, instant) {
    nightTarget = on ? 1 : 0;
    if (instant || reduceMotion) { nightT = nightTarget; applyNight(nightT); }
    document.documentElement.classList.toggle('is-night', on);
    $('#ico-moon').hidden = on;
    $('#ico-sun').hidden = !on;
    $('#night').setAttribute('aria-label', on ? 'Switch to day' : 'Switch to night');
  }
  function toggleNight() {
    setNight(nightTarget !== 1);
    store.set(AT_KEY, String(Date.now()));
    saveLocal();
    scheduleCloudSave();
  }
  $('#night').addEventListener('click', toggleNight);

  /* menu */
  const menu = $('#menu'), moreBtn = $('#more');
  let clearArmed = 0;
  function openMenu(open) {
    menu.hidden = !open;
    moreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (!open) disarmClear();
  }
  function disarmClear() {
    clearTimeout(clearArmed); clearArmed = 0;
    $('#m-clear').classList.remove('confirm');
    $('#clear-label').textContent = 'Clear everything';
  }
  moreBtn.addEventListener('click', () => openMenu(menu.hidden));
  document.addEventListener('pointerdown', (e) => {
    if (!menu.hidden && !menu.contains(e.target) && !moreBtn.contains(e.target)) openMenu(false);
  });
  $('#m-sample').addEventListener('click', () => { const w = sampleWorld(); bulk(w.blocks, true, sampleChars(), 0, w.dug); openMenu(false); resetView(); });
  $('#m-view').addEventListener('click', () => { resetView(); openMenu(false); });

  /* bigger island */
  const growBtn = $('#m-grow');
  function showIslandSize() {
    const w = half * 2;
    $('#grow-state').textContent = half >= MAX_HALF ? 'Biggest' : w + '×' + w;
    growBtn.disabled = half >= MAX_HALF;
  }
  function growIsland() {
    if (half >= MAX_HALF) return;
    const from = half, to = Math.min(MAX_HALF, half + GROW);
    setIsland(to, true);
    pushUndo({ op: 'island', from, to });
    changed();
    blip('grow');
    hideHint();
    toast('The island grew to ' + to * 2 + ' × ' + to * 2 + ' squares! Undo makes it smaller again.');
  }
  growBtn.addEventListener('click', () => { openMenu(false); growIsland(); });
  $('#m-spin').addEventListener('click', () => {
    controls.autoRotate = !controls.autoRotate;
    $('#spin-state').textContent = controls.autoRotate ? 'On' : 'Off';
  });
  $('#m-nature').addEventListener('click', () => {
    nature.on = !nature.on;
    store.set(NATURE_KEY, nature.on ? 'on' : 'off');
    $('#nature-state').textContent = nature.on ? 'On' : 'Off';
    if (!nature.on) nature.queue.clear();
    toast(nature.on ? 'Nature is on: water flows, lava cools into rock, ice and snow melt, and sand falls.' : 'Nature is off: blocks stay right where you put them.');
  });
  $('#nature-state').textContent = nature.on ? 'On' : 'Off';
  $('#m-sound').addEventListener('click', () => {
    soundOn = !soundOn;
    store.set(SOUND_KEY, soundOn ? 'on' : 'off');
    $('#sound-state').textContent = soundOn ? 'On' : 'Off';
    if (soundOn) blip('place');
  });
  $('#sound-state').textContent = soundOn ? 'On' : 'Off';
  $('#m-clear').addEventListener('click', () => {
    if (!clearArmed) {
      $('#m-clear').classList.add('confirm');
      $('#clear-label').textContent = 'Tap again to clear (you can undo)';
      clearArmed = setTimeout(disarmClear, 3500);
      return;
    }
    disarmClear();
    bulk([], false);
    openMenu(false);
  });

  /* file backup: export / import (works on GitHub Pages; Claude artifact viewers block downloads) */
  const importInput = $('#import-file');
  const today = () => new Date().toISOString().slice(0, 10);
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function exportCastle() {
    const body = encodeCastle();
    delete body.writer;
    download(new Blob([JSON.stringify(body)], { type: 'application/json' }), 'my-castle-' + today() + '.json');
    toast('Castle saved to a file');
  }
  $('#m-export').addEventListener('click', () => { openMenu(false); exportCastle(); });
  $('#m-import').addEventListener('click', () => { openMenu(false); importInput.click(); });
  importInput.addEventListener('change', async () => {
    const file = importInput.files && importInput.files[0];
    importInput.value = '';
    if (!file) return;
    let d = null;
    try { d = JSON.parse(await file.text()); } catch (e) { d = null; }
    if (fromNewerGame(d)) { toast('This castle was made with a newer version of the game. Reload the page, then open it again.'); return; }
    const list = decodeCastle(d);
    if (!list) { toast('That file is not a Stack-a-Castle save'); return; }
    bulk(list, true, Array.isArray(d.chars) ? decodeChars(d) : [], d.island, decodeDug(d));
    if (typeof d.night === 'boolean' && d.night !== (nightTarget === 1)) setNight(d.night);
    resetView();
    toast('Castle loaded. Undo puts the old one back.');
  });

  /* save a picture: the 3D view on a painted sky, saved as a JPEG (or shared, on phones and tablets) */
  function skyColors() {
    const css = getComputedStyle(document.documentElement), v = (n, f) => (css.getPropertyValue(n) || '').trim() || f;
    return nightTarget === 1 ? [v('--night-top', '#070e28'), v('--night-mid', '#16245a'), v('--night-low', '#2c3e7c')]
      : [v('--sky-top', '#5fb4ea'), v('--sky-mid', '#9ad5f5'), v('--sky-low', '#d6f0ff')];
  }
  function takePicture() {
    const ghostWas = ghost.visible;
    ghost.visible = false;
    camera.clearViewOffset(); // center the castle in the picture (the HUD isn't in it)
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    const w = canvas.width, h = canvas.height, out = cv(w, h), g = out.getContext('2d');
    const [top, mid, low] = skyColors(), gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, top); gr.addColorStop(0.5, mid); gr.addColorStop(1, low);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    if (nightTarget === 1) {
      const r = rng(9);
      g.fillStyle = '#fff';
      for (let i = 0; i < 70; i++) { g.globalAlpha = 0.5 + r() * 0.5; g.beginPath(); g.arc(r() * w, r() * h * 0.55, (0.6 + r()) * Math.max(1, w / 1400), 0, Math.PI * 2); g.fill(); }
      g.globalAlpha = 1;
    }
    g.drawImage(canvas, 0, 0);
    const u = Math.max(1, w / 1100);
    g.font = Math.round(26 * u) + 'px "Pirata One", Georgia, serif';
    g.textBaseline = 'bottom';
    g.shadowColor = 'rgba(10,14,32,0.55)'; g.shadowBlur = 6 * u;
    g.fillStyle = '#fff';
    g.fillText('Stack-a-Castle', 16 * u, h - 12 * u);
    layout(); // put the view offset back
    ghost.visible = ghostWas;
    return out.toDataURL('image/jpeg', 0.9);
  }
  function dataBlob(url) {
    const [head, body] = url.split(','), bin = atob(body), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: head.slice(5).split(';')[0] });
  }
  function savePicture() {
    let blob;
    try { blob = dataBlob(takePicture()); } catch (e) { toast('Sorry, the picture didn’t work on this device.'); return; }
    const name = 'my-castle-' + today() + '.jpg';
    const flash = $('#flash');
    flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');
    blip('snap');
    if (coarse && navigator.canShare && window.File) { // phones and tablets: the share sheet has "Save image"
      const file = new File([blob], name, { type: 'image/jpeg' });
      if (navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file] }).catch((e) => { if (!e || e.name !== 'AbortError') { download(blob, name); toast('Picture saved'); } });
        return;
      }
    }
    download(blob, name);
    toast('Picture saved');
  }
  $('#m-picture').addEventListener('click', () => { openMenu(false); savePicture(); });

  /* how to play: shown on a first visit, and from the menu */
  const HELP_KEY = 'stack-a-castle:help-seen';
  const helpEl = $('#help');
  document.documentElement.classList.toggle('is-touch', coarse);
  function openHelp() {
    helpEl.hidden = false;
    $('#help-close').focus();
  }
  function closeHelp() {
    if (helpEl.hidden) return;
    helpEl.hidden = true;
    store.set(HELP_KEY, '1');
  }
  $('#help-close').addEventListener('click', closeHelp);
  helpEl.addEventListener('click', (e) => { if (e.target === helpEl) closeHelp(); });
  $('#m-help').addEventListener('click', () => { openMenu(false); openHelp(); });

  /* offline and back online */
  window.addEventListener('offline', () => {
    online = false;
    showSave();
    toast('You’re offline. Your castle is still saved on this device.');
  });
  window.addEventListener('online', () => {
    online = true;
    showSave();
    if (cloud.ref && cloud.writable) {
      toast('Back online. Saving your castle…');
      if (cloud.inFlight) setSave('saving'); // Firebase sends the waiting save; "Saved online" shows when done
      else if (cloud.pending) scheduleCloudSave(0);
    } else toast('Back online.');
  });

  /* keyboard */
  window.addEventListener('keydown', (e) => {
    if (!helpEl.hidden) { if (e.key === 'Escape') closeHelp(); return; }
    if (!conflictEl.hidden) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^[0-9]$/.test(e.key)) {
      const idx = e.key === '0' ? 9 : Number(e.key) - 1;
      const list = TILES.filter((p) => p.cat === currentCat);
      if (list[idx]) selectPiece(list[idx].id);
    } else if (e.key === 'e' || e.key === 'E') setMode(mode === 'erase' ? 'build' : 'erase');
    else if (e.key === 'b' || e.key === 'B') setMode('build');
    else if (e.key === 'n' || e.key === 'N') toggleNight();
    else if (e.key === 'Escape') openMenu(false);
  });

  /* ---------- picking ---------- */
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  // Walks the ray square by square through the island's grid (a "voxel walk") until it meets a
  // block or the grass. This costs the same for 10 blocks or 10,000.
  const LO = [-half, -DEPTH, -half], HI = [half, MAXY, half]; // x and z are updated by setIsland
  function pickCell(ray) {
    const O = [ray.origin.x, ray.origin.y, ray.origin.z], D = [ray.direction.x, ray.direction.y, ray.direction.z];
    let t0 = 0, t1 = Infinity, axis = -1;
    for (let a = 0; a < 3; a++) { // clip the ray to the island's building space
      if (Math.abs(D[a]) < 1e-9) { if (O[a] < LO[a] || O[a] > HI[a]) return null; continue; }
      let ta = (LO[a] - O[a]) / D[a], tb = (HI[a] - O[a]) / D[a];
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      if (ta > t0) { t0 = ta; axis = a; }
      if (tb < t1) t1 = tb;
    }
    if (t0 > t1) return null;
    const cell = [0, 0, 0], step = [0, 0, 0], tMax = [0, 0, 0], tDelta = [0, 0, 0];
    for (let a = 0; a < 3; a++) {
      const p = O[a] + D[a] * t0;
      cell[a] = Math.min(HI[a] - 1, Math.max(LO[a], Math.floor(p)));
      step[a] = D[a] > 0 ? 1 : D[a] < 0 ? -1 : 0;
      tMax[a] = step[a] ? t0 + ((step[a] > 0 ? cell[a] + 1 : cell[a]) - p) / D[a] : Infinity;
      tDelta[a] = step[a] ? Math.abs(1 / D[a]) : Infinity;
    }
    let face = axis, t = t0;
    for (let i = 0, n = half * 4 + MAXY + 8; i < n; i++) {
      const solid = world.has(K(cell[0], cell[1], cell[2])), earth = !solid && isEarth(cell[0], cell[1], cell[2]);
      if (solid || earth) { // a block, or the ground (which can be dug)
        if (face < 0) return null; // the camera is inside a block
        const n = [0, 0, 0]; n[face] = -step[face];
        const at = { x: cell[0], y: cell[1], z: cell[2] }, place = { x: cell[0] + n[0], y: cell[1] + n[1], z: cell[2] + n[2] };
        let dig = earth ? at : null;
        // tapping the wall of a hole digs the hole deeper (the square under where you're looking), not sideways
        if (earth && face !== 1 && place.y < 0) {
          let y = place.y - 1;
          while (y >= -DEPTH && !isEarth(place.x, y, place.z)) y--;
          if (y >= -DEPTH) dig = { x: place.x, y, z: place.z };
        }
        return { place, remove: solid ? at : null, dig, dist: t };
      }
      const a = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : (tMax[1] < tMax[2] ? 1 : 2);
      t = tMax[a]; tMax[a] += tDelta[a]; cell[a] += step[a]; face = a;
      if (cell[a] < LO[a] || cell[a] >= HI[a]) return null;
    }
    return null;
  }
  function pick(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const ch = charHits.length ? raycaster.intersectObjects(charHits, false)[0] : null;
    const res = pickCell(raycaster.ray);
    if (ch && (!res || ch.distance < res.dist)) return { char: ch.object.userData.char };
    return res;
  }
  function charTarget(c) {
    if (!inBounds(c.x, c.y, c.z)) return -1;
    return selected === 'dragon' ? Math.max(0, c.y) : findStand(c.x, c.y, c.z);
  }
  function facingRot() {
    const dx = camera.position.x - controls.target.x, dz = camera.position.z - controls.target.z;
    return Math.abs(dx) > Math.abs(dz) ? 1 : 0;
  }
  function facing4() { // which of four turns points a front at the camera
    const a = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
    return ((Math.round(a / (Math.PI / 2)) % 4) + 4) % 4;
  }
  function rotFor(id) { return FACE4.has(id) ? facing4() : FACE2.has(id) ? facingRot() : 0; }
  function act(clientX, clientY, forceErase) {
    const p = pick(clientX, clientY);
    if (!p) return;
    if (p.char) {
      if (mode === 'erase' || forceErase) { removeChar(p.char, { record: true }); blip('remove'); changed(); hideHint(); }
      else poke(p.char);
      return;
    }
    if (mode === 'erase' || forceErase) {
      if (p.remove && removeBlock(p.remove.x, p.remove.y, p.remove.z, { record: true })) {
        natureAfter([[p.remove.x, p.remove.y, p.remove.z]]);
        blip('remove'); changed(); hideHint();
      }
    } else if (selected === 'dig') {
      if (p.dig && digAt(p.dig.x, p.dig.y, p.dig.z, { record: true })) { natureAfter([[p.dig.x, p.dig.y, p.dig.z]]); blip('dig'); changed(); hideHint(); }
    } else if (LANDMARK[selected]) {
      if (placeLandmark(LANDMARK[selected], p.place, facing4())) { natureAfter(undoStack[undoStack.length - 1].list); fanfare(); changed(); hideHint(); }
    } else if (CHAR_SET.has(selected)) {
      if (chars.length >= MAX_CHARS) { toast('One island can hold up to ' + MAX_CHARS + ' characters'); return; }
      const c = p.place, y = charTarget(c);
      if (y >= 0 && addChar(selected, c.x, y, c.z, { record: true, pop: true })) { voice(selected); changed(); hideHint(); }
    } else {
      const c = p.place;
      if (canHold(c.x, c.y, c.z) && !world.has(K(c.x, c.y, c.z))) {
        addBlock(c.x, c.y, c.z, selected, rotFor(selected), { record: true, pop: true });
        natureAfter([[c.x, c.y, c.z]]);
        blip('place'); changed(); hideHint();
      }
    }
  }
  let lastMouse = null;
  function updateGhost(clientX, clientY) {
    const p = pick(clientX, clientY);
    if (!p || p.char) { ghost.visible = false; return; }
    if (mode !== 'erase' && selected === 'dig') { if (p.dig) showGhost(p.dig, 'erase'); else ghost.visible = false; return; }
    if (mode !== 'erase' && LANDMARK[selected]) {
      const spot = landmarkSpot(LANDMARK[selected], p.place, facing4());
      showGhostBox(spot.min, spot.max, spot.ok);
      return;
    }
    if (mode !== 'erase' && CHAR_SET.has(selected)) {
      const y = charTarget(p.place);
      if (y >= 0) showGhost({ x: p.place.x, y, z: p.place.z }, 'build'); else ghost.visible = false;
      return;
    }
    if (mode === 'erase') {
      if (p.remove) showGhost(p.remove, 'erase'); else ghost.visible = false;
    } else {
      const c = p.place;
      if (canHold(c.x, c.y, c.z) && !world.has(K(c.x, c.y, c.z))) showGhost(c, 'build'); else ghost.visible = false;
    }
  }
  function refreshGhost() { if (lastMouse) updateGhost(lastMouse.x, lastMouse.y); else ghost.visible = false; }

  /* tap vs drag */
  const pointers = new Map();
  let gesture = null;
  canvas.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, true);
    if (pointers.size === 1) {
      gesture = { id: e.pointerId, x: e.clientX, y: e.clientY, button: e.button, shift: e.shiftKey, type: e.pointerType, multi: false, moved: false };
    } else if (gesture) {
      gesture.multi = true;
    }
    if (!menu.hidden) openMenu(false);
  });
  window.addEventListener('pointermove', (e) => {
    if (gesture && e.pointerId === gesture.id && !gesture.moved) {
      const lim = e.pointerType === 'mouse' ? 5 : 10;
      if (Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) > lim) { gesture.moved = true; ghost.visible = false; }
    }
    if (e.pointerType === 'mouse') {
      if (e.target === canvas && !(gesture && gesture.moved)) { lastMouse = { x: e.clientX, y: e.clientY }; updateGhost(e.clientX, e.clientY); }
      else if (e.target !== canvas) { lastMouse = null; ghost.visible = false; }
    }
  });
  window.addEventListener('pointerup', (e) => {
    const wasDown = pointers.delete(e.pointerId);
    if (wasDown && gesture && e.pointerId === gesture.id) {
      const g = gesture;
      if (!g.multi && !g.moved && (g.button === 0 || g.button === 2)) act(e.clientX, e.clientY, g.button === 2 || g.shift);
      else if (g.moved) hideHint();
      g.done = true;
      if (e.pointerType === 'mouse' && e.target === canvas) { lastMouse = { x: e.clientX, y: e.clientY }; updateGhost(e.clientX, e.clientY); }
    }
    if (pointers.size === 0) gesture = null;
  });
  window.addEventListener('pointercancel', (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size === 0) gesture = null;
  });
  canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !gesture) { lastMouse = null; ghost.visible = false; } });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  /* ---------- layout ---------- */
  const app = $('#app'), topbar = $('#topbar'), dock = $('#dock');
  function layout() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 1 ? 55 : 42;
    const a = app.getBoundingClientRect();
    const topH = topbar.getBoundingClientRect().bottom - a.top;
    const botH = a.bottom - dock.getBoundingClientRect().top;
    const shift = Math.round((botH - topH) / 2);
    camera.setViewOffset(w, h, 0, shift, w, h);
    camera.updateProjectionMatrix();
    tabFade();
  }
  function resetView() {
    controls.target.set(0, 1.4, 0);
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), tanH = tanV * camera.aspect;
    const dist = Math.min(58, Math.max(7.8 / tanH, 7.6 / tanV));
    const dir = new THREE.Vector3(0.6, 0.62, 1).normalize();
    camera.position.copy(controls.target).addScaledVector(dir, dist);
    controls.update();
  }
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(layout);
    ro.observe(stage); ro.observe(dock); ro.observe(topbar);
  }
  window.addEventListener('resize', layout);

  /* ---------- loop ---------- */
  const clock = new THREE.Clock();
  function waveFlag(t) {
    const p = G.flag.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) {
      const x = flagBase[i] - 0.035, y = flagBase[i + 1], k = x / 0.7;
      p[i + 2] = Math.sin(x * 7 - t * 4.2 + y * 2) * 0.07 * k;
      p[i + 1] = y + Math.sin(x * 5 - t * 3) * 0.014 * k;
    }
    G.flag.attributes.position.needsUpdate = true;
    G.flag.computeVertexNormals();
  }
  // Lower the drawing resolution step by step if the device can't keep up (older tablets).
  let pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const speed = { time: 0, frames: 0, slow: 0 };
  function watchSpeed(raw) {
    if (document.hidden || raw > 0.25 || pixelRatio <= 1) return; // ignore pauses
    speed.time += raw; speed.frames++;
    if (speed.time < 2) return;
    const avg = speed.time / speed.frames;
    speed.time = 0; speed.frames = 0;
    if (avg > 1 / 40) speed.slow++; else speed.slow = 0;
    if (speed.slow >= 2) {
      speed.slow = 0;
      pixelRatio = Math.max(1, pixelRatio - 0.25);
      renderer.setPixelRatio(pixelRatio);
      layout();
    }
  }
  function frame() {
    const raw = clock.getDelta(), dt = Math.min(raw, 0.05);
    const t = clock.elapsedTime;
    watchSpeed(raw);
    controls.update();
    controls.target.x = Math.max(-half, Math.min(half, controls.target.x));
    controls.target.z = Math.max(-half, Math.min(half, controls.target.z));
    controls.target.y = Math.max(0, Math.min(10, controls.target.y));
    sun.position.copy(controls.target).add(sunOffset);
    sun.target.position.copy(controls.target);
    // zoomed far out over a big island, move the near limit out too, so distant surfaces don't flicker
    const near = Math.min(4, Math.max(0.1, camera.position.distanceTo(controls.target) / 600));
    if (Math.abs(near - camera.near) > camera.near * 0.1) { camera.near = near; camera.updateProjectionMatrix(); }
    if (nightT !== nightTarget) {
      const step = dt / 0.9;
      nightT = nightTarget > nightT ? Math.min(nightTarget, nightT + step) : Math.max(nightTarget, nightT - step);
      applyNight(nightT);
    }
    if (!reduceMotion) {
      waveFlag(t);
      T.water.offset.set(t * 0.03, t * 0.012);
      T.lava.offset.set(t * 0.012, t * 0.007);
      for (const c of clouds) { c.position.x += dt * c.userData.speed; if (c.position.x > 165 * cloudSpread) c.position.x = -165 * cloudSpread; }
    }
    for (const o of flickers) {
      const fk = o.userData.flicker, ph = fk.phase;
      const f = reduceMotion ? 1 : 1 + Math.sin(t * 13 + ph) * 0.08 + Math.sin(t * 7.3 + ph * 2) * 0.06;
      fk.flames.forEach((fl, i) => fl.scale.set(1, i ? 1 + (f - 1) * (i % 2 ? -1.2 : 1.5) : f, 1));
      fk.glow.scale.setScalar(fk.size * (0.92 + (f - 1) * 1.4));
    }
    if (pops.length) {
      const now = performance.now();
      for (let i = pops.length - 1; i >= 0; i--) {
        const p = pops[i], k = (now - p.t0) / 240;
        if (p.rec && p.rec.temp !== p.obj) { pops.splice(i, 1); continue; } // removed while popping
        if (k < 0) continue;
        if (k >= 1) { p.obj.scale.setScalar(1); pops.splice(i, 1); if (p.rec) popDone(p.rec); continue; }
        p.obj.scale.setScalar(Math.max(0.001, easeOutBack(k)));
      }
    }
    if (shownHalf !== half) { // the island spreads out (or back) smoothly
      const d = half - shownHalf, step = Math.max(Math.abs(d) * 5, 12) * dt;
      shownHalf = Math.abs(d) <= step ? half : shownHalf + Math.sign(d) * step;
      sizeIsland(shownHalf);
    }
    if (nature.queue.size || nature.dirty) natureStep(performance.now());
    if (pitsDirty) buildPits();
    if (clearDirty) buildClear(); else sortClear(false);
    updateChars(dt, t);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  /* ---------- boot ---------- */
  let started = false;
  function start(data) {
    if (started) return;
    started = true;
    data = data || {};
    let blocks = validList(data.blocks) ? data.blocks : null;
    let charList = validChars(data.chars) ? data.chars : null;
    if (!blocks) {
      const raw = store.get(SAVE_KEY);
      if (raw) { try { const parsed = JSON.parse(raw); if (validList(parsed)) blocks = parsed; } catch (e) { /* ignore */ } }
    }
    let holes = [];
    try { const h = JSON.parse(store.get(DUG_KEY) || '[]'); if (validDug(h)) holes = h; } catch (e) { /* ignore */ }
    if (!blocks) { const w = sampleWorld(); blocks = w.blocks; holes = w.dug; }
    if (!charList) {
      const rawC = store.get(CHARS_KEY);
      if (rawC) { try { const pc = JSON.parse(rawC); if (validChars(pc)) charList = pc; } catch (e) { /* ignore */ } }
    }
    setIsland(islandFor(blocks, charList, Number(store.get(ISLAND_KEY)) || 0, holes)); // older saves get the new, bigger starting island
    loadDug(holes);
    loadBlocks(blocks, false);
    if (!charList) { charList = starterChars(); }
    loadChars(charList);
    if (!store.get(CHARS_KEY)) store.set(CHARS_KEY, JSON.stringify(serializeChars()));
    applyNight(0);
    const nightOn = typeof data.night === 'boolean' ? data.night : store.get(NIGHT_KEY) === '1';
    if (nightOn) setNight(true, true);
    layout();
    resetView();
    refreshUI();
    initOnline();
    if (!store.get(HELP_KEY) && !store.get(AT_KEY)) openHelp(); // first visit
    requestAnimationFrame(frame);
  }
  start({});
})();
