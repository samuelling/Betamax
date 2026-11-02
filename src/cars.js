// Cars for the parking lot: side-profile bodies extruded with rounded edges, a glass cabin, real wheels, lights,
// bumpers and mirrors — built as separate panels so a blast can take them apart (and rewind can put them back).
import * as THREE from 'three';

const T = THREE, G = 9.8;
const std = (o) => new T.MeshStandardMaterial(Object.assign({ roughness: 0.6, metalness: 0 }, o));

// per variant: length, width, height of the shoulder line, hood/trunk heights, cabin base/roof spans and roof height
const VAR = {
  sedan: { L: 4.7, W: 1.82, belt: 0.92, hood: 0.88, trunk: 0.95, cab: [-1.15, 1.05], roof: [-0.55, 0.45], roofY: 1.44, wb: 1.42, ground: 0.18 },
  hatch: { L: 4.15, W: 1.76, belt: 0.92, hood: 0.86, trunk: 0.98, cab: [-1.75, 0.95], roof: [-1.55, 0.35], roofY: 1.48, wb: 1.28, ground: 0.17 },
  suv: { L: 4.75, W: 1.92, belt: 1.12, hood: 1.08, trunk: 1.15, cab: [-2.1, 0.95], roof: [-2.05, 0.45], roofY: 1.78, wb: 1.45, ground: 0.24 },
  wagon: { L: 4.8, W: 1.82, belt: 0.92, hood: 0.88, trunk: 0.98, cab: [-2.15, 1.05], roof: [-2.1, 0.45], roofY: 1.46, wb: 1.45, ground: 0.18 },
  pickup: { L: 5.4, W: 1.95, belt: 1.1, hood: 1.08, trunk: 1.1, cab: [-0.55, 1.15], roof: [-0.45, 0.55], roofY: 1.85, wb: 1.75, ground: 0.26, bed: true },
};
const PAINT = ['#8a8e94', '#1e2228', '#8a1e1a', '#e8e6e0', '#2a3e5a', '#4a4e3e', '#b8a888', '#2e4a3a'];

function bodyShape(V) {
  const s = new T.Shape(), h = V.L / 2, r = 0.39, w = V.wb, g = V.ground;
  s.moveTo(-h, g + 0.12);
  s.lineTo(-h - 0.04, V.trunk - 0.25); s.quadraticCurveTo(-h - 0.02, V.trunk, -h + 0.25, V.trunk);
  s.lineTo(V.cab[0], V.belt); s.lineTo(V.cab[1], V.belt);
  s.lineTo(h - 0.55, V.hood); s.quadraticCurveTo(h + 0.02, V.hood - 0.04, h + 0.02, V.hood - 0.3); s.lineTo(h, g + 0.14);
  // under the car with arches over the wheels
  s.lineTo(w + r + 0.06, g + 0.1); s.absarc(w, g + 0.18, r + 0.06, 0, Math.PI, false); s.lineTo(-w + r + 0.06, g + 0.1); s.absarc(-w, g + 0.18, r + 0.06, 0, Math.PI, false);
  s.lineTo(-h, g + 0.12);
  return s;
}
function extrudeX(shape, width, bevel = 0.06) {
  const g = new T.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 10 });
  g.translate(0, 0, -(width - bevel * 2) / 2); g.rotateY(-Math.PI / 2); return g;   // length along +z (front), width along x
}

