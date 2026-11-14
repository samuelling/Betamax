import * as THREE from 'three';
import { pnoise, mulberry32 } from './rng.js';

function periodicFbm(x, y, size, base, oct) {
  let s = 0, a = 0.5, n = 0, f = base;
  for (let i = 0; i < oct; i++) { s += a * pnoise((x / size) * f + i * 31, (y / size) * f + i * 17, f); n += a; a *= 0.5; f *= 2; }
  return s / n;
}

function heightField(size, base, oct, aniso = 1) {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    h[y * size + x] = periodicFbm(x, y * aniso, size, base, oct);
  }
  return h;
}

function normalFromHeight(h, size, strength) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const l = h[y * size + ((x - 1 + size) % size)], r = h[y * size + ((x + 1) % size)];
    const d = h[((y - 1 + size) % size) * size + x], u = h[((y + 1) % size) * size + x];
    let nx = (l - r) * strength, ny = (d - u) * strength, nz = 1;
    const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
    const o = (y * size + x) * 4;
    data[o] = (nx * 0.5 + 0.5) * 255; data[o + 1] = (ny * 0.5 + 0.5) * 255; data[o + 2] = (nz * 0.5 + 0.5) * 255; data[o + 3] = 255;
  }
  const t = new THREE.DataTexture(data, size, size);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

export function makeSandTextures() {
  const size = 256;
  const h = heightField(size, 8, 5);
  // ripple bands
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    h[i] = h[i] * 0.7 + 0.3 * Math.sin((y / size) * Math.PI * 2 * 10 + h[i] * 6) * 0.5;
  }
  const normal = normalFromHeight(h, size, 6);
  const r = mulberry32(5);
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const g = 0.82 + h[i] * 0.25 + (r() - 0.5) * 0.12 + (r() < 0.02 ? -0.25 : 0);
    const v = Math.max(0, Math.min(255, g * 255));
    data[i * 4] = v; data[i * 4 + 1] = v * 0.98; data[i * 4 + 2] = v * 0.95; data[i * 4 + 3] = 255;
  }
  const map = new THREE.DataTexture(data, size, size);
  map.wrapS = map.wrapT = THREE.RepeatWrapping; map.generateMipmaps = true; map.minFilter = THREE.LinearMipmapLinearFilter;
  map.magFilter = THREE.LinearFilter; map.anisotropy = 4; map.colorSpace = THREE.SRGBColorSpace; map.needsUpdate = true;
  return { map, normal };
}

export function makeWaterNormal() {
  const size = 256;
  const h = heightField(size, 4, 5, 1);
  return normalFromHeight(h, size, 3);
}

