// The Bomb, drawn: Route 135 west out of Ashland through the woods to Hopkinton. The common with its bandstand and
// flag, the white church, Main Street, the depot and the crossing, the gas station; then twenty-odd miles of oak and
// pine with stone walls round the pastures, cars dead on the shoulders where the pulse caught them, a fuel tanker,
// the hayfield with its round bales. And to the east, over Boston, the cloud.
import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { roadAt, roadZ0, sAtX, ROAD_LEN, ROAD_HALF, S_TOWN, S_FIELD, TOWN, FIELD, fieldMask, townMask, openAt } from './terrainB.js';
import { buildCar, PAINT, planBlast, poseBlast } from './cars.js';
import { carPose, DTC, T_CAR } from './layoutB.js';
import { mulberry32, fbm, smoothstep } from './rng.js';
import * as TX from './textures.js';
import { place, box, cyl, merge, std, SUN_DIR } from './world.js';
import { addPoles } from './world4.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _v = new THREE.Vector3();
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const canvasTex = (w, h, draw, rep = true) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
// open-ness of the country as a smooth number (the walls use the hard version)
const openness = (s) => Math.max(smoothstep(0.3, 0.6, Math.sin(s * 0.004 + 1)), smoothstep(160, 120, Math.abs(s - S_FIELD)));
let SR = null;   // the woods road, for the ground colour

// ---------------------------------------------------------------- ground colour
export function bombGround(x, z, y) {
  const LEAF = [0.33, 0.28, 0.19], MOSS = [0.25, 0.31, 0.16], VERGE = [0.37, 0.45, 0.21], PAST = [0.47, 0.5, 0.26], HAY = [0.78, 0.68, 0.42], STUB = [0.64, 0.58, 0.34],
    LAWN = [0.32, 0.43, 0.19], GRAVEL = [0.46, 0.44, 0.4], ASPH = [0.16, 0.16, 0.17], DIRT = [0.4, 0.33, 0.24];
  const n = fbm(x * 0.03 + 5, z * 0.03 - 2, 3), n2 = fbm(x * 0.15, z * 0.15, 2);
  const d = Math.abs(z - roadZ0(x)) * 0.98 - ROAD_HALF, s = sAtX(x);
  let k = mix(LEAF, MOSS, smoothstep(0.5, 0.75, n) * 0.6);
  k = mix(k, [0.28, 0.23, 0.16], smoothstep(0.55, 0.8, n2) * 0.35);
  const op = openness(s) * smoothstep(100, 70, d);
  k = mix(k, mix(PAST, [0.56, 0.55, 0.31], smoothstep(0.4, 0.7, n2)), op);
  k = mix(k, mix(VERGE, [0.44, 0.5, 0.24], n2), smoothstep(11, 6, d) * (1 - op * 0.4));
  k = mix(k, mix(LAWN, [0.37, 0.46, 0.21], n2), townMask(x, z));
  const fm = fieldMask(x, z);
  if (fm > 0) { const row = 0.5 + 0.5 * Math.sin((x - FIELD.x) * 0.62 + Math.sin(z * 0.04) * 1.5); k = mix(k, mix(mix(STUB, [0.6, 0.6, 0.32], n2 * 0.5), HAY, smoothstep(0.8, 0.97, row)), fm); }
  if (SR) { const px = x - SR.x, pz = z - SR.z, along = px * SR.ux + pz * SR.uz, off = Math.abs(px * SR.uz - pz * SR.ux); if (along > -4 && along < 160) k = mix(k, mix(DIRT, [0.33, 0.3, 0.2], smoothstep(0.6, 1.4, off)), smoothstep(2.6, 1.4, off)); }
  k = mix(k, GRAVEL, smoothstep(1.5, 0.25, d) * 0.85);
  k = mix(k, ASPH, smoothstep(0.15, -0.1, d));
  return k;
}

// ---------------------------------------------------------------- terrain: one sheared grid, fine at the road
export function buildBombTerrain(W) {
  SR = W.L.sideRoad;
  const lo = W.q.terrainSeg <= 300, xs = [], os = [];
  const dx = lo ? 3.5 : 2.5, fine = lo ? 2 : 1.5;
  for (let x = -1720; x <= 1720; x += dx) xs.push(x);
  for (let st = dx, x = 1720; x < 2700; st *= 1.1) { x += st; xs.push(x); xs.unshift(-x); }
  os.push(0); for (let o = fine; o <= 40; o += fine) { os.push(o); os.unshift(-o); }
  for (let st = fine, o = os[os.length - 1]; o < 1150; st *= 1.08) { o += st; os.push(o); os.unshift(-o); }
  const nx = xs.length, no = os.length, pos = new Float32Array(nx * no * 3), uv = new Float32Array(nx * no * 2), idx = [];
  for (let j = 0; j < no; j++) for (let i = 0; i < nx; i++) {
    const x = xs[i], z = roadZ0(x) + os[j], k = j * nx + i;
    pos[k * 3] = x; pos[k * 3 + 1] = 0; pos[k * 3 + 2] = z; uv[k * 2] = x / 3.3; uv[k * 2 + 1] = z / 3.3;
    if (i < nx - 1 && j < no - 1) idx.push(k, k + nx, k + 1, k + 1, k + nx, k + nx + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(nx * no > 65000 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  W.coreRect = [-1680, 1680, -340, 340];
  W.colorTerrain(g, null);
  W.terrainCore = W.terrain;
}

// ---------------------------------------------------------------- textures
function roadTex() {
  return canvasTex(256, 1024, (g, w, h) => {
    const r = mulberry32(135);
    g.fillStyle = '#4a4a4c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 26000; i++) { const v = 50 + r() * 60; g.fillStyle = `rgba(${v},${v},${v + 2},0.6)`; g.fillRect(r() * w, r() * h, 1 + r() * 1.5, 1 + r() * 1.5); }
    // tyre-polished wheel paths, darker
    for (const u of [0.18, 0.34, 0.66, 0.82]) { const gr = g.createLinearGradient((u - 0.06) * w, 0, (u + 0.06) * w, 0); gr.addColorStop(0, 'rgba(20,20,22,0)'); gr.addColorStop(0.5, 'rgba(20,20,22,0.28)'); gr.addColorStop(1, 'rgba(20,20,22,0)'); g.fillStyle = gr; g.fillRect((u - 0.06) * w, 0, 0.12 * w, h); }
    // patches and tar-sealed cracks
    for (let i = 0; i < 9; i++) { g.fillStyle = `rgba(30,30,32,${0.25 + r() * 0.25})`; g.fillRect(r() * w * 0.8, r() * h, 20 + r() * 80, 30 + r() * 140); }
    g.strokeStyle = 'rgba(15,15,15,0.7)'; g.lineWidth = 2;
    for (let i = 0; i < 14; i++) { let x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (r() - 0.5) * 30; y += r() * 26; g.lineTo(x, y); } g.stroke(); }
    // double yellow down the middle, white fog lines
    g.fillStyle = '#d6a92a'; g.fillRect(w * 0.5 - 9, 0, 6, h); g.fillRect(w * 0.5 + 3, 0, 6, h);
    g.fillStyle = '#dcdcd4'; g.fillRect(w * 0.035, 0, 6, h); g.fillRect(w * 0.965 - 6, 0, 6, h);
    // worn paint
    for (let i = 0; i < 2600; i++) { g.fillStyle = 'rgba(70,70,72,0.8)'; g.fillRect(r() * w, r() * h, 2, 2 + r() * 3); }
  });
}
function clapTex() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#f2f0ea'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) { const gr = g.createLinearGradient(0, y, 0, y + 16); gr.addColorStop(0, 'rgba(0,0,0,0.16)'); gr.addColorStop(0.18, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(255,255,255,0.12)'); g.fillStyle = gr; g.fillRect(0, y, w, 16); }
  });
}
function brickTex() {
  return canvasTex(256, 256, (g, w, h) => {
    const r = mulberry32(9); g.fillStyle = '#c8c0b4'; g.fillRect(0, 0, w, h);
    for (let row = 0; row < 32; row++) for (let c = -1; c < 9; c++) { const x = c * 32 + (row % 2) * 16, y = row * 8, v = r(); g.fillStyle = `rgb(${120 + v * 40 | 0},${48 + v * 20 | 0},${36 + v * 14 | 0})`; g.fillRect(x + 1, y + 1, 30, 6); }
  });
}
function signTex(lines, bg = '#f4f2ea', fg = '#1a1a1a', w = 512, h = 128) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    lines.forEach(([txt, size, y]) => { g.font = `bold ${size}px Georgia, serif`; g.fillText(txt, w / 2, y); });
  }, false);
}
function baleTex() {
  return canvasTex(256, 256, (g, w, h) => {
    const r = mulberry32(31); g.fillStyle = '#b89a52'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { const v = r(); g.strokeStyle = `rgba(${180 + v * 60 | 0},${150 + v * 50 | 0},${80 + v * 30 | 0},0.6)`; g.lineWidth = 1 + r(); const x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 10 + r() * 30, y + (r() - 0.5) * 4); g.stroke(); }
  });
}
function baleEndTex() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#a88a46'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(80,60,25,0.45)'; g.lineWidth = 2.5; g.beginPath();
    for (let a = 0; a < 40 * Math.PI; a += 0.08) { const rr = a * 0.95; g.lineTo(w / 2 + Math.cos(a) * rr, h / 2 + Math.sin(a) * rr); } g.stroke();
  }, false);
}

