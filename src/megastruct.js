// Big buildings that come down — and, in rewind, go back up. A building is a stack of floors of pieces (slabs,
// columns, facade panels, roof plant), planned once from a seed: charges at the base at time T, then the whole block
// drops and leans; each piece holds its place in the block until the crush front reaches it, then flies free with
// the speed it had plus a kick, tumbling, and lands on a rubble heap. A dust surge rolls out from the foot. Everything
// is a pure function of tape time, so it reassembles as smoothly as it fell.
import * as THREE from 'three';
import { mulberry32 } from './rng.js';

const G = 9.8;
// spec: { x, z, y (ground), rot, w (local x), d (local z), floors, fh, T, seed, style, lean: [lx, lz] }
export function planStructure(spec) {
  const r = mulberry32(spec.seed || 1), P = [], fh = spec.fh || 4, n = spec.floors, H = n * fh;
  const w = spec.w, d = spec.d, bay = spec.bay || 4, nx = Math.max(2, Math.round(w / bay)), nz = Math.max(2, Math.round(d / bay));
  const style = spec.style || 'glass';
  const add = (mat, x, y, z, sx, sy, sz, kind = 'panel') => P.push({ mat, x, y, z, sx, sy, sz, kind });
  if (style === 'stack') {   // a power-station chimney: a tapering concrete tube in rings, red and white at the top
    const n2 = spec.floors, R0 = spec.binR || 7;
    for (let k = 0; k < n2; k++) { const R = R0 * (1 - k / n2 * 0.38), band = k >= n2 - 6 ? (Math.floor((n2 - k) / 2) % 2 ? 'stackR' : 'stackW') : 'concrete';
      for (let a = 0; a < 4; a++) P.push({ mat: band, kind: 'arc', x: 0, y: k * fh + fh / 2, z: 0, sx: R, sy: fh, sz: R, arc: a }); }
    add('steel', 0, n2 * fh + 0.6, 0, R0 * 1.3, 1.2, R0 * 1.3, 'cap');
  } else if (style === 'mast') {   // a lattice radio mast: three legs in 6 m sections, bracing, the dishes and whips at the top
    const n2 = spec.floors, sec = fh, half = 1.4;
    for (let k = 0; k < n2; k++) { const y = k * sec + sec / 2, s2 = half * (1 - k / n2 * 0.5);
      for (let a = 0; a < 3; a++) { const an = a / 3 * Math.PI * 2; add('steel', Math.cos(an) * s2, y, Math.sin(an) * s2, 0.18, sec, 0.18, 'leg'); }
      add('steel', 0, y, 0, s2 * 1.6, 0.08, 0.08, 'brace'); add('steel', 0, y + sec * 0.3, 0, 0.08, 0.08, s2 * 1.6, 'brace'); }
    const H2 = n2 * sec; add('steel', 0, H2 + 2, 0, 0.12, 4, 0.12, 'whip'); add('slab', 0.9, H2 - 3, 0, 1.4, 1.4, 0.3, 'dish'); add('slab', -0.8, H2 - 6, 0.4, 1.2, 1.2, 0.3, 'dish');
  } else if (style === 'crane') {   // ship-to-shore crane: four legs, the portal, a 100 m boom out over the water, the A-frame, the house
    for (const lx of [-9, 9]) for (const lz of [-8, 8]) for (let k = 0; k < 2; k++) add('crane', lx, 8.5 + k * 17, lz, 1.6, 17, 1.6, 'leg');
    for (const lz of [-8, 8]) add('crane', 0, 34.5, lz, 19.6, 1.8, 1.4, 'beam');
    for (const lx of [-9, 9]) add('crane', lx, 34.5, 0, 1.4, 1.8, 17.6, 'beam');
    for (let k = 0; k < 4; k++) for (const lx of [-3, 3]) add('crane', lx, 40, -30 + k * 25 + 12.5, 1.2, 3, 24.6, 'boom');
    add('steel', 0, 37.5, 34, 6, 3, 6, 'trolley');
    add('crane', 0, 45.5, -18, 14, 6, 12, 'house');
    for (const lx of [-3, 3]) for (const lz of [-3, 3]) add('crane', lx * 0.7, 50, lz * 0.7, 1, 18, 1, 'frame');
    add('crane', 0, 60, 0, 6, 2, 4, 'apex');
    for (let k = 0; k < 3; k++) add('steel', 0, 51 - k * 4, 20 + k * 14, 0.4, 0.4, 16, 'stay');
  } else if (style === 'silo') {   // grain elevator: a row-and-column block of tall concrete bins, the head house on top
    const R = spec.binR || 4.2, cols = Math.round(w / (2 * R)), rows = Math.round(d / (2 * R)), seg = 6;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) for (let k = 0; k < n; k++) for (let a = 0; a < 4; a++)
      P.push({ mat: 'concrete', kind: 'arc', x: -w / 2 + R + i * 2 * R, y: k * fh + fh / 2, z: -d / 2 + R + j * 2 * R, sx: R, sy: fh, sz: R, arc: a, seg });
    for (let k = 0; k < 3; k++) for (let i = 0; i < 4; i++) add('concrete', -w * 0.3 + i * w * 0.2, H + k * 4 + 2, 0, w * 0.2 - 0.2, 4, d * 0.4, 'head');
  } else {
    for (let k = 0; k < n; k++) {
      const y = k * fh;
      // the slab, in quarters; columns at the corners and mid-sides
      for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) add('slab', (a - 0.5) * w / 2, y + fh - 0.2, (b - 0.5) * d / 2, w / 2 - 0.1, 0.4, d / 2 - 0.1, 'slab');
      for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]) add('slab', cx * (w / 2 - 0.4), y + fh / 2 - 0.2, cz * (d / 2 - 0.4), 0.8, fh - 0.4, 0.8, 'col');
      // facade bays on all four sides
      for (let i = 0; i < nx; i++) for (const s of [-1, 1]) add(style, -w / 2 + (i + 0.5) * w / nx, y + fh / 2, s * d / 2, w / nx - 0.04, fh - 0.04, 0.3, 'face');
      for (let i = 0; i < nz; i++) for (const s of [-1, 1]) add(style, s * w / 2, y + fh / 2, -d / 2 + (i + 0.5) * d / nz, 0.3, fh - 0.04, d / nz - 0.04, 'face');
    }
    // roof plant, parapet, a mast
    add('slab', 0, H + 1.6, 0, w * 0.35, 3.2, d * 0.35, 'plant');
    if (spec.mast) add('steel', 0, H + 3.2 + spec.mast / 2, 0, 0.6, spec.mast, 0.6, 'mast');
    if (spec.clock) { const cz = (spec.clockSide ?? 1) * (d / 2 - 2.5); add('brick', 0, H + 5, cz, 5, 10, 5, 'tower'); add('brick', 0, H + 11, cz, 4, 2.4, 4, 'tower'); add('slab', 0, H + 13.5, cz, 3.4, 2.6, 3.4, 'tower'); }
  }
  // ---- the fall ----
  const T = spec.T, lean = spec.lean || [r() - 0.5, r() - 0.5], ll = Math.hypot(lean[0], lean[1]) || 1, lx = lean[0] / ll, lz = lean[1] / ll;
  const ex = w / 2 + H * 0.35, ez = d / 2 + H * 0.35, Rpile = Math.max(ex, ez), Hpile = Math.min(H * 0.24, 5 + n * 0.6);
  const heap = (x, z) => { const q = Math.hypot((x - lx * H * 0.08) / ex, (z - lz * H * 0.08) / ez); return q < 1 ? Hpile * Math.pow(1 - q, 1.1) : 0; };
  const delay = 0.35, cut = fh * (spec.cut ?? 2.2);   // the charges take the lower floors; the block above starts to drop
  const crane = style === 'crane' || style === 'mast' || style === 'stack', tiltMax = spec.tiltMax ?? (crane ? 1.5 : 0.32), tiltRate = spec.tiltRate ?? (style === 'stack' ? 0.045 : style === 'mast' ? 0.09 : crane ? 0.16 : 0.02), dropK = spec.dropK ?? (crane ? 0.02 : 0.9);
  const plan = { spec, P, H, T, Rpile, Hpile, ex, ez, lx, lz, heap, tiltMax, tiltRate, dropK, pivot: [lx * (w / 2), 0, lz * (d / 2)] };
  const ground = (x, z) => heap(x, z) + (spec.ground ? spec.ground(x, z) : 0);
  const _P = new THREE.Vector3(), _Q = new THREE.Quaternion();
  for (const p of P) {
    const below = !crane && p.y < cut;
    // the block drops (the crush front moving up through it) and leans the way it was cut; a crane just goes over
    const tTop = crane ? Math.sqrt(tiltMax / tiltRate) : Math.sqrt(2 * Math.max(0.01, p.y - cut) / G) * 0.9;
    const td = below ? T + r() * 0.15 : T + delay + tTop * (crane ? 1 : 1) + (crane ? r() * 0.3 : 0);
    p.td = td; const fallT = Math.max(0, td - T - delay);
    blockAt(plan, p, fallT, _P, _Q); p.s0 = [_P.x, _P.y, _P.z]; p.q0 = [_Q.x, _Q.y, _Q.z, _Q.w];
    const vy = below ? 4 + r() * 6 : crane ? -6 - r() * 4 : -G * fallT * dropK;
    const kick = below ? 7 + r() * 9 : crane ? 1 + r() * 2 : 1.5 + r() * 4 + (p.kind === 'face' ? 3 : 0), out = Math.atan2(p.x, p.z) + (r() - 0.5) * 1.2;
    p.v = [Math.sin(out) * kick + lx * (crane ? 6 : 2), vy, Math.cos(out) * kick + lz * (crane ? 6 : 2)];
    p.w = [(r() - 0.5) * (crane ? 1 : 3), (r() - 0.5) * 2, (r() - 0.5) * (crane ? 1 : 3)];
    // land: solve y(t) = ground(x(t), z(t)) + half thickness
    let tl = 0.5; for (let it = 0; it < 5; it++) { const x = p.s0[0] + p.v[0] * tl, z = p.s0[2] + p.v[2] * tl, yl = ground(x, z) + Math.min(p.sx, p.sy, p.sz) * 0.5 + r() * 0.3, a = 0.5 * G, b = -p.v[1], c = yl - p.s0[1]; const disc = b * b - 4 * a * c; tl = disc > 0 ? (-b + Math.sqrt(disc)) / (2 * a) : 0.2; }
    p.tl = Math.max(0.05, tl); p.rest = [(r() - 0.5) * 0.6, r() * 6.28, (r() - 0.5) * 0.6];
  }
  plan.end = T + Math.max(...P.map((p) => p.td - T + p.tl));
  return plan;
}

