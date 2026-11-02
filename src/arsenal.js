// The arsenal: every body on the beach carries something real, and it stays in the sand when they fall.
// Models are built from simple parts at true scale (metres), -z toward the muzzle, the pistol grip under
// the right hand at about (0, -0.1, 0.055). Numbers are game-tuned, the hardware is real:
//   SIG M7 (MCX Spear, 6.8x51)        — defenders' service rifle (existing model)
//   IWI Tavor X95 (5.56)              — Texan faction's bullpup (existing model)
//   SIG M250 (6.8x51, belt-fed)       — defenders' automatic rifleman
//   IWI Negev NG7 (7.62x51, belt-fed) — Texan faction's machine gunner
//   HK416 A5 (5.56)                   — carbine
//   HK MP7A2 (4.6x30)                 — PDW
//   Benelli M4 / M1014 (12 ga)        — semi-auto shotgun
//   HK M110A1 CSASS (7.62x51)         — marksman rifle
//   SIG M18 (9 mm)                    — defenders' sidearm
//   Glock 17 Gen 5 (9 mm)             — Texan faction's sidearm
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildM7, buildBullpup, WEAPON_MATS as mats, add, rb, cylZ, reticleTex } from './weapons.js';
import { hash1 } from './rng.js';

const sRGB = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
const M = {
  ...mats,
  black: new THREE.MeshStandardMaterial({ color: sRGB(0.05, 0.05, 0.055), roughness: 0.5, metalness: 0.6 }),
  fde: new THREE.MeshStandardMaterial({ color: sRGB(0.5, 0.42, 0.31), roughness: 0.75, metalness: 0.05 }),
  ranger: new THREE.MeshStandardMaterial({ color: sRGB(0.3, 0.31, 0.24), roughness: 0.75, metalness: 0.05 }),
  pouch: new THREE.MeshStandardMaterial({ color: sRGB(0.42, 0.38, 0.28), roughness: 0.95 }),
  shell: new THREE.MeshStandardMaterial({ color: sRGB(0.32, 0.06, 0.05), roughness: 0.55 }),
  m2park: new THREE.MeshStandardMaterial({ color: sRGB(0.2, 0.21, 0.19), roughness: 0.45, metalness: 0.55 }),
  m2od: new THREE.MeshStandardMaterial({ color: sRGB(0.3, 0.32, 0.22), roughness: 0.7, metalness: 0.15 }),
};
const GRIP = new THREE.Vector3(0.012, -0.095, 0.065);

