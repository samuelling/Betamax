// The Port, simulated forward and played backwards. Night. Forward:
//   2 s     two buses through the gate: a company of Texans going aboard tonight
//   9 s     the AA trucks open up at the sound of engines; 16–26 s Cape Cod paratroopers in the sky over the lot
//   ~48 s   they're down among the AAVs, shedding harnesses, and they go for the guns and then the quay
//   62 s    cruise missiles into the grain elevator: 40 m of concrete bins come down across the wharf
//   79 s    a crane goes over into the channel; 109 s the port authority tower is dropped
//   138 s+  the Texans fight their way up the gangway and into the ship. You're the last one in.
import { mulberry32, clamp, lerp } from './rng.js';
import { heightFast as heightAt } from './terrain.js';
import { buildPortLayout, PT } from './layoutP.js';
import { QUAY_Z, DECK } from './terrainP.js';
import { makeIdentity } from './names.js';
import { Obstacles } from './obstacles.js';
import { makeNav } from './navgrid.js';
import { styleOf, gaitStride } from './gait.js';
import { computeDestruction } from './destruction.js';
import { DT, HZ, T_SIM, F, MODE, SHOT_F, BULLET_SPEED } from './sim.js';

export function simulatePort(seed = 7, opts = {}) {
  const r = mulberry32(seed), L = buildPortLayout(), O = new Obstacles(L), A = L.ARENA;
  let curT = 0;
  const actors = [];
  const base = (side, o) => Object.assign({ id: actors.length, side, alive: true, hp: 100, x: 0, y: DECK, z: 0, yaw: 0, pitch: 0, crouch: 0, crouchT: 0, speed: 0, phase: r() * 6, mode: MODE.HIDDEN, state: 'wait', target: -1, retarget: 0,
    burst: 0, nextShot: 0, pauseUntil: 0, mag: 30, reloadUntil: 0, reloads: [], deathTime: -1, fallSign: -1, killer: -1, cause: '', hitFlinch: -9, speedRun: 4.3 + r() * 0.6, mg: false }, o);
  // ---------- Texans: the two busloads going aboard; the port's defenders; the AA crews ----------
  const bus = [];
  L.buses.forEach((b, bi) => { for (let k = 0; k < 8; k++) { const a = base(1, { role: 'embark', bus: bi, k, spawn: PT.bus + bi * 1.4 + k * 0.45 }); a.x = b.x + Math.cos(b.rot) * 1.8 * (bi ? -1 : 1); a.z = b.z + (k - 4) * 0.4; a.mg = k === 3; actors.push(a); bus.push(a); } });
  const me = bus[7]; me.me = true; me.hp = 1e9;
  const doorsOf = [[30, -25 - 16], [30, 30 - 14], [-40, -140 + 12]];   // shed and tower doors the defenders come out of
  for (let k = 0; k < 14; k++) { const d = doorsOf[k % 3], a = base(1, { role: 'def', spawn: 3 + r() * 9, from: { x: d[0] + (r() - 0.5) * 16, z: d[1] } }); a.x = a.from.x; a.z = a.from.z; a.mg = k % 5 === 0; actors.push(a); }
  const crews = [];
  L.aa.forEach((g, gi) => { for (let k = 0; k < 2; k++) { const a = base(1, { role: 'aa', gun: gi, spawn: 0.5 + r() * 0.5 }); const sd = k ? 1 : -1; a.x = g.x + Math.cos(g.rot) * 1.6 * sd; a.z = g.z - Math.sin(g.rot) * 1.6 * sd; actors.push(a); crews.push(a); } });
  // ---------- Cape Cod: four sticks of six under canopy ----------
  const paras = [];
  for (let k = 0; k < 24; k++) {
    const stick = k % 4, j = Math.floor(k / 4), t0 = PT.drop0 + stick * 2.5 + j * 0.9 + r() * 0.4;
    const lx = lerp(L.dz.x1, L.dz.x0, (stick + 0.5) / 4) + (r() - 0.5) * 16, lz = lerp(L.dz.z0, L.dz.z1, (j + 0.5) / 6) + (r() - 0.5) * 10;
    const fall = 28 + r() * 4, drift = { x: 0.9 + r() * 0.5, z: 0.3 + r() * 0.3 };   // the wind off the bay
    const a = base(0, { role: 'para', stick, spawn: t0, tIn: t0, tOut: t0 + fall, land: { x: lx, z: lz }, drift, alt: 190, squad: stick });
    a.mg = j === 2; actors.push(a); paras.push(a);
  }
  actors.forEach((a) => { a.id_ = makeIdentity(a.side, a.id + 7000); });
  if (opts.ident) me.id_ = opts.ident;

  // ---------- ordnance ----------
  const explosions = [], ex = (o) => explosions.push(Object.assign({ done: false, big: 1, side: 0, sy: 30 }, o));
  for (const m of L.megas) { if (m.T > 1e5) continue;
    const c = Math.cos(m.rot), sn = Math.sin(m.rot), n = m.crane ? 1 : 3;
    for (let k = 0; k < n; k++) { const lx = (k - (n - 1) / 2) * m.w * 0.3, ix = m.x + lx * c, iz = m.z - lx * sn;
      ex({ launchT: m.T - 2.6 + k * 0.2, t: m.T - 0.4 + k * 0.2, sx: ix + 380, sy: 120, sz: iz - 520, ix, iy: m.y + (m.crane ? 30 : 6 + k * 4), iz, kind: 'rocket', big: 3, side: 0 });
      ex({ launchT: m.T, t: m.T + 1.5 + k * 0.6, sx: ix, sy: 0, sz: iz, ix, iy: m.y + 1, iz, kind: 'crash', big: m.crane ? 1 : 2, side: 0, persist: true }); } }
  // the AA trucks, one by one, from the paratroopers' rockets
  L.aa.forEach((g, gi) => { const t = 86 + gi * 8.5 + r() * 3, sx = g.x + 60 * Math.cos(gi * 2.1), sz = g.z - 40 - 30 * Math.sin(gi * 1.7);
    ex({ launchT: t - 0.9, t, sx, sy: DECK + 1.4, sz, ix: g.x, iy: DECK + 1, iz: g.z, kind: 'rocket', big: 1.5, side: 0, car: gi, aaGun: gi }); });
  explosions.sort((p, q) => p.t - q.t);
  const D = computeDestruction(L, explosions); O.setDestruction(D);
  const nav = makeNav(O, A, { walkable: (x, z) => z < QUAY_Z - 0.6 });

  const simSteps = Math.round(T_SIM / DT) + 1, steps = Math.round(T_SIM * HZ) + 1, N = actors.length;
  const rec = new Float32Array(N * steps * F), shots = [], pending = [], deaths = [], tgtList = [];
  const taken = new Map(), GANG = { x: 0.5, z: QUAY_Z - 0.6 };
  for (let s = 0; s < simSteps; s++) {
    const t = s * DT; curT = t;
    for (let i = pending.length - 1; i >= 0; i--) { const h = pending[i]; if (h.t > t) continue; pending.splice(i, 1); const tg = actors[h.target]; if (!tg.alive || tg.state === 'air') continue; tg.hp -= h.dmg; tg.hitFlinch = t; if (tg.hp <= 0) kill(tg, h.t, h.shooter, h.dx, h.dz, 'shot'); }
    for (const e of explosions) { if (e.done || e.t > t) continue; e.done = true;
      for (const a of actors) { if (!a.alive || a.mode !== MODE.GROUND || a.me || a.state === 'air') continue; const d = Math.hypot(a.x - e.ix, a.z - e.iz); if (d < 2.6 * e.big) kill(a, e.t, -1, a.x - e.ix, a.z - e.iz, e.kind); }
      if (e.aaGun != null) L.aa[e.aaGun].deadT = e.t; }
    for (const a of actors) { if (!a.alive) { a.speed = 0; continue; } update(a, t); a.crouch += clamp(a.crouchT - a.crouch, -4 * DT, 4 * DT); }
    aaGuns(t);
    if (s % 2 === 0) for (let i = 0; i < N; i++) { const a = actors[i], o = (i * steps + s / 2) * F; rec[o] = a.x; rec[o + 1] = a.y; rec[o + 2] = a.z; rec[o + 3] = a.yaw; rec[o + 4] = a.pitch; rec[o + 5] = a.crouch; rec[o + 6] = a.speed; rec[o + 7] = a.phase; rec[o + 8] = a.alive ? a.mode : MODE.DEAD; }
  }

  function kill(a, t, killer, dx, dz, cause) { a.alive = false; a.deathTime = t; a.killer = killer; a.cause = cause; a.fallSign = (Math.sin(a.yaw) * dx + Math.cos(a.yaw) * dz) > 0 ? 1 : -1; a.mode = MODE.DEAD; deaths.push({ id: a.id, t, killer, cause }); }
  function turn(a, want, rate) { let d = want - a.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; a.yaw += clamp(d, -rate * DT, rate * DT); }
  function ground(a) { a.y = O.surfaceY(a.x, a.z, a.y + 0.4, curT); }
  function advance(a) { const stride = gaitStride(styleOf(a.id, a.mg), a.speed, a.crouch, a.hitFlinch > 0); a.phase += (a.speed * DT / stride) * Math.PI * 2; }
  function moveTo(a, tx, tz, speed) {
    const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz), st = speed * DT;
    if (d <= st) { a.x = tx; a.z = tz; a.speed = d / DT; return true; }
    const ox = a.x, oz = a.z; let nx = a.x + dx / d * st, nz = a.z + dz / d * st;
    [nx, nz] = O.pushOut(nx, nz, 0.32, a.y, curT, -1);
    a.x = nx; a.z = nz; a.speed = Math.hypot(nx - ox, nz - oz) / DT; a.stuck = a.speed < speed * 0.3 ? (a.stuck || 0) + DT : 0;
    if (a.speed > 0.2) turn(a, Math.atan2(nx - ox, nz - oz), 6);
    return false;
  }
  function go(a, tx, tz, speed) {
    const key = Math.round(tx) * 1000 + Math.round(tz);
    if (!a.path || a.pathKey !== key) { a.path = nav.findPath(a.x, a.z, tx, tz); a.pathKey = key; a.pathI = 0; }
    const p = a.path[Math.min(a.pathI, a.path.length - 1)];
    const done = moveTo(a, p.x, p.z, speed); ground(a); advance(a);
    if (done || Math.hypot(p.x - a.x, p.z - a.z) < 0.5) { if (a.pathI >= a.path.length - 1) return true; a.pathI++; }
    if (a.stuck > 0.8) { a.path = null; a.stuck = 0; }
    return false;
  }
  function cover(a, near, maxD = 60) {
    let best = -1, bd = 1e9;
    L.positions.forEach((p, i) => { if (taken.has(i) && taken.get(i) !== a.id) return; const d = Math.hypot(p.x - near.x, p.z - near.z) + r() * 6; if (d < bd && d < maxD) { bd = d; best = i; } });
    if (a.cov != null && taken.get(a.cov) === a.id) taken.delete(a.cov);
    if (best >= 0) taken.set(best, a.id); a.cov = best; return best >= 0 ? L.positions[best] : near;
  }
  function fight(a, t, spot) {   // get to the spot, then down behind it shooting
    if (go(a, spot.x, spot.z, a.speedRun)) { a.speed = 0; a.crouchT = a.burst > 0 ? 0.3 : 0.9; combat(a, t); } else { a.crouchT = 0.25; if (r() < 0.02) combat(a, t); }
  }
  function update(a, t) {
    if (t < a.spawn) { a.mode = MODE.HIDDEN; if (a.role === 'para') placeAir(a, a.spawn); return; }
    a.mode = MODE.GROUND;
    if (a.role === 'para') {
      if (t < a.tOut) { a.state = 'air'; placeAir(a, t); a.crouch = a.crouchT = 0; a.speed = 0; a.pitch = -0.3; return; }
      if (a.state === 'air') { a.state = 'shed'; a.shedT = t; a.y = DECK; }
      if (a.state === 'shed') { a.crouchT = 0.8; a.speed = 0; if (t > a.shedT + 3 + r() * 0.1) a.state = 'assault'; combat(a, t); return; }
      // the sticks: two for the guns, two for the quay
      const goal = a.stick < 2 ? (() => { const g = L.aa.find((q, i) => !q.deadT || q.deadT > t) || L.aa[0]; return { x: g.x - 25 + a.id % 3 * 6, z: g.z - 20 }; })() : { x: 40 - a.stick * 30 + (a.id % 4) * 5, z: -70 + (a.id % 3) * 8 };
      if (!a.spot || t > a.reSpot) { a.spot = cover(a, goal, 45); a.reSpot = t + 14 + r() * 10; }
      fight(a, t, a.spot); return;
    }
    if (a.role === 'aa') {   // with the gun: shooting up at the sound, then at the canopies
      const g = L.aa[a.gun]; ground(a); a.crouchT = 0;
      if (g.deadT && t > g.deadT) { if (!a.spot) a.spot = cover(a, { x: g.x, z: g.z }, 40); fight(a, t, a.spot); return; }
      a.speed = 0; turn(a, g.rot + Math.PI, 2); a.pitch = 0.7; return;
    }
    if (a.role === 'def') {
      if (!a.spot || t > a.reSpot) { const near = t < PT.drop0 + 25 ? { x: a.from.x + (r() - 0.5) * 30, z: a.from.z - 25 } : { x: 80 + (r() - 0.5) * 120, z: -70 + (r() - 0.5) * 60 }; a.spot = cover(a, near, 60); a.reSpot = t + 16 + r() * 16; }
      fight(a, t, a.spot); return;
    }
    // embarking: in a column toward the gangway; the attack puts them in cover; at the end they fight their way aboard
    const boardAt = PT.board + a.bus * 4 + a.k * 0.7 + (a.me ? 3 : 0);
    if (a.state === 'gone') { a.mode = MODE.HIDDEN; a.x = L.ship.door.x + 3; a.z = L.ship.door.z + 3; a.y = L.ship.door.y; return; }
    if (t >= boardAt) {
      if (a.state !== 'board') { a.state = 'board'; a.path = null; }
      if (Math.hypot(a.x - GANG.x, a.z - GANG.z) > 1.5 && a.x < GANG.x + 1) { go(a, GANG.x, GANG.z, a.speedRun); a.crouchT = 0.2; return; }
      moveTo(a, L.ship.door.x, L.ship.door.z - 1, 3.2); ground(a); advance(a); a.crouchT = 0; turn(a, Math.PI / 2, 5);
      if (a.x > L.ship.door.x - 0.4) { a.state = 'gone'; a.boardT = t; }
      return;
    }
    if (t < PT.aa + 1.5) { a.state = 'march'; a.crouchT = 0; go(a, -6 + a.bus * 10 + (a.k % 2) * 1.4, -120 + a.k * 1.6, 1.6); return; }
    if (!a.spot || t > a.reSpot) { a.spot = cover(a, { x: 10 + a.bus * 30 + (a.k - 4) * 4, z: -60 + a.k * 3 }, 50); a.reSpot = t + 18 + r() * 14; }
    fight(a, t, a.spot);
  }
  function placeAir(a, t) {   // hanging under the canopy: sliding down the wind to the landing point
    const u = clamp((t - a.tIn) / (a.tOut - a.tIn), 0, 1), left = (a.tOut - t);
    a.x = a.land.x + a.drift.x * left * 1.0 + Math.sin(t * 0.7 + a.id) * 1.2 * (1 - u); a.z = a.land.z + a.drift.z * left; a.y = DECK + a.alt * (1 - u) * (1 - u * 0.15) + Math.max(0, 1 - u) * 0;
    a.yaw = Math.atan2(-a.drift.x, -a.drift.z) + Math.sin(t * 0.4 + a.id) * 0.4;
  }
  // the AA guns: bursts up into the dark, walking onto the canopies once there are any
  function aaGuns(t) {
    L.aa.forEach((g, gi) => {
      if (t < PT.aa || (g.deadT && t > g.deadT)) return;
      const st = g.st || (g.st = { next: PT.aa + gi * 0.7, burst: 0, ax: 0, ay: 0, az: 0 });
      if (t < st.next) return;
      if (st.burst <= 0) { const air = paras.filter((p) => p.state === 'air' && p.alive); if (air.length && r() < 0.8) { const p = air[Math.floor(r() * air.length)]; st.ax = p.x + (r() - 0.5) * 40; st.ay = p.y + 10 + (r() - 0.5) * 50; st.az = p.z + (r() - 0.5) * 40; } else { st.ax = g.x + (r() - 0.5) * 500; st.ay = DECK + 260 + r() * 200; st.az = g.z + (r() - 0.5) * 500; } st.burst = 12 + Math.floor(r() * 18); }
      const mx = g.x, my = DECK + 2.4, mz = g.z, ix = st.ax + (r() - 0.5) * 12, iy = st.ay + (r() - 0.5) * 12, iz = st.az + (r() - 0.5) * 12;
      shots.push({ fireT: t, impT: t + Math.hypot(ix - mx, iy - my, iz - mz) / 900, fx: mx, fy: my, fz: mz, ix, iy, iz, shooter: -300 - gi, target: -1, kind: 1 });
      st.burst--; st.ax += (r() - 0.5) * 6; st.next = st.burst > 0 ? t + 0.07 : t + 1.2 + r() * 2.5;
    });
  }
  function combat(a, t) {
    if (t >= a.retarget) {
      a.retarget = t + 0.6 + r() * 0.7; tgtList.length = 0;
      for (const b of actors) { if (b.side === a.side || !b.alive || b.mode !== MODE.GROUND || b.state === 'air' || b.state === 'gone') continue; const d = Math.hypot(b.x - a.x, b.z - a.z); if (d < 140) tgtList.push([d, b.id]); }
      tgtList.sort((p, q) => p[0] - q[0]); const vis = [];
      for (let k = 0; k < tgtList.length && k < 8 && vis.length < 3; k++) { const b = actors[tgtList[k][1]]; if (O.segment(a.x, a.y + 1.2, a.z, b.x, b.y + 1.1, b.z, t, -1) < 0) vis.push(b.id); }
      a.target = vis.length ? vis[Math.floor(r() * vis.length)] : -1;
    }
    if (a.target < 0) { a.burst = 0; return; }
    const b = actors[a.target]; if (!b.alive) { a.target = -1; a.retarget = t; a.burst = 0; return; }
    const aimY = b.y + lerp(1.3, 0.95, b.crouch), dx = b.x - a.x, dz = b.z - a.z, dh = Math.hypot(dx, dz);
    turn(a, Math.atan2(dx, dz), 5); const my = a.y + lerp(1.45, 0.95, a.crouch); a.pitch = Math.atan2(aimY - my, dh);
    if (t < a.pauseUntil || t < a.reloadUntil) return;
    if (a.burst <= 0) { a.burst = a.mg ? 10 + Math.floor(r() * 12) : 3 + Math.floor(r() * 5); a.nextShot = t + 0.25; return; }
    if (t < a.nextShot) return;
    const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw), mx = a.x + fx * 0.75, mz = a.z + fz * 0.75, tf = Math.min(t, Math.max(t - DT + 1e-3, a.nextShot));
    const shot = { fireT: tf, shooter: a.id, target: -1, fx: mx, fy: my, fz: mz };
    const hitP = (a.side === 0 ? 0.08 : 0.018) * clamp(30 / dh, 0.15, 1.3) * (b.crouch > 0.6 ? 0.35 : 0.85) * (b.me ? 0 : 1);
    if (r() < hitP) { shot.ix = b.x; shot.iy = aimY; shot.iz = b.z; shot.kind = 3; shot.target = b.id; shot.impT = tf + Math.hypot(shot.ix - mx, shot.iy - my, shot.iz - mz) / BULLET_SPEED; pending.push({ t: shot.impT, target: b.id, dmg: 34 + r() * 50, shooter: a.id, dx, dz }); }
    else { const k = 1.1 + r() * 0.4; shot.ix = mx + (b.x + (r() - 0.5) * 1.6 - mx) * k; shot.iz = mz + (b.z + (r() - 0.5) * 1.6 - mz) * k; shot.iy = Math.max(DECK + 0.05, my + (aimY + (r() - 0.5) * 0.8 - my) * k); shot.kind = 1; shot.impT = tf + Math.hypot(shot.ix - mx, shot.iy - my, shot.iz - mz) / BULLET_SPEED; }
    shots.push(shot);
    a.burst--; a.mag--; a.nextShot = tf + (a.mg ? 0.075 : 0.09 + r() * 0.06);
    if (a.burst <= 0) a.pauseUntil = t + 0.6 + r() * 1.8;
    if (a.mag <= 0) { a.reloadUntil = t + 2.6; a.mag = 30; a.burst = 0; a.reloads.push(t); }
  }

  shots.sort((p, q) => p.fireT - q.fireT);
  const S = new Float32Array(shots.length * SHOT_F);
  shots.forEach((s, i) => { const o = i * SHOT_F; S[o] = s.fireT; S[o + 1] = s.impT; S[o + 2] = s.fx; S[o + 3] = s.fy; S[o + 4] = s.fz; S[o + 5] = s.ix; S[o + 6] = s.iy; S[o + 7] = s.iz; S[o + 8] = s.shooter; S[o + 9] = s.target; S[o + 10] = s.kind; });
  const byImpact = Uint32Array.from(shots.map((_, i) => i).sort((p, q) => S[p * SHOT_F + 1] - S[q * SHOT_F + 1]));
  const T_START = Math.min((me.boardT || PT.board + 10) - 0.6, T_SIM - 0.1);
  const statics = actors.map((a) => ({
    id: a.id, side: a.side, spawn: a.spawn, deathTime: a.deathTime, fallSign: a.fallSign, killer: a.killer, cause: a.cause, veh: -1, helo: -1, mg: a.mg, te: 0, ident: a.id_,
    reloads: Float32Array.from(a.reloads), skin: a.me && opts.skin != null ? opts.skin : r(), role: a.role, para: a.role === 'para', tIn: a.tIn ?? -1, tOut: a.tOut ?? 1e9, boardT: a.boardT ?? -1, from: a.from || null, bus: a.bus ?? -1, gun: a.gun ?? -1, house: -1,
  }));
  return { scene: 'port', L, N, steps, rec, obstacles: O, destruction: D, missiles: [], shots: S, nShots: shots.length, byImpact, explosions, deaths, actors: statics, startId: me.id, T_START };
}
