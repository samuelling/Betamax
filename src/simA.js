// Ashland State Park, simulated forward and played backwards. Grey first light, mist on the water. Forward:
//   2 s     eight Cape Cod scouts out of a pickup in the beach lot; down the shore path into the woods
//   0–8 s   in the camps, Texans crawling out of their tents; a sentry on his round; the cook fire
//   44 s    the scouts lie up on the ridge over camp A and watch
//   58 s    a sentry walks into them; the woods go loud. The sleepers come out of the tents shooting
//   92 s    two sappers at the foot of the mast; 104 s it goes over; 111 s the fuel bladder at camp B
//   128 s+  the Texans pull out to the trucks; the scouts break east for the trail to the common. The last of
//           them out of the woods is you — or, on the other side, the last man up into the last truck.
import { mulberry32, clamp, lerp } from './rng.js';
import { heightFast as heightAt } from './terrain.js';
import { buildAshLayout, AT } from './layoutA.js';
import { LOT, CAMPS, TRAILHEAD } from './terrainA.js';
import { makeIdentity } from './names.js';
import { Obstacles } from './obstacles.js';
import { makeNav } from './navgrid.js';
import { styleOf, gaitStride } from './gait.js';
import { computeDestruction } from './destruction.js';
import { DT, HZ, T_SIM, F, MODE, SHOT_F, BULLET_SPEED } from './sim.js';

