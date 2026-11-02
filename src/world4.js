// East Sandwich, drawn: lawns, Route 6A with its double yellow line, fieldstone walls and picket fences, privet
// hedges, pitch pines and oaks, cedars at the edge of the marsh, the salt marsh itself and the bay beyond, utility
// poles with their wires, mailboxes, cars in the drives. The houses are the beach's breakable Capes.
import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { road6A, laneX, sandRoadX, roadInfo, MARSH_Z, LZ, CRASH, ROAD_W } from './terrain4.js';
import { buildCar, PAINT } from './cars.js';
import { mulberry32, fbm, smoothstep } from './rng.js';
import * as TX from './textures.js';
import { place, box, cyl, merge, std } from './world.js';
import { planStructure, Megastructures } from './megastruct.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ground colour for the terrain vertices
export function sandwichGround(x, z, y) {
  const LAWN = [0.36, 0.45, 0.22], MEADOW = [0.55, 0.55, 0.3], NEEDLES = [0.42, 0.33, 0.22], ASPH = [0.19, 0.19, 0.2], SAND = [0.72, 0.64, 0.5],
    MARSH = [0.6, 0.56, 0.32], MARSH2 = [0.42, 0.48, 0.26], MUD = [0.3, 0.27, 0.22], GRAVEL = [0.5, 0.47, 0.42];
  const n = fbm(x * 0.05 + 3, z * 0.05 - 7, 3), n2 = fbm(x * 0.17, z * 0.17, 2);
  let k = mix(LAWN, MEADOW, smoothstep(0.45, 0.75, n) * 0.6);
  k = mix(k, [0.3, 0.38, 0.18], smoothstep(0.55, 0.8, n2) * 0.4);
  // the woods floor to the south: needles and oak leaves
  const woods = smoothstep(road6A(x) - 20, road6A(x) - 34, z);
  k = mix(k, mix(NEEDLES, [0.34, 0.3, 0.2], n2), woods * 0.9);
  // the crash clearing: torn up
  k = mix(k, [0.3, 0.26, 0.2], smoothstep(14, 4, Math.hypot(x - CRASH.x, z - CRASH.z)) * 0.7);
  // the meadow by the marsh, mown
  k = mix(k, mix(MEADOW, [0.62, 0.6, 0.36], n2), smoothstep(30, 18, Math.hypot(x - LZ.x, z - LZ.z)));
  // the marsh: straw and green in bands, mud in the creeks
  const m = smoothstep(MARSH_Z - 6, MARSH_Z + 6, z);
  k = mix(k, mix(MARSH, MARSH2, smoothstep(0.4, 0.65, fbm(x * 0.02, z * 0.05, 3))), m);
  if (m > 0.5 && y < 0.1) k = mix(k, MUD, smoothstep(0.1, -0.3, y));
  // roads
  const ri = roadInfo(x, z);
  if (ri.kind === 'sand') k = mix(k, SAND, smoothstep(0.6, -0.4, ri.d));
  else { k = mix(k, GRAVEL, smoothstep(1.2, 0.3, ri.d) * 0.7); k = mix(k, ASPH, smoothstep(0.15, -0.15, ri.d)); }
  if (y < -1) k = [0.25, 0.27, 0.27];
  return k;
}

function groundGrainTex() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'), r = mulberry32(5);
  g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) { const v = 150 + r() * 105; g.fillStyle = `rgba(${v},${v},${v},0.5)`; g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 3); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

