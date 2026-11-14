// All soldiers: one instanced, GPU-skinned draw call. Living bodies are driven by mocap + procedural layers;
// the dead are precomputed verlet ragdolls (which therefore rewind perfectly).
import { loadJSON, photoTex } from './assets.js';
import * as THREE from 'three';
import { J, NJ, NB, B, bindJoints, boneFrames, buildSoldierGeometry, makeSoldierMaterial } from './rig.js';
import { posePose, simulateRagdoll, variation, stanceOffset, lastHeadBasis, STEP_C, clipPose } from './anim.js';
import { MODE, SHOT_F, F, HZ } from './sim.js';
import { styleOf, gaitStride } from './gait.js';
import { CLIPS } from './mocap.js';
import { heightFast } from './terrain.js';

// a body caught right under a shell comes apart: these pieces fly as rigid groups
const GIB_GROUPS = [
  { bones: [B.pelvis, B.abd, B.chest], c: [J.spine], sp: 3.5, up: 3 },
  { bones: [B.head], c: [J.head], sp: 10, up: 6 },
  { bones: [B.uaL, B.faL, B.hdL], c: [J.elbL], sp: 9, up: 5 },
  { bones: [B.uaR, B.faR, B.hdR], c: [J.elbR], sp: 9, up: 5 },
  { bones: [B.thL, B.shnL, B.ftL], c: [J.kneeL], sp: 7, up: 4 },
  { bones: [B.thR, B.shnR, B.ftR], c: [J.kneeR], sp: 7, up: 4 },
  { bones: [B.rifle], c: [J.grip], sp: 11, up: 5 },
];
const GIB_KINDS = { mortar: 2.0, shell: 2.6, mlrs: 2.6, rocket: 2.3, drone: 1.6 };
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const wrapA = (d) => { while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
// How far a sprung mass (the weapon, hung on the arms) is from where the eye is pointing, after the line of sight has
// turned: the error of an under-damped second-order follower to a unit ramp lasting one recording interval. Tabulated
// as the running integral of the step-response error so any ramp is two lookups. This is what makes a snap of aim
// arrive late, overshoot and settle — and it is still only a function of the recorded samples either side of tau.
const SPR = (() => {
  const om = 15, ze = 0.4, wd = om * Math.sqrt(1 - ze * ze), n = 1400, dt = 0.001, G = new Float32Array(n + 1);
  let acc = 0;
  for (let k = 0; k < n; k++) { const a = (k + 0.5) * dt; acc += -Math.exp(-ze * om * a) * (Math.cos(wd * a) + ze * om / wd * Math.sin(wd * a)) * dt; G[k + 1] = acc; }
  return { G, n, dt };
})();
function sprI(a) { if (a <= 0) return 0; const f = Math.min(SPR.n - 1.001, a / SPR.dt), i = Math.floor(f); return SPR.G[i] + (SPR.G[i + 1] - SPR.G[i]) * (f - i); }
const TK = 6;   // floats per smoothed-track sample: x y z yaw crouch clock
const E = { x: 0, y: 0, z: 0, yaw: 0, crouch: 0, vx: 0, vy: 0, vz: 0, vyaw: 0, ax: 0, az: 0, C: 0, cad: 0 };
const E2 = { x: 0, y: 0, z: 0, yaw: 0, crouch: 0, vx: 0, vy: 0, vz: 0, vyaw: 0, ax: 0, az: 0, C: 0, cad: 0 };
const SO = [0, 0, 0], HB = new Float64Array(9), HL = [0, 0, 0];

function lastBefore(arr, t) { // index of last element <= t, or -1
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] <= t) lo = m + 1; else hi = m; }
  return lo - 1;
}

