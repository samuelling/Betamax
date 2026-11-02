// The cel look, after Ashland: every lit surface takes its light in four hard bands (the same ramp Ashland uses),
// heroes (guns, vehicles) get a constant-width inverted-hull outline in a darker tint of their own colour, and metal
// gets one hard highlight band instead of a PBR sheen.
import * as THREE from 'three';

// Ashland's ramp: u = dot(N, L) * 0.5 + 0.5 → 0.36 / 0.58 / 0.82 / 1.0
function makeGradientMap() {
  const n = 64, data = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const dot = ((i + 0.5) / n) * 2 - 1; data[i] = Math.round((dot < 0.0 ? 0.36 : dot < 0.2 ? 0.58 : dot < 0.52 ? 0.82 : 1.0) * 255); }
  const tex = new THREE.DataTexture(data, n, 1, THREE.RedFormat, THREE.UnsignedByteType);
  tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
  return tex;
}
export const gradientMap = makeGradientMap();
export const toonShared = { resY: { value: 720 }, outlinePx: { value: 1.6 } };

// a hard specular band and a thin rim, for metal and paint: view-space, so it reads the same at every time of day
const SPEC = /* glsl */`
  { vec3 nV = normalize(vNormal); vec3 hV = normalize(vec3(0.35, 0.55, 0.76));
    float sp = smoothstep(0.90, 0.915, dot(nV, hV)) * uSpec;
    float rim = smoothstep(0.62, 0.68, 1.0 - max(dot(nV, vec3(0.0, 0.0, 1.0)), 0.0)) * uRim;
    outgoingLight += vec3(sp) * 0.55 + outgoingLight * rim * 0.45; }
`;

const OFF = typeof location !== 'undefined' && /toon=0/.test(location.search);
// the gun's key light, in view space from up and to the left, in three hard bands; and the colour never quite black
const VMKEY = /* glsl */`
  { vec3 nV = normalize(vNormal); float k = dot(nV, normalize(vec3(-0.45, 0.62, 0.64)));
    float b = k < -0.1 ? 0.0 : k < 0.3 ? 0.32 : k < 0.68 ? 0.62 : 1.0;
    vec3 base = max(diffuseColor.rgb, vec3(0.04, 0.042, 0.05));
    outgoingLight = outgoingLight * 0.55 + base * (0.4 + b * 2.0); }
`;
const cache = new WeakMap();
const pairs = [];
// Standard / Lambert / Phong → Toon, carrying over everything the scene relies on (and the shader hooks)
export function toonOf(m) {
  if (OFF || !m || m.isMeshToonMaterial || m.userData.noToon || !(m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial)) return m;
  let t = cache.get(m); if (t) return t;
  t = new THREE.MeshToonMaterial({ gradientMap });
  for (const k of ['map', 'alphaMap', 'emissiveMap', 'aoMap', 'lightMap', 'vertexColors', 'transparent', 'opacity', 'side', 'alphaTest', 'emissiveIntensity', 'depthWrite', 'depthTest', 'fog', 'flatShading', 'blending', 'polygonOffset', 'polygonOffsetFactor', 'polygonOffsetUnits', 'toneMapped', 'visible', 'wireframe', 'name', 'shadowSide', 'colorWrite', 'premultipliedAlpha', 'alphaToCoverage']) if (m[k] !== undefined) t[k] = m[k];
  t.color = m.color; if (m.emissive) t.emissive = m.emissive;   // shared, so code that recolours the original still works
  t.userData = m.userData; if (m.defines) { const d = { ...m.defines }; delete d.STANDARD; delete d.PHYSICAL; delete d.LAMBERT; delete d.PHONG; if (Object.keys(d).length) t.defines = d; }
  const metal = m.metalness ?? 0, rough = m.roughness ?? 1;
  const spec = m.userData.spec ?? (metal > 0.3 ? 1 : rough < 0.4 ? 0.6 : 0), rim = m.userData.rim ?? 0;
  const vm = !!m.userData.vm;   // a gun: lit by its own studio key, so it reads in any light
  const prev = m.onBeforeCompile, key = m.customProgramCacheKey ? m.customProgramCacheKey() : '';
  const uSpec = { value: spec }, uRim = { value: rim };
  t.userData.uSpec = uSpec; t.userData.uRim = uRim;
  t.onBeforeCompile = (sh, r) => {
    if (prev && prev !== THREE.Material.prototype.onBeforeCompile) prev.call(m, sh, r);
    if (vm) sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', VMKEY + '#include <opaque_fragment>');
    if (spec > 0 || rim > 0) {
      sh.uniforms.uSpec = uSpec; sh.uniforms.uRim = uRim;
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uSpec, uRim;').replace('#include <opaque_fragment>', SPEC + '#include <opaque_fragment>');
    }
  };
  t.customProgramCacheKey = () => 'toon:' + key + (spec > 0 || rim > 0 ? ':s' : '') + (vm ? ':vm' : '');
  cache.set(m, t); pairs.push([m, t]);
  return t;
}
export function toonify(root) {
  root.traverse((o) => {
    if (!(o.isMesh || o.isInstancedMesh || o.isSkinnedMesh) || o.userData.outline) return;
    if (Array.isArray(o.material)) o.material = o.material.map(toonOf); else o.material = toonOf(o.material);
  });
}
// things that fade or toggle their original material at runtime
export function toonSync() { for (const [m, t] of pairs) { if (t.opacity !== m.opacity) t.opacity = m.opacity; if (t.transparent !== m.transparent) { t.transparent = m.transparent; t.needsUpdate = true; } t.visible = m.visible; } }