// ------------------------------------------------------------------ shared parts
function rail(g, len, y, z0, mat = M.black) {
  add(g, new THREE.BoxGeometry(0.022, 0.009, len), mat, 0, y, z0 - len / 2);
  for (let k = 0; k < Math.floor(len / 0.012); k++) add(g, new THREE.BoxGeometry(0.023, 0.004, 0.006), mat, 0, y + 0.006, z0 - 0.006 - k * 0.0119);
}
function grip(g, mat = M.poly, z = 0.055) { add(g, rb(0.032, 0.11, 0.045, 0.01), mat, 0, -0.1, z, -0.32); }
function trigger(g, z = 0) {
  add(g, rb(0.006, 0.006, 0.065, 0.002), M.black, 0, -0.078, z);
  add(g, rb(0.004, 0.02, 0.006, 0.002), M.steel, 0, -0.065, z + 0.005, 0.2);
}
function holo(g, y, z) { // EOTech-style holographic: a box with a window
  const s = new THREE.Group(); s.position.set(0, y, z); g.add(s);
  add(s, rb(0.044, 0.014, 0.1, 0.004), M.black, 0, -0.014, 0);
  for (const x of [-1, 1]) add(s, rb(0.006, 0.04, 0.09, 0.002), M.black, x * 0.02, 0.008, 0);
  add(s, rb(0.044, 0.006, 0.02, 0.002), M.black, 0, 0.03, -0.035);
  add(s, new THREE.PlaneGeometry(0.034, 0.03), M.lens, 0, 0.01, -0.04);
  const ret = add(s, new THREE.PlaneGeometry(0.03, 0.03), new THREE.MeshBasicMaterial({ map: reticleTex(), transparent: true, depthWrite: false, toneMapped: false, color: new THREE.Color(2.4, 2.4, 2.4) }), 0, 0.01, 0.04);
  return { ret, eyeY: y + 0.01 };
}
function microDot(g, y, z) { // Aimpoint-style micro red dot
  const s = new THREE.Group(); s.position.set(0, y, z); g.add(s);
  add(s, rb(0.03, 0.012, 0.04, 0.003), M.black, 0, -0.016, 0);
  const tube = M.black.clone(); tube.side = THREE.DoubleSide;
  add(s, cylZ(0.015, 0.015, 0.045, 20, true), tube, 0, 0.004, 0);
  add(s, new THREE.CircleGeometry(0.014, 20), M.lens, 0, 0.004, -0.022);
  const ret = add(s, new THREE.PlaneGeometry(0.024, 0.024), new THREE.MeshBasicMaterial({ map: reticleTex(), transparent: true, depthWrite: false, toneMapped: false, color: new THREE.Color(2.4, 2.4, 2.4) }), 0, 0.004, 0.022);
  return { ret, eyeY: y + 0.004 };
}
function scope(g, y, z, len, bell, mat = M.black) { // magnified optic on rings
  const tube = mat.clone(); tube.side = THREE.DoubleSide;
  add(g, cylZ(0.016, 0.016, len, 24, true), tube, 0, y, z);
  add(g, cylZ(bell, 0.016, 0.06, 24, true), tube, 0, y, z - len / 2 - 0.02);
  add(g, cylZ(0.016, 0.021, 0.05, 24, true), tube, 0, y, z + len / 2 + 0.015);
  add(g, new THREE.CylinderGeometry(0.01, 0.01, 0.02, 12), mat, 0, y + 0.024, z);
  add(g, new THREE.CylinderGeometry(0.01, 0.01, 0.02, 12), mat, 0.024, y, z, 0, 0, Math.PI / 2);
  for (const dz of [-0.05, 0.05]) add(g, rb(0.03, 0.03, 0.018, 0.003), M.black, 0, y - 0.018, z + dz);
  add(g, new THREE.CircleGeometry(bell - 0.002, 24), M.lens, 0, y, z - len / 2 - 0.05);
  const ret = add(g, new THREE.PlaneGeometry(0.03, 0.03), new THREE.MeshBasicMaterial({ map: reticleTex(), transparent: true, depthWrite: false, toneMapped: false, color: new THREE.Color(2.2, 2.2, 2.2) }), 0, y, z + len / 2 + 0.035);
  add(g, new THREE.RingGeometry(0.0155, 0.021, 24), M.black, 0, y, z + len / 2 + 0.036);
  return { ret, eyeY: y };
}
function stanag(curve = 0.12, segs = 5, mat = M.black, w = 0.024) {
  return () => {
    const g = new THREE.Group();
    for (let k = 0; k < segs; k++) add(g, rb(w, 0.034, 0.064, 0.003), mat, 0, -0.017 - k * 0.03, 0.0 - k * k * curve * 0.012, -0.06 - k * curve * 0.5);
    add(g, rb(w + 0.006, 0.016, 0.07, 0.004), M.poly, 0, -0.03 * segs - 0.01, -segs * segs * curve * 0.012 - 0.004, -0.06 - segs * curve * 0.5);
    return g;
  };
}
function boxMag(w, h, d, mat) { return () => { const g = new THREE.Group(); add(g, rb(w, h, d, 0.008), mat, 0, -h / 2, 0); add(g, rb(w + 0.004, 0.012, d + 0.004, 0.004), M.black, 0, -0.01, 0); return g; }; }
function pistolMag(mat = M.black) { return () => { const g = new THREE.Group(); add(g, rb(0.022, 0.1, 0.032, 0.003), mat, 0, -0.05, 0, -0.3); add(g, rb(0.026, 0.012, 0.038, 0.004), M.poly, 0, -0.098, 0.016, -0.3); return g; }; }

function finish(g, ud) {
  g.userData = Object.assign({ grip: GRIP.clone(), boltCatch: null, suppressed: false, bullpup: false, reloadScale: 1, auto: true, pellets: 1, adsFov: 52 }, ud);
  if (!g.userData.magHome && g.userData.mag) g.userData.magHome = g.userData.mag.position.clone();
  return g;
}

