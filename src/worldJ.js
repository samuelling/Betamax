// The Jump, drawn. Inside: the hold of a C-130 in red light — ribs and quilted insulation, four rows of red webbing
// seats, the anchor-line cables, the jump lights by the doors, the ramp shut behind. Outside, in the aircraft's frame:
// the moon low to port, the Gulf a thousand feet down sliding past at 130 knots, eight more Hercules in three vees,
// tracer climbing out of the dark in slow red strings, flak bursting black at your height, searchlights, the coast and
// the port on fire coming up under you, and the sky behind filling with canopies.
import * as THREE from 'three';
import { CABIN, DROP, V } from './terrainJ.js';
import { JT } from './layoutJ.js';
import { mulberry32, smoothstep } from './rng.js';
import * as TX from './textures.js';
import { place, box, cyl, merge, std, SUN_DIR } from './world.js';
import { F } from './sim.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const canvasTex = (w, h, draw, rep = true) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
const DZ = (CABIN.doorZ0 + CABIN.doorZ1) / 2;

// ---------------------------------------------------------------- the airframe (for the formation and our own outside)
function loftTube(sec, n = 18) {
  // sections: [z, halfW, halfH, yc]; a rounded-square cross-section (superellipse)
  const pos = [], idx = [];
  sec.forEach(([z, w, h, yc]) => { for (let k = 0; k <= n; k++) { const a = k / n * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), e = 0.6; pos.push(Math.sign(c) * Math.pow(Math.abs(c), e) * w, yc + Math.sign(s) * Math.pow(Math.abs(s), e) * h, z); } });
  for (let i = 0; i < sec.length - 1; i++) for (let k = 0; k < n; k++) { const a = i * (n + 1) + k, b = a + n + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }   // wound to face outward
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
function wingGeo(span, c0, c1, t, sweep = 0) {
  const g = new THREE.BoxGeometry(span, t, c0, 24, 1, 2), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), u = Math.abs(x) / (span / 2), c = c0 + (c1 - c0) * u; p.setZ(i, p.getZ(i) / c0 * c + u * sweep); p.setY(i, p.getY(i) * (1 - u * 0.5)); }
  g.computeVertexNormals(); return g;
}
export function buildC130(inside = false) {
  const g = new THREE.Group(), grey = std([0.24, 0.26, 0.27], 0.7, 0.2), dark = std([0.05, 0.06, 0.07], 0.2, 0.5), glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.6, 0.7), toneMapped: false });
  const add = (geo, mat, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast && !inside; m.receiveShadow = true; g.add(m); return m; };
  const tube = loftTube([[-16.2, 0.2, 0.3, 1.4], [-15.6, 1.0, 1.0, 1.45], [-14.6, 1.7, 1.7, 1.45], [-13.2, 2.1, 2.05, 1.4], [-11, 2.2, 2.15, 1.35], [7.6, 2.2, 2.15, 1.35], [9.8, 2.0, 1.7, 1.85], [12.4, 1.3, 1.0, 2.75], [14.6, 0.5, 0.45, 3.4], [15.0, 0.1, 0.1, 3.5]]);
  add(tube, grey, !inside);
  // cockpit glazing
  for (const sx of [-1, 1]) add(place(new THREE.BoxGeometry(0.06, 0.55, 1.6), 0, 0, 0, 0, 0, 0), dark).position.set(sx * 1.55, 2.95, -14.0);
  add(box(2.4, 0.5, 0.06, 0, 3.0, -15.0, -0.5, 0, 0), dark);
  // the high wing, the four nacelles and props
  add(place(wingGeo(40.4, 4.9, 2.7, 0.55, 0.9), 0, 3.85, -2.2), grey);
  g.props = [];
  for (const x of [-10.4, -5.3, 5.3, 10.4]) {
    add(place(new THREE.CylinderGeometry(0.62, 0.55, 6.2, 14), x, 3.25, -4.6, Math.PI / 2, 0, 0), grey);
    add(place(new THREE.ConeGeometry(0.42, 0.9, 12), x, 3.25, -8.1, -Math.PI / 2, 0, 0), grey);
    const pr = new THREE.Group(); pr.position.set(x, 3.25, -7.75);
    for (let k = 0; k < 6; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, 2.05, 0.05), dark); b.position.y = 1.02; const h = new THREE.Group(); h.rotation.z = k / 6 * Math.PI * 2; h.add(b); b.rotation.y = 0.5; pr.add(h); }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(2.1, 32), new THREE.MeshBasicMaterial({ color: 0x0a0c0e, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide })); pr.add(disc);
    g.add(pr); g.props.push(pr);
    const ex = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.6, 0.2), toneMapped: false })); ex.position.set(x + (x > 0 ? 0.35 : -0.35), 3.05, -1.6); g.add(ex);
  }
  // tail: tailplane and fin; sponsons
  add(place(wingGeo(16.2, 3.6, 1.9, 0.32, 0.7), 0, 3.7, 13.2), grey);
  { const sh = new THREE.Shape(); sh.moveTo(9.4, 0); sh.lineTo(15.2, 0); sh.lineTo(15.5, 7.4); sh.lineTo(13.0, 7.4); sh.lineTo(9.4, 0); const fin = new THREE.ExtrudeGeometry(sh, { depth: 0.36, bevelEnabled: false }); fin.translate(0, 0, -0.18); fin.rotateY(-Math.PI / 2); fin.translate(0, 3.3, 0); add(fin, grey); }
  for (const sx of [-1, 1]) add(place(new THREE.CapsuleGeometry(0.8, 5, 4, 10), sx * 2.15, 0.55, 0.2, Math.PI / 2, 0, 0, 1, 1, 0.8), grey);
  // formation strip lights (dim green, so the next ship can hold station on you in the dark)
  for (const sx of [-1, 1]) add(box(0.04, 0.08, 2.2, sx * 2.2, 2.6, 3), glow, false);
  add(box(0.04, 1.4, 0.08, 0.2, 7.4, 13.3), glow, false); add(box(0.6, 0.06, 0.1, 0, 3.85, -0.2 + 0), glow, false);
  for (const sx of [-1, 1]) add(box(1.2, 0.05, 0.08, sx * 19.8, 3.9, -1.4), glow, false);
  return g;
}

