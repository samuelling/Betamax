// The Bomb: Route 135 out of Ashland, west through the woods toward Hopkinton, to a hayfield where the helicopters
// come in. -x is east (Boston, the flash, the cloud), as at the beach; +x is west, the way the convoy runs.
import { fbm, smoothstep } from './rng.js';

export const ARENA_BOMB = { x0: -1650, x1: 1650, z0: -330, z1: 330 };
// the road: a winding two-lane, sampled every 4 m and measured by distance along it
const X0 = -1700, X1 = 1700, STEP = 4;
export function roadZ0(x) { return 60 * Math.sin(x * 0.0021 + 0.3) + 22 * Math.sin(x * 0.0063 + 1.1) + 8 * Math.sin(x * 0.017); }
const RP = (() => {
  const n = Math.floor((X1 - X0) / STEP) + 1, x = new Float32Array(n), z = new Float32Array(n), s = new Float32Array(n);
  for (let i = 0; i < n; i++) { x[i] = X0 + i * STEP; z[i] = roadZ0(x[i]); if (i) s[i] = s[i - 1] + Math.hypot(x[i] - x[i - 1], z[i] - z[i - 1]); }
  return { n, x, z, s };
})();
export const ROAD_LEN = RP.s[RP.n - 1];
export const S_TOWN = 300, S_FIELD = 2980;       // Ashland common; the hayfield gate
// position, heading (+z of the car is forward = toward +s) and left normal at distance s
export function roadAt(s, out = {}) {
  s = Math.max(0, Math.min(ROAD_LEN - 0.01, s));
  let lo = 0, hi = RP.n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (RP.s[m] <= s) lo = m; else hi = m; }
  const u = (s - RP.s[lo]) / (RP.s[hi] - RP.s[lo]), dx = RP.x[hi] - RP.x[lo], dz = RP.z[hi] - RP.z[lo], l = Math.hypot(dx, dz);
  out.x = RP.x[lo] + dx * u; out.z = RP.z[lo] + dz * u; out.yaw = Math.atan2(dx, dz); out.nx = -dz / l; out.nz = dx / l;   // n points to the right of travel... (see sRight)
  return out;
}
// distance along the road of the closest point, by x (the road is a function of x)
export function sAtX(x) { const i = Math.max(0, Math.min(RP.n - 1, Math.round((x - X0) / STEP))); return RP.s[i]; }
export const ROAD_HALF = 3.6;
export function roadDist(x, z) { return Math.abs(z - roadZ0(x)) * Math.cos(Math.atan(0.2)) - ROAD_HALF; }

const T0 = roadAt(S_TOWN), FLD = roadAt(S_FIELD);
export const TOWN = { x: T0.x, z: T0.z };
export const FIELD = { x: FLD.x + 6, z: FLD.z + 80 };    // north of the road
export const SIDE_ROAD = { s: 640 };
// the open stretches: pasture and hayfields behind stone walls, the woods pulled back
export const openAt = (s) => Math.sin(s * 0.004 + 1) > 0.45 || Math.abs(s - S_FIELD) < 140;                       // the dirt road out of the woods, where they come from

function hills(x, z) { return 38 + (fbm(x * 0.0018 + 4.2, z * 0.0018 - 1.3, 4) - 0.5) * 46 + (fbm(x * 0.012, z * 0.012, 3) - 0.5) * 4; }
function grade(x) { const z = roadZ0(x); return 38 + (fbm(x * 0.0018 + 4.2, z * 0.0018 - 1.3, 4) - 0.5) * 46; }

export function heightBomb(x, z) {
  let y = hills(x, z);
  // the road, graded smooth, with banks down to it
  const rz = roadZ0(x), d = Math.abs(z - rz);
  if (d < 22) { const k = smoothstep(22, 5, d); y = y * (1 - k) + grade(x) * k; }
  // the town common and the field are flat
  const dt = Math.hypot(x - TOWN.x, z - TOWN.z); if (dt < 150) { const k = smoothstep(150, 70, dt); y = y * (1 - k) + grade(TOWN.x) * k; }
  const df = Math.hypot((x - FIELD.x) * 0.7, z - FIELD.z); if (df < 140) { const k = smoothstep(140, 80, df); y = y * (1 - k) + grade(FIELD.x) * k; }
  return y;
}
export function fieldMask(x, z) { return smoothstep(120, 90, Math.hypot((x - FIELD.x) * 0.7, z - FIELD.z)); }
export function townMask(x, z) { return smoothstep(130, 80, Math.hypot(x - TOWN.x, z - TOWN.z)); }
