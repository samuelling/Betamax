// The houses: a Cape Cod cottage (the defenders) and a wooden dacha on the edge of St. Petersburg (the invaders).
// Same floor plan, different lives. Metres; the house spans x -6..6, z -4.5..4.5; the back yard runs to z = 22.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildBed, sway, crossTex, crossGeo, rngOf } from './garden.js';
import { LOOKS, SIZES } from './plantart.js';

const T = THREE, TAU = Math.PI * 2;
const H = 2.6, WT = 0.14;           // ceiling height, wall thickness

// ------------------------------------------------------------------ textures
function tex(w, h, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h, rngOf(w * 7 + h));
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 8; return t;
}
const speck = (g, w, h, r, n, a, col = '0,0,0') => { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${col},${a * r()})`; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); } };
const TX = {
  oak: () => tex(512, 512, (g, w, h, r) => {
    for (let y = 0; y < h; y += 64) { let x = -r() * 200; while (x < w) { const L = 180 + r() * 220, v = 150 + r() * 40; g.fillStyle = `rgb(${v},${v * 0.72},${v * 0.46})`; g.fillRect(x, y, L - 2, 62);
      for (let k = 0; k < 9; k++) { g.strokeStyle = `rgba(80,45,20,${0.05 + r() * 0.1})`; g.beginPath(); const yy = y + 4 + r() * 54; g.moveTo(x, yy); g.bezierCurveTo(x + L * 0.3, yy + (r() - 0.5) * 8, x + L * 0.6, yy + (r() - 0.5) * 8, x + L, yy); g.stroke(); }
      g.fillStyle = 'rgba(40,20,8,.55)'; g.fillRect(x + L - 2, y, 2, 62); x += L; } g.fillStyle = 'rgba(40,20,8,.6)'; g.fillRect(0, y + 62, w, 2); }
  }, 3, 3),
  paintedBoards: () => tex(512, 512, (g, w, h, r) => {
    for (let y = 0; y < h; y += 85) { g.fillStyle = `rgb(${120 + r() * 10},${58 + r() * 6},${40 + r() * 6})`; g.fillRect(0, y, w, 83); g.fillStyle = 'rgba(30,10,5,.55)'; g.fillRect(0, y + 83, w, 2);
      for (let k = 0; k < 14; k++) { g.fillStyle = `rgba(255,220,190,${r() * 0.06})`; g.fillRect(r() * w, y + r() * 80, 40 + r() * 120, 2); } }
    speck(g, w, h, r, 900, 0.12);
  }, 3, 3),
  paint: (hex) => tex(256, 256, (g, w, h, r) => { g.fillStyle = hex; g.fillRect(0, 0, w, h); speck(g, w, h, r, 1600, 0.035); speck(g, w, h, r, 900, 0.04, '255,255,255'); }, 3, 2),
  beadboard: () => tex(256, 256, (g, w, h) => { g.fillStyle = '#f1eee4'; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 32) { g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(x, 0, 2, h); g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(x + 2, 0, 1, h); } }, 6, 1),
  wallpaper: () => tex(256, 256, (g, w, h, r) => {
    g.fillStyle = '#d9cfb0'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 64) { g.fillStyle = 'rgba(120,140,90,.18)'; g.fillRect(x + 28, 0, 8, h); }
    const flower = (x, y, s) => { for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; g.fillStyle = 'rgba(170,80,70,.55)'; g.beginPath(); g.ellipse(x + Math.cos(a) * 5 * s, y + Math.sin(a) * 5 * s, 4 * s, 2.5 * s, a, 0, TAU); g.fill(); }
      g.fillStyle = 'rgba(220,180,90,.8)'; g.beginPath(); g.arc(x, y, 2.4 * s, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(90,120,70,.6)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y + 6 * s); g.quadraticCurveTo(x + 8 * s, y + 16 * s, x + 2, y + 26 * s); g.stroke(); };
    for (let y = 0; y < h; y += 64) for (let x = 0; x < w; x += 64) { flower(x + 32, y + 18, 1); flower(x, y + 50, 0.8); }
    speck(g, w, h, r, 800, 0.05);
  }, 5, 2.5),
  shingles: (hex = '#8a857c') => tex(512, 512, (g, w, h, r) => {
    const cc = new THREE.Color(hex); g.fillStyle = '#4a4640'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 42) { let x = (y / 42 % 2) * -30; while (x < w) { const L = 34 + r() * 60, v = 0.8 + r() * 0.4; g.fillStyle = `rgb(${cc.r * 255 * v | 0},${cc.g * 255 * v | 0},${cc.b * 255 * v | 0})`; g.fillRect(x, y, L - 3, 41);
      for (let k = 0; k < 4; k++) { g.fillStyle = `rgba(40,38,34,${r() * 0.18})`; g.fillRect(x + r() * L, y, 1, 41); } g.fillStyle = 'rgba(20,18,15,.45)'; g.fillRect(x, y + 38, L, 3); x += L; } }
  }, 4, 2),
  planks: (hex) => tex(256, 256, (g, w, h, r) => { g.fillStyle = hex; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 32) { g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, y + 29, w, 3); g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(0, y, w, 2); } speck(g, w, h, r, 1500, 0.08); speck(g, w, h, r, 500, 0.08, '255,255,255'); }, 4, 3),
  roofAsphalt: () => tex(256, 256, (g, w, h, r) => { g.fillStyle = '#3a3836'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 32) { let x = (y / 32 % 2) * 20; while (x < w) { const v = 45 + r() * 20; g.fillStyle = `rgb(${v},${v},${v - 2})`; g.fillRect(x, y, 38, 30); x += 40; } g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(0, y + 29, w, 3); } speck(g, w, h, r, 3000, 0.2, '200,200,200'); }, 6, 3),
  roofMetal: (hex = '#3a6a4a') => tex(256, 64, (g, w, h) => { const c = new THREE.Color(hex); for (let x = 0; x < w; x++) { const v = 0.75 + 0.35 * Math.sin(x / w * TAU * 8); g.fillStyle = `rgb(${Math.min(255, c.r * 255 * v) | 0},${Math.min(255, c.g * 255 * v) | 0},${Math.min(255, c.b * 255 * v) | 0})`; g.fillRect(x, 0, 1, h); } }, 8, 1),
  plaid: (a, b) => tex(256, 256, (g, w, h) => { g.fillStyle = a; g.fillRect(0, 0, w, h); for (let i = 0; i < 4; i++) { g.fillStyle = b; g.globalAlpha = 0.45; g.fillRect(i * 64 + 10, 0, 18, h); g.fillRect(0, i * 64 + 10, w, 18); g.globalAlpha = 0.25; g.fillStyle = '#f2ead8'; g.fillRect(i * 64 + 44, 0, 3, h); g.fillRect(0, i * 64 + 44, w, 3); g.globalAlpha = 1; } }, 2, 2),
  carpet: () => tex(512, 512, (g, w, h, r) => {   // the wall rug: deep red field, medallion, borders
    g.fillStyle = '#7a1c1c'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#d8b46a'; g.lineWidth = 10; g.strokeRect(20, 20, w - 40, h - 40); g.strokeStyle = '#1e2a4a'; g.lineWidth = 22; g.strokeRect(46, 46, w - 92, h - 92);
    for (let k = 0; k < 40; k++) { const a = k / 40 * TAU; g.fillStyle = k % 2 ? '#d8b46a' : '#1e2a4a'; g.beginPath(); g.ellipse(w / 2 + Math.cos(a) * 120, h / 2 + Math.sin(a) * 120, 16, 7, a, 0, TAU); g.fill(); }
    g.fillStyle = '#1e2a4a'; g.beginPath(); for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; g.lineTo(w / 2 + Math.cos(a) * 80, h / 2 + Math.sin(a) * 80); g.lineTo(w / 2 + Math.cos(a + 0.39) * 46, h / 2 + Math.sin(a + 0.39) * 46); } g.fill();
    g.fillStyle = '#d8b46a'; g.beginPath(); g.arc(w / 2, h / 2, 24, 0, TAU); g.fill();
    for (const [x, y] of [[90, 90], [w - 90, 90], [90, h - 90], [w - 90, h - 90]]) { g.fillStyle = '#d8b46a'; g.beginPath(); g.arc(x, y, 20, 0, TAU); g.fill(); g.fillStyle = '#1e2a4a'; g.beginPath(); g.arc(x, y, 9, 0, TAU); g.fill(); }
    speck(g, w, h, r, 9000, 0.12);
  }),
  braided: () => tex(256, 256, (g, w, h, r) => { const cols = ['#7a5a3a', '#a8442c', '#4a5a6a', '#c8b48a', '#5a6a3a']; for (let k = 0; k < 64; k++) { g.strokeStyle = cols[k % 5]; g.lineWidth = 3; g.beginPath(); g.ellipse(w / 2, h / 2, w / 2 - k * 2, h / 2 - k * 2, 0, 0, TAU); g.stroke(); } speck(g, w, h, r, 2000, 0.15); }),
  runner: () => tex(64, 512, (g, w, h) => { const cols = ['#a83a2a', '#e8dcc0', '#3a6a8a', '#e8dcc0', '#5a8a3a']; for (let y = 0; y < h; y += 12) { g.fillStyle = cols[(y / 12) % 5]; g.fillRect(0, y, w, 12); } }, 1, 2),
  oilcloth: () => tex(256, 256, (g, w, h) => { g.fillStyle = '#f4f0e4'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 32) for (let x = 0; x < w; x += 32) { if ((x + y) / 32 % 2) { g.fillStyle = 'rgba(200,60,60,.35)'; g.fillRect(x, y, 32, 32); } g.fillStyle = 'rgba(60,120,60,.6)'; g.beginPath(); g.arc(x + 16, y + 16, 4, 0, TAU); g.fill(); } }, 3, 3),
  tile: (a, b) => tex(256, 256, (g, w, h) => { for (let y = 0; y < h; y += 32) for (let x = 0; x < w; x += 64) { g.fillStyle = a; g.fillRect(x + (y / 32 % 2) * 32, y, 62, 30); } g.fillStyle = b; for (let y = 0; y < h; y += 32) g.fillRect(0, y + 30, w, 2); }, 3, 2),
  clapboard: (hex) => tex(256, 256, (g, w, h, r) => { g.fillStyle = hex; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 26) { const gr = g.createLinearGradient(0, y, 0, y + 26); gr.addColorStop(0, 'rgba(255,255,255,.14)'); gr.addColorStop(0.85, 'rgba(0,0,0,.04)'); gr.addColorStop(1, 'rgba(0,0,0,.4)'); g.fillStyle = gr; g.fillRect(0, y, w, 26); } speck(g, w, h, r, 900, 0.05); }, 4, 3),
  vinyl: (hex) => tex(256, 256, (g, w, h, r) => { g.fillStyle = hex; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 21) { g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(0, y + 19, w, 2); g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(0, y, w, 2); } speck(g, w, h, r, 400, 0.03); }, 4, 3),
  brick: (hex) => tex(256, 256, (g, w, h, r) => { g.fillStyle = '#b8b0a4'; g.fillRect(0, 0, w, h); const c = new THREE.Color(hex); for (let y = 0; y < h; y += 16) { let x = (y / 16 % 2) * -16; while (x < w) { const k = 0.82 + r() * 0.3; g.fillStyle = `rgb(${c.r * 255 * k | 0},${c.g * 255 * k | 0},${c.b * 255 * k | 0})`; g.fillRect(x + 1, y + 1, 30, 13); x += 32; } } speck(g, w, h, r, 2500, 0.15); }, 6, 5),
  logs: (hex) => tex(256, 256, (g, w, h, r) => { const c = new THREE.Color(hex); for (let y = 0; y < h; y += 32) { const gr = g.createLinearGradient(0, y, 0, y + 32); gr.addColorStop(0, '#2a1a10'); gr.addColorStop(0.15, `rgb(${c.r * 255 | 0},${c.g * 255 | 0},${c.b * 255 | 0})`); gr.addColorStop(0.55, `rgb(${c.r * 300 | 0},${c.g * 290 | 0},${c.b * 270 | 0})`); gr.addColorStop(0.9, `rgb(${c.r * 200 | 0},${c.g * 190 | 0},${c.b * 170 | 0})`); gr.addColorStop(1, '#2a1a10'); g.fillStyle = gr; g.fillRect(0, y, w, 32); } for (let k = 0; k < 60; k++) { g.strokeStyle = `rgba(40,25,10,${r() * 0.3})`; const y = r() * h; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + (r() - 0.5) * 4); g.stroke(); } }, 3, 3),
  stucco: (hex) => tex(256, 256, (g, w, h, r) => { g.fillStyle = hex; g.fillRect(0, 0, w, h); speck(g, w, h, r, 9000, 0.06); speck(g, w, h, r, 4000, 0.05, '255,255,255'); }, 4, 3),
  panel: (hex, stripe) => tex(512, 512, (g, w, h, r) => { g.fillStyle = hex; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 128) for (let x = 0; x < w; x += 128) { g.strokeStyle = 'rgba(60,60,60,.5)'; g.lineWidth = 3; g.strokeRect(x + 1, y + 1, 126, 126); } if (stripe) { g.fillStyle = stripe; for (let y = 96; y < h; y += 128) g.fillRect(0, y, w, 10); } speck(g, w, h, r, 5000, 0.1); }, 3, 2),
  facade: (hex, kind, stripe) => tex(512, 512, (g, w, h, r) => {   // a block of flats: window grid, balconies, the odd lit window and curtain
    g.fillStyle = hex; g.fillRect(0, 0, w, h);
    if (kind === 'brick') { for (let y = 0; y < h; y += 6) { g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(0, y, w, 1); } }
    if (kind === 'panel') for (let y = 0; y < h; y += 128) for (let x = 0; x < w; x += 128) { g.strokeStyle = 'rgba(60,60,60,.45)'; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, 126, 126); }
    for (let y = 0; y < h; y += 128) for (let x = 0; x < w; x += 128) {
      const lit = r() < 0.1, cur = ['#e8e0c8', '#c8d0d8', '#e8c8b0', '#d8e0c0'][Math.floor(r() * 4)];
      g.fillStyle = '#f0f0ea'; g.fillRect(x + 30, y + 26, 68, 76);
      g.fillStyle = lit ? '#f0d890' : '#3a4a5a'; g.fillRect(x + 34, y + 30, 60, 68);
      g.fillStyle = cur; g.globalAlpha = 0.7; g.fillRect(x + 34, y + 30, 14, 68); g.fillRect(x + 80, y + 30, 14, 68); g.globalAlpha = 1;
      g.fillStyle = '#f0f0ea'; g.fillRect(x + 62, y + 30, 3, 68);
      if ((x / 128 + y / 128) % 2 === 0 && kind !== 'stucco') { g.fillStyle = 'rgba(80,80,80,.85)'; g.fillRect(x + 20, y + 92, 88, 26); g.fillStyle = 'rgba(200,200,190,.6)'; g.fillRect(x + 20, y + 92, 88, 4); }
      if (kind === 'stucco') { g.fillStyle = 'rgba(255,255,250,.7)'; g.fillRect(x + 24, y + 18, 80, 8); g.fillRect(x + 28, y + 104, 72, 6); }
    }
    if (stripe) { g.fillStyle = stripe; for (let y = 116; y < h; y += 128) g.fillRect(0, y, w, 8); }
    speck(g, w, h, r, 4000, 0.08);
  }, 1, 1),
  paper2: () => tex(256, 256, (g, w, h, r) => { g.fillStyle = '#cfc6a8'; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 32) { g.fillStyle = 'rgba(140,110,70,.2)'; g.fillRect(x, 0, 14, h); } for (let y = 0; y < h; y += 32) for (let x = 0; x < w; x += 32) { g.fillStyle = 'rgba(110,80,60,.35)'; g.beginPath(); g.moveTo(x + 23, y + 6); g.lineTo(x + 29, y + 16); g.lineTo(x + 23, y + 26); g.lineTo(x + 17, y + 16); g.fill(); } speck(g, w, h, r, 800, 0.05); }, 6, 3),
  persian: () => tex(512, 512, (g, w, h, r) => { g.fillStyle = '#6a1a1a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#d8b46a'; g.lineWidth = 14; g.strokeRect(14, 14, w - 28, h - 28); g.strokeStyle = '#1a2a4a'; g.lineWidth = 30; g.strokeRect(50, 50, w - 100, h - 100); for (let y = 100; y < h - 100; y += 40) for (let x = 100; x < w - 100; x += 40) { g.fillStyle = (x + y) % 80 ? '#d8b46a' : '#1a2a4a'; g.beginPath(); g.moveTo(x + 20, y + 4); g.lineTo(x + 36, y + 20); g.lineTo(x + 20, y + 36); g.lineTo(x + 4, y + 20); g.fill(); } speck(g, w, h, r, 9000, 0.12); }),
  carpetFloor: () => tex(256, 256, (g, w, h, r) => { g.fillStyle = '#a8946a'; g.fillRect(0, 0, w, h); speck(g, w, h, r, 20000, 0.12); speck(g, w, h, r, 8000, 0.08, '255,255,255'); }, 6, 6),
  lino: () => tex(256, 256, (g, w, h, r) => { for (let y = 0; y < h; y += 64) for (let x = 0; x < w; x += 64) { g.fillStyle = ((x + y) / 64) % 2 ? '#c8b48a' : '#a88a5a'; g.fillRect(x, y, 64, 64); } speck(g, w, h, r, 6000, 0.1); }, 6, 6),
  pine: () => tex(512, 512, (g, w, h, r) => { for (let y = 0; y < h; y += 96) { g.fillStyle = `rgb(${200 + r() * 20},${160 + r() * 20},${100 + r() * 20})`; g.fillRect(0, y, w, 94); for (let k = 0; k < 10; k++) { g.strokeStyle = `rgba(140,90,40,${0.1 + r() * 0.15})`; g.beginPath(); const yy = y + r() * 90; g.moveTo(0, yy); g.bezierCurveTo(w * 0.3, yy + (r() - 0.5) * 20, w * 0.6, yy + (r() - 0.5) * 20, w, yy); g.stroke(); } for (let k = 0; k < 2; k++) { g.fillStyle = 'rgba(110,60,20,.4)'; g.beginPath(); g.ellipse(r() * w, y + 47, 8, 5, 0, 0, TAU); g.fill(); } g.fillStyle = 'rgba(60,30,10,.5)'; g.fillRect(0, y + 94, w, 2); } }, 3, 3),
  parquet: () => tex(256, 256, (g, w, h, r) => { for (let y = 0; y < h; y += 32) for (let x = 0; x < w; x += 32) { const v = 120 + r() * 40; g.fillStyle = `rgb(${v},${v * 0.66},${v * 0.38})`; g.fillRect(x, y, 32, 32); g.strokeStyle = 'rgba(40,20,8,.5)'; g.strokeRect(x, y, 32, 32); for (let k = 1; k < 4; k++) { g.fillStyle = 'rgba(40,20,8,.25)'; if (((x + y) / 32) % 2) g.fillRect(x + k * 8, y, 1, 32); else g.fillRect(x, y + k * 8, 32, 1); } } }, 4, 4),
  sand: () => tex(256, 256, (g, w, h, r) => { g.fillStyle = '#d2c29a'; g.fillRect(0, 0, w, h); speck(g, w, h, r, 14000, 0.15); speck(g, w, h, r, 5000, 0.12, '255,255,255'); }, 30, 30),
  dirt: () => tex(256, 256, (g, w, h, r) => { g.fillStyle = '#7a6a4a'; g.fillRect(0, 0, w, h); speck(g, w, h, r, 9000, 0.25); for (let i = 0; i < 6000; i++) { g.fillStyle = `rgba(80,110,40,${r() * 0.4})`; g.fillRect(r() * w, r() * h, 1, 3); } }, 20, 20),
  woodRoof: () => tex(256, 256, (g, w, h, r) => { g.fillStyle = '#6a6258'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 20) { let x = (y / 20 % 2) * 10; while (x < w) { const v = 80 + r() * 40; g.fillStyle = `rgb(${v},${v * 0.95},${v * 0.88})`; g.fillRect(x, y, 18, 19); x += 20; } } speck(g, w, h, r, 2000, 0.2); }, 8, 4),
  slate: () => tex(256, 256, (g, w, h, r) => { g.fillStyle = '#2a2a30'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 24) { let x = (y / 24 % 2) * 16; while (x < w) { const v = 50 + r() * 25; g.fillStyle = `rgb(${v},${v},${v + 8})`; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 30, y); g.lineTo(x + 30, y + 18); g.arc(x + 15, y + 18, 15, 0, Math.PI); g.fill(); x += 32; } } }, 6, 3),
  logWall: () => tex(256, 256, (g, w, h) => { for (let y = 0; y < h; y += 32) { const gr = g.createLinearGradient(0, y, 0, y + 32); gr.addColorStop(0, '#5a3a20'); gr.addColorStop(0.3, '#c8965a'); gr.addColorStop(0.7, '#b8864a'); gr.addColorStop(1, '#5a3a20'); g.fillStyle = gr; g.fillRect(0, y, w, 32); } }, 3, 3),
  lawn: () => tex(512, 512, (g, w, h, r) => { g.fillStyle = '#4f6e2f'; g.fillRect(0, 0, w, h); for (let i = 0; i < 26000; i++) { const v = r(); g.fillStyle = v < 0.5 ? `rgba(40,70,20,${r() * 0.5})` : `rgba(140,170,70,${r() * 0.35})`; g.fillRect(r() * w, r() * h, 1, 2 + r() * 4); } }, 14, 14),
  soil: () => tex(256, 256, (g, w, h, r) => { g.fillStyle = '#4a3624'; g.fillRect(0, 0, w, h); speck(g, w, h, r, 9000, 0.4); speck(g, w, h, r, 3000, 0.15, '200,170,130'); }, 3, 3),
  pavers: () => tex(256, 256, (g, w, h, r) => { g.fillStyle = '#5a5a52'; g.fillRect(0, 0, w, h); const rect = (x, y, a, b) => { const v = 120 + r() * 40; g.fillStyle = `rgb(${v * 0.8},${v * 0.85},${v * 0.9})`; g.fillRect(x + 3, y + 3, a - 6, b - 6); }; rect(0, 0, 128, 96); rect(128, 0, 128, 128); rect(0, 96, 96, 160); rect(96, 128, 160, 128); rect(96, 96, 32, 32); speck(g, w, h, r, 3000, 0.15); }, 2, 2),
  birch: () => tex(128, 512, (g, w, h, r) => { g.fillStyle = '#ecebe4'; g.fillRect(0, 0, w, h); for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(20,20,20,${0.5 + r() * 0.5})`; const y = r() * h, L = 8 + r() * 50; g.fillRect(r() * w - 10, y, L, 2 + r() * 5); } speck(g, w, h, r, 2000, 0.1); }),
  bark: () => tex(128, 512, (g, w, h, r) => { g.fillStyle = '#4a3c30'; g.fillRect(0, 0, w, h); for (let i = 0; i < 90; i++) { g.strokeStyle = `rgba(20,14,10,${0.3 + r() * 0.5})`; g.lineWidth = 1 + r() * 3; const x = r() * w; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + (r() - 0.5) * 20, h * 0.3, x + (r() - 0.5) * 20, h * 0.6, x + (r() - 0.5) * 10, h); g.stroke(); } speck(g, w, h, r, 2000, 0.15, '200,180,150'); }),
};

