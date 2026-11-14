// First-person weapons, modelled from reference at true scale (metres, -z toward the muzzle, bore on y = 0):
//  Defender: M7 (SIG MCX Spear), 6.8x51mm, 13" barrel, ~7" SLX suppressor (36" overall), 20-rd magazine,
//            folding stock, M-LOK handguard, XM157 fire-control optic (1-8x LPVO + rangefinder housing).
//  Invader:  IWI Tavor X95-pattern bullpup, 30-rd magazine behind the grip, full-length top rail, reflex sight.
// Everything is procedural: side profiles and cross-sections extruded with machined chamfers, lathed barrels,
// suppressors and optics, lofted grips. Static geometry is merged into one mesh per material; the parts the
// reload animates (magazine, charging handle, reticle) stay separate objects.
// Reloads follow real manual-of-arms: emergency (bolt locked back) vs tactical (retention) reloads.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './rng.js';
import { dressGun } from './gunassets.js';

// ---------------------------------------------------------------- level of detail
// 0: the gun in your hands (every chamfer, screw and slot). 1: a prop lying in the sand (no chamfers, no small parts).
let LOD = 0;
function withLod(l, fn) { const p = LOD; LOD = l; try { return fn(); } finally { LOD = p; } }

// ---------------------------------------------------------------- materials
function noiseTex(seed, base, amp, size = 128) {
  const r = mulberry32(seed); const d = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) { const v = Math.max(0, Math.min(255, (base + (r() - 0.5) * amp) * 255)); d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
  const t = new THREE.DataTexture(d, size, size); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  return t;
}
const ROUGH = noiseTex(3, 0.88, 0.24);
const sRGB = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);

// Edge wear, physically based path only: where the surface turns sharply (a chamfer or a tight radius — measured as
// radians of normal per metre of surface, so it does not depend on distance) the finish is rubbed through to what is
// underneath, in patches. Chained in front of whatever hook the material already has; the cel copy ignores it.
const WEAR_PARS = /* glsl */`
varying vec3 vGwP; uniform vec4 uGw; uniform vec3 uGwCol;
float gwH(vec3 p) { p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float gwN(vec3 x) { vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(gwH(i), gwH(i + vec3(1.0, 0.0, 0.0)), f.x), mix(gwH(i + vec3(0.0, 1.0, 0.0)), gwH(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(gwH(i + vec3(0.0, 0.0, 1.0)), gwH(i + vec3(1.0, 0.0, 1.0)), f.x), mix(gwH(i + vec3(0.0, 1.0, 1.0)), gwH(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z); }
`;
const WEAR_FRAG = /* glsl */`
#include <metalnessmap_fragment>
{ float gwC = length(fwidth(vNormal)) / max(length(fwidth(vGwP)), 1e-6);
  float gwM = gwN(vGwP * 150.0) * 0.55 + gwN(vGwP * 41.0) * 0.65;
  float gwW = smoothstep(uGw.x, uGw.x * 2.6, gwC) * smoothstep(0.38, 0.8, gwM) * uGw.y;
  diffuseColor.rgb = mix(diffuseColor.rgb, uGwCol, gwW);
  roughnessFactor = mix(roughnessFactor, uGw.z, gwW);
  metalnessFactor = mix(metalnessFactor, uGw.w, gwW); }
`;
function wearify(m, col, amount, rough, metal, curv = 420) {
  const uGw = { value: new THREE.Vector4(curv, amount, rough, metal) }, uGwCol = { value: col };
  m.userData.uGw = uGw;
  m.onBeforeCompile = (sh) => {
    if (!sh.fragmentShader.includes('#include <metalnessmap_fragment>') || !sh.vertexShader.includes('#include <begin_vertex>')) return;
    sh.uniforms.uGw = uGw; sh.uniforms.uGwCol = uGwCol;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGwP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvGwP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + WEAR_PARS).replace('#include <metalnessmap_fragment>', WEAR_FRAG);
  };
  m.customProgramCacheKey = () => 'gunwear';
  return m;
}
// det: [tiles per metre, bump height (m), albedo breakup, roughness breakup, [anisotropy]] for the photoreal detail layer
function gm(color, roughness, metalness, det, wear) {
  const m = new THREE.MeshStandardMaterial({ color, roughness, metalness, roughnessMap: ROUGH });
  if (det) m.userData.det4 = det;
  if (wear) wearify(m, ...wear);
  return m;
}
const BARE_AL = sRGB(0.62, 0.61, 0.58), BARE_FE = sRGB(0.5, 0.5, 0.51);
const mats = {
  // coyote hard-coat anodising / cerakote over aluminium: the M7's receivers and handguard
  cerakote: gm(sRGB(0.355, 0.292, 0.205), 0.56, 0.38, [20, 0.0006, 0.16, 0.26], [BARE_AL, 0.6, 0.34, 0.95]),
  // high-temperature coating on the suppressor and steel parts of the same family: greyer, flatter
  ceraSteel: gm(sRGB(0.285, 0.25, 0.195), 0.66, 0.5, [15, 0.001, 0.22, 0.3], [BARE_FE, 0.5, 0.4, 1]),
  // black type-III anodised aluminium: rails, mounts, optic bodies
  anod: gm(sRGB(0.046, 0.046, 0.05), 0.44, 0.72, [20, 0.0005, 0.14, 0.3], [BARE_AL, 0.55, 0.32, 0.95]),
  // nitrided / phosphated steel: barrels, pins, controls
  steel: gm(sRGB(0.105, 0.105, 0.112), 0.4, 0.9, [14, 0.0011, 0.2, 0.34], [BARE_FE, 0.6, 0.28, 1]),
  // bright machined steel: bolt carriers, feed lips, springs
  bright: gm(sRGB(0.46, 0.46, 0.47), 0.3, 1, [16, 0.0006, 0.12, 0.3]),
  // glass-filled polymer, black; and the stippled grip version
  poly: gm(sRGB(0.058, 0.058, 0.06), 0.7, 0.0, [16, 0.0012, 0.2, 0.2], [sRGB(0.13, 0.13, 0.13), 0.4, 0.45, 0]),
  polyTex: gm(sRGB(0.052, 0.052, 0.054), 0.86, 0.0, [19, 0.0032, 0.24, 0.26]),
  polyFde: gm(sRGB(0.35, 0.29, 0.205), 0.72, 0.0, [16, 0.0012, 0.2, 0.2], [sRGB(0.44, 0.38, 0.29), 0.4, 0.5, 0]),
  polyFdeTex: gm(sRGB(0.33, 0.275, 0.195), 0.88, 0.0, [19, 0.0032, 0.24, 0.26]),
  polyInv: gm(sRGB(0.125, 0.14, 0.125), 0.7, 0.0, [16, 0.0013, 0.2, 0.2], [sRGB(0.2, 0.22, 0.2), 0.4, 0.45, 0]),
  polyInvTex: gm(sRGB(0.115, 0.13, 0.115), 0.88, 0.0, [19, 0.0032, 0.24, 0.26]),
  smoke: gm(sRGB(0.085, 0.078, 0.07), 0.38, 0.0, [14, 0.0005, 0.12, 0.2]),             // translucent-smoke magazine polymer
  rubber: gm(sRGB(0.03, 0.03, 0.032), 0.95, 0.0, [17, 0.002, 0.16, 0.1]),
  hole: new THREE.MeshStandardMaterial({ color: sRGB(0.006, 0.006, 0.007), roughness: 1, metalness: 0 }),   // bores, ports, the inside of a tube
  lens: new THREE.MeshPhysicalMaterial({ color: 0x1c2a3a, roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.3, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 2, iridescence: 1, iridescenceIOR: 1.6, depthWrite: false }),
  ocular: new THREE.MeshPhysicalMaterial({ color: 0x1a2430, roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.1, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.5, iridescence: 1, iridescenceIOR: 1.5, depthWrite: false }),
  brass: gm(sRGB(0.72, 0.56, 0.27), 0.32, 1, [18, 0.0004, 0.1, 0.25]),
  copper: gm(sRGB(0.6, 0.35, 0.2), 0.36, 1, [18, 0.0004, 0.1, 0.25]),
  red: new THREE.MeshStandardMaterial({ color: sRGB(0.7, 0.05, 0.03), roughness: 0.5, emissive: sRGB(0.25, 0.01, 0.0) }),
  white: new THREE.MeshStandardMaterial({ color: sRGB(0.75, 0.75, 0.72), roughness: 0.6 }),
};
mats.hole.userData.noDet = true;
mats.lens.iridescenceThicknessMinimum = 180; mats.lens.iridescenceThicknessMaximum = 420; mats.ocular.iridescenceThicknessMinimum = 200; mats.ocular.iridescenceThicknessMaximum = 380;

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
const reticleMat = (k = 2.2, opacity = 1) => new THREE.MeshBasicMaterial({ map: reticleTex(), transparent: true, depthWrite: false, toneMapped: false, color: new THREE.Color(k, k, k), opacity });

