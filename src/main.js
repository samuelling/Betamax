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
import { VCRIntro, drawMenu, MENU_W, MENU_H, PLAY_BOX } from './vcr.js';
import { Pickups } from './pickups.js';
import { Home } from './home.js';
import { pickHouse } from './housetypes.js';
import { setScene } from './scenes.js';
import { simulateSandwich } from './sim4.js';
import { LZ, CRASH, road6A } from './terrain4.js';

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
// the opening: a tape at the slot of a deck sitting on an old set. It's drawn once now, while the battle is computed
const vcr = params.has('nointro') ? null : new VCRIntro(renderer);
if (vcr) {
  const l = $('load'); l.classList.add('vcr'); l.textContent = 'LOADING TAPE\u2026';
  vcr.update(0);
}
setTimeout(boot, 30);

function boot() {
  const world = new World(renderer, scene, Q);
  const S = simulate(7);
  world.setDestruction(S.destruction);
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
  G.pick = new Pickups(scene, S, sol);
  G.sceneId = 'beach'; G.scenes = { beach: { world, S, sol, pb, pick: G.pick } };
  // brass casings + dropped magazines live in forward time
  const brassGeo = new THREE.CylinderGeometry(0.0065, 0.0065, 0.05, 8).rotateZ(Math.PI / 2);
  G.brass = new THREE.InstancedMesh(brassGeo, new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.75, 0.56, 0.26, THREE.SRGBColorSpace), metalness: 1, roughness: 0.3 }), 48);
  G.brass.castShadow = true; G.brass.frustumCulled = false; G.brass.count = 0; scene.add(G.brass);
  G.casings = []; G.props = [];
  window.BW = G; G.possess = (i) => beginPossess(i); G.camera = camera; G.endingCam = (i) => endingCam(G.S.actors[i]); G.ending = (i) => { G.body = i; G.tau = G.S.actors[i].spawn; beginEnding(); };
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
  // debug: show collision volumes (static + dynamic at the current tape time)
  G.colliders = (on = true) => {
    if (G.dbgCol) { scene.remove(G.dbgCol); G.dbgCol = null; }
    if (!on) return;
    const O = S.obstacles, grp = new THREE.Group(), mb = new THREE.LineBasicMaterial({ color: 0xff2020, depthTest: false }), mw = new THREE.LineBasicMaterial({ color: 0x20ff40, depthTest: false });
    const addBox = (o) => {
      const g = new THREE.EdgesGeometry(new THREE.BoxGeometry(o.hx * 2, o.y1 - o.y0, o.hz * 2));
      const m = new THREE.LineSegments(g, o.walk ? mw : mb); m.position.set(o.x, (o.y0 + o.y1) / 2, o.z); m.rotation.y = Math.atan2(o.s, o.c); m.renderOrder = 999; grp.add(m);
    };
    const addCyl = (o) => {
      const y0 = heightAt(o.x, o.z), g = new THREE.EdgesGeometry(new THREE.CylinderGeometry(o.r, o.r, o.y1 - y0, 10));
      const m = new THREE.LineSegments(g, o.walk ? mw : mb); m.position.set(o.x, (o.y1 + y0) / 2, o.z); m.renderOrder = 999; grp.add(m);
    };
    for (const o of O.boxes) addBox(o);
    for (const o of O.circles) addCyl(o);
    for (const o of O.dynamic(G.tau)) addBox(o);
    scene.add(grp); G.dbgCol = grp;
  };
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
  G.vmStudio = (side, reloadT, tactical, wid) => {
    G.state = 'play'; G.world.root.visible = false; scene.fog = null; G.sol.mesh.visible = false;
    const p = G.player; if (wid) p.setLoadout(side, wid, 'm18'); else p.setSide(side); p.health = 1e9; p.pos.set(0, 50, 0); p.vel.set(0, 0, 0); p.yaw = 0; p.pitch = 0;
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
  addEventListener('keydown', (e) => { if (G.home && G.home.act && G.home.act.keys && !e.repeat && e.code !== 'Escape') G.home._typed = true; });
  renderer.domElement.addEventListener('click', () => { if (G.home && !G.input.locked) G.input.lock(); });
  if (params.get('home')) { // straight to the last tape (for working on it): ?home=us | ?home=ru
    const side = ['tx', 'ru'].includes(params.get('home')) ? 1 : 0, want = params.get('house');
    const lf = params.get('life'), fits = (q) => q.side === side && q.deathTime > 0 && (!lf || ident(q.id).life.includes(lf));
    const a = S.actors.find((q) => fits(q) && (!want || pickHouse(side, ident(q.id), q.id).id === want)) || S.actors.find(fits) || S.actors.find((q) => q.side === side && q.deathTime > 0);
    G.lives = [lifeOf(a.id)]; $('load').style.display = 'none'; if (vcr) vcr.dispose();
    const go = () => { removeEventListener('pointerdown', go); G.audio.init(); goHome(a.id, params.has('fwd')); };
    $('load').style.display = ''; $('load').classList.add('vcr'); $('load').innerHTML = '<span class="blink">CLICK TO PLAY THE LAST TAPE</span>';
    addEventListener('pointerdown', () => { $('load').style.display = 'none'; go(); }, { once: true });
    G.last = performance.now(); requestAnimationFrame(frame); return;
  }
  if (params.get('scene') === 'sandwich') { // straight to tape 2 of the Cape Cod track (for working on it)
    const a = S.actors.find((q) => q.side === 0 && q.helo >= 0);
    G.lives = [lifeOf(a.id)]; if (vcr) vcr.dispose();
    $('load').style.display = ''; $('load').classList.add('vcr'); $('load').innerHTML = '<span class="blink">CLICK TO PLAY TAPE 2</span>';
    addEventListener('pointerdown', () => { $('load').style.display = 'none'; G.audio.init(); G.input.lock(); loadSandwich(ident(a.id), a.skin); startSandwich(); }, { once: true });
    G.last = performance.now(); requestAnimationFrame(frame); return;
  }
  if (vcr) {
    G.vcr = vcr; vcr.ready();
    const l = $('load'); l.innerHTML = '<span class="blink">CLICK TO INSERT TAPE</span>';
    const go = (e) => {
      if (!G.vcr || e.button > 0) return;
      G.audio.init();
      if (vcr.phase === 'insert') { if (vcr.skip()) G.audio.vcrSkip(); return; }
      if (vcr.insert(G.audio)) l.style.display = 'none';
    };
    addEventListener('pointerdown', go); addEventListener('keydown', go);
    G.state = 'vcr'; hud(false); $('hud').style.visibility = 'hidden';
  } else {
    showTitle();
    $('load').style.display = 'none';
  }
  addEventListener('resize', onResize);
  // let the tape counter etc. show behind the title
  G.last = performance.now();
  requestAnimationFrame(frame);
}

