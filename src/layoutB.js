// The Bomb: what stands along Route 135, and how every car moves. The cars are scripted the way the beach's
// landing craft are: a pure function of tape time, worked out once here and shared by the simulation, the
// collisions and the renderer, so they rewind exactly — through the chase, the crashes and the stop at the field.
import { mulberry32 } from './rng.js';
import { planStructure, structureBoxes } from './megastruct.js';
import { heightAt, ARENA } from './terrain.js';
import { roadAt, roadZ0, sAtX, ROAD_LEN, S_TOWN, S_FIELD, TOWN, FIELD, SIDE_ROAD, ROAD_HALF, openAt } from './terrainB.js';

export const DTC = 0.05, T_CAR = 200;
// seats in the car's frame (+z forward, +x to the car's left), feet height, facing (radians from forward)
export const SEATS = {
  sedan: [[0.42, 0.3, 0.3, 0], [-0.42, 0.3, 0.3, -1.2], [0.42, 0.3, -0.75, 1.4], [-0.42, 0.3, -0.75, -1.4]],
  wagon: [[0.42, 0.3, 0.35, 0], [-0.42, 0.3, 0.35, -1.2], [0.42, 0.3, -0.7, 1.4], [-0.42, 0.3, -0.7, -1.4]],
  suv: [[0.45, 0.42, 0.35, 0], [-0.45, 0.42, 0.35, -1.2], [0.45, 0.42, -0.7, 1.5], [-0.45, 0.42, -0.7, -1.5], [0, 0.42, -1.55, Math.PI]],
  pickup: [[0.45, 0.45, 0.55, 0], [-0.45, 0.45, 0.55, -1.2], [0.52, 1.13, -1.15, Math.PI - 0.5], [-0.52, 1.13, -1.15, Math.PI + 0.5], [0.5, 1.13, -2.15, Math.PI - 0.2], [-0.5, 1.13, -2.15, Math.PI + 0.2]],
};