// the block while it's still whole: dropped by k seconds of fall and turned about the base edge on the lean side
const _A = new THREE.Vector3(), _R = new THREE.Quaternion();
function blockAt(plan, p, k, outP, outQ) {
  const tilt = Math.min(plan.tiltMax, plan.tiltRate * k * k) * (plan.spec.leanAmt ?? 1), drop = 0.5 * G * k * k * plan.dropK;
  _A.set(plan.lz, 0, -plan.lx); _R.setFromAxisAngle(_A, tilt);
  outP.set(p.x - plan.pivot[0], p.y, p.z - plan.pivot[2]).applyQuaternion(_R); outP.x += plan.pivot[0]; outP.z += plan.pivot[2]; outP.y -= drop;
  outQ.copy(_R);
}
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _ax = new THREE.Vector3();
// a piece's local (building-frame) transform at tape time t
function pieceLocal(plan, p, t, outP, outQ) {
  if (t < p.td) { if (t <= plan.T + 0.35) { outP.set(p.x, p.y, p.z); outQ.identity(); } else blockAt(plan, p, t - plan.T - 0.35, outP, outQ); return; }
  const a = Math.min(t - p.td, p.tl);
  outP.set(p.s0[0] + p.v[0] * a, p.s0[1] + p.v[1] * a - 0.5 * G * a * a, p.s0[2] + p.v[2] * a);
  _e.set(p.w[0] * a, p.w[1] * a, p.w[2] * a); outQ.setFromEuler(_e); _q2.set(p.q0[0], p.q0[1], p.q0[2], p.q0[3]); outQ.multiply(_q2);
  if (t - p.td > p.tl && !plan.spec.crane && plan.spec.style !== 'mast' && plan.spec.style !== 'stack') { _e.set(p.rest[0], p.rest[1], p.rest[2]); _q2.setFromEuler(_e); outQ.slerp(_q2, Math.min(1, (t - p.td - p.tl) * 6)); }
}