// ------------------------------------------------------------------ helpers
const std = (o) => new T.MeshStandardMaterial(Object.assign({ roughness: 0.8, metalness: 0 }, o));
const col = (hex, rough = 0.8, metal = 0) => std({ color: new T.Color(hex), roughness: rough, metalness: metal });
function mk(parent, geo, mat, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = m.receiveShadow = true; parent.add(m); return m; }
const B = (w, h, d) => new T.BoxGeometry(w, h, d);
const RB = (w, h, d, r = 0.02) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
const CY = (r0, r1, h, s = 16) => new T.CylinderGeometry(r0, r1, h, s);
// world-aligned UVs on a box so wall textures run continuously
function boxUV(geo, scale = 1) {
  geo.computeBoundingBox(); const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    if (ay > 0.5) uv.setXY(i, x * scale, z * scale); else if (ax > 0.5) uv.setXY(i, z * scale, y * scale); else uv.setXY(i, x * scale, y * scale); }
  return geo;
}

// ------------------------------------------------------------------ the sheet: textures and colours for one house type
export function cultureSheet(c, Hs) {
  const E = Hs.ext, I = Hs.int, us = c === 'us';
  const extTex = { shingles: () => TX.shingles(E.color), clapboard: () => TX.clapboard(E.color), vinyl: () => TX.vinyl(E.color), brick: () => TX.brick(E.color), planks: () => TX.planks(E.color), logs: () => TX.logs(E.color), stucco: () => TX.stucco(E.color), panel: () => TX.panel(E.color, E.stripe) }[E.kind]();
  const roof = { asphalt: () => TX.roofAsphalt(), metal: () => TX.roofMetal(E.roofColor), wood: () => TX.woodRoof(), slate: () => TX.slate(), flat: () => TX.roofAsphalt() }[E.roof]();
  const floor = { oak: TX.oak, painted: TX.paintedBoards, pine: TX.pine, parquet: TX.parquet, carpet: TX.carpetFloor, lino: TX.lino }[I.floor]();
  const wall = I.wall === 'paper' ? TX.wallpaper() : I.wall === 'paper2' ? TX.paper2() : TX.paint(I.wall);
  const kitchen = I.kitchen === 'beadboard' ? TX.beadboard() : I.kitchen === 'logs' ? TX.logWall() : TX.tile(us ? '#f4f2ec' : '#dfe8ea', us ? '#c8c4bc' : '#a8b4b8');
  const rug = { braided: TX.braided, persian: TX.persian, runner: TX.runner, none: null }[I.rug];
  return {
    c, H: Hs, floor, wall, wall2: TX.paint(I.wall2), kitchenWall: kitchen, ext: extTex, roof, roofMetal: E.roof === 'metal' || E.roof === 'flat',
    trim: us ? '#f4f1e8' : '#efe8d8', extTrim: E.trim, couch: TX.plaid(I.couch[0], I.couch[1]), rug: rug ? rug() : null, rugKind: I.rug, counter: I.counter, cabinet: I.cabinet, table: I.table,
    phone: us ? '#d8cdb0' : '#b8302a', fence: '#8a8472', carpet: I.wallRug ? TX.carpet() : null, oilcloth: I.oilcloth ? TX.oilcloth() : null,
  };
}

// ------------------------------------------------------------------ walls with openings
// along x (axis 'x', at z) or along z (axis 'z', at x). openings: [a, b, bottom, top] in local metres along the wall
function wall(g, C, axis, at, from, to, opens, matIn, matOut, outward, colliders) {
  const solid = (a, b, y0, y1) => {
    if (b - a < 0.01 || y1 - y0 < 0.01) return;
    const L = b - a, mid = (a + b) / 2;
    const geo = axis === 'x' ? B(L, y1 - y0, WT) : B(WT, y1 - y0, L);
    const m = mk(g, boxUV(geo.translate(0, 0, 0), 1), [matIn, matIn, matIn, matIn, matIn, matIn], axis === 'x' ? mid : at, (y0 + y1) / 2, axis === 'x' ? at : mid);
    if (matOut && outward) { // the outer face in siding
      const mats = [matIn, matIn, matIn, matIn, matIn, matIn];
      const idx = axis === 'x' ? (outward > 0 ? 4 : 5) : (outward > 0 ? 0 : 1);
      mats[idx] = matOut; m.material = mats;
      // UVs in world space for continuity
      const p = m.geometry.attributes.position, uv = m.geometry.attributes.uv;
      for (let i = 0; i < p.count; i++) { const wx = p.getX(i) + m.position.x, wy = p.getY(i) + m.position.y, wz = p.getZ(i) + m.position.z; uv.setXY(i, (axis === 'x' ? wx : wz) * 0.5, wy * 0.5); }
    }
  };
  const os = [...opens].sort((p, q) => p[0] - q[0]);
  let cur = from;
  for (const [a, b, y0, y1] of os) {
    solid(cur, a, 0, H);
    solid(a, b, 0, y0); solid(a, b, y1, H);
    if (y0 > 0.05) addCol(colliders, axis, at, a, b);   // windows block; doors don't
    else if (colliders) addCol(colliders, axis, at, cur, a);
    if (y0 <= 0.05) cur = b; else { if (colliders) addCol(colliders, axis, at, cur, a); cur = b; }
  }
  solid(cur, to, 0, H); addCol(colliders, axis, at, cur, to);
}
function addCol(cols, axis, at, a, b) { if (!cols || b - a < 0.01) return; if (axis === 'x') cols.push([a, at - WT / 2 - 0.02, b, at + WT / 2 + 0.02]); else cols.push([at - WT / 2 - 0.02, a, at + WT / 2 + 0.02, b]); }

function windowFrame(g, C, axis, at, a, b, y0, y1, outward, extra) {
  const trim = col(C.trim, 0.5), glass = std({ color: 0xbfd3dc, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.12, depthWrite: false });
  const L = b - a, mid = (a + b) / 2, h = y1 - y0, cy = (y0 + y1) / 2;
  const P = (u, y, v) => (axis === 'x' ? [u, y, at + v] : [at + v, y, u]);
  const rot = axis === 'x' ? 0 : Math.PI / 2;
  const gl = mk(g, new T.PlaneGeometry(L, h), glass, ...P(mid, cy, 0), rot); gl.castShadow = false; gl.receiveShadow = false; gl.renderOrder = 5;
  for (const s of [-1, 1]) {
    mk(g, B(axis === 'x' ? 0.06 : WT + 0.06, h + 0.1, axis === 'x' ? WT + 0.06 : 0.06), trim, ...P(mid + s * (L / 2 + 0.0), cy, 0));
    mk(g, B(axis === 'x' ? L + 0.14 : WT + 0.08, 0.06, axis === 'x' ? WT + 0.08 : L + 0.14), trim, ...P(mid, s < 0 ? y0 - 0.03 : y1 + 0.03, 0));
  }
  mk(g, B(axis === 'x' ? 0.035 : WT * 0.5, h, axis === 'x' ? WT * 0.5 : 0.035), trim, ...P(mid, cy, 0));          // mullion
  mk(g, B(axis === 'x' ? L : WT * 0.5, 0.035, axis === 'x' ? WT * 0.5 : L), trim, ...P(mid, cy + h * 0.12, 0));    // transom bar
  mk(g, B(axis === 'x' ? L + 0.2 : 0.22, 0.04, axis === 'x' ? 0.22 : L + 0.2), trim, ...P(mid, y0 - 0.06, outward * -0.06)); // inner sill
  if (extra) extra(P, mid, cy, L, h, rot);
}