// ------------------------------------------------------------------ models
function buildHK416() {
  const g = new THREE.Group();
  add(g, rb(0.044, 0.056, 0.2, 0.005), M.black, 0, 0.004, -0.02);            // upper
  add(g, rb(0.042, 0.045, 0.15, 0.005), M.black, 0, -0.044, -0.03);          // lower
  add(g, rb(0.048, 0.02, 0.055, 0.004), M.black, 0, -0.03, -0.11);           // magwell
  add(g, rb(0.006, 0.02, 0.025, 0.002), M.black, -0.024, -0.03, -0.06);      // bolt catch
  add(g, rb(0.003, 0.02, 0.05, 0.001), M.steel, 0.024, 0.0, -0.01);          // port door
  const ch = add(g, rb(0.05, 0.01, 0.02, 0.003), M.black, 0, 0.035, 0.085);  // charging handle (AR, rear)
  add(g, rb(0.054, 0.056, 0.27, 0.006), M.black, 0, 0.002, -0.255);          // free-float rail
  for (let k = 0; k < 5; k++) for (const s of [-1, 1]) add(g, new THREE.BoxGeometry(0.002, 0.016, 0.026), M.steel, s * 0.0275, -0.006, -0.15 - k * 0.045);
  rail(g, 0.49, 0.036, 0.09);
  add(g, cylZ(0.009, 0.009, 0.08), M.steel, 0, 0.0, -0.43);                  // barrel
  add(g, cylZ(0.012, 0.012, 0.05, 12), M.black, 0, 0.0, -0.49);              // flash hider
  for (let k = 0; k < 4; k++) add(g, new THREE.BoxGeometry(0.026, 0.003, 0.006), M.steel, 0, 0.0, -0.475 - k * 0.01);
  grip(g); trigger(g);
  // collapsible stock on a buffer tube
  add(g, cylZ(0.015, 0.015, 0.16, 16), M.black, 0, -0.005, 0.17);
  add(g, rb(0.04, 0.075, 0.14, 0.012), M.black, 0, -0.03, 0.23);
  add(g, rb(0.042, 0.12, 0.02, 0.008), M.rubber, 0, -0.035, 0.305);
  // folding back-up sights + holographic
  add(g, rb(0.02, 0.025, 0.02, 0.003), M.black, 0, 0.058, 0.06);
  const h = holo(g, 0.058, -0.06);
  const makeMag = stanag(0.1, 5, M.black);
  const mag = makeMag(); mag.position.set(0, -0.04, -0.11); g.add(mag);
  return finish(g, { id: 'hk416', sightY: h.eyeY, eyeZ: 0.2, muzzleZ: -0.52, mag, chargeHandle: ch, reticle: h.ret,
    support: new THREE.Vector3(-0.03, -0.05, -0.27), magwell: new THREE.Vector3(-0.01, -0.06, -0.11), boltCatch: new THREE.Vector3(-0.03, -0.03, -0.06), charge: new THREE.Vector3(0, 0.045, 0.09),
    makeMag, magSize: 30, rpm: 850, dmg: 34, head: 170, spread: 1, kick: 0.019, cal: 0, rate: 1.0, gainK: 1, adsFov: 54 });
}

function buildLMG(id, inv) {
  const g = new THREE.Group(), body = inv ? M.black : M.cerakote, poly = inv ? M.poly : M.fde;
  add(g, rb(0.06, 0.075, 0.3, 0.007), body, 0, 0.005, -0.03);              // receiver
  add(g, rb(0.064, 0.026, 0.2, 0.006), M.black, 0, 0.052, -0.04);           // feed cover
  add(g, rb(0.05, 0.05, 0.13, 0.006), body, 0, -0.05, -0.02);              // lower
  const ch = add(g, rb(0.012, 0.016, 0.04, 0.003), M.black, inv ? 0.036 : -0.036, 0.0, -0.1);
  add(g, rb(0.062, 0.06, 0.3, 0.008), poly, 0, -0.004, -0.33);             // handguard
  rail(g, 0.36, 0.07, 0.06);
  add(g, cylZ(0.012, 0.012, 0.3), M.steel, 0, 0.0, -0.6);                  // heavy barrel
  add(g, cylZ(0.016, 0.016, 0.07, 12), M.black, 0, 0.0, -0.78);           // flash hider
  for (let k = 0; k < 4; k++) add(g, new THREE.BoxGeometry(0.034, 0.003, 0.007), M.steel, 0, 0.0, -0.76 - k * 0.012);
  // carry handle over the barrel, gas block
  add(g, rb(0.016, 0.012, 0.12, 0.004), M.black, 0, 0.06, -0.52); add(g, rb(0.01, 0.05, 0.01, 0.003), M.black, 0, 0.035, -0.47); add(g, rb(0.01, 0.05, 0.01, 0.003), M.black, 0, 0.035, -0.57);
  add(g, cylZ(0.02, 0.02, 0.04, 12), M.black, 0, -0.01, -0.5);
  // folded bipod
  for (const s of [-1, 1]) add(g, rb(0.01, 0.01, 0.2, 0.003), M.black, s * 0.012, -0.045, -0.58);
  add(g, rb(0.03, 0.02, 0.03, 0.004), M.black, 0, -0.035, -0.47);
  grip(g); trigger(g);
  // stock
  add(g, rb(0.03, 0.06, 0.18, 0.008), poly, 0, -0.012, 0.2);
  add(g, rb(0.044, 0.13, 0.025, 0.008), M.rubber, 0, -0.03, 0.3);
  add(g, rb(0.034, 0.02, 0.1, 0.006), poly, 0, 0.03, 0.2);                 // cheek
  const o = scope(g, 0.1, -0.04, 0.12, 0.022);
  // the belt box hangs under the left side, belt running up into the feed tray
  const makeMag = boxMag(0.06, 0.12, 0.1, inv ? M.ranger : M.pouch);
  const mag = makeMag(); mag.position.set(-0.01, -0.04, -0.1); g.add(mag);
  for (let k = 0; k < 6; k++) add(g, rb(0.01, 0.008, 0.016, 0.002), M.brass, -0.036, 0.02 - k * 0.008, -0.11 + k * 0.004, 0, 0, 0.3);
  return finish(g, { id, sightY: o.eyeY, eyeZ: 0.24, muzzleZ: -0.82, mag, chargeHandle: ch, reticle: o.ret,
    support: new THREE.Vector3(-0.032, -0.05, -0.32), magwell: new THREE.Vector3(-0.01, -0.06, -0.1), charge: new THREE.Vector3(inv ? 0.04 : -0.04, 0.0, -0.1),
    makeMag, magSize: 100, rpm: inv ? 720 : 650, dmg: 46, head: 200, spread: 1.5, kick: 0.024, cal: 2, rate: inv ? 0.96 : 1.0, gainK: 1.15, reloadScale: 1.9, adsFov: 50, heavy: 0.85 });
}