// ---------------- outlines: Ashland's inverted hull, constant width on screen ----------------
// smooth (position-welded) normals so the hull doesn't crack at the corners of boxes
export function smoothNormals(g) {
  if (g.attributes.aSmooth) return g;
  if (!g.attributes.normal) g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal, map = new Map(), out = new Float32Array(p.count * 3);
  const key = (i) => `${Math.round(p.getX(i) * 1000)},${Math.round(p.getY(i) * 1000)},${Math.round(p.getZ(i) * 1000)}`;
  for (let i = 0; i < p.count; i++) { const k = key(i); let a = map.get(k); if (!a) map.set(k, a = [0, 0, 0]); a[0] += n.getX(i); a[1] += n.getY(i); a[2] += n.getZ(i); }
  for (let i = 0; i < p.count; i++) { const a = map.get(key(i)), l = Math.hypot(a[0], a[1], a[2]) || 1; out[i * 3] = a[0] / l; out[i * 3 + 1] = a[1] / l; out[i * 3 + 2] = a[2] / l; }
  g.setAttribute('aSmooth', new THREE.BufferAttribute(out, 3));
  return g;
}
const OUTLINE_PROJECT = /* glsl */`
vec4 mvPosition = vec4( transformed, 1.0 );
vec3 sn = aSmooth;
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition; sn = mat3( instanceMatrix ) * sn;
#endif
mvPosition = modelViewMatrix * mvPosition;
sn = normalize( normalMatrix * sn );
float thick = uOutlinePx * ( -mvPosition.z ) * 2.0 / ( uResY * projectionMatrix[1][1] );
thick = min( thick, uMaxThick );
mvPosition.xyz += sn * thick;
gl_Position = projectionMatrix * mvPosition;
`;
const outlineMats = new Map();
export function outlineMaterial(color, maxThick = 0.12) {
  const k = color.getHexString() + maxThick; if (outlineMats.has(k)) return outlineMats.get(k);
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, fog: true });
  mat.userData.noToon = true;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uOutlinePx = toonShared.outlinePx; sh.uniforms.uResY = toonShared.resY; sh.uniforms.uMaxThick = { value: maxThick };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aSmooth; uniform float uOutlinePx, uResY, uMaxThick;').replace('#include <project_vertex>', OUTLINE_PROJECT);
  };
  mat.customProgramCacheKey = () => 'hull' + maxThick;
  outlineMats.set(k, mat);
  return mat;
}
// give every mesh under root a hull in a darker, plummier tint of its own colour (Ashland's ink)
const PLUM = new THREE.Color(0.34, 0.27, 0.31);
export function outline(root, { tint = null, maxThick = 0.12, minSize = 0 } = {}) {
  if (OFF) return;
  const add = [];
  root.traverse((o) => {
    if (!o.isMesh || o.userData.outline || o.userData.noOutline || !o.geometry || !o.geometry.attributes.position) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!m || m.transparent || m.isMeshBasicMaterial || m.isSpriteMaterial || m.isPointsMaterial || m.isShaderMaterial) return;
    if (minSize) { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); if (o.geometry.boundingSphere.radius < minSize) return; }
    smoothNormals(o.geometry);
    const base = tint || (m.color ? m.color.clone().multiply(PLUM).multiplyScalar(0.9) : PLUM);
    const h = o.isInstancedMesh ? new THREE.InstancedMesh(o.geometry, outlineMaterial(base, maxThick), o.count) : new THREE.Mesh(o.geometry, outlineMaterial(base, maxThick));
    if (o.isInstancedMesh) { h.instanceMatrix = o.instanceMatrix; h.count = o.count; h.frustumCulled = o.frustumCulled; }
    h.userData.outline = true; h.castShadow = false; h.receiveShadow = false; h.renderOrder = o.renderOrder; h.layers.mask = o.layers.mask;
    add.push([o, h]);
  });
  for (const [o, h] of add) o.add(h);   // as a child: it follows the mesh, its visibility and its transform
}

// ---------------- the season: it's the last day of October in New England ----------------
const AUT = {
  maple: ['#c63a1f', '#de5a22', '#ec8a2a', '#f2b236', '#b82e24', '#e2702c'],
  oak: ['#a5481f', '#c06a28', '#8e5a24', '#c7922e', '#7b6a2a', '#b4552a'],
  pine: ['#20482f', '#2a573a', '#1c3f2c', '#2f5e3e'],
  cedar: ['#1d3a28', '#22432e'],
};
export function autumn(kind, r, out) { const l = AUT[kind] || AUT.oak; out.set(l[Math.floor(r() * l.length) % l.length]); return out.multiplyScalar(0.86 + r() * 0.26); }
