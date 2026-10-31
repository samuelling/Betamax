import * as THREE from 'three';
import { simulate, MODE, T_SIM } from './sim.js';
import { World, SUN_DIR } from './world.js';
import { Soldiers } from './soldiers.js';
import { Billboards, Tracers } from './fx.js';
import { Playback } from './playback.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { worldSounds, machineSounds } from './sfx.js';
import { Post } from './post.js';
import { heightAt, inMinefield, ARENA } from './terrain.js';
import { vehZ, heloPose } from './layout.js';
import * as TX from './textures.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const low = params.get('q') === 'low' || (touch && Math.min(screen.width, screen.height) < 900);
const Q = low
  ? { pr: Math.min(devicePixelRatio, 1.5), shadow: 1024, terrainSeg: 230, grass: 6000, bloom: true }
  : { pr: Math.min(devicePixelRatio, 1.75), shadow: 2048, terrainSeg: 360, grass: 18000, bloom: true };

const renderer = new THREE.WebGLRenderer({ antialias: !low, powerPreference: 'high-performance' });
renderer.setPixelRatio(Q.pr);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.03, 6000);
scene.add(camera);

let G; // game
setTimeout(boot, 30);

function boot() {
  const world = new World(renderer, scene, Q);
  const S = simulate(7);
  const sol = new Soldiers(scene, S);
  const smoke = new Billboards(scene, 11000, TX.makeSoftTex(), false, world.fogColor);
  const glow = new Billboards(scene, 5000, TX.makeFlashTex(), true, world.fogColor);
  const tracers = new Tracers(scene, 2500);
  const pb = new Playback(S, world, sol, smoke, glow, tracers, scene);
  { const t0 = performance.now(); sol.prepare(pb); console.log("ragdolls ms", Math.round(performance.now() - t0)); }
  const flashTex = TX.makeFlashTex();
  const player = new Player(camera, scene, flashTex);
  const input = new Input(renderer.domElement, $('touch'));
  const audio = new Audio();
  const post = new Post(renderer, scene, camera, Q);
  post.setSize(innerWidth, innerHeight, Q.pr);
  G = { world, S, sol, pb, player, input, audio, post };
  // brass casings + dropped magazines live in forward time
  const brassGeo = new THREE.CylinderGeometry(0.0065, 0.0065, 0.05, 8).rotateZ(Math.PI / 2);
  G.brass = new THREE.InstancedMesh(brassGeo, new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.75, 0.56, 0.26, THREE.SRGBColorSpace), metalness: 1, roughness: 0.3 }), 48);
  G.brass.castShadow = true; G.brass.frustumCulled = false; G.brass.count = 0; scene.add(G.brass);
  G.casings = []; G.props = [];
  window.BW = G; G.possess = (i) => beginPossess(i);
  // debug: look at actor i from distance d (no player control)
  G.studio = (i, tau, d = 3, ang = 0.6, h = 1.2, clean = true) => {
    G.state = 'studio'; G.tau = tau; tick(0.0001, false);
    G.world.root.visible = !clean; scene.fog = clean ? null : G.fogSave || scene.fog; if (!G.fogSave) G.fogSave = scene.fog;
    G.studioFloor = G.studioFloor || (() => { const m = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8a7a62, roughness: 0.95 })); m.receiveShadow = true; scene.add(m); return m; })();
    G.studioFloor.visible = clean; G.studioFloor.position.y = G.pb.hit[i].pos.y - 0.005;
    const k = G.pb.hit[i]; const c = k.pos;
    camera.position.set(c.x + Math.sin(ang) * d, c.y + h, c.z + Math.cos(ang) * d); camera.lookAt(c.x, c.y + 0.9, c.z);
    G.player.vm.visible = false; tick(0.0001, true);
  };
  G.raw = () => { renderer.render(scene, camera); };
  // debug: free camera in the full world at tape time tau
  G.cam = (tau, x, y, z, tx, ty, tz) => {
    G.state = 'studio'; G.tau = tau; tick(0.0001, false);
    G.world.root.visible = true; if (G.studioFloor) G.studioFloor.visible = false;
    camera.position.set(x, y, z); camera.lookAt(tx, ty, tz); G.player.vm.visible = false; tick(0.0001, true);
  };
  G.near = (tau, x, z, r) => { G.state = 'studio'; G.tau = tau; tick(0.0001, false); const o = []; G.pb.hit.forEach((k, i) => { if (k && k.pos && Math.hypot(k.pos.x - x, k.pos.z - z) < r) o.push([i, +k.pos.x.toFixed(1), +k.pos.y.toFixed(2), +k.pos.z.toFixed(1)]); }); return o; };
  // debug: look at a vehicle/helo/gunship object at tape time tau
  G.vstudio = (kind, i, tau, d, ang, h, ty = 2) => {
    G.state = 'studio'; G.tau = tau; tick(0.0001, false);
    const o = kind === 'veh' ? G.world.vehicles[i].grp : kind === 'helo' ? G.world.helos[i].grp : G.world.gunships[i].grp;
    const c = o.position;
    // isolate: hide everything but this object
    G.world.root.children.forEach((ch) => { ch.visible = ch === o; });
    if (!G.fogSave) G.fogSave = scene.fog; scene.fog = null; G.sol.mesh.visible = false;
    G.studioFloor = G.studioFloor || (() => { const m = new THREE.Mesh(new THREE.PlaneGeometry(600, 600).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x9a8a70, roughness: 0.95 })); m.receiveShadow = true; scene.add(m); return m; })();
    G.studioFloor.visible = true; G.studioFloor.position.set(c.x, kind === 'veh' ? c.y - 0.02 : heightAt(c.x, c.z), c.z);
    camera.position.set(c.x + Math.sin(ang) * d, c.y + h, c.z + Math.cos(ang) * d); camera.lookAt(c.x, c.y + ty, c.z);
    G.world.update(G.tau, camera, G.S.explosions);
    for (const pool of [G.pb.smoke, G.pb.glow, G.pb.tr]) pool.mesh.visible = false;
    G.player.vm.visible = false; G.post.render(G.real);
  };
  G.vmStudio = (side, reloadT, tactical) => {
    G.state = 'play'; G.world.root.visible = false; scene.fog = null; G.sol.mesh.visible = false;
    const p = G.player; p.setSide(side); p.health = 1e9; p.pos.set(0, 50, 0); p.vel.set(0, 0, 0); p.yaw = 0; p.pitch = 0;
    if (reloadT !== undefined) { p.ammo = tactical ? 5 : 0; p.startReload(); p.reloadT = reloadT; }
    G.input.keys = {}; tick(0.0001, false); p.pos.set(0, 50, 0); p.vel.set(0,0,0); tick(0.0001, false); renderer.render(scene, camera);
  };
  G.renderer = renderer; G.scene = scene; G.camera = camera;
  Object.assign(G, {
    state: 'title', tau: S.T_START, tauRate: 0, real: 0, body: S.startId, lives: [], overrides: new Map(), live: [],
    enemyHp: new Float32Array(S.N).fill(100), cp: null, stateT: 0, shake: 0, feed: [], flash: 0, damageFx: 0,
  });
  buildCrosshair();
  if (input.touch) $('bPause').addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); pauseGame(); }, { passive: false });
  showTitle();
  $('load').style.display = 'none';
  addEventListener('resize', onResize);
  // let the tape counter etc. show behind the title
  G.last = performance.now();
  requestAnimationFrame(frame);
}

