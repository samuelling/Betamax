// Life in the house and the yard: sun through the windows (shafts, motes), curtains breathing, clouds crossing
// the sun, the light slowly going gold, birds, butterflies, water that moves — and the small clutter of a lived-in home.
import * as THREE from 'three';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { mk, col, std, B, RB, CY } from './homebuild.js';
import { sway, WIND } from './garden.js';
import { mulberry32 } from './rng.js';

const T = THREE, TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const vnoise = (t, s) => { const i = Math.floor(t), f = t - i, h = (n) => { const x = Math.sin(n * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); }; const u = f * f * (3 - 2 * f); return h(i) * (1 - u) + h(i + 1) * u; };

export function enhance(H) {
  const s = H.scene, us = H.us, r = mulberry32(H.house.id.length * 131 + (us ? 1 : 2)), A = H.A, W = H.windows || [], low = H.o.low;
  const L = { t: 0, items: [] };
  // ---------------- the picture: no cel bands at home — this is the real thing — plus soft ambient occlusion
  H.post.cel.uniforms.uOn.value = 0; H.post.cel.enabled = false; H.post.vhs.enabled = false;   // no tape look at home: just the room
  if (!low) {
    try {
      const gt = new GTAOPass(s, H.cam, innerWidth, innerHeight);
      gt.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.5, thickness: 1.0, scale: 1.2, samples: 12 });
      gt.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      gt.blendIntensity = 0.7; H.post.composer.insertPass(gt, 1); L.gtao = gt;
    } catch (e) { console.warn('gtao', e); }
  }
  // ---------------- the sun: clouds pass over it, and it sinks toward evening as the afternoon goes on
  L.sun0 = H.sun.intensity; L.hemi0 = s.children.find((o) => o.isHemisphereLight); L.hemiI = L.hemi0 ? L.hemi0.intensity : 1;
  L.dir0 = H.sunDir.clone(); L.col0 = H.sun.color.clone(); L.gold = new T.Color(0xffb070);
  // ---------------- window light: shafts and motes on the sunny side
  const shaftMat = new T.ShaderMaterial({
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, fog: false,
    uniforms: { uCol: { value: new T.Color(0xffe2b0) }, uK: { value: 0.03 }, uT: { value: 0 } },
    vertexShader: 'attribute float aU; attribute vec2 aE; varying float vU; varying vec2 vE; varying vec3 vW; void main(){ vU = aU; vE = aE; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform vec3 uCol; uniform float uK, uT; varying float vU; varying vec2 vE; varying vec3 vW;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main(){ float edge = smoothstep(0.0, 0.22, vE.x) * smoothstep(1.0, 0.78, vE.x) * smoothstep(0.0, 0.22, vE.y) * smoothstep(1.0, 0.78, vE.y);
        float fall = (1.0 - vU) * (1.0 - vU); float flick = 0.85 + 0.15 * sin(uT * 0.7 + vW.x * 3.0 + vW.z * 2.0);
        gl_FragColor = vec4(uCol * uK * edge * fall * flick, 1.0); }`,
  });
  L.shaftMat = shaftMat;
  const shafts = new T.Group(); s.add(shafts); L.shafts = shafts;
  const buildShafts = () => {
    shafts.clear();
    const sd = H.sunDir, into = sd.clone().negate();
    for (const w of W) {
      const n = w.axis === 'x' ? new T.Vector3(0, 0, w.out) : new T.Vector3(w.out, 0, 0);
      const k = n.dot(sd); if (k < 0.12 || sd.y < 0.05) continue;
      const P = (u, y) => (w.axis === 'x' ? new T.Vector3(u, y, w.at) : new T.Vector3(w.at, y, u));
      const c = [P(w.a, w.y0), P(w.b, w.y0), P(w.b, w.y1), P(w.a, w.y1)];
      const len = Math.min(6, (w.y1 - 0.02) / Math.max(0.15, -into.y));   // until it reaches the floor
      const far = c.map((p) => p.clone().addScaledVector(into, len));
      const pos = [], aU = [], aE = [], idx = [];
      const sheet = (p0, p1, e0, e1) => { const base = pos.length / 3;
        for (const [p, u, e] of [[p0, 0, e0], [p1, 0, e1], [p1.clone().addScaledVector(into, len), 1, e1], [p0.clone().addScaledVector(into, len), 1, e0]]) { pos.push(p.x, p.y, p.z); aU.push(u); aE.push(e[0], e[1]); }
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3); };
      for (const t of [0.22, 0.5, 0.78]) {
        sheet(c[0].clone().lerp(c[3], t), c[1].clone().lerp(c[2], t), [0, t], [1, t]);   // across the width
        sheet(c[0].clone().lerp(c[1], t), c[3].clone().lerp(c[2], t), [t, 0], [t, 1]);   // across the height
      }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('aU', new T.Float32BufferAttribute(aU, 1)); g.setAttribute('aE', new T.Float32BufferAttribute(aE, 2)); g.setIndex(idx);
      const m = new T.Mesh(g, shaftMat); m.renderOrder = 10; m.frustumCulled = false; shafts.add(m);
      w.shaft = { c, into, len };
    }
    // motes drift inside the beams
    if (L.motes) { s.remove(L.motes); L.motes.geometry.dispose(); }
    const lit = W.filter((w) => w.shaft); const N = lit.length * 70;
    if (N) {
      const p = new Float32Array(N * 3), seeds = [];
      for (let i = 0; i < N; i++) { const w = lit[i % lit.length], u = r(), v = r(), d = r(); seeds.push({ w, u, v, d, ph: r() * TAU }); }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(p, 3));
      L.motes = new T.Points(g, new T.PointsMaterial({ size: 0.006, color: 0xfff2d0, transparent: true, opacity: 0.7, depthWrite: false, blending: T.AdditiveBlending, sizeAttenuation: true }));
      L.moteSeeds = seeds; L.motes.frustumCulled = false; s.add(L.motes);
    }
  };
  if (H.dust) { s.remove(H.dust); H.dust = { rotation: { y: 0 }, position: { y: 0 } }; }
  buildShafts(); L.buildShafts = buildShafts; L.shaftT = 0;
  // ---------------- curtains that breathe (one window is open a crack)
  const lace = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillRect(0, 0, 128, 128);
    if (!us) { g.globalCompositeOperation = 'destination-out'; for (let y = 8; y < 128; y += 16) for (let x = 8; x < 128; x += 16) { g.beginPath(); g.arc(x + ((y / 16) % 2) * 8, y, 4.5, 0, TAU); g.fill(); } g.globalCompositeOperation = 'source-over'; g.strokeStyle = 'rgba(255,255,255,0.9)'; for (let y = 0; y < 128; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(128, y + 8); g.stroke(); } }
    else { for (let x = 0; x < 128; x += 4) { g.fillStyle = `rgba(240,236,224,${0.2 + Math.random() * 0.15})`; g.fillRect(x, 0, 2, 128); } }
    const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(3, 5); t.colorSpace = T.SRGBColorSpace; return t; })();
  const cm = std({ color: us ? 0xf4efe2 : 0xfbfaf6, map: lace, transparent: true, opacity: us ? 0.92 : 0.85, alphaTest: us ? 0 : 0.2, side: T.DoubleSide, roughness: 0.95, depthWrite: !!us });
  const cu = { uT: { value: 0 }, uBreeze: { value: 0 } };
  cm.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, cu); sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT, uBreeze; attribute float aOpen;')
    .replace('#include <begin_vertex>', `vec3 transformed = vec3(position);
      float hang = clamp((uv.y - 1.0) * -1.0, 0.0, 1.0);
      float fold = sin(uv.x * 18.0) * 0.025;
      float b = hang * hang * (0.012 + aOpen * (0.10 + 0.08 * uBreeze)) * (0.6 + 0.4 * sin(uT * 1.3 + uv.x * 3.0 + uv.y * 2.0) + 0.3 * sin(uT * 2.7 + uv.x * 7.0));
      transformed.z += fold + b; transformed.x += aOpen * hang * 0.05 * sin(uT * 0.9 + uv.y * 3.0);`); };
  cm.customProgramCacheKey = () => 'curtain';
  L.curtainU = cu;
  const openOne = W.findIndex((w) => w.axis === 'x' && w.at < 0);
  W.forEach((w, wi) => {
    const L2 = w.b - w.a, bot = (w.axis === 'x' && w.out > 0 && w.a > -1) ? w.y0 + 0.08 : w.y0 - 0.15, h = w.y1 + 0.32 - bot, inside = -w.out, open = wi === openOne ? 1 : 0;
    for (const side of [0, 1]) {
      const pw = L2 * (0.36 + r() * 0.08), g = new T.PlaneGeometry(pw, h, 12, 10);
      g.setAttribute('aOpen', new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(open), 1));
      const m = new T.Mesh(g, cm); m.castShadow = true; m.receiveShadow = true;
      const u = side ? w.b - pw / 2 + 0.08 : w.a + pw / 2 - 0.08, y = w.y1 + 0.32 - h / 2;
      if (w.axis === 'x') { m.position.set(u, y, w.at + inside * 0.16); m.rotation.y = inside < 0 ? Math.PI : 0; }
      else { m.position.set(w.at + inside * 0.16, y, u); m.rotation.y = inside > 0 ? Math.PI / 2 : -Math.PI / 2; }
      s.add(m);
    }
    // the rod
    const rod = mk(s, CY(0.012, 0.012, L2 + 0.4, 8), col(us ? '#e8e4d8' : '#c8a24a', 0.3, us ? 0 : 0.8), 0, w.y1 + 0.32, 0);
    if (w.axis === 'x') { rod.position.set((w.a + w.b) / 2, w.y1 + 0.32, w.at + inside * 0.18); rod.rotation.z = Math.PI / 2; } else { rod.position.set(w.at + inside * 0.18, w.y1 + 0.32, (w.a + w.b) / 2); rod.rotation.x = Math.PI / 2; }
  });
  // ---------------- the lived-in clutter
  clutter(H, s, r);
  outdoors(H, s, r);
  // ---------------- water that moves (lake or sea at the end of the yard)
  const water = H.Yg && H.Yg.userData.water;
  if (water) {
    const wu = { uT: { value: 0 } };
    water.material = std({ color: water.material.color, roughness: 0.06, metalness: 0.1, envMapIntensity: 1.6 });
    water.material.onBeforeCompile = (sh) => { sh.uniforms.uT = wu.uT;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uT; varying vec3 vWP;')
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          { vec2 p = vWP.xz; float t = uT;
            vec2 g = vec2(0.0);
            g += vec2(0.8, 0.6) * cos(dot(p, vec2(0.8, 0.6)) * 0.9 + t * 1.1) * 0.10;
            g += vec2(-0.5, 0.86) * cos(dot(p, vec2(-0.5, 0.86)) * 1.7 + t * 1.6) * 0.06;
            g += vec2(0.2, -1.0) * cos(dot(p, vec2(0.2, -1.0)) * 3.1 + t * 2.3) * 0.035;
            g += vec2(0.95, 0.3) * cos(dot(p, vec2(0.95, 0.3)) * 6.3 + t * 3.1) * 0.02;
            vec3 nW = normalize(vec3(-g.x, 1.0, -g.y));
            normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz); }`);
    };
    L.waterU = wu;
  }
  // ---------------- birds: some across the sky, a couple on the lawn
  L.flocks = []; L.flockT = 6 + r() * 10;
  const birdGeo = (() => { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute([0, 0, 0.12, -0.32, 0.05, -0.05, 0, 0, -0.08, 0, 0, 0.12, 0.32, 0.05, -0.05, 0, 0, -0.08], 3)); g.computeVertexNormals(); return g; })();
  const birdMat = new T.MeshBasicMaterial({ color: 0x1e1e22, side: T.DoubleSide, fog: true });
  L.spawnFlock = () => {
    const n = 2 + Math.floor(r() * 5), y = 14 + r() * 18, z0 = -30 + r() * 80, dir = r() < 0.5 ? 1 : -1, sp = 7 + r() * 5, fl = { birds: [], t: 0, dir, sp, y, z0, dur: 150 / sp };
    for (let k = 0; k < n; k++) { const m = new T.Mesh(birdGeo.clone(), birdMat); m.userData = { ox: -k * 1.4 - r(), oz: (k % 2 ? 1 : -1) * k * 0.9, oy: r() * 1.5, ph: r() * TAU }; m.scale.setScalar(1.6); s.add(m); fl.birds.push(m); }
    L.flocks.push(fl);
  };
  L.ground = [];
  for (let k = 0; k < 3; k++) { const b = new T.Group(); s.add(b); const bc = us ? (k === 0 ? '#7a4a2a' : '#6a5a4a') : (k === 0 ? '#1a1a22' : '#8a8a86');   // robin & sparrows / grackle & mockingbirds
    mk(b, new T.SphereGeometry(0.055, 12, 8), col(bc, 0.9), 0, 0.07, 0).scale.set(0.8, 0.8, 1.3);
    mk(b, new T.SphereGeometry(0.035, 10, 8), col(bc, 0.9), 0, 0.12, 0.06);
    if (us && k === 0) mk(b, new T.SphereGeometry(0.04, 10, 8), col('#c8582a', 0.8), 0, 0.065, 0.03).scale.set(0.8, 0.8, 1.0);   // a robin's breast
    mk(b, new T.ConeGeometry(0.01, 0.03, 6), col('#c8a24a', 0.6), 0, 0.12, 0.1, 0, Math.PI / 2, 0).rotation.x = Math.PI / 2;
    mk(b, B(0.03, 0.01, 0.07), col(bc, 0.9), 0, 0.08, -0.08);
    b.position.set(-6 + r() * 12, 0.03, 8 + r() * 10); b.userData = { state: 'peck', t: r() * 3, vx: 0, vz: 0, home: b.position.clone() }; L.ground.push(b); }
  // ---------------- butterflies over the beds
  L.flies = [];
  const wingTex = (c1, c2) => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = c1; g.beginPath(); g.ellipse(32, 24, 26, 20, 0, 0, TAU); g.fill(); g.beginPath(); g.ellipse(26, 50, 16, 12, 0.4, 0, TAU); g.fill(); g.fillStyle = c2; for (const [x, y] of [[44, 18], [20, 22], [26, 50]]) { g.beginPath(); g.arc(x, y, 5, 0, TAU); g.fill(); } const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t; };
  const kinds = us ? [['#f2f0ea', '#2a2a2a'], ['#f0a020', '#1a1a1a'], ['#f4e04a', '#2a2a2a']] : [['#e8701a', '#1a1a1a'], ['#f4e04a', '#2a2a2a'], ['#f2f0ea', '#2a2a2a']];
  for (let k = 0; k < (H.Y.beds.length ? (low ? 4 : 7) : 0); k++) {
    const [c1, c2] = kinds[k % kinds.length], m = new T.MeshStandardMaterial({ map: wingTex(c1, c2), transparent: true, alphaTest: 0.3, side: T.DoubleSide, roughness: 0.8 });
    const b = new T.Group(); s.add(b);
    const wl = new T.Mesh(new T.PlaneGeometry(0.05, 0.05).translate(-0.025, 0, 0), m), wr = new T.Mesh(new T.PlaneGeometry(0.05, 0.05).translate(0.025, 0, 0), m); wl.rotation.x = wr.rotation.x = -Math.PI / 2; b.add(wl, wr);
    const bed = H.Y.beds[k % H.Y.beds.length];
    b.position.set(bed.x, 0.8, bed.z); b.userData = { wl, wr, bed, tx: bed.x, tz: bed.z, ty: 0.7, t: r() * 5, ph: r() * TAU, rest: 0 };
    L.flies.push(b);
  }
  // ---------------- sky clouds (the sky shader takes time)
  L.update = (dt) => update(H, L, dt);
  return L;
}