// ---------------------------------------------------------------- the woods: full-crowned oaks and maples, tall white pines
// Instanced in 200 m chunks so each chunk can be culled (and left out of the shadow map) on its own.
function addWoods(root, trees, r, hi) {
  const blob = (rad) => new THREE.IcosahedronGeometry(rad, hi ? 1 : 0);
  const decid = (seed, wide) => { const q = mulberry32(seed), l = [];
    for (let k = 0; k < 11; k++) { const a = q() * 6.28, rr = Math.sqrt(q()) * (wide ? 3.4 : 2.8), y = 6.2 + q() * 6 - rr * 0.35; l.push(place(blob(1.9 + q() * 1.1), Math.cos(a) * rr, y, Math.sin(a) * rr, 0, 0, 0, 1, 0.85, 1)); }
    l.push(place(blob(2.6), 0, 11.6, 0, 0, 0, 0, 1.2, 0.8, 1.2)); return merge(l); };
  const pineCrown = (seed) => { const q = mulberry32(seed), l = [];
    for (let k = 0; k < 7; k++) { const y = 7.5 + k * 1.55, w = 2.6 - k * 0.27; for (let j = 0; j < 2; j++) { const a = q() * 6.28, o = q() * w * 0.4; l.push(place(blob(w * (0.7 + q() * 0.3)), Math.cos(a) * o, y + q() * 0.4, Math.sin(a) * o, 0, q() * 3, 0, 1.25, 0.42, 1.05)); } }
    l.push(place(new THREE.ConeGeometry(0.7, 2.4, 6), 0, 18.6, 0)); return merge(l); };
  const trunkD = merge([cyl(0.2, 0.34, 8, 7, 0, 4, 0), cyl(0.09, 0.14, 3.5, 5, 0.9, 7.5, 0, 0, 0, -0.6), cyl(0.08, 0.13, 3.2, 5, -0.8, 7.8, 0.3, 0.3, 0, 0.55)]);
  const trunkP = cyl(0.16, 0.3, 18, 7, 0, 9, 0, 0, 0, 0.02);
  const kinds = {
    oak: { trunk: trunkD, crowns: [decid(11, true), decid(12, true), decid(13, true)], col: [0.17, 0.28, 0.12], bark: [0.3, 0.26, 0.22] },
    maple: { trunk: trunkD, crowns: [decid(21, false), decid(22, false), decid(23, false)], col: [0.2, 0.31, 0.12], bark: [0.36, 0.33, 0.3] },
    pine: { trunk: trunkP, crowns: [pineCrown(31), pineCrown(32), pineCrown(33)], col: [0.14, 0.22, 0.15], bark: [0.33, 0.25, 0.2] },
  };
  const chunks = new Map();
  for (const t of trees) { const key = Math.floor(t.x / 200); if (!chunks.has(key)) chunks.set(key, []); chunks.get(key).push(t); }
  const leafM = std([1, 1, 1], 0.9), col = new THREE.Color();
  const barkM = {}; for (const [k, K] of Object.entries(kinds)) barkM[k] = std(K.bark, 0.95);
  for (const list of chunks.values()) for (const [kind, K] of Object.entries(kinds)) for (let v = 0; v < 3; v++) {
    const sel = list.filter((t, i) => t.kind === kind && (((t.x * 7.3 + t.z * 3.1) | 0) % 3 + 3) % 3 === v); if (!sel.length) continue;
    const ti = new THREE.InstancedMesh(K.trunk, barkM[kind], sel.length), ci = new THREE.InstancedMesh(K.crowns[v], leafM, sel.length);
    sel.forEach((t, i) => { const lean = (r() - 0.5) * 0.06; _e.set(lean, t.rot, (r() - 0.5) * 0.06); _q.setFromEuler(_e); _p.set(t.x, heightAt(t.x, t.z) - 0.2, t.z); const sc = t.s * (kind === 'pine' ? 1.05 : 0.95); _s.set(sc, sc * (0.88 + r() * 0.3), sc); _m.compose(_p, _q, _s); ti.setMatrixAt(i, _m); ci.setMatrixAt(i, _m);
      const v2 = 0.85 + r() * 0.3, y2 = r(); ci.setColorAt(i, col.setRGB(K.col[0] * v2 * (1 + y2 * 0.25), K.col[1] * v2, K.col[2] * v2 * (1 - y2 * 0.2))); });
    ti.castShadow = ci.castShadow = true; ti.receiveShadow = ci.receiveShadow = true; ti.computeBoundingSphere(); ci.computeBoundingSphere(); root.add(ti, ci);
  }
}

