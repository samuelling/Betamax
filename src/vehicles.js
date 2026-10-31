// Detailed vehicle models, built once as templates and cloned (clones share geometry + materials).
//  - Invader amphibious IFV (fictional, Type 05 / EFV pattern): planing hull, hinged bow plane, transom flaps,
//    twin waterjets, 7 road wheels, unmanned 30mm turret with ATGM box, 2x4 smoke dischargers, rear troop door.
//  - LCAC: 26.4 x 14.3 m, segmented skirt, two shrouded 4-blade propellers aft with air rudders, rotatable bow
//    thrusters, side structures with control cab and engine intakes, 8.8 m bow ramp / 4.6 m stern ramp, tie-down rails.
//  - UH-60 Black Hawk: lofted fuselage, twin T700 nacelles beside the mast, 4-blade rotor, 20-degree canted tail rotor,
//    stabilator, wire-strike cutters, open cabin doors with door guns.
//  - Invader attack helicopter (fictional): tandem canopies, stub wings with rocket pods, chin cannon.
import * as THREE from 'three';
import { Builder, place, box, cyl, merge } from './world.js';

const sRGB = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);

// camo + grime material evaluated in object space (no UVs needed)
const CAMO = /* glsl */`
  varying vec3 vObj;
  uniform vec3 uC0, uC1, uC2, uC3; uniform float uScale, uDigital, uGrime, uChar;
  float vh(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  float vn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
    return mix(mix(mix(vh(i), vh(i+vec3(1,0,0)), f.x), mix(vh(i+vec3(0,1,0)), vh(i+vec3(1,1,0)), f.x), f.y),
               mix(mix(vh(i+vec3(0,0,1)), vh(i+vec3(1,0,1)), f.x), mix(vh(i+vec3(0,1,1)), vh(i+vec3(1,1,1)), f.x), f.y), f.z); }
  vec3 vehColor(out float rough){
    vec3 p = vObj * uScale;
    if (uDigital > 0.5) p = floor(p * 4.0) / 4.0;
    float a = vn(p) * 0.6 + vn(p * 2.3 + 7.0) * 0.4;
    float b = vn(p * 1.3 + 31.0);
    vec3 c = uC0;
    c = mix(c, uC1, step(0.55, a));
    c = mix(c, uC2, step(0.63, b));
    c = mix(c, uC3, step(0.74, vn(p * 1.9 + 13.0)));
    // grime: mud and sand toward the bottom, vertical streaks, edge dust
    float low = 1.0 - smoothstep(0.2, 1.6, vObj.y);
    float streak = vn(vec3(vObj.x * 6.0, vObj.y * 0.6, vObj.z * 6.0));
    c = mix(c, vec3(0.42, 0.36, 0.27), low * 0.75 * uGrime);
    c *= 1.0 - 0.18 * smoothstep(0.55, 0.9, streak) * uGrime;
    c = mix(c, c * vec3(1.08, 1.02, 0.92), vn(vObj * 3.0) * 0.25);
    rough = 0.62 + 0.25 * vn(vObj * 9.0) + low * 0.1;
    if (uChar > 0.5) { // burnt-out wreck: soot, scorched paint, rust
      float r = vn(vObj * 2.5);
      c = mix(vec3(0.03, 0.028, 0.026), vec3(0.16, 0.09, 0.05), smoothstep(0.62, 0.9, r) * 0.5);
      rough = 0.95;
    }
    return c;
  }`;

export function vehMat(c0, c1, c2, c3, { scale = 0.6, digital = 0, grime = 1, metal = 0.25, char = 0 } = {}) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: metal });
  const u = {
    uC0: { value: sRGB(...c0) }, uC1: { value: sRGB(...c1) }, uC2: { value: sRGB(...c2) }, uC3: { value: sRGB(...c3) },
    uScale: { value: scale }, uDigital: { value: digital }, uGrime: { value: grime }, uChar: { value: char },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + CAMO)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'float vRough; vec4 diffuseColor = vec4(vehColor(vRough), opacity);')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRough;');
  };
  m.customProgramCacheKey = () => 'veh' + (char ? 'c' : '') + digital;
  return m;
}
const plain = (c, rough = 0.8, metal = 0, extra = {}) => new THREE.MeshStandardMaterial({ color: sRGB(...c), roughness: rough, metalness: metal, ...extra });

