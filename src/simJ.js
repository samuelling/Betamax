// The Jump, simulated forward and played backwards. Thirty-two paratroopers in four rows of red webbing, two
// jumpmasters, a loadmaster. Forward:
//   38 s   the tape begins over the Gulf, twenty minutes out, in red light
//   54 s   GET READY. 58 outboard personnel stand up, 62 inboard, 66 hook up
//   71 s   the jumpmasters open the doors: the roar, the night, the flak coming up from the shore
//   81 s   the aircraft off the starboard door is hit; it rolls away burning and goes into the sea
//   85 s   a burst right outside: fragments through the skin; two men go down
//   90 s   STAND IN THE DOOR. 98 the light goes green: GO, GO, GO — one a second out of each door
// You're tenth in the port stick. In rewind the men who went before you come back in out of the dark, one by one.
import { mulberry32, clamp } from './rng.js';
import { buildJumpLayout, JT } from './layoutJ.js';
import { CABIN, V } from './terrainJ.js';
import { makeIdentity } from './names.js';
import { Obstacles } from './obstacles.js';
import { computeDestruction } from './destruction.js';
import { DT, HZ, T_SIM, F, MODE, SHOT_F } from './sim.js';

export function simulateJump(seed = 5, opts = {}) {
  const r = mulberry32(seed), L = buildJumpLayout(), O = new Obstacles(L);
  const actors = [];
  const base = (o) => Object.assign({ id: actors.length, side: 0, alive: true, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, crouch: 1, speed: 0, phase: r() * 6, mode: MODE.HIDDEN, deathTime: -1, fallSign: -1, killer: -1, cause: '', spawn: JT.start + r() * 0.5 }, o);
  for (const s of L.seats) actors.push(base({ seat: s, sd: s.side, role: 'para' }));
  const jm = [-1, 1].map((sd) => { const a = base({ sd, role: 'jm' }); actors.push(a); return a; });
  const lm = base({ sd: 0, role: 'lm' }); actors.push(lm);
  // the two the burst takes
  const port = actors.filter((a) => a.role === 'para' && a.sd < 0), stbd = actors.filter((a) => a.role === 'para' && a.sd > 0);
  const victims = [stbd.find((a) => a.seat.row === 'out' && a.seat.k === 6), stbd.find((a) => a.seat.row === 'in' && a.seat.k === 5)];
  victims.forEach((a, i) => { a.deathTime = JT.hit + 0.05 + i * 0.12; a.cause = 'flak'; a.fallSign = i ? 1 : -1; });
  // the order in each stick: whoever sat nearest the door goes first (outboard before inboard), the dead left where they fell
  const order = (list) => list.filter((a) => a.deathTime < 0).sort((p, q) => (q.seat.k - p.seat.k) || (p.seat.row === 'out' ? -1 : 1));
  const sticks = { [-1]: order(port), [1]: order(stbd) };
  for (const sd of [-1, 1]) sticks[sd].forEach((a, j) => { a.j = j; a.exitT = JT.green + 0.6 + j * 1.05 + (sd > 0 ? 0.45 : 0); });
  jm.forEach((a) => { const n = sticks[a.sd].length; a.exitT = JT.green + 0.6 + n * 1.05 + 1.2 + (a.sd > 0 ? 0.45 : 0); });
  const me = sticks[-1][9]; me.me = true;
  actors.forEach((a) => { a.id_ = makeIdentity(0, a.id + 5000); });
  if (opts.ident) me.id_ = opts.ident;
  // ranks: the jumpmasters are sergeants first class; the loadmaster is Air Guard
  jm.forEach((a) => { a.id_ = { ...a.id_, rank: 'SFC' }; });
  lm.id_ = { ...lm.id_, rank: 'TSgt' };

  const steps = Math.round(T_SIM * HZ) + 1, N = actors.length, rec = new Float32Array(N * steps * F);
  const slot = (a, t) => {   // where a jumper is in the line at time t (slot -1 is the door)
    const n = sticks[a.sd].filter((b) => b.exitT <= t).length;
    return a.j - n - 1;   // the first man stands in the door; each next steps into it as the one before goes
  };
  const shuffle = (a, tx, tz, t, sp = 1.4) => {   // a short step toward a point, the shuffle of a man with a parachute on
    const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz), st = sp * DT;
    if (d <= st) { a.x = tx; a.z = tz; a.speed = d / DT; } else { a.x += dx / d * st; a.z += dz / d * st; a.speed = sp; }
    a.phase += a.speed * DT / 0.55 * Math.PI * 2;
  };
  for (let s = 0; s < Math.round(T_SIM / DT) + 1; s++) {
    const t = s * DT;
    for (const a of actors) {
      a.speed = 0;
      if (t < a.spawn) { a.mode = MODE.HIDDEN; place(a, t); continue; }
      if (a.deathTime >= 0 && t >= a.deathTime) { a.alive = false; a.mode = MODE.DEAD; continue; }
      update(a, t);
    }
    if (s % 2 === 0) for (let i = 0; i < N; i++) {
      const a = actors[i], o = (i * steps + s / 2) * F;
      rec[o] = a.x; rec[o + 1] = a.y; rec[o + 2] = a.z; rec[o + 3] = a.yaw; rec[o + 4] = a.pitch; rec[o + 5] = a.crouch; rec[o + 6] = a.speed; rec[o + 7] = a.phase; rec[o + 8] = a.mode;
    }
  }
  function place(a, t) {
    if (a.role === 'para') { a.x = a.seat.x; a.z = a.seat.z; a.yaw = a.seat.yaw; }
    else if (a.role === 'jm') { a.x = a.sd * 1.05; a.z = 6.7; a.yaw = Math.PI; }
    else { a.x = 0.3; a.z = 7.0; a.yaw = Math.PI; }
    a.y = 0;
  }
  function update(a, t) {
    a.mode = MODE.GROUND; a.y = 0;
    if (a.role === 'lm') {   // the loadmaster: on the headset by the ramp, watching the doors
      a.x = 0.3; a.z = 7.0; a.crouch = 0; a.yaw = Math.PI + Math.sin(t * 0.3) * 0.4 + (t > JT.doors ? (Math.sin(t * 0.9) > 0 ? 0.9 : -0.9) : 0); a.pitch = 0; return;
    }
    if (t >= a.exitT) {   // out: the slipstream takes him back and down, the static line pulls the canopy
      const k = t - a.exitT; if (k > 1.1) { a.mode = MODE.HIDDEN; return; }
      a.mode = MODE.GROUND; a.crouch = 0.5;
      a.x = a.sd * (CABIN.hx + 0.7 + k * 3.5); a.z = (CABIN.doorZ0 + CABIN.doorZ1) / 2 + V * k * Math.min(1, k * 0.8) * 0.85; a.y = -4.9 * k * k * 0.6 - k * 2;
      a.yaw = 0; return;
    }
    if (a.role === 'jm') {   // the jumpmaster: by his door, then in it, looking out, then the last man out of it
      a.crouch = 0; const dz = (CABIN.doorZ0 + CABIN.doorZ1) / 2;
      if (t < JT.getReady) { a.x = a.sd * 1.05; a.z = 6.6; a.yaw = Math.PI; a.pitch = 0; }
      else if (t < JT.doors) { shuffle(a, a.sd * 1.25, dz + 0.55, t); a.yaw = Math.PI; }
      else if (t < JT.green) { shuffle(a, a.sd * 1.38, dz + 0.6, t); a.yaw = a.sd * Math.PI / 2 + (Math.sin(t * 0.7) > 0.3 ? -a.sd * 0.6 : 0); a.pitch = -0.2; }   // head out the door, checking the drop zone
      else { const last = sticks[a.sd].length ? sticks[a.sd][sticks[a.sd].length - 1].exitT : JT.green; if (t < last) { a.x = a.sd * 1.1; a.z = dz + 0.75; a.yaw = Math.PI + a.sd * 0.6; } else shuffle(a, a.sd * 1.35, dz, t, 2); }
      return;
    }
    const st = a.seat;
    if (t < (st.row === 'out' ? JT.outStand : JT.inStand)) {   // seated: knees up, the reserve on the lap, the head going
      a.x = st.x; a.z = st.z; a.yaw = st.yaw; a.crouch = 1; a.pitch = -0.25 + Math.sin(t * 0.21 + a.id) * 0.12; return;
    }
    a.crouch = 0; a.pitch = 0;
    if (t < JT.door) {   // up, facing the rear, hooked up, checking the man in front
      const sx = st.x + (st.row === 'out' ? -st.side * 0.18 : st.side * 0.18); shuffle(a, sx, st.z, t, 0.8);
      const want = 0; let d = want - a.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; a.yaw += clamp(d, -3 * DT, 3 * DT); return;
    }
    // in line, then shuffling to the door one place at a time
    const j = slot(a, t), p = L.lineSlot(a.sd, Math.max(-1, j));
    shuffle(a, p.x, p.z, t, j <= 0 ? 2.2 : 1.6);
    if (Math.hypot(a.x - p.x, a.z - p.z) > 0.05 || j > 0) { let d = Math.atan2(p.x - a.x, p.z - a.z) - a.yaw; if (Math.hypot(a.x - p.x, a.z - p.z) < 0.2) d = (j < 0 ? a.sd * Math.PI / 2 : 0) - a.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; a.yaw += clamp(d, -5 * DT, 5 * DT); }
  }
  const deaths = actors.filter((a) => a.deathTime >= 0).map((a) => ({ id: a.id, t: a.deathTime, killer: -1, cause: a.cause }));
  const explosions = [];
  const D = computeDestruction(L, explosions); O.setDestruction(D);
  const T_START = me.exitT - 0.55;
  const statics = actors.map((a) => ({
    id: a.id, side: 0, spawn: a.spawn, deathTime: a.deathTime, fallSign: a.fallSign, killer: -1, cause: a.cause, veh: -1, helo: -1, mg: false, te: 0,
    ident: a.id_, reloads: new Float32Array(0), skin: a.me && opts.skin != null ? opts.skin : r(), exitT: a.exitT ?? -1, role: a.role, sd: a.sd, jump: true, house: -1,
  }));
  return { scene: 'jump', L, N, steps, rec, obstacles: O, destruction: D, missiles: [], shots: new Float32Array(0), nShots: 0, byImpact: new Uint32Array(0), explosions, deaths, actors: statics, startId: me.id, T_START };
}
