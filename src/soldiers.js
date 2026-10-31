// All soldiers: one instanced, GPU-skinned draw call. Living bodies are driven by mocap + procedural layers;
// the dead are precomputed verlet ragdolls (which therefore rewind perfectly).
import * as THREE from 'three';
import { J, NJ, NB, bindJoints, boneFrames, buildSoldierGeometry, makeSoldierMaterial } from './rig.js';
import { posePose, simulateRagdoll } from './anim.js';
import { MODE, SHOT_F } from './sim.js';

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
    this.ragdolls = new Array(N).fill(null);
    this.pp = { u: 0, speed: 0, crouch: 0, pitch: 0, idleT: 0, recoil: 0, flinch: 0, fdx: 0, fdz: 0, reload: -1, mode: 0 };
    this.keys = { head: new THREE.Vector3(), neck: new THREE.Vector3(), pelvis: new THREE.Vector3(), headM: new THREE.Matrix4() };
    this.tmpM = new THREE.Matrix4();
  }

  // precompute every death's ragdoll (needs the playback sampler)
  prepare(pb) {
    this.pb = pb;
    // deaths nearest the opening of the tape first; the rest are computed a few per frame
    this.pending = this.S.actors.filter((a) => a.deathTime > 0).sort((a, b) => b.deathTime - a.deathTime).map((a) => a.id);
    this.warm(12);
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
      if (st.cause === 'shot' && k >= 0) {
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
        const pow = e && e.big > 1 ? 9 : 6.5;
        ix = dx / l * pow; iz = dz / l * pow; iy = pow * 0.9; wDefault = 1; jitter = 2.5;
      }
      this.ragdolls[i] = simulateRagdoll(start, prev, { x: ix, y: iy, z: iz, w, wDefault, jitter, kx, kz }, i + 1);
    }
  }

  living(i, s, tau, out) {
    const p = this.pp, st = this.S.actors[i];
    p.u = s.phase / (Math.PI * 2); p.speed = s.speed; p.crouch = s.crouch; p.pitch = s.pitch;
    p.idleT = tau / 1.97 + st.skin * 7; p.mode = s.mode === MODE.BOAT ? 1 : 0; p.side = st.side;
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
    if (s.mode === MODE.DEAD && this.ragdolls[i]) {
      const R = this.ragdolls[i], nf = R.length / (NJ * 3);
      const f = Math.min(nf - 1.001, Math.max(0, (tau - st.deathTime) * 30));
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