function canvasTex(size, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

export function makeGrassTex() {
  return canvasTex(256, (g, s) => {
    g.clearRect(0, 0, s, s);
    const r = mulberry32(11);
    for (let i = 0; i < 70; i++) {
      const x = s * 0.1 + r() * s * 0.8;
      const h = s * (0.45 + r() * 0.55);
      const lean = (r() - 0.5) * s * 0.35;
      const w = 2 + r() * 3;
      const c1 = [150 + r() * 50, 150 + r() * 40, 80 + r() * 30];
      const dry = r() < 0.4;
      g.strokeStyle = dry ? `rgb(${190 + r() * 30},${170 + r() * 30},${110 + r() * 30})` : `rgb(${c1[0] * 0.75 | 0},${c1[1] * 0.85 | 0},${c1[2] * 0.6 | 0})`;
      g.lineWidth = w;
      g.beginPath(); g.moveTo(x, s);
      g.quadraticCurveTo(x + lean * 0.3, s - h * 0.6, x + lean, s - h);
      g.stroke();
    }
  });
}

export function makeSoftTex() {
  return canvasTex(128, (g, s) => {
    const r = mulberry32(3);
    g.clearRect(0, 0, s, s);
    for (let i = 0; i < 24; i++) {
      const cx = s / 2 + (r() - 0.5) * s * 0.35, cy = s / 2 + (r() - 0.5) * s * 0.35, rad = s * (0.15 + r() * 0.22);
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
      gr.addColorStop(0, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
    }
  }, false);
}

// a billow of smoke: a soft ball eaten into by noise, so puffs overlap into a ragged column rather than a row of discs
export function makePuffTex() {
  const N = 128, d = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = (x + 0.5) / N * 2 - 1, v = (y + 0.5) / N * 2 - 1, r = Math.hypot(u, v);
    const n = periodicFbm(x, y, N, 3, 5), n2 = periodicFbm(x + 50, y + 20, N, 7, 3);
    const body = 1 - r * (1.05 + (0.5 - n) * 2.2);
    let a = Math.max(0, Math.min(1, body * 1.5)) * (0.35 + n2 * 0.9); a = a * a * (3 - 2 * a) * Math.max(0, 1 - Math.pow(r, 6));
    const o = (y * N + x) * 4; d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = Math.max(0, Math.min(255, a * 255));
  }
  const t = new THREE.DataTexture(d, N, N); t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}

export function makeFlashTex(plain) {
  return canvasTex(128, (g, s) => {
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
    if (plain) return;   // the photoreal flash: a hot ball of gas, no drawn spikes
    // star spikes
    g.globalCompositeOperation = 'lighter';
    g.translate(s / 2, s / 2);
    for (let i = 0; i < 6; i++) {
      g.rotate(Math.PI / 3 + 0.2);
      const lg = g.createLinearGradient(0, 0, s / 2, 0);
      lg.addColorStop(0, 'rgba(255,255,255,0.7)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = lg; g.beginPath(); g.moveTo(0, -3); g.lineTo(s / 2, 0); g.lineTo(0, 3); g.fill();
    }
  }, false);
}

export function makeScorchTex() {
  return canvasTex(128, (g, s) => {
    const r = mulberry32(8);
    for (let i = 0; i < 30; i++) {
      const cx = s / 2 + (r() - 0.5) * s * 0.4, cy = s / 2 + (r() - 0.5) * s * 0.4, rad = s * (0.1 + r() * 0.3);
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
      gr.addColorStop(0, 'rgba(20,16,12,0.35)'); gr.addColorStop(1, 'rgba(20,16,12,0)');
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
    }
  });
}

export function makeShingleTex() {
  return canvasTex(256, (g, s) => {
    const r = mulberry32(21);
    g.fillStyle = '#8d8a84'; g.fillRect(0, 0, s, s);
    const rowH = s / 16;
    for (let row = 0; row < 16; row++) {
      let x = (row % 2) * 7 - 10;
      while (x < s) {
        const w = 10 + r() * 14;
        const v = 110 + r() * 50;
        g.fillStyle = `rgb(${v},${v * 0.97},${v * 0.92})`;
        g.fillRect(x, row * rowH, w - 1.5, rowH - 1.2);
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.fillRect(x, row * rowH + rowH - 2.5, w - 1.5, 1.4);
        x += w;
      }
    }
  });
}

export function makeTapeNoiseTex() {
  const size = 256;
  const r = mulberry32(77);
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) { const v = r() * 255; data[i * 4] = v; data[i * 4 + 1] = r() * 255; data[i * 4 + 2] = r() * 255; data[i * 4 + 3] = 255; }
  const t = new THREE.DataTexture(data, size, size);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.needsUpdate = true;
  return t;
}

// =====================================================================================================================
// Photoreal PBR sets for the beach's buildings and set dressing. Everything is baked into DataTextures (no canvas),
// each set is { map, normalMap, roughnessMap } and tiles. Albedos are kept near neutral where the builders tint
// them per vertex (siding, roofing, planks).
// =====================================================================================================================
const _fields = new Map();
function field(size, base, oct) {
  const k = size + ':' + base + ':' + oct; let f = _fields.get(k);
  if (!f) { f = new Float32Array(size * size); for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) f[y * size + x] = periodicFbm(x, y, size, base, oct); _fields.set(k, f); }
  return f;
}
const sampler = (f, size) => (x, y) => f[((((y | 0) % size) + size) % size) * size + ((((x | 0) % size) + size) % size)];
const c255 = (v) => (v <= 0 ? 0 : v >= 1 ? 255 : v * 255);
function dataTex(data, size, srgb, aniso = 8) {
  const t = new THREE.DataTexture(data, size, size);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.anisotropy = aniso; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t;
}
// px(x, y, o) fills o.h (height 0..1), o.r/g/b (display-space albedo), o.ro (roughness), optionally o.a (alpha)
function bake(size, px, { normal = 4, alpha = false } = {}) {
  const N = size * size, h = new Float32Array(N), col = new Uint8Array(N * 4), rg = new Uint8Array(N * 4), o = { h: 0.5, r: 0.5, g: 0.5, b: 0.5, ro: 0.9, a: 1 };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    o.a = 1; px(x, y, o); const i = y * size + x, j = i * 4;
    h[i] = o.h; col[j] = c255(o.r); col[j + 1] = c255(o.g); col[j + 2] = c255(o.b); col[j + 3] = alpha ? c255(o.a) : 255;
    rg[j] = 255; rg[j + 1] = c255(o.ro); rg[j + 2] = 0; rg[j + 3] = 255;
  }
  const normalMap = normalFromHeight(h, size, normal); normalMap.anisotropy = 8;
  return { map: dataTex(col, size, true), normalMap, roughnessMap: dataTex(rg, size, false, 4) };
}
// rows of random-width units (shingles) that wrap around the tile
function unitRows(size, rows, r, wMin, wMax, make) {
  const R = [];
  for (let j = 0; j < rows; j++) {
    const list = []; let x = r() * wMax; const first = x;
    while (x < size + first - wMin * 0.6) { const w = wMin + r() * (wMax - wMin); list.push(Object.assign({ x0: x, x1: x + w }, make(r))); x += w; }
    list[list.length - 1].x1 = size + first; R.push(list);
  }
  const find = (j, x) => { const l = R[((j % rows) + rows) % rows]; let xx = x < l[0].x0 ? x + size : x; for (const s of l) if (xx < s.x1) { find.e = Math.min(xx - s.x0, s.x1 - xx); return s; } find.e = 0; return l[l.length - 1]; };
  return find;
}