function onResize() {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); G.post.setSize(innerWidth, innerHeight, Q.pr);
}

// ---------------------------------------------------------------- HUD helpers
function buildCrosshair() {
  const c = $('cross');
  for (let i = 0; i < 4; i++) { const b = document.createElement('b'); c.appendChild(b); }
  for (let i = 0; i < 8; i++) { const d = document.createElement('i'); d.style.transform = `rotate(${i * 45}deg)`; $('dmg').appendChild(d); }
}
function setCross(spread, show) {
  const bs = $('cross').children; const s = 5 + spread * 400;
  const L = 9;
  const set = (b, x, y, w, h) => { b.style.left = x + 'px'; b.style.top = y + 'px'; b.style.width = w + 'px'; b.style.height = h + 'px'; };
  set(bs[0], s, -1, L, 2); set(bs[1], -s - L, -1, L, 2); set(bs[2], -1, s, 2, L); set(bs[3], -1, -s - L, 2, L);
  $('cross').style.opacity = show ? 1 : 0;
}
const fmtCounter = (t) => { const s = Math.max(0, Math.floor(t)); return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const fmtClock = (t) => { const s = 6 * 3600 + 14 * 60 + Math.floor(t); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60; return `AM ${h}:${String(m).padStart(2, '0')}`; };
const ident = (i) => G.S.actors[i].ident;
const short = (i) => { const d = ident(i); return `${d.rank} ${d.last.toUpperCase()}`; };
function card(text, dur = 2.6) {
  const c = $('card'); c.textContent = text; c.style.opacity = 1;
  clearTimeout(card.t); card.t = setTimeout(() => (c.style.opacity = 0), dur * 1000);
}
function sub(html, dur = 5) {
  const c = $('sub'); c.innerHTML = html; c.style.opacity = 1;
  clearTimeout(sub.t); sub.t = setTimeout(() => (c.style.opacity = 0), dur * 1000);
}
function identityHTML(i) {
  const d = ident(i), side = G.S.actors[i].side;
  return `${d.rank} ${d.first.toUpperCase()} ${d.last.toUpperCase()} &middot; ${d.age}<br><em>${d.town.toUpperCase()} &middot; ${side ? 'INVADER' : 'DEFENDER'}</em><br>&ldquo;${d.life}&rdquo;`;
}
function feed(text) {
  const f = $('feed'); const d = document.createElement('div'); d.textContent = text; f.prepend(d);
  while (f.children.length > 6) f.lastChild.remove();
  setTimeout(() => { d.style.opacity = 0; setTimeout(() => d.remove(), 1000); }, 4500);
}
function hitMarker(kill) { const h = $('hitm'); h.style.opacity = 1; h.style.transform = kill ? 'scale(1.6)' : 'scale(1)'; clearTimeout(hitMarker.t); hitMarker.t = setTimeout(() => (h.style.opacity = 0), 120); }
function damageDir(fromX, fromZ) {
  const p = G.player;
  const a = Math.atan2(fromX - p.pos.x, fromZ - p.pos.z); // world angle of source
  const camFwd = Math.atan2(-Math.sin(p.yaw), -Math.cos(p.yaw));
  let rel = a - camFwd; while (rel > Math.PI) rel -= 2 * Math.PI; while (rel < -Math.PI) rel += 2 * Math.PI;
  const idx = ((Math.round(-rel / (Math.PI / 4)) % 8) + 8) % 8;
  const el = $('dmg').children[idx]; el.style.transition = 'none'; el.style.opacity = 1;
  requestAnimationFrame(() => { el.style.transition = 'opacity 1.2s'; el.style.opacity = 0; });
}
function hud(show) { for (const id of ['ident', 'hp', 'ammo', 'lives', 'cross']) $(id).style.display = show ? '' : 'none'; }

// ---------------------------------------------------------------- overlays
function overlay(html, cls = '') {
  const o = $('ovl'); o.className = cls; o.innerHTML = html;
  if (G && G.input.touch) $('touch').style.display = cls === 'hidden' ? 'block' : 'none';
}
function showTitle() {
  G.state = 'title';
  hud(false);
  overlay(`<div style="height:8vh"></div>
    <h1>BETAMAX</h1><h2>a battle, in rewind &middot; Mayflower Beach, Dennis</h2>
    <p>The tape is already at the end. Everything runs backward: bullets fly home, the dead get up, the tide comes in the wrong way.</p>
    <p>You move forward. Kill someone and you become them, and the tape keeps rewinding. Keep going until you reach the moment your body first arrived on the beach.</p>
    <button id="go">&#9654; PLAY</button>
    <p style="font-size:.8em;opacity:.7">${touch ? 'left thumb: move &middot; right thumb: look &middot; FIRE / AIM / DUCK' : 'WASD move &middot; mouse aim &middot; click fire &middot; right-click aim &middot; shift sprint &middot; C crouch &middot; R reload'}<br>reversed bullets still hurt &middot; the edges of the beach are mined</p>`, 'shade');
  $('go').onclick = () => { G.audio.init(); G.audio.play(G.audio.B.clunk, 0.6); G.input.lock(); startTape(); };
}

function startTape() {
  overlay('', 'hidden');
  const S = G.S;
  G.tau = S.T_START; G.body = S.startId; G.lives = [S.startId];
  G.playT = 0; if (G.audio && G.audio.wilhelm) { G.audio.wilhelm.clear(); G.audio.wilhelmArmed = false; G.audio.wilhelmNext = 0; }
  G.overrides.clear(); G.enemyHp.fill(100); G.pb.hitShots.clear(); G.pb.whizzed.clear();
  G.player.setSide(0); G.player.health = 100;
  G.state = 'intro'; G.stateT = 0; G.tauRate = 1; G.caught = false;
  hud(false);
  $('feed').innerHTML = '';
  card('SO IT GOES.', 3);
}

function beginPlayFromBody(i, tauNow) {
  const s = G.pb.sample(i, tauNow, {});
  const p = G.player;
  p.pos.set(s.x, s.y, s.z); p.vel.set(0, 0, 0);
  p.yaw = s.yaw + Math.PI; p.pitch = Math.max(-0.5, Math.min(0.5, s.pitch)) * 0.5;
  p.setSide(G.S.actors[i].side); p.health = 100;
  G.body = i;
}

function saveCheckpoint() {
  const p = G.player;
  G.cp = { tau: G.tau, body: G.body, pos: p.pos.clone(), yaw: p.yaw, pitch: p.pitch, lives: G.lives.length };
}
function restoreCheckpoint() {
  const c = G.cp, p = G.player;
  G.tau = c.tau; G.body = c.body; G.lives.length = c.lives;
  p.pos.copy(c.pos); p.vel.set(0, 0, 0); p.yaw = c.yaw; p.pitch = c.pitch; p.health = 100;
  p.setSide(G.S.actors[c.body].side);
  G.overrides.clear(); G.enemyHp.fill(100); G.pb.hitShots.clear(); G.pb.whizzed.clear();
}

// ---------------------------------------------------------------- combat
const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _c = new THREE.Vector3();
function rayCapsule(o, d, a, b, r) {
  // returns ray t of first approach within r of segment ab (approximate), or Infinity
  const ab = _c.subVectors(b, a);
  const ao = new THREE.Vector3().subVectors(o, a);
  const abab = ab.dot(ab), abd = ab.dot(d), abao = ab.dot(ao);
  const den = abab - abd * abd;
  let t = den > 1e-6 ? (abd * abao - abab * d.dot(ao)) / den : 0;
  if (t < 0) t = 0;
  let s = (abao + t * abd) / abab; s = Math.min(1, Math.max(0, s));
  // re-solve t for the clamped s
  const p = new THREE.Vector3().copy(a).addScaledVector(ab, s);
  t = Math.max(0, new THREE.Vector3().subVectors(p, o).dot(d));
  const q = new THREE.Vector3().copy(o).addScaledVector(d, t);
  const dist = q.distanceTo(p);
  if (dist > r) return Infinity;
  return t - Math.sqrt(r * r - dist * dist);
}
function raySphere(o, d, c, r) {
  const oc = new THREE.Vector3().subVectors(o, c); const b = oc.dot(d); const cc = oc.dot(oc) - r * r; const h = b * b - cc;
  if (h < 0) return Infinity; const t = -b - Math.sqrt(h); return t > 0 ? t : Infinity;
}
function rayTerrain(o, d, max = 320) {
  let prev = 0;
  for (let t = 0.5; t < max; t += 0.8) {
    const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
    if (y < Math.max(heightAt(x, z), -0.05)) {
      let lo = prev, hi = t;
      for (let k = 0; k < 6; k++) { const m = (lo + hi) / 2; const yy = o.y + d.y * m; if (yy < Math.max(heightAt(o.x + d.x * m, o.z + d.z * m), -0.05)) hi = m; else lo = m; }
      return hi;
    }
    prev = t;
  }
  return Infinity;
}
function rayVehicles(o, d) {
  let best = Infinity;
  for (const v of G.S.L.vehicles) {
    const z = vehZ(v, G.tau); const gy = heightAt(v.x, z);
    const hx = v.type === 'aav' ? 1.75 : 7.2, hy = v.type === 'aav' ? 3.2 : 5.5, hz = v.type === 'aav' ? 4.3 : 13.5;
    const min = [v.x - hx, gy - 1, z - hz], max = [v.x + hx, gy + hy, z + hz];
    let t0 = 0, t1 = Infinity; const oo = [o.x, o.y, o.z], dd = [d.x, d.y, d.z]; let ok = true;
    for (let k = 0; k < 3; k++) {
      if (Math.abs(dd[k]) < 1e-8) { if (oo[k] < min[k] || oo[k] > max[k]) { ok = false; break; } continue; }
      let a = (min[k] - oo[k]) / dd[k], b = (max[k] - oo[k]) / dd[k]; if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) { ok = false; break; }
    }
    if (ok && t0 > 0.3 && t0 < best) best = t0;
  }
  return best;
}

