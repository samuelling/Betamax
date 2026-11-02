// The Bomb, simulated forward and played backwards.
//   1–3 s    your scouts come out of the woods onto the common in Ashland (from the park: tape 4)
//   6 s      the flash, over Boston. Everyone stops and looks east. Then they run for the cars on Main Street
//   15 s     four commandeered cars head west on 135, flat out
//   40 s     four Texan vehicles pull out of a woods road behind them (from the camps) and close in, firing
//   64 s     their sedan rolls; 96 s your wagon is hit and goes into the trees; 113 s their SUV takes the
//            fuel tanker with it and the truck behind piles in
//   ~108 s   the sound of the blast finally arrives, 35 km late
//   122 s    two Black Hawks into a hayfield in Hopkinton; the cars run in under them
//   130–156 s the last technical stops at the gate; a fight across the field; one helicopter for the Cape, one
//            out to the fleet. You're the last one on.
import { mulberry32, clamp, lerp } from './rng.js';
import { heightFast as heightAt } from './terrain.js';
import { buildBombLayout, carPose, seatPose } from './layoutB.js';
import { heloPose } from './layout.js';
import { makeIdentity } from './names.js';
import { Obstacles } from './obstacles.js';
import { styleOf, gaitStride } from './gait.js';
import { computeDestruction } from './destruction.js';
import { DT, HZ, T_SIM, F, MODE, SHOT_F, BULLET_SPEED } from './sim.js';