export const VM = {
  ifv: vehMat([0.3, 0.32, 0.28], [0.22, 0.25, 0.21], [0.37, 0.37, 0.31], [0.13, 0.14, 0.12], { digital: 1, scale: 1.7 }),
  lcac: vehMat([0.47, 0.49, 0.5], [0.43, 0.45, 0.46], [0.5, 0.51, 0.52], [0.38, 0.4, 0.41], { scale: 0.35, grime: 0.8 }),
  uh60: vehMat([0.2, 0.22, 0.17], [0.19, 0.21, 0.16], [0.21, 0.23, 0.18], [0.18, 0.2, 0.15], { scale: 0.5, grime: 0.35, metal: 0.15 }),
  gunship: vehMat([0.23, 0.26, 0.24], [0.16, 0.18, 0.17], [0.3, 0.31, 0.27], [0.12, 0.13, 0.12], { scale: 0.35 }),
  char: vehMat([0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], { char: 1 }),
  dark: plain([0.07, 0.07, 0.07], 0.65, 0.4),
  steel: plain([0.2, 0.2, 0.21], 0.4, 0.85),
  rubber: plain([0.045, 0.045, 0.045], 0.95),
  glass: plain([0.04, 0.06, 0.08], 0.05, 0.3, { envMapIntensity: 1.6 }),
  lens: plain([0.1, 0.12, 0.08], 0.05, 0.5),
  light: plain([0.9, 0.9, 0.8], 0.2, 0, { emissive: sRGB(0.25, 0.25, 0.2) }),
  red: plain([0.5, 0.05, 0.04], 0.6),
  grille: plain([0.05, 0.05, 0.05], 0.8, 0.5),
};

function decal(text, w, h, color = '#e8e4d6') {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 128); g.fillStyle = color; g.font = 'bold 84px "Arial Narrow", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.globalAlpha = 0.85; g.fillText(text, 128, 66);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
}