// weathered white-cedar sidewall shingles: 16 courses to a 2 m tile, random widths, staggered butts, keyways, grain
export function makeCedarShingleSet() {
  const S = 512, rows = 16, rh = S / rows, r = mulberry32(101), n1 = sampler(field(S, 6, 5), S), n2 = sampler(field(S, 64, 3), S), n3 = sampler(field(S, 3, 3), S);
  const find = unitRows(S, rows, r, 18, 50, (q) => ({ tone: 0.74 + q() * 0.34, warm: q() < 0.22 ? 0.3 + q() * 0.7 : q() * 0.15, thick: q(), butt: (q() - 0.5) * 4.5 }));
  return bake(S, (x, y, o) => {
    let row = Math.floor(y / rh), s = find(row, x), e = find.e;
    if (y - row * rh < s.butt) { row -= 1; s = find(row, x); e = find.e; }
    else { const s2 = find(row + 1, x); if (y - (row + 1) * rh >= s2.butt) { row += 1; s = s2; e = find.e; } }
    const t = Math.max(0, (y - row * rh - s.butt) / rh), gap = e < 1.1 ? 1 : e < 2.2 ? 0.35 : 0;
    const grain = n2(x + row * 37, y * 0.14 + row * 11), fine = n1(x * 2, y * 2), blot = n3(x, y);
    o.h = 0.2 + 0.62 * Math.pow(Math.max(0, 1 - t), 0.8) + (s.thick - 0.5) * 0.16 + (grain - 0.5) * 0.14 - gap * 0.5 - (t < 0.05 ? 0.12 : 0);
    const dark = t > 0.84 ? Math.min(1, (t - 0.84) / 0.16) : 0;
    const v = s.tone * (0.9 + (grain - 0.5) * 0.3) * (1 - 0.42 * dark) * (1 - 0.55 * gap) * (0.88 + 0.24 * fine) * (t < 0.14 ? 0.86 + t : 1) * (0.8 + 0.4 * blot);
    o.r = v * 0.82 * (1 + 0.1 * s.warm); o.g = v * 0.79; o.b = v * 0.75 * (1 - 0.2 * s.warm); o.ro = 0.86 + 0.12 * fine;
  }, { normal: 3.2 });
}