// ---------------------------------------------------------------- textures
function quiltTex() {
  return canvasTex(256, 256, (g, w, h) => {
    const r = mulberry32(130); g.fillStyle = '#5c6152'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4000; i++) { const v = r(); g.fillStyle = `rgba(${70 + v * 40 | 0},${74 + v * 40 | 0},${62 + v * 30 | 0},0.5)`; g.fillRect(r() * w, r() * h, 2, 2); }
    g.strokeStyle = 'rgba(30,32,26,0.75)'; g.lineWidth = 3;
    for (let k = -4; k < 8; k++) { g.beginPath(); g.moveTo(k * 64, 0); g.lineTo(k * 64 + 256, 256); g.stroke(); g.beginPath(); g.moveTo(k * 64 + 256, 0); g.lineTo(k * 64, 256); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,0.06)'; for (let k = 0; k < 8; k++) for (let j = 0; j < 8; j++) { g.beginPath(); g.arc(k * 64 + 32, j * 64, 18, 0, 7); g.fill(); }
  });
}
function webTex() {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#5a0c0a'; g.fillRect(0, 0, w, h); g.fillStyle = '#9a1a14';
    for (let k = 0; k < 8; k++) { g.fillRect(k * 16 + 2, 0, 11, h); g.fillRect(0, k * 16 + 2, w, 11); }
    g.fillStyle = 'rgba(0,0,0,0.25)'; for (let k = 0; k < 8; k++) for (let j = 0; j < 8; j++) if ((k + j) % 2) g.fillRect(k * 16 + 2, j * 16 + 2, 11, 11);
  });
}
function plateTex() {
  return canvasTex(256, 256, (g, w, h) => {
    const r = mulberry32(3); g.fillStyle = '#5a5e60'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 6000; i++) { const v = 70 + r() * 50; g.fillStyle = `rgba(${v},${v + 3},${v + 5},0.5)`; g.fillRect(r() * w, r() * h, 1.5, 1.5); }
    for (let j = 0; j < 16; j++) for (let k = 0; k < 16; k++) { g.save(); g.translate(k * 16 + 8 + (j % 2) * 8, j * 16 + 8); g.rotate((k + j) % 2 ? 0.8 : -0.8); g.fillStyle = 'rgba(150,155,160,0.55)'; g.fillRect(-5, -1.2, 10, 2.4); g.restore(); }
  });
}
function stencil(lines, w = 512, h = 128, fg = '#d8d4c4', bg = 'rgba(0,0,0,0)') {
  return canvasTex(w, h, (g) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; lines.forEach(([t, s, y]) => { g.font = `bold ${s}px "Courier New", monospace`; g.fillText(t, w / 2, y); }); }, false);
}

// ---------------------------------------------------------------- the night: sky, moon, sea, and the world's lighting
export function buildNight(W, o = {}) {
  const moon = SUN_DIR.clone();
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMoon: { value: moon }, uGlow: { value: o.glow || 0 }, uFlash: { value: 0 }, uGlowDir: { value: o.glowDir || new THREE.Vector3(0, 0, -1) } }, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize((modelMatrix*vec4(position,1.0)).xyz - cameraPosition); vec4 p = projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.0); gl_Position = p.xyww; }',
    fragmentShader: `uniform vec3 uMoon, uGlowDir; uniform float uGlow, uFlash; varying vec3 vD;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main(){ vec3 d = normalize(vD);
        float up = clamp(d.y, -1.0, 1.0);
        vec3 c = mix(vec3(0.035, 0.05, 0.085), vec3(0.008, 0.012, 0.03), smoothstep(-0.05, 0.6, up));
        c = mix(c, vec3(0.012, 0.016, 0.022), smoothstep(0.0, -0.3, up));
        // stars
        vec3 q = floor(d * 420.0); float st = step(0.9975, h(q)) * smoothstep(0.02, 0.25, up); c += vec3(0.8, 0.85, 1.0) * st * (0.4 + 0.6 * h(q + 3.0));
        // the moon and its halo
        float m = max(dot(d, uMoon), 0.0); c += vec3(0.55, 0.6, 0.7) * pow(m, 30.0) * 0.18 + vec3(0.9, 0.92, 1.0) * smoothstep(0.99955, 0.9997, m) * 1.6;
        // ahead, the coast burning under the horizon
        float ahead = max(dot(d, uGlowDir), 0.0); c += vec3(0.5, 0.18, 0.05) * pow(ahead, 6.0) * smoothstep(0.25, -0.02, abs(up + 0.02)) * (0.25 + uGlow);
        c += vec3(0.9, 0.7, 0.55) * uFlash * 0.05;
        gl_FragColor = vec4(c, 1.0); }`,
  });
  W.sky = new THREE.Mesh(new THREE.SphereGeometry(4500, 32, 16), mat); W.sky.frustumCulled = false; W.sky.renderOrder = -10; W.scene.add(W.sky); W.skyU = mat.uniforms;
  { const envScene = new THREE.Scene(); envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), mat.clone())); const pm = new THREE.PMREMGenerator(W.renderer); W.envTex = pm.fromScene(envScene, 0.02).texture; W.scene.environment = W.envTex; W.scene.environmentIntensity = 0.6; }
  W.fogColor = o.fogColor || new THREE.Color(0.02, 0.028, 0.045); W.scene.fog = W.fog = new THREE.FogExp2(W.fogColor, o.fog || 0.00042);
  // moonlight (the 'sun' the rest of the engine knows about) and a cold fill
  const sun = new THREE.DirectionalLight(new THREE.Color(0.55, 0.62, 0.8), 0.55); sun.castShadow = true; sun.shadow.mapSize.set(W.q.shadow, W.q.shadow);
  const c = sun.shadow.camera; c.left = -30; c.right = 30; c.top = 30; c.bottom = -30; c.near = 1; c.far = 500; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  W.scene.add(sun, sun.target); W.sun = sun;
  W.hemi = new THREE.HemisphereLight(new THREE.Color(0.12, 0.15, 0.24), new THREE.Color(0.03, 0.03, 0.04), 0.35); W.scene.add(W.hemi);
}

