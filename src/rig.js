// Procedural soldier: a sculpted, smoothly skinned mesh + an instanced GPU-skinning material.
// Every soldier on the beach is one instance of one draw call; bone matrices live in a float texture.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
// light 'pillow' box: 8 shared corners with averaged normals reads as softly rounded at a fraction of the cost
function RoundedBoxGeometry(w, h, d) {
  let g = new THREE.BoxGeometry(w, h, d, 2, 2, 2); g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g); g.computeVertexNormals(); return g;
}

// joint indices (runtime + bind)
export const J = { hips: 0, spine: 1, chest: 2, neck: 3, head: 4, shL: 5, elbL: 6, handL: 7, shR: 8, elbR: 9, handR: 10, hipL: 11, kneeL: 12, ankleL: 13, toeL: 14, hipR: 15, kneeR: 16, ankleR: 17, toeR: 18, grip: 19, muzzle: 20 };
export const NJ = 21;
// bones: [from joint, to joint]
export const B = { pelvis: 0, abd: 1, chest: 2, head: 3, uaL: 4, faL: 5, hdL: 6, uaR: 7, faR: 8, hdR: 9, thL: 10, shnL: 11, ftL: 12, thR: 13, shnR: 14, ftR: 15, rifle: 16 };
export const NB = 17;
export const LEN = { thigh: 0.43, shin: 0.43, ua: 0.28, fa: 0.26 };

// material ids
const M = { UNI: 0, VEST: 1, SKIN: 2, HELM: 3, BOOT: 4, GLOVE: 5, METAL: 6, POUCH: 7, FACE: 8, PAD: 9, FURN: 10, GLASS: 11 };

export function bindJoints() {
  const j = new Float32Array(NJ * 3);
  const set = (k, x, y, z) => { j[k * 3] = x; j[k * 3 + 1] = y; j[k * 3 + 2] = z; };
  set(J.hips, 0, 0.97, 0); set(J.spine, 0, 1.10, 0.005); set(J.chest, 0, 1.33, 0); set(J.neck, 0, 1.5, -0.01); set(J.head, 0, 1.63, 0.01);
  set(J.shL, 0.185, 1.45, -0.01); set(J.elbL, 0.21, 1.17, -0.03); set(J.handL, 0.225, 0.915, 0.0);
  set(J.shR, -0.185, 1.45, -0.01); set(J.elbR, -0.21, 1.17, -0.03); set(J.handR, -0.225, 0.915, 0.0);
  set(J.hipL, 0.095, 0.92, 0); set(J.kneeL, 0.10, 0.495, 0.02); set(J.ankleL, 0.105, 0.075, -0.02); set(J.toeL, 0.105, 0.02, 0.15);
  set(J.hipR, -0.095, 0.92, 0); set(J.kneeR, -0.10, 0.495, 0.02); set(J.ankleR, -0.105, 0.075, -0.02); set(J.toeR, -0.105, 0.02, 0.15);
  set(J.grip, -0.12, 1.0, 0.3); set(J.muzzle, -0.12, 1.0, 1.0);
  return j;
}