let cached = null;
export function buildBombLayout() {
  if (cached) return cached;
  const r = mulberry32(1846);   // the year the railroad came through Ashland
  const L = { scene: 'bomb', ARENA, TOWN, FIELD };
  L.rocks = []; L.vehicles = []; L.gunships = []; L.smokes = []; L.minePosts = []; L.wireRuns = []; L.mines = []; L.colliders = [];
  L.houses = []; L.cars = []; L.trees = []; L.walls = []; L.poles = []; L.mailboxes = []; L.hedges = []; L.positions = [];
  const P = {};
  // ---------- the convoy: four of your cars, four of theirs ----------
  //   lane: metres right of the centre line (+) — on the run everybody takes the middle of the road
  L.rides = [
    // yours: commandeered on the common in Ashland
    { side: 0, kind: 'sedan', paint: '#8a8e94', s0: S_TOWN + 30, lat0: 5.5, t0: 15.0, vmax: 27, acc: 4.2, stop: S_FIELD + 26, weave: 0.4 },
    { side: 0, kind: 'suv', paint: '#1e2228', s0: S_TOWN + 12, lat0: 5.5, t0: 15.6, vmax: 27, acc: 4.0, stop: S_FIELD + 12, weave: 0.5 },
    { side: 0, kind: 'pickup', paint: '#8a1e1a', s0: S_TOWN - 6, lat0: 5.5, t0: 16.2, vmax: 27, acc: 3.9, stop: S_FIELD - 2, weave: 0.7 },
    { side: 0, kind: 'wagon', paint: '#b8a888', s0: S_TOWN - 24, lat0: 5.5, t0: 16.8, vmax: 26.5, acc: 3.8, stop: S_FIELD - 16, weave: 0.8, crash: { t: 96, dir: 1, roll: false, spin: 2.6 } },
    // theirs: out of the woods road behind you, gaining
    { side: 1, kind: 'pickup', paint: '#4a4e3e', s0: SIDE_ROAD.s, lat0: -9, t0: 40.0, vmax: 33.5, acc: 5.2, weave: 1.2, follow: [3, 2], gap: 26, stop: S_FIELD - 70 },
    { side: 1, kind: 'sedan', paint: '#2a3e5a', s0: SIDE_ROAD.s - 18, lat0: -9, t0: 41.2, vmax: 34, acc: 5.4, weave: 1.4, crash: { t: 64, dir: -1, roll: true, spin: 1.2 } },
    { side: 1, kind: 'suv', paint: '#e8e6e0', s0: SIDE_ROAD.s - 36, lat0: -9, t0: 42.4, vmax: 33.5, acc: 5.0, weave: 1.0, crash: { t: 113, dir: 1, roll: false, spin: 3.2, tanker: true } },
    { side: 1, kind: 'pickup', paint: '#6a5a3a', s0: SIDE_ROAD.s - 54, lat0: -9, t0: 43.6, vmax: 33, acc: 5.0, weave: 1.1, stop: S_FIELD - 86, crash: { t: 112.2, dir: -1, roll: true, spin: 0.8, late: true } },
    // and one more, late, out of a farm drive past the tanker: an MG in the bed, still firing as the helicopters lift
    { side: 1, kind: 'pickup', paint: '#5a5040', s0: S_FIELD - 720, lat0: -9, t0: 121.5, vmax: 30, acc: 5.0, weave: 0.9, stop: S_FIELD - 48 },
  ];
  L.rides.forEach((c, i) => { c.i = i; c.seats = SEATS[c.kind]; c.track = trackFor(c, L.rides, r); });
  // keep the lead Texan truck behind the last of your cars still on the road
  // (worked into trackFor via c.follow)

  // ---------- the road's furniture ----------
  const tmp = {};
  // Ashland: the common, a white church with a steeple, brick and clapboard buildings on Main Street, the station
  for (let k = -5; k <= 5; k++) for (const sd of [1, -1]) {
    const s = S_TOWN + k * 26 + (sd > 0 ? 8 : 0); if (Math.abs(k) < 1 && sd > 0) continue; if (sd < 0 && k >= -3 && k <= 0) continue;   // the common
    roadAt(s, tmp); const set = 15 + r() * 3, x = tmp.x + tmp.nx * set * sd, z = tmp.z + tmp.nz * set * sd;
    L.houses.push({ x, z, w: 11 + r() * 3, l: 9, rot: tmp.yaw - Math.PI / 2 + (sd > 0 ? Math.PI : 0), floors: r() < 0.6 ? 2 : 1, deck: false, town: true });
  }
  { roadAt(S_TOWN, tmp); L.church = { x: tmp.x - tmp.nx * 34, z: tmp.z - tmp.nz * 34, rot: tmp.yaw - Math.PI / 2 }; }
  { roadAt(S_TOWN + 150, tmp); L.station = { x: tmp.x + tmp.nx * 22, z: tmp.z + tmp.nz * 22, rot: tmp.yaw }; L.rail = S_TOWN + 175; }
  { roadAt(S_TOWN + 230, tmp); L.gas = { x: tmp.x - tmp.nx * 18, z: tmp.z - tmp.nz * 18, rot: tmp.yaw }; }
  // farmhouses and capes spaced out through the woods; fields with stone walls
  for (let s = S_TOWN + 380; s < S_FIELD - 160; s += 90 + r() * 120) {
    const sd = r() < 0.5 ? 1 : -1; roadAt(s, tmp); const set = 18 + r() * 8;
    L.houses.push({ x: tmp.x + tmp.nx * set * sd, z: tmp.z + tmp.nz * set * sd, w: 9 + r() * 3, l: 7.5, rot: tmp.yaw - Math.PI / 2 + (sd > 0 ? Math.PI : 0), floors: r() < 0.4 ? 2 : 1, deck: r() < 0.3 });
    L.mailboxes.push({ x: tmp.x + tmp.nx * 5 * sd, z: tmp.z + tmp.nz * 5 * sd, rot: tmp.yaw - Math.PI / 2 });
  }
  for (let s = 60; s < ROAD_LEN - 40; s += 34) { roadAt(s, tmp); L.poles.push({ x: tmp.x - tmp.nx * 5.8, z: tmp.z - tmp.nz * 5.8 }); }
  // stone walls along the open stretches and round the hayfield
  for (let s = S_TOWN + 300; s < ROAD_LEN - 30; s += 6) {
    roadAt(s, tmp); const open = openAt(s);
    if (!open || r() < 0.08) continue;
    for (const sd of [1, -1]) if (!(s > S_FIELD - 110 && s < S_FIELD + 24 && (tmp.nz * sd) > 0)) L.walls.push({ x: tmp.x + tmp.nx * 7.5 * sd, z: tmp.z + tmp.nz * 7.5 * sd, len: 6.2, rot: tmp.yaw - Math.PI / 2, h: 0.8, kind: 'stone' });
  }
  // cars that won't start any more: stalled, doors open, on the shoulders (the pulse took them)
  for (let k = 0; k < 18; k++) { const s = S_TOWN + 60 + k * 140 + r() * 60; roadAt(s, tmp); const sd = r() < 0.5 ? 1 : -1; L.cars.push([tmp.x + tmp.nx * 5.4 * sd, tmp.z + tmp.nz * 5.4 * sd, tmp.yaw + (r() - 0.5) * 0.4]); }
  for (let k = 0; k < 6; k++) { const s = S_TOWN - 120 + k * 50; roadAt(s, tmp); L.cars.push([tmp.x - tmp.nx * 6.5, tmp.z - tmp.nz * 6.5, tmp.yaw + Math.PI / 2]); }   // parked on Main Street
  // the fuel tanker on the shoulder that goes up when their SUV passes it
  { const c = L.rides[6], k = Math.round(c.crash.t / DTC) * 7, x = c.track[k], z = c.track[k + 2], s = sAtX(x); roadAt(s + 10, tmp);
    L.tanker = { x: tmp.x - tmp.nx * 5.6, z: tmp.z - tmp.nz * 5.6, rot: tmp.yaw, t: c.crash.t + 0.5, s: s + 10 }; }
  // trees: the woods both sides, thinned round the town and the field
  for (let i = 0; i < 9000; i++) {
    // half of them crowd the road (New England woods come right down to the shoulder), half fill the hills
    const x = -1680 + r() * 3360, z = i % 3 === 0 ? -320 + r() * 640 : roadZ0(x) + (r() < 0.5 ? -1 : 1) * (11 + Math.pow(r(), 1.6) * 110), d = Math.abs(z - roadZ0(x));
    if (d < 9 + r() * 6 || z < -325 || z > 325) continue;
    if (d < 90 && openAt(sAtX(x)) && r() < 0.93) continue;   // pasture behind the walls
    if (Math.hypot(x - TOWN.x, z - TOWN.z) < 120 && r() < 0.85) continue;
    if (Math.hypot((x - FIELD.x) * 0.7, z - FIELD.z) < 110) continue;
    if (L.houses.some((h) => Math.hypot(h.x - x, h.z - z) < 11)) continue;
    { roadAt(SIDE_ROAD.s, tmp); const ux = -tmp.nx, uz = -tmp.nz, px = x - tmp.x, pz = z - tmp.z, along = px * ux + pz * uz, off = Math.abs(px * uz - pz * ux); if (along > 0 && along < 120 && off < 6) continue; }   // the woods road they come out of
    L.trees.push({ x, z, s: 0.85 + r() * 0.5, rot: r() * 6.28, kind: r() < 0.45 ? 'oak' : r() < 0.6 ? 'maple' : 'pine' });
  }
  // solid buildings for bodies and bullets: the church and its tower, the depot, the gas station, the tanker
  L.blocks = [];
  { const c = L.church, cs = Math.cos(c.rot), sn = Math.sin(c.rot), at = (lx, lz) => [c.x + lx * cs + lz * sn, c.z - lx * sn + lz * cs];
    const [nx, nz] = at(0, -2); L.blocks.push({ x: nx, z: nz, hx: 5.6, hz: 10.5, rot: c.rot, h: 11, kind: 'church' });
    const [tx, tz] = at(0, 10.2); L.blocks.push({ x: tx, z: tz, hx: 2.3, hz: 2.3, rot: c.rot, h: 26, kind: 'church' }); }
  { roadAt(L.rail - 15, tmp); L.station = { x: tmp.x + tmp.nx * 34, z: tmp.z + tmp.nz * 34, rot: tmp.yaw - Math.PI / 2 };
    L.blocks.push({ x: L.station.x, z: L.station.z, hx: 3.6, hz: 9, rot: L.station.rot, h: 6.5, kind: 'station' }); }
  { const g = L.gas; roadAt(S_TOWN + 230, tmp); g.yaw = tmp.yaw; g.lx = tmp.nx; g.lz = tmp.nz;
    const sx = tmp.x - tmp.nx * 31, sz = tmp.z - tmp.nz * 31; g.store = { x: sx, z: sz };
    L.blocks.push({ x: sx, z: sz, hx: 5, hz: 4, rot: tmp.yaw, h: 4.2, kind: 'store' });
    for (const u of [-3.2, 3.2]) { const px = g.x + Math.sin(tmp.yaw) * u, pz = g.z + Math.cos(tmp.yaw) * u; L.blocks.push({ x: px, z: pz, hx: 0.5, hz: 0.9, rot: tmp.yaw, h: 1.7, kind: 'pump' }); } }
  { const T = L.tanker; L.blocks.push({ x: T.x, z: T.z, hx: 1.3, hz: 8.2, rot: T.rot, h: 3.6, kind: 'tanker' }); }
  // the Telechron works: five storeys of brick mill along Main Street with its clock tower. A Texan cruise missile
  // salvo takes it down just as your convoy passes it on the way out of town
  { roadAt(S_TOWN + 92, tmp); const x = tmp.x + tmp.nx * 50, z = tmp.z + tmp.nz * 50;
    L.megas = [{ x, z, y: heightAt(x, z), rot: tmp.yaw - Math.PI / 2, w: 72, d: 20, floors: 5, fh: 4.6, bay: 4.5, T: 22.4, seed: 1912, style: 'brick', clock: true, clockSide: -1, lean: [0.15, 1], cut: 1.6, name: 'TELECHRON' }];
    L.megaPlans = L.megas.map(planStructure); L.dynBoxes = L.megaPlans.flatMap(structureBoxes); }
  // the common: a bandstand, the flagpole, the war memorial
  { roadAt(S_TOWN - 55, tmp); L.bandstand = { x: tmp.x - tmp.nx * 19, z: tmp.z - tmp.nz * 19 }; L.blocks.push({ x: L.bandstand.x, z: L.bandstand.z, hx: 3.2, hz: 3.2, rot: 0, h: 1.1, kind: 'bandstand' });
    roadAt(S_TOWN - 22, tmp); L.flag = { x: tmp.x - tmp.nx * 12, z: tmp.z - tmp.nz * 12 }; roadAt(S_TOWN - 36, tmp); L.memorial = { x: tmp.x - tmp.nx * 10, z: tmp.z - tmp.nz * 10, rot: tmp.yaw }; }
  // barns by some of the farmhouses
  L.barns = []; L.houses.forEach((h, i) => { if (h.town || i % 3) return; const c = Math.cos(h.rot), sn = Math.sin(h.rot), lx = h.w / 2 + 9, lz = -6, x = h.x + lx * c + lz * sn, z = h.z - lx * sn + lz * c;
    L.barns.push({ x, z, rot: h.rot }); L.blocks.push({ x, z, hx: 4, hz: 6, rot: h.rot, h: 8, kind: 'barn' }); });
  L.trees = L.trees.filter((t) => !L.megas.some((m) => Math.hypot(m.x - t.x, m.z - t.z) < 60)).filter((t) => !L.blocks.some((b) => Math.hypot(b.x - t.x, b.z - t.z) < Math.max(b.hx, b.hz) + 6) && !(Math.abs(sAtX(t.x) - L.rail) < 7));
  // cover at the field for the last fight: the walls, the parked cars, round bales
  L.bales = [];
  for (let k = 0; k < 9; k++) L.bales.push({ x: FIELD.x - 60 + r() * 120, z: FIELD.z - 50 + r() * 100, rot: r() * 6.28 });
  for (const w of L.walls) if (Math.hypot(w.x - FIELD.x, w.z - FIELD.z) < 160) for (const sd of [-1, 1]) L.positions.push({ x: w.x + Math.sin(w.rot) * 0, z: w.z + sd * 0.9, kind: 'wall' });
  for (const b of L.bales) L.positions.push({ x: b.x + 1.4, z: b.z - 1.0, kind: 'bale' }, { x: b.x - 1.4, z: b.z + 1.0, kind: 'bale' });

  // ---------- two Black Hawks into the hayfield: one for the Cape, one out to the fleet ----------
  L.helos = [
    { kind: 'extract', x: FIELD.x - 18, z: FIELD.z + 8, y: heightAt(FIELD.x - 18, FIELD.z + 8), tTouch: 122, tLift: 156, cap: 10, ax: -0.5, az: 0.86, dx: -0.9, dz: -0.42 },
    { kind: 'extract', x: FIELD.x + 22, z: FIELD.z + 16, y: heightAt(FIELD.x + 22, FIELD.z + 16), tTouch: 125, tLift: 150, cap: 10, ax: -0.3, az: 0.95, dx: -0.6, dz: -0.8 },
  ];
  L.rides[3].burnT = 97.8; L.rides[6].burnT = 113.2; L.rides[7].burnT = 113.6; L.rides[4].burnT = 147.5;
  { roadAt(SIDE_ROAD.s, tmp); L.sideRoad = { x: tmp.x, z: tmp.z, ux: -tmp.nx, uz: -tmp.nz }; roadAt(S_TOWN - 40, tmp); L.trail = { x: tmp.x - tmp.nx * 26, z: tmp.z - tmp.nz * 26 }; }
  // the cloud over Boston
  L.blast = { t: 9, x: -5200, z: -3300 };   // Boston, 35 km (drawn at the angle it would fill)
  cached = L;
  return L;
}