function playerFire(muzzle, inp) {
  const p = G.player;
  camera.updateMatrixWorld();
  _o.copy(camera.position);
  camera.getWorldDirection(_d);
  const moving = Math.hypot(p.vel.x, p.vel.z) / 5;
  const spread = (0.022 * (1 - p.ads) + 0.0025 * p.ads + moving * 0.012 + p.recoil * 0.2);
  _d.x += (Math.random() - 0.5) * spread; _d.y += (Math.random() - 0.5) * spread; _d.z += (Math.random() - 0.5) * spread; _d.normalize();
  const tT = rayTerrain(_o, _d);
  const hb = G.S.obstacles.segment(_o.x, _o.y, _o.z, _o.x + _d.x * 300, _o.y + _d.y * 300, _o.z + _d.z * 300, G.tau, -1, true);
  const tV = hb >= 0 ? hb * 300 : Infinity;
  let best = Infinity, who = -1, head = false;
  const pb = G.pb, side = G.S.actors[G.body].side;
  for (let i = 0; i < G.S.N; i++) {
    if (i === G.body) continue;
    const h = pb.hit[i];
    if (!h.ok || !pb.alive(i, G.tau)) continue;
    const ts = raySphere(_o, _d, h.head, 0.16);
    if (ts < best) { best = ts; who = i; head = true; }
    const tc = rayCapsule(_o, _d, h.pelvis, h.neck, 0.27);
    if (tc < best) { best = tc; who = i; head = false; }
  }
  const tEnv = Math.min(tT, tV);
  const end = new THREE.Vector3();
  // your own shot is the one sound on the tape that runs forward
  G.audio.gun(p.side);
  if (who >= 0 && best < tEnv) {
    end.copy(_o).addScaledVector(_d, best);
    const friendly = G.S.actors[who].side === side;
    addTracer(muzzle, end);
    if (friendly) return;
    addImpact(end, 3);
    G.enemyHp[who] -= head ? 200 : 42;
    if (G.enemyHp[who] <= 0) { hitMarker(true); beginPossess(who); }
    else hitMarker(false);
  } else {
    const t = Math.min(tEnv, 300);
    end.copy(_o).addScaledVector(_d, t);
    addTracer(muzzle, end);
    if (t < 300) addImpact(end, end.y <= 0.01 && heightAt(end.x, end.z) < 0 ? 2 : tV < tT ? 4 : 1);
  }
}

