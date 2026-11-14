// The photoreal look (the beach): no cel bands and no ink. Every lit surface is physically based and takes a
// layer of procedural micro-detail (bump, grime, roughness breakup) so that nothing reads as a flat-shaded box.
import * as THREE from 'three';
import { pnoise, mulberry32 } from './rng.js';
import { toonOrig, toonShared } from './toon.js';
import { photoTex } from './assets.js';

export const REAL = { on: false };

// one tiling detail texture: R = fine height (grain, pits, scratches), G = broad grime/wear, B = speckle
let detailTex = null;
function fbmP(x, y, size, base, oct) { let s = 0, a = 0.5, n = 0, f = base; for (let i = 0; i < oct; i++) { s += a * pnoise((x / size) * f + i * 31, (y / size) * f + i * 17, f); n += a; a *= 0.5; f *= 2; } return s / n; }
export function getDetailTex() {
  if (detailTex) return detailTex;
  const N = 256, d = new Uint8Array(N * N * 4), r = mulberry32(77);
  const h = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const a = fbmP(x, y, N, 6, 5), b = fbmP(x + 91, y + 13, N, 14, 3);
    h[y * N + x] = a * 0.62 + (1 - Math.abs(b * 2 - 1)) * 0.3;   // grain plus a little ridged crackle
  }
  // pits and short scratches
  for (let i = 0; i < 260; i++) { const x = Math.floor(r() * N), y = Math.floor(r() * N), R = 1 + Math.floor(r() * 2.4), dep = 0.1 + r() * 0.22;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const q = 1 - Math.hypot(dx, dy) / (R + 0.5); if (q > 0) h[((y + dy + N) % N) * N + ((x + dx + N) % N)] -= dep * q; } }
  for (let i = 0; i < 150; i++) { let x = r() * N, y = r() * N; const an = r() * 6.283, L = 6 + r() * 30, dep = 0.06 + r() * 0.14, cx = Math.cos(an), cy = Math.sin(an);
    for (let k = 0; k < L; k++) { h[(((y | 0) + N) % N) * N + (((x | 0) + N) % N)] -= dep; x += cx; y += cy; } }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const o = (y * N + x) * 4, g = fbmP(x + 40, y + 70, N, 2, 4), g2 = fbmP(x, y, N, 5, 3);
    d[o] = Math.max(0, Math.min(255, (h[y * N + x] * 0.9 + 0.12) * 255));
    d[o + 1] = Math.max(0, Math.min(255, ((g - 0.5) * 2.1 + (g2 - 0.5) * 0.7 + 0.5) * 255));
    d[o + 2] = Math.floor(r() * 255) * 0.6 + fbmP(x, y, N, 30, 2) * 255 * 0.4;
    d[o + 3] = 255;
  }
  const t = detailTex = new THREE.DataTexture(d, N, N);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 8; t.needsUpdate = true;
  return t;
}

const DET_FRAG = /* glsl */`
{ vec3 dn = normalize(vDetN); vec3 dw = pow(abs(dn), vec3(6.0)) + 1e-4; dw /= (dw.x + dw.y + dw.z);
  vec3 dp = vDetP * uDet.x * uDetA;
  #define DTRI(q) (texture2D(uDetTex, (q).zy) * dw.x + texture2D(uDetTex, (q).xz) * dw.y + texture2D(uDetTex, (q).xy) * dw.z)
  vec4 d0 = DTRI(dp);
  vec3 dpx = dFdx(dp), dpy = dFdy(dp);
  float foot = max(length(dpx), length(dpy)) * 256.0;          // texels per pixel: the bump fades out before it can shimmer
  float bf = uDet.y * clamp(2.6 - foot * 0.8, 0.0, 1.0);
  if (bf > 0.0) {
    float hx = DTRI(dp + dpx).r - d0.r, hy = DTRI(dp + dpy).r - d0.r;
    vec3 sX = dFdx(-vViewPosition), sY = dFdy(-vViewPosition), vN = normal;
    vec3 R1 = cross(sY, vN), R2 = cross(vN, sX); float fD = dot(sX, R1);
    vec3 gr = sign(fD) * (hx * R1 + hy * R2) * bf;
    normal = normalize(abs(fD) * vN - gr);
  }
  if (uTri.w > 0.5) {   // a scanned surface, laid by position on the three planes: no UVs needed, so any box can wear it
    vec3 tp = vDetP * uTri.x; vec2 a = uTriSwap > 0.5 ? tp.yz : tp.zy, b = uTriSwap > 0.5 ? tp.zx : tp.xz, c = uTriSwap > 0.5 ? tp.yx : tp.xy;
    vec3 ph = texture2D(uTriD, a).rgb * dw.x + texture2D(uTriD, b).rgb * dw.y + texture2D(uTriD, c).rgb * dw.z;
    float bl = max(dot(diffuseColor.rgb, vec3(0.33)), 0.04);
    diffuseColor.rgb = mix(diffuseColor.rgb, ph * uTri.z * mix(vec3(1.0), diffuseColor.rgb / bl, uTriTint), uTri.y);
  }
  vec4 d1 = DTRI(dp * 0.113 + 3.1);
  float grime = d1.g - 0.5, fine = d0.r - 0.5;
  diffuseColor.rgb *= clamp(1.0 + grime * uDet.z * 1.5 + fine * uDet.z * 0.7 + (d0.b - 0.5) * uDet.z * 0.25, 0.3, 1.6);
  roughnessFactor = clamp(roughnessFactor - grime * uDet.w * 1.3 + fine * uDet.w * 0.8, 0.045, 1.0);
}
`;