function update(H, L, dt) {
  L.t += dt; const t = L.t, s = H.scene;
  // clouds crossing the sun; the afternoon slowly goes gold
  const cloud = smooth(0.6, 0.9, vnoise(t / 14, 1) * 0.7 + vnoise(t / 5, 2) * 0.3);
  const tilt = H.tilt || 0, evening = Math.max(Math.min(1, t / 900), tilt);
  const sd = L.dir0.clone(); sd.y = Math.max(0.12, L.dir0.y - 0.16 * evening); sd.normalize();
  H.sunDir.copy(sd); H.sun.position.copy(sd).multiplyScalar(60).add(new T.Vector3(0, 0, 8));
  H.sun.intensity = L.sun0 * (1 - 0.35 * cloud) * (1 - 0.2 * evening);
  H.sun.color.copy(L.col0).lerp(L.gold, evening * 0.5 + tilt * 0.35);
  if (L.hemi0) L.hemi0.intensity = L.hemiI * (1 + 0.15 * cloud);
  L.shaftMat.uniforms.uT.value = t; L.shaftMat.uniforms.uK.value = 0.03 * (1 - 0.8 * cloud);
  L.shaftMat.uniforms.uCol.value.copy(H.sun.color);
  if ((L.shaftT += dt) > 25) { L.shaftT = 0; L.buildShafts(); }
  // motes
  if (L.motes) {
    const P = L.motes.geometry.attributes.position;
    L.moteSeeds.forEach((m, i) => {
      const w = m.w, sh = w.shaft; if (!sh) return;
      const u = (m.u + Math.sin(t * 0.05 + m.ph) * 0.05 + 1) % 1, v = (m.v + t * 0.004 + Math.sin(t * 0.07 + m.ph * 2) * 0.03 + 1) % 1, d = m.d;
      const base = w.axis === 'x' ? new T.Vector3(w.a + (w.b - w.a) * u, w.y0 + (w.y1 - w.y0) * v, w.at) : new T.Vector3(w.at, w.y0 + (w.y1 - w.y0) * v, w.a + (w.b - w.a) * u);
      base.addScaledVector(sh.into, d * sh.len);
      P.setXYZ(i, base.x, base.y, base.z);
    });
    P.needsUpdate = true; L.motes.material.opacity = 0.75 * (1 - 0.8 * cloud);
  }
  // curtains
  L.curtainU.uT.value = t; L.curtainU.uBreeze.value = WIND.uGust.value;
  if (L.waterU) L.waterU.uT.value = t;
  if (H._fan) H._fan.rotation.y -= dt * 2.2;
  if (H.Yg && H.Yg.userData.anim) for (const f of H.Yg.userData.anim) f(t, WIND.uGust.value);
  if (H.sky && H.sky.material.uniforms.uT) H.sky.material.uniforms.uT.value = t;
  // birds overhead
  if ((L.flockT -= dt) < 0) { L.flockT = 20 + Math.random() * 40; L.spawnFlock(); }
  L.flocks = L.flocks.filter((f) => {
    f.t += dt; const x = f.dir * (-75 + f.t * f.sp);
    f.birds.forEach((b) => { const u = b.userData, flap = Math.sin(t * 9 + u.ph); b.position.set(x + f.dir * u.ox, f.y + u.oy + Math.sin(t * 0.8 + u.ph) * 0.6, f.z0 + u.oz); b.rotation.set(0, f.dir > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
      const p = b.geometry.attributes.position; p.setY(1, 0.05 + flap * 0.18); p.setY(4, 0.05 + flap * 0.18); p.needsUpdate = true; });
    if (f.t > f.dur) { f.birds.forEach((b) => s.remove(b)); return false; } return true;
  });
  // birds on the lawn: peck, hop, take off if you come close
  for (const b of L.ground) {
    const u = b.userData; u.t -= dt;
    const dP = Math.hypot(b.position.x - H.pos.x, b.position.z - H.pos.z);
    if (u.state !== 'fly' && dP < 2.6 && !H.inside) { u.state = 'fly'; u.vx = (b.position.x - H.pos.x) / dP * 3; u.vz = (b.position.z - H.pos.z) / dP * 3; u.vy = 3.5; u.t = 6 + Math.random() * 10; H.audio.swish(0.15, 0.25, 4000); }
    if (u.state === 'fly') { b.position.x += u.vx * dt; b.position.z += u.vz * dt; b.position.y += u.vy * dt; u.vy = Math.max(1.0, u.vy - dt * 2); if (u.t < 0) { u.state = 'peck'; b.position.set(-8 + Math.random() * 16, 0.03, 8 + Math.random() * 11); } continue; }
    if (u.t < 0) { if (Math.random() < 0.5) { u.state = 'hop'; u.hx = b.position.x + (Math.random() - 0.5) * 0.8; u.hz = b.position.z + (Math.random() - 0.5) * 0.8; u.t = 0.25; } else { u.state = 'peck'; u.t = 0.6 + Math.random() * 1.6; } }
    if (u.state === 'hop') { const k = 1 - u.t / 0.25; b.position.x += (u.hx - b.position.x) * Math.min(1, dt * 8); b.position.z += (u.hz - b.position.z) * Math.min(1, dt * 8); b.position.y = 0.03 + Math.sin(Math.PI * clamp(k, 0, 1)) * 0.06; b.rotation.y = Math.atan2(u.hx - b.position.x, u.hz - b.position.z); }
    else { b.position.y = 0.03; b.children[1].position.y = 0.12 - Math.max(0, Math.sin(t * 9 + b.id)) * 0.05; }
  }
  // butterflies: wander from flower to flower, settle now and then
  for (const f of L.flies) {
    const u = f.userData; u.t -= dt;
    if (u.t < 0) { const b = u.bed; u.tx = b.x + (Math.random() - 0.5) * b.w; u.tz = b.z + (Math.random() - 0.5) * b.d; u.ty = b.y + 0.35 + Math.random() * 0.6; u.t = 1.5 + Math.random() * 3; u.rest = Math.random() < 0.3 ? 1.2 + Math.random() * 2 : 0; }
    const resting = u.rest > 0 && Math.hypot(f.position.x - u.tx, f.position.z - u.tz) < 0.1;
    if (resting) { u.rest -= dt; } else {
      f.position.x += (u.tx - f.position.x) * Math.min(1, dt * 1.4) + Math.sin(t * 7 + u.ph) * 0.01;
      f.position.z += (u.tz - f.position.z) * Math.min(1, dt * 1.4) + Math.cos(t * 6 + u.ph) * 0.01;
      f.position.y += (u.ty - f.position.y) * Math.min(1, dt * 1.6) + Math.sin(t * 11 + u.ph) * 0.006;
      f.rotation.y = Math.atan2(u.tx - f.position.x, u.tz - f.position.z);
    }
    const flap = resting ? 0.35 + 0.25 * Math.sin(t * 2 + u.ph) : Math.sin(t * 26 + u.ph) * 1.1;
    u.wl.rotation.z = flap; u.wr.rotation.z = -flap;
  }
}

// ------------------------------------------------------------------ inside: the small things
function clutter(H, s, r) {
  const us = H.us, A = H.A;
  const wood = col(us ? '#8a5a32' : '#6a3a1a', 0.6), ceramic = (c) => std({ color: new T.Color(c), roughness: 0.25 }), fabric = (c) => col(c, 0.95);
  // living room: cushions, a throw, books and a mug on the table, a big plant in the corner, a ceiling light
  mk(s, RB(0.4, 0.38, 0.12, 0.06), fabric(us ? '#c8a24a' : '#8a2a1a'), -1.0, 0.78, -3.0, Math.PI / 2 + 0.35, 0, -0.25);
  mk(s, RB(0.4, 0.38, 0.12, 0.06), fabric(us ? '#3a5a7a' : '#e8d8b8'), -1.0, 0.78, -1.6, Math.PI / 2 - 0.3, 0, -0.25);
  mk(s, RB(0.5, 0.03, 0.7, 0.015), fabric(us ? '#9a3a2a' : '#4a6a5a'), -1.3, 0.65, -2.75, 0.15, 0, 0.12);
  for (let k = 0; k < 3; k++) mk(s, B(0.2 - k * 0.02, 0.035, 0.27 - k * 0.02), col(['#2a4a6a', '#e8e0cc', '#7a2a24'][k], 0.85), -2.62, 0.465 + k * 0.035, -2.0, 0.2 + k * 0.3);
  mk(s, CY(0.04, 0.035, 0.09, 16), ceramic(us ? '#f4f0e6' : '#3a6aa8'), -2.5, 0.49, -2.55);
  { const pot = mk(s, CY(0.2, 0.16, 0.42, 20), ceramic(us ? '#c8643a' : '#e8e0d0'), -5.55, 0.21, -0.55);
    const lm = col('#3a6a2a', 0.6);
    for (let k = 0; k < 22; k++) { const a = r() * TAU, h = 0.6 + r() * 1.0, rr = 0.1 + r() * 0.3; const lf = mk(s, new T.SphereGeometry(0.11, 10, 8), lm, -5.55 + Math.cos(a) * rr, 0.42 + h, -0.55 + Math.sin(a) * rr); lf.scale.set(1, 0.25, 1.8); lf.rotation.set(r() - 0.5, -a, r() * 0.6); }
    mk(s, CY(0.015, 0.02, 1.5, 6), col('#5a4a2a', 0.8), -5.55, 1.15, -0.55); H.cols.push([-5.8, -0.8, -5.3, -0.3]); }
  for (const [x, z] of us ? [[-2.6, -2.3], [3.6, -2.0]] : [[3.6, -2.0]]) { mk(s, CY(0.22, 0.28, 0.2, 24, true), std({ color: us ? 0xf2ead8 : 0xe8d8a8, roughness: 0.9, side: T.DoubleSide, emissive: new T.Color(0x3a2a14), emissiveIntensity: 0.6 }), x, 2.25, z).castShadow = false; mk(s, CY(0.006, 0.006, 0.25, 6), col('#222', 0.5), x, 2.47, z); }
  // kitchen: upper cabinets, utensils, jars, herbs on the sill, a towel on the oven, a lamp over the table
  const cab = col(H.C.cabinet, 0.5);
  for (const [x0, x1] of [[2.45, 3.55], [5.2, 5.8]]) { mk(s, RB(x1 - x0, 0.7, 0.35, 0.01), cab, (x0 + x1) / 2, 1.85, 4.25); for (let x = x0 + 0.3; x < x1; x += 0.6) mk(s, B(0.03, 0.1, 0.02), col('#b8bcc0', 0.3, 0.8), x, 1.62, 4.07); }
  mk(s, CY(0.06, 0.055, 0.15, 14), ceramic(us ? '#e8e0d0' : '#c84a2a'), 3.35, 0.975, 4.25);
  for (let k = 0; k < 4; k++) mk(s, CY(0.006, 0.006, 0.3, 6), col(k % 2 ? '#6a4a2a' : '#c8c8c8', 0.4, k % 2 ? 0 : 0.8), 3.35 + (k - 1.5) * 0.015, 1.1, 4.25 + (k % 2) * 0.01, 0, (k - 1.5) * 0.08);
  for (let k = 0; k < 4; k++) { const j = mk(s, CY(0.05, 0.05, 0.16 + (k % 2) * 0.05, 14), std({ color: 0xe8f0f0, roughness: 0.05, transparent: true, opacity: 0.4 }), 2.7 + k * 0.13, 0.98 + (k % 2) * 0.025, 4.3); mk(s, CY(0.045, 0.045, 0.1, 12), col(['#c8a050', '#8a5a2a', '#e8e0cc', '#c83a2a'][k], 0.8), 2.7 + k * 0.13, 0.95, 4.3); }
  for (let k = 0; k < 2; k++) { const x = 1.05 + k * 1.1; mk(s, CY(0.06, 0.05, 0.1, 14), ceramic('#b8643a'), x, 0.95, 4.36); const lm = col(['#4a7a3a', '#5a8a3a', '#3a6a2a'][k], 0.7); for (let q = 0; q < 8; q++) { const a = q / 8 * TAU; mk(s, new T.SphereGeometry(0.03, 8, 6), lm, x + Math.cos(a) * 0.03, 1.03 + (q % 3) * 0.02, 4.36 + Math.sin(a) * 0.03).scale.set(1, 0.6, 1.4); } }
  mk(s, B(0.3, 0.38, 0.01), fabric(us ? '#e8e0cc' : '#c84a3a'), 3.95, 0.6, 3.79);
  mk(s, CY(0.18, 0.12, 0.15, 24, true), std({ color: us ? 0x2a3a2a : 0xb87a3a, roughness: 0.5, side: T.DoubleSide, emissive: new T.Color(0x2a1e10), emissiveIntensity: 0.5 }), 2.6, 2.0, 1.7).castShadow = false;
  mk(s, CY(0.004, 0.004, 0.6, 6), col('#222', 0.5), 2.6, 2.32, 1.7);
  if (!us) { // a ceiling fan turning slowly over the living room, a glass of iced tea sweating on the table
    const fan = new T.Group(); fan.position.set(-2.6, 2.32, -2.3); s.add(fan); const fw = col('#6a4a2a', 0.5), fmet = col('#c8b48a', 0.3, 0.8);
    mk(s, CY(0.015, 0.015, 0.22, 6), fmet, -2.6, 2.49, -2.3); mk(fan, CY(0.1, 0.12, 0.12, 16), fmet, 0, 0, 0);
    for (let k = 0; k < 5; k++) { const a = k / 5 * TAU, bl = mk(fan, RB(0.62, 0.012, 0.15, 0.005), fw, Math.cos(a) * 0.42, -0.03, Math.sin(a) * 0.42, -a, 0, 0); bl.rotation.x = 0.12; }
    H._fan = fan;
    mk(s, CY(0.035, 0.03, 0.13, 14), std({ color: 0x8a4a1a, roughness: 0.05, transparent: true, opacity: 0.7 }), 2.95, 0.84, 1.55);
  }
  mk(s, new T.PlaneGeometry(0.3, 0.42), std({ map: calTex(us), roughness: 0.9 }), 0.4, 1.55, 4.42, Math.PI);
  // study: a desk lamp, stacked books, a mug of pens
  mk(s, CY(0.07, 0.08, 0.02, 16), col('#2a3a2a', 0.4, 0.5), 4.75, 0.78, -4.05); mk(s, CY(0.008, 0.008, 0.35, 8), col('#2a3a2a', 0.4, 0.5), 4.75, 0.95, -4.05, 0, 0, 0.3); mk(s, CY(0.04, 0.09, 0.1, 16, true), std({ color: 0x2a4a2a, roughness: 0.4, side: T.DoubleSide, emissive: new T.Color(0x3a2a10), emissiveIntensity: 0.6 }), 4.65, 1.12, -4.0, 0, 0, -0.6);
  for (let k = 0; k < 5; k++) mk(s, B(0.18, 0.03, 0.25), col(['#7a2a24', '#2a4a6a', '#e8e0cc', '#3a5a3a', '#5a3a5a'][k], 0.85), 3.65, 0.79 + k * 0.03, -4.05, (r() - 0.5) * 0.4);
  mk(s, CY(0.035, 0.035, 0.09, 14), ceramic('#e8e0cc'), 4.95, 0.81, -3.75); for (let k = 0; k < 4; k++) mk(s, CY(0.004, 0.004, 0.14, 6), col(['#c8302a', '#2a4a8a', '#1a1a1a', '#e8b02a'][k], 0.5), 4.95 + (k - 1.5) * 0.01, 0.88, -3.75, 0, 0, (k - 1.5) * 0.12);
}
function calTex(us) { const c = document.createElement('canvas'); c.width = 128; c.height = 180; const g = c.getContext('2d'); g.fillStyle = '#f6f2e8'; g.fillRect(0, 0, 128, 180); g.fillStyle = us ? '#5a8aa8' : '#c84a3a'; g.fillRect(6, 6, 116, 70); g.fillStyle = '#fff'; g.font = 'bold 16px sans-serif'; g.fillText('JUNE', 36, 46); g.fillStyle = '#333'; g.font = '9px sans-serif'; for (let d = 0; d < 30; d++) g.fillText(String(d + 1), 10 + (d % 7) * 16, 96 + Math.floor(d / 7) * 16); g.strokeStyle = '#c83a2a'; g.lineWidth = 2; g.beginPath(); g.arc(10 + 3 * 16 + 5, 96 + 2 * 16 - 3, 8, 0, TAU); g.stroke(); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t; }

// ------------------------------------------------------------------ outside: the small things
function outdoors(H, s, r) {
  const us = H.us, E = H.house.ext, trim = col(E.trim, 0.5);
  if (E.shape !== 'flat' && !E.wide) {
    // gutters along the eaves, downspouts at the corners
    const gm = col(us ? '#f0ece4' : '#8a8a84', 0.4, us ? 0 : 0.6), top = 2.6 + ((E.storeys || 1) - 1) * 2.9;
    for (const sz of [-1, 1]) { const ey = top - (E.shape === 'saltbox' && sz > 0 ? 1.4 : 0) - 0.04;
      mk(s, CY(0.055, 0.055, 13.0, 8), gm, 0, ey, sz * 5.12, 0, 0, Math.PI / 2);
      for (const sx of [-1, 1]) { mk(s, CY(0.035, 0.035, ey, 8), gm, sx * 6.35, ey / 2, sz * 5.12); mk(s, CY(0.035, 0.035, 0.3, 8), gm, sx * 6.35, 0.06, sz * 5.12 + sz * 0.13, 0, Math.PI / 2 - 0.3); } }
  }
  // window boxes under the back windows, full of flowers
  for (const w of H.windows) { if (!(w.axis === 'x' && w.out > 0)) continue;
    const cx = (w.a + w.b) / 2, L = w.b - w.a; mk(s, RB(L + 0.1, 0.18, 0.22, 0.02), us ? trim : col('#8a5a3a', 0.8), cx, w.y0 - 0.12, w.at + 0.18);
    const fc = us ? ['#e8442a', '#f4f0ea', '#c84a8a', '#4a7a3a'] : ['#d8302a', '#f0a030', '#e8e0d0', '#4a7a3a'];
    for (let k = 0; k < 14; k++) { const c = fc[k % fc.length]; mk(s, new T.SphereGeometry(c === '#4a7a3a' ? 0.06 : 0.035, 8, 6), col(c, 0.7), cx - L / 2 + r() * L, w.y0 + (c === '#4a7a3a' ? -0.02 : 0.03) + r() * 0.05, w.at + 0.15 + r() * 0.1).castShadow = false; }
  }
  // the back step: a mat, boots by the door
  if (!['deck', 'stack', 'veranda'].includes(E.porch)) mk(s, B(0.8, 0.015, 0.5), col(us ? '#8a6a3a' : '#6a3a2a', 1), -4.03, 0.01, 5.0);
  const free = (x, z, rad) => !H.Y.beds.some((b) => Math.abs(x - b.x) < b.w / 2 + rad && Math.abs(z - b.z) < b.d / 2 + rad) && !H.cols.some(([x0, z0, x1, z1]) => x > x0 - rad && x < x1 + rad && z > z0 - rad && z < z1 + rad);
  const spot = (x0, x1, z0, z1, rad) => { for (let k = 0; k < 40; k++) { const x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0); if (free(x, z, rad)) return [x, z]; } return null; };
  // a hose by the barrel, a wheelbarrow, a rake against the fence, a bird feeder
  const bx = H.Y.barrel.x, bz = H.Y.barrel.z;
  const hose = new T.TorusGeometry(0.22, 0.02, 6, 24); for (let k = 0; k < 3; k++) mk(s, hose.clone(), col(us ? '#3a7a3a' : '#2a2a2a', 0.6), bx - 0.55, 0.03 + k * 0.035, bz + 0.25, 0, 0, 0).rotation.x = Math.PI / 2;
  const wp = spot(-10, 10, 7, 20, 0.7) || [-8, 10.5]; const wb = new T.Group(); wb.position.set(wp[0], 0, wp[1]); wb.rotation.y = r() * TAU; s.add(wb);
  mk(wb, CY(0.42, 0.28, 0.32, 16, true), col(us ? '#2a5a8a' : '#5a6a5a', 0.5, 0.4), 0, 0.5, 0).scale.set(1, 1, 1.4);
  mk(wb, new T.TorusGeometry(0.18, 0.06, 8, 16), col('#1a1a1a', 0.9), 0, 0.2, 0.7, 0, Math.PI / 2, 0);
  for (const sx of [-1, 1]) { mk(wb, CY(0.02, 0.02, 1.5, 6), col('#8a6a4a', 0.8), sx * 0.25, 0.45, -0.25, Math.PI / 2 - 0.25, 0, 0); mk(wb, CY(0.02, 0.02, 0.5, 6), col('#5a5a5a', 0.5, 0.6), sx * 0.25, 0.25, -0.5); }
  H.cols.push([wb.position.x - 0.6, wb.position.z - 0.6, wb.position.x + 0.6, wb.position.z + 0.6]);
  const rake = new T.Group(); rake.position.set(11.7, 0, 8 + r() * 4); rake.rotation.z = 0.25; s.add(rake); mk(rake, CY(0.015, 0.015, 1.6, 6), col('#a8875a', 0.8), 0, 0.8, 0); mk(rake, B(0.04, 0.05, 0.45), col('#5a5a5a', 0.5, 0.7), 0, 1.6, 0);
  const fp = spot(-9, 9, 9, 20, 0.5) || [0, 17]; const fd = new T.Group(); fd.position.set(fp[0], 0, fp[1]); s.add(fd);
  mk(fd, CY(0.025, 0.025, 1.7, 8), col('#2a2a2a', 0.5, 0.6), 0, 0.85, 0); mk(fd, CY(0.15, 0.15, 0.02, 16), col(us ? '#5a3a2a' : '#8a6a4a', 0.8), 0, 1.65, 0); mk(fd, new T.ConeGeometry(0.2, 0.15, 6), col(us ? '#3a5a3a' : '#8a3a2a', 0.7), 0, 1.92, 0); for (let k = 0; k < 4; k++) mk(fd, CY(0.006, 0.006, 0.2, 4), col('#2a2a2a', 0.5), Math.cos(k * 1.57) * 0.13, 1.76, Math.sin(k * 1.57) * 0.13);
  H.cols.push([fd.position.x - 0.1, fd.position.z - 0.1, fd.position.x + 0.1, fd.position.z + 0.1]);
  // daisies and clover in the lawn
  if (H.house.yard.layout !== 'dunes' && H.house.yard.layout !== 'gulf') {
    const N = H.o.low ? 400 : 1100, fl = new T.InstancedMesh(new T.CircleGeometry(0.018, 8).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, emissive: 0x222222 }), N);
    const m4 = new T.Matrix4(), p = new T.Vector3(), q = new T.Quaternion(), sc = new T.Vector3(1, 1, 1), c = new T.Color(); let n = 0;
    for (let k = 0; k < N * 2 && n < N; k++) { const x = -11.5 + r() * 23, z = 5 + r() * 16.5; if (H.Y.beds.some((b) => Math.abs(x - b.x) < b.w / 2 + 0.2 && Math.abs(z - b.z) < b.d / 2 + 0.2)) continue; p.set(x, 0.05 + r() * 0.04, z); sc.setScalar(0.7 + r() * 0.8); m4.compose(p, q, sc); fl.setMatrixAt(n, m4); fl.setColorAt(n, c.set(r() < 0.75 ? 0xfafaf2 : (r() < 0.5 ? 0xf2d23a : 0xd8a8d8))); n++; }
    fl.count = n; s.add(fl);
  }
}