function extrudeProfile(points, depth, bevel = 0.05) {
  const s = new THREE.Shape(); points.forEach(([z, y], i) => (i ? s.lineTo(z, y) : s.moveTo(z, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2 });
  g.translate(0, 0, -depth / 2); g.rotateY(-Math.PI / 2); // profile (z,y) -> extrude across x
  return g;
}

function rollGroup(B, mat, list) { for (const g of list) B.add(mat, g); }

// ======================= Amphibious IFV (front = -z) =======================
export function buildIFV() {
  const root = new THREE.Group(); root.name = 'ifv';
  const B = new Builder();
  const L = 4.7; // half length
  // planing hull: side profile (z, y), extruded across the width
  const hull = extrudeProfile([[-4.75, 0.95], [-4.45, 1.55], [-3.1, 2.2], [3.9, 2.2], [4.55, 1.95], [4.6, 0.62], [3.6, 0.42], [-3.4, 0.42], [-4.35, 0.62]], 2.7, 0.06);
  B.add(VM.ifv, hull);
  // sponsons over the tracks
  [-1, 1].forEach((s) => {
    B.add(VM.ifv, box(0.5, 0.14, 8.2, s * 1.55, 1.08, -0.05));            // track shelf / cover
    B.add(VM.ifv, box(0.06, 0.55, 8.0, s * 1.79, 0.82, -0.05));            // side skirt
    for (let k = 0; k < 9; k++) B.add(VM.steel, cyl(0.022, 0.022, 0.03, 6, s * 1.825, 0.98, -3.7 + k * 0.92, 0, 0, Math.PI / 2));
    // exhaust grille on the right, intake grille on the left
    B.add(VM.grille, box(0.04, 0.38, 1.1, s * 1.37, 1.75, 1.6));
    for (let k = 0; k < 7; k++) B.add(VM.ifv, box(0.06, 0.03, 1.12, s * 1.38, 1.6 + k * 0.05, 1.6));
    // grab rails
    B.add(VM.steel, box(0.025, 0.025, 2.2, s * 1.36, 2.32, -0.6));
  });
  // running gear: 7 road wheels, drive sprocket (front), idler (rear), 3 return rollers, linked track
  const wheelGeo = (r, w) => merge([cyl(r, r, w, 18, 0, 0, 0, 0, 0, Math.PI / 2), cyl(r * 0.55, r * 0.55, w + 0.04, 12, 0, 0, 0, 0, 0, Math.PI / 2)]);
  [-1, 1].forEach((s) => {
    const x = s * 1.55;
    for (let k = 0; k < 7; k++) {
      B.add(VM.rubber, place(wheelGeo(0.33, 0.36), x, 0.42, -3.0 + k * 0.98));
      for (let b = 0; b < 6; b++) { const a = b / 6 * Math.PI * 2; B.add(VM.steel, cyl(0.02, 0.02, 0.06, 6, x + s * 0.2, 0.42 + Math.sin(a) * 0.1, -3.0 + k * 0.98 + Math.cos(a) * 0.1, 0, 0, Math.PI / 2)); }
    }
    B.add(VM.dark, place(wheelGeo(0.4, 0.3), x, 0.55, -3.95));
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; B.add(VM.dark, box(0.3, 0.08, 0.1, x, 0.55 + Math.sin(a) * 0.42, -3.95 + Math.cos(a) * 0.42, a, 0, 0)); }
    B.add(VM.rubber, place(wheelGeo(0.38, 0.32), x, 0.55, 3.95));
    for (let k = 0; k < 3; k++) B.add(VM.rubber, place(wheelGeo(0.1, 0.2), x, 0.96, -2.2 + k * 2.2));
    // track loop: bottom run, top run, curved ends
    const links = [];
    const addLink = (y, z, a) => links.push(box(0.42, 0.06, 0.16, x, y, z, a, 0, 0), box(0.44, 0.03, 0.04, x, y - 0.04 * Math.cos(a), z + 0.04 * Math.sin(a), a, 0, 0));
    for (let z = -3.95; z <= 3.95; z += 0.17) addLink(0.07, z, 0);
    for (let z = -3.7; z <= 3.7; z += 0.17) addLink(1.03 - 0.02 * Math.sin((z + 3.7) / 7.4 * Math.PI * 3), z, 0);
    for (let k = 0; k <= 8; k++) { const a = k / 8 * Math.PI; addLink(0.55 - 0.48 * Math.cos(a), -3.95 - 0.48 * Math.sin(a), a); }
    for (let k = 0; k <= 8; k++) { const a = k / 8 * Math.PI; addLink(0.55 - 0.48 * Math.cos(a), 3.95 + 0.48 * Math.sin(a), -a); }
    rollGroup(B, VM.dark, links);
  });
  // bow plane (stowed against the glacis) with hydraulic rams, headlights with guards, tow hooks
  B.add(VM.ifv, box(2.9, 0.07, 1.25, 0, 1.25, -4.62, -1.0, 0, 0));
  [-1, 1].forEach((s) => {
    B.add(VM.steel, cyl(0.04, 0.04, 0.9, 8, s * 1.0, 1.6, -4.2, 0.9, 0, 0));
    B.add(VM.light, cyl(0.09, 0.09, 0.08, 14, s * 1.1, 1.95, -3.62, Math.PI / 2 - 0.6, 0, 0));
    B.add(VM.steel, box(0.24, 0.02, 0.02, s * 1.1, 2.05, -3.72)); B.add(VM.steel, box(0.24, 0.02, 0.02, s * 1.1, 1.85, -3.75));
    B.add(VM.steel, place(new THREE.TorusGeometry(0.08, 0.025, 6, 12), s * 0.8, 0.75, -4.55, 0, Math.PI / 2, 0));
  });
  // driver hatch + periscopes; troop hatches; antennas
  B.add(VM.ifv, cyl(0.38, 0.38, 0.08, 18, 0.7, 2.25, -2.4));
  for (let k = 0; k < 3; k++) B.add(VM.lens, box(0.16, 0.08, 0.04, 0.45 + k * 0.25, 2.27, -2.82 + Math.abs(k - 1) * 0.05, -0.4, (k - 1) * 0.3, 0));
  [-1, 1].forEach((s) => { B.add(VM.ifv, box(0.7, 0.06, 1.0, s * 0.55, 2.24, 2.6)); B.add(VM.steel, cyl(0.03, 0.03, 0.6, 6, s * 0.55, 2.28, 2.1, 0, 0, Math.PI / 2)); });
  B.add(VM.dark, cyl(0.012, 0.006, 2.4, 5, -1.1, 3.4, 3.4, -0.08, 0, 0)); B.add(VM.dark, cyl(0.012, 0.006, 1.8, 5, 1.1, 3.1, 3.5, -0.05, 0, 0));
  // stern: waterjet nozzles, transom flap, troop door outline
  [-1, 1].forEach((s) => { B.add(VM.dark, box(0.55, 0.4, 0.25, s * 0.85, 0.75, 4.68)); B.add(VM.rubber, box(0.42, 0.28, 0.05, s * 0.85, 0.75, 4.81)); });
  B.add(VM.ifv, box(2.8, 0.06, 0.7, 0, 0.5, 4.85, 0.5, 0, 0));
  B.build(root);
  // rear troop door (hinged at the bottom; opens outward/down)
  const ramp = new THREE.Group(); ramp.name = 'ramp'; ramp.position.set(0, 0.95, 4.62);
  const R = new Builder(); R.add(VM.ifv, box(1.5, 1.15, 0.1, 0, 0.58, 0)); R.add(VM.steel, box(0.04, 0.5, 0.04, 0.55, 0.6, 0.06)); R.add(VM.lens, box(0.18, 0.12, 0.03, 0, 0.9, 0.06));
  R.build(ramp); root.add(ramp);
  // unmanned turret
  const tur = new THREE.Group(); tur.name = 'turret'; tur.position.set(0, 2.2, -0.4);
  const T = new Builder();
  T.add(VM.ifv, extrudeProfile([[-1.05, 0.0], [-1.25, 0.3], [-0.9, 0.62], [1.0, 0.62], [1.15, 0.3], [1.1, 0.0]], 1.8, 0.04));
  T.add(VM.ifv, box(0.4, 0.42, 0.5, 0, 0.32, -1.25));                               // mantlet
  const barrel = new THREE.Group(); barrel.name = 'barrel';
  const BR = new Builder();
  BR.add(VM.dark, cyl(0.09, 0.09, 0.6, 12, 0, 0, -0.3, Math.PI / 2, 0, 0));           // sleeve
  BR.add(VM.dark, cyl(0.045, 0.045, 2.2, 12, 0, 0, -1.6, Math.PI / 2, 0, 0));
  BR.add(VM.dark, cyl(0.07, 0.07, 0.25, 12, 0, 0, -2.75, Math.PI / 2, 0, 0));        // muzzle brake
  for (let k = 0; k < 4; k++) BR.add(VM.dark, box(0.16, 0.02, 0.03, 0, 0, -2.66 - k * 0.05));
  BR.add(VM.dark, cyl(0.02, 0.02, 0.6, 8, 0.22, -0.05, -0.5, Math.PI / 2, 0, 0));    // coax
  BR.build(barrel); barrel.position.set(0, 0.32, -1.35); tur.add(barrel);
  T.add(VM.ifv, box(0.3, 0.36, 1.25, -1.02, 0.55, -0.1));                            // ATGM launcher
  [0, 1].forEach((k) => T.add(VM.dark, cyl(0.07, 0.07, 0.02, 12, -1.02, 0.47 + k * 0.17, -0.73, Math.PI / 2, 0, 0)));
  T.add(VM.ifv, box(0.4, 0.32, 0.36, 0.55, 0.8, -0.55)); T.add(VM.lens, box(0.3, 0.16, 0.02, 0.55, 0.82, -0.74)); // gunner sight
  T.add(VM.ifv, cyl(0.16, 0.18, 0.28, 14, -0.45, 0.98, 0.25)); T.add(VM.lens, box(0.18, 0.12, 0.02, -0.45, 1.02, 0.1)); // commander panoramic
  [-1, 1].forEach((s) => { for (let k = 0; k < 4; k++) T.add(VM.dark, cyl(0.045, 0.045, 0.28, 10, s * 0.95, 0.3 + (k % 2) * 0.11, -0.95 - Math.floor(k / 2) * 0.11, -0.6, 0, s * 0.5)); });
  for (let k = 0; k < 6; k++) T.add(VM.steel, box(0.02, 0.25, 0.02, -0.8 + k * 0.32, 0.75, 1.1)); T.add(VM.steel, box(1.7, 0.02, 0.02, 0, 0.87, 1.1)); // bustle rack
  T.build(tur); root.add(tur);
  // hull numbers
  [-1, 1].forEach((s) => { const d = decal(String(300 + Math.floor(Math.random() * 600)), 0.9, 0.45); d.position.set(s * 1.4, 1.6, -2.4); d.rotation.y = s * Math.PI / 2; root.add(d); });
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  root.userData.height = 3.2;
  return root;
}

