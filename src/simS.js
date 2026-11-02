// The Night Before, simulated forward and played backwards. Forward:
//   2 s     the first of the company comes down into the well deck to load the AAVs for the morning
//   10 s    a helicopter in low over the stern; 19–27 s a Cape Cod boarding team on the ropes onto the flight deck
//   31 s    a gunner by the island hits it leaving; it rolls off the bow into the sea
//   47 s    a rocket into a parked tiltrotor; 57–60 s the destroyer on the starboard beam is hit, and its
//           magazine goes: it breaks in two and goes down
//   88 s    four of the boarders find the stair and go down to the boats; 124 s an AAV burns
//   140 s+  the company loads up through the rear ramps. You're the last one in.
import { mulberry32, clamp, lerp } from './rng.js';
import { heightFast as heightAt, heightAt as heightExact } from './terrain.js';
import { buildShipLayout, ST } from './layoutS.js';
import { HULL, WELL, STAIR } from './terrainS.js';
import { heloPose } from './layout.js';
import { makeIdentity } from './names.js';
import { Obstacles } from './obstacles.js';
import { makeNav } from './navgrid.js';
import { styleOf, gaitStride } from './gait.js';
import { computeDestruction } from './destruction.js';
import { DT, HZ, T_SIM, F, MODE, SHOT_F, BULLET_SPEED } from './sim.js';