// painted clapboard: 18 laps to a 2 m tile, a shadow under every lap, the odd butt joint, paint going at the bottom edges
export function makeClapboardSet() {
  const S = 512, rows = 18, rh = S / rows, r = mulberry32(202), n1 = sampler(field(S, 6, 5), S), n2 = sampler(field(S, 64, 3), S), n3 = sampler(field(S, 3, 3), S);
  const joint = []; for (let j = 0; j < rows; j++) joint.push(r() < 0.55 ? Math.floor(r() * S) : -99);
  return bake(S, (x, y, o) => {
    const row = Math.floor(y / rh), t = (y - row * rh) / rh, grain = n2(y * 0.9 + row * 53, x * 0.12 + row * 7), fine = n1(x * 2, y * 2), blot = n3(x + row * 3, y);
    const jt = Math.abs(x - joint[row]) < 1 ? 1 : 0, peel = Math.max(0, (fine - 0.62) * 6) * (t < 0.3 ? 1 - t / 0.3 : 0) * (blot > 0.5 ? 1 : 0.2);
    o.h = 0.3 + 0.6 * (1 - t) + (grain - 0.5) * 0.05 - jt * 0.4 - peel * 0.08 - (t < 0.04 ? 0.15 : 0);
    const dark = t > 0.9 ? (t - 0.9) / 0.1 : 0;
    const v = (0.93 + (grain - 0.5) * 0.06) * (1 - 0.5 * dark) * (1 - 0.4 * jt) * (0.9 + 0.2 * blot) * (t < 0.1 ? 0.9 + t : 1);
    const p = Math.min(1, peel);   // bare grey wood where the paint has let go
    o.r = v * (1 - p) + 0.55 * p; o.g = v * (1 - p) + 0.52 * p; o.b = v * 0.985 * (1 - p) + 0.47 * p; o.ro = 0.5 + 0.2 * fine + 0.3 * p;
  }, { normal: 3 });
}

// three-tab asphalt roofing: 14 courses to a 2 m tile, slots between the tabs, granules, algae streaks
export function makeAsphaltShingleSet() {
  const S = 512, rows = 14, rh = S / rows, tabs = 6, tw = S / tabs, r = mulberry32(303), n1 = sampler(field(S, 6, 5), S), n3 = sampler(field(S, 3, 3), S), n4 = sampler(field(S, 40, 2), S);
  const tone = new Float32Array(rows * tabs).map(() => 0.8 + r() * 0.3), lift = new Float32Array(rows * tabs).map(() => (r() < 0.06 ? 0.2 : 0) + r() * 0.06);
  const wn = new Float32Array(S * S).map(() => r());
  return bake(S, (x, y, o) => {
    const row = Math.floor(y / rh), t = (y - row * rh) / rh, xx = (x + (row % 2) * tw * 0.5) % S, tab = Math.floor(xx / tw), e = Math.min(xx - tab * tw, (tab + 1) * tw - xx), k = row * tabs + tab;
    const slot = e < 1.3 && t < 0.92 ? 1 : 0, gran = wn[y * S + x], streak = n4(x, y * 0.08), blot = n3(x, y);
    o.h = 0.3 + 0.5 * (1 - t) + lift[k] * (1 - t) + (gran - 0.5) * 0.16 - slot * 0.45 - (t < 0.05 ? 0.12 : 0);
    const dark = t > 0.9 ? (t - 0.9) / 0.1 : 0;
    const v = tone[k] * (0.8 + 0.4 * gran) * (1 - 0.45 * dark) * (1 - 0.6 * slot) * (0.85 + 0.3 * blot) * (1 - 0.3 * Math.max(0, streak - 0.55) * 2.2);
    o.r = v * 0.80; o.g = v * 0.80; o.b = v * 0.80; o.ro = 0.9 + 0.1 * gran;
  }, { normal: 2.6 });
}

