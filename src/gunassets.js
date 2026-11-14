// Downloaded rifles (Sketchfab, CC BY — credits in the README) worn over the procedural ones. The procedural gun
// stays as the skeleton: its animated parts (magazine, charging handle), sight line, muzzle and hand positions
// keep working; its meshes are hidden once the model has loaded, and the model's own parts ride on the same pivots.
import * as THREE from 'three';
import { loadModel, findNode } from './assets.js';

const SPEC = {
  // SIG MCX Spear with SLX suppressor and an EOTech: model +x is the muzzle
  spear: { file: 'spear.glb', s: 0.0828, boreY: 0.245, trigX: -0.65, trigZ: 0.005, boreOurY: 0, drop: ['277_0', 'mag empty'], mag: 'ar-10 mag 30rnd', charge: 'spear charging handle', sight: 'eotech', sightK: 0.6, muzzleX: 6.96 },
  // HS Produkt VHS-2
  bullpup: { file: 'bullpup.glb', s: 0.1, boreY: 0.455, trigX: 0.2, trigZ: 0.0, boreOurY: 0.012, drop: ['30rnd mag_5', '5.56x45', '55645'], mag: 'empty mag', charge: 'vhs2 charging handle', keepSight: true, railY: 1.48, muzzleX: 3.96 },
};
const _b = new THREE.Box3(), _v = new THREE.Vector3();
if (typeof location !== 'undefined') for (const k of Object.keys(SPEC)) loadModel(SPEC[k].file).catch(() => {});   // fetched while the title is up, so the first gun is already dressed

export function dressGun(g, key) {
  const sp = SPEC[key]; if (!sp || typeof location === 'undefined') return g;
  const ud0 = () => g.userData;
  const proc = []; g.traverse((o) => { if (o.isMesh) proc.push(o); });   // what the gun is made of now; anything added later (flashes, hands) is not ours to hide
  loadModel(sp.file).then((scene) => {
    const ud = ud0(), src = scene.clone(true);
    for (const d of sp.drop) { let n; while ((n = findNode(src, d))) n.parent.remove(n); }
    const W = new THREE.Group(); W.name = 'model'; W.rotation.y = Math.PI / 2; W.scale.setScalar(sp.s);
    W.position.set(0, sp.boreOurY - sp.boreY * sp.s, sp.trigZ + sp.trigX * sp.s); W.add(src); g.add(W);
    const vm = proc.some((o) => [].concat(o.material).some((m) => m && m.userData.vm));
    src.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) { if (vm) m.userData.vm = true; if (m.metalness > 0.9) m.metalness = 0.85; m.envMapIntensity = 1.2; } });
    g.updateMatrixWorld(true);
    // the sight
    const keep = new Set();
    if (sp.keepSight && ud.reticle && ud.reticle.parent && ud.reticle.parent !== g) {   // its own red dot stays, moved up onto the model's rail
      const rs = ud.reticle.parent; rs.traverse((o) => keep.add(o));
      const dy = sp.boreOurY + (sp.railY - sp.boreY) * sp.s + 0.012 - rs.position.y; rs.position.y += dy; ud.sightY += dy;
    } else if (sp.sight && ud.reticle) {
      const e = findNode(src, sp.sight);
      if (e) { _b.setFromObject(e); const inv = new THREE.Matrix4().copy(g.matrixWorld).invert(); const lo = _b.min.clone().applyMatrix4(inv), hi = _b.max.clone().applyMatrix4(inv);
        const y = Math.min(lo.y, hi.y) + Math.abs(hi.y - lo.y) * sp.sightK, zr = Math.max(lo.z, hi.z);
        const r = ud.reticle; keep.add(r); g.attach(r); r.position.set(0, y, zr - 0.012); r.rotation.set(0, 0, 0); r.scale.setScalar(0.62); ud.sightY = y; }
    }
    for (const o of proc) if (!keep.has(o)) o.visible = false;
    // moving parts ride on the procedural pivots
    const ride = (name, pivot) => { const n = name && findNode(src, name); if (!n || !pivot) return null; const h = new THREE.Group(); pivot.add(h); g.updateMatrixWorld(true); h.attach(n); return h; };
    const magH = ride(sp.mag, ud.mag); ride(sp.charge, ud.chargeHandle);
    if (magH) {
      const mk = () => { const m = new THREE.Group(); m.add(magH.clone(true)); return m; };
      ud.makeMag = mk;
      if (ud.handMag) { ud.handMag.traverse((o) => { if (o.isMesh) o.visible = false; }); ud.handMag.add(magH.clone(true)); }
    }
    ud.muzzleZ = -(sp.muzzleX * sp.s) + W.position.z + 0.005;
    ud.dressed = key;
  }).catch((e) => { if (!/missing|off/.test(String(e && e.message))) console.error('gun model', key, e); });
  return g;
}