export function buildCar(variant, paintHex, seed = 1) {
  const V = VAR[variant] || VAR.sedan, root = new T.Group(), parts = [];
  const paint = std({ color: new T.Color(paintHex), roughness: 0.32, metalness: 0.45 });
  const glass = std({ color: 0x10161c, roughness: 0.05, metalness: 0.6 });
  const plastic = std({ color: 0x1a1a1a, roughness: 0.8 });
  const chrome = std({ color: 0xc8ccd0, roughness: 0.2, metalness: 1 });
  const tire = std({ color: 0x141414, roughness: 0.95 });
  const add = (geo, mat, kind, x = 0, y = 0, z = 0) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; root.add(m); parts.push({ m, kind, home: m.position.clone(), q0: m.quaternion.clone() }); return m; };
  // body shell
  const body = add(extrudeX(bodyShape(V), V.W), paint, 'body');
  // cabin: glass all round, pillars and a roof panel in body colour
  const cs = new T.Shape(); cs.moveTo(V.cab[0], V.belt - 0.02); cs.lineTo(V.cab[1], V.belt - 0.02); cs.lineTo(V.roof[1], V.roofY); cs.lineTo(V.roof[0], V.roofY); cs.lineTo(V.cab[0], V.belt - 0.02);
  const cab = new T.Group(); root.add(cab); parts.push({ m: cab, kind: 'cabin', home: cab.position.clone(), q0: cab.quaternion.clone() });
  const gm = new T.Mesh(extrudeX(cs, V.W - 0.16, 0.04), glass); gm.castShadow = true; cab.add(gm);
  const rs = new T.Shape(); rs.moveTo(V.roof[0] - 0.03, V.roofY - 0.02); rs.lineTo(V.roof[1] + 0.03, V.roofY - 0.02); rs.lineTo(V.roof[1] + 0.02, V.roofY + 0.04); rs.lineTo(V.roof[0] - 0.02, V.roofY + 0.04);
  const rm = new T.Mesh(extrudeX(rs, V.W - 0.12, 0.03), paint); rm.castShadow = true; cab.add(rm);
  const pill = (u0, y0, u1, y1) => { for (const sx of [-1, 1]) { const len = Math.hypot(u1 - u0, y1 - y0), m = new T.Mesh(new T.BoxGeometry(0.03, len, 0.09), paint); m.position.set(sx * (V.W / 2 - 0.085), (y0 + y1) / 2, (u0 + u1) / 2); m.rotation.x = Math.atan2(u1 - u0, y1 - y0); cab.add(m); } };
  pill(V.cab[1], V.belt, V.roof[1], V.roofY); pill(V.cab[0], V.belt, V.roof[0], V.roofY); pill((V.cab[0] + V.cab[1]) / 2 - 0.15, V.belt, (V.roof[0] + V.roof[1]) / 2 - 0.15, V.roofY);
  // doors (as panels, so they can come off), handles and the window line
  const doorZ = [[V.cab[1] - 0.05, (V.cab[0] + V.cab[1]) / 2 - 0.12], [(V.cab[0] + V.cab[1]) / 2 - 0.16, V.cab[0] + 0.1]];
  for (const sx of [-1, 1]) for (const [z1, z0] of variant === 'pickup' ? [doorZ[0]] : doorZ) {
    const d = add(new T.BoxGeometry(0.03, V.belt - V.ground - 0.28, Math.abs(z1 - z0) - 0.03), paint, 'door', sx * (V.W / 2 + 0.006), (V.belt + V.ground + 0.2) / 2, (z0 + z1) / 2);
    const hd = new T.Mesh(new T.BoxGeometry(0.02, 0.025, 0.12), chrome); hd.position.set(sx * 0.02, 0.12, (z1 - z0) / 2 * 0.6); d.add(hd);
  }
  // hood and trunk lids
  const hood = add(new T.BoxGeometry(V.W - 0.2, 0.03, V.L / 2 - V.cab[1] - 0.6), paint, 'hood', 0, V.hood + 0.03, (V.cab[1] + V.L / 2 - 0.55) / 2 + 0.05);
  hood.rotation.x = Math.atan2(V.belt - V.hood, V.L / 2 - V.cab[1]) * 0.6; parts[parts.length - 1].q0 = hood.quaternion.clone();
  if (!V.bed && variant === 'sedan') add(new T.BoxGeometry(V.W - 0.25, 0.03, -V.cab[0] - V.L / 2 + 0.55 + V.L / 2 - 0.3), paint, 'trunk', 0, V.trunk + 0.02, (V.cab[0] - V.L / 2 + 0.25) / 2);
  if (V.bed) { // the pickup's bed
    // an open tub: a ribbed floor on top of the body, side walls, the front wall and a tailgate
    const bz = (V.cab[0] - 0.06 - V.L / 2) / 2;
    add(new T.BoxGeometry(V.W - 0.12, 0.04, -V.cab[0] + V.L / 2 - 0.15), plastic, 'bed', 0, V.belt + 0.02, bz);
    for (const sx of [-1, 1]) add(new T.BoxGeometry(0.06, 0.44, -V.cab[0] + V.L / 2 - 0.12), paint, 'door', sx * (V.W / 2 - 0.03), V.belt + 0.22, bz);
    add(new T.BoxGeometry(V.W - 0.06, 0.44, 0.06), paint, 'trim', 0, V.belt + 0.22, V.cab[0] - 0.08);
    add(new T.BoxGeometry(V.W - 0.06, 0.44, 0.06), paint, 'trunk', 0, V.belt + 0.22, -V.L / 2 + 0.03);
  }
  // lights, grille, bumpers, mirrors
  const lamp = std({ color: 0xf4f0e0, roughness: 0.1, emissive: 0x3a3830 }), tail = std({ color: 0x8a1010, roughness: 0.2, emissive: 0x2a0404 });
  for (const sx of [-1, 1]) {
    add(new T.BoxGeometry(0.38, 0.12, 0.04), lamp, 'trim', sx * (V.W / 2 - 0.3), V.hood - 0.14, V.L / 2 + 0.005);
    add(new T.BoxGeometry(0.3, 0.14, 0.04), tail, 'trim', sx * (V.W / 2 - 0.25), V.trunk - 0.16, -V.L / 2 - 0.02);
    const mir = add(new T.BoxGeometry(0.16, 0.1, 0.12), paint, 'mirror', sx * (V.W / 2 + 0.07), V.belt + 0.08, V.cab[1] - 0.1);
  }
  add(new T.BoxGeometry(V.W - 0.75, 0.18, 0.04), plastic, 'trim', 0, V.hood - 0.22, V.L / 2 + 0.01);
  add(new T.BoxGeometry(V.W + 0.02, 0.2, 0.18), plastic, 'bumper', 0, V.ground + 0.2, V.L / 2 - 0.02);
  add(new T.BoxGeometry(V.W + 0.02, 0.2, 0.18), plastic, 'bumper', 0, V.ground + 0.2, -V.L / 2 + 0.02);
  add(new T.BoxGeometry(0.5, 0.11, 0.02), std({ color: 0xf0f0e8, roughness: 0.5 }), 'trim', 0, V.ground + 0.4, -V.L / 2 - 0.01);   // plate
  // wheels: tyre, rim, a hub
  const rimTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#9a9ea2'; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill(); g.fillStyle = '#2a2c2e'; for (let k = 0; k < 5; k++) { g.save(); g.translate(64, 64); g.rotate(k / 5 * Math.PI * 2); g.beginPath(); g.ellipse(0, -36, 12, 20, 0, 0, Math.PI * 2); g.fill(); g.restore(); } g.fillStyle = '#c8ccd0'; g.beginPath(); g.arc(64, 64, 12, 0, Math.PI * 2); g.fill(); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t; })();
  const rimMat = std({ map: rimTex, roughness: 0.3, metalness: 0.8 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const w = new T.Group(); w.position.set(sx * (V.W / 2 - 0.13), V.ground + 0.18, sz * V.wb); root.add(w); parts.push({ m: w, kind: 'wheel', home: w.position.clone(), q0: w.quaternion.clone() });
    const tr = new T.Mesh(new T.TorusGeometry(0.3, 0.1, 10, 24), tire); tr.rotation.y = Math.PI / 2; tr.castShadow = true; w.add(tr);
    const rim = new T.Mesh(new T.CircleGeometry(0.24, 24), rimMat); rim.position.x = sx * 0.06; rim.rotation.y = sx * Math.PI / 2; w.add(rim);
    const hub = new T.Mesh(new T.CylinderGeometry(0.22, 0.22, 0.16, 20), std({ color: 0x3a3a3a, roughness: 0.6 })); hub.rotation.z = Math.PI / 2; w.add(hub);
  }
  return { root, parts, paint, glass, V };
}

