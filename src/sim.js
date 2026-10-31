// Deterministic forward simulation of the battle. The game only ever plays it backwards.
import { mulberry32, clamp, lerp } from './rng.js';
import { heightAt, crestD } from './terrain.js';
import { buildLayout, vehZ } from './layout.js';
import { makeIdentity } from './names.js';

export const DT = 0.05;
export const HZ = 20;
export const T_SIM = 200;
export const F = 9; // x y z yaw pitch crouch speed phase mode
export const MODE = { HIDDEN: 0, BOAT: 1, CHUTE: 2, GROUND: 3, DEAD: 4 };
export const SHOT_F = 11; // fireT impT fx fy fz ix iy iz shooter target kind
export const BULLET_SPEED = 300;

export function simulate(seed = 7) {
  const r = mulberry32(seed);
  const L = buildLayout();
  const actors = [];

  // ---------- invaders from amphibious vehicles and hovercraft ----------
  L.vehicles.forEach((v, vi) => {
    for (let k = 0; k < v.cap; k++) {
      const a = baseActor(actors.length, 1);
      a.veh = vi; a.slot = k;
      if (v.type === 'aav') {
        a.lx = (k % 2 ? 0.55 : -0.55); a.lz = -2 + Math.floor(k / 2) * 1.0;
        a.disembark = v.tArrive + 2.0 + k * 0.38 + r() * 0.12;
      } else {
        a.lx = -2.4 + (k % 4) * 1.6; a.lz = -4 + Math.floor(k / 4) * 2.2;
        a.disembark = v.tArrive + 1.8 + (Math.floor(k / 4) * 4 + (k % 4)) * 0.3 + r() * 0.1;
      }
      a.spawn = a.disembark;
      a.speedRun = 3.8 + r() * 0.9;
      const side = k % 2 ? 1 : -1;
      a.exitPts = v.type === 'aav'
        ? [{ x: v.x + a.lx * 0.6, z: v.zStop + 4.8 }, { x: v.x + side * (2.6 + r() * 0.6), z: v.zStop - 1.5 + r() * 2 }]
        : [{ x: v.x + a.lx * 0.5, z: v.zStop - 14 }];
      a.route = buildRoute(L, a.exitPts[a.exitPts.length - 1].x, r, v.type === 'aav' ? 4 + r() * 6 : 1 + r() * 2);
      a.routeI = -1;
      actors.push(a);
    }
  });

  // ---------- defenders by helicopter ----------
  const fps = L.positions.slice();
  L.helos.forEach((h, hi) => {
    for (let k = 0; k < 8; k++) {
      const a = baseActor(actors.length, 0);
      a.helo = hi; a.slot = k;
      a.te = h.tTouch + 1.3 + k * 0.45;
      a.spawn = a.te;
      a.exitX = h.x + (k % 2 ? 1.9 : -1.9); a.exitZ = h.z + (Math.floor(k / 2) - 1.5) * 0.7;
      a.speedRun = 4.4 + r() * 0.6;
      actors.push(a);
    }
  });
  const defs = actors.filter((a) => a.side === 0).sort((p, q) => p.exitX - q.exitX);
  const sortedFps = fps.slice().sort((p, q) => p.x - q.x);
  defs.forEach((a, i) => { a.fp = { ...sortedFps[i] }; });

  actors.forEach((a) => { a.id_ = makeIdentity(a.side, a.id); });

  // ---------- strikes: naval shells and FPV drones on the dunes, defender artillery on the flats ----------
  const explosions = [];
  for (let t = 20; t < T_SIM - 4; t += 3.0 + r() * 3.6) {
    let ix, iz, side, kind;
    if (r() < 0.55) {
      const p = L.positions[Math.floor(r() * L.positions.length)];
      ix = p.x + (r() - 0.5) * 14; iz = p.z + (r() - 0.6) * 14; side = 1; kind = r() < 0.5 ? 'drone' : 'shell';
    } else {
      ix = (r() - 0.5) * 220; iz = 4 + r() * 90; side = 0; kind = 'shell';
    }
    const iy = Math.max(heightAt(ix, iz), 0);
    const fl = kind === 'drone' ? 9 : 3.2;
    const sx = ix + (r() - 0.5) * 200, sz = side === 1 ? 900 : -900, sy = 30;
    explosions.push({ launchT: t - fl, t, sx, sy, sz, ix, iy, iz, side, kind, done: false, big: 1 });
  }
  // anti-armor missiles on vehicles
  const missiles = [];
  L.vehicles.forEach((v, vi) => {
    if (v.destroyT < 0) return;
    const p = L.positions[Math.floor(r() * L.positions.length)];
    const vy = v.type === 'aav' ? 2.2 : 2.5;
    missiles.push({ vi, launchT: v.destroyT - 3.2, t: v.destroyT, sx: p.x, sy: heightAt(p.x, p.z) + 1.3, sz: p.z, ix: v.x, iy: vy, iz: v.zStop });
    explosions.push({ launchT: v.destroyT - 3.2, t: v.destroyT, sx: p.x, sy: 0, sz: p.z, ix: v.x, iy: vy, iz: v.zStop, side: 0, kind: 'vehicle', vi, done: false, big: 2 });
  });
  explosions.sort((p, q) => p.t - q.t);

  const steps = Math.round(T_SIM / DT) + 1;
  const N = actors.length;
  const rec = new Float32Array(N * steps * F);
  const shots = [];
  const pending = [];
  const deaths = [];

  const tgtList = [];
  for (let s = 0; s < steps; s++) {
    const t = s * DT;

    // resolve pending hits
    for (let i = pending.length - 1; i >= 0; i--) {
      const h = pending[i];
      if (h.t <= t) {
        pending.splice(i, 1);
        const tg = actors[h.target];
        if (!tg.alive) continue;
        tg.hp -= h.dmg;
        tg.hitFlinch = t;
        if (tg.hp <= 0) kill(tg, h.t, h.shooter, h.dx, h.dz, 'shot');
      }
    }
    // explosions
    for (const e of explosions) {
      if (e.done || e.t > t) continue;
      e.done = true;
      for (const a of actors) {
        if (!a.alive || a.mode !== MODE.GROUND) continue;
        const d = Math.hypot(a.x - e.ix, a.z - e.iz);
        const kr = e.big > 1 ? 4.5 : 3.2, wr = e.big > 1 ? 10 : 8;
        if (d < kr) kill(a, e.t, -1, a.x - e.ix, a.z - e.iz, e.kind);
        else if (d < wr) { a.hp -= 75 * (1 - d / wr); if (a.hp <= 0) kill(a, e.t, -1, a.x - e.ix, a.z - e.iz, e.kind); }
      }
    }

    for (const a of actors) {
      if (!a.alive) { a.speed = 0; continue; }
      if (a.side === 1) updateInvader(a, t); else updateDefender(a, t);
      if (a.mode === MODE.GROUND) combat(a, t);
      // smooth stance
      a.crouch += clamp(a.crouchT - a.crouch, -4 * DT, 4 * DT);
    }

    // vehicle turrets
    L.vehicles.forEach((v, vi) => {
      if (v.type !== 'aav' || t < v.tArrive + 2.5 || (v.destroyT > 0 && t >= v.destroyT)) return;
      if (v.nextBurst === undefined) { v.nextBurst = t + r() * 3; v.burst = 0; }
      if (t < v.nextBurst) return;
      if (v.burst <= 0) {
        const live = actors.filter((b) => b.side === 0 && b.alive && b.mode === MODE.GROUND);
        if (!live.length) { v.nextBurst = t + 2; return; }
        v.tgt = live[Math.floor(r() * live.length)].id; v.burst = 4 + Math.floor(r() * 4);
      }
      const b = actors[v.tgt];
      const mx = v.x, my = heightAt(v.x, v.zStop) + 2.9, mz = v.zStop - 1.4;
      const ty = b.y + 1.0;
      const hit = b.alive && r() < 0.025;
      let ix = b.x + (r() - 0.5) * 3, iy = ty + (r() - 0.5) * 1.5, iz = b.z + (r() - 0.5) * 3;
      if (hit) { ix = b.x; iy = ty; iz = b.z; } else iy = Math.min(iy, heightAt(ix, iz) + 0.05 + r() * 1.2);
      const len = Math.hypot(ix - mx, iy - my, iz - mz);
      const impT = t + len / BULLET_SPEED;
      shots.push({ fireT: t, impT, fx: mx, fy: my, fz: mz, ix, iy, iz, shooter: -1 - vi, target: hit ? b.id : -1, kind: hit ? 3 : 1 });
      if (hit) pending.push({ t: impT, target: b.id, dmg: 80, shooter: -1, dx: b.x - mx, dz: b.z - mz });
      v.burst--;
      v.nextBurst = v.burst > 0 ? t + 0.16 : t + 2.5 + r() * 4;
    });

    // record
    for (let i = 0; i < N; i++) {
      const a = actors[i];
      const o = (i * steps + s) * F;
      rec[o] = a.x; rec[o + 1] = a.y; rec[o + 2] = a.z; rec[o + 3] = a.yaw; rec[o + 4] = a.pitch;
      rec[o + 5] = a.crouch; rec[o + 6] = a.speed; rec[o + 7] = a.phase; rec[o + 8] = a.alive ? a.mode : MODE.DEAD;
    }
  }

  // ---------------- helpers ----------------
  function baseActor(id, side) {
    return {
      id, side, alive: true, hp: 100, x: 0, y: 0, z: 0, yaw: side ? Math.PI : 0, pitch: 0, crouch: 1, crouchT: 1,
      speed: 0, phase: r() * 6, mode: MODE.HIDDEN, state: 'wait', target: -1, retarget: 0,
      burst: 0, nextShot: 0, pauseUntil: 0, mag: side ? 30 : 20, reloadUntil: 0, reloads: [], deathTime: -1, fallSign: -1, killer: -1, cause: '',
      hitFlinch: -9,
    };
  }

  function kill(a, t, killer, dx, dz, cause) {
    a.alive = false; a.deathTime = t; a.killer = killer; a.cause = cause;
    const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
    a.fallSign = (fx * dx + fz * dz) > 0 ? 1 : -1;
    a.mode = MODE.DEAD;
    deaths.push({ id: a.id, t, killer, cause });
  }

  function moveTo(a, tx, tz, speed) {
    const dx = tx - a.x, dz = tz - a.z;
    const d = Math.hypot(dx, dz);
    let sp = speed;
    if (a.z > 0.5) sp *= 0.55; // wading
    const st = sp * DT;
    if (d <= st) { a.x = tx; a.z = tz; a.speed = d / DT; return true; }
    a.x += (dx / d) * st; a.z += (dz / d) * st; a.speed = sp;
    turn(a, Math.atan2(dx, dz), 6);
    return false;
  }
  function turn(a, want, rate) {
    let d = want - a.yaw;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    a.yaw += clamp(d, -rate * DT, rate * DT);
  }
  function ground(a) { a.y = heightAt(a.x, a.z); if (a.y < -0.9) a.y = -0.9; }

  function updateInvader(a, t) {
    const v = L.vehicles[a.veh];
    const vz = vehZ(v, t);
    if (t < a.disembark) {
      a.mode = v.type === 'aav' ? MODE.HIDDEN : MODE.BOAT;
      a.x = v.x + a.lx; a.z = vz + a.lz; a.y = v.type === 'aav' ? heightAt(v.x, vz) + 0.6 : Math.max(heightAt(v.x, vz), 0) + 1.25;
      a.crouchT = a.crouch = 1; a.yaw = Math.PI; a.speed = 0;
      return;
    }
    a.mode = MODE.GROUND;
    if (a.state === 'wait') { a.state = 'exit'; a.exitI = 0; a.crouchT = 0.3; }
    if (a.state === 'exit') {
      const p = a.exitPts[a.exitI];
      const done = moveTo(a, p.x, p.z, a.speedRun * 0.8);
      a.y = (v.type === 'lcac' && Math.abs(a.z - v.zStop) < 13) ? Math.max(heightAt(a.x, a.z), 0) + 1.25 * Math.min(1, (a.z - (v.zStop - 13)) / 2) : Math.max(heightAt(a.x, a.z), -0.9);
      advancePhase(a);
      if (done) {
        a.exitI++;
        if (a.exitI >= a.exitPts.length) {
          if (v.type === 'aav') { a.state = 'cover'; a.routeI = -1; a.coverUntil = t + 3 + r() * 5; a.speed = 0; }
          else { a.state = 'move'; a.routeI = 0; }
        }
      }
      return;
    }
    if (a.state === 'move') {
      const wp = a.route[a.routeI];
      a.crouchT = 0.2;
      const done = moveTo(a, wp.x, wp.z, a.speedRun);
      ground(a); advancePhase(a);
      if (done) { a.state = 'cover'; a.coverUntil = t + wp.hold; a.speed = 0; }
      return;
    }
    if (a.state === 'cover') {
      a.speed = 0; ground(a);
      a.crouchT = a.burst > 0 ? 0.5 : 1;
      if (t > a.coverUntil && a.routeI < a.route.length - 1) { a.routeI++; a.state = 'move'; a.burst = 0; }
    }
  }

  function updateDefender(a, t) {
    const h = L.helos[a.helo];
    if (t < a.te) {
      a.mode = MODE.HIDDEN; a.x = h.x; a.y = h.y + 1; a.z = h.z; a.yaw = 0; return;
    }
    a.mode = MODE.GROUND;
    if (a.state === 'wait') { a.state = 'muster'; a.x = a.exitX; a.z = a.exitZ; a.musterUntil = t + 0.9; a.crouchT = a.crouch = 0.7; a.yaw = 0; }
    if (a.state === 'muster') {
      moveTo(a, a.exitX + (a.exitX > h.x ? 1.5 : -1.5), a.exitZ + 0.5, 2.5); ground(a); advancePhase(a);
      if (t > a.musterUntil) a.state = 'move'; return;
    }
    if (a.state === 'move') {
      a.crouchT = 0.25;
      const done = moveTo(a, a.fp.x, a.fp.z, a.speedRun);
      ground(a); advancePhase(a);
      if (done) { a.state = 'defend'; a.speed = 0; a.relocate = t + 18 + r() * 20; }
      return;
    }
    if (a.state === 'defend') {
      ground(a); a.speed = 0;
      a.crouchT = a.burst > 0 ? 0.1 : 1;
      if (t > a.relocate && a.burst === 0) {
        const nx = clamp(a.fp.x + (r() < 0.5 ? -1 : 1) * (2 + r() * 3), -98, 98);
        a.fp = { x: nx, z: -(crestD(nx) + 2.0) };
        a.state = 'move';
      }
    }
  }

  // gait cycles per metre depend on speed: walking strides are short, running strides long (matches the mocap)
  function advancePhase(a) { const stride = 1.45 + 1.5 * clamp((a.speed - 1.4) / 2.8, 0, 1); a.phase += (a.speed * DT / stride) * Math.PI * 2; }

  function combat(a, t) {
    const fighting = (a.side === 1 && a.state === 'cover') || (a.side === 0 && a.state === 'defend');
    if (!fighting) return;
    if (t >= a.retarget) {
      a.retarget = t + 0.6 + r() * 0.6;
      tgtList.length = 0;
      for (const b of actors) {
        if (b.side === a.side || !b.alive) continue;
        if (b.mode !== MODE.GROUND) continue;
        const d = Math.hypot(b.x - a.x, b.z - a.z);
        if (d < 260) tgtList.push([d, b.id]);
      }
      tgtList.sort((p, q) => p[0] - q[0]);
      a.target = tgtList.length ? tgtList[Math.floor(r() * Math.min(3, tgtList.length))][1] : -1;
    }
    if (a.target < 0) { a.burst = 0; return; }
    const b = actors[a.target];
    if (!b.alive) { a.target = -1; a.retarget = t; a.burst = 0; return; }
    const aimY = b.y + lerp(1.3, 0.95, b.crouch);
    const dx = b.x - a.x, dz = b.z - a.z, dh = Math.hypot(dx, dz);
    turn(a, Math.atan2(dx, dz), 5);
    const my = a.y + lerp(1.45, 0.95, a.crouch);
    a.pitch = Math.atan2(aimY - my, dh);
    if (t < a.pauseUntil || t < a.reloadUntil) return;
    if (a.burst <= 0) {
      a.burst = 3 + Math.floor(r() * 5);
      a.nextShot = t + (a.side === 0 ? 0.35 : 0.25);
      return;
    }
    if (t < a.nextShot) return;
    // fire
    const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
    const mx = a.x + fx * 0.75 - fz * 0.1, mz = a.z + fz * 0.75 + fx * 0.1;
    let hitP = 0;
    if (b.mode === MODE.GROUND) {
      const base = a.side === 0 ? 0.07 : 0.018;
      const rangeF = clamp(35 / dh, 0.12, 1.3);
      let cover = 1;
      if (b.side === 0) cover = b.state === 'defend' ? (b.crouch > 0.6 ? 0.05 : 0.35) : 0.8;
      else cover = b.state === 'cover' ? (b.crouch > 0.8 ? 0.4 : 0.65) : 0.95;
      hitP = base * rangeF * cover;
    }
    const shot = { fireT: t, shooter: a.id, target: -1, fx: mx, fy: my, fz: mz };
    if (r() < hitP) {
      shot.ix = b.x + (r() - 0.5) * 0.3; shot.iy = aimY + (r() - 0.5) * 0.3; shot.iz = b.z + (r() - 0.5) * 0.3;
      shot.kind = 3; shot.target = b.id;
      const len = Math.hypot(shot.ix - mx, shot.iy - my, shot.iz - mz);
      shot.impT = t + len / BULLET_SPEED;
      const head = r() < 0.12;
      pending.push({ t: shot.impT, target: b.id, dmg: head ? 150 : 34 + r() * 36, shooter: a.id, dx, dz });
    } else {
      // miss: perturb and march until ground or water
      const yawE = (r() - 0.5) * 0.09, pitE = (r() - 0.55) * 0.05;
      const yaw = Math.atan2(dx, dz) + yawE;
      const pit = a.pitch + pitE;
      const vx = Math.sin(yaw) * Math.cos(pit), vy = Math.sin(pit), vz = Math.cos(yaw) * Math.cos(pit);
      let px = mx, py = my, pz = mz, hit = 0, dist = 0;
      const stp = 1.5;
      for (; dist < 320; dist += stp) {
        const nx = px + vx * stp, ny = py + vy * stp, nz = pz + vz * stp;
        const gh = heightAt(nx, nz);
        if (gh < 0 && ny < 0) { // water
          const k = py / (py - ny); px += (nx - px) * k; pz += (nz - pz) * k; py = 0; hit = 2; break;
        }
        if (ny < gh) {
          let lo = 0, hi = 1;
          for (let it = 0; it < 4; it++) {
            const m = (lo + hi) / 2;
            if (py + vy * stp * m < heightAt(px + vx * stp * m, pz + vz * stp * m)) hi = m; else lo = m;
          }
          px += vx * stp * lo; py += vy * stp * lo; pz += vz * stp * lo; hit = 1; break;
        }
        px = nx; py = ny; pz = nz;
      }
      shot.ix = px; shot.iy = py; shot.iz = pz; shot.kind = hit;
      shot.impT = t + Math.hypot(px - mx, py - my, pz - mz) / BULLET_SPEED;
    }
    shots.push(shot);
    a.burst--; a.mag--;
    a.nextShot = t + 0.085 + r() * 0.04;
    if (a.burst <= 0) a.pauseUntil = t + 0.7 + r() * 1.9;
    if (a.mag <= 0) { a.reloadUntil = t + 2.6; a.mag = a.side ? 30 : 20; a.burst = 0; a.reloads.push(t); }
  }

  // pack shots
  shots.sort((p, q) => p.fireT - q.fireT);
  const S = new Float32Array(shots.length * SHOT_F);
  shots.forEach((s, i) => {
    const o = i * SHOT_F;
    S[o] = s.fireT; S[o + 1] = s.impT; S[o + 2] = s.fx; S[o + 3] = s.fy; S[o + 4] = s.fz;
    S[o + 5] = s.ix; S[o + 6] = s.iy; S[o + 7] = s.iz; S[o + 8] = s.shooter; S[o + 9] = s.target; S[o + 10] = s.kind;
  });
  // impacts sorted by impact time (indices)
  const byImpact = Uint32Array.from(shots.map((_, i) => i).sort((p, q) => S[p * SHOT_F + 1] - S[q * SHOT_F + 1]));

  // choose the opening body: a defender who dies late in the battle, near the middle
  let start = null;
  const lateDef = actors.filter((a) => a.side === 0 && a.deathTime > 150 && a.deathTime < T_SIM - 4 && a.cause === 'shot');
  lateDef.sort((p, q) => Math.abs(p.fp.x) - Math.abs(q.fp.x));
  if (lateDef.length) start = lateDef[0];
  else {
    const anyDef = actors.filter((a) => a.side === 0 && a.deathTime > 60).sort((p, q) => q.deathTime - p.deathTime);
    start = anyDef[0] || actors.find((a) => a.side === 0);
  }
  const T_START = start.deathTime > 0 ? Math.min(start.deathTime + 3.5, T_SIM - 0.1) : T_SIM - 0.1;

  const statics = actors.map((a) => ({
    id: a.id, side: a.side, spawn: a.spawn, deathTime: a.deathTime, fallSign: a.fallSign, killer: a.killer, cause: a.cause,
    veh: a.veh ?? -1, helo: a.helo ?? -1, te: a.te ?? 0, ident: a.id_, reloads: Float32Array.from(a.reloads),
    skin: r(),
  }));

  return { L, N, steps, rec, missiles, shots: S, nShots: shots.length, byImpact, explosions, deaths, actors: statics, startId: start.id, T_START };
}

function buildRoute(L, x0, r, firstHold) {
  const route = [];
  let x = x0 + (r() - 0.5) * 6;
  route.push({ x, z: 1 + r() * 5, hold: firstHold });
  x += (r() - 0.5) * 10;
  route.push({ x, z: -(14 + r() * 8), hold: 3 + r() * 6 });
  x += (r() - 0.5) * 8;
  route.push({ x, z: -(crestD(x) - 11), hold: 5 + r() * 8 });
  route.push({ x, z: -(crestD(x) - 3.5), hold: 999 });
  return route;
}