// all the big buildings of a scene: instanced boxes by material, a dust surge each, updated only while something moves
export class Megastructures {
  constructor(root, plans, opts = {}) {
    this.plans = plans; this.root = root;
    const mats = Object.assign({
      slab: new THREE.MeshStandardMaterial({ color: 0x8c8a84, roughness: 0.9 }),
      concrete: new THREE.MeshStandardMaterial({ color: 0xb4ada0, roughness: 0.95 }),
      glass: new THREE.MeshStandardMaterial({ map: facadeTex('glass'), roughness: 0.25, metalness: 0.5 }),
      brick: new THREE.MeshStandardMaterial({ map: facadeTex('brick'), roughness: 0.9 }),
      office: new THREE.MeshStandardMaterial({ map: facadeTex('office'), roughness: 0.6, metalness: 0.15 }),
      steel: new THREE.MeshStandardMaterial({ color: 0x5a5e62, roughness: 0.5, metalness: 0.8 }),
      crane: new THREE.MeshStandardMaterial({ color: 0x2c5a8c, roughness: 0.55, metalness: 0.3 }),
      stackR: new THREE.MeshStandardMaterial({ color: 0x9a2a20, roughness: 0.8 }), stackW: new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.8 }),
    }, opts.mats || {});
    const box = new THREE.BoxGeometry(1, 1, 1), arcGeo = arcSegment();
    this.groups = {};
    for (const pl of plans) for (const p of pl.P) { const key = p.kind === 'arc' ? 'arc:' + p.mat : p.mat; (this.groups[key] ||= []).push([pl, p]); }
    this.meshes = Object.entries(this.groups).map(([key, list]) => {
      const arc = key.startsWith('arc:'), mk = arc ? key.slice(4) : key, m = new THREE.InstancedMesh(arc ? arcGeo : box, mats[mk] || mats.slab, list.length);
      m.castShadow = m.receiveShadow = true; m.frustumCulled = false; root.add(m); return { m, list };
    });
    // dust: soft puffs around each foot
    this.dust = plans.map((pl) => makeDust(pl, opts.dustColor || [0.62, 0.58, 0.52])); this.dust.forEach((d) => root.add(d));
    this.lastT = -1e9; this.update(0, true);
  }
  update(t, force = false) {
    for (const d of this.dust) d.material.uniforms.uT.value = t;
    // nothing moves outside the falls: skip unless a fall is under way, or we just crossed one
    const active = this.plans.some((pl) => t > pl.T - 0.1 && t < pl.end + 1) || this.plans.some((pl) => (this.lastT < pl.T) !== (t < pl.T) || (this.lastT < pl.end) !== (t < pl.end));
    if (!active && !force) { this.lastT = t; return; }
    this.lastT = t;
    for (const { m, list } of this.meshes) {
      list.forEach(([pl, p], i) => {
        pieceLocal(pl, p, t, _p, _q);
        const s = pl.spec, c = Math.cos(s.rot || 0), sn = Math.sin(s.rot || 0);
        const wx = s.x + _p.x * c + _p.z * sn, wz = s.z - _p.x * sn + _p.z * c, wy = s.y + _p.y;
        _q2.setFromAxisAngle(_ax.set(0, 1, 0), s.rot || 0); _q.premultiply(_q2);
        if (p.kind === 'arc') { _q2.setFromAxisAngle(_ax.set(0, 1, 0), p.arc * Math.PI / 2); _q.multiply(_q2); }
        _s.set(p.sx, p.sy, p.sz); _p.set(wx, wy, wz); _m.compose(_p, _q, _s); m.setMatrixAt(i, _m);
      });
      m.instanceMatrix.needsUpdate = true;
    }
  }
  setVisible(on) { for (const { m } of this.meshes) m.visible = on; for (const d of this.dust) d.visible = on; }
}