// a blast takes the car apart: deterministic flights for every panel, then they lie where they land
export function planBlast(car, seed) {
  let a = seed >>> 0; const r = () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (const p of car.parts) {
    const h = p.home, up = { body: 1.2, cabin: 7, door: 4, hood: 8, trunk: 6, wheel: 3.5, bumper: 2.5, mirror: 5, trim: 3, bed: 3 }[p.kind] || 3;
    const side = { body: 0.3, cabin: 1.2, door: 5, hood: 1.5, trunk: 1.5, wheel: 4, bumper: 2.5, mirror: 4, trim: 3, bed: 1.5 }[p.kind] || 2;
    const dir = Math.atan2(h.x || (r() - 0.5), h.z || (r() - 0.5)) + (r() - 0.5) * 0.8;
    p.v = new T.Vector3(Math.sin(dir) * side * (0.7 + r() * 0.6), up * (0.7 + r() * 0.6), Math.cos(dir) * side * (0.7 + r() * 0.6));
    p.w = new T.Vector3((r() - 0.5) * (p.kind === 'body' ? 0.6 : 9), (r() - 0.5) * (p.kind === 'body' ? 0.8 : 9), (r() - 0.5) * (p.kind === 'body' ? 0.6 : 9));
    const rest = p.kind === 'wheel' ? 0.3 : p.kind === 'body' ? 0 : 0.06;
    const vy = p.v.y, y0 = h.y; p.T = (vy + Math.sqrt(vy * vy + 2 * G * Math.max(0, y0 - rest))) / G;
  }
}
const _e = new T.Euler(), _q = new T.Quaternion();
// a = seconds since the blast (negative: still whole)
export function poseBlast(car, a) {
  const burnt = a > 0;
  for (const p of car.parts) {
    if (!(a > 0) || !p.v) { p.m.position.copy(p.home); p.m.quaternion.copy(p.q0); continue; }
    const t = Math.min(a, p.T);
    p.m.position.set(p.home.x + p.v.x * t, p.home.y + p.v.y * t - G / 2 * t * t, p.home.z + p.v.z * t);
    _e.set(p.w.x * t, p.w.y * t, p.w.z * t); _q.setFromEuler(_e); p.m.quaternion.copy(p.q0).premultiply(_q);
    if (p.kind === 'body') p.m.position.y = Math.max(0, p.m.position.y) - Math.min(1, a) * 0.08;   // settles onto its rims
  }
  if (burnt !== car.burnt) {
    car.burnt = burnt;
    car.paint.color.set(burnt ? 0x1a1816 : car.paintHex); car.paint.roughness = burnt ? 0.95 : 0.32; car.paint.metalness = burnt ? 0.1 : 0.45;
    car.glass.visible = !burnt; car.parts.forEach((p) => { if (p.kind === 'cabin') p.m.children[0].visible = !burnt; });
  }
}
export { PAINT };