export class Soldiers {
  // the downloaded soldier (re-skinned onto this rig offline, in this rig's bind pose) in place of the sculpted one
  usePhoto() {
    Promise.all([loadJSON('models/soldier.json'), photoTex('soldier', 'd'), photoTex('soldier', 'n')]).then(([j, d, n]) => {
      const u8 = (b) => { const s = atob(b), a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; };
      const V = j.verts, pos = new Float32Array(u8(j.pos).buffer), uv = new Float32Array(u8(j.uv).buffer), nb = new Int8Array(u8(j.nrm).buffer), sib = u8(j.si), swb = u8(j.sw), mb = u8(j.mat), idx = new Uint16Array(u8(j.idx).buffer);
      const nrm = new Float32Array(V * 3), si = new Float32Array(V * 4), sw = new Float32Array(V * 4), dom = new Float32Array(V), mat = new Float32Array(V), sd = new Float32Array(V).fill(-1);
      for (let i = 0; i < V * 3; i++) nrm[i] = nb[i] / 127;
      for (let i = 0; i < V; i++) { let b = 0, bw = -1, t = 0; for (let k = 0; k < 4; k++) { const w = swb[i * 4 + k]; si[i * 4 + k] = sib[i * 4 + k]; sw[i * 4 + k] = w; t += w; if (w > bw) { bw = w; b = sib[i * 4 + k]; } } for (let k = 0; k < 4; k++) sw[i * 4 + k] /= t || 1; dom[i] = b; mat[i] = mb[i]; }
      const g = this.mesh.geometry, A = (a, n2) => new THREE.Float32BufferAttribute(a, n2);
      g.setAttribute('position', A(pos, 3)); g.setAttribute('normal', A(nrm, 3)); g.setAttribute('uv', A(uv, 2)); g.setAttribute('skinIdx', A(si, 4)); g.setAttribute('skinW', A(sw, 4));
      g.setAttribute('skinDom', A(dom, 1)); g.setAttribute('matId', A(mat, 1)); g.setAttribute('sideMask', A(sd, 1)); g.setIndex(new THREE.BufferAttribute(idx, 1));
      d.repeat.set(1, 1); n.repeat.set(1, 1); this.mat.userData.setPhoto(d, n); this.photo = true;
    }).catch((e) => { if (!/missing|off/.test(String(e && e.message))) console.error('soldier model', e); });
  }
  constructor(scene, S) {
    this.S = S; this.N = S.N;
    const N = this.N;
    // bind pose
    this.mats = Array.from({ length: NB }, () => new THREE.Matrix4());
    boneFrames(bindJoints(), this.mats);
    this.bindInv = this.mats.map((m) => m.clone().invert());
    const base = buildSoldierGeometry(this.mats.map((m) => m.clone()));
    const g = new THREE.InstancedBufferGeometry();
    for (const k of Object.keys(base.attributes)) g.setAttribute(k, base.attributes[k]);
    g.setIndex(base.index);
    const inst = new Float32Array(N), side = new Float32Array(N), tone = new Float32Array(N);
    for (let i = 0; i < N; i++) { inst[i] = i; side[i] = S.actors[i].side; tone[i] = S.actors[i].skin; }
    g.setAttribute('aInst', new THREE.InstancedBufferAttribute(inst, 1));
    g.setAttribute('aSide', new THREE.InstancedBufferAttribute(side, 1));
    g.setAttribute('aTone', new THREE.InstancedBufferAttribute(tone, 1));
    g.instanceCount = N;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.boneData = new Float32Array(N * NB * 16);
    this.boneTex = new THREE.DataTexture(this.boneData, NB * 4, N, THREE.RGBAFormat, THREE.FloatType);
    this.boneTex.magFilter = this.boneTex.minFilter = THREE.NearestFilter; this.boneTex.needsUpdate = true;
    const { mat, depth } = makeSoldierMaterial(this.boneTex);
    this.mesh = new THREE.Mesh(g, mat); this.mat = mat;
    this.mesh.customDepthMaterial = depth;
    this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    console.log('soldier mesh verts', base.attributes.position.count);

    // event tables per actor
    const fire = Array.from({ length: N }, () => []), hits = Array.from({ length: N }, () => []);
    const A = S.shots;
    for (let k = 0; k < S.nShots; k++) {
      const o = k * SHOT_F; const sh = A[o + 8], tg = A[o + 9];
      if (sh >= 0) fire[sh].push(A[o]);
      if (tg >= 0 && A[o + 10] === 3) hits[tg].push([A[o + 1], A[o + 5] - A[o + 2], A[o + 7] - A[o + 4]]);
    }
    this.fireT = fire.map((f) => Float32Array.from(f));
    hits.forEach((h) => h.sort((a, b) => a[0] - b[0]));
    this.hitT = hits.map((h) => Float32Array.from(h.map((x) => x[0])));
    this.hitD = hits.map((h) => h.map((x) => { const l = Math.hypot(x[1], x[2]) || 1; return [x[1] / l, x[2] / l]; }));
    this.joints = new Float32Array(NJ * 3);
    this.ragdolls = new Array(N).fill(null); this.gib = new Array(N).fill(null); this.gibList = []; this.slump = new Float32Array(N); this.getup = new Array(N).fill(null);
    this.pp = { u: 0, speed: 0, crouch: 0, pitch: 0, idleT: 0, recoil: 0, flinch: 0, fdx: 0, fdz: 0, reload: -1, mode: 0, ft: null, ftBuf: new Float32Array(16) };
    this.tracks = new Array(N).fill(null); this.vars = new Array(N).fill(null);
    this.raw = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
    this.live = new Map();   // kills made off the tape (forward play): actor -> { t, rag, tone }
    // rounds and shells that landed close: what a man ducks from
    this.nearT = null;
    // level of detail by distance from whoever is looking: the camera of the last render, unless lodPos is set
    this.lodPos = null; this._cam = new THREE.Vector3(); this._camOk = false;
    this.mesh.onBeforeRender = (r, sc, cam) => { if (cam && cam.isPerspectiveCamera) { this._cam.setFromMatrixPosition(cam.matrixWorld); this._camOk = true; } };
    this.keys = { head: new THREE.Vector3(), neck: new THREE.Vector3(), pelvis: new THREE.Vector3(), headM: new THREE.Matrix4() };
    this.tmpM = new THREE.Matrix4();
  }