// ------------------------------------------------------------------ the house
export function buildHouse(C, renderer) {
  const g = new T.Group(), cols = [], A = {};
  const us = C.c === 'us';
  const wallMat = std({ map: C.wall, roughness: 0.92 }), wall2 = std({ map: C.wall2, roughness: 0.92 }), kitch = std({ map: C.kitchenWall, roughness: 0.6 });
  const extMat = std({ map: C.ext, roughness: 0.95 });
  // floor & ceiling
  const fl = mk(g, boxUV(B(12, 0.1, 9), 0.5), std({ map: C.floor, roughness: 0.55 }), 0, -0.05, 0); fl.castShadow = false;
  mk(g, B(12.3, 0.12, 9.3), col(us ? '#f6f3ec' : '#efe9dc', 0.95), 0, H + 0.06, 0);
  // exterior walls: front z=-4.5 (outward -1), back z=+4.5 (+1), west x=-6 (-1), east x=+6 (+1)
  const W = (y0, y1) => [y0, y1];
  const win = (c, w) => [c - w / 2, c + w / 2, 0.9, 2.2];
  const front = [win(-4.4, 1.3), win(-2.0, 1.3), win(4.0, 1.2)];
  const back = [[-4.5, -3.55, 0, 2.15], win(1.6, 1.5), win(4.6, 1.0)];
  const west = [win(-2.5, 1.2), win(2.8, 0.8)];
  const east = [win(-2.4, 1.1), win(2.6, 1.0)];
  const E = C.H.ext;
  const nal = E.nal && ((P, mid, cy, L, h, rot) => { // carved window surrounds (nalichniki) on the outside
    const wt = col(E.nalColor || '#f6f4ee', 0.6);
    for (const s of [-1, 1]) mk(g, B(0.12, h + 0.3, 0.04), wt, ...P(mid + s * (L / 2 + 0.1), cy, 0), rot).position.add(new T.Vector3(0, 0, 0));
    const top = mk(g, B(L + 0.5, 0.3, 0.05), wt, ...P(mid, cy + h / 2 + 0.28, 0), rot);
    const crown = mk(g, new T.ConeGeometry((L + 0.4) / 2, 0.32, 3, 1), wt, ...P(mid, cy + h / 2 + 0.58, 0), rot + Math.PI / 6); crown.scale.set(1, 1, 0.12);
  });
  const extOff = (axis, at, out) => [axis, at, out];
  wall(g, C, 'x', -4.5, -6, 6, front, wallMat, extMat, -1, cols);
  wall(g, C, 'x', 4.5, -6, 6, back, us ? wallMat : wallMat, extMat, 1, cols);
  wall(g, C, 'z', -6, -4.5, 4.5, west, wallMat, extMat, -1, cols);
  wall(g, C, 'z', 6, -4.5, 4.5, east, wallMat, extMat, 1, cols);
  for (const [a, b, y0, y1] of front) if (y0 > 0) windowFrame(g, C, 'x', -4.5, a, b, y0, y1, -1, nal && ((P, m, cy, L, h, rot) => nal((u, y, v) => P(u, y, v - 0.1), m, cy, L, h, rot)));
  for (const [a, b, y0, y1] of back) if (y0 > 0) windowFrame(g, C, 'x', 4.5, a, b, y0, y1, 1, nal && ((P, m, cy, L, h, rot) => nal((u, y, v) => P(u, y, v + 0.1), m, cy, L, h, rot)));
  for (const [a, b, y0, y1] of west) windowFrame(g, C, 'z', -6, a, b, y0, y1, -1, nal && ((P, m, cy, L, h, rot) => nal((u, y, v) => P(u, y, v - 0.1), m, cy, L, h, rot)));
  for (const [a, b, y0, y1] of east) windowFrame(g, C, 'z', 6, a, b, y0, y1, 1, nal && ((P, m, cy, L, h, rot) => nal((u, y, v) => P(u, y, v + 0.1), m, cy, L, h, rot)));
  // interior walls
  wall(g, C, 'x', 0, -6, 6, [[-4.7, -3.6, 0, 2.1], [-0.7, 0.9, 0, 2.2]], wall2, null, 0, cols);
  wall(g, C, 'z', 1.5, -4.5, 0, [[-1.5, -0.5, 0, 2.1]], wallMat, null, 0, cols);
  wall(g, C, 'z', -1.5, 0, 4.5, [[1.5, 2.5, 0, 2.1]], wall2, null, 0, cols);
  // kitchen wall finish: tile/beadboard wainscot on the back wall
  mk(g, B(7.4, 1.2, 0.02), kitch, 2.3, 0.6, 4.42).castShadow = false;
  // baseboards
  for (const [x, z, w, d] of [[0, -4.42, 12, 0.02], [0, 4.42, 12, 0.02], [-5.92, 0, 0.02, 9], [5.92, 0, 0.02, 9]]) mk(g, B(w, 0.12, d), col(C.trim, 0.5), x, 0.06, z);
  // the back door: screen door frame, a step down to the yard
  const dt = col(C.trim, 0.5);
  mk(g, B(0.08, 2.15, 0.2), dt, -4.53, 1.075, 4.5); mk(g, B(0.08, 2.15, 0.2), dt, -3.52, 1.075, 4.5); mk(g, B(1.1, 0.08, 0.2), dt, -4.03, 2.17, 4.5);
  const screen = new T.Group(); screen.position.set(-4.5, 0, 4.6); g.add(screen); screen.rotation.y = -1.1;
  mk(screen, B(0.9, 2.05, 0.04), std({ color: 0x404040, transparent: true, opacity: 0.25, roughness: 0.9 }), 0.45, 1.05, 0).castShadow = false;
  for (const [y, h] of [[0.05, 0.1], [1.02, 0.08], [2.04, 0.08]]) mk(screen, B(0.92, h, 0.05), col(us ? '#f4f1e8' : '#7a5a3a', 0.6), 0.46, y, 0);
  for (const x of [0.02, 0.9]) mk(screen, B(0.06, 2.1, 0.05), col(us ? '#f4f1e8' : '#7a5a3a', 0.6), x, 1.05, 0);
  mk(g, B(1.6, 0.18, 0.9), us ? col('#7a7a74', 0.9) : col('#6a5a46', 0.9), -4.03, -0.09, 5.0);  // step
  // ---------------- the outside, by type
  const trimM = col(E.trim, 0.5), roofMat = std({ map: C.roof, roughness: C.roofMetal ? 0.45 : 0.95, metalness: C.roofMetal ? 0.35 : 0 });
  const storeys = E.storeys || 1, FH = 2.9, top = H + (storeys - 1) * FH;
  const facadeMat = storeys >= 3 ? std({ map: TX.facade(E.color, E.kind, E.stripe), roughness: 0.9 }) : null;
  if (facadeMat) facadeMat.map.repeat.set(1, 1);
  // upper floors: the rest of the building above this flat / this house
  if (storeys > 1) {
    const hgt = top - H, wide = E.wide ? 28 : 6.1, depth = 4.6;
    const up = mk(g, B(wide * 2, hgt, depth * 2), facadeMat || extMat, 0, H + hgt / 2, 0);
    { const p = up.geometry.attributes.position, n = up.geometry.attributes.normal, uv = up.geometry.attributes.uv;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i) + H + hgt / 2, z = p.getZ(i), ax = Math.abs(n.getX(i));
        const u = (ax > 0.5 ? z : x), sc = facadeMat ? 1 / 3.2 : 0.5; uv.setXY(i, u * sc, facadeMat ? (y - H) / FH : y * 0.5); } }
    if (!facadeMat) for (const zf of [-4.62, 4.62]) for (let f = 1; f < storeys; f++) for (const wx of [-4.2, -1.6, 1.6, 4.2]) { // windows of the floors above
      const y = H + (f - 1) * FH + 1.5; mk(g, B(1.0, 1.25, 0.04), col('#2e3a44', 0.15, 0.2), wx, y, zf);
      for (const [dx, dy, w2, h2] of [[0, 0.66, 1.16, 0.08], [0, -0.66, 1.16, 0.08], [-0.54, 0, 0.08, 1.3], [0.54, 0, 0.08, 1.3], [0, 0, 0.05, 1.25]]) mk(g, B(w2, h2, 0.06), trimM, wx + dx, y + dy, zf + Math.sign(zf) * 0.01);
      if (E.shutters) for (const s2 of [-1, 1]) mk(g, B(0.38, 1.3, 0.04), col(E.shutters, 0.6), wx + s2 * 0.78, y, zf + Math.sign(zf) * 0.02);
      if (E.nal) nal((u, yy, v) => [u, yy, zf + Math.sign(zf) * 0.04], wx, y, 1.0, 1.25, 0);
    }
  }
  // a wider building: flats on either side of this one
  if (E.wide) for (const sx of [-1, 1]) { const w2 = 22, m = mk(g, B(w2, top, 9.2), facadeMat || extMat, sx * (6 + w2 / 2 + 0.05), top / 2, 0);
    const p = m.geometry.attributes.position, n = m.geometry.attributes.normal, uv = m.geometry.attributes.uv;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i) + m.position.x, y = p.getY(i) + top / 2, z = p.getZ(i), ax = Math.abs(n.getX(i)); uv.setXY(i, (ax > 0.5 ? z : x) / 3.2, y / FH); }
    cols.push(sx < 0 ? [-28, -4.6, -6, 4.6] : [6, -4.6, 28, 4.6]); }
  if (facadeMat && !E.wide) {} // (all the tall ones are wide)
  // the ground floor of a block shows the same facade outside: dress the walls of this flat to match
  // roof
  const shape = E.shape, RH = E.low ? 1.6 : shape === 'gambrel' ? 3.6 : 2.9, half = 9.3 / 2 + 0.4;
  const roofPlane = (len, wdt, y, z, tilt, extra = 0) => { const r = mk(g, B(len, 0.12, wdt), roofMat, 0, y, z, 0, tilt); const uv = r.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / 3, uv.getY(i) * wdt / 3); return r; };
  const roofLen = E.wide ? 56.3 : 13.0;
  if (shape === 'flat') {
    mk(g, B(roofLen, 0.3, 9.4), col(E.roofColor || '#5a5a5a', 0.9), 0, top + 0.15, 0);
    for (const sz of [-1, 1]) mk(g, B(roofLen, 0.5, 0.2), facadeMat ? col(E.color, 0.9) : trimM, 0, top + 0.4, sz * 4.65);
    if (E.cornice) for (const sz of [-1, 1]) mk(g, B(roofLen + 0.2, 0.35, 0.4), col(E.trim, 0.7), 0, top - 0.2, sz * 4.7);
  } else if (shape === 'gambrel') {
    const lowH = RH * 0.6, lowRun = 1.2, hiH = RH - lowH, hiRun = half - lowRun;
    for (const sd of [-1, 1]) {
      roofPlane(roofLen, Math.hypot(lowH, lowRun), top + lowH / 2, sd * (half - lowRun / 2), sd * Math.atan2(lowH, lowRun));
      roofPlane(roofLen, Math.hypot(hiH, hiRun), top + lowH + hiH / 2, sd * hiRun / 2, sd * Math.atan2(hiH, hiRun));
    }
    for (const sx of [-1, 1]) { const shp = new T.Shape(); shp.moveTo(-half + 0.4, 0); shp.lineTo(-hiRun, lowH); shp.lineTo(0, RH); shp.lineTo(hiRun, lowH); shp.lineTo(half - 0.4, 0); shp.lineTo(-half + 0.4, 0);
      const gg = new T.ExtrudeGeometry(shp, { depth: 0.12, bevelEnabled: false }); gg.rotateY(Math.PI / 2); gg.translate(sx * 6.0 - 0.06, top + 0.05, 0); mk(g, gg, extMat); }
  } else {
    // gable, or a saltbox: the back slope runs long and low toward the yard
    const salt = shape === 'saltbox';
    const ridgeZ = salt ? -1.2 : 0, frontRun = half + ridgeZ, backRun = half - ridgeZ, backDrop = salt ? 1.4 : 0;
    roofPlane(roofLen, Math.hypot(RH, frontRun), top + RH / 2 + 0.05, -(frontRun / 2) + ridgeZ, -Math.atan2(RH, frontRun));
    roofPlane(roofLen, Math.hypot(RH + backDrop, backRun), top + (RH - backDrop) / 2 + 0.05, ridgeZ + backRun / 2, Math.atan2(RH + backDrop, backRun));
    for (const sx of [-1, 1]) { const shp = new T.Shape(); shp.moveTo(-half + 0.4, 0); shp.lineTo(ridgeZ, RH - 0.05); shp.lineTo(half - 0.4, 0); shp.lineTo(-half + 0.4, 0);
      const gg = new T.ExtrudeGeometry(shp, { depth: 0.12, bevelEnabled: false }); gg.rotateY(Math.PI / 2); gg.translate(sx * 6.0 - 0.06, top + 0.05, 0);
      const p = gg.attributes.position, uv = gg.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getZ(i) * 0.5, p.getY(i) * 0.5); if (!E.wide) mk(g, gg, extMat); }
    if (!E.wide) mk(g, B(0.7, 1.6, 0.7), col(E.kind === 'brick' ? E.color : '#8a4a3a', 0.9), 2.5, top + RH * 0.6, -1.4);   // chimney
  }
  mk(g, B(E.wide ? 56.3 : 12.3, 0.4, 9.3), col('#6a665e', 0.95), 0, -0.2, 0).castShadow = false;
  if (E.corner) for (const [x, z] of [[-6, -4.5], [6, -4.5], [-6, 4.5], [6, 4.5]]) mk(g, B(0.16, top, 0.16), trimM, x, top / 2, z);
  if (!E.wide && shape !== 'flat') for (const sz of [-1, 1]) mk(g, B(12.3, 0.16, 0.06), trimM, 0, top + 0.02, sz * 4.6);
  if (E.stripe && E.kind !== 'panel') for (const sz of [-1, 1]) mk(g, B(12.1, 0.3, 0.02), col(E.stripe, 0.6), 0, 1.2, sz * 4.58);
  if (E.shutters) { for (const [a, b, y0] of back) if (y0 > 0) for (const s2 of [-1, 1]) mk(g, B(0.4, 1.35, 0.04), col(E.shutters, 0.6), (a + b) / 2 + s2 * ((b - a) / 2 + 0.24), 1.55, 4.6); }
  // porches
  const porchWood = col(E.kind === 'logs' ? '#7a5a3a' : '#9a8a72', 0.85);
  if (E.porch === 'deck' || E.porch === 'stack' || E.porch === 'veranda') {
    const levels = E.porch === 'stack' ? storeys : 1;
    for (let f = 0; f < levels; f++) {
      const y = f === 0 ? 0.35 : H + (f - 1) * FH + 0.1;
      mk(g, B(5.2, 0.12, 2.2), porchWood, -3.3, y, 5.6).receiveShadow = true;
      for (const [x, z] of [[-5.85, 6.65], [-0.75, 6.65], [-3.3, 6.65]]) mk(g, B(0.12, (f === levels - 1 ? (E.porch === 'veranda' ? 2.6 : 1.05) : FH) + (f === 0 ? 0.35 : 0), 0.12), trimM, x, y + ((f === levels - 1 ? (E.porch === 'veranda' ? 2.6 : 1.05) : FH)) / 2 - (f === 0 ? 0.17 : 0), z);
      mk(g, B(5.2, 0.08, 0.08), trimM, -3.3, y + 1.0, 6.65); for (const xx of [-5.85, -0.75]) mk(g, B(0.08, 0.08, 2.2), trimM, xx, y + 1.0, 5.6);
      for (let k = 0; k < 24; k++) mk(g, B(0.04, 0.9, 0.04), trimM, -5.8 + k * 0.217, y + 0.5, 6.65);
    }
    if (E.porch === 'veranda') { mk(g, B(5.6, 0.1, 2.6), roofMat, -3.3, 3.0, 5.65, 0, 0.12); for (let k = 0; k < 6; k++) mk(g, B(0.8, 1.2, 0.02), std({ color: 0xc8dce4, transparent: true, opacity: 0.18, roughness: 0.05, depthWrite: false }), -5.4 + k * 0.85, 1.85, 6.66).castShadow = false; }
    // the deck is underfoot as you step out: a ramp of collision-free floor (walkable)
    A.deckY = 0.41;
  }
  if (E.kind === 'brick' || E.kind === 'stucco' || E.kind === 'panel') { /* no porch light */ } else mk(g, CY(0.07, 0.09, 0.22, 10), std({ color: 0x2a2a2a, roughness: 0.5, metalness: 0.6 }), -3.0, 2.0, 4.62);
  A.cols = cols;
  return { g, A };
}

