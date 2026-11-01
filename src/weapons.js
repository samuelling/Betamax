// First-person weapons, modelled from reference:
//  Defender: M7 (SIG MCX Spear), 6.8x51mm, 13" barrel, ~7" SLX suppressor (36" overall), 20-rd magazine,
//            folding stock, M-LOK handguard, XM157 fire-control optic (1-8x LPVO + rangefinder housing).
//  Invader:  fictional modern bullpup, 30-rd curved magazine behind the grip, full-length top rail, reflex sight.
// Reloads follow real manual-of-arms: emergency (bolt locked back) vs tactical (retention) reloads.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mulberry32 } from './rng.js';

function noiseTex(seed, base, amp, size = 128) {
  const r = mulberry32(seed); const d = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) { const v = Math.max(0, Math.min(255, (base + (r() - 0.5) * amp) * 255)); d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
  const t = new THREE.DataTexture(d, size, size); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  return t;
}
const ROUGH = noiseTex(3, 0.85, 0.3);
const sRGB = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
const mats = {
  cerakote: new THREE.MeshStandardMaterial({ color: sRGB(0.55, 0.47, 0.35), roughness: 0.62, metalness: 0.15, roughnessMap: ROUGH }),
  anod: new THREE.MeshStandardMaterial({ color: sRGB(0.07, 0.07, 0.075), roughness: 0.4, metalness: 0.75, roughnessMap: ROUGH }),
  steel: new THREE.MeshStandardMaterial({ color: sRGB(0.16, 0.16, 0.17), roughness: 0.3, metalness: 0.9 }),
  poly: new THREE.MeshStandardMaterial({ color: sRGB(0.1, 0.1, 0.1), roughness: 0.75, metalness: 0.05, roughnessMap: ROUGH }),
  polyInv: new THREE.MeshStandardMaterial({ color: sRGB(0.16, 0.18, 0.17), roughness: 0.7, metalness: 0.05, roughnessMap: ROUGH }),
  rubber: new THREE.MeshStandardMaterial({ color: sRGB(0.05, 0.05, 0.05), roughness: 0.95 }),
  lens: new THREE.MeshPhysicalMaterial({ color: 0x223344, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.35, clearcoat: 1, envMapIntensity: 2 }),
  brass: new THREE.MeshStandardMaterial({ color: sRGB(0.75, 0.58, 0.28), roughness: 0.3, metalness: 1 }),
};
function reticleTex() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(255,40,30,0.95)'; g.fillStyle = 'rgba(255,40,30,1)'; g.lineWidth = 3;
  g.beginPath(); g.arc(128, 128, 46, 0.25 * Math.PI, 0.75 * Math.PI, true); g.stroke(); // horseshoe
  g.beginPath(); g.arc(128, 128, 3.5, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(10,10,10,0.9)'; g.lineWidth = 2;
  [[128, 0, 128, 70], [128, 186, 128, 256], [0, 128, 70, 128], [186, 128, 256, 128]].forEach(([a, b, c2, d]) => { g.beginPath(); g.moveTo(a, b); g.lineTo(c2, d); g.stroke(); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const add = (g, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m; };
const rb = (w, h, d, r = 0.004) => new RoundedBoxGeometry(w, h, d, 2, r);
const cylZ = (r0, r1, l, s = 16, open = false) => new THREE.CylinderGeometry(r0, r1, l, s, 1, open).rotateX(Math.PI / 2);

function m7Magazine() {
  const g = new THREE.Group();
  add(g, rb(0.03, 0.12, 0.068, 0.004), mats.anod, 0, -0.06, 0, -0.08);
  add(g, rb(0.034, 0.03, 0.074, 0.006), mats.poly, 0, -0.125, 0.004, -0.08); // baseplate
  for (let k = 0; k < 3; k++) add(g, new THREE.BoxGeometry(0.031, 0.004, 0.06), mats.steel, 0, -0.03 - k * 0.03, 0.0, -0.08);
  return g;
}
function bullpupMagazine() {
  const g = new THREE.Group();
  for (let k = 0; k < 5; k++) add(g, rb(0.026, 0.035, 0.06, 0.004), mats.polyInv, 0, -0.018 - k * 0.032, 0.006 - k * 0.012, 0.3 + k * 0.05);
  add(g, rb(0.03, 0.018, 0.07, 0.005), mats.poly, 0, -0.175, -0.05, 0.55);
  return g;
}

export function buildM7() {
  const g = new THREE.Group();
  // receivers
  add(g, rb(0.048, 0.06, 0.22, 0.006), mats.cerakote, 0, 0.004, -0.02);          // upper
  add(g, rb(0.046, 0.045, 0.16, 0.006), mats.cerakote, 0, -0.045, -0.03);        // lower
  add(g, rb(0.05, 0.022, 0.06, 0.004), mats.cerakote, 0, -0.03, -0.12);          // magwell flare
  add(g, new THREE.BoxGeometry(0.004, 0.018, 0.05), mats.anod, 0.026, 0.0, -0.01); // ejection port cover
  // MCX charging handle (rear, ambidextrous) and bolt catch on the left
  const ch = add(g, rb(0.06, 0.012, 0.03, 0.003), mats.anod, 0, 0.037, 0.09);
  add(g, rb(0.006, 0.02, 0.025, 0.002), mats.anod, -0.026, -0.03, -0.06);        // bolt catch paddle
  add(g, rb(0.008, 0.012, 0.012, 0.002), mats.anod, 0.025, -0.032, -0.045);     // mag release button
  // M-LOK handguard with slots
  add(g, rb(0.056, 0.058, 0.29, 0.008), mats.cerakote, 0, 0.002, -0.27);
  for (let k = 0; k < 6; k++) for (const s of [-1, 1]) add(g, new THREE.BoxGeometry(0.002, 0.018, 0.03), mats.anod, s * 0.0285, -0.008, -0.16 - k * 0.042);
  for (let k = 0; k < 6; k++) add(g, new THREE.BoxGeometry(0.02, 0.002, 0.03), mats.anod, 0, -0.0285, -0.16 - k * 0.042);
  // top rail with Picatinny ridges
  add(g, new THREE.BoxGeometry(0.022, 0.01, 0.5), mats.anod, 0, 0.038, -0.13);
  for (let k = 0; k < 40; k++) add(g, new THREE.BoxGeometry(0.023, 0.004, 0.006), mats.anod, 0, 0.044, 0.1 - k * 0.0119);
  // barrel stub, gas block, suppressor (SLX ~7")
  add(g, cylZ(0.0105, 0.0105, 0.04), mats.steel, 0, 0.0, -0.435);
  add(g, cylZ(0.022, 0.022, 0.18, 24), mats.cerakote, 0, 0.0, -0.545);
  add(g, cylZ(0.0225, 0.0225, 0.012, 24), mats.anod, 0, 0.0, -0.46);
  add(g, cylZ(0.008, 0.008, 0.004, 12), mats.rubber, 0, 0.0, -0.636);
  // grip, trigger guard, trigger
  add(g, rb(0.032, 0.11, 0.045, 0.01), mats.poly, 0, -0.1, 0.055, -0.32);
  add(g, rb(0.006, 0.006, 0.065, 0.002), mats.anod, 0, -0.078, -0.0);
  add(g, rb(0.004, 0.02, 0.006, 0.002), mats.steel, 0, -0.065, 0.005, 0.2);
  // folding stock (skeletonised) + buttpad
  add(g, rb(0.024, 0.024, 0.2, 0.004), mats.anod, 0, 0.0, 0.2);
  add(g, rb(0.022, 0.018, 0.18, 0.004), mats.anod, 0, -0.045, 0.21, 0.14);
  add(g, rb(0.03, 0.12, 0.03, 0.01), mats.rubber, 0, -0.03, 0.31);
  add(g, rb(0.028, 0.02, 0.06, 0.004), mats.anod, 0, 0.0, 0.1);                  // hinge
  // XM157 fire control: 30mm-class LPVO + top housing (rangefinder/ballistic computer)
  add(g, rb(0.04, 0.02, 0.1, 0.004), mats.anod, 0, 0.055, -0.04);                // mount
  const tubeMat = mats.anod.clone(); tubeMat.side = THREE.DoubleSide;
  add(g, cylZ(0.018, 0.018, 0.17, 24, true), tubeMat, 0, 0.085, -0.04);
  add(g, cylZ(0.024, 0.02, 0.04, 24, true), tubeMat, 0, 0.085, -0.145);           // objective bell
  add(g, cylZ(0.021, 0.023, 0.04, 24, true), tubeMat, 0, 0.085, 0.06);            // ocular
  add(g, rb(0.05, 0.034, 0.12, 0.006), mats.cerakote, 0, 0.121, -0.06);          // housing
  add(g, rb(0.016, 0.014, 0.018, 0.003), mats.lens, 0.012, 0.121, -0.122);       // LRF windows
  add(g, rb(0.016, 0.014, 0.018, 0.003), mats.lens, -0.012, 0.121, -0.122);
  add(g, new THREE.CylinderGeometry(0.009, 0.009, 0.016, 12), mats.anod, 0.026, 0.085, -0.04, 0, 0, Math.PI / 2); // turret
  for (const s of [-1, 1]) add(g, rb(0.012, 0.012, 0.016, 0.003), mats.poly, s * 0.03, 0.121, -0.02); // buttons
  const lensO = add(g, new THREE.CircleGeometry(0.019, 24), mats.lens, 0, 0.085, -0.166, 0, 0, 0);
  const ret = add(g, new THREE.PlaneGeometry(0.036, 0.036), new THREE.MeshBasicMaterial({ map: reticleTex(), transparent: true, depthWrite: false, toneMapped: false, color: new THREE.Color(2.2, 2.2, 2.2) }), 0, 0.085, 0.078);
  add(g, new THREE.RingGeometry(0.0185, 0.0235, 24), mats.anod, 0, 0.085, 0.0795);
  // magazine (detachable)
  const mag = m7Magazine(); mag.position.set(0, -0.045, -0.07); g.add(mag);
  g.userData = {
    sightY: 0.085, eyeZ: 0.2, muzzleZ: -0.64, mag, magHome: mag.position.clone(), magRot: 0, chargeHandle: ch, reticle: ret,
    support: new THREE.Vector3(-0.03, -0.05, -0.28), magwell: new THREE.Vector3(-0.01, -0.06, -0.07), boltCatch: new THREE.Vector3(-0.035, -0.03, -0.06), charge: new THREE.Vector3(0.0, 0.05, 0.1),
    makeMag: m7Magazine, magSize: 20, bullpup: false, rpm: 750, suppressed: true,
  };
  return g;
}

export function buildBullpup() {
  const g = new THREE.Group();
  // polymer shell from buttplate to muzzle
  add(g, rb(0.058, 0.09, 0.42, 0.014), mats.polyInv, 0, -0.005, 0.12);
  add(g, rb(0.054, 0.07, 0.2, 0.012), mats.polyInv, 0, 0.005, -0.18);               // forend
  add(g, rb(0.06, 0.14, 0.03, 0.012), mats.rubber, 0, -0.025, 0.34);                // buttpad
  add(g, rb(0.06, 0.02, 0.24, 0.008), mats.polyInv, 0, -0.06, 0.0);                  // trigger guard bar
  add(g, rb(0.032, 0.1, 0.045, 0.01), mats.poly, 0, -0.1, 0.0, -0.25);               // grip
  add(g, rb(0.004, 0.02, 0.006, 0.002), mats.steel, 0, -0.06, -0.035, 0.2);
  // full-length rail + reflex sight
  add(g, new THREE.BoxGeometry(0.022, 0.012, 0.52), mats.anod, 0, 0.05, -0.02);
  for (let k = 0; k < 42; k++) add(g, new THREE.BoxGeometry(0.023, 0.004, 0.006), mats.anod, 0, 0.057, 0.22 - k * 0.0119);
  const rs = new THREE.Group(); g.add(rs); rs.position.set(0, 0.075, -0.06);
  add(rs, rb(0.04, 0.012, 0.05, 0.003), mats.anod, 0, -0.012, 0);
  add(rs, new THREE.TorusGeometry(0.019, 0.004, 8, 24), mats.anod, 0, 0.012, 0);
  const ret = add(rs, new THREE.PlaneGeometry(0.03, 0.03), new THREE.MeshBasicMaterial({ map: reticleTex(), transparent: true, depthWrite: false, toneMapped: false, color: new THREE.Color(2.4, 2.4, 2.4), opacity: 0.9 }), 0, 0.012, 0.001);
  add(rs, new THREE.CircleGeometry(0.018, 24), mats.lens, 0, 0.012, -0.002);
  // barrel + brake, non-reciprocating charging handle on the left
  add(g, cylZ(0.011, 0.011, 0.14), mats.steel, 0, 0.012, -0.34);
  add(g, cylZ(0.017, 0.017, 0.06, 12), mats.anod, 0, 0.012, -0.44);
  for (let k = 0; k < 3; k++) add(g, new THREE.BoxGeometry(0.036, 0.004, 0.008), mats.steel, 0, 0.012, -0.425 - k * 0.014);
  const ch = add(g, rb(0.014, 0.012, 0.03, 0.003), mats.anod, -0.034, 0.018, -0.12);
  add(g, rb(0.008, 0.012, 0.018, 0.002), mats.anod, 0, -0.06, 0.07);               // mag release
  // magazine behind the grip
  const mag = bullpupMagazine(); mag.position.set(0, -0.05, 0.13); g.add(mag);
  g.userData = {
    sightY: 0.087, eyeZ: 0.15, muzzleZ: -0.48, mag, magHome: mag.position.clone(), magRot: 0, chargeHandle: ch, reticle: ret,
    support: new THREE.Vector3(-0.032, -0.055, -0.2), magwell: new THREE.Vector3(-0.01, -0.08, 0.13), boltCatch: null, charge: new THREE.Vector3(-0.04, 0.018, -0.12),
    makeMag: bullpupMagazine, magSize: 30, bullpup: true, rpm: 650, suppressed: false,
  };
  return g;
}

// ---------------- arms ----------------
function limb(r, len, mat) { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 12).translate(0, -len / 2, 0), mat); return m; }
export class Arms {
  constructor(side) {
    const sleeve = new THREE.MeshStandardMaterial({ color: side === 0 ? sRGB(0.47, 0.43, 0.32) : sRGB(0.24, 0.27, 0.25), roughness: 0.92 });
    const glove = new THREE.MeshStandardMaterial({ color: side === 0 ? sRGB(0.33, 0.29, 0.22) : sRGB(0.06, 0.06, 0.06), roughness: 0.8 });
    this.g = new THREE.Group();
    this.up = [limb(0.05, 0.3, sleeve), limb(0.05, 0.3, sleeve)];
    this.fo = [limb(0.042, 0.27, sleeve), limb(0.042, 0.27, sleeve)];
    this.hand = [new THREE.Group(), new THREE.Group()];
    for (const h of this.hand) {
      add(h, rb(0.055, 0.09, 0.1, 0.022), glove, 0, -0.01, -0.02);
      add(h, rb(0.022, 0.05, 0.03, 0.01), glove, 0.03, 0.0, -0.06, 0.4);
      for (let k = 0; k < 4; k++) add(h, rb(0.012, 0.016, 0.05, 0.006), glove, -0.02 + k * 0.012, -0.045, -0.04, 0.6);
    }
    this.g.add(...this.up, ...this.fo, ...this.hand);
    this.g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
    this.tmp = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  }
  // shoulder, hand target (camera space); pole hint
  solve(k, S, Tt, pole, handQuat) {
    const a = 0.32, b = 0.3;
    const dir = this.tmp[0].subVectors(Tt, S); let d = dir.length(); dir.normalize();
    d = Math.min(d, a + b - 0.002);
    const cosA = (a * a + d * d - b * b) / (2 * a * d), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const p = this.tmp[1].copy(pole).addScaledVector(dir, -pole.dot(dir)).normalize();
    const E = this.tmp[2].copy(S).addScaledVector(dir, a * cosA).addScaledVector(p, a * sinA);
    const set = (m, from, to) => { m.position.copy(from); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3().subVectors(to, from).normalize()); };
    set(this.up[k], S, E); set(this.fo[k], E, Tt);
    this.hand[k].position.copy(Tt); if (handQuat) this.hand[k].quaternion.copy(handQuat);
  }
}

