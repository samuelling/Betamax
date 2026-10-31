// Deterministic forward simulation of the battle. The game only ever plays it backwards.
import { mulberry32, clamp, lerp } from './rng.js';
import { heightFast as heightAt, crestD } from './terrain.js';
import { buildLayout, vehZ, gunshipPose } from './layout.js';
import { makeIdentity } from './names.js';
import { Obstacles } from './obstacles.js';

export const DT = 0.05;
export const HZ = 10; // recording rate (sim runs at 20 Hz)
export const T_SIM = 200;
export const F = 9; // x y z yaw pitch crouch speed phase mode
export const MODE = { HIDDEN: 0, BOAT: 1, CHUTE: 2, GROUND: 3, DEAD: 4 };
export const SHOT_F = 11; // fireT impT fx fy fz ix iy iz shooter target kind
export const BULLET_SPEED = 300;
export let DEF_ACC = 0.14, INV_ACC = 0.0085;
export function tune(d, i) { DEF_ACC = d; INV_ACC = i; }

export function simulate(seed = 7) {
  const r = mulberry32(seed);
  const L = buildLayout();
  const O = new Obstacles(L);
  let curT = 0;
  const sepGrid = new Map();
  // fighting positions must not sit inside anything solid
  for (const p of L.positions) { const [x, z] = O.pushOut(p.x, p.z, 0.6, heightAt(p.x, p.z), null); p.x = x; p.z = z; }
  const actors = [];

  // ---------- invaders from amphibious vehicles and hovercraft ----------
  L.vehicles.forEach((v, vi) => {
    for (let k = 0; k < v.cap; k++) {
      const a = baseActor(actors.length, 1);
      a.veh = vi; a.slot = k;
      if (v.type === 'aav') {
        a.lx = (k % 2 ? 0.55 : -0.55); a.lz = -2.2 + Math.floor(k / 2) * 0.9;
        a.disembark = v.tArrive + 2.0 + k * 0.34 + r() * 0.12;
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

  // ---------- defenders by helicopter (insertion + reinforcement) ----------
  L.helos.forEach((h, hi) => {
    for (let k = 0; k < h.cap; k++) {
      const a = baseActor(actors.length, 0);
      a.helo = hi; a.slot = k;
      a.te = h.tTouch + 1.3 + k * 0.4;
      a.spawn = a.te;
      a.exitX = h.x + (k % 2 ? 1.9 : -1.9); a.exitZ = h.z + (Math.floor(k / 2) - 2) * 0.65;
      a.speedRun = 4.4 + r() * 0.6;
      actors.push(a);
    }
  });
  {
    const crest = L.positions.filter((p) => p.line === 0).sort((p, q) => p.x - q.x);
    const rear = L.positions.filter((p) => p.line === 1);
    const waveA = actors.filter((a) => a.side === 0 && a.helo < 3).sort((p, q) => p.exitX - q.exitX);
    const waveB = actors.filter((a) => a.side === 0 && a.helo >= 3).sort((p, q) => p.exitX - q.exitX);
    const stepA = crest.length / waveA.length;
    waveA.forEach((a, i) => { a.fp = { ...crest[Math.min(crest.length - 1, Math.floor(i * stepA))] }; });
    const poolB = rear.concat(crest.filter((_, i) => i % 3 === 1).map((p) => ({ ...p, x: p.x + 2.6, z: -(crestD(p.x + 2.6) + 2) })));
    waveB.forEach((a, i) => { a.fp = { ...poolB[i % poolB.length] }; });
  }
  actors.forEach((a) => { a.mg = (a.side === 0 && a.id % 4 === 0) || (a.side === 1 && a.id % 6 === 0); });

  actors.forEach((a) => { a.id_ = makeIdentity(a.side, a.id); });

  // ---------- strikes ----------
  const explosions = [];
  const missiles = [];
  const bigHouses = L.houses.filter((h) => h.floors === 2);
  const ex = (o) => explosions.push(Object.assign({ done: false, big: 1, side: 1, sy: 30 }, o));
  // naval guns, FPV drones (often in pairs) and house hits on the defenders; defender artillery on the flats
  for (let t = 18; t < T_SIM - 3; t += 1.5 + r() * 1.7) {
    const roll = r();
    if (roll < 0.58) {
      const p = L.positions[Math.floor(r() * L.positions.length)];
      const drone = r() < 0.45;
      const n = drone && r() < 0.5 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const ix = p.x + (r() - 0.5) * 14, iz = p.z + (r() - 0.6) * 14;
        ex({ launchT: t + k * 0.8 - (drone ? 9 : 3.2), t: t + k * 0.8, sx: ix + (r() - 0.5) * 200, sz: 900, ix, iy: Math.max(heightAt(ix, iz), 0), iz, kind: drone ? 'drone' : 'shell' });
      }
    } else if (roll < 0.68 && bigHouses.length) {
      const h = bigHouses[Math.floor(r() * bigHouses.length)];
      const ix = h.x + (r() - 0.5) * 8, iz = h.z + (r() - 0.5) * 6;
      ex({ launchT: t - 3.2, t, sx: ix, sz: 900, ix, iy: heightAt(ix, iz) + 3, iz, kind: 'shell', house: true, big: 1.2 });
    } else {
      const ix = (r() - 0.5) * 220, iz = 4 + r() * 100;
      ex({ launchT: t - 3.2, t, sx: ix + (r() - 0.5) * 200, sz: -900, ix, iy: Math.max(heightAt(ix, iz), 0), iz, side: 0, kind: 'shell' });
    }
  }
  // defender rocket artillery ripples across the flats
  [47, 98, 151, 179].forEach((t0) => {
    const cx = (r() - 0.5) * 120;
    for (let k = 0; k < 16; k++) {
      const t = t0 + k * 0.19 + r() * 0.1, ix = cx + (r() - 0.5) * 120, iz = 6 + r() * 70;
      ex({ launchT: t - 4, t, sx: ix * 0.3, sz: -1400, sy: 200, ix, iy: Math.max(heightAt(ix, iz), 0), iz, side: 0, kind: 'mlrs', big: 1.25 });
    }
  });
  // mortar barrages (own random stream so the rest of the battle stays put). 120 mm tubes fire from the
  // landing ships offshore onto the dunes; the defenders' 81 mm section behind the lot walks rounds along the flats.
  {
    const rm = mulberry32(seed * 7919 + 13);
    for (let t = 22; t < T_SIM - 4; t += 4.5 + rm() * 6) {
      const inv = rm() < 0.55, n = 3 + Math.floor(rm() * 4);
      let cx, cz;
      if (inv) { const p = L.positions[Math.floor(rm() * L.positions.length)]; cx = p.x + (rm() - 0.5) * 10; cz = p.z + (rm() - 0.5) * 10; }
      else { cx = (rm() - 0.5) * 200; cz = 8 + rm() * 95; }
      const sx = (rm() - 0.5) * 160, sz = inv ? 330 + rm() * 80 : -230 - rm() * 40, tof = 13 + rm() * 5;
      for (let k = 0; k < n; k++) {
        const tk = t + k * (0.6 + rm() * 1.1);
        const ix = cx + (rm() - 0.5) * (inv ? 16 : 26), iz = cz + (rm() - 0.5) * (inv ? 14 : 22);
        ex({ launchT: tk - tof, t: tk, sx, sy: inv ? 6 : 4, sz, ix, iy: Math.max(heightAt(ix, iz), 0), iz, side: inv ? 1 : 0, kind: 'mortar', big: inv ? 0.95 : 0.8 });
      }
    }
  }
  // gunship rocket salvos at the crest
  const gp = {};
  L.gunships.forEach((g, gi) => {
    const end = g.downT > 0 ? g.downT - 1 : T_SIM - 2;
    for (let t = g.tIn + 6; t < end; t += 13 + r() * 8) {
      const p = L.positions[Math.floor(r() * L.positions.length)];
      for (let k = 0; k < 6; k++) {
        const lt = t + k * 0.16; gunshipPose(g, lt, gp);
        const ix = p.x + (r() - 0.5) * 26, iz = p.z + (r() - 0.45) * 22;
        ex({ launchT: lt, t: lt + 1.5, sx: gp.x, sy: gp.y - 1, sz: gp.z, ix, iy: Math.max(heightAt(ix, iz), 0), iz, kind: 'rocket', big: 1.15, gi });
      }
    }
    if (g.downT > 0) {
      // MANPADS from the dunes; air burst; burning crash into the bay
      const p = L.positions[5];
      gunshipPose({ ...g, downT: -1 }, g.downT, gp);
      missiles.push({ kind: 'manpad', launchT: g.downT - 3.4, t: g.downT, sx: p.x, sy: heightAt(p.x, p.z) + 1.4, sz: p.z, ix: gp.x, iy: gp.y, iz: gp.z, arc: 10 });
      ex({ launchT: g.downT - 3.4, t: g.downT, sx: p.x, sy: 0, sz: p.z, ix: gp.x, iy: gp.y, iz: gp.z, kind: 'airburst', big: 1.4, side: 0, mi: missiles.length - 1, air: true });
      const c = gunshipPose(g, g.downT + 6.49, {});
      ex({ launchT: g.downT, t: g.downT + 6.5, sx: c.x, sy: 0, sz: c.z, ix: c.x, iy: 0, iz: c.z, kind: 'crash', big: 3, side: 0 });
    }
  });
  // anti-armour missiles on vehicles
  L.vehicles.forEach((v, vi) => {
    if (v.destroyT < 0) return;
    const p = L.positions[Math.floor(r() * L.positions.length)];
    const vy = v.type === 'aav' ? 2.2 : 2.5;
    missiles.push({ kind: 'javelin', vi, launchT: v.destroyT - 3.2, t: v.destroyT, sx: p.x, sy: heightAt(p.x, p.z) + 1.3, sz: p.z, ix: v.x, iy: vy, iz: v.zStop, arc: 48 });
    ex({ launchT: v.destroyT - 3.2, t: v.destroyT, sx: p.x, sy: 0, sz: p.z, ix: v.x, iy: vy, iz: v.zStop, side: 0, kind: 'vehicle', vi, big: 2, mi: missiles.length - 1 });
  });
  explosions.sort((p, q) => p.t - q.t);

  const simSteps = Math.round(T_SIM / DT) + 1;
  const steps = Math.round(T_SIM * HZ) + 1;
  const N = actors.length;
  const rec = new Float32Array(N * steps * F);
  const shots = [];
  const pending = [];
  const deaths = [];

  const tgtList = [];
  for (let s = 0; s < simSteps; s++) {
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
      if (e.air) continue;
      for (const a of actors) {
        if (!a.alive || a.mode !== MODE.GROUND) continue;
        const d = Math.hypot(a.x - e.ix, a.z - e.iz);
        // dug-in defenders crouched behind sandbags are much harder to kill
        const cover = a.side === 0 && a.state === 'defend' && a.crouch > 0.6 ? 0.55 : 1;
        const kr = (e.big > 2 ? 9 : e.big > 1.5 ? 4.5 : 2.3 * e.big) * cover, wr = (e.big > 2 ? 20 : e.big > 1.5 ? 10 : 6 * e.big) * cover;
        if (d < kr) kill(a, e.t, -1, a.x - e.ix, a.z - e.iz, e.kind);
        else if (d < wr) { a.hp -= 60 * (1 - d / wr); if (a.hp <= 0) kill(a, e.t, -1, a.x - e.ix, a.z - e.iz, e.kind); }
      }
    }

    curT = t;
    for (const a of actors) {
      if (!a.alive) { a.speed = 0; continue; }
      if (a.side === 1) updateInvader(a, t); else updateDefender(a, t);
      if (a.mode === MODE.GROUND) combat(a, t);
      // smooth stance
      a.crouch += clamp(a.crouchT - a.crouch, -4 * DT, 4 * DT);
    }

    // personal space: soldiers don't walk through each other
    separate(t);

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
      const mx = v.x, my = Math.max(heightAt(v.x, v.zStop), -0.9) + 2.55, mz = v.zStop - 4.6;
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

    // gunship chin guns
    L.gunships.forEach((g, gi) => {
      if (t < g.tIn + 3 || (g.downT > 0 && t >= g.downT)) return;
      if (g.nextBurst === undefined) { g.nextBurst = t + 2; g.burst = 0; }
      if (t < g.nextBurst) return;
      if (g.burst <= 0) {
        const live = actors.filter((b) => b.side === 0 && b.alive && b.mode === MODE.GROUND);
        if (!live.length) { g.nextBurst = t + 2; return; }
        g.tgt = live[Math.floor(r() * live.length)].id; g.burst = 14 + Math.floor(r() * 10);
      }
      const b = actors[g.tgt]; gunshipPose(g, t, gp);
      const mx = gp.x, my = gp.y - 1.6, mz = gp.z - 4;
      const hit = b.alive && r() < 0.035;
      let ix = b.x + (r() - 0.5) * 5, iz = b.z + (r() - 0.5) * 5, iy = heightAt(ix, iz) + 0.05;
      if (hit) { ix = b.x; iy = b.y + 1; iz = b.z; }
      const len = Math.hypot(ix - mx, iy - my, iz - mz), impT = t + len / BULLET_SPEED;
      shots.push({ fireT: t, impT, fx: mx, fy: my, fz: mz, ix, iy, iz, shooter: -100 - gi, target: hit ? b.id : -1, kind: hit ? 3 : 1 });
      if (hit) pending.push({ t: impT, target: b.id, dmg: 120, shooter: -1, dx: b.x - mx, dz: b.z - mz });
      g.burst--; g.nextBurst = g.burst > 0 ? t + 0.07 : t + 3 + r() * 4;
    });

    // record (10 Hz)
    if (s % 2 === 0) for (let i = 0; i < N; i++) {
      const a = actors[i];
      const o = (i * steps + s / 2) * F;
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

  // steer toward (tx,tz), sliding along obstacles; when stuck, take a detour around them
  function moveTo(a, tx, tz, speed, ignoreVeh = -1) {
    if (a.detour && (curT > a.detour.until || Math.hypot(a.detour.x - a.x, a.detour.z - a.z) < 0.6)) a.detour = null;
    const gx = a.detour ? a.detour.x : tx, gz = a.detour ? a.detour.z : tz;
    const dx = gx - a.x, dz = gz - a.z;
    const d = Math.hypot(dx, dz);
    let sp = speed;
    if (heightAt(a.x, a.z) < -0.25) sp *= 0.55; // wading through the pools
    const st = sp * DT;
    const fd = Math.hypot(tx - a.x, tz - a.z);
    if (!a.detour && fd <= st) { a.x = tx; a.z = tz; a.speed = fd / DT; a.stuck = 0; return true; }
    const ox = a.x, oz = a.z;
    let nx = a.x + (dx / (d || 1)) * Math.min(st, d), nz = a.z + (dz / (d || 1)) * Math.min(st, d);
    [nx, nz] = O.pushOut(nx, nz, 0.32, a.y, curT, ignoreVeh);
    a.x = nx; a.z = nz;
    const moved = Math.hypot(nx - ox, nz - oz);
    a.speed = moved / DT;
    a.stuck = moved < st * 0.35 ? (a.stuck || 0) + DT : Math.max(0, (a.stuck || 0) - DT);
    if (a.stuck > 0.8 && !a.detour) {
      // try both sides, perpendicular to the goal direction, and pick one that is clear
      const ux = (tx - a.x) / (fd || 1), uz = (tz - a.z) / (fd || 1);
      let best = null;
      for (const dist of [4, 7, 11]) for (const sd of (a.id % 2 ? [1, -1] : [-1, 1])) {
        const px = a.x - uz * sd * dist + ux * 1.5, pz = a.z + ux * sd * dist + uz * 1.5;
        const [qx, qz] = O.pushOut(px, pz, 0.4, O.surfaceY(px, pz), curT, ignoreVeh);
        if (Math.hypot(qx - px, qz - pz) < 0.05) { best = { x: px, z: pz }; break; }
        if (best) break;
      }
      if (best) a.detour = { ...best, until: curT + 4 };
      a.stuck = 0;
    }
    if (a.speed > 0.2) turn(a, Math.atan2(nx - ox, nz - oz), 6);
    return false;
  }
  function separate(t) {
    const grid = sepGrid;
    grid.clear();
    for (const a of actors) {
      if (!a.alive || a.mode !== MODE.GROUND) continue;
      const k = Math.floor(a.x / 1.5) * 4096 + Math.floor(a.z / 1.5);
      let l = grid.get(k); if (!l) grid.set(k, (l = [])); l.push(a);
    }
    for (const a of actors) {
      if (!a.alive || a.mode !== MODE.GROUND) continue;
      const cx = Math.floor(a.x / 1.5), cz = Math.floor(a.z / 1.5);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const l = grid.get((cx + i) * 4096 + cz + j); if (!l) continue;
        for (const b of l) {
          if (b.id <= a.id) continue;
          const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), m = 0.62;
          if (d >= m || d < 1e-4) continue;
          const push = (m - d) / 2 / d;
          const am = a.speed > 0.2 || a.state !== 'defend', bm = b.speed > 0.2 || b.state !== 'defend';
          const wa = am && bm ? 1 : am ? 2 : 0, wb = am && bm ? 1 : bm ? 2 : 0;
          a.x -= dx * push * wa; a.z -= dz * push * wa; b.x += dx * push * wb; b.z += dz * push * wb;
        }
      }
    }
  }
  function turn(a, want, rate) {
    let d = want - a.yaw;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    a.yaw += clamp(d, -rate * DT, rate * DT);
  }
  function ground(a) { a.y = O.surfaceY(a.x, a.z, a.y, curT); }

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
      const done = moveTo(a, p.x, p.z, a.speedRun * 0.8, a.veh);
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
      const vis = [];
      for (let k = 0; k < tgtList.length && k < 7 && vis.length < 3; k++) {
        const b = actors[tgtList[k][1]];
        if (O.segment(a.x, a.y + 1.4, a.z, b.x, b.y + 1.2, b.z, t, a.veh ?? -1) < 0) vis.push(b.id);
      }
      a.target = vis.length ? vis[Math.floor(r() * vis.length)] : -1;
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
      a.burst = a.mg ? 10 + Math.floor(r() * 14) : 3 + Math.floor(r() * 5);
      a.nextShot = t + (a.side === 0 ? 0.35 : 0.25);
      return;
    }
    if (t < a.nextShot) return;
    // fire
    const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
    const mx = a.x + fx * 0.75 - fz * 0.1, mz = a.z + fz * 0.75 + fx * 0.1;
    let hitP = 0;
    if (b.mode === MODE.GROUND) {
      const base = (a.side === 0 ? DEF_ACC : INV_ACC) * (a.mg ? 0.55 : 1);
      const rangeF = clamp(35 / dh, 0.12, 1.3);
      let cover = 1;
      if (b.side === 0) cover = b.state === 'defend' ? (b.crouch > 0.6 ? 0.05 : 0.35) : 0.8;
      else cover = b.state === 'cover' ? (b.crouch > 0.8 ? 0.4 : 0.65) : 0.95;
      hitP = base * rangeF * cover;
    }
    // fire on the gun's own cadence, not the 20 Hz sim tick (real cyclic rates: M240 ~650-950 rpm, PKM ~650-750)
    const tf = Math.min(t, Math.max(t - DT + 1e-3, a.nextShot));
    const shot = { fireT: tf, shooter: a.id, target: -1, fx: mx, fy: my, fz: mz };
    if (r() < hitP) {
      shot.ix = b.x + (r() - 0.5) * 0.3; shot.iy = aimY + (r() - 0.5) * 0.3; shot.iz = b.z + (r() - 0.5) * 0.3;
      shot.kind = 3; shot.target = b.id;
      const len = Math.hypot(shot.ix - mx, shot.iy - my, shot.iz - mz);
      shot.impT = tf + len / BULLET_SPEED;
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
      const hb = O.segment(mx, my, mz, px, py, pz, t, a.veh ?? -1);
      if (hb > 0.02) { px = mx + (px - mx) * hb; py = my + (py - my) * hb; pz = mz + (pz - mz) * hb; hit = 4; }
      shot.ix = px; shot.iy = py; shot.iz = pz; shot.kind = hit;
      shot.impT = tf + Math.hypot(px - mx, py - my, pz - mz) / BULLET_SPEED;
    }
    shots.push(shot);
    a.burst--; a.mag--;
    a.nextShot = tf + (a.mg ? (a.side === 0 ? 0.075 : 0.086) : 0.085 + r() * 0.04);
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
  const lateDef = actors.filter((a) => a.side === 0 && a.deathTime > 168 && a.deathTime < T_SIM - 4 && a.cause === 'shot');
  lateDef.sort((p, q) => Math.abs(p.fp.x) - Math.abs(q.fp.x));
  if (lateDef.length) start = lateDef[0];
  else {
    const anyDef = actors.filter((a) => a.side === 0 && a.deathTime > 60).sort((p, q) => q.deathTime - p.deathTime);
    start = anyDef[0] || actors.find((a) => a.side === 0);
  }
  // the tape opens on a mortar: your first body is caught by a round, and the game begins with that blast
  // running backwards — fire sucked into the crater, the body flying back together, the round leaving the ground
  if (start.deathTime > 0) {
    const ra = mulberry32(seed * 31 + 5), dt = start.deathTime;
    const ang = start.yaw + Math.PI * (0.6 + ra() * 0.8), off = 1.3 + ra() * 0.6;
    const ix = start.x + Math.sin(ang) * off, iz = start.z + Math.cos(ang) * off;
    explosions.push({ done: true, big: 1.05, side: 1, sy: 6, kind: 'mortar', launchT: dt - 15.5, t: dt, sx: (ra() - 0.5) * 140, sz: 350, ix, iy: Math.max(heightAt(ix, iz), 0), iz, opener: true });
    explosions.sort((p, q) => p.t - q.t);
    // the bullet that killed him in the sim now goes into the sand instead
    for (let i = 0; i < shots.length; i++) {
      const o = i * SHOT_F;
      if (S[o + 9] === start.id && Math.abs(S[o + 1] - dt) < 0.08) { S[o + 9] = -1; S[o + 10] = 1; }
    }
    start.cause = 'mortar'; start.killer = -1;
    const de = deaths.find((d) => d.id === start.id); if (de) { de.cause = 'mortar'; de.killer = -1; }
  }
  const T_START = start.deathTime > 0 ? Math.min(start.deathTime + 6, T_SIM - 0.1) : T_SIM - 0.1;

  const statics = actors.map((a) => ({
    id: a.id, side: a.side, spawn: a.spawn, deathTime: a.deathTime, fallSign: a.fallSign, killer: a.killer, cause: a.cause,
    veh: a.veh ?? -1, helo: a.helo ?? -1, mg: a.mg, te: a.te ?? 0, ident: a.id_, reloads: Float32Array.from(a.reloads),
    skin: r(),
  }));

  return { L, N, steps, rec, obstacles: O, missiles, shots: S, nShots: shots.length, byImpact, explosions, deaths, actors: statics, startId: start.id, T_START };
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