function onResize() {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); G.post.setSize(innerWidth, innerHeight, Q.pr);
  if (G.vcr) G.vcr.onResize();
  if (G.home) G.home.resize();
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
const lifeOf = (i) => ({ id: i, scene: G.sceneId, ident: ident(i), side: G.S.actors[i].side });
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
  return `${d.rank} ${d.first.toUpperCase()} ${d.last.toUpperCase()} &middot; ${d.age}<br><em>${d.town.toUpperCase()} &middot; ${side ? 'TEXAS' : 'CAPE COD'}</em><br>&ldquo;${d.life}&rdquo;`;
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
  // the same picture the set was showing, laid over the window the way the camera framed it (cover)
  overlay(`<div id="tt"><canvas id="ttc" width="${MENU_W}" height="${MENU_H}"></canvas><button id="go" aria-label="Play"></button><div id="ttl"></div></div>`, 'title');
  const c = $('ttc'), g = c.getContext('2d');
  drawMenu(g); if (document.fonts) document.fonts.load('64px "VT323"').then(() => drawMenu(g)).catch(() => {});
  const [bx, by, bw, bh] = PLAY_BOX, b = $('go');
  Object.assign(b.style, { left: `${bx / MENU_W * 100}%`, top: `${by / MENU_H * 100}%`, width: `${bw / MENU_W * 100}%`, height: `${bh / MENU_H * 100}%` });
  b.onclick = () => {
    G.audio.init(); G.audio.play(G.audio.B.clunk, 0.6); G.input.lock();
    $('ovl').classList.add('out'); setTimeout(startTape, 380);
  };
}

function startTape() {
  overlay('', 'hidden');
  const S = G.S;
  useScene('beach');
  G.tau = G.S.T_START; G.body = G.S.startId; G.lives = [lifeOf(G.S.startId)];
  G.introK = undefined; G.introA = undefined;
  G.playT = 0; if (G.audio && G.audio.wilhelm) { G.audio.wilhelm.clear(); G.audio.wilhelmArmed = false; G.audio.wilhelmNext = 0; }
  G.overrides.clear(); G.enemyHp.fill(100); G.pb.hitShots.clear(); G.pb.whizzed.clear();
  G.player.setBody(S.actors[S.startId]); G.player.health = 100; G.pick && G.pick.reset();
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
  p.setBody(G.S.actors[i]); p.health = 100;
  G.body = i;
}