// ---------- bone frames from joint positions ----------
const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const T = { a: v(), b: v(), c: v(), x: v(), y: v(), z: v(), L: v(), Lc: v(), R: v(), u: v(), l: v() };
function P(j, k, out) { return out.set(j[k * 3], j[k * 3 + 1], j[k * 3 + 2]); }
function frame(m, origin, y, xRef) {
  T.y.copy(y).normalize();
  T.x.copy(xRef).addScaledVector(T.y, -xRef.dot(T.y));
  if (T.x.lengthSq() < 1e-8) T.x.set(1, 0, 0).addScaledVector(T.y, -T.y.x);
  T.x.normalize();
  T.z.crossVectors(T.x, T.y);
  const e = m.elements;
  e[0] = T.x.x; e[1] = T.x.y; e[2] = T.x.z; e[3] = 0;
  e[4] = T.y.x; e[5] = T.y.y; e[6] = T.y.z; e[7] = 0;
  e[8] = T.z.x; e[9] = T.z.y; e[10] = T.z.z; e[11] = 0;
  e[12] = origin.x; e[13] = origin.y; e[14] = origin.z; e[15] = 1;
}
const H = { a: v(), b: v(), c: v(), d: v(), o: v(), dir: v() };
function hinge(j, a, b, c, fallback, out) {
  P(j, a, H.a); P(j, b, H.b); P(j, c, H.c);
  H.a.subVectors(H.b, H.a).normalize(); H.c.sub(H.b).normalize();
  out.crossVectors(H.a, H.c).addScaledVector(fallback, 0.12);
  if (out.lengthSq() < 1e-6) out.copy(fallback);
  return out.normalize();
}
const _o = v(), _y = v(), _hx = v(), _hx2 = v(), _fwd = v();
// writes NB matrices into mats (array of Matrix4)
export function boneFrames(j, mats) {
  // body left axes
  P(j, J.hipL, T.a); P(j, J.hipR, T.b); T.L.subVectors(T.a, T.b).normalize();
  P(j, J.shL, T.a); P(j, J.shR, T.b); T.Lc.subVectors(T.a, T.b).normalize();
  T.R.copy(T.L).negate();
  const bone = (bi, a, b, xRef) => { P(j, a, _o); P(j, b, _y).sub(_o); frame(mats[bi], _o, _y, xRef); };
  bone(B.pelvis, J.hips, J.spine, T.L);
  T.u.copy(T.L).add(T.Lc).normalize();
  bone(B.abd, J.spine, J.chest, T.u);
  bone(B.chest, J.chest, J.neck, T.Lc);
  bone(B.head, J.neck, J.head, T.Lc);
  const RC = _fwd.copy(T.Lc).negate();
  hinge(j, J.shL, J.elbL, J.handL, RC, _hx); bone(B.uaL, J.shL, J.elbL, _hx); bone(B.faL, J.elbL, J.handL, _hx);
  P(j, J.handL, _o); P(j, J.handL, _y).sub(P(j, J.elbL, T.c)); frame(mats[B.hdL], _o, _y, _hx);
  hinge(j, J.shR, J.elbR, J.handR, RC, _hx); bone(B.uaR, J.shR, J.elbR, _hx); bone(B.faR, J.elbR, J.handR, _hx);
  P(j, J.handR, _o); P(j, J.handR, _y).sub(P(j, J.elbR, T.c)); frame(mats[B.hdR], _o, _y, _hx);
  hinge(j, J.hipL, J.kneeL, J.ankleL, T.L, _hx2); bone(B.thL, J.hipL, J.kneeL, _hx2); bone(B.shnL, J.kneeL, J.ankleL, _hx2); bone(B.ftL, J.ankleL, J.toeL, _hx2);
  hinge(j, J.hipR, J.kneeR, J.ankleR, T.L, _hx2); bone(B.thR, J.hipR, J.kneeR, _hx2); bone(B.shnR, J.kneeR, J.ankleR, _hx2); bone(B.ftR, J.ankleR, J.toeR, _hx2);
  bone(B.rifle, J.grip, J.muzzle, T.Lc);
}

