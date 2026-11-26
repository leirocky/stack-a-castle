/*
 * Stack-a-Castle — game script.
 *
 * Sections (search for the banner comments):
 *   helpers · procedural textures · geometry helpers · renderer + scene · pieces ·
 *   palette icons · lights · island · world state · sample castle · characters ·
 *   undo + save · saving to the viewer's account · sound · UI · picking · layout · loop · boot
 *
 * Saving: every change is written to this browser's localStorage. When the page runs inside
 * a Claude artifact viewer (window.claude exists), it also saves to the viewer's Claude account.
 * On GitHub Pages that online save is inactive; see docs/PROGRESS.md for the Firebase plan.
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
  const HALF = 50, MAXY = 32; // platform is HALF*2 squares wide; MAXY = height limit

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
  function merge(list) {
    const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
    let total = 0; parts.forEach((g) => { total += g.attributes.position.count; });
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3);
    let o = 0;
    for (const g of parts) {
      pos.set(g.attributes.position.array, o * 3);
      nor.set(g.attributes.normal.array, o * 3);
      o += g.attributes.position.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
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
    const geo = new THREE.ConeGeometry(HALF + 0.6, 26, 12, 3);
    const p = geo.attributes.position, r = rng(41);
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y < 12.9) { p.setX(i, p.getX(i) * (0.88 + r() * 0.24)); p.setZ(i, p.getZ(i) * (0.88 + r() * 0.24)); p.setY(i, y + (r() - 0.5) * 0.8); }
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
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
    water: tex(waterCanvas()), grass: tex(grassCanvas(), HALF, HALF), dirt: tex(dirtCanvas(), HALF, 1),
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
  const PAINT = { red: '#d6453b', blue: '#3a6fd8', yellow: '#f2c230', green: '#4caf50', white: '#f4f4f2', black: '#2b2d35' };
  for (const k in PAINT) M['paint_' + k] = std({ map: T.paint, color: new THREE.Color(PAINT[k]), roughness: 0.8 });

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
    { id: 'white', name: 'White', swatch: '#f4f4f2', cat: 'build' },
    { id: 'black', name: 'Black', swatch: '#2b2d35', cat: 'build' },
    { id: 'knight', name: 'Knight', swatch: '#c9ced8', cat: 'characters' },
    { id: 'queen', name: 'Queen', swatch: '#7b3fb0', cat: 'characters' },
    { id: 'sheep', name: 'Sheep', swatch: '#f7f5ef', cat: 'characters' },
    { id: 'chicken', name: 'Chicken', swatch: '#fbfbf8', cat: 'characters' },
    { id: 'cat', name: 'Cat', swatch: '#e8913a', cat: 'characters' },
    { id: 'dragon', name: 'Dragon', swatch: '#3fae8c', cat: 'characters' }
  ];
  const PIECE = Object.fromEntries(PIECES.map((p) => [p.id, p]));

  function mk(geo, mat, shadow = true) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow; m.receiveShadow = true;
    return m;
  }
  function makePiece(id, rot) {
    let o;
    switch (id) {
      case 'stone': o = mk(G.box, M.stone); break;
      case 'brick': o = mk(G.box, M.brick); break;
      case 'wood': o = mk(G.box, M.wood); break;
      case 'window': o = mk(G.box, M.windowFaces); break;
      case 'gate': o = mk(G.arch, M.stone); o.rotation.y = rot ? Math.PI / 2 : 0; break;
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
        o.userData.flame = fl; o.userData.glow = gl; o.userData.phase = Math.random() * 10;
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
      case 'stairs': o = mk(G.stairs, M.stone); o.rotation.y = (rot || 0) * Math.PI / 2; break;
      case 'fence': o = mk(G.fence, M.wood); o.rotation.y = rot ? Math.PI / 2 : 0; break;
      case 'door':
        o = new THREE.Group();
        o.add(mk(G.door, M.wood), mk(G.knob, M.iron));
        o.rotation.y = rot ? Math.PI / 2 : 0;
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
      default:
        if (CHAR_SET.has(id)) return makeCharacter(id);
        o = mk(G.box, PAINT[id] ? M['paint_' + id] : M.stone);
    }
    return o;
  }

  /* ---------- palette icons (rendered once) ---------- */
  const ICON_VIEW = {
    flag: { y: 0.28, d: 4.1 }, roof: { y: 0.12, d: 3.6 }, tree: { y: 0.06, d: 3.0 },
    torch: { y: -0.02, d: 2.7 }, water: { y: -0.08, d: 3.4 },
    slab: { y: -0.22, d: 3.3 }, lantern: { y: -0.24, d: 2.0 }, fence: { y: 0, d: 3.5 },
    knight: { y: 0.44, d: 2.4 }, queen: { y: 0.46, d: 2.4 }, sheep: { y: 0.3, d: 2.1 },
    chicken: { y: 0.25, d: 1.5 }, cat: { y: 0.24, d: 1.6 }, dragon: { y: 0.62, d: 3.4 }
  };
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
    for (const p of PIECES) {
      const obj = makePiece(p.id, 0);
      sc.add(obj);
      const v = ICON_VIEW[p.id] || { y: 0, d: 3.6 };
      cam.position.copy(dir).multiplyScalar(v.d); cam.position.y += v.y;
      cam.lookAt(0, v.y, 0);
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
    M.lamp.emissiveIntensity = 0.5 + n * 0.8;
    M.glow.opacity = n * 0.95;
    M.cloud.color.copy(DAY.cloud).lerp(NIGHT.cloud, n);
    M.cloud.emissiveIntensity = 0.3 * (1 - n);
    M.water.emissiveIntensity = 0.35 - 0.2 * n;
  }

  /* ---------- island ---------- */
  const island = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2, 1.6, HALF * 2), [M.dirt, M.dirt, M.grass, M.dirt, M.dirt, M.dirt]);
  island.position.y = -0.8;
  island.receiveShadow = true;
  scene.add(island);
  const rock = new THREE.Mesh(rockGeometry(), M.rock);
  rock.rotation.x = Math.PI;
  rock.position.y = -1.6 - 13;
  scene.add(rock);

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
      scene.add(g);
      clouds.push(g);
    }
  })();

  const blockGroup = new THREE.Group();
  const hitGroup = new THREE.Group();
  scene.add(blockGroup, hitGroup);

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

  /* ---------- world state ---------- */
  const world = new Map();
  const torches = new Set();
  const K = (x, y, z) => x + ',' + y + ',' + z;
  const inBounds = (x, y, z) => x >= -HALF && x < HALF && z >= -HALF && z < HALF && y >= 0 && y < MAXY;
  const pops = [];
  const easeOutBack = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
  function startPop(obj, delay) {
    if (reduceMotion) return;
    obj.scale.setScalar(0.001);
    pops.push({ obj, t0: performance.now() + delay });
  }

  function addBlock(x, y, z, t, r, opts) {
    opts = opts || {};
    const k = K(x, y, z);
    if (world.has(k) || !inBounds(x, y, z) || !PIECE[t]) return false;
    const obj = makePiece(t, r);
    obj.position.set(x + 0.5, y + 0.5, z + 0.5);
    blockGroup.add(obj);
    const hit = new THREE.Mesh(G.box, M.hit);
    hit.visible = false;
    hit.position.copy(obj.position);
    hit.userData.cell = { x, y, z };
    hitGroup.add(hit);
    world.set(k, { t, r: r || 0, obj, hit });
    if (t === 'torch') torches.add(obj);
    if (opts.pop) startPop(obj, opts.delay || 0);
    if (opts.record) pushUndo({ op: 'add', x, y, z, t, r: r || 0 });
    return true;
  }
  function removeBlock(x, y, z, opts) {
    opts = opts || {};
    const k = K(x, y, z), b = world.get(k);
    if (!b) return false;
    blockGroup.remove(b.obj); hitGroup.remove(b.hit); torches.delete(b.obj); world.delete(k);
    if (opts.record) pushUndo({ op: 'remove', x, y, z, t: b.t, r: b.r });
    return true;
  }
  function serialize() {
    const out = [];
    for (const [k, b] of world) { const [x, y, z] = k.split(',').map(Number); out.push([x, y, z, b.t, b.r]); }
    return out;
  }
  function validList(list) {
    return Array.isArray(list) && list.every((e) => Array.isArray(e) && e.length >= 4 &&
      Number.isInteger(e[0]) && Number.isInteger(e[1]) && Number.isInteger(e[2]) && inBounds(e[0], e[1], e[2]) && !!PIECE[e[3]] && !CHAR_SET.has(e[3]));
  }
  function loadBlocks(list, animate) {
    for (const k of Array.from(world.keys())) { const [x, y, z] = k.split(',').map(Number); removeBlock(x, y, z); }
    pops.length = 0;
    for (const e of list) {
      addBlock(e[0], e[1], e[2], e[3], e[4] || 0, animate ? { pop: true, delay: e[1] * 110 + Math.random() * 260 } : null);
    }
  }

  function sampleCastle() {
    const m = new Map();
    const put = (x, y, z, t, r) => m.set(K(x, y, z), [x, y, z, t, r || 0]);
    for (let i = -7; i <= 7; i++) { put(i, 0, -7, 'water'); put(i, 0, 7, 'water'); put(-7, 0, i, 'water'); put(7, 0, i, 'water'); }
    put(0, 0, 7, 'wood');
    for (let i = -4; i <= 4; i++) {
      for (const [x, z] of [[i, -5], [i, 5], [-5, i], [5, i]]) {
        const isGate = z === 5 && x === 0;
        put(x, 0, z, isGate ? 'gate' : 'stone', 0);
        put(x, 1, z, Math.abs(i) === 2 ? 'window' : 'stone');
        put(x, 2, z, 'battlement');
      }
    }
    for (const [x, z] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) {
      for (let y = 0; y < 4; y++) put(x, y, z, 'tower');
      put(x, 4, z, 'roof');
    }
    for (let x = -1; x <= 1; x++) {
      for (let z = -1; z <= 1; z++) {
        for (let y = 0; y < 4; y++) {
          const midEdge = (x === 0) !== (z === 0);
          put(x, y, z, (y === 2 && midEdge) ? 'window' : 'brick');
        }
        if (!(x === 0 && z === 0)) put(x, 4, z, 'battlement');
      }
    }
    put(0, 0, 1, 'gate', 0);
    put(0, 4, 0, 'flag');
    put(-3, 0, -3, 'gold'); put(3, 0, -3, 'gold'); put(3, 1, -3, 'gold');
    put(-3, 0, 3, 'tree'); put(3, 0, 3, 'tree');
    put(-2, 0, 3, 'torch'); put(2, 0, 3, 'torch');
    put(-1, 0, 6, 'torch'); put(1, 0, 6, 'torch');
    for (const [x, z] of [[-10, -10], [-9, -4], [9, -10], [10, -5], [-10, 4], [10, 3], [-9, 10], [9, 10], [-4, 10], [5, 10],
      [-16, -15], [15, -16], [-17, 12], [16, 15], [1, -16], [-15, -1], [17, -3], [3, 16], [-12, 17], [12, -17],
      [-24, -22], [23, -25], [-26, 18], [25, 22], [-5, -26], [-25, -6], [26, 4], [6, 25]]) put(x, 0, z, 'tree');
    return Array.from(m.values());
  }

  /* ---------- characters: original low-poly friends that wander the island ---------- */
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
  function makeCharacter(kind) { const g = new THREE.Group(); BUILD[kind](g); return g; }

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
  const NOSTAND = new Set(['water', 'lava', 'roof', 'flag', 'torch', 'tree', 'fence', 'lantern', 'door']);
  const PASS = new Set(['gate', 'door']);
  const passable = (x, y, z) => { const b = world.get(K(x, y, z)); return !b || PASS.has(b.t); };
  const supported = (x, y, z) => { if (y === 0) return true; const b = world.get(K(x, y - 1, z)); return !!b && !NOSTAND.has(b.t); };
  const canStand = (x, y, z) => inBounds(x, y, z) && passable(x, y, z) && supported(x, y, z);
  function footY(x, y, z) { const b = y > 0 && world.get(K(x, y - 1, z)); return (b && (b.t === 'slab' || b.t === 'stairs')) ? y - 0.5 : y; }
  function findStand(x, y, z) {
    for (let yy = Math.min(y, MAXY - 1); yy >= 0; yy--) if (canStand(x, yy, z)) return yy;
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
  function serializeChars() { return chars.map((c) => { const s = charSpot(c); return [c.kind, s.x, s.y, s.z]; }); }
  function validChars(list) {
    return Array.isArray(list) && list.every((e) => Array.isArray(e) && e.length >= 4 && CHAR_SET.has(e[0]) &&
      Number.isInteger(e[1]) && Number.isInteger(e[2]) && Number.isInteger(e[3]) && inBounds(e[1], e[2], e[3]));
  }
  function loadChars(list) {
    while (chars.length) removeChar(chars[0]);
    for (const e of (list || [])) addChar(e[0], e[1], e[2], e[3]);
  }
  function sampleChars() {
    return [['knight', 0, 0, 3], ['knight', 2, 0, 6], ['queen', -2, 0, 2], ['sheep', 9, 0, 6], ['sheep', 10, 0, 8], ['sheep', -9, 0, 7],
      ['chicken', -3, 0, -1], ['chicken', 3, 0, 1], ['cat', 2, 0, -2], ['dragon', 0, 0, 0]];
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
  }
  function changed() {
    refreshUI();
    store.set(AT_KEY, String(Date.now()));
    saveLocal();
    scheduleCloudSave();
  }

  /* ---------- saving to the viewer's account (db capability) ---------- */
  const saveEl = $('#save');
  const TAB = Math.random().toString(36).slice(2, 10);
  const cloud = { ref: null, writable: false, seen: false, answered: false, earlyOps: null, bootHadLocal: false, bootAt: 0, timer: 0, waitTimer: 0, inFlight: false, pending: false, retried: false };
  const SAVE_TEXT = {
    loading: ['Connecting…', '', 'Looking for your saved castle. You can keep building.'],
    saving: ['Saving…', '', ''],
    saved: ['Saved online', 'ok', 'Saved to your Claude account. It opens the same on any device where you are signed in.'],
    device: ['Saved on this device', '', 'Saved in this browser only.'],
    slow: ['Can’t reach your save', 'warn', 'Your online save is not answering yet. Your building is kept on this device.'],
    retry: ['Not saved yet', 'warn', 'Saving online failed. It will try again after your next change.'],
    big: ['Too big to save online', 'warn', 'This castle is too big for an online save. It is kept on this device.'],
    full: ['Online storage full', 'warn', 'Online storage is full. Your castle is kept on this device.']
  };
  function setSave(state) {
    const s = SAVE_TEXT[state] || ['', '', ''];
    saveEl.textContent = s[0];
    saveEl.className = 'save' + (s[1] ? ' ' + s[1] : '');
    saveEl.title = s[2];
  }
  function encodeCastle() {
    const ids = PIECES.map((p) => p.id), cells = [], cs = [];
    for (const [k, b] of world) { const [x, y, z] = k.split(',').map(Number); cells.push(x, y, z, ids.indexOf(b.t), b.r || 0); }
    for (const c of serializeChars()) cs.push(CHAR_IDS.indexOf(c[0]), c[1], c[2], c[3]);
    return { v: 3, pieces: ids, cells, charKinds: CHAR_IDS, chars: cs, night: nightTarget === 1, savedAt: Date.now(), writer: TAB };
  }
  function decodeCastle(d) {
    if (!d || !Array.isArray(d.pieces) || !Array.isArray(d.cells) || d.cells.length % 5) return null;
    const out = [];
    for (let i = 0; i < d.cells.length; i += 5) out.push([d.cells[i], d.cells[i + 1], d.cells[i + 2], d.pieces[d.cells[i + 3]], d.cells[i + 4] || 0]);
    return validList(out) ? out : null;
  }
  function decodeChars(d) {
    if (!d || !Array.isArray(d.charKinds) || !Array.isArray(d.chars) || d.chars.length % 4) return [];
    const out = [];
    for (let i = 0; i < d.chars.length; i += 4) out.push([d.charKinds[d.chars[i]], d.chars[i + 1], d.chars[i + 2], d.chars[i + 3]]);
    return validChars(out) ? out : [];
  }
  function sameAsWorld(list, charList) {
    const kinds = (a) => a.map((c) => c[0]).sort().join(',');
    if (charList && kinds(charList) !== kinds(serializeChars())) return false;
    if (list.length !== world.size) return false;
    return list.every((e) => { const b = world.get(K(e[0], e[1], e[2])); return !!b && b.t === e[3] && (b.r || 0) === (e[4] || 0); });
  }
  function scheduleCloudSave(delay) {
    if (!cloud.ref || !cloud.writable) return;
    cloud.pending = true;
    if (!cloud.seen) return; // hold until we know what is already saved
    setSave('saving');
    clearTimeout(cloud.timer);
    cloud.timer = setTimeout(flushCloud, delay == null ? 900 : delay);
  }
  const FATAL = ['invalid_argument', 'revoked', 'not_granted', 'capability_disabled', 'capability_removed', 'transform_error'];
  async function flushCloud() {
    if (cloud.inFlight || !cloud.pending || !cloud.ref || !cloud.writable) return;
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
      if (code === 'quota_exceeded') setSave('full');
      else if (FATAL.indexOf(code) !== -1) { cloud.writable = false; setSave('device'); }
      else if (!cloud.retried) { cloud.retried = true; cloud.pending = true; retry = true; }
      else { cloud.retried = false; setSave('retry'); }
    } finally {
      cloud.inFlight = false;
      if (cloud.pending && cloud.writable) cloud.timer = setTimeout(flushCloud, retry ? 1500 + Math.random() * 1500 : 300);
    }
  }
  function applyRemote(list, d) {
    loadBlocks(list, false);
    if (Array.isArray(d.chars)) loadChars(decodeChars(d));
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
    }
  }
  // First answer from the account store. Building is never blocked while we wait:
  // anything built meanwhile is replayed on top of the saved castle.
  function firstCloud(d) {
    const ops = cloud.earlyOps || [];
    cloud.earlyOps = null;
    const list = decodeCastle(d);
    if (!list) { scheduleCloudSave(0); return; }
    const charList = Array.isArray(d.chars) ? decodeChars(d) : null;
    const needUpgrade = !Array.isArray(d.chars) && chars.length > 0;
    const localNewer = cloud.bootHadLocal && cloud.bootAt > (d.savedAt || 0);
    if (ops.some((a) => a.op === 'bulk') || (localNewer && !sameAsWorld(list, charList))) { scheduleCloudSave(0); return; }
    if (!sameAsWorld(list, charList)) {
      applyRemote(list, d);
      if (ops.length) { replayOps(ops); refreshUI(); saveLocal(); store.set(AT_KEY, String(Date.now())); }
    } else if (typeof d.night === 'boolean' && d.night !== (nightTarget === 1)) setNight(d.night);
    if (ops.length || cloud.pending || needUpgrade) scheduleCloudSave(0); else setSave('saved');
  }
  function onCloud(snap) {
    const md = snap.metadata || {};
    if (!md.fromCache) { cloud.answered = true; clearTimeout(cloud.waitTimer); }
    if (md.hasPendingWrites) return;
    if (!snap.exists) {
      if (md.fromCache || cloud.seen) return; // wait for the store's real answer
      cloud.seen = true; cloud.earlyOps = null;
      scheduleCloudSave(0); // first save for this account: keep what is here
      return;
    }
    const d = snap.data() || {};
    if (!cloud.seen) { cloud.seen = true; firstCloud(d); return; }
    if (d.writer === TAB) { if (!cloud.pending && !cloud.inFlight) setSave('saved'); return; }
    if (cloud.pending || cloud.inFlight) return; // this device's newer edits will win
    const list = decodeCastle(d);
    if (!list) return;
    if (!sameAsWorld(list, Array.isArray(d.chars) ? decodeChars(d) : null)) applyRemote(list, d);
    else if (typeof d.night === 'boolean' && d.night !== (nightTarget === 1)) setNight(d.night);
    setSave('saved');
  }
  async function initCloud() {
    const api = window.claude && typeof window.claude.use === 'function' ? window.claude : null;
    if (!api) { setSave('device'); return; }
    cloud.earlyOps = [];
    setSave('loading');
    cloud.waitTimer = setTimeout(() => { if (!cloud.answered) setSave(cloud.ref ? 'slow' : 'device'); }, 10000);
    let db = null, user = null, uid = null;
    try {
      [db, user] = await Promise.all([api.use('db'), api.use('user')]);
      uid = user ? await user.id() : null;
    } catch (e) { db = null; }
    if (!db || !uid) { clearTimeout(cloud.waitTimer); cloud.earlyOps = null; setSave('device'); return; }
    try {
      cloud.ref = db.doc('data/users/' + uid + '/castle');
      cloud.writable = true;
      cloud.ref.onSnapshot(onCloud, (e) => {
        clearTimeout(cloud.waitTimer);
        if (e && FATAL.indexOf(e.code) !== -1) { cloud.writable = false; setSave('device'); }
        else if (!cloud.answered) setSave('slow');
      });
    } catch (e) { clearTimeout(cloud.waitTimer); cloud.ref = null; cloud.earlyOps = null; setSave('device'); }
  }
  function pushUndo(a) {
    undoStack.push(a);
    if (undoStack.length > 300) undoStack.shift();
    if (cloud.earlyOps) cloud.earlyOps.push(a);
  }
  function bulk(list, animate, charList) {
    const before = { blocks: serialize(), chars: serializeChars() };
    loadBlocks(list, animate);
    loadChars(charList || []);
    pushUndo({ op: 'bulk', before });
    changed();
  }
  function undo() {
    const a = undoStack.pop();
    if (!a) return;
    if (a.op === 'add') removeBlock(a.x, a.y, a.z);
    else if (a.op === 'remove') addBlock(a.x, a.y, a.z, a.t, a.r, { pop: true });
    else if (a.op === 'addChar') { const c = chars.find((q) => q.id === a.id); if (c) removeChar(c); }
    else if (a.op === 'removeChar') addChar(a.kind, a.x, a.y, a.z, { pop: true });
    else if (a.op === 'bulk') { loadBlocks(a.before.blocks, false); loadChars(a.before.chars); }
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
        undo: ['sine', 420, 260, 0.12, 0.12]
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
  PIECES.forEach((p) => {
    const i = catCount[p.cat] = (catCount[p.cat] || 0) + 1;
    const b = document.createElement('button');
    b.dataset.cat = p.cat;
    b.hidden = p.cat !== currentCat;
    b.type = 'button';
    b.className = 'tile';
    b.id = 'piece-' + p.id;
    b.dataset.piece = p.id;
    b.setAttribute('aria-pressed', p.id === selected ? 'true' : 'false');
    const keyLabel = i <= 10 ? String(i % 10) : '';
    b.title = p.name + (keyLabel ? ' (' + keyLabel + ')' : '');
    const art = icons[p.id]
      ? '<img alt="" src="' + icons[p.id] + '">'
      : '<i class="swatch" style="background:' + p.swatch + '"></i>';
    b.innerHTML = (keyLabel ? '<kbd>' + keyLabel + '</kbd>' : '') + art + '<span>' + p.name + '</span>';
    b.addEventListener('click', () => selectPiece(p.id));
    palette.appendChild(b);
  });
  const tabs = Array.from(document.querySelectorAll('.tab'));
  function showCat(cat) {
    currentCat = cat;
    tabs.forEach((t) => t.setAttribute('aria-selected', t.dataset.cat === cat ? 'true' : 'false'));
    palette.querySelectorAll('.tile').forEach((t) => { t.hidden = t.dataset.cat !== cat; });
    palette.scrollLeft = 0;
  }
  tabs.forEach((t) => t.addEventListener('click', () => showCat(t.dataset.cat)));

  function selectPiece(id) {
    if (PIECE[id] && PIECE[id].cat !== currentCat) showCat(PIECE[id].cat);
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
  $('#m-sample').addEventListener('click', () => { bulk(sampleCastle(), true, sampleChars()); openMenu(false); resetView(); });
  $('#m-view').addEventListener('click', () => { resetView(); openMenu(false); });
  $('#m-spin').addEventListener('click', () => {
    controls.autoRotate = !controls.autoRotate;
    $('#spin-state').textContent = controls.autoRotate ? 'On' : 'Off';
  });
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
  function exportCastle() {
    const body = encodeCastle();
    delete body.writer;
    const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'my-castle-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
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
    const list = decodeCastle(d);
    if (!list) { toast('That file is not a Stack-a-Castle save'); return; }
    bulk(list, true, Array.isArray(d.chars) ? decodeChars(d) : []);
    if (typeof d.night === 'boolean' && d.night !== (nightTarget === 1)) setNight(d.night);
    resetView();
    toast('Castle loaded. Undo puts the old one back.');
  });

  /* keyboard */
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^[0-9]$/.test(e.key)) {
      const idx = e.key === '0' ? 9 : Number(e.key) - 1;
      const list = PIECES.filter((p) => p.cat === currentCat);
      if (list[idx]) selectPiece(list[idx].id);
    } else if (e.key === 'e' || e.key === 'E') setMode(mode === 'erase' ? 'build' : 'erase');
    else if (e.key === 'b' || e.key === 'B') setMode('build');
    else if (e.key === 'n' || e.key === 'N') toggleNight();
    else if (e.key === 'Escape') openMenu(false);
  });

  /* ---------- picking ---------- */
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function pick(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const ch = charHits.length ? raycaster.intersectObjects(charHits, false)[0] : null;
    const hits = raycaster.intersectObjects([island].concat(hitGroup.children), false);
    let res = null, dist = Infinity;
    for (const h of hits) {
      if (h.object === island) {
        if (h.face && h.face.normal.y > 0.5) {
          const x = Math.floor(h.point.x), z = Math.floor(h.point.z);
          res = inBounds(x, 0, z) ? { place: { x, y: 0, z }, remove: null } : null;
          dist = h.distance;
          break;
        }
        continue;
      }
      const c = h.object.userData.cell, n = h.face.normal;
      res = { place: { x: c.x + Math.round(n.x), y: c.y + Math.round(n.y), z: c.z + Math.round(n.z) }, remove: c };
      dist = h.distance;
      break;
    }
    if (ch && ch.distance < dist) return { char: ch.object.userData.char };
    return res;
  }
  function charTarget(c) {
    if (!inBounds(c.x, Math.max(0, c.y), c.z)) return -1;
    return selected === 'dragon' ? Math.max(0, c.y) : findStand(c.x, Math.max(0, c.y), c.z);
  }
  function facingRot() {
    const dx = camera.position.x - controls.target.x, dz = camera.position.z - controls.target.z;
    return Math.abs(dx) > Math.abs(dz) ? 1 : 0;
  }
  function rotFor(id) {
    if (id === 'stairs') {
      const a = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
      return ((Math.round(a / (Math.PI / 2)) % 4) + 4) % 4; // low step faces you
    }
    return (id === 'gate' || id === 'fence' || id === 'door') ? facingRot() : 0;
  }
  function act(clientX, clientY, forceErase) {
    const p = pick(clientX, clientY);
    if (!p) return;
    if (p.char) {
      if (mode === 'erase' || forceErase) { removeChar(p.char, { record: true }); blip('remove'); changed(); hideHint(); }
      else poke(p.char);
      return;
    }
    if (mode === 'erase' || forceErase) {
      if (p.remove && removeBlock(p.remove.x, p.remove.y, p.remove.z, { record: true })) { blip('remove'); changed(); hideHint(); }
    } else if (CHAR_SET.has(selected)) {
      if (chars.length >= MAX_CHARS) { toast('One island can hold up to ' + MAX_CHARS + ' characters'); return; }
      const c = p.place, y = charTarget(c);
      if (y >= 0 && addChar(selected, c.x, y, c.z, { record: true, pop: true })) { voice(selected); changed(); hideHint(); }
    } else {
      const c = p.place;
      if (inBounds(c.x, c.y, c.z) && !world.has(K(c.x, c.y, c.z))) {
        addBlock(c.x, c.y, c.z, selected, rotFor(selected), { record: true, pop: true });
        blip('place'); changed(); hideHint();
      }
    }
  }
  let lastMouse = null;
  function updateGhost(clientX, clientY) {
    const p = pick(clientX, clientY);
    if (!p || p.char) { ghost.visible = false; return; }
    if (mode !== 'erase' && CHAR_SET.has(selected)) {
      const y = charTarget(p.place);
      if (y >= 0) showGhost({ x: p.place.x, y, z: p.place.z }, 'build'); else ghost.visible = false;
      return;
    }
    if (mode === 'erase') {
      if (p.remove) showGhost(p.remove, 'erase'); else ghost.visible = false;
    } else {
      const c = p.place;
      if (inBounds(c.x, c.y, c.z) && !world.has(K(c.x, c.y, c.z))) showGhost(c, 'build'); else ghost.visible = false;
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
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    controls.update();
    controls.target.x = Math.max(-HALF, Math.min(HALF, controls.target.x));
    controls.target.z = Math.max(-HALF, Math.min(HALF, controls.target.z));
    controls.target.y = Math.max(0, Math.min(10, controls.target.y));
    sun.position.copy(controls.target).add(sunOffset);
    sun.target.position.copy(controls.target);
    if (nightT !== nightTarget) {
      const step = dt / 0.9;
      nightT = nightTarget > nightT ? Math.min(nightTarget, nightT + step) : Math.max(nightTarget, nightT - step);
      applyNight(nightT);
    }
    if (!reduceMotion) {
      waveFlag(t);
      T.water.offset.set(t * 0.03, t * 0.012);
      T.lava.offset.set(t * 0.012, t * 0.007);
      for (const c of clouds) { c.position.x += dt * c.userData.speed; if (c.position.x > 165) c.position.x = -165; }
    }
    for (const o of torches) {
      const ph = o.userData.phase;
      const f = reduceMotion ? 1 : 1 + Math.sin(t * 13 + ph) * 0.08 + Math.sin(t * 7.3 + ph * 2) * 0.06;
      o.userData.flame.scale.set(1, f, 1);
      o.userData.glow.scale.setScalar(1.4 * (0.92 + (f - 1) * 1.4));
    }
    if (pops.length) {
      const now = performance.now();
      for (let i = pops.length - 1; i >= 0; i--) {
        const p = pops[i], k = (now - p.t0) / 240;
        if (k < 0) continue;
        if (k >= 1) { p.obj.scale.setScalar(1); pops.splice(i, 1); continue; }
        p.obj.scale.setScalar(Math.max(0.001, easeOutBack(k)));
      }
    }
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
    if (blocks) cloud.bootHadLocal = true;
    if (!blocks) {
      const raw = store.get(SAVE_KEY);
      if (raw) { try { const parsed = JSON.parse(raw); if (validList(parsed)) { blocks = parsed; cloud.bootHadLocal = true; } } catch (e) { /* ignore */ } }
    }
    if (!blocks) blocks = sampleCastle();
    loadBlocks(blocks, false);
    if (!charList) {
      const rawC = store.get(CHARS_KEY);
      if (rawC) { try { const pc = JSON.parse(rawC); if (validChars(pc)) charList = pc; } catch (e) { /* ignore */ } }
    }
    if (!charList) { charList = starterChars(); }
    loadChars(charList);
    if (!store.get(CHARS_KEY)) store.set(CHARS_KEY, JSON.stringify(serializeChars()));
    cloud.bootAt = Number(store.get(AT_KEY) || 0);
    applyNight(0);
    const nightOn = typeof data.night === 'boolean' ? data.night : store.get(NIGHT_KEY) === '1';
    if (nightOn) setNight(true, true);
    layout();
    resetView();
    refreshUI();
    initCloud();
    requestAnimationFrame(frame);
  }
  try {
    const hot = window.claude && window.claude.hot;
    if (hot && typeof hot.snapshot === 'function') hot.snapshot(() => ({ blocks: serialize(), chars: serializeChars(), night: nightTarget === 1 }));
  } catch (e) { /* no hot reload */ }
  const hot = window.claude && window.claude.hot;
  if (hot && typeof hot.ready === 'function') hot.ready(start);
  else start((hot && hot.data) || {});
})();