// legacy helpers (kept for anything that still builds from loose parts)
const add = (g, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m; };
const rb = (w, h, d, r = 0.004) => new RoundedBoxGeometry(w, h, d, 2, r);
const cylZ = (r0, r1, l, s = 16, open = false) => new THREE.CylinderGeometry(r0, r1, l, s, 1, open).rotateX(Math.PI / 2);

// ---------------------------------------------------------------- geometry kit
// Every helper returns a non-indexed BufferGeometry with position + normal only.
const TAU = Math.PI * 2, HP = Math.PI / 2;
function plain(g) { const o = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(o.attributes)) if (k !== 'position' && k !== 'normal') o.deleteAttribute(k); o.clearGroups(); return o; }
function fromTris(p, n) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(p), 3)); if (n) g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n), 3)); return g; }

// area-weighted normals with a crease angle: big faces stay flat, a chamfer between them shades as a rounded edge
function wnorm(g, cr = 0.64) {
  g = plain(g);
  const p = g.attributes.position.array, nf = p.length / 9, fn = new Float32Array(nf * 3), fl = new Float32Array(nf), map = new Map(), keys = new Array(nf * 3);
  for (let f = 0; f < nf; f++) {
    const o = f * 9, ax = p[o + 3] - p[o], ay = p[o + 4] - p[o + 1], az = p[o + 5] - p[o + 2], bx = p[o + 6] - p[o], by = p[o + 7] - p[o + 1], bz = p[o + 8] - p[o + 2];
    const x = ay * bz - az * by, y = az * bx - ax * bz, z = ax * by - ay * bx;
    fn[f * 3] = x; fn[f * 3 + 1] = y; fn[f * 3 + 2] = z; fl[f] = Math.hypot(x, y, z);
    for (let v = 0; v < 3; v++) { const k = Math.round(p[o + v * 3] * 1e5) + '_' + Math.round(p[o + v * 3 + 1] * 1e5) + '_' + Math.round(p[o + v * 3 + 2] * 1e5); keys[f * 3 + v] = k; let l = map.get(k); if (!l) map.set(k, l = []); l.push(f); }
  }
  const n = new Float32Array(p.length);
  for (let f = 0; f < nf; f++) {
    const fx = fn[f * 3], fy = fn[f * 3 + 1], fz = fn[f * 3 + 2], l0 = fl[f];
    for (let v = 0; v < 3; v++) {
      let x = 0, y = 0, z = 0;
      if (l0 > 1e-14) for (const q of map.get(keys[f * 3 + v])) { const lq = fl[q]; if (lq < 1e-14) continue; if (q === f || (fx * fn[q * 3] + fy * fn[q * 3 + 1] + fz * fn[q * 3 + 2]) > cr * l0 * lq) { x += fn[q * 3]; y += fn[q * 3 + 1]; z += fn[q * 3 + 2]; } }
      let l = Math.hypot(x, y, z); if (l < 1e-14) { x = 0; y = 1; z = 0; l = 1; }
      const o = (f * 3 + v) * 3; n[o] = x / l; n[o + 1] = y / l; n[o + 2] = z / l;
    }
  }
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  return g;
}

// box with chamfered edges (44 triangles); the chamfers interpolate between the face normals, so they shade round
function cbox(w, h, d, b = 0.0008) {
  b = Math.min(b, w * 0.45, h * 0.45, d * 0.45);
  const hs = [w / 2, h / 2, d / 2], P = [], N = [];
  const vert = (s, a) => { const q = [0, 0, 0]; for (let i = 0; i < 3; i++) q[i] = s[i] * (i === a ? hs[i] : hs[i] - b); const nn = [0, 0, 0]; nn[a] = s[a]; return [q, nn]; };
  const tri = (A, B, C) => {
    const [a, na] = A, [bb, nb] = B, [c, nc] = C;
    const ux = bb[0] - a[0], uy = bb[1] - a[1], uz = bb[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    const out = cx * (na[0] + nb[0] + nc[0]) + cy * (na[1] + nb[1] + nc[1]) + cz * (na[2] + nb[2] + nc[2]);
    for (const [q, nn] of out >= 0 ? [A, B, C] : [A, C, B]) { P.push(q[0], q[1], q[2]); N.push(nn[0], nn[1], nn[2]); }
  };
  const quad = (A, B, C, D) => { tri(A, B, C); tri(A, C, D); };
  for (let a = 0; a < 3; a++) { const i = (a + 1) % 3, j = (a + 2) % 3;
    for (const sa of [-1, 1]) { const c = (si, sj) => { const s = [0, 0, 0]; s[a] = sa; s[i] = si; s[j] = sj; return vert(s, a); }; quad(c(-1, -1), c(1, -1), c(1, 1), c(-1, 1)); }
    // edges running along axis a
    for (const si of [-1, 1]) for (const sj of [-1, 1]) { const c = (sa, ax) => { const s = [0, 0, 0]; s[a] = sa; s[i] = si; s[j] = sj; return vert(s, ax); }; quad(c(-1, i), c(1, i), c(1, j), c(-1, j)); }
  }
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) { const s = [sx, sy, sz]; tri(vert(s, 0), vert(s, 1), vert(s, 2)); }
  return fromTris(P, N);
}