// M2HB .50 on a pedestal mount: the gun in the bed of the truck on The Bomb. Spade grips at the back, the butterfly
// trigger between them, the perforated barrel support, a heavy barrel with its carrying handle, the leaf sight, the
// ammo can on the left feeding a belt of big rounds, the cradle and the post going down into the bed.
function buildM2() {
  const g = new THREE.Group(), park = M.m2park, od = M.m2od;
  add(g, rb(0.18, 0.21, 0.6, 0.012), park, 0, 0.02, -0.32);                    // receiver
  add(g, rb(0.165, 0.035, 0.4, 0.01), park, 0, 0.145, -0.33);                  // feed cover
  add(g, rb(0.05, 0.03, 0.06, 0.008), M.steel, 0, 0.17, -0.15);                 // cover latch
  for (let k = 0; k < 3; k++) add(g, rb(0.186, 0.012, 0.02, 0.003), M.black, 0, -0.03 + k * 0.05, -0.08 - k * 0.002);   // side-plate rivet rows
  for (let k = 0; k < 6; k++) for (const sx of [-1, 1]) add(g, cylZ(0.008, 0.008, 0.006, 8), M.steel, sx * 0.093, 0.06, -0.12 - k * 0.08, 0, Math.PI / 2, 0);
  add(g, rb(0.2, 0.2, 0.035, 0.008), park, 0, 0.02, 0.0);                       // back plate
  const ch = add(g, rb(0.022, 0.03, 0.1, 0.006), M.steel, 0.105, 0.03, -0.24);  // charging handle (retracting slide), right
  add(g, rb(0.06, 0.012, 0.012, 0.004), M.steel, 0.12, 0.03, -0.2);
  // spade grips and the butterfly trigger
  for (const sx of [-1, 1]) {
    add(g, rb(0.03, 0.03, 0.09, 0.008), park, sx * 0.085, 0.0, 0.055);
    const h = add(g, new THREE.CylinderGeometry(0.021, 0.021, 0.15, 12), M.rubber, sx * 0.112, 0.0, 0.1);
    add(g, new THREE.CylinderGeometry(0.024, 0.024, 0.012, 12), M.black, sx * 0.112, 0.08, 0.1); void h;
  }
  add(g, rb(0.09, 0.05, 0.012, 0.006), M.steel, 0, 0.02, 0.06, -0.4);           // butterfly trigger
  // sights: folding leaf at the back, post at the front of the receiver
  add(g, rb(0.05, 0.08, 0.012, 0.003), M.black, 0, 0.2, -0.12); add(g, rb(0.012, 0.03, 0.012, 0.002), M.steel, 0, 0.255, -0.12);
  add(g, rb(0.01, 0.06, 0.012, 0.002), M.black, 0, 0.2, -0.6);
  // barrel support (perforated jacket), barrel, carrying handle, flash hider
  add(g, cylZ(0.052, 0.052, 0.26, 18), park, 0, 0.03, -0.75);
  for (let k = 0; k < 4; k++) for (let j = 0; j < 6; j++) { const a = j / 6 * Math.PI * 2; add(g, new THREE.CylinderGeometry(0.009, 0.009, 0.012, 8), M.black, Math.cos(a) * 0.05, 0.03 + Math.sin(a) * 0.05, -0.66 - k * 0.055, 0, 0, a + Math.PI / 2); }
  add(g, cylZ(0.028, 0.03, 0.92, 16), M.steel, 0, 0.03, -1.34);
  add(g, cylZ(0.034, 0.03, 0.06, 16), M.black, 0, 0.03, -0.92);
  add(g, cylZ(0.045, 0.033, 0.13, 16), M.black, 0, 0.03, -1.84);                // flash hider
  add(g, rb(0.022, 0.07, 0.022, 0.006), M.black, 0, 0.085, -0.98); add(g, rb(0.022, 0.07, 0.022, 0.006), M.black, 0, 0.085, -1.1);
  add(g, rb(0.026, 0.024, 0.16, 0.01), M.rubber, 0, 0.125, -1.04);             // carrying handle
  // cradle, traverse-and-elevation, and the post down into the bed
  add(g, rb(0.24, 0.06, 0.34, 0.01), od, 0, -0.12, -0.36);
  for (const sx of [-1, 1]) add(g, rb(0.02, 0.12, 0.08, 0.005), od, sx * 0.11, -0.07, -0.36);
  add(g, new THREE.CylinderGeometry(0.05, 0.06, 1.0, 14), od, 0, -0.66, -0.36);
  add(g, new THREE.CylinderGeometry(0.075, 0.075, 0.06, 14), M.black, 0, -0.18, -0.36);
  add(g, rb(0.05, 0.22, 0.05, 0.008), M.black, 0, -0.26, -0.08);                 // T&E screw to the back
  // the can, and the belt climbing out of it into the feed tray (left side)
  const makeMag = () => { const c = new THREE.Group(); add(c, rb(0.12, 0.21, 0.3, 0.01), od, 0, -0.105, 0); add(c, rb(0.125, 0.015, 0.305, 0.006), M.black, 0, 0.0, 0); add(c, rb(0.08, 0.02, 0.03, 0.006), M.black, 0, 0.015, 0); return c; };
  const mag = makeMag(); mag.position.set(-0.2, -0.04, -0.33); g.add(mag);
  for (let k = 0; k < 7; k++) { const u = k / 6, x = -0.2 + u * 0.12, y = -0.03 + Math.sin(u * Math.PI * 0.5) * 0.15, z = -0.33;
    add(g, new THREE.CylinderGeometry(0.0105, 0.0105, 0.1, 8), M.brass, x, y, z - 0.015, Math.PI / 2, 0, 0); add(g, new THREE.ConeGeometry(0.0105, 0.035, 8), M.steel, x, y, z - 0.082, -Math.PI / 2, 0, 0); add(g, rb(0.016, 0.02, 0.03, 0.003), M.black, x, y + 0.012, z + 0.04); }
  const ret = new THREE.Object3D(); g.add(ret);
  return finish(g, { id: 'm2', sightY: 0.245, eyeZ: 0.32, muzzleZ: -1.9, mag, makeMag, chargeHandle: ch, reticle: ret,
    grip: new THREE.Vector3(0.112, -0.02, 0.1), support: new THREE.Vector3(-0.112, -0.02, 0.1), magwell: new THREE.Vector3(-0.2, -0.04, -0.33), charge: new THREE.Vector3(0.12, 0.03, -0.22),
    hip: new THREE.Vector3(0.0, -0.34, -0.36), magSize: 100, rpm: 520, dmg: 160, head: 400, spread: 0.65, kick: 0.03, cal: 3, rate: 1.2, gainK: 1.4, reloadScale: 2.4, adsFov: 46, heavy: 1, mounted: true });
}