// ------------------------------------------------------------------ furniture and life
export function furnish(C, g, cols, renderer) {
  const us = C.c === 'us', A = {};
  const wood = col(C.table, 0.6), dark = col('#3a2a1e', 0.6), white = col('#f3f0e8', 0.5), metal = std({ color: 0xb8bcc0, roughness: 0.3, metalness: 0.8 });
  const block = (x0, z0, x1, z1) => cols.push([x0, z0, x1, z1]);
  // ---------------- living room (x -6..1.5, z -4.5..0)
  // rug
  if (C.rug) { const k = C.rugKind; const rug = mk(g, k === 'braided' ? new T.CircleGeometry(1.6, 48) : k === 'runner' ? new T.PlaneGeometry(1.1, 4.2) : new T.PlaneGeometry(2.4, 1.7), std({ map: C.rug, roughness: 1 }), -2.6, 0.012, -2.3, 0, -Math.PI / 2); rug.castShadow = false; if (k === 'braided') rug.scale.set(1.25, 0.85, 1); }
  // couch facing the TV (TV on the west wall)
  const couch = new T.Group(); couch.position.set(-1.2, 0, -2.3); couch.rotation.y = Math.PI / 2; g.add(couch);
  const fab = std({ map: C.couch, roughness: 0.95 });
  mk(couch, RB(2.1, 0.42, 0.9, 0.06), fab, 0, 0.3, 0); mk(couch, RB(2.1, 0.55, 0.22, 0.08), fab, 0, 0.72, 0.36);
  for (const s of [-1, 1]) mk(couch, RB(0.2, 0.62, 0.9, 0.08), fab, s * 1.05, 0.38, 0);
  for (const s of [-0.5, 0.5]) mk(couch, RB(0.95, 0.14, 0.7, 0.06), fab, s, 0.57, -0.05);
  mk(couch, RB(0.42, 0.3, 0.12, 0.05), col(us ? '#c8a24a' : '#e0d6c0', 0.95), 0.62, 0.72, 0.22, 0.3, -0.2);
  if (!us) mk(couch, RB(0.7, 0.02, 0.5, 0.01), col('#f4f0e6', 1), 0, 1.0, 0.36, 0, -0.2);   // lace on the back
  block(-1.7, -3.4, -0.75, -1.2); A.couchSeat = new T.Vector3(-1.25, 0, -2.0); A.couchLook = new T.Vector3(-5.9, 0.9, -2.1);
  // coffee table
  mk(g, RB(0.6, 0.05, 1.1, 0.01), wood, -2.6, 0.42, -2.3); for (const [dx, dz] of [[-0.25, -0.5], [0.25, -0.5], [-0.25, 0.5], [0.25, 0.5]]) mk(g, B(0.05, 0.4, 0.05), wood, -2.6 + dx, 0.2, -2.3 + dz);
  block(-2.95, -2.9, -2.25, -1.7);
  // TV stand + CRT + the deck on top (as in the opening)
  const tv = new T.Group(); tv.position.set(-5.55, 0, -2.3); tv.rotation.y = Math.PI / 2; g.add(tv);
  mk(tv, RB(1.2, 0.5, 0.5, 0.02), us ? wood : col('#5a3a24', 0.5), 0, 0.25, 0);
  if (!us) mk(tv, B(0.7, 0.004, 0.42), col('#f4f0e6', 1), 0, 0.502, 0);
  mk(tv, RB(0.78, 0.58, 0.5, 0.04), col(us ? '#5e4a36' : '#2a2a2a', 0.5), 0, 0.8, 0);
  mk(tv, B(0.6, 0.46, 0.02), col('#151413', 0.4), -0.04, 0.81, 0.25);
  const scr = mk(tv, new T.PlaneGeometry(0.52, 0.39), new T.MeshBasicMaterial({ color: 0x0a0c0b }), -0.05, 0.81, 0.262); scr.castShadow = false;
  A.tvScreen = scr;
  const vcr = mk(tv, RB(0.44, 0.1, 0.34, 0.01), col('#232325', 0.45, 0.5), 0, 1.14, 0.02);
  mk(tv, B(0.44, 0.1, 0.004), col('#a8a49c', 0.4, 0.4), 0, 1.14, 0.19);
  A.vcrLed = mk(tv, B(0.08, 0.02, 0.004), new T.MeshBasicMaterial({ color: 0x0a2a24 }), 0.1, 1.15, 0.195);
  block(-5.9, -3.0, -5.2, -1.6);
  A.tvPos = new T.Vector3(-5.3, 0.9, -2.3); A.vcrPos = new T.Vector3(-5.35, 1.14, -2.3);
  // the console on the floor by the TV (a cartridge machine, wood-grain)
  const con = mk(g, RB(0.34, 0.08, 0.24, 0.02), col(us ? '#2a2420' : '#3a3a3e', 0.5), -4.9, 0.04, -1.25, 0.3);
  mk(g, RB(0.14, 0.04, 0.08, 0.01), col('#a83a2a', 0.6), -4.9, 0.1, -1.25, 0.3);
  A.consolePos = new T.Vector3(-4.9, 0.1, -1.25);
  // shelf with books and tapes (east side of the living room against the study wall)
  const shelf = new T.Group(); shelf.position.set(1.22, 0, -3.4); shelf.rotation.y = -Math.PI / 2; g.add(shelf);
  const shelfMat = us ? col('#ece6d6', 0.6) : col('#5a3a24', 0.45);
  mk(shelf, B(1.6, 2.0, 0.04), shelfMat, 0, 1.0, -0.17); for (const s of [-1, 1]) mk(shelf, B(0.04, 2.0, 0.36), shelfMat, s * 0.8, 1.0, 0);
  for (let k = 0; k < 5; k++) mk(shelf, B(1.6, 0.03, 0.36), shelfMat, 0, 0.05 + k * 0.48, 0);
  const r = rngOf(us ? 11 : 12), bookCols = us ? ['#7a2a24', '#2a4a6a', '#c8a24a', '#3a5a3a', '#e8e0cc', '#5a3a5a', '#2a2a2a'] : ['#6a1a1a', '#1a3a5a', '#3a4a2a', '#8a6a2a', '#d8ccb0', '#4a2a2a'];
  for (let k = 1; k < 4; k++) { let x = -0.76; while (x < 0.7) { const w = 0.025 + r() * 0.04, h = 0.24 + r() * 0.14; mk(shelf, B(w, h, 0.2 + r() * 0.06), col(bookCols[Math.floor(r() * bookCols.length)], 0.85), x + w / 2, 0.065 + k * 0.48 + h / 2, 0.02); x += w + 0.004; if (r() < 0.08) x += 0.12; } }
  if (!us) { const glass = std({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.25 }); for (let k = 0; k < 6; k++) mk(shelf, CY(0.03, 0.025, 0.12, 12), glass, -0.6 + k * 0.22, 0.065 + 4 * 0.48 + 0.06, 0.05); }
  // the tapes, bottom shelf: one of them is the one
  A.tapes = [];
  for (let k = 0; k < 7; k++) { const t = mk(shelf, B(0.026, 0.1, 0.16), col(k === 3 ? '#151515' : '#1e1e1e', 0.4), -0.6 + k * 0.035, 0.065 + 0.48 * 0 + 0.07, 0.04); A.tapes.push(t); }
  A.theTape = A.tapes[3];
  const lab = mk(shelf, B(0.004, 0.08, 0.12), col('#efe8d6', 0.9), -0.6 + 3 * 0.035, 0.135, 0.123, 0, 0, 0); lab.rotation.y = Math.PI / 2; lab.position.set(-0.6 + 3 * 0.035, 0.135, 0.121); lab.scale.set(1, 1, 1);
  A.tapePos = new T.Vector3(1.0, 0.15, -3.0);
  block(0.98, -4.3, 1.45, -2.6);
  // armchair, reading lamp, side table with the telephone
  const arm = new T.Group(); arm.position.set(-4.6, 0, -3.7); arm.rotation.y = 0.6; g.add(arm);
  const af = std({ map: us ? TX.plaid('#8a5a3a', '#3a2a1e') : TX.plaid('#3a5a4a', '#1a2a24'), roughness: 0.95 });
  mk(arm, RB(0.85, 0.42, 0.8, 0.06), af, 0, 0.3, 0); mk(arm, RB(0.85, 0.7, 0.2, 0.08), af, 0, 0.75, -0.32); for (const s of [-1, 1]) mk(arm, RB(0.16, 0.6, 0.8, 0.06), af, s * 0.42, 0.4, 0);
  block(-5.2, -4.3, -4.0, -3.1);
  A.chairSeat = new T.Vector3(-4.45, 0, -3.5); A.chairYaw = 0.6;
  const lampP = new T.Vector3(-5.5, 0, -4.1);
  mk(g, CY(0.015, 0.015, 1.5, 8), metal, lampP.x, 0.75, lampP.z); mk(g, CY(0.15, 0.15, 0.03, 20), metal, lampP.x, 0.015, lampP.z);
  const shade = mk(g, CY(0.14, 0.22, 0.24, 24, true), std({ color: us ? 0xf2e6c8 : 0xe8c890, roughness: 0.9, side: T.DoubleSide, emissive: new T.Color(0x553a18), emissiveIntensity: 0.8 }), lampP.x, 1.5, lampP.z); shade.castShadow = false;
  A.lamp = new T.PointLight(0xffc88a, 0.7, 5, 2); A.lamp.position.set(lampP.x, 1.45, lampP.z); g.add(A.lamp);
  const side = new T.Vector3(-0.4, 0, -3.9);
  mk(g, CY(0.25, 0.25, 0.03, 24), wood, side.x, 0.6, side.z); mk(g, CY(0.03, 0.03, 0.6, 8), wood, side.x, 0.3, side.z); mk(g, CY(0.18, 0.18, 0.02, 20), wood, side.x, 0.01, side.z);
  block(side.x - 0.25, side.z - 0.25, side.x + 0.25, side.z + 0.25);
  // rotary telephone
  const ph = new T.Group(); ph.position.set(side.x, 0.615, side.z); ph.rotation.y = -0.5; g.add(ph);
  const pm = col(C.phone, 0.35);
  mk(ph, RB(0.2, 0.09, 0.22, 0.04), pm, 0, 0.045, 0); mk(ph, CY(0.065, 0.065, 0.012, 24), col('#f4f0e6', 0.4), 0, 0.09, 0.03, 0, -0.5);
  const recv = new T.Group(); recv.position.set(0, 0.13, 0); ph.add(recv);
  mk(recv, RB(0.22, 0.035, 0.05, 0.015), pm, 0, 0, 0); for (const s of [-1, 1]) mk(recv, RB(0.06, 0.05, 0.065, 0.02), pm, s * 0.1, -0.02, 0);
  A.phone = ph; A.receiver = recv; A.phonePos = new T.Vector3(side.x, 0.7, side.z);
  // wall things: the rug on the wall (RU) or framed photos (US); a clock
  if (C.carpet) { const cp = mk(g, new T.PlaneGeometry(2.0, 1.4), std({ map: C.carpet, roughness: 1 }), -2.4, 1.45, -4.42); cp.castShadow = false; }
  else for (let k = 0; k < 4; k++) { const fx = -3.4 + k * 0.55, fy = 1.55 + (k % 2) * 0.22; mk(g, B(0.36, 0.28, 0.025), col('#2a2018', 0.5), fx, fy, -4.42); const ph2 = mk(g, new T.PlaneGeometry(0.3, 0.22), std({ map: photoTex(k), roughness: 0.6 }), fx, fy, -4.405); ph2.castShadow = false; }
  const clock = new T.Group(); clock.position.set(us ? 0.9 : -0.2, 1.95, us ? -4.42 : -4.42); g.add(clock);
  mk(clock, CY(0.15, 0.15, 0.04, 32), col(us ? '#f4f0e6' : '#5a3a24', 0.5), 0, 0, 0.02, 0, Math.PI / 2);
  mk(clock, CY(0.13, 0.13, 0.005, 32), col('#fbf8ee', 0.6), 0, 0, 0.045, 0, Math.PI / 2);
  A.hands = [mk(clock, B(0.008, 0.09, 0.004), col('#111', 0.5), 0, 0.04, 0.05), mk(clock, B(0.006, 0.12, 0.004), col('#111', 0.5), 0, 0.055, 0.052)];
  A.hands.forEach((h) => { h.geometry.translate(0, h.position.y, 0); h.position.y = 0; });
  if (!us) { A.pend = new T.Group(); A.pend.position.set(0, -0.12, 0.02); clock.add(A.pend); mk(A.pend, B(0.008, 0.35, 0.004), col('#c8a24a', 0.3, 0.8), 0, -0.17, 0); mk(A.pend, CY(0.04, 0.04, 0.006, 20), col('#c8a24a', 0.3, 0.8), 0, -0.36, 0, 0, Math.PI / 2);
    mk(clock, B(0.34, 0.62, 0.08), col('#5a3a24', 0.5), 0, -0.25, -0.02); }
  // houseplants on sills
  for (const [x, z] of [[-4.4, -4.25], [-2.0, -4.25], [4.6, 4.25]]) potPlant(g, x, z, us);
  // ---------------- study (x 1.5..6, z -4.5..0): desk + typewriter, chair
  mk(g, RB(1.4, 0.05, 0.7, 0.01), wood, 4.2, 0.74, -3.9); for (const [dx, dz] of [[-0.65, -0.3], [0.65, -0.3], [-0.65, 0.3], [0.65, 0.3]]) mk(g, B(0.05, 0.72, 0.05), wood, 4.2 + dx, 0.36, -3.9 + dz);
  block(3.45, -4.3, 4.95, -3.5);
  const tw = new T.Group(); tw.position.set(4.2, 0.77, -3.85); g.add(tw);
  mk(tw, RB(0.42, 0.11, 0.34, 0.04), col(us ? '#2c3a34' : '#4a2e24', 0.35, 0.3), 0, 0.055, 0);
  mk(tw, CY(0.025, 0.025, 0.5, 16), col('#1a1a1a', 0.4), 0, 0.13, -0.08, 0, 0, Math.PI / 2);
  for (let row = 0; row < 4; row++) for (let k = 0; k < 10; k++) mk(tw, CY(0.012, 0.012, 0.01, 10), col('#e8e2d0', 0.4), -0.17 + k * 0.037 + row * 0.01, 0.1 + row * 0.012, 0.12 - row * 0.03, 0, -0.35);
  const paper = mk(tw, new T.PlaneGeometry(0.22, 0.28), std({ map: (A.paperTex = paperTex()), roughness: 0.9 }), 0, 0.27, -0.1, 0, -0.25); paper.castShadow = false;
  A.typewriter = tw; A.paper = paper; A.deskSeat = new T.Vector3(4.2, 0, -3.15);
  const chair = new T.Group(); chair.position.set(4.2, 0, -3.2); g.add(chair); chairMesh(chair, wood);
  mk(g, B(1.0, 1.8, 0.3), col(us ? '#ece6d6' : '#5a3a24', 0.6), 5.75, 0.9, -1.4, Math.PI / 2); block(5.55, -1.95, 5.95, -0.85);
  // ---------------- kitchen (x -1.5..6, z 0..4.5)
  const cab = col(C.cabinet, 0.5), top = col(C.counter, us ? 0.55 : 0.4, us ? 0 : 0.1);
  // run along the back wall x 0.2..5.8, sink under the window at x 1.6
  for (let x = 0.2; x < 5.8; x += 0.6) { mk(g, RB(0.58, 0.86, 0.58, 0.01), cab, x + 0.3, 0.43, 4.12); mk(g, B(0.04, 0.12, 0.02), metal, x + 0.3, 0.75, 3.82); }
  mk(g, B(5.6, 0.04, 0.64), top, 3.0, 0.88, 4.12); block(0.2, 3.78, 5.8, 4.45);
  // sink basin
  const sinkC = new T.Vector3(1.6, 0.9, 4.1); A.sink = sinkC;
  mk(g, B(0.62, 0.02, 0.46), col('#cfd4d8', 0.25, 0.7), sinkC.x, 0.86, sinkC.z);
  const basin = mk(g, B(0.56, 0.22, 0.4), std({ color: us ? 0xc8ccd0 : 0xf2f2ee, roughness: 0.2, metalness: us ? 0.8 : 0.05, side: T.BackSide }), sinkC.x, 0.79, sinkC.z); basin.castShadow = false;
  A.water = mk(g, new T.PlaneGeometry(0.54, 0.38), std({ color: 0xa8c0c8, roughness: 0.05, transparent: true, opacity: 0.55 }), sinkC.x, 0.74, sinkC.z, 0, -Math.PI / 2); A.water.castShadow = false;
  mk(g, CY(0.015, 0.015, 0.3, 10), metal, sinkC.x, 1.05, 4.38); mk(g, CY(0.012, 0.012, 0.22, 10), metal, sinkC.x, 1.2, 4.27, 0, Math.PI / 2);
  // dish rack to the right, dirty stack to the left
  mk(g, B(0.45, 0.02, 0.32), metal, 2.35, 0.91, 4.1); for (let k = 0; k < 8; k++) mk(g, B(0.005, 0.12, 0.3), metal, 2.15 + k * 0.055, 0.97, 4.1);
  A.rack = new T.Vector3(2.35, 0.92, 4.1); A.stack = new T.Vector3(0.85, 0.9, 4.1);
  // stove
  const st = new T.Vector3(3.95, 0, 4.12);
  mk(g, RB(0.76, 0.9, 0.62, 0.01), us ? white : col('#f2f2ee', 0.3), st.x, 0.45, st.z); mk(g, B(0.76, 0.03, 0.62), col('#2a2a2a', 0.4, 0.3), st.x, 0.91, st.z);
  for (const [dx, dz] of [[-0.18, -0.13], [0.18, -0.13], [-0.18, 0.13], [0.18, 0.13]]) mk(g, CY(0.09, 0.09, 0.015, 20), col('#141414', 0.6, 0.3), st.x + dx, 0.93, st.z + dz);
  mk(g, B(0.7, 0.4, 0.02), col('#1a1a1a', 0.2, 0.2), st.x, 0.45, st.z - 0.32);
  A.stove = new T.Vector3(st.x, 0.95, st.z - 0.06);
  const pot = new T.Group(); pot.position.set(st.x - 0.18, 0.94, st.z - 0.13); g.add(pot);
  mk(pot, CY(0.13, 0.12, 0.17, 24, true), std({ color: us ? 0x8a8e92 : 0xe8ecea, roughness: 0.3, metalness: us ? 0.8 : 0.1, side: T.DoubleSide }), 0, 0.085, 0);
  if (!us) mk(pot, CY(0.135, 0.135, 0.01, 24, true), col('#2a4a8a', 0.3), 0, 0.17, 0);
  A.soup = mk(pot, CY(0.12, 0.12, 0.005, 24), std({ color: us ? 0x8a3a1a : 0x8a1a3a, roughness: 0.3 }), 0, 0.06, 0); A.pot = pot;
  const kettle = mk(g, new T.SphereGeometry(0.11, 20, 14, 0, TAU, 0, Math.PI * 0.6), std({ color: us ? 0xc8442a : 0xe8e0d0, roughness: 0.25, metalness: 0.1 }), st.x + 0.18, 0.95, st.z + 0.13);
  // cutting board by the stove with vegetables
  mk(g, RB(0.42, 0.025, 0.28, 0.01), col('#c89a6a', 0.7), 5.0, 0.915, 4.0); A.board = new T.Vector3(5.0, 0.93, 4.0);
  // fridge in the corner (x -1.2..-0.4 is the doorway side; put it at x 5.6? no: at the east end)
  const fr = new T.Vector3(5.55, 0, 2.3);
  mk(g, RB(0.75, 1.75, 0.7, us ? 0.04 : 0.12), col(us ? '#efece4' : '#f4f4f0', 0.35), fr.x, 0.875, fr.z, -Math.PI / 2);
  mk(g, B(0.03, 0.4, 0.04), metal, fr.x - 0.38, 1.25, fr.z + 0.25);
  block(5.15, 1.9, 5.95, 2.7);
  A.fridgeNote = new T.Vector3(fr.x - 0.38, 1.45, fr.z - 0.1);
  const noteM = mk(g, new T.PlaneGeometry(0.2, 0.26), std({ map: (A.noteTex = noteTex()), roughness: 0.9 }), fr.x - 0.38, 1.4, fr.z - 0.12, -Math.PI / 2); noteM.castShadow = false;
  // kitchen table and chairs
  const tbl = new T.Vector3(2.6, 0, 1.7);
  mk(g, RB(1.3, 0.05, 0.85, 0.01), C.oilcloth ? std({ map: C.oilcloth, roughness: 0.4 }) : wood, tbl.x, 0.75, tbl.z);
  for (const [dx, dz] of [[-0.58, -0.36], [0.58, -0.36], [-0.58, 0.36], [0.58, 0.36]]) mk(g, B(0.05, 0.73, 0.05), wood, tbl.x + dx, 0.365, tbl.z + dz);
  block(tbl.x - 0.7, tbl.z - 0.45, tbl.x + 0.7, tbl.z + 0.45);
  for (const [dx, dz, ry] of [[0, -0.7, 0], [0, 0.7, Math.PI], [-0.95, 0, Math.PI / 2]]) { const c = new T.Group(); c.position.set(tbl.x + dx, 0, tbl.z + dz); c.rotation.y = ry; g.add(c); chairMesh(c, wood); }
  // bowl of fruit, a vase that fills with cut flowers
  mk(g, new T.SphereGeometry(0.12, 20, 10, 0, TAU, Math.PI / 2, Math.PI / 2), col(us ? '#f4f0e6' : '#3a5aa8', 0.4), tbl.x - 0.2, 0.9, tbl.z, 0, Math.PI);
  for (let k = 0; k < 4; k++) mk(g, new T.SphereGeometry(0.04, 12, 10), col(['#c82a1a', '#e8b02a', '#5a8a2a', '#c82a1a'][k], 0.5), tbl.x - 0.2 + Math.cos(k * 1.7) * 0.05, 0.84, tbl.z + Math.sin(k * 1.7) * 0.05);
  // ---------------- mudroom (x -6..-1.5, z 0..4.5): laundry, coats, boots, the cat's bowl
  mk(g, RB(0.7, 0.85, 0.65, 0.02), white, -5.5, 0.425, 2.4); block(-5.9, 2.05, -5.15, 2.75);   // washer / laundry tub
  mk(g, RB(1.0, 0.05, 0.55, 0.01), wood, -5.45, 0.8, 0.8); for (const [dx, dz] of [[-0.45, -0.22], [0.45, -0.22], [-0.45, 0.22], [0.45, 0.22]]) mk(g, B(0.04, 0.78, 0.04), wood, -5.45 + dz, 0.39, 0.8 + dx);
  block(-5.75, 0.25, -5.15, 1.35); A.foldTable = new T.Vector3(-5.45, 0.83, 0.8);
  const basket = mk(g, CY(0.26, 0.22, 0.3, 20, true), std({ color: 0xa8865a, roughness: 0.95, side: T.DoubleSide }), -4.6, 0.15, 0.6); A.basket = new T.Vector3(-4.6, 0.3, 0.6);
  for (let k = 0; k < 5; k++) mk(g, B(0.09, 0.03 + k * 0.004, 0.09), col('#3a3a3a', 0.6), -5.9 + k * 0.0, 1.6, 3.3 + k * 0.25).visible = false;
  for (let k = 0; k < 3; k++) { mk(g, CY(0.015, 0.015, 0.1, 8), wood, -5.92, 1.65, 3.0 + k * 0.35, 0, 0, Math.PI / 2); mk(g, RB(0.12, 0.7, 0.38, 0.05), col(['#3a4a5a', '#7a3a2a', '#5a5a3a'][k], 0.95), -5.85, 1.2, 3.0 + k * 0.35); }
  for (let k = 0; k < 2; k++) for (const s of [0, 0.12]) mk(g, RB(0.1, 0.12 + k * 0.15, 0.26, 0.04), col(k ? '#3a2a1e' : '#2a3a2a', 0.8), -5.2 + k * 0.35 + s, 0.06 + k * 0.075, 4.2);
  A.bowl = new T.Vector3(-2.2, 0.02, 3.9);
  mk(g, CY(0.09, 0.07, 0.05, 20), col(us ? '#3a6a8a' : '#e8e0d0', 0.4), A.bowl.x, 0.025, A.bowl.z);
  A.kibble = mk(g, CY(0.075, 0.075, 0.01, 16), col('#8a5a2a', 0.9), A.bowl.x, 0.045, A.bowl.z); A.kibble.visible = false;
  A.foodBag = new T.Vector3(-2.0, 0.25, 4.25);
  mk(g, RB(0.24, 0.42, 0.14, 0.03), col(us ? '#c8442a' : '#e8c84a', 0.7), A.foodBag.x, 0.21, A.foodBag.z);
  // interior lights (warm fill; the sun does the rest)
  for (const [x, z, k] of [[-2.6, -2.2, 1.6], [3.2, 2.2, 1.8], [-3.8, 2.2, 1.0], [3.8, -2.2, 1.0]]) { const l = new T.PointLight(0xffd7a8, k, 9, 1.2); l.position.set(x, 1.7, z); g.add(l); }
  return A;
}