export function buildJump(W) {
  const L = W.L, root = W.root, r = mulberry32(130);
  buildNight(W);
  // ---------- the hold: one shell with the doors cut out; ribs; quilted insulation ----------
  const C = CABIN, prof = [];
  prof.push([-C.hx, 0], [-C.hx, 1.9]);
  for (let k = 1; k < 12; k++) { const a = Math.PI - k / 12 * Math.PI; prof.push([Math.cos(a) * C.hx, 1.9 + Math.sin(a) * (C.h - 1.9)]); }
  prof.push([C.hx, 1.9], [C.hx, 0]);
  const plen = [0]; for (let i = 1; i < prof.length; i++) plen.push(plen[i - 1] + Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]));
  { const pos = [], uv = [], idx = [], zs = []; for (let z = C.z0; z <= C.z1 + 1e-3; z += 0.15) zs.push(z); [C.doorZ0, C.doorZ1].forEach((z) => zs.push(z)); zs.sort((a, b) => a - b);
    const np = prof.length; zs.forEach((z) => prof.forEach(([x, y], i) => { pos.push(x, y, z); uv.push(plen[i] / 0.7, z / 0.7); }));
    for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < np - 1; i++) {
      const zm = (zs[j] + zs[j + 1]) / 2, ym = (prof[i][1] + prof[i + 1][1]) / 2, xm = prof[i][0];
      if (Math.abs(Math.abs(xm) - C.hx) < 0.01 && Math.abs(prof[i + 1][0] - xm) < 0.01 && zm > C.doorZ0 && zm < C.doorZ1 && ym < C.doorH) continue;   // the doors
      const a = j * np + i, b = a + np; idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
    // split the door's wall segment at the door height so the cut is clean
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: quiltTex(), roughness: 0.95, side: THREE.DoubleSide })); m.castShadow = m.receiveShadow = true; root.add(m); }
  // the wall between floor and the door's top: the profile has a vertex at 1.9, the door is 1.85 tall, so add the lintel
  { const parts = [], frames = [], rail = std([0.42, 0.44, 0.45], 0.4, 0.7);
    for (const sd of [-1, 1]) { parts.push(box(0.08, 0.06, C.doorZ1 - C.doorZ0 + 0.2, sd * (C.hx - 0.02), C.doorH + 0.02, DZ)); for (const z of [C.doorZ0 - 0.06, C.doorZ1 + 0.06]) parts.push(box(0.12, C.doorH, 0.1, sd * (C.hx - 0.02), C.doorH / 2, z)); }
    for (let z = C.z0 + 0.3; z < C.z1; z += 0.52) { if (z > C.doorZ0 - 0.2 && z < C.doorZ1 + 0.2) continue; for (let i = 0; i < prof.length - 1; i++) { const [x0, y0] = prof[i], [x1, y1] = prof[i + 1], l = Math.hypot(x1 - x0, y1 - y0), mx = (x0 + x1) / 2 * 0.985, my = (y0 + y1) / 2 * 0.99; frames.push(place(new THREE.BoxGeometry(0.07, l + 0.02, 0.07), mx, my, z, 0, 0, Math.atan2(-(x1 - x0), y1 - y0))); } }
    root.add(Object.assign(new THREE.Mesh(merge(parts), rail), { castShadow: true }));
    const fm = new THREE.Mesh(merge(frames), std([0.36, 0.38, 0.36], 0.6, 0.4)); fm.castShadow = true; fm.receiveShadow = true; root.add(fm); }
  // floor: treadplate, the roller rails, tie-down rings
  { const fm = new THREE.Mesh(box(C.hx * 2, 0.1, C.z1 - C.z0 + 0.1, 0, -0.05, (C.z0 + C.z1) / 2), new THREE.MeshStandardMaterial({ map: (() => { const t = plateTex(); t.repeat.set(2, 10); return t; })(), roughness: 0.6, metalness: 0.6 })); fm.receiveShadow = true; root.add(fm);
    const parts = []; for (const x of [-0.85, 0.85]) { parts.push(box(0.22, 0.04, C.z1 - C.z0 - 1, x, 0.02, 0)); for (let z = C.z0 + 1; z < C.z1 - 1; z += 0.5) parts.push(place(new THREE.CylinderGeometry(0.035, 0.035, 0.18, 8), x, 0.045, z, 0, 0, Math.PI / 2)); }
    for (let z = C.z0 + 0.8; z < C.z1; z += 0.5) for (const x of [-1.35, 0, 1.35]) parts.push(place(new THREE.TorusGeometry(0.05, 0.012, 5, 10), x, 0.012, z, Math.PI / 2, 0, 0));
    root.add(Object.assign(new THREE.Mesh(merge(parts), std([0.5, 0.52, 0.53], 0.35, 0.8)), { receiveShadow: true })); }
  // the ramp (shut), its hydraulic rams; the forward bulkhead and the ladder up to the flight deck
  { const g = new THREE.Mesh(box(C.hx * 2 - 0.05, 0.12, 2.8, 0, 1.05, C.z1 + 1.15, 0.85, 0, 0), std([0.36, 0.38, 0.38], 0.6, 0.5)); g.receiveShadow = true; root.add(g);
    root.add(new THREE.Mesh(box(C.hx * 2, C.h, 0.1, 0, C.h / 2, C.z1 + 1.75), std([0.3, 0.32, 0.3], 0.7, 0.3)));
    for (const sx of [-1, 1]) root.add(new THREE.Mesh(cyl(0.05, 0.05, 2.2, 8, sx * 1.2, 1.5, C.z1 + 0.6, 0.9, 0, 0), std([0.7, 0.7, 0.72], 0.2, 0.9)));
    root.add(new THREE.Mesh(box(C.hx * 2, C.h, 0.12, 0, C.h / 2, C.z0 - 0.06), std([0.33, 0.35, 0.33], 0.8)));
    const lad = []; for (const sx of [-0.25, 0.25]) lad.push(box(0.05, 2.4, 0.05, 0.9 + sx, 1.2, C.z0 + 0.15)); for (let k = 0; k < 7; k++) lad.push(box(0.5, 0.04, 0.04, 0.9, 0.3 + k * 0.32, C.z0 + 0.15));
    root.add(new THREE.Mesh(merge(lad), std([0.6, 0.6, 0.62], 0.3, 0.8)));
    root.add(Object.assign(new THREE.Mesh(cyl(0.09, 0.09, 0.5, 10, -0.8, 1.2, C.z0 + 0.12), std([0.6, 0.06, 0.04], 0.4)), { castShadow: true }));
    const st = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.35), new THREE.MeshBasicMaterial({ map: stencil([['NO SMOKING', 60, 64]], 512, 128, '#c8c2a8'), transparent: true })); st.position.set(-0.3, 2.05, C.z0 + 0.01); root.add(st);
    for (const sd of [-1, 1]) { const s2 = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.22), new THREE.MeshBasicMaterial({ map: stencil([['STATIC LINE', 54, 64]], 512, 128, '#d8c860'), transparent: true })); s2.position.set(sd * (C.hx - 0.03), 2.0, DZ - 1.2); s2.rotation.y = -sd * Math.PI / 2; root.add(s2); } }
  // seats: aluminium frames and red webbing; webbing backs to the skin, back-to-back webbing down the middle
  { const web = new THREE.MeshStandardMaterial({ map: (() => { const t = webTex(); t.repeat.set(1, 12); return t; })(), roughness: 0.95, side: THREE.DoubleSide }), al = std([0.62, 0.63, 0.64], 0.35, 0.85);
    const pans = [], backs = [], tubes = [];
    for (const b of L.seatBenches) {
      const zc = (b.z0 + b.z1) / 2, len = b.z1 - b.z0, inward = b.row === 'out' ? -b.sd : b.sd;
      pans.push(box(0.42, 0.02, len, b.x + inward * 0.06, 0.45, zc));
      tubes.push(place(new THREE.CylinderGeometry(0.022, 0.022, len, 8), b.x + inward * 0.27, 0.45, zc, Math.PI / 2, 0, 0));
      for (let z = b.z0; z <= b.z1 + 1e-3; z += 1.9) tubes.push(cyl(0.02, 0.02, 0.45, 6, b.x + inward * 0.25, 0.225, z));
      if (b.row === 'out') backs.push(box(0.02, 0.9, len, b.sd * (C.hx - 0.05), 0.98, zc));
      else { backs.push(box(0.02, 0.95, len, b.sd * 0.1, 1.0, zc)); for (let z = b.z0; z <= b.z1 + 1e-3; z += 1.9) tubes.push(cyl(0.025, 0.025, C.h, 6, 0, C.h / 2, z)); }
    }
    for (const [list, mat] of [[pans, web], [backs, web], [tubes, al]]) { const m = new THREE.Mesh(merge(list), mat); m.castShadow = m.receiveShadow = true; root.add(m); } }
  // the anchor-line cables and the jump lights; portholes
  { const parts = []; for (const sd of [-1, 1]) parts.push(place(new THREE.CylinderGeometry(0.012, 0.012, C.z1 - C.z0 - 0.6, 6), sd * 0.62, 2.38, 0.1, Math.PI / 2, 0, 0));
    root.add(new THREE.Mesh(merge(parts), std([0.75, 0.75, 0.78], 0.25, 1)));
    W.jumpLights = [];
    for (const sd of [-1, 1]) {
      const red = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.02, 0.02), toneMapped: false })), grn = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.02, 0.1, 0.03), toneMapped: false }));
      red.position.set(sd * (C.hx - 0.05), 2.0, C.doorZ0 - 0.3); grn.position.set(sd * (C.hx - 0.05), 1.84, C.doorZ0 - 0.3); root.add(red, grn);
      root.add(new THREE.Mesh(box(0.06, 0.4, 0.16, sd * (C.hx - 0.02), 1.92, C.doorZ0 - 0.3), std([0.1, 0.1, 0.1], 0.6)));
      W.jumpLights.push({ red, grn });
    }
    const port = []; for (let z = C.z0 + 1; z < C.doorZ0 - 0.5; z += 2.1) for (const sd of [-1, 1]) port.push(place(new THREE.CircleGeometry(0.16, 16), sd * (C.hx - 0.01), 1.55, z, 0, -sd * Math.PI / 2, 0));
    W.portholes = new THREE.Mesh(merge(port), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.02, 0.03, 0.05), toneMapped: false, side: THREE.DoubleSide })); root.add(W.portholes); }
  // the doors: they slide up into the ceiling; the air deflectors swing out ahead of them
  W.doors = [-1, 1].map((sd) => { const d = new THREE.Mesh(box(0.08, C.doorH, C.doorZ1 - C.doorZ0, 0, C.doorH / 2, 0), std([0.3, 0.32, 0.31], 0.6, 0.4)); d.position.set(sd * (C.hx + 0.02), 0, DZ); d.castShadow = true; root.add(d);
    const win = new THREE.Mesh(new THREE.CircleGeometry(0.12, 12), new THREE.MeshBasicMaterial({ color: 0x050608 })); win.position.set(-sd * 0.05, 1.45, 0); win.rotation.y = -sd * Math.PI / 2; d.add(win);
    const def = new THREE.Mesh(box(0.04, 1.6, 0.7, 0, 0.8, 0), std([0.3, 0.32, 0.31], 0.6, 0.4)); def.position.set(sd * (C.hx + 0.22), 0.1, C.doorZ0 - 0.1); root.add(def); return { d, def, sd }; });
  // red troop lights along the ceiling
  W.cabinLights = [-4.5, 0, 4.6].map((z) => { const l = new THREE.PointLight(new THREE.Color(1, 0.12, 0.08), 1.25, 8, 1.6); l.position.set(0, 2.45, z); root.add(l); const b = new THREE.Mesh(box(0.5, 0.05, 0.14, 0, 2.66, z), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.15, 0.1), toneMapped: false })); root.add(b); return l; });
  W.doorLights = [-1, 1].map((sd) => { const l = new THREE.PointLight(new THREE.Color(1, 0.1, 0.06), 0.8, 5, 1.5); l.position.set(sd * (C.hx - 0.3), 1.9, C.doorZ0 - 0.4); root.add(l); return l; });
  W.flakLight = new THREE.PointLight(new THREE.Color(1, 0.75, 0.5), 0, 600, 1.2); root.add(W.flakLight);
  // our own airframe from outside (seen through the doors): the wing above, the nacelles, the tail
  { const me = buildC130(true); root.add(me); W.ourProps = me.props; }
  // static lines: hooked up (cable to shoulder), and the spent ones streaming out of the doors after the men are gone
  { const geo = new THREE.BoxGeometry(0.03, 0.006, 1).translate(0, 0, 0.5), mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.75, 0.62, 0.18), roughness: 0.8 });
    W.lines = new THREE.InstancedMesh(geo, mat, 40); W.lines.frustumCulled = false; W.lines.count = 0; root.add(W.lines);
    W.trail = new THREE.InstancedMesh(geo, mat, 40); W.trail.frustumCulled = false; W.trail.count = 0; root.add(W.trail); }

  // ---------- outside: the formation ----------
  W.planes = L.planes.map((p) => { const g = buildC130(false); root.add(g); g.position.set(p.x, p.y, p.z);
    const fire = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.makeFlashTex(), color: new THREE.Color(1.6, 0.6, 0.15), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); fire.visible = false; g.add(fire); fire.position.set(p.x < 0 ? 10.4 : -10.4, 3.4, -2);   // the engine on our side
    return { p, g, fire }; });
  // smoke trail of the one that's hit, and the splash
  W.smoke = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0x1a1816, roughness: 1, transparent: true, opacity: 0.85, depthWrite: false }), 260); W.smoke.count = 0; W.smoke.frustumCulled = false; root.add(W.smoke);
  // ---------- outside: the sea, the coast, the port burning ----------
  W.ground = new THREE.Group(); root.add(W.ground);
  { const sea = new THREE.Mesh(new THREE.PlaneGeometry(20000, 20000, 1, 1).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      uniforms: { uMoon: { value: SUN_DIR }, uT: { value: 0 }, uFog: { value: W.fogColor }, uShift: { value: 0 }, uCoast: { value: L.coastZ0 }, uFlash: { value: 0 } }, fog: false,
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
      fragmentShader: `uniform vec3 uMoon, uFog; uniform float uT, uShift, uCoast, uFlash; varying vec3 vW;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
        void main(){
          vec2 g = vec2(vW.x, vW.z - uShift);   // ground-frame
          float land = smoothstep(uCoast + 30.0 + (n(g * 0.004) - 0.5) * 300.0, uCoast - 30.0 + (n(g * 0.004) - 0.5) * 300.0, g.y);
          vec3 V = normalize(cameraPosition - vW);
          float w1 = n(g * 0.06 + vec2(uT * 0.3, 0.0)) + n(g * 0.17 - vec2(0.0, uT * 0.5)) * 0.5;
          vec3 N = normalize(vec3((w1 - 0.75) * 0.35, 1.0, (n(g * 0.09) - 0.5) * 0.35));
          vec3 R = reflect(-V, N); float sp = pow(max(dot(R, uMoon), 0.0), 120.0);
          vec3 sea = vec3(0.006, 0.012, 0.022) + vec3(0.5, 0.55, 0.65) * sp * 2.5 + vec3(0.02, 0.03, 0.05) * pow(1.0 - max(V.y, 0.0), 4.0);
          vec3 ground = mix(vec3(0.012, 0.014, 0.01), vec3(0.03, 0.025, 0.018), n(g * 0.01));
          vec3 c = mix(sea, ground, land) * (1.0 + uFlash * 3.0);
          float d = length(cameraPosition - vW), ff = 1.0 - exp(-pow(0.00042 * d, 2.0));
          gl_FragColor = vec4(mix(c, uFog, ff), 1.0);
        }` }));
    sea.position.y = DROP; sea.frustumCulled = false; root.add(sea); W.sea = sea; }
  // the town and the port: streetlights in a grid, the docks, ships, fires (all in the ground frame)
  { const pts = [], cols = [], cz = L.coastZ0, col = new THREE.Color();
    for (let i = 0; i < 5200; i++) { const gx = Math.round((-2600 + r() * 5200) / 60) * 60 + (r() < 0.5 ? (r() - 0.5) * 8 : 0), gz = cz - 120 - Math.round(Math.pow(r(), 0.7) * 3800 / 60) * 60 + (r() - 0.5) * 6; if (r() < 0.35) continue; pts.push(gx, DROP + 1, gz); col.setRGB(1.0, 0.72 + r() * 0.2, 0.4 + r() * 0.2); cols.push(col.r, col.g, col.b); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const pm = new THREE.PointsMaterial({ size: 2.6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const p = new THREE.Points(g, pm); p.frustumCulled = false; W.ground.add(p); W.townPts = pm;
    // fires in the port: flickering cores and columns of smoke lit from under
    W.fires = []; const fm = TX.makeFlashTex();
    for (let k = 0; k < 14; k++) { const gx = -900 + r() * 1800, gz = cz - 60 - r() * 700, s = new THREE.Sprite(new THREE.SpriteMaterial({ map: fm, color: new THREE.Color(1.8, 0.7, 0.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); s.position.set(gx, DROP + 12, gz); s.scale.setScalar(40 + r() * 60); W.ground.add(s); W.fires.push({ s, ph: r() * 9, b: s.scale.x }); }
    // ships at anchor off the port, with the guns
    const hulls = []; for (const gn of L.guns) { const gz = cz - 2600 + r() * 4600; gn.gz = gz; gn.gx = gn.x; hulls.push(box(14, 6, 90, gn.gx, DROP + 2, gz), box(8, 8, 14, gn.gx, DROP + 8, gz + 18)); }
    W.ground.add(new THREE.Mesh(merge(hulls), std([0.03, 0.035, 0.04], 0.8)));
    // searchlights: long pale cones swinging over the sky
    const cone = new THREE.CylinderGeometry(42, 0.8, 2200, 20, 1, true).translate(0, 1100, 0), cm = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.18, 0.2, 0.24), transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    W.beams = L.searchlights.map((s) => { const m = new THREE.Mesh(cone, cm); m.position.set(s.x, DROP + 2, cz - 200 - (s.z0 + 900) * 0.4); W.ground.add(m); return { s, m }; }); }
  // ---------- the flak: tracer strings and black bursts ----------
  { const g = new THREE.BoxGeometry(0.5, 0.5, 26).translate(0, 0, -13);
    W.tracers = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.55, 0.2), toneMapped: false, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }), 600);
    W.tracers.frustumCulled = false; W.tracers.count = 0; root.add(W.tracers);
    W.flashes = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: TX.makeFlashTex(), color: new THREE.Color(2.2, 1.4, 0.8), toneMapped: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }), 40);
    W.flashes.frustumCulled = false; W.flashes.count = 0; root.add(W.flashes);
    W.puffs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0x0e0e0f, roughness: 1, transparent: true, opacity: 0.8, depthWrite: false }), 300);
    W.puffs.frustumCulled = false; W.puffs.count = 0; root.add(W.puffs); }
  // ---------- canopies: everyone who has gone out of any door, ours included ----------
  { const can = merge([new THREE.SphereGeometry(4, 16, 6, 0, Math.PI * 2, 0, Math.PI * 0.42).translate(0, -1.8, 0)]);
    const lines = []; for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; _a.set(Math.cos(a) * 3.3, -1.3, Math.sin(a) * 3.3); _b.set(0, -7.4, 0); const l = _a.distanceTo(_b); const c = new THREE.CylinderGeometry(0.015, 0.015, l, 3); c.translate(0, l / 2, 0); c.applyQuaternion(_q.setFromUnitVectors(_up, _b.clone().sub(_a).normalize().negate())); c.translate(0, -7.4, 0); lines.push(c); }
    lines.push(new THREE.CapsuleGeometry(0.22, 1.1, 3, 6).translate(0, -8.2, 0));
    W.canopies = new THREE.InstancedMesh(can, new THREE.MeshStandardMaterial({ color: new THREE.Color(0.2, 0.22, 0.16), roughness: 0.95, side: THREE.DoubleSide }), 360);
    W.risers = new THREE.InstancedMesh(merge(lines), std([0.08, 0.08, 0.07], 0.9), 360);
    W.canopies.frustumCulled = W.risers.frustumCulled = false; W.canopies.count = W.risers.count = 0; root.add(W.canopies, W.risers);
    W.jumpers = [];
    L.planes.forEach((p) => { for (let j = 0; j < 32; j++) W.jumpers.push({ t: p.jump + Math.floor(j / 2) * 1.05 + (j % 2) * 0.45, x: p.x + (j % 2 ? 2.4 : -2.4), y: p.y + 0.9, z: p.z + DZ, sd: j % 2 ? 1 : -1, seed: r(), plane: p }); }); }
  W.jumpUpdate = (tau, cam) => updateJump(W, tau, cam);
}