function buildMP7() {
  const g = new THREE.Group();
  add(g, rb(0.046, 0.07, 0.22, 0.01), M.poly, 0, 0.0, -0.06);              // receiver shell
  add(g, rb(0.04, 0.03, 0.12, 0.006), M.poly, 0, -0.045, -0.1);            // forend underside
  const ch = add(g, rb(0.05, 0.01, 0.02, 0.003), M.black, 0, 0.038, 0.04);
  rail(g, 0.19, 0.04, 0.04);
  add(g, cylZ(0.008, 0.008, 0.07), M.steel, 0, 0.005, -0.2);
  add(g, cylZ(0.012, 0.012, 0.03, 12), M.black, 0, 0.005, -0.24);
  // folding vertical grip (deployed)
  add(g, rb(0.022, 0.07, 0.026, 0.008), M.poly, 0, -0.09, -0.13);
  // mag well IS the grip
  add(g, rb(0.034, 0.12, 0.05, 0.01), M.poly, 0, -0.1, 0.05, -0.18);
  trigger(g, 0.0);
  // retracted stock: two thin rods and a pad
  for (const s of [-1, 1]) add(g, rb(0.006, 0.006, 0.16, 0.002), M.black, s * 0.02, -0.02, 0.1);
  add(g, rb(0.05, 0.06, 0.016, 0.006), M.poly, 0, -0.03, 0.18);
  const o = microDot(g, 0.062, -0.0);
  const makeMag = () => { const m = new THREE.Group(); add(m, rb(0.022, 0.2, 0.034, 0.004), M.poly, 0, -0.1, 0, -0.18); add(m, rb(0.026, 0.016, 0.04, 0.004), M.black, 0, -0.2, 0.036, -0.18); return m; };
  const mag = makeMag(); mag.position.set(0, -0.06, 0.04); g.add(mag);
  return finish(g, { id: 'mp7', sightY: o.eyeY, eyeZ: 0.17, muzzleZ: -0.26, mag, chargeHandle: ch, reticle: o.ret, grip: new THREE.Vector3(0.012, -0.1, 0.06),
    support: new THREE.Vector3(-0.01, -0.1, -0.13), magwell: new THREE.Vector3(-0.0, -0.16, 0.07), charge: new THREE.Vector3(0, 0.045, 0.05),
    makeMag, magSize: 40, rpm: 950, dmg: 24, head: 120, spread: 1.15, kick: 0.012, cal: 0, rate: 1.25, gainK: 0.8, reloadScale: 0.85, adsFov: 58, hip: new THREE.Vector3(0.13, -0.19, -0.32) });
}

