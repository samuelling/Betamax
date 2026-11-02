// Feeds the audio engine the battle's sound events around the current tape time. Each event is offered every
// frame while it's near; the engine schedules each one once, sample-accurately, reversed.
import { SHOT_F } from './sim.js';
import { heightAt, WATERLINE_Z } from './terrain.js';
import { vehZ, vehSpeed, heloPose, gunshipPose } from './layout.js';
import { carPose } from './layoutB.js';

function lb(A, n, v) { let lo = 0, hi = n; while (lo < hi) { const m = (lo + hi) >> 1; if (A[m * SHOT_F] < v) lo = m + 1; else hi = m; } return lo; }
const IMPACT = [null, 'iSand', 'iWater', 'iBody', 'iHard'];
const BOOM = { shell: 'eShell', mlrs: 'eShell', mortar: 'eMortar', drone: 'eDrone', rocket: 'eRocket', vehicle: 'eBig', crash: 'eBig', airburst: 'eAir' };
const EX_ID = 1 << 24, MS_ID = 1 << 25, VO_ID = 1 << 26, DE_ID = 1 << 27;
// how people die out loud: mostly screams and cries, some groan, some are silent
const DEATH_VOX = ['vscream', 'vscream', 'vscream', 'vyelp', 'vcry', 'vgroan', 'vscream', 'vyelp', null, 'vgroan', 'vscream', 'vcry', null];

export function worldSounds(S, tau, L, body, A, pb) {
  if (!A.ready) return;
  const sh = S.shots, n = S.nShots;
  // shots: muzzle reports, supersonic cracks passing you, and impacts near you
  const i0 = lb(sh, n, tau - 4.5), i1 = lb(sh, n, tau + (A.forward ? 0.6 : 0.1));
  for (let si = i0; si < i1; si++) {
    const o = si * SHOT_F, shooter = sh[o + 8];
    if (shooter === body) continue; // you are this soldier now; your shots are live
    const veh = shooter < 0, act = veh ? null : S.actors[shooter];
    const cal = veh ? 3 : act.mg ? 2 : act.side === 0 ? 1 : 0;
    const fireT = sh[o], impT = sh[o + 1];
    const sx = sh[o + 2], sy = sh[o + 3], sz = sh[o + 4], ix = sh[o + 5], iy = sh[o + 6], iz = sh[o + 7];
    A.world(si * 4, 'r' + cal, fireT, sx, sy, sz, 1, tau, L);
    A.world(si * 4 + 3, 'b' + cal, fireT, sx, sy, sz, 1, tau, L); // forward bang on the shot itself
    // closest pass of the bullet to your head
    const vx = ix - sx, vy = iy - sy, vz = iz - sz, vv = vx * vx + vy * vy + vz * vz || 1;
    const u = ((L.x - sx) * vx + (L.y - sy) * vy + (L.z - sz) * vz) / vv;
    if (u > 0.02 && u < 0.995) {
      const cx = sx + vx * u, cy = sy + vy * u, cz = sz + vz * u;
      if (Math.hypot(cx - L.x, cy - L.y, cz - L.z) < 8) A.world(si * 4 + 1, 'crack', fireT + (impT - fireT) * u, cx, cy, cz, veh ? 1.6 : 1, tau, L);
    }
    const ik = IMPACT[sh[o + 10]];
    if (ik && Math.abs(ix - L.x) < 40 && Math.abs(iz - L.z) < 40) A.world(si * 4 + 2, ik, impT, ix, iy, iz, veh ? 1.8 : 1, tau, L);
    // hit but not (yet) killed: a grunt or a cry
    if (ik === 'iBody') { const tg = sh[o + 9], h = (si * 2654435761) >>> 0; if (tg >= 0 && tg !== body && S.actors[tg].deathTime !== impT && h % 10 < 6) A.world(VO_ID + si, h % 3 ? 'vgrunt' : 'vcry', impT + 0.05, ix, iy, iz, 0.9, tau, L); }
  }
  // explosions, incoming whistles, mortar tubes far away
  const E = S.explosions;
  for (let ei = 0; ei < E.length; ei++) {
    const e = E[ei];
    if (e.t > tau - 10 && e.t < tau + 0.2) {
      const wet = !e.air && e.iy <= 0.15 && e.iz > 5 && heightAt(e.ix, e.iz) < 0.05;
      const k = e.air ? 'eAir' : wet ? 'eWater' : (e.house ? 'eBig' : BOOM[e.kind] || 'eShell');
      A.world(EX_ID + ei * 4, k, e.t, e.ix, e.iy + 0.5, e.iz, Math.min(2.2, e.big), tau, L);
      if (e.kind === 'mortar' || e.kind === 'shell' || e.kind === 'mlrs') A.world(EX_ID + ei * 4 + 1, e.kind === 'mortar' ? 'wMortar' : 'wShell', e.t, e.ix, e.iy + 8, e.iz, 1, tau, L);
    }
    if (e.kind === 'mortar' && e.launchT > tau - 5 && e.launchT < tau + 0.2) A.world(EX_ID + ei * 4 + 2, 'thoonk', e.launchT, e.sx, e.sy, e.sz, 1, tau, L);
  }
  // deaths: the scream runs backwards into the moment the body un-dies
  const D = S.deaths;
  if (pb) for (let k = 0; k < D.length; k++) {
    const de = D[k]; if (de.t < tau - 3.5) continue; if (de.t > tau + 0.1) break;
    if (de.id === body) continue;
    const v = DEATH_VOX[(de.id * 7 + k) % DEATH_VOX.length];
    const h = pb.hit[de.id]; if (!h || !h.head) continue;
    const late = de.cause === 'shot' ? 0.08 : 0.35; // blast victims cry out a beat after
    // the Wilhelm: a few times per tape (at least 40 s apart), on a death close enough to hear properly
    // (blast victims preferred); they alternate forward and reversed, starting forward
    if (!A.wilhelm.has(de.id) && A.wilhelmArmed && A.wilhelm.size < 3 && A.playT >= A.wilhelmNext && A.W && A.W.vwilhelm) {
      const dd = Math.hypot(h.head.x - L.x, h.head.z - L.z);
      if ((de.cause !== 'shot' && dd < 60) || dd < 28) { A.wilhelm.set(de.id, A.wilhelm.size % 2 === 0); A.wilhelmNext = A.playT + 40; }
    }
    if (A.wilhelm.has(de.id)) { A.world(DE_ID + de.id, A.wilhelm.get(de.id) ? 'vwilhelmF' : 'vwilhelm', de.t + late, h.head.x, h.head.y, h.head.z, 1.3, tau, L); continue; }
    if (!v) continue;
    A.world(DE_ID + de.id, de.cause === 'shot' || v !== 'vscream' ? v : 'vyelp', de.t + late, h.head.x, h.head.y, h.head.z, 1, tau, L);
  }
  // anti-armour and anti-air missile launches
  const M = S.missiles;
  for (let mi = 0; mi < M.length; mi++) {
    const m = M[mi];
    if (m.launchT > tau - 4 && m.launchT < tau + 0.2) A.world(MS_ID + mi, 'missile', m.launchT, m.sx, m.sy, m.sz, 1, tau, L);
  }
}