function saveCheckpoint() {
  const p = G.player;
  G.cp = { tau: G.tau, body: G.body, pos: p.pos.clone(), yaw: p.yaw, pitch: p.pitch, lives: G.lives.length, slots: JSON.parse(JSON.stringify(p.slots)), taken: new Set(G.pick.taken), left: G.pick.left.map((l) => ({ ...l })) };
}
function restoreCheckpoint() {
  const c = G.cp, p = G.player;
  G.tau = c.tau; G.body = c.body; G.lives.length = c.lives;
  p.pos.copy(c.pos); p.vel.set(0, 0, 0); p.yaw = c.yaw; p.pitch = c.pitch; p.health = 100;
  p.setLoadout(G.S.actors[c.body].side, null, null, c.slots);
  for (const l of G.pick.left) G.pick.free('l' + l.k); G.pick.taken = new Set(c.taken); G.pick.left = c.left.map((l) => ({ ...l }));
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
  const ud = p.gun.userData;
  // your own shot is the one sound on the tape that runs forward
  G.audio.gunW(ud);
  const dir0 = _d.clone();
  for (let pel = 0; pel < (ud.pellets || 1); pel++) {
  _d.copy(dir0);
  const spread = (0.022 * (1 - p.ads) + 0.0025 * p.ads + moving * 0.012 + p.recoil * 0.2) * (ud.spread || 1) + (ud.pellets > 1 ? 0.045 : 0);
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
  if (who >= 0 && best < tEnv) {
    end.copy(_o).addScaledVector(_d, best);
    // friendly fire: anyone can be shot, and anyone you kill becomes you
    const friendly = G.S.actors[who].side === side;
    addTracer(muzzle, end);
    addImpact(end, 3);
    const fall = ud.pellets > 1 ? Math.max(0.25, 1 - best / 40) : 1; // buckshot thins out with range
    G.enemyHp[who] -= (head ? ud.head : ud.dmg) * fall;
    if (G.enemyHp[who] <= 0 && G.state === 'play') { hitMarker(true); beginPossess(who, friendly); return; }
    else hitMarker(false);
  } else {
    const t = Math.min(tEnv, 300);
    end.copy(_o).addScaledVector(_d, t);
    if (pel < 3) addTracer(muzzle, end);
    if (t < 300) addImpact(end, end.y <= 0.01 && heightAt(end.x, end.z) < 0 ? 2 : tV < tT ? 4 : 1);
  }
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
    else if (e === 'shell') A.play(A.B.magIn, 0.45, 0, 1.4);
    else if (e === 'draw') A.play(A.B.tug, 0.4, 0, 1.2);
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
function beginPossess(i, friendly = false) {
  if (G.forward) { feed(`${short(i)} \u2715`); return; } // played forward, a death is just a death
  G.state = 'possess'; G.stateT = 0;
  G.pz = { i, from: camera.position.clone(), fromQ: camera.quaternion.clone(), oldBody: G.body, oldPos: G.player.pos.clone(), oldYaw: G.player.yaw };
  G.audio.play(G.audio.R.whoosh, 0.7); G.audio.play(G.audio.B.thump, 0.9);
  feed(friendly ? `${short(i)} ▸ YOU · friendly fire` : `${short(i)} ▸ YOU`);
}
function finishPossess() {
  const z = G.pz;
  G.overrides.set(z.oldBody, { x: z.oldPos.x, y: z.oldPos.y, z: z.oldPos.z, yaw: z.oldYaw - Math.PI, t0: G.real });
  beginPlayFromBody(z.i, G.tau);
  G.lives.push(lifeOf(z.i));
  saveCheckpoint();
  G.state = 'play'; G.stateT = 0; G.flash = 1;
  card('SO IT GOES.', 1.8);
  sub(identityHTML(z.i), 5.5);
  camera.fov = 74; camera.updateProjectionMatrix();
}
function beginDeath(cause) {
  if (G.state !== 'play') return;
  if (G.forward) { G.forward = false; G.state = 'end'; card('SO IT GOES.', 3); setTimeout(() => showEnd(true), 2600); return; }
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
  if (G.sceneId === 'sandwich') sub(st.helo === 0 ? 'Back into the wreck. Back into the sky.' : st.house >= 0 ? 'Back inside. Back to waiting.' : 'Back down the road, the way you came.', 6);
  else sub(st.side === 0 ? 'Back to the helicopter. Back to the sky.' : 'Back into the hull. Back out to sea.', 6);
  if (G.sceneId === 'beach' && st.side === 0 && G.world.helos[st.helo] && !G.world.helos[st.helo].legs) { // your own legs, hanging out of the cabin door
    const sideSign = (st.id % 2) ? 1 : -1, g = new THREE.Group(), cloth = new THREE.MeshStandardMaterial({ color: 0x6a6a52, roughness: 0.95 }), boot = new THREE.MeshStandardMaterial({ color: 0x3a3028, roughness: 0.7 });
    for (const dz of [-0.13, 0.13]) {
      const th = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.46, 10), cloth); th.rotation.z = Math.PI / 2; th.position.set(sideSign * 1.45, 1.25, 1.5 + dz); th.rotation.y = sideSign * 0.5; g.add(th);
      const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.46, 10), cloth); sh.position.set(sideSign * 1.72, 1.02, 1.68 + dz * 1.15); sh.rotation.z = sideSign * 0.15; g.add(sh);
      const bt = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.28), boot); bt.position.set(sideSign * 1.76, 0.76, 1.74 + dz * 1.2); bt.rotation.y = sideSign * 0.5; g.add(bt);
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; }); G.world.helos[st.helo].grp.add(g); G.world.helos[st.helo].legs = g;
  }
  G.audio.play(G.audio.B.clunk, 0.4);
}
function showEnd(forwardDone) {
  G.state = 'end';
  hud(false); $('hud').style.visibility = ''; $('mode').textContent = '■ STOP';
  if (document.pointerLockElement) document.exitPointerLock();
  const rows = G.lives.map((l) => { const d = l.ident; return `${l.side ? '&#9670;' : '&#9671;'} ${d.rank} ${d.first} ${d.last}, ${d.age} <span>&mdash; ${d.town}</span>`; }).join('<br>');
  const last = G.endIdent || null;
  overlay(`<div class="ttl">&#9632; STOP</div><div class="ttr">0:00:00</div>
    <h2 style="margin-top:2.5em">You were ${G.lives.length} ${G.lives.length === 1 ? 'person' : 'people'}.</h2>
    <div class="lives">${rows}</div>
    <p>${forwardDone ? 'The tape ran out. Everyone on it is where they were always going to be.' : last ? `The last of them was ${last.first} ${last.last}, at home in ${last.town}, the afternoon the phone rang.` : 'At the start of the tape every one of them was alive.'}</p>
    <button id="again">&#9664;&#9664; REWIND AGAIN</button>${G.endBody != null && !forwardDone && G.endScene === 'beach' ? '<button id="fwd">&#9654; PLAY IT FORWARD</button><p style="font-size:.8em;opacity:.7">bonus: the same life, start to finish, in order</p>' : ''}`, 'blue');
  $('again').onclick = () => { G.audio.play(G.audio.B.clunk, 0.6); G.input.lock(); G.forward = false; startTape(); };
  if ($('fwd')) $('fwd').onclick = () => { G.audio.play(G.audio.B.clunk, 0.6); G.input.lock(); goHome(G.endBody, true); };
}

