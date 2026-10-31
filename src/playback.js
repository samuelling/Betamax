// Renders the recorded battle at an arbitrary tape position tau. Everything here is a pure
// function of tau, so it plays backwards (and fast-forwards) for free.
import * as THREE from 'three';
import { HZ, F, MODE, SHOT_F } from './sim.js';
import { heightAt } from './terrain.js';
import { vehZ, heloPose } from './layout.js';
import { hash1, hash2 } from './rng.js';

const lerpAng = (a, b, t) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * t; };
const G = 9.8;

function lowerBound(arr, stride, off, v, n) {
  let lo = 0, hi = n;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m * stride + off] < v) lo = m + 1; else hi = m; }
  return lo;
}

function segSegDist(p1, q1, p2, q2) {
  // closest distance between segments p1q1 and p2q2 (arrays/vec-like with x,y,z)
  const d1x = q1.x - p1.x, d1y = q1.y - p1.y, d1z = q1.z - p1.z;
  const d2x = q2.x - p2.x, d2y = q2.y - p2.y, d2z = q2.z - p2.z;
  const rx = p1.x - p2.x, ry = p1.y - p2.y, rz = p1.z - p2.z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z, e = d2x * d2x + d2y * d2y + d2z * d2z, f = d2x * rx + d2y * ry + d2z * rz;
  let s, t;
  if (a < 1e-9 && e < 1e-9) return Math.hypot(rx, ry, rz);
  if (a < 1e-9) { s = 0; t = Math.min(1, Math.max(0, f / e)); }
  else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e < 1e-9) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
    else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z, den = a * e - b * b;
      s = den !== 0 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); } else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
    }
  }
  const cx = p1.x + d1x * s - (p2.x + d2x * t), cy = p1.y + d1y * s - (p2.y + d2y * t), cz = p1.z + d1z * s - (p2.z + d2z * t);
  return Math.hypot(cx, cy, cz);
}