function buildBenelli() {
  const g = new THREE.Group();
  add(g, rb(0.045, 0.07, 0.24, 0.008), M.black, 0, 0.0, -0.04);            // receiver
  add(g, rb(0.004, 0.022, 0.07, 0.001), M.steel, 0.023, 0.005, -0.02);     // ejection port
  const ch = add(g, rb(0.022, 0.014, 0.012, 0.004), M.steel, 0.03, 0.005, -0.03);  // bolt handle
  add(g, cylZ(0.011, 0.011, 0.47), M.black, 0, 0.012, -0.39);              // barrel
  add(g, cylZ(0.014, 0.014, 0.42, 16), M.black, 0, -0.024, -0.37);         // magazine tube
  add(g, rb(0.05, 0.05, 0.2, 0.012), M.poly, 0, -0.022, -0.26);            // forend
  add(g, rb(0.03, 0.03, 0.03, 0.006), M.black, 0, -0.008, -0.59);          // barrel clamp
  add(g, rb(0.008, 0.012, 0.01, 0.002), M.steel, 0, 0.026, -0.62);         // front sight
  // ghost ring + rail
  rail(g, 0.12, 0.04, 0.04);
  add(g, new THREE.TorusGeometry(0.008, 0.003, 8, 16), M.black, 0, 0.06, 0.03);
  grip(g); trigger(g, 0.0);
  // M1014 telescoping stock
  add(g, cylZ(0.016, 0.016, 0.14, 16), M.black, 0, -0.008, 0.16);
  add(g, rb(0.04, 0.08, 0.15, 0.014), M.poly, 0, -0.03, 0.24);
  add(g, rb(0.042, 0.13, 0.02, 0.008), M.rubber, 0, -0.04, 0.315);
  // spare shells on a side saddle
  add(g, rb(0.006, 0.05, 0.13, 0.002), M.black, -0.025, 0.0, -0.01);
  for (let k = 0; k < 5; k++) { add(g, cylZ(0.0095, 0.0095, 0.05, 10), M.shell, -0.034, 0.008, -0.06 + k * 0.024).rotation.set(Math.PI / 2, 0, 0); add(g, cylZ(0.0098, 0.0098, 0.012, 10), M.brass, -0.034, -0.022, -0.06 + k * 0.024).rotation.set(Math.PI / 2, 0, 0); }
  const o = microDot(g, 0.07, -0.02);
  const makeMag = () => { const m = new THREE.Group(); add(m, cylZ(0.0105, 0.0105, 0.068, 10), M.shell, 0, 0, 0); add(m, cylZ(0.011, 0.011, 0.012, 10), M.brass, 0, 0, 0.034); return m; };
  const mag = new THREE.Group(); g.add(mag);
  return finish(g, { id: 'm1014', sightY: o.eyeY, eyeZ: 0.21, muzzleZ: -0.63, mag, chargeHandle: ch, reticle: o.ret,
    support: new THREE.Vector3(-0.03, -0.06, -0.27), magwell: new THREE.Vector3(0.0, -0.04, -0.04), charge: new THREE.Vector3(0.035, 0.005, -0.03),
    makeMag, magSize: 7, rpm: 280, auto: false, tube: true, pellets: 9, dmg: 16, head: 30, spread: 2.4, kick: 0.05, cal: 2, rate: 0.72, gainK: 1.35, adsFov: 60 });
}