// ---------- mesh construction (in bind space) ----------
class MeshBuilder {
  constructor() { this.pos = []; this.nrm = []; this.si = []; this.sw = []; this.mat = []; this.idx = []; this.sd = []; this.side = -1; }
  vert(p, n, inds, ws, mat) {
    this.pos.push(p.x, p.y, p.z); this.nrm.push(n.x, n.y, n.z);
    const i4 = [0, 0, 0, 0], w4 = [0, 0, 0, 0];
    inds.forEach((b, k) => { i4[k] = b; w4[k] = ws[k]; });
    const s = w4[0] + w4[1] + w4[2] + w4[3];
    this.si.push(...i4); this.sw.push(...w4.map((w) => w / s)); this.mat.push(mat); this.sd.push(this.side);
    return this.pos.length / 3 - 1;
  }
  // add a THREE geometry rigidly to bone b (geometry already in bind space)
  addGeo(g, bones, weights, mat) {
    const gg = g.index ? g : g;
    const p = gg.attributes.position, n = gg.attributes.normal;
    const base = this.pos.length / 3;
    const pv = v(), nv = v();
    for (let i = 0; i < p.count; i++) {
      pv.fromBufferAttribute(p, i); nv.fromBufferAttribute(n, i);
      const w = typeof bones === 'function' ? bones(pv) : [bones, weights];
      this.vert(pv, nv, w[0], w[1], mat);
    }
    if (gg.index) for (let i = 0; i < gg.index.count; i++) this.idx.push(base + gg.index.getX(i));
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('skinIdx', new THREE.Float32BufferAttribute(this.si, 4));
    g.setAttribute('skinW', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setAttribute('matId', new THREE.Float32BufferAttribute(this.mat, 1));
    g.setAttribute('sideMask', new THREE.Float32BufferAttribute(this.sd, 1));
    g.setIndex(this.idx);
    return g;
  }
}

// loft a tube along segment a->b with an elliptical, varying cross-section
function tube(mb, a, b, xAxis, prof, rings, sides, weightFn, mat, cap0 = true, cap1 = true) {
  const y = v().subVectors(b, a); const len = y.length(); y.normalize();
  const x = v().copy(xAxis).addScaledVector(y, -xAxis.dot(y)).normalize();
  const z = v().crossVectors(x, y);
  const grid = [];
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    const [rx, rz, ox = 0, oz = 0] = prof(t);
    const c = v().copy(a).addScaledVector(y, len * t).addScaledVector(x, ox).addScaledVector(z, oz);
    const row = [];
    for (let s = 0; s < sides; s++) {
      const ang = (s / sides) * Math.PI * 2;
      const cx = Math.cos(ang), cz = Math.sin(ang);
      const p = v().copy(c).addScaledVector(x, cx * rx).addScaledVector(z, cz * rz);
      const n = v().copy(x).multiplyScalar(cx / rx).addScaledVector(z, cz / rz).normalize();
      const w = weightFn(t);
      row.push(mb.vert(p, n, w[0], w[1], mat));
    }
    grid.push(row);
  }
  for (let r = 0; r < rings; r++) for (let s = 0; s < sides; s++) {
    const a0 = grid[r][s], a1 = grid[r][(s + 1) % sides], b0 = grid[r + 1][s], b1 = grid[r + 1][(s + 1) % sides];
    mb.idx.push(a0, b0, a1, a1, b0, b1);
  }
  const cap = (r, dir, t) => {
    const [rx, rz, ox = 0, oz = 0] = prof(t);
    const c = v().copy(a).addScaledVector(y, len * t + dir * Math.min(rx, rz) * 0.5).addScaledVector(x, ox).addScaledVector(z, oz);
    const w = weightFn(t);
    const ci = mb.vert(c, v().copy(y).multiplyScalar(dir), w[0], w[1], mat);
    for (let s = 0; s < sides; s++) { const i0 = grid[r][s], i1 = grid[r][(s + 1) % sides]; if (dir > 0) mb.idx.push(i0, ci, i1); else mb.idx.push(i0, i1, ci); }
  };
  if (cap0) cap(0, -1, 0);
  if (cap1) cap(rings, 1, 1);
}

const ss = (a, b, t) => { const k = Math.min(1, Math.max(0, (t - a) / (b - a))); return k * k * (3 - 2 * k); };

