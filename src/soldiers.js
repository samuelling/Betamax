// Instanced, procedurally posed soldiers. One InstancedMesh per body part, posed with 2-bone IK.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { merge } from './world.js';
import { MODE } from './sim.js';

const P = { PELVIS: 0, TORSO: 1, VEST: 2, HEAD: 3, HELMET: 4, PACK: 5, UAL: 6, LAL: 7, UAR: 8, LAR: 9, THL: 10, SHL: 11, THR: 12, SHR: 13, BTL: 14, BTR: 15, RIFLE: 16, NVG: 17 };
export const NPARTS = 18;
const RS = -1; // right side is -x when facing +z

function g_place(g, x, y, z, rx = 0, ry = 0, rz = 0) { g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); return g; }

function makeGeoms() {
  const G = [];
  G[P.PELVIS] = new RoundedBoxGeometry(0.34, 0.2, 0.22, 2, 0.06);
  G[P.TORSO] = new RoundedBoxGeometry(0.38, 0.5, 0.23, 2, 0.08).translate(0, 0.25, 0);
  G[P.VEST] = merge([
    new RoundedBoxGeometry(0.42, 0.36, 0.3, 2, 0.05).translate(0, 0.28, 0),
    new THREE.BoxGeometry(0.1, 0.12, 0.06).translate(-0.12, 0.2, 0.17),
    new THREE.BoxGeometry(0.1, 0.12, 0.06).translate(0, 0.2, 0.17),
    new THREE.BoxGeometry(0.1, 0.12, 0.06).translate(0.12, 0.2, 0.17),
  ]);
  G[P.HEAD] = merge([new THREE.SphereGeometry(0.1, 12, 10).scale(0.95, 1.08, 1).translate(0, 0.12, 0.01), new THREE.CylinderGeometry(0.045, 0.05, 0.08, 8).translate(0, 0.02, 0)]);
  G[P.HELMET] = merge([
    new THREE.SphereGeometry(0.128, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(1, 0.9, 1.08).translate(0, 0.14, 0),
    new THREE.BoxGeometry(0.03, 0.05, 0.12).translate(0.125, 0.15, 0), new THREE.BoxGeometry(0.03, 0.05, 0.12).translate(-0.125, 0.15, 0),
    new THREE.BoxGeometry(0.14, 0.05, 0.04).translate(0, 0.17, -0.12),
    new THREE.BoxGeometry(0.06, 0.08, 0.04).translate(0.13, 0.08, 0.0), new THREE.BoxGeometry(0.06, 0.08, 0.04).translate(-0.13, 0.08, 0.0),
  ]);
  G[P.NVG] = merge([new THREE.BoxGeometry(0.07, 0.04, 0.05).translate(0, 0.22, 0.12), new THREE.BoxGeometry(0.11, 0.05, 0.07).translate(0, 0.2, 0.16)]);
  G[P.PACK] = merge([new RoundedBoxGeometry(0.32, 0.36, 0.16, 2, 0.05).translate(0, 0.27, -0.2), new THREE.CylinderGeometry(0.008, 0.008, 0.5, 4).translate(0.12, 0.6, -0.22)]);
  const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 3, 8).translate(0, -len / 2 - 0.01, 0);
  G[P.UAL] = G[P.UAR] = cap(0.052, 0.21);
  G[P.LAL] = G[P.LAR] = merge([cap(0.046, 0.2), new RoundedBoxGeometry(0.07, 0.1, 0.08, 1, 0.03).translate(0, -0.29, 0)]);
  G[P.THL] = G[P.THR] = cap(0.078, 0.31);
  G[P.SHL] = G[P.SHR] = cap(0.062, 0.33);
  G[P.BTL] = G[P.BTR] = new RoundedBoxGeometry(0.12, 0.11, 0.27, 2, 0.04).translate(0, -0.01, 0.05);
  G[P.RIFLE] = merge([
    new THREE.BoxGeometry(0.05, 0.08, 0.36).translate(0, 0.02, 0.06),
    new THREE.BoxGeometry(0.045, 0.05, 0.25).translate(0, 0.025, 0.36),
    new THREE.CylinderGeometry(0.011, 0.011, 0.2, 6).rotateX(Math.PI / 2).translate(0, 0.03, 0.58),
    new THREE.BoxGeometry(0.04, 0.09, 0.2).translate(0, 0.0, -0.22),
    new THREE.BoxGeometry(0.035, 0.14, 0.06).translate(0, -0.08, 0.12),
    new THREE.BoxGeometry(0.03, 0.05, 0.08).translate(0, 0.09, 0.05),
  ]);
  return G;
}

// palette per side: [uniform, vest, helmet, boots, rifle, pack]
const PAL = [
  { uni: [0.50, 0.46, 0.36], vest: [0.42, 0.40, 0.30], helm: [0.40, 0.38, 0.30], boot: [0.36, 0.30, 0.22], rifle: [0.07, 0.07, 0.07], pack: [0.38, 0.37, 0.28], nvg: [0.08, 0.08, 0.08] },
  { uni: [0.25, 0.28, 0.27], vest: [0.12, 0.13, 0.13], helm: [0.10, 0.11, 0.11], boot: [0.06, 0.06, 0.06], rifle: [0.09, 0.08, 0.07], pack: [0.18, 0.19, 0.18], nvg: [0.05, 0.05, 0.05] },
];