export function simulateBomb(seed = 3, opts = {}) {
  const r = mulberry32(seed);
  const L = buildBombLayout();
  const O = new Obstacles(L);
  let curT = 0;
  const actors = [], R = L.rides, H0 = L.helos[0], H1 = L.helos[1];
  const base = (side) => ({ id: actors.length, side, alive: true, hp: 100, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, crouch: 1, crouchT: 1, speed: 0, phase: r() * 6, mode: MODE.HIDDEN, state: 'wait', target: -1, retarget: 0,
    burst: 0, nextShot: 0, pauseUntil: 0, mag: 30, reloadUntil: 0, reloads: [], deathTime: -1, fallSign: -1, killer: -1, cause: '', hitFlinch: -9, speedRun: 4.2 + r() * 0.7 });
  // ---------- who sits where ----------
  // yours: sedan (4) + pickup driver and three in the bed → the Cape (helicopter 0); SUV (5) + two from the pickup → the fleet
  // (helicopter 1); the wagon's four don't make it. You: in the pickup bed, facing back.
  const plan = [[0, 0, 0], [0, 1, 0], [0, 2, 0], [0, 3, 0], [1, 0, 1], [1, 1, 1], [1, 2, 1], [1, 3, 1], [1, 4, 1], [2, 0, 0], [2, 1, 1], [2, 2, 0], [2, 3, 0], [2, 4, 0], [2, 5, 1], [2, 6, 0], [3, 0, -1], [3, 1, -1], [3, 2, -1], [3, 3, -1]];
  for (const [ci, si, hel] of plan) { const a = base(0); a.car = ci; a.seat = si; a.helo = hel; a.spawn = 1 + r() * 2; actors.push(a); }
  for (const ci of [4, 5, 6, 7, 8]) R[ci].seats.forEach((_, si) => { const a = base(1); a.car = ci; a.seat = si; a.helo = -1; a.spawn = R[ci].t0 - 2.5; actors.push(a); });
  const me0 = actors.find((a) => a.car === 2 && a.seat === 6), me1 = actors.find((a) => a.car === 1 && a.seat === 4);   // the Cape's helicopter: on the .50 in the pickup; the fleet's: the M250 out of the SUV's back
  const me = opts.group === 1 ? me1 : me0; me0.me = true; me0.hp = 1e9; me1.me = true; me1.hp = 1e9;
  actors.forEach((a) => { a.mg = a.seat === 6 || a === me1; a.gun = a.seat === 6; a.driver = a.seat === 0; });   // every pickup is a technical: a gun on a post in the bed
  actors.forEach((a) => { a.id_ = makeIdentity(a.side, a.id + 3000); });
  if (opts.ident) me.id_ = opts.ident;
  const other = me === me0 ? me1 : me0;
  // the wrecks you made: in the seconds before each Texan car goes off the road, your gun is on its driver.
  // (In rewind: the wreck burns, your rounds come back out of it, and it un-crashes into the chase.)
  const FOCUS = [{ by: me0, car: 5 }, { by: me0, car: 6 }, { by: me1, car: 7 }].map((f) => ({ ...f, t: R[f.car].crash.t, drv: actors.find((b) => b.car === f.car && b.seat === 0) }));
  // where each of yours comes out of the trees, and which door they run for
  actors.filter((a) => a.side === 0).forEach((a, k) => { a.from = { x: L.trail.x + (k % 4 - 1.5) * 1.6, z: L.trail.z + Math.floor(k / 4) * 1.4 }; });

  // ---------- ordnance ----------
  const explosions = [], missiles = [];
  const ex = (o) => explosions.push(Object.assign({ done: false, big: 1, side: 1, sy: 30 }, o));
  const sp = {}, crashRest = new Map();
  for (const c of R) if (c.crash) { let t = c.crash.t; while (t < T_SIM && carPose(c, t, sp).v > 0.05) t += DT; crashRest.set(c.i, t + 0.6); }
  // fires sit where the wreck comes to rest
  const at = (ci, t) => carPose(R[ci], crashRest.has(ci) ? Math.max(t, crashRest.get(ci)) : t, {});
  { const c = at(3, R[3].burnT); ex({ launchT: R[3].burnT - 0.4, t: R[3].burnT, sx: c.x, sy: 0, sz: c.z, ix: c.x, iy: c.y, iz: c.z, kind: 'crash', big: 1.1, side: 1, persist: true }); }
  { const T = L.tanker; ex({ launchT: T.t - 0.5, t: T.t, sx: T.x, sy: 0, sz: T.z, ix: T.x, iy: heightAt(T.x, T.z) + 1.5, iz: T.z, kind: 'crash', big: 3.2, side: 0, persist: true, tanker: true }); }
  for (const ci of [6, 7]) { const c = at(ci, R[ci].burnT); ex({ launchT: R[ci].burnT - 0.3, t: R[ci].burnT, sx: c.x, sy: 0, sz: c.z, ix: c.x, iy: c.y + 0.6, iz: c.z, kind: 'crash', big: 1.0, side: 0, persist: true }); }
  // the last technical, at the gate: a rocket from the field
  { const c = at(4, R[4].burnT), sx = L.FIELD.x - 6, sz = L.FIELD.z - 20; ex({ launchT: R[4].burnT - 0.9, t: R[4].burnT, sx, sy: heightAt(sx, sz) + 1.4, sz, ix: c.x, iy: c.y + 0.8, iz: c.z, kind: 'rocket', big: 1.6, side: 0 });
    ex({ launchT: R[4].burnT, t: R[4].burnT + 0.15, sx: c.x, sy: 0, sz: c.z, ix: c.x, iy: c.y + 0.6, iz: c.z, kind: 'crash', big: 1.0, side: 0, persist: true }); }
  // the cruise missiles into the Telechron works, from the east, low
  for (const m of L.megas) for (let k = 0; k < 3; k++) { const c = Math.cos(m.rot), sn = Math.sin(m.rot), lx = (k - 1) * 22, ix = m.x + lx * c, iz = m.z - lx * sn;
    ex({ launchT: m.T - 2.2 + k * 0.25, t: m.T - 0.5 + k * 0.25, sx: ix - 420, sy: 70, sz: iz - 60, ix, iy: m.y + 4 + k * 3, iz, kind: 'rocket', big: 2.6, side: 1 });
    ex({ launchT: m.T, t: m.T + 1 + k * 0.4, sx: ix, sy: 0, sz: iz, ix, iy: m.y + 1, iz, kind: 'crash', big: 1.4, side: 1, persist: true }); }
  explosions.sort((p, q) => p.t - q.t);
  const D = computeDestruction(L, explosions);
  O.setDestruction(D);

  const simSteps = Math.round(T_SIM / DT) + 1, steps = Math.round(T_SIM * HZ) + 1, N = actors.length;
  const rec = new Float32Array(N * steps * F), shots = [], pending = [], deaths = [], tgtList = [];
  const dismount = new Map();   // car -> time it came to rest at the field
  for (const ci of [0, 1, 2, 4, 8]) { for (let t = R[ci].t0 + 1; t < T_SIM; t += DT) { if (carPose(R[ci], t, sp).v < 0.05) { dismount.set(ci, t + 0.4); break; } } }

  for (let s = 0; s < simSteps; s++) {
    const t = s * DT; curT = t;
    for (let i = pending.length - 1; i >= 0; i--) {
      const h = pending[i]; if (h.t > t) continue; pending.splice(i, 1);
      const tg = actors[h.target]; if (!tg.alive || (tg.riding && h.dmg < 400)) continue;
      tg.hp -= h.dmg; tg.hitFlinch = t; if (tg.hp <= 0) kill(tg, h.t, h.shooter, h.dx, h.dz, 'shot');
    }
    for (const e of explosions) {
      if (e.done || e.t > t) continue; e.done = true;
      for (const a of actors) { if (!a.alive || a.mode !== MODE.GROUND || a.me || a.riding) continue; const d = Math.hypot(a.x - e.ix, a.z - e.iz); if (d < 2.5 * e.big) kill(a, e.t, -1, a.x - e.ix, a.z - e.iz, e.kind); }
    }
    for (const a of actors) {
      if (!a.alive) { a.speed = 0; continue; }
      update(a, t);
      a.crouch += clamp(a.crouchT - a.crouch, -4 * DT, 4 * DT);
    }
    gunners(t);
    if (s % 2 === 0) for (let i = 0; i < N; i++) {
      const a = actors[i], o = (i * steps + s / 2) * F;
      rec[o] = a.x; rec[o + 1] = a.y; rec[o + 2] = a.z; rec[o + 3] = a.yaw; rec[o + 4] = a.pitch;
      rec[o + 5] = a.crouch; rec[o + 6] = a.speed; rec[o + 7] = a.phase; rec[o + 8] = a.alive ? a.mode : MODE.DEAD;
    }
  }

  function kill(a, t, killer, dx, dz, cause) {
    a.alive = false; a.deathTime = t; a.killer = killer; a.cause = cause; a.riding = false;
    a.fallSign = (Math.sin(a.yaw) * dx + Math.cos(a.yaw) * dz) > 0 ? 1 : -1; a.mode = MODE.DEAD;
    deaths.push({ id: a.id, t, killer, cause });
  }
  function turn(a, want, rate) { let d = want - a.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; a.yaw += clamp(d, -rate * DT, rate * DT); }
  function ground(a) { a.y = O.surfaceY(a.x, a.z, a.y, curT); }
  function advance(a) { const stride = gaitStride(styleOf(a.id, a.mg), a.speed, a.crouch, a.hitFlinch > 0); a.phase += (a.speed * DT / stride) * Math.PI * 2; }
  function moveTo(a, tx, tz, speed) {
    const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz), st = speed * DT;
    if (d <= st) { a.x = tx; a.z = tz; a.speed = d / DT; return true; }
    const ox = a.x, oz = a.z; let nx = a.x + dx / d * st, nz = a.z + dz / d * st;
    [nx, nz] = O.pushOut(nx, nz, 0.32, a.y, curT, a.car != null ? 100 + a.car : -1);
    a.x = nx; a.z = nz; a.speed = Math.hypot(nx - ox, nz - oz) / DT;
    if (a.speed > 0.2) turn(a, Math.atan2(nx - ox, nz - oz), 6);
    return false;
  }
  function seated(a, t) {
    const c = R[a.car]; seatPose(c, a.seat, t, sp);
    a.x = sp.sx; a.y = sp.sy; a.z = sp.sz; a.speed = 0; a.crouchT = a.crouch = a.gun ? 0.12 : 1; a.mode = MODE.GROUND; a.riding = true;
    if (a.target < 0 || a.driver) { a.yaw = a.driver ? sp.yaw : sp.syaw; a.pitch = 0; }
  }
  function update(a, t) {
    const c = R[a.car];
    if (t < a.spawn) { a.mode = MODE.HIDDEN; a.speed = 0; if (a.side) { seated(a, t); a.mode = MODE.HIDDEN; } else { a.x = a.from.x; a.z = a.from.z; a.y = heightAt(a.x, a.z); } return; }
    // in the wreck when it comes to rest: nobody gets out
    if (c && c.crash && t >= crashRest.get(c.i)) { if (a.state !== 'out') { seated(a, t); kill(a, t, -1, 0, 1, 'crash'); } return; }
    if (a.side === 1) {
      if (a.state === 'wait') { a.state = 'ride'; a.tIn = a.spawn; }
      if (a.state === 'ride') {
        seated(a, t);
        if (dismount.has(a.car) && t >= dismount.get(a.car) + a.seat * 0.3) { a.state = 'out'; a.riding = false; a.tOut = t; a.yaw += Math.PI / 2 * (c.seats[a.seat][0] > 0 ? 1 : -1); const cs = Math.cos(a.yaw), sn = Math.sin(a.yaw); a.x += sn * 1.2; a.z += cs * 1.2; a.cover = cover(a); }
        else if (!a.driver) combat(a, t, true);
        return;
      }
      // out at the gate: get behind something and fight
      a.mode = MODE.GROUND; ground(a);
      if (moveTo(a, a.cover.x, a.cover.z, a.speedRun)) { a.speed = 0; a.crouchT = a.burst > 0 ? 0.35 : 1; combat(a, t); } else { a.crouchT = 0.3; advance(a); }
      return;
    }
    // yours: out of the trees, the flash, the run for the cars
    if (a.state === 'wait') { a.state = 'walk'; a.x = a.from.x; a.z = a.from.z; ground(a); a.mode = MODE.GROUND; }
    if (a.state === 'walk' || a.state === 'run') {
      a.mode = MODE.GROUND;
      seatPose(c, a.seat, t, sp); const door = { x: sp.sx + Math.sin(sp.yaw + Math.PI / 2 * (c.seats[a.seat][0] > 0 ? 1 : -1)) * 1.3, z: sp.sz + Math.cos(sp.yaw + Math.PI / 2 * (c.seats[a.seat][0] > 0 ? 1 : -1)) * 1.3 };
      if (t >= L.blast.t && t < L.blast.t + 2.4) { a.speed = 0; a.crouchT = 0.2; turn(a, Math.atan2(L.blast.x - a.x, L.blast.z - a.z), 4); ground(a); return; }   // the flash: everybody stops and looks
      const go = t > L.blast.t ? a.speedRun * 1.15 : 1.3, done = moveTo(a, door.x, door.z, go); ground(a); a.crouchT = t > L.blast.t ? 0.3 : 0; advance(a);
      if (done || t >= c.t0 - 0.3) { a.state = 'ride'; a.tIn = t; }
      return;
    }
    if (a.state === 'ride') {
      seated(a, t);
      if (dismount.has(a.car) && t >= dismount.get(a.car) + a.seat * 0.35) {
        a.state = 'field'; a.riding = false; a.tOut = t; const side = c.seats[a.seat][0] > 0 ? 1 : -1; const cs = Math.cos(sp.yaw), sn = Math.sin(sp.yaw);
        a.x += cs * 1.3 * side; a.z -= sn * 1.3 * side; ground(a);
      } else if (!a.driver) combat(a, t, true);
      return;
    }
    if (a.state === 'field') {
      const H = a.helo === 0 ? H0 : H1;
      if (t < H.tTouch + 0.5) { a.speed = 0; a.crouchT = 1; ground(a); combat(a, t); return; }   // down behind the cars until it's on the grass
      const hp = heloPose(H, t, {}), c2 = Math.cos(hp.yaw), s2 = Math.sin(hp.yaw), sd = a.id % 2 ? 1.95 : -1.95;
      const bx = hp.x + sd * c2 + 1.2 * s2, bz = hp.z - sd * s2 + 1.2 * c2;
      const after = a.me ? H.tLift - 3 : a.helo === 1 && a.id % 3 === 0 ? H.tLift - 4 : 0;   // a few of the fleet team hold the gate till the end
      if (after && t < after - 13) { const w = { x: L.FIELD.x - 4 + (a.id % 5) * 2, z: L.FIELD.z - 34 }; if (moveTo(a, w.x, w.z, a.speedRun)) { a.speed = 0; a.crouchT = a.burst > 0 ? 0.35 : 1; combat(a, t); } else { a.crouchT = 0.3; advance(a); } ground(a); return; }
      const done = moveTo(a, bx, bz, a.speedRun * 1.05) || Math.hypot(a.x - bx, a.z - bz) < 1.1; ground(a); a.crouchT = 0.35; advance(a);
      if (done) { a.speed = 0; if (t >= after) { a.state = 'gone'; a.boardT = t; } else combat(a, t); }
      return;
    }
    if (a.state === 'gone') { const H = a.helo === 0 ? H0 : H1, hp = heloPose(H, t, {}); a.mode = MODE.HIDDEN; a.x = hp.x; a.y = hp.y + 1; a.z = hp.z; a.speed = 0; }
  }
  function cover(a) { let best = null, bd = 1e9; for (const p of L.positions) { const d = Math.hypot(p.x - a.x, p.z - a.z) + r() * 14; if (d < bd && Math.hypot(p.x - L.FIELD.x, p.z - L.FIELD.z) > 30) { bd = d; best = p; } } return best || { x: a.x, z: a.z }; }
  // the door gunners on the Black Hawks once they're down
  function gunners(t) {
    [H0, H1].forEach((H, hi) => {
      if (t < H.tTouch + 1 || t > H.tLift + 2) return;
      const g = H.g || (H.g = { next: t + 1, burst: 0, tgt: -1 });
      if (t < g.next) return;
      if (g.burst <= 0) { const live = actors.filter((b) => b.side === 1 && b.alive && b.mode === MODE.GROUND && !b.riding); if (!live.length) { g.next = t + 1; return; } g.tgt = live[Math.floor(r() * live.length)].id; g.burst = 12 + Math.floor(r() * 10); }
      const b = actors[g.tgt], hp = heloPose(H, t, {}), mx = hp.x + Math.cos(hp.yaw) * 1.5, my = hp.y + 1.9, mz = hp.z - Math.sin(hp.yaw) * 1.5;
      const hit = b.alive && r() < 0.03; let ix = b.x + (r() - 0.5) * 4, iz = b.z + (r() - 0.5) * 4, iy = heightAt(ix, iz) + 0.05; if (hit) { ix = b.x; iy = b.y + 1; iz = b.z; }
      const impT = t + Math.hypot(ix - mx, iy - my, iz - mz) / BULLET_SPEED;
      shots.push({ fireT: t, impT, fx: mx, fy: my, fz: mz, ix, iy, iz, shooter: -200 - hi, target: hit ? b.id : -1, kind: hit ? 3 : 1 });
      if (hit) pending.push({ t: impT, target: b.id, dmg: 120, shooter: -1, dx: b.x - mx, dz: b.z - mz });
      g.burst--; g.next = g.burst > 0 ? t + 0.08 : t + 1.5 + r() * 2;
    });
  }
  function combat(a, t, riding = false) {
    const fc = a.me && FOCUS.find((f) => f.by === a && t > f.t - 2.6 && t <= f.t && f.drv.alive);
    if (fc) {
      const b = fc.drv; a.target = b.id;
      const dx = b.x - a.x, dz = b.z - a.z, dh = Math.hypot(dx, dz); turn(a, Math.atan2(dx, dz), 12);
      const my = a.y + lerp(1.45, 0.95, a.crouch), aimY = b.y + 1.0; a.pitch = Math.atan2(aimY - my, dh);
      if (t < a.nextShot) return;
      const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw), mx = a.x + fx * 0.75, mz = a.z + fz * 0.75, tf = Math.min(t, Math.max(t - DT + 1e-3, a.nextShot));
      const last = t > fc.t - 0.45, shot = { fireT: tf, shooter: a.id, target: last ? b.id : -1, fx: mx, fy: my, fz: mz, ix: b.x + (last ? 0 : (r() - 0.5) * 1.4), iy: aimY + (last ? 0 : (r() - 0.5) * 0.6), iz: b.z + (last ? 0 : (r() - 0.5) * 1.4), kind: last ? 3 : 4 };
      shot.impT = tf + Math.hypot(shot.ix - mx, shot.iy - my, shot.iz - mz) / BULLET_SPEED; shots.push(shot);
      if (last) pending.push({ t: shot.impT, target: b.id, dmg: 400, shooter: a.id, dx, dz });
      a.nextShot = tf + (a.gun ? 0.115 : 0.075); a.burst = 0; return;
    }
    if (t >= a.retarget) {
      a.retarget = t + 0.6 + r() * 0.6; tgtList.length = 0;
      for (const b of actors) { if (b.side === a.side || !b.alive || b.mode !== MODE.GROUND) continue; const d = Math.hypot(b.x - a.x, b.z - a.z); if (d < 170) tgtList.push([d, b.id]); }
      tgtList.sort((p, q) => p[0] - q[0]);
      const vis = [];
      for (let k = 0; k < tgtList.length && k < 8 && vis.length < 3; k++) { const b = actors[tgtList[k][1]], ign = new Set([a.car != null ? 100 + a.car : -9, b.car != null ? 100 + b.car : -9]); if (O.segment(a.x, a.y + 1.2, a.z, b.x, b.y + 1.1, b.z, t, ign) < 0) vis.push(b.id); }
      a.target = vis.length ? vis[Math.floor(r() * vis.length)] : -1;
    }
    if (a.target < 0) { a.burst = 0; return; }
    const b = actors[a.target]; if (!b.alive) { a.target = -1; a.retarget = t; a.burst = 0; return; }
    const aimY = b.y + lerp(1.3, 0.95, b.crouch), dx = b.x - a.x, dz = b.z - a.z, dh = Math.hypot(dx, dz);
    turn(a, Math.atan2(dx, dz), riding ? 9 : 5);
    const my = a.y + lerp(1.45, 0.95, a.crouch); a.pitch = Math.atan2(aimY - my, dh);
    if (t < a.pauseUntil || t < a.reloadUntil) return;
    if (a.burst <= 0) { a.burst = a.mg ? 10 + Math.floor(r() * 12) : 3 + Math.floor(r() * 5); a.nextShot = t + 0.25; return; }
    if (t < a.nextShot) return;
    const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw), mx = a.x + fx * 0.75, mz = a.z + fz * 0.75, tf = Math.min(t, Math.max(t - DT + 1e-3, a.nextShot));
    const shot = { fireT: tf, shooter: a.id, target: -1, fx: mx, fy: my, fz: mz };
    // between moving cars a hit is metal and glass, not a kill; on foot it counts
    const hitP = b.riding || riding ? 0 : (a.side === 0 ? 0.09 : 0.03) * clamp(30 / dh, 0.15, 1.3) * (b.crouch > 0.6 ? 0.35 : 0.85) * (b.me ? 0 : 1);
    if (r() < hitP) {
      shot.ix = b.x; shot.iy = aimY; shot.iz = b.z; shot.kind = 3; shot.target = b.id; shot.impT = tf + Math.hypot(shot.ix - mx, shot.iy - my, shot.iz - mz) / BULLET_SPEED;
      pending.push({ t: shot.impT, target: b.id, dmg: 34 + r() * 50, shooter: a.id, dx, dz });
    } else {
      const sc = riding ? 2.4 : 1.5; shot.ix = b.x + (r() - 0.5) * sc; shot.iy = Math.max(heightAt(b.x, b.z) + 0.05, aimY + (r() - 0.5) * sc * 0.6); shot.iz = b.z + (r() - 0.5) * sc;
      // a little long: the bullet carries past (or into the car body)
      if (b.riding && r() < 0.5) shot.kind = 4; else { const k = 1 + r() * 0.4; shot.ix = mx + (shot.ix - mx) * k; shot.iz = mz + (shot.iz - mz) * k; shot.iy = Math.max(heightAt(shot.ix, shot.iz), my + (shot.iy - my) * k); shot.kind = 1; }
      shot.impT = tf + Math.hypot(shot.ix - mx, shot.iy - my, shot.iz - mz) / BULLET_SPEED;
    }
    shots.push(shot);
    a.burst--; a.mag--; a.nextShot = tf + (a.mg ? 0.075 : 0.09 + r() * 0.06);
    if (a.burst <= 0) a.pauseUntil = t + 0.6 + r() * 1.8;
    if (a.mag <= 0) { a.reloadUntil = t + 2.6; a.mag = 30; a.burst = 0; a.reloads.push(t); }
  }

  shots.sort((p, q) => p.fireT - q.fireT);
  const S = new Float32Array(shots.length * SHOT_F);
  shots.forEach((s, i) => { const o = i * SHOT_F; S[o] = s.fireT; S[o + 1] = s.impT; S[o + 2] = s.fx; S[o + 3] = s.fy; S[o + 4] = s.fz; S[o + 5] = s.ix; S[o + 6] = s.iy; S[o + 7] = s.iz; S[o + 8] = s.shooter; S[o + 9] = s.target; S[o + 10] = s.kind; });
  const byImpact = Uint32Array.from(shots.map((_, i) => i).sort((p, q) => S[p * SHOT_F + 1] - S[q * SHOT_F + 1]));
  const T_START = Math.min((me.boardT || H0.tLift - 2) - 0.6, T_SIM - 0.1), T_OTHER = Math.min((other.boardT || H1.tLift - 2) - 0.6, T_SIM - 0.1);
  const statics = actors.map((a) => ({
    id: a.id, side: a.side, spawn: a.spawn, deathTime: a.deathTime, fallSign: a.fallSign, killer: a.killer, cause: a.cause,
    veh: -1, helo: a.helo, mg: a.mg, te: 0, ident: a.id_, reloads: Float32Array.from(a.reloads), skin: a.me && opts.skin != null ? opts.skin : r(),
    car: a.car, seat: a.seat, tIn: a.tIn ?? -1, tOut: a.tOut ?? 1e9, boardT: a.boardT ?? -1, from: a.from, house: -1,
  }));
  return { scene: 'bomb', L, N, steps, rec, obstacles: O, destruction: D, missiles, shots: S, nShots: shots.length, byImpact, explosions, deaths, actors: statics, startId: me.id, T_START, starts: { [me === me0 ? 0 : 1]: [me.id, T_START], [me === me0 ? 1 : 0]: [other.id, T_OTHER] } };
}