// ======================= LCAC (front = -z) =======================
export function buildLCAC() {
  const root = new THREE.Group(); root.name = 'lcac';
  const B = new Builder();
  // buoyancy box and cargo deck with tie-down rails
  B.add(VM.lcac, box(13.6, 1.1, 25.4, 0, 1.45, 0));
  B.add(VM.lcac, box(8.6, 0.06, 21.0, 0, 2.03, -0.6));
  for (let k = 0; k < 6; k++) B.add(VM.steel, box(0.08, 0.05, 20.5, -3.7 + k * 1.48, 2.06, -0.6));
  // skirt: inflated bag around the perimeter + finger segments
  const pts = []; const hw = 7.0, hl = 12.9, rr = 3.2;
  const corner = (cx, cz, a0) => { for (let k = 0; k <= 6; k++) { const a = a0 + k / 6 * Math.PI / 2; pts.push(new THREE.Vector3(cx + Math.cos(a) * rr, 0, cz + Math.sin(a) * rr)); } };
  corner(hw - rr, hl - rr, 0); corner(-(hw - rr), hl - rr, Math.PI / 2); corner(-(hw - rr), -(hl - rr), Math.PI); corner(hw - rr, -(hl - rr), Math.PI * 1.5);
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  const bag = new THREE.TubeGeometry(curve, 120, 0.85, 12, true); bag.translate(0, 0.95, 0);
  B.add(VM.rubber, bag);
  const fingers = [];
  for (let k = 0; k < 150; k++) {
    const t = k / 150, p = curve.getPointAt(t), tg = curve.getTangentAt(t);
    fingers.push(box(0.5, 0.55, 0.32, p.x * 0.97, 0.28, p.z * 0.97, 0, Math.atan2(tg.x, tg.z), 0));
  }
  rollGroup(B, VM.rubber, fingers);
  // side structures (port and starboard)
  [-1, 1].forEach((s) => {
    const x = s * 5.55;
    B.add(VM.lcac, box(2.5, 2.9, 22.4, x, 3.4, 0.6));
    B.add(VM.lcac, box(2.2, 0.5, 22.0, x, 5.05, 0.6, 0, 0, s * 0.12));
    // engine intakes (grilles) and exhausts
    for (let k = 0; k < 2; k++) {
      B.add(VM.grille, box(0.06, 1.2, 2.4, x - s * 1.27, 3.7, 4.0 + k * 3.6));
      for (let j = 0; j < 9; j++) B.add(VM.lcac, box(0.08, 0.05, 2.45, x - s * 1.29, 3.15 + j * 0.13, 4.0 + k * 3.6));
      B.add(VM.dark, cyl(0.45, 0.5, 0.9, 14, x + s * 0.2, 5.5, 6.0 + k * 3.6));
    }
    // bow thruster housing with swivelling nozzle
    B.add(VM.lcac, cyl(0.75, 0.75, 1.1, 18, x, 5.6, -8.8));
    B.add(VM.dark, cyl(0.45, 0.45, 1.4, 14, x + s * 0.2, 5.7, -8.8, 0, 0, Math.PI / 2));
    // railings
    for (let k = 0; k < 12; k++) B.add(VM.steel, box(0.04, 0.9, 0.04, x - s * 1.25, 5.5, -9.5 + k * 1.9));
    B.add(VM.steel, box(0.04, 0.04, 21, x - s * 1.25, 5.95, 0.6));
  });
  // control cab on the starboard bow, smaller cab on port; mast with radar and nav lights
  B.add(VM.lcac, box(2.6, 2.0, 3.8, 5.55, 6.3, -7.0));
  B.add(VM.glass, box(2.62, 0.55, 3.82, 5.55, 6.8, -7.0));
  B.add(VM.lcac, box(2.3, 1.6, 2.6, -5.55, 6.1, -7.6));
  B.add(VM.glass, box(2.32, 0.45, 2.62, -5.55, 6.5, -7.6));
  B.add(VM.steel, cyl(0.06, 0.08, 3.2, 8, 5.9, 8.9, -6.2));
  B.add(VM.dark, box(1.4, 0.12, 0.25, 5.9, 10.4, -6.2));
  B.add(VM.red, cyl(0.07, 0.07, 0.12, 8, 5.9, 10.6, -6.2));
  // propeller shrouds (two 3.6 m props), stators, air rudders
  [-1, 1].forEach((s) => {
    const x = s * 3.6;
    B.add(VM.lcac, place(new THREE.CylinderGeometry(2.05, 2.05, 1.3, 32, 1, true), x, 4.7, 11.7, Math.PI / 2, 0, 0));
    B.add(VM.lcac, place(new THREE.TorusGeometry(2.05, 0.16, 8, 32), x, 4.7, 11.05));
    B.add(VM.lcac, place(new THREE.TorusGeometry(2.05, 0.12, 8, 32), x, 4.7, 12.35));
    B.add(VM.lcac, box(0.5, 2.6, 1.0, x, 2.6, 11.7));
    for (let k = 0; k < 3; k++) B.add(VM.steel, box(0.08, 3.8, 0.08, x, 4.7, 11.4, 0, 0, k * Math.PI / 3));
    [-0.9, 0.9].forEach((o) => B.add(VM.lcac, box(0.14, 3.0, 1.1, x + o, 4.7, 13.05)));
  });
  B.build(root);
  // spinning propellers
  root.userData.props = [-1, 1].map((s) => {
    const g = new THREE.Group(); g.name = 'prop'; g.position.set(s * 3.6, 4.7, 11.55);
    const P = new Builder(); P.add(VM.dark, place(new THREE.ConeGeometry(0.4, 0.8, 16), 0, 0, 0.2, Math.PI / 2, 0, 0));
    for (let k = 0; k < 4; k++) P.add(VM.dark, box(0.36, 1.85, 0.06, 0, 0, 0, 0, 0.35, 0).applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0.95, 0)).applyMatrix4(new THREE.Matrix4().makeRotationZ(k * Math.PI / 2)));
    P.build(g); root.add(g); return g;
  });
  // bow ramp (8.8 m) and stern ramp (4.6 m)
  const ramp = new THREE.Group(); ramp.name = 'ramp'; ramp.position.set(0, 2.0, -12.75);
  const R = new Builder(); R.add(VM.lcac, box(8.6, 3.2, 0.2, 0, 1.6, 0)); for (let k = 0; k < 8; k++) R.add(VM.steel, box(8.5, 0.05, 0.06, 0, 0.3 + k * 0.38, -0.12)); R.build(ramp); root.add(ramp);
  const sramp = new THREE.Group(); sramp.position.set(0, 2.0, 12.2); const SR = new Builder(); SR.add(VM.lcac, box(4.5, 2.4, 0.18, 0, 1.2, 0)); SR.build(sramp); root.add(sramp);
  [-1, 1].forEach((s) => { const d = decal(String(40 + Math.floor(Math.random() * 50)), 2.2, 1.1); d.position.set(s * 6.82, 3.6, -3.0); d.rotation.y = s * Math.PI / 2; root.add(d); });
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  root.userData.height = 5;
  return root;
}

