// Ashland State Park, drawn: first light over the reservoir with the mist lying on it; the beach, the bathhouse,
// picnic tables, hammocks still strung between the pines; the earth dam and its stone spillway; the woods — oak,
// maple, white pine — with granite and old stone walls through them; and hidden under the trees to the south-west,
// the Texan camps: tents under nets, the trucks, the cook fire, the radio mast.
import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { LAKE, BEACH, LOT, CAMPS, DAM_Z, lakeDist } from './terrainA.js';
import { buildCar, PAINT } from './cars.js';
import { mulberry32, fbm, smoothstep } from './rng.js';
import * as TX from './textures.js';
import { place, box, cyl, merge, std, SUN_DIR } from './world.js';
import { addWoods } from './worldB.js';
import { Megastructures } from './megastruct.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const canvasTex = (w, h, draw, rep = true) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
let PATHD = null;

export function ashGround(x, z, y) {
  const LEAF = [0.34, 0.27, 0.18], NEEDLE = [0.4, 0.3, 0.2], MOSS = [0.24, 0.31, 0.15], SAND = [0.76, 0.68, 0.52], WETS = [0.5, 0.44, 0.34], DIRT = [0.42, 0.34, 0.24], ASPH = [0.2, 0.2, 0.21], GRASS = [0.34, 0.42, 0.2];
  const n = fbm(x * 0.03 + 7, z * 0.03 - 4, 3), n2 = fbm(x * 0.13, z * 0.13, 2);
  let k = mix(LEAF, NEEDLE, smoothstep(0.4, 0.7, n)); k = mix(k, MOSS, smoothstep(0.58, 0.8, n2) * 0.55);
  const ld = lakeDist(x, z);
  k = mix(k, mix(GRASS, [0.4, 0.45, 0.24], n2), smoothstep(14, 4, ld) * 0.7);
  if (ld < 1.5) k = mix(k, [0.32, 0.3, 0.24], smoothstep(1.5, -1, ld));
  const db = Math.hypot(x - BEACH.x, z - BEACH.z); k = mix(k, mix(SAND, WETS, smoothstep(2, -1, ld)), smoothstep(30, 20, db));
  const dl = Math.max(Math.abs(x - LOT.x) - LOT.hw, Math.abs(z - LOT.z) - LOT.hd); k = mix(k, ASPH, smoothstep(1, -1, dl));
  for (const c of CAMPS) k = mix(k, mix(DIRT, [0.36, 0.3, 0.21], n2), smoothstep(26, 14, Math.hypot(x - c.x, z - c.z)) * 0.8);
  if (PATHD) k = mix(k, mix(DIRT, [0.48, 0.4, 0.29], n2), smoothstep(2.4, 1.1, PATHD(x, z)) * 0.85);
  if (Math.abs(z - DAM_Z) < 9 && Math.abs(x - LAKE.x) < 92) k = mix(k, [0.4, 0.44, 0.26], smoothstep(9, 4, Math.abs(z - DAM_Z)));
  if (y < 0.3) k = mix(k, [0.2, 0.2, 0.17], smoothstep(0.3, -2, y));
  return k;
}

