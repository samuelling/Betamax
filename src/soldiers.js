// All soldiers: one instanced, GPU-skinned draw call. Living bodies are driven by mocap + procedural layers;
// the dead are precomputed verlet ragdolls (which therefore rewind perfectly).
import * as THREE from 'three';
import { J, NJ, NB, bindJoints, boneFrames, buildSoldierGeometry, makeSoldierMaterial } from './rig.js';
import { posePose, simulateRagdoll } from './anim.js';
import { MODE, SHOT_F } from './sim.js';
import { styleOf } from './gait.js';
import { CLIPS } from './mocap.js';
import { heightFast } from './terrain.js';

function lastBefore(arr, t) { // index of last element <= t, or -1
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] <= t) lo = m + 1; else hi = m; }
  return lo - 1;
}

export class Soldiers {
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
    this.mesh = new THREE.Mesh(g, mat);
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
    this.ragdolls = new Array(N).fill(null); this.slump = new Float32Array(N); this.getup = new Array(N).fill(null);
    this.pp = { u: 0, speed: 0, crouch: 0, pitch: 0, idleT: 0, recoil: 0, flinch: 0, fdx: 0, fdz: 0, reload: -1, mode: 0 };
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
        const pow = e && e.big > 1.5 ? 7.5 : 4.2;
        ix = dx / l * pow; iz = dz / l * pow; iy = pow * 0.9; wDefault = 1; jitter = 2.5;
      }
      const O = S.obstacles; this.ragdolls[i] = simulateRagdoll(start, prev, { x: ix, y: iy, z: iz, w, wDefault, jitter, kx, kz }, i + 1, 75, (x, z, y) => O.restY(x, z, y), O.anyNear(start[0], start[2], 4, st.deathTime) ? (x, z, y, r) => O.pushOut(x, z, r, y, st.deathTime, -1, 0.25) : null);
    }
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
  slumpPose(i, u, out) {
    const st = this.S.actors[i], s = this._ss || (this._ss = {}), p = this.pp;
    this.pb.sample(i, st.deathTime - 0.002, s); s.mode = MODE.GROUND;
    u = Math.max(0, Math.min(1, u));
    const e = u * u * (3 - 2 * u), knees = Math.min(1, u * 1.5);
    p.u = s.phase / (Math.PI * 2); p.speed = s.speed * (1 - Math.min(1, u * 3)); p.crouch = s.crouch + (1 - s.crouch) * (knees * knees * (3 - 2 * knees));
    p.pitch = s.pitch * (1 - e) - 0.75 * e; p.idleT = st.deathTime / 1.97 + st.skin * 7; p.idleSec = st.deathTime; p.st = styleOf(i, st.mg); p.hurt = true; p.mode = 0; p.side = st.side;
    p.recoil = 0; p.reload = -1;
    const k = lastBefore(this.hitT[i], st.deathTime + 1e-3);
    let dx = 0, dz = 0;
    if (k >= 0) { [dx, dz] = this.hitD[i][k]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; }
    const cy = Math.cos(s.yaw), sy = Math.sin(s.yaw);
    p.fdx = dx * cy - dz * sy; p.fdz = dx * sy + dz * cy; p.flinch = 1 - 0.35 * e;
    const step = 0.35 * Math.sin(Math.min(1, u * 1.8) * Math.PI / 2); // a stagger away from the shot
    posePose(p, out, s.x + dx * step, s.y, s.z + dz * step, s.yaw + 0.3 * e * (i % 2 ? 1 : -1));
    // the slump: chest and head sag forward over the knees, arms and rifle hang
    const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), sag = e * e;
    const drop = (jj, dy, fw) => { out[jj * 3 + 1] -= dy * sag; out[jj * 3] += fx * fw * sag; out[jj * 3 + 2] += fz * fw * sag; };
    drop(J.chest, 0.1, 0.1); drop(J.neck, 0.18, 0.16); drop(J.head, 0.24, 0.2);
    drop(J.shL, 0.14, 0.12); drop(J.shR, 0.14, 0.12); drop(J.elbL, 0.3, 0.05); drop(J.elbR, 0.3, 0.05);
    drop(J.handL, 0.42, 0.02); drop(J.handR, 0.42, 0.02); drop(J.grip, 0.45, 0.02); drop(J.muzzle, 0.75, -0.1);
  }

  living(i, s, tau, out) {
    const p = this.pp, st = this.S.actors[i];
    p.u = s.phase / (Math.PI * 2); p.speed = s.speed; p.crouch = s.crouch; p.pitch = s.pitch;
    p.idleT = tau / 1.97 + st.skin * 7; p.idleSec = tau; p.st = styleOf(i, st.mg); p.mode = s.mode === MODE.BOAT ? 1 : 0; p.side = st.side;
    p.hurt = lastBefore(this.hitT[i], tau) >= 0;
    const f = this.fireT[i]; const k = lastBefore(f, tau);
    const ra = k >= 0 ? tau - f[k] : 9;
    p.recoil = ra < 0.12 ? Math.pow(1 - ra / 0.12, 2) : 0;
    const h = lastBefore(this.hitT[i], tau);
    const ha = h >= 0 ? tau - this.hitT[i][h] : 9;
    p.flinch = ha < 0.4 ? Math.sin(Math.min(1, ha / 0.4) * Math.PI) : 0;
    if (p.flinch > 0) {
      // world hit dir -> actor local
      const [dx, dz] = this.hitD[i][h]; const cy = Math.cos(s.yaw), sy = Math.sin(s.yaw);
      p.fdx = dx * cy - dz * sy; p.fdz = dx * sy + dz * cy;
    }
    const r = lastBefore(st.reloads, tau);
    const rage = r >= 0 ? tau - st.reloads[r] : 9;
    p.reload = rage < 2.6 ? rage / 2.6 : -1;
    posePose(p, out, s.x, s.y, s.z, s.yaw);
  }

  hide(i) { this.boneData.fill(0, i * NB * 16, (i + 1) * NB * 16); }

  // s: sample, returns key points
  pose(i, s, tau) {
    const st = this.S.actors[i];
    const j = this.joints;
    if (s.mode === MODE.DEAD && !this.ragdolls[i] && this.pb) this.computeRagdoll(i);
    if (s.mode === MODE.DEAD && this.ragdolls[i] && this.getup[i]) {
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
    const K = this.keys;
    K.head.set(j[J.head * 3], j[J.head * 3 + 1], j[J.head * 3 + 2]);
    K.neck.set(j[J.neck * 3], j[J.neck * 3 + 1], j[J.neck * 3 + 2]);
    K.pelvis.set(j[J.hips * 3], j[J.hips * 3 + 1], j[J.hips * 3 + 2]);
    K.headM.copy(this.mats[3]);
    return K;
  }

  commit() { this.boneTex.needsUpdate = true; }
}