export function buildSoldierGeometry(bindMats) {
  const jb = bindJoints();
  const p = (k) => P(jb, k, v());
  const mb = new MeshBuilder();
  const X = new THREE.Vector3(1, 0, 0);
  const toBind = (g, bi) => g.applyMatrix4(bindMats[bi]);
  // ---- torso loft (vertical), weights by height ----
  const sec = [ // y, rx, rz, oz
    [0.84, 0.12, 0.09, 0.0], [0.90, 0.165, 0.115, 0.0], [0.97, 0.172, 0.12, -0.005], [1.05, 0.155, 0.105, 0.005], [1.14, 0.158, 0.11, 0.01],
    [1.24, 0.175, 0.12, 0.012], [1.33, 0.185, 0.125, 0.01], [1.41, 0.18, 0.115, 0.0], [1.47, 0.14, 0.095, -0.01], [1.51, 0.07, 0.06, -0.01],
  ];
  const torsoW = (yy) => {
    if (yy < 1.0) return [[B.pelvis], [1]];
    if (yy < 1.12) { const k = ss(1.0, 1.12, yy); return [[B.pelvis, B.abd], [1 - k, k]]; }
    if (yy < 1.24) return [[B.abd], [1]];
    if (yy < 1.34) { const k = ss(1.24, 1.34, yy); return [[B.abd, B.chest], [1 - k, k]]; }
    return [[B.chest], [1]];
  };
  {
    const sides = 16, grid = [];
    sec.forEach(([yy, rx, rz, oz]) => {
      const row = [];
      for (let s = 0; s < sides; s++) {
        const ang = (s / sides) * Math.PI * 2; const cx = Math.cos(ang), cz = Math.sin(ang);
        // flatten the back slightly, round the chest
        const rzz = cz > 0 ? rz : rz * 0.92;
        const pp = v(cx * rx, yy, cz * rzz + oz);
        const n = v(cx / rx, 0, cz / rzz).normalize();
        const w = torsoW(yy);
        row.push(mb.vert(pp, n, w[0], w[1], M.UNI));
      }
      grid.push(row);
    });
    for (let r = 0; r < grid.length - 1; r++) for (let s = 0; s < sides; s++) {
      const a0 = grid[r][s], a1 = grid[r][(s + 1) % sides], b0 = grid[r + 1][s], b1 = grid[r + 1][(s + 1) % sides];
      mb.idx.push(a0, a1, b0, a1, b1, b0);
    }
  }
  // neck
  tube(mb, v(0, 1.47, -0.01), v(0, 1.6, 0.0), X, () => [0.055, 0.05], 3, 10, (t) => [[B.chest, B.head], [1 - ss(0.2, 0.9, t), ss(0.2, 0.9, t)]], M.SKIN, false, false);
  // head
  const hc = v(0, 1.635, 0.012);
  const head = new THREE.SphereGeometry(1, 14, 10); head.scale(0.092, 0.112, 0.103); head.translate(hc.x, hc.y, hc.z);
  mb.addGeo(head, [B.head], [1], M.FACE);
  const jaw = new RoundedBoxGeometry(0.11, 0.06, 0.1, 1, 0.03); jaw.translate(0, 1.565, 0.035); mb.addGeo(jaw, [B.head], [1], M.FACE);
  const nose = new THREE.ConeGeometry(0.018, 0.04, 6); nose.rotateX(Math.PI / 2 + 0.3); nose.translate(0, 1.63, 0.118); mb.addGeo(nose, [B.head], [1], M.FACE);
  [-1, 1].forEach((s) => { const ear = new THREE.SphereGeometry(0.022, 8, 6); ear.scale(0.5, 1, 0.8); ear.translate(s * 0.092, 1.635, 0.0); mb.addGeo(ear, [B.head], [1], M.FACE); });
  // helmet (ops-core style) + NVG mount, rails, chin strap
  const helm = new THREE.SphereGeometry(1, 16, 7, 0, Math.PI * 2, 0, Math.PI * 0.56); helm.scale(0.128, 0.115, 0.14); helm.translate(0, 1.655, 0.0);
  mb.addGeo(helm, [B.head], [1], M.HELM);
  const rim = new THREE.TorusGeometry(1, 0.06, 4, 18); rim.rotateX(Math.PI / 2); rim.scale(0.125, 1, 0.137); rim.translate(0, 1.66, 0.0); mb.addGeo(rim, [B.head], [1], M.HELM);
  [-1, 1].forEach((s) => { const rail = new RoundedBoxGeometry(0.012, 0.03, 0.11, 1, 0.005); rail.translate(s * 0.127, 1.655, 0.0); mb.addGeo(rail, [B.head], [1], M.METAL); });
  const shroud = new RoundedBoxGeometry(0.05, 0.035, 0.02, 1, 0.006); shroud.translate(0, 1.73, 0.13); mb.addGeo(shroud, [B.head], [1], M.METAL);
  const nvgArm = new THREE.BoxGeometry(0.03, 0.03, 0.05); nvgArm.translate(0, 1.745, 0.155); mb.addGeo(nvgArm, [B.head], [1], M.METAL);
  const cover = new RoundedBoxGeometry(0.07, 0.04, 0.05, 1, 0.01); cover.translate(0.05, 1.74, -0.1); mb.addGeo(cover, [B.head], [1], M.POUCH); // battery pack
  // plate carrier: front & back plates, cummerbund, shoulder straps, pouches
  const front = new RoundedBoxGeometry(0.29, 0.31, 0.05, 1, 0.02); front.translate(0, 1.29, 0.125); mb.addGeo(front, (pp) => torsoW(pp.y), null, M.VEST);
  const back = new RoundedBoxGeometry(0.30, 0.33, 0.05, 1, 0.02); back.translate(0, 1.30, -0.125); mb.addGeo(back, (pp) => torsoW(pp.y), null, M.VEST);
  [-1, 1].forEach((s) => {
    const cb = new RoundedBoxGeometry(0.05, 0.16, 0.22, 1, 0.015); cb.translate(s * 0.175, 1.2, 0.0); mb.addGeo(cb, (pp) => torsoW(pp.y), null, M.VEST);
    const st = new RoundedBoxGeometry(0.06, 0.03, 0.26, 1, 0.01); st.translate(s * 0.1, 1.475, 0.0); mb.addGeo(st, [B.chest], [1], M.VEST);
  });
  for (let k = 0; k < 3; k++) { const pch = new RoundedBoxGeometry(0.075, 0.13, 0.045, 1, 0.012); pch.translate(-0.085 + k * 0.085, 1.2, 0.165); mb.addGeo(pch, (pp) => torsoW(pp.y), null, M.POUCH); }
  const radio = new RoundedBoxGeometry(0.07, 0.14, 0.05, 1, 0.012); radio.translate(0.12, 1.34, 0.165); mb.addGeo(radio, [B.chest], [1], M.POUCH);
  const ant = new THREE.CylinderGeometry(0.004, 0.004, 0.32, 4); ant.translate(0.16, 1.55, -0.14); mb.addGeo(ant, [B.chest], [1], M.METAL);
  const pack = new RoundedBoxGeometry(0.27, 0.32, 0.12, 1, 0.04); pack.translate(0, 1.28, -0.2); mb.addGeo(pack, [B.chest], [1], M.POUCH);
  // belt + pouches
  const belt = new THREE.TorusGeometry(1, 0.08, 4, 16); belt.rotateX(Math.PI / 2); belt.scale(0.172, 0.5, 0.122); belt.translate(0, 0.985, 0); mb.addGeo(belt, (pp) => torsoW(pp.y), null, M.POUCH);
  [-1, 1].forEach((s) => { const dp = new RoundedBoxGeometry(0.06, 0.09, 0.08, 1, 0.012); dp.translate(s * 0.16, 0.96, -0.08); mb.addGeo(dp, [B.pelvis], [1], M.POUCH); });
  // arms
  [[J.shL, J.elbL, J.handL, B.uaL, B.faL, B.hdL, 1], [J.shR, J.elbR, J.handR, B.uaR, B.faR, B.hdR, -1]].forEach(([sh, el, hd, bu, bf, bh, s]) => {
    const S = p(sh), E = p(el), Hd = p(hd);
    const deltoid = new THREE.SphereGeometry(1, 10, 7); deltoid.scale(0.07, 0.075, 0.07); deltoid.translate(S.x - s * 0.005, S.y - 0.01, S.z);
    mb.addGeo(deltoid, (pp) => [[B.chest, bu], [0.45, 0.55]], null, M.UNI);
    tube(mb, S, E, X, (t) => [0.058 - 0.012 * t + 0.006 * Math.sin(t * Math.PI), 0.056 - 0.01 * t], 6, 10, (t) => t < 0.15 ? [[B.chest, bu], [0.35 * (1 - t / 0.15), 1 - 0.35 * (1 - t / 0.15)]] : t > 0.85 ? [[bu, bf], [1 - 0.5 * ss(0.85, 1, t), 0.5 * ss(0.85, 1, t)]] : [[bu], [1]], M.UNI);
    tube(mb, E, Hd, X, (t) => [0.046 - 0.008 * t + 0.004 * Math.sin(t * 3), 0.042 - 0.008 * t], 6, 10, (t) => t < 0.15 ? [[bu, bf], [0.5 * (1 - t / 0.15), 1 - 0.5 * (1 - t / 0.15)]] : [[bf], [1]], M.UNI);
    const cuff = new THREE.CylinderGeometry(0.044, 0.044, 0.05, 10); const dir = v().subVectors(Hd, E).normalize();
    cuff.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)); cuff.translate(...v().copy(Hd).addScaledVector(dir, -0.04).toArray());
    mb.addGeo(cuff, [bf], [1], M.GLOVE);
    const hand = new RoundedBoxGeometry(0.05, 0.1, 0.085, 1, 0.02); hand.translate(0, -0.05, 0.01); toBind(hand, bh); mb.addGeo(hand, [bh], [1], M.GLOVE);
    const thumb = new RoundedBoxGeometry(0.025, 0.05, 0.025, 1, 0.01); thumb.translate(0.0, -0.035, 0.05); toBind(thumb, bh); mb.addGeo(thumb, [bh], [1], M.GLOVE);
    const elbPad = new RoundedBoxGeometry(0.06, 0.07, 0.03, 1, 0.012); elbPad.translate(0, 0.0, -0.045); toBind(elbPad, bf); mb.addGeo(elbPad, [bf], [1], M.PAD);
  });
  // legs
  [[J.hipL, J.kneeL, J.ankleL, J.toeL, B.thL, B.shnL, B.ftL, 1], [J.hipR, J.kneeR, J.ankleR, J.toeR, B.thR, B.shnR, B.ftR, -1]].forEach(([hp, kn, an, to, bt, bs, bf, s]) => {
    const Hp = p(hp), K = p(kn), A = p(an);
    tube(mb, v(Hp.x * 0.85, Hp.y + 0.06, Hp.z), K, X, (t) => [0.088 - 0.03 * t + 0.008 * Math.sin(t * Math.PI), 0.09 - 0.034 * t, 0, 0.01 * Math.sin(t * Math.PI)], 7, 12,
      (t) => t < 0.2 ? [[B.pelvis, bt], [0.6 * (1 - t / 0.2), 1 - 0.6 * (1 - t / 0.2)]] : t > 0.86 ? [[bt, bs], [1 - 0.5 * ss(0.86, 1, t), 0.5 * ss(0.86, 1, t)]] : [[bt], [1]], M.UNI);
    // cargo pocket
    const cargo = new RoundedBoxGeometry(0.035, 0.13, 0.11, 1, 0.012); cargo.translate(Hp.x + s * 0.075, 0.72, 0.0); mb.addGeo(cargo, [bt], [1], M.UNI);
    tube(mb, K, v(A.x, A.y + 0.04, A.z), X, (t) => [0.06 - 0.016 * t + 0.006 * Math.sin(t * 2.5), 0.064 - 0.02 * t, 0, -0.01 * Math.sin(t * Math.PI)], 6, 10,
      (t) => t < 0.14 ? [[bt, bs], [0.5 * (1 - t / 0.14), 1 - 0.5 * (1 - t / 0.14)]] : [[bs], [1]], M.UNI);
    const kp = new RoundedBoxGeometry(0.085, 0.1, 0.04, 1, 0.015); kp.translate(0, 0.02, 0.06); toBind(kp, bs); mb.addGeo(kp, [bt, bs], [0.5, 0.5], M.PAD);
    // boot: shaft + foot
    tube(mb, v(A.x, A.y - 0.02, A.z), v(A.x, A.y + 0.15, A.z), X, () => [0.058, 0.062], 2, 10, () => [[bs], [1]], M.BOOT, false, true);
    const foot = new RoundedBoxGeometry(0.1, 0.085, 0.27, 1, 0.03); foot.translate(0, -0.035, 0.07);
    // foot bone y runs ankle->toe; build in a frame: x left, y forward, z down
    const fg = new RoundedBoxGeometry(0.1, 0.27, 0.085, 1, 0.03); fg.translate(0, 0.06, 0.025); toBind(fg, bf); mb.addGeo(fg, [bf], [1], M.BOOT);
    const sole = new THREE.BoxGeometry(0.105, 0.28, 0.02); sole.translate(0, 0.06, 0.07); toBind(sole, bf); mb.addGeo(sole, [bf], [1], M.METAL);
  });
  // rifles (bone y = barrel direction, x = body left, z = down). Built to real proportions.
  const rif = (g, mat) => { toBind(g, B.rifle); mb.addGeo(g, [B.rifle], [1], mat); };
  const bx = (w, l, h, x, y, z, mat, r = 0.005) => rif(new RoundedBoxGeometry(w, l, h, 1, r).translate(x, y, z), mat);
  const cy = (r0, r1, l, yy, zz, mat, seg = 10) => rif(new THREE.CylinderGeometry(r1, r0, l, seg).translate(0, yy, zz), mat);
  // Defender: M7 (SIG MCX Spear) 6.8x51, 13" barrel, ~7" suppressor, 20-rd mag, folding stock, XM157 optic
  mb.side = 0;
  bx(0.05, 0.30, 0.07, 0, 0.02, -0.02, M.FURN);             // upper/lower receiver (coyote)
  bx(0.056, 0.32, 0.064, 0, 0.33, -0.024, M.FURN);          // M-LOK handguard
  cy(0.022, 0.022, 0.18, 0.58, -0.024, M.METAL, 12);        // SLX suppressor
  bx(0.034, 0.075, 0.17, 0, 0.07, 0.1, M.METAL);            // 20-rd 6.8 magazine
  bx(0.03, 0.045, 0.1, 0, -0.07, 0.065, M.METAL);           // grip
  bx(0.03, 0.2, 0.05, 0, -0.24, 0.0, M.METAL);              // folding stock
  bx(0.05, 0.03, 0.11, 0, -0.35, 0.02, M.METAL);            // buttpad
  bx(0.06, 0.15, 0.065, 0, 0.06, -0.1, M.METAL);            // XM157 body
  cy(0.024, 0.024, 0.04, 0.15, -0.098, M.METAL);            // objective bell
  bx(0.046, 0.012, 0.046, 0, 0.17, -0.098, M.GLASS, 0.003);
  // Invader: fictional modern bullpup, mag behind the grip, long top rail, reflex sight, brake
  mb.side = 1;
  bx(0.06, 0.62, 0.09, 0, 0.0, -0.01, M.FURN, 0.012);       // polymer body/shell
  bx(0.05, 0.1, 0.06, 0, -0.06, 0.07, M.FURN);              // grip
  bx(0.034, 0.08, 0.16, 0, -0.18, 0.1, M.METAL);            // curved 30-rd mag (behind grip)
  bx(0.025, 0.5, 0.012, 0, 0.05, -0.062, M.METAL);          // top rail
  bx(0.04, 0.06, 0.05, 0, 0.12, -0.09, M.METAL);            // reflex sight
  cy(0.012, 0.012, 0.18, 0.38, -0.015, M.METAL, 8);         // barrel
  cy(0.017, 0.017, 0.05, 0.48, -0.015, M.METAL, 8);         // muzzle brake
  mb.side = -1;
  return mb.build();
}