export class Playback {
  constructor(sim, world, soldiers, smoke, glow, tracers, scene) {
    this.S = sim; this.world = world; this.sol = soldiers; this.smoke = smoke; this.glow = glow; this.tr = tracers;
    this.samp = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, crouch: 0, speed: 0, phase: 0, mode: 0 };
    this.hit = sim.actors.map(() => ({ ok: false, head: new THREE.Vector3(), neck: new THREE.Vector3(), pelvis: new THREE.Vector3(), pos: new THREE.Vector3(), yaw: 0, pitch: 0 }));
    this.lights = [];
    for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xffa060, 0, 60, 1.6); scene.add(l); this.lights.push(l); }
    this.hitShots = new Set();
    this.whizzed = new Set();
    // drones
    this.drones = [];
    const dm = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 });
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.3), dm); g.add(body);
      [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([a, b]) => {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.28), dm); arm.position.set(a * 0.1, 0, b * 0.1); arm.rotation.y = a * b * 0.78; g.add(arm);
        const rot = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.005, 12), new THREE.MeshBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.4 }));
        rot.position.set(a * 0.18, 0.04, b * 0.18); g.add(rot);
      });
      g.visible = false; scene.add(g); this.drones.push(g);
    }
    this.v = new THREE.Vector3(); this.v2 = new THREE.Vector3();
  }

  sample(i, tau, out) {
    const S = this.S;
    const s = Math.min(Math.max(tau * HZ, 0), S.steps - 1.001);
    const i0 = Math.floor(s), f = s - i0;
    const o0 = (i * S.steps + i0) * F, o1 = o0 + F, R = S.rec;
    out.x = R[o0] + (R[o1] - R[o0]) * f;
    out.y = R[o0 + 1] + (R[o1 + 1] - R[o0 + 1]) * f;
    out.z = R[o0 + 2] + (R[o1 + 2] - R[o0 + 2]) * f;
    out.yaw = lerpAng(R[o0 + 3], R[o1 + 3], f);
    out.pitch = R[o0 + 4] + (R[o1 + 4] - R[o0 + 4]) * f;
    out.crouch = R[o0 + 5] + (R[o1 + 5] - R[o0 + 5]) * f;
    out.speed = R[o0 + 6] + (R[o1 + 6] - R[o0 + 6]) * f;
    out.phase = R[o0 + 7] + (R[o1 + 7] - R[o0 + 7]) * f;
    out.mode = f < 0.5 ? R[o0 + 8] : R[o1 + 8];
    const st = S.actors[i];
    if (st.deathTime > 0 && tau >= st.deathTime) out.mode = MODE.DEAD;
    else if (out.mode === MODE.DEAD) out.mode = MODE.GROUND;
    if (out.mode === MODE.GROUND && tau < st.spawn) out.mode = st.side === 1 && S.L.vehicles[st.veh].type === 'lcac' ? MODE.BOAT : MODE.HIDDEN;
    return out;
  }

  // is actor i a valid living target at tau?
  alive(i, tau) {
    const st = this.S.actors[i];
    return tau >= st.spawn && !(st.deathTime > 0 && tau >= st.deathTime);
  }

  shotPos(o, t, out) {
    const A = this.S.shots;
    const u = Math.min(1, Math.max(0, (t - A[o]) / (A[o + 1] - A[o])));
    out.x = A[o + 2] + (A[o + 5] - A[o + 2]) * u; out.y = A[o + 3] + (A[o + 6] - A[o + 3]) * u; out.z = A[o + 4] + (A[o + 7] - A[o + 4]) * u;
    return out;
  }

  update(tau, tauPrev, ctx) {
    const S = this.S, A = S.shots, sm = this.smoke, gl = this.glow, tr = this.tr;
    const ev = { playerHits: [], feed: [], shake: 0, sounds: [], nearestDrone: 1e9, heloDist: 1e9, wrecks: [] };
    const body = ctx.bodyId;
    const pp = ctx.playerPos;
    // ---------------- soldiers ----------------
    for (let i = 0; i < S.N; i++) {
      const s = this.sample(i, tau, this.samp);
      const h = this.hit[i];
      h.ok = false;
      if (i === body && ctx.hideBody) { this.sol.hide(i); this.capture(i, s, tau); continue; }
      if (s.mode === MODE.HIDDEN) { this.sol.hide(i); continue; }
      const ov = ctx.overrides.get(i);
      if (ov) {
        const k = Math.min(1, (ctx.real - ov.t0) / 1.6);
        const e = k * k * (3 - 2 * k);
        if (k >= 1) ctx.overrides.delete(i);
        else {
          s.x = ov.x + (s.x - ov.x) * e; s.z = ov.z + (s.z - ov.z) * e; s.y = ov.y + (s.y - ov.y) * e; s.yaw = lerpAng(ov.yaw, s.yaw, e);
        }
      }
      const st = S.actors[i];
      const deadAge = s.mode === MODE.DEAD ? tau - st.deathTime : -1;
      const k = this.sol.pose(i, s, deadAge, st.fallSign);
      if (s.mode === MODE.GROUND) {
        h.ok = true; h.head.copy(k.head); h.neck.copy(k.neck); h.pelvis.copy(k.pelvis);
      }
      h.pos.set(s.x, s.y, s.z); h.yaw = s.yaw; h.pitch = s.pitch;
    }
    this.sol.commit();

    sm.begin(); gl.begin(); tr.begin();
    for (const item of ctx.liveFx) item(sm, gl, tr);

    // ---------------- shots ----------------
    const n = S.nShots;
    const i0 = lowerBound(A, SHOT_F, 0, tau - 1.6, n);
    const i1 = lowerBound(A, SHOT_F, 0, tau + 0.6, n);
    const pa = this.v, pb = this.v2;
    const cap0 = { x: pp.x, y: pp.y + 0.25, z: pp.z }, cap1 = { x: pp.x, y: pp.y + ctx.playerHeight - 0.05, z: pp.z };
    for (let si = i0; si < i1; si++) {
      const o = si * SHOT_F;
      const fireT = A[o], impT = A[o + 1], shooter = A[o + 8], target = A[o + 9];
      if (shooter === body) continue;
      const veh = shooter < 0;
      const side = veh ? 1 : S.actors[shooter].side;
      // reversed sound lead
      if (ctx.sound && fireT + 0.42 <= tauPrev && fireT + 0.42 > tau) ev.sounds.push(['shot', A[o + 2], A[o + 3], A[o + 4], veh ? 2 : side]);
      // muzzle flash
      const fa = tau - fireT;
      if (fa > -0.035 && fa < 0.035) {
        const hs = hash1(si);
        gl.push(A[o + 2], A[o + 3], A[o + 4], (veh ? 1.3 : 0.65) * (0.7 + hs * 0.6), 3.2, 1.9, 0.9, 1, hs * 6);
      }
      if (fa > 0 && fa < 1.4) {
        const u = fa / 1.4;
        sm.push(A[o + 2] + fa * 0.4, A[o + 3] + fa * 0.5, A[o + 4], 0.25 + fa * 0.9, 0.75, 0.73, 0.7, 0.13 * (1 - u), hash1(si) * 6);
      }
      // tracer in flight
      if (tau >= fireT && tau <= impT) {
        this.shotPos(o, tau, pa);
        this.shotPos(o, tau + 0.022, pb);
        const bright = si % 3 === 0 || veh;
        const c = side === 0 ? [3.2, 1.0, 0.35] : [0.7, 3.0, 0.9];
        const a = bright ? 1 : 0.22;
        tr.push(pb.x, pb.y, pb.z, veh ? 0.05 : 0.025, pa.x, pa.y, pa.z, veh ? 0.07 : 0.035, c[0], c[1], c[2], a);
        // near-miss whiz
        if (ctx.playerAlive && !this.whizzed.has(si)) {
          const dx = pa.x - pp.x, dy = pa.y - (pp.y + 1.2), dz = pa.z - pp.z;
          if (dx * dx + dy * dy + dz * dz < 14) { this.whizzed.add(si); ev.sounds.push(['whiz', pa.x, pa.y, pa.z, 0]); }
        }
      }
      // damage to player: reversed bullets are still bullets
      if (ctx.playerAlive && target !== body && !this.hitShots.has(si)) {
        const ta = Math.min(Math.max(tauPrev, fireT), impT), tb = Math.min(Math.max(tau, fireT), impT);
        if (ta !== tb) {
          this.shotPos(o, ta, pa); this.shotPos(o, tb, pb);
          if (segSegDist(pa, pb, cap0, cap1) < 0.42) {
            this.hitShots.add(si);
            ev.playerHits.push({ dmg: veh ? 45 : 24, fromX: A[o + 2], fromZ: A[o + 4] });
          }
        }
      }
    }
    // impacts
    const bi = S.byImpact;
    let lo = 0, hi = n;
    while (lo < hi) { const m = (lo + hi) >> 1; if (A[bi[m] * SHOT_F + 1] < tau - 1.6) lo = m + 1; else hi = m; }
    for (let j = lo; j < n; j++) {
      const si = bi[j], o = si * SHOT_F;
      const impT = A[o + 1];
      if (impT > tau) break;
      if (A[o + 8] === body) continue;
      const age = tau - impT, kind = A[o + 10];
      const ix = A[o + 5], iy = A[o + 6], iz = A[o + 7];
      if (kind === 1) {
        for (let k = 0; k < 3; k++) {
          const hx = hash2(si, k) - 0.5, hz = hash2(k, si) - 0.5;
          sm.push(ix + hx * age * 2, iy + age * 1.1 + 0.1, iz + hz * age * 2, 0.35 + age * 1.5, 0.8, 0.72, 0.58, 0.5 * Math.pow(1 - age / 1.6, 1.5), k);
        }
        if (age < 0.9) for (let k = 0; k < 4; k++) {
          const vx = (hash2(si * 3, k) - 0.5) * 3, vy = 2.5 + hash2(k, si * 5) * 3, vz = (hash2(si * 7, k) - 0.5) * 3;
          const y = iy + vy * age - 0.5 * G * age * age;
          if (y > iy - 0.1) sm.push(ix + vx * age, y, iz + vz * age, 0.07, 0.42, 0.36, 0.28, 0.9, 0);
        }
      } else if (kind === 2) {
        if (age < 1.1) for (let k = 0; k < 6; k++) {
          const vx = (hash2(si, k) - 0.5) * 1.5, vy = 3.5 + hash2(k, si) * 3, vz = (hash2(si * 3, k) - 0.5) * 1.5;
          const y = iy + vy * age - 0.5 * G * age * age;
          if (y > iy - 0.05) sm.push(ix + vx * age, y, iz + vz * age, 0.12 + age * 0.2, 0.92, 0.94, 0.96, 0.7 * (1 - age / 1.1), 0);
        }
      } else if (kind === 3 && age < 0.45) {
        sm.push(ix, iy + age * 0.3, iz, 0.25 + age * 1.2, 0.32, 0.05, 0.04, 0.55 * (1 - age / 0.45), si);
      }
    }

    // ---------------- strikes ----------------
    let li = 0;
    const lightCand = [];
    S.explosions.forEach((e, ei) => {
      const age = tau - e.t;
      // incoming
      if (tau >= e.launchT && tau < e.t) {
        const u = (tau - e.launchT) / (e.t - e.launchT);
        if (e.kind === 'shell' && e.t - tau < 1.6) {
          const p = this.arc(e, u, 90), q = this.arc(e, Math.max(0, u - 0.012), 90);
          tr.push(q.x, q.y, q.z, 0.08, p.x, p.y, p.z, 0.15, 3, 1.6, 0.6, 1);
        } else if (e.kind === 'drone') {
          const p = this.dronePos(e, u);
          const dg = this.drones[ei % this.drones.length];
          dg.visible = true; dg.position.set(p.x, p.y, p.z);
          const q = this.dronePos(e, Math.min(1, u + 0.01));
          dg.lookAt(q.x, q.y, q.z);
          dg.userData.used = true;
          if (Math.sin(tau * 18) > 0.3) gl.push(p.x, p.y + 0.05, p.z, 0.25, 3, 0.2, 0.15, 1, 0);
          const d = Math.hypot(p.x - pp.x, p.y - pp.y, p.z - pp.z);
          if (d < ev.nearestDrone) ev.nearestDrone = d;
        } else if (e.kind === 'vehicle') {
          const m = S.missiles.find((mm) => mm.vi === e.vi);
          if (m) {
            const p = this.missilePos(m, u), q = this.missilePos(m, Math.max(0, u - 0.01));
            tr.push(q.x, q.y, q.z, 0.1, p.x, p.y, p.z, 0.16, 4, 3, 2, 1);
            gl.push(p.x, p.y, p.z, 0.9, 3, 2, 1.2, 1, 0);
          }
        }
      }
      // missile smoke trail persists after flight
      if (e.kind === 'vehicle' && tau >= e.launchT && tau < e.t + 6) {
        const m = S.missiles.find((mm) => mm.vi === e.vi);
        if (m) for (let k = 0; k < 28; k++) {
          const uk = k / 27; const birth = e.launchT + uk * (e.t - e.launchT);
          const a = tau - birth; if (a < 0 || a > 6) continue;
          const p = this.missilePos(m, uk);
          sm.push(p.x + a * 0.6, p.y + a * 0.3, p.z, 0.5 + a * 0.9, 0.85, 0.84, 0.82, 0.35 * (1 - a / 6), k);
        }
      }
      if (ctx.sound && e.t + 2.6 <= tauPrev && e.t + 2.6 > tau) ev.sounds.push(['boom', e.ix, e.iy, e.iz, e.big]);
      if (e.t <= tauPrev && e.t > tau && ctx.playerAlive) {
        const d = Math.hypot(e.ix - pp.x, e.iz - pp.z);
        const rad = e.big > 1 ? 9 : 7;
        if (d < rad) ev.playerHits.push({ dmg: 130 * (1 - d / rad) + 10, fromX: e.ix, fromZ: e.iz });
        ev.shake = Math.max(ev.shake, Math.max(0, 1 - d / 60));
      }
      if (age < 0) return;
      const big = e.big;
      const wet = e.iy <= 0.15 && e.iz > 5;
      if (age < 0.4) lightCand.push([age, e]);
      if (age < 0.2) gl.push(e.ix, e.iy + 1.5, e.iz, 16 * big * (1 - age / 0.2) + 4, 4.5, 2.8, 1.5, 1, ei);
      if (age < 1.0) for (let k = 0; k < 9; k++) {
        const hx = hash2(ei, k) - 0.5, hy = hash2(k, ei), hz = hash2(ei * 3, k) - 0.5;
        const r = (1 + age * 7) * (big > 1 ? 1.4 : 1);
        gl.push(e.ix + hx * r, e.iy + 0.8 + hy * r * 0.8, e.iz + hz * r, (2.5 + age * 5) * big, 3.2, 1.3, 0.35, Math.pow(1 - age, 2), k);
      }
      if (age < 3) for (let k = 0; k < 26; k++) {
        const vx = (hash2(ei, k + 50) - 0.5) * 12, vy = 7 + hash2(k + 9, ei) * 13, vz = (hash2(ei * 5, k) - 0.5) * 12;
        const y = e.iy + vy * age - 0.5 * G * age * age;
        if (y < e.iy - 0.3) continue;
        const c = wet ? [0.92, 0.93, 0.95] : big > 1 ? [0.12, 0.11, 0.1] : [0.55, 0.48, 0.38];
        sm.push(e.ix + vx * age, y, e.iz + vz * age, (wet ? 0.8 : 0.45) + age * 0.6, c[0], c[1], c[2], 0.85 * (1 - age / 3), k);
      }
      if (age < 32) for (let k = 0; k < 16; k++) {
        const b = k * 0.18; const a = age - b; if (a < 0) continue;
        const hx = hash2(ei, k + 100) - 0.5, hz = hash2(k + 100, ei) - 0.5;
        const life = 32 - b;
        const fade = Math.min(1, a * 1.5) * Math.max(0, 1 - a / life);
        const c = big > 1 ? 0.1 : wet ? 0.75 : 0.32;
        sm.push(e.ix + hx * 3 + a * 0.9, e.iy + 1 + a * (0.9 + hash1(k) * 0.6), e.iz + hz * 3 + a * 0.2, 2.2 + a * 0.55, c * 1.05, c, c * 0.95, 0.42 * fade, k + a * 0.05);
      }
      // burning wrecks
      if (e.kind === 'vehicle') {
        const v = S.L.vehicles[e.vi];
        const top = heightAt(v.x, v.zStop) + (v.type === 'aav' ? 3 : 4.5);
        for (let k = 0; k < 7; k++) {
          const fl = 0.6 + 0.4 * Math.sin(tau * 13 + k * 2.1) * Math.sin(tau * 7.3 + k);
          gl.push(v.x + (hash1(k) - 0.5) * 2.5, top + 0.4 + hash1(k + 3) * 0.6 + fl * 0.3, v.zStop + (hash1(k + 7) - 0.5) * 4, 1.4 + fl, 3.2, 1.25, 0.3, 0.8 * Math.min(1, age * 0.5 + 0.3), k + tau);
        }
        const t0 = e.t + 0.5;
        const jStart = Math.max(0, Math.ceil((tau - 13.5 - t0) / 0.45));
        for (let j = jStart; j < jStart + 31; j++) {
          const birth = t0 + j * 0.45;
          const a = tau - birth; if (a < 0) break; if (a > 13.5) continue;
          sm.push(v.x + a * 1.1, top + a * 1.6, v.zStop + a * 0.3, 1.5 + a * 0.75, 0.06, 0.055, 0.05, 0.5 * Math.min(1, a) * (1 - a / 13.5), j);
        }
        ev.wrecks.push(v);
      }
    });
    for (const d of this.drones) { if (!d.userData.used) d.visible = false; d.userData.used = false; }
    lightCand.sort((p, q) => p[0] - q[0]);
    this.lights.forEach((l, k) => {
      const c = lightCand[k];
      if (!c) { l.intensity = 0; return; }
      const [age, e] = c;
      l.position.set(e.ix, e.iy + 3, e.iz);
      l.intensity = 1600 * e.big * Math.pow(1 - age / 0.4, 2);
    });

    // ---------------- vehicles: wakes, spray ----------------
    for (const v of S.L.vehicles) {
      const t0 = v.tArrive - v.approach;
      if (tau < t0 || tau > v.tArrive + 0.5) continue;
      const lc = v.type === 'lcac';
      for (let k = 0; k < 16; k++) {
        const tk = tau - k * 0.3; if (tk < t0) break;
        const zk = vehZ(v, tk) + (lc ? 12 : 4);
        const gy = heightAt(v.x, zk);
        const water = gy < 0;
        const sd = (k % 2 ? 1 : -1) * (lc ? 6 : 1.5);
        const c = water || lc ? [0.92, 0.93, 0.94] : [0.55, 0.5, 0.42];
        sm.push(v.x + sd + (hash1(k) - 0.5) * 2, Math.max(gy, 0) + 0.4 + k * 0.08 * (lc ? 2 : 1), zk + k * 0.5, (lc ? 2.2 : 1.0) + k * (lc ? 0.6 : 0.25), c[0], c[1], c[2], (lc ? 0.45 : 0.35) * (1 - k / 16), k);
      }
    }
    // helicopters: rotor wash dust + distance for audio
    const hp = {};
    for (const h of S.L.helos) {
      heloPose(h, tau, hp);
      const alt = hp.y - heightAt(hp.x, hp.z);
      const d = Math.hypot(hp.x - pp.x, hp.y - pp.y, hp.z - pp.z);
      if (d < ev.heloDist) ev.heloDist = d;
      if (alt < 18) {
        const s = 1 - alt / 18;
        for (let k = 0; k < 14; k++) {
          const a = k / 14 * 6.283 + tau * 0.7;
          const r = 4 + ((tau * 4 + k * 1.7) % 9);
          const gy = heightAt(hp.x + Math.cos(a) * r, hp.z + Math.sin(a) * r);
          sm.push(hp.x + Math.cos(a) * r, gy + 0.6 + (r - 4) * 0.12, hp.z + Math.sin(a) * r, 1.5 + r * 0.25, 0.7, 0.64, 0.54, 0.22 * s * (1 - (r - 4) / 9), k);
        }
      }
    }
    // ambient drifting haze over the battlefield
    for (let k = 0; k < 22; k++) {
      const x = ((k * 37.3 + tau * 1.1) % 280) - 140;
      const z = -50 + hash1(k + 300) * 150;
      sm.push(x, heightAt(x, z) + 2.5 + hash1(k) * 4, z, 16 + hash1(k + 1) * 14, 0.78, 0.74, 0.7, 0.03, k);
    }

    // ---------------- kill feed ----------------
    for (const d of S.deaths) {
      if (d.t <= tauPrev && d.t > tau) ev.feed.push(d);
    }
    sm.end(); gl.end(); tr.end();
    return ev;
  }

  capture(i, s, tau) {
    // pose (hidden) to get key points of the player's own body for camera/intro
    const st = this.S.actors[i];
    const deadAge = s.mode === MODE.DEAD ? tau - st.deathTime : -1;
    const k = this.sol.pose(i, s, deadAge, st.fallSign);
    this.sol.hide(i);
    const h = this.hit[i]; h.head.copy(k.head); h.neck.copy(k.neck); h.pelvis.copy(k.pelvis); h.pos.set(s.x, s.y, s.z); h.yaw = s.yaw; h.pitch = s.pitch;
  }

  arc(e, u, apex) {
    const o = this._arc || (this._arc = new THREE.Vector3());
    o.set(e.sx + (e.ix - e.sx) * u, e.sy + (e.iy - e.sy) * u + Math.sin(u * Math.PI) * apex, e.sz + (e.iz - e.sz) * u);
    return o;
  }
  dronePos(e, u) {
    const o = this._dp || (this._dp = new THREE.Vector3());
    const side = e.ix > 0 ? -1 : 1;
    const sx = e.ix + side * 50, sy = 20, sz = e.iz + 170;
    const ax = e.ix, ay = e.iy + 24, az = e.iz + 14;
    if (u < 0.8) { const k = u / 0.8; o.set(sx + (ax - sx) * k, sy + (ay - sy) * k + Math.sin(k * 9) * 0.6, sz + (az - sz) * k); }
    else { const k = Math.pow((u - 0.8) / 0.2, 1.6); o.set(ax + (e.ix - ax) * k, ay + (e.iy + 0.5 - ay) * k, az + (e.iz - az) * k); }
    return o;
  }
  missilePos(m, u) {
    const o = this._mp || (this._mp = new THREE.Vector3());
    o.set(m.sx + (m.ix - m.sx) * u, m.sy + (m.iy - m.sy) * u + Math.pow(Math.sin(u * Math.PI), 0.7) * 48 * (u < 0.5 ? 1 : 1), m.sz + (m.iz - m.sz) * u);
    return o;
  }
}
