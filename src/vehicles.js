// Hero vehicle models: procedural, built once as templates and cloned (clones share geometry + materials).
// Everything static is merged per material, so each vehicle is a dozen or so draw calls plus its moving parts.
//  - Invader amphibious IFV (fictional, AAV-7 / Type 05 / EFV pattern): welded boat hull over the tracks, applique
//    armour, bow plane, 7 road wheels a side with linked track, unmanned 30 mm turret with ATGM box and 2x4 smoke
//    dischargers, twin waterjets, rear troop ramp.
//  - LCAC: 26.4 x 14.3 m, bag-and-finger skirt, non-skid cargo deck with tie-downs, side structures with lift-fan
//    intakes, cabins, bow thrusters, two shrouded 4-blade propulsors with twin air rudders, raked bow ramp, stern ramp.
//  - UH-60 Black Hawk: lofted fuselage with the cabin open through both doors, glazed cockpit, twin T700 nacelles,
//    articulated 4-blade head with swashplate and bifilar, 20-degree canted tail rotor, stabilator, door guns.
//  - Invader attack helicopter (fictional): flat-plate tandem canopies, nose sight, chin gun, stub wings with rocket
//    pods and missile racks, skid gear.
// Contract with the rest of the game: named groups 'ramp', 'turret', 'barrel', 'rotor', 'tail', root children named
// 'prop', a mesh named 'disc' in each rotor; opaque materials carry no .map (world.js treats a mapped mesh as a decal
// and hides it when the vehicle burns); VM.glass and VM.char keep their identity.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './rng.js';

const sRGB = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
const PI = Math.PI, H = Math.PI / 2;

// ---------------------------------------------------------------------------------------------------------------
// paint: camouflage, sun fade, chips down to primer and steel, rust blooms and streaks, runoff, mud, dust.
// Evaluated in object space (no UVs needed), and it writes roughness and metalness as well as colour.
const CAMO = /* glsl */`
  varying vec3 vObj; varying vec3 vObjN;
  uniform vec3 uC0, uC1, uC2, uC3, uPrimer;
  uniform vec4 uWear;
  uniform float uScale, uDigital, uGrime, uChar, uMetalB, uRoughB;
  float vh(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  float vn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
    return mix(mix(mix(vh(i), vh(i+vec3(1,0,0)), f.x), mix(vh(i+vec3(0,1,0)), vh(i+vec3(1,1,0)), f.x), f.y),
               mix(mix(vh(i+vec3(0,0,1)), vh(i+vec3(1,0,1)), f.x), mix(vh(i+vec3(0,1,1)), vh(i+vec3(1,1,1)), f.x), f.y), f.z); }
  vec3 vehColor(out float rough, out float metal){
    if (uChar > 0.5) { // burnt-out wreck: soot, scorched paint, rust, a little ash
      float r = vn(vObj * 2.5); float r2 = vn(vObj * 11.0);
      rough = 0.9 + 0.08 * r2; metal = 0.1;
      vec3 cc = mix(vec3(0.03, 0.028, 0.026), vec3(0.16, 0.09, 0.05), smoothstep(0.62, 0.9, r) * 0.5);
      return mix(cc, vec3(0.2, 0.19, 0.18), smoothstep(0.72, 0.95, r2) * 0.25);
    }
    vec3 p = vObj * uScale;
    if (uDigital > 0.5) p = floor(p * 4.0) / 4.0;
    float a = vn(p) * 0.6 + vn(p * 2.3 + 7.0) * 0.4;
    float b = vn(p * 1.3 + 31.0);
    vec3 c = uC0;
    c = mix(c, uC1, step(0.55, a));
    c = mix(c, uC2, step(0.63, b));
    c = mix(c, uC3, step(0.74, vn(p * 1.9 + 13.0)));
    vec3 n = normalize(vObjN);
    float up = max(n.y, 0.0); float side = 1.0 - abs(n.y);
    float big = vn(vObj * 0.9 + 5.0) * 0.6 + vn(vObj * 2.1 + 19.0) * 0.4;   // broad wear field
    float fine = vn(vObj * 9.0);
    // sun and salt: the paint chalks and fades, most on what faces the sky
    c = mix(c, vec3(dot(c, vec3(0.3, 0.5, 0.2))) * 1.22 + 0.015, (0.08 + 0.2 * up) * big * uGrime);
    c = mix(c, c * vec3(1.08, 1.02, 0.92), vn(vObj * 3.0) * 0.25);
    rough = uRoughB + 0.16 * fine; metal = uMetalB;
    // chips: primer first, bare steel in the middle of the bigger ones
    float ch = vn(vObj * 23.0) * 0.55 + vn(vObj * 61.0) * 0.45;
    float th = 0.84 - 0.2 * uWear.x * (1.0 - big);
    float chip = smoothstep(th, th + 0.02, ch) * step(0.001, uWear.x);
    float core = smoothstep(th + 0.04, th + 0.07, ch) * chip;
    c = mix(c, uPrimer, chip); c = mix(c, vec3(0.17, 0.16, 0.15), core);
    rough = mix(rough, 0.42, core); metal = mix(metal, 0.9, core);
    // rust: blooms where the wear field is high, running down the vertical faces
    float rs = vn(vec3(vObj.x * 9.0, vObj.y * 0.7, vObj.z * 9.0) + 3.0);
    float rust = smoothstep(0.6, 0.9, rs) * smoothstep(0.5, 0.75, big) * side;
    rust = clamp(max(rust, core * 0.6) * uWear.y, 0.0, 1.0);
    c = mix(c, vec3(0.3, 0.13, 0.05) * (0.65 + 0.7 * fine), rust * 0.85);
    rough = mix(rough, 0.93, rust); metal = mix(metal, 0.0, rust);
    // runoff: dark streaks under everything that sheds water
    float st = vn(vec3(vObj.x * 6.0, vObj.y * 0.6, vObj.z * 6.0));
    c *= 1.0 - 0.3 * smoothstep(0.55, 0.9, st) * side * uGrime;
    // mud and wet sand thrown up from below, dust settled on the flats
    float low = 1.0 - smoothstep(min(0.2, uWear.w - 0.01), uWear.w, vObj.y);
    float mud = clamp(low * 1.35 - vn(vec3(vObj.x * 2.3, vObj.y * 3.1, vObj.z * 2.3) + 9.0) * 0.55, 0.0, 1.0) * uGrime;
    c = mix(c, vec3(0.42, 0.36, 0.27) * (0.78 + 0.4 * fine), mud * 0.8);
    rough = mix(rough, 0.96, mud); metal *= 1.0 - mud;
    float dust = up * up * (0.3 + 0.7 * big) * uWear.z;
    c = mix(c, vec3(0.47, 0.42, 0.33), dust * 0.45); rough = mix(rough, 0.94, dust * 0.6);
    return c;
  }`;

// c0..c3: the four camouflage colours (sRGB triples). Options: scale/digital (pattern), grime (0..1.5), metal, rough,
// chips/rust/dust (0..1.5), mudTop (object-space height the mud reaches; <= 0.2 for none), primer, char (burnt out), det4
export function vehMat(c0, c1, c2, c3, { scale = 0.6, digital = 0, grime = 1, metal = 0.25, rough = 0.6, char = 0, chips = 0.6, rust = 0.6, dust = 0.6, mudTop = 1.6, primer = [0.42, 0.2, 0.15], det4 = null, name = '' } = {}) {
  const m = new THREE.MeshStandardMaterial({ roughness: Math.min(1, rough + 0.1), metalness: metal });
  const u = {
    uC0: { value: sRGB(...c0) }, uC1: { value: sRGB(...c1) }, uC2: { value: sRGB(...c2) }, uC3: { value: sRGB(...c3) }, uPrimer: { value: sRGB(...primer) },
    uScale: { value: scale }, uDigital: { value: digital }, uGrime: { value: grime }, uChar: { value: char }, uMetalB: { value: metal }, uRoughB: { value: rough },
    uWear: { value: new THREE.Vector4(chips, rust, dust, Math.max(mudTop, 0.21)) },
  };
  if (mudTop <= 0.2) u.uWear.value.w = -1e3;   // no mud at any height (parts that live in their own frame, aircraft)
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj; varying vec3 vObjN;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position; vObjN = normal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + CAMO)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'float vRough; float vMetal; vec4 diffuseColor = vec4(vehColor(vRough, vMetal), opacity);')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRough;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vMetal;');
  };
  m.customProgramCacheKey = () => 'veh2';
  m.userData.veh = u;
  m.userData.det4 = det4 || [2.2, 0.0022, 0.16, 0.28];
  m.color.copy(u.uC0.value);   // not used by the shader; the cel outline takes its ink from it
  if (name) m.name = name;
  return m;
}
// one flat colour run through the same wear model
const worn = (c, o = {}) => vehMat(c, c, c, c, { scale: 1, ...o });
const plain = (c, rough = 0.8, metal = 0, extra = {}, name = '', det4 = null) => { const m = new THREE.MeshStandardMaterial({ color: sRGB(...c), roughness: rough, metalness: metal, ...extra }); m.name = name; if (det4) m.userData.det4 = det4; return m; };

const IFV_C = [[0.3, 0.32, 0.28], [0.22, 0.25, 0.21], [0.37, 0.37, 0.31], [0.13, 0.14, 0.12]];
const LCAC_C = [[0.47, 0.49, 0.5], [0.43, 0.45, 0.46], [0.5, 0.51, 0.52], [0.38, 0.4, 0.41]];
const UH_C = [[0.2, 0.22, 0.17], [0.19, 0.21, 0.16], [0.21, 0.23, 0.18], [0.18, 0.2, 0.15]];
const GS_C = [[0.23, 0.26, 0.24], [0.16, 0.18, 0.17], [0.3, 0.31, 0.27], [0.12, 0.13, 0.12]];

