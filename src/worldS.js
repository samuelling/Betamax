// The Night Before, drawn: the "7" at sea under the moon. The flight deck in the dark with its blue edge lights and
// parked aircraft, the island lit red; aft and below, the well deck in sodium light — the hovercraft by the open
// stern gate, the AAVs in two rows, the stair up to the flight deck; the black sea all round, the destroyer on the
// starboard beam (until it isn't), a frigate's lights far to port.
import * as THREE from 'three';
import { HULL, WELL, STAIR } from './terrainS.js';
import { ST } from './layoutS.js';
import { buildIFV, buildLCAC } from './vehicles.js';
import { mulberry32, smoothstep } from './rng.js';
import * as TX from './textures.js';
import { place, box, cyl, merge, std, SUN_DIR } from './world.js';
import { buildNight } from './worldJ.js';
import { heloPose } from './layout.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const canvasTex = (w, h, draw, rep = true) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
const SODIUM = new THREE.Color(1.0, 0.66, 0.32);

function nonSkid() { return canvasTex(256, 256, (g, w, h) => { const r = mulberry32(21); g.fillStyle = '#2a2b2d'; g.fillRect(0, 0, w, h); for (let i = 0; i < 16000; i++) { const v = 30 + r() * 30; g.fillStyle = `rgba(${v},${v},${v + 3},0.6)`; g.fillRect(r() * w, r() * h, 1.5, 1.5); } for (let i = 0; i < 20; i++) { g.fillStyle = `rgba(10,10,10,${0.1 + r() * 0.15})`; g.beginPath(); g.ellipse(r() * w, r() * h, 8 + r() * 30, 4 + r() * 14, r() * 3, 0, 7); g.fill(); } }); }
function bulkTex() { return canvasTex(256, 256, (g, w, h) => { const r = mulberry32(5); g.fillStyle = '#5c6064'; g.fillRect(0, 0, w, h); for (let i = 0; i < 8000; i++) { const v = 70 + r() * 40; g.fillStyle = `rgba(${v},${v + 2},${v + 4},0.35)`; g.fillRect(r() * w, r() * h, 2, 2); } g.strokeStyle = 'rgba(30,32,34,.8)'; g.lineWidth = 3; for (let x = 0; x <= w; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } g.fillStyle = 'rgba(120,70,40,.25)'; for (let i = 0; i < 30; i++) g.fillRect(r() * w, r() * h, 2, 10 + r() * 30); }); }