function buildCSASS() {
  const g = new THREE.Group(), tan = M.cerakote;
  add(g, rb(0.05, 0.062, 0.23, 0.006), tan, 0, 0.004, -0.02);
  add(g, rb(0.048, 0.05, 0.17, 0.006), tan, 0, -0.048, -0.03);
  add(g, rb(0.054, 0.022, 0.07, 0.004), tan, 0, -0.032, -0.12);
  add(g, rb(0.006, 0.02, 0.025, 0.002), M.black, -0.027, -0.03, -0.06);
  const ch = add(g, rb(0.054, 0.012, 0.022, 0.003), M.black, 0, 0.04, 0.095);
  add(g, rb(0.058, 0.06, 0.38, 0.008), tan, 0, 0.002, -0.32);              // long free-float rail
  for (let k = 0; k < 8; k++) for (const s of [-1, 1]) add(g, new THREE.BoxGeometry(0.002, 0.018, 0.03), M.black, s * 0.0295, -0.008, -0.16 - k * 0.042);
  rail(g, 0.6, 0.04, 0.1);
  add(g, cylZ(0.0105, 0.0105, 0.06), M.steel, 0, 0.0, -0.53);
  add(g, cylZ(0.021, 0.021, 0.17, 24), tan, 0, 0.0, -0.64);                // suppressor
  add(g, cylZ(0.0215, 0.0215, 0.012, 24), M.black, 0, 0.0, -0.56);
  grip(g); trigger(g);
  // adjustable precision stock with cheek riser
  add(g, cylZ(0.016, 0.016, 0.16, 16), M.black, 0, -0.005, 0.18);
  add(g, rb(0.044, 0.085, 0.17, 0.01), tan, 0, -0.035, 0.25);
  add(g, rb(0.036, 0.022, 0.12, 0.006), tan, 0, 0.022, 0.24);
  add(g, rb(0.046, 0.13, 0.022, 0.008), M.rubber, 0, -0.04, 0.34);
  const o = scope(g, 0.085, -0.02, 0.2, 0.026);
  const makeMag = stanag(0.02, 4, M.poly, 0.03);
  const mag = makeMag(); mag.position.set(0, -0.045, -0.12); g.add(mag);
  return finish(g, { id: 'csass', sightY: o.eyeY, eyeZ: 0.22, muzzleZ: -0.73, mag, chargeHandle: ch, reticle: o.ret,
    support: new THREE.Vector3(-0.03, -0.05, -0.3), magwell: new THREE.Vector3(-0.01, -0.06, -0.12), boltCatch: new THREE.Vector3(-0.035, -0.03, -0.06), charge: new THREE.Vector3(0, 0.05, 0.1),
    makeMag, magSize: 20, rpm: 420, auto: false, dmg: 85, head: 300, spread: 0.6, kick: 0.034, cal: 2, rate: 0.95, gainK: 0.75, suppressed: true, adsFov: 24 });
}

function buildPistol(id, frameMat, slideMat) {
  const g = new THREE.Group();
  const slide = add(g, rb(0.026, 0.032, 0.18, 0.004), slideMat, 0, 0.0, -0.06);
  for (let k = 0; k < 7; k++) for (const s of [-1, 1]) add(g, new THREE.BoxGeometry(0.002, 0.022, 0.003), M.steel, s * 0.0132, 0.002, 0.01 + k * 0.006);
  add(g, rb(0.024, 0.024, 0.16, 0.004), frameMat, 0, -0.026, -0.05);       // frame/dust cover
  add(g, rb(0.006, 0.006, 0.006, 0.002), M.black, 0, 0.019, -0.145);      // front sight
  add(g, rb(0.02, 0.007, 0.006, 0.002), M.black, 0, 0.019, 0.02);         // rear sight
  add(g, cylZ(0.0055, 0.0055, 0.004, 10), M.steel, 0, 0.003, -0.152);
  add(g, rb(0.028, 0.11, 0.046, 0.01), frameMat, 0, -0.085, 0.045, -0.26); // grip
  add(g, rb(0.026, 0.012, 0.05, 0.003), frameMat, 0, -0.06, -0.01);       // trigger guard
  add(g, rb(0.004, 0.018, 0.006, 0.002), M.black, 0, -0.05, -0.0, 0.2);
  const makeMag = pistolMag(M.black);
  const mag = makeMag(); mag.position.set(0, -0.04, 0.04); g.add(mag);
  const ret = new THREE.Object3D(); g.add(ret);
  return finish(g, { id, pistol: true, sightY: 0.021, eyeZ: 0.32, muzzleZ: -0.16, mag, chargeHandle: slide, reticle: ret, grip: new THREE.Vector3(0.012, -0.075, 0.05),
    support: new THREE.Vector3(-0.022, -0.085, 0.045), magwell: new THREE.Vector3(0, -0.12, 0.06), boltCatch: new THREE.Vector3(-0.016, -0.03, -0.02), charge: new THREE.Vector3(0, 0.0, 0.01),
    makeMag, magSize: 17, rpm: 400, auto: false, dmg: 30, head: 130, spread: 0.9, kick: 0.03, cal: 0, rate: 1.35, gainK: 0.7, reloadScale: 0.7, adsFov: 64, hip: new THREE.Vector3(0.1, -0.17, -0.36), pistolHip: true });
}