// lofted fuselage helper: sections [z, halfWidth, halfHeight, yCenter, squareness]
function loft(sections, segs = 20) {
  const pos = [], idx = [];
  sections.forEach(([z, w, h, yc, sq]) => {
    for (let k = 0; k < segs; k++) {
      const a = k / segs * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const e = 2 / (sq || 2.5);
      const x = Math.sign(c) * Math.pow(Math.abs(c), e) * w, y = Math.sign(s) * Math.pow(Math.abs(s), e) * h + yc;
      pos.push(x, y, z);
    }
  });
  for (let r = 0; r < sections.length - 1; r++) for (let k = 0; k < segs; k++) {
    const a = r * segs + k, b = r * segs + (k + 1) % segs, c = (r + 1) * segs + k, d = (r + 1) * segs + (k + 1) % segs;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  // ensure outward winding
  return g;
}

function rotorDisc(radius) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 6, 64, 64, 64); gr.addColorStop(0, 'rgba(20,20,20,0.0)'); gr.addColorStop(0.3, 'rgba(20,20,20,0.16)'); gr.addColorStop(0.95, 'rgba(20,20,20,0.22)'); gr.addColorStop(1, 'rgba(20,20,20,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(new THREE.CircleGeometry(radius, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  m.name = 'disc'; return m;
}