export const VM = {
  ifv: vehMat(...IFV_C, { digital: 1, scale: 1.7, chips: 0.9, rust: 0.8, name: 'ifv' }),
  ifvUp: vehMat(...IFV_C, { digital: 1, scale: 1.7, chips: 0.9, rust: 0.7, mudTop: 0, name: 'ifvUp' }),          // turret, ramp: parts in their own frame
  lcac: vehMat(...LCAC_C, { scale: 0.35, grime: 0.8, chips: 0.7, rust: 1.0, dust: 0.35, mudTop: 1.9, primer: [0.5, 0.24, 0.16], name: 'lcac' }),
  lcacUp: vehMat(...LCAC_C, { scale: 0.35, grime: 0.8, chips: 0.7, rust: 1.0, dust: 0.3, mudTop: 0, primer: [0.5, 0.24, 0.16], name: 'lcacUp' }),
  deck: worn([0.2, 0.21, 0.22], { grime: 1.1, chips: 1.2, rust: 0.9, dust: 0.9, mudTop: 0, rough: 0.82, metal: 0.1, primer: [0.36, 0.37, 0.38], det4: [5.5, 0.006, 0.3, 0.22], name: 'deck' }),   // non-skid
  uh60: vehMat(...UH_C, { scale: 0.5, grime: 0.35, metal: 0.15, chips: 0.35, rust: 0.12, dust: 0.3, mudTop: 0, primer: [0.5, 0.52, 0.3], rough: 0.66, det4: [2.6, 0.0012, 0.12, 0.22], name: 'uh60' }),
  gunship: vehMat(...GS_C, { scale: 0.35, chips: 0.45, rust: 0.2, dust: 0.3, mudTop: 0, grime: 0.6, rough: 0.64, det4: [2.6, 0.0012, 0.12, 0.22], name: 'gunship' }),
  char: vehMat([0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], { char: 1, name: 'char' }),
  dark: plain([0.07, 0.07, 0.07], 0.65, 0.4, {}, 'dark', [3, 0.002, 0.2, 0.3]),
  steel: plain([0.2, 0.2, 0.21], 0.4, 0.85, {}, 'steel', [3, 0.002, 0.25, 0.35]),
  gun: plain([0.055, 0.058, 0.062], 0.42, 0.75, {}, 'gun', [7, 0.0012, 0.18, 0.3]),                               // parkerised / blued
  track: worn([0.16, 0.14, 0.12], { grime: 1.3, chips: 1.4, rust: 1.5, dust: 0.8, mudTop: 0.9, rough: 0.6, metal: 0.7, primer: [0.3, 0.15, 0.08], det4: [4, 0.004, 0.3, 0.3], name: 'track' }),
  rubber: worn([0.045, 0.045, 0.045], { grime: 0.9, chips: 0, rust: 0, dust: 1.2, mudTop: 0.7, rough: 0.9, metal: 0, det4: [3.5, 0.004, 0.2, 0.12], name: 'rubber' }),
  skirt: worn([0.05, 0.05, 0.052], { grime: 0.7, chips: 0, rust: 0, dust: 0.5, mudTop: 1.5, rough: 0.82, metal: 0, det4: [1.6, 0.012, 0.22, 0.2, [1, 3, 1]], name: 'skirt' }),   // neoprene-coated fabric
  canvas: worn([0.33, 0.31, 0.22], { grime: 1.0, chips: 0, rust: 0, dust: 0.8, mudTop: 0, rough: 0.92, metal: 0, det4: [9, 0.004, 0.3, 0.08], name: 'canvas' }),
  olive: worn([0.2, 0.23, 0.15], { chips: 1.1, rust: 0.9, mudTop: 0, name: 'olive' }),
  wood: plain([0.36, 0.25, 0.14], 0.8, 0, {}, 'wood', [2, 0.004, 0.35, 0.15, [1, 1, 8]]),
  interior: plain([0.3, 0.33, 0.3], 0.8, 0.1, {}, 'interior', [3, 0.003, 0.3, 0.2]),
  void: plain([0.012, 0.012, 0.012], 1, 0, {}, 'void'),
  hot: worn([0.11, 0.095, 0.085], { grime: 0.6, chips: 0.3, rust: 1.3, dust: 0.2, mudTop: 0, rough: 0.55, metal: 0.8, primer: [0.2, 0.12, 0.2], name: 'hot' }),    // exhausts: heat-stained steel
  glass: new THREE.MeshPhysicalMaterial({ color: sRGB(0.035, 0.05, 0.06), roughness: 0.06, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04, reflectivity: 0.9, envMapIntensity: 1.7, name: 'glass' }),
  lens: new THREE.MeshPhysicalMaterial({ color: sRGB(0.1, 0.12, 0.08), roughness: 0.05, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.8, name: 'lens' }),
  light: plain([0.9, 0.9, 0.8], 0.2, 0, { emissive: sRGB(0.25, 0.25, 0.2) }, 'light'),
  red: plain([0.5, 0.05, 0.04], 0.45, 0, { emissive: sRGB(0.06, 0, 0) }, 'red'),
  green: plain([0.04, 0.4, 0.14], 0.45, 0, { emissive: sRGB(0, 0.05, 0.01) }, 'green'),
  orange: worn([0.75, 0.25, 0.05], { chips: 0.5, rust: 0.2, dust: 0.3, mudTop: 0, name: 'orange' }),
  white: worn([0.78, 0.78, 0.74], { chips: 0.4, rust: 0.8, dust: 0.4, mudTop: 0, name: 'white' }),
  yellow: worn([0.72, 0.58, 0.1], { chips: 1.3, rust: 0.3, dust: 0.9, mudTop: 0, primer: [0.2, 0.21, 0.22], name: 'yellow' }),
  grille: plain([0.05, 0.05, 0.05], 0.8, 0.5, {}, 'grille', [8, 0.003, 0.2, 0.2]),
};
VM.glass.userData.det4 = [1.2, 0, 0.04, 0.1]; VM.lens.userData.det4 = [1.2, 0, 0.02, 0.05];
VM.glass.userData.spec = 0.8; VM.void.userData.noDet = true;

// ---------------------------------------------------------------------------------------------------------------
// geometry kit
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
function place(g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(sx, sy, sz); _m.compose(_p, _q, _s);
  return g.applyMatrix4(_m);
}
const box = (w, h, d, ...t) => place(new THREE.BoxGeometry(w, h, d), ...t);
const cyl = (rt, rb, h, seg, ...t) => place(new THREE.CylinderGeometry(rt, rb, h, seg), ...t);
// a pipe with wall thickness, open both ends (axis y)
const duct = (r, t, h, seg, ...tr) => lathe([[r - t, -h / 2], [r, -h / 2], [r, h / 2], [r - t, h / 2], [r - t, -h / 2]], seg, ...tr);
const cylO = (rt, rb, h, seg, ...t) => place(new THREE.CylinderGeometry(rt, rb, h, seg, 1, true), ...t);
const sph = (r, ws, hs, ...t) => place(new THREE.SphereGeometry(r, ws, hs), ...t);
const torus = (R, r, rs, ts, ...t) => place(new THREE.TorusGeometry(R, r, rs, ts), ...t);
// a plate with every edge chamfered (60 triangles): catches a highlight where a plain box would not
function cbox(w, h, d, c, ...t) {
  c = Math.min(c, w * 0.45, h * 0.45, d * 0.45);
  const x = w / 2 - c, y = h / 2 - c, k = c * 0.6, s = new THREE.Shape();
  [[-x + k, -y], [x - k, -y], [x, -y + k], [x, y - k], [x - k, y], [-x + k, y], [-x, y - k], [-x, -y + k]].forEach(([px, py], i) => (i ? s.lineTo(px, py) : s.moveTo(px, py)));
  const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * c, bevelEnabled: true, bevelSize: c, bevelThickness: c, bevelSegments: 1, steps: 1 });
  g.translate(0, 0, -(d - 2 * c) / 2);
  return place(g, ...t);
}
// a cylinder from a to b
function rod(ax, ay, az, bx, by, bz, r, seg = 6, r2 = r, open = false) {
  _a.set(ax, ay, az); _b.set(bx, by, bz); _c.subVectors(_b, _a); const len = _c.length() || 1e-4;
  const g = new THREE.CylinderGeometry(r2, r, len, seg, 1, open);
  _q.setFromUnitVectors(UP, _c.divideScalar(len)); _p.addVectors(_a, _b).multiplyScalar(0.5); _s.set(1, 1, 1); _m.compose(_p, _q, _s);
  return g.applyMatrix4(_m);
}
// a smooth pipe / cable through points
function tube(pts, r, seg = 6, closed = false, per = 4, tension = 0.5) {
  const c = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])), closed, 'catmullrom', tension);
  return new THREE.TubeGeometry(c, Math.max(2, Math.round((pts.length - (closed ? 0 : 1)) * per)), r, seg, closed);
}
// straight-sided pipe run: rods with a ball at every corner
function pipe(pts, r, seg = 6) { const out = []; for (let i = 0; i < pts.length - 1; i++) { out.push(rod(...pts[i], ...pts[i + 1], r, seg, r, true)); if (i) out.push(sph(r, seg, 4, ...pts[i])); } return out; }
// solid of revolution about +y. Profile [r, y] runs with the outside on its right (bottom-centre, out, up, top-centre).
function lathe(prof, seg = 16, ...t) { return place(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y)), seg), ...t); }
// polygon [u, v] extruded: axis 'x' -> (z, y) profile across x; 'y' -> (x, z) plan through y; 'z' -> (x, y) through z. Centred on the axis.
function prism(points, depth, bevel = 0, axis = 'x', segs = 1) {
  const s = new THREE.Shape(); points.forEach(([u, v], i) => (i ? s.lineTo(u, v) : s.moveTo(u, v)));
  const g = new THREE.ExtrudeGeometry(s, bevel > 0 ? { depth: depth - 2 * bevel, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: segs, steps: 1 } : { depth, bevelEnabled: false, steps: 1 });
  g.translate(0, 0, -(bevel > 0 ? depth - 2 * bevel : depth) / 2);
  if (axis === 'x') g.rotateY(-H); else if (axis === 'y') g.rotateX(H);
  return g;
}
// mirror in x (keeps the faces outward)
function mirrorX(g0) {
  const g = (g0.index ? g0.toNonIndexed() : g0.clone());
  for (const k of Object.keys(g.attributes)) {
    const at = g.attributes[k], n = at.itemSize, arr = at.array;
    if (k === 'position' || k === 'normal') for (let i = 0; i < arr.length; i += 3) arr[i] = -arr[i];
    for (let i = 0; i < at.count; i += 3) for (let j = 0; j < n; j++) { const t = arr[(i + 1) * n + j]; arr[(i + 1) * n + j] = arr[(i + 2) * n + j]; arr[(i + 2) * n + j] = t; }
  }
  return g;
}
function clean(g) {
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (g.morphAttributes) g.morphAttributes = {};
  if (!g.attributes.normal) g.computeVertexNormals();
  return g.index ? g.toNonIndexed() : g;
}
class Builder {
  constructor() { this.groups = new Map(); }
  add(mat, ...gs) { let l = this.groups.get(mat); if (!l) this.groups.set(mat, l = []); for (const g of gs) { if (Array.isArray(g)) l.push(...g); else l.push(g); } return this; }
  // the same thing on both sides
  sym(mat, ...gs) { for (const g of gs.flat()) { this.add(mat, g, mirrorX(g)); } return this; }
  build(parent, { cast = true, receive = true } = {}) {
    const meshes = [];
    for (const [mat, list] of this.groups) {
      if (!list.length) continue;
      const m = new THREE.Mesh(mergeGeometries(list.map(clean), false), mat);
      m.castShadow = cast; m.receiveShadow = receive; parent.add(m); meshes.push(m);
    }
    return meshes;
  }
}
// hex bolt heads standing on a surface; axis = the surface normal
function bolts(pts, axis, r = 0.016, h = 0.012) {
  const rx = axis === 'z' ? H : 0, rz = axis === 'x' ? H : 0;
  return pts.map(([x, y, z]) => cyl(r, r, h, 6, x, y, z, rx, 0, rz));
}
// bolt heads on a tilted face: n = unit normal
function boltsN(pts, n, r = 0.016, h = 0.012) { _q.setFromUnitVectors(UP, _a.set(n[0], n[1], n[2]).normalize()); _e.setFromQuaternion(_q); const { x, y, z } = _e; return pts.map((p) => cyl(r, r, h, 6, p[0], p[1], p[2], x, y, z)); }