const v3 = () => new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0), FWD = new THREE.Vector3(0, 0, 1);

export class Soldiers {
  constructor(scene, statics) {
    this.N = statics.length;
    this.statics = statics;
    const G = makeGeoms();
    this.meshes = [];
    const col = new THREE.Color();
    for (let p = 0; p < NPARTS; p++) {
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: p === P.RIFLE || p === P.NVG ? 0.45 : 0.88, metalness: p === P.RIFLE ? 0.4 : 0 });
      const im = new THREE.InstancedMesh(G[p], mat, this.N);
      im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < this.N; i++) {
        const st = statics[i], pal = PAL[st.side];
        let c;
        switch (p) {
          case P.HEAD: {
            const s = st.skin; const skins = [[0.92, 0.74, 0.62], [0.78, 0.58, 0.45], [0.55, 0.38, 0.28], [0.36, 0.25, 0.18]];
            c = st.side === 1 ? [0.11, 0.11, 0.11] : skins[Math.floor(s * 3.99)]; break; // invaders wear balaclavas
          }
          case P.VEST: c = pal.vest; break;
          case P.HELMET: c = pal.helm; break;
          case P.BTL: case P.BTR: c = pal.boot; break;
          case P.RIFLE: c = pal.rifle; break;
          case P.PACK: c = pal.pack; break;
          case P.NVG: c = pal.nvg; break;
          case P.LAL: case P.LAR: c = pal.uni.map((x) => x * 0.95); break;
          default: c = pal.uni;
        }
        col.setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
        im.setColorAt(i, col);
      }
      scene.add(im);
      this.meshes.push(im);
    }
    this.root = new THREE.Matrix4();
    this.tmpM = new THREE.Matrix4();
    this.q = new THREE.Quaternion(); this.q2 = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.one = new THREE.Vector3(1, 1, 1);
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
    this.w = { pelvis: v3(), torso: v3(), neck: v3(), shR: v3(), shL: v3(), hipR: v3(), hipL: v3(), footL: v3(), footR: v3(), grip: v3(), sup: v3(), elbR: v3(), elbL: v3(), kneeL: v3(), kneeR: v3(), rdir: v3() };
    this.t1 = v3(); this.t2 = v3(); this.t3 = v3();
    this.keys = { head: v3(), neck: v3(), pelvis: v3(), muzzle: v3() };
  }

  hide(i) { for (let p = 0; p < NPARTS; p++) this.meshes[p].setMatrixAt(i, this.zero); }

  setPart(i, p, pos, quat) {
    this.tmpM.compose(pos, quat, this.one);
    this.tmpM.premultiply(this.root);
    this.meshes[p].setMatrixAt(i, this.tmpM);
  }

  bone(i, p, a, b) {
    this.t3.subVectors(b, a).normalize();
    this.q.setFromUnitVectors(DOWN, this.t3);
    this.setPart(i, p, a, this.q);
  }

  ik(S, T, a, b, pole, outJ) {
    const dir = this.t1.subVectors(T, S);
    let d = dir.length(); dir.divideScalar(d || 1);
    d = Math.min(Math.max(d, Math.abs(a - b) + 1e-3), a + b - 1e-3);
    const cosA = (a * a + d * d - b * b) / (2 * a * d);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const p = this.t2.copy(pole).addScaledVector(dir, -pole.dot(dir)).normalize();
    outJ.copy(S).addScaledVector(dir, a * cosA).addScaledVector(p, a * sinA);
    return outJ;
  }

  // s: sample {x,y,z,yaw,pitch,crouch,speed,phase,mode}; deadAge: seconds since death (<0 alive); fallSign
  pose(i, s, deadAge, fallSign, override) {
    const w = this.w;
    const dead = deadAge >= 0;
    let c = s.crouch, run = Math.min(1, s.speed / 4.5), pitch = s.pitch;
    if (dead) { c = 0.15; run = 0; pitch = 0; }
    const phase = s.phase;
    // ----- root -----
    this.root.makeRotationY(s.yaw);
    let f = 0;
    if (dead) {
      f = Math.min(1, deadAge / 0.75); f = f * f;
      const rx = this.tmpM.makeRotationX(fallSign * f * (Math.PI / 2 - 0.06));
      this.root.multiply(rx);
    }
    this.root.setPosition(s.x, s.y + (dead ? 0.13 * f : 0), s.z);

    const hipH = 0.95 + (0.52 - 0.95) * c - run * 0.05 + Math.abs(Math.sin(phase)) * 0.05 * run;
    w.pelvis.set(0, hipH, 0);
    const lean = run * 0.32 + c * 0.2;
    this.e.set(lean - pitch * 0.2, 0, 0); const tq = this.q2.setFromEuler(this.e).clone();
    w.torso.set(0, hipH + 0.07, 0);
    w.neck.set(0, 0.52, 0).applyQuaternion(tq).add(w.torso);
    w.shR.set(RS * 0.19, 0.45, 0).applyQuaternion(tq).add(w.torso);
    w.shL.set(-RS * 0.19, 0.45, 0).applyQuaternion(tq).add(w.torso);

    this.setPart(i, P.PELVIS, w.pelvis, this.q.identity());
    this.setPart(i, P.TORSO, w.torso, tq);
    this.setPart(i, P.VEST, w.torso, tq);
    this.setPart(i, P.PACK, w.torso, tq);
    this.e.set(lean * 0.4 - pitch * 0.55, 0, 0); this.q.setFromEuler(this.e);
    this.setPart(i, P.HEAD, w.neck, this.q);
    this.setPart(i, P.HELMET, w.neck, this.q);
    this.setPart(i, P.NVG, w.neck, this.q);

    // ----- rifle & arms -----
    const chute = s.mode === MODE.CHUTE;
    const ready = dead ? 0 : Math.max(0, 1 - run * 0.85);
    const pr = pitch * ready + (-0.75) * (1 - ready);
    const yo = (1 - ready) * 0.7 * -RS;
    w.rdir.set(Math.sin(yo) * Math.cos(pr), Math.sin(pr), Math.cos(yo) * Math.cos(pr));
    w.grip.copy(w.shR).add(this.t3.set(-RS * 0.07, -0.13, 0.19));
    if (ready < 1) {
      const lowG = this.t3.set(0, 0.22, 0.24).applyQuaternion(tq).add(w.torso);
      w.grip.lerp(lowG, 1 - ready);
    }
    if (dead) { w.grip.copy(w.shR).add(this.t3.set(RS * 0.25, -0.35, 0.25)); w.rdir.set(RS * 0.6, -0.3, 0.7).normalize(); }
    w.sup.copy(w.grip).addScaledVector(w.rdir, 0.33);
    w.sup.y -= 0.02;
    if (dead) w.sup.copy(w.shL).add(this.t3.set(-RS * 0.35, -0.3, 0.2));
    this.q.setFromUnitVectors(FWD, w.rdir);
    this.setPart(i, P.RIFLE, w.grip, this.q);
    const poleR = this.t3.set(RS * 0.7, -1, -0.3).clone();
    this.ik(w.shR, w.grip, 0.27, 0.27, poleR, w.elbR);
    this.bone(i, P.UAR, w.shR, w.elbR); this.bone(i, P.LAR, w.elbR, w.grip);
    const poleL = this.t3.set(-RS * 0.8, -1, 0).clone();
    this.ik(w.shL, w.sup, 0.27, 0.27, poleL, w.elbL);
    this.bone(i, P.UAL, w.shL, w.elbL); this.bone(i, P.LAL, w.elbL, w.sup);

    // ----- legs -----
    w.hipR.set(RS * 0.1, hipH - 0.05, 0); w.hipL.set(-RS * 0.1, hipH - 0.05, 0);
    const stride = 0.4 * run;
    const lift = (ph) => Math.max(0, Math.sin(ph + Math.PI / 2)) * 0.16 * run;
    const kneel = (!dead && run < 0.2) ? c : 0;
    w.footL.set(-RS * 0.12, 0.08 + lift(phase), Math.sin(phase) * stride + 0.3 * kneel);
    w.footR.set(RS * 0.12, 0.08 + lift(phase + Math.PI) + 0.1 * kneel, Math.sin(phase + Math.PI) * stride - 0.42 * kneel);
    if (dead) { w.footL.set(-RS * 0.18, 0.08, 0.12); w.footR.set(RS * 0.2, 0.1, -0.1); }
    const poleK = this.t3.set(0, 0.2, 1).clone();
    this.ik(w.hipL, w.footL, 0.44, 0.45, poleK, w.kneeL);
    this.ik(w.hipR, w.footR, 0.44, 0.45, poleK, w.kneeR);
    this.bone(i, P.THL, w.hipL, w.kneeL); this.bone(i, P.SHL, w.kneeL, w.footL);
    this.bone(i, P.THR, w.hipR, w.kneeR); this.bone(i, P.SHR, w.kneeR, w.footR);
    this.q.identity();
    this.setPart(i, P.BTL, w.footL, this.q); this.setPart(i, P.BTR, w.footR, this.q);

    // key points in world space for hit tests / camera
    const k = this.keys;
    k.head.set(0, 0.13, 0).add(w.neck).applyMatrix4(this.root);
    k.neck.copy(w.neck).applyMatrix4(this.root);
    k.pelvis.copy(w.pelvis).applyMatrix4(this.root);
    k.muzzle.copy(w.grip).addScaledVector(w.rdir, 0.7).applyMatrix4(this.root);
    return k;
  }

  commit() { for (const m of this.meshes) m.instanceMatrix.needsUpdate = true; }
}
