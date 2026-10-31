// Character motion: mocap locomotion (walk/run/idle) + procedural layers (crouch, kneel, aim,
// recoil, flinch, reload, breathing) + precomputed verlet ragdolls for deaths.
import * as THREE from 'three';
import { CLIPS } from './mocap.js';
import { J, NJ } from './rig.js';
import { heightFast as heightAt } from './terrain.js';

// mocap joint order: hips spine chest neck head shL elbL handL shR elbR handR hipL kneeL ankleL toeL hipR kneeR ankleR toeR
const MJ = { hips: 0, spine: 1, chest: 2, neck: 3, head: 4, shL: 5, shR: 8, hipL: 11, kneeL: 12, ankleL: 13, toeL: 14, hipR: 15, kneeR: 16, ankleR: 17, toeR: 18 };
const NM = 19;
const clip = {};
for (const k of ['walk', 'run', 'idle']) {
  const c = CLIPS[k]; const d = Float32Array.from(c.data);
  let m = 0; for (let f = 0; f < c.n; f++) m += d[f * NM * 3 + 1]; m /= c.n;
  clip[k] = { n: c.n, d, hipsMean: m };
}
function sampleClip(c, u, out) {
  const f = (((u % 1) + 1) % 1) * c.n; const i0 = Math.floor(f) % c.n, i1 = (i0 + 1) % c.n, t = f - Math.floor(f);
  const a = i0 * NM * 3, b = i1 * NM * 3;
  for (let k = 0; k < NM * 3; k++) out[k] = c.d[a + k] + (c.d[b + k] - c.d[a + k]) * t;
}
const W = new Float32Array(NM * 3), R = new Float32Array(NM * 3), I = new Float32Array(NM * 3), Mx = new Float32Array(NM * 3);
const mv = (k, o) => o.set(Mx[k * 3], Mx[k * 3 + 1], Mx[k * 3 + 2]);

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const t1 = V(), t2 = V(), t3 = V(), t4 = V(), t5 = V(), t6 = V();
const Rp = new THREE.Matrix3(), Rc = new THREE.Matrix3(), Rh = new THREE.Matrix3();
function basis(m, x, y) {
  const Y = t5.copy(y).normalize();
  const X = t6.copy(x).addScaledVector(Y, -x.dot(Y)).normalize();
  const Z = V().crossVectors(X, Y);
  m.set(X.x, Y.x, Z.x, X.y, Y.y, Z.y, X.z, Y.z, Z.z);
}
const rotX = (m, a) => m.multiply(new THREE.Matrix3().set(1, 0, 0, 0, Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a)));

export function ik(S, T, a, b, pole, outJ, outEnd) {
  const dir = t1.subVectors(T, S);
  let d = dir.length(); dir.divideScalar(d || 1);
  d = Math.min(Math.max(d, Math.abs(a - b) + 1e-3), a + b - 1e-3);
  const cosA = (a * a + d * d - b * b) / (2 * a * d);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const p = t2.copy(pole).addScaledVector(dir, -pole.dot(dir));
  if (p.lengthSq() < 1e-8) p.set(0, 0, 1); p.normalize();
  outJ.copy(S).addScaledVector(dir, a * cosA).addScaledVector(p, a * sinA);
  if (outEnd) outEnd.subVectors(T, outJ).normalize().multiplyScalar(b).add(outJ);
  return outJ;
}

const PJ = Array.from({ length: NJ }, () => V());
const put = (j, k, v) => { j[k * 3] = v.x; j[k * 3 + 1] = v.y; j[k * 3 + 2] = v.z; };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * Compute a living pose in actor-local space (facing +z, left = +x, feet on y = 0), write world joints.
 * p: {u, speed, crouch, pitch, idleT, recoil, flinch, fdx, fdz, reload, mode, seed}
 */
