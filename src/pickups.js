// Guns in the sand. Every body drops what it carried where it fell (and in rewind the gun lifts back into the
// hands as the body gets up). Walk over one and you can swap it for what you're holding; what you put down stays
// put — that part of the world runs forward, like you.
import * as THREE from 'three';
import { outline, toonify } from './toon.js';
import { primaryOf, weaponProp, WEAPONS } from './arsenal.js';

const SHOW_R = 32, MAX = 18, REACH = 2.1;

export class Pickups {
  constructor(scene, S, sol) {
    this.scene = scene; this.S = S; this.sol = sol;
    this.taken = new Set();      // bodies whose gun has been picked up
    this.left = [];              // guns the player put down: { id, x, y, z, yaw, roll }
    this.pool = new Map();       // key -> Object3D
    this.near = null;
    this.ids = S.actors.map((a) => primaryOf(a));
    this._v = new THREE.Vector3();
  }
  reset() { this.taken.clear(); for (const l of this.left) this.free('l' + l.k); this.left = []; this.k = 0; }
  free(key) { const o = this.pool.get(key); if (o) { this.scene.remove(o); this.pool.delete(key); } }
  place(key, id, d) {
    let o = this.pool.get(key);
    if (!o || o.userData.id !== id) { if (o) this.scene.remove(o); o = weaponProp(id); o.traverse((q) => { if (q.isMesh) for (const m of [].concat(q.material)) m.userData.vm = true; }); outline(o, { maxThick: 0.02 }); toonify(o); o.userData.id = id; this.scene.add(o); this.pool.set(key, o); }
    o.position.set(d.x, d.y + 0.03, d.z); o.rotation.set(0, d.yaw, d.roll, 'YXZ'); o.visible = true;
    return o;
  }
  // body: the id you're in (its own gun isn't on the ground); look: camera forward
  update(tau, pos, look, body) {
    const S = this.S, want = new Set(), cands = [];
    let best = null, bd = REACH;
    for (let i = 0; i < S.N; i++) {
      const a = S.actors[i];
      if (!(a.deathTime > 0) || tau < a.deathTime || i === body || this.taken.has(i)) continue;
      const d = this.sol.dropOf(i);
      if (!d || tau < d.t) continue;
      const dist = Math.hypot(d.x - pos.x, d.z - pos.z);
      if (dist > SHOW_R) continue;
      cands.push([dist, 'b' + i, this.ids[i], d, { kind: 'body', i }]);
    }
    for (const l of this.left) {
      const dist = Math.hypot(l.x - pos.x, l.z - pos.z);
      if (dist < SHOW_R) cands.push([dist, 'l' + l.k, l.id, l, { kind: 'left', l }]);
    }
    cands.sort((a, b) => a[0] - b[0]);
    for (let k = 0; k < Math.min(MAX, cands.length); k++) {
      const [dist, key, id, d, ref] = cands[k];
      want.add(key); this.place(key, id, d);
      // in reach and roughly underfoot or in front
      const v = this._v.set(d.x - pos.x, 0, d.z - pos.z), fwd = v.x * look.x + v.z * look.z;
      const score = dist - Math.max(0, fwd / Math.max(dist, 1e-3)) * 0.6;
      if (dist < REACH && Math.abs(d.y - pos.y) < 1.6 && score < bd) { bd = score; best = { id, d, ref, name: WEAPONS[id].name, cal: WEAPONS[id].cal }; }
    }
    for (const key of [...this.pool.keys()]) if (!want.has(key)) this.free(key);
    this.near = best;
    return best;
  }
  // swap: take the gun on the ground, leave yours where it was
  take(p, old) {
    const n = this.near; if (!n) return null;
    if (n.ref.kind === 'body') this.taken.add(n.ref.i);
    else { this.left = this.left.filter((l) => l !== n.ref.l); this.free('l' + n.ref.l.k); }
    this.k = (this.k || 0) + 1;
    this.left.push({ k: this.k, id: old, x: n.d.x + 0.12, y: n.d.y, z: n.d.z + 0.08, yaw: n.d.yaw + 0.5, roll: -n.d.roll || Math.PI / 2 });
    this.near = null;
    return n.id;
  }
}