// ---------------------------------------------------------------- after the beach: back through the tapes, home
const MIDDLE = {
  beach1: [['THE NIGHT BEFORE', 'the hovercraft deck'], ['THE WAR ARRIVES', 'the port'], ['THE FIRST SHOT', '']],
  sandwich0: [['THE BOMB', 'Route 9, the run for the pickup'], ['ASHLAND STATE PARK', 'scouts in the woods']],
  sandwich1: [['THE WAR ARRIVES', 'the port'], ['THE FIRST SHOT', '']],
};
function tapesBack() {
  const i = G.body, d = ident(i), side = G.S.actors[i].side;
  G.state = 'tapes'; hud(false);
  if (document.pointerLockElement) document.exitPointerLock();
  // the Cape Cod track: before the beach, East Sandwich
  if (G.sceneId === 'beach' && side === 0) { tapeCard(2, 'EAST SANDWICH', d, side, 'where the helicopter came down', () => { loadSandwich(d, G.S.actors[i].skin); startSandwich(); }); return; }
  const list = MIDDLE[G.sceneId + side] || MIDDLE.beach1, n0 = G.sceneId === 'beach' ? 2 : 3;
  let k = 0;
  const show = () => {
    if (k >= list.length) { goHome(i, false); return; }
    const [title, where] = list[k];
    overlay(`<div class="ttl">&#9167; EJECT</div><div class="ttr">TAPE ${k + n0} / 5</div>
      <h2 style="margin-top:3em">${title}</h2><p>${d.rank} ${d.first} ${d.last} &middot; ${side ? 'TEXAS' : 'CAPE COD'}</p>
      <p style="opacity:.6">${where ? where + ' &mdash; ' : ''}not yet recorded</p>`, 'blue');
    G.audio.play(G.audio.B.clunk, 0.7); setTimeout(() => G.audio.play(G.audio.B.click, 0.5), 700);
    k++; setTimeout(show, 2300);
  };
  show();
}
// a recorded tape: its card, then PLAY (a click, so the mouse can be captured again)
function tapeCard(n, title, d, side, where, go) {
  overlay(`<div class="ttl">&#9167; EJECT</div><div class="ttr">TAPE ${n} / 5</div>
    <h2 style="margin-top:3em">${title}</h2><p>${d.rank} ${d.first} ${d.last} &middot; ${side ? 'TEXAS' : 'CAPE COD'}</p>
    <p style="opacity:.6">${where}</p><button id="tplay">&#9654; PLAY</button>`, 'blue');
  G.audio.play(G.audio.B.clunk, 0.7); setTimeout(() => G.audio.play(G.audio.B.click, 0.5), 700);
  $('tplay').onclick = () => { $('tplay').textContent = 'LOADING\u2026'; G.audio.play(G.audio.B.clunk, 0.6); G.input.lock(); setTimeout(go, 60); };
}
// ---------------------------------------------------------------- scenes: which battlefield is in the deck
function useScene(id) {
  const cur = G.scenes[G.sceneId], nx = G.scenes[id];
  if (cur && cur !== nx) {
    cur.world.setActive(false); cur.sol.mesh.visible = false;
    cur.pb.lights.forEach((l) => (l.intensity = 0)); cur.pb.drones.forEach((dr) => (dr.visible = false));
    for (const o of cur.pick.pool.values()) o.visible = false;
  }
  setScene(id); G.sceneId = id;
  nx.world.setActive(true); nx.sol.mesh.visible = true;
  Object.assign(G, { world: nx.world, S: nx.S, sol: nx.sol, pb: nx.pb, pick: nx.pick });
  G.enemyHp = new Float32Array(nx.S.N).fill(100); G.overrides.clear(); nx.pb.hitShots.clear(); nx.pb.whizzed.clear(); nx.pick.reset();
}
function loadSandwich(who, skin) {
  if (!G.scenes.sandwich) {
    const prev = G.sceneId; setScene('sandwich');
    const world = new World(renderer, scene, Q, 'sandwich');
    const S = simulateSandwich(4, { ident: who, skin });
    world.setDestruction(S.destruction);
    const sol = new Soldiers(scene, S);
    const pb = new Playback(S, world, sol, G.pb.smoke, G.pb.glow, G.pb.tr, scene);
    sol.prepare(pb);
    const pick = new Pickups(scene, S, sol);
    world.setActive(false); sol.mesh.visible = false;
    G.scenes.sandwich = { world, S, sol, pb, pick };
    setScene(prev); if (G.scenes[prev]) G.scenes[prev].world.setActive(true);
  } else { const S = G.scenes.sandwich.S; S.actors[S.startId].ident = who; }
  useScene('sandwich');
}
// East Sandwich opens on the meadow: the extraction on the grass, you a few steps from the door
function startSandwich() {
  overlay('', 'hidden');
  const S = G.S;
  G.tau = S.T_START; G.body = S.startId;
  G.introK = undefined; G.introA = undefined; G.playT = 0;
  if (G.audio && G.audio.wilhelm) { G.audio.wilhelm.clear(); G.audio.wilhelmArmed = false; G.audio.wilhelmNext = 0; }
  G.player.setBody(S.actors[S.startId]); G.player.health = 100;
  G.state = 'intro'; G.stateT = 0; G.tauRate = 1; G.caught = false;
  hud(false); $('feed').innerHTML = ''; $('hud').style.visibility = '';
  card('EAST SANDWICH', 3);
}
function goHome(i, forward) {
  const a = G.S.actors[i], who = ident(i);
  G.endBody = i; G.homeForward = forward; G.endScene = G.sceneId; G.endIdent = who;
  const hs = pickHouse(a.side, who, i);
  const identOf = () => who;
  overlay(`<div class="ttl">&#9654; PLAY</div><div class="ttr">TAPE 5 / 5</div><h2 style="margin-top:3em">HOME</h2><p>${who.first} ${who.last} &middot; a ${hs.name}, ${who.town}</p>`, 'blue');
  setTimeout(() => {
    if (G.audio.musicGain) G.audio.musicGain.gain.setTargetAtTime(0, G.audio.ctx.currentTime, 1.5);
    if (G.audio.vcrRunGain) G.audio.vcrRunGain.gain.setTargetAtTime(0, G.audio.ctx.currentTime, 1);
    G.tvRT = G.tvRT || new THREE.WebGLRenderTarget(512, 384, { type: THREE.HalfFloatType }); G.tvTau = 18;
    if (G.sceneId !== 'beach') useScene('beach');   // the set shows the beach
    G.home = new Home({ renderer, Q, audio: G.audio, side: a.side, ident: identOf(), id: i, low, touch: G.input.touch, house: params.get('house'),
      tvTexture: G.tvRT.texture, tv: beachTV,
      onEnd: () => { setTimeout(() => { const f = $('fade'); f.style.transition = 'opacity 2.5s'; f.style.opacity = 1; }, 400);
        setTimeout(() => { G.home.dispose(); G.home = null; $('fade').style.opacity = 0; $('todo').style.display = 'none';
          if (forward) beginForward(i); else showEnd(false); }, 3200); } });
    G.state = 'home'; overlay('', 'hidden'); hud(false); $('hud').style.visibility = ''; $('todo').style.display = '';
    G.input.lock();
  }, 1800);
}
// the bonus: after the phone call, the same person's morning on the beach, in order
function beginForward(i) {
  const a = G.S.actors[i];
  G.forward = true; G.lives = [lifeOf(i)];
  G.overrides.clear(); G.enemyHp.fill(100); G.pb.hitShots.clear(); G.pb.whizzed.clear();
  G.tau = a.spawn + 0.05; beginPlayFromBody(i, G.tau); saveCheckpoint();
  G.state = 'play'; G.stateT = 0; G.flash = 1; overlay('', 'hidden');
  if (G.audio.musicGain) { G.audio.musicVol = 0.2; G.audio.musicGain.gain.setTargetAtTime(0.2, G.audio.ctx.currentTime, 2); }
  card('▶ PLAY', 2); sub(identityHTML(i), 5);
}
// the beach, playing forward, on their television
const tvCam = new THREE.PerspectiveCamera(38, 4 / 3, 1, 3000);
let tvAcc = 0;
function beachTV(dt) {
  tvAcc += dt; G.tvTau = Math.min(T_SIM - 1, G.tvTau + dt);
  if (tvAcc < 1 / 15) return; const step = tvAcc; tvAcc = 0;
  const tau = G.tvTau, t = tau * 0.05;
  tvCam.position.set(Math.sin(t) * 140, 70 + Math.sin(t * 1.7) * 10, 120 + Math.cos(t) * 40); tvCam.lookAt(0, 0, 20);
  ctx.overrides = G.overrides; ctx.liveFx = []; ctx.playerPos.set(0, -500, 0); ctx.camPos = tvCam.position; ctx.bodyId = -1; ctx.hideBody = false; ctx.sound = false; ctx.real = G.real;
  G.pb.update(tau, tau - step, ctx);
  G.world.update(tau, tvCam, G.S.explosions);
  G.player.vm.visible = false;
  renderer.setRenderTarget(G.tvRT); renderer.render(scene, tvCam); renderer.setRenderTarget(null);
}