export function buildSandwich(W) {
  const L = W.L, root = W.root, r = mulberry32(77);
  // ---------- the bay beyond the marsh ----------
  { const m = new THREE.Mesh(new THREE.PlaneGeometry(3000, 1400).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: new THREE.Color(0.22, 0.3, 0.33), roughness: 0.12, metalness: 0.1 }));
    m.position.set(0, -0.35, 860); root.add(m); }
  // ---------- road markings: a double yellow line down 6A, white edge lines ----------
  { const yel = [], wht = [];
    for (let x = -560; x < 560; x += 3) {
      const z0 = road6A(x), z1 = road6A(x + 3), ang = -Math.atan2(z1 - z0, 3), cx = x + 1.5, cz = (z0 + z1) / 2, y = heightAt(cx, cz) + 0.03;
      for (const off of [-0.12, 0.12]) if (Math.floor(x / 3) % 1 === 0) yel.push(place(new THREE.PlaneGeometry(3.05, 0.1).rotateX(-Math.PI / 2), cx, y, cz + off, 0, ang, 0));
      for (const off of [-ROAD_W.r6a + 0.3, ROAD_W.r6a - 0.3]) wht.push(place(new THREE.PlaneGeometry(3.05, 0.12).rotateX(-Math.PI / 2), cx, y, cz + off, 0, ang, 0));
    }
    const lm = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 });
    const a = new THREE.Mesh(merge(yel), lm(0xd8b030)); a.receiveShadow = true; root.add(a);
    const b = new THREE.Mesh(merge(wht), lm(0xd8d8d0)); b.receiveShadow = true; root.add(b); }
  addWalls(root, L.walls, r);
  // ---------- privet hedges: lumpy, leafy boxes ----------
  { const hs = [];
    for (const h of L.hedges) {
      const g = new THREE.BoxGeometry(h.len, h.h, 1.1, Math.ceil(h.len / 0.8), 4, 2), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), n = fbm(x * 0.9 + h.x, y * 1.3 + z, 2) - 0.5; p.setXYZ(i, x, y + (y > 0 ? n * 0.25 : 0), z * (1 + n * 0.5)); }
      g.computeVertexNormals(); place(g, h.x, heightAt(h.x, h.z) + h.h / 2, h.z, 0, h.rot, 0); hs.push(g);
    }
    if (hs.length) { const m = new THREE.Mesh(merge(hs), std([0.2, 0.3, 0.13], 0.95)); m.castShadow = m.receiveShadow = true; root.add(m); } }
  addTrees(root, L.trees, r);
  // ---------- cars in the drives and abandoned on 6A ----------
  { const kinds = ['sedan', 'suv', 'pickup', 'wagon', 'hatch', 'sedan', 'suv', 'pickup'];
    W.cars = L.cars.map(([x, z, rot], i) => { const paintHex = PAINT[(i * 5 + 2) % PAINT.length], car = buildCar(kinds[i % kinds.length], paintHex, i + 11); car.paintHex = paintHex; car.root.position.set(x, heightAt(x, z), z); car.root.rotation.y = rot; root.add(car.root); return car; }); }
  addPoles(root, L.poles, L.mailboxes);
  // ---------- marsh grass and long meadow grass: instanced cards ----------
  { const tex = TX.makeGrassTex(), mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, color: new THREE.Color(0.95, 0.9, 0.62) });
    const card = merge([new THREE.PlaneGeometry(1.4, 0.9).translate(0, 0.45, 0), new THREE.PlaneGeometry(1.4, 0.9).translate(0, 0.45, 0).rotateY(Math.PI / 2)]);
    const N = W.q.terrainSeg > 300 ? 9000 : 5000, im = new THREE.InstancedMesh(card, mat, N), col = new THREE.Color(); let n = 0;
    for (let k = 0; k < N * 3 && n < N; k++) {
      const x = -140 + r() * 280, z = MARSH_Z - 2 + r() * 100, y = heightAt(x, z);
      if (y < 0.05) continue;
      _e.set(0, r() * 6.28, 0); _q.setFromEuler(_e); _p.set(x, y - 0.05, z); const s = 0.7 + r() * 0.6; _s.set(s, s * (0.7 + r() * 0.6), s); _m.compose(_p, _q, _s); im.setMatrixAt(n, _m);
      im.setColorAt(n, col.setRGB(0.85 + r() * 0.15, 0.85 + r() * 0.15, 0.6 + r() * 0.3)); n++;
    }
    for (let k = 0; k < 900 && n < N; k++) {   // uncut grass round the edge of the meadow
      const a = r() * 6.28, d = 22 + r() * 9, x = LZ.x + Math.cos(a) * d, z = LZ.z + Math.sin(a) * d, y = heightAt(x, z);
      _e.set(0, r() * 6.28, 0); _q.setFromEuler(_e); _p.set(x, y - 0.05, z); const s = 0.6 + r() * 0.4; _s.set(s, s, s); _m.compose(_p, _q, _s); im.setMatrixAt(n, _m); im.setColorAt(n, col.setRGB(0.8, 0.9, 0.55)); n++;
    }
    im.count = n; im.receiveShadow = true; root.add(im); }
  // ---------- a scorched, torn clearing where it came down ----------
  { const parts = []; for (let k = 0; k < 14; k++) { const a = r() * 6.28, d = 3 + r() * 9, x = CRASH.x + Math.cos(a) * d, z = CRASH.z + Math.sin(a) * d; parts.push(cyl(0.08 + r() * 0.1, 0.12 + r() * 0.12, 1 + r() * 3, 6, x, heightAt(x, z) + 0.5, z, (r() - 0.5) * 0.8, 0, (r() - 0.5) * 0.8)); }
    const m = new THREE.Mesh(merge(parts), std([0.16, 0.13, 0.11], 0.95)); m.castShadow = true; root.add(m); }
  // ---------- the power station by the canal: two 150 m chimneys over the marsh; the near one is brought down ----------
  { const base = 0.4, hall = new THREE.Mesh(box(90, 34, 40, 395, base + 17, 300), std([0.62, 0.6, 0.56], 0.85)); hall.castShadow = true; root.add(hall);
    root.add(new THREE.Mesh(box(30, 50, 26, 345, base + 25, 300), std([0.55, 0.53, 0.5], 0.85)));
    const plans = [{ name: 'CANAL STACK', x: 372, y: base, z: 262, rot: 0, w: 14, d: 14, floors: 30, fh: 5, binR: 7.5, T: 74, seed: 1968, style: 'stack', lean: [-0.35, -1] },
      { name: 'CANAL STACK', x: 420, y: base, z: 262, rot: 0, w: 14, d: 14, floors: 30, fh: 5, binR: 7.5, T: 1e6, seed: 1969, style: 'stack' }].map(planStructure);
    W.megas = new Megastructures(root, plans, { dustColor: [0.66, 0.64, 0.6] }); W.megaPlans = plans; }
}