// hard-edged loft through polygon sections [{ z, pts: [[x, y], ...] }] (same vertex count throughout), flat shaded, capped
function hardLoft(secs, { capA = true, capB = true } = {}) {
  const side = [], caps = [], n = secs[0].pts.length;
  const dz = Math.sign(secs[secs.length - 1].z - secs[0].z) || 1;
  const eq = (u, v) => Math.abs(u[0] - v[0]) + Math.abs(u[1] - v[1]) + Math.abs(u[2] - v[2]) < 1e-6;
  for (let r = 0; r < secs.length - 1; r++) {
    const A = secs[r], B = secs[r + 1];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, a = [A.pts[i][0], A.pts[i][1], A.z], b = [A.pts[j][0], A.pts[j][1], A.z], c = [B.pts[j][0], B.pts[j][1], B.z], d = [B.pts[i][0], B.pts[i][1], B.z];
      if (!eq(a, b) && !eq(b, c) && !eq(a, c)) side.push(a, b, c);
      if (!eq(a, c) && !eq(c, d) && !eq(a, d)) side.push(a, c, d);
    }
  }
  // outward: the signed volume the skin sweeps about its own centroid must be positive
  const ce = [0, 0, 0]; for (const v of side) { ce[0] += v[0] / side.length; ce[1] += v[1] / side.length; ce[2] += v[2] / side.length; }
  let vol = 0; for (let i = 0; i < side.length; i += 3) { const [a, b, c] = [side[i], side[i + 1], side[i + 2]].map((v) => [v[0] - ce[0], v[1] - ce[1], v[2] - ce[2]]);
    vol += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]); }
  if (vol < 0) for (let i = 0; i < side.length; i += 3) { const t = side[i + 1]; side[i + 1] = side[i + 2]; side[i + 2] = t; }
  const cap = (S, front) => {
    const faces = THREE.ShapeUtils.triangulateShape(S.pts.map(([x, y]) => new THREE.Vector2(x, y)), []);
    for (const f of faces) {
      const v = f.map((k) => [S.pts[k][0], S.pts[k][1], S.z]);
      const ccw = (v[1][0] - v[0][0]) * (v[2][1] - v[0][1]) - (v[1][1] - v[0][1]) * (v[2][0] - v[0][0]) > 0;   // ccw in xy faces +z
      const wantPlus = front ? dz < 0 : dz > 0;
      if (ccw === wantPlus) caps.push(v[0], v[1], v[2]); else caps.push(v[0], v[2], v[1]);
    }
  };
  if (capA) cap(secs[0], true); if (capB) cap(secs[secs.length - 1], false);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([...side, ...caps].flat(), 3)); g.computeVertexNormals();
  return g;
}

// smooth lofted body. Sections [z, halfWidth, yTop, yBottom, yWide, sqTop, sqBottom]: a superellipse above and below the
// widest line. skip(z, x, y) removes faces (door openings). The returned geometry carries .surf for laying glass and trim on it.
function body(secs, segs = 32, { skip = null, capA = true, capB = true } = {}) {
  const ring = (S) => { const out = []; for (let k = 0; k < segs; k++) { const a = k / segs * PI * 2, c = Math.cos(a), s = Math.sin(a), e = 2 / (s >= 0 ? S[5] : S[6]);
    out.push([Math.sign(c) * Math.pow(Math.abs(c), e) * S[1], S[4] + Math.sign(s) * Math.pow(Math.abs(s), e) * (s >= 0 ? S[2] - S[4] : S[4] - S[3])]); } return out; };
  const rings = secs.map(ring), pos = [], idx = [];
  rings.forEach((r, i) => r.forEach(([x, y]) => pos.push(x, y, secs[i][0])));
  for (let r = 0; r < secs.length - 1; r++) {
    const fwd = secs[r + 1][0] > secs[r][0];
    for (let k = 0; k < segs; k++) {
      const k1 = (k + 1) % segs, a = r * segs + k, b = r * segs + k1, c = (r + 1) * segs + k, d = (r + 1) * segs + k1;
      if (skip) { const mx = (rings[r][k][0] + rings[r][k1][0] + rings[r + 1][k][0] + rings[r + 1][k1][0]) / 4, my = (rings[r][k][1] + rings[r][k1][1] + rings[r + 1][k][1] + rings[r + 1][k1][1]) / 4; if (skip((secs[r][0] + secs[r + 1][0]) / 2, mx, my)) continue; }
      if (fwd) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const parts = [g];
  const cap = (i, plus) => { const r = rings[i], z = secs[i][0], p = [0, (secs[i][2] + secs[i][3]) / 2, z], cp = [];
    for (let k = 0; k < segs; k++) { const a = r[k], b = r[(k + 1) % segs]; if (plus) cp.push(...p, a[0], a[1], z, b[0], b[1], z); else cp.push(...p, b[0], b[1], z, a[0], a[1], z); }
    const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3)); cg.computeVertexNormals(); parts.push(cg); };
  if (capA) cap(0, secs[0][0] > secs[1][0]); if (capB) cap(secs.length - 1, secs[secs.length - 1][0] > secs[secs.length - 2][0]);
  const out = parts.length > 1 ? mergeGeometries(parts.map(clean), false) : g;
  // the surface itself: point at (z, angle), exactly on the facets
  const zs = secs.map((s) => s[0]);
  const at = (z, a, target) => {
    let r = -1; for (let i = 0; i < zs.length - 1; i++) { const lo = Math.min(zs[i], zs[i + 1]), hi = Math.max(zs[i], zs[i + 1]); if (z >= lo - 1e-9 && z <= hi + 1e-9) { r = i; break; } }
    if (r < 0) r = Math.abs(z - zs[0]) < Math.abs(z - zs[zs.length - 1]) ? 0 : zs.length - 2;
    const t = Math.max(0, Math.min(1, (z - zs[r]) / ((zs[r + 1] - zs[r]) || 1)));
    let f = ((a / (PI * 2)) % 1 + 1) % 1 * segs; const k = Math.floor(f) % segs, k1 = (k + 1) % segs; f -= Math.floor(f);
    const A = rings[r], B = rings[r + 1];
    const x = (A[k][0] * (1 - f) + A[k1][0] * f) * (1 - t) + (B[k][0] * (1 - f) + B[k1][0] * f) * t, y = (A[k][1] * (1 - f) + A[k1][1] * f) * (1 - t) + (B[k][1] * (1 - f) + B[k1][1] * f) * t;
    return target.set(x, y, z);
  };
  const nrm = (z, a, target) => { const e = 0.02, p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3(), p3 = new THREE.Vector3(), zl = Math.min(...zs), zh = Math.max(...zs);
    at(Math.max(zl, z - 0.05), a, p0); at(Math.min(zh, z + 0.05), a, p1); at(z, a - e, p2); at(z, a + e, p3);
    return target.subVectors(p3, p2).cross(p1.sub(p0)).normalize(); };   // d/da x d/dz points outward
  // angle on the side (sd = +1 / -1) where the surface is at height y; angle on the top (tb = +1) or belly (-1) where it is at x
  const aSide = (z, y, sd = 1) => { let lo = -H, hi = H; const v = new THREE.Vector3(); for (let i = 0; i < 26; i++) { const mid = (lo + hi) / 2; at(z, mid, v); if (v.y < y) lo = mid; else hi = mid; } const a = (lo + hi) / 2; return sd > 0 ? a : PI - a; };
  const aTop = (z, x, tb = 1) => { let lo = 0, hi = PI; const v = new THREE.Vector3(); for (let i = 0; i < 26; i++) { const mid = (lo + hi) / 2; at(z, tb * mid, v); if (v.x > x) lo = mid; else hi = mid; } return tb * (lo + hi) / 2; };
  out.userData.surf = { at, nrm, aSide, aTop, zs };
  return out;
}
// a skin panel lying on a body: f(u, v) -> [z, angle], lifted off the surface by `off`
function skin(S, nu, nv, f, off = 0.012) {
  const pos = [], idx = [], p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const [z, a] = f(i / nu, j / nv); S.at(z, a, p); S.nrm(z, a, n); pos.push(p.x + n.x * off, p.y + n.y * off, p.z + n.z * off); }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  // face outward whichever way the parameters ran
  const na = g.attributes.normal; S.nrm(...f(0.5, 0.5), n); const mid = Math.floor((nv + 1) * (nu + 1) / 2);
  if (na.getX(mid) * n.x + na.getY(mid) * n.y + na.getZ(mid) * n.z < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } g.computeVertexNormals(); }
  return g;
}
// side window / panel between heights y0..y1 and stations z0..z1 on side sd
const sidePanel = (S, sd, z0, z1, y0, y1, off = 0.012, nu = 6, nv = 5) => skin(S, nu, nv, (u, v) => { const z = z0 + (z1 - z0) * u; return [z, S.aSide(z, y0 + (y1 - y0) * v, sd)]; }, off);
// a line of trim on a body through [z, angle] points
function trim(S, pts, r = 0.012, off = 0.004, seg = 4, closed = false) {
  const p = new THREE.Vector3(), n = new THREE.Vector3(), out = [];
  for (const [z, a] of pts) { S.at(z, a, p); S.nrm(z, a, n); out.push([p.x + n.x * off, p.y + n.y * off, p.z + n.z * off]); }
  const c = new THREE.CatmullRomCurve3(out.map((q) => new THREE.Vector3(...q)), closed, 'catmullrom', 0.0);
  return new THREE.TubeGeometry(c, out.length * 2, r, seg, closed);
}
// frame round a side panel
const sideFrame = (S, sd, z0, z1, y0, y1, r = 0.014, off = 0.012) => { const pts = [], N = 5;
  for (let i = 0; i < N; i++) pts.push([z0 + (z1 - z0) * i / N, y0]); for (let i = 0; i < N; i++) pts.push([z1, y0 + (y1 - y0) * i / N]);
  for (let i = 0; i < N; i++) pts.push([z1 + (z0 - z1) * i / N, y1]); for (let i = 0; i < N; i++) pts.push([z0, y1 + (y0 - y1) * i / N]);
  return trim(S, pts.map(([z, y]) => [z, S.aSide(z, y, sd)]), r, off, 4, true); };
// a ring of rivets / fasteners along a body at angles
function studs(S, pts, r = 0.011, off = 0.002) { const p = new THREE.Vector3(), n = new THREE.Vector3(), out = [];
  for (const [z, a] of pts) { S.at(z, a, p); S.nrm(z, a, n); _q.setFromUnitVectors(UP, n); _e.setFromQuaternion(_q); out.push(cyl(r, r, 0.006, 5, p.x + n.x * off, p.y + n.y * off, p.z + n.z * off, _e.x, _e.y, _e.z)); }
  return out; }

// ---------------------------------------------------------------------------------------------------------------
// markings: one canvas per vehicle, every stencil a quad on it, all the quads one mesh
class Sheet {
  constructor(W = 1024, Hh = 512, seed = 7) {
    this.c = document.createElement('canvas'); this.c.width = W; this.c.height = Hh; this.W = W; this.H = Hh; this.g = this.c.getContext('2d');
    this.g.clearRect(0, 0, W, Hh); this.x = 2; this.y = 2; this.row = 0; this.quads = []; this.r = mulberry32(seed);
  }
  cell(w, h) { w = Math.ceil(w); h = Math.ceil(h); if (this.x + w + 2 > this.W) { this.x = 2; this.y += this.row + 2; this.row = 0; }
    const c = { x: this.x, y: this.y, w, h }; this.x += w + 2; this.row = Math.max(this.row, h); return c; }
  // stencil text; worn = how much of the paint has gone
  text(str, { px = 64, color = '#e8e4d6', worn = 0.25, weight = 'bold', font = '"Arial Narrow", "Helvetica Neue", Arial, sans-serif', alpha = 0.9 } = {}) {
    const g = this.g; g.font = `${weight} ${px}px ${font}`; const w = Math.min(this.W - 8, g.measureText(str).width + 8), c = this.cell(w, px * 1.15);
    g.save(); g.globalAlpha = alpha; g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(str, c.x + c.w / 2, c.y + c.h / 2 + px * 0.04, c.w - 4); g.restore();
    this.wear(c, worn); return c;
  }
  draw(w, h, fn, worn = 0.2) { const c = this.cell(w, h), g = this.g; g.save(); g.translate(c.x, c.y); g.beginPath(); g.rect(0, 0, w, h); g.clip(); fn(g, w, h); g.restore(); this.wear(c, worn); return c; }
  wear(c, k) { if (k <= 0) return; const g = this.g, r = this.r; g.save(); g.globalCompositeOperation = 'destination-out';
    const n = Math.floor(c.w * c.h * 0.012 * k); for (let i = 0; i < n; i++) { g.globalAlpha = 0.35 + r() * 0.65; const s = 1 + r() * r() * 5; g.fillRect(c.x + r() * c.w, c.y + r() * c.h, s, s * (0.5 + r())); }
    for (let i = 0; i < n / 14; i++) { g.globalAlpha = 0.5; g.fillRect(c.x + r() * c.w, c.y + r() * c.h, 8 + r() * 30, 1 + r() * 1.5); }
    g.restore(); }
  // put a cell in the world: h metres tall (width follows), centred at x,y,z, with rotation
  put(c, h, x, y, z, rx = 0, ry = 0, rz = 0, flip = false) {
    const w = h * c.w / c.h, g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv;
    const u0 = c.x / this.W, u1 = (c.x + c.w) / this.W, v1 = 1 - c.y / this.H, v0 = 1 - (c.y + c.h) / this.H;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (flip ? 1 - uv.getX(i) : uv.getX(i)) * (u1 - u0) + u0, uv.getY(i) * (v1 - v0) + v0);
    this.quads.push(place(g, x, y, z, rx, ry, rz)); return this;
  }
  // on a vehicle's flank: sd = +1 on the +x side (reads left to right from outside either way)
  side(c, h, sd, x, y, z) { return this.put(c, h, sd * x, y, z, 0, sd * H, 0); }
  mesh() {
    const t = new THREE.CanvasTexture(this.c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    const mat = new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, name: 'markings' });
    const m = new THREE.Mesh(mergeGeometries(this.quads.map((g) => (g.index ? g.toNonIndexed() : g)), false), mat);
    m.name = 'markings'; m.castShadow = false; m.receiveShadow = true; m.renderOrder = 1; return m;
  }
}
const shadows = (root) => root.traverse((o) => { if (o.isMesh && o.name !== 'disc' && o.name !== 'markings') { o.castShadow = true; o.receiveShadow = true; } });