// ---------------------------------------------------------------- the scene
export function buildBomb(W) {
  const L = W.L, root = W.root, r = mulberry32(135), hi = W.q.terrainSeg > 300;
  // ---------- the road: a ribbon with a painted asphalt texture; sidewalks and curbs through town ----------
  const ribbon = (s0, s1, l0, l1, dy, step, vScale, mat) => {
    const pos = [], uv = [], idx = [], tmp = {}; let n = 0;
    for (let s = s0; s <= s1 + 1e-3; s += step) {
      roadAt(s, tmp);
      for (const [l, u] of [[l0, 0], [l1, 1]]) { const x = tmp.x + tmp.nx * l, z = tmp.z + tmp.nz * l; pos.push(x, heightAt(x, z) + dy, z); uv.push(u, s / vScale); }
      if (n) { const a = (n - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } n++;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; root.add(m); return m;
  };
  { const mat = new THREE.MeshStandardMaterial({ map: roadTex(), roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    ribbon(0, ROAD_LEN - 0.5, -ROAD_HALF - 0.15, ROAD_HALF + 0.15, 0.03, 2, 8, mat);
    const conc = new THREE.MeshStandardMaterial({ map: W.terrain.material.map, color: new THREE.Color(0.66, 0.64, 0.6), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    for (const sd of [1, -1]) {
      const a = S_TOWN - 165, b = S_TOWN + 205;
      ribbon(a, b, sd * (ROAD_HALF + 0.35), sd * (ROAD_HALF + 2.6), 0.16, 2, 3, conc).material.side = THREE.DoubleSide;
      ribbon(a, b, sd * (ROAD_HALF + 0.15), sd * (ROAD_HALF + 0.35), 0.16, 2, 3, conc).material.side = THREE.DoubleSide;
    }
    // crosswalk by the common
    { const parts = [], tmp = {}; roadAt(S_TOWN - 30, tmp); for (let l = -ROAD_HALF + 0.3; l < ROAD_HALF - 0.3; l += 0.9) { const x = tmp.x + tmp.nx * l, z = tmp.z + tmp.nz * l; parts.push(box(0.5, 0.02, 3, x, heightAt(x, z) + 0.045, z, 0, tmp.yaw, 0)); }
      const m = new THREE.Mesh(merge(parts), new THREE.MeshStandardMaterial({ color: 0xdedcd2, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -3 })); m.receiveShadow = true; root.add(m); } }
  // street lamps and the curb along Main Street; signs
  { const parts = [], tmp = {}; for (let s = S_TOWN - 150; s < S_TOWN + 200; s += 28) for (const sd of [1, -1]) { roadAt(s + (sd > 0 ? 14 : 0), tmp); const x = tmp.x + tmp.nx * sd * (ROAD_HALF + 2.1), z = tmp.z + tmp.nz * sd * (ROAD_HALF + 2.1), y = heightAt(x, z) + 0.16;
      parts.push(cyl(0.07, 0.1, 4.2, 8, x, y + 2.1, z), cyl(0.16, 0.16, 0.28, 8, x, y + 0.14, z), box(0.12, 0.08, 1.2, x - tmp.nx * sd * 0.5, y + 4.15, z - tmp.nz * sd * 0.5, 0, Math.atan2(tmp.nx, tmp.nz), 0), cyl(0.18, 0.24, 0.3, 8, x - tmp.nx * sd * 1.05, y + 4.0, z - tmp.nz * sd * 1.05)); }
    const m = new THREE.Mesh(merge(parts), std([0.12, 0.13, 0.12], 0.5, 0.4)); m.castShadow = true; root.add(m); }
  // ---------- stone walls: instanced fieldstones ----------
  { const geo = new THREE.IcosahedronGeometry(1, 0), list = [];
    for (const w of L.walls) { const c = Math.cos(w.rot), s = Math.sin(w.rot);
      for (let u = -w.len / 2; u < w.len / 2; u += 0.48 + r() * 0.14) for (let row = 0; row < 2; row++) {
        const sz = 0.3 + r() * 0.16, lx = u + (row % 2) * 0.24, lz = (r() - 0.5) * 0.22, x = w.x + lx * c, z = w.z - lx * s + lz * 0; list.push([x, heightAt(x, z) + 0.2 + row * 0.36 + sz * 0.2, z + lz, sz]); } }
    const im = new THREE.InstancedMesh(geo, std([0.5, 0.47, 0.43], 0.95), list.length), col = new THREE.Color();
    list.forEach(([x, y, z, sz], i) => { _e.set(r() * 3, r() * 3, r() * 3); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(sz * 1.3, sz * 0.75, sz); _m.compose(_p, _q, _s); im.setMatrixAt(i, _m); const v = 0.8 + r() * 0.35; im.setColorAt(i, col.setRGB(v, v * (0.97 + r() * 0.05), v * (0.92 + r() * 0.08))); });
    im.castShadow = im.receiveShadow = true; root.add(im); }
  addWoods(root, L.trees, r, hi);
  addPoles(root, L.poles, L.mailboxes);
  // ---------- undergrowth along the woods edge, and the far hills' canopy ----------
  { const tmp = {}, list = [];
    for (let k = 0; k < (hi ? 5200 : 2600); k++) { const s = 30 + r() * (ROAD_LEN - 60); if (openness(s) > 0.4 || Math.abs(s - S_TOWN) < 260) continue; roadAt(s, tmp); const sd = r() < 0.5 ? 1 : -1, l = sd * (9 + Math.pow(r(), 1.5) * 26), x = tmp.x + tmp.nx * l, z = tmp.z + tmp.nz * l; list.push([x, z, 0.5 + r() * 0.9]); }
    const im = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), std([0.2, 0.28, 0.12], 0.95), list.length), col = new THREE.Color();
    list.forEach(([x, z, sc], i) => { _e.set(0, r() * 6, 0); _q.setFromEuler(_e); _p.set(x, heightAt(x, z) + sc * 0.3, z); _s.set(sc * 1.4, sc * 0.8, sc * 1.2); _m.compose(_p, _q, _s); im.setMatrixAt(i, _m); im.setColorAt(i, col.setRGB(0.8 + r() * 0.4, 0.85 + r() * 0.3, 0.7 + r() * 0.4)); });
    im.castShadow = true; im.receiveShadow = true; root.add(im); }
  { const list = [];
    for (let k = 0; k < (hi ? 9000 : 4500); k++) {
      const x = -2500 + r() * 5000, z = roadZ0(x) + (r() < 0.5 ? -1 : 1) * (125 + r() * 900), d = Math.abs(z - roadZ0(x));
      if (Math.abs(x) < 1680 && Math.abs(z) < 325 && d < 125) continue;
      if (openness(sAtX(x)) > 0.5 && d < 200) continue;
      if (Math.hypot(x - TOWN.x, z - TOWN.z) < 200 || Math.hypot((x - FIELD.x) * 0.7, z - FIELD.z) < 130) continue;
      list.push([x, z, 4 + r() * 3.5]);
    }
    const im = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), std([0.18, 0.25, 0.12], 0.95), list.length), col = new THREE.Color();
    list.forEach(([x, z, sc], i) => { _e.set(0, r() * 6, 0); _q.setFromEuler(_e); _p.set(x, heightAt(x, z) + sc * 1.1, z); _s.set(sc, sc * (0.9 + r() * 0.5), sc); _m.compose(_p, _q, _s); im.setMatrixAt(i, _m); const pine = r() < 0.3; im.setColorAt(i, pine ? col.setRGB(0.7, 0.8, 0.75) : col.setRGB(0.85 + r() * 0.35, 0.9 + r() * 0.25, 0.75 + r() * 0.3)); });
    im.receiveShadow = true; root.add(im); }
  // ---------- verge grass: long uncut grass along the shoulders and round the field ----------
  { const tex = TX.makeGrassTex(), mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, color: new THREE.Color(0.9, 0.95, 0.66) });
    const card = merge([new THREE.PlaneGeometry(1.3, 0.8).translate(0, 0.4, 0), new THREE.PlaneGeometry(1.3, 0.8).translate(0, 0.4, 0).rotateY(Math.PI / 2)]);
    const N = hi ? 16000 : 7000, im = new THREE.InstancedMesh(card, mat, N), col = new THREE.Color(), tmp = {}; let n = 0;
    for (let k = 0; k < N * 2 && n < N; k++) {
      let x, z;
      if (k % 5 === 4) { const a = r() * 6.28, d = 95 + r() * 30; x = FIELD.x + Math.cos(a) * d / 0.7; z = FIELD.z + Math.sin(a) * d; }
      else { const s = 10 + r() * (ROAD_LEN - 20); roadAt(s, tmp); const l = (r() < 0.5 ? -1 : 1) * (ROAD_HALF + 1.6 + Math.pow(r(), 1.3) * 10); x = tmp.x + tmp.nx * l; z = tmp.z + tmp.nz * l; if (townMask(x, z) > 0.3) continue; }
      _e.set(0, r() * 6.28, 0); _q.setFromEuler(_e); _p.set(x, heightAt(x, z) - 0.05, z); const sc = 0.6 + r() * 0.6; _s.set(sc, sc * (0.7 + r() * 0.7), sc); _m.compose(_p, _q, _s); im.setMatrixAt(n, _m);
      im.setColorAt(n, col.setRGB(0.8 + r() * 0.2, 0.85 + r() * 0.15, 0.55 + r() * 0.35)); n++;
    }
    im.count = n; im.receiveShadow = true; root.add(im); }

  // ---------- Ashland: the church ----------
  const white = new THREE.MeshStandardMaterial({ map: clapTex(), roughness: 0.8 }), trimM = std([0.95, 0.95, 0.92], 0.6), slate = std([0.17, 0.17, 0.19], 0.8), dark = std([0.06, 0.07, 0.09], 0.12, 0.3), green = std([0.1, 0.2, 0.14], 0.7);
  const group = (x, z, rot) => { const g = new THREE.Group(); g.position.set(x, heightAt(x, z), z); g.rotation.y = rot; root.add(g); return g; };
  const mesh = (g, geo, mat, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; g.add(m); return m; };
  { const c = L.church, g = group(c.x, c.z, c.rot);
    const nave = box(11, 8, 21, 0, 4, -2); nave.attributes.uv.array.forEach((v, i, a) => { a[i] = v * (i % 2 ? 3 : 4); }); mesh(g, nave, white);
    // roof
    const sh = new THREE.Shape(); sh.moveTo(-6.2, 0); sh.lineTo(6.2, 0); sh.lineTo(0, 4.6); sh.lineTo(-6.2, 0);
    mesh(g, place(new THREE.ExtrudeGeometry(sh, { depth: 22, bevelEnabled: false }), 0, 8, -13.2), slate);
    const gb = new THREE.Shape(); gb.moveTo(-5.5, 0); gb.lineTo(5.5, 0); gb.lineTo(0, 4.1); gb.lineTo(-5.5, 0);
    mesh(g, place(new THREE.ExtrudeGeometry(gb, { depth: 0.2, bevelEnabled: false }), 0, 8, 8.4), white);
    // tall windows with arched heads and black shutters down both sides
    for (const sx of [-1, 1]) for (let k = 0; k < 5; k++) { const zz = -10 + k * 4;
      mesh(g, box(0.08, 3.4, 1.3, sx * 5.52, 4.1, zz), dark, false); mesh(g, place(new THREE.CylinderGeometry(0.65, 0.65, 0.08, 16, 1, false, 0, Math.PI), sx * 5.52, 5.8, zz, 0, 0, Math.PI / 2), dark, false);
      for (const sz of [-1, 1]) mesh(g, box(0.06, 3.6, 0.6, sx * 5.58, 4.2, zz + sz * 1.0), green, false);
      mesh(g, box(0.12, 0.12, 1.6, sx * 5.56, 2.3, zz), trimM, false); }
    // the tower: square base, belfry with louvres, a clock, the lantern, the spire
    mesh(g, box(4.6, 15, 4.6, 0, 7.5, 10.2), white);
    mesh(g, box(1.8, 3, 0.1, 0, 1.5, 12.55), std([0.35, 0.12, 0.1], 0.6), false);   // red doors
    mesh(g, box(2.6, 0.25, 1.4, 0, 0.12, 13.2), std([0.6, 0.58, 0.55], 0.9));
    mesh(g, box(1.2, 2.4, 0.1, 0, 7.2, 12.55), dark, false); mesh(g, place(new THREE.CylinderGeometry(0.6, 0.6, 0.1, 16, 1, false, 0, Math.PI), 0, 8.4, 12.55, Math.PI / 2, 0, Math.PI / 2), dark, false);
    { const ct = canvasTex(128, 128, (q, w) => { q.fillStyle = '#f4f2ea'; q.beginPath(); q.arc(64, 64, 62, 0, 7); q.fill(); q.strokeStyle = '#111'; q.lineWidth = 3; q.stroke(); for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; q.fillStyle = '#111'; q.fillRect(64 + Math.sin(a) * 50 - 2, 64 - Math.cos(a) * 50 - 5, 4, 10); } q.lineWidth = 5; q.beginPath(); q.moveTo(64, 64); q.lineTo(64 + Math.sin(0.5) * 30, 64 - Math.cos(0.5) * 30); q.moveTo(64, 64); q.lineTo(64 + Math.sin(5.3) * 44, 64 - Math.cos(5.3) * 44); q.stroke(); }, false);
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2, cg = new THREE.CircleGeometry(1.0, 24); cg.rotateY(a); cg.translate(Math.sin(a) * 2.32, 13.2, 10.2 + Math.cos(a) * 2.32); mesh(g, cg, new THREE.MeshStandardMaterial({ map: ct, roughness: 0.6 }), false); } }   // 10 past 8: when it stopped
    mesh(g, box(5.0, 0.4, 5.0, 0, 15.2, 10.2), trimM);
    mesh(g, box(3.8, 4, 3.8, 0, 17.4, 10.2), white);
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; for (let v = 0; v < 6; v++) mesh(g, place(new THREE.BoxGeometry(1.8, 0.08, 0.3), Math.sin(a) * 1.92, 16.2 + v * 0.45, 10.2 + Math.cos(a) * 1.92, -0.5, a, 0), dark, false); }
    mesh(g, box(4.2, 0.35, 4.2, 0, 19.55, 10.2), trimM);
    mesh(g, cyl(1.5, 1.6, 2.6, 8, 0, 21, 10.2), white);
    mesh(g, cyl(0.02, 1.55, 9.5, 8, 0, 27, 10.2), white);
    mesh(g, cyl(0.03, 0.03, 1.4, 4, 0, 32.4, 10.2), std([0.7, 0.6, 0.3], 0.3, 0.9), false); }
  // ---------- the common: bandstand, flag, memorial ----------
  { const b = L.bandstand, g = group(b.x, b.z, 0.3);
    mesh(g, cyl(3.4, 3.5, 1.0, 8, 0, 0.5, 0), trimM); mesh(g, cyl(3.5, 3.5, 0.08, 8, 0, 1.04, 0), std([0.55, 0.45, 0.35], 0.8));
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + Math.PI / 8; mesh(g, cyl(0.1, 0.1, 2.8, 6, Math.cos(a) * 3.1, 2.4, Math.sin(a) * 3.1), trimM); }
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2, a2 = a + Math.PI / 4; if (k === 2) continue; mesh(g, place(new THREE.BoxGeometry(2.4, 0.08, 0.06), Math.cos(a + Math.PI / 8) * 3.0, 1.95, Math.sin(a + Math.PI / 8) * 3.0, 0, -(a + Math.PI / 8) - Math.PI / 2, 0), trimM, false); }
    mesh(g, cyl(0.1, 4.1, 2.2, 8, 0, 4.9, 0), std([0.25, 0.32, 0.3], 0.7)); mesh(g, cyl(0.05, 0.12, 0.8, 6, 0, 6.2, 0), trimM); }
  { const f = L.flag, g = group(f.x, f.z, 0);
    mesh(g, cyl(0.05, 0.12, 14, 10, 0, 7, 0), std([0.85, 0.85, 0.85], 0.3, 0.8)); mesh(g, new THREE.SphereGeometry(0.16, 10, 8).translate(0, 14.1, 0), std([0.75, 0.6, 0.25], 0.3, 0.9));
    const ft = canvasTex(256, 136, (q, w, h) => { for (let k = 0; k < 13; k++) { q.fillStyle = k % 2 ? '#f2f0ea' : '#b22234'; q.fillRect(0, k * h / 13, w, h / 13 + 1); } q.fillStyle = '#3c3b6e'; q.fillRect(0, 0, w * 0.4, h * 7 / 13); q.fillStyle = '#f2f0ea'; for (let j = 0; j < 9; j++) for (let i = 0; i < (j % 2 ? 5 : 6); i++) q.fillRect(8 + i * 17 + (j % 2) * 8, 5 + j * 7.8, 3, 3); }, false);
    const fg = new THREE.PlaneGeometry(2.6, 1.4, 16, 6).translate(1.3, 13.2, 0);
    W._flag = mesh(g, fg, new THREE.MeshStandardMaterial({ map: ft, side: THREE.DoubleSide, roughness: 0.8 }), true); W._flagBase = Float32Array.from(fg.attributes.position.array); }
  { const m = L.memorial, g = group(m.x, m.z, m.rot); const gran = std([0.55, 0.54, 0.52], 0.7);
    mesh(g, box(2.2, 0.4, 2.2, 0, 0.2, 0), gran); mesh(g, box(1.4, 0.6, 1.4, 0, 0.7, 0), gran); mesh(g, cyl(0.25, 0.55, 5.2, 4, 0, 3.6, 0, 0, Math.PI / 4, 0), gran); mesh(g, cyl(0, 0.36, 0.6, 4, 0, 6.5, 0, 0, Math.PI / 4, 0), gran);
    const pl = signTex([['1861 – 1865', 34, 40], ['1917 · 1941 · 1950', 30, 88]], '#5a4a32', '#e8d8a8', 256, 128); mesh(g, place(new THREE.PlaneGeometry(1.2, 0.55), 0, 0.72, 0.71), new THREE.MeshStandardMaterial({ map: pl, roughness: 0.4, metalness: 0.5 }), false);
    // benches round the common
    const bm = std([0.3, 0.22, 0.15], 0.85), parts = []; for (const [lx, lz, ry] of [[-6, 4, 0.2], [-9, -3, 1.4], [5, 6, -0.3]]) { parts.push(box(1.8, 0.06, 0.45, lx, 0.45, lz, 0, ry, 0), box(1.8, 0.4, 0.05, lx - Math.sin(ry) * 0.22, 0.75, lz - Math.cos(ry) * 0.22, 0, ry, 0), box(0.06, 0.45, 0.4, lx + Math.cos(ry) * 0.8, 0.22, lz - Math.sin(ry) * 0.8, 0, ry, 0), box(0.06, 0.45, 0.4, lx - Math.cos(ry) * 0.8, 0.22, lz + Math.sin(ry) * 0.8, 0, ry, 0)); }
    mesh(g, merge(parts), bm); }
  // ---------- the depot and the crossing ----------
  { const st = L.station, g = group(st.x, st.z, st.rot), bt = brickTex(); bt.repeat.set(3, 1.4);
    mesh(g, box(7, 4.2, 18, 0, 2.1, 0), new THREE.MeshStandardMaterial({ map: bt, roughness: 0.9 }));
    for (const sx of [-1, 1]) for (let k = -3; k <= 3; k++) { mesh(g, box(0.06, 2.0, 1.0, sx * 3.52, 2.1, k * 2.4), dark, false); mesh(g, box(0.1, 0.18, 1.3, sx * 3.54, 3.2, k * 2.4), std([0.75, 0.7, 0.6], 0.8), false); }
    const roof = new THREE.ConeGeometry(1, 1, 4, 1); roof.rotateY(Math.PI / 4); roof.scale(7.6, 2.6, 15.6); mesh(g, place(roof, 0, 5.5, 0), std([0.32, 0.18, 0.14], 0.8));
    for (const sx of [-1, 1]) for (let k = -3; k <= 3; k++) mesh(g, place(new THREE.BoxGeometry(0.12, 0.12, 1.1), sx * 3.9, 3.9, k * 2.6, 0, 0, sx * 0.8), std([0.3, 0.2, 0.15], 0.8), false);
    mesh(g, box(4, 0.35, 30, 6.3, 0.55, 0), std([0.6, 0.58, 0.55], 0.9));
    mesh(g, place(new THREE.PlaneGeometry(3.6, 0.7), 0, 4.6, 9.02), new THREE.MeshStandardMaterial({ map: signTex([['ASHLAND', 92, 64]], '#f0ead8', '#2a2a2a'), roughness: 0.6 }), false);
    mesh(g, place(new THREE.PlaneGeometry(3.6, 0.7), 0, 4.6, -9.02, 0, Math.PI, 0), new THREE.MeshStandardMaterial({ map: signTex([['ASHLAND', 92, 64]], '#f0ead8', '#2a2a2a'), roughness: 0.6 }), false); }
  { const tmp = {}; roadAt(L.rail, tmp); const ties = [], rails = [], bal = [], ry = Math.atan2(tmp.nx, tmp.nz);
    for (let l = -330; l < 330; l += 0.62) { const x = tmp.x + tmp.nx * l, z = tmp.z + tmp.nz * l, y = Math.max(heightAt(x, z), Math.abs(l) < 6 ? -1e9 : -1e9); ties.push(box(2.6, 0.16, 0.24, x, heightAt(x, z) + 0.12, z, 0, ry + Math.PI / 2, 0)); }
    for (let l = -330; l < 330; l += 3) { const x = tmp.x + tmp.nx * (l + 1.5), z = tmp.z + tmp.nz * (l + 1.5), y = heightAt(x, z); for (const g of [-0.72, 0.72]) rails.push(box(0.08, 0.16, 3.02, x + Math.cos(ry) * g, y + 0.28, z - Math.sin(ry) * g, 0, ry, 0)); bal.push(box(3.6, 0.2, 3.05, x, y + 0.02, z, 0, ry, 0)); }
    const tm = new THREE.Mesh(merge(ties), std([0.28, 0.22, 0.17], 0.95)); tm.receiveShadow = tm.castShadow = true; root.add(tm);
    const rm = new THREE.Mesh(merge(rails), std([0.42, 0.36, 0.32], 0.35, 0.8)); rm.castShadow = true; root.add(rm);
    const bm = new THREE.Mesh(merge(bal), std([0.45, 0.42, 0.38], 0.95)); bm.receiveShadow = true; root.add(bm);
    // crossbucks on both sides
    const xb = canvasTex(512, 64, (q, w, h) => { q.fillStyle = '#f4f2ea'; q.fillRect(0, 0, w, h); q.strokeStyle = '#111'; q.lineWidth = 4; q.strokeRect(3, 3, w - 6, h - 6); q.fillStyle = '#111'; q.font = 'bold 40px Arial'; q.textAlign = 'center'; q.textBaseline = 'middle'; q.fillText('RAILROAD', w / 2, h / 2 + 2); }, false);
    const xm = new THREE.MeshStandardMaterial({ map: xb, roughness: 0.6, side: THREE.DoubleSide });
    for (const sd of [1, -1]) { roadAt(L.rail - sd * 5, tmp); const x = tmp.x + tmp.nx * sd * 5.6, z = tmp.z + tmp.nz * sd * 5.6, y = heightAt(x, z), g = group(x, z, tmp.yaw + (sd > 0 ? 0 : Math.PI));
      mesh(g, cyl(0.06, 0.06, 3.4, 8, 0, 1.7, 0), std([0.85, 0.85, 0.85], 0.4, 0.5));
      for (const a of [0.785, -0.785]) mesh(g, place(new THREE.PlaneGeometry(1.5, 0.22), 0, 3.0, 0.07, 0, 0, a), xm, false);
      mesh(g, box(0.5, 0.5, 0.2, 0, 2.3, 0.1), std([0.12, 0.12, 0.12], 0.5));
      for (const lx of [-0.13, 0.13]) mesh(g, new THREE.SphereGeometry(0.09, 10, 8).translate(lx, 2.3, 0.2), std([0.5, 0.05, 0.03], 0.3, 0, { emissive: 0x200000 }), false);
      mesh(g, place(new THREE.BoxGeometry(0.12, 0.12, 5.5), 0.3, 1.1, 2.75 * 0 + 0, 1.45, 0, 0), std([0.92, 0.9, 0.86], 0.6)); }   // gate arm, up
  }
  // ---------- the gas station ----------
  { const gs = L.gas, g = group(gs.x, gs.z, gs.yaw);
    mesh(g, box(9, 0.9, 14, 0, 5.2, 0), std([0.94, 0.94, 0.92], 0.5)); mesh(g, box(9.04, 0.3, 14.04, 0, 5.3, 0), std([0.6, 0.12, 0.1], 0.5));
    for (const lx of [-3, 3]) for (const lz of [-5, 5]) mesh(g, box(0.4, 4.8, 0.4, lx, 2.4, lz), std([0.85, 0.85, 0.83], 0.5));
    for (const lz of [-3.2, 3.2]) { mesh(g, box(1.2, 0.2, 2.4, 0, 0.1, lz), std([0.6, 0.58, 0.55], 0.9)); mesh(g, box(0.7, 1.6, 1.0, 0, 1.0, lz), std([0.85, 0.84, 0.8], 0.5)); for (const sx of [-1, 1]) mesh(g, box(0.02, 0.35, 0.5, sx * 0.36, 1.35, lz), dark, false); }
    mesh(g, place(new THREE.PlaneGeometry(13.9, 0.85), -4.53, 5.2, 0, 0, -Math.PI / 2, 0), new THREE.MeshStandardMaterial({ map: signTex([['GAS · DIESEL · COLD BEER', 60, 64]], '#f2f0ea', '#8a1a14', 1024, 128), roughness: 0.6 }), false);
    const sg = group(gs.store.x, gs.store.z, gs.yaw);
    mesh(sg, box(8, 4, 10, 0, 2, 0), std([0.8, 0.76, 0.68], 0.8)); mesh(sg, box(8.6, 0.5, 10.6, 0, 4.2, 0), std([0.6, 0.12, 0.1], 0.6));
    mesh(sg, box(0.08, 2.2, 7, 4.02, 1.6, 0), std([0.08, 0.1, 0.12], 0.1, 0.4), false);   // the window, road side
    for (let k = -3; k <= 3; k++) mesh(sg, box(0.1, 2.3, 0.08, 4.04, 1.6, k * 1.1), std([0.8, 0.8, 0.8], 0.4, 0.6), false);
    // the price sign at the road
    { const tmp = {}; roadAt(S_TOWN + 216, tmp); const x = tmp.x - tmp.nx * 7.2, z = tmp.z - tmp.nz * 7.2, pg = group(x, z, tmp.yaw - Math.PI / 2);
      mesh(pg, cyl(0.12, 0.12, 6, 8, 0, 3, 0), std([0.6, 0.6, 0.6], 0.4, 0.6));
      const pt = canvasTex(256, 256, (q, w, h) => { q.fillStyle = '#8a1a14'; q.fillRect(0, 0, w, h); q.fillStyle = '#f2f0ea'; q.fillRect(10, 74, w - 20, h - 84); q.font = 'bold 56px Arial'; q.textAlign = 'center'; q.fillText('GAS', w / 2, 58); q.fillStyle = '#111'; q.font = 'bold 34px Arial'; q.textAlign = 'left'; q.fillText('REG', 22, 118); q.fillText('PLUS', 22, 168); q.fillText('DSL', 22, 218); q.textAlign = 'right'; q.font = 'bold 40px "Courier New", monospace'; q.fillText('3.89', w - 20, 120); q.fillText('4.09', w - 20, 170); q.fillText('4.29', w - 20, 220); }, false);
      const pm = new THREE.MeshStandardMaterial({ map: pt, roughness: 0.6 }); mesh(pg, place(new THREE.PlaneGeometry(2.2, 2.2), 0, 6.2, 0.07), pm, false); mesh(pg, place(new THREE.PlaneGeometry(2.2, 2.2), 0, 6.2, -0.07, 0, Math.PI, 0), pm, false); mesh(pg, box(2.3, 2.3, 0.12, 0, 6.2, 0), std([0.2, 0.2, 0.2], 0.6)); }
  }
  // ---------- dead cars on the shoulders and on Main Street: the pulse stopped them; doors left open ----------
  { const kinds = ['sedan', 'suv', 'wagon', 'hatch', 'pickup', 'sedan', 'hatch'];
    W.cars = L.cars.map(([x, z, rot], i) => { const paintHex = PAINT[(i * 3 + 1) % PAINT.length], car = buildCar(kinds[i % kinds.length], paintHex, i + 40); car.paintHex = paintHex; car.root.position.set(x, heightAt(x, z), z); car.root.rotation.y = rot; root.add(car.root);
      const door = car.parts.find((p) => p.kind === 'door' && p.home.x > 0 && p.home.z > -0.4);   // the driver's (car-left) door, swung open on its front hinge
      if (door && i % 3 !== 2) { const hz = door.home.z + 0.55, a = 0.9 + (i % 4) * 0.12; door.m.rotation.y = a; door.m.position.set(door.home.x + Math.sin(a) * 0.55, door.home.y, hz - Math.cos(a) * 0.55); door.home.copy(door.m.position); door.q0.copy(door.m.quaternion); }
      return car; }); }
  // ---------- the convoy ----------
  W.rideCars = L.rides.map((c, i) => {
    const car = buildCar(c.kind, c.paint, 300 + i); car.paintHex = c.paint; root.add(car.root);
    // windows down / glass you can see through: who is in there, who is shooting
    car.glass.transparent = true; car.glass.opacity = 0.28; car.glass.depthWrite = false;
    const dist = new Float32Array(Math.round(T_CAR / DTC) + 1); for (let k = 1; k < dist.length; k++) dist[k] = dist[k - 1] + c.track[k * 7 + 6] * DTC;
    car.wheels = car.parts.filter((p) => p.kind === 'wheel'); car.dist = dist; car.c = c; car.pose = {};
    if (i === 6) planBlast(car, 6006);   // their SUV comes apart with the tanker
    // on your pickup: a flag tied to the bed rail, the Cape's (a lighthouse on blue); on theirs, a lone star
    if (c.kind === 'pickup') {
      const ft = c.side ? canvasTex(128, 80, (q, w, h) => { q.fillStyle = '#002868'; q.fillRect(0, 0, w * 0.34, h); q.fillStyle = '#f2f0ea'; q.fillRect(w * 0.34, 0, w, h / 2); q.fillStyle = '#bf0a30'; q.fillRect(w * 0.34, h / 2, w, h / 2); q.fillStyle = '#f2f0ea'; q.beginPath(); for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5 - Math.PI / 2, rr = k % 2 ? 6 : 14; q.lineTo(w * 0.17 + Math.cos(a) * rr, h / 2 + Math.sin(a) * rr); } q.fill(); }, false)
        : canvasTex(128, 80, (q, w, h) => { q.fillStyle = '#1d3f7a'; q.fillRect(0, 0, w, h); q.fillStyle = '#f2f0ea'; q.fillRect(58, 22, 12, 40); q.beginPath(); q.moveTo(54, 22); q.lineTo(74, 22); q.lineTo(64, 12); q.fill(); q.fillStyle = '#e8c040'; q.fillRect(58, 24, 12, 6); q.fillStyle = '#c8b480'; q.fillRect(0, 62, w, 18); }, false);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.6, 5), std([0.3, 0.3, 0.3], 0.5)); pole.position.set(-0.85, 1.9, -car.V.L / 2 + 0.12); car.root.add(pole);
      const fg = new THREE.PlaneGeometry(0.9, 0.56, 10, 3).translate(-0.45, 0, 0); const fm = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ map: ft, side: THREE.DoubleSide, roughness: 0.8 })); fm.position.set(-0.85, 2.4, -car.V.L / 2 + 0.12); car.root.add(fm); car.flag = fm; car.flagBase = Float32Array.from(fg.attributes.position.array);
      // the technical's MG on a post in the bed
      if (c.side) { const mg = new THREE.Group(); mg.position.set(0, 1.55, -1.2); const gm = std([0.08, 0.08, 0.08], 0.5, 0.6); mg.add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.5, 6), gm)); const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 1.3), gm); b.position.set(0, 0.3, -0.2); mg.add(b); car.root.add(mg); }
    }
    return car;
  });
  // ---------- the fuel tanker ----------
  { const T = L.tanker, g = group(T.x, T.z, T.rot), tankM = std([0.82, 0.83, 0.84], 0.25, 0.75), cabM = std([0.12, 0.25, 0.45], 0.4, 0.4), blk = std([0.08, 0.08, 0.08], 0.7), mats = [tankM, cabM, blk];
    const tank = new THREE.CylinderGeometry(1.15, 1.15, 11, 20); tank.rotateX(Math.PI / 2); tank.scale(1, 0.82, 1); mesh(g, place(tank, 0, 2.15, -1.6), tankM);
    for (const zz of [-7.1, 3.9]) mesh(g, place(new THREE.SphereGeometry(1.15, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0, 2.15, zz, zz < 0 ? -Math.PI / 2 : Math.PI / 2, 0, 0, 1, 1, 0.82), tankM);
    mesh(g, box(1.1, 0.25, 18, 0, 0.9, -0.8), blk);
    mesh(g, box(2.4, 2.0, 2.2, 0, 2.1, 5.6), cabM); mesh(g, box(2.3, 1.2, 1.6, 0, 1.5, 7.3), cabM); mesh(g, box(2.2, 0.9, 0.05, 0, 2.55, 6.71), dark, false);
    mesh(g, box(0.5, 0.06, 0.5, 0, 3.4, 5.4), blk); mesh(g, cyl(0.1, 0.1, 2.2, 8, 1.0, 3.4, 4.6), std([0.7, 0.7, 0.7], 0.3, 0.9));
    for (const zz of [-6.2, -5.0, 4.0, 5.8, 7.4]) for (const sx of [-1, 1]) mesh(g, place(new THREE.CylinderGeometry(0.5, 0.5, 0.38, 16), sx * 1.05, 0.5, zz, 0, 0, Math.PI / 2), blk);
    const plac = canvasTex(128, 128, (q, w, h) => { q.fillStyle = '#d83020'; q.save(); q.translate(64, 64); q.rotate(Math.PI / 4); q.fillRect(-44, -44, 88, 88); q.restore(); q.fillStyle = '#fff'; q.fillRect(28, 52, 72, 26); q.fillStyle = '#111'; q.font = 'bold 24px Arial'; q.textAlign = 'center'; q.fillText('1203', 64, 73); }, false);
    for (const sx of [-1, 1]) mesh(g, place(new THREE.PlaneGeometry(0.8, 0.8), sx * 1.17, 2.0, -6.4, 0, sx * Math.PI / 2, 0), new THREE.MeshStandardMaterial({ map: plac, roughness: 0.6, transparent: true, alphaTest: 0.1 }), false);
    mesh(g, place(new THREE.PlaneGeometry(6, 0.5), 1.17 * 0.98, 2.4, -1.6, 0, Math.PI / 2, 0), new THREE.MeshStandardMaterial({ map: signTex([['FLAMMABLE', 80, 64]], '#d83020', '#ffffff'), roughness: 0.5 }), false);
    W.tanker = { g, mats, t: T.t, burnt: false };
  }
  // ---------- the hayfield: round bales ----------
  { const side = new THREE.MeshStandardMaterial({ map: baleTex(), roughness: 1 }), end = new THREE.MeshStandardMaterial({ map: baleEndTex(), roughness: 1 });
    for (const b of L.bales) { const g = group(b.x, b.z, b.rot); const m = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 1.25, 22, 1), [side, end, end]); m.rotation.z = Math.PI / 2; m.position.y = 0.82; m.castShadow = m.receiveShadow = true; g.add(m); } }
  // ---------- farmhouse yards: barns by some of them ----------
  { const red = std([0.5, 0.13, 0.1], 0.85), parts = [], roofs = [];
    for (const { x, z, rot } of L.barns) { const y = heightAt(x, z);
      parts.push(box(8, 5, 12, x, y + 2.5, z, 0, rot, 0)); const sh = new THREE.Shape(); sh.moveTo(-4.4, 0); sh.lineTo(-2.8, 2.1); sh.lineTo(0, 3.2); sh.lineTo(2.8, 2.1); sh.lineTo(4.4, 0); sh.lineTo(-4.4, 0);
      roofs.push(place(new THREE.ExtrudeGeometry(sh, { depth: 12.6, bevelEnabled: false }).translate(0, 0, -6.3), x, y + 5, z, 0, rot, 0)); }
    if (parts.length) { const m = new THREE.Mesh(merge(parts), red); m.castShadow = m.receiveShadow = true; root.add(m); const rm = new THREE.Mesh(merge(roofs), std([0.3, 0.3, 0.32], 0.7, 0.3)); rm.castShadow = true; root.add(rm); } }

  // ---------- the cloud over Boston ----------
  buildCloud(W);
  // ---------- the flash: a light from the east for a few seconds ----------
  W.flashLight = new THREE.DirectionalLight(new THREE.Color(1, 0.96, 0.9), 0); W.flashLight.position.set(-1, 0.25, -0.08); W.scene.add(W.flashLight); W.flashLight.target.position.set(0, 0, 0); W.scene.add(W.flashLight.target);
  const prevActive = W.setActive.bind(W); W.setActive = (on) => { prevActive(on); W.flashLight.visible = on; W.cloud.visible = on; };
  W.bombUpdate = (tau, cam) => updateBomb(W, tau, cam);
}