export function buildShipWorld(W) {
  const L = W.L, root = W.root, r = mulberry32(73), D = HULL.deck;
  buildNight(W, { fog: 0.0011, fogColor: new THREE.Color(0.015, 0.02, 0.032), glow: 0.2, glowDir: new THREE.Vector3(-1, 0.02, 0).normalize() });
  // ---------- the sea ----------
  { const sea = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000, 1, 1).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      uniforms: { uMoon: { value: SUN_DIR }, uT: { value: 0 }, uFog: { value: W.fogColor }, uFlash: { value: 0 }, uFire: { value: new THREE.Vector4(0, 0, 0, 0) } }, fog: false,
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
      fragmentShader: `uniform vec3 uMoon, uFog; uniform float uT, uFlash; uniform vec4 uFire; varying vec3 vW;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
        void main(){ vec2 g = vW.xz + vec2(uT * 4.0, 0.0);   // under way, slowly
          float w1 = n(g * 0.05 + vec2(uT * 0.12, 0.0)) + n(g * 0.14 - vec2(0.0, uT * 0.35)) * 0.5 + n(g * 0.4 + uT * 0.2) * 0.25;
          vec3 N = normalize(vec3((w1 - 0.9) * 0.4, 1.0, (n(g * 0.07 + 3.0) - 0.5) * 0.4)); vec3 V = normalize(cameraPosition - vW);
          vec3 R = reflect(-V, N); float sp = pow(max(dot(R, uMoon), 0.0), 90.0);
          vec3 c = vec3(0.004, 0.009, 0.016) + vec3(0.55, 0.6, 0.7) * sp * 2.2 + vec3(0.02, 0.03, 0.05) * pow(1.0 - max(V.y, 0.0), 4.0);
          // the wake down the side; firelight on the water near the burning destroyer
          float wake = smoothstep(18.0, 15.0, abs(vW.z)) * smoothstep(-90.0, 170.0, vW.x) * smoothstep(0.55, 0.9, w1) * 0.15; c += vec3(0.4, 0.45, 0.5) * wake;
          float fd = length(vW.xz - uFire.xy); c += vec3(1.0, 0.4, 0.1) * uFire.z * exp(-fd / 160.0) * (0.4 + 0.6 * sp * 0.0 + 0.6 * smoothstep(0.5, 0.95, w1));
          c *= 1.0 + uFlash * 4.0;
          float d = length(cameraPosition - vW), ff = 1.0 - exp(-pow(0.0011 * d, 2.0)); gl_FragColor = vec4(mix(c, uFog, ff), 1.0); }` }));
    sea.position.y = 0; root.add(sea); W.sea = sea; }
  // ---------- the hull and the flight deck ----------
  const grey = std([0.3, 0.32, 0.34], 0.6, 0.3), dark = std([0.16, 0.17, 0.18], 0.7, 0.3);
  { const pts = []; for (let k = 0; k <= 40; k++) { const u = k / 40, x = HULL.x0 + u * (HULL.x1 - HULL.x0), bow = x < HULL.x0 + 45 ? (HULL.x0 + 45 - x) / 45 : 0; pts.push([x, HULL.hz * (1 - bow * 0.75)]); }
    const shp = new THREE.Shape(); pts.forEach(([x, w], i) => (i ? shp.lineTo(x, -w) : shp.moveTo(x, -w))); for (let i = pts.length - 1; i >= 0; i--) shp.lineTo(pts[i][0], pts[i][1]);
    // the hull below the deck: open aft where the well is (we see into it from the stern)
    const hull = new THREE.ExtrudeGeometry(shp, { depth: D + 10, bevelEnabled: false }); hull.rotateX(-Math.PI / 2); hull.translate(0, -10, 0);
    const hm = new THREE.Mesh(hull, grey); hm.castShadow = false; hm.receiveShadow = true; root.add(hm);
    const t = nonSkid(); t.repeat.set(60, 8); const deck = new THREE.ExtrudeGeometry(shp, { depth: 0.3, bevelEnabled: false }); deck.rotateX(-Math.PI / 2); deck.translate(0, D - 0.3 + 0.002, 0);
    { const uv = deck.attributes.uv, p = deck.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 4, p.getZ(i) / 4); }
    const dm = new THREE.Mesh(deck, new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 })); dm.receiveShadow = true; root.add(dm);
    // the hole down the stair, its coaming
    root.add(new THREE.Mesh(box(12.4, 0.4, STAIR.z1 - STAIR.z0 + 0.4, STAIR.x0 + 6, D + 0.05, (STAIR.z0 + STAIR.z1) / 2), new THREE.MeshBasicMaterial({ color: 0x050505 })));
    const coam = []; for (const z of [STAIR.z0 - 0.15, STAIR.z1 + 0.15]) coam.push(box(12.4, 0.6, 0.1, STAIR.x0 + 6, D + 0.3, z)); coam.push(box(0.1, 0.6, STAIR.z1 - STAIR.z0 + 0.3, STAIR.x0 + 12.2, D + 0.3, (STAIR.z0 + STAIR.z1) / 2));
    root.add(new THREE.Mesh(merge(coam), std([0.7, 0.65, 0.2], 0.6))); }
  // markings: the centreline, landing spots with their numbers, foul lines; blue edge lights
  { const ln = [], wl = []; ln.push(box(220, 0.02, 0.3, 40, D + 0.02, 0)); for (let k = 0; k < 6; k++) { const x = -50 + k * 36; for (let a = 0; a < 24; a++) { const t0 = a / 24 * Math.PI * 2; wl.push(box(1.2, 0.02, 0.18, x + Math.cos(t0) * 6, D + 0.02, 4 + Math.sin(t0) * 6, 0, -t0 + Math.PI / 2, 0)); } }
    for (let x = -70; x < 160; x += 6) ln.push(box(3, 0.02, 0.2, x, D + 0.02, -HULL.hz + 3));
    root.add(new THREE.Mesh(merge(ln), new THREE.MeshBasicMaterial({ color: 0xa8a8a0 })), new THREE.Mesh(merge(wl), new THREE.MeshBasicMaterial({ color: 0xb8a840 })));
    const pts = []; for (let x = HULL.x0 + 30; x < HULL.x1; x += 5) for (const sd of [-1, 1]) pts.push(x, D + 0.15, sd * (HULL.hz - 0.6));
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); root.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, color: new THREE.Color(0.2, 0.4, 1.6), toneMapped: false, transparent: true, depthWrite: false }))); }
  // ---------- the island ----------
  { const I = L.island, cx = (I.x0 + I.x1) / 2, cz = (I.z0 + I.z1) / 2;
    const parts = [box(I.x1 - I.x0, 12, I.z1 - I.z0, cx, D + 6, cz), box(30, 8, 6, cx + 2, D + 16, cz), box(14, 6, 5, cx + 4, D + 23, cz), box(6, 2, 6, cx - 4, D + 27, cz), cyl(0.5, 0.8, 18, 8, cx + 8, D + 35, cz)];
    root.add(Object.assign(new THREE.Mesh(merge(parts), grey), { castShadow: true, receiveShadow: true }));
    const win = []; for (let x = cx - 12; x <= cx + 14; x += 2.2) win.push(box(1.6, 1.0, 0.05, x, D + 23.5, I.z0 + 2.4 - 0.02)); for (let x = cx - 10; x <= cx + 12; x += 3) win.push(box(1.2, 0.8, 0.05, x, D + 16.5, I.z0 + 3.4 - 0.02));
    root.add(new THREE.Mesh(merge(win), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.12, 0.08), toneMapped: false })));
    for (const d of L.islandDoors) root.add(new THREE.Mesh(box(1.4, 2.2, 0.08, d.x, D + 1.1, I.z0 - 0.02), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.12, 0.08), toneMapped: false })));
    const rad = new THREE.Mesh(box(4.6, 2.2, 0.3, 0, 0, 0), dark); rad.position.set(cx + 8, D + 41, cz); root.add(rad); W.radar = rad;
    root.add(new THREE.Mesh(place(new THREE.PlaneGeometry(7, 10), cx - 18, D + 12, I.z0 - 0.06, 0, Math.PI, 0), new THREE.MeshBasicMaterial({ map: canvasTex(128, 180, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#d8d8d0'; g.font = 'bold 170px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('7', w / 2, h / 2 + 8); }, false), transparent: true })));
    W.deckFlood = new THREE.PointLight(new THREE.Color(1, 0.85, 0.6), 110, 70, 1.5); W.deckFlood.position.set(cx - 20, D + 14, I.z0 - 3); root.add(W.deckFlood); }
  // ---------- aircraft parked along the port side: tiltrotors, one heavy helicopter; deck tractors ----------
  W.craft = L.craft.map((c) => { const g = new THREE.Group(); g.position.set(c.x, D, c.z); g.rotation.y = c.rot; root.add(g); const mat = std([0.32, 0.34, 0.36], 0.6, 0.3), mats = [mat];
    const add = (geo) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
    if (c.kind === 'heavy') { add(place(new THREE.CapsuleGeometry(1.7, 13, 6, 14), 0, 2.7, 0, Math.PI / 2, 0, 0)); add(box(0.8, 3.6, 4, 0, 4.2, -9)); add(cyl(0.2, 0.2, 1.4, 8, 0, 4.9, 1)); for (let k = 0; k < 7; k++) add(box(0.5, 0.06, 11, Math.cos(k / 7 * 6.28) * 5.5, 5.6, 1 + Math.sin(k / 7 * 6.28) * 5.5, 0, -k / 7 * 6.28 + Math.PI / 2, 0)); for (const sx of [-1.2, 1.2]) add(cyl(0.4, 0.4, 0.5, 10, sx, 0.4, -2, 0, 0, Math.PI / 2)); }
    else { add(place(new THREE.CapsuleGeometry(1.4, 11, 6, 14), 0, 2.2, 0, Math.PI / 2, 0, 0)); add(box(14, 0.5, 2.4, 0, 4.1, 0.6)); for (const sx of [-7, 7]) { add(cyl(0.7, 0.7, 4.2, 12, sx, 4.6, 0.6, 0, 0, 0)); for (let k = 0; k < 3; k++) add(box(0.4, 0.05, 5.5, sx, 6.8, 0.6 + 2.6, 0, k * 2.09, 0)); } add(box(0.4, 3, 2.8, 0, 3.6, -6.4)); add(box(5, 0.3, 1.6, 0, 4.6, -6.6)); }
    return { c, g, mats, charred: false }; });
  { const tm = std([0.75, 0.6, 0.12], 0.6), parts = []; for (const t of L.tugs) parts.push(box(2.2, 1.2, 3.4, t.x, D + 0.7, t.z, 0, t.rot, 0), box(1.6, 0.8, 1.2, t.x, D + 1.6, t.z, 0, t.rot, 0)); root.add(Object.assign(new THREE.Mesh(merge(parts), tm), { castShadow: true })); }
  // ---------- the well deck: walls with their frames, the overhead with its lights and pipes, the wet floor ----------
  { const bt = bulkTex(); bt.repeat.set(16, 4); const bm = new THREE.MeshStandardMaterial({ map: bt, roughness: 0.75, metalness: 0.35, side: THREE.DoubleSide }), len = WELL.x1 - WELL.x0 + 4, cx = (WELL.x0 + WELL.x1 + 4) / 2, hgt = WELL.roof - WELL.floor;
    const walls = [box(len, hgt, 0.2, cx, WELL.floor + hgt / 2, WELL.hz + 0.1), box(0.2, hgt, WELL.hz * 2 + 0.4, WELL.x0 - 0.1, WELL.floor + hgt / 2, 0)];
    walls.push(box(108.6 - WELL.x0, hgt, 0.2, (WELL.x0 + 108.6) / 2, WELL.floor + hgt / 2, -WELL.hz - 0.1), box(len - (112.4 - WELL.x0), hgt, 0.2, (112.4 + WELL.x1 + 4) / 2, WELL.floor + hgt / 2, -WELL.hz - 0.1), box(3.8, hgt - 3.2, 0.2, 110.5, WELL.floor + 3.2 + (hgt - 3.2) / 2, -WELL.hz - 0.1));
    walls.push(box(len, 0.3, WELL.hz * 2 + 0.4, cx, WELL.roof - 0.15, 0));
    root.add(Object.assign(new THREE.Mesh(merge(walls), bm), { receiveShadow: true }));
    const frames = []; for (let x = WELL.x0 + 2; x < WELL.x1 + 3; x += 3.5) { for (const sd of [-1, 1]) frames.push(box(0.4, hgt, 0.5, x, WELL.floor + hgt / 2, sd * (WELL.hz - 0.15))); frames.push(box(0.4, 0.6, WELL.hz * 2, x, WELL.roof - 0.6, 0)); }
    for (const z of [-4, -1, 2.5, 5.5]) frames.push(place(new THREE.CylinderGeometry(0.15, 0.15, len, 8), cx, WELL.roof - 1.1 - (z > 0 ? 0.3 : 0), z, 0, 0, Math.PI / 2));
    root.add(Object.assign(new THREE.Mesh(merge(frames), std([0.42, 0.44, 0.45], 0.6, 0.6)), { castShadow: true }));
    const fl = new THREE.Mesh(box(len, 0.1, WELL.hz * 2, cx, WELL.floor - 0.05, 0), new THREE.MeshStandardMaterial({ map: (() => { const t = nonSkid(); t.repeat.set(16, 4); return t; })(), color: 0x8a8a8a, roughness: 0.25, metalness: 0.5 })); fl.receiveShadow = true; root.add(fl);
    const lights = []; for (let x = WELL.x0 + 4; x < WELL.x1; x += 7) for (const z of [-3.6, 3.6]) lights.push(box(1.8, 0.12, 0.35, x, WELL.roof - 0.5, z));
    root.add(new THREE.Mesh(merge(lights), new THREE.MeshBasicMaterial({ color: SODIUM.clone().multiplyScalar(2.2), toneMapped: false })));
    W.wellLights = [102, 122, 145].map((x) => { const l = new THREE.PointLight(SODIUM, 170, 30, 1.2); l.position.set(x, WELL.roof - 1.5, 0); root.add(l); return l; });
    // general quarters: two rotating amber beacons on the well walls, and the red battle lamps along the overhead
    W.beacons = [[106, WELL.hz - 0.6], [138, -WELL.hz + 0.6]].map(([x, z], i) => {
      const g = new THREE.Group(); g.position.set(x, WELL.roof - 3.2, z); root.add(g);
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.3, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.4, 0.2), toneMapped: false })); g.add(lamp);
      const beam = new THREE.Mesh(new THREE.ConeGeometry(1.4, 7, 14, 1, true).translate(0, -3.5, 0).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.55, 0.1), transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      const spin = new THREE.Group(); spin.add(beam); g.add(spin);
      const l = new THREE.PointLight(new THREE.Color(1, 0.55, 0.12), 0, 26, 1.3); l.position.set(0, -0.6, z > 0 ? -1.2 : 1.2); g.add(l);
      return { g, spin, l, ph: i * 1.7 };
    });
    { const bl = []; for (let x = WELL.x0 + 7.5; x < WELL.x1; x += 14) for (const z of [-5.6, 5.6]) bl.push(box(0.5, 0.18, 0.5, x, WELL.roof - 0.9, z));
      W.battleLamps = new THREE.Mesh(merge(bl), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.15, 0.08), toneMapped: false })); root.add(W.battleLamps); }
    // the stern gate down into the water; stencils; the stair with its red light
    root.add(Object.assign(new THREE.Mesh(box(9, 0.4, WELL.hz * 2, HULL.x1 + 4, WELL.floor - 2.4, 0, 0, 0, -0.55), dark), { receiveShadow: true }));
    root.add(new THREE.Mesh(place(new THREE.PlaneGeometry(10, 1.4), 104, 12, WELL.hz - 0.05, 0, Math.PI, 0), new THREE.MeshBasicMaterial({ map: canvasTex(512, 72, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#e8d84a'; g.font = 'bold 54px "Courier New", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('WELL DECK  ·  NO SMOKING', w / 2, h / 2); }, false), transparent: true })));
    const st = [], rails = []; for (const s of L.steps) st.push(box(0.78, 0.08, STAIR.z1 - STAIR.z0 - 0.1, s.x, s.y - 0.04, (STAIR.z0 + STAIR.z1) / 2));
    for (const z of [STAIR.z0 + 0.1, STAIR.z1 - 0.1]) { const l = Math.hypot(STAIR.x1 - STAIR.x0, D - WELL.floor); rails.push(place(new THREE.BoxGeometry(l, 0.06, 0.06), (STAIR.x0 + STAIR.x1) / 2, (D + WELL.floor) / 2 + 1, z, 0, 0, -Math.atan2(D - WELL.floor, STAIR.x1 - STAIR.x0))); }
    root.add(Object.assign(new THREE.Mesh(merge(st), std([0.45, 0.46, 0.47], 0.5, 0.7)), { castShadow: true, receiveShadow: true }), new THREE.Mesh(merge(rails), std([0.75, 0.62, 0.15], 0.6)));
    const red = new THREE.PointLight(new THREE.Color(1, 0.1, 0.06), 16, 18, 1.6); red.position.set((STAIR.x0 + STAIR.x1) / 2, 12, (STAIR.z0 + STAIR.z1) / 2); root.add(red);
    // the corridor walls (we see them from the stair) and the hatch's ladder rail
    const cw = [box(STAIR.x1 - STAIR.x0, D - WELL.floor, 0.15, (STAIR.x0 + STAIR.x1) / 2, (D + WELL.floor) / 2, STAIR.z0 - 0.08), box(STAIR.x1 - 108.6 + (108.6 - STAIR.x0), D - WELL.floor, 0.15, (STAIR.x0 + 108.6) / 2, (D + WELL.floor) / 2, STAIR.z1 + 0.08)];
    root.add(Object.assign(new THREE.Mesh(merge(cw), bm), { receiveShadow: true })); }
  // ---------- in the well: the hovercraft, the AAVs ----------
  { const lc = buildLCAC(); lc.position.set(L.lcac.x, WELL.floor, L.lcac.z); lc.rotation.y = Math.PI / 2; root.add(lc);
    const t = buildIFV(); W.aavs = L.aavs.map((a) => { const g = t.clone(); g.position.set(a.x, WELL.floor, a.z); g.rotation.y = a.rot; root.add(g); const meshes = []; g.traverse((o) => { if (o.isMesh) meshes.push(o); }); const ramp = g.getObjectByName('ramp'); if (ramp) ramp.rotation.x = 1.45; return { a, g, meshes, charred: false }; }); }
  // ---------- the escorts ----------
  W.escort = buildDestroyer(L.escort, root, r); W.frigate = buildDestroyer(L.frigate, root, r, true);
  // the fast ropes
  W.ropes = [-1, 1].map((sd) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 6).translate(0, -0.5, 0), std([0.08, 0.08, 0.07], 0.9)); m.userData.sd = sd; root.add(m); return m; });
  // illumination flares: the destroyer fires them over the ship once the raid starts; each hangs under its little
  // parachute, swinging, and lights the whole deck white for half a minute (in rewind they climb back up and go out)
  { const fm = new THREE.SpriteMaterial({ map: TX.makeFlashTex(), color: new THREE.Color(3, 2.7, 2.4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    W.flareSched = [{ t: 21, x: 20, z: 60 }, { t: 34, x: 90, z: -50 }, { t: 47, x: -10, z: 30 }, { t: 60, x: 70, z: 70 }, { t: 73, x: 30, z: -40 }, { t: 86, x: 110, z: 40 }, { t: 99, x: 50, z: -60 }, { t: 112, x: 0, z: 50 }];
    W.flares = [0, 1].map(() => { const l = new THREE.PointLight(new THREE.Color(1, 0.93, 0.86), 0, 520, 1.08); const sp = new THREE.Sprite(fm); sp.scale.setScalar(9); l.add(sp); root.add(l); return l; });
    W.fireLight = new THREE.PointLight(new THREE.Color(1, 0.45, 0.12), 0, 900, 1.0); W.fireLight.position.set(L.escort.x, 30, L.escort.z - 20); root.add(W.fireLight); }
  W.shipUpdate = (tau, cam) => updateShip(W, tau, cam);
}

// a destroyer, built as two halves so it can break in two; lit until it's hit
function buildDestroyer(E, root, r, intact = false) {
  const len = E.len, brk = -len * 0.08, grey = std([0.26, 0.28, 0.3], 0.6, 0.3), dark = std([0.1, 0.11, 0.12], 0.7, 0.3);
  const halves = [[-len / 2, brk], [brk, len / 2]].map(([a, b], hi) => {
    const g = new THREE.Group(), parts = [], sup = [];
    const n = 12; for (let k = 0; k < n; k++) { const u0 = a + (b - a) * k / n, u1 = a + (b - a) * (k + 1) / n, um = (u0 + u1) / 2, taper = Math.max(0.15, 1 - Math.max(0, um / (len / 2) - 0.5) * 1.8 - Math.max(0, -um / (len / 2) - 0.8) * 2.5), w = 9 * taper; parts.push(box(u1 - u0 + 0.05, 9, w, um, 0.5, 0)); }
    if (hi === 1) { sup.push(box(30, 8, 12, 18, 9, 0), box(12, 8, 10, 22, 17, 0), cyl(0.6, 0.9, 20, 8, 20, 30, 0), box(10, 6, 8, -2, 8, 0)); parts.push(box(12, 2, 7, 52, 5.5, 0)); }
    else { sup.push(box(26, 7, 11, -36, 8, 0), box(5, 12, 5, -30, 14, 0), cyl(0.5, 0.7, 4, 8, -60, 7, 0, 0, 0, Math.PI / 2)); }
    g.add(Object.assign(new THREE.Mesh(merge(parts), grey), { castShadow: false }), new THREE.Mesh(merge(sup), grey));
    const lp = []; for (let k = 0; k < 18; k++) lp.push(a + r() * (b - a), 3 + r() * 10, (r() < 0.5 ? -1 : 1) * 5);
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3)); const pts = new THREE.Points(lg, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, color: new THREE.Color(1.4, 1.1, 0.7), toneMapped: false })); g.add(pts);
    g.position.set(E.x, 0, E.z); g.rotation.y = E.rot; root.add(g);
    return { g, pts, mats: [grey, dark], hi, a, b };
  });
  const fire = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.makeFlashTex(), color: new THREE.Color(1.8, 0.7, 0.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); fire.visible = false; root.add(fire);
  const smoke = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0x0c0b0a, roughness: 1, transparent: true, opacity: 0.85, depthWrite: false }), 80); smoke.frustumCulled = false; smoke.count = 0; root.add(smoke);
  return { E, halves, brk, fire, smoke, intact, charred: false };
}