// engines, tracks and rotors around you
const _em = [], _hp = {}, _cp = {};
export function machineSounds(S, tau, L, A) {
  _em.length = 0;
  S.L.vehicles.forEach((v, vi) => {
    if (v.destroyT > 0 && tau > v.destroyT) return;
    const z = vehZ(v, tau); if (z > 700) return;
    const sp = Math.abs(vehSpeed(v, tau)), gy = heightAt(v.x, z), y = Math.max(gy, 0) + 1.5;
    if (v.type === 'aav') {
      const load = Math.min(1, 0.45 + sp / 6);
      _em.push({ cls: 'ifv', id: vi, x: v.x, y, z, load: 1, pitch: 0.72 + 0.4 * Math.min(1, sp / 5) });
      if (z < WATERLINE_Z + 10 && gy > -0.4) _em.push({ cls: 'track', id: vi, x: v.x, y, z, load: Math.min(1, 0.15 + sp / 3), pitch: 0.6 + 0.5 * Math.min(1, sp / 5) });
      void load;
    } else {
      _em.push({ cls: 'lcac', id: vi, x: v.x, y: y + 2, z, load: sp > 0.5 ? 1 : 0.6, pitch: sp > 0.5 ? 1 : 0.86 });
    }
  });
  // The Jump: the four Allisons through the skin
  if (S.L.planes) for (const sx of [-1, 1]) _em.push({ cls: 'lcac', id: 50 + sx, x: sx * 7.5, y: 3.2, z: -4.6, load: 1, pitch: 1.12 });
  if (S.L.rides) S.L.rides.forEach((c, ci) => {
    if (tau < c.t0 - 3 || (c.burnT != null && tau > c.burnT) || (c.crash && tau > c.crash.t + 1.5)) return;
    carPose(c, tau, _cp); const k = Math.min(1, _cp.v / 30);
    _em.push({ cls: 'car', id: ci, x: _cp.x, y: _cp.y + 0.8, z: _cp.z, load: 0.35 + 0.65 * k, pitch: 0.55 + 0.75 * k });
  });
  S.L.helos.forEach((h, hi) => { heloPose(h, tau, _hp); if (_hp.dead) return; _em.push({ cls: 'uh60', id: hi, x: _hp.x, y: _hp.y + 2, z: _hp.z, load: 1, pitch: 1 + _hp.pitch * 0.3 }); });
  S.L.gunships.forEach((g, gi) => { gunshipPose(g, tau, _hp); if (!_hp.alive) return; _em.push({ cls: 'gunship', id: gi, x: _hp.x, y: _hp.y, z: _hp.z, load: 1, pitch: _hp.burn ? 0.85 : 1 }); });
  A.engines(_em, L);
}