export function simulateShip(seed = 11, opts = {}) {
  const r = mulberry32(seed), L = buildShipLayout(), O = new Obstacles(L), A = L.ARENA, D = HULL.deck;
  let curT = 0;
  const actors = [];
  const base = (side, o) => Object.assign({ id: actors.length, side, alive: true, hp: 100, x: 0, y: D, z: 0, yaw: 0, pitch: 0, crouch: 0, crouchT: 0, speed: 0, phase: r() * 6, mode: MODE.HIDDEN, state: 'wait', target: -1, retarget: 0,
    burst: 0, nextShot: 0, pauseUntil: 0, mag: 30, reloadUntil: 0, reloads: [], deathTime: -1, fallSign: -1, killer: -1, cause: '', hitFlinch: -9, speedRun: 4.2 + r() * 0.6, mg: false, level: 'deck' }, o);
  // ---------- Texans: the company in the well deck (you among them); the deck crew and the marines on deck ----------
  const well = [];
  for (let k = 0; k < 14; k++) { const a = base(1, { role: 'well', k, level: 'well', spawn: ST.come + k * 0.55, aav: k % 4 }); a.x = L.wellDoor.x; a.z = L.wellDoor.z + ((k % 3) - 1) * 0.8; a.y = WELL.floor; a.mg = k === 5; actors.push(a); well.push(a); }
  const me = well[13]; me.me = true; me.hp = 1e9; me.aav = 0;
  for (let k = 0; k < 12; k++) { const d = L.islandDoors[k % 2], a = base(1, { role: 'deck', k, spawn: 1 + k * 0.6 + r(), from: { x: d.x, z: d.z } }); a.x = d.x; a.z = d.z; a.mg = k % 4 === 0; actors.push(a); }
  // ---------- Cape Cod: ten on two ropes ----------
  const H = L.helos[0], team = [];
  for (let k = 0; k < 10; k++) { const t0 = ST.ropes + Math.floor(k / 2) * 1.35 + (k % 2) * 0.5, a = base(0, { role: 'board', k, rope: k % 2 ? 1 : -1, spawn: t0, tIn: t0, tOut: t0 + 2.4, stairs: k < 4 }); a.mg = k === 6; actors.push(a); team.push(a); }
  actors.forEach((a) => { a.id_ = makeIdentity(a.side, a.id + 9000); });
  if (opts.ident) me.id_ = opts.ident;

  // ---------- ordnance ----------
  const explosions = [], ex = (o) => explosions.push(Object.assign({ done: false, big: 1, side: 0, sy: 30 }, o));
  { const E = L.escort; for (let k = 0; k < 2; k++) ex({ launchT: E.hit - 3 + k * 0.6, t: E.hit + k * 0.6, sx: E.x - 1600, sy: 8, sz: E.z + 900, ix: E.x + (k - 0.5) * 30, iy: 6, iz: E.z - 6, kind: 'rocket', big: 3, side: 0, far: true });
    ex({ launchT: E.hit, t: E.blast, sx: E.x, sy: 0, sz: E.z, ix: E.x + 8, iy: 4, iz: E.z, kind: 'crash', big: 6, side: 0, persist: true, far: true }); }
  { const c = L.craft[1]; ex({ launchT: c.burnT - 0.8, t: c.burnT, sx: c.x + 60, sy: D + 1.6, sz: c.z + 8, ix: c.x, iy: D + 2.5, iz: c.z, kind: 'rocket', big: 1.6, side: 0 }); ex({ launchT: c.burnT, t: c.burnT + 0.3, sx: c.x, sy: 0, sz: c.z, ix: c.x, iy: D + 1, iz: c.z, kind: 'crash', big: 1.3, side: 0, persist: true }); }
  { const a = L.aavs[3]; ex({ launchT: a.burnT - 1, t: a.burnT, sx: a.x, sy: 0, sz: a.z, ix: a.x, iy: WELL.floor + 1.5, iz: a.z, kind: 'crash', big: 1.4, side: 0, persist: true }); }
  // the helicopter going into the sea
  { let t = ST.heloHit, p = {}; for (; t < T_SIM; t += 0.05) { heloPose(H, t, p); if (p.y < 0.5) break; } ex({ launchT: t - 0.5, t, sx: p.x, sy: 0, sz: p.z, ix: p.x, iy: 0.5, iz: p.z, kind: 'crash', big: 2.2, side: 1, persist: true, sea: true }); }
  explosions.sort((p, q) => p.t - q.t);
  const DD = computeDestruction(L, explosions); O.setDestruction(DD);
  const navDeck = makeNav(O, A, { y: D, walkable: (x, z) => heightExact(x, z) > -10 && !(x > STAIR.x0 - 0.5 && x < STAIR.x0 + 12.5 && z > STAIR.z0 - 0.4 && z < STAIR.z1 + 0.4) && !(Math.abs(z) > HULL.hz - 1.5) });
  const navWell = makeNav(O, A, { y: WELL.floor, walkable: (x, z) => x > WELL.x0 + 0.4 && x < WELL.x1 && Math.abs(z) < WELL.hz - 0.3 });

  const simSteps = Math.round(T_SIM / DT) + 1, steps = Math.round(T_SIM * HZ) + 1, N = actors.length;
  const rec = new Float32Array(N * steps * F), shots = [], pending = [], deaths = [], tgtList = [], taken = new Map();
  let stairsTeam = null;
  for (let s = 0; s < simSteps; s++) {
    const t = s * DT; curT = t;
    for (let i = pending.length - 1; i >= 0; i--) { const h = pending[i]; if (h.t > t) continue; pending.splice(i, 1); const tg = actors[h.target]; if (!tg.alive || tg.state === 'rope') continue; tg.hp -= h.dmg; tg.hitFlinch = t; if (tg.hp <= 0) kill(tg, h.t, h.shooter, h.dx, h.dz, 'shot'); }
    for (const e of explosions) { if (e.done || e.t > t) continue; e.done = true; if (e.far || e.sea) continue;
      for (const a of actors) { if (!a.alive || a.mode !== MODE.GROUND || a.me) continue; if (Math.abs(a.y - e.iy) > 4) continue; const d = Math.hypot(a.x - e.ix, a.z - e.iz); if (d < 2.6 * e.big) kill(a, e.t, -1, a.x - e.ix, a.z - e.iz, e.kind); } }
    for (const a of actors) { if (!a.alive) { a.speed = 0; continue; } update(a, t); a.crouch += clamp(a.crouchT - a.crouch, -4 * DT, 4 * DT); }
    heloGunner(t);
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
    const nav = a.level === 'well' ? navWell : navDeck, key = Math.round(tx) * 1000 + Math.round(tz) + (a.level === 'well' ? 0.5 : 0);
    if (!a.path || a.pathKey !== key) { a.path = nav.findPath(a.x, a.z, tx, tz); a.pathKey = key; a.pathI = 0; }
    const p = a.path[Math.min(a.pathI, a.path.length - 1)];
    const done = moveTo(a, p.x, p.z, speed); ground(a); advance(a);
    if (done || Math.hypot(p.x - a.x, p.z - a.z) < 0.5) { if (a.pathI >= a.path.length - 1) return true; a.pathI++; }
    if (a.stuck > 0.8) { a.path = null; a.stuck = 0; }
    return false;
  }
  function cover(a, near, maxD = 50) {
    let best = -1, bd = 1e9;
    L.positions.forEach((p, i) => { if ((a.level === 'well') !== !!p.well) return; if (taken.has(i) && taken.get(i) !== a.id) return; const d = Math.hypot(p.x - near.x, p.z - near.z) + r() * 5; if (d < bd && d < maxD) { bd = d; best = i; } });
    if (a.cov != null && taken.get(a.cov) === a.id) taken.delete(a.cov);
    if (best >= 0) taken.set(best, a.id); a.cov = best; return best >= 0 ? L.positions[best] : near;
  }
  function fight(a, t, spot) { if (go(a, spot.x, spot.z, a.speedRun)) { a.speed = 0; a.crouchT = a.burst > 0 ? 0.3 : 0.9; combat(a, t); } else { a.crouchT = 0.25; } }
  function update(a, t) {
    if (t < a.spawn) { a.mode = MODE.HIDDEN; if (a.role === 'board') onRope(a, a.spawn); return; }
    a.mode = MODE.GROUND;
    if (a.role === 'board') {
      if (t < a.tOut) { a.state = 'rope'; onRope(a, t); return; }
      if (a.state === 'rope') { a.state = 'deck'; a.y = D; }
      if (!stairsTeam && t >= ST.stairs) stairsTeam = new Set(team.filter((b) => b.alive).slice(0, 4).map((b) => b.id));
      if (stairsTeam && stairsTeam.has(a.id) && (a.level === 'deck' || a.state === 'down')) {   // down the stair to the boats
        if (a.state !== 'down') { if (go(a, L.stairTop.x, L.stairTop.z, a.speedRun)) a.state = 'down'; a.crouchT = 0.3; return; }
        const step = L.steps.find((st) => st.x > a.x + 0.05 && st.x < a.x + 3) || null;
        if (a.x >= STAIR.x1 - 1.05) a.bottom = true;
        if (!a.bottom) { moveTo(a, Math.min(STAIR.x1 - 0.8, a.x + 3), (STAIR.z0 + STAIR.z1) / 2, 2.6); a.y = Math.max(WELL.floor, O.surfaceY(a.x, a.z, a.y + 0.45, curT)); advance(a); a.crouchT = 0.15; void step; return; }
        moveTo(a, L.stairBot.x, L.stairBot.z, 2.6); ground(a); advance(a); if (Math.hypot(a.x - L.stairBot.x, a.z - L.stairBot.z) < 0.6) { a.level = 'well'; a.state = 'well'; a.path = null; a.spot = null; } return;
      }
      if (!a.spot || t > a.reSpot) { const goal = a.level === 'well' ? { x: 118, z: (a.k % 2 ? 1 : -1) * 5 } : t < 60 ? { x: 10 + (a.k % 5) * 8, z: -3 + (a.k % 3) * 3 } : { x: 40 + (a.k % 4) * 10, z: 4 }; a.spot = cover(a, goal, 45); a.reSpot = t + 12 + r() * 10; }
      fight(a, t, a.spot); return;
    }
    if (a.role === 'deck') {
      if (!a.spot || t > a.reSpot) { const goal = t < ST.hover ? { x: -20 + a.k * 9, z: 0 } : { x: 10 + (r() - 0.5) * 60, z: (r() - 0.5) * 10 }; a.spot = cover(a, goal, 50); a.reSpot = t + 15 + r() * 15; }
      fight(a, t, a.spot); return;
    }
    // the company in the well deck
    const boardAt = ST.board + a.k * 0.75 + (a.me ? 4 : 0);
    if (a.state === 'gone') { a.mode = MODE.HIDDEN; return; }
    if (t >= boardAt) {
      const v = L.aavs[a.aav].burnT > 0 && t > L.aavs[a.aav].burnT ? L.aavs[(a.aav + 1) % 3] : L.aavs[a.aav];
      if (go(a, v.ramp.x + 0.8, v.ramp.z, a.speedRun)) { a.state = 'gone'; a.boardT = t; a.x = v.x; a.z = v.z; }
      a.crouchT = 0.2; return;
    }
    if (t < ST.hover + 4) { a.state = 'mill'; const v = L.aavs[a.aav]; if (go(a, v.ramp.x + 1.6 + (a.k % 3) * 0.9, v.ramp.z + ((a.k % 2) - 0.5) * 2.2, 1.5)) { a.speed = 0; turn(a, -Math.PI / 2, 2); } a.crouchT = 0; return; }
    if (!a.spot || t > a.reSpot) { a.spot = cover(a, { x: 104 + (a.k % 4) * 8, z: (a.k % 2 ? 1 : -1) * 4 }, 40); a.reSpot = t + 14 + r() * 12; }
    fight(a, t, a.spot);
  }
  function onRope(a, t) {   // sliding down the rope from the helicopter's door to the deck
    const hp = heloPose(H, Math.min(t, a.tOut), {}), u = clamp((t - a.tIn) / (a.tOut - a.tIn), 0, 1);
    a.x = hp.x + 0.4; a.z = hp.z + a.rope * 1.7; a.y = lerp(hp.y - 1.2, D, u * u); a.yaw = -Math.PI / 2 + a.rope * 0.4; a.crouch = a.crouchT = 0.1; a.speed = 0;
  }
  // the gunner by the island who hits the helicopter as it pulls away
  function heloGunner(t) {
    if (t < ST.leave - 1 || t > ST.heloHit + 0.3) return;
    const g = actors.find((b) => b.role === 'deck' && b.mg && b.alive); if (!g || ((t * 20) | 0) % 2) return;
    const hp = heloPose(H, t + 0.15, {}), mx = g.x, my = g.y + 1.3, mz = g.z, hit = t > ST.heloHit - 1.2;
    const ix = hp.x + (hit ? 0 : (r() - 0.5) * 8), iy = hp.y + 1 + (hit ? 0 : (r() - 0.5) * 5), iz = hp.z + (hit ? 0 : (r() - 0.5) * 8);
    shots.push({ fireT: t, impT: t + Math.hypot(ix - mx, iy - my, iz - mz) / BULLET_SPEED, fx: mx, fy: my, fz: mz, ix, iy, iz, shooter: g.id, target: -1, kind: hit ? 4 : 1 });
    turn(g, Math.atan2(ix - g.x, iz - g.z), 8);
  }
  function combat(a, t) {
    if (t >= a.retarget) {
      a.retarget = t + 0.6 + r() * 0.7; tgtList.length = 0;
      for (const b of actors) { if (b.side === a.side || !b.alive || b.mode !== MODE.GROUND || b.state === 'rope' || b.state === 'gone' || Math.abs(b.y - a.y) > 6) continue; const d = Math.hypot(b.x - a.x, b.z - a.z); if (d < 120) tgtList.push([d, b.id]); }
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
    const hitP = (a.side === 0 ? 0.07 : 0.02) * clamp(25 / dh, 0.15, 1.3) * (b.crouch > 0.6 ? 0.35 : 0.85) * (b.me ? 0 : 1);
    if (r() < hitP) { shot.ix = b.x; shot.iy = aimY; shot.iz = b.z; shot.kind = 3; shot.target = b.id; shot.impT = tf + Math.hypot(shot.ix - mx, shot.iy - my, shot.iz - mz) / BULLET_SPEED; pending.push({ t: shot.impT, target: b.id, dmg: 34 + r() * 50, shooter: a.id, dx, dz }); }
    else { const k = 1.1 + r() * 0.4; shot.ix = mx + (b.x + (r() - 0.5) * 1.6 - mx) * k; shot.iz = mz + (b.z + (r() - 0.5) * 1.6 - mz) * k; shot.iy = Math.max(b.y + 0.05, my + (aimY + (r() - 0.5) * 0.8 - my) * k); shot.kind = 1; shot.impT = tf + Math.hypot(shot.ix - mx, shot.iy - my, shot.iz - mz) / BULLET_SPEED; }
    shots.push(shot);
    a.burst--; a.mag--; a.nextShot = tf + (a.mg ? 0.075 : 0.09 + r() * 0.06);
    if (a.burst <= 0) a.pauseUntil = t + 0.6 + r() * 1.8;
    if (a.mag <= 0) { a.reloadUntil = t + 2.6; a.mag = 30; a.burst = 0; a.reloads.push(t); }
  }

  shots.sort((p, q) => p.fireT - q.fireT);
  const S = new Float32Array(shots.length * SHOT_F);
  shots.forEach((s, i) => { const o = i * SHOT_F; S[o] = s.fireT; S[o + 1] = s.impT; S[o + 2] = s.fx; S[o + 3] = s.fy; S[o + 4] = s.fz; S[o + 5] = s.ix; S[o + 6] = s.iy; S[o + 7] = s.iz; S[o + 8] = s.shooter; S[o + 9] = s.target; S[o + 10] = s.kind; });
  const byImpact = Uint32Array.from(shots.map((_, i) => i).sort((p, q) => S[p * SHOT_F + 1] - S[q * SHOT_F + 1]));
  const T_START = Math.min((me.boardT || ST.board + 12) - 0.6, T_SIM - 0.1);
  const statics = actors.map((a) => ({
    id: a.id, side: a.side, spawn: a.spawn, deathTime: a.deathTime, fallSign: a.fallSign, killer: a.killer, cause: a.cause, veh: -1, helo: -1, mg: a.mg, te: 0, ident: a.id_,
    reloads: Float32Array.from(a.reloads), skin: a.me && opts.skin != null ? opts.skin : r(), role: a.role, rope: a.role === 'board', tIn: a.tIn ?? -1, tOut: a.tOut ?? 1e9, boardT: a.boardT ?? -1, from: a.from || null, aav: a.aav ?? -1, house: -1,
  }));
  return { scene: 'ship', L, N, steps, rec, obstacles: O, destruction: DD, missiles: [], shots: S, nShots: shots.length, byImpact, explosions, deaths, actors: statics, startId: me.id, T_START };
}