// old New England brick in running bond: 24 courses and 8 stretchers to a 1.7 x 1.6 m tile
export function makeBrickSet() {
  const S = 512, rows = 24, rh = S / rows, bw = S / 8, r = mulberry32(404), n1 = sampler(field(S, 6, 5), S), n3 = sampler(field(S, 3, 3), S), n5 = sampler(field(S, 24, 3), S);
  const B = []; for (let i = 0; i < rows * 8; i++) { const k = r(); B.push({ v: 0.78 + r() * 0.36, burnt: k < 0.12 ? 0.5 + r() * 0.5 : 0, pale: k > 0.9 ? r() * 0.6 : 0, d: (r() - 0.5) * 0.12 }); }
  return bake(S, (x, y, o) => {
    const row = Math.floor(y / rh), xx = (x + (row % 2) * bw * 0.5) % S, c = Math.floor(xx / bw), b = B[row * 8 + c], ex = Math.min(xx - c * bw, (c + 1) * bw - xx), ey = Math.min(y - row * rh, (row + 1) * rh - y);
    const fine = n1(x * 2, y * 2), pit = n5(x, y), blot = n3(x, y), e = Math.min(ex, ey) + (pit - 0.5) * 1.6, mortar = e < 1.6 ? 1 : e < 2.6 ? 0.4 : 0;
    o.h = mortar >= 1 ? 0.22 + fine * 0.12 : 0.62 + b.d + (pit - 0.5) * 0.22 - mortar * 0.2;
    if (mortar >= 1) { const m = 0.62 + fine * 0.14; o.r = m; o.g = m * 0.97; o.b = m * 0.92; o.ro = 0.95; return; }
    const v = b.v * (0.86 + 0.28 * pit) * (0.85 + 0.3 * blot) * (1 - 0.25 * mortar);
    o.r = v * (0.56 - 0.2 * b.burnt + 0.1 * b.pale); o.g = v * (0.27 - 0.08 * b.burnt + 0.12 * b.pale); o.b = v * (0.2 - 0.04 * b.burnt + 0.1 * b.pale); o.ro = 0.82 + 0.14 * fine;
  }, { normal: 3 });
}

// poured concrete: pits, trowel drift, stains
export function makeConcreteSet() {
  const S = 256, r = mulberry32(505), n1 = sampler(field(S, 6, 5), S), n3 = sampler(field(S, 2, 4), S), n5 = sampler(field(S, 28, 3), S);
  const pit = new Float32Array(S * S);
  for (let i = 0; i < 420; i++) { const cx = Math.floor(r() * S), cy = Math.floor(r() * S), R = 0.6 + r() * 1.8, d = 0.25 + r() * 0.5; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const q = 1 - Math.hypot(dx, dy) / R; if (q > 0) { const k = ((cy + dy + S) % S) * S + ((cx + dx + S) % S); pit[k] = Math.max(pit[k], d * q); } } }
  return bake(S, (x, y, o) => {
    const a = n1(x, y), b = n3(x, y), c = n5(x, y), p = pit[y * S + x];
    o.h = 0.5 + (a - 0.5) * 0.3 + (c - 0.5) * 0.2 - p;
    const v = (0.86 + (b - 0.5) * 0.3 + (c - 0.5) * 0.12) * (1 - p * 0.6);
    o.r = v * 0.80; o.g = v * 0.785; o.b = v * 0.75; o.ro = 0.84 + 0.14 * a;
  }, { normal: 2.2 });
}

// sprayed stucco / painted render for the hotel: fine tooth, hairline cracks, rain streaks down the face
export function makeStuccoSet() {
  const S = 256, n1 = sampler(field(S, 40, 3), S), n3 = sampler(field(S, 3, 4), S), n4 = sampler(field(S, 24, 2), S);
  return bake(S, (x, y, o) => {
    const a = n1(x, y), b = n3(x, y), st = n4(x, y * 0.06), streak = Math.max(0, st - 0.52) * 2.4;
    o.h = 0.5 + (a - 0.5) * 0.5;
    const v = (0.9 + (b - 0.5) * 0.16 + (a - 0.5) * 0.08) * (1 - 0.32 * streak);
    o.r = v; o.g = v * 0.99; o.b = v * 0.965; o.ro = 0.78 + 0.18 * a;
  }, { normal: 1.6 });
}