// what kind of surface a material is, from what it already says about itself: [tiles per metre, bump height (m), albedo breakup, roughness breakup]
function detailOf(m) {
  if (m.userData.det4) return m.userData.det4;
  const metal = m.metalness ?? 0, rough = m.roughness ?? 1;
  if (m.userData.vm) return metal > 0.3 ? [9, 0.0012, 0.2, 0.3] : [11, 0.0016, 0.22, 0.2];        // the gun in your hands: fine parkerising, cast polymer
  if (metal > 0.4) return [1.9, 0.004, 0.32, 0.34];                                              // plate and paint over steel
  if (m.vertexColors && !m.map) return [0.9, 0.007, 0.3, 0.16];
  if (rough < 0.4) return [1.4, 0.002, 0.14, 0.22];                                              // glass, gloss paint
  return [0.75, 0.007, 0.34, 0.16];                                                              // wood, concrete, cloth, earth
}

export function detailify(m) {
  if (!m || !m.isMeshStandardMaterial || m.userData.det || m.userData.noDet || m.transparent || m.alphaTest > 0) return;
  m.userData.det = true;
  const prev = m.onBeforeCompile, key0 = m.customProgramCacheKey ? m.customProgramCacheKey() : '';
  m.userData.obc0 = prev; m.userData.key0 = key0;
  const d = detailOf(m), uDet = { value: new THREE.Vector4(d[0], d[1], d[2], d[3]) }, uDetA = { value: new THREE.Vector3(...(d[4] || [1, 1, 1])) }, uTex = { value: getDetailTex() };
  m.userData.uDet = uDet;
  const uTri = { value: new THREE.Vector4(1, 1, 1, 0) }, uTriD = { value: getDetailTex() }, uTriSwap = { value: 0 }, uTriTint = { value: 0 };
  m.userData.triU = { uTri, uTriD, uTriSwap, uTriTint }; if (m.userData.tri) loadTri(m);
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(m, sh, r);
    sh.uniforms.uDet = uDet; sh.uniforms.uDetA = uDetA; sh.uniforms.uDetTex = uTex; sh.uniforms.uTri = uTri; sh.uniforms.uTriD = uTriD; sh.uniforms.uTriSwap = uTriSwap; sh.uniforms.uTriTint = uTriTint;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vDetP; varying vec3 vDetN;')
      .replace('#include <project_vertex>', 'vDetP = position; vDetN = normal;\n#ifdef USE_INSTANCING\n vDetP += instanceMatrix[3].xyz * 0.37;\n#endif\n#include <project_vertex>');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vDetP; varying vec3 vDetN; uniform vec4 uDet, uTri; uniform vec3 uDetA; uniform float uTriSwap, uTriTint; uniform sampler2D uDetTex, uTriD;')
      .replace('#include <emissivemap_fragment>', DET_FRAG + '#include <emissivemap_fragment>');
  };
  m.customProgramCacheKey = () => 'det:' + key0;
  m.needsUpdate = true;
}

// everything under root back to its physically based material, with detail; the cel hulls hidden
export function realify(root) {
  root.traverse((o) => {
    if (o.userData.outline) { o.visible = false; return; }
    if (!(o.isMesh || o.isInstancedMesh || o.isSkinnedMesh)) return;
    if (Array.isArray(o.material)) { o.material = o.material.map(toonOrig); o.material.forEach(detailify); }
    else { o.material = toonOrig(o.material); detailify(o.material); }
  });
}
export function setReal(on) { REAL.on = on; toonShared.off = on; }

// a scanned (Poly Haven) surface on a material without UVs to speak of: tiles per metre, brightness, and whether the
// material's own colour tints it (tint 0..1); swap turns the grain a quarter-turn
function loadTri(m) {
  const t = m.userData.tri, U = m.userData.triU; if (!t || !U || t.loading) return; t.loading = true;
  photoTex(t.name, 'd').then((tex) => { U.uTriD.value = tex; U.uTri.value.set(t.scale, t.mix ?? 1, t.gain ?? 1, 1); U.uTriSwap.value = t.swap ? 1 : 0; U.uTriTint.value = t.tint ?? 0;
    const u = m.userData.uDet.value; u.z *= 0.45; if (t.rough != null) m.roughness = t.rough; }).catch(() => {});
}
export function triPhoto(m, name, scale, o = {}) { m.userData.tri = { name, scale, ...o }; if (m.userData.triU) loadTri(m); return m; }