export function simulateAsh(seed = 13, opts = {}) {
  const r = mulberry32(seed), L = buildAshLayout(), O = new Obstacles(L), A = L.ARENA;
  let curT = 0;
  const actors = [];
  const base = (side, o) => Object.assign({ id: actors.length, side, alive: true, hp: 100, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, crouch: 0, crouchT: 0, speed: 0, phase: r() * 6, mode: MODE.HIDDEN, state: 'wait', target: -1, retarget: 0,
    burst: 0, nextShot: 0, pauseUntil: 0, mag: 30, reloadUntil: 0, reloads: [], deathTime: -1, fallSign: -1, killer: -1, cause: '', hitFlinch: -9, speedRun: 4.2 + r() * 0.6, mg: false }, o);
  // ---------- Cape Cod: eight scouts ----------
  const scouts = [];
  for (let k = 0; k < 8; k++) { const a = base(0, { role: 'scout', k, spawn: AT.drop + k * 0.35, sapper: k === 2 || k === 5 }); a.x = LOT.x - 8 + (k % 2 ? 1.4 : -1.4); a.z = LOT.z + 4 + (k - 4) * 0.5; a.mg = k === 4; actors.push(a); scouts.push(a); }
  // ---------- Texans: the sentries and the early risers; the sleepers who come out at the shooting ----------
  const tex = [];
  L.tents.forEach((t, ti) => { const n = t.camp ? 1 : 2; for (let j = 0; j < n; j++) { const early = (ti + j) % 3 === 0, a = base(1, { role: early ? 'up' : 'sleep', camp: t.camp, tent: ti, spawn: early ? 0.5 + r() * 7 : AT.spotted + 0.6 + r() * 4, from: t.door }); a.x = t.door.x; a.z = t.door.z; a.mg = (ti + j) % 5 === 1; actors.push(a); tex.push(a); } });
  for (let k = 0; k < 2; k++) { const c = CAMPS[k], a = base(1, { role: 'sentry', camp: k, spawn: 0.3, loopR: 28 + k * 6, from: { x: c.x + 28, z: c.z } }); actors.push(a); tex.push(a); }
  const meS = scouts[7], meT = tex.find((a) => a.camp === 1 && a.role === 'up') || tex[0];
  meS.me = meT.me = true; meS.hp = meT.hp = 1e9;
  const me = opts.group === 1 ? meT : meS, other = me === meS ? meT : meS;
  actors.forEach((a) => { a.id_ = makeIdentity(a.side, a.id + 11000); });
  if (opts.ident) me.id_ = opts.ident;

  // ---------- ordnance: the mast, the fuel bladder ----------
  const explosions = [], ex = (o) => explosions.push(Object.assign({ done: false, big: 1, side: 0, sy: 30 }, o));
  for (const m of L.megas) ex({ launchT: m.T - 0.4, t: m.T - 0.1, sx: m.x, sy: 0, sz: m.z, ix: m.x, iy: m.y + 1, iz: m.z, kind: 'shell', big: 1.6, side: 0 });
  { const f = L.fuel, y = heightAt(f.x, f.z); ex({ launchT: f.T - 1, t: f.T, sx: f.x, sy: 0, sz: f.z, ix: f.x, iy: y + 1, iz: f.z, kind: 'crash', big: 3.2, side: 0, persist: true }); }
  explosions.sort((p, q) => p.t - q.t);
  const D = computeDestruction(L, explosions); O.setDestruction(D);
  const nav = makeNav(O, A, {});

  const simSteps = Math.round(T_SIM / DT) + 1, steps = Math.round(T_SIM * HZ) + 1, N = actors.length;
  const rec = new Float32Array(N * steps * F), shots = [], pending = [], deaths = [], tgtList = [], taken = new Map();
  let alarm = false;
  const exitPath = [[CAMPS[0].x + 50, CAMPS[0].z + 40], [40, -60], [110, -66], [160, -60], [TRAILHEAD.x, TRAILHEAD.z]];
  for (let s = 0; s < simSteps; s++) {
    const t = s * DT; curT = t; if (t >= AT.spotted) alarm = true;
    for (let i = pending.length - 1; i >= 0; i--) { const h = pending[i]; if (h.t > t) continue; pending.splice(i, 1); const tg = actors[h.target]; if (!tg.alive) continue; tg.hp -= h.dmg; tg.hitFlinch = t; if (tg.hp <= 0) kill(tg, h.t, h.shooter, h.dx, h.dz, 'shot'); }
    for (const e of explosions) { if (e.done || e.t > t) continue; e.done = true; for (const a of actors) { if (!a.alive || a.mode !== MODE.GROUND || a.me) continue; const d = Math.hypot(a.x - e.ix, a.z - e.iz); if (d < 2.6 * e.big) kill(a, e.t, -1, a.x - e.ix, a.z - e.iz, e.kind); } }
    for (const a of actors) { if (!a.alive) { a.speed = 0; continue; } update(a, t); a.crouch += clamp(a.crouchT - a.crouch, -4 * DT, 4 * DT); }
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
  function follow(a, pts, speed) {   // along a trail, point to point
    a.wi = a.wi || 0; const p = pts[Math.min(a.wi, pts.length - 1)];
    if (go(a, p[0] + (a.id % 3 - 1) * 1.2, p[1] + (a.id % 2) * 1.2, speed)) { if (a.wi >= pts.length - 1) return true; a.wi++; a.path = null; }
    return false;
  }
  function cover(a, near, maxD = 50) {
    let best = -1, bd = 1e9;
    L.positions.forEach((p, i) => { if (taken.has(i) && taken.get(i) !== a.id) return; const d = Math.hypot(p.x - near.x, p.z - near.z) + r() * 6; if (d < bd && d < maxD) { bd = d; best = i; } });
    if (a.cov != null && taken.get(a.cov) === a.id) taken.delete(a.cov);
    if (best >= 0) taken.set(best, a.id); a.cov = best; return best >= 0 ? L.positions[best] : near;
  }
  function fight(a, t, spot) { if (go(a, spot.x, spot.z, a.speedRun)) { a.speed = 0; a.crouchT = a.burst > 0 ? 0.3 : 0.9; combat(a, t); } else { a.crouchT = 0.25; if (r() < 0.03) combat(a, t); } }
  function update(a, t) {
    if (t < a.spawn) { a.mode = MODE.HIDDEN; a.y = heightAt(a.x, a.z); return; }
    a.mode = MODE.GROUND;
    if (a.state === 'gone') { a.mode = MODE.HIDDEN; return; }
    if (a.role === 'scout') {
      if (t > AT.pull + a.k * 1.2 + (a.me ? 4 : 0)) {   // break for the trail out
        if (a.state !== 'out') { a.state = 'out'; a.wi = Math.max(0, exitPath.findIndex((p) => p[0] > a.x + 8)); a.path = null; }   // on from wherever you are, never back
        a.crouchT = 0.15; if (follow(a, exitPath, a.speedRun * 1.05)) { a.state = 'gone'; a.boardT = t; }
        if (r() < 0.05) combat(a, t); return;
      }
      if (!alarm) {
        if (t < AT.op) { a.crouchT = 0.4; if (!a.wi) a.wi = 0; follow(a, L.trails[0].slice(0, 5), 2.8); return; }
        const p = { x: L.op.x + (a.k % 4 - 1.5) * 4, z: L.op.z + Math.floor(a.k / 4) * 4 }; if (go(a, p.x, p.z, 1.4)) { a.speed = 0; a.crouchT = 1; turn(a, Math.atan2(CAMPS[0].x - a.x, CAMPS[0].z - a.z), 2); } else a.crouchT = 0.6; return;
      }
      if (a.sapper && t > AT.charges - 10 && t < AT.mast - 2) { const m = L.megas[0]; if (go(a, m.x + 2.5 * (a.k === 2 ? 1 : -1), m.z + 2, a.speedRun)) { a.speed = 0; a.crouchT = 1; turn(a, Math.atan2(m.x - a.x, m.z - a.z), 4); } else a.crouchT = 0.3; return; }
      if (!a.spot || t > a.reSpot) { const goal = t < AT.mast ? { x: CAMPS[0].x + 28, z: CAMPS[0].z + 22 } : { x: CAMPS[1].x + 34, z: CAMPS[1].z + 30 }; a.spot = cover(a, { x: goal.x + (r() - 0.5) * 20, z: goal.z + (r() - 0.5) * 20 }, 50); a.reSpot = t + 14 + r() * 12; }
      fight(a, t, a.spot); return;
    }
    // Texans
    if (t > AT.pull + 4 + (a.me ? 10 : 0) && (a.camp === 1 || t > AT.pull + 8)) {   // to the trucks
      const tr = L.trucks[(a.id % 3)]; if (go(a, tr.x - Math.sin(tr.rot) * 3.4, tr.z - Math.cos(tr.rot) * 3.4, a.speedRun)) { a.state = 'gone'; a.boardT = t; } a.crouchT = 0.2; return;
    }
    if (a.role === 'sentry' && !alarm) { const c = CAMPS[a.camp], ang = t * 0.045 + a.camp * 2; go(a, c.x + Math.cos(ang) * a.loopR, c.z + Math.sin(ang) * a.loopR, 1.2); a.crouchT = 0; return; }
    if (a.role === 'up' && !alarm) { const c = CAMPS[a.camp]; if (go(a, c.x + Math.cos(a.id) * 4, c.z + Math.sin(a.id) * 4, 1.1)) { a.speed = 0; turn(a, Math.atan2(c.x - a.x, c.z - a.z), 1); } a.crouchT = 0; return; }
    if (!a.spot || t > a.reSpot) { const c = CAMPS[a.camp]; a.spot = cover(a, { x: c.x + 20 + (r() - 0.5) * 30, z: c.z + 20 + (r() - 0.5) * 30 }, 45); a.reSpot = t + 16 + r() * 12; }
    fight(a, t, a.spot);
  }
  function combat(a, t) {
    if (!alarm) return;
    if (t >= a.retarget) {
      a.retarget = t + 0.6 + r() * 0.7; tgtList.length = 0;
      for (const b of actors) { if (b.side === a.side || !b.alive || b.mode !== MODE.GROUND || b.state === 'gone') continue; const d = Math.hypot(b.x - a.x, b.z - a.z); if (d < 110) tgtList.push([d, b.id]); }
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
    const hitP = (a.side === 0 ? 0.075 : 0.02) * clamp(25 / dh, 0.15, 1.3) * (b.crouch > 0.6 ? 0.35 : 0.85) * (b.me ? 0 : 1);
    if (r() < hitP) { shot.ix = b.x; shot.iy = aimY; shot.iz = b.z; shot.kind = 3; shot.target = b.id; shot.impT = tf + Math.hypot(shot.ix - mx, shot.iy - my, shot.iz - mz) / BULLET_SPEED; pending.push({ t: shot.impT, target: b.id, dmg: 34 + r() * 50, shooter: a.id, dx, dz }); }
    else { const k = 1.1 + r() * 0.4; shot.ix = mx + (b.x + (r() - 0.5) * 1.6 - mx) * k; shot.iz = mz + (b.z + (r() - 0.5) * 1.6 - mz) * k; shot.iy = Math.max(heightAt(shot.ix, shot.iz) + 0.05, my + (aimY + (r() - 0.5) * 0.8 - my) * k); shot.kind = 1; shot.impT = tf + Math.hypot(shot.ix - mx, shot.iy - my, shot.iz - mz) / BULLET_SPEED; }
    shots.push(shot);
    a.burst--; a.mag--; a.nextShot = tf + (a.mg ? 0.075 : 0.09 + r() * 0.06);
    if (a.burst <= 0) a.pauseUntil = t + 0.6 + r() * 1.8;
    if (a.mag <= 0) { a.reloadUntil = t + 2.6; a.mag = 30; a.burst = 0; a.reloads.push(t); }
  }

  shots.sort((p, q) => p.fireT - q.fireT);
  const S = new Float32Array(shots.length * SHOT_F);
  shots.forEach((s, i) => { const o = i * SHOT_F; S[o] = s.fireT; S[o + 1] = s.impT; S[o + 2] = s.fx; S[o + 3] = s.fy; S[o + 4] = s.fz; S[o + 5] = s.ix; S[o + 6] = s.iy; S[o + 7] = s.iz; S[o + 8] = s.shooter; S[o + 9] = s.target; S[o + 10] = s.kind; });
  const byImpact = Uint32Array.from(shots.map((_, i) => i).sort((p, q) => S[p * SHOT_F + 1] - S[q * SHOT_F + 1]));
  const tStart = (a) => Math.min((a.boardT > 0 ? a.boardT : T_SIM - 2) - 0.6, T_SIM - 0.1);
  const statics = actors.map((a) => ({
    id: a.id, side: a.side, spawn: a.spawn, deathTime: a.deathTime, fallSign: a.fallSign, killer: a.killer, cause: a.cause, veh: -1, helo: -1, mg: a.mg, te: 0, ident: a.id_,
    reloads: Float32Array.from(a.reloads), skin: a.me && opts.skin != null ? opts.skin : r(), role: a.role, camp: a.camp ?? -1, tent: a.tent ?? -1, boardT: a.boardT ?? -1, from: a.from || null, house: -1, tIn: -1, tOut: 1e9,
  }));
  return { scene: 'ash', L, N, steps, rec, obstacles: O, destruction: D, missiles: [], shots: S, nShots: shots.length, byImpact, explosions, deaths, actors: statics, startId: me.id, T_START: tStart(me),
    starts: { [me.side]: [me.id, tStart(me)], [other.side]: [other.id, tStart(other)] } };
}