// 2D outline helpers. Points are [u, v] (an optional third number is that corner's own fillet radius).
function fillet(pts, R = 0.002, n = 3) {
  const out = [], N = pts.length;
  for (let i = 0; i < N; i++) {
    const p = pts[i], a = pts[(i + N - 1) % N], b = pts[(i + 1) % N], r = p[2] ?? R;
    if (!(r > 0) || (LOD && n > 1 && r < 0.004)) { out.push([p[0], p[1]]); continue; }
    const ax = a[0] - p[0], ay = a[1] - p[1], bx = b[0] - p[0], by = b[1] - p[1], la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    const d = Math.min(r, la * 0.45, lb * 0.45), nn = LOD ? Math.min(n, 2) : n;
    const p0 = [p[0] + ax / la * d, p[1] + ay / la * d], p1 = [p[0] + bx / lb * d, p[1] + by / lb * d];
    for (let k = 0; k <= nn; k++) { const t = k / nn, u = 1 - t; out.push([u * u * p0[0] + 2 * u * t * p[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * p[1] + t * t * p1[1]]); }
  }
  return out;
}
const circ = (cx, cy, r, n = 12) => Array.from({ length: n }, (_, i) => [cx + Math.cos(i / n * TAU) * r, cy + Math.sin(i / n * TAU) * r]);
const rrect = (cx, cy, w, h, r = 0.002, n = 2) => fillet([[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]], r, n);
const slotP = (cx, cy, w, h) => rrect(cx, cy, w, h, Math.min(w, h) * 0.5, 3);   // an obround
// a strip of constant thickness along an open path
function ribbon(path, t) {
  const L = [], R = [], n = path.length;
  for (let i = 0; i < n; i++) {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l * t / 2, ny = dx / l * t / 2;
    L.push([path[i][0] + nx, path[i][1] + ny]); R.unshift([path[i][0] - nx, path[i][1] - ny]);
  }
  return L.concat(R);
}
const mirrorPts = (half) => half.concat(half.slice().reverse().map((p) => [-p[0], p[1]]));   // half outline on +u, mirrored to -u

// Extrude an outline to a total width w, chamfered by b on both faces. axis 'x': outline is [z, y] (a side profile);
// 'z': outline is [x, y] (a cross-section); 'y': outline is [x, z] (a plan view). Centred on the extrusion axis.
function ext(pts, w, o = {}) {
  let b = LOD ? 0 : (o.b ?? 0.0006); b = Math.min(b, w * 0.4);
  const clean = (l) => { const out = []; for (const p of l) { const q = out[out.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6) out.push(p); } const f = out[0], e = out[out.length - 1]; if (out.length > 1 && Math.hypot(f[0] - e[0], f[1] - e[1]) < 1e-6) out.pop(); return out.map((p) => new THREE.Vector2(p[0], p[1])); };
  const sh = new THREE.Shape(clean(pts));
  if (o.holes && !(LOD && !o.keep)) for (const h of o.holes) sh.holes.push(new THREE.Path(clean(h)));
  let g = new THREE.ExtrudeGeometry(sh, b > 0 ? { depth: w - 2 * b, steps: 1, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 1 } : { depth: w, steps: 1, bevelEnabled: false });
  g.translate(0, 0, -(w - 2 * b) / 2);
  const ax = o.axis || 'x';
  if (ax === 'x') g.rotateY(-HP); else if (ax === 'y') g.rotateX(HP);
  return wnorm(g, o.cr ?? 0.64);
}

// Lathe about the z axis. prof: [z, r] points drawn so the surface faces outward as you go (rear -> front along the
// outside; back again along the inside for a hollow part). Chamfers shade round, steps stay crisp.
function lathe(prof, segs = 24, cr = 0.64, asDrawn = false) {
  if (LOD) segs = Math.max(6, Math.round(segs * 0.5));
  if (!asDrawn) { let v = 0; for (let k = 0; k < prof.length - 1; k++) { const a = prof[k], b = prof[k + 1]; v += (a[0] - b[0]) * (a[1] * a[1] + a[1] * b[1] + b[1] * b[1]); } if (v < 0) prof = prof.slice().reverse(); }   // drawn the other way round: turn it
  const P = [], N = [], m = prof.length - 1, sn = [], sl = [];
  for (let k = 0; k < m; k++) { const dz = prof[k + 1][0] - prof[k][0], dr = prof[k + 1][1] - prof[k][1], l = Math.hypot(dz, dr) || 1e-12; sn.push([dr / l, -dz / l]); sl.push(l); }   // [nz, nr]
  const closed = Math.hypot(prof[0][0] - prof[m][0], prof[0][1] - prof[m][1]) < 1e-7;
  const vn = (k, end) => {   // normal of segment k at its start (0) or end (1) vertex, blended with the neighbour across a soft edge
    let j = end ? k + 1 : k - 1; if (closed) j = (j + m) % m;
    let nz = sn[k][0] * sl[k], nr = sn[k][1] * sl[k];
    if (j >= 0 && j < m && sn[k][0] * sn[j][0] + sn[k][1] * sn[j][1] > cr) { nz += sn[j][0] * sl[j]; nr += sn[j][1] * sl[j]; }
    const l = Math.hypot(nz, nr) || 1; return [nz / l, nr / l];
  };
  for (let k = 0; k < m; k++) {
    const [z0, r0] = prof[k], [z1, r1] = prof[k + 1]; if (sl[k] < 1e-9 || (r0 < 1e-9 && r1 < 1e-9)) continue;
    const n0 = vn(k, 0), n1 = vn(k, 1);
    for (let s = 0; s < segs; s++) {
      const a0 = s / segs * TAU, a1 = (s + 1) / segs * TAU, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const A = [r0 * c0, r0 * s0, z0, n0[1] * c0, n0[1] * s0, n0[0]], B = [r0 * c1, r0 * s1, z0, n0[1] * c1, n0[1] * s1, n0[0]];
      const C = [r1 * c1, r1 * s1, z1, n1[1] * c1, n1[1] * s1, n1[0]], D = [r1 * c0, r1 * s0, z1, n1[1] * c0, n1[1] * s0, n1[0]];
      const tri = (a, b, c) => {
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx; if (cx * cx + cy * cy + cz * cz < 1e-24) return;
        const am = (a0 + a1) / 2, out = cx * sn[k][1] * Math.cos(am) + cy * sn[k][1] * Math.sin(am) + cz * sn[k][0];
        for (const q of out >= 0 ? [a, b, c] : [a, c, b]) { P.push(q[0], q[1], q[2]); N.push(q[3], q[4], q[5]); }
      };
      tri(A, B, C); tri(A, C, D);
    }
  }
  return fromTris(P, N);
}
// solid cylinder along z, centred, with chamfered rims
const cyl = (r, len, segs = 16, ch = 0.0004) => { ch = Math.min(ch, r * 0.4, len * 0.4); return lathe([[len / 2, 0], [len / 2, r - ch], [len / 2 - ch, r], [-len / 2 + ch, r], [-len / 2, r - ch], [-len / 2, 0]], segs); };
// tube along z, centred: outer radius r, bore ri
const pipe = (r, ri, len, segs = 16, ch = 0.0004) => { ch = Math.min(ch, (r - ri) * 0.4, len * 0.4); return lathe([[len / 2, ri], [len / 2, r - ch], [len / 2 - ch, r], [-len / 2 + ch, r], [-len / 2, r - ch], [-len / 2, ri], [len / 2, ri]], segs); };
// a socket-head screw, head toward +z, seated at z = 0
const screw = (r = 0.0022, h = 0.0012) => lathe([[-0.0005, r], [h * 0.6, r], [h, r * 0.8], [h, r * 0.55], [h * 0.25, r * 0.48], [h * 0.25, 0]], 8);
// a blind hole seen from the front (-z): mouth at z = 0, depth d back along +z
const bore = (r, d, segs = 10) => lathe([[0, r + 0.0003], [0, r], [d, r], [d, 0]], segs, 0.64, true);
// knurled / fluted knob along z: a toothed outline extruded
function knob(r, len, teeth = 18, depth = 0.0006, b = 0.0005, bore = 0) {
  if (LOD) return bore ? pipe(r, bore, len, 10, 0) : cyl(r, len, 10, 0);
  const pts = []; for (let i = 0; i < teeth * 2; i++) { const a = i / (teeth * 2) * TAU, rr = i % 2 ? r - depth : r; pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
  return ext(pts, len, { axis: 'z', b, cr: 0.3, holes: bore ? [circ(0, 0, bore, Math.max(12, teeth))] : null });
}
// loft through closed rings (each an array of [x, y, z], same count), capped at both ends
function loft(rings, cr = 0.5) {
  const P = [], n = rings[0].length;
  const push = (a, b, c) => P.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < n; j++) { const a = rings[i][j], b = rings[i][(j + 1) % n], c = rings[i + 1][(j + 1) % n], d = rings[i + 1][j]; push(a, b, c); push(a, c, d); }
  const cap = (r, flip) => { const c = [0, 0, 0]; for (const q of r) { c[0] += q[0] / n; c[1] += q[1] / n; c[2] += q[2] / n; } for (let j = 0; j < n; j++) flip ? push(c, r[(j + 1) % n], r[j]) : push(c, r[j], r[(j + 1) % n]); };
  cap(rings[0], true); cap(rings[rings.length - 1], false);
  let vol = 0; for (let i = 0; i < P.length; i += 9) vol += P[i] * (P[i + 4] * P[i + 8] - P[i + 5] * P[i + 7]) - P[i + 1] * (P[i + 3] * P[i + 8] - P[i + 5] * P[i + 6]) + P[i + 2] * (P[i + 3] * P[i + 7] - P[i + 4] * P[i + 6]);
  if (vol < 0) for (let i = 0; i < P.length; i += 9) for (let k = 0; k < 3; k++) { const t = P[i + 3 + k]; P[i + 3 + k] = P[i + 6 + k]; P[i + 6 + k] = t; }
  return wnorm(fromTris(P), cr);
}
// superellipse ring in the local xz plane (pw: 2 = ellipse, higher = squarer), placed by a matrix
function ring(m4, rx, rz, n = 16, pw = 2.6, ox = 0, oz = 0) {
  const out = [], v = new THREE.Vector3();
  for (let i = 0; i < n; i++) { const a = i / n * TAU, c = Math.cos(a), s = Math.sin(a); v.set(ox + Math.sign(c) * Math.pow(Math.abs(c), 2 / pw) * rx, 0, oz + Math.sign(s) * Math.pow(Math.abs(s), 2 / pw) * rz).applyMatrix4(m4); out.push([v.x, v.y, v.z]); }
  return out;
}
// a wire / cable / sling loop through points
function wire(pts, r, segs = 6, closed = false) {
  const c = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])), closed);
  return plain(new THREE.TubeGeometry(c, pts.length * (LOD ? 2 : 5), r, LOD ? 4 : segs, closed));
}
function mirX(g) {
  g = g.clone(); const p = g.attributes.position.array, n = g.attributes.normal.array;
  for (let i = 0; i < p.length; i += 9) for (const a of [p, n]) { a[i] = -a[i]; a[i + 3] = -a[i + 3]; a[i + 6] = -a[i + 6]; for (let k = 0; k < 3; k++) { const t = a[i + 3 + k]; a[i + 3 + k] = a[i + 6 + k]; a[i + 6 + k] = t; } }
  return g;
}
// planar UVs by dominant axis (25 tiles per metre), so tiling maps sit right on merged geometry
function boxUV(g, s = 25) {
  const p = g.attributes.position.array, n = g.attributes.normal.array, uv = new Float32Array(p.length / 3 * 2);
  for (let i = 0, j = 0; i < p.length; i += 3, j += 2) { const ax = Math.abs(n[i]), ay = Math.abs(n[i + 1]), az = Math.abs(n[i + 2]);
    if (ax >= ay && ax >= az) { uv[j] = p[i + 2] * s; uv[j + 1] = p[i + 1] * s; } else if (ay >= az) { uv[j] = p[i] * s; uv[j + 1] = p[i + 2] * s; } else { uv[j] = p[i] * s; uv[j + 1] = p[i + 1] * s; } }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g;
}