function m7() {
  const g = buildM7(); Object.assign(g.userData, { id: 'm7', grip: GRIP.clone(), auto: true, pellets: 1, dmg: 46, head: 200, spread: 1, kick: 0.026, cal: 1, rate: 1, gainK: 1, adsFov: 50, reloadScale: 1 }); return g;
}
function x95() {
  const g = buildBullpup(); Object.assign(g.userData, { id: 'x95', grip: GRIP.clone(), auto: true, pellets: 1, dmg: 36, head: 180, spread: 0.95, kick: 0.02, cal: 0, rate: 1, gainK: 1, adsFov: 54, reloadScale: 1, rpm: 850 }); return g;
}

export const WEAPONS = {
  m7: { name: 'SIG M7', cal: '6.8×51', build: m7 },
  x95: { name: 'IWI TAVOR X95', cal: '5.56', build: x95 },
  m250: { name: 'SIG M250', cal: '6.8×51 belt', build: () => buildLMG('m250', false) },
  m2: { name: 'M2HB · PEDESTAL MOUNT', cal: '.50 BMG', build: buildM2 },
  ng7: { name: 'IWI NEGEV NG7', cal: '7.62 belt', build: () => buildLMG('ng7', true) },
  hk416: { name: 'HK416 A5', cal: '5.56', build: buildHK416 },
  mp7: { name: 'HK MP7A2', cal: '4.6×30', build: buildMP7 },
  m1014: { name: 'BENELLI M1014', cal: '12 GA', build: buildBenelli },
  csass: { name: 'HK M110A1 CSASS', cal: '7.62×51', build: buildCSASS },
  m18: { name: 'SIG M18', cal: '9MM', build: () => buildPistol('m18', M.fde, M.black) },
  g17: { name: 'GLOCK 17', cal: '9MM', build: () => buildPistol('g17', M.poly, M.black) },
};

// who carries what (deterministic per body)
export function primaryOf(a) {
  if (a.mg) return a.side === 0 ? 'm250' : 'ng7';
  const h = hash1(a.id * 31 + 7);
  if (a.side === 0) return h < 0.56 ? 'm7' : h < 0.72 ? 'hk416' : h < 0.82 ? 'csass' : h < 0.91 ? 'm1014' : 'mp7';
  return h < 0.62 ? 'x95' : h < 0.75 ? 'hk416' : h < 0.86 ? 'mp7' : h < 0.95 ? 'm1014' : 'csass';
}
export function sidearmOf(side) { return side === 0 ? 'm18' : 'g17'; }

// a gun lying in the sand: the same model, merged per material, shadows on
const propCache = new Map();
export function weaponProp(id) {
  if (!propCache.has(id)) {
    const src = WEAPONS[id].build(); src.updateMatrixWorld(true);
    const byMat = new Map();
    src.traverse((o) => {
      if (!o.isMesh || o.material.transparent || o.material.isMeshBasicMaterial) return;
      let gg = o.geometry.clone(); if (gg.index) gg = gg.toNonIndexed();
      for (const k of Object.keys(gg.attributes)) if (!['position', 'normal', 'uv'].includes(k)) gg.deleteAttribute(k);
      if (!gg.attributes.uv) gg.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(gg.attributes.position.count * 2), 2));
      gg.applyMatrix4(o.matrixWorld);
      const m = o.material.side === THREE.DoubleSide ? o.material : o.material;
      if (!byMat.has(m)) byMat.set(m, []); byMat.get(m).push(gg);
    });
    const t = new THREE.Group();
    for (const [m, l] of byMat) { const mesh = new THREE.Mesh(mergeGeometries(l), m); mesh.castShadow = true; mesh.receiveShadow = true; t.add(mesh); }
    propCache.set(id, t);
  }
  return propCache.get(id).clone();
}