  // precompute every death's ragdoll (needs the playback sampler)
  prepare(pb) {
    this.pb = pb;
    // deaths nearest the opening of the tape first; the rest are computed a few per frame
    this.pending = this.S.actors.filter((a) => a.deathTime > 0).sort((a, b) => b.deathTime - a.deathTime).map((a) => a.id);
    this.warm(1e9);
  }
  warm(n) { while (n-- > 0 && this.pending.length) { const i = this.pending.shift(); if (!this.ragdolls[i]) this.computeRagdoll(i); } }
  computeRagdoll(i) {
    const S = this.S, pb = this.pb;
    const s = {};
    const start = new Float32Array(NJ * 3), prev = new Float32Array(NJ * 3);
    {
      const st = S.actors[i];
      const dt0 = st.deathTime - 0.002;
      pb.sample(i, dt0, s); s.mode = MODE.GROUND; this.living(i, s, dt0, start);
      pb.sample(i, dt0 - 1 / 30, s); s.mode = MODE.GROUND; this.living(i, s, dt0 - 1 / 30, prev);
      // impulse from the killing hit
      let ix = 0, iz = 0, iy = 0.4, w = {}, wDefault = 0.25, jitter = 0.6, kx = 0, kz = 0;
      const k = lastBefore(this.hitT[i], st.deathTime + 1e-3);
      // some of the shot go down as a real person lies down: a mocap getting-up, run backwards. In rewind
      // you see the real thing — a body pushing itself up off the sand and standing
      if (this.planGetup(i, s)) { this.ragdolls[i] = new Float32Array(NJ * 3); return; }
      if (this.planMocapDeath(i, s)) { this.ragdolls[i] = new Float32Array(NJ * 3); return; }
      const TS = this.slumpTime(i);
      if (TS > 0) {
        // folded to the knees first: the ragdoll starts from the slump, with a gentle topple
        this.slump[i] = TS;
        this.slumpPose(i, 1, start); this.slumpPose(i, 1 - 1 / 30 / TS, prev);
        const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), sg = (i % 3 === 0) ? -1 : 1;
        ix = fx * 1.2 * sg; iz = fz * 1.2 * sg; iy = 0.1;
        w = { [J.chest]: 1, [J.neck]: 1.1, [J.head]: 1.2, [J.shL]: 0.8, [J.shR]: 0.8, [J.spine]: 0.6 };
        wDefault = 0.1; jitter = 0.3;
      } else if (st.cause === 'shot' && k >= 0) {
        const [dx, dz] = this.hitD[i][k];
        const sp = 3.2;
        ix = dx * sp; iz = dz * sp;
        w = { [J.chest]: 1, [J.neck]: 1.1, [J.head]: 1.2, [J.shL]: 0.8, [J.shR]: 0.8, [J.spine]: 0.6 };
        // knees give out forward
        const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
        kx = fx * 1.6; kz = fz * 1.6;
      } else {
        const e = S.explosions.find((ex) => Math.abs(ex.t - st.deathTime) < 1e-3);
        const dx = e ? s.x - e.ix : 0, dz = e ? s.z - e.iz : 1, l = Math.hypot(dx, dz) || 1;
        if (e && !st.coward && GIB_KINDS[e.kind] && Math.hypot(dx, dz) < GIB_KINDS[e.kind] * Math.min(1.3, e.big || 1)) { this.planGib(i, e, start, dt0); return; }
        const pow = e && e.big > 1.5 ? 7.5 : 4.2;
        ix = dx / l * pow; iz = dz / l * pow; iy = pow * 0.9; wDefault = 1; jitter = 2.5;
      }
      const O = S.obstacles; this.ragdolls[i] = simulateRagdoll(start, prev, { x: ix, y: iy, z: iz, w, wDefault, jitter, kx, kz }, i + 1, 75, (x, z, y) => O.restY(x, z, y, st.deathTime + 0.3), O.anyNear(start[0], start[2], 4, st.deathTime) ? (x, z, y, r) => O.pushOut(x, z, r, y, st.deathTime, -1, 0.25) : null);
    }
  }

  // blown apart: the death pose is frozen into per-bone matrices and each group flies off ballistically,
  // tumbling, and lands. Rewind runs it backwards — the pieces fly in out of the smoke and come together
  planGib(i, e, j0, t0) {
    const S = this.S, O = S.obstacles, r = rng(i * 7919 + 13);
    boneFrames(j0, this.mats);
    const M0 = new Float32Array(NB * 16), m = this.tmpM;
    for (let b = 0; b < NB; b++) { m.multiplyMatrices(this.mats[b], this.bindInv[b]); M0.set(m.elements, b * 16); }
    const groups = GIB_GROUPS.map((G) => {
      const q = G.c[0] * 3, c = [j0[q], j0[q + 1], j0[q + 2]];
      let dx = c[0] - e.ix, dz = c[2] - e.iz; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const sp = G.sp * (0.7 + r() * 0.6), a = (r() - 0.5) * 1.6, ca = Math.cos(a), sa = Math.sin(a);
      const v = [(dx * ca - dz * sa) * sp, G.up * (0.8 + r() * 0.7) + 2, (dx * sa + dz * ca) * sp];
      const w = [(r() - 0.5) * 18, (r() - 0.5) * 18, (r() - 0.5) * 18];
      // when does it come down
      let T = 0.05;
      for (; T < 5; T += 1 / 60) {
        const x = c[0] + v[0] * T, y = c[1] + v[1] * T - 4.9 * T * T, z = c[2] + v[2] * T;
        if (v[1] - 9.8 * T < 0 && y < O.restY(x, z, y, t0 + T) + 0.12) break;
      }
      return { bones: G.bones, c, v, w, T };
    });
    this.gib[i] = { t0, M0, j0: Float32Array.from(j0), groups, x: e.ix, y: e.iy, z: e.iz };
    this.gibList.push(i);
    this.ragdolls[i] = new Float32Array(NJ * 3);
  }
  gibDelta(g, a, out, q, e) {
    const t = Math.min(a, g.T), s = t + Math.min(0.3, Math.max(0, a - g.T)) * 0.25;
    e.set(g.w[0] * s, g.w[1] * s, g.w[2] * s); q.setFromEuler(e);
    out.makeRotationFromQuaternion(q);
    out.setPosition(g.c[0] + g.v[0] * t, g.c[1] + g.v[1] * t - 4.9 * t * t, g.c[2] + g.v[2] * t);
    const c = this._gc || (this._gc = new THREE.Matrix4());
    return out.multiply(c.makeTranslation(-g.c[0], -g.c[1], -g.c[2]));
  }
  poseGib(i, tau) {
    const G = this.gib[i], a = Math.max(0, tau - G.t0), d = this.boneData, base = i * NB * 16;
    const D = this._gd || (this._gd = new THREE.Matrix4()), Mb = this._gm || (this._gm = new THREE.Matrix4()), q = this._gq || (this._gq = new THREE.Quaternion()), e = this._ge || (this._ge = new THREE.Euler());
    const K = this.keys;
    for (const g of G.groups) {
      this.gibDelta(g, a, D, q, e);
      for (const b of g.bones) { Mb.fromArray(G.M0, b * 16); Mb.premultiply(D); d.set(Mb.elements, base + b * 16); }
      if (g.bones[0] === B.head) {
        const h = J.head * 3, n = J.neck * 3;
        K.head.set(G.j0[h], G.j0[h + 1], G.j0[h + 2]).applyMatrix4(D); K.neck.set(G.j0[n], G.j0[n + 1], G.j0[n + 2]).applyMatrix4(D);
        K.headM.fromArray(G.M0, B.head * 16).premultiply(D);
      }
      if (g.bones[0] === B.pelvis) { const h = J.hips * 3; K.pelvis.set(G.j0[h], G.j0[h + 1], G.j0[h + 2]).applyMatrix4(D); }
    }
    { const dr = this.dropOf(i); if (dr && tau >= dr.t) d.fill(0, base + B.rifle * 16, base + B.rifle * 16 + 16); }
    d[base + 3] = 1; // rigid flag
    return K;
  }
  // red mist at the burst and thin trails behind the flying pieces
  gibFx(tau, sm) {
    const D = this._fd || (this._fd = new THREE.Matrix4()), q = this._fq || (this._fq = new THREE.Quaternion()), e = this._fe || (this._fe = new THREE.Euler()), p = this._fp || (this._fp = new THREE.Vector3());
    for (const i of this.gibList) {
      const G = this.gib[i], a = tau - G.t0;
      if (a < 0 || a > 6) continue;
      const cx = G.groups[0].c[0], cy = G.groups[0].c[1], cz = G.groups[0].c[2];
      if (a < 1.4) for (let k = 0; k < 7; k++) {
        const u = a / 1.4, ang = k * 2.4 + i, rr = 0.3 + a * (1.4 + (k % 3) * 0.5);
        sm.push(cx + Math.cos(ang) * rr, cy - 0.2 + a * 0.5 + (k % 2) * 0.3, cz + Math.sin(ang) * rr, 0.5 + a * 1.6, 0.36, 0.04, 0.03, 0.62 * (1 - u) * (1 - u), k + i);
      }
      for (const g of G.groups) {
        if (g.bones[0] === B.rifle) continue;
        for (let k = 0; k < 6; k++) {
          const b = a - k * 0.05; if (b < 0 || b > g.T) continue;
          this.gibDelta(g, b, D, q, e); p.set(g.c[0], g.c[1], g.c[2]).applyMatrix4(D);
          const life = 1 - (a - b) / 0.32; if (life <= 0) continue;
          sm.push(p.x, p.y, p.z, 0.16 + (a - b) * 0.6, 0.3, 0.03, 0.025, 0.55 * life, k + i);
        }
        // a dark stain where it lands
        if (a > g.T) { p.set(g.c[0] + g.v[0] * g.T, 0, g.c[2] + g.v[2] * g.T); const y = g.c[1] + g.v[1] * g.T - 4.9 * g.T * g.T; sm.push(p.x, y - 0.05, p.z, 0.5 + Math.min(0.4, (a - g.T) * 0.8), 0.18, 0.03, 0.02, 0.35 * Math.min(1, (a - g.T) * 4) * Math.max(0, 1 - (a - 4) / 2), i); }
      }
    }
  }

  // where this body's weapon ends up, and when it gets there (the carried rifle is hidden from then on and a
  // real gun lies in the sand in its place)
  dropOf(i) {
    if (!this.drops) this.drops = new Array(this.N).fill(null);
    if (this.drops[i]) return this.drops[i];
    const st = this.S.actors[i];
    if (!(st.deathTime > 0)) return null;
    if (!this.ragdolls[i]) this.computeRagdoll(i);
    const j = this._dj || (this._dj = new Float32Array(NJ * 3));
    let T;
    if (this.gib[i]) {
      const G = this.gib[i], g = G.groups[G.groups.length - 1];
      const D = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
      this.gibDelta(g, g.T + 0.5, D, q, e);
      const a = new THREE.Vector3(G.j0[J.grip * 3], G.j0[J.grip * 3 + 1], G.j0[J.grip * 3 + 2]).applyMatrix4(D);
      const b = new THREE.Vector3(G.j0[J.muzzle * 3], G.j0[J.muzzle * 3 + 1], G.j0[J.muzzle * 3 + 2]).applyMatrix4(D);
      j[J.grip * 3] = a.x; j[J.grip * 3 + 1] = a.y; j[J.grip * 3 + 2] = a.z; j[J.muzzle * 3] = b.x; j[J.muzzle * 3 + 1] = b.y; j[J.muzzle * 3 + 2] = b.z;
      T = g.T + 0.1;
    } else if (this.getup[i]) { T = this.getup[i].dur + 0.05; this.getupPose(i, T, j); }
    else {
      const R = this.ragdolls[i], nf = R.length / (NJ * 3);
      j.set(R.subarray((nf - 1) * NJ * 3, nf * NJ * 3)); T = this.slump[i] + nf / 30 + 0.05;
    }
    const gx = j[J.grip * 3], gz = j[J.grip * 3 + 2], mx = j[J.muzzle * 3], mz = j[J.muzzle * 3 + 2];
    let cx = gx + (mx - gx) * 0.3, cz = gz + (mz - gz) * 0.3;
    if (!this.gib[i]) { // flung clear of the body, not buried under it
      const px = j[J.hips * 3], pz = j[J.hips * 3 + 2], hh = (((i + 5) * 2654435761) >>> 0) / 4294967296;
      let vx = cx - px, vz = cz - pz, l = Math.hypot(vx, vz);
      if (l < 1e-3) { vx = Math.cos(hh * 6.28); vz = Math.sin(hh * 6.28); l = 1; }
      const want = 0.75 + hh * 0.4; if (l < want) { cx = px + vx / l * want; cz = pz + vz / l * want; }
    }
    const y = this.S.obstacles.restY(cx, cz, Math.max(j[J.grip * 3 + 1], j[J.muzzle * 3 + 1]) + 0.3, st.deathTime + T);
    const h = (((i + 3) * 2246822519) >>> 0) / 4294967296;
    this.drops[i] = { x: cx, y, z: cz, yaw: Math.atan2(gx - mx, gz - mz), roll: h < 0.5 ? Math.PI / 2 : -Math.PI / 2, t: st.deathTime + T };
    return this.drops[i];
  }

  // some of those shot where they stand go down as a captured death: a man folding, catching himself, and lying still
  planMocapDeath(i, s) {
    const st = this.S.actors[i];
    if (st.cause !== 'shot' || s.speed > 1.6 || Math.abs(heightFast(s.x, s.z) - s.y) > 0.3 || s.y < 0.1) return false;
    const h = (((i + 29) * 2654435761) >>> 0) / 4294967296;
    if (h > 0.62) return false;
    (this.mdeath || (this.mdeath = []))[i] = { clip: s.crouch > 0.5 ? 't_crouch_death' : h < 0.31 ? 't_dying' : 't_death_headshot', x: s.x, y: s.y, z: s.z, yaw: s.yaw };
    return true;
  }
  planGetup(i, s) {
    const st = this.S.actors[i];
    if (st.cause !== 'shot' || s.y < 0.1) return false;
    const h = (((i + 13) * 2246822519) >>> 0) / 4294967296;
    if (h > 0.42) return false;
    const key = ['c_getup_front', 'c_getup_back', 'c_getup_tactical'][Math.floor(h / 0.14) % 3];
    const c = CLIPS[key], n = c.n, D = c.data, e = (n - 1) * 57;
    // final (standing) frame: where the hips are and which way the body faces (left = shL - shR)
    const lx = D[e + 15] - D[e + 24], lz = D[e + 17] - D[e + 26];
    const fcx = -lz, fcz = lx, fa = Math.atan2(Math.sin(s.yaw), Math.cos(s.yaw)), fc = Math.atan2(fcx, fcz);
    const th = fa - fc, co = Math.cos(th), si = Math.sin(th);
    const hx = D[e], hz = D[e + 2];
    const rx = hx * co + hz * si, rz = -hx * si + hz * co;
    this.getup[i] = { key, n, D, co, si, ox: s.x - rx, oz: s.z - rz, dur: c.dur / 1.2 };
    return true;
  }
  getupPose(i, tt, out) {
    const g = this.getup[i];
    const u = 1 - Math.min(1, Math.max(0, tt / g.dur)); // forward time: standing → lying (so rewind = getting up)
    const f = u * (g.n - 1), a = Math.floor(f), b = Math.min(g.n - 1, a + 1), t = f - a;
    const M = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]; // mocap order == J order for the 19 body joints
    for (let k = 0; k < 19; k++) {
      const pa = a * 57 + k * 3, pb = b * 57 + k * 3;
      const x = g.D[pa] + (g.D[pb] - g.D[pa]) * t, y = g.D[pa + 1] + (g.D[pb + 1] - g.D[pa + 1]) * t, z = g.D[pa + 2] + (g.D[pb + 2] - g.D[pa + 2]) * t;
      const wx = g.ox + x * g.co + z * g.si, wz = g.oz - x * g.si + z * g.co;
      const j = M[k] * 3; out[j] = wx; out[j + 2] = wz; out[j + 1] = y + heightFast(wx, wz);
    }
    // rifle: held in the right hand along the forearm
    const hx = out[J.handR * 3], hy = out[J.handR * 3 + 1], hz = out[J.handR * 3 + 2];
    let dx = hx - out[J.elbR * 3], dy = hy - out[J.elbR * 3 + 1], dz = hz - out[J.elbR * 3 + 2]; const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
    out[J.grip * 3] = hx; out[J.grip * 3 + 1] = hy; out[J.grip * 3 + 2] = hz;
    out[J.muzzle * 3] = hx + dx * 0.7; out[J.muzzle * 3 + 1] = Math.max(hy + dy * 0.7, heightFast(hx + dx * 0.7, hz + dz * 0.7) + 0.03); out[J.muzzle * 3 + 2] = hz + dz * 0.7;
  }

  // Dying isn't instant for most of the shot: they stagger, fold to their knees and slump before toppling.
  // Played in rewind that's the dead getting up — off the sand, onto their knees, back on their feet, walking backwards.
  slumpTime(i) {
    const st = this.S.actors[i];
    if (st.cause !== 'shot') return 0;
    const h = (((i + 7) * 2654435761) >>> 0) / 4294967296;
    return h < 0.7 ? 0.75 + h * 1.1 : 0;
  }
  slumpPose(i, u, out, t0 = this.S.actors[i].deathTime - 0.002, hx, hz) {
    const s = this._ss || (this._ss = {});
    this.pb.sample(i, t0, s); s.mode = MODE.GROUND;
    const p = this.motion(i, s, t0, this.pp, 0);
    u = Math.max(0, Math.min(1, u));
    const e = u * u * (3 - 2 * u), kn = Math.min(1, u * 1.5), knees = kn * kn * (3 - 2 * kn), mv = 1 - Math.min(1, u * 3);
    p.speed *= mv; p.vx *= mv; p.vz *= mv; p.ax *= mv; p.az *= mv;
    p.crouch = p.crouch + (1 - p.crouch) * knees;
    p.pitch = s.pitch * (1 - e) - 0.75 * e; p.eng *= 1 - e; p.kick = p.kickB = p.climb = 0; p.reload = -1; p.sup *= 1 - e; p.headYaw *= 1 - e; p.yawErr *= 1 - e; p.pitErr *= 1 - e;
    let dx = 0, dz = 0;
    if (hx !== undefined) { dx = hx; dz = hz; }
    else { const k = lastBefore(this.hitT[i], t0 + 0.01); if (k >= 0) { dx = this.hitD[i][k][0]; dz = this.hitD[i][k][1]; } }
    const cy = Math.cos(s.yaw), sy = Math.sin(s.yaw);
    p.fdx = dx * cy - dz * sy; p.fdz = dx * sy + dz * cy; p.flinch = smooth(0, 0.12, u) * (1 - 0.35 * e); p.stag = Math.max(p.stag * (1 - e), e);
    // a stagger away from the shot: the weight goes, the feet stay where they were planted
    const step = 0.2 * Math.sin(Math.min(1, u * 1.8) * Math.PI / 2);
    p.offX += p.fdx * step; p.offZ += p.fdz * step; p.bodyYaw += 0.3 * e * (i % 2 ? 1 : -1);
    posePose(p, out, s.x, s.y, s.z, s.yaw);
    this._hy = s.yaw;
    // the slump: chest and head sag forward over the knees, arms and rifle hang
    const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), sag = e * e;
    const drop = (jj, dy, fw) => { out[jj * 3 + 1] -= dy * sag; out[jj * 3] += fx * fw * sag; out[jj * 3 + 2] += fz * fw * sag; };
    drop(J.chest, 0.1, 0.1); drop(J.neck, 0.18, 0.16); drop(J.head, 0.24, 0.2);
    drop(J.shL, 0.14, 0.12); drop(J.shR, 0.14, 0.12); drop(J.elbL, 0.3, 0.05); drop(J.elbR, 0.3, 0.05);
    drop(J.handL, 0.42, 0.02); drop(J.handR, 0.42, 0.02); drop(J.grip, 0.45, 0.02); drop(J.muzzle, 0.75, -0.1);
  }

  vary(i) { return this.vars[i] || (this.vars[i] = variation(i)); }

  // Near misses per actor (time, direction to the impact, weight), built once.
  buildNear() {
    const S = this.S, N = this.N, A = S.shots, R = S.rec, n = S.steps;
    const T = Array.from({ length: N }, () => []);
    const add = (t, ix, iz, rad, w, skipA, skipB) => {
      const k = Math.min(n - 1, Math.max(0, Math.round(t * HZ))), r2 = rad * rad;
      for (let i = 0; i < N; i++) {
        const o = (i * n + k) * F; if (R[o + 8] !== MODE.GROUND) continue;
        const dx = ix - R[o], dz = iz - R[o + 2], d2 = dx * dx + dz * dz;
        if (d2 > r2 || i === skipA || i === skipB) continue;
        const L = T[i], l = Math.sqrt(d2) || 1;
        if (L.length && t - L[L.length - 4] < 0.12 && L[L.length - 1] >= w) continue;
        L.push(t, dx / l, dz / l, w * (1 - 0.5 * l / rad));
      }
    };
    const ev = [];
    for (let k = 0; k < S.nShots; k++) { const o = k * SHOT_F; ev.push([A[o + 1], A[o + 5], A[o + 7], 2.6, 0.7, A[o + 8], A[o + 10] === 3 ? A[o + 9] : -1]); }
    for (const e of S.explosions || []) ev.push([e.t, e.ix, e.iz, 16, 1.6, -1, -1]);
    ev.sort((a, b) => a[0] - b[0]);
    for (const e of ev) add(e[0], e[1], e[2], e[3], e[4], e[5], e[6]);
    this.nearT = T.map((L) => { const a = new Float32Array(L.length / 4); for (let k = 0; k < a.length; k++) a[k] = L[k * 4]; return a; });
    this.nearD = T.map((L) => Float32Array.from(L));
  }

  // The body's track: the recorded 10 Hz samples of one soldier's time on the ground, low-passed (a body has mass:
  // it cannot stop dead in a tenth of a second or snap its hips round as fast as its eyes) and with a step clock
  // accumulated along it. Built once per soldier; evaluated as a cubic B-spline, so position, velocity and
  // acceleration are all continuous functions of tape time and there is no state to integrate.
  track(i) {
    let tr = this.tracks[i]; if (tr) return tr;
    const S = this.S, R = S.rec, n = S.steps, st = S.actors[i], base = i * n * F, sd = this.vary(i), style = styleOf(i, st.mg);
    let k0 = -1, k1 = -1;
    const kd = st.deathTime > 0 ? Math.min(n - 1, Math.floor(st.deathTime * HZ)) : n - 1;
    for (let k = Math.max(0, Math.ceil((st.spawn || 0) * HZ)); k <= kd; k++) if (R[base + k * F + 8] === MODE.GROUND) { if (k0 < 0) k0 = k; k1 = k; }
    if (k0 < 0 || k1 - k0 < 2) return (this.tracks[i] = { n: 0 });
    const P = 5, m = k1 - k0 + 1 + 2 * P, raw = new Float32Array(m * 5);
    let yawU = R[base + k0 * F + 3];
    for (let q = 0; q < m; q++) {
      const k = k0 - P + q, o = q * 5;
      if (k <= k0) { const r = base + k0 * F; raw[o] = R[r]; raw[o + 1] = R[r + 1]; raw[o + 2] = R[r + 2]; raw[o + 3] = yawU; raw[o + 4] = R[r + 5]; }
      else if (k <= k1) { const r = base + k * F; yawU += wrapA(R[r + 3] - R[r - F + 3]); raw[o] = R[r]; raw[o + 1] = R[r + 1]; raw[o + 2] = R[r + 2]; raw[o + 3] = yawU; raw[o + 4] = R[r + 5]; }
      else { // past the end (death): he was not slowing down for it
        const a = o - 5, b = o - 10, live = st.deathTime > 0 && k1 >= kd - 1;
        for (let c = 0; c < 3; c++) raw[o + c] = live ? raw[a + c] * 2 - raw[b + c] : raw[a + c];
        raw[o + 3] = raw[a + 3]; raw[o + 4] = raw[a + 4];
      }
    }
    const d = new Float32Array(m * TK), W = [1, 2, 3, 2, 1];
    for (let q = 0; q < m; q++) for (let c = 0; c < 5; c++) {
      let a = 0, w = 0;
      for (let e = -2; e <= 2; e++) { const j = q + e; if (j < 0 || j >= m) continue; a += raw[j * 5 + c] * W[e + 2]; w += W[e + 2]; }
      d[q * TK + c] = a / w;
    }
    // step clock: cycles of gait. Advances with ground covered (stride from this soldier's own gait), and ticks over
    // slowly when he stands so that he re-plants his feet when he turns or shuffles
    let C = sd.clock; d[5] = C;
    const hT = this.hitT[i];
    for (let q = 1; q < m; q++) {
      const a = (q - 1) * TK, b = q * TK, dx = d[b] - d[a], dz = d[b + 2] - d[a + 2], v = Math.hypot(dx, dz) * HZ;
      const t = (k0 - P + q) / HZ, hurt = hT.length > 0 && hT[0] <= t;
      let stride = gaitStride(style, v, d[b + 4], hurt) * sd.stride;
      if (v > 0.2) { const yw = raw[q * 5 + 3], f = (dx * Math.sin(yw) + dz * Math.cos(yw)) * HZ / v; stride *= 1 - 0.32 * smooth(0, 1, -f) - 0.22 * (1 - Math.abs(f)); }
      const turn = Math.abs(d[b + 3] - d[a + 3]) * HZ;
      C += (v / stride + 0.5 * (1 - smooth(0.15, 0.8, v)) + Math.min(1.3, turn * 0.3) * (1 - smooth(0.5, 1.5, v))) / HZ;
      d[b + 5] = C;
    }
    return (this.tracks[i] = { n: m, kA: k0 - P, k0, k1, d });
  }
  // evaluate the track at sample-space position f (already relative to tr.kA)
  evalTrack(tr, f, o, full) {
    const d = tr.d; f = clamp(f, 1, tr.n - 2.001);
    const i = Math.floor(f), t = f - i, t2 = t * t, t3 = t2 * t, u = 1 - t;
    const b0 = u * u * u / 6, b1 = (3 * t3 - 6 * t2 + 4) / 6, b2 = (-3 * t3 + 3 * t2 + 3 * t + 1) / 6, b3 = t3 / 6;
    const c0 = -u * u / 2, c1 = (3 * t2 - 4 * t) / 2, c2 = (-3 * t2 + 2 * t + 1) / 2, c3 = t2 / 2;
    const a = (i - 1) * TK, b = a + TK, c = b + TK, e = c + TK;
    o.x = d[a] * b0 + d[b] * b1 + d[c] * b2 + d[e] * b3; o.y = d[a + 1] * b0 + d[b + 1] * b1 + d[c + 1] * b2 + d[e + 1] * b3; o.z = d[a + 2] * b0 + d[b + 2] * b1 + d[c + 2] * b2 + d[e + 2] * b3;
    o.yaw = d[a + 3] * b0 + d[b + 3] * b1 + d[c + 3] * b2 + d[e + 3] * b3;
    o.vx = (d[a] * c0 + d[b] * c1 + d[c] * c2 + d[e] * c3) * HZ; o.vz = (d[a + 2] * c0 + d[b + 2] * c1 + d[c + 2] * c2 + d[e + 2] * c3) * HZ;
    if (!full) return o;
    o.crouch = d[a + 4] * b0 + d[b + 4] * b1 + d[c + 4] * b2 + d[e + 4] * b3;
    o.vy = (d[a + 1] * c0 + d[b + 1] * c1 + d[c + 1] * c2 + d[e + 1] * c3) * HZ; o.vyaw = (d[a + 3] * c0 + d[b + 3] * c1 + d[c + 3] * c2 + d[e + 3] * c3) * HZ;
    const e0 = u, e1 = 3 * t - 2, e2 = -3 * t + 1, e3 = t, H2 = HZ * HZ;
    o.ax = (d[a] * e0 + d[b] * e1 + d[c] * e2 + d[e] * e3) * H2; o.az = (d[a + 2] * e0 + d[b + 2] * e1 + d[c + 2] * e2 + d[e + 2] * e3) * H2;
    o.C = d[b + 5] + (d[c + 5] - d[b + 5]) * t; o.cad = (d[c + 5] - d[b + 5]) * HZ;
    return o;
  }
  // when (sample space) the step clock reads c: the clock only ever advances, so walk the samples from a hint
  clockTime(tr, c, i) {
    const d = tr.d, n = tr.n; i = clamp(i, 1, n - 3);
    let g = 0;
    while (i < n - 3 && d[(i + 1) * TK + 5] < c && g++ < 60) i++;
    while (i > 1 && d[i * TK + 5] > c && g++ < 120) i--;
    const a = d[i * TK + 5], b = d[(i + 1) * TK + 5];
    return i + clamp(b > a ? (c - a) / (b - a) : 0, 0, 1);
  }
  // step clock of actor i at tau (cycles; left foot mid-stance at STEP_C, right half a cycle later), or undefined off the ground
  stepClock(i, tau) { const tr = this.track(i); if (!tr.n) return undefined; return this.evalTrack(tr, tau * HZ - tr.kA, E2, true).C; }

  // Everything the pose needs to know about this instant, read off the tape around tau: where the body's mass is and
  // how it is moving and turning, where each foot was last put down and where it will be put down next, how long since
  // (and until) he fires, what just landed near him. All of it a pure function of (i, tau).
  motion(i, s, tau, p, lod = 0) {
    const S = this.S, st = S.actors[i], sd = this.vary(i), R = S.rec;
    p.st = styleOf(i, st.mg); p.sd = sd; p.side = st.side; p.lod = lod;
    p.idleT = tau / 1.97 + st.skin * 7; p.idleSec = tau; p.t = tau + sd.ph0 * 5;
    p.mode = s.mode === MODE.BOAT ? 1 : 0; p.pitch = s.pitch; p.u = s.phase / (Math.PI * 2);
    const hT = this.hitT[i], hk = lastBefore(hT, tau);
    p.hurt = hk >= 0;
    // the raw recording at tau (the caller's sample may have been overridden: turned to face you, eased in)
    const sf = Math.min(Math.max(tau * HZ, 0), S.steps - 1.001), si = Math.floor(sf), fr = sf - si, o0 = (i * S.steps + si) * F, o1 = o0 + F;
    const rx = R[o0] + (R[o1] - R[o0]) * fr, ry = R[o0 + 1] + (R[o1 + 1] - R[o0 + 1]) * fr, rz = R[o0 + 2] + (R[o1 + 2] - R[o0 + 2]) * fr;
    const ryaw = R[o0 + 3] + wrapA(R[o1 + 3] - R[o0 + 3]) * fr, cy = Math.cos(ryaw), sy = Math.sin(ryaw);
    const tr = s.mode === MODE.GROUND ? this.track(i) : null;
    p.ft = null; p.g = 0; p.offX = p.offY = p.offZ = 0; p.bodyYaw = 0; p.gx = p.gz = 0; p.ax = p.az = 0;
    if (tr && tr.n) {
      const f = tau * HZ - tr.kA, g = smooth(0, 0.5, tau - tr.k0 / HZ);
      this.evalTrack(tr, f, E, true);
      const dx = E.x - rx, dz = E.z - rz;
      p.offX = (dx * cy - dz * sy) * g; p.offZ = (dx * sy + dz * cy) * g; p.offY = (E.y - ry) * g;
      const by = wrapA(E.yaw - ryaw); p.bodyYaw = by * g;
      const sp = Math.hypot(E.vx, E.vz);
      p.speed = sp; p.vx = E.vx * cy - E.vz * sy; p.vz = E.vx * sy + E.vz * cy;
      p.ax = E.ax * cy - E.az * sy; p.az = E.ax * sy + E.az * cy;
      p.crouch = E.crouch; p.C = E.C; p.cad = E.cad; p.turn = E.vyaw;
      if (sp > 0.4) { const k = clamp(E.vy / (sp * sp), -0.6, 0.6) * smooth(0.4, 1.2, sp); p.gx = p.vx * k; p.gz = p.vz * k; }
      // footprints
      const ft = p.ftBuf, ii = Math.floor(f);
      for (let k = 0; k < 2; k++) {
        const ck = STEP_C + 0.5 * k, n = Math.floor(E.C - ck + 0.5), q = E.C - ck - n;
        for (let e = 0; e < 2; e++) {
          const fc = this.clockTime(tr, (e === 0 ? n : q >= 0 ? n + 1 : n - 1) + ck - 0.03, ii);
          this.evalTrack(tr, fc, E2, false);
          stanceOffset(k, 1 - smooth(0.12, 0.9, Math.hypot(E2.vx, E2.vz)), sd, SO);
          const c2 = Math.cos(E2.yaw), s2 = Math.sin(E2.yaw);
          const wx = E2.x + SO[0] * c2 + SO[1] * s2 - rx, wz = E2.z - SO[0] * s2 + SO[1] * c2 - rz, o = k * 8 + e * 4;
          ft[o] = wx * cy - wz * sy; ft[o + 1] = E2.y - ry; ft[o + 2] = wx * sy + wz * cy; ft[o + 3] = (E2.yaw - E.yaw) + by + SO[2];
        }
      }
      p.ft = ft; p.g = g;
    } else {
      p.speed = p.mode === 1 ? 0 : s.speed; p.vx = 0; p.vz = p.speed; p.crouch = s.crouch; p.C = p.u; p.cad = 0; p.turn = 0;
    }
    // ---- the weapon: on the sights from a beat before he fires until a couple of seconds after ----
    const fT = this.fireT[i], k = lastBefore(fT, tau);
    const ago = k >= 0 ? tau - fT[k] : 99, until = k + 1 < fT.length ? fT[k + 1] - tau : 99;
    p.eng = Math.max(1 - smooth(1.4, 2.8, ago), 1 - smooth(0.35, 0.95, until));
    let kick = 0, kb = 0, cl = 0;
    for (let j = k; j >= 0 && j > k - 8; j--) {
      const a = tau - fT[j]; if (a > 0.7) break;
      kick += a < 0.012 ? a / 0.012 : Math.exp(-(a - 0.012) / 0.045) * Math.cos((a - 0.012) * 26);
      kb += (a / 0.055) * Math.exp(1 - a / 0.055); cl += 0.4 * (a / 0.13) * Math.exp(1 - a / 0.13);
    }
    p.kick = clamp(kick, -0.6, 1.4); p.kickB = Math.min(kb, 1.7); p.climb = Math.min(cl, 1.2); p.recoil = Math.max(0, p.kick);
    // lag and overshoot of the weapon behind the turning line of sight; the head leads the turn
    p.yawErr = 0; p.pitErr = 0; p.headYaw = 0;
    if (lod === 0) {
      let ye = 0, pe = 0;
      for (let j = si; j >= 0 && j > si - 11; j--) {
        const a = (i * S.steps + j) * F, dyw = wrapA(R[a + F + 3] - R[a + 3]), dp = R[a + F + 4] - R[a + 4];
        if (dyw === 0 && dp === 0) continue;
        const el = tau - j / HZ, w = (sprI(el) - sprI(el - 1 / HZ)) * HZ;
        ye += dyw * w; pe += dp * w;
      }
      p.yawErr = clamp(ye * 0.8, -0.45, 0.45); p.pitErr = clamp(pe * 0.8, -0.3, 0.3);
      const s2 = Math.min(sf + 1.3, S.steps - 1.001), j = Math.floor(s2), a = (i * S.steps + j) * F;
      p.headYaw = clamp(wrapA(R[a + 3] + wrapA(R[a + F + 3] - R[a + 3]) * (s2 - j) - ryaw), -0.55, 0.55) * 0.8;
    }
    // ---- being shot at: duck, hunch, lean away ----
    p.sup = 0; p.sdx = 0; p.sdz = 0;
    if (lod < 2) {
      if (!this.nearT) this.buildNear();
      const nT = this.nearT[i], nD = this.nearD[i];
      let keep = 1, ax = 0, az = 0;
      for (let j = lastBefore(nT, tau - 0.03), c = 0; j >= 0 && c < 6; j--, c++) {
        const a = tau - nT[j]; if (a > 1.7) break;
        const w = Math.min(1, nD[j * 4 + 3]) * smooth(0.03, 0.15, a) * (1 - smooth(0.45, 1.7, a));
        keep *= 1 - 0.8 * w; ax -= nD[j * 4 + 1] * w; az -= nD[j * 4 + 2] * w;
      }
      p.sup = 1 - keep;
      const l = Math.hypot(ax, az); if (l > 1e-4) { p.sdx = (ax * cy - az * sy) / l; p.sdz = (ax * sy + az * cy) / l; }
    }
    // ---- being hit: the trunk goes with the bullet, then he staggers ----
    const ha = hk >= 0 ? tau - hT[hk] : 99;
    p.flinch = 0; p.stag = 0;
    if (ha < 1.3) {
      p.flinch = ha < 0.05 ? ha / 0.05 : Math.exp(-(ha - 0.05) / 0.17) * Math.cos((ha - 0.05) * 5.5);
      p.stag = smooth(0.02, 0.22, ha) * (1 - smooth(0.4, 1.3, ha));
      const hd = this.hitD[i][hk]; p.fdx = hd[0] * cy - hd[1] * sy; p.fdz = hd[0] * sy + hd[1] * cy;
    }
    const r = lastBefore(st.reloads, tau), rage = r >= 0 ? tau - st.reloads[r] : 9;
    p.reload = rage < 2.6 ? rage / 2.6 : -1;
    // out of breath after a run
    p.exert = 0.25;
    if (lod === 0 && tr && tr.n) {
      let e = 0; const d = tr.d, b = clamp(Math.floor(tau * HZ - tr.kA), 1, tr.n - 2);
      for (let q = 0; q < 4; q++) { const a = Math.max(1, b - q * 20) * TK; e += Math.hypot(d[a] - d[a - TK], d[a + 2] - d[a - TK + 2]) * HZ; }
      p.exert = clamp(e / 4 / 4.2, 0, 1);
    }
    return p;
  }

  living(i, s, tau, out, lod = 0) {
    const p = this.motion(i, s, tau, this.pp, lod);
    posePose(p, out, s.x, s.y, s.z, s.yaw);
    this._hy = s.yaw;
  }

  hide(i) { this.boneData.fill(0, i * NB * 16, (i + 1) * NB * 16); }

  // s: sample, returns key points
  pose(i, s, tau) {
    const st = this.S.actors[i];
    const j = this.joints;
    if (s.mode === MODE.DEAD && !this.ragdolls[i] && this.pb) this.computeRagdoll(i);
    if (s.mode === MODE.DEAD && this.gib[i]) return this.poseGib(i, tau);
    if (s.mode === MODE.DEAD && this.mdeath && this.mdeath[i]) {
      const m = this.mdeath[i], tt = tau - st.deathTime;
      clipPose(m.clip, tt, j, m.x, m.y, m.z, m.yaw, st.side === 1);
      if (tt < 0.25) {   // out of the living pose into the capture
        const s0 = this._s0 || (this._s0 = {}), L = this._l0 || (this._l0 = new Float32Array(NJ * 3));
        this.pb.sample(i, st.deathTime - 0.002, s0); s0.mode = MODE.GROUND; this.living(i, s0, st.deathTime - 0.002, L);
        const k = Math.max(0, tt) / 0.25, e = k * k * (3 - 2 * k);
        for (let q = 0; q < NJ * 3; q++) j[q] = L[q] + (j[q] - L[q]) * e;
      }
    } else if (s.mode === MODE.DEAD && this.ragdolls[i] && this.getup[i]) {
      const tt = tau - st.deathTime;
      this.getupPose(i, tt, j);
      if (tt < 0.3) { // ease out of the living pose (aiming) into the mocap
        const s0 = this._s0 || (this._s0 = {}), L = this._l0 || (this._l0 = new Float32Array(NJ * 3));
        this.pb.sample(i, st.deathTime - 0.002, s0); s0.mode = MODE.GROUND; this.living(i, s0, st.deathTime - 0.002, L);
        const k = tt / 0.3, e = k * k * (3 - 2 * k);
        for (let q = 0; q < NJ * 3; q++) j[q] = L[q] + (j[q] - L[q]) * e;
      }
    } else if (s.mode === MODE.DEAD && this.ragdolls[i] && tau - st.deathTime < this.slump[i]) {
      this.slumpPose(i, (tau - st.deathTime) / this.slump[i], j);
    } else if (s.mode === MODE.DEAD && this.ragdolls[i]) {
      const R = this.ragdolls[i], nf = R.length / (NJ * 3);
      const f = Math.min(nf - 1.001, Math.max(0, (tau - st.deathTime - this.slump[i]) * 30));
      const a = Math.floor(f), t = f - a, o0 = a * NJ * 3, o1 = Math.min(nf - 1, a + 1) * NJ * 3;
      for (let k = 0; k < NJ * 3; k++) j[k] = R[o0 + k] + (R[o1 + k] - R[o0 + k]) * t;
    } else {
      this.living(i, s, tau, j);
    }
    boneFrames(j, this.mats);
    const d = this.boneData, base = i * NB * 16;
    for (let b = 0; b < NB; b++) {
      this.tmpM.multiplyMatrices(this.mats[b], this.bindInv[b]);
      d.set(this.tmpM.elements, base + b * 16);
    }
    if (s.mode === MODE.DEAD && this.ragdolls[i]) { const dr = this.dropOf(i); if (dr && tau >= dr.t) d.fill(0, base + B.rifle * 16, base + B.rifle * 16 + 16); }
    const K = this.keys;
    K.head.set(j[J.head * 3], j[J.head * 3 + 1], j[J.head * 3 + 2]);
    K.neck.set(j[J.neck * 3], j[J.neck * 3 + 1], j[J.neck * 3 + 2]);
    K.pelvis.set(j[J.hips * 3], j[J.hips * 3 + 1], j[J.hips * 3 + 2]);
    K.headM.copy(this.mats[3]);
    return K;
  }

  commit() { this.boneTex.needsUpdate = true; }
}