// ---------- instanced GPU-skinning material ----------
const SKIN_GLSL = /* glsl */`
  uniform sampler2D uBones;
  attribute vec4 skinIdx; attribute vec4 skinW; attribute float matId; attribute float sideMask;
  attribute float aInst; attribute float aSide; attribute float aTone;
  varying vec3 vBind; varying float vMat; varying float vSide; varying float vTone;
  mat4 boneM(float b){
    int x = int(b) * 4; int y = int(aInst);
    return mat4(texelFetch(uBones, ivec2(x, y), 0), texelFetch(uBones, ivec2(x + 1, y), 0), texelFetch(uBones, ivec2(x + 2, y), 0), texelFetch(uBones, ivec2(x + 3, y), 0));
  }
  mat4 skinMat(){ return skinW.x * boneM(skinIdx.x) + skinW.y * boneM(skinIdx.y) + skinW.z * boneM(skinIdx.z) + skinW.w * boneM(skinIdx.w); }
`;

const PALETTE_GLSL = /* glsl */`
  varying vec3 vBind; varying float vMat; varying float vSide; varying float vTone;
  float h3(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
    return mix(mix(mix(h3(i), h3(i+vec3(1,0,0)), f.x), mix(h3(i+vec3(0,1,0)), h3(i+vec3(1,1,0)), f.x), f.y),
               mix(mix(h3(i+vec3(0,0,1)), h3(i+vec3(1,0,1)), f.x), mix(h3(i+vec3(0,1,1)), h3(i+vec3(1,1,1)), f.x), f.y), f.z); }
  vec3 camo(vec3 p, float side){
    if (side < 0.5) { // multi-terrain blotches
      float a = n3(p*7.0) * 0.65 + n3(p*17.0) * 0.35;
      float b = n3(p*9.0 + 13.1) * 0.6 + n3(p*23.0) * 0.4;
      vec3 c = vec3(0.54,0.49,0.37);
      c = mix(c, vec3(0.40,0.40,0.27), step(0.56, a));
      c = mix(c, vec3(0.42,0.33,0.22), step(0.62, b));
      c = mix(c, vec3(0.66,0.61,0.47), step(0.72, n3(p*13.0 + 5.0)));
      c = mix(c, vec3(0.20,0.18,0.13), step(0.79, n3(p*21.0 + 9.0)));
      return c;
    }
    vec3 q = floor(p * 45.0) / 45.0; // digital
    float a = n3(q*6.0) * 0.7 + n3(q*15.0)*0.3;
    vec3 c = vec3(0.27,0.30,0.28);
    c = mix(c, vec3(0.18,0.21,0.19), step(0.52, a));
    c = mix(c, vec3(0.36,0.38,0.33), step(0.66, n3(q*9.0+3.0)));
    c = mix(c, vec3(0.10,0.11,0.10), step(0.74, n3(q*12.0+7.0)));
    return c;
  }
  vec3 skinTone(float t){ return mix(mix(vec3(0.86,0.66,0.53), vec3(0.62,0.44,0.32), smoothstep(0.0,0.5,t)), vec3(0.32,0.21,0.15), smoothstep(0.5,1.0,t)); }
  vec3 matColor(out float rough, out float metal){
    int m = int(vMat + 0.5); metal = 0.0; rough = 0.88;
    bool inv = vSide > 0.5;
    if (m == 0) return camo(vBind, vSide);
    if (m == 1) { rough = 0.82; return inv ? vec3(0.13,0.14,0.13) : mix(vec3(0.42,0.40,0.30), camo(vBind*1.3, 0.0), 0.35); }
    if (m == 2) { rough = 0.6; return inv ? vec3(0.08) : skinTone(vTone); }
    if (m == 3) { rough = 0.7; return inv ? vec3(0.10,0.11,0.11) : vec3(0.40,0.38,0.30); }
    if (m == 4) { rough = 0.75; return inv ? vec3(0.05) : vec3(0.40,0.33,0.24); }
    if (m == 5) { rough = 0.8; return inv ? vec3(0.06) : vec3(0.30,0.27,0.21); }
    if (m == 6) { rough = 0.42; metal = 0.6; return vec3(0.06,0.065,0.07); }
    if (m == 7) { rough = 0.85; return inv ? vec3(0.16,0.18,0.16) : vec3(0.44,0.41,0.30); }
    if (m == 8) { // face: invaders wear balaclavas with an eye slit
      if (inv) { float slit = step(abs(vBind.y - 1.648), 0.017) * step(0.06, vBind.z); rough = 0.85; return mix(vec3(0.07), skinTone(vTone*0.6+0.2), slit); }
      rough = 0.55; return skinTone(vTone);
    }
    if (m == 9) { rough = 0.6; return inv ? vec3(0.08) : vec3(0.35,0.32,0.25); }
    if (m == 10) { rough = 0.6; return inv ? vec3(0.10,0.09,0.08) : vec3(0.45,0.40,0.30); }
    rough = 0.05; metal = 0.3; return vec3(0.03,0.05,0.07);
  }
`;

