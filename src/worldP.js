// The Port, drawn, at night: sodium high-masts over a concrete wharf; the container yard; the transit sheds; the
// grain elevator and the port authority tower; the cranes; the grey cliff of the assault ship alongside with its
// gangway lit; the refinery across the channel with its flare; the Harbor Bridge to the east; and over the lot, the
// Hercules going over and the canopies coming down through the tracer.
import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { QUAY_Z, DECK, FAR_SHORE } from './terrainP.js';
import { PT } from './layoutP.js';
import { buildCar, PAINT } from './cars.js';
import { buildIFV } from './vehicles.js';
import { mulberry32, smoothstep } from './rng.js';
import * as TX from './textures.js';
import { place, box, cyl, merge, std, SUN_DIR } from './world.js';
import { buildNight, buildC130 } from './worldJ.js';
import { Megastructures } from './megastruct.js';
import { F } from './sim.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const canvasTex = (w, h, draw, rep = true) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
const SODIUM = new THREE.Color(1.0, 0.62, 0.28);

function concreteTex() {
  return canvasTex(512, 512, (g, w, h) => {
    const r = mulberry32(88); g.fillStyle = '#8a8680'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 30000; i++) { const v = 110 + r() * 50; g.fillStyle = `rgba(${v},${v - 3},${v - 8},0.35)`; g.fillRect(r() * w, r() * h, 1.5, 1.5); }
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(40,38,34,${0.08 + r() * 0.12})`; g.beginPath(); g.ellipse(r() * w, r() * h, 10 + r() * 50, 6 + r() * 30, r() * 3, 0, 7); g.fill(); }   // oil stains
    g.strokeStyle = 'rgba(50,48,44,0.6)'; g.lineWidth = 2; for (let k = 0; k <= 4; k++) { g.beginPath(); g.moveTo(0, k * 128); g.lineTo(w, k * 128); g.stroke(); g.beginPath(); g.moveTo(k * 128, 0); g.lineTo(k * 128, h); g.stroke(); }
  });
}
function corrugTex(base = '#7c7e80') {
  return canvasTex(128, 128, (g, w, h) => { g.fillStyle = base; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 8) { const gr = g.createLinearGradient(x, 0, x + 8, 0); gr.addColorStop(0, 'rgba(0,0,0,.25)'); gr.addColorStop(0.5, 'rgba(255,255,255,.12)'); gr.addColorStop(1, 'rgba(0,0,0,.25)'); g.fillStyle = gr; g.fillRect(x, 0, 8, h); } });
}
function containerTex() {
  return canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 6) { g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x, 3, 3, h - 6); } g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 0, w, 3); g.fillRect(0, h - 3, w, 3); g.fillRect(0, 0, 3, h); g.fillRect(w - 3, 0, 3, h); });
}

export function buildPort(W) {
  const L = W.L, root = W.root, r = mulberry32(361), hi = W.q.terrainSeg > 300;
  buildNight(W, { fog: 0.0017, fogColor: new THREE.Color(0.035, 0.026, 0.022), glow: 1.4, glowDir: new THREE.Vector3(0, 0.05, 1).normalize() });
  W.hemi.color.setRGB(0.1, 0.1, 0.14); W.hemi.groundColor.setRGB(0.16, 0.09, 0.04); W.hemi.intensity = 0.35;
  // ---------- the wharf, its edge, the water ----------
  { const t = concreteTex(); t.repeat.set(60, 34); const m = new THREE.Mesh(new THREE.PlaneGeometry(600, 340).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: t, roughness: 0.92 })); m.position.set(0, DECK, QUAY_Z - 170); m.receiveShadow = true; root.add(m);
    root.add(Object.assign(new THREE.Mesh(box(600, 13, 1.2, 0, DECK - 6.5, QUAY_Z - 0.6), std([0.36, 0.35, 0.33], 0.95)), { receiveShadow: true }));
    // painted lane lines and bay numbers
    const lines = []; for (let x = -240; x < 240; x += 3) lines.push(box(1.6, 0.02, 0.15, x, DECK + 0.015, QUAY_Z - 12)); for (let z = -170; z < 60; z += 4) lines.push(box(0.15, 0.02, 2, -55, DECK + 0.015, z), box(0.15, 0.02, 2, 70, DECK + 0.015, z));
    root.add(new THREE.Mesh(merge(lines), new THREE.MeshStandardMaterial({ color: 0xd8c050, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 })));
    // crane rails, bollards, fenders
    const rails = []; for (const z of [QUAY_Z - 17, QUAY_Z - 1]) rails.push(box(560, 0.12, 0.2, -10, DECK + 0.05, z));
    const bol = []; for (let x = -240; x < 240; x += 16) { bol.push(cyl(0.3, 0.38, 0.7, 10, x, DECK + 0.35, QUAY_Z - 0.9), place(new THREE.SphereGeometry(0.42, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), x, DECK + 0.7, QUAY_Z - 0.9)); }
    const fend = []; for (let x = -240; x < 240; x += 8) fend.push(box(1.4, 2.4, 0.6, x, DECK - 1.6, QUAY_Z + 0.1));
    root.add(new THREE.Mesh(merge(rails), std([0.45, 0.4, 0.36], 0.5, 0.8)), Object.assign(new THREE.Mesh(merge(bol), std([0.15, 0.15, 0.16], 0.6, 0.6)), { castShadow: true }), new THREE.Mesh(merge(fend), std([0.07, 0.07, 0.07], 0.9)));
    // the channel: dark water with the lights in it
    const water = new THREE.Mesh(new THREE.PlaneGeometry(3000, 900, 1, 1).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uFog: { value: W.fogColor }, uFire: { value: 0 } }, fog: false,
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
      fragmentShader: `uniform float uT, uFire; uniform vec3 uFog; varying vec3 vW;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
        void main(){ vec2 g = vW.xz; float w = n(g * vec2(0.08, 0.35) + vec2(uT * 0.2, 0.0)) * n(g * vec2(0.21, 0.6) - vec2(0.0, uT * 0.3));
          vec3 V = normalize(cameraPosition - vW); float fr = pow(1.0 - max(V.y, 0.0), 3.0);
          // streaks of reflected sodium light and fire, broken by the chop
          float streak = smoothstep(0.55, 0.85, w) * (0.5 + 0.5 * sin(g.x * 0.07));
          vec3 c = vec3(0.01, 0.012, 0.016) + vec3(0.9, 0.5, 0.2) * streak * 0.18 * fr + vec3(1.0, 0.45, 0.15) * uFire * streak * 0.2 + vec3(0.05, 0.04, 0.05) * fr;
          float d = length(cameraPosition - vW), ff = 1.0 - exp(-pow(0.0019 * d, 2.0)); gl_FragColor = vec4(mix(c, uFog, ff), 1.0); }` }));
    water.position.set(0, 0, QUAY_Z + 450); root.add(water); W.water = water; }
  // ---------- high-mast lights: a ring of sodium lamps on 30 m poles; the nearest few really light the ground ----------
  { const parts = [], lamps = [];
    for (const m of L.masts) { parts.push(cyl(0.25, 0.5, 30, 10, m.x, DECK + 15, m.z), cyl(1.6, 1.6, 0.4, 12, m.x, DECK + 30, m.z)); for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; lamps.push(box(0.7, 0.25, 0.5, m.x + Math.cos(a) * 1.4, DECK + 29.7, m.z + Math.sin(a) * 1.4, 0, -a, 0)); } }
    const pm = new THREE.Mesh(merge(parts), std([0.4, 0.4, 0.42], 0.5, 0.7)); pm.castShadow = true; root.add(pm);
    root.add(new THREE.Mesh(merge(lamps), new THREE.MeshBasicMaterial({ color: SODIUM.clone().multiplyScalar(2.4), toneMapped: false })));
    W.mastLights = [0, 1, 2, 3].map(() => { const l = new THREE.PointLight(SODIUM, 0, 95, 1.3); root.add(l); return l; });
    // halos round the lamps
    const halo = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: TX.makeSoftTex(), color: SODIUM.clone().multiplyScalar(0.7), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }), L.masts.length);
    halo.frustumCulled = false; W.halos = halo; root.add(halo); }
  // ---------- the container yard ----------
  { const geo = new THREE.BoxGeometry(12.2, 2.59, 2.44); const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i));
    const list = []; for (const st of L.stacks) for (let k = 0; k < st.n; k++) list.push([st.x + (r() - 0.5) * 0.3, DECK + 1.3 + k * 2.6, st.z + (r() - 0.5) * 0.15, st.seed * 13 + k]);
    const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ map: containerTex(), roughness: 0.7, metalness: 0.3 }), list.length), col = new THREE.Color();
    const pal = [[0.55, 0.12, 0.08], [0.1, 0.25, 0.45], [0.15, 0.35, 0.2], [0.6, 0.45, 0.12], [0.45, 0.45, 0.45], [0.7, 0.3, 0.1], [0.12, 0.12, 0.14], [0.6, 0.6, 0.62]];
    list.forEach(([x, y, z, sd], i) => { _e.set(0, (r() - 0.5) * 0.02, 0); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(1, 1, 1); _m.compose(_p, _q, _s); im.setMatrixAt(i, _m); const c = pal[Math.floor(Math.abs(Math.sin(sd * 12.9898)) * 1e4) % pal.length]; im.setColorAt(i, col.setRGB(...c)); });
    im.castShadow = im.receiveShadow = true; root.add(im); }
  // ---------- transit sheds ----------
  { const tex = corrugTex(); tex.repeat.set(12, 1.2); const wm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, metalness: 0.4 }), rm = std([0.32, 0.33, 0.34], 0.6, 0.5), dark = std([0.04, 0.04, 0.05], 0.8), lit = new THREE.MeshBasicMaterial({ color: SODIUM.clone().multiplyScalar(1.4), toneMapped: false });
    for (const s of L.sheds) {
      root.add(Object.assign(new THREE.Mesh(box(s.w, s.h, s.d, s.x, DECK + s.h / 2, s.z), wm), { castShadow: true, receiveShadow: true }));
      const sh = new THREE.Shape(); sh.moveTo(-s.d / 2 - 0.5, 0); sh.lineTo(0, 2.2); sh.lineTo(s.d / 2 + 0.5, 0); sh.lineTo(-s.d / 2 - 0.5, 0);
      const rg = new THREE.ExtrudeGeometry(sh, { depth: s.w + 1, bevelEnabled: false }); rg.translate(0, 0, -(s.w + 1) / 2); rg.rotateY(Math.PI / 2); rg.translate(s.x, DECK + s.h, s.z);
      root.add(Object.assign(new THREE.Mesh(rg, rm), { castShadow: true }));
      for (let k = 0; k < 5; k++) for (const sd of [-1, 1]) { const x = s.x - s.w / 2 + 10 + k * 20; root.add(new THREE.Mesh(box(6, 5.5, 0.1, x, DECK + 2.75, s.z + sd * (s.d / 2 + 0.06)), k % 2 ? lit : dark)); }
      root.add(new THREE.Mesh(place(new THREE.PlaneGeometry(14, 2.2), s.x, DECK + s.h - 2, s.z - s.d / 2 - 0.08, 0, Math.PI, 0), new THREE.MeshBasicMaterial({ map: canvasTex(512, 80, (g, w, h) => { g.fillStyle = '#1e2a3a'; g.fillRect(0, 0, w, h); g.fillStyle = '#e8e4d8'; g.font = 'bold 52px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(`TRANSIT SHED ${L.sheds.indexOf(s) + 1}`, w / 2, h / 2); }, false), toneMapped: true })));
    } }
  // ---------- the big ones: the tower, the elevator, the cranes ----------
  W.megas = new Megastructures(root, L.megaPlans, { dustColor: [0.2, 0.16, 0.13] }); W.megaPlans = L.megaPlans;
  // ---------- the ship alongside ----------
  buildShip(W, root);
  // ---------- the staging lot: AAVs, trucks, the AA technicals, buses ----------
  { const t = buildIFV(); for (const a of L.aavs) { const g = t.clone(); g.position.set(a.x, DECK, a.z); g.rotation.y = a.rot; root.add(g); } }
  W.cars = L.cars.map(([x, z, rot], i) => { const isAA = i < L.aa.length, paintHex = isAA ? '#5a5a46' : PAINT[(i * 3 + 2) % PAINT.length], car = buildCar(isAA ? 'pickup' : ['suv', 'pickup', 'sedan'][i % 3], paintHex, i + 90); car.paintHex = paintHex; car.root.position.set(x, DECK, z); car.root.rotation.y = rot; root.add(car.root);
    if (isAA) { const gm = std([0.12, 0.13, 0.11], 0.6, 0.5), g = new THREE.Group(); g.position.set(0, 1.5, -1.3); g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.4, 10), gm)); for (const sx of [-0.18, 0.18]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.4, 6), gm); b.rotation.x = -0.7; b.position.set(sx, 0.8, -0.8); g.add(b); } const sh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 0.06), gm); sh.position.set(0, 0.5, 0.2); g.add(sh); car.root.add(g); car.parts.push({ m: g, kind: 'cabin', home: g.position.clone(), q0: g.quaternion.clone() }); }
    return car; });
  { const bm = std([0.88, 0.88, 0.86], 0.5, 0.2), gl = std([0.05, 0.06, 0.08], 0.1, 0.4), tm = std([0.08, 0.08, 0.08], 0.9);
    for (const b of L.buses) { const g = new THREE.Group(); g.position.set(b.x, DECK, b.z); g.rotation.y = b.rot; root.add(g);
      g.add(Object.assign(new THREE.Mesh(box(2.55, 2.9, 12.2, 0, 1.75, 0), bm), { castShadow: true })); for (const sx of [-1, 1]) g.add(new THREE.Mesh(box(0.04, 0.9, 10.4, sx * 1.29, 2.2, -0.4), gl)); g.add(new THREE.Mesh(box(2.3, 1.2, 0.05, 0, 2.1, 6.11), gl));
      for (const z of [-4, 4]) for (const sx of [-1, 1]) g.add(new THREE.Mesh(place(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 14), sx * 1.15, 0.5, z, 0, 0, Math.PI / 2), tm));
      const hl = new THREE.Mesh(box(2.0, 0.2, 0.05, 0, 0.9, 6.12), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.5, 1.2), toneMapped: false })); g.add(hl); } }
  // ---------- across the channel: the refinery, tanks, columns, the flare; the bridge to the east ----------
  { const parts = [], tanks = [], lights = [], col = new THREE.Color();
    for (let k = 0; k < 26; k++) { const x = -500 + r() * 1000, z = FAR_SHORE + 40 + r() * 260, rad = 12 + r() * 14; tanks.push(cyl(rad, rad, 10 + r() * 6, 24, x, DECK + 7, z)); }
    for (let k = 0; k < 14; k++) { const x = -260 + r() * 520, z = FAR_SHORE + 60 + r() * 160, h = 30 + r() * 40, rad = 1.5 + r() * 2.5; parts.push(cyl(rad, rad, h, 12, x, DECK + h / 2, z)); for (let j = 1; j < 5; j++) parts.push(cyl(rad + 1.2, rad + 1.2, 0.3, 12, x, DECK + j * h / 5, z)); for (let j = 0; j < 8; j++) lights.push(x + (r() - 0.5) * rad * 2, DECK + r() * h, z - rad - 0.5); }
    root.add(new THREE.Mesh(merge(tanks), std([0.62, 0.62, 0.6], 0.5, 0.4)), new THREE.Mesh(merge(parts), std([0.35, 0.36, 0.37], 0.5, 0.6)));
    for (let k = 0; k < 900; k++) lights.push(-700 + r() * 1400, DECK + 2 + r() * 14, FAR_SHORE + 20 + r() * 400);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(lights, 3)); const cc = []; for (let i = 0; i < lights.length / 3; i++) { col.setRGB(1, 0.7 + r() * 0.3, 0.4 + r() * 0.4); cc.push(col.r, col.g, col.b); } g.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); root.add(p);
    // the flare stack and a tank on fire
    root.add(new THREE.Mesh(cyl(1.2, 1.6, 90, 10, 140, DECK + 45, FAR_SHORE + 130), std([0.3, 0.3, 0.3], 0.6, 0.5)));
    const fm = TX.makeFlashTex(); W.flames = [[140, DECK + 96, FAR_SHORE + 130, 14], [-210, DECK + 22, FAR_SHORE + 120, 40], [-180, DECK + 30, FAR_SHORE + 140, 30]].map(([x, y, z, s], i) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: fm, color: new THREE.Color(1.8, 0.7, 0.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); sp.position.set(x, y, z); sp.scale.setScalar(s); root.add(sp); return { sp, s, ph: i * 2.1 }; });
    W.fireLight = new THREE.PointLight(new THREE.Color(1, 0.45, 0.15), 3, 700, 1.4); W.fireLight.position.set(-195, DECK + 40, FAR_SHORE + 120); root.add(W.fireLight);
    // smoke from the burning tank, leaning with the wind
    W.tankSmoke = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0x141210, roughness: 1, transparent: true, opacity: 0.85, depthWrite: false }), 60); W.tankSmoke.frustumCulled = false; root.add(W.tankSmoke);
    // the Harbor Bridge: a high arch over the channel to the east, its lights strung along it
    const br = []; const bx = -620; for (let k = -40; k <= 40; k++) { const u = k / 40, x = bx + u * 4, z = QUAY_Z + 150 + u * 260, y = DECK + 42 + (1 - u * u) * 40; br.push(box(6, 1.2, 7, x, y, z)); if (k % 4 === 0) br.push(box(0.4, y - DECK - 42 + 0.1, 0.4, x, (y + DECK + 42) / 2, z)); }
    for (let k = -60; k <= 60; k++) br.push(box(14, 1.6, 6.6, bx, DECK + 41, QUAY_Z + 150 + k * 6.5));
    for (const zz of [QUAY_Z - 120, QUAY_Z + 420]) br.push(box(10, 41, 10, bx, DECK + 20, zz));
    root.add(new THREE.Mesh(merge(br), std([0.25, 0.27, 0.3], 0.6, 0.4)));
    const bl = []; for (let k = -60; k <= 60; k++) bl.push(bx + 6.5, DECK + 42.6, QUAY_Z + 150 + k * 6.5, bx - 6.5, DECK + 42.6, QUAY_Z + 150 + k * 6.5);
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(bl, 3)); root.add(new THREE.Points(bg, new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, color: new THREE.Color(1.6, 1.3, 0.8), transparent: true, depthWrite: false, toneMapped: false }))); }
  // ---------- the Hercules going over, and the canopies ----------
  W.herks = [0, 1, 2, 3, 4].map((k) => { const g = buildC130(false); g.scale.setScalar(1); root.add(g); return { g, k, z: -60 - k * 35 + (k % 2) * 18, y: DECK + 330 + (k % 3) * 25, t0: PT.drop0 - 2 + k * 2.5 }; });
  { const can = new THREE.SphereGeometry(3.6, 16, 6, 0, Math.PI * 2, 0, Math.PI * 0.42).translate(0, -1.6, 0);
    const lines = []; for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2, x = Math.cos(a) * 3.0, z = Math.sin(a) * 3.0, l = Math.hypot(x, 5.8, z); const c = new THREE.CylinderGeometry(0.015, 0.015, l, 3); c.translate(0, l / 2, 0); c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x, 5.8, z).normalize())); lines.push(c); }
    W.canopy = new THREE.InstancedMesh(can, new THREE.MeshStandardMaterial({ color: new THREE.Color(0.22, 0.24, 0.17), roughness: 0.95, side: THREE.DoubleSide }), 40);
    W.risers = new THREE.InstancedMesh(merge(lines), std([0.1, 0.1, 0.09], 0.9), 40);
    W.spent = new THREE.InstancedMesh(new THREE.CircleGeometry(3.4, 12).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: new THREE.Color(0.22, 0.24, 0.17), roughness: 1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }), 40);
    for (const m of [W.canopy, W.risers, W.spent]) { m.frustumCulled = false; m.count = 0; root.add(m); } }
  W.portUpdate = (tau, cam) => updatePort(W, tau, cam);
}

// an amphibious assault ship: the hull, the flight deck, the island, the gangway with its lit door
function buildShip(W, root) {
  const s = W.L.ship, grey = std([0.36, 0.38, 0.4], 0.6, 0.3), dark = std([0.2, 0.21, 0.22], 0.7, 0.3), deck = std([0.18, 0.18, 0.19], 0.85), len = s.x1 - s.x0, cz = (s.z0 + s.z1) / 2, beam = s.z1 - s.z0;
  // hull: flared sides, a raked bow toward -x
  const pts = []; for (let k = 0; k <= 30; k++) { const u = k / 30, x = s.x0 + u * len, bowK = smoothstep(0.2, 0, u), w = beam / 2 * (1 - bowK * 0.75); pts.push([x, w]); }
  const shp = new THREE.Shape(); pts.forEach(([x, w], i) => (i ? shp.lineTo(x, -w) : shp.moveTo(x, -w))); for (let i = pts.length - 1; i >= 0; i--) shp.lineTo(pts[i][0], pts[i][1]);
  const hull = new THREE.ExtrudeGeometry(shp, { depth: 32, bevelEnabled: false }); hull.rotateX(-Math.PI / 2); hull.translate(0, -11, cz);
  root.add(Object.assign(new THREE.Mesh(hull, grey), { castShadow: true, receiveShadow: true }));
  const fd = new THREE.ExtrudeGeometry(shp, { depth: 0.6, bevelEnabled: false }); fd.rotateX(-Math.PI / 2); fd.translate(0, s.deck - 0.6, cz); fd.scale(1, 1, 1);
  root.add(Object.assign(new THREE.Mesh(fd, deck), { receiveShadow: true }));
  // deck markings, the island, its masts and radars, the hull number
  const marks = []; for (let x = s.x0 + 20; x < s.x1 - 10; x += 30) marks.push(box(8, 0.02, 0.3, x, s.deck + 0.02, cz + 4)); marks.push(box(len - 30, 0.02, 0.25, (s.x0 + s.x1) / 2 + 10, s.deck + 0.02, cz - 6));
  root.add(new THREE.Mesh(merge(marks), new THREE.MeshBasicMaterial({ color: 0xc8c8b8 })));
  const isl = [box(46, 12, 9, 60, s.deck + 6, s.z1 - 6), box(30, 8, 7, 62, s.deck + 16, s.z1 - 6), box(12, 6, 5, 64, s.deck + 23, s.z1 - 6), cyl(0.5, 0.8, 18, 8, 68, s.deck + 34, s.z1 - 6), box(5, 2, 5, 58, s.deck + 27, s.z1 - 6)];
  root.add(Object.assign(new THREE.Mesh(merge(isl), grey), { castShadow: true }));
  const rad = new THREE.Mesh(box(4, 2.4, 0.3, 0, 0, 0), dark); rad.position.set(68, s.deck + 41, s.z1 - 6); root.add(rad); W.radar = rad;
  root.add(new THREE.Mesh(place(new THREE.PlaneGeometry(14, 9), 120, s.deck - 8, s.z0 - 0.05, 0, Math.PI, 0), new THREE.MeshBasicMaterial({ map: canvasTex(256, 160, (g, w, h) => { g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, w, h); g.fillStyle = '#e8e8e0'; g.font = 'bold 150px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('7', w / 2, h / 2 + 6); }, false), transparent: true })));
  // the gangway: stair stringers, treads, rails; the side door lit
  const g = []; const n = 20; for (let k = 0; k < n; k++) { const x = 2 + (k + 0.5) * 14 / n, y = DECK + (k + 1) * (s.door.y - DECK) / n; g.push(box(14 / n, 0.06, 1.5, x, y, QUAY_Z - 0.6)); }
  for (const z of [QUAY_Z - 1.4, QUAY_Z + 0.2]) { const len2 = Math.hypot(14, s.door.y - DECK); g.push(place(new THREE.BoxGeometry(len2, 0.06, 0.06), 9, (DECK + s.door.y) / 2 + 1, z, 0, 0, Math.atan2(s.door.y - DECK, 14))); }
  g.push(box(3.2, 0.1, 2, 17.6, s.door.y, QUAY_Z - 0.4));
  root.add(Object.assign(new THREE.Mesh(merge(g), std([0.55, 0.55, 0.52], 0.5, 0.7)), { castShadow: true }));
  root.add(new THREE.Mesh(box(1.6, 2.2, 0.1, s.door.x, s.door.y + 1.1, s.z0 - 0.02), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.3, 1.0), toneMapped: false })));
  const dl = new THREE.PointLight(new THREE.Color(1, 0.9, 0.7), 2.5, 22, 1.5); dl.position.set(s.door.x, s.door.y + 2, s.z0 - 2); root.add(dl);
  // portholes and deck-edge lights
  const pl = []; for (let x = s.x0 + 30; x < s.x1 - 10; x += 6) pl.push(x, 4 + (x % 12 ? 0 : 5), s.z0 - 0.1, x, s.deck - 1, s.z0 - 0.1);
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(pl, 3)); root.add(new THREE.Points(pg, new THREE.PointsMaterial({ size: 2.4, sizeAttenuation: false, color: new THREE.Color(1.3, 1.0, 0.6), toneMapped: false })));
}

const _hc = {};
function updatePort(W, tau, cam) {
  const L = W.L;
  W.water.material.uniforms.uT.value = tau;
  if (W.radar) W.radar.rotation.y = tau * 1.4;
  // the four nearest high-masts light the ground around you
  { const near = L.masts.map((m, i) => [Math.hypot(m.x - cam.position.x, m.z - cam.position.z), i]).sort((a, b) => a[0] - b[0]).slice(0, 4);
    W.mastLights.forEach((l, k) => { const m = L.masts[near[k][1]]; l.position.set(m.x, DECK + 28, m.z); l.intensity = 260; });
    L.masts.forEach((m, i) => { _p.set(m.x, DECK + 29.6, m.z); _s.setScalar(9); _m.compose(_p, cam.quaternion, _s); W.halos.setMatrixAt(i, _m); }); W.halos.instanceMatrix.needsUpdate = true; }
  // fires across the channel
  for (const f of W.flames) f.sp.scale.setScalar(f.s * (0.85 + Math.sin(tau * 6 + f.ph) * 0.08 + Math.sin(tau * 13 + f.ph * 3) * 0.06));
  W.fireLight.intensity = 2.6 + Math.sin(tau * 7) * 0.4;
  { let n = 0; for (let k = 0; k < 60; k++) { const age = (tau * 0.5 + k * 0.9) % 54, x = -195 - age * 4.5, y = DECK + 30 + age * 4, z = FAR_SHORE + 125 - age * 1.2; _p.set(x + Math.sin(k) * 6, y, z); _s.setScalar(8 + age * 1.6); _q.identity(); _m.compose(_p, _q, _s); W.tankSmoke.setMatrixAt(n++, _m); } W.tankSmoke.count = n; W.tankSmoke.instanceMatrix.needsUpdate = true; }
  W.water.material.uniforms.uFire.value = 0.6;
  // the transports going over, east to west, dropping
  for (const h of W.herks) { const x = 600 - (tau - h.t0) * 67; h.g.position.set(x, h.y + Math.sin(tau * 0.4 + h.k) * 2, h.z); h.g.rotation.y = Math.PI / 2; h.g.visible = x > -900 && x < 1200; for (const pr of h.g.props) pr.rotation.z = tau * 63; }
  // canopies: everyone still in the air, and the spent ones on the ground
  if (W.S) {
    const S = W.S, f = Math.min(S.steps - 1.001, tau * 10), k0 = Math.floor(f), u = f - k0, R = S.rec; let n = 0, ns = 0;
    for (const a of S.actors) {
      if (!a.para || tau < a.tIn) continue;
      const o0 = (a.id * S.steps + k0) * F, o1 = o0 + F, x = R[o0] + (R[o1] - R[o0]) * u, y = R[o0 + 1] + (R[o1 + 1] - R[o0 + 1]) * u, z = R[o0 + 2] + (R[o1 + 2] - R[o0 + 2]) * u;
      if (tau < a.tOut && n < 40) { _e.set(Math.sin(tau * 0.9 + a.id) * 0.08, a.id, Math.sin(tau * 0.7 + a.id * 2) * 0.08); _q.setFromEuler(_e); _p.set(x, y + 7.6, z); _s.set(1, 1, 1); _m.compose(_p, _q, _s); W.canopy.setMatrixAt(n, _m); _p.set(x, y + 1.9, z); _m.compose(_p, _q, _s); W.risers.setMatrixAt(n, _m); n++; }
      else if (tau >= a.tOut && tau < a.tOut + 90 && ns < 40) { const lx = (R[(a.id * S.steps + Math.round(a.tOut * 10)) * F]) || x, lz = (R[(a.id * S.steps + Math.round(a.tOut * 10)) * F + 2]) || z; _q.identity(); _e.set(0, a.id * 1.3, 0); _q.setFromEuler(_e); const k = Math.min(1, (tau - a.tOut) / 1.5); _p.set(lx + Math.sin(a.id) * 3, DECK + 0.04, lz + Math.cos(a.id) * 3); _s.set(0.4 + k * 0.6, 1, 0.3 + k * 0.7); _m.compose(_p, _q, _s); W.spent.setMatrixAt(ns++, _m);
        if (tau < a.tOut + 1.5) { _e.set(1.2 * k, a.id, 0); _q.setFromEuler(_e); _p.set(lx, DECK + 3 * (1 - k), lz); _s.setScalar(1 - k * 0.6); _m.compose(_p, _q, _s); W.canopy.setMatrixAt(n, _m); W.risers.setMatrixAt(n, _m); n++; } }
    }
    W.canopy.count = W.risers.count = n; W.spent.count = ns; W.canopy.instanceMatrix.needsUpdate = W.risers.instanceMatrix.needsUpdate = W.spent.instanceMatrix.needsUpdate = true;
  }
  const s = W.sun; s.target.position.set(cam.position.x, 0, cam.position.z); s.position.set(cam.position.x + SUN_DIR.x * 200, SUN_DIR.y * 200, cam.position.z + SUN_DIR.z * 200);
  void _hc; void heightAt;
}