// weathered decking: eight boards across the tile, grain along v, gaps, cupping, checks, knots, two screws at each joist line
export function makePlankSet() {
  const S = 512, nP = 8, pw = S / nP, r = mulberry32(606), n1 = sampler(field(S, 6, 5), S), n2 = sampler(field(S, 64, 3), S), n3 = sampler(field(S, 3, 3), S);
  const P = []; for (let i = 0; i < nP; i++) P.push({ tone: 0.72 + r() * 0.36, warm: r() * 0.5, off: Math.floor(r() * S), cup: (r() - 0.3) * 0.2 });
  const knots = []; for (let i = 0; i < 16; i++) knots.push([r() * S, r() * S, 2.5 + r() * 4.5]);
  const check = new Float32Array(S * S);
  for (let i = 0; i < 70; i++) { let x = r() * S, y = r() * S; const L = 20 + r() * 110; for (let k = 0; k < L; k++) { check[(((y | 0) + S) % S) * S + (((x | 0) + S) % S)] = 1; y += 1; x += (r() - 0.5) * 0.5; } }
  const screwV = [0.0417, 0.5, 0.9583].map((v) => v * S);
  return bake(S, (x, y, o) => {
    const p = Math.floor(x / pw), q = P[p], fx = (x - p * pw) / pw, e = Math.min(fx, 1 - fx) * pw;
    const grain = n2(x * 1.3 + p * 71, (y + q.off) * 0.1), fine = n1(x * 2, (y + q.off) * 2), blot = n3(x + p * 9, y + q.off), gap = e < 1.2 ? 1 : e < 2.2 ? 0.3 : 0, ch = check[y * S + x];
    let kn = 0; for (const k of knots) { const d = Math.hypot((x - k[0]), (y - k[1]) * 0.6) / k[2]; if (d < 1) kn = Math.max(kn, 1 - d); }
    let sc = 0; for (const sv of screwV) for (const sx of [0.25, 0.75]) { const d = Math.hypot(x - (p + sx) * pw, y - sv); if (d < 2.4) sc = 1; }
    o.h = 0.55 + q.cup * (1 - Math.pow(Math.abs(fx - 0.5) * 2, 2)) + (grain - 0.5) * 0.22 - gap * 0.55 - ch * 0.3 - kn * 0.1 - sc * 0.3;
    const v = q.tone * (0.84 + (grain - 0.5) * 0.4) * (1 - 0.7 * gap) * (1 - 0.3 * ch) * (1 - 0.45 * kn) * (0.85 + 0.3 * blot) * (0.9 + 0.2 * fine);
    o.r = v * 0.80 * (1 + 0.08 * q.warm); o.g = v * 0.775; o.b = v * 0.73 * (1 - 0.1 * q.warm); o.ro = 0.86 + 0.12 * fine;
    if (sc) { o.r = 0.34; o.g = 0.33; o.b = 0.32; o.ro = 0.5; }
  }, { normal: 3 });
}

