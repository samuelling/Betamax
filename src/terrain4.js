// East Sandwich, MA: glacial upland cut by Route 6A (the Old King's Highway), old Capes on stone-walled lots,
// pitch pine and oak woods to the south, and the salt marsh running north to Cape Cod Bay.
// +z = north (the marsh and the bay), -z = south (the woods), +x = east.
import { fbm, vnoise, smoothstep } from './rng.js';

export const ARENA_SANDWICH = { x0: -122, x1: 122, z0: -122, z1: 112 };
export const MARSH_Z = 78;            // where the upland gives way to the marsh
export const LZ = { x: -58, z: 56 };  // the meadow the extraction lands in
export const CRASH = { x: 40, z: -74 };

// roads as polylines: 6A east-west, Jones Lane north to the marsh, a sand road south into the woods
export function road6A(x) { return 2 + Math.sin(x * 0.012 + 0.4) * 6; }
export function laneX(z) { return 30 + Math.sin(z * 0.035) * 4; }
export function sandRoadX(z) { return -24 + Math.sin(z * 0.03 + 1) * 6; }
export const ROAD_W = { r6a: 4.2, lane: 2.7, sand: 2.4 };   // half widths

// distance to the nearest road edge band, and which road (for colouring and flattening)
export function roadInfo(x, z) {
  const d6 = Math.abs(z - road6A(x)) - ROAD_W.r6a;
  const dl = z > road6A(x) && z < MARSH_Z + 4 ? Math.abs(x - laneX(z)) - ROAD_W.lane : 99;
  const ds = z < road6A(x) && z > -118 ? Math.abs(x - sandRoadX(z)) - ROAD_W.sand : 99;
  if (d6 <= dl && d6 <= ds) return { d: d6, kind: 'r6a' };
  if (dl <= ds) return { d: dl, kind: 'lane' };
  return { d: ds, kind: 'sand' };
}

function upland(x, z) {
  // rolling moraine with a long fall toward the marsh; the woods to the south sit a little higher
  let y = 7.5 + (fbm(x * 0.006 + 3.1, z * 0.006 - 2.2, 4) - 0.5) * 9;
  y += (fbm(x * 0.02 + 11, z * 0.02 + 5, 3) - 0.5) * 2.2;
  y += smoothstep(0, -110, z) * 2.5;
  return y;
}
function grade(x, z) { return 7.5 + (fbm(x * 0.006 + 3.1, z * 0.006 - 2.2, 4) - 0.5) * 9 + smoothstep(0, -110, z) * 2.5; }

export function heightSandwich(x, z) {
  // the bay beyond the marsh
  if (z > 170) return -1.6 - (z - 170) * 0.01;
  let y = upland(x, z);
  // roads: graded smooth (no lumps), with soft shoulders
  const ri = roadInfo(x, z);
  if (ri.d < 3) { const k = smoothstep(3, 0, ri.d); y = y * (1 - k) + (grade(x, z) - (ri.kind === 'sand' ? 0.05 : 0)) * k; }
  // the meadow at the LZ is mown flat
  const dz = Math.hypot(x - LZ.x, z - LZ.z);
  if (dz < 30) { const k = smoothstep(30, 16, dz); y = y * (1 - k) + grade(LZ.x, LZ.z) * k; }
  // the marsh: the upland drops to a near-flat sea of grass, cut by creeks
  const m = smoothstep(MARSH_Z - 10, MARSH_Z + 8, z);
  if (m > 0) {
    let mh = 0.45 + (fbm(x * 0.03, z * 0.03, 3) - 0.5) * 0.25;
    const creek = Math.abs(Math.sin((x + Math.sin(z * 0.05) * 25) * 0.025) * 30 + (z - 120) * 0.4);
    if (z > MARSH_Z + 6) mh -= smoothstep(6, 1, creek) * 1.1;
    mh -= smoothstep(150, 172, z) * 1.8;
    y = y * (1 - m) + mh * m;
  }
  y += (vnoise(x * 0.6, z * 0.6) - 0.5) * 0.06;
  return y;
}

// masks for the ground colour
export function marshMask(x, z) { return smoothstep(MARSH_Z - 4, MARSH_Z + 8, z); }
export function woodsMask(x, z) { return smoothstep(-30, -55, z) * (1 - smoothstep(10, 22, Math.hypot(x - 40, z + 74)) * 0) ; }