function chairMesh(c, wood) {
  mk(c, RB(0.42, 0.04, 0.42, 0.01), wood, 0, 0.45, 0);
  for (const [dx, dz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) mk(c, B(0.035, 0.45, 0.035), wood, dx, 0.225, dz);
  for (const s of [-1, 1]) mk(c, B(0.035, 0.5, 0.035), wood, s * 0.18, 0.72, 0.19);
  mk(c, B(0.4, 0.08, 0.03), wood, 0, 0.9, 0.19); mk(c, B(0.4, 0.05, 0.03), wood, 0, 0.7, 0.19);
}
function potPlant(g, x, z, us) {
  mk(g, CY(0.09, 0.07, 0.14, 16), col(us ? '#b8643a' : '#e8e0d0', 0.8), x, 1.0, z);
  const leaves = new T.Group(); leaves.position.set(x, 1.08, z); g.add(leaves);
  const lm = col(us ? '#3a6a2a' : '#4a7a3a', 0.7);
  for (let k = 0; k < 9; k++) { const a = k / 9 * TAU; const l = mk(leaves, new T.SphereGeometry(0.05, 10, 8), lm, Math.cos(a) * 0.06, 0.04 + (k % 3) * 0.03, Math.sin(a) * 0.06); l.scale.set(1, 0.5, 1.6); l.rotation.y = -a; }
  if (!us) for (let k = 0; k < 3; k++) mk(leaves, new T.SphereGeometry(0.025, 10, 8), col('#d8302a', 0.6), Math.cos(k * 2) * 0.03, 0.16 + k * 0.02, Math.sin(k * 2) * 0.03);   // geranium on the sill
}
function photoTex(k) {
  return tex(128, 96, (g, w, h, r) => {
    const sky = ['#9ab8d0', '#c8b890', '#a8c0a0', '#d8c0a0'][k]; g.fillStyle = sky; g.fillRect(0, 0, w, h);
    g.fillStyle = ['#5a7a8a', '#8a6a4a', '#4a6a3a', '#7a6a5a'][k]; g.fillRect(0, h * 0.6, w, h * 0.4);
    for (let i = 0; i < 2 + k % 3; i++) { const x = 25 + i * 30 + r() * 10; g.fillStyle = '#3a2a22'; g.beginPath(); g.arc(x, h * 0.42, 7, 0, TAU); g.fill(); g.fillRect(x - 8, h * 0.48, 16, 26); }
    g.fillStyle = 'rgba(255,240,200,.18)'; g.fillRect(0, 0, w, h);
  }, 1, 1);
}
function noteTex() { const c = document.createElement('canvas'); c.width = 256; c.height = 320; const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.userData = { c }; return t; }
function paperTex() { const c = document.createElement('canvas'); c.width = 256; c.height = 330; const g = c.getContext('2d'); g.fillStyle = '#f6f2e8'; g.fillRect(0, 0, 256, 330); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.userData = { c }; return t; }

// ------------------------------------------------------------------ the yard
// extra looks for plants the Shortwood set doesn't have, from what grows on dachas around St. Petersburg
const EXTRA = {
  fireweed: [{ ...LOOKS.liatris, flCol: '#d6509a', leafCol: '#4a6a3a', leaf: 'lance', leafIn: [0.8, 4] }, [60, 18]],          // ivan-chai along the fence
  lilac: [{ ...LOOKS.hydrangea, flStyle: 'agastache', flCol: '#b49ad8', flIn: [3, 8], flN: 60, leaf: 'ovate', leafCol: '#3f6a34' }, [90, 80]],
  currant: [{ ...LOOKS.hydrangea, flN: 0, leaf: 'palmate', leafCol: '#3f6a34' }, [40, 44]],
  potato: [{ ...LOOKS.anemone, leaf: 'ovate', leafCol: '#3a5e2e', flCol: '#f2f0fa', flEye: '#f2d24a', flIn: 1.2, flN: 10, moundH: 0.7 }, [22, 22]],
  dill: [{ ...LOOKS.achillea, leaf: 'thread', leafCol: '#6a9a4a', flCol: '#c8c84a', flIn: 3.2 }, [34, 10]],
  goldenball: [{ ...LOOKS.rudbeckia, flStyle: 'helenium', flCol: '#f4c21a', flEye: '#e0a010', flIn: 2.6 }, [70, 30]],
  strawberry: [{ ...LOOKS.anemone, leaf: 'trifoliate', leafCol: '#3f6a34', flCol: '#fbfaf6', flIn: 1.0, flN: 8, moundH: 0.4 }, [8, 14]],
  basil: [{ ...LOOKS.salvia, leaf: 'ovate', leafCol: '#4a8a3a', flCol: '#f2f0ea', flIn: [0.8, 3] }, [16, 14]],
  calendula: [{ ...LOOKS.coreopsis, flStyle: 'helenium', flCol: '#f08a1a', flEye: '#c86a10', flIn: 2.0, flN: 40 }, [16, 14]],
};
for (const [k, [L, S]] of Object.entries(EXTRA)) { LOOKS[k] = L; SIZES[k] = S; }

export function buildYard(C, renderer, colliders, low = false) {
  const DET = low ? 0.55 : 1;
  const g = new T.Group(), us = C.c === 'us', Hs = C.H, Yd = Hs.yard, A = { beds: [], weeds: [], fruit: [], dry: [], tomatoes: [] };
  const r = rngOf(Hs.id.length * 97 + (us ? 1 : 2));
  const occ = [];   // footprints taken in the yard
  const free = (x, z, w, d) => x - w / 2 > -11.8 && x + w / 2 < 11.8 && z - d / 2 > 4.9 && z + d / 2 < 21.8 && !occ.some(([a, b, c, e]) => x - w / 2 < c && x + w / 2 > a && z - d / 2 < e && z + d / 2 > b);
  const take = (x, z, w, d) => occ.push([x - w / 2 - 0.3, z - d / 2 - 0.3, x + w / 2 + 0.3, z + d / 2 + 0.3]);
  occ.push([-6.2, 4.4, -0.4, 7.0]);   // the back step / deck
  // ---------------- ground
  const sandy = Yd.layout === 'dunes' || Yd.layout === 'gulf';
  const gTex = sandy ? TX.sand() : Yd.layout === 'courtyard' ? TX.dirt() : TX.lawn();
  const lawn = mk(g, new T.PlaneGeometry(160, 160), std({ map: gTex, roughness: 1, color: sandy ? 0xffffff : new T.Color(Yd.lawn).multiplyScalar(1.9) }), 0, 0, 0, 0, -Math.PI / 2); lawn.castShadow = false; gTex.repeat.set(80, 80);
  // ---------------- fence
  fence(g, Yd.fence, colliders, r);
  // ---------------- a way down the yard
  if (us && Yd.layout !== 'dunes') { const p = mk(g, new T.PlaneGeometry(5, 3), std({ map: TX.pavers(), roughness: 0.9 }), -3.0, 0.01, 8.2, 0, -Math.PI / 2); p.castShadow = false; take(-3, 8.2, 5, 3); }
  else if (Yd.layout === 'courtyard') { const p = mk(g, new T.PlaneGeometry(2.2, 30), col('#5a5a58', 0.95), -4.0, 0.008, 18, 0, -Math.PI / 2); p.castShadow = false; take(-4, 13, 2.2, 18); }
  else { for (let k = 0; k < 14; k++) mk(g, B(0.9, 0.04, 0.5), col('#8a7a62', 0.9), -4.0, 0.02, 7.6 + k * 0.6).castShadow = false; take(-4, 11.5, 1, 8.5); }
  // ---------------- beds and what grows in them
  const soil = std({ map: TX.soil(), roughness: 1 });
  const bed = (x, z, w, d, raised) => {
    take(x, z, w, d);
    const b = mk(g, raised ? B(w, 0.3, d) : B(w, 0.06, d), soil, x, raised ? 0.15 : 0.0, z); b.castShadow = false;
    if (raised) { const wd = col(us ? '#7a5a3a' : '#8a7a6a', 0.9); for (const s of [-1, 1]) { mk(g, B(w + 0.1, 0.34, 0.05), wd, x, 0.17, z + s * d / 2); mk(g, B(0.05, 0.34, d), wd, x + s * w / 2, 0.17, z); } colliders.push([x - w / 2 - 0.05, z - d / 2 - 0.05, x + w / 2 + 0.05, z + d / 2 + 0.05]); }
    const info = { x, z, w, d, y: raised ? 0.3 : 0.03 }; A.beds.push(info); return info;
  };
  const plants = [];
  const scatter = (B_, list, n, sc = 1) => { for (let i = 0; i < n; i++) { const k = list[Math.floor(r() * list.length)]; plants.push({ k, x: B_.x + (r() - 0.5) * (B_.w - 0.4), z: B_.z + (r() - 0.5) * (B_.d - 0.4), s: sc * (0.75 + r() * 0.35), seed: Math.floor(r() * 1e6), y: B_.y }); } };
  const row = (B_, k, n, along = 'x', sc = 1) => { for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; plants.push({ k, x: along === 'x' ? B_.x - B_.w / 2 + t * B_.w : B_.x, z: along === 'x' ? B_.z : B_.z - B_.d / 2 + t * B_.d, s: sc * (0.85 + r() * 0.25), seed: Math.floor(r() * 1e6), y: B_.y }); } };
  const tomatoRow = (x0, z, n, dx, y) => { for (let k = 0; k < n; k++) A.tomatoes.push({ x: x0 + k * dx, z, y }); };
  const usMix = Yd.mix || ['echinacea', 'rudbeckia', 'nepeta', 'hemerocallis', 'leucanthemum', 'phloxJ', 'salvia', 'coreopsis', 'monardaF'];
  const ruMix = Yd.mix || ['peony', 'phloxR', 'phloxJ', 'lupinus', 'delphinium', 'leucanthemum', 'aquilegia', 'calendula'];
  const L = Yd.layout, xtrees = [];
  if (L === 'cottage') {
    const border = bed(0, 20.6, 22, 2.2, false); scatter(border, us ? usMix : ruMix, 46);
    const side = bed(-10.6, 13, 2.2, 10, false); scatter(side, us ? ['roseKO', 'hydrangea', 'nepeta', 'hemerocallis', 'echinacea'] : ['lilac', 'peony', 'lupinus', 'phloxR'], 14);
    for (const [x, z] of [[-10.2, 19.6], [10.2, 19.6]]) plants.push({ k: us ? 'hydrangea' : 'lilac', x, z, s: 1.05, seed: Math.floor(r() * 1e6), y: 0.03 });
    const veg = bed(4.8, 12.8, 4.2, 1.6, true); row({ ...veg, z: veg.z + 0.35 }, us ? 'basil' : 'dill', 6, 'x', 0.9); tomatoRow(veg.x - 1.4, veg.z - 0.3, 4, 0.93, veg.y);
  } else if (L === 'small') {
    const border = bed(0, 21.0, 22, 1.4, false); scatter(border, us ? ['hemerocallis', 'rudbeckia', 'echinacea', 'hydrangea', 'nepeta'] : ruMix, 26);
    const veg = bed(3.5, 9.6, 3.6, 1.2, true); tomatoRow(veg.x - 1.2, veg.z, 4, 0.8, veg.y); row({ ...veg, z: veg.z + 0.35 }, 'basil', 5, 'x', 0.8);
    const side = bed(-10.8, 14, 1.6, 8, false); scatter(side, us ? ['hydrangea', 'roseKO', 'hemerocallis'] : ['lilac', 'peony'], 8);
    for (const [x, z, k] of [[-1.0, 6.0, 'geranium'], [-0.2, 6.4, 'coreopsis'], [0.6, 6.1, 'salvia']]) { mk(g, CY(0.22, 0.16, 0.34, 16), col('#b8643a', 0.85), x, 0.17, z); plants.push({ k, x, z, s: 0.55, seed: Math.floor(r() * 1e6), y: 0.33 }); }
  } else if (L === 'farm' || L === 'village') {
    const veg = bed(-6.5, 15.5, 8, 9, false); A.potatoes = veg;
    for (let rw = 0; rw < 6; rw++) row({ ...veg, z: veg.z - 3.8 + rw * 1.2, d: 0.5 }, rw < 4 ? 'potato' : (us ? 'basil' : 'dill'), 9, 'x', 0.9);
    tomatoRow(-1.2, 12, 4, 0, 0.03); for (let k = 0; k < 4; k++) A.tomatoes[A.tomatoes.length - 4 + k].z = 11 + k * 1.1;
    const tb = bed(-0.8, 12.6, 1.2, 5, false);
    const fb = bed(3, 6.6, 6, 1.4, false); scatter(fb, us ? usMix : ruMix, 20);
    const sb = bed(4.5, 13, 3.6, 1.2, true); row({ ...sb, z: sb.z - 0.25 }, 'strawberry', 8, 'x'); row({ ...sb, z: sb.z + 0.3 }, 'strawberry', 8, 'x');
    const fen = bed(2, 21.2, 19, 1.0, false); scatter(fen, us ? ['solidago', 'achillea', 'leucanthemum', 'asclepias'] : ['fireweed', 'fireweed', 'solidago', 'achillea', 'alchemilla'], 26, 1.05);
  } else if (L === 'dunes' || L === 'gulf') {
    const d1 = bed(-6, 20.6, 11, 2.0, false); scatter(d1, us ? ['roseKO', 'calamagrostis', 'panicum', 'achillea'] : ['lupinus', 'leucanthemum', 'roseKO', 'achillea', 'fireweed'], 22);
    const d2 = bed(6, 20.6, 10, 2.0, false); scatter(d2, us ? ['roseKO', 'hydrangea', 'calamagrostis', 'hemerocallis'] : (Yd.mix || ['lupinus', 'leucanthemum', 'achillea']), 20);
    const veg = bed(4.5, 11, 4, 1.4, true); tomatoRow(veg.x - 1.3, veg.z - 0.25, 4, 0.86, veg.y); if (!us) { row({ ...veg, z: veg.z + 0.35 }, 'strawberry', 9, 'x'); }
    const side = bed(-10.6, 12, 1.8, 8, false); scatter(side, us ? ['roseKO', 'calamagrostis'] : ['lupinus', 'roseKO'], 8);
  } else if (L === 'orchard') {
    for (let i = 0; i < 3; i++) for (let k = 0; k < 2; k++) { const x = -7 + i * 4.3, z = 12.5 + k * 5; xtrees.push(['apple', x, z, 0.95 + r() * 0.2]); take(x, z, 2.6, 2.6); }
    const sb = bed(5.5, 8.6, 4.5, 1.2, true); row({ ...sb, z: sb.z - 0.25 }, 'strawberry', 9, 'x'); row({ ...sb, z: sb.z + 0.3 }, 'strawberry', 9, 'x');
    const fb = bed(1.0, 6.3, 6, 1.2, false); scatter(fb, us ? usMix : ruMix, 18);
    const tb = bed(10.4, 15, 1.4, 6, false); tomatoRow(10.4, 12.8, 4, 0, 0.03); for (let k = 0; k < 4; k++) A.tomatoes[k].z = 12.8 + k * 1.4;
  } else if (L === 'lake') {
    const b1 = bed(-6, 20.8, 9, 1.6, false); scatter(b1, us ? ['leucanthemum', 'rudbeckia', 'achillea', 'asclepias'] : (Yd.mix || ['lupinus', 'leucanthemum', 'fireweed']), 18);
    const b2 = bed(6, 20.8, 9, 1.6, false); scatter(b2, us ? ['echinacea', 'nepeta', 'hemerocallis'] : ['lupinus', 'alchemilla', 'achillea'], 16);
    const veg = bed(4.0, 10.5, 4, 1.4, true); tomatoRow(veg.x - 1.3, veg.z - 0.25, 4, 0.86, veg.y); row({ ...veg, z: veg.z + 0.35 }, us ? 'basil' : 'strawberry', 7, 'x');
  } else if (L === 'courtyard') {
    const p1 = bed(-1, 6.0, 8, 1.4, false); scatter(p1, Yd.mix || ['peony', 'phloxR', 'calendula', 'leucanthemum', 'lilac'], 16);
    const p2 = bed(6.5, 6.0, 6, 1.4, false); scatter(p2, ['goldenball', 'peony', 'lupinus', 'calendula'], 12);
    const veg = bed(-9.6, 10.5, 2.4, 4.5, false); tomatoRow(-9.6, 8.8, 4, 0, 0.03); for (let k = 0; k < 4; k++) A.tomatoes[k].z = 8.8 + k * 1.1;
    const sb = bed(5.0, 20.6, 8, 1.4, false); scatter(sb, ['lilac', 'currant', 'fireweed'], 7, 1.0);
  } else { // dacha
    const fb = bed(2.5, 6.8, 6.5, 1.6, false); scatter(fb, ruMix, 26);
    const gb = bed(-9.5, 7.5, 2.4, 4.5, false); scatter(gb, ['goldenball', 'lupinus', 'delphinium', 'peony'], 10, 1.05);
    const pot = bed(-6.5, 15.5, 6, 5.5, false); A.potatoes = pot;
    for (let rw = 0; rw < 5; rw++) row({ ...pot, z: pot.z - 2.2 + rw * 1.1, d: 0.5 }, 'potato', 7, 'x', 0.9);
    const sb = bed(3.6, 12.2, 4.5, 1.4, true); row({ ...sb, z: sb.z - 0.3 }, 'strawberry', 9, 'x'); row({ ...sb, z: sb.z + 0.3 }, 'strawberry', 9, 'x');
    const herb = bed(-1.0, 12.2, 2.0, 1.2, false); scatter(herb, ['dill', 'calendula'], 8);
    const fen = bed(0, 21.2, 23, 1.2, false); scatter(fen, ['fireweed', 'fireweed', 'solidago', 'achillea', 'leucanthemum', 'alchemilla'], 40, 1.1);
    for (const [x, z] of [[-10.8, 19.5], [-10.8, 13.5]]) plants.push({ k: 'currant', x, z, s: 1, seed: Math.floor(r() * 1e6), y: 0.03 });
    for (const [x, z] of [[5.2, 5.4], [6.6, 5.6]]) plants.push({ k: 'lilac', x, z, s: 1.05, seed: Math.floor(r() * 1e6), y: 0.03 });
  }
  // ---------------- things in the yard
  for (const ex of Yd.extras) extra(g, ex, C, colliders, A, take, free, r);
  // tomatoes not housed in a greenhouse: staked in the ground
  const vine = col('#3a5e2a', 0.8), stake = col('#a8875a', 0.9);
  for (const t of A.tomatoes) {
    mk(g, CY(0.012, 0.012, 1.5, 6), stake, t.x, t.y + 0.75, t.z);
    for (let k = 0; k < 14; k++) { const a = r() * TAU, y = t.y + 0.2 + r() * 1.1, l = mk(g, new T.SphereGeometry(0.09, 8, 6), vine, t.x + Math.cos(a) * 0.12, y, t.z + Math.sin(a) * 0.12); l.scale.set(1, 0.45, 1.3); l.rotation.y = a; }
    for (let k = 0; k < 3; k++) { const a = r() * TAU, y = t.y + 0.35 + r() * 0.8; const f = mk(g, new T.SphereGeometry(0.045, 14, 10), col(r() < 0.2 ? '#d8862a' : '#c8261a', 0.35), t.x + Math.cos(a) * 0.15, y, t.z + Math.sin(a) * 0.15); A.fruit.push(f); }
  }
  // strawberries ripen low in their beds
  const sbeds = plants.filter((p) => p.k === 'strawberry');
  for (let k = 0; k < Math.min(18, sbeds.length * 2); k++) { const p = sbeds[k % sbeds.length]; const f = mk(g, new T.SphereGeometry(0.022, 10, 8), col('#d8201a', 0.35), p.x + (r() - 0.5) * 0.25, p.y + 0.03, p.z + (r() - 0.5) * 0.2); f.scale.set(1, 1.2, 1); A.fruit.push(f); }
  // weeds
  const weedTex = crossTex(128, 128, (g2) => {
    for (let k = 0; k < 9; k++) { g2.save(); g2.translate(64, 120); g2.rotate((k / 8 - 0.5) * 2.4); g2.fillStyle = k % 2 ? '#5a8a2a' : '#4a7a24'; g2.beginPath(); g2.moveTo(0, 0);
      for (let s2 = 0; s2 < 6; s2++) { g2.lineTo(8 - s2 * 0.6, -s2 * 16); g2.lineTo(3, -s2 * 16 - 8); } g2.lineTo(0, -100); for (let s2 = 5; s2 >= 0; s2--) { g2.lineTo(-3, -s2 * 16 - 8); g2.lineTo(-8 + s2 * 0.6, -s2 * 16); } g2.fill(); g2.restore(); }
    g2.fillStyle = '#f2c81a'; g2.beginPath(); g2.arc(64, 30, 11, 0, TAU); g2.fill();
  });
  const weedMat = sway(std({ map: weedTex, alphaTest: 0.4, side: T.DoubleSide, roughness: 0.8 }), 0.4), weedGeo = crossGeo(2, false);
  for (let k = 0; k < 8; k++) { const b = A.beds[k % A.beds.length]; const w = mk(g, weedGeo, weedMat, b.x + (r() - 0.5) * (b.w - 0.3), b.y, b.z + (r() - 0.5) * (b.d - 0.3), r() * 6); w.scale.set(0.35, 0.3, 0.35); w.castShadow = false; A.weeds.push(w); }
  // dry patches to water
  for (let k = 0; k < 4; k++) { const b = A.beds[k % A.beds.length]; const d = mk(g, new T.CircleGeometry(Math.min(0.6, b.d / 2), 24), std({ color: 0xb89a74, roughness: 1, transparent: true, opacity: 0.55, depthWrite: false }), b.x + (r() - 0.5) * Math.max(0, b.w - 1.2), b.y + 0.035, b.z + (r() - 0.5) * Math.max(0, b.d - 1.2), 0, -Math.PI / 2); d.castShadow = false; A.dry.push(d); }
  // water: a rain barrel by the house, the can beside it
  A.barrel = new T.Vector3(-0.9, 0, 4.95);
  mk(g, CY(0.32, 0.3, 0.85, 20), us ? col('#3a4a3a', 0.6) : col('#5a6a7a', 0.4, 0.6), A.barrel.x, 0.425, A.barrel.z);
  mk(g, CY(0.3, 0.3, 0.01, 20), std({ color: 0x2a3a3a, roughness: 0.05 }), A.barrel.x, 0.83, A.barrel.z);
  colliders.push([A.barrel.x - 0.35, A.barrel.z - 0.35, A.barrel.x + 0.35, A.barrel.z + 0.35]);
  const can = new T.Group(); can.position.set(A.barrel.x + 0.5, 0, A.barrel.z + 0.1); g.add(can); A.can = can; canMesh(can, us);
  // the plants themselves
  const byY = {}; for (const p of plants) (byY[p.y.toFixed(2)] || (byY[p.y.toFixed(2)] = [])).push(p);
  for (const [y, list] of Object.entries(byY)) g.add(buildBed(renderer, list, +y, DET));
  A.plants = plants;
  // trees in the yard
  for (const [kind, x, z, sc] of (Yd.trees || []).concat(xtrees)) { const t = tree(kind, sc, r, DET); t.position.set(x, 0, z); g.add(t); colliders.push([x - 0.3 * sc, z - 0.3 * sc, x + 0.3 * sc, z + 0.3 * sc]); }
  // beyond the fence
  backdrop(g, Yd, C, r, DET, low);
  // lawn tufts (not on sand, sparser in a courtyard)
  if (!sandy) {
    const tuftTex = crossTex(128, 128, (g2) => { for (let k = 0; k < 42; k++) { const x = 64 + (Math.random() - 0.5) * 100, l = 50 + Math.random() * 70; g2.strokeStyle = `rgb(${50 + Math.random() * 50},${90 + Math.random() * 60},${30 + Math.random() * 25})`; g2.lineWidth = 2 + Math.random() * 2; g2.beginPath(); g2.moveTo(x, 128); g2.quadraticCurveTo(x + (Math.random() - 0.5) * 20, 128 - l * 0.6, x + (Math.random() - 0.5) * 30, 128 - l); g2.stroke(); } });
    const NT = Math.round((low ? 2200 : 5200) * (L === 'courtyard' ? 0.5 : 1)), tufts = new T.InstancedMesh(crossGeo(2, false), sway(std({ map: tuftTex, alphaTest: 0.4, side: T.DoubleSide, roughness: 1 }), 0.8), NT);
    const m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), s3 = new T.Vector3(), p3 = new T.Vector3();
    let n = 0;
    for (let k = 0; k < NT * 3 && n < NT; k++) { const x = -11.8 + r() * 23.6, z = 4.8 + r() * 17.0; if (occ.some(([a, b, c, d]) => x > a + 0.2 && x < c - 0.2 && z > b + 0.2 && z < d - 0.2)) continue; e.set(0, r() * TAU, 0); q.setFromEuler(e); const sc = 0.12 + r() * 0.12; s3.set(sc * 1.6, sc, sc * 1.6); p3.set(x, 0, z); m4.compose(p3, q, s3); tufts.setMatrixAt(n++, m4); }
    tufts.count = n; tufts.receiveShadow = true; g.add(tufts);
  } else { // dune grass
    const grassTex = crossTex(128, 128, (g2) => { for (let k = 0; k < 30; k++) { const x = 64 + (Math.random() - 0.5) * 80; g2.strokeStyle = `rgb(${130 + Math.random() * 40},${140 + Math.random() * 30},${80})`; g2.lineWidth = 2; g2.beginPath(); g2.moveTo(x, 128); g2.quadraticCurveTo(x + (Math.random() - 0.5) * 40, 50, x + (Math.random() - 0.5) * 60, 4); g2.stroke(); } });
    const N = low ? 600 : 1400, dg = new T.InstancedMesh(crossGeo(2, false), sway(std({ map: grassTex, alphaTest: 0.4, side: T.DoubleSide, roughness: 1 }), 1.2), N);
    const m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), s3 = new T.Vector3(), p3 = new T.Vector3(); let n = 0;
    for (let k = 0; k < N * 3 && n < N; k++) { const x = -40 + r() * 80, z = -2 + r() * 34; if (Math.abs(x) < 6.5 && z < 5) continue; if (occ.some(([a, b, c, d]) => x > a && x < c && z > b && z < d)) continue; if (r() < 0.5 && Math.abs(x) < 11.8 && z < 21.8 && z > 4.6) continue; e.set(0, r() * TAU, 0); q.setFromEuler(e); const sc = 0.4 + r() * 0.5; s3.set(sc, sc * 1.4, sc); p3.set(x, 0, z); m4.compose(p3, q, s3); dg.setMatrixAt(n++, m4); }
    dg.count = n; g.add(dg);
  }
  return { g, A };
}