function handlePlayerEvents() {
  const p = G.player, A = G.audio;
  for (const e of p.events) {
    if (e === 'drop') {
      const { p: mp, q } = p.magWorld();
      const m = p.gun.userData.makeMag(); m.position.copy(mp); m.quaternion.copy(q);
      m.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      scene.add(m);
      G.props.push({ m, v: new THREE.Vector3(p.vel.x * 0.8, -0.6, p.vel.z * 0.8), w: new THREE.Vector3(Math.random() * 6 - 3, Math.random() * 4, 2), t0: G.real, landed: false });
      A.play(A.B.magOut, 0.5);
    } else if (e === 'magOut') A.play(A.B.magOut, 0.45);
    else if (e === 'magIn') A.play(A.B.magIn, 0.7);
    else if (e === 'tug') A.play(A.B.tug, 0.35);
    else if (e === 'bolt') { A.play(A.B.bolt, 0.8); p.shake = Math.max(p.shake, 0.1); }
    else if (e === 'rack') A.play(A.B.rack, 0.8);
  }
  p.events.length = 0;
}
function ejectBrass() {
  const p = G.player; if (!p.eject) return;
  const c = { p: p.eject.p.clone(), v: p.eject.r.clone().multiplyScalar(2.6 + Math.random()).add(new THREE.Vector3(p.vel.x, 1.2 + Math.random(), p.vel.z)), r: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0), w: new THREE.Vector3(Math.random() * 30, Math.random() * 30, 0), t0: G.real, b: 0 };
  G.casings.push(c); if (G.casings.length > 48) G.casings.shift();
}
const _bm = new THREE.Matrix4(), _bq = new THREE.Quaternion(), _bs = new THREE.Vector3(1, 1, 1);
function updateForwardProps(dt) {
  // brass
  let n = 0;
  G.casings = G.casings.filter((c) => G.real - c.t0 < 8);
  for (const c of G.casings) {
    const gy = Math.max(heightAt(c.p.x, c.p.z), -0.05) + 0.007;
    if (c.b < 3) {
      c.v.y -= 9.8 * dt; c.p.addScaledVector(c.v, dt); c.r.x += c.w.x * dt; c.r.y += c.w.y * dt;
      if (c.p.y < gy) { c.p.y = gy; c.v.multiplyScalar(0.3); c.v.y = Math.abs(c.v.y) * 0.5; c.w.multiplyScalar(0.4); c.b++; if (c.b === 1 && c.p.distanceTo(G.player.pos) < 4) G.audio.play(G.audio.B.brass, 0.15, 0, 0.9 + Math.random() * 0.3); if (c.b >= 3) { c.r.x = Math.PI / 2; c.r.z = 0; } }
    }
    _bq.setFromEuler(c.r); _bm.compose(c.p, _bq, _bs); G.brass.setMatrixAt(n++, _bm);
  }
  G.brass.count = n; G.brass.instanceMatrix.needsUpdate = true;
  // dropped magazines
  G.props = G.props.filter((o) => { if (G.real - o.t0 > 40) { scene.remove(o.m); return false; } return true; });
  for (const o of G.props) {
    if (o.landed) continue;
    o.v.y -= 9.8 * dt; o.m.position.addScaledVector(o.v, dt);
    o.m.rotation.x += o.w.x * dt; o.m.rotation.y += o.w.y * dt; o.m.rotation.z += o.w.z * dt;
    const gy = Math.max(heightAt(o.m.position.x, o.m.position.z), -0.05) + 0.02;
    if (o.m.position.y < gy) { o.m.position.y = gy; o.landed = true; o.m.rotation.set(Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1), Math.random() * 6, 0, 'YXZ'); G.audio.play(G.audio.B.drop, 0.4); }
  }
}

// forward-time effects (the player's own actions move with real time)
function addLive(life, fn) { G.live.push({ t0: G.real, life, fn }); }
function addTracer(a, b) {
  const A = a.clone(), B = b.clone(), dist = A.distanceTo(B), dir = B.clone().sub(A).normalize();
  const c = G.player.side === 0 ? [3.2, 1.0, 0.35] : [0.7, 3.0, 0.9];
  addLive(dist / 900 + 0.02, (sm, gl, tr, age) => {
    const h = Math.min(dist, age * 900), t = Math.max(0, h - 9);
    tr.push(A.x + dir.x * t, A.y + dir.y * t, A.z + dir.z * t, 0.02, A.x + dir.x * h, A.y + dir.y * h, A.z + dir.z * h, 0.03, c[0], c[1], c[2], 0.9);
  });
  addLive(1.2, (sm, gl, tr, age) => sm.push(A.x + age * 0.3, A.y + age * 0.4, A.z, 0.15 + age * 0.6, 0.8, 0.78, 0.75, 0.16 * (1 - age / 1.2), age));
}
function addImpact(p, kind) {
  const P = p.clone(); const seed = Math.random() * 100;
  addLive(1.4, (sm, gl, tr, age) => {
    if (kind === 3) { if (age < 0.4) sm.push(P.x, P.y + age * 0.3, P.z, 0.25 + age, 0.32, 0.05, 0.04, 0.55 * (1 - age / 0.4), seed); return; }
    if (kind === 4) { if (age < 0.08) gl.push(P.x, P.y, P.z, 0.4, 3, 2.4, 1.6, 1, seed); sm.push(P.x, P.y + age * 0.3, P.z, 0.2 + age * 0.6, 0.6, 0.6, 0.6, 0.3 * (1 - age / 1.4), seed); return; }
    const c = kind === 2 ? [0.92, 0.94, 0.96] : [0.8, 0.72, 0.58];
    for (let k = 0; k < 3; k++) sm.push(P.x + Math.sin(seed + k * 2) * age, P.y + age * 1.1, P.z + Math.cos(seed + k * 2) * age, 0.3 + age * 1.4, c[0], c[1], c[2], 0.5 * Math.pow(1 - age / 1.4, 1.5), k);
    if (age < 0.8) for (let k = 0; k < 4; k++) { const vx = Math.sin(seed * 3 + k) * 1.5, vz = Math.cos(seed * 5 + k) * 1.5, vy = 3 + k * 0.6; const y = P.y + vy * age - 4.9 * age * age; if (y > P.y - 0.1) sm.push(P.x + vx * age, y, P.z + vz * age, kind === 2 ? 0.14 : 0.07, c[0] * 0.6, c[1] * 0.6, c[2] * 0.6, 0.9, 0); }
  });
}
function addMineBlast(p) {
  const P = p.clone();
  addLive(10, (sm, gl, tr, age) => {
    if (age < 0.2) gl.push(P.x, P.y + 1, P.z, 12 * (1 - age / 0.2) + 3, 4.5, 2.8, 1.5, 1, 0);
    if (age < 3) for (let k = 0; k < 22; k++) { const vx = Math.sin(k * 2.3) * 6, vz = Math.cos(k * 1.7) * 6, vy = 8 + (k % 5) * 2; const y = P.y + vy * age - 4.9 * age * age; if (y > P.y - 0.3) sm.push(P.x + vx * age, y, P.z + vz * age, 0.5 + age * 0.6, 0.5, 0.44, 0.35, 0.85 * (1 - age / 3), k); }
    for (let k = 0; k < 10; k++) { const a = age - k * 0.15; if (a < 0) continue; sm.push(P.x + a * 0.8, P.y + 1 + a * 1.1, P.z, 2 + a * 0.6, 0.3, 0.28, 0.26, 0.4 * Math.min(1, a * 2) * Math.max(0, 1 - a / 10), k); }
  });
}