// East Sandwich endings: watch the wreck un-crash and climb away; or the house door they came out of; or the road
function endingCam4(st) {
  const L = G.S.L, pos = new THREE.Vector3(), look = new THREE.Vector3(), q = new THREE.Quaternion();
  if (st.helo === 0) {
    const hp = heloPose(L.helos[0], G.tau, {}), cx = CRASH.x - 24, cz = CRASH.z - 22;
    pos.set(cx, heightAt(cx, cz) + 17, cz); look.set(hp.x, hp.y + 1.2, hp.z);   // up over the canopy, so it can be watched all the way back
  } else if (st.house >= 0) {
    const h = L.houses[st.house], dx = Math.sin(h.rot), dz = Math.cos(h.rot), x = h.x + dx * (h.l / 2 + 9), z = h.z + dz * (h.l / 2 + 9);
    pos.set(x + dz * 3, heightAt(x, z) + 2.3, z - dx * 3); look.set(h.x + dx * h.l / 2, heightAt(h.x, h.z) + 1.4, h.z + dz * h.l / 2);
  } else {
    const f = st.from || { x: 0, z: 0 }, dir = f.x > 0 ? 1 : -1, x = f.x - dir * 12;
    pos.set(x, heightAt(x, road6A(x)) + 3, road6A(x) + 4); look.set(f.x + dir * 30, heightAt(f.x, f.z) + 1.5, road6A(f.x + dir * 30));
  }
  q.setFromRotationMatrix(new THREE.Matrix4().lookAt(pos, look, new THREE.Vector3(0, 1, 0)));
  return { pos, q };
}

// ---------------------------------------------------------------- per-frame
const ctx = { overrides: null, liveFx: [], playerPos: new THREE.Vector3(), playerHeight: 1.7, playerAlive: true, sound: true, hideBody: true, bodyId: 0, real: 0 };
const tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpV = new THREE.Vector3();
let fpsAvg = 60;