// a quarter of a hollow concrete bin, unit radius and height, so four of them make a ring
function arcSegment() {
  const g = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true, 0, Math.PI / 2), inner = new THREE.CylinderGeometry(0.9, 0.9, 1, 8, 1, true, 0, Math.PI / 2);
  inner.scale(-1, 1, 1);
  const a = g.toNonIndexed(), b = inner.toNonIndexed(), pos = new Float32Array(a.attributes.position.count * 3 + b.attributes.position.count * 3), nrm = new Float32Array(pos.length);
  pos.set(a.attributes.position.array); pos.set(b.attributes.position.array, a.attributes.position.array.length);
  nrm.set(a.attributes.normal.array); const bn = b.attributes.normal.array.slice(); for (let i = 0; i < bn.length; i++) bn[i] = -bn[i]; nrm.set(bn, a.attributes.normal.array.length);
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return out;
}

function facadeTex(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), r = mulberry32(kind.length * 31);
  if (kind === 'glass') {
    g.fillStyle = '#2a3a46'; g.fillRect(0, 0, 128, 128); const gr = g.createLinearGradient(0, 0, 128, 128); gr.addColorStop(0, 'rgba(160,190,210,.35)'); gr.addColorStop(1, 'rgba(20,30,40,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#8a9298'; g.fillRect(0, 0, 128, 6); g.fillRect(0, 0, 4, 128); g.fillRect(62, 0, 4, 128);
  } else if (kind === 'brick') {
    g.fillStyle = '#7a3a2c'; g.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 6) for (let x = (y / 6) % 2 * 6; x < 128; x += 12) { const v = r(); g.fillStyle = `rgb(${110 + v * 40 | 0},${48 + v * 18 | 0},${36 + v * 12 | 0})`; g.fillRect(x, y, 11, 5); }
    g.fillStyle = '#1a1c1e'; g.fillRect(30, 26, 68, 74); g.fillStyle = '#c8c0b0'; g.fillRect(28, 100, 72, 6); g.fillRect(28, 20, 72, 6); g.fillStyle = '#3a3e42'; g.fillRect(62, 26, 4, 74); g.fillRect(30, 60, 68, 3);
  } else {
    g.fillStyle = '#b8b2a6'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#20262c'; g.fillRect(10, 30, 108, 62); g.fillStyle = 'rgba(200,210,220,.25)'; g.fillRect(10, 30, 50, 30);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// the dust surge: rolls out from the foot along the ground and climbs, then hangs and thins for a minute
function makeDust(pl, col) {
  const r = mulberry32((pl.spec.seed || 1) * 7 + 3), n = 150, g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3)); g.setIndex([0, 1, 2, 0, 2, 3]);
  const a = new Float32Array(n * 4); for (let i = 0; i < n; i++) a.set([r() * 6.283, Math.sqrt(r()), r(), r()], i * 4);
  g.setAttribute('aD', new THREE.InstancedBufferAttribute(a, 4)); g.instanceCount = n;
  const s = pl.spec, mat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uT0: { value: pl.T + 0.4 }, uH: { value: pl.H }, uR: { value: pl.Rpile }, uC: { value: new THREE.Vector3(s.x, s.y, s.z) }, uCol: { value: new THREE.Color(...col) } },
    transparent: true, depthWrite: false,
    vertexShader: `attribute vec4 aD; uniform float uT, uT0, uH, uR; uniform vec3 uC; varying vec2 vUv; varying float vA, vSd, vY;
      void main(){ float age = uT - uT0; vA = 0.0; vUv = position.xy; vSd = aD.w;
        if (age <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        float surge = 1.0 - exp(-age / 6.0), rr = (0.25 + aD.y * 1.6) * uR * (0.4 + 1.2 * surge) + age * 0.6;
        float h = aD.z * uH * (0.15 + 0.55 * min(age / 12.0, 1.0)) + 2.0;
        vec3 c = uC + vec3(cos(aD.x) * rr, h, sin(aD.x) * rr);
        float rad = (6.0 + aD.z * 8.0 + uH * 0.08) * (0.5 + 1.2 * surge);
        vA = smoothstep(0.0, 1.2, age) * (1.0 - smoothstep(40.0, 110.0, age)) * 0.85; vY = aD.z;
        vec4 mv = modelViewMatrix * vec4(c, 1.0); mv.xy += position.xy * rad; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uCol; varying vec2 vUv; varying float vA, vSd, vY;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){ float r = length(vUv); if (r > 1.0 || vA < 0.01) discard;
        float nn = n(vUv * 2.3 + vSd * 13.0) * 0.6 + n(vUv * 5.0 - vSd * 7.0) * 0.4;
        float a = smoothstep(1.0, 0.3, r + (nn - 0.5) * 0.6) * vA;
        vec3 c = uCol * (0.75 + 0.35 * (vUv.y * 0.5 + 0.5) + 0.15 * nn) * (0.85 + 0.15 * vY);
        gl_FragColor = vec4(c, a); }`,
  });
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 3; return m;
}

// solid for bodies and bullets: the building until it goes, the heap after
export function structureBoxes(pl) {
  const s = pl.spec, c = Math.cos(s.rot || 0), sn = Math.sin(s.rot || 0);
  return [
    { x: s.x, z: s.z, c, s: sn, hx: s.w / 2, hz: s.d / 2, y0: s.y - 1, y1: s.y + pl.H, kind: 'tower', walk: false, until: pl.T + 1.2 },
    { x: s.x, z: s.z, c, s: sn, hx: pl.ex * 0.55, hz: pl.ez * 0.55, y0: s.y - 1, y1: s.y + pl.Hpile * 0.7, kind: 'rubble', walk: true, from: pl.T + 3 },
  ];
}