// ---------------------------------------------------------------- state changes
function beginPossess(i) {
  G.state = 'possess'; G.stateT = 0;
  G.pz = { i, from: camera.position.clone(), fromQ: camera.quaternion.clone(), oldBody: G.body, oldPos: G.player.pos.clone(), oldYaw: G.player.yaw };
  G.audio.play(G.audio.R.whoosh, 0.7); G.audio.play(G.audio.B.thump, 0.9);
  feed(`${short(i)} ▸ YOU`);
}
function finishPossess() {
  const z = G.pz;
  G.overrides.set(z.oldBody, { x: z.oldPos.x, y: z.oldPos.y, z: z.oldPos.z, yaw: z.oldYaw - Math.PI, t0: G.real });
  beginPlayFromBody(z.i, G.tau);
  G.lives.push(z.i);
  saveCheckpoint();
  G.state = 'play'; G.stateT = 0; G.flash = 1;
  card('SO IT GOES.', 1.8);
  sub(identityHTML(z.i), 5.5);
  camera.fov = 74; camera.updateProjectionMatrix();
}
function beginDeath(cause) {
  if (G.state !== 'play') return;
  G.state = 'dead'; G.stateT = 0;
  G.audio.play(G.audio.B.thump, 1);
  card(cause === 'mine' ? 'SO IT GOES.' : 'SO IT GOES.', 2.2);
  sub(cause === 'mine' ? 'You stepped off the edge of the tape.' : `${short(G.body)} dies twice. Fast-forwarding to the last body you took.`, 3);
}
function beginEnding() {
  G.state = 'ending'; G.stateT = 0;
  G.end = { from: camera.position.clone(), fromQ: camera.quaternion.clone() };
  hud(false);
  const st = G.S.actors[G.body];
  sub(st.side === 0 ? 'Back to the helicopter. Back to the sky.' : 'Back into the hull. Back out to sea.', 6);
  G.audio.play(G.audio.B.clunk, 0.4);
}
function showEnd() {
  G.state = 'end';
  hud(false);
  if (document.pointerLockElement) document.exitPointerLock();
  const rows = G.lives.map((i) => { const d = ident(i); return `${G.S.actors[i].side ? '&#9670;' : '&#9671;'} ${d.rank} ${d.first} ${d.last}, ${d.age} <span>&mdash; ${d.town}</span>`; }).join('<br>');
  overlay(`<div class="ttl">&#9632; STOP</div><div class="ttr">0:00:00</div>
    <h2 style="margin-top:2.5em">You were ${G.lives.length} ${G.lives.length === 1 ? 'person' : 'people'}.</h2>
    <div class="lives">${rows}</div>
    <p>At the start of the tape every one of them was alive, crossing the flats or riding in over the pines.</p>
    <button id="again">&#9664;&#9664; REWIND AGAIN</button>`, 'blue');
  $('again').onclick = () => { G.audio.play(G.audio.B.clunk, 0.6); G.input.lock(); startTape(); };
}

// ---------------------------------------------------------------- per-frame
const ctx = { overrides: null, liveFx: [], playerPos: new THREE.Vector3(), playerHeight: 1.7, playerAlive: true, sound: true, hideBody: true, bodyId: 0, real: 0 };
const tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpV = new THREE.Vector3();
let fpsAvg = 60;

function frame(now) {
  requestAnimationFrame(frame);
  if (G.hold) { G.last = now; return; }
  tick(Math.min(0.05, (now - G.last) / 1000)); G.last = now;
}
// test hook: advance the game deterministically
window.BWstep = (n, dt = 1 / 30) => { for (let i = 0; i < n; i++) tick(dt, i === n - 1); };

