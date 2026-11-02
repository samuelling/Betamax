// Ambient things running backward. None of it matters to the battle; all of it tells you which way the tape is going.
//   leaves   lift off the ground, flutter up through the air and go back onto their branches
//   smoke    from the morning stoves sinks back down the chimneys, shrinking into the flue
//   water    rings on the lake close in on a point, and a fish leaps out of it tail first, back to where it jumped
// Every one is a pure function of tape time, like everything else on the tape.
import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { lakeDist } from './terrainA.js';
import { QUAY_Z } from './terrainP.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const hash = (a, b = 0) => { let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const WIND = { x: 0.7, z: 0.35 };

export class BackCues {
  constructor(world, kind) {
    this.W = world; this.kind = kind; const root = world.root;
    // ---- leaves: autumn, from the oaks and maples near you
    this.leafy = ['sandwich', 'bomb', 'ash'].includes(kind) && (world.L.trees || []).length;
    if (this.leafy) {
      const g = new THREE.PlaneGeometry(0.3, 0.22); g.translate(0, 0, 0);
      this.leaves = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), 220); this.leaves.frustumCulled = false;
      for (let i = 0; i < 220; i++) { const h = hash(i, 3); _c.setRGB(0.55 + h * 0.4, 0.22 + hash(i, 5) * 0.35, 0.05 + hash(i, 9) * 0.06); this.leaves.setColorAt(i, _c); }
      root.add(this.leaves);
      this.trees = world.L.trees.filter((t) => t.kind === 'oak' || t.kind === 'maple'); this.trees.forEach((t, i) => (t._bi = i));
      this.near = []; this.nearAt = null;
    }
    // ---- chimney smoke: a few houses with the stove going
    this.stoves = [];
    if (['sandwich', 'bomb', 'beach'].includes(kind) && world.D && world.D.houses) {
      for (const H of world.D.houses) { if (hash(H.hi, 77) > (kind === 'beach' ? 0.6 : 0.5)) continue; const ch = H.pieces.find((p) => p.kind === 'chimney'); if (ch) this.stoves.push({ x: ch.c.x, y: ch.c.y + ch.sy / 2 + 0.1, z: ch.c.z, t: Math.min(ch.t, H.openT), seed: H.hi }); }
    }
    this.PER = 40;   // puffs per chimney; drawn into the shared smoke billboards by playback (pushSmoke)
    // ---- water: rings and fish
    this.water = kind === 'ash' ? { y: 0.17, wet: (x, z) => lakeDist(x, z) < -3 } : kind === 'beach' ? { y: 0.02, wet: (x, z) => heightAt(x, z) < -0.25 } : kind === 'port' ? { y: 0.05, wet: (x, z) => z > QUAY_Z + 4 } : null;
    if (this.water) {
      const ring = new THREE.RingGeometry(0.86, 1, 40).rotateX(-Math.PI / 2);
      this.rings = new THREE.InstancedMesh(ring, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: kind === 'port' ? 0.22 : 0.5, depthWrite: false, blending: THREE.AdditiveBlending }), 72);
      this.rings.frustumCulled = false; this.rings.renderOrder = 2; root.add(this.rings);
      const fg = new THREE.SphereGeometry(1, 8, 6).scale(0.06, 0.07, 0.24);
      this.fish = new THREE.InstancedMesh(fg, new THREE.MeshStandardMaterial({ color: 0x9aa4a6, metalness: 0.7, roughness: 0.3 }), 12); this.fish.frustumCulled = false; root.add(this.fish);
      this.drops = new THREE.InstancedMesh(new THREE.SphereGeometry(0.03, 5, 4), new THREE.MeshBasicMaterial({ color: 0xdfe8ee }), 72); this.drops.frustumCulled = false; root.add(this.drops);
    }
  }

  update(tau, cam) {
    const cx = cam.position.x, cz = cam.position.z;
    if (this.leafy) this.updLeaves(tau, cx, cz);
    if (this.water) this.updWater(tau, cx, cz);
  }

  updLeaves(tau, cx, cz) {
    // the nearest broadleaf trees, refreshed as you move
    if (!this.nearAt || Math.hypot(cx - this.nearAt.x, cz - this.nearAt.z) > 12) {
      this.nearAt = { x: cx, z: cz };
      this.near = this.trees.map((t) => [Math.hypot(t.x - cx, t.z - cz), t]).filter((a) => a[0] < 70).sort((a, b) => a[0] - b[0]).slice(0, 22).map((a) => a[1]);
    }
    const M = this.leaves; let k = 0;
    if (this.near.length) for (let i = 0; i < M.count; i++) {
      const t = this.near[i % this.near.length], ti = t._bi;
      const P = 9 + hash(i, ti) * 7, ph = hash(i, 11) * P, cyc = Math.floor((tau + ph) / P), u = (tau + ph) - cyc * P;   // u: seconds since this leaf let go
      const fall = 4.2 + hash(i, cyc) * 2.5;   // seconds in the air
      const a = hash(i * 3, cyc) * 6.28, r0 = (1.2 + hash(cyc, i) * 2.6) * t.s;
      const gy = heightAt(t.x, t.z), top = gy + (5.5 + hash(i, cyc * 7) * 4) * t.s;
      const sx = t.x + Math.cos(a) * r0, sz = t.z + Math.sin(a) * r0;
      let x, y, z, rx, rz;
      if (u < fall) {   // in the air: swinging down, carried a little downwind
        const f = u / fall, sw = Math.sin(u * 3.1 + i) * 0.7;
        x = sx + WIND.x * u * 0.9 + sw * Math.cos(a); z = sz + WIND.z * u * 0.9 + sw * Math.sin(a); y = top - (top - gy) * f;
        rx = Math.sin(u * 4.3 + i) * 1.2; rz = Math.cos(u * 3.7 + i * 2) * 1.1;
      } else {          // lying on the ground until the next time round
        x = sx + WIND.x * fall * 0.9; z = sz + WIND.z * fall * 0.9; y = heightAt(x, z) + 0.03; rx = -Math.PI / 2; rz = hash(i, cyc) * 6;
      }
      _e.set(rx, hash(i, 1) * 6.28, rz); _q.setFromEuler(_e); _p.set(x, y, z); _s.setScalar(0.8 + hash(i, 2) * 0.6);
      _m.compose(_p, _q, _s); M.setMatrixAt(k++, _m);
    }
    for (; k < M.count; k++) { _m.makeScale(0, 0, 0); M.setMatrixAt(k, _m); }
    M.instanceMatrix.needsUpdate = true;
  }

  pushSmoke(sm, tau, cp) {
    const E = 0.35, L = this.PER * E;
    for (const st of this.stoves) {
      if (tau >= st.t || Math.hypot(st.x - cp.x, st.z - cp.z) > 260) continue;   // the chimney's down, or too far to matter
      const t0 = Math.floor(tau / E) * E;
      for (let j = 0; j < this.PER; j++) {
        const born = t0 - j * E, age = tau - born, f = age / L;
        const h = hash(st.seed, Math.round(born / E));
        const x = st.x + WIND.x * age * 0.9 + Math.sin(age * 0.7 + h * 6) * 0.25 * age, z = st.z + WIND.z * age * 0.9, y = st.y + age * 0.75 - age * age * 0.006;
        sm.push(x, y, z, 0.8 + age * 0.6 + h * 0.3, 0.86, 0.88, 0.94, 0.55 * Math.min(1, age * 3) * Math.pow(1 - f, 1.2), st.seed * 31 + j);
      }
    }
  }

  updWater(tau, cx, cz) {
    const R = this.rings, F = this.fish, D = this.drops, w = this.water;
    let rk = 0, fk = 0, dk = 0;
    const P = 5.5, anchorX = Math.round(cx / 30) * 30, anchorZ = Math.round(cz / 30) * 30;
    for (let e = 0; e < 30; e++) {
      const ph = hash(e, 41) * P, cyc = Math.floor((tau + ph) / P), te = cyc * P - ph;   // when this one hit the water
      const x = anchorX + (hash(e, cyc) - 0.5) * 80, z = anchorZ + (hash(cyc, e) - 0.5) * 80;
      if (!w.wet(x, z)) continue;
      const age = tau - te, isFish = hash(e * 5, cyc) < (this.kind === 'ash' ? 0.35 : 0.12) && this.kind !== 'port';
      // the leap that ends here, starting a metre or two away
      if (isFish && fk < F.count) {
        const lt = 0.75, a0 = hash(e, cyc * 3) * 6.28, d0 = 1.4;
        const s = tau - (te - lt);
        if (s >= 0 && s < lt) {
          const u = s / lt, fx = x - Math.cos(a0) * d0 * (1 - u), fz = z - Math.sin(a0) * d0 * (1 - u), fy = w.y + 4 * 0.55 * u * (1 - u);
          _e.set(-(0.5 - u) * 2.2, Math.atan2(Math.cos(a0), Math.sin(a0)), 0); _q.setFromEuler(_e); _p.set(fx, fy, fz); _s.setScalar(1.3);
          _m.compose(_p, _q, _s); F.setMatrixAt(fk++, _m);
        }
        // the splash it left where it took off, drops falling back in
        const s2 = tau - (te - lt);
        if (s2 >= 0 && s2 < 0.6) for (let d = 0; d < 4 && dk < D.count; d++) {
          const vx = (hash(e, d) - 0.5) * 1.6, vz = (hash(d, e) - 0.5) * 1.6, vy = 1.6 + hash(e + d, cyc) * 1.2, yy = w.y + vy * s2 - 4.9 * s2 * s2;
          if (yy < w.y) continue; _m.makeTranslation(x - Math.cos(a0) * d0 + vx * s2, yy, z - Math.sin(a0) * d0 + vz * s2); D.setMatrixAt(dk++, _m);
        }
      }
      // rings spreading from where it came down (or a drop, or a midge): in rewind they close in on the point
      if (age >= 0 && age < 4.5) for (let r = 0; r < 3 && rk < R.count; r++) {
        const ar = age - r * 0.35; if (ar <= 0) continue;
        const rad = 0.15 + ar * (isFish ? 1.25 : 0.7);
        _p.set(x, w.y + 0.005 * r, z); _q.identity(); _s.set(rad, 1, rad); _m.compose(_p, _q, _s); R.setMatrixAt(rk, _m);
        const fade = Math.max(0, 1 - ar / 4) * (isFish ? 1 : 0.6); _c.setRGB(fade, fade, fade); R.setColorAt(rk, _c); rk++;
      }
      // the splash at the landing: drops going up and coming back down into it
      if (age >= 0 && age < 0.55 && isFish) for (let d = 0; d < 5 && dk < D.count; d++) {
        const vx = (hash(e * 7, d) - 0.5) * 2, vz = (hash(d, e * 7) - 0.5) * 2, vy = 2 + hash(d, cyc) * 1.5, yy = w.y + vy * age - 4.9 * age * age;
        if (yy < w.y) continue; _m.makeTranslation(x + vx * age, yy, z + vz * age); D.setMatrixAt(dk++, _m);
      }
    }
    const hide = (M, from) => { for (let i = from; i < M.count; i++) { _m.makeScale(0, 0, 0); M.setMatrixAt(i, _m); } };
    hide(R, rk); hide(F, fk); hide(D, dk);
    R.instanceMatrix.needsUpdate = F.instanceMatrix.needsUpdate = D.instanceMatrix.needsUpdate = true;
    if (R.instanceColor) R.instanceColor.needsUpdate = true;
  }
}