// a hit aircraft's track: engine fire, rolling away to starboard, nose down, falling back and into the sea
function hitPose(p, t, out) {
  const k = Math.max(0, t - p.hit), sd = Math.sign(p.x) || 1;   // it rolls away from you
  out.x = p.x + sd * (3 * k + 0.25 * k * k); out.y = p.y - 1.75 * k * k; out.z = p.z + 1.1 * k * k; out.roll = -sd * Math.min(1.4, 0.07 * k * k); out.pitch = -Math.min(0.5, 0.04 * k); out.k = k; out.sd = sd;
  return out;
}
const _hp = {};
function updateJump(W, tau, cam) {
  const L = W.L, T = JT, C = CABIN;
  const shift = V * tau;
  // props
  for (const pr of W.ourProps) pr.rotation.z = tau * 63;
  // doors: up into the ceiling over a second and a half
  const op = smoothstep(T.doors, T.doors + 1.6, tau);
  for (const o of W.doors) { o.d.position.y = op * (C.doorH - 0.05); o.d.position.x = o.sd * (C.hx + 0.02 - op * 0.1); o.def.rotation.y = -o.sd * op * 0.9; o.def.visible = op > 0; }
  // lights: troop lights red; jump lights red from the warning, green at the green light
  const red = tau >= T.warn && tau < T.green, grn = tau >= T.green;
  for (const j of W.jumpLights) { j.red.material.color.setRGB(red ? 2.4 : 0.25, red ? 0.12 : 0.02, red ? 0.08 : 0.02); j.grn.material.color.setRGB(grn ? 0.1 : 0.02, grn ? 1.5 : 0.1, grn ? 0.3 : 0.03); }
  for (const l of W.doorLights) { l.color.setRGB(grn ? 0.15 : 1, grn ? 1 : 0.1, grn ? 0.3 : 0.06); l.intensity = grn ? 0.9 : red ? 1.1 : 0.3; }
  // the formation, bobbing in the air; the one that's hit
  for (const o of W.planes) {
    const p = o.p; for (const pr of o.g.props) pr.rotation.z = tau * 63;
    if (p.hit > 0 && tau > p.hit) { hitPose(p, tau, _hp); o.g.position.set(_hp.x, _hp.y, _hp.z); o.g.rotation.set(_hp.pitch, 0, _hp.roll); o.fire.visible = _hp.y > DROP + 5; o.fire.scale.setScalar(13 + Math.sin(tau * 23) * 3 + _hp.k * 1.2); o.g.visible = _hp.y > DROP - 20; }
    else { o.g.position.set(p.x + Math.sin(tau * 0.31 + p.bob) * 1.2, p.y + Math.sin(tau * 0.47 + p.bob * 2) * 1.6, p.z + Math.sin(tau * 0.23 + p.bob) * 2); o.g.rotation.set(0, 0, Math.sin(tau * 0.41 + p.bob) * 0.03); o.fire.visible = false; o.g.visible = true; }
  }
  // its smoke, left hanging in the air (so streaming back past you), and the splash where it goes in
  { let n = 0; const hp = W.planes.find((o) => o.p.hit > 0); if (hp && tau > hp.p.hit) { const p = hp.p;
      for (let te = p.hit; te < tau && n < 250; te += 0.09) { hitPose(p, te, _hp); if (_hp.y < DROP + 2) break; const age = tau - te; _p.set(_hp.x - _hp.sd * 10.4 * Math.cos(_hp.roll), _hp.y + 3.4 + _hp.sd * 10.4 * Math.sin(_hp.roll), _hp.z - 2 + V * age); const sc = 3 + age * 4.5 + Math.sin(te * 37) * 1.2; _s.setScalar(sc); _q.identity(); _m.compose(_p, _q, _s); W.smoke.setMatrixAt(n++, _m); }
      const tImp = p.hit + Math.sqrt((p.y - DROP) / 1.75); if (tau > tImp) { hitPose(p, tImp, _hp); const age = tau - tImp; for (let k = 0; k < 8 && n < 260; k++) { _p.set(_hp.x + Math.sin(k * 2.4) * 14, DROP + 6 + k * 5 + age * 3, _hp.z + V * age + Math.cos(k * 2.4) * 14); _s.setScalar(10 + age * 4); _q.identity(); _m.compose(_p, _q, _s); W.smoke.setMatrixAt(n++, _m); } } }
    W.smoke.count = n; W.smoke.instanceMatrix.needsUpdate = true; }
  // the ground goes by; the port's fires; searchlights swinging
  W.ground.position.z = shift; W.sea.material.uniforms.uShift.value = shift; W.sea.material.uniforms.uT.value = tau;
  for (const f of W.fires) f.s.scale.setScalar(f.b * (0.85 + Math.sin(tau * 7 + f.ph) * 0.1 + Math.sin(tau * 13.7 + f.ph * 2) * 0.06));
  for (const b of W.beams) { const s = b.s; b.m.rotation.set(-0.5 + Math.sin(tau * s.sp + s.ph) * 0.35, 0, Math.sin(tau * s.sp * 0.7 + s.ph * 2) * 0.55); }
  W.skyU.uGlow.value = smoothstep(T.start, T.green, tau) * 1.2;
  // tracer: strings of rounds climbing from the guns on the ships and the shore, falling behind as you fly through
  { let n = 0; const M = W.tracers;
    for (const g of L.guns) for (const b of g.burst) {
      if (b.t > tau || b.t + b.n / b.rate + 3.2 < tau) continue;
      for (let i = 0; i < b.n && n < 600; i++) {
        const tf = b.t + i / b.rate, age = tau - tf; if (age < 0 || age > 3.2) continue;
        _a.set(g.gx, DROP + 6, g.gz + V * tf);
        _b.set(b.aimX + Math.sin(i * 1.7 + g.seed) * 14, b.aimY + Math.cos(i * 2.3) * 10, -150 + Math.sin(i + g.seed) * 40).sub(_a).normalize().multiplyScalar(850); _b.z += V;
        _p.copy(_a).addScaledVector(_b, age); _p.y -= 4.9 * age * age;
        _q.setFromUnitVectors(new THREE.Vector3(0, 0, -1), _b.clone().normalize()); _s.set(1, 1, 1); _m.compose(_p, _q, _s); M.setMatrixAt(n++, _m);
      }
    }
    M.count = n; M.instanceMatrix.needsUpdate = true; }
  // heavy flak: a flash, then a black puff that hangs where it burst (so goes back past you at 130 knots)
  { let nf = 0, np = 0, light = 0, lp = null; const camQ = cam.quaternion;
    for (const b of L.bursts) {
      const age = tau - b.t; if (age < 0) break; if (age > 9) continue;
      _p.set(b.x, b.y, b.z + V * age);
      if (age < 0.35 && nf < 40) { const s = (30 + age * 60) * b.big; _s.set(s, s, s); _m.compose(_p, camQ, _s); W.flashes.setMatrixAt(nf++, _m); const li = (1 - age / 0.35) * 40 * b.big * (b.close ? 4 : 1); if (li > light) { light = li; lp = _p.clone(); } }
      for (let k = 0; k < 5 && np < 300; k++) { const sc = (3 + Math.min(age, 2) * 4 + age * 0.8) * b.big * (0.7 + (k % 3) * 0.2); _a.set(_p.x + Math.sin(k * 2.1 + b.t) * sc * 0.6, _p.y + Math.cos(k * 1.7) * sc * 0.4, _p.z + Math.sin(k * 3.3) * sc * 0.5); _s.setScalar(sc); _q.identity(); _m.compose(_a, _q, _s); W.puffs.setMatrixAt(np++, _m); }
    }
    W.flashes.count = nf; W.flashes.instanceMatrix.needsUpdate = true; W.puffs.count = np; W.puffs.instanceMatrix.needsUpdate = true;
    W.flakLight.intensity = light * 30; if (lp) W.flakLight.position.copy(lp);
    W.skyU.uFlash.value = Math.min(1, light / 40); W.sea.material.uniforms.uFlash.value = Math.min(1, light / 60);
    W.portholes.material.color.setRGB(0.02 + light * 0.02, 0.03 + light * 0.014, 0.05 + light * 0.008); }
  // canopies
  { let n = 0; const all = W.jumpers, ours = W.S ? W.S.actors.filter((a) => a.exitT > 0) : [];
    const draw = (te, x, y, z, sd, seed) => {
      const k = tau - te; if (k < 0.8 || k > 34 || n >= 360) return;
      const open = smoothstep(2.4, 3.6, k), drop = k < 3 ? 4.9 * k * k * 0.55 : 24.3 + (k - 3) * 5.4;
      _p.set(x + sd * Math.min(k, 1.2) * 3, y - drop, z + V * (k - (1 - Math.exp(-1.8 * k)) / 1.8));
      _e.set(Math.sin(k * 1.3 + seed * 9) * 0.12 * open, seed * 6, Math.sin(k * 1.1 + seed * 5) * 0.12 * open); _q.setFromEuler(_e);
      _s.set(0.15 + open * 0.85, 0.3 + open * 0.7, 0.15 + open * 0.85); _m.compose(_p, _q, _s); W.canopies.setMatrixAt(n, _m);
      _s.set(1, 1, 1); _m.compose(_p, _q, _s); W.risers.setMatrixAt(n, _m); n++;
    };
    for (const j of all) draw(j.t, j.x + Math.sin(tau * 0.31 + j.plane.bob) * 1.2, j.y, j.z, j.sd, j.seed);
    for (const a of ours) draw(a.exitT, a.sd * (C.hx + 0.5), 0.6, DZ, a.sd, a.skin);
    W.canopies.count = W.risers.count = n; W.canopies.instanceMatrix.needsUpdate = W.risers.instanceMatrix.needsUpdate = true; }
  // static lines: hooked up inside; spent ones streaming out of the doors
  if (W.S) {
    const S = W.S, f = Math.min(S.steps - 1.001, tau * 10), k0 = Math.floor(f), u = f - k0; let n = 0, nt = 0; const cnt = { [-1]: 0, [1]: 0 };
    for (const a of S.actors) {
      if (a.role !== 'para' && a.role !== 'jm') continue;
      if (a.exitT > 0 && tau >= a.exitT) { cnt[a.sd]++; continue; }
      if (a.role !== 'para' || tau < T.hook || (a.deathTime > 0 && tau >= a.deathTime)) continue;
      const o0 = (a.id * S.steps + k0) * F, o1 = o0 + F, R = S.rec, x = R[o0] + (R[o1] - R[o0]) * u, z = R[o0 + 2] + (R[o1 + 2] - R[o0 + 2]) * u;
      _a.set(a.sd * 0.62, 2.37, Math.min(z + 0.5, C.z1 - 1)); _b.set(x + a.sd * 0.12, 1.45, z - 0.05);
      const l = _a.distanceTo(_b); _q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _b.clone().sub(_a).normalize()); _s.set(1, 1, l); _m.compose(_a, _q, _s); if (n < 40) W.lines.setMatrixAt(n++, _m);
    }
    for (const sd of [-1, 1]) for (let k = 0; k < Math.min(cnt[sd], 18) && nt < 40; k++) {
      _a.set(sd * (C.hx - 0.2), 1.75 - k * 0.012, DZ - 0.25 + k * 0.02); const fl = Math.sin(tau * 9 + k * 1.7) * 0.25;
      _b.set(sd * (C.hx + 1.4 + k * 0.05), 1.0 + fl - k * 0.03, DZ + 3.8 + Math.cos(tau * 7 + k) * 0.4);
      const l = _a.distanceTo(_b); _q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _b.clone().sub(_a).normalize()); _s.set(1, 1, l); _m.compose(_a, _q, _s); W.trail.setMatrixAt(nt++, _m);
    }
    W.lines.count = n; W.trail.count = nt; W.lines.instanceMatrix.needsUpdate = W.trail.instanceMatrix.needsUpdate = true;
  }
  // moonlight shadows follow the camera
  const s = W.sun; s.target.position.set(cam.position.x, 0, cam.position.z); s.position.set(cam.position.x + SUN_DIR.x * 200, SUN_DIR.y * 200, cam.position.z + SUN_DIR.z * 200);
}
