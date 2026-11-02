// Birds over the daytime tapes: gulls over the beach and the marsh, crows and starlings inland. Their flight is a
// pure function of tape time, so in rewind they fly backward — wings beating the wrong way, wheeling back out of the
// turns they made — like everything else.
import * as THREE from 'three';
import { heightAt } from './terrain.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

export class Birds {
  constructor(root, kind) {
    const gull = kind === 'beach' || kind === 'sandwich';
    // a bird: two thin wings meeting at a body, built so scaling y flaps them
    const g = new THREE.BufferGeometry();
    const w = gull ? 0.95 : 0.6;
    g.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 0.18, -w, 0.32, -0.05, 0, 0, -0.22,
      0, 0, 0.18, 0, 0, -0.22, w, 0.32, -0.05,
      0, -0.02, 0.32, -0.08, 0, -0.3, 0.08, 0, -0.3,
    ], 3));
    g.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({ color: gull ? 0xd9d6cc : 0x1c1b1a, side: THREE.DoubleSide, fog: true });
    this.flocks = [];
    const n = gull ? 5 : 4, per = gull ? 7 : 11;
    this.mesh = new THREE.InstancedMesh(g, mat, n * per); this.mesh.frustumCulled = false; root.add(this.mesh);
    let seed = 7; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let f = 0; f < n; f++) this.flocks.push({ ox: (r() - 0.5) * 360, oz: (r() - 0.5) * 300 - (kind === 'beach' ? 40 : 0), rad: 18 + r() * 40, h: (gull ? 16 : 24) + r() * 30, w: (r() < 0.5 ? -1 : 1) * (0.12 + r() * 0.1), ph: r() * 6.3, drift: (r() - 0.5) * 0.6,
      birds: Array.from({ length: per }, () => ({ dx: (r() - 0.5) * 14, dy: (r() - 0.5) * 5, dz: (r() - 0.5) * 14, flap: 7 + r() * 4, fp: r() * 6.3, lag: r() * 1.4 })) });
    this.follow = kind === 'bomb';   // the convoy covers kilometres: keep a few flocks over whatever stretch of road you're on
    this.gull = gull;
  }
  update(tau, cam) {
    let k = 0;
    const cx = this.follow ? Math.round(cam.position.x / 350) * 350 : 0, cz = this.follow ? Math.round(cam.position.z / 350) * 350 : 0;
    for (const f of this.flocks) {
      for (const b of f.birds) {
        const t = tau - b.lag, a = f.ph + f.w * t;
        const x = cx + f.ox + Math.cos(a) * f.rad + f.drift * t + b.dx, z = cz + f.oz + Math.sin(a) * f.rad * 0.7 + b.dz, y = Math.max(0, heightAt(cx + f.ox, cz + f.oz)) + f.h + b.dy + Math.sin(t * 0.7 + f.ph) * 3;
        const heading = Math.atan2(-Math.sin(a) * f.rad * f.w + f.drift, Math.cos(a) * f.rad * 0.7 * f.w);
        const glide = this.gull ? 0.5 + 0.5 * Math.sin(t * 0.9 + b.fp) : 0.15;
        const beat = Math.sin(t * b.flap + b.fp) * (glide > 0.7 ? 0.2 : 1);
        _e.set(0, heading, -Math.sign(f.w) * 0.35); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(1, 0.25 + beat * 1.1, 1);
        _m.compose(_p, _q, _s); this.mesh.setMatrixAt(k++, _m);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