// old parking-lot asphalt, 8 m to the tile: exposed aggregate, wandering cracks (some poured with tar), a patch of alligatoring
export function makeAsphaltSet() {
  const S = 512, r = mulberry32(707), n1 = sampler(field(S, 6, 5), S), n3 = sampler(field(S, 3, 4), S), n5 = sampler(field(S, 30, 3), S);
  const wn = new Float32Array(S * S).map(() => r()), crack = new Float32Array(S * S), tar = new Float32Array(S * S);
  const walk = (x, y, a, L, wgt, tarred, depth) => {
    for (let k = 0; k < L; k++) {
      const xi = ((x | 0) + S) % S, yi = ((y | 0) + S) % S; crack[yi * S + xi] = Math.max(crack[yi * S + xi], wgt);
      if (wgt > 0.8) crack[yi * S + (xi + 1) % S] = Math.max(crack[yi * S + (xi + 1) % S], wgt * 0.5);
      if (tarred) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const q = 1 - Math.hypot(dx, dy) / 2.6; if (q > 0) { const j = ((yi + dy + S) % S) * S + ((xi + dx + S) % S); tar[j] = Math.max(tar[j], q); } }
      a += (r() - 0.5) * 0.5; x += Math.cos(a); y += Math.sin(a);
      if (depth < 2 && r() < 0.012) walk(x, y, a + (r() < 0.5 ? 1 : -1) * (0.6 + r() * 0.8), L * 0.35, wgt * 0.8, false, depth + 1);
    }
  };
  for (let i = 0; i < 7; i++) walk(r() * S, r() * S, r() * 6.283, 260 + r() * 420, 1, i < 3, 0);
  { const cx = 150, cy = 330; for (let i = 0; i < 46; i++) { const a = r() * 6.283, d = Math.sqrt(r()) * 70; walk(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r() * 6.283, 14 + r() * 30, 0.7, false, 2); } }
  return bake(S, (x, y, o) => {
    const i = y * S + x, g = wn[i], a = n1(x, y), b = n3(x, y), st = n5(x, y), c = crack[i], t = tar[i];
    const stone = g > 0.86 ? (g - 0.86) / 0.14 : 0;
    o.h = 0.5 + (g - 0.5) * 0.3 + (a - 0.5) * 0.2 + stone * 0.15 - c * 0.6 + t * 0.12;
    let v = (0.5 + (b - 0.5) * 0.26 + (st - 0.5) * 0.12) * (0.82 + 0.36 * g) + stone * 0.24; v *= 1 - 0.6 * c;
    v = v * (1 - t) + 0.16 * t;
    o.r = v * 0.86; o.g = v * 0.86; o.b = v * 0.88; o.ro = (0.9 + 0.1 * g) * (1 - 0.55 * t);
  }, { normal: 2.4 });
}

// woven polypropylene / burlap for sandbags: a plain weave, 3 mm threads
export function makeBurlapSet() {
  const S = 256, p = 8, r = mulberry32(808), n1 = sampler(field(S, 6, 5), S), n3 = sampler(field(S, 3, 3), S);
  const tw = new Float32Array(64).map(() => 0.8 + r() * 0.4);
  return bake(S, (x, y, o) => {
    const cx = Math.floor(x / p), cy = Math.floor(y / p), fx = (x % p) / p, fy = (y % p) / p;
    const warp = Math.sin(Math.PI * fx) * (0.5 + 0.5 * Math.cos(Math.PI * (fy + cy + cx))), weft = Math.sin(Math.PI * fy) * (0.5 - 0.5 * Math.cos(Math.PI * (fx + cx + cy)));
    const top = warp > weft, hgt = Math.max(warp, weft), a = n1(x * 2, y * 2), b = n3(x, y);
    o.h = 0.25 + 0.7 * hgt;
    const v = (0.62 + 0.42 * hgt) * (top ? tw[cx % 32] : tw[32 + (cy % 32)]) * (0.88 + 0.24 * a) * (0.85 + 0.3 * b);
    o.r = v * 0.84; o.g = v * 0.79; o.b = v * 0.66; o.ro = 0.9 + 0.1 * a;
  }, { normal: 2.5 });
}

// road paint: white with tyre wear and chips; alpha is where the paint is still there (use with alphaTest)
export function makePaintWearTex() {
  const S = 256, r = mulberry32(909), n1 = sampler(field(S, 10, 5), S), n3 = sampler(field(S, 3, 3), S), wn = new Float32Array(S * S).map(() => r());
  return bake(S, (x, y, o) => {
    const a = n1(x, y), b = n3(x, y), g = wn[y * S + x];
    const v = 0.78 + 0.2 * a - 0.12 * (1 - b);
    o.r = v; o.g = v * 0.985; o.b = v * 0.94; o.h = 0.5; o.ro = 0.8;
    o.a = Math.min(1, Math.max(0, (a * 0.7 + b * 0.5 + g * 0.22 - 0.5) * 5 + 0.5));
  }, { alpha: true }).map;
}

// the slight waviness of old window glass, so reflections wobble across a pane
export function makeGlassNormal() {
  const S = 64, f = field(S, 3, 2), t = normalFromHeight(f, S, 1.1); t.anisotropy = 4; return t;
}
