// Scanned, public-domain (CC0) assets from Poly Haven, loaded from ./assets/ beside the page. Everything here is
// optional: if a file isn't there (the single-file build on its own), the procedural version it replaces stays.
import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

const BASE = (() => { try { return new URL('./assets/', location.href).href; } catch (e) { return './assets/'; } })();
const OFF = typeof location !== 'undefined' && /[?&]noassets\b/.test(location.search);
const tl = new THREE.TextureLoader(), cache = new Map();

function img(file, srgb) {
  const k = file + (srgb ? ':s' : '');
  if (!cache.has(k)) cache.set(k, new Promise((res, rej) => { if (OFF) return rej(new Error('off')); tl.load(BASE + file, (t) => { t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; res(t); }, undefined, () => rej(new Error('missing ' + file))); }));
  return cache.get(k);
}
// one texture of a scanned set, as its own Texture (own repeat) sharing the image: kind 'd' colour, 'n' normal, 'arm' ao/rough/metal
export function photoTex(name, kind, repeat) {
  return img(`tex/${name}_${kind}.webp`, kind === 'd').then((t) => { const c = t.clone(); if (repeat) c.repeat.set(repeat[0], repeat[1]); c.needsUpdate = true; return c; });
}
// Put a scanned surface on a standard material once it has loaded. o: repeat [u, v] · normalScale · color (tint) ·
// rough (false: leave the material's own roughness alone) · metal (true: take metalness from the scan too)
export function applyTex(mat, name, o = {}) {
  if (!mat || OFF) return;
  Promise.all([photoTex(name, 'd', o.repeat), photoTex(name, 'n', o.repeat), o.rough === false ? null : photoTex(name, 'arm', o.repeat)]).then(([d, n, a]) => {
    mat.map = d; mat.normalMap = n; if (!mat.normalScale) mat.normalScale = new THREE.Vector2(1, 1); mat.normalScale.setScalar(o.normalScale ?? 1);
    if (a) { mat.roughnessMap = a; mat.roughness = o.roughness ?? 1; if (o.metal) { mat.metalnessMap = a; mat.metalness = 1; } }
    if (o.color) mat.color.set(o.color);
    if (mat.userData.uDet) { const u = mat.userData.uDet.value; u.y *= 0.35; u.z *= 0.5; u.w *= 0.5; }   // the scan carries the surface now: the procedural layer drops to a whisper
    else if (!mat.userData.det4) mat.userData.det4 = [0.9, 0.002, 0.16, 0.08];
    mat.userData.photo = name; mat.needsUpdate = true;
    if (o.done) o.done(mat);
  }).catch(() => {});
}
// the sky: an HDR panorama, and where in it the sun is (u, 0..1), so it can be turned to face the scene's own sun
export function loadSky(done) {
  if (OFF) return;
  new HDRLoader().load(BASE + 'sky.hdr', (t) => {
    t.wrapS = THREE.RepeatWrapping; t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
    const { data, width, height } = t.image; let best = -1, bu = 0.5, bv = 0.5;
    const val = data instanceof Uint16Array ? (i) => THREE.DataUtils.fromHalfFloat(data[i]) : (i) => data[i];
    for (let y = 0; y < height; y += 2) for (let x = 0; x < width; x += 2) { const i = (y * width + x) * 4, l = val(i) + val(i + 1) + val(i + 2); if (l > best) { best = l; bu = (x + 0.5) / width; bv = (y + 0.5) / height; } }
    done(t, bu, bv);
  }, undefined, () => {});
}

// downloaded models (glTF binary, meshopt-compressed, WebP textures): one load per file, shared by every user
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
const models = new Map();
export function loadModel(file) {
  if (!models.has(file)) models.set(file, new Promise((res, rej) => {
    if (OFF) return rej(new Error('off'));
    const l = new GLTFLoader(); l.setMeshoptDecoder(MeshoptDecoder);
    l.load(BASE + 'models/' + file, (g) => { g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; for (const m of [].concat(o.material)) { if (m.map) m.map.anisotropy = 8; } } }); res(g.scene); }, undefined, () => rej(new Error('missing ' + file)));
  }));
  return models.get(file);
}
// first node (depth-first) whose name contains the text
export function findNode(root, text) { let hit = null; root.traverse((o) => { if (!hit && o.name && o.name.toLowerCase().includes(text.toLowerCase())) hit = o; }); return hit; }