function tick(dt, draw = true) {
  fpsAvg += (1 / Math.max(dt, 1e-3) - fpsAvg) * 0.05;
  G.real += dt; G.stateT += dt;
  const p = G.player, S = G.S;
  const inp = G.input.read(dt);
  let tauRate = 1;
  let osd = '◀◀ REW';
  const pu = G.post.u;
  let rew = 1, ff = 0, pause = 0, desat = 0, muffle = 18000, showHud = false, spreadShow = false, stuck = 0;

  switch (G.state) {
    case 'title': {
      tauRate = 0; stuckTape(dt);
      if (G.tau < S.T_START - 40) G.tau = S.T_START;
      const a = G.real * 0.025;
      const cx = -14 + Math.sin(a) * 18, cz = -28;
      camera.position.set(cx, heightAt(cx, cz) + 3.2, cz);
      camera.lookAt(cx * 0.5 + 6, 1.2, 60);
      osd = Math.sin(G.real * 5) > -0.3 ? '◀ SLOW' : ''; rew = 0.25; stuck = 1;
      break;
    }
    case 'intro': {
      const st = S.actors[G.body];
      if (G.stateT < 3.2) { tauRate = 0; stuckTape(dt); osd = Math.sin(G.real * 5) > -0.3 ? '◀ SLOW' : ''; rew = 0.25; stuck = 1 - G.stateT / 3.2; G.tau = Math.max(G.tau, st.deathTime + 0.6); }
      else if (!G.caught) { G.caught = true; G.audio.play(G.audio.B.clunk, 0.7); G.flash = 0.4; }
      const h = G.pb.hit[G.body];
      // ride the ragdoll's head: camera looks along the head's forward axis
      const e = h.headM.elements;
      tmpV.set(e[8], e[9], e[10]); // forward (z)
      camera.position.set(e[12], e[13], e[14]).addScaledVector(tmpV, 0.09); camera.position.y += 0.1;
      const up = new THREE.Vector3(e[4], e[5], e[6]);
      const m = new THREE.Matrix4().lookAt(camera.position, camera.position.clone().add(tmpV), up);
      camera.quaternion.setFromRotationMatrix(m);
      if (G.tau <= st.deathTime) {
        beginPlayFromBody(G.body, G.tau);
        saveCheckpoint();
        G.state = 'play'; G.stateT = 0;
        sub(identityHTML(G.body), 6);
      }
      break;
    }
    case 'play': {
      G.playT = (G.playT || 0) + dt; if (G.audio) { G.audio.playT = G.playT; if (G.playT > 20) G.audio.wilhelmArmed = true; }
      showHud = true; spreadShow = true;
      if (inp.touchLook && G.input.settings.assist) aimAssist(inp, dt);
      const out = p.update(dt, inp, S.obstacles, G.tau);
      if (p.jumped) G.input.consumeJump();
      const mz = p.tryFire(inp);
      if (mz) { playerFire(mz, inp); ejectBrass(); }
      handlePlayerEvents();
      if (G.real - p.lastHit > 3.5) p.health = Math.min(100, p.health + dt * 22);
      // minefield
      const dx = Math.max(ARENA.x0 - p.pos.x, p.pos.x - ARENA.x1, 0), dz = Math.max(ARENA.z0 - p.pos.z, p.pos.z - ARENA.z1, 0);
      const out2 = Math.max(dx, dz);
      const near = Math.min(p.pos.x - ARENA.x0, ARENA.x1 - p.pos.x, p.pos.z - ARENA.z0, ARENA.z1 - p.pos.z);
      $('warn').style.opacity = near < 8 ? (0.6 + 0.4 * Math.sin(G.real * 10)) : 0;
      if (out2 > 1.6) { addMineBlast(p.pos); G.audio.at('boom', p.pos.x, p.pos.y, p.pos.z, listener(), 1.4); p.shake = 2; beginDeath('mine'); break; }
      if (G.tau <= S.actors[G.body].spawn + 0.02) beginEnding();
      break;
    }
    case 'possess': {
      const z = G.pz; const k = Math.min(1, G.stateT / 1.35); const e = k * k * (3 - 2 * k);
      tauRate = 1 - 0.88 * Math.min(1, G.stateT / 0.3);
      osd = '▶ PLAY'; rew = 0;
      const h = G.pb.hit[z.i];
      tmpV.copy(h.head); tmpV.y += 0.03;
      camera.position.lerpVectors(z.from, tmpV, e);
      camera.position.y += Math.sin(e * Math.PI) * 1.2;
      tmpE.set(h.pitch * 0.5, h.yaw + Math.PI, 0, 'YXZ'); tmpQ.setFromEuler(tmpE);
      camera.quaternion.slerpQuaternions(z.fromQ, tmpQ, e);
      camera.fov = 74 + Math.sin(e * Math.PI) * 30; camera.updateProjectionMatrix();
      G.flash = Math.max(0, (k - 0.75) / 0.25);
      desat = Math.sin(e * Math.PI) * 0.8; muffle = 900;
      if (k >= 1) finishPossess();
      break;
    }
    case 'dead': {
      tauRate = 0; pause = 1; rew = 0; osd = '❚❚ PAUSE'; desat = 1; muffle = 500;
      p.shake *= 0.95;
      camera.position.y += (p.pos.y + 0.3 - camera.position.y) * Math.min(1, dt * 3);
      if (G.stateT > 2.0) { G.state = 'ff'; G.stateT = 0; G.ffFrom = G.tau; G.audio.play(G.audio.B.click, 0.5); }
      break;
    }
    case 'ff': {
      const dur = Math.min(2.4, Math.max(0.8, (G.cp.tau - G.ffFrom) / 14));
      const k = Math.min(1, G.stateT / dur);
      tauRate = 0; G.tau = G.ffFrom + (G.cp.tau - G.ffFrom) * k;
      osd = '▶▶ FF'; rew = 0; ff = 1; desat = 0.3; muffle = 2500;
      if (k >= 1) { restoreCheckpoint(); G.state = 'play'; G.stateT = 0; sub(identityHTML(G.body), 4); }
      break;
    }
    case 'ending': {
      const st = S.actors[G.body];
      tauRate = 1.8; osd = '◀◀ REW ×2';
      const k = Math.min(1, G.stateT / 1.6), e = k * k * (3 - 2 * k);
      const target = endingCam(st);
      camera.position.lerpVectors(G.end.from, target.pos, e);
      camera.quaternion.slerpQuaternions(G.end.fromQ, target.q, e);
      if (G.tau <= Math.max(0.3, st.spawn - 13)) { G.audio.play(G.audio.B.clunk, 0.7); showEnd(); }
      break;
    }
    case 'end': {
      tauRate = 0; osd = '■ STOP'; rew = 0; pause = 0.3;
      break;
    }
    case 'studio': { tauRate = 0; rew = 0; break; }
    case 'paused': {
      tauRate = 0; osd = Math.sin(G.real * 4) > -0.5 ? '❚❚ PAUSE' : ''; rew = 0; pause = 1;
      break;
    }
  }

  const tauPrev = G.tau;
  G.tau = Math.max(0, G.tau - dt * tauRate);

  // battle playback
  ctx.overrides = G.overrides; ctx.real = G.real; ctx.bodyId = G.body; ctx.camPos = camera.position;
  ctx.playerPos.copy(p.pos); ctx.playerHeight = p.eyeH + 0.1; ctx.playerAlive = G.state === 'play';
  ctx.sound = G.state !== 'title' && G.state !== 'end';
  ctx.hideBody = G.state !== 'title';
  G.live = G.live.filter((l) => G.real - l.t0 < l.life);
  ctx.liveFx.length = 0;
  for (const l of G.live) { const age = G.real - l.t0; ctx.liveFx.push((sm, gl, tr) => l.fn(sm, gl, tr, age)); }
  const ev = G.pb.update(G.tau, G.state === 'ff' ? G.tau : tauPrev, ctx);
  updateForwardProps(dt);
  G.sol.warm(1);
  G.world.update(G.tau, camera, S.explosions);

  // events
  const L = listener();
  if (G.audio.enabled) {
    G.audio.update(G.tau, ctx.sound ? tauRate : 0, dt);
    if (ctx.sound) worldSounds(S, G.tau, L, G.body, G.audio, G.pb);
    machineSounds(S, G.tau, L, G.audio);
  }
  if (G.state === 'play' && G.stateT > 2.2) { // brief grace after taking a body
    for (const h of ev.playerHits) {
      p.health -= h.dmg; p.lastHit = G.real; G.damageFx = Math.min(1, G.damageFx + 0.5); damageDir(h.fromX, h.fromZ);
      p.shake = Math.max(p.shake, 0.4);
    }
    if (ev.shake) p.shake = Math.max(p.shake, ev.shake * 1.5);
    if (p.health <= 0) beginDeath('shot');
  }
  if (G.state !== 'title' && G.state !== 'end') for (const d of ev.feed) {
    const hp = G.pb.hit[d.id].pos;
    if (d.killer !== G.body && hp.distanceTo(camera.position) > 45) continue;
    const v = short(d.id);
    if (d.killer >= 0) feed(`${v} ◂◂ un-shot by ${d.killer === G.body ? 'YOU' : short(d.killer)}`);
    else feed(`${v} ◂◂ ${({ mortar: 'un-mortared', drone: 'un-hit by a drone', vehicle: 'un-burned', rocket: 'un-rocketed', mlrs: 'un-shelled', crash: 'un-crushed' })[d.cause] || 'un-shelled'}`);
  }

  // audio loops
  if (G.audio.enabled) {
    G.audio.setLoop('heli', 0);
    G.audio.setLoop('drone', ev.nearestDrone < 150 ? Math.min(0.5, 12 / (ev.nearestDrone + 4)) : 0, 1);
    G.audio.setLoop('fire', ev.wrecks.length ? 0.06 : 0);
    G.audio.setLoop('battle', G.state === 'end' || G.state === 'title' ? 0.05 : 0.2, tauRate > 1 ? 1.4 : 1);
    G.audio.setLoop('sea', 0.22);
    G.audio.setLoop('hiss', G.state === 'ff' ? 0.12 : 0.035);
    G.audio.muffle.frequency.setTargetAtTime(muffle, G.audio.ctx.currentTime, 0.1);
  }

  // HUD
  $('mode').textContent = osd;
  $('counter').textContent = fmtCounter(G.tau);
  $('stamp').innerHTML = `OCT.31.2026<br>${fmtClock(G.tau)}`;
  hud(showHud);
  p.vm.visible = G.state === 'play' || G.state === 'paused';
  if (G.state === 'studio') { hud(false); }
  if (showHud) {
    const st = S.actors[G.body];
    $('ident').innerHTML = `<span class="side">${st.side ? 'INVADER' : 'DEFENDER'}</span>${short(G.body)}`;
    $('hp').firstChild.style.width = Math.max(0, p.health) + '%';
    $('ammo').innerHTML = p.reload > 0 ? 'RELOAD' : `${p.ammo}<small> / ${p.mag}</small>`;
    $('lives').textContent = `PERSPECTIVES ${G.lives.length}  ·  HOME IN ${fmtCounter(Math.max(0, G.tau - st.spawn)).slice(2)}`;
    const moving = Math.hypot(p.vel.x, p.vel.z) / 5;
    setCross(0.022 * (1 - p.ads) + moving * 0.012 + p.recoil * 0.2, p.ads < 0.6);
  }
  if (G.state !== 'play') $('warn').style.opacity = 0;

  // camera fov for ADS
  if (G.state === 'play') { const f = 74 - p.ads * 22; if (Math.abs(camera.fov - f) > 0.05) { camera.fov = f; camera.updateProjectionMatrix(); } }

  // post
  G.flash *= Math.exp(-dt * 3.5); G.damageFx *= Math.exp(-dt * 2.2);
  const lowHp = G.state === 'play' ? Math.max(0, 1 - p.health / 45) * 0.5 : 0;
  pu.uRew.value = rew; pu.uFF.value = ff; pu.uPause.value = pause; pu.uDesat.value = Math.max(desat, lowHp * 0.6);
  pu.uDamage.value = Math.min(1, G.damageFx + lowHp); pu.uFlash.value = G.state === 'possess' ? Math.max(G.flash, 0) : G.flash * 0.8;
  pu.uAmt.value = 1; pu.uStuck.value = stuck;
  if (draw) G.post.render(G.real, SUN_DIR);
}

