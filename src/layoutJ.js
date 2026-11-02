// The Jump: the hold, the seats, the sticks, the formation, the flak — all as functions of tape time.
import { mulberry32 } from './rng.js';
import { CABIN, DROP, V, ARENA_JUMP } from './terrainJ.js';

let cached = null;
export const JT = { start: 38, warn: 46, getReady: 54, outStand: 58, inStand: 62, hook: 66, doors: 71, check: 76, hit: 85, planeHit: 81, door: 90, green: 98, coast: 92 };

export function buildJumpLayout() {
  if (cached) return cached;
  const r = mulberry32(1944);
  const L = { scene: 'jump', ARENA: ARENA_JUMP, CABIN, V, DROP };
  for (const k of ['houses', 'cars', 'trees', 'walls', 'poles', 'mailboxes', 'hedges', 'positions', 'rocks', 'vehicles', 'gunships', 'helos', 'smokes', 'minePosts', 'wireRuns', 'mines', 'colliders', 'blocks']) L[k] = [];
  L.T = JT;
  // ---------- the hold, as solid boxes: the skin either side (with the door openings), the bulkhead, the ramp ----------
  const B = (x, z, hx, hz, y0, y1, kind, walk = false) => ({ x, z, c: 1, s: 0, hx, hz, y0, y1, kind, walk });
  const C = CABIN, W = 0.2;
  L.rawBoxes = [];
  for (const sd of [-1, 1]) {
    const x = sd * (C.hx + W / 2);
    L.rawBoxes.push(B(x, (C.z0 + C.doorZ0) / 2, W / 2, (C.doorZ0 - C.z0) / 2, -1, C.h + 0.5, 'skin'));
    L.rawBoxes.push(B(x, (C.doorZ1 + C.z1 + 1.6) / 2, W / 2, (C.z1 + 1.6 - C.doorZ1) / 2, -1, C.h + 0.5, 'skin'));
    L.rawBoxes.push(B(x, (C.doorZ0 + C.doorZ1) / 2, W / 2, (C.doorZ1 - C.doorZ0) / 2, C.doorH, C.h + 0.5, 'skin'));
  }
  L.rawBoxes.push(B(0, C.z0 - 0.1, C.hx + 0.3, 0.1, -1, C.h + 0.5, 'bulkhead'));
  L.rawBoxes.push(B(0, C.z1 + 1.7, C.hx + 0.3, 0.1, -1, C.h + 0.5, 'ramp'));
  // the doors themselves, shut until the jumpmasters open them
  L.dynBoxes = [-1, 1].map((sd) => ({ ...B(sd * (C.hx + 0.08), (C.doorZ0 + C.doorZ1) / 2, 0.08, (C.doorZ1 - C.doorZ0) / 2, -0.2, C.doorH + 0.1, 'door'), until: JT.doors }));
  // ---------- the seats: four rows of red webbing, two each side; the sticks ----------
  //   outboard rows against the skin face in; inboard rows back to back face out
  L.seats = [];
  for (const sd of [-1, 1]) for (const row of ['out', 'in']) for (let k = 0; k < 8; k++) {
    const x = sd * (row === 'out' ? 1.18 : 0.42), z = -6.2 + k * 0.95, yaw = (row === 'out' ? -sd : sd) * Math.PI / 2;
    L.seats.push({ x, z, yaw, side: sd, row, k });
  }
  L.seatBenches = [];
  for (const sd of [-1, 1]) for (const row of ['out', 'in']) { const x = sd * (row === 'out' ? 1.32 : 0.28); L.seatBenches.push({ x, z0: -6.7, z1: 0.9, sd, row }); L.rawBoxes.push(B(x, -2.9, 0.16, 3.8, -0.2, 0.45, 'seat', true)); }
  // where each stick stands in line: the door, then back up the aisle
  L.lineSlot = (sd, j) => (j < 0 ? { x: sd * 1.3, z: (C.doorZ0 + C.doorZ1) / 2 } : { x: sd * 0.82, z: 4.55 - j * 0.52 });
  // ---------- the formation: three vees of three; you're the right wing of the second vee (the origin) ----------
  //   ahead is -z. Your element lead is ahead and to the left; its left wing flies level with you, 90 m off the
  //   port door — your door — and it is the one that is hit.
  L.planes = [
    { x: -46, y: -8, z: -70, vee: 1 }, { x: -88, y: -4, z: 6, vee: 1, hit: JT.planeHit },
    { x: -30, y: -22, z: -420, vee: 0 }, { x: 16, y: -18, z: -350, vee: 0 }, { x: -76, y: -16, z: -350, vee: 0 },
    { x: -62, y: 18, z: 280, vee: 2 }, { x: -16, y: 24, z: 350, vee: 2 }, { x: -108, y: 22, z: 350, vee: 2 },
  ].map((p, i) => ({ ...p, i, bob: r() * 6, hit: p.hit ?? -1, jump: JT.green + (p.vee - 1) * 5.5 + (r() - 0.5) }));
  // ---------- the flak: tracer streams from the shore guns, heavy bursts at our height ----------
  L.guns = []; for (let k = 0; k < 9; k++) L.guns.push({ x: (r() - 0.5) * 1600, z0: -1500 - r() * 2200, burst: [], seed: r() * 1e6 });
  for (const g of L.guns) { let t = JT.start + 4 + r() * 10; while (t < 200) { const n = 6 + Math.floor(r() * 14); g.burst.push({ t, n, aimX: (r() - 0.5) * 260, aimY: -40 + r() * 140, rate: 9 + r() * 5 }); t += 2.5 + r() * (t > JT.check ? 4 : 9); } }
  L.bursts = []; { let t = JT.start + 9; while (t < 200) { const near = t > JT.doors && r() < 0.25; { const sd = r() < 0.6 ? -1 : 1; L.bursts.push({ t, x: sd * (near ? 25 + r() * 70 : 60 + r() * 380), y: -40 + r() * 120, z: -500 + r() * 700, big: near ? 1.4 : 0.8 + r() * 0.6 }); } t += (t > JT.doors ? 0.7 : 1.6) + r() * (t > JT.doors ? 1.6 : 3.2); } }
  // the one that comes through the side: right outside the starboard skin
  L.bursts.push({ t: JT.hit, x: 24, y: 4, z: -2, big: 2.2, close: true });   // starboard: the two who die are in the starboard stick
  L.bursts.sort((a, b) => a.t - b.t);
  L.searchlights = [0, 1, 2, 3].map((k) => ({ x: -500 + k * 330 + (r() - 0.5) * 100, z0: -900 - k * 400 - r() * 400, ph: r() * 6, sp: 0.15 + r() * 0.12 }));
  // the coast passes under at the green light: lights of the port, fires where the first wave went in
  L.coastZ0 = -V * (JT.green - 2);   // ground-frame z of the beach line (ground moves +z at V)
  cached = L;
  return L;
}
// where the ground is under us at tape time t: an offset added to ground-frame z
export const groundShift = (t) => V * t;