const _hp = {};
function updateShip(W, tau, cam) {
  const L = W.L, D = HULL.deck;
  W.sea.material.uniforms.uT.value = tau;
  if (W.radar) W.radar.rotation.y = tau * 1.3;
  // flares: the two most recent burning ones
  { let n = 0; for (let i = W.flareSched.length - 1; i >= 0 && n < 2; i--) { const f = W.flareSched[i], a = tau - f.t; if (a < 0 || a > 32) continue;
      const l = W.flares[n++], k = Math.min(1, a / 1.2) * Math.min(1, (32 - a) / 4) * (0.85 + 0.15 * Math.sin(tau * 23 + i));
      l.position.set(f.x + Math.sin(a * 0.9 + i) * 6 + a * 1.2, 150 - a * 3.6, f.z + Math.cos(a * 0.7 + i) * 4); l.intensity = 420 * k; l.visible = true; }
    for (; n < 2; n++) { W.flares[n].intensity = 0; W.flares[n].visible = false; }
    const E = W.L.escort; W.fireLight.intensity = tau > E.hit ? (tau > E.blast ? 2600 * Math.max(0.4, Math.exp(-(tau - E.blast) / 80)) : 900) * (0.85 + 0.15 * Math.sin(tau * 7)) : 0; }
  // general quarters from the moment the helicopter is heard
  { const gq = tau > ST.come + 4; for (const b of W.beacons) { b.g.visible = gq; if (!gq) continue; const a = tau * 4.2 + b.ph; b.spin.rotation.y = a; b.l.intensity = 34 + 30 * Math.max(0, Math.cos(a)); } W.battleLamps.visible = gq; }
  // aircraft on deck: one burns
  for (const c of W.craft) { const burnt = c.c.burnT > 0 && tau >= c.c.burnT; if (burnt !== c.charred) { c.charred = burnt; for (const m of c.mats) { m.color.setRGB(burnt ? 0.06 : 0.32, burnt ? 0.055 : 0.34, burnt ? 0.05 : 0.36); m.roughness = burnt ? 1 : 0.6; } c.g.rotation.z = burnt ? 0.08 : 0; } }
  for (const a of W.aavs) { const burnt = a.a.burnT > 0 && tau >= a.a.burnT; if (burnt !== a.charred) { a.charred = burnt; for (const m of a.meshes) { if (!m.userData.mat) m.userData.mat = m.material; m.material = burnt ? (W._char || (W._char = std([0.06, 0.055, 0.05], 0.95))) : m.userData.mat; } } }
  // the ropes, while there are men on them
  { const hp = heloPose(L.helos[0], tau, _hp), on = tau > ST.hover - 0.5 && tau < ST.leave + 0.4; for (const m of W.ropes) { m.visible = on; if (!on) continue; const len = Math.max(0.1, hp.y - 1 - D); m.position.set(hp.x + 0.4, hp.y - 1, hp.z + m.userData.sd * 1.7); m.scale.set(1, len, 1); m.rotation.set(Math.sin(tau * 2 + m.userData.sd) * 0.03, 0, Math.sin(tau * 1.6) * 0.04); } }
  // the destroyer: hit, its magazine, breaking in two, going down; burning on the water for the rest of the tape
  { const X = W.escort, E = X.E, k = tau - E.blast;
    for (const h of X.halves) {
      const sg = h.hi ? 1 : -1;
      if (k > 0) { const ang = Math.min(0.7, 0.012 * k * k + 0.05 * k), sink = Math.min(60, 0.012 * k * k * k * 0.1 + 0.25 * k), lift = Math.min(10, k * 2.4) * Math.exp(-k / 8);
        h.g.position.set(E.x - Math.cos(E.rot) * 0 + 0, -sink + lift, E.z); h.g.rotation.set(0, E.rot, 0); h.g.rotateZ(sg * ang);
        h.g.position.x = E.x + Math.sin(E.rot + Math.PI / 2) * (sg * Math.min(8, k * 0.8)); h.g.visible = sink < 55; }
      else { h.g.position.set(E.x, Math.sin(tau * 0.5) * 0.3, E.z); h.g.rotation.set(Math.sin(tau * 0.37) * 0.01, E.rot, Math.sin(tau * 0.43) * 0.015); h.g.visible = true; }
      h.pts.visible = tau < E.hit;
    }
    const burnt = tau >= E.hit; if (burnt !== X.charred) { X.charred = burnt; for (const h of X.halves) h.mats[0].color.setRGB(burnt ? 0.08 : 0.26, burnt ? 0.075 : 0.28, burnt ? 0.07 : 0.3); }
    X.fire.visible = tau > E.hit; if (X.fire.visible) { X.fire.position.set(E.x, 6 + Math.max(0, 8 - k) , E.z); X.fire.scale.setScalar((k > 0 ? 70 : 30) * (0.9 + Math.sin(tau * 9) * 0.08) * (k > 0 ? Math.max(0.5, Math.exp(-k / 40)) : 1)); }
    let n = 0; if (tau > E.hit) for (let j = 0; j < 80; j++) { const age = ((tau - E.hit) * 0.6 + j * 1.3) % Math.min(100, (tau - E.hit) * 0.6 + 1); _p.set(E.x + age * 3 + Math.sin(j) * 6, 10 + age * 4.5, E.z - age * 1.5); _s.setScalar(8 + age * 1.8); _q.identity(); _m.compose(_p, _q, _s); X.smoke.setMatrixAt(n++, _m); }
    X.smoke.count = n; X.smoke.instanceMatrix.needsUpdate = true;
    W.sea.material.uniforms.uFire.value.set(E.x, E.z, tau > E.hit ? (k > 0 ? 1.4 * Math.max(0.35, Math.exp(-k / 60)) : 0.6) : 0, 0);
    W.sea.material.uniforms.uFlash.value = k > 0 && k < 1.5 ? (1 - k / 1.5) * 0.6 : 0;
    W.skyU.uFlash.value = k > 0 && k < 1.5 ? (1 - k / 1.5) * 3 : 0; }
  for (const h of W.frigate.halves) { h.g.position.y = Math.sin(tau * 0.45 + 2) * 0.3; }
  const s = W.sun; s.target.position.set(cam.position.x, 0, cam.position.z); s.position.set(cam.position.x + SUN_DIR.x * 200, SUN_DIR.y * 200, cam.position.z + SUN_DIR.z * 200);
}