export function buildAsh(W) {
  const L = W.L, root = W.root, r = mulberry32(1846), hi = W.q.terrainSeg > 300;
  PATHD = L.pathD;
  // ---------- terrain: a fine core and a coarse surround out to the hills ----------
  { const core = hi ? 1.5 : 2.2, C = [-260, 260, -260, 260];
    const g = new THREE.PlaneGeometry(1800, 1800, hi ? 220 : 150, hi ? 220 : 150); g.rotateX(-Math.PI / 2);
    const gc = new THREE.PlaneGeometry(C[1] - C[0], C[3] - C[2], Math.round((C[1] - C[0]) / core), Math.round((C[3] - C[2]) / core)); gc.rotateX(-Math.PI / 2);
    for (const geo of [g, gc]) { const p = geo.attributes.position, uv = geo.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 3.3, p.getZ(i) / 3.3); }
    W.coreRect = C;
    const mat = W.colorTerrain(g, null); W.colorTerrain(gc, mat); const coreM = new THREE.Mesh(gc, mat); coreM.receiveShadow = true; root.add(coreM); W.terrainCore = coreM;
    { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); if (x > C[0] + 1 && x < C[1] - 1 && z > C[2] + 1 && z < C[3] - 1) p.setY(i, p.getY(i) - 3); } g.computeVertexNormals(); } }
  // ---------- the reservoir: still water, the sky in it, mist lying on it ----------
  { const water = new THREE.Mesh(new THREE.CircleGeometry(LAKE.r * 1.35, 96).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uSun: { value: SUN_DIR }, uFog: { value: W.fogColor } }, transparent: true, fog: false, depthWrite: false,
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
      fragmentShader: `uniform float uT; uniform vec3 uSun, uFog; varying vec3 vW;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
        void main(){ vec2 g = vW.xz; float w = n(g * 0.18 + vec2(uT * 0.05, uT * 0.03)) * 0.6 + n(g * 0.6 - uT * 0.08) * 0.4;
          vec3 N = normalize(vec3((w - 0.5) * 0.08, 1.0, (n(g * 0.22 + 7.0) - 0.5) * 0.08)), V = normalize(cameraPosition - vW), R = reflect(-V, N);
          float fr = 0.03 + 0.97 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
          vec3 sky = mix(vec3(0.62, 0.6, 0.62), vec3(0.95, 0.72, 0.55), pow(max(dot(normalize(vec3(R.x, 0.0, R.z)), normalize(vec3(uSun.x, 0.0, uSun.z))), 0.0), 3.0)) * (0.7 + 0.3 * smoothstep(0.0, 0.5, R.y));
          vec3 deep = vec3(0.06, 0.08, 0.08), c = mix(deep, sky, fr) + vec3(1.0, 0.8, 0.6) * pow(max(dot(R, uSun), 0.0), 200.0) * 3.0;
          float d = length(cameraPosition - vW), ff = 1.0 - exp(-pow(0.0042 * d, 2.0)); gl_FragColor = vec4(mix(c, uFog, ff), 0.94); }` }));
    water.position.set(LAKE.x, 0.15, LAKE.z); water.renderOrder = 1; root.add(water); W.lake = water;
    // mist: low soft sheets drifting over the water
    const mt = TX.makeSoftTex(), n = hi ? 160 : 90, im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: mt, color: new THREE.Color(0.9, 0.88, 0.86), transparent: true, opacity: 0.16, depthWrite: false }), n);
    W.mist = []; for (let k = 0; k < n; k++) { const a = r() * 6.28, d = Math.sqrt(r()) * LAKE.r * 1.05; W.mist.push({ x: LAKE.x + Math.cos(a) * d, z: LAKE.z + Math.sin(a) * d, y: 0.5 + r() * 3.5, s: 34 + r() * 40, ph: r() * 6 }); }
    im.frustumCulled = false; im.renderOrder = 2; root.add(im); W.mistMesh = im; }
  // ---------- the woods ----------
  addWoods(root, L.trees, r, hi);
  // granite boulders
  { const geo = new THREE.IcosahedronGeometry(1, 1), im = new THREE.InstancedMesh(geo, std([0.52, 0.52, 0.5], 0.95), L.rocks.length), col = new THREE.Color();
    { const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), f = 1 + (fbm(x * 2 + 3, z * 2 + y, 2) - 0.5) * 0.5; p.setXYZ(i, x * f, y * f, z * f); } geo.computeVertexNormals(); }
    L.rocks.forEach((k, i) => { _e.set(0, k.rot, 0); _q.setFromEuler(_e); _p.set(k.x, heightAt(k.x, k.z) + k.s * k.sq * 0.3, k.z); _s.set(k.s * 1.2, k.s * k.sq, k.s); _m.compose(_p, _q, _s); im.setMatrixAt(i, _m); const v = 0.8 + r() * 0.3; im.setColorAt(i, col.setRGB(v * (0.9 + r() * 0.1), v, v * (0.85 + r() * 0.1))); });
    im.castShadow = im.receiveShadow = true; root.add(im); }
  // old stone walls
  { const geo = new THREE.IcosahedronGeometry(1, 0), list = [];
    for (const w of L.walls) { const c = Math.cos(w.rot), s = Math.sin(w.rot); for (let u = -w.len / 2; u < w.len / 2; u += 0.5 + r() * 0.15) for (let row = 0; row < 2; row++) { if (r() < 0.12 * row) continue; const sz = 0.28 + r() * 0.18, lx = u + (row % 2) * 0.24, x = w.x + lx * c, z = w.z - lx * s + (r() - 0.5) * 0.2; list.push([x, heightAt(x, z) + 0.16 + row * 0.33 + sz * 0.15, z, sz]); } }
    const im = new THREE.InstancedMesh(geo, std([0.5, 0.5, 0.46], 0.95), list.length), col = new THREE.Color();
    list.forEach(([x, y, z, sz], i) => { _e.set(r() * 3, r() * 3, r() * 3); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(sz * 1.3, sz * 0.75, sz); _m.compose(_p, _q, _s); im.setMatrixAt(i, _m); const v = 0.75 + r() * 0.35; im.setColorAt(i, col.setRGB(v * (0.92 + r() * 0.1), v * (0.95 + r() * 0.08), v * 0.88)); });
    im.castShadow = im.receiveShadow = true; root.add(im); }
  // ferns and huckleberry under the trees
  { const list = []; for (let k = 0; k < (hi ? 6000 : 3000); k++) { const x = -230 + r() * 460, z = -230 + r() * 460; if (lakeDist(x, z) < 6 || L.pathD(x, z) < 2.5 || Math.hypot(x - BEACH.x, z - BEACH.z) < 26 || (Math.abs(x - LOT.x) < LOT.hw + 2 && Math.abs(z - LOT.z) < LOT.hd + 2)) continue; list.push([x, z, 0.35 + r() * 0.6]); }
    const im = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), std([0.2, 0.3, 0.12], 0.95), list.length), col = new THREE.Color();
    list.forEach(([x, z, s], i) => { _e.set(0, r() * 6, 0); _q.setFromEuler(_e); _p.set(x, heightAt(x, z) + s * 0.25, z); _s.set(s * 1.5, s * 0.7, s * 1.3); _m.compose(_p, _q, _s); im.setMatrixAt(i, _m); im.setColorAt(i, col.setRGB(0.8 + r() * 0.4, 0.85 + r() * 0.3, 0.7 + r() * 0.4)); });
    im.receiveShadow = true; im.castShadow = true; root.add(im); }
  // ---------- the dam and its spillway; the beach; the lot ----------
  { const parts = [], rip = []; for (let x = LAKE.x - 88; x <= LAKE.x + 88; x += 2) { const y = heightAt(x, DAM_Z); parts.push(box(2.05, 0.5, 4, x, y + 0.15, DAM_Z)); for (let k = 0; k < 3; k++) rip.push(place(new THREE.IcosahedronGeometry(0.5 + r() * 0.4, 0), x + r() * 2, y - 1.2 - k * 0.9, DAM_Z - 3 - k * 1.6, r() * 3, r() * 3, r() * 3)); }
    root.add(Object.assign(new THREE.Mesh(merge(parts), std([0.45, 0.42, 0.36], 0.95)), { receiveShadow: true }), Object.assign(new THREE.Mesh(merge(rip), std([0.48, 0.48, 0.46], 0.95)), { castShadow: true }));
    const sx = LAKE.x + 40, sp = [box(0.6, 4, 16, sx - 3, 1.5, DAM_Z + 2), box(0.6, 4, 16, sx + 3, 1.5, DAM_Z + 2), box(6.6, 0.4, 16, sx, -0.4, DAM_Z + 2)];
    root.add(new THREE.Mesh(merge(sp), std([0.62, 0.6, 0.55], 0.9)));
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 16).rotateX(-Math.PI / 2 + 0.35), new THREE.MeshStandardMaterial({ color: 0xe8ecec, roughness: 0.3, transparent: true, opacity: 0.75 })); fall.position.set(sx, 0.4, DAM_Z + 2); root.add(fall); W.fall = fall; }
  { const B = L.bathhouse, g = new THREE.Group(); g.position.set(B.x, heightAt(B.x, B.z), B.z); g.rotation.y = B.rot; root.add(g);
    const wood = std([0.42, 0.3, 0.2], 0.85), roof = std([0.25, 0.26, 0.24], 0.8); g.add(Object.assign(new THREE.Mesh(box(14, 3.2, 9, 0, 1.6, 0), wood), { castShadow: true, receiveShadow: true }));
    const sh = new THREE.Shape(); sh.moveTo(-5, 0); sh.lineTo(0, 2); sh.lineTo(5, 0); sh.lineTo(-5, 0); const rg = new THREE.ExtrudeGeometry(sh, { depth: 15, bevelEnabled: false }); rg.translate(0, 0, -7.5); rg.rotateY(Math.PI / 2); rg.translate(0, 3.2, 0); g.add(Object.assign(new THREE.Mesh(rg, roof), { castShadow: true }));
    for (const x of [-4, 4]) g.add(new THREE.Mesh(box(1.4, 2.2, 0.1, x, 1.1, 4.55), std([0.18, 0.2, 0.22], 0.6)));
    g.add(new THREE.Mesh(place(new THREE.PlaneGeometry(5, 0.7), 0, 2.7, 4.56), new THREE.MeshStandardMaterial({ map: canvasTex(512, 72, (q, w, h) => { q.fillStyle = '#3a2a18'; q.fillRect(0, 0, w, h); q.fillStyle = '#e8dcc0'; q.font = 'bold 44px Georgia'; q.textAlign = 'center'; q.textBaseline = 'middle'; q.fillText('ASHLAND STATE PARK', w / 2, h / 2); }, false) })));
    const tb = [], tw = std([0.5, 0.38, 0.26], 0.9); for (const t of L.tables) { const y = heightAt(t.x, t.z); tb.push(box(2, 0.08, 0.8, t.x, y + 0.76, t.z, 0, t.rot, 0), box(2, 0.06, 0.28, t.x - Math.sin(t.rot) * 0.65, y + 0.45, t.z - Math.cos(t.rot) * 0.65, 0, t.rot, 0), box(2, 0.06, 0.28, t.x + Math.sin(t.rot) * 0.65, y + 0.45, t.z + Math.cos(t.rot) * 0.65, 0, t.rot, 0)); for (const s of [-0.8, 0.8]) tb.push(box(0.08, 0.76, 1.6, t.x + Math.cos(t.rot) * s, y + 0.38, t.z - Math.sin(t.rot) * s, 0, t.rot, 0)); }
    root.add(Object.assign(new THREE.Mesh(merge(tb), tw), { castShadow: true }));
    // the lifeguard chair, its back to the woods
    const lg = []; const lx = BEACH.x - 6, lz = BEACH.z + 6, ly = heightAt(lx, lz); for (const a of [-0.6, 0.6]) for (const b of [-0.6, 0.6]) lg.push(box(0.12, 3, 0.12, lx + a, ly + 1.5, lz + b)); lg.push(box(1.4, 0.1, 1.4, lx, ly + 2.4, lz), box(1.4, 0.8, 0.1, lx, ly + 2.8, lz - 0.7));
    root.add(Object.assign(new THREE.Mesh(merge(lg), std([0.9, 0.9, 0.86], 0.6)), { castShadow: true }));
    // the lot: painted bays; the cars
    const ln = []; for (let k = -6; k <= 6; k++) ln.push(box(0.12, 0.02, 5, LOT.x + k * 3, LOT.y + 0.02, LOT.z + 8), box(0.12, 0.02, 5, LOT.x + k * 3, LOT.y + 0.02, LOT.z - 8));
    root.add(new THREE.Mesh(merge(ln), new THREE.MeshBasicMaterial({ color: 0xd8d8cc }))); }
  // hammocks: bright nylon between pairs of pines, sagging, stirring
  W.hammocks = L.hammocks.map((h, k) => { const cols = ['#e05a2a', '#2a7ac8', '#3aa860'], m = new THREE.MeshStandardMaterial({ color: new THREE.Color(cols[k % 3]), roughness: 0.8, side: THREE.DoubleSide });
    const g = new THREE.PlaneGeometry(1, 1, 16, 4); const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh);
    const ya = heightAt(h.a.x, h.a.z) + 1.5, yb = heightAt(h.b.x, h.b.z) + 1.5; return { h, mesh, ya, yb, base: Float32Array.from(g.attributes.position.array) }; });
  // ---------- the camps ----------
  { const tent = std([0.3, 0.32, 0.22], 0.9), parts = [];
    for (const t of L.tents) { const y = heightAt(t.x, t.z), sh = new THREE.Shape(); sh.moveTo(-2.4, 0); sh.lineTo(-2.4, 1.4); sh.lineTo(0, 2.6); sh.lineTo(2.4, 1.4); sh.lineTo(2.4, 0); sh.lineTo(-2.4, 0);
      const tg = new THREE.ExtrudeGeometry(sh, { depth: 6, bevelEnabled: false }); tg.translate(0, 0, -3); tg.rotateY(t.rot + Math.PI / 2); tg.translate(t.x, y, t.z); parts.push(tg); }
    root.add(Object.assign(new THREE.Mesh(merge(parts), tent), { castShadow: true, receiveShadow: true }));
    // camouflage nets over each camp
    const nt = canvasTex(256, 256, (q, w, h) => { const rr = mulberry32(9); q.clearRect(0, 0, w, h); for (let i = 0; i < 900; i++) { const v = rr(); q.fillStyle = v < 0.4 ? '#4a5230' : v < 0.7 ? '#5e5a3a' : '#2e3420'; q.beginPath(); q.ellipse(rr() * w, rr() * h, 4 + rr() * 10, 3 + rr() * 6, rr() * 3, 0, 7); q.fill(); } q.strokeStyle = '#1e2214'; q.lineWidth = 1; for (let k = 0; k < w; k += 8) { q.beginPath(); q.moveTo(k, 0); q.lineTo(k, h); q.stroke(); q.beginPath(); q.moveTo(0, k); q.lineTo(w, k); q.stroke(); } });
    nt.repeat.set(3, 3); const nm = new THREE.MeshStandardMaterial({ map: nt, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 1 });
    for (const c of CAMPS) { const g = new THREE.PlaneGeometry(46, 46, 20, 20).rotateX(-Math.PI / 2), p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), d = Math.hypot(x, z); p.setY(i, heightAt(c.x + x, c.z + z) + 3.6 - d * 0.04 + Math.sin(x * 0.5) * Math.cos(z * 0.4) * 0.4); } g.computeVertexNormals(); const m = new THREE.Mesh(g, nm); m.position.set(c.x, 0, c.z); m.castShadow = true; m.receiveShadow = true; root.add(m); }
    // the cook fire, crates, a generator
    const c0 = CAMPS[0], fy = heightAt(c0.x + 4, c0.z + 4), cr = [];
    for (let k = 0; k < 8; k++) { const a = k / 8 * 6.28; cr.push(place(new THREE.IcosahedronGeometry(0.22, 0), c0.x + 4 + Math.cos(a) * 0.7, fy + 0.1, c0.z + 4 + Math.sin(a) * 0.7)); }
    for (const c of CAMPS) for (let k = 0; k < 6; k++) { const x = c.x + (r() - 0.5) * 16, z = c.z + (r() - 0.5) * 16; cr.push(box(1.2, 0.7, 0.8, x, heightAt(x, z) + 0.35, z, 0, r() * 3, 0)); }
    root.add(Object.assign(new THREE.Mesh(merge(cr), std([0.34, 0.33, 0.26], 0.9)), { castShadow: true }));
    W.cookFire = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.makeFlashTex(), color: new THREE.Color(1.6, 0.7, 0.25), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); W.cookFire.position.set(c0.x + 4, fy + 0.5, c0.z + 4); W.cookFire.scale.setScalar(1.4); root.add(W.cookFire);
    // the fuel bladder
    const f = L.fuel; W.fuel = new THREE.Mesh(place(new THREE.SphereGeometry(1, 18, 10), f.x, heightAt(f.x, f.z) + 0.6, f.z, 0, 0.3, 0, 3, 0.65, 2), std([0.12, 0.13, 0.1], 0.6)); W.fuel.castShadow = true; root.add(W.fuel); }
  W.cars = L.cars.map(([x, z, rot], i) => { const isT = i < L.trucks.length, paint = isT ? '#4a4e3e' : PAINT[(i * 3 + 1) % PAINT.length], car = buildCar(isT ? (i % 2 ? 'pickup' : 'suv') : i === L.trucks.length ? 'pickup' : 'sedan', paint, 500 + i); car.paintHex = paint; car.root.position.set(x, heightAt(x, z), z); car.root.rotation.y = rot; root.add(car.root); return car; });
  W.megas = new Megastructures(root, L.megaPlans); W.megaPlans = L.megaPlans;
  W.ashUpdate = (tau, cam) => updateAsh(W, tau, cam);
}