// Collects transformed geometry per material; build() turns each material's pile into one mesh.
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);
class Kit {
  constructor() { this.by = new Map(); }
  put(mat, g) { let l = this.by.get(mat); if (!l) this.by.set(mat, l = []); l.push(g); return this; }
  add(mat, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const g = geo.index ? plain(geo) : plain(geo.clone());
    if (!g.attributes.normal) g.computeVertexNormals();
    g.applyMatrix4(_m4.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _one));
    return this.put(mat, g);
  }
  // the part and its mirror image across the gun's centre plane
  mir(mat, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    this.add(mat, geo, x, y, z, rx, ry, rz); const l = this.by.get(mat); return this.put(mat, mirX(l[l.length - 1]));
  }
  // fine detail: only on the gun in your hands
  det(...a) { return LOD ? this : this.add(...a); }
  dmir(...a) { return LOD ? this : this.mir(...a); }
  build(parent = new THREE.Group()) {
    for (const [mat, l] of this.by) {
      const g = mergeVertices(boxUV(mergeGeometries(l)), 1e-5);
      parent.add(new THREE.Mesh(g, mat));
    }
    this.by.clear();
    return parent;
  }
}

// ---------------------------------------------------------------- shared parts
// MIL-STD-1913 rail: 10 mm pitch, 5.2 mm recoil grooves, 21.2 mm across the dovetail. yTop is the top of the lands,
// zRear the rear end; the neck under the dovetail runs down neckH (and may stop short: neck = [zRear, zFront]).
const RAIL_LAND = [[-0.0078, 0], [0.0078, 0], [0.0106, -0.0028], [0.0106, -0.003], [-0.0106, -0.003], [-0.0106, -0.0028]];
const RAIL_BED = [[-0.0106, -0.003], [0.0106, -0.003], [0.0106, -0.0032], [0.0081, -0.0057], [-0.0081, -0.0057], [-0.0106, -0.0032]];
function picRail(K, mat, yTop, zRear, len, neckH = 0.004, neck = null) {
  const n = Math.floor((len + 0.0002) / 0.01), land = ext(RAIL_LAND, 0.0048, { axis: 'z', b: 0.0003 });
  for (let i = 0; i < n; i++) K.add(mat, land, 0, yTop, zRear - 0.005 - i * 0.01);
  K.add(mat, ext(RAIL_BED, len, { axis: 'z', b: 0.0003 }), 0, yTop, zRear - len / 2);
  if (neckH > 0) { const [a, b] = neck || [zRear, zRear - len]; K.add(mat, cbox(0.0158, neckH + 0.0006, a - b, 0.0004), 0, yTop - 0.0057 - neckH / 2 + 0.0003, (a + b) / 2); }
}
// One flat of a free-float handguard: the outer face runs from a to b in the cross-section ([x, y]), z from zR back to
// zF front, wall t. slots: [[zCentre, length, width], ...] cut right through, so the barrel shows inside.
function facet(K, mat, a, b, zR, zF, t, slots = [], cx = 0, cy = 0.003, bev = 0.0004) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  let nx = (b[1] - a[1]) / L, ny = -(b[0] - a[0]) / L; if (nx * (mx - cx) + ny * (my - cy) < 0) { nx = -nx; ny = -ny; }
  const g = ext([[-L / 2, zF], [L / 2, zF], [L / 2, zR], [-L / 2, zR]], t, { axis: 'y', b: bev, holes: slots.map(([zc, l, w]) => slotP(0, zc, w, l)) });
  g.translate(0, -t / 2, 0);
  K.add(mat, g, mx, my, 0, 0, 0, Math.atan2(ny, nx) - HP);
}
// evenly pitched slot row between zR and zF
const slotRow = (zR, zF, len = 0.032, wid = 0.007, pitch = 0.04, lead = 0.026) => { const out = []; for (let z = zR - lead - len / 2; z - len / 2 > zF + 0.012; z -= pitch) out.push([z, len, wid]); return out; };
// a ring matching a handguard cross-section (front cap / rear collar)
function sectRing(K, mat, sect, z, len, wall = 0.0035, cx = 0, cy = 0.003) {
  K.add(mat, ext(sect, len, { axis: 'z', b: 0.0005, keep: true, holes: [sect.map(([x, y]) => { const dx = x - cx, dy = y - cy, l = Math.hypot(dx, dy); return [x - dx / l * wall * 1.25, y - dy / l * wall * 1.25]; })] }), 0, 0, z);
}
// Pistol grip, lofted: raked back, palm swell, flared base. top/bottom are the centres of the first and last sections.
function pistolGrip(K, mat, o = {}) {
  const { y0 = -0.044, z0 = 0.036, y1 = -0.153, z1 = 0.073, w = 0.0146, d = 0.0205, n = 16, pw = 2.7, capMat = null } = o;
  const rake = Math.atan2(z1 - z0, y0 - y1), rings = [], m = new THREE.Matrix4(), steps = LOD ? 4 : 8;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, sw = Math.sin(Math.PI * Math.min(1, t * 1.15));
    m.makeRotationX(-rake).setPosition(0, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t);
    rings.push(ring(m, w + 0.0019 * sw + (t > 0.9 ? 0.0012 : 0), d + 0.0012 * sw + (t > 0.9 ? 0.0015 : 0), LOD ? 8 : n, pw, 0, 0.0028 * sw));
  }
  K.add(mat, loft(rings, 0.4));
  if (capMat) { m.makeRotationX(-rake).setPosition(0, y1 - 0.0016, z1 + 0.0005); K.add(capMat, loft([ring(m, w + 0.0014, d + 0.0018, 12, 2.7), ring(m.clone().setPosition(0, y1 - 0.0052, z1 + 0.0017), w + 0.0006, d + 0.001, 12, 2.7)], 0.4)); K.det(mats.steel, screw(0.0028, 0.001), 0, y1 - 0.0052, z1 + 0.002, HP + rake); }
}
// curved trigger blade and its pin; z is the trigger's fore-aft position
function triggerBlade(K, z = 0, y = 0, mat = mats.steel) {
  const p = [[-0.0025, -0.05], [-0.0042, -0.058], [-0.0038, -0.066], [-0.0012, -0.0735], [0.0022, -0.0765], [0.0038, -0.075], [0.0018, -0.07], [0.0006, -0.064], [0.0006, -0.058], [0.0032, -0.05]];
  K.add(mat, ext(fillet(p.map(([a, b]) => [a + z, b + y]), 0.0012, 2), 0.0068, { b: 0.0012 }));
}
// trigger guard bow, a strip bent under the trigger
function triggerGuard(K, mat, z = 0, y = 0, wid = 0.013, drop = 0.083) {
  const path = [[-0.0315, -0.052], [-0.0325, -drop + 0.012], [-0.0285, -drop + 0.003], [-0.02, -drop], [0.012, -drop - 0.0005], [0.024, -drop + 0.002], [0.0305, -drop + 0.012], [0.033, -0.06]];
  K.add(mat, ext(ribbon(path.map(([a, b]) => [a + z, b + y]), 0.0036), wid, { b: 0.0009 }));
}
// a cartridge lying along -z with its head at the origin: [case, bullet]
function cartridge(len = 0.051, r = 0.006, neck = 0.0039, bl = 0.019, sh = 0.78) {
  const s = LOD ? 6 : 10;
  return [lathe([[0, 0], [0, r * 0.88], [-0.0008, r * 0.92], [-0.0012, r * 0.78], [-0.002, r * 0.78], [-0.0028, r], [-len * sh, r * 0.97], [-len * (sh + 0.07), neck], [-len, neck]], s),
    lathe([[-len + 0.001, neck * 0.96], [-len - bl * 0.3, neck * 0.9], [-len - bl * 0.7, neck * 0.55], [-len - bl * 0.95, neck * 0.2], [-len - bl, 0]], s, 0.3)];
}
// push-button QD sling socket facing -x (left) or +x
function qdSocket(K, x, y, z, side = -1, mat = mats.steel) {
  K.det(mat, pipe(0.0062, 0.0042, 0.0026, 12, 0.0005), x, y, z, 0, side * HP);
  K.det(mats.hole, cyl(0.0042, 0.0006, 10, 0), x - side * 0.0008, y, z, 0, side * HP);
}
// folded back-up sight sitting on the rail (front: post housing; rear: aperture housing)
function buis(K, mat, yRail, z, front) {
  K.add(mat, cbox(0.0235, 0.0062, 0.026, 0.0008), 0, yRail + 0.0006, z);
  K.add(mat, cbox(0.0135, 0.0052, 0.036, 0.001), 0, yRail + 0.0058, z + (front ? -0.006 : 0.006));
  K.det(mat, cbox(0.017, 0.0042, 0.009, 0.0008), 0, yRail + 0.0056, z + (front ? -0.021 : 0.021));
  K.det(mats.steel, cyl(0.0034, 0.0265, 8), 0, yRail + 0.0022, z + (front ? 0.008 : -0.008), 0, HP);
  K.det(mats.steel, screw(0.0026, 0.0012), -0.0118, yRail + 0.0002, z, 0, -HP);
  K.det(mats.steel, knob(0.0036, 0.003, 8, 0.0005, 0.0003), 0.0132, yRail + 0.0022, z + (front ? 0.008 : -0.008), 0, HP);
}
// hex nut / bolt head along z
const hex = (r, len, b = 0.0004) => ext(circ(0, 0, r, 6), len, { axis: 'z', b });
// multi-flow suppressor (SLX pattern): rear lock collar with wrench flats, welded body, vented front cap
function suppressor(K, mat, zR, len, r = 0.0222, y = 0, boreR = 0.0042) {
  const zF = zR - len;
  K.add(mat, lathe([[zR + 0.002, 0.0105], [zR + 0.002, 0.0155], [zR, 0.0172], [zR - 0.013, 0.0172], [zR - 0.0155, r - 0.0012], [zR - 0.017, r],
    [zR - 0.0485, r], [zR - 0.049, r - 0.0007], [zR - 0.0495, r], [zF + 0.0305, r], [zF + 0.03, r - 0.0007], [zF + 0.0295, r],
    [zF + 0.003, r], [zF + 0.0008, r - 0.0018], [zF, r - 0.0035], [zF + 0.0016, r - 0.0048], [zF + 0.0016, boreR + 0.0022], [zF + 0.0006, boreR + 0.0012], [zF + 0.0006, boreR]], 28), 0, y, 0);
  K.add(mat, ext(circ(0, 0, 0.0196, 8), 0.0085, { axis: 'z', b: 0.0006, keep: true, holes: [circ(0, 0, 0.012, 12)] }), 0, y, zR - 0.0062, 0, 0, Math.PI / 8);
  K.det(mat, knob(r - 0.0004, 0.005, 36, 0.0005, 0.0004, 0.014), 0, y, zR - 0.021);
  K.add(mats.hole, bore(boreR, 0.05, 12), 0, y, zF + 0.0005);
  for (let i = 0; i < 10; i++) { const a = (i + 0.5) / 10 * TAU; K.det(mats.hole, bore(0.0021, 0.006, 6), Math.cos(a) * 0.0122, y + Math.sin(a) * 0.0122, zF + 0.0015); }
}

