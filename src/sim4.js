// East Sandwich, scene 4 of the Cape Cod track, simulated forward like the beach and played backwards.
//   0–11 s   the UH-60 carrying your squad comes in low over the pines; a missile from the woods; it spins in
//   11–20 s  survivors climb out of the wreck; Texan squads come out of the houses where they'd been hiding
//   20–166 s yard to yard, house to house, north across 6A toward the meadow by the marsh
//   166 s    the extraction touches down; the squad runs for it under fire and boards; it lifts at 186 s
// Same recording format as the beach, so playback, soldiers, possession and the rest just work.
import { mulberry32, clamp, lerp } from './rng.js';
import { heightFast as heightAt } from './terrain.js';
import { buildSandwichLayout } from './layout4.js';
import { heloPose } from './layout.js';
import { road6A, LZ, CRASH } from './terrain4.js';
import { makeIdentity } from './names.js';
import { Obstacles } from './obstacles.js';
import { styleOf, gaitStride } from './gait.js';
import { computeDestruction } from './destruction.js';
import { DT, HZ, T_SIM, F, MODE, SHOT_F, BULLET_SPEED } from './sim.js';

export function simulateSandwich(seed = 4, opts = {}) {
  const r = mulberry32(seed);
  const L = buildSandwichLayout();
  const O = new Obstacles(L);
  let curT = 0;
  const sepGrid = new Map();
  for (const p of L.positions) { const [x, z] = O.pushOut(p.x, p.z, 0.6, heightAt(p.x, p.z), null); p.x = x; p.z = z; }
  const actors = [], squads = [];
  const H0 = L.helos[0], H1 = L.helos[1];

  // ---------- your squad: out of the wreck ----------
  const squad = (side, members, script, extra = {}) => { const s = { id: squads.length, side, members: [], script, ...extra }; squads.push(s); for (let k = 0; k < members; k++) { const a = baseActor(actors.length, side); a.squad = s.id; a.slot = k; s.members.push(a); actors.push(a); } return s; };
  const RT = road6A;
  const crashSq = squad(0, 6, [[0, CRASH.x, CRASH.z, 16], [30, 32, RT(32) - 20, 14], [56, 22, RT(22) - 8, 12], [86, -4, RT(-4) + 16, 14], [116, -34, 34, 16], [146, -50, 42, 14]], { crash: true });
  crashSq.members.forEach((a, k) => { a.spawn = H0.tDown + 2.2 + k * 0.9; a.from = { x: CRASH.x + 2.4 * (k % 2 ? 1 : -1), z: CRASH.z + (k - 2.5) * 0.7 }; a.helo = 0; a.te = a.spawn; });
  const reSq = squad(0, 6, [[0, -98, RT(-98) + 12, 14], [80, -84, RT(-84) + 18, 14], [114, -74, 34, 14], [144, -66, 44, 14]]);   // up 6A from the east
  reSq.members.forEach((a, k) => { a.spawn = 48 + k * 0.7; a.from = { x: -117, z: RT(-117) + (k % 2 ? 1.5 : -1.5) }; });
  // ---------- Texans: one team in the woods with the missile, five out of the houses, two more down 6A ----------
  const houseNear = (x, z) => { let b = null, bd = 1e9; for (const h of L.houses) { const d = Math.hypot(h.x - x, h.z - z); if (d < bd) { bd = d; b = h; } } return b; };
  const door = (h) => { const lz = h.l / 2 + 1.0; return { x: h.x + lz * Math.sin(h.rot), z: h.z + lz * Math.cos(h.rot) }; };
  const woods = squad(1, 4, [[0, CRASH.x - 26, CRASH.z + 22, 12]], { hunt: 40 });
  woods.members.forEach((a, k) => { a.spawn = 0; a.from = { x: CRASH.x - 30 + k * 3, z: CRASH.z + 20 + (k % 2) * 3 }; });
  const startHouses = [[20, -30], [-8, 20], [62, 14], [-40, -8], [40, 40]];
  startHouses.forEach(([hx, hz], i) => {
    const h = houseNear(hx, hz), d = door(h);
    const s = squad(1, 3, [[0, d.x, d.z, 12]], { hunt: 18 + i * 6, house: L.houses.indexOf(h) });
    s.members.forEach((a, k) => { a.spawn = 12 + i * 4 + k * 0.8 + r(); a.from = { x: d.x + (k - 1.5) * 0.4, z: d.z }; a.inside = { x: h.x, z: h.z }; });
  });
  for (const [i, x0] of [[0, 118], [1, 118]]) {   // down 6A from the west
    const s = squad(1, 3, [[0, 100, RT(100) + (i ? 14 : -14), 14]], { hunt: 100 });
    s.members.forEach((a, k) => { a.spawn = 92 + i * 3 + k * 0.6; a.from = { x: x0, z: RT(x0) + (i ? 2 : -2) + (k - 1.5) * 0.6 }; });
  }
  // the protagonist is whoever you were on the beach: same name, same face
  const me = crashSq.members[0];
  me.hp = 1e9; me.me = true;
  actors.forEach((a) => { a.mg = a.side === 0 ? a.slot === 2 : a.slot === 3; a.speedRun = 3.9 + r() * 0.8; a.state = 'wait'; });
  actors.forEach((a) => { a.id_ = makeIdentity(a.side, a.id + 1000 * 4); });
  if (opts.ident) me.id_ = opts.ident;

  // ---------- ordnance, planned up front so the houses and craters can be worked out ----------
  const explosions = [], missiles = [];
  const ex = (o) => explosions.push(Object.assign({ done: false, big: 1, side: 1, sy: 30 }, o));
  // the missile that brings you down
  { const sh = woods.members[1].from, p = heloPose(H0, H0.tHit, {});
    missiles.push({ kind: 'manpad', launchT: H0.tHit - 3.2, t: H0.tHit, sx: sh.x, sy: heightAt(sh.x, sh.z) + 1.4, sz: sh.z, ix: p.x, iy: p.y, iz: p.z, arc: 8 });
    ex({ launchT: H0.tHit - 3.2, t: H0.tHit, sx: sh.x, sy: 0, sz: sh.z, ix: p.x, iy: p.y + 1.5, iz: p.z, kind: 'airburst', big: 1.2, mi: missiles.length - 1, air: true });
    ex({ launchT: H0.tHit, t: H0.tDown, sx: CRASH.x, sy: 0, sz: CRASH.z, ix: CRASH.x, iy: H0.y, iz: CRASH.z, kind: 'crash', big: 2.6, persist: true }); }
  // RPGs into the houses your squad fights from, and Texan mortar rounds walking toward the meadow at the end
  const rp = mulberry32(seed * 31 + 7);
  for (const [t, gx, gz] of [[38, 30, -24], [64, 22, -12], [97, -6, 18], [122, -30, 30], [131, 4, 26], [153, -44, 40]]) {
    const h = houseNear(gx, gz), sx = h.x + (rp() - 0.5) * 70, sz = h.z - 45 + (rp() - 0.5) * 20;
    ex({ launchT: t - 1.6, t, sx, sy: heightAt(sx, sz) + 1.4, sz, ix: h.x + (rp() - 0.5) * h.w * 0.6, iy: heightAt(h.x, h.z) + 2.4, iz: h.z + (rp() - 0.5) * h.l * 0.6, kind: 'rocket', house: true, big: 1.1 });
  }
  for (let t = 158; t < 186; t += 2.6 + rp() * 2.5) {
    const ix = LZ.x + (rp() - 0.5) * 60, iz = LZ.z - 18 + (rp() - 0.5) * 40;
    ex({ launchT: t - 14, t, sx: ix - 200, sy: 6, sz: iz - 260, ix, iy: heightAt(ix, iz), iz, kind: 'mortar', big: 0.85 });
  }
  // a car on 6A, hit by a rocket meant for the squad behind it
  { const ci = L.cars.length - 2, [cx, cz] = L.cars[ci]; ex({ launchT: 101.4, t: 103, sx: cx - 60, sy: heightAt(cx - 60, cz) + 1.4, sz: cz - 8, ix: cx, iy: heightAt(cx, cz) + 0.6, iz: cz, kind: 'rocket', big: 1.4, car: ci }); }
  explosions.sort((p, q) => p.t - q.t);
  const D = computeDestruction(L, explosions);
  O.setDestruction(D);

  // ---------- a walking grid (2 m) around houses, walls, hedges, trees and cars; paths are found with A* ----------
  const NC = 2, NX = Math.ceil((L.ARENA.x1 - L.ARENA.x0) / NC), NZ = Math.ceil((L.ARENA.z1 - L.ARENA.z0) / NC), blk = new Uint8Array(NX * NZ);
  const cellX = (i) => L.ARENA.x0 + (i + 0.5) * NC, cellZ = (j) => L.ARENA.z0 + (j + 0.5) * NC;
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const x = cellX(i), z = cellZ(j);
    for (const o of O.near(x, z, 1.4)) {
      if (o.hx !== undefined) { const [lx, lz] = Obstacles.local(o, x, z); if (Math.abs(lx) < o.hx + 0.65 && Math.abs(lz) < o.hz + 0.65) { blk[j * NX + i] = 1; break; } }
      else if (Math.hypot(x - o.x, z - o.z) < o.r + 0.55) { blk[j * NX + i] = 1; break; }
    }
  }
  const toCell = (x, z) => [clamp(Math.floor((x - L.ARENA.x0) / NC), 0, NX - 1), clamp(Math.floor((z - L.ARENA.z0) / NC), 0, NZ - 1)];
  const clearLine = (x0, z0, x1, z1) => { const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.8); for (let k = 1; k < n; k++) { const [i, j] = toCell(x0 + (x1 - x0) * k / n, z0 + (z1 - z0) * k / n); if (blk[j * NX + i]) return false; } return true; };
  const gS = new Float32Array(NX * NZ), came = new Int32Array(NX * NZ), seen = new Uint32Array(NX * NZ); let stamp = 0;
  function findPath(x0, z0, x1, z1) {
    if (clearLine(x0, z0, x1, z1)) return [{ x: x1, z: z1 }];
    stamp++;
    const [si, sj] = toCell(x0, z0); let [ti, tj] = toCell(x1, z1);
    if (blk[tj * NX + ti]) { // nearest open cell to the goal
      let bd = 1e9; for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) { const i = ti + di, j = tj + dj; if (i < 0 || j < 0 || i >= NX || j >= NZ || blk[j * NX + i]) continue; const d = di * di + dj * dj; if (d < bd) { bd = d; ti = i; tj = j; } } }
    const open = [[0, si, sj]], s0 = sj * NX + si, goal = tj * NX + ti; gS[s0] = 0; seen[s0] = stamp; came[s0] = -1;
    let found = false, iters = 0;
    while (open.length && iters++ < 6000) {
      let bi = 0; for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k;
      const [, ci, cj] = open[bi]; open[bi] = open[open.length - 1]; open.pop();
      const c = cj * NX + ci; if (c === goal) { found = true; break; }
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue; const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= NX || j >= NZ) continue;
        const n = j * NX + i; if (blk[n] && n !== goal) continue;
        if (di && dj && (blk[cj * NX + i] || blk[j * NX + ci])) continue;
        const g = gS[c] + (di && dj ? 1.414 : 1);
        if (seen[n] === stamp && gS[n] <= g) continue;
        seen[n] = stamp; gS[n] = g; came[n] = c; open.push([g + Math.hypot(ti - i, tj - j), i, j]);
      }
    }
    if (!found) return [{ x: x1, z: z1 }];
    const pts = []; for (let c = goal; c >= 0 && c !== s0; c = came[c]) pts.push({ x: cellX(c % NX), z: cellZ(Math.floor(c / NX)) });
    pts.reverse(); pts.push({ x: x1, z: z1 });
    // string-pull: keep only the corners
    const out = []; let px = x0, pz = z0, k = 0;
    while (k < pts.length) { let far = k; for (let m = pts.length - 1; m > k; m--) if (clearLine(px, pz, pts[m].x, pts[m].z)) { far = m; break; } out.push(pts[far]); px = pts[far].x; pz = pts[far].z; k = far + 1; }
    return out;
  }
  function go(a, tx, tz, speed) {
    if (!a.path || a.pathKey !== tx * 13 + tz) { a.path = findPath(a.x, a.z, tx, tz); a.pathKey = tx * 13 + tz; a.pathI = 0; }
    const p = a.path[Math.min(a.pathI, a.path.length - 1)];
    const done = moveTo(a, p.x, p.z, speed);
    if (done || Math.hypot(p.x - a.x, p.z - a.z) < 0.5) { if (a.pathI >= a.path.length - 1) return true; a.pathI++; }
    if (a.stuck > 0.6) { a.path = null; }
    return false;
  }

  const simSteps = Math.round(T_SIM / DT) + 1, steps = Math.round(T_SIM * HZ) + 1, N = actors.length;
  const rec = new Float32Array(N * steps * F), shots = [], pending = [], deaths = [], tgtList = [];
  const taken = new Map();   // cover position index -> actor id
  const doors = [-1.95, 1.95];

  for (let s = 0; s < simSteps; s++) {
    const t = s * DT; curT = t;
    for (let i = pending.length - 1; i >= 0; i--) {
      const h = pending[i]; if (h.t > t) continue;
      pending.splice(i, 1);
      const tg = actors[h.target]; if (!tg.alive) continue;
      tg.hp -= h.dmg; tg.hitFlinch = t;
      if (tg.hp <= 0) kill(tg, h.t, h.shooter, h.dx, h.dz, 'shot');
    }
    for (const e of explosions) {
      if (e.done || e.t > t) continue;
      e.done = true; if (e.air) continue;
      for (const a of actors) {
        if (!a.alive || a.mode !== MODE.GROUND || a.me) continue;
        const d = Math.hypot(a.x - e.ix, a.z - e.iz), kr = 2.2 * e.big, wr = 6 * e.big;
        if (d < kr) kill(a, e.t, -1, a.x - e.ix, a.z - e.iz, e.kind);
        else if (d < wr) { a.hp -= 55 * (1 - d / wr); if (a.hp <= 0) kill(a, e.t, -1, a.x - e.ix, a.z - e.iz, e.kind); }
      }
    }
    // where each squad is headed now
    for (const q of squads) {
      let w = q.script[0]; for (const st of q.script) if (t >= st[0]) w = st;
      q.gx = w[1]; q.gz = w[2]; q.gr = w[3];
      if (q.side === 1 && q.hunt != null && t > q.hunt) {   // Texans hunt: close on the nearest of your people, stay at fighting range
        if (!q.nextHunt || t > q.nextHunt) {
          q.nextHunt = t + 12 + r() * 8;
          const live = q.members.filter((a) => a.alive && a.mode === MODE.GROUND);
          if (live.length) {
            const cx = live.reduce((s2, a) => s2 + a.x, 0) / live.length, cz = live.reduce((s2, a) => s2 + a.z, 0) / live.length;
            let best = null, bd = 1e9;
            for (const b of actors) if (b.side === 0 && b.alive && b.mode === MODE.GROUND) { const d = Math.hypot(b.x - cx, b.z - cz); if (d < bd) { bd = d; best = b; } }
            if (t > H1.tTouch - 10) best = { x: LZ.x, z: LZ.z - 6 };
            if (best) { const d = Math.hypot(best.x - cx, best.z - cz) || 1, keep = t > H1.tTouch - 10 ? 46 : 30 + r() * 12; q.hx = best.x + (cx - best.x) / d * keep; q.hz = best.z + (cz - best.z) / d * keep; }
          }
        }
        if (q.hx != null) { q.gx = q.hx; q.gz = q.hz; q.gr = 14; }
      }
    }
    for (const a of actors) {
      if (!a.alive) { a.speed = 0; continue; }
      updateActor(a, t);
      if (a.mode === MODE.GROUND) combat(a, t);
      a.crouch += clamp(a.crouchT - a.crouch, -4 * DT, 4 * DT);
    }
    separate();
    if (opts.debug && s % 100 === 0) opts.debug(t, me);
    if (s % 2 === 0) for (let i = 0; i < N; i++) {
      const a = actors[i], o = (i * steps + s / 2) * F;
      rec[o] = a.x; rec[o + 1] = a.y; rec[o + 2] = a.z; rec[o + 3] = a.yaw; rec[o + 4] = a.pitch;
      rec[o + 5] = a.crouch; rec[o + 6] = a.speed; rec[o + 7] = a.phase; rec[o + 8] = a.alive ? a.mode : MODE.DEAD;
    }
  }

  // ---------------- helpers ----------------
  function baseActor(id, side) {
    return { id, side, alive: true, hp: 100, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, crouch: 1, crouchT: 1, speed: 0, phase: r() * 6, mode: MODE.HIDDEN, state: 'wait', target: -1, retarget: 0,
      burst: 0, nextShot: 0, pauseUntil: 0, mag: side ? 30 : 30, reloadUntil: 0, reloads: [], deathTime: -1, fallSign: -1, killer: -1, cause: '', hitFlinch: -9, cover: -1, holdUntil: 0 };
  }
  function kill(a, t, killer, dx, dz, cause) {
    a.alive = false; a.deathTime = t; a.killer = killer; a.cause = cause;
    a.fallSign = (Math.sin(a.yaw) * dx + Math.cos(a.yaw) * dz) > 0 ? 1 : -1;
    a.mode = MODE.DEAD; deaths.push({ id: a.id, t, killer, cause });
    if (a.cover >= 0) { taken.delete(a.cover); a.cover = -1; }
  }
  function moveTo(a, tx, tz, speed) {
    if (a.hitFlinch > 0) speed = Math.min(speed, 2.6);
    if (a.detour && (curT > a.detour.until || Math.hypot(a.detour.x - a.x, a.detour.z - a.z) < 0.6)) a.detour = null;
    const gx = a.detour ? a.detour.x : tx, gz = a.detour ? a.detour.z : tz;
    const dx = gx - a.x, dz = gz - a.z, d = Math.hypot(dx, dz), st = speed * DT, fd = Math.hypot(tx - a.x, tz - a.z);
    if (!a.detour && fd <= st) { a.x = tx; a.z = tz; a.speed = fd / DT; a.stuck = 0; return true; }
    const ox = a.x, oz = a.z;
    let nx = a.x + (dx / (d || 1)) * Math.min(st, d), nz = a.z + (dz / (d || 1)) * Math.min(st, d);
    [nx, nz] = O.pushOut(nx, nz, 0.32, a.y, curT);
    a.x = nx; a.z = nz;
    const moved = Math.hypot(nx - ox, nz - oz); a.speed = moved / DT;
    a.stuck = moved < st * 0.35 ? (a.stuck || 0) + DT : Math.max(0, (a.stuck || 0) - DT);
    if (a.stuck > 0.8 && !a.detour) {
      const ux = (tx - a.x) / (fd || 1), uz = (tz - a.z) / (fd || 1); let best = null;
      for (const dist of [4, 7, 11]) { for (const sd of (a.id % 2 ? [1, -1] : [-1, 1])) {
        const px = a.x - uz * sd * dist + ux * 1.5, pz = a.z + ux * sd * dist + uz * 1.5;
        const [qx, qz] = O.pushOut(px, pz, 0.4, O.surfaceY(px, pz), curT);
        if (Math.hypot(qx - px, qz - pz) < 0.05) { best = { x: px, z: pz }; break; } } if (best) break; }
      if (best) a.detour = { ...best, until: curT + 4 };
      a.stuck = 0;
    }
    if (a.speed > 0.2) turn(a, Math.atan2(nx - ox, nz - oz), 6);
    return false;
  }
  function separate() {
    const grid = sepGrid; grid.clear();
    for (const a of actors) { if (!a.alive || a.mode !== MODE.GROUND) continue; const k = Math.floor(a.x / 1.5) * 4096 + Math.floor(a.z / 1.5); let l = grid.get(k); if (!l) grid.set(k, (l = [])); l.push(a); }
    for (const a of actors) {
      if (!a.alive || a.mode !== MODE.GROUND) continue;
      const cx = Math.floor(a.x / 1.5), cz = Math.floor(a.z / 1.5);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const l = grid.get((cx + i) * 4096 + cz + j); if (!l) continue;
        for (const b of l) {
          if (b.id <= a.id) continue;
          const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), m = 0.62; if (d >= m || d < 1e-4) continue;
          const push = (m - d) / 2 / d; a.x -= dx * push; a.z -= dz * push; b.x += dx * push; b.z += dz * push;
        }
      }
    }
  }
  function turn(a, want, rate) { let d = want - a.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; a.yaw += clamp(d, -rate * DT, rate * DT); }
  function ground(a) { a.y = O.surfaceY(a.x, a.z, a.y, curT); }
  function advancePhase(a) { const stride = gaitStride(styleOf(a.id, a.mg), a.speed, a.crouch, a.hitFlinch > 0); a.phase += (a.speed * DT / stride) * Math.PI * 2; }
  // pick a free piece of cover near the squad's goal, a little way from the squadmates
  function pickCover(a, q) {
    if (a.cover >= 0) { taken.delete(a.cover); a.cover = -1; }
    let best = -1, bs = 1e9;
    for (let i = 0; i < L.positions.length; i++) {
      if (taken.has(i)) continue;
      const p = L.positions[i], dg = Math.hypot(p.x - q.gx, p.z - q.gz); if (dg > q.gr) continue;
      const sc = dg * 0.6 + Math.hypot(p.x - a.x, p.z - a.z) * 0.25 + r() * 6;
      if (sc < bs) { bs = sc; best = i; }
    }
    if (best >= 0) { taken.set(best, a.id); a.cover = best; a.cx = L.positions[best].x; a.cz = L.positions[best].z; }
    else { const ang = r() * 6.28, rr = r() * q.gr * 0.7; a.cx = q.gx + Math.cos(ang) * rr; a.cz = q.gz + Math.sin(ang) * rr; }
    a.goalKey = q.gx * 7 + q.gz;
  }
  function updateActor(a, t) {
    const q = squads[a.squad];
    if (a.state === 'gone') { a.mode = MODE.HIDDEN; a.speed = 0; const hp = heloPose(H1, t, {}); a.x = hp.x; a.y = hp.y + 1; a.z = hp.z; return; }
    if (t < a.spawn) {
      a.mode = MODE.HIDDEN; a.speed = 0;
      if (a.helo === 0) { const hp = heloPose(H0, t, {}); a.x = hp.x; a.y = hp.y + 1; a.z = hp.z; }
      else { const p = a.inside || a.from; a.x = p.x; a.z = p.z; a.y = heightAt(p.x, p.z); }
      return;
    }
    a.mode = MODE.GROUND;
    if (a.state === 'wait') { a.state = 'exit'; a.x = a.from.x; a.z = a.from.z; ground(a); a.yaw = a.side ? Math.PI : 0; a.crouchT = 0.5; a.exitUntil = t + 1.2; }
    if (a.state === 'exit') { a.speed = 0; ground(a); if (t > a.exitUntil) { a.state = 'move'; pickCover(a, q); } return; }
    // your side: once the extraction is down, everyone still standing runs for it
    if (a.side === 0 && t > H1.tTouch + 1.5 && a.state !== 'board') {
      a.state = 'board'; if (a.cover >= 0) { taken.delete(a.cover); a.cover = -1; }
      const hp = heloPose(H1, t, {}), dsd = doors[a.id % 2], c = Math.cos(hp.yaw), sn = Math.sin(hp.yaw);
      a.bx = hp.x + dsd * c + 1.2 * sn; a.bz = hp.z - dsd * sn + 1.2 * c;
      a.boardAfter = a.me ? H1.tLift - 4 : 0;   // you're the last one on
    }
    if (a.state === 'board') {
      a.crouchT = 0.35;
      const done = go(a, a.bx, a.bz, a.speedRun * 1.05); ground(a); advancePhase(a);
      if (done || (a.me && t > H1.tLift - 1.5)) { a.speed = 0; if (t >= a.boardAfter) { a.state = 'gone'; a.boardT = t; } else { turn(a, Math.atan2(LZ.x - 40 - a.x, LZ.z - 60 - a.z), 3); combat(a, t, true); } }
      return;
    }
    if (a.goalKey !== q.gx * 7 + q.gz && a.state === 'hold' && t > a.holdUntil - 2) { a.state = 'move'; pickCover(a, q); }
    if (a.state === 'move') {
      a.crouchT = 0.25;
      const done = go(a, a.cx, a.cz, a.speedRun); ground(a); advancePhase(a);
      // stop and shoot when someone shows themselves close by
      if (!done && a.target >= 0 && r() < 0.012) { a.state = 'hold'; a.holdUntil = t + 2.5 + r() * 3; a.speed = 0; }
      if (done) { a.state = 'hold'; a.speed = 0; a.holdUntil = t + (a.side ? 6 + r() * 10 : 12 + r() * 12); }
      return;
    }
    if (a.state === 'hold') {
      ground(a); a.speed = 0; a.crouchT = a.burst > 0 ? 0.35 : 1;
      if (t > a.holdUntil && a.burst === 0) { a.state = 'move'; pickCover(a, q); }
    }
  }
  function combat(a, t, force = false) {
    if (t >= a.retarget) {
      a.retarget = t + 0.5 + r() * 0.6; tgtList.length = 0;
      for (const b of actors) { if (b.side === a.side || !b.alive || b.mode !== MODE.GROUND) continue; const d = Math.hypot(b.x - a.x, b.z - a.z); if (d < 150) tgtList.push([d, b.id]); }
      tgtList.sort((p, q) => p[0] - q[0]);
      const vis = [];
      for (let k = 0; k < tgtList.length && k < 8 && vis.length < 3; k++) { const b = actors[tgtList[k][1]]; if (O.segment(a.x, a.y + 1.4, a.z, b.x, b.y + 1.2, b.z, t, -1) < 0) vis.push(b.id); }
      a.target = vis.length ? vis[Math.floor(r() * vis.length)] : -1;
    }
    if (!force && a.state !== 'hold') return;
    if (a.target < 0) { a.burst = 0; return; }
    const b = actors[a.target];
    if (!b.alive) { a.target = -1; a.retarget = t; a.burst = 0; return; }
    const aimY = b.y + lerp(1.3, 0.95, b.crouch), dx = b.x - a.x, dz = b.z - a.z, dh = Math.hypot(dx, dz);
    turn(a, Math.atan2(dx, dz), 5);
    const my = a.y + lerp(1.45, 0.95, a.crouch);
    a.pitch = Math.atan2(aimY - my, dh);
    if (t < a.pauseUntil || t < a.reloadUntil) return;
    if (a.burst <= 0) { a.burst = a.mg ? 8 + Math.floor(r() * 10) : 2 + Math.floor(r() * 4); a.nextShot = t + 0.3; return; }
    if (t < a.nextShot) return;
    const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw), mx = a.x + fx * 0.75 - fz * 0.1, mz = a.z + fz * 0.75 + fx * 0.1;
    let hitP = 0;
    if (b.mode === MODE.GROUND) {
      const base = (a.side === 0 ? 0.1 : 0.013) * (a.mg ? 0.55 : 1), rangeF = clamp(30 / dh, 0.15, 1.4);
      const cover = b.state === 'hold' ? (b.crouch > 0.6 ? 0.25 : 0.6) : 0.9;
      hitP = base * rangeF * cover * (b.me ? 0 : 1);
    }
    const tf = Math.min(t, Math.max(t - DT + 1e-3, a.nextShot));
    const shot = { fireT: tf, shooter: a.id, target: -1, fx: mx, fy: my, fz: mz };
    if (r() < hitP) {
      shot.ix = b.x + (r() - 0.5) * 0.3; shot.iy = aimY + (r() - 0.5) * 0.3; shot.iz = b.z + (r() - 0.5) * 0.3; shot.kind = 3; shot.target = b.id;
      shot.impT = tf + Math.hypot(shot.ix - mx, shot.iy - my, shot.iz - mz) / BULLET_SPEED;
      pending.push({ t: shot.impT, target: b.id, dmg: r() < 0.12 ? 150 : 34 + r() * 36, shooter: a.id, dx, dz });
    } else {
      const yaw = Math.atan2(dx, dz) + (r() - 0.5) * 0.09, pit = a.pitch + (r() - 0.55) * 0.05;
      const vx = Math.sin(yaw) * Math.cos(pit), vy = Math.sin(pit), vz = Math.cos(yaw) * Math.cos(pit);
      let px = mx, py = my, pz = mz, hit = 0;
      for (let dist = 0; dist < 220; dist += 1.5) {
        const nx = px + vx * 1.5, ny = py + vy * 1.5, nz = pz + vz * 1.5, gh = heightAt(nx, nz);
        if (ny < gh) { let lo = 0, hi = 1; for (let it = 0; it < 4; it++) { const m = (lo + hi) / 2; if (py + vy * 1.5 * m < heightAt(px + vx * 1.5 * m, pz + vz * 1.5 * m)) hi = m; else lo = m; } px += vx * 1.5 * lo; py += vy * 1.5 * lo; pz += vz * 1.5 * lo; hit = 1; break; }
        px = nx; py = ny; pz = nz;
      }
      const hb = O.segment(mx, my, mz, px, py, pz, t, -1);
      if (hb > 0.02) { px = mx + (px - mx) * hb; py = my + (py - my) * hb; pz = mz + (pz - mz) * hb; hit = 4; }
      shot.ix = px; shot.iy = py; shot.iz = pz; shot.kind = hit; shot.impT = tf + Math.hypot(px - mx, py - my, pz - mz) / BULLET_SPEED;
    }
    shots.push(shot);
    a.burst--; a.mag--;
    a.nextShot = tf + (a.mg ? 0.08 : 0.09 + r() * 0.05);
    if (a.burst <= 0) a.pauseUntil = t + 0.8 + r() * 2.2;
    if (a.mag <= 0) { a.reloadUntil = t + 2.6; a.mag = 30; a.burst = 0; a.reloads.push(t); }
  }

  shots.sort((p, q) => p.fireT - q.fireT);
  const S = new Float32Array(shots.length * SHOT_F);
  shots.forEach((s, i) => { const o = i * SHOT_F; S[o] = s.fireT; S[o + 1] = s.impT; S[o + 2] = s.fx; S[o + 3] = s.fy; S[o + 4] = s.fz; S[o + 5] = s.ix; S[o + 6] = s.iy; S[o + 7] = s.iz; S[o + 8] = s.shooter; S[o + 9] = s.target; S[o + 10] = s.kind; });
  const byImpact = Uint32Array.from(shots.map((_, i) => i).sort((p, q) => S[p * SHOT_F + 1] - S[q * SHOT_F + 1]));
  // the tape opens just before you climb aboard the extraction
  const T_START = Math.min((me.boardT || H1.tLift - 2) - 0.6, T_SIM - 0.1);
  const statics = actors.map((a) => ({
    id: a.id, side: a.side, spawn: a.spawn, deathTime: a.deathTime, fallSign: a.fallSign, killer: a.killer, cause: a.cause,
    veh: -1, helo: a.helo ?? -1, mg: a.mg, te: a.te ?? 0, ident: a.id_, reloads: Float32Array.from(a.reloads),
    skin: a.me && opts.skin != null ? opts.skin : r(), squad: a.squad, house: a.inside ? squads[a.squad].house : -1, from: a.from, boardT: a.boardT ?? -1,
  }));
  return { scene: 'sandwich', L, N, steps, rec, obstacles: O, destruction: D, missiles, shots: S, nShots: shots.length, byImpact, explosions, deaths, actors: statics, startId: me.id, T_START };
}