// ---------------------------------------------------------------------------------------------------------------
// parts shared between vehicles
// a jerrycan, standing, 0.16 x 0.47 x 0.34
function jerrycan(x, y, z, ry = 0) {
  const out = [cbox(0.34, 0.4, 0.16, 0.025, 0, 0.2, 0), box(0.2, 0.012, 0.165, 0, 0.2, 0, 0, 0, PI / 4), box(0.2, 0.012, 0.165, 0, 0.2, 0, 0, 0, -PI / 4),
    cyl(0.03, 0.03, 0.06, 8, 0.11, 0.42, 0, 0, 0, -0.5), rod(-0.1, 0.44, -0.04, 0.04, 0.44, -0.04, 0.009, 5), rod(-0.1, 0.44, 0, 0.04, 0.44, 0, 0.009, 5), rod(-0.1, 0.44, 0.04, 0.04, 0.44, 0.04, 0.009, 5), box(0.02, 0.05, 0.11, -0.1, 0.42, 0), box(0.02, 0.05, 0.11, 0.04, 0.42, 0)];
  return out.map((g) => place(g, x, y, z, 0, ry, 0));
}
// a rolled tarp / bedroll with two straps: returns { roll: [...], straps: [...] } lying along z
function bedroll(x, y, z, len, r, ry = 0) {
  const prof = [[0, -len / 2], [r * 0.72, -len / 2], [r, -len / 2 + r * 0.25], [r * 0.96, -len * 0.2], [r, 0], [r * 0.95, len * 0.22], [r, len / 2 - r * 0.25], [r * 0.7, len / 2], [0, len / 2]];
  const roll = [place(place(lathe(prof, 12), 0, 0, 0, H, 0, 0), x, y, z, 0, ry, 0)];
  const straps = [-0.28, 0.28].map((k) => place(place(cylO(r * 1.03, r * 1.03, 0.045, 12), 0, 0, k * len, H, 0, 0), x, y, z, 0, ry, 0));
  return { roll, straps };
}
// a soft pack: a squashed chamfered block with a lid flap and two straps
function pack(x, y, z, w, h, d, ry = 0) {
  return [cbox(w, h, d, Math.min(w, h, d) * 0.28, 0, h / 2, 0), cbox(w * 0.96, h * 0.3, d * 1.06, 0.03, 0, h * 0.86, 0), box(0.035, h * 0.9, d * 1.1, -w * 0.22, h * 0.5, 0), box(0.035, h * 0.9, d * 1.1, w * 0.22, h * 0.5, 0), cbox(w * 0.5, h * 0.4, 0.07, 0.02, 0, h * 0.35, d / 2 + 0.02)]
    .map((g) => place(g, x, y, z, 0, ry, 0));
}
// a lifting eye / shackle point
const eye = (x, y, z, ry = 0, R = 0.05, r = 0.014) => [place(torus(R, r, 5, 10, 0, R * 0.8, 0), x, y, z, 0, ry, 0), box(R * 1.6, 0.02, R * 2.2, x, y + 0.01, z, 0, ry, 0)];
// a whip antenna on a sprung base
const whip = (x, y, z, len, lean = 0, leanX = 0) => { const tx = x + Math.sin(leanX) * len, tz = z + Math.sin(lean) * len, ty = y + 0.2 + len * Math.cos(Math.max(Math.abs(lean), Math.abs(leanX)));
  return [cyl(0.035, 0.045, 0.07, 8, x, y + 0.035, z), cyl(0.022, 0.022, 0.13, 8, x, y + 0.13, z), rod(x, y + 0.19, z, tx, ty, tz, 0.009, 5, 0.004)]; };
// a louvred grille standing in the z-y plane (normal +x): frame, slats, dark behind
function louvre(B, paint, w, h, n, x, y, z, ry = 0, slant = 0.5) {
  const t = (g) => place(g, x, y, z, 0, ry, 0);
  B.add(VM.grille, t(box(0.02, h, w, -0.012, 0, 0)));
  B.add(paint, t(box(0.05, 0.04, w + 0.08, 0.01, h / 2 + 0.02, 0)), t(box(0.05, 0.04, w + 0.08, 0.01, -h / 2 - 0.02, 0)), t(box(0.05, h + 0.08, 0.04, 0.01, 0, w / 2 + 0.02)), t(box(0.05, h + 0.08, 0.04, 0.01, 0, -w / 2 - 0.02)));
  for (let k = 0; k < n; k++) B.add(paint, t(box(0.012, h / n * 0.95, w, 0.012, -h / 2 + (k + 0.5) * h / n, 0, 0, 0, slant)));
}
const xf = (list, ...t) => list.flat().map((g) => place(g, ...t));
// vertical hard loft: sections { y, pts: [[x, z], ...] }
const vloft = (secs, o) => hardLoft(secs.map((s) => ({ z: s.y, pts: s.pts.map(([x, z]) => [x, -z]) })), o).rotateX(-H);
// points evenly spaced along a closed polyline [[u, v], ...]: returns [{ u, v, tu, tv }]
function walk(poly, pitch) {
  const seg = [], n = poly.length; let total = 0;
  for (let i = 0; i < n; i++) { const a = poly[i], b = poly[(i + 1) % n], l = Math.hypot(b[0] - a[0], b[1] - a[1]); seg.push({ a, b, l, s: total }); total += l; }
  const count = Math.round(total / pitch), out = []; let si = 0;
  for (let k = 0; k < count; k++) { const d = k / count * total; while (si < n - 1 && seg[si].s + seg[si].l < d) si++; const S = seg[si], t = (d - S.s) / (S.l || 1);
    out.push({ u: S.a[0] + (S.b[0] - S.a[0]) * t, v: S.a[1] + (S.b[1] - S.a[1]) * t, tu: (S.b[0] - S.a[0]) / (S.l || 1), tv: (S.b[1] - S.a[1]) / (S.l || 1) }); }
  return out;
}