function updateAsh(W, tau, cam) {
  const L = W.L;
  W.lake.material.uniforms.uT.value = tau;
  { let n = 0; for (const m of W.mist) { _p.set(m.x + Math.sin(tau * 0.03 + m.ph) * 6, m.y, m.z + tau * 0.12 % 20); _s.set(m.s, 1, m.s * 0.7); _e.set(0, m.ph, 0); _q.setFromEuler(_e); _m.compose(_p, _q, _s); W.mistMesh.setMatrixAt(n++, _m); } W.mistMesh.instanceMatrix.needsUpdate = true; }
  for (const h of W.hammocks) {
    const pa = h.mesh.geometry.attributes.position, b = h.base, A = h.h.a, B = h.h.b, sway = Math.sin(tau * 0.8 + h.h.col) * 0.12, nx0 = -(B.z - A.z), nz0 = B.x - A.x, nl = Math.hypot(nx0, nz0), nx = nx0 / nl, nz = nz0 / nl;
    for (let i = 0; i < pa.count; i++) { const u = b[i * 3] + 0.5, v = b[i * 3 + 1], s = Math.sin(u * Math.PI), w = v * 0.95 * Math.sqrt(s) + sway * s;
      pa.setXYZ(i, A.x + (B.x - A.x) * u + nx * w, h.ya + (h.yb - h.ya) * u - 1.0 * s - 0.22 * (1 - 4 * v * v) * s, A.z + (B.z - A.z) * u + nz * w); }
    pa.needsUpdate = true; h.mesh.geometry.computeVertexNormals(); }
  W.cookFire.visible = tau < 60; W.cookFire.scale.setScalar(1.3 + Math.sin(tau * 11) * 0.2);
  { const burnt = tau >= L.fuel.T; W.fuel.visible = !burnt; }
  if (W.fall) W.fall.material.opacity = 0.7 + Math.sin(tau * 5) * 0.05;
}