// ---------------------------------------------------------------- magazines
// Built once, cloned per use (the gun's own, the one in the hand, the one dropped in the sand).
const magProto = new Map();
function magOf(key, make) { return () => { if (!magProto.has(key)) magProto.set(key, withLod(0, make)); return magProto.get(key).clone(); }; }

// SR-25 pattern 20-round 6.8x51 magazine: smoke polymer body with steel feed lips, the top round showing
const m7Magazine = magOf('m7', () => {
  const g = new THREE.Group(), K = new Kit(), body = mats.smoke;
  K.add(body, ext(fillet([[-0.0352, 0.003], [0.0352, 0.003], [0.0352, -0.111], [-0.0352, -0.111]], 0.0025, 2), 0.0268, { b: 0.0014 }));
  for (let k = 0; k < 5; k++) K.add(body, cbox(0.0286, 0.0032, 0.058, 0.0009), 0, -0.04 - k * 0.0145, -0.002);            // side ribs
  K.add(body, cbox(0.0286, 0.074, 0.004, 0.0009), 0, -0.07, -0.031); K.add(body, cbox(0.0286, 0.074, 0.004, 0.0009), 0, -0.07, 0.027);
  K.add(body, cbox(0.012, 0.078, 0.003, 0.0008), 0, -0.068, 0.0355);                                                       // rear spine
  K.add(body, cbox(0.008, 0.05, 0.0024, 0.0006), 0, -0.07, -0.0358);
  K.add(mats.poly, ext(fillet([[-0.0385, -0.108], [0.0375, -0.108], [0.0385, -0.118], [-0.039, -0.1185]], 0.003, 2), 0.0312, { b: 0.0018 }));   // floorplate
  K.add(mats.poly, cbox(0.012, 0.0022, 0.012, 0.0006), 0, -0.1195, 0.012);
  // feed lips and the rounds under them
  const lip = ext([[0.0134, -0.016], [0.0134, 0.004], [0.0112, 0.0082], [0.0068, 0.0086], [0.0068, 0.0072], [0.0102, 0.0068], [0.012, 0.0036], [0.012, -0.016]], 0.064, { axis: 'z', b: 0.0003 });
  K.mir(mats.bright, lip, 0, 0, 0.003);
  K.add(mats.bright, cbox(0.0262, 0.019, 0.0012, 0.0003), 0, -0.006, 0.0352);
  const [cs, bl] = cartridge(0.051, 0.0059, 0.0041, 0.02);
  K.add(mats.brass, cs, 0.0026, 0.0036, 0.0335).add(mats.copper, bl, 0.0026, 0.0036, 0.0335);
  K.add(mats.brass, cs, -0.0032, -0.0052, 0.0335).add(mats.copper, bl, -0.0032, -0.0052, 0.0335);
  const inner = K.build(); inner.rotation.x = -0.08; g.add(inner);
  return g;
});