// ------------------------------------------------------------------ fences
function fence(g, kind, colliders, r) {
  if (kind === 'none') return;
  const P = { stockade: { h: 1.8, w: 0.15, gap: 0.16, col: '#8f8778', tip: 1 }, picket: { h: 1.0, w: 0.08, gap: 0.14, col: '#f4f2ea', tip: 1 }, shtaketnik: { h: 1.45, w: 0.09, gap: 0.14, col: '#8a8472', tip: 1 },
    split: { rails: [0.45, 0.95], post: 1.1, col: '#8a7a62' }, chain: { mesh: 1.4, col: '#a8acaa' }, iron: { h: 1.3, w: 0.025, gap: 0.12, col: '#1a1a1a', tip: 0 }, wattle: { wattle: 1.1, col: '#6a5a3a' },
    profiled: { sheet: 2.0, col: '#7a3a2a' }, low: { h: 0.6, w: 0.03, gap: 0.2, col: '#3a6a3a', tip: 0 } }[kind] || { h: 1.4, w: 0.09, gap: 0.14, col: '#8a8472', tip: 1 };
  const m = col(P.col, 0.85, kind === 'iron' || kind === 'chain' || kind === 'profiled' ? 0.5 : 0);
  const run = (x0, z0, x1, z1) => {
    const L = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(z1 - z0, x1 - x0), geos = [], cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const put = (geo, x, y, z) => { geo.rotateY(-ang); geo.translate(x, y, z); geos.push(geo); };
    if (P.h) { const n = Math.ceil(L / P.gap); for (let i = 0; i <= n; i++) { const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, h = P.h + (kind === 'shtaketnik' ? (i % 2) * 0.04 : 0);
        put(B(P.w, h, kind === 'iron' || kind === 'low' ? P.w : 0.02), x, h / 2, z); if (P.tip) { const tip = new T.ConeGeometry(P.w * 0.55, 0.08, 4); tip.rotateY(Math.PI / 4); put(tip, x, h + 0.04, z); } }
      for (const y of kind === 'low' ? [0.55] : [0.35, P.h - 0.25]) put(B(L, 0.06, 0.04), cx, y, cz); }
    if (P.rails) { for (let i = 0; i <= Math.ceil(L / 2.4); i++) { const t = i / Math.ceil(L / 2.4); put(B(0.14, P.post, 0.14), x0 + (x1 - x0) * t, P.post / 2, z0 + (z1 - z0) * t); } for (const y of P.rails) put(B(L, 0.1, 0.08), cx, y, cz); }
    if (P.mesh) { for (let i = 0; i <= Math.ceil(L / 2.5); i++) { const t = i / Math.ceil(L / 2.5); put(CY(0.03, 0.03, P.mesh, 8), x0 + (x1 - x0) * t, P.mesh / 2, z0 + (z1 - z0) * t); } put(CY(0.02, 0.02, L, 6).rotateZ(Math.PI / 2), cx, P.mesh, cz); }
    if (P.wattle) { for (let i = 0; i <= Math.ceil(L / 0.5); i++) { const t = i / Math.ceil(L / 0.5); put(CY(0.025, 0.025, P.wattle + 0.15, 6), x0 + (x1 - x0) * t, (P.wattle + 0.15) / 2, z0 + (z1 - z0) * t); } for (let k = 0; k < 9; k++) put(B(L, 0.05, 0.05), cx, 0.15 + k * 0.11, cz); }
    if (P.sheet) { put(B(L, P.sheet, 0.03), cx, P.sheet / 2, cz); }
    const geo = mergeGeometries(geos.map((q) => (q.index ? q.toNonIndexed() : q)).map((q) => { for (const k of Object.keys(q.attributes)) if (!['position', 'normal', 'uv'].includes(k)) q.deleteAttribute(k); if (!q.attributes.uv) q.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(q.attributes.position.count * 2), 2)); return q; }));
    mk(g, geo, m);
    if (P.mesh) { const net = mk(g, new T.PlaneGeometry(L, P.mesh), std({ map: chainTex(), transparent: true, alphaTest: 0.3, side: T.DoubleSide, roughness: 0.5, metalness: 0.5 }), cx, P.mesh / 2, cz, -ang); net.material.map.repeat.set(L / 0.6, P.mesh / 0.6); net.castShadow = false; }
    colliders.push([Math.min(x0, x1) - 0.1, Math.min(z0, z1) - 0.1, Math.max(x0, x1) + 0.1, Math.max(z0, z1) + 0.1]);
  };
  run(-12, -4.5, -12, 22); run(12, -4.5, 12, 22); run(-12, 22, 12, 22); run(-12, -4.5, -6, -4.5); run(6, -4.5, 12, -4.5);
}
let _chain;
function chainTex() { if (_chain) return _chain; _chain = tex(64, 64, (g) => { g.clearRect(0, 0, 64, 64); g.strokeStyle = 'rgba(170,175,172,1)'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 32); g.lineTo(32, 0); g.lineTo(64, 32); g.lineTo(32, 64); g.closePath(); g.stroke(); }); return _chain; }