function frame(now) {
  requestAnimationFrame(frame);
  if (G.hold) { G.last = now; return; }
  if (G.vcr) {
    const dt = Math.min(0.05, (now - G.last) / 1000); G.last = now;
    const d = G.vcr.update(dt);
    if (d >= 1) { // through the glass: the picture on the tube is now the page, pixel for pixel
      showTitle();
      G.vcr.dispose(); G.vcr = null;
      $('hud').style.visibility = '';
    }
    return;
  }
  if (G.home) {
    const dt = Math.min(0.05, (now - G.last) / 1000); G.last = now;
    const inp = G.input.read(dt); inp.leave = !!(G.input.keys.Tab || (G.input.keys.KeyQ && !(G.home.act && G.home.act.keys)));
    G.home.update(dt, inp); return;
  }
  if (G.state === 'tapes' || G.state === 'home') { G.last = now; return; }
  if (G.state === 'title') { G.last = now; return; }
  tick(Math.min(0.05, (now - G.last) / 1000)); G.last = now;
}
// test hook: advance the game deterministically
window.BWstep = (n, dt = 1 / 30, draw = true) => { for (let i = 0; i < n; i++) tick(dt, draw && i === n - 1); };

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
      if (G.sceneId === 'sandwich') {
        if (G.stateT < 3.2) { tauRate = 0; stuckTape(dt); osd = Math.sin(G.real * 5) > -0.3 ? '◀ SLOW' : ''; rew = 0.25; stuck = 1 - G.stateT / 3.2; }
        else if (!G.caught) { G.caught = true; G.audio.play(G.audio.B.clunk, 0.7); G.flash = 0.4; G.introK = 0; G.introFrom = camera.position.clone(); G.introQ = camera.quaternion.clone(); }
        const h = G.pb.hit[G.body];
        if (G.introK === undefined) {   // wide: the meadow, the helicopter down on the grass
          const gy = heightAt(LZ.x, LZ.z), a = 0.9 + G.real * 0.03;
          camera.position.set(LZ.x + Math.sin(a) * 34, gy + 13, LZ.z - 8 + Math.cos(a) * 34); camera.lookAt(LZ.x, gy + 2, LZ.z);
        } else if (h && h.head) {
          G.introK = Math.min(1, G.introK + dt / 2.0);
          const k = G.introK, e = k * k * (3 - 2 * k);
          tmpV.copy(h.head); tmpV.y += 0.03;
          camera.position.lerpVectors(G.introFrom, tmpV, e);
          tmpE.set(h.pitch * 0.5, h.yaw + Math.PI, 0, 'YXZ'); tmpQ.setFromEuler(tmpE);
          camera.quaternion.slerpQuaternions(G.introQ, tmpQ, e);
          camera.fov = 74 + Math.sin(e * Math.PI) * 22; camera.updateProjectionMatrix();
          if (k >= 1) {
            G.introK = undefined; camera.fov = 74; camera.updateProjectionMatrix();
            beginPlayFromBody(G.body, G.tau); saveCheckpoint();
            G.state = 'play'; G.stateT = 0; G.flash = 0.6;
            sub(identityHTML(G.body), 6);
          }
        }
        break;
      }
      if (G.stateT < 3.2) { tauRate = 0; stuckTape(dt); osd = Math.sin(G.real * 5) > -0.3 ? '◀ SLOW' : ''; rew = 0.25; stuck = 1 - G.stateT / 3.2; G.tau = Math.max(G.tau, st.deathTime + 5.5); }
      else if (!G.caught) { G.caught = true; G.audio.play(G.audio.B.clunk, 0.7); G.flash = 0.4; }
      const h = G.pb.hit[G.body];
      const left = G.tau - st.deathTime;
      if (left > -0.1 || G.introK === undefined) {
        // from outside: the mortar un-explodes — smoke and dirt fall back up into the crater, the fire inhales,
        // and the body that will be you flies back together and stands
        const op = S.explosions.find((e) => e.opener) || { ix: h.pelvis.x + 2, iz: h.pelvis.z };
        const cx = (h.pelvis.x * 2 + op.ix) / 3, cz = (h.pelvis.z * 2 + op.iz) / 3;
        if (G.introA === undefined) G.introA = Math.atan2(h.pelvis.x - op.ix, h.pelvis.z - op.iz) + 1.25;
        const a = G.introA + G.real * 0.04, d = 12 + Math.max(0, left - 1) * 0.9;
        const px = cx + Math.sin(a) * d, pz = cz + Math.cos(a) * d;
        camera.position.set(px, Math.max(heightAt(px, pz) + 3, h.pelvis.y + 5 + Math.max(0, left - 1) * 0.5), pz);
        camera.lookAt(cx, h.pelvis.y + 1.0, cz);
        if (left <= -0.1) { G.introK = 0; G.introFrom = camera.position.clone(); G.introQ = camera.quaternion.clone(); }
      }
      if (left <= -0.1 && G.introK !== undefined) {
        // then dive into his eyes, as with every body you take
        G.introK = Math.min(1, G.introK + dt / 0.9);
        const k = G.introK, e = k * k * (3 - 2 * k);
        tmpV.copy(h.head); tmpV.y += 0.03;
        camera.position.lerpVectors(G.introFrom, tmpV, e);
        tmpE.set(h.pitch * 0.5, h.yaw + Math.PI, 0, 'YXZ'); tmpQ.setFromEuler(tmpE);
        camera.quaternion.slerpQuaternions(G.introQ, tmpQ, e);
        camera.fov = 74 + Math.sin(e * Math.PI) * 26; camera.updateProjectionMatrix();
        if (k >= 1) {
          G.introK = undefined; G.introA = undefined; camera.fov = 74; camera.updateProjectionMatrix();
          beginPlayFromBody(G.body, G.tau);
          saveCheckpoint();
          G.state = 'play'; G.stateT = 0; G.flash = 0.6;
          sub(identityHTML(G.body), 6);
        }
      }
      break;
    }
    case 'play': {
      G.playT = (G.playT || 0) + dt; if (G.audio) { G.audio.playT = G.playT; if (G.playT > 20) G.audio.wilhelmArmed = true; }
      showHud = true; spreadShow = true;
      if (inp.touchLook && G.input.settings.assist) aimAssist(inp, dt);
      const out = p.update(dt, inp, S.obstacles, G.tau);
      if (p.jumped) G.input.consumeJump();
      // weapons: 1 / 2 / wheel to switch, F or E to swap with a gun on the ground
      if (inp.slot === 1) p.switchTo('primary'); else if (inp.slot === 2) p.switchTo('sidearm'); else if (inp.slot === 3) p.switchTo(p.cur === 'primary' ? 'sidearm' : 'primary');
      { camera.getWorldDirection(tmpV); const n = G.pick.update(G.tau, p.pos, tmpV, G.body);
        const pk = $('pick');
        if (n) { pk.innerHTML = `${G.input.touch ? 'SWAP' : '[F]'} &nbsp;${n.name} <small>${n.cal}</small>`; pk.style.opacity = 1; } else pk.style.opacity = 0;
        if (G.input.touch) $('bSwap').style.display = n ? 'flex' : 'none';
        if (n && inp.use && p.swapT < 0) { const old = p.slots.primary.id, id = G.pick.take(p, old); if (id) { p.pickUp(id); G.audio.play(G.audio.B.tug, 0.6); G.audio.play(G.audio.B.rack, 0.4); feed(`picked up ${n.name}`); } }
      }
      const mz = p.tryFire(inp);
      if (mz) { playerFire(mz, inp); ejectBrass(); }
      handlePlayerEvents();
      if (G.real - p.lastHit > 3.2) p.health = Math.min(100, p.health + dt * 45);
      // minefield
      const dx = Math.max(ARENA.x0 - p.pos.x, p.pos.x - ARENA.x1, 0), dz = Math.max(ARENA.z0 - p.pos.z, p.pos.z - ARENA.z1, 0);
      const out2 = Math.max(dx, dz);
      const near = Math.min(p.pos.x - ARENA.x0, ARENA.x1 - p.pos.x, p.pos.z - ARENA.z0, ARENA.z1 - p.pos.z);
      $('warn').style.opacity = near < 8 ? (0.6 + 0.4 * Math.sin(G.real * 10)) : 0;
      if (out2 > 1.6) { addMineBlast(p.pos); G.audio.at('boom', p.pos.x, p.pos.y, p.pos.z, listener(), 1.4); p.shake = 2; beginDeath('mine'); break; }
      if (!G.forward && G.tau <= S.actors[G.body].spawn + 0.02) beginEnding();
      if (G.forward) { tauRate = -1; osd = '\u25B6 PLAY'; rew = 0; if (G.tau >= T_SIM - 0.5) { G.forward = false; showEnd(true); } }
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
      if (G.tau <= Math.max(0.3, st.spawn - 13)) { G.audio.play(G.audio.B.clunk, 0.7); tapesBack(); }
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
  if (G.state === 'ending') { // place the camera against the aircraft at the tape time it will be drawn at
    const k = Math.min(1, G.stateT / 1.6), e = k * k * (3 - 2 * k), target = endingCam(S.actors[G.body]);
    camera.position.lerpVectors(G.end.from, target.pos, e);
    camera.quaternion.slerpQuaternions(G.end.fromQ, target.q, e);
  }

  // battle playback
  ctx.overrides = G.overrides; ctx.real = G.real; ctx.bodyId = G.body; ctx.camPos = camera.position;
  ctx.playerPos.copy(p.pos); ctx.playerHeight = p.eyeH + 0.1; ctx.playerAlive = G.state === 'play';
  ctx.sound = G.state !== 'title' && G.state !== 'end';
  // during the opening you watch your first body from outside, until the dive into its eyes
  ctx.hideBody = G.state !== 'title' && !(G.state === 'intro' && (G.introK === undefined || G.introK < 0.85));
  G.live = G.live.filter((l) => G.real - l.t0 < l.life);
  ctx.liveFx.length = 0;
  for (const l of G.live) { const age = G.real - l.t0; ctx.liveFx.push((sm, gl, tr) => l.fn(sm, gl, tr, age)); }
  const ev = G.pb.update(G.tau, G.state === 'ff' ? G.tau : tauPrev, ctx);
  updateForwardProps(dt);
  G.sol.warm(1);
  G.world.update(G.tau, camera, S.explosions);

  // events
  const L = listener();
  const quiet = G.state === 'intro' && !G.caught;   // the tape hasn't caught yet: only the deck, nothing from the beach
  if (G.audio.enabled) {
    G.audio.update(G.tau, ctx.sound ? tauRate : 0, dt);
    G.audio.vcrTape(G.state === 'ff' ? 1.7 : G.state === 'ending' ? 1.35 : G.state === 'paused' ? 1 : 1, G.state === 'ff' || G.state === 'ending' ? 0.7 : G.state === 'paused' ? 0.5 : 0.3);
    G.audio.musicTape(Math.abs(tauRate) > 1.3 ? Math.min(2, Math.abs(tauRate) * 0.6) : 1, Math.min(1, G.shake || 0));
    if (ctx.sound) worldSounds(S, G.tau, L, G.body, G.audio, G.pb);
    if (!quiet) machineSounds(S, G.tau, L, G.audio); else if (G.audio.engines) G.audio.engines([], L);
  }
  if (G.state === 'play' && G.stateT > 2.2) { // brief grace after taking a body
    // Call of Duty-style health: no bar, a short invulnerability blink after each bullet, no one-shots from
    // healthy, and fast regeneration once you've been out of fire for a few seconds
    for (const h of ev.playerHits) {
      let dmg = h.dmg;
      if (h.bullet && G.real - (p.lastBullet || -9) < 0.4) dmg *= 0.3;
      if (h.bullet) p.lastBullet = G.real;
      if (h.bullet && p.health > 45 && p.health - dmg <= 0) dmg = p.health - 6; // a burst can drop you, a single round can't
      p.health -= dmg; p.lastHit = G.real; G.damageFx = Math.min(1, G.damageFx + 0.25 + dmg / 80); damageDir(h.fromX, h.fromZ);
      p.shake = Math.max(p.shake, 0.25 + dmg / 120);
      if (G.audio.enabled) G.audio.hurt(dmg);
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
    G.audio.setLoop('drone', !quiet && ev.nearestDrone < 150 ? Math.min(0.5, 12 / (ev.nearestDrone + 4)) : 0, 1);
    G.audio.setLoop('fire', !quiet && ev.wrecks.length ? 0.06 : 0);
    G.audio.setLoop('battle', quiet ? 0 : G.state === 'end' || G.state === 'title' ? 0.05 : 0.2, tauRate > 1 ? 1.4 : 1);
    G.audio.setLoop('sea', quiet ? 0 : G.sceneId === 'sandwich' ? 0.04 : 0.22);
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
    $('ident').innerHTML = `<span class="side">${st.side ? 'TEXAS' : 'CAPE COD'}</span>${short(G.body)}`;
    $('hp').firstChild.style.width = Math.max(0, p.health) + '%';
    $('ammo').innerHTML = `<div class="wn">${p.weaponName}</div>` + (p.reload > 0 ? 'RELOAD' : `${p.ammo}<small> / ${p.mag}</small>`);
    $('lives').textContent = `PERSPECTIVES ${G.lives.length}  ·  HOME IN ${fmtCounter(Math.max(0, G.tau - st.spawn)).slice(2)}`;
    const moving = Math.hypot(p.vel.x, p.vel.z) / 5;
    setCross(0.022 * (1 - p.ads) + moving * 0.012 + p.recoil * 0.2, p.ads < 0.6);
  }
  if (G.state !== 'play') $('warn').style.opacity = 0;

  // camera fov for ADS
  if (G.state === 'play') { const f = 74 - p.ads * (74 - (p.gun.userData.adsFov || 52)); if (Math.abs(camera.fov - f) > 0.05) { camera.fov = f; camera.updateProjectionMatrix(); } }

  // post
  G.flash *= Math.exp(-dt * 3.5); G.damageFx *= Math.exp(-dt * 2.2);
  const lowHp = G.state === 'play' ? Math.pow(Math.max(0, 1 - p.health / 70), 1.3) * 0.85 : 0;
  if (G.audio.enabled) G.audio.setLoop('heart', G.state === 'play' ? Math.max(0, 1 - p.health / 55) * 0.9 : 0), G.audio.setLoop('breath', G.state === 'play' ? Math.max(0, 1 - p.health / 65) * 0.5 : 0);
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
  $('quit').onclick = () => { overlay('', 'hidden'); useScene('beach'); showTitle(); G.tau = G.S.T_START; };
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
  if (G.sceneId === 'sandwich') return endingCam4(st);
  const S = G.S, pos = new THREE.Vector3(), q = new THREE.Quaternion();
  if (st.side === 0) {
    const h = S.L.helos[st.helo]; const hp = heloPose(h, G.tau, {});
    const sideSign = st.ident && (st.id % 2) ? 1 : -1;
    // sitting in the open cabin door, legs out: looking out and forward at the beach as the aircraft backs away from it
    const hq = new THREE.Quaternion().setFromEuler(new THREE.Euler(hp.pitch, hp.yaw, 0, 'YXZ'));
    const sway = Math.sin(G.real * 1.3) * 0.02;
    const local = new THREE.Vector3(sideSign * 1.26, 1.92 + sway, 1.15).applyQuaternion(hq);
    pos.set(hp.x, hp.y, hp.z).add(local);
    const a = 0.8;   // turned toward the nose: the way the beach is
    q.copy(hq).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.5, sideSign > 0 ? -Math.PI / 2 - a : Math.PI / 2 + a, 0, 'YXZ')));
  } else {
    const v = S.L.vehicles[st.veh]; const z = vehZ(v, G.tau);
    if (v.type === 'aav') { pos.set(v.x + 2.5, heightAt(v.x, z) + 5.5, z + 9); }
    else { pos.set(v.x + 1.2, Math.max(heightAt(v.x, z), 0) + 3.2, z + 3); }
    const m = new THREE.Matrix4().lookAt(pos, new THREE.Vector3(v.x, 3, z - 60), new THREE.Vector3(0, 1, 0));
    q.setFromRotationMatrix(m);
  }
  return { pos, q };
}