export function posePose(p, out, x, y, z, yaw) {
  const wRun = smooth(2.3, 3.9, p.speed);
  const wMove = smooth(0.12, 0.9, p.speed);
  sampleClip(clip.walk, p.u, W); sampleClip(clip.run, p.u, R); sampleClip(clip.idle, p.idleT, I);
  for (let k = 0; k < NM * 3; k++) { const lo = W[k] + (R[k] - W[k]) * wRun; Mx[k] = I[k] + (lo - I[k]) * wMove; }
  const baseHY = clip.idle.hipsMean + ((clip.walk.hipsMean + (clip.run.hipsMean - clip.walk.hipsMean) * wRun) - clip.idle.hipsMean) * wMove;
  const boat = p.mode === 1;
  const c = boat ? 1 : p.crouch;
  const kneel = boat ? 1 : smooth(0.55, 0.9, c) * (1 - wMove);
  const crouchMove = c * (1 - kneel);
  // ---- pelvis & torso frames from mocap ----
  const hips = mv(MJ.hips, PJ[J.hips]);
  basis(Rp, t3.subVectors(mv(MJ.hipL, t1), mv(MJ.hipR, t2)), t4.subVectors(mv(MJ.spine, t1), hips));
  basis(Rc, t3.subVectors(mv(MJ.shL, t1), mv(MJ.shR, t2)), t4.subVectors(mv(MJ.neck, t1), mv(MJ.chest, t2)));
  basis(Rh, t3.subVectors(mv(MJ.shL, t1), mv(MJ.shR, t2)), t4.subVectors(mv(MJ.head, t1), mv(MJ.neck, t2)));
  const lean = wRun * 0.12 + wMove * 0.03 + crouchMove * 0.35 + kneel * 0.1;
  rotX(Rp, lean * 0.4); rotX(Rc, lean - p.pitch * 0.35); rotX(Rh, lean * 0.3 - p.pitch * 0.65);
  const bob = (hips.y - baseHY) * (1 - kneel);
  const hipH = 0.95 - crouchMove * 0.3 - kneel * 0.39;
  hips.set(hips.x * (1 - kneel), hipH + bob, hips.z * (1 - kneel) - kneel * 0.04);
  // breathing + flinch
  const breath = Math.sin(p.idleT * Math.PI * 2 * 1.6) * 0.006 * (1 - wMove);
  const fl = p.flinch;
  PJ[J.spine].set(0, 0.13, 0.005).applyMatrix3(Rp).add(hips);
  t3.set(0, 1, 0).applyMatrix3(Rp).add(t4.set(0, 1, 0).applyMatrix3(Rc)).normalize();
  PJ[J.chest].copy(PJ[J.spine]).addScaledVector(t3, 0.23); PJ[J.chest].y += breath;
  PJ[J.chest].x += p.fdx * 0.07 * fl; PJ[J.chest].z += p.fdz * 0.07 * fl;
  PJ[J.neck].set(0, 0.17, -0.01).applyMatrix3(Rc).add(PJ[J.chest]);
  PJ[J.neck].x += p.fdx * 0.05 * fl; PJ[J.neck].z += p.fdz * 0.05 * fl;
  PJ[J.head].set(0, 0.13, 0.012).applyMatrix3(Rh).add(PJ[J.neck]);
  PJ[J.head].x += p.fdx * 0.05 * fl; PJ[J.head].z += p.fdz * 0.05 * fl;
  PJ[J.shL].set(0.185, 0.12, -0.01).applyMatrix3(Rc).add(PJ[J.chest]);
  PJ[J.shR].set(-0.185, 0.12, -0.01).applyMatrix3(Rc).add(PJ[J.chest]);
  PJ[J.hipL].set(0.095, -0.05, 0).applyMatrix3(Rp).add(hips);
  PJ[J.hipR].set(-0.095, -0.05, 0).applyMatrix3(Rp).add(hips);
  // ---- legs: mocap foot paths, IK with mocap knee direction ----
  const mh = mv(MJ.hips, t6.set(0, 0, 0));
  const legs = [[MJ.hipL, MJ.kneeL, MJ.ankleL, MJ.toeL, J.hipL, J.kneeL, J.ankleL, J.toeL, 1], [MJ.hipR, MJ.kneeR, MJ.ankleR, MJ.toeR, J.hipR, J.kneeR, J.ankleR, J.toeR, -1]];
  for (const [mH, mK, mA, mT, jH, jK, jA, jT, s] of legs) {
    const mA_ = mv(mA, V()), mT_ = mv(mT, V()), mK_ = mv(mK, V()), mH_ = mv(mH, V());
    const ank = V(hips.x + (mA_.x - mh.x) * (1 + crouchMove * 0.4), mA_.y, hips.z + (mA_.z - mh.z) * (1 - crouchMove * 0.2));
    const toe = V().copy(ank).add(V().subVectors(mT_, mA_));
    if (kneel > 0) {
      const kA = s > 0 ? V(0.14, 0.085, 0.3) : V(-0.12, 0.13, -0.36);
      const kT = s > 0 ? V(0.14, 0.02, 0.45) : V(-0.12, 0.02, -0.25);
      ank.lerp(kA, kneel); toe.lerp(kT, kneel);
    }
    const pole = V().subVectors(mK_, V().addVectors(mH_, mA_).multiplyScalar(0.5)).normalize().add(V(0, 0, 0.35));
    if (kneel > 0 && s < 0) pole.lerp(V(0, -1, 0.3), kneel);
    const endA = V();
    ik(PJ[jH], ank, 0.43, 0.43, pole, PJ[jK], endA);
    PJ[jA].copy(endA);
    PJ[jT].copy(endA).add(V().subVectors(toe, ank));
  }
  // ---- rifle & arms ----
  const ready = boat ? 0.25 : Math.max(0, 1 - wRun * 0.85);
  const pit = p.pitch;
  const aimDir = V(0, Math.sin(pit), Math.cos(pit));
  const aimGrip = V(0.06, -0.14, 0.2).applyMatrix3(new THREE.Matrix3().set(1, 0, 0, 0, Math.cos(-pit), -Math.sin(-pit), 0, Math.sin(-pit), Math.cos(-pit))).add(PJ[J.shR]);
  const lowDir = V(0.55, -0.55, 0.62).applyMatrix3(Rc).normalize();
  const lowGrip = V(-0.1, -0.08, 0.2).applyMatrix3(Rc).add(PJ[J.chest]);
  const dir = V().copy(lowDir).lerp(aimDir, ready).normalize();
  const grip = V().copy(lowGrip).lerp(aimGrip, ready);
  // recoil
  if (p.recoil > 0) { grip.addScaledVector(dir, -0.05 * p.recoil); dir.y += 0.12 * p.recoil; dir.normalize(); PJ[J.shR].addScaledVector(aimDir, -0.02 * p.recoil); }
  // reload choreography
  const bp = p.side === 1;
  let sup = V().copy(grip).addScaledVector(dir, bp ? 0.22 : 0.3); sup.y -= 0.025;
  if (p.reload >= 0) {
    const k = p.reload;
    const tilt = Math.sin(Math.min(1, k * 1.3) * Math.PI) * 0.5;
    dir.y -= tilt; dir.x += tilt * 0.4; dir.normalize();
    grip.y -= tilt * 0.08;
    const well = V().copy(grip).addScaledVector(dir, bp ? -0.14 : 0.1); well.y -= bp ? 0.09 : 0.13;
    const side = V(0.06, 0.0, 0).applyMatrix3(Rc).add(grip).addScaledVector(dir, bp ? -0.1 : 0.04); // bolt catch / charging handle
    const pouch = V(0.08, -0.12, 0.2).applyMatrix3(Rc).add(PJ[J.chest]);
    const ph = (a, b) => smooth(a, b, k);
    sup.lerp(well, ph(0.0, 0.18)); sup.lerp(pouch, ph(0.25, 0.42) * (1 - ph(0.5, 0.68))); sup.lerp(well, ph(0.5, 0.68) * (1 - ph(0.72, 0.8)));
    sup.lerp(side, ph(0.72, 0.8) * (1 - ph(0.86, 0.97)));
  }
  PJ[J.grip].copy(grip); PJ[J.muzzle].copy(grip).addScaledVector(dir, bp ? 0.5 : 0.72);
  ik(PJ[J.shR], grip, 0.28, 0.26, V(-0.7, -1, -0.25), PJ[J.elbR], PJ[J.handR]);
  ik(PJ[J.shL], sup, 0.28, 0.26, V(0.8, -1, 0.0), PJ[J.elbL], PJ[J.handL]);
  // ---- to world ----
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  for (let k = 0; k < NJ; k++) {
    const q = PJ[k];
    out[k * 3] = x + q.x * cy + q.z * sy; out[k * 3 + 1] = y + q.y; out[k * 3 + 2] = z - q.x * sy + q.z * cy;
  }
}