// ------------------------------------------------------------------ yard things
function extra(g, kind, C, colliders, A, take, free, r) {
  const us = C.c === 'us', E = C.H.ext;
  const SZ = { shed: [3, 2.4], barn: [6, 5], banya: [3.3, 3.2], garage: [3.4, 6], greenhouse: [3.2, 4.2], beehives: [1.2, 3.6], swing: [3.2, 1.6], playground: [5, 4.5], well: [1.6, 1.6], clothesline: [5.5, 0.6], picnic: [2, 1.8], grill: [0.8, 0.8], adirondack: [2.6, 1.3], birdbath: [0.9, 0.9], bench: [1.8, 0.7], mangal: [1.1, 0.6], dock: [2, 2], boulders: [1, 1] }[kind];
  if (!SZ) return;
  if (kind === 'dock') { // out on the water, past the end of the lawn
    const d = new T.Group(); d.position.set(3, 0, 26); g.add(d); const w = col('#8a7a62', 0.9);
    mk(d, B(1.6, 0.1, 9), w, 0, 0.35, 3); for (let k = 0; k < 5; k++) for (const s of [-0.7, 0.7]) mk(d, CY(0.08, 0.08, 1.2, 8), w, s, -0.1, -1 + k * 2);
    mk(d, B(1.2, 0.5, 3), col('#a8442c', 0.6), 1.6, 0.05, 6, 0.4).scale.set(1, 0.6, 1);
    return;
  }
  if (kind === 'boulders') { for (let k = 0; k < 6; k++) { const x = -10 + r() * 20, z = 6 + r() * 15; if (!free(x, z, 1.2, 1.2)) continue; const b = mk(g, new T.IcosahedronGeometry(0.4 + r() * 0.5, 1), col('#8a8884', 0.95), x, 0.1, z, r() * 6); b.scale.set(1.3, 0.7, 1); take(x, z, 1.2, 1.2); colliders.push([x - 0.5, z - 0.5, x + 0.5, z + 0.5]); } return; }
  const cands = { shed: [[9, 17.5]], barn: [[7.8, 17.5]], banya: [[9, 17.5], [9, 9.5], [-9, 17.5]], garage: [[9.8, 11]], greenhouse: [[8.5, 10.5], [8.6, 16.8], [-8.5, 10.5]], beehives: [[9.6, 10], [-10.6, 16]], swing: [[-6, 18.5], [-1.5, 16.5], [6, 17]], playground: [[3, 15.5], [-6, 16]],
    well: [[1.5, 16.5], [-2, 17.5], [6, 16.5]], clothesline: [[-1.5, 17.2], [2, 14.8], [-6, 9.2]], picnic: [[-3, 10.2], [1, 9.5], [-6, 18]], grill: [[-0.6, 7.6], [1.2, 7.4]], adirondack: [[3.4, 9], [-7, 12.5], [0, 15]], birdbath: [[1, 15], [-2.5, 14.5], [7, 14.5]], bench: [[0.5, 8.8], [-8, 9], [6, 19]], mangal: [[-1, 9.5], [2, 9]] }[kind];
  const at = cands.find(([x, z]) => free(x, z, SZ[0], SZ[1])) || cands[0];
  const [x, z] = at; take(x, z, SZ[0], SZ[1]);
  const o = new T.Group(); o.position.set(x, 0, z); g.add(o);
  const wood = col('#8a7a62', 0.9), dark = col('#2a2a2a', 0.5, 0.6);
  const block = (w, d) => colliders.push([x - w / 2, z - d / 2, x + w / 2, z + d / 2]);
  if (kind === 'shed') { mk(o, B(3.0, 2.2, 2.4), std({ map: C.ext, roughness: 0.95 }), 0, 1.1, 0); for (const s of [-1, 1]) mk(o, B(3.3, 0.06, 1.5), std({ map: C.roof, roughness: 0.9 }), 0, 2.55, s * 0.62, 0, s * 0.6); mk(o, B(0.9, 1.9, 0.04), col(E.trim, 0.6), 0, 0.95, -1.22); block(3, 2.4); }
  if (kind === 'barn') { const red = col('#8a2a1e', 0.8); mk(o, B(5.5, 3.6, 4.6), red, 0, 1.8, 0); for (const s of [-1, 1]) mk(o, B(5.9, 0.08, 2.9), col('#3a3a3a', 0.6, 0.4), 0, 4.3, s * 1.15, 0, s * 0.7); for (const s of [-1, 1]) { const shp = new T.Shape(); shp.moveTo(-2.3, 0); shp.lineTo(0, 1.6); shp.lineTo(2.3, 0); const gg = new T.ExtrudeGeometry(shp, { depth: 0.1, bevelEnabled: false }); gg.rotateY(Math.PI / 2); gg.translate(s * 2.75, 3.6, 0); mk(o, gg, red); }
    mk(o, B(2.2, 2.6, 0.05), col('#f4f0e6', 0.6), 0, 1.3, -2.32); for (const s of [-1, 1]) mk(o, B(0.1, 2.9, 0.06), col('#f4f0e6', 0.6), s * 1.1, 1.3, -2.34, 0, 0, s * 0.75); block(5.5, 4.6); }
  if (kind === 'banya') { const log = col('#8a6a4a', 0.9); for (let k = 0; k < 11; k++) { mk(o, CY(0.11, 0.11, 3.2, 10), log, 0, 0.11 + k * 0.2, -1.4, 0, 0, Math.PI / 2); mk(o, CY(0.11, 0.11, 3.2, 10), log, 0, 0.11 + k * 0.2, 1.4, 0, 0, Math.PI / 2); mk(o, CY(0.11, 0.11, 3.0, 10), log, -1.5, 0.21 + k * 0.2, 0, 0, Math.PI / 2, Math.PI / 2); mk(o, CY(0.11, 0.11, 3.0, 10), log, 1.5, 0.21 + k * 0.2, 0, 0, Math.PI / 2, Math.PI / 2); }
    for (const s of [-1, 1]) mk(o, B(3.6, 0.06, 1.9), std({ map: C.roof, roughness: 0.5, metalness: 0.35 }), 0, 2.6, s * 0.8, 0, s * 0.55); mk(o, CY(0.07, 0.07, 1.0, 10), dark, 0.8, 3.0, 0.4); block(3.3, 3.2); }
  if (kind === 'garage') { mk(o, B(3.2, 2.4, 5.8), us ? std({ map: C.ext, roughness: 0.9 }) : col('#6a6a64', 0.8, 0.4), 0, 1.2, 0); mk(o, B(3.4, 0.1, 6.0), col('#3a3a3a', 0.7), 0, 2.45, 0); mk(o, B(0.04, 2.0, 2.6), col(us ? '#f4f0e6' : '#5a6a5a', 0.6, us ? 0 : 0.5), -1.62, 1.0, 0); block(3.2, 5.8); }
  if (kind === 'greenhouse') {
    const poly = std({ color: 0xe8f0f0, roughness: 0.15, transparent: true, opacity: 0.28, side: T.DoubleSide, depthWrite: false });
    const arch = mk(o, new T.CylinderGeometry(1.5, 1.5, 4, 24, 1, true, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2), poly, 0, 0, 0); arch.castShadow = false;
    for (let k = 0; k <= 4; k++) mk(o, new T.TorusGeometry(1.5, 0.02, 6, 24, Math.PI), col('#c8c8c4', 0.4, 0.6), 0, 0, -2 + k, 0, 0, 0);
    block(3.1, 4.1); for (const dz of [-1.3, -0.3, 0.7]) for (const dx of [-0.6, 0.6]) A.tomatoes.push({ x: x + dx, z: z + dz, y: 0.03 });
  }
  if (kind === 'beehives') { for (let k = 0; k < 3; k++) { const h = new T.Group(); h.position.set(0, 0, -1.2 + k * 1.2); o.add(h); mk(h, B(0.5, 0.35, 0.45), col(['#e8d48a', '#8ab8d8', '#f2f0ea'][k], 0.7), 0, 0.45, 0); mk(h, B(0.5, 0.35, 0.45), col(['#e8d48a', '#8ab8d8', '#f2f0ea'][k], 0.7), 0, 0.8, 0); mk(h, B(0.62, 0.06, 0.56), col('#7a7a74', 0.6, 0.4), 0, 1.0, 0); for (const s of [-1, 1]) mk(h, B(0.06, 0.28, 0.06), wood, s * 0.2, 0.14, 0); } block(0.8, 3.4); }
  if (kind === 'swing') { const m = col(us ? '#3a6a9a' : '#c8302a', 0.4, 0.5); for (const s of [-1, 1]) for (const t of [-1, 1]) mk(o, CY(0.04, 0.04, 2.3, 8), m, s * 1.4 + t * 0.15 * s, 1.1, t * 0.5, 0, t * 0.22); mk(o, CY(0.05, 0.05, 3.0, 8), m, 0, 2.2, 0, 0, 0, Math.PI / 2); for (const dx of [-0.6, 0.5]) { for (const s of [-1, 1]) mk(o, CY(0.006, 0.006, 1.6, 4), col('#444', 0.5), dx + s * 0.2, 1.4, 0); mk(o, B(0.45, 0.04, 0.18), col('#2a2a2a', 0.6), dx, 0.6, 0); } }
  if (kind === 'playground') { const m = col('#c8302a', 0.4, 0.5), m2 = col('#2a6aa8', 0.4, 0.5); // a Soviet courtyard: climbing frame, sandbox, a little roundabout
    for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) mk(o, CY(0.03, 0.03, 1.8, 6), (i + k) % 2 ? m : m2, -1.8 + i * 0.5, 0.9, -1.6 + k * 0.5);
    for (let lv = 0; lv < 3; lv++) for (let i = 0; i < 4; i++) { mk(o, CY(0.025, 0.025, 1.5, 6), m2, -1.05, 0.6 + lv * 0.6, -1.6 + i * 0.5, 0, 0, Math.PI / 2); }
    mk(o, B(2, 0.25, 2), col('#a88a5a', 0.9), 1.2, 0.12, 0.8); mk(o, B(1.8, 0.05, 1.8), std({ map: TX.sand(), roughness: 1 }), 1.2, 0.26, 0.8);
    mk(o, CY(0.6, 0.6, 0.08, 20), m, 1.3, 0.4, -1.4); mk(o, CY(0.04, 0.04, 0.5, 8), m2, 1.3, 0.65, -1.4); colliders.push([x - 2.0, z - 1.8, x - 0.4, z]); }
  if (kind === 'well') { const lg = col('#7a5a3a', 0.9); for (let k = 0; k < 5; k++) for (const [a, b] of [[0, 0.55], [0, -0.55], [0.55, 0], [-0.55, 0]]) mk(o, B(a ? 0.12 : 1.2, 0.18, a ? 1.2 : 0.12), lg, a, 0.09 + k * 0.18, b); for (const s of [-1, 1]) mk(o, B(0.1, 1.9, 0.1), lg, s * 0.55, 1.4, 0); for (const s of [-1, 1]) mk(o, B(1.5, 0.05, 0.8), std({ map: C.roof, roughness: 0.8 }), 0, 2.35, s * 0.32, 0, s * 0.7); mk(o, CY(0.08, 0.08, 1.1, 10), lg, 0, 1.6, 0, 0, 0, Math.PI / 2); mk(o, CY(0.14, 0.12, 0.2, 12), col('#5a6a7a', 0.4, 0.7), 0.0, 1.1, 0.0); block(1.3, 1.3); }
  if (kind === 'clothesline') { for (const s of [-1, 1]) mk(o, CY(0.04, 0.04, 2.0, 8), wood, s * 2.6, 1.0, 0); mk(o, CY(0.005, 0.005, 5.2, 4).rotateZ(Math.PI / 2), col('#e8e8e0', 0.5), 0, 1.85, 0);
    for (let k = 0; k < 7; k++) { const cl = mk(o, new T.PlaneGeometry(0.5 + r() * 0.3, 0.6 + r() * 0.3), std({ color: new T.Color(['#f4f2ea', '#8ab8d8', '#e8c84a', '#c84a3a', '#f4f2ea', '#5a7a9a', '#e8d8c8'][k]), roughness: 1, side: T.DoubleSide }), -2.1 + k * 0.7, 1.5, 0); cl.material = sway(cl.material, 0.6, 1.0, false); } }
  if (kind === 'picnic') { const w = col('#9a7a5a', 0.9); mk(o, B(1.8, 0.05, 0.8), w, 0, 0.75, 0); for (const s of [-1, 1]) { mk(o, B(1.8, 0.05, 0.3), w, 0, 0.45, s * 0.62); mk(o, B(0.06, 0.8, 1.4), w, s * 0.75, 0.38, 0); } block(1.9, 1.6); }
  if (kind === 'grill') { mk(o, new T.SphereGeometry(0.3, 20, 12, 0, TAU, Math.PI / 2, Math.PI / 2), dark, 0, 0.85, 0); mk(o, new T.SphereGeometry(0.3, 20, 10, 0, TAU, 0, Math.PI / 2), dark, 0, 0.87, 0); for (let k = 0; k < 3; k++) mk(o, CY(0.012, 0.012, 0.85, 6), dark, Math.cos(k * 2.1) * 0.2, 0.42, Math.sin(k * 2.1) * 0.2, 0, Math.cos(k * 2.1) * 0.2, Math.sin(k * 2.1) * 0.2); }
  if (kind === 'adirondack') for (const [dx, ry] of [[-0.7, -0.4], [0.7, 0.3]]) { const a = new T.Group(); a.position.set(dx, 0, 0); a.rotation.y = ry; o.add(a); const ac = col(us ? '#e8e4d8' : '#3a6a4a', 0.7); mk(a, B(0.7, 0.04, 0.6), ac, 0, 0.36, 0, 0, -0.1); mk(a, B(0.7, 0.8, 0.04), ac, 0, 0.75, 0.32, 0, 0.35); for (const s of [-1, 1]) mk(a, B(0.12, 0.04, 0.8), ac, s * 0.4, 0.6, 0); }
  if (kind === 'birdbath') { mk(o, CY(0.08, 0.12, 0.8, 12), col('#a8a49a', 0.9), 0, 0.4, 0); mk(o, CY(0.36, 0.2, 0.1, 24), col('#a8a49a', 0.9), 0, 0.85, 0); mk(o, CY(0.32, 0.32, 0.01, 24), std({ color: 0x8aa8b8, roughness: 0.05 }), 0, 0.9, 0); }
  if (kind === 'bench') { mk(o, B(1.6, 0.05, 0.36), col(us ? '#8a6a4a' : '#5a7a5a', 0.9), 0, 0.45, 0); mk(o, B(1.6, 0.3, 0.04), col(us ? '#8a6a4a' : '#5a7a5a', 0.9), 0, 0.7, 0.18, 0, -0.15); for (const s of [-0.7, 0.7]) mk(o, B(0.06, 0.45, 0.3), dark, s, 0.22, 0); }
  if (kind === 'mangal') { mk(o, B(0.9, 0.18, 0.3), dark, 0, 0.7, 0); for (const sx of [-0.4, 0.4]) for (const sz of [-0.12, 0.12]) mk(o, CY(0.012, 0.012, 0.62, 6), dark, sx, 0.31, sz); for (let k = 0; k < 5; k++) mk(o, CY(0.004, 0.004, 0.6, 4).rotateX(Math.PI / 2), col('#c8c8c8', 0.3, 0.9), -0.3 + k * 0.15, 0.8, 0); }
}