// ---------------------------------------------------------------- M7 / XM157
export function buildM7(o = {}) { return withLod(o.lod | 0, () => {
  const g = new THREE.Group(), K = new Kit(), C = mats.cerakote, A = mats.anod, S = mats.steel, P = mats.polyFde;
  // ---- upper receiver: a core with machined side plates (pockets, the left charging-handle track, the ejection port)
  K.add(C, ext([[0.094, -0.024], [0.094, 0.031], [0.074, 0.031], [0.074, 0.036], [-0.128, 0.036], [-0.128, -0.019], [-0.122, -0.024]], 0.0425, { b: 0.0012 }));
  const skin = fillet([[0.0915, -0.0215], [0.0915, 0.0285], [0.072, 0.0285], [0.07, 0.0335], [-0.1255, 0.0335], [-0.1255, -0.018], [-0.121, -0.0215]], 0.0016, 2);
  K.add(C, ext(skin, 0.0022, { b: 0.0007, holes: [slotP(-0.06, 0.0165, 0.1, 0.0056), rrect(0.046, -0.002, 0.036, 0.024, 0.003), rrect(-0.068, -0.008, 0.084, 0.012, 0.003)] }), -0.0221, 0, 0);
  K.add(C, ext(skin, 0.0022, { b: 0.0007, holes: [rrect(-0.052, 0.003, 0.07, 0.022, 0.003), rrect(0.05, -0.001, 0.03, 0.026, 0.003)] }), 0.0221, 0, 0);
  K.det(mats.hole, cbox(0.0008, 0.0042, 0.098, 0), -0.0214, 0.0165, -0.06);                                              // charging track
  // bolt carrier in the port, brass deflector behind it
  K.add(mats.bright, lathe([[-0.014, 0], [-0.014, 0.0105], [-0.03, 0.0105], [-0.0305, 0.0096], [-0.034, 0.0096], [-0.0345, 0.0105], [-0.07, 0.0105], [-0.071, 0.009], [-0.088, 0.009], [-0.088, 0]], 14), 0.0122, 0.003, 0);
  K.det(mats.hole, cbox(0.0006, 0.021, 0.069, 0), 0.0213, 0.003, -0.052);
  K.add(C, ext(fillet([[0.0228, -0.012], [0.0228, 0.016], [0.0262, 0.01], [0.0296, 0.002], [0.0262, -0.006]], 0.001, 2), 0.02, { axis: 'y', b: 0.0008 }), 0, 0.004, 0);
  // left-side folding charging handle (non-reciprocating) at the front of its track
  K.add(S, ext(fillet([[-0.0225, -0.093], [-0.0225, -0.113], [-0.0295, -0.115], [-0.0365, -0.111], [-0.0365, -0.104], [-0.031, -0.0995], [-0.0292, -0.093]], 0.0012, 2), 0.0072, { axis: 'y', b: 0.0009 }), 0, 0.0165, 0);
  K.det(S, cyl(0.0019, 0.0086, 8), -0.0262, 0.0165, -0.108, HP);
  // ---- lower receiver with flared magazine well
  K.add(C, ext(fillet([[0.064, -0.0236], [-0.112, -0.0236], [-0.1145, -0.04], [-0.1105, -0.0725], [-0.038, -0.0705], [-0.031, -0.0575, 0.004], [-0.022, -0.054], [0.026, -0.054], [0.031, -0.0605], [0.052, -0.0665], [0.0625, -0.057], [0.0655, -0.036]], 0.0016, 2), 0.0425, { b: 0.0012 }));
  const well = fillet([[-0.1105, -0.027], [-0.036, -0.027], [-0.036, -0.0645], [-0.1085, -0.0672]], 0.003, 2);
  for (const s of [-1, 1]) K.add(C, ext(well, 0.002, { b: 0.0007, holes: [rrect(-0.073, -0.0465, 0.052, 0.024, 0.004)] }), s * 0.0219, 0, 0);
  K.add(C, ext(rrect(0, -0.0725, 0.0495, 0.0825, 0.004, 2), 0.0062, { axis: 'y', b: 0.0012, keep: true, holes: [rrect(0, -0.0715, 0.0305, 0.0725, 0.002, 1)] }), 0, -0.0705, 0, -0.027);   // well flare
  K.add(mats.hole, cbox(0.03, 0.0006, 0.072, 0), 0, -0.0727, -0.0715, -0.027);
  K.add(C, cbox(0.03, 0.01, 0.006, 0.001), 0, -0.047, 0.066);                                                            // rear lug under the stock interface
  // ---- controls
  for (const s of [-1, 1]) {                                                                                             // ambidextrous selector
    K.add(S, cyl(0.0046, 0.0032, 10, 0.0006), s * 0.0222, -0.0305, 0.0305, 0, HP);
    K.add(S, ext(fillet([[0.033, -0.0275], [0.0335, -0.0335], [0.011, -0.0322], [0.0085, -0.0298], [0.011, -0.0278]], 0.0012, 2), 0.0036, { b: 0.001 }), s * 0.0248, 0, 0);
    K.det(mats.white, cyl(0.0007, 0.0006, 6, 0), s * 0.0215, -0.0235, 0.0205, 0, HP).det(mats.red, cyl(0.0007, 0.0006, 6, 0), s * 0.0215, -0.0212, 0.0305, 0, HP);
    K.add(S, cyl(0.0041, 0.0034, 10, 0.0007), s * 0.0222, -0.031, 0.048, 0, HP);                                           // takedown pin
    K.add(S, cyl(0.0041, 0.0034, 10, 0.0007), s * 0.0222, -0.0305, -0.105, 0, HP);                                         // pivot pin
    K.det(S, cyl(0.0019, 0.0024, 8, 0.0003), s * 0.0216, -0.0425, 0.004, 0, HP).det(S, cyl(0.0019, 0.0024, 8, 0.0003), s * 0.0216, -0.0365, 0.021, 0, HP);   // trigger / hammer pins
    qdSocket(K, s * 0.0238, -0.008, 0.079, s);
  }
  // bolt catch (left), magazine release (button right, lever left)
  K.add(S, ext(fillet([[-0.0505, -0.0015], [-0.0665, -0.0015], [-0.068, -0.012], [-0.064, -0.0265], [-0.0585, -0.036], [-0.054, -0.036], [-0.0555, -0.0235], [-0.051, -0.012]], 0.0012, 2), 0.0034, { b: 0.0009 }), -0.0247, 0, 0);
  for (let k = 0; k < 4; k++) K.det(S, cbox(0.0012, 0.0012, 0.013, 0.0003), -0.0268, -0.004 - k * 0.0024, -0.0588);
  K.add(S, cyl(0.0052, 0.004, 12, 0.0007), 0.0232, -0.0345, -0.0445, 0, HP);
  for (let k = 0; k < 3; k++) K.det(S, cbox(0.0008, 0.0072, 0.0009, 0.0002), 0.0254, -0.0345, -0.0468 + k * 0.0023);
  K.add(C, ext(ribbon([[-0.0385, -0.0405], [-0.0445, -0.0425], [-0.0505, -0.0405], [-0.0525, -0.0345], [-0.0505, -0.0285], [-0.0445, -0.0265], [-0.0385, -0.0285]], 0.0016), 0.0022, { b: 0.0005 }), 0.0228, 0, 0);   // release fence
  K.add(S, ext(fillet([[-0.0385, -0.039], [-0.0385, -0.0455], [-0.0245, -0.0475], [-0.0225, -0.0432], [-0.0245, -0.039]], 0.0012, 2), 0.003, { b: 0.0008 }), -0.0245, 0, 0);
  triggerBlade(K, 0.0015); triggerGuard(K, C);
  // ---- grip: SIG reduced-angle polymer grip, stippled
  pistolGrip(K, mats.polyFdeTex, { capMat: P });
  K.add(P, ext(fillet([[0.03, -0.0585], [0.0655, -0.05], [0.074, -0.0535], [0.0775, -0.062], [0.071, -0.072], [0.05, -0.068], [0.03, -0.0645]], 0.003, 3), 0.0296, { b: 0.0035 }));   // tang / beavertail
  // ---- handguard: seven slotted flats around a free-floated barrel, full-length rail on top
  const zR = -0.128, zF = -0.416, HG = [[0.012, -0.0265], [0.0245, -0.012], [0.0245, 0.018], [0.0115, 0.0345], [-0.0115, 0.0345], [-0.0245, 0.018], [-0.0245, -0.012], [-0.012, -0.0265]];
  const mlok = slotRow(zR, zF), vent = slotRow(zR, zF, 0.022, 0.0042, 0.04, 0.051);
  facet(K, C, HG[7], HG[0], zR, zF, 0.003, mlok);
  facet(K, C, HG[0], HG[1], zR, zF, 0.003, slotRow(zR, zF, 0.032, 0.0062));
  facet(K, C, HG[1], HG[2], zR, zF, 0.003, mlok);
  facet(K, C, HG[2], HG[3], zR, zF, 0.003, vent);
  facet(K, C, HG[3], HG[4], zR, zF, 0.003);
  facet(K, C, HG[4], HG[5], zR, zF, 0.003, vent);
  facet(K, C, HG[5], HG[6], zR, zF, 0.003, mlok);
  facet(K, C, HG[6], HG[7], zR, zF, 0.003, slotRow(zR, zF, 0.032, 0.0062));
  sectRing(K, C, HG, zF + 0.0012, 0.0036); sectRing(K, C, HG, zR - 0.0045, 0.009, 0.006);
  for (const z of [-0.136, -0.148]) for (const s of [-1, 1]) K.det(S, screw(0.0027, 0.0012), s * 0.0245, -0.0045, z, 0, s * HP);
  qdSocket(K, -0.0246, 0.003, -0.4, -1); qdSocket(K, 0.0246, 0.003, -0.4, 1);
  picRail(K, C, 0.046, 0.092, 0.22, 0.0046, [0.074, -0.128]);
  picRail(K, C, 0.046, -0.128, 0.284, 0.0062);
  // ---- barrel, gas block, piston, suppressor
  K.add(S, lathe([[-0.12, 0.0128], [-0.146, 0.0128], [-0.148, 0.0112], [-0.16, 0.0112], [-0.162, 0.0098], [-0.322, 0.0096], [-0.356, 0.0096], [-0.358, 0.0092], [-0.452, 0.0091]], 16));
  K.add(S, ext(fillet([[-0.322, -0.002], [-0.322, 0.0255], [-0.351, 0.0255], [-0.356, 0.021], [-0.356, -0.002]], 0.0015, 2), 0.0185, { b: 0.0012 }));
  K.add(S, cyl(0.0132, 0.03, 14, 0.001), 0, 0, -0.339);
  K.det(S, knob(0.0058, 0.0075, 10, 0.0008, 0.0005), 0, 0.0185, -0.3605).det(S, screw(0.0026, 0.0012), -0.00925, 0.016, -0.339, 0, -HP);
  K.add(mats.bright, cyl(0.0048, 0.196, 8, 0.0003), 0, 0.0185, -0.224);
  suppressor(K, mats.ceraSteel, -0.452, 0.184);
  // ---- folding stock: hinge block on the receiver's rear rail, skeleton stock, ribbed butt pad
  K.add(C, cbox(0.0405, 0.052, 0.022, 0.0016), 0, -0.012, 0.105);
  K.add(C, cyl(0.0068, 0.05, 12, 0.0008), -0.0205, -0.012, 0.112, HP);
  K.det(S, cyl(0.0034, 0.054, 8, 0.0005), -0.0205, -0.012, 0.112, HP);
  K.add(S, cbox(0.004, 0.013, 0.011, 0.001), 0.0212, -0.004, 0.108);                                                     // fold latch
  K.det(S, screw(0.0026, 0.0012), 0, 0.006, 0.116).det(S, screw(0.0026, 0.0012), 0, -0.03, 0.116);
  const stock = fillet([[0.114, 0.0165], [0.3, 0.0185, 0.008], [0.304, -0.101], [0.283, -0.1015], [0.124, -0.0335], [0.114, -0.03]], 0.004, 3);
  K.add(P, ext(stock, 0.027, { b: 0.003, keep: true, holes: [fillet([[0.146, -0.0075], [0.283, -0.0065], [0.283, -0.084], [0.146, -0.0255]], 0.005, 3)] }));
  K.add(P, ext(fillet([[0.14, 0.012], [0.146, 0.021], [0.292, 0.023], [0.298, 0.012]], 0.004, 3), 0.034, { b: 0.006 }));                    // cheek comb
  K.add(mats.poly, ext(fillet([[0.16, -0.0085], [0.215, -0.0085], [0.212, -0.0165], [0.166, -0.0155]], 0.002, 2), 0.019, { b: 0.0015 }));  // length-of-pull lever
  qdSocket(K, -0.0137, 0.006, 0.272, -1); qdSocket(K, 0.0137, 0.006, 0.272, 1);
  const pad = [[0.302, 0.024], [0.302, -0.105]]; for (let k = 0; k < 8; k++) { const y = -0.105 + k * 0.0161, c = Math.abs(k - 3.5) * 0.0007; pad.push([0.3205 - c, y + 0.002], [0.3228 - c, y + 0.0045], [0.3228 - c, y + 0.0115], [0.3205 - c, y + 0.014]); }
  K.add(mats.rubber, ext(pad, 0.033, { b: 0.003 }));
  // ---- back-up sights, folded
  buis(K, A, 0.046, 0.063, false); buis(K, A, 0.046, -0.392, true);
  // ---- XM157: mount, squared scope body bored through on the sight line, rangefinder hump, turrets, eyepiece
  const Y = 0.085;
  K.add(C, ext(mirrorPts([[0.0125, 0.0462], [0.0148, 0.0485], [0.0148, 0.056], [0.0112, 0.0605], [0.0112, 0.0645]]), 0.117, { axis: 'z', b: 0.0008 }), 0, 0, -0.0465);
  K.add(A, cbox(0.0046, 0.0105, 0.108, 0.0009), -0.0166, 0.0512, -0.0465);
  for (const z of [-0.087, -0.0465, -0.006]) { K.add(S, hex(0.0052, 0.0048), -0.0208, 0.0512, z, 0, HP).det(S, cyl(0.0024, 0.003, 6, 0.0004), -0.0238, 0.0512, z, 0, HP).det(S, screw(0.003, 0.0014), 0.0148, 0.0512, z, 0, HP); }
  K.add(C, ext(mirrorPts([[0.0125, 0.0585], [0.0236, 0.064], [0.0256, 0.0705], [0.0256, 0.1005], [0.0215, 0.107]]), 0.18, { axis: 'z', b: 0.001, keep: true, holes: [circ(0, Y, 0.0187, 24)] }), 0, 0, -0.068);
  K.add(mats.hole, pipe(0.0186, 0.0178, 0.243, 24, 0), 0, Y, -0.0435);                                                    // blackened bore of the tube
  K.add(C, ext(fillet([[-0.16, 0.1055], [-0.16, 0.134], [-0.151, 0.139], [-0.04, 0.139], [-0.022, 0.1275], [-0.0135, 0.1055]], 0.002, 2), 0.047, { b: 0.0018 }));   // rangefinder / ballistic computer housing
  for (const [x, y, r] of [[0.0095, 0.1225, 0.0086], [-0.0115, 0.1255, 0.0056], [-0.0115, 0.1128, 0.0026]]) {             // receiver, emitter, aiming laser
    K.add(A, pipe(r + 0.0017, r, 0.0032, 16, 0.0005), x, y, -0.1608);
    K.add(mats.hole, cyl(r, 0.0004, 12, 0), x, y, -0.1603).add(mats.lens, new THREE.CircleGeometry(r, 16), x, y, -0.1612, 0, Math.PI);
  }
  K.add(A, knob(0.0088, 0.0062, 22, 0.0006), -0.0262, 0.1225, -0.104, 0, HP).det(A, cbox(0.0008, 0.0022, 0.011, 0.0002), -0.0296, 0.1225, -0.104);   // battery cap
  K.add(A, knob(0.0088, 0.0062, 22, 0.0006), -0.0262, 0.1225, -0.128, 0, HP).det(A, cbox(0.0008, 0.0022, 0.011, 0.0002), -0.0296, 0.1225, -0.128);
  K.add(A, cbox(0.0014, 0.014, 0.044, 0.0005), -0.0238, 0.1215, -0.063);                                                  // keypad
  for (let k = 0; k < 3; k++) K.add(mats.rubber, cbox(0.002, 0.0078, 0.0092, 0.0008), -0.0252, 0.1215, -0.0765 + k * 0.0135);
  for (const z of [-0.152, -0.046]) for (const s of [-1, 1]) K.det(S, screw(0.0021, 0.001), s * 0.0175, 0.139, z, -HP);
  for (const s of [-1, 1]) K.add(mats.rubber, cbox(0.011, 0.002, 0.008, 0.0008), s * 0.009, 0.1345, -0.0295, 0.57);        // mode buttons on the rear slope
  K.det(mats.poly, cbox(0.018, 0.0014, 0.012, 0.0005), 0, 0.1394, -0.1);
  for (const z of [-0.14, -0.09, -0.04]) for (const s of [-1, 1]) K.det(S, screw(0.0021, 0.001), s * 0.0256, 0.0745, z, 0, s * HP);
  // turrets: elevation (top), windage (right), illumination / parallax (left)
  K.add(A, cyl(0.0112, 0.004, 18, 0.0006), 0, 0.1085, 0.004, HP).add(A, knob(0.0105, 0.0085, 26, 0.0005), 0, 0.1146, 0.004, HP).det(mats.white, cbox(0.0008, 0.0006, 0.004, 0), 0, 0.119, -0.004);
  K.add(A, cyl(0.0112, 0.004, 18, 0.0006), 0.027, Y, 0.004, 0, HP).add(A, knob(0.0105, 0.0085, 26, 0.0005), 0.0331, Y, 0.004, 0, HP);
  K.add(A, cyl(0.012, 0.004, 18, 0.0006), -0.027, Y, 0.004, 0, HP).add(A, knob(0.0118, 0.0105, 28, 0.0005), -0.0341, Y, 0.004, 0, HP).det(mats.red, cyl(0.0022, 0.0006, 8, 0), -0.0395, Y, 0.004, 0, HP);
  // eyepiece: magnification ring with throw lever, fast-focus ring, rubber eyecup
  K.add(C, lathe([[0.02, 0.019], [0.02, 0.0214], [0.031, 0.0214], [0.031, 0.0205], [0.045, 0.0205], [0.047, 0.0222], [0.052, 0.0232], [0.0715, 0.0236], [0.0715, 0.019], [0.02, 0.019]], 28), 0, Y, 0);
  K.add(A, knob(0.0236, 0.0125, 34, 0.0006, 0.0005, 0.0204), 0, Y, 0.0382);
  K.add(A, ext(fillet([[-0.004, 0.0225], [0.004, 0.0225], [0.003, 0.0335], [-0.003, 0.0335]], 0.0012, 2), 0.0085, { axis: 'z', b: 0.0012 }), 0, Y, 0.0382, 0, 0, 0.75);
  K.add(mats.rubber, lathe([[0.0705, 0.0192], [0.0705, 0.0246], [0.0775, 0.025], [0.0812, 0.0238], [0.0812, 0.0192], [0.0705, 0.0192]], 28), 0, Y, 0);
  K.add(mats.ocular, new THREE.CircleGeometry(0.0179, 24), 0, Y, 0.066);
  // objective: sunshade lip and the coated front element
  K.add(C, lathe([[-0.157, 0.0188], [-0.157, 0.0242], [-0.168, 0.0242], [-0.17, 0.0228], [-0.17, 0.0196], [-0.164, 0.0188], [-0.157, 0.0188]], 28), 0, Y, 0);
  K.det(A, knob(0.0246, 0.004, 40, 0.0004, 0.0003, 0.0238), 0, Y, -0.161);
  K.add(mats.lens, new THREE.CircleGeometry(0.0188, 24), 0, Y, -0.1625, 0, Math.PI);
  K.build(g);
  // ---- separate, animated parts
  const ch = new THREE.Group(), KC = new Kit(); ch.position.set(0, 0.037, 0.09);
  KC.add(A, ext(mirrorPts([[0.0066, -0.02], [0.0066, 0.0005], [0.016, 0.0005], [0.0235, -0.0025], [0.0312, -0.0025], [0.033, 0.002], [0.0312, 0.0105], [0.0255, 0.0132], [0.012, 0.0118], [0, 0.0118]]), 0.0072, { axis: 'y', b: 0.001 }), 0, -0.0018, 0);
  for (const s of [-1, 1]) { KC.add(S, cbox(0.0105, 0.0026, 0.0085, 0.0007), s * 0.0262, 0.0026, 0.0035).det(S, cyl(0.0012, 0.0086, 6, 0.0002), s * 0.0188, -0.0018, 0.006, HP); }
  KC.build(ch); g.add(ch);
  const ret = add(g, new THREE.PlaneGeometry(0.036, 0.036), reticleMat(2.2), 0, Y, 0.078);
  const mag = m7Magazine(); mag.position.set(0, -0.045, -0.07); g.add(mag);
  g.userData = {
    sightY: 0.085, eyeZ: 0.2, muzzleZ: -0.64, mag, magHome: mag.position.clone(), magRot: 0, chargeHandle: ch, reticle: ret,
    support: new THREE.Vector3(-0.03, -0.05, -0.28), magwell: new THREE.Vector3(-0.01, -0.06, -0.07), boltCatch: new THREE.Vector3(-0.035, -0.03, -0.06), charge: new THREE.Vector3(0.0, 0.05, 0.1),
    makeMag: m7Magazine, magSize: 20, bullpup: false, rpm: 750, suppressed: true,
  };
  return dressGun(g, 'spear');
}); }

function bullpupMagazine() {
  const g = new THREE.Group();
  for (let k = 0; k < 5; k++) add(g, rb(0.026, 0.035, 0.06, 0.004), mats.polyInv, 0, -0.018 - k * 0.032, 0.006 - k * 0.012, 0.3 + k * 0.05);
  add(g, rb(0.03, 0.018, 0.07, 0.005), mats.poly, 0, -0.175, -0.05, 0.55);
  return g;
}
// the invaders' bullpup, as first built
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
  return dressGun(g, 'bullpup');
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
export const GUNKIT = { Kit, withLod, lod: () => LOD, cbox, ext, lathe, cyl, pipe, screw, knob, bore, hex, loft, ring, wire, mirX, fillet, circ, rrect, slotP, ribbon, mirrorPts, picRail, facet, slotRow, sectRing, pistolGrip, triggerBlade, triggerGuard, cartridge, qdSocket, buis, suppressor, reticleMat, magOf, gm, sRGB, TAU, HP };