// a tape that can't quite rewind: crawls back in jerky fields, slips, repeats
function stuckTape(dt) {
  G.stuckT = (G.stuckT || 0) - dt;
  if (G.stuckT <= 0) {
    const r = Math.random();
    if (r < 0.62) G.tau -= 0.04 + Math.random() * 0.09;      // creep back a field or two
    else if (r < 0.8) G.tau += 0.03 + Math.random() * 0.05; // slip forward, repeat
    G.stuckT = 0.07 + Math.random() * 0.22;
  }
}

// light touch aim assist: friction near targets, gentle pull while moving or firing
function aimAssist(inp, dt) {
  const p = G.player, side = G.S.actors[G.body].side, pb = G.pb;
  const cy = Math.cos(p.pitch);
  const fx = -Math.sin(p.yaw) * cy, fy = Math.sin(p.pitch), fz = -Math.cos(p.yaw) * cy;
  const ex = p.pos.x, ey = p.pos.y + p.eyeH, ez = p.pos.z;
  let best = 0.1, tgt = null;
  for (let i = 0; i < G.S.N; i++) {
    if (i === G.body || G.S.actors[i].side === side) continue;
    const h = pb.hit[i]; if (!h.ok || !pb.alive(i, G.tau)) continue;
    const tx = h.pelvis.x + (h.neck.x - h.pelvis.x) * 0.7, ty = h.pelvis.y + (h.neck.y - h.pelvis.y) * 0.7, tz = h.pelvis.z + (h.neck.z - h.pelvis.z) * 0.7;
    const dx = tx - ex, dy = ty - ey, dz = tz - ez, d = Math.hypot(dx, dy, dz);
    if (d > 160 || d < 1) continue;
    const ang = Math.acos(Math.min(1, (dx * fx + dy * fy + dz * fz) / d));
    const w = ang * (1 + d / 200);
    if (w < best) { best = w; tgt = [dx, dy, dz, d]; }
  }
  if (!tgt) return;
  const k = 1 - best / 0.1;
  inp.lookX *= 1 - 0.45 * k; inp.lookY *= 1 - 0.45 * k;
  const moving = Math.hypot(p.vel.x, p.vel.z) > 0.5;
  if (moving || inp.fire || p.ads > 0.5) {
    const wantYaw = Math.atan2(-tgt[0], -tgt[2]), wantPitch = Math.atan2(tgt[1], Math.hypot(tgt[0], tgt[2]));
    let dyaw = wantYaw - p.yaw; while (dyaw > Math.PI) dyaw -= 2 * Math.PI; while (dyaw < -Math.PI) dyaw += 2 * Math.PI;
    const pull = Math.min(1, dt * (p.ads > 0.5 ? 5 : 2.5)) * k;
    p.yaw += dyaw * pull; p.pitch += (wantPitch - p.pitch) * pull;
  }
}

