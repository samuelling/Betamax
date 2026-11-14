// Downloaded vehicle models (Sketchfab, CC BY — credits in the README) worn over the procedural ones: the model is
// fitted to the procedural vehicle's own box (length, centre, ground), so placement, collision and seating don't move.
import * as THREE from 'three';
import { loadModel, findNode } from './assets.js';

const _m = new THREE.Matrix4(), _b = new THREE.Box3();
// the box of the meshes under root, in root's own frame
function localBox(root, skip) {
  root.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), box = new THREE.Box3();
  root.traverse((o) => { if (!o.isMesh || !o.geometry || (skip && skip(o))) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    _b.copy(o.geometry.boundingBox).applyMatrix4(_m.multiplyMatrices(inv, o.matrixWorld)); box.union(_b); });
  return box;
}
const under = (o, names) => { for (let p = o; p; p = p.parent) if (names.includes(p.name)) return true; return false; };

// grp: the procedural vehicle. o: file · pick(scene) → the part of the file to use (default: all of it) · front: +1 if the
// model's nose is toward + on its long axis, -1 if toward − · keep: names of procedural sub-objects that stay (rotors…) ·
// drop(mesh) → true for model meshes to leave out · done(model, procMeshes)
export function dressVehicle(grp, o) {
  loadModel(o.file).then((scene) => {
    let src = scene.clone(true); if (o.pick) src = o.pick(src); if (!src) return;
    if (o.drop) { const gone = []; src.traverse((q) => { if (q.isMesh && o.drop(q)) gone.push(q); }); for (const q of gone) q.parent.remove(q); }
    const keep = o.keep || [], proc = []; grp.traverse((q) => { if (q.isMesh && !under(q, keep) && !(o.keepMesh && o.keepMesh(q))) proc.push(q); });
    const P = localBox(grp, (q) => !proc.includes(q)); if (P.isEmpty()) return;
    const W = new THREE.Group(); W.name = 'model'; W.add(src);
    let M = localBox(W); const sx = M.max.x - M.min.x, sz = M.max.z - M.min.z;
    // nose to −z (the game's front)
    let yaw = sx > sz ? (o.front > 0 ? Math.PI / 2 : -Math.PI / 2) : (o.front > 0 ? Math.PI : 0);
    src.rotation.y += yaw; if (o.flipProc) src.rotation.y += Math.PI;
    M = localBox(W);
    const s = (P.max.z - P.min.z) / Math.max(1e-6, M.max.z - M.min.z) * (o.scale || 1); W.scale.setScalar(s);
    W.position.set((P.min.x + P.max.x) / 2 - (M.min.x + M.max.x) / 2 * s, P.min.y - M.min.y * s + (o.lift || 0), (P.min.z + P.max.z) / 2 - (M.min.z + M.max.z) / 2 * s + (o.shift || 0));
    for (const q of proc) q.visible = false;
    grp.add(W);
    if (o.done) o.done(W, proc);
  }).catch((e) => { if (!/missing|off/.test(String(e && e.message))) console.error('vehicle model', o.file, e); });
}

// one car out of the pack: its body and the four wheels standing in its footprint, brought into the body's own frame
export function pickCar(name) {
  return (scene) => {
    const body = findNode(scene, name); if (!body) return null;
    scene.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(body).expandByScalar(0.3), c = new THREE.Vector3(), take = [body];
    const rootNode = body.parent; for (const n of rootNode.children) { if (n === body || !/wheel/i.test(n.name)) continue; new THREE.Box3().setFromObject(n).getCenter(c); if (bb.containsPoint(c)) take.push(n); }
    const H = new THREE.Group(); body.matrixWorld.decompose(H.position, H.quaternion, H.scale); scene.add(H); H.updateMatrixWorld(true);
    for (const n of take) H.attach(n);
    scene.remove(H); H.position.set(0, 0, 0); H.quaternion.identity(); H.scale.set(1, 1, 1);
    return H;
  };
}

// a downloaded house stretched onto a layout footprint (w along x, l along z), standing at the parent's origin
export function dressHouse(parent, file, w, l, done) {
  loadModel(file).then((scene) => {
    const src = scene.clone(true), W = new THREE.Group(); W.name = 'model'; W.add(src);
    let M = localBox(W); const H0 = M.max.y - M.min.y, y0 = M.min.y, gone = [];
    src.traverse((q) => { if (!q.isMesh) return; q.geometry.computeBoundingBox(); W.updateMatrixWorld(true); _b.copy(q.geometry.boundingBox).applyMatrix4(q.matrixWorld); if (_b.max.y - y0 < H0 * 0.09) gone.push(q); });   // paths, lawns, driveways
    for (const q of gone) q.parent.remove(q);
    M = localBox(W); if (M.max.x - M.min.x < M.max.z - M.min.z) { src.rotation.y += Math.PI / 2; M = localBox(W); }
    const fx = w * 1.03 / (M.max.x - M.min.x), fz = l * 1.03 / (M.max.z - M.min.z), fy = (fx + fz) / 2;
    W.scale.set(fx, fy, fz); W.position.set(-(M.min.x + M.max.x) / 2 * fx, -M.min.y * fy - 0.03, -(M.min.z + M.max.z) / 2 * fz);
    parent.add(W); if (done) done(W);
  }).catch((e) => { if (!/missing|off/.test(String(e && e.message))) console.error('house model', file, e); });
}