// ---------------- reload choreography ----------------
const ss = (a, b, t) => { const k = Math.min(1, Math.max(0, (t - a) / (b - a))); return k * k * (3 - 2 * k); };
// returns duration for a reload kind
export function reloadDuration(ud, tactical, missing = 0) {
  if (ud.tube) return 0.35 + Math.max(1, missing) * 0.42 + (tactical ? 0 : 0.45);
  return (ud.bullpup ? (tactical ? 2.7 : 2.9) : (tactical ? 2.6 : 2.05)) * (ud.reloadScale || 1);
}

/**
 * Evaluate the reload at time t (s). Writes into o:
 *  gunOff (Vector3 camera-space offset), gunRot (Euler xyz add), hand (Vector3 gun-local or 'pouch'), handInGun (bool),
 *  magState: 'in' | 'out' | 'hand' ; events fired via cb(name) when crossing times.
 */
export function evalReload(ud, tactical, t, o) {
  const bp = ud.bullpup;
  o.gunOff.set(0, 0, 0); o.gunRot.set(0, 0, 0);
  if (ud.tube) {
    // shotgun: tilt the receiver up, thumb shells into the loading port one at a time; rack it if it ran dry
    const n = Math.max(1, o.missing || 1), end = 0.35 + n * 0.42, D = end + (tactical ? 0 : 0.45);
    const inW = ss(0, 0.25, t) * (1 - ss(D - 0.3, D, t));
    o.gunOff.set(-0.05 * inW, 0.03 * inW, 0.02 * inW); o.gunRot.set(0.05 * inW, 0.1 * inW, -0.55 * inW);
    o.path = [[0, 'support'], [0.2, 'support']];
    o.events = [];
    for (let k = 0; k < n; k++) { const t0 = 0.3 + k * 0.42; o.path.push([t0 + 0.12, 'pouch'], [t0 + 0.32, 'well']); o.events.push([t0 + 0.34, 'shell']); }
    if (!tactical) { o.path.push([end + 0.12, 'charge'], [end + 0.3, 'chargeBack']); o.events.push([end + 0.3, 'rack']); }
    o.path.push([D, 'support']);
    o.magState = 'in'; o.seat = 1;
    o.jolt = tactical ? 0 : Math.exp(-Math.max(0, t - end - 0.3) * 16) * (t > end + 0.3 ? 1 : 0);
    return o;
  }
  const sc = ud.reloadScale || 1; t /= sc;
  if (!bp) {
    // M7: rifle to the workspace, canted inboard, muzzle stays toward the threat
    const inW = ss(0, 0.25, t) * (1 - ss(1.65, 2.0, t + (tactical ? -0.5 : 0)));
    o.gunOff.set(-0.07 * inW, 0.02 * inW, 0.03 * inW);
    o.gunRot.set(-0.12 * inW, 0.12 * inW, 0.32 * inW);
    const T = tactical ? [0.35, 0.75, 1.0, 1.25, 1.45, 1.85, 2.3] : [0.1, 0.5, 0.85, 1.05, 1.2, 1.45, 1.75];
    // hand path keyframes: support -> pouch -> below magwell -> seated -> (bolt catch | pocket) -> support
    o.path = [[0, 'support'], [T[0], 'support'], [T[1], 'pouch'], [T[2], 'below'], [T[3], 'well'], [T[4], tactical ? 'pocket' : 'catch'], [T[5], tactical ? 'pocket' : 'catch'], [T[6], 'support']];
    o.magState = tactical ? (t < T[3] ? 'in' : t < T[4] ? 'swap' : 'in') : (t < 0.15 ? 'in' : t < T[1] ? 'out' : t < T[3] ? 'hand' : 'in');
    o.seat = ss(T[2], T[3], t);
    o.events = tactical ? [[T[3] - 0.05, 'magOut'], [T[3], 'magIn'], [T[3] + 0.12, 'tug']] : [[0.15, 'drop'], [T[3], 'magIn'], [T[3] + 0.1, 'tug'], [T[4] + 0.05, 'bolt']];
    o.jolt = tactical ? 0 : Math.exp(-Math.max(0, t - (T[4] + 0.05)) * 18) * (t > T[4] + 0.05 ? 1 : 0);
  } else {
    // bullpup: rifle comes off the shoulder, rolled so the mag well faces the support hand, which works behind the grip
    const inW = ss(0, 0.3, t) * (1 - ss(2.3, 2.75, t));
    o.gunOff.set(-0.06 * inW, 0.0, 0.0);
    o.gunRot.set(-0.05 * inW, -0.2 * inW, 0.42 * inW);
    const T = tactical ? [0.3, 0.75, 1.1, 1.35, 1.6, 1.6, 2.4] : [0.15, 0.55, 0.95, 1.2, 1.6, 1.9, 2.5];
    o.path = [[0, 'support'], [T[0], 'well'], [T[1], 'pouch'], [T[2], 'below'], [T[3], 'well'], [T[4], tactical ? 'well' : 'charge'], [T[5], tactical ? 'well' : 'chargeBack'], [T[6], 'support']];
    o.magState = t < T[0] + 0.05 ? 'in' : t < T[1] ? (tactical ? 'hand' : 'out') : t < T[3] ? 'hand' : 'in';
    o.seat = ss(T[2], T[3], t);
    o.events = [[T[0] + 0.05, tactical ? 'magOut' : 'drop'], [T[3], 'magIn'], [T[3] + 0.1, 'tug']].concat(tactical ? [] : [[T[5], 'rack']]);
    o.jolt = tactical ? 0 : Math.exp(-Math.max(0, t - T[5]) * 16) * (t > T[5] ? 1 : 0);
  }
  if (sc !== 1) { o.path = o.path.map(([tt, n]) => [tt * sc, n]); o.events = o.events.map(([tt, n]) => [tt * sc, n]); }
  return o;
}
export function pathPoint(path, t) {
  let i = 0; while (i < path.length - 2 && path[i + 1][0] <= t) i++;
  const [ta, a] = path[i], [tb, b] = path[Math.min(i + 1, path.length - 1)];
  const k = tb > ta ? ss(ta, tb, t) : 1;
  return [a, b, k];
}
export { mats as WEAPON_MATS, add, rb, cylZ, reticleTex, m7Magazine, bullpupMagazine };