// ---------------------------------------------------------------- pause / settings
function pauseGame() {
  if (!['play', 'intro', 'possess'].includes(G.state)) return;
  G.resumeState = G.state; G.state = 'paused';
  G.audio.play(G.audio.B.click, 0.5);
  const st = G.input.settings;
  overlay(`<h1 style="font-size:clamp(48px,9vw,110px)">&#10074;&#10074; PAUSE</h1>
    <div class="row">${touch ? 'TOUCH' : 'MOUSE'} SENSITIVITY <input id="sens" type="range" min="0.2" max="3" step="0.05" value="${touch ? st.touchSens : st.sens}"> <span id="sv"></span></div>
    <div class="row"><label><input id="inv" type="checkbox" ${st.invert ? 'checked' : ''}> INVERT LOOK</label>
    ${touch ? `<label><input id="ast" type="checkbox" ${st.assist ? 'checked' : ''}> AIM ASSIST</label>` : `<label><input id="adh" type="checkbox" ${st.adsHold ? 'checked' : ''}> HOLD TO AIM</label>`}</div>
    <button id="res">&#9654; PLAY</button><button id="quit" style="font-size:.6em">&#9632; STOP</button>`, 'shade');
  const sv = $('sv'), sens = $('sens');
  const upd = () => { sv.textContent = (+sens.value).toFixed(2); if (touch) st.touchSens = +sens.value; else st.sens = +sens.value; G.input.save(); };
  sens.oninput = upd; upd();
  $('inv').onchange = (e) => { st.invert = e.target.checked; G.input.save(); };
  if ($('ast')) $('ast').onchange = (e) => { st.assist = e.target.checked; G.input.save(); };
  if ($('adh')) $('adh').onchange = (e) => { st.adsHold = e.target.checked; G.input.save(); };
  $('res').onclick = resumeGame;
  $('quit').onclick = () => { overlay('', 'hidden'); showTitle(); G.tau = G.S.T_START; };
}
function resumeGame() {
  if (G.state !== 'paused') return;
  overlay('', 'hidden');
  G.state = G.resumeState; G.audio.play(G.audio.B.click, 0.5);
  G.input.lock();
  G.input.mouse.l = G.input.mouse.r = false;
}
document.addEventListener('pointerlockchange', () => { if (G && !G.input.locked && !G.input.touch) pauseGame(); });
addEventListener('keydown', (e) => { if (e.code === 'Escape' && G && G.state === 'paused') resumeGame(); if (e.code === 'KeyP' && G) { if (G.state === 'paused') resumeGame(); else pauseGame(); } });

function listener() {
  const e = camera.matrixWorld.elements;
  return { x: camera.position.x, y: camera.position.y, z: camera.position.z, rx: e[0], rz: e[2], fx: -e[8], fz: -e[10] };
}

function dynamicColliders() {
  const out = G.S.L.colliders.slice();
  for (const v of G.S.L.vehicles) {
    if (G.tau < v.tArrive) continue;
    const n = v.type === 'aav' ? 3 : 5, len = v.type === 'aav' ? 6 : 22, r = v.type === 'aav' ? 1.9 : 6.5;
    for (let k = 0; k < n; k++) out.push({ x: v.x, z: v.zStop - len / 2 + (k / (n - 1)) * len, r });
  }
  const hp = {};
  for (const h of G.S.L.helos) {
    heloPose(h, G.tau, hp);
    if (hp.y - h.y < 2) for (let k = -1; k <= 1; k++) out.push({ x: hp.x, z: hp.z + k * 2.5, r: 1.6 });
  }
  return out;
}

function endingCam(st) {
  const S = G.S, pos = new THREE.Vector3(), q = new THREE.Quaternion();
  if (st.side === 0) {
    const h = S.L.helos[st.helo]; const hp = heloPose(h, G.tau, {});
    const sideSign = st.ident && (st.id % 2) ? 1 : -1;
    const local = new THREE.Vector3(sideSign * 0.7, 1.75, 0.9).applyEuler(new THREE.Euler(hp.pitch, hp.yaw, 0, 'YXZ'));
    pos.set(hp.x, hp.y, hp.z).add(local);
    const look = new THREE.Euler(-0.25, hp.yaw + (sideSign > 0 ? -Math.PI / 2 : Math.PI / 2), 0, 'YXZ');
    q.setFromEuler(look);
  } else {
    const v = S.L.vehicles[st.veh]; const z = vehZ(v, G.tau);
    if (v.type === 'aav') { pos.set(v.x + 2.5, heightAt(v.x, z) + 5.5, z + 9); }
    else { pos.set(v.x + 1.2, Math.max(heightAt(v.x, z), 0) + 3.2, z + 3); }
    const m = new THREE.Matrix4().lookAt(pos, new THREE.Vector3(v.x, 3, z - 60), new THREE.Vector3(0, 1, 0));
    q.setFromRotationMatrix(m);
  }
  return { pos, q };
}