// ------------------------------------------------------------------ beyond the fence
function backdrop(g, Yd, C, r, DET, low) {
  const kinds = Yd.backTrees || (C.c === 'us' ? ['pine', 'maple', 'oak'] : ['birch', 'birch', 'pine']);
  const treeLine = (n, zMin, zMax, xs) => { for (let k = 0; k < n; k++) { const side = k % 3, u = r(), x = side === 0 ? -34 + u * 68 : (side === 1 ? -16 - r() * 16 : 16 + r() * 16), z = side === 0 ? zMin + r() * (zMax - zMin) : -10 + u * 40; const kind = kinds[Math.floor(r() * kinds.length)]; const t = tree(kind, 1.1 + r() * 0.8, r, DET * 0.6); t.position.set(x, 0, z); g.add(t); } };
  const B_ = Yd.back;
  if (B_ === 'trees') treeLine(low ? 26 : 46, 25, 43);
  if (B_ === 'houses') { for (const [x, z, w] of [[-20, 6, 8], [21, 10, 9], [3, 31, 10], [-12, 32, 8], [17, 31, 8]]) { const n = new T.Group(); n.position.set(x, 0, z); g.add(n); mk(n, B(w, 5.5, 6), std({ map: C.ext, roughness: 0.95 }), 0, 2.75, 0); for (const s of [-1, 1]) mk(n, B(w + 0.4, 0.1, 3.8), std({ map: C.roof, roughness: 0.8 }), 0, 6.5, s * 1.6, 0, s * 0.6); for (const wx of [-w / 4, w / 4]) for (const wy of [1.6, 4.0]) mk(n, B(1, 1.2, 0.05), col('#2e3a44', 0.2), wx, wy, z > 20 ? -3.03 : 3.03); } treeLine(low ? 12 : 20, 36, 46); }
  if (B_ === 'field') { const f = mk(g, new T.PlaneGeometry(200, 60), col('#b8a050', 1), 0, 0.02, 54, 0, -Math.PI / 2); f.castShadow = false; for (let k = 0; k < 12; k++) { const t = tree(kinds[k % kinds.length], 1.4 + r(), r, DET * 0.5); t.position.set(-80 + k * 15 + r() * 6, 0, 80 + r() * 8); g.add(t); } for (let k = 0; k < 6; k++) mk(g, CY(0.6, 0.6, 1.2, 16).rotateZ(Math.PI / 2), col('#c8b060', 1), -30 + r() * 60, 0.6, 32 + r() * 18); treeLine(low ? 10 : 16, 24, 28); }
  if (B_ === 'sea' || B_ === 'lake') {
    const water = mk(g, new T.PlaneGeometry(600, 300), std({ color: B_ === 'sea' ? 0x3a6a8a : 0x3a5a5a, roughness: 0.08, metalness: 0.2 }), 0, -0.05, 26 + 150, 0, -Math.PI / 2); water.castShadow = false; water.receiveShadow = false;
    const shore = mk(g, new T.PlaneGeometry(600, 4), std({ map: TX.sand(), roughness: 1 }), 0, 0.005, 24, 0, -Math.PI / 2); shore.castShadow = false;
    if (B_ === 'lake') for (let k = 0; k < 30; k++) { const t = tree(kinds[k % kinds.length], 1.6 + r(), r, DET * 0.45); t.position.set(-120 + k * 8 + r() * 4, 0, 120 + r() * 10); g.add(t); }
    treeLine(low ? 10 : 16, -2, 0);
  }
  if (B_ === 'blocks') { // the other blocks around the courtyard
    const fac = std({ map: TX.facade(C.H.ext.color, C.H.ext.kind === 'stucco' ? 'stucco' : 'panel', C.H.ext.stripe), roughness: 0.9 });
    for (const [x, z, w, d, h, ry] of [[0, 40, 60, 10, (C.H.ext.storeys || 5) * 2.9, 0], [-32, 18, 10, 40, 5 * 2.9, 0], [32, 18, 10, 40, 9 * 2.9, 0]]) { const m = mk(g, B(w, h, d), fac, x, h / 2, z, ry); const p = m.geometry.attributes.position, n = m.geometry.attributes.normal, uv = m.geometry.attributes.uv; for (let i = 0; i < p.count; i++) { const ax = Math.abs(n.getX(i)); uv.setXY(i, (ax > 0.5 ? p.getZ(i) : p.getX(i)) / 3.2, (p.getY(i) + h / 2) / 2.9); } }
    for (let k = 0; k < 14; k++) { const t = tree(r() < 0.7 ? 'birch' : 'oak', 1.3 + r() * 0.6, r, DET * 0.6); t.position.set(-28 + r() * 56, 0, 26 + r() * 10); g.add(t); }
  }
  if (B_ === 'tracks') {
    const emb = mk(g, B(400, 1.2, 8), col('#6a6258', 1), 0, 0.6, 32); emb.castShadow = false;
    for (const x of [-0.75, 0.75]) mk(g, B(400, 0.12, 0.08), col('#5a5048', 0.4, 0.8), 0, 1.26, 32 + x);
    for (let k = 0; k < 160; k++) mk(g, B(0.25, 0.08, 2.4), col('#4a3a2a', 0.9), -200 + k * 2.5, 1.2, 32).castShadow = false;
    for (let k = 0; k < 9; k++) { mk(g, CY(0.12, 0.15, 8, 8), col('#7a7a74', 0.8), -80 + k * 20, 4.6, 35.5); mk(g, B(0.1, 0.1, 4), col('#5a5a5a', 0.6, 0.6), -80 + k * 20, 8.2, 34); }
    mk(g, CY(0.008, 0.008, 400, 4).rotateZ(Math.PI / 2), col('#2a2a2a', 0.6), 0, 7.6, 32);
    treeLine(low ? 14 : 22, 38, 48);
  }
}

function canMesh(can, us) {
  const m = us ? col('#4a6a5a', 0.4, 0.6) : col('#a8b0b4', 0.35, 0.8);
  mk(can, CY(0.13, 0.15, 0.28, 18), m, 0, 0.14, 0);
  const sp = mk(can, CY(0.012, 0.022, 0.42, 8), m, 0, 0.26, -0.22, 0, -0.9);
  mk(can, CY(0.04, 0.02, 0.05, 10), m, 0, 0.4, -0.38, 0, -0.9);
  mk(can, new T.TorusGeometry(0.1, 0.012, 6, 16, Math.PI), m, 0, 0.3, 0.02, Math.PI / 2, 0, 0).rotation.set(0, Math.PI / 2, 0);
}

// stylised trees: textured trunks and crowns of instanced leaf cards
const leafCache = {};
function leafCard(kind) {
  if (leafCache[kind]) return leafCache[kind];
  const pal = { birch: ['#6a9a3a', '#88b048', '#4a7a2a'], maple: ['#4a7a2a', '#3a6a24', '#6a9a3a'], oak: ['#3f6a2a', '#5a7a2e', '#2f5a24'], apple: ['#4a7a34', '#5a8a3a', '#3a6a2a'], pine: ['#2a4a2a', '#34543a', '#1e3a24'] }[kind];
  const t = crossTex(128, 128, (g, w, h) => {
    const rr = rngOf(kind.length * 17);
    for (let k = 0; k < (kind === 'pine' ? 120 : 34); k++) { g.fillStyle = pal[Math.floor(rr() * 3)]; g.save(); g.translate(16 + rr() * 96, 16 + rr() * 96); g.rotate(rr() * TAU);
      if (kind === 'pine') g.fillRect(-1, -14, 2, 28); else { g.beginPath(); g.ellipse(0, 0, kind === 'birch' ? 6 : 9, kind === 'birch' ? 9 : 13, 0, 0, TAU); g.fill(); } g.restore(); }
  });
  return (leafCache[kind] = sway(std({ map: t, alphaTest: 0.45, side: T.DoubleSide, roughness: 0.85 }), 0.35));
}
function tree(kind, s, r, det = 1) {
  const g = new T.Group();
  const trunkH = (kind === 'pine' ? 9 : kind === 'birch' ? 7 : kind === 'apple' ? 1.6 : 3.2) * s, trunkR = (kind === 'apple' ? 0.13 : kind === 'birch' ? 0.12 : 0.22) * s;
  const tm = std({ map: kind === 'birch' ? TX.birch() : TX.bark(), roughness: 0.95 });
  mk(g, CY(trunkR * 0.6, trunkR, trunkH, 10), tm, 0, trunkH / 2, 0);
  const crowns = kind === 'pine' ? [[0, trunkH * 0.65, 0, 1.6 * s, 4.5 * s], [0, trunkH * 0.92, 0, 1.1 * s, 2.5 * s]]
    : kind === 'birch' ? [[0, trunkH * 0.85, 0, 1.9 * s, 3.6 * s], [0.6 * s, trunkH * 0.65, 0.3 * s, 1.4 * s, 2.2 * s]]
    : kind === 'apple' ? [[0, trunkH + 1.0 * s, 0, 2.0 * s, 1.5 * s]]
    : [[0, trunkH + 2.0 * s, 0, 3.0 * s, 2.6 * s], [1.2 * s, trunkH + 1.4 * s, 0.6 * s, 2.0 * s, 1.8 * s]];
  if (kind !== 'pine') for (let k = 0; k < 4; k++) { const a = r() * TAU, bl = (kind === 'apple' ? 1.0 : 1.6) * s, br = mk(g, CY(trunkR * 0.2, trunkR * 0.4, bl, 6), tm, Math.cos(a) * bl * 0.25, trunkH - 0.1 + bl * 0.4, Math.sin(a) * bl * 0.25); br.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6); }
  const N = Math.round((kind === 'pine' ? 220 : 380) * det), geo = crossGeo(2, false);
  const inst = new T.InstancedMesh(geo, leafCard(kind), N * crowns.length);
  const m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), sc = new T.Vector3(), p = new T.Vector3();
  let n = 0;
  for (const [cx, cy, cz, rx, ry] of crowns) for (let k = 0; k < N; k++) {
    let u, v, w; do { u = r() * 2 - 1; v = r() * 2 - 1; w = r() * 2 - 1; } while (u * u + v * v + w * w > 1);
    if (kind === 'pine') { const tt = (v + 1) / 2; u *= 1 - tt; w *= 1 - tt; }
    p.set(cx + u * rx, cy + v * ry * 0.5, cz + w * rx); e.set((r() - 0.5) * 0.8, r() * TAU, (r() - 0.5) * 0.8); q.setFromEuler(e);
    const z = (kind === 'birch' ? 0.7 : 0.95) * s * (0.8 + r() * 0.5); sc.set(z, z, z); m4.compose(p, q, sc); inst.setMatrixAt(n++, m4);
  }
  inst.count = n; inst.castShadow = true; inst.receiveShadow = true; g.add(inst);
  if (kind === 'apple') for (let k = 0; k < 14; k++) { const a = r() * TAU, rr = 1.4 * s * Math.sqrt(r()); mk(g, new T.SphereGeometry(0.045, 10, 8), col(r() < 0.5 ? '#c8301a' : '#b8c83a', 0.4), Math.cos(a) * rr, trunkH + 0.4 * s + r() * 1.0 * s, Math.sin(a) * rr); }
  return g;
}

export { TX, mk, col, std, B, RB, CY };