// ---------------- ragdoll ----------------
const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [2, 5], [2, 8], [5, 8], [5, 6], [6, 7], [8, 9], [9, 10], [0, 11], [0, 15], [11, 15], [11, 12], [12, 13], [13, 14], [15, 16], [16, 17], [17, 18], [19, 20]];
const STIFF = [[0, 2], [5, 11], [8, 15], [5, 15], [8, 11], [1, 5], [1, 8], [11, 1], [15, 1], [2, 11], [2, 15], [3, 5], [3, 8], [12, 14], [16, 18], [4, 2], [4, 5], [4, 8]];
const RAD = [0.12, 0.12, 0.13, 0.07, 0.11, 0.07, 0.05, 0.05, 0.07, 0.05, 0.05, 0.08, 0.06, 0.05, 0.04, 0.08, 0.06, 0.05, 0.04, 0.03, 0.03];

export function simulateRagdoll(start, prevStart, impulse, seed, frames = 75, groundFn = null, wallFn = null) {
  // start: Float32Array(NJ*3) pose at death; prevStart: pose 1/30s earlier (for momentum)
  const n = NJ, P = Float32Array.from(start), Q = new Float32Array(n * 3);
  const dt = 1 / 60;
  let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = 0; i < n * 3; i++) Q[i] = P[i] - (start[i] - prevStart[i]) * 0.5; // velocity * dt (30Hz -> 60Hz)
  for (let i = 0; i < n; i++) {
    const w = impulse.w[i] ?? impulse.wDefault;
    Q[i * 3] -= (impulse.x * w + (rnd() - 0.5) * impulse.jitter) * dt;
    Q[i * 3 + 1] -= (impulse.y * w + (rnd() - 0.2) * impulse.jitter * 0.5) * dt;
    Q[i * 3 + 2] -= (impulse.z * w + (rnd() - 0.5) * impulse.jitter) * dt;
  }
  // knees buckle
  for (const k of [12, 16]) { Q[k * 3] -= impulse.kx * dt; Q[k * 3 + 2] -= impulse.kz * dt; }
  const cons = [];
  const len = (a, b) => Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]);
  for (const [a, b] of BONES) cons.push([a, b, len(a, b), 1]);
  for (const [a, b] of STIFF) cons.push([a, b, len(a, b), 0.6]);
  const gripC = [10, 19, len(10, 19), 1];
  const out = new Float32Array(frames * n * 3);
  const G = new Float32Array(n);
  const steps = frames * 2;
  for (let st = 0; st < steps; st++) {
    // integrate
    for (let i = 0; i < n; i++) {
      for (let a = 0; a < 3; a++) {
        const k = i * 3 + a; const cur = P[k];
        let vel = (cur - Q[k]) * 0.993;
        P[k] = cur + vel + (a === 1 ? -9.8 * dt * dt : 0);
        Q[k] = cur;
      }
    }
    if (wallFn && st % 3 === 0) for (let i = 0; i < n; i++) {
      // bodies fold against walls, hulls and railings instead of passing through them
      const k = i * 3, r = wallFn(P[k], P[k + 2], P[k + 1] - RAD[i], RAD[i]);
      if (r[0] !== P[k] || r[1] !== P[k + 2]) { Q[k] += r[0] - P[k]; Q[k + 2] += r[1] - P[k + 2]; P[k] = r[0]; P[k + 2] = r[1]; Q[k] += (P[k] - Q[k]) * 0.5; Q[k + 2] += (P[k + 2] - Q[k + 2]) * 0.5; }
    }
    for (let i = 0; i < n; i++) G[i] = (groundFn ? groundFn(P[i * 3], P[i * 3 + 2], P[i * 3 + 1] - RAD[i]) : Math.max(heightAt(P[i * 3], P[i * 3 + 2]), -0.8)) + RAD[i];
    for (let it = 0; it < 6; it++) {
      const list = st < 10 ? cons.concat([gripC]) : cons;
      for (const [a, b, L, k] of list) {
        const ax = a * 3, bx = b * 3;
        const dx = P[bx] - P[ax], dy = P[bx + 1] - P[ax + 1], dz = P[bx + 2] - P[ax + 2];
        const d = Math.hypot(dx, dy, dz) || 1e-6;
        const diff = (d - L) / d * 0.5 * k;
        P[ax] += dx * diff; P[ax + 1] += dy * diff; P[ax + 2] += dz * diff;
        P[bx] -= dx * diff; P[bx + 1] -= dy * diff; P[bx + 2] -= dz * diff;
      }
      for (let i = 0; i < n; i++) {
        const k = i * 3; const g = G[i];
        if (P[k + 1] < g) {
          P[k + 1] = g;
          Q[k] += (P[k] - Q[k]) * 0.35; Q[k + 2] += (P[k + 2] - Q[k + 2]) * 0.35; // friction
          if (Q[k + 1] < g) Q[k + 1] = g + (Q[k + 1] - g) * 0.1;
        }
      }
    }
    if (st % 2 === 1) out.set(P, ((st - 1) / 2) * n * 3);
  }
  return out;
}