// one car through the whole tape: parked, away, the chase (weaving), a crash or a stop at the field
function trackFor(c, rides, r) {
  const n = Math.round(T_CAR / DTC) + 1, out = new Float32Array(n * 7), tmp = {};
  let s = c.s0, v = 0, lat = c.lat0, yawOff = 0, roll = 0, rollV = 0, latV = 0, spinV = 0, y0 = 0, crashed = false, rest = false;
  for (let k = 0; k < n; k++) {
    const t = k * DTC;
    if (t >= c.t0 && !rest) {
      const cr = c.crash && t >= c.crash.t;
      if (cr && !crashed) { crashed = true; latV = c.crash.dir * (5 + r() * 2); spinV = c.crash.dir * c.crash.spin; rollV = c.crash.roll ? 7 : 0; }
      if (!crashed) {
        let want = c.vmax;
        if (c.follow) { const lead = c.follow.map((i) => rides[i]).find((l) => l.track && !(l.crash && t >= l.crash.t)); if (lead) { const ls = sAtX(lead.track[k * 7]); if (ls - s < c.gap) want = Math.min(want, Math.max(8, (ls - s - c.gap * 0.6) * 1.2 + 20)); } }
        if (c.stop) { const dist = c.stop - s, vb = Math.sqrt(Math.max(0, 2 * 5.5 * dist)); want = Math.min(want, vb); if (dist < 0.3) { want = 0; } }
        v += Math.max(-7 * DTC, Math.min(c.acc * DTC, want - v));
        const laneW = c.stop && c.stop - s < 60 ? 5.2 : (c.side ? 0.6 : 1.2) + Math.sin(t * 0.7 + c.i) * c.weave;
        lat += (laneW - lat) * Math.min(1, DTC * (c.stop && c.stop - s < 60 ? 0.8 : 1.6));
        yawOff = (laneW - lat) * 0.04;
        if (c.stop && v < 0.05 && c.stop - s < 1) rest = true;
      } else {   // off the road: sideways, spinning, maybe rolling, then still
        v = Math.max(0, v - 9 * DTC); lat += latV * DTC; latV *= Math.pow(0.4, DTC);
        yawOff += spinV * DTC; spinV *= Math.pow(0.35, DTC);
        roll += rollV * DTC; rollV = Math.max(0, rollV - 2.6 * DTC);
        if (v <= 0 && rollV <= 0) { rest = true; roll = Math.round(roll / Math.PI) * Math.PI; }
      }
      s += v * DTC;
    }
    roadAt(s, tmp);
    const x = tmp.x + tmp.nx * lat, z = tmp.z + tmp.nz * lat, gy = heightAt(x, z);
    const bounce = crashed && !rest ? Math.abs(Math.sin(roll)) * 0.9 : 0;
    const o = k * 7; out[o] = x; out[o + 1] = gy + bounce; out[o + 2] = z; out[o + 3] = tmp.yaw + yawOff; out[o + 4] = 0; out[o + 5] = roll; out[o + 6] = v;
  }
  return out;
}