export function addWalls(root, walls, r) {
  // ---------- fieldstone walls and picket fences ----------
  { const stones = [], pickets = [];
    for (const w of walls) {
      const c = Math.cos(w.rot), s = Math.sin(w.rot);
      if (w.kind === 'stone') {
        for (let u = -w.len / 2; u < w.len / 2; u += 0.5 + r() * 0.14) for (let row = 0; row < 2; row++) {
          const sz = 0.3 + r() * 0.16, lx = u + (row % 2) * 0.24, lz = (r() - 0.5) * 0.22, x = w.x + lx * c, z = w.z - lx * s + lz;
          const g = new THREE.IcosahedronGeometry(sz, 0); place(g, x, heightAt(x, z) + 0.2 + row * 0.36 + sz * 0.2, z, r() * 3, r() * 3, r() * 3, 1.3, 0.75, 1);
          stones.push(g);
        }
      } else {
        for (let u = -w.len / 2; u <= w.len / 2; u += 0.16) { const x = w.x + u * c, z = w.z - u * s; pickets.push(box(0.08, 0.95, 0.025, x, heightAt(x, z) + 0.47, z, 0, w.rot, 0)); }
        for (const yy of [0.3, 0.75]) pickets.push(box(w.len, 0.06, 0.04, w.x, heightAt(w.x, w.z) + yy, w.z, 0, w.rot, 0));
      }
    }
    if (stones.length) { const sm = new THREE.Mesh(merge(stones), std([0.48, 0.45, 0.41], 0.95)); sm.castShadow = sm.receiveShadow = true; root.add(sm); }
    if (pickets.length) { const pm = new THREE.Mesh(merge(pickets), std([0.92, 0.91, 0.87], 0.7)); pm.castShadow = pm.receiveShadow = true; root.add(pm); } }
}
export function addTrees(root, trees, r) {
  // ---------- trees ----------
  { const kinds = { oak: [], maple: [], pine: [], cedar: [] };
    for (const t of trees) kinds[t.kind].push(t);
    const bark = std([0.3, 0.25, 0.2], 0.95), pineBark = std([0.38, 0.27, 0.2], 0.95);
    const make = (list, trunkG, crownG, crownMat, tMat) => {
      if (!list.length) return;
      const ti = new THREE.InstancedMesh(trunkG, tMat, list.length), ci = new THREE.InstancedMesh(crownG, crownMat, list.length);
      list.forEach((t, i) => { _e.set(0, t.rot, 0); _q.setFromEuler(_e); _p.set(t.x, heightAt(t.x, t.z) - 0.2, t.z); _s.set(t.s, t.s * (0.9 + r() * 0.3), t.s); _m.compose(_p, _q, _s); ti.setMatrixAt(i, _m); ci.setMatrixAt(i, _m); });
      ti.castShadow = ci.castShadow = true; ti.receiveShadow = ci.receiveShadow = true; root.add(ti, ci);
    };
    const blobs = (n, y0, y1, rad, sq) => { const l = []; for (let k = 0; k < n; k++) l.push(place(new THREE.IcosahedronGeometry(rad * (0.7 + r() * 0.5), 1), (r() - 0.5) * rad * 1.6, y0 + r() * (y1 - y0), (r() - 0.5) * rad * 1.6, 0, 0, 0, 1, sq, 1)); return merge(l); };
    make(kinds.oak, cyl(0.2, 0.32, 5, 7, 0, 2.5, 0), blobs(7, 5, 8.5, 2.2, 0.7), std([0.2, 0.28, 0.14], 0.9), bark);
    make(kinds.maple, cyl(0.16, 0.26, 4.4, 7, 0, 2.2, 0), blobs(6, 4.4, 7.4, 2.0, 0.75), std([0.25, 0.33, 0.15], 0.9), bark);
    // pitch pine: a crooked bare trunk and a flat-topped, clumpy crown
    { const l = []; for (let k = 0; k < 6; k++) l.push(place(new THREE.IcosahedronGeometry(1.2 + r() * 0.6, 1), (r() - 0.5) * 3, 8 + r() * 2.2, (r() - 0.5) * 3, 0, 0, 0, 1, 0.5, 1));
      make(kinds.pine, merge([cyl(0.13, 0.22, 9, 6, 0, 4.5, 0, 0, 0, 0.05), cyl(0.05, 0.08, 2, 5, 0.6, 7.2, 0, 0, 0, 0.9)]), merge(l), std([0.17, 0.24, 0.13], 0.9), pineBark); }
    // eastern red cedar: a dark narrow spire
    make(kinds.cedar, cyl(0.1, 0.16, 2, 6, 0, 1, 0), merge([place(new THREE.ConeGeometry(1.4, 5.5, 8), 0, 3.6, 0), place(new THREE.ConeGeometry(1.0, 3.2, 8), 0, 5.6, 0)]), std([0.13, 0.2, 0.12], 0.9), bark);
  }
}
export function addPoles(root, poles, mailboxes) {
  // ---------- utility poles and the wires between them; mailboxes ----------
  { const parts = [], wires = [];
    for (const p of poles) { const y = heightAt(p.x, p.z); parts.push(cyl(0.13, 0.16, 10, 8, p.x, y + 5, p.z)); parts.push(box(2.2, 0.12, 0.12, p.x, y + 9.3, p.z)); for (const dx of [-0.9, 0, 0.9]) parts.push(cyl(0.05, 0.05, 0.18, 6, p.x + dx, y + 9.45, p.z)); }
    for (let i = 0; i < poles.length - 1; i++) { const a = poles[i], b = poles[i + 1], ya = heightAt(a.x, a.z) + 9.5, yb = heightAt(b.x, b.z) + 9.5;
      for (const dx of [-0.9, 0, 0.9]) { const pts = []; for (let k = 0; k <= 12; k++) { const u = k / 12; pts.push(new THREE.Vector3(a.x + (b.x - a.x) * u + dx, ya + (yb - ya) * u - Math.sin(Math.PI * u) * 0.9, a.z + (b.z - a.z) * u)); } wires.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.012, 3)); } }
    for (const m of mailboxes) { const y = heightAt(m.x, m.z); parts.push(box(0.08, 1.05, 0.08, m.x, y + 0.52, m.z, 0, m.rot, 0)); parts.push(place(new THREE.CylinderGeometry(0.11, 0.11, 0.45, 10, 1, false, 0, Math.PI), m.x, y + 1.1, m.z, Math.PI / 2, m.rot, 0)); parts.push(box(0.22, 0.12, 0.45, m.x, y + 1.05, m.z, 0, m.rot, 0)); }
    const pm = new THREE.Mesh(merge(parts), std([0.36, 0.3, 0.24], 0.9)); pm.castShadow = pm.receiveShadow = true; root.add(pm);
    if (wires.length) root.add(new THREE.Mesh(merge(wires), std([0.08, 0.08, 0.08], 0.6))); }
}
