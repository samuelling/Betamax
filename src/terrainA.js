// Ashland State Park at first light: the reservoir with mist on it, the earth dam and its spillway at the north end,
// the beach and the parking lot on the south-east shore, oak and white pine and hemlock everywhere else, granite and
// old stone walls in the woods. The Texan camps are hidden in the south-west woods; the trail out to Ashland common
// leaves the park to the east.
import { fbm, smoothstep } from './rng.js';

export const ARENA_ASH = { x0: -210, x1: 210, z0: -210, z1: 210 };
export const LAKE = { x: -40, z: 70, r: 104 };
export const BEACH = { x: 38, z: 8 };
export const LOT = { x: 92, z: -36, hw: 34, hd: 20, y: 5 };
export const CAMPS = [{ x: -62, z: -92 }, { x: 22, z: -140 }];
export const TRAILHEAD = { x: 205, z: -62 };
export const DAM_Z = LAKE.z + LAKE.r + 18;

export function lakeR(x, z) { const a = Math.atan2(z - LAKE.z, x - LAKE.x); return LAKE.r * (1 + 0.16 * Math.sin(a * 3 + 1) + 0.08 * Math.sin(a * 7 + 2.3)); }
export function lakeDist(x, z) { return Math.hypot(x - LAKE.x, z - LAKE.z) - lakeR(x, z); }   // < 0 in the water
export function heightAsh(x, z) {
  const ld = lakeDist(x, z);
  let y = 7 + (fbm(x * 0.007 + 3.1, z * 0.007 - 1.7, 4) - 0.5) * 26 + (fbm(x * 0.03, z * 0.03, 3) - 0.5) * 3;
  y = Math.max(y, 3);
  if (ld < 45) { const k = smoothstep(45, 0, ld); y = y * (1 - k) + 1.1 * k; }
  if (ld < 0) y = 1.1 + ld * 0.12 - 0.4 * smoothstep(0, -8, ld);   // shelving down under the water
  // the beach, the lot and the camps are flat; the dam is an embankment across the north end
  const db = Math.hypot(x - BEACH.x, z - BEACH.z); if (db < 34 && ld > -6) { const k = smoothstep(34, 18, db); y = y * (1 - k) + Math.max(0.6, Math.min(2.2, 0.6 + ld * 0.06)) * k; }
  const dl = Math.max(Math.abs(x - LOT.x) - LOT.hw, Math.abs(z - LOT.z) - LOT.hd); if (dl < 14) { const k = smoothstep(14, 0, dl); y = y * (1 - k) + LOT.y * k; }
  for (const c of CAMPS) { const d = Math.hypot(x - c.x, z - c.z); if (d < 40) { const k = smoothstep(40, 22, d); y = y * (1 - k) + (7 + (fbm(c.x * 0.007 + 3.1, c.z * 0.007 - 1.7, 4) - 0.5) * 18) * k; } }
  const dd = Math.abs(z - DAM_Z); if (dd < 12 && Math.abs(x - LAKE.x) < 90) { const k = smoothstep(12, 3, dd); y = Math.max(y, 9 * k + y * (1 - k)); }
  return y;
}