// ---------------------------------------------------------------- the mushroom cloud: an impostor at the right angle
// It is 35 km off, so it doesn't move against the horizon as you drive: it rides along with the camera, 3.2 km out in
// the direction of Boston, scaled to the angle the real thing would fill. Several hundred soft puffs, each placed by a
// function of the cloud's age in the vertex shader: the fireball, the stem, the rolling cap, the ring of the Wilson
// cloud, the dust skirt at its foot. Backlit by the morning sun behind it.
function buildCloud(W) {
  const r = mulberry32(1945), inst = [];
  const P = (kind, a, b, c, rad, seed = r()) => inst.push([kind, a, b, c, rad, seed]);
  for (let k = 0; k < 16; k++) P(0, r() - 0.5, r() - 0.5, r() - 0.5, 0.45 + r() * 0.4);                         // fireball
  for (let k = 0; k < 90; k++) P(1, r(), r() * 6.283, r(), 0.9 + r() * 0.6);                                   // stem: (height frac, angle, radial)
  for (let k = 0; k < 170; k++) P(2, r() * 6.283, r() * 6.283, r(), 1.25 + r() * 0.8);                           // cap torus: (major angle, minor angle, depth)
  for (let k = 0; k < 55; k++) P(3, r() * 6.283, r(), r(), 1.3 + r() * 0.7);                                     // cap dome
  for (let k = 0; k < 24; k++) P(4, r() * 6.283, r(), 0, 0.35 + r() * 0.25);                                     // condensation ring
  for (let k = 0; k < 80; k++) P(5, r() * 6.283, r(), r(), 0.9 + r() * 0.8);                                     // base surge
  const n = inst.length, g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3)); g.setIndex([0, 1, 2, 0, 2, 3]);
  const a0 = new Float32Array(n * 4), a1 = new Float32Array(n * 2);
  inst.forEach(([k, a, b, c, rad, sd], i) => { a0.set([a, b, c, rad], i * 4); a1.set([k, sd], i * 2); });
  g.setAttribute('aP', new THREE.InstancedBufferAttribute(a0, 4)); g.setAttribute('aK', new THREE.InstancedBufferAttribute(a1, 2)); g.instanceCount = n;
  const U = { uAge: { value: -1 }, uSun: { value: SUN_DIR.clone() }, uKm: { value: 3200 / 26 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, fog: false,
    vertexShader: /* glsl */`
      attribute vec4 aP; attribute vec2 aK; uniform float uAge, uKm; varying vec2 vUv; varying float vK, vSd, vGlow, vA, vH;
      const float TAU = 6.2831853;
      void main(){
        float age = max(uAge, 0.0), k = aK.x, sd = aK.y;
        // heights in km: the cap climbs fast, then slows toward 11 km
        float H = 0.6 + 11.8 * (1.0 - exp(-age / 48.0)), capR = 1.2 + 3.3 * (1.0 - exp(-age / 45.0)), tube = 0.6 + 1.6 * (1.0 - exp(-age / 40.0));
        vec3 c; float rad = aP.w; float a = 1.0, glow = 0.0;
        float roll = age * 0.05;   // the torus turning over on itself
        if (k < 0.5) { float fr = 0.8 + 1.7 * min(age / 5.0, 1.0); c = vec3(aP.x, aP.y * 0.8, aP.z) * fr * 1.1 + vec3(0.0, fr * 0.7 + min(age, 12.0) * 0.16, 0.0); rad *= fr * 1.5; a = 1.0 - smoothstep(6.0, 16.0, age); glow = 1.0; }
        else if (k < 1.5) { float hf = aP.x; float h = hf * (H - tube * 0.6); float w = mix(1.3, 0.6, smoothstep(0.0, 0.5, hf)) * mix(1.0, 1.4, smoothstep(0.7, 1.0, hf)) * (0.35 + 0.65 * min(age / 30.0, 1.0));
          c = vec3(cos(aP.y) * w * aP.z, h, sin(aP.y) * w * aP.z); a = smoothstep(4.0, 12.0, age) * (0.75 + 0.25 * hf); rad *= 0.5 + 0.6 * w; glow = 1.0 - hf; }
        else if (k < 2.5) { float ma = aP.x + roll * 0.1, mi = aP.y + roll; float rr = capR + cos(mi) * tube * (0.6 + 0.4 * aP.z);
          c = vec3(cos(ma) * rr, H + sin(mi) * tube * 0.75, sin(ma) * rr); rad *= tube * 0.85; a = smoothstep(3.0, 9.0, age); glow = 0.6 + 0.4 * (1.0 - aP.z); }
        else if (k < 3.5) { float ang = aP.x, rr = sqrt(aP.y) * capR * 0.95; c = vec3(cos(ang) * rr, H + tube * (0.55 + 0.35 * (1.0 - aP.y)), sin(ang) * rr); rad *= tube; a = smoothstep(5.0, 14.0, age); glow = 0.3; }
        else if (k < 4.5) { float ang = aP.x, rr = 1.4 + age * 0.12; c = vec3(cos(ang) * rr, H * 0.42, sin(ang) * rr); rad *= 1.2 + age * 0.02; a = smoothstep(2.0, 4.0, age) * (1.0 - smoothstep(8.0, 20.0, age)) * 0.8; }
        else { float ang = aP.x, rr = 0.6 + (aP.y * 0.6 + 0.4) * (1.0 + 5.0 * (1.0 - exp(-age / 30.0))); c = vec3(cos(ang) * rr, 0.25 + aP.z * 0.6, sin(ang) * rr); rad *= 0.8 + 1.2 * min(age / 40.0, 1.0); a = smoothstep(3.0, 14.0, age) * 0.9; }
        vec4 mv = modelViewMatrix * vec4(c * uKm, 1.0);
        vec2 q = position.xy; mv.xy += q * rad * uKm;
        vUv = q; vK = k; vSd = sd; vGlow = glow; vA = a * step(0.0, uAge); vH = c.y / max(H + tube, 1.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uAge; uniform vec3 uSun; varying vec2 vUv; varying float vK, vSd, vGlow, vA, vH;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){
        float r = length(vUv); if (r > 1.0) discard;
        vec2 p = vUv * 2.2 + vSd * 17.0; float nn = n(p) * 0.5 + n(p * 2.1) * 0.3 + n(p * 4.3) * 0.2;
        float a = smoothstep(1.0, 0.45, r + (nn - 0.5) * 0.6) * vA; if (a < 0.01) discard;
        // a sphere-ish puff normal; the sun is behind the cloud from where you stand: dark body, bright rims, warm top
        vec3 N = normalize(vec3(vUv, sqrt(max(0.0, 1.0 - r*r)) + 0.2));
        float top = clamp(N.y * 0.5 + 0.5, 0.0, 1.0);
        float age = max(uAge, 0.0);
        // the sun is low behind it: you see the shadowed side, dark against the dawn, with a burning edge
        vec3 body = vK > 4.5 ? vec3(0.34, 0.29, 0.24) : vK > 1.5 ? vec3(0.25, 0.22, 0.21) : vec3(0.3, 0.26, 0.24);
        if (vK > 3.5 && vK < 4.5) body = vec3(0.85, 0.85, 0.88);
        vec3 col = body * (0.55 + 0.35 * top + 0.35 * nn);
        col += vec3(1.0, 0.62, 0.38) * pow(r, 2.4) * 0.75 * smoothstep(0.1, 0.9, vH + 0.25) * (0.6 + 0.4 * top);   // rim light
        col = mix(col, col * vec3(1.25, 0.95, 0.85), smoothstep(0.6, 1.0, vH) * top);                       // the crown catching the sun
        // the heat: white-hot fireball, then the cap's dull red core for a minute
        float hot = vGlow * (exp(-age / 3.0) * 5.0 + exp(-age / 11.0) * 0.8 * (1.0 - r));
        col += mix(vec3(1.0, 0.35, 0.1), vec3(1.4, 1.2, 0.95), exp(-age / 2.5)) * hot;
        gl_FragColor = vec4(col, min(1.0, a * 1.15));
      }`,
  });
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = -5;
  W.cloud = new THREE.Group(); W.cloud.add(m); W.scene.add(W.cloud); W.cloudU = U;
  // a glow on the horizon in the first moments
  const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.makeSoftTex(), color: new THREE.Color(1, 0.85, 0.6), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  gl.renderOrder = -4; W.cloud.add(gl); W.cloudGlow = gl;
}