// ======================= UH-60 Black Hawk (front = +z) =======================
export function buildUH60() {
  const root = new THREE.Group(); root.name = 'uh60';
  const B = new Builder();
  const fus = loft([
    [7.3, 0.25, 0.35, 1.55, 2.2], [6.9, 0.7, 0.75, 1.65, 2.4], [6.0, 1.0, 1.05, 1.75, 2.8], [4.4, 1.12, 1.15, 1.85, 3.2], [1.0, 1.15, 1.2, 1.9, 3.6],
    [-1.6, 1.1, 1.15, 1.95, 3.4], [-2.8, 0.75, 0.85, 2.25, 2.8], [-3.6, 0.42, 0.5, 2.5, 2.3],
  ]);
  B.add(VM.uh60, fus);
  // tail boom sweeping up to the pylon; pylon with canted tail rotor; stabilator
  B.add(VM.uh60, loft([[-3.5, 0.42, 0.5, 2.5, 2.2], [-6.5, 0.3, 0.36, 2.65, 2.2], [-9.2, 0.22, 0.28, 2.9, 2.2], [-9.9, 0.2, 0.26, 3.05, 2.2]], 14));
  B.add(VM.uh60, place(loft([[0, 0.14, 0.6, 0, 2.2], [-1.4, 0.1, 0.42, 0.9, 2.2], [-2.0, 0.06, 0.2, 1.7, 2.2]], 12), 0, 3.0, -9.3, 0.2, 0, 0));
  B.add(VM.uh60, box(4.38, 0.08, 0.9, 0, 2.8, -9.4, 0, 0, 0));
  // cockpit glazing: windscreens, chin bubbles, door windows
  [-1, 1].forEach((s) => {
    B.add(VM.glass, box(0.9, 0.62, 0.05, s * 0.48, 2.45, 6.1, -0.75, s * 0.32, 0));
    B.add(VM.glass, box(0.55, 0.4, 0.05, s * 0.45, 1.25, 6.55, 0.9, s * 0.3, 0));
    B.add(VM.glass, box(0.05, 0.7, 1.2, s * 1.13, 2.2, 4.9));
    B.add(VM.glass, box(0.05, 0.45, 0.55, s * 1.16, 2.25, 2.8));       // gunner window
    // open cabin door: dark interior + door slid back
    B.add(VM.dark, box(0.04, 1.3, 1.9, s * 1.16, 1.75, 1.2));
    B.add(VM.uh60, box(0.08, 1.35, 1.9, s * 1.22, 1.78, -0.9));
    B.add(VM.glass, box(0.05, 0.42, 0.6, s * 1.27, 2.15, -0.9));
    // door gun on its mount
    B.add(VM.dark, box(0.08, 0.14, 0.9, s * 1.35, 1.9, 2.8, 0, s * 0.25, 0)); B.add(VM.dark, cyl(0.02, 0.02, 0.5, 6, s * 1.48, 1.92, 3.4, Math.PI / 2, s * 0.25, 0));
    // main landing gear and wheels
    B.add(VM.steel, box(0.08, 0.9, 0.08, s * 1.2, 0.55, 3.2, 0, 0, s * 0.35)); B.add(VM.rubber, cyl(0.3, 0.3, 0.2, 16, s * 1.42, 0.3, 3.2, 0, 0, Math.PI / 2));
    // engine nacelles beside the mast (T700) with intakes and exhausts
    B.add(VM.uh60, loft([[1.8, 0.05, 0.05, 0, 2.4], [1.6, 0.3, 0.32, 0, 2.4], [-0.6, 0.32, 0.34, 0, 2.4], [-1.4, 0.2, 0.22, 0.05, 2.4]], 14).translate(s * 0.62, 3.25, -0.3));
    B.add(VM.dark, cyl(0.24, 0.24, 0.05, 16, s * 0.62, 3.25, 1.48, Math.PI / 2, 0, 0));
    B.add(VM.dark, cyl(0.2, 0.22, 0.6, 14, s * 0.85, 3.3, -1.8, Math.PI / 2, s * 0.6, 0));
    // wire-strike cutters, step, antennas
    B.add(VM.steel, box(0.04, 0.5, 0.1, 0, 3.2, 5.5, -0.5, 0, 0));
    B.add(VM.steel, box(0.04, 0.4, 0.1, 0, 0.55, 5.9, 0.4, 0, 0));
    B.add(VM.dark, cyl(0.01, 0.01, 0.8, 4, s * 0.3, 0.8, -1.0, 0, 0, s * 0.3));
  });
  B.add(VM.uh60, box(1.2, 0.5, 2.6, 0, 3.0, 0.1));       // transmission fairing
  B.add(VM.steel, cyl(0.16, 0.2, 0.7, 10, 0, 3.55, 0.3));   // mast
  B.add(VM.rubber, cyl(0.15, 0.15, 0.14, 10, 0, 0.35, -8.4, 0, 0, Math.PI / 2)); // tail wheel
  B.add(VM.steel, box(0.06, 0.6, 0.06, 0, 0.7, -8.4, 0.3, 0, 0));
  B.add(VM.dark, cyl(0.03, 0.03, 0.55, 6, 0.3, 2.0, 7.1, Math.PI / 2 - 0.1, 0, 0)); // pitot
  B.build(root);
  const dec = decal('U.S. ARMY', 2.0, 0.5, '#151515'); dec.position.set(0.33, 2.7, -6.2); dec.rotation.y = Math.PI / 2; root.add(dec);
  const dec2 = dec.clone(); dec2.position.x = -0.33; dec2.rotation.y = -Math.PI / 2; root.add(dec2);
  // main rotor: hub, grips and four 8.2 m blades (slight droop), plus blur disc
  const rotor = new THREE.Group(); rotor.name = 'rotor'; rotor.position.set(0, 3.95, 0.3);
  const RB = new Builder(); RB.add(VM.steel, cyl(0.35, 0.3, 0.3, 14, 0, 0, 0));
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; RB.add(VM.steel, box(0.16, 0.12, 0.8, 0, 0, 0.55, 0, a, 0).applyMatrix4(new THREE.Matrix4().makeRotationY(0)));
    RB.add(VM.dark, box(0.53, 0.05, 7.6, 0, -0.1, 4.6, -0.012, 0, 0).applyMatrix4(new THREE.Matrix4().makeRotationY(a))); }
  RB.build(rotor); rotor.add(rotorDisc(8.2)); root.add(rotor);
  // canted (20 degree) tail rotor on the right of the pylon
  const tail = new THREE.Group(); tail.name = 'tail'; tail.position.set(0.25, 4.25, -10.25); tail.rotation.z = -0.35;
  const TB = new Builder(); TB.add(VM.steel, cyl(0.1, 0.1, 0.2, 10, 0, 0, 0, 0, 0, Math.PI / 2));
  for (let k = 0; k < 4; k++) TB.add(VM.dark, box(0.04, 1.65, 0.14, 0.08, 0, 0, k * Math.PI / 2, 0, 0).applyMatrix4(new THREE.Matrix4().makeRotationX(k * Math.PI / 2)));
  TB.build(tail); root.add(tail);
  root.traverse((o) => { if (o.isMesh && o.name !== 'disc') { o.castShadow = true; o.receiveShadow = true; } });
  return root;
}

