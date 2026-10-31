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

export function makeFlashTex() {
  return canvasTex(128, (g, s) => {
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
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