// pose of car c at tape time t (interpolated)
export function carPose(c, t, out = {}) {
  const f = Math.max(0, Math.min(T_CAR / DTC - 1.0001, t / DTC)), k = Math.floor(f), u = f - k, a = k * 7, b = a + 7, T = c.track;
  out.x = T[a] + (T[b] - T[a]) * u; out.y = T[a + 1] + (T[b + 1] - T[a + 1]) * u; out.z = T[a + 2] + (T[b + 2] - T[a + 2]) * u;
  let dy = T[b + 3] - T[a + 3]; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
  out.yaw = T[a + 3] + dy * u; out.pitch = 0; out.roll = T[a + 5] + (T[b + 5] - T[a + 5]) * u; out.v = T[a + 6] + (T[b + 6] - T[a + 6]) * u;
  out.wreck = !!(c.crash && t >= c.crash.t);
  return out;
}
// a seat's world position (feet) and facing at time t
export function seatPose(c, si, t, out = {}) {
  const p = carPose(c, t, out), st = c.seats[si];
  const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw), cr = Math.cos(p.roll), sr = Math.sin(p.roll);
  // roll about the car's forward axis, then yaw
  const lx = st[0] * cr - st[1] * sr, ly = st[0] * sr + st[1] * cr, lz = st[2];
  out.sx = p.x + lx * cy + lz * sy; out.sy = p.y + ly; out.sz = p.z - lx * sy + lz * cy; out.syaw = p.yaw + st[3];
  return out;
}