function updateBomb(W, tau, cam) {
  const L = W.L;
  // the convoy
  for (const car of W.rideCars) {
    const c = car.c, p = carPose(c, tau, car.pose), h = c.kind === 'pickup' ? 2.6 : 2.3;
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), hf = heightAt(p.x + fx * h, p.z + fz * h), hb = heightAt(p.x - fx * h, p.z - fz * h);
    const moving = p.v > 0.5 && !p.wreck;
    car.root.position.set(p.x, p.y + (moving ? Math.sin(tau * 9 + c.i) * 0.015 : 0), p.z);
    car.root.rotation.set(Math.atan2(hb - hf, h * 2) + (moving ? Math.sin(tau * 5.3 + c.i * 2) * 0.006 : 0), p.yaw, -p.roll + (moving ? Math.sin(tau * 3.1 + c.i) * 0.008 : 0), 'YXZ');
    const f = Math.max(0, Math.min(car.dist.length - 1.001, tau / DTC)), k = Math.floor(f), d = car.dist[k] + (car.dist[k + 1] - car.dist[k]) * (f - k);
    for (const w of car.wheels) w.m.rotation.x = d / 0.4;
    if (c.burnT != null) { const a = tau - c.burnT; if (c.i === 6) poseBlast(car, a); else if ((a > 0) !== !!car.burnt) poseBlast(car, a > 0 ? 1e-3 : -1); }
    if (car.flag) { const pa = car.flag.geometry.attributes.position, b = car.flagBase, wind = 0.25 + Math.min(1, p.v / 20) * 0.9; for (let i = 0; i < pa.count; i++) { const x = b[i * 3]; pa.setZ(i, Math.sin(x * 9 - tau * (6 + p.v * 0.6)) * 0.07 * -x * wind); pa.setX(i, x * (0.75 + 0.25 * wind)); } pa.needsUpdate = true; car.flag.visible = !car.burnt; }
  }
  // the tanker goes up
  { const T = W.tanker, burnt = tau >= T.t; if (burnt !== T.burnt) { T.burnt = burnt; T.g.traverse((m) => { if (!m.isMesh) return; if (!m.userData.mat) m.userData.mat = m.material; m.material = burnt ? (W._char || (W._char = std([0.07, 0.06, 0.055], 0.95))) : m.userData.mat; }); T.g.rotation.z = burnt ? 0.08 : 0; } }
  // the flag on the common
  if (W._flag) { const pa = W._flag.geometry.attributes.position, b = W._flagBase, age = tau - L.blast.t, gust = age > 100 && age < 112 ? 1.6 : 0.6; for (let i = 0; i < pa.count; i++) { const x = b[i * 3] - 1.3; pa.setZ(i, Math.sin(x * 4 - tau * 5) * 0.12 * (x + 0.05) * gust + Math.sin(x * 9 - tau * 9) * 0.03 * x); } pa.needsUpdate = true; }
  // the cloud rides along with you, out toward Boston
  const age = tau - L.blast.t, dx = L.blast.x - cam.position.x, dz = L.blast.z - cam.position.z, dl = Math.hypot(dx, dz);
  W.cloud.position.set(cam.position.x + dx / dl * 3200, cam.position.y - 60, cam.position.z + dz / dl * 3200);
  W.cloudU.uAge.value = age; W.cloud.visible = W.root.visible && age > 0;
  W.cloudGlow.scale.setScalar(3200 * (0.25 + Math.min(age, 4) * 0.15)); W.cloudGlow.position.set(0, 80 + Math.min(age, 10) * 18, 0); W.cloudGlow.material.opacity = age > 0 ? Math.exp(-age / 5) * 1.4 : 0;
  // the flash itself: the whole country lit from the east, shadows thrown west
  const fl = age > 0 ? Math.exp(-age / 1.1) * 9 + Math.exp(-age / 12) * 0.6 : 0;
  W.flashLight.intensity = fl; W.flashLight.position.set(cam.position.x - 1, 0.25 + cam.position.y, cam.position.z - 0.08); W.flashLight.target.position.copy(cam.position);
}