// ======================= Amphibious IFV (front = -z) =======================
export function buildIFV() {
  const root = new THREE.Group(); root.name = 'ifv';
  const B = new Builder(), PAINT = VM.ifv;
  // ---- welded hull: a narrow tub between the tracks, the upper hull out over them, sloped upper sides, boat bow
  const hs = (z, yb, yS, ySide, yRoof, wTub, wOut, wRoof) => ({ z, pts: [[-wTub, yb], [wTub, yb], [wTub, yS], [wOut, yS], [wOut, ySide], [wRoof, yRoof], [-wRoof, yRoof], [-wOut, ySide], [-wOut, yS], [-wTub, yS]] });
  const glY = (z) => 1.56 + (z + 4.45) * 0.474, GL = -0.443;   // the glacis: height at z, and its pitch
  B.add(PAINT, hardLoft([
    hs(-4.74, 0.92, 0.96, 1.0, 1.06, 1.2, 1.66, 1.6), hs(-4.45, 0.66, 1.08, 1.36, 1.56, 1.12, 1.76, 1.62), hs(-3.4, 0.42, 1.08, 1.62, 2.058, 1.12, 1.78, 1.47),
    hs(-3.1, 0.42, 1.08, 1.7, 2.2, 1.12, 1.78, 1.42), hs(3.6, 0.42, 1.08, 1.7, 2.2, 1.12, 1.78, 1.42), hs(3.9, 0.48, 1.08, 1.7, 2.2, 1.12, 1.78, 1.42),
    hs(4.5, 0.6, 1.08, 1.7, 2.14, 1.12, 1.78, 1.42), hs(4.6, 0.62, 1.08, 1.7, 2.14, 1.12, 1.76, 1.4),
  ]));
  // weld beads along the chines and across the plate joints
  const weld = (a, b) => rod(...a, ...b, 0.013, 5, 0.013, true);
  for (const s of [-1, 1]) {
    B.add(PAINT, weld([s * 1.42, 2.2, -3.1], [s * 1.42, 2.2, 3.9]), weld([s * 1.78, 1.7, -3.1], [s * 1.78, 1.7, 4.5]), weld([s * 1.78, 1.085, -4.45], [s * 1.78, 1.085, 4.5]),
      weld([s * 1.42, 2.2, -3.1], [s * 1.62, 1.56, -4.45]), weld([s * 1.78, 1.7, -3.1], [s * 1.76, 1.36, -4.45]), weld([s * 1.78, 1.7, -3.1], [s * 1.42, 2.2, -3.1]), weld([s * 1.78, 1.7, 3.9], [s * 1.42, 2.2, 3.9]),
      weld([s * 1.78, 1.08, -3.1], [s * 1.78, 1.7, -3.1]), weld([s * 1.78, 1.08, 0.4], [s * 1.78, 1.7, 0.4]), weld([s * 1.42, 2.2, 0.9], [s * 1.78, 1.7, 0.9]), weld([s * 1.12, 0.45, -3.4], [s * 1.12, 0.45, 3.6]));
  }
  B.add(PAINT, weld([-1.42, 2.2, -3.1], [1.42, 2.2, -3.1]), weld([-1.42, 2.2, 0.9], [1.42, 2.2, 0.9]), weld([-1.42, 2.2, 3.9], [1.42, 2.2, 3.9]), weld([-1.62, 1.56, -4.45], [1.62, 1.56, -4.45]), weld([-1.42, 2.14, 4.6], [1.42, 2.14, 4.6]));

  // ---- applique armour: bolted plates standing off the vertical sides and the upper slopes
  const SL = 0.624, sn = [0.811, 0.584, 0];   // the upper side slope: tilt and normal
  {
    const g = [], bl = [], sp = [];
    for (let k = 0; k < 7; k++) { const z = -2.6 + k * 0.985;
      g.push(cbox(0.045, 0.52, 0.94, 0.012, 1.8225, 1.4, z)); sp.push(box(0.03, 0.05, 0.86, 1.79, 1.6, z), box(0.03, 0.05, 0.86, 1.79, 1.2, z));
      for (const [dy, dz] of [[0.2, 0.38], [0.2, -0.38], [-0.2, 0.38], [-0.2, -0.38]]) bl.push([1.848, 1.4 + dy, z + dz]);
      g.push(box(0.012, 0.03, 0.2, 1.848, 1.4, z)); }
    for (const z of [-2.55, -1.6, -0.65, 0.3, 3.05]) { const len = z > 2 ? 1.5 : 0.9;
      g.push(cbox(0.04, 0.5, len, 0.012, 1.6 + sn[0] * 0.04, 1.95 + sn[1] * 0.04, z, 0, 0, SL)); sp.push(box(0.03, 0.4, 0.05, 1.6 + sn[0] * 0.012, 1.95 + sn[1] * 0.012, z, 0, 0, SL));
      for (const dz of [-len / 2 + 0.08, len / 2 - 0.08]) for (const d of [-0.18, 0.18]) g.push(...boltsN([[1.6 + sn[0] * 0.062 - 0.584 * d, 1.95 + sn[1] * 0.062 + 0.811 * d, z + dz]], sn)); }
    B.sym(PAINT, g, sp, bolts(bl, 'x', 0.018, 0.014));
  }
  // exhaust (right) and intake (left) louvres let into the slope, the exhaust under a heat shield with its outlet
  for (const s of [-1, 1]) {
    const at = (d, o) => [s * (1.6 + sn[0] * o - 0.584 * d), 1.95 + sn[1] * o + 0.811 * d];
    B.add(VM.void, box(0.02, 0.46, 1.3, ...at(0, 0.004), 1.6, 0, 0, s * SL));
    B.add(PAINT, box(0.05, 0.05, 1.4, ...at(0.25, 0.02), 1.6, 0, 0, s * SL), box(0.05, 0.05, 1.4, ...at(-0.25, 0.02), 1.6, 0, 0, s * SL), box(0.05, 0.55, 0.05, ...at(0, 0.02), 0.92, 0, 0, s * SL), box(0.05, 0.55, 0.05, ...at(0, 0.02), 2.28, 0, 0, s * SL));
    for (let k = 0; k < 9; k++) B.add(PAINT, box(0.014, 0.05, 1.3, ...at(-0.2 + k * 0.05, 0.02), 1.6, 0, 0, s * (SL + 0.7)));
  }
  B.add(VM.track, cbox(0.2, 0.18, 0.95, 0.03, 1.36, 2.3, 1.75), rod(1.36, 2.3, 2.2, 1.42, 2.36, 2.62, 0.055, 10, 0.06, true), cyl(0.066, 0.066, 0.03, 10, 1.42, 2.36, 2.62, 1.43, 0, 0.14));
  B.add(VM.void, cyl(0.05, 0.05, 0.02, 10, 1.423, 2.363, 2.64, 1.43, 0, 0.14));
  for (let k = 0; k < 4; k++) B.add(VM.steel, box(0.24, 0.012, 0.03, 1.36, 2.4, 1.38 + k * 0.25), box(0.012, 0.2, 0.03, 1.47, 2.3, 1.38 + k * 0.25));
  B.add(VM.steel, box(0.012, 0.012, 0.98, 1.47, 2.36, 1.75), box(0.012, 0.012, 0.98, 1.47, 2.26, 1.75), box(0.012, 0.012, 0.98, 1.3, 2.405, 1.75), box(0.012, 0.012, 0.98, 1.42, 2.405, 1.75));

  // ---- side skirts: hinged plates over the top run of the track, rubber flaps under them
  {
    const g = [], bl = [], rub = [];
    for (let k = 0; k < 8; k++) { const z = -3.44 + k * 0.985;
      g.push(cbox(0.028, 0.44, 0.955, 0.008, 1.812, 0.85, z), cyl(0.02, 0.02, 0.16, 6, 1.815, 1.075, z - 0.28, H, 0, 0), cyl(0.02, 0.02, 0.16, 6, 1.815, 1.075, z + 0.28, H, 0, 0));
      for (const dz of [-0.4, 0, 0.4]) bl.push([1.828, 1.0, z + dz]); bl.push([1.828, 0.7, z - 0.4], [1.828, 0.7, z + 0.4]);
      rub.push(box(0.014, 0.13, 0.94, 1.812, 0.585, z)); }
    g.push(box(0.03, 0.035, 7.9, 1.8, 1.075, 0.0));
    B.sym(PAINT, g, bolts(bl, 'x', 0.015, 0.012)); B.sym(VM.rubber, rub);
  }

  // ---- running gear: 7 road wheels a side on swing arms, sprocket forward, idler aft, 3 return rollers, linked track
  {
    const X = 1.55, tyre = [], hub = [], stl = [], trk = [], rubP = [];
    const ringP = (r0, r1, y0, w) => [[r0, y0 - w / 2], [r1 - 0.006, y0 - w / 2], [r1, y0 - w / 2 + 0.018], [r1, y0 + w / 2 - 0.018], [r1 - 0.006, y0 + w / 2], [r0, y0 + w / 2], [r0, y0 - w / 2]];
    const dish = (R, yo) => [[R, yo - 0.14], [R, yo], [R * 0.9, yo], [R * 0.8, yo - 0.065], [R * 0.46, yo - 0.065], [R * 0.38, yo + 0.01], [R * 0.22, yo + 0.01], [R * 0.2, yo + 0.045], [0, yo + 0.045]];
    for (let k = 0; k < 7; k++) { const z = -3.0 + k * 0.98;
      tyre.push(lathe(ringP(0.25, 0.33, 0.105, 0.15), 22, X, 0.42, z, 0, 0, -H), lathe(ringP(0.25, 0.33, -0.105, 0.15), 14, X, 0.42, z, 0, 0, -H));
      hub.push(lathe(dish(0.25, 0.185), 18, X, 0.42, z, 0, 0, -H), cyl(0.25, 0.25, 0.15, 12, X - 0.105, 0.42, z, 0, 0, H), cyl(0.07, 0.07, 0.34, 8, X - 0.1, 0.42, z, 0, 0, H));
      for (let b = 0; b < 8; b++) { const a = b / 8 * PI * 2; stl.push(cyl(0.014, 0.014, 0.02, 6, X + 0.13, 0.42 + Math.sin(a) * 0.155, z + Math.cos(a) * 0.155, 0, 0, H)); }
      hub.push(rod(1.13, 0.66, z + 0.34, 1.3, 0.42, z, 0.05, 6, 0.045), cyl(0.07, 0.07, 0.1, 8, 1.15, 0.66, z + 0.34, 0, 0, H));   // swing arm and its pivot
    }
    stl.push(rod(1.17, 0.95, -2.75, 1.25, 0.5, -2.92, 0.03, 6), rod(1.17, 0.95, 3.2, 1.25, 0.5, 2.98, 0.03, 6));   // dampers on the end stations
    // drive sprocket: drum, two toothed rings, bolted hub
    hub.push(cyl(0.3, 0.3, 0.3, 16, X, 0.55, -3.95, 0, 0, H), lathe(dish(0.31, 0.2), 18, X, 0.55, -3.95, 0, 0, -H));
    for (const o of [-0.13, 0.13]) { stl.push(lathe([[0.28, o - 0.018], [0.37, o - 0.018], [0.37, o + 0.018], [0.28, o + 0.018], [0.28, o - 0.018]], 20, X, 0.55, -3.95, 0, 0, -H));
      for (let k = 0; k < 13; k++) { const a = k / 13 * PI * 2; stl.push(box(0.035, 0.085, 0.06, X + o, 0.55 + Math.sin(a) * 0.395, -3.95 + Math.cos(a) * 0.395, -a + H, 0, 0)); } }
    for (let b = 0; b < 10; b++) { const a = b / 10 * PI * 2; stl.push(cyl(0.015, 0.015, 0.02, 6, X + 0.145, 0.55 + Math.sin(a) * 0.2, -3.95 + Math.cos(a) * 0.2, 0, 0, H)); }
    // idler: steel-rimmed, spoked
    hub.push(lathe(ringP(0.3, 0.38, 0.1, 0.13), 20, X, 0.55, 3.95, 0, 0, -H), lathe(ringP(0.3, 0.38, -0.1, 0.13), 14, X, 0.55, 3.95, 0, 0, -H), cyl(0.1, 0.1, 0.36, 10, X, 0.55, 3.95, 0, 0, H), cyl(0.06, 0.06, 0.42, 8, X, 0.55, 3.95, 0, 0, H));
    for (let k = 0; k < 6; k++) { const a = k / 6 * PI * 2; hub.push(box(0.05, 0.24, 0.07, X + 0.1, 0.55 + Math.sin(a) * 0.2, 3.95 + Math.cos(a) * 0.2, -a + H, 0, 0)); }
    hub.push(rod(1.13, 0.75, 3.55, 1.34, 0.55, 3.95, 0.05, 6));
    for (let k = 0; k < 3; k++) { tyre.push(cyl(0.1, 0.1, 0.13, 12, X + 0.09, 0.85, -2.2 + k * 2.2, 0, 0, H), cyl(0.1, 0.1, 0.13, 10, X - 0.09, 0.85, -2.2 + k * 2.2, 0, 0, H)); hub.push(cyl(0.05, 0.05, 0.45, 8, X - 0.1, 0.85, -2.2 + k * 2.2, 0, 0, H)); }
    // the track: a closed path round the sprocket, along the top over the rollers, round the idler, along the ground
    const path = [], arc = (cz, cy, R, a0, a1, n) => { for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; path.push([cz + Math.cos(a) * R, cy + Math.sin(a) * R]); } };
    for (let i = 1; i < 24; i++) { const z = -3.95 + 7.9 * i / 24; path.push([z, 0.985 - 0.012 * Math.sin((z + 3.95) / 7.9 * PI) - 0.014 * Math.abs(Math.sin((z + 2.2) / 2.2 * PI))]); }
    arc(3.95, 0.55, 0.435, H, -1.43, 12); path.push([3.05, 0.057], [-3.15, 0.057]); arc(-3.95, 0.55, 0.455, -H - 0.14, -H - PI, 12);
    for (const q of walk(path, 0.152)) {
      const ph = Math.atan2(-q.tv, q.tu), t = (g) => place(g, X, q.v, q.u, ph, 0, 0);
      trk.push(t(box(0.44, 0.04, 0.134, 0, 0, 0)), t(box(0.44, 0.03, 0.04, 0, 0.032, 0.03)), t(box(0.05, 0.07, 0.07, 0, -0.05, 0)), t(box(0.05, 0.05, 0.16, -0.235, 0, 0.07)), t(box(0.05, 0.05, 0.16, 0.235, 0, 0.07)));
      rubP.push(t(box(0.3, 0.024, 0.085, 0, 0.03, -0.022)));
    }
    B.sym(VM.rubber, tyre, rubP); B.sym(PAINT, hub); B.sym(VM.steel, stl); B.sym(VM.track, trk);
  }

  // ---- bow: trim vane folded back on its hinges, rams, shackles, lights behind brush guards, tow cable, spare links
  {
    const vane = [cbox(2.9, 0.06, 1.25, 0.015, 0, 0, 0)];
    for (const x of [-1.2, -0.6, 0, 0.6, 1.2]) vane.push(box(0.05, 0.05, 1.16, x, 0.05, 0));
    vane.push(box(2.8, 0.05, 0.05, 0, 0.05, -0.58), box(2.8, 0.05, 0.05, 0, 0.05, 0.58));
    for (const x of [-1.1, -0.37, 0.37, 1.1]) vane.push(cyl(0.035, 0.035, 0.22, 8, x, -0.01, -0.63, 0, 0, H));
    B.add(PAINT, xf(vane, 0, 1.25, -4.62, -1.0, 0, 0));
    B.add(PAINT, xf(bolts([-1.3, -0.9, -0.3, 0.3, 0.9, 1.3].flatMap((x) => [[x, 0.08, -0.58], [x, 0.08, 0.58]]), 'y'), 0, 1.25, -4.62, -1.0, 0, 0));
    for (const s of [-1, 1]) {
      B.add(VM.steel, rod(s * 1.5, 1.5, -4.3, s * 1.5, 1.05, -4.72, 0.028, 8), cyl(0.04, 0.04, 0.1, 8, s * 1.5, 0.98, -4.78, 0, 0, H));
      B.add(PAINT, rod(s * 1.5, 1.62, -4.2, s * 1.5, 1.36, -4.44, 0.045, 8), box(0.12, 0.1, 0.12, s * 1.5, 1.62, -4.2, GL, 0, 0));
      // tow shackles on the lower bow plate
      B.add(PAINT, box(0.05, 0.16, 0.14, s * 0.72, 0.78, -4.57, 0.7, 0, 0), box(0.05, 0.16, 0.14, s * 0.88, 0.78, -4.57, 0.7, 0, 0));
      B.add(VM.steel, cyl(0.02, 0.02, 0.24, 6, s * 0.8, 0.76, -4.62, 0, 0, H), torus(0.075, 0.022, 6, 12, s * 0.8, 0.69, -4.66, 0.5, H, 0));
      // headlight cluster: main lamp, blackout lamp, guard
      const hy = glY(-3.75), hx = s * 1.2;
      B.add(PAINT, cbox(0.42, 0.04, 0.26, 0.01, hx, hy + 0.02, -3.75, GL, 0, 0), cyl(0.1, 0.085, 0.16, 14, hx - s * 0.08, hy + 0.14, -3.74, H, 0, 0), cyl(0.06, 0.05, 0.12, 10, hx + s * 0.12, hy + 0.1, -3.76, H, 0, 0));
      B.add(VM.light, cyl(0.085, 0.085, 0.012, 14, hx - s * 0.08, hy + 0.14, -3.822, H, 0, 0)); B.add(VM.glass, cyl(0.045, 0.045, 0.012, 10, hx + s * 0.12, hy + 0.1, -3.822, H, 0, 0));
      B.add(VM.steel, tube([[hx - 0.24, hy - 0.02, -3.9], [hx - 0.24, hy + 0.27, -3.88], [hx + 0.24, hy + 0.27, -3.88], [hx + 0.24, hy - 0.02, -3.9]], 0.011, 5, false, 5, 0.1),
        tube([[hx - 0.24, hy + 0.02, -3.62], [hx - 0.24, hy + 0.27, -3.88]], 0.011, 5), tube([[hx + 0.24, hy + 0.02, -3.62], [hx + 0.24, hy + 0.27, -3.88]], 0.011, 5), rod(hx, hy - 0.02, -3.9, hx, hy + 0.27, -3.88, 0.009, 5), rod(hx - 0.24, hy + 0.13, -3.89, hx + 0.24, hy + 0.13, -3.89, 0.009, 5));
    }
    // tow cable laid round the glacis, eyes dropped over hooks
    const cab = [[-1.02, -4.25], [-1.12, -3.95], [-1.0, -3.42], [-0.6, -3.3], [0, -3.34], [0.6, -3.3], [1.0, -3.42], [1.12, -3.95], [1.02, -4.25]].map(([x, z]) => [x, glY(z) + 0.022, z]);
    B.add(VM.steel, tube(cab, 0.017, 6, false, 5), torus(0.05, 0.016, 5, 10, -1.02, glY(-4.3) + 0.02, -4.3, H + GL, 0, 0), torus(0.05, 0.016, 5, 10, 1.02, glY(-4.3) + 0.02, -4.3, H + GL, 0, 0));
    for (const x of [-1.02, 1.02]) B.add(PAINT, rod(x, glY(-4.3), -4.3, x, glY(-4.3) + 0.07, -4.32, 0.02, 6), box(0.1, 0.03, 0.1, x, glY(-3.42) + 0.04, -3.42, GL, 0, 0));
    for (let k = 0; k < 4; k++) { B.add(VM.track, xf([cbox(0.4, 0.045, 0.14, 0.01, 0, 0.03, 0), box(0.4, 0.03, 0.04, 0, 0.065, 0.03), box(0.05, 0.05, 0.16, -0.21, 0.03, 0.06), box(0.05, 0.05, 0.16, 0.21, 0.03, 0.06)], 0, glY(-4.1 + k * 0.155), -4.1 + k * 0.155, GL, 0, 0)); }
    B.add(PAINT, box(0.5, 0.02, 0.04, 0, glY(-4.2) + 0.08, -4.2, GL, 0, 0), box(0.5, 0.02, 0.04, 0, glY(-3.55) + 0.08, -3.55, GL, 0, 0));
  }

  // ---- roof: driver's hatch and periscopes, engine deck, troop hatches, vents, rails, eyes, antennas
  {
    B.add(PAINT, cylO(0.37, 0.39, 0.07, 20, 0.7, 2.235, -2.4), lathe([[0, 0], [0.36, 0], [0.36, 0.035], [0.3, 0.075], [0.12, 0.09], [0, 0.09]], 20, 0.7, 2.25, -2.4),
      box(0.3, 0.04, 0.12, 0.7, 2.3, -1.98), cyl(0.03, 0.03, 0.34, 8, 0.7, 2.31, -1.94, 0, 0, H), box(0.08, 0.05, 0.1, 0.7, 2.345, -2.52));
    B.add(VM.steel, tube([[0.6, 2.335, -2.3], [0.6, 2.39, -2.3], [0.8, 2.39, -2.3], [0.8, 2.335, -2.3]], 0.01, 5, false, 4, 0.1));
    for (let k = 0; k < 3; k++) { const a = (k - 1) * 0.55, px = 0.7 + Math.sin(a) * 0.5, pz = -2.4 - Math.cos(a) * 0.5;
      B.add(PAINT, cbox(0.24, 0.13, 0.15, 0.015, px, 2.265, pz, 0, -a, 0), box(0.26, 0.015, 0.08, px - Math.sin(a) * 0.09, 2.34, pz - Math.cos(a) * 0.09, 0, -a, 0));
      B.add(VM.glass, box(0.19, 0.075, 0.02, px + Math.sin(a) * 0.07, 2.275, pz - Math.cos(a) * 0.07, -0.25, -a, 0)); }
    // engine deck (front left): bolted access plate, radiator grille, intake mushroom, lifting handles
    B.add(PAINT, cbox(1.2, 0.03, 1.5, 0.008, -0.6, 2.213, -2.3), box(0.74, 0.03, 0.04, -0.6, 2.24, -2.02), box(0.74, 0.03, 0.04, -0.6, 2.24, -2.78), box(0.04, 0.03, 0.8, -0.97, 2.24, -2.4), box(0.04, 0.03, 0.8, -0.23, 2.24, -2.4),
      cyl(0.11, 0.13, 0.1, 12, -0.95, 2.26, -1.8), lathe([[0, 0], [0.17, 0], [0.17, 0.02], [0.1, 0.06], [0, 0.065]], 12, -0.95, 2.31, -1.8));
    B.add(VM.void, box(0.7, 0.012, 0.72, -0.6, 2.23, -2.4));
    for (let k = 0; k < 11; k++) B.add(PAINT, box(0.7, 0.035, 0.012, -0.6, 2.245, -2.72 + k * 0.064, 0.6, 0, 0));
    B.add(PAINT, bolts([...Array(8)].flatMap((_, k) => [[-1.15 + k * 0.157, 2.232, -3.0], [-1.15 + k * 0.157, 2.232, -1.6]]).concat([...Array(7)].flatMap((_, k) => [[-1.16, 2.232, -2.82 + k * 0.175], [-0.04, 2.232, -2.82 + k * 0.175]])), 'y', 0.016));
    B.add(VM.steel, tube([[-0.4, 2.23, -1.75], [-0.4, 2.28, -1.75], [-0.2, 2.28, -1.75], [-0.2, 2.23, -1.75]], 0.01, 5, false, 4, 0.1));
    for (const s of [-1, 1]) {
      // troop compartment hatches: coaming, lid, torsion-bar hinge outboard, latch and handle inboard
      B.add(PAINT, box(0.7, 0.04, 0.04, s * 0.5, 2.22, 2.1), box(0.7, 0.04, 0.04, s * 0.5, 2.22, 3.42), box(0.04, 0.04, 1.36, s * 0.16, 2.22, 2.76), box(0.04, 0.04, 1.36, s * 0.84, 2.22, 2.76),
        cbox(0.62, 0.035, 1.26, 0.01, s * 0.5, 2.25, 2.76), cyl(0.028, 0.028, 1.2, 8, s * 0.84, 2.27, 2.76, H, 0, 0), box(0.1, 0.03, 0.1, s * 0.78, 2.275, 2.3), box(0.1, 0.03, 0.1, s * 0.78, 2.275, 3.22), box(0.08, 0.04, 0.12, s * 0.24, 2.285, 2.76));
      B.add(VM.steel, tube([[s * 0.34, 2.268, 2.5], [s * 0.34, 2.32, 2.5], [s * 0.34, 2.32, 2.7], [s * 0.34, 2.268, 2.7]], 0.01, 5, false, 4, 0.1));
      // tie-down rail along the roof edge, grab handles on the slope, lifting eyes at the corners
      B.add(VM.steel, tube([[s * 1.32, 2.2, -2.9], [s * 1.32, 2.29, -2.84], [s * 1.32, 2.29, -1.86], [s * 1.32, 2.2, -1.8]], 0.013, 5, false, 4, 0.1), tube([[s * 1.32, 2.2, 1.05], [s * 1.32, 2.29, 1.11], [s * 1.32, 2.29, 2.0], [s * 1.32, 2.2, 2.06]], 0.013, 5, false, 4, 0.1));
      B.add(PAINT, eye(s * 1.25, 2.2, -3.0, H), eye(s * 1.25, 2.2, 4.3, H));
      B.add(PAINT, cyl(0.07, 0.09, 0.08, 10, s * 0.25, 2.24, 3.75), lathe([[0, 0], [0.11, 0], [0.11, 0.02], [0.06, 0.05], [0, 0.055]], 10, s * 0.25, 2.28, 3.75));
    }
    B.add(VM.steel, whip(-1.12, 2.17, 4.3, 2.1, -0.08), whip(1.12, 2.17, 4.3, 1.5, -0.05));
    B.add(PAINT, cbox(0.14, 0.1, 0.14, 0.02, -1.12, 2.2, 4.3), cbox(0.14, 0.1, 0.14, 0.02, 1.12, 2.2, 4.3));
    // turret ring
    B.add(PAINT, cylO(1.0, 1.04, 0.06, 36, 0, 2.23, -0.4), place(new THREE.RingGeometry(0.9, 1.0, 36), 0, 2.26, -0.4, -H, 0, 0));
    B.add(PAINT, bolts([...Array(28)].map((_, k) => [Math.cos(k / 28 * PI * 2) * 0.95, 2.266, -0.4 + Math.sin(k / 28 * PI * 2) * 0.95]), 'y', 0.018));
  }
  // ---- stowage: bedroll and packs on the rear deck, pioneer tools on the right slope, jerrycans and a locker on the stern
  {
    const br = bedroll(-1.12, 2.33, 2.75, 1.15, 0.13); B.add(VM.canvas, br.roll); B.add(VM.rubber, br.straps);
    B.add(VM.canvas, pack(1.1, 2.2, 2.45, 0.34, 0.3, 0.5, 0.06), pack(1.1, 2.2, 3.08, 0.36, 0.26, 0.46, -0.1));
    B.add(VM.steel, tube([[-1.3, 2.2, 2.4], [-1.12, 2.47, 2.4], [-0.94, 2.2, 2.4]], 0.006, 4), tube([[-1.3, 2.2, 3.1], [-1.12, 2.47, 3.1], [-0.94, 2.2, 3.1]], 0.006, 4));
    // shovel and pick handle clamped to the slope armour, right side forward
    const on = (d, o, z) => [1.6 + sn[0] * o - 0.584 * d, 1.95 + sn[1] * o + 0.811 * d, z];
    B.add(VM.olive, rod(...on(0.1, 0.09, -2.9), ...on(0.1, 0.09, -1.75), 0.02, 6), rod(...on(-0.08, 0.09, -2.7), ...on(-0.08, 0.09, -1.5), 0.022, 6));
    B.add(VM.steel, cbox(0.02, 0.2, 0.28, 0.006, ...on(0.1, 0.085, -1.6), 0, 0, SL), box(0.05, 0.05, 0.04, ...on(0.1, 0.085, -2.35), 0, 0, SL), box(0.05, 0.05, 0.04, ...on(-0.08, 0.085, -2.2), 0, 0, SL), box(0.05, 0.05, 0.04, ...on(0.1, 0.085, -2.85), 0, 0, SL), cbox(0.03, 0.06, 0.34, 0.008, ...on(-0.08, 0.09, -1.42), 0, 0, SL));
    // stern left: two jerrycans in a strap rack; stern right: stowage locker
    B.add(VM.olive, jerrycan(-1.02, 1.3, 4.7, 0), jerrycan(-1.42, 1.3, 4.7, 0));
    B.add(PAINT, box(0.86, 0.03, 0.2, -1.22, 1.29, 4.7), box(0.86, 0.03, 0.02, -1.22, 1.5, 4.8), box(0.02, 0.24, 0.02, -1.64, 1.4, 4.8), box(0.02, 0.24, 0.02, -0.8, 1.4, 4.8),
      cbox(0.74, 0.5, 0.26, 0.02, 1.25, 1.5, 4.73), box(0.76, 0.02, 0.28, 1.25, 1.66, 4.73));
    B.add(VM.rubber, box(0.88, 0.04, 0.012, -1.22, 1.6, 4.79));
    B.add(VM.steel, box(0.05, 0.07, 0.02, 1.05, 1.62, 4.87), box(0.05, 0.07, 0.02, 1.45, 1.62, 4.87), tube([[1.15, 1.45, 4.86], [1.15, 1.45, 4.9], [1.35, 1.45, 4.9], [1.35, 1.45, 4.86]], 0.008, 4, false, 4, 0.1));
  }
  // ---- stern: ramp frame and hinges, the dark of the troop compartment, waterjets with their buckets, lamps, pintle, flap
  {
    B.add(VM.void, box(1.56, 1.1, 0.02, 0, 1.53, 4.602));
    B.add(PAINT, box(1.8, 0.07, 0.06, 0, 2.11, 4.62), box(0.07, 1.2, 0.06, -0.86, 1.52, 4.62), box(0.07, 1.2, 0.06, 0.86, 1.52, 4.62), box(1.8, 0.06, 0.08, 0, 0.92, 4.63));
    for (const x of [-0.6, 0, 0.6]) B.add(PAINT, cyl(0.045, 0.045, 0.2, 10, x, 0.95, 4.66, 0, 0, H), box(0.18, 0.12, 0.06, x, 0.88, 4.63));
    for (const s of [-1, 1]) {
      B.add(PAINT, duct(0.27, 0.03, 0.34, 18, s * 1.2, 0.82, 4.72, H, 0, 0), torus(0.27, 0.025, 6, 18, s * 1.2, 0.82, 4.89), torus(0.27, 0.02, 6, 18, s * 1.2, 0.82, 4.6));
      B.add(PAINT, cbox(0.62, 0.04, 0.34, 0.012, s * 1.2, 1.15, 4.98, 0.75, 0, 0), box(0.04, 0.34, 0.06, s * 0.9, 1.0, 4.9, 0.3, 0, 0), box(0.04, 0.34, 0.06, s * 1.5, 1.0, 4.9, 0.3, 0, 0), cbox(0.04, 0.3, 0.3, 0.01, s * 0.9, 0.84, 4.98), cbox(0.04, 0.3, 0.3, 0.01, s * 1.5, 0.84, 4.98));   // reversing bucket, raised, and its cheeks
      B.add(VM.void, cyl(0.25, 0.25, 0.02, 18, s * 1.2, 0.82, 4.62, H, 0, 0));
      B.add(VM.steel, cyl(0.05, 0.05, 0.3, 8, s * 1.2, 0.82, 4.7, H, 0, 0), box(0.5, 0.015, 0.1, s * 1.2, 0.82, 4.72), box(0.015, 0.5, 0.1, s * 1.2, 0.82, 4.72));
      // tail lamp in its guard, reflector
      B.add(PAINT, cbox(0.2, 0.14, 0.08, 0.015, s * 1.5, 1.92, 4.64)); B.add(VM.red, cyl(0.045, 0.045, 0.03, 10, s * 1.5, 1.92, 4.69, H, 0, 0));
      B.add(VM.steel, rod(s * 1.42, 1.86, 4.71, s * 1.58, 1.86, 4.71, 0.007, 4), rod(s * 1.42, 1.98, 4.71, s * 1.58, 1.98, 4.71, 0.007, 4), rod(s * 1.42, 1.86, 4.71, s * 1.42, 1.98, 4.71, 0.007, 4), rod(s * 1.58, 1.86, 4.71, s * 1.58, 1.98, 4.71, 0.007, 4), rod(s * 1.5, 1.86, 4.71, s * 1.5, 1.98, 4.71, 0.007, 4));
    }
    B.add(PAINT, cbox(2.9, 0.05, 0.6, 0.012, 0, 0.5, 4.83, 0.5, 0, 0), box(0.3, 0.14, 0.14, 0, 0.74, 4.66));
    for (const x of [-1.1, -0.4, 0.4, 1.1]) B.add(PAINT, box(0.05, 0.05, 0.56, x, 0.47, 4.85, 0.5, 0, 0));
    B.add(VM.steel, torus(0.06, 0.022, 6, 12, 0, 0.74, 4.76, H, 0, 0), cyl(0.025, 0.025, 0.12, 6, 0, 0.74, 4.72));
  }
  B.build(root);

  // ---- rear troop ramp (hinged at the bottom; opens outward/down) with its personnel door
  const ramp = new THREE.Group(); ramp.name = 'ramp'; ramp.position.set(0, 0.95, 4.62);
  {
    const R = new Builder(), RP = VM.ifvUp;
    R.add(RP, cbox(1.62, 1.14, 0.09, 0.015, 0, 0.6, 0.03), box(1.5, 0.05, 0.03, 0, 1.08, 0.085), box(1.5, 0.05, 0.03, 0, 0.12, 0.085), box(0.05, 0.92, 0.03, -0.74, 0.6, 0.085), box(0.05, 0.92, 0.03, 0.74, 0.6, 0.085),
      cbox(0.62, 0.86, 0.035, 0.01, -0.3, 0.6, 0.09), cbox(0.2, 0.13, 0.05, 0.012, -0.3, 0.86, 0.115), box(0.06, 0.14, 0.03, -0.62, 0.84, 0.1), box(0.06, 0.14, 0.03, -0.62, 0.36, 0.1),
      cbox(0.56, 0.4, 0.035, 0.01, 0.38, 0.78, 0.09), cbox(0.56, 0.34, 0.035, 0.01, 0.38, 0.34, 0.09));
    R.add(VM.glass, box(0.14, 0.07, 0.012, -0.3, 0.86, 0.143));
    R.add(VM.steel, rod(-0.06, 0.62, 0.125, -0.06, 0.46, 0.125, 0.012, 6), cyl(0.022, 0.022, 0.05, 8, -0.06, 0.62, 0.11, H, 0, 0), cyl(0.014, 0.014, 0.15, 6, -0.62, 0.84, 0.118), cyl(0.014, 0.014, 0.15, 6, -0.62, 0.36, 0.118),
      tube([[0.2, 0.98, 0.1], [0.2, 0.98, 0.15], [0.56, 0.98, 0.15], [0.56, 0.98, 0.1]], 0.01, 5, false, 4, 0.1), bolts([[0.14, 0.94, 0.108], [0.62, 0.94, 0.108], [0.14, 0.62, 0.108], [0.62, 0.62, 0.108], [0.14, 0.48, 0.108], [0.62, 0.48, 0.108], [0.14, 0.2, 0.108], [0.62, 0.2, 0.108]], 'z'));
    for (let k = 0; k < 9; k++) R.add(RP, box(1.44, 0.03, 0.014, 0, 0.14 + k * 0.115, -0.02));   // tread bars on the walking face
    R.add(RP, box(1.66, 0.03, 0.02, 0, 1.16, -0.005), box(0.03, 1.1, 0.02, -0.815, 0.6, -0.01), box(0.03, 1.1, 0.02, 0.815, 0.6, -0.01));
    R.build(ramp); root.add(ramp);
  }

  // ---- unmanned turret
  const tur = new THREE.Group(); tur.name = 'turret'; tur.position.set(0, 2.2, -0.4);
  const T = new Builder(), TP = VM.ifvUp;
  T.add(TP, vloft([
    { y: 0.04, pts: [[-0.55, -1.0], [0.55, -1.0], [0.84, -0.6], [0.84, 0.75], [0.6, 1.05], [-0.6, 1.05], [-0.84, 0.75], [-0.84, -0.6]] },
    { y: 0.3, pts: [[-0.5, -1.2], [0.5, -1.2], [0.92, -0.65], [0.92, 0.8], [0.62, 1.15], [-0.62, 1.15], [-0.92, 0.8], [-0.92, -0.65]] },
    { y: 0.62, pts: [[-0.42, -0.85], [0.42, -0.85], [0.78, -0.5], [0.78, 0.7], [0.52, 1.0], [-0.52, 1.0], [-0.78, 0.7], [-0.78, -0.5]] },
  ]), cylO(0.86, 0.86, 0.07, 32, 0, 0.035, 0));
  // weld beads round the waist and the roof, side applique, roof hatch, eyes
  { const waist = [[-0.5, -1.2], [0.5, -1.2], [0.92, -0.65], [0.92, 0.8], [0.62, 1.15], [-0.62, 1.15], [-0.92, 0.8], [-0.92, -0.65]], top = [[-0.42, -0.85], [0.42, -0.85], [0.78, -0.5], [0.78, 0.7], [0.52, 1.0], [-0.52, 1.0], [-0.78, 0.7], [-0.78, -0.5]];
    for (let i = 0; i < 8; i++) { const j = (i + 1) % 8; T.add(TP, rod(waist[i][0], 0.3, waist[i][1], waist[j][0], 0.3, waist[j][1], 0.012, 5, 0.012, true), rod(top[i][0], 0.62, top[i][1], top[j][0], 0.62, top[j][1], 0.012, 5, 0.012, true), rod(waist[i][0], 0.3, waist[i][1], top[i][0], 0.62, top[i][1], 0.012, 5, 0.012, true)); } }
  for (const s of [-1, 1]) {
    T.add(TP, cbox(0.035, 0.24, 1.2, 0.01, s * 0.915, 0.16, 0.08, 0, 0, s * -0.3), cbox(0.035, 0.24, 1.15, 0.01, s * 0.89, 0.47, 0.1, 0, 0, s * 0.41));
    T.add(TP, boltsN([[s * 0.94, 0.19, -0.4], [s * 0.94, 0.19, 0.56]], [s, -0.3, 0], 0.016), boltsN([[s * 0.905, 0.5, -0.36], [s * 0.905, 0.5, 0.56]], [s, 0.42, 0], 0.016));
    T.add(TP, eye(s * 0.6, 0.62, -0.55, 0, 0.04, 0.012));
    // smoke dischargers: a bank of four on a bracket, splayed
    T.add(TP, cbox(0.1, 0.3, 0.42, 0.012, s * 0.97, 0.36, -0.2, 0, s * 0.25, 0));
    for (let k = 0; k < 4; k++) { const px = s * (1.04 + (k % 2) * 0.03), py = 0.28 + Math.floor(k / 2) * 0.125, pz = -0.3 + (k % 2) * 0.13 - Math.floor(k / 2) * 0.04, yaw = -s * (0.45 + (k % 2) * 0.22);
      T.add(VM.gun, duct(0.047, 0.008, 0.24, 10, 0, 0.12, 0).rotateX(-1.0).rotateY(yaw).translate(px, py, pz), cyl(0.04, 0.04, 0.02, 10, 0, 0.2, 0).rotateX(-1.0).rotateY(yaw).translate(px, py, pz), cyl(0.05, 0.05, 0.03, 10, 0, 0.0, 0).rotateX(-1.0).rotateY(yaw).translate(px, py, pz)); }
  }
  T.add(TP, eye(0, 0.62, 0.85, 0, 0.04, 0.012), cbox(0.52, 0.03, 0.6, 0.008, 0.26, 0.635, 0.3), cyl(0.02, 0.02, 0.5, 6, 0.26, 0.655, 0.62, 0, 0, H), box(0.08, 0.03, 0.08, 0.1, 0.65, 0.6), box(0.08, 0.03, 0.08, 0.42, 0.65, 0.6));
  T.add(VM.steel, tube([[0.16, 0.65, 0.06], [0.16, 0.7, 0.06], [0.36, 0.7, 0.06], [0.36, 0.65, 0.06]], 0.01, 5, false, 4, 0.1));
  // mantlet: trunnion drum, cheeks, lifting lug
  T.add(TP, cbox(0.56, 0.5, 0.3, 0.03, 0, 0.32, -1.2), cyl(0.24, 0.24, 0.6, 16, 0, 0.32, -1.28, 0, 0, H), cbox(0.08, 0.56, 0.46, 0.015, -0.33, 0.32, -1.12), cbox(0.08, 0.56, 0.46, 0.015, 0.33, 0.32, -1.12));
  T.add(TP, bolts([[-0.375, 0.5, -1.2], [-0.375, 0.14, -1.2], [-0.375, 0.5, -1.0], [-0.375, 0.14, -1.0]], 'x'), bolts([[0.375, 0.5, -1.2], [0.375, 0.14, -1.2], [0.375, 0.5, -1.0], [0.375, 0.14, -1.0]], 'x'));
  // ATGM launcher on the left: twin tubes in an armoured box on an arm
  T.add(TP, cbox(0.34, 0.42, 1.3, 0.025, -1.14, 0.56, -0.05), cbox(0.14, 0.2, 0.3, 0.02, -0.94, 0.5, 0.25), box(0.36, 0.03, 0.06, -1.14, 0.78, -0.5), box(0.36, 0.03, 0.06, -1.14, 0.78, 0.4));
  for (const k of [0, 1]) { T.add(VM.gun, cyl(0.075, 0.075, 0.03, 14, -1.14, 0.47 + k * 0.18, -0.705, H, 0, 0), cyl(0.075, 0.075, 0.03, 14, -1.14, 0.47 + k * 0.18, 0.605, H, 0, 0)); T.add(TP, torus(0.08, 0.012, 5, 14, -1.14, 0.47 + k * 0.18, -0.7)); }
  T.add(VM.steel, bolts([[-1.315, 0.72, -0.5], [-1.315, 0.4, -0.5], [-1.315, 0.72, 0.4], [-1.315, 0.4, 0.4]].map(([x, y, z]) => [x, y, z]), 'x'));
  // gunner's sight (right front) under an armoured hood; commander's panoramic sight (left rear); laser warning; wind mast
  T.add(TP, cbox(0.42, 0.34, 0.42, 0.025, 0.48, 0.79, -0.42), box(0.46, 0.02, 0.2, 0.48, 0.975, -0.6, 0.12, 0, 0), box(0.02, 0.2, 0.14, 0.26, 0.86, -0.64), box(0.02, 0.2, 0.14, 0.7, 0.86, -0.64));
  T.add(VM.lens, box(0.3, 0.17, 0.02, 0.48, 0.82, -0.635)); T.add(VM.lens, box(0.1, 0.08, 0.02, 0.36, 0.69, -0.635));
  T.add(TP, cyl(0.15, 0.17, 0.12, 14, -0.4, 0.68, 0.3), cyl(0.165, 0.165, 0.3, 14, -0.4, 0.89, 0.3), lathe([[0, 0], [0.175, 0], [0.175, 0.02], [0.1, 0.05], [0, 0.05]], 14, -0.4, 1.04, 0.3), cbox(0.2, 0.2, 0.06, 0.015, -0.4, 0.9, 0.15));
  T.add(VM.lens, box(0.15, 0.13, 0.02, -0.4, 0.9, 0.115));
  for (const [x, z, ry] of [[-0.7, -0.4, 0.8], [0.7, 0.62, -2.3]]) { T.add(TP, cbox(0.1, 0.09, 0.1, 0.012, x, 0.665, z, 0, ry, 0)); T.add(VM.lens, box(0.06, 0.04, 0.012, x - Math.sin(ry) * 0.05, 0.672, z - Math.cos(ry) * 0.05, 0, ry, 0)); }
  T.add(VM.gun, rod(0.62, 0.62, 0.88, 0.62, 1.12, 0.88, 0.012, 5), cyl(0.03, 0.03, 0.07, 8, 0.62, 1.15, 0.88), whip(-0.62, 0.62, 0.86, 1.5, 0.06));
  // bustle rack: tube frame, mesh floor, and what the crew has thrown in it
  for (const y of [0.1, 0.46]) T.add(VM.steel, tube([[-0.6, y, 1.08], [-0.78, y, 1.2], [-0.78, y, 1.58], [0.78, y, 1.58], [0.78, y, 1.2], [0.6, y, 1.08]], 0.013, 5, false, 3, 0.0));
  for (const x of [-0.78, -0.39, 0, 0.39, 0.78]) T.add(VM.steel, rod(x, 0.1, 1.58, x, 0.46, 1.58, 0.01, 5));
  T.add(VM.steel, rod(-0.78, 0.1, 1.2, -0.78, 0.46, 1.2, 0.01, 5), rod(0.78, 0.1, 1.2, 0.78, 0.46, 1.2, 0.01, 5));
  T.add(VM.gun, box(1.54, 0.012, 0.44, 0, 0.1, 1.37));
  T.add(VM.canvas, pack(-0.5, 0.11, 1.36, 0.42, 0.3, 0.34, 0.1), pack(0.48, 0.11, 1.38, 0.36, 0.32, 0.32, -0.08));
  { const br = bedroll(0, 0.56, 1.5, 1.2, 0.1, H); T.add(VM.canvas, br.roll); T.add(VM.gun, br.straps); }
  T.add(TP, cbox(0.3, 0.19, 0.15, 0.015, -0.02, 0.21, 1.3), cbox(0.3, 0.19, 0.15, 0.015, -0.02, 0.21, 1.47), box(0.1, 0.012, 0.03, -0.02, 0.312, 1.3), box(0.1, 0.012, 0.03, -0.02, 0.312, 1.47));
  T.add(TP, bolts([...Array(20)].map((_, k) => [Math.cos(k / 20 * PI * 2) * 0.87, 0.035, Math.sin(k / 20 * PI * 2) * 0.87]).filter((p) => Math.abs(p[0]) > 0.3), 'x', 0.014, 0.02));
  // 30 mm gun in its own group: sleeve, stepped barrel, slotted muzzle brake, coax MG, canvas dust cover
  const barrel = new THREE.Group(); barrel.name = 'barrel';
  {
    const BR = new Builder();
    BR.add(VM.gun, lathe([[0, 0], [0.1, 0], [0.1, 0.14], [0.085, 0.17], [0.085, 0.56], [0.062, 0.6], [0.052, 0.62], [0.05, 1.3], [0.057, 1.32], [0.057, 1.5], [0.048, 1.52], [0.045, 2.56], [0.07, 2.58], [0.076, 2.6], [0.076, 2.84], [0.066, 2.87], [0.032, 2.87], [0.032, 2.56]], 16, 0, 0, 0, -H, 0, 0),
      rod(0.2, -0.04, -0.05, 0.2, -0.04, -0.5, 0.03, 8), rod(0.2, -0.04, -0.5, 0.2, -0.04, -0.82, 0.016, 8), cyl(0.024, 0.024, 0.06, 8, 0.2, -0.04, -0.84, H, 0, 0));
    for (let k = 0; k < 3; k++) BR.add(VM.gun, box(0.158, 0.034, 0.045, 0, 0, -2.64 - k * 0.075), box(0.034, 0.158, 0.045, 0, 0, -2.64 - k * 0.075));
    for (let k = 0; k < 8; k++) BR.add(VM.gun, box(0.012, 0.012, 0.36, Math.cos(k / 8 * PI * 2) * 0.086, Math.sin(k / 8 * PI * 2) * 0.086, -0.36, 0, 0, k / 8 * PI * 2));   // sleeve flutes
    BR.add(VM.canvas, lathe([[0.21, -0.12], [0.2, -0.02], [0.15, 0.08], [0.105, 0.17], [0.1, 0.17]], 14, 0, 0, 0, -H, 0, 0));
    BR.build(barrel); barrel.position.set(0, 0.32, -1.35); tur.add(barrel);
  }
  T.build(tur); root.add(tur);

  // ---- markings: hull number, bridge class disc, stencils
  {
    const S = new Sheet(1024, 256, 11), num = S.text(String(300 + Math.floor(Math.random() * 600)), { px: 150 });
    const cls = S.draw(128, 128, (g, w) => { g.fillStyle = '#c9a21a'; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 3, 0, PI * 2); g.fill(); g.fillStyle = '#141414'; g.font = 'bold 72px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('26', w / 2, w / 2 + 4); }, 0.3);
    const lift = S.text('LIFT', { px: 40, worn: 0.4 }), tie = S.text('TIE DOWN', { px: 40, worn: 0.4 }), chev = S.draw(120, 100, (g, w, h) => { g.strokeStyle = '#e8e4d6'; g.lineWidth = 16; g.beginPath(); g.moveTo(10, h - 12); g.lineTo(w / 2, 14); g.lineTo(w - 10, h - 12); g.stroke(); }, 0.35);
    for (const s of [-1, 1]) { S.side(num, 0.4, s, 1.848, 1.42, -1.62); S.side(chev, 0.26, s, 1.848, 1.42, 2.32); S.side(lift, 0.07, s, 1.848, 1.6, -2.6); S.side(tie, 0.06, s, 1.848, 1.24, 3.3); }
    S.put(cls, 0.3, 1.0, glY(-4.0) + 0.012, -4.0, -H + GL, 0, PI);
    S.put(num, 0.24, 1.25, 1.2, 4.612, 0, 0, 0);
    root.add(S.mesh());
  }
  shadows(root);
  root.userData.height = 3.2;
  return root;
}

// the hovercraft and the helicopters are still the earlier models
export { buildLCAC, buildUH60, buildGunship } from './vehicles_old.js';