// ======================= Invader attack helicopter (front = +z) =======================
export function buildGunship() {
  const root = new THREE.Group();
  const B = new Builder();
  B.add(VM.gunship, loft([
    [5.6, 0.12, 0.2, 1.1, 2.2], [5.0, 0.5, 0.55, 1.3, 2.6], [3.6, 0.62, 0.85, 1.55, 3.0], [1.5, 0.66, 0.95, 1.65, 3.2],
    [-0.8, 0.66, 0.95, 1.75, 3.2], [-2.0, 0.45, 0.62, 1.95, 2.6], [-3.0, 0.3, 0.4, 2.1, 2.2],
  ], 18));
  B.add(VM.gunship, loft([[-2.9, 0.3, 0.4, 2.1, 2.2], [-7.5, 0.2, 0.26, 2.3, 2.2], [-9.2, 0.15, 0.22, 2.5, 2.2]], 12));
  B.add(VM.gunship, place(loft([[0, 0.12, 0.55, 0, 2.2], [-1.2, 0.09, 0.4, 0.9, 2.2], [-1.8, 0.05, 0.2, 1.6, 2.2]], 10), 0, 2.4, -8.6, 0.25, 0, 0));
  B.add(VM.gunship, box(2.8, 0.08, 0.75, 0, 2.3, -7.8));
  // stepped tandem canopies
  B.add(VM.glass, place(loft([[4.7, 0.05, 0.05, 2.0, 2.2], [4.3, 0.45, 0.4, 2.15, 2.4], [3.3, 0.5, 0.45, 2.2, 2.4], [3.0, 0.4, 0.3, 2.2, 2.4]], 14), 0, 0, 0));
  B.add(VM.glass, place(loft([[2.9, 0.05, 0.05, 2.45, 2.2], [2.5, 0.48, 0.42, 2.55, 2.4], [1.4, 0.52, 0.45, 2.6, 2.4], [1.1, 0.4, 0.3, 2.6, 2.4]], 14), 0, 0, 0));
  // engines with exhaust suppressors, stub wings with rocket pods and missile rails, chin cannon
  [-1, 1].forEach((s) => {
    B.add(VM.gunship, loft([[1.2, 0.05, 0.05, 0, 2.4], [1.0, 0.36, 0.38, 0, 2.4], [-1.6, 0.36, 0.38, 0, 2.4], [-2.4, 0.28, 0.3, 0.08, 2.4]], 14).translate(s * 0.8, 2.55, -0.4));
    B.add(VM.dark, cyl(0.26, 0.3, 0.9, 14, s * 1.15, 2.7, -2.9, Math.PI / 2, s * 0.35, 0));
    B.add(VM.gunship, box(1.9, 0.12, 1.1, s * 1.55, 1.45, 0.2, 0, 0, s * -0.08));
    B.add(VM.dark, cyl(0.3, 0.3, 1.6, 16, s * 1.6, 1.08, 0.3, Math.PI / 2, 0, 0));
    for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2; B.add(VM.rubber, cyl(0.05, 0.05, 0.02, 8, s * 1.6 + Math.cos(a) * 0.18, 1.08 + Math.sin(a) * 0.18, 1.11, Math.PI / 2, 0, 0)); }
    B.add(VM.dark, cyl(0.07, 0.07, 1.5, 10, s * 2.35, 1.2, 0.3, Math.PI / 2, 0, 0));
    B.add(VM.dark, cyl(0.07, 0.07, 1.5, 10, s * 2.35, 1.05, 0.3, Math.PI / 2, 0, 0));
    B.add(VM.steel, box(0.1, 0.1, 2.2, s * 0.55, 0.15, 0.8)); B.add(VM.steel, box(0.06, 0.6, 0.06, s * 0.5, 0.45, 1.5, 0, 0, s * 0.3));
  });
  B.add(VM.dark, place(new THREE.SphereGeometry(0.34, 14, 10), 0, 0.82, 3.8));
  B.add(VM.dark, cyl(0.045, 0.045, 1.6, 10, 0, 0.75, 4.7, Math.PI / 2, 0, 0));
  B.add(VM.lens, place(new THREE.SphereGeometry(0.22, 12, 8), 0, 0.95, 5.55));
  B.add(VM.gunship, box(1.0, 0.45, 2.2, 0, 2.75, 0.0));
  B.add(VM.steel, cyl(0.15, 0.18, 0.55, 10, 0, 3.15, 0.2));
  B.build(root);
  const rotor = new THREE.Group(); rotor.name = 'rotor'; rotor.position.set(0, 3.45, 0.2);
  const RB = new Builder(); RB.add(VM.steel, cyl(0.3, 0.26, 0.25, 12, 0, 0, 0));
  for (let k = 0; k < 4; k++) RB.add(VM.dark, box(0.48, 0.05, 6.9, 0, -0.05, 4.0, 0, 0, 0).applyMatrix4(new THREE.Matrix4().makeRotationY(k * Math.PI / 2)));
  RB.build(rotor); rotor.add(rotorDisc(7.4)); root.add(rotor);
  const tail = new THREE.Group(); tail.name = 'tail'; tail.position.set(0.22, 3.4, -9.6);
  const TB = new Builder(); for (let k = 0; k < 3; k++) TB.add(VM.dark, box(0.04, 1.4, 0.13, 0, 0, 0).applyMatrix4(new THREE.Matrix4().makeRotationX(k * Math.PI / 1.5))); TB.build(tail); root.add(tail);
  root.traverse((o) => { if (o.isMesh && o.name !== 'disc') { o.castShadow = true; o.receiveShadow = true; } });
  return root;
}
