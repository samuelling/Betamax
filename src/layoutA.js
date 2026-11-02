// Ashland State Park: what's in the woods, and where the paths go.
import { mulberry32 } from './rng.js';
import { heightAt } from './terrain.js';
import { ARENA_ASH, LAKE, BEACH, LOT, CAMPS, TRAILHEAD, DAM_Z, lakeDist } from './terrainA.js';
import { planStructure, structureBoxes } from './megastruct.js';

export const AT = { drop: 2, op: 42, spotted: 54, charges: 86, mast: 98, fuel: 105, pull: 122 };
let cached = null;
export function buildAshLayout() {
  if (cached) return cached;
  const r = mulberry32(1846);
  const L = { scene: 'ash', ARENA: ARENA_ASH, T: AT, LAKE, BEACH, LOT, CAMPS, TRAILHEAD };
  for (const k of ['houses', 'cars', 'trees', 'walls', 'poles', 'mailboxes', 'hedges', 'positions', 'rocks', 'vehicles', 'gunships', 'helos', 'smokes', 'minePosts', 'wireRuns', 'mines', 'colliders', 'blocks', 'rawBoxes', 'dynBoxes']) L[k] = [];
  // ---------- the paths ----------
  L.trails = [
    [[LOT.x - 20, LOT.z + 6], [60, -6], [BEACH.x, BEACH.z - 4], [8, -18], [-14, -36], [-30, -56], [CAMPS[0].x + 10, CAMPS[0].z + 12]],   // the shore path, round to the camps
    [[LOT.x + 30, LOT.z - 4], [140, -48], [175, -58], [TRAILHEAD.x, TRAILHEAD.z]],                                                          // out to the common
    [[CAMPS[0].x, CAMPS[0].z], [-30, -124], [CAMPS[1].x, CAMPS[1].z], [60, -166], [120, -178], [208, -186]],                                   // the camp road
    [[-140, 30], [-150, 100], [-110, 170], [-40, DAM_Z + 4], [40, DAM_Z + 2], [90, 120], [96, 40], [LOT.x, LOT.z + 18]],                       // round the north end, over the dam
  ];
  const pathD = (x, z) => { let best = 1e9; for (const t of L.trails) for (let i = 0; i < t.length - 1; i++) { const [ax, az] = t[i], [bx, bz] = t[i + 1], dx = bx - ax, dz = bz - az, u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz))), d = Math.hypot(x - ax - dx * u, z - az - dz * u); if (d < best) best = d; } return best; };
  L.pathD = pathD;
  // ---------- the camps: tents in rows under nets, a cook fire, the trucks, the mast ----------
  L.tents = [];
  CAMPS.forEach((c, ci) => { for (let k = 0; k < (ci ? 5 : 7); k++) { const a = k / (ci ? 5 : 7) * Math.PI * 2 + ci, d = 13 + (k % 2) * 5, x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d, rot = a + Math.PI / 2; L.tents.push({ x, z, rot, camp: ci, door: { x: c.x + Math.cos(a) * (d - 3.2), z: c.z + Math.sin(a) * (d - 3.2) } }); L.blocks.push({ x, z, hx: 2.6, hz: 3.2, rot, h: 2.6, kind: 'tent' }); L.positions.push({ x: c.x + Math.cos(a) * (d + 4), z: c.z + Math.sin(a) * (d + 4), kind: 'tent', camp: ci }); } });
  L.trucks = [{ x: CAMPS[1].x + 22, z: CAMPS[1].z + 10, rot: 1.9 }, { x: CAMPS[1].x + 28, z: CAMPS[1].z - 2, rot: 1.7 }, { x: CAMPS[1].x + 16, z: CAMPS[1].z + 20, rot: 2.1 }, { x: CAMPS[0].x - 20, z: CAMPS[0].z + 16, rot: 0.4 }];
  for (const t of L.trucks) { L.cars.push([t.x, t.z, t.rot]); L.positions.push({ x: t.x + 3, z: t.z + 2, kind: 'truck' }); }
  L.cars.push([LOT.x - 8, LOT.z + 4, 1.57], [LOT.x + 6, LOT.z - 6, 1.57], [LOT.x + 14, LOT.z + 4, 1.6]);   // in the lot: the scouts' pickup and two left behind
  L.fuel = { x: CAMPS[1].x - 10, z: CAMPS[1].z - 14, T: AT.fuel };
  L.blocks.push({ x: L.fuel.x, z: L.fuel.z, hx: 3, hz: 2, rot: 0.3, h: 1.6, kind: 'fuel' });
  L.megas = [{ name: 'MAST', x: CAMPS[0].x - 6, y: heightAt(CAMPS[0].x - 6, CAMPS[0].z - 4), z: CAMPS[0].z - 4, rot: 0.4, w: 3, d: 3, floors: 9, fh: 6, T: AT.mast, seed: 41, style: 'mast', lean: [1, 0.3] }];
  L.megaPlans = L.megas.map(planStructure);
  for (const pl of L.megaPlans) L.dynBoxes.push({ x: pl.spec.x, z: pl.spec.z, c: 1, s: 0, hx: 1.6, hz: 1.6, y0: pl.spec.y - 1, y1: pl.spec.y + pl.H, kind: 'mast', walk: false, until: pl.T + 2 });
  // ---------- the beach: the bathhouse, the lifeguard chair, tables; hammocks in the pines above the sand ----------
  L.bathhouse = { x: BEACH.x + 22, z: BEACH.z - 22, rot: 0.6 }; L.blocks.push({ x: L.bathhouse.x, z: L.bathhouse.z, hx: 7, hz: 4.5, rot: 0.6, h: 4, kind: 'house' });
  L.tables = []; for (let k = 0; k < 6; k++) { const x = BEACH.x + 6 + (k % 3) * 7, z = BEACH.z - 14 + Math.floor(k / 3) * 6; L.tables.push({ x, z, rot: r() * 0.6 }); L.blocks.push({ x, z, hx: 1.0, hz: 0.9, rot: 0, h: 0.8, kind: 'table' }); }
  L.hammockSpots = [{ x: BEACH.x - 18, z: BEACH.z - 20 }, { x: BEACH.x - 8, z: BEACH.z - 30 }, { x: BEACH.x + 10, z: BEACH.z - 34 }];
  // ---------- the woods: oak, maple, white pine, hemlock; granite; old walls from when it was pasture ----------
  const clear = (x, z, pad = 0) => lakeDist(x, z) < 2 + pad || Math.hypot(x - BEACH.x, z - BEACH.z) < 24 + pad || (Math.abs(x - LOT.x) < LOT.hw + 4 + pad && Math.abs(z - LOT.z) < LOT.hd + 4 + pad) || CAMPS.some((c) => Math.hypot(x - c.x, z - c.z) < 20 + pad) || pathD(x, z) < 2.6 + pad || Math.abs(z - DAM_Z) < 10 && Math.abs(x - LAKE.x) < 92;
  for (let i = 0; i < 5200; i++) {
    const x = ARENA_ASH.x0 - 30 + r() * 480, z = ARENA_ASH.z0 - 30 + r() * 480; if (clear(x, z)) continue;
    const near = CAMPS.some((c) => Math.hypot(x - c.x, z - c.z) < 34);   // the camps are under the trees: thick round them
    L.trees.push({ x, z, s: 0.8 + r() * 0.55, rot: r() * 6.28, kind: r() < (near ? 0.3 : 0.38) ? 'oak' : r() < 0.4 ? 'maple' : 'pine' });
  }
  // hammock trees: pairs of pines 4.5 m apart over the beach
  L.hammocks = L.hammockSpots.map((h, k) => { const a = 0.4 + k * 0.9, t1 = { x: h.x - Math.cos(a) * 2.3, z: h.z - Math.sin(a) * 2.3, s: 1.1, rot: k, kind: 'pine' }, t2 = { x: h.x + Math.cos(a) * 2.3, z: h.z + Math.sin(a) * 2.3, s: 1.05, rot: k + 1, kind: 'pine' }; L.trees.push(t1, t2); return { a: t1, b: t2, col: k }; });
  for (let k = 0; k < 160; k++) { const x = ARENA_ASH.x0 + r() * 420, z = ARENA_ASH.z0 + r() * 420; if (clear(x, z, 2)) continue; const s = 0.5 + r() * r() * 2.4; L.rocks.push({ x, z, s, sq: 0.55 + r() * 0.3, rot: r() * 6 }); if (s > 0.9) L.positions.push({ x: x + 1.6 * s, z: z + 0.5, kind: 'rock' }); }
  for (let w = 0; w < 9; w++) { let x = ARENA_ASH.x0 + 20 + r() * 380, z = ARENA_ASH.z0 + 20 + r() * 380; const a = r() * Math.PI, n = 6 + Math.floor(r() * 14);
    for (let k = 0; k < n; k++) { x += Math.cos(a) * 6.2; z += Math.sin(a) * 6.2; if (clear(x, z) || lakeDist(x, z) < 6) continue; L.walls.push({ x, z, len: 6.2, rot: -a, h: 0.7, kind: 'stone' }); if (k % 3 === 0) L.positions.push({ x: x + Math.sin(a) * 1.1, z: z - Math.cos(a) * 1.1, kind: 'wall' }); } }
  for (const t of L.trees) if (r() < 0.035 && CAMPS.some((c) => Math.hypot(t.x - c.x, t.z - c.z) < 90)) L.positions.push({ x: t.x + 0.9, z: t.z + 0.4, kind: 'tree' });
  L.op = { x: CAMPS[0].x + 42, z: CAMPS[0].z + 30 };   // where the scouts lie up to watch camp A
  cached = L; return L;
}