export function makeSoldierMaterial(bonesTex) {
  const uni = { uBones: { value: bonesTex } };
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uBones = uni.uBones;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + SKIN_GLSL)
      .replace('#include <beginnormal_vertex>', 'mat4 sk = skinMat();\nvec3 objectNormal = normalize(mat3(sk) * normal);\nvBind = position; vMat = matId; vSide = aSide; vTone = aTone;')
      .replace('#include <begin_vertex>', 'vec3 transformed = (sk * vec4(position, 1.0)).xyz;\nif (sideMask > -0.5 && abs(sideMask - aSide) > 0.5) transformed = vec3(0.0, -500.0, 0.0);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + PALETTE_GLSL)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'float mRough, mMetal; vec3 mCol = matColor(mRough, mMetal); vec4 diffuseColor = vec4(pow(mCol, vec3(2.2)), opacity);')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mRough;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = mMetal;');
  };
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (sh) => {
    sh.uniforms.uBones = uni.uBones;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + SKIN_GLSL)
      .replace('#include <begin_vertex>', 'vec3 transformed = (skinMat() * vec4(position, 1.0)).xyz;\nif (sideMask > -0.5 && abs(sideMask - aSide) > 0.5) transformed = vec3(0.0, -500.0, 0.0);');
  };
  return { mat, depth };
}
