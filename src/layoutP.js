// The Port: what stands on the wharf, and when the big things come down.
import { mulberry32 } from './rng.js';
import { ARENA_PORT, QUAY_Z, DECK } from './terrainP.js';
import { planStructure, structureBoxes } from './megastruct.js';

export const PT = { bus: 2, aa: 9, drop0: 16, drop1: 26, fall: 28, elevator: 62, crane: 79, tower: 109, board: 138 };
let cached = null;
export function buildPortLayout() {
  if (cached) return cached;
  const r = mulberry32(1839);   // the year the town was founded as a trading post
  const L = { scene: 'port', ARENA: ARENA_PORT, T: PT };
  for (const k of ['houses', 'cars', 'trees', 'walls', 'poles', 'mailboxes', 'hedges', 'positions', 'rocks', 'vehicles', 'gunships', 'helos', 'smokes', 'minePosts', 'wireRuns', 'mines', 'colliders', 'blocks', 'rawBoxes', 'dynBoxes']) L[k] = [];
  const B = (x, z, hx, hz, y0, y1, kind, walk = false, rot = 0) => ({ x, z, c: Math.cos(rot), s: Math.sin(rot), hx, hz, y0, y1, kind, walk });
  // ---------- the ship alongside: an amphibious assault ship, 250 m, flight deck 21 m up; the gangway amidships ----------
  L.ship = { x0: -85, x1: 165, z0: QUAY_Z + 1, z1: QUAY_Z + 33, deck: 21, door: { x: 18.2, y: 9.3, z: QUAY_Z + 0.4 } };
  L.rawBoxes.push(B(40, (L.ship.z0 + L.ship.z1) / 2, 125, 16, -12, 21, 'hull'));
  { const n = 20, x0 = 2, x1 = 16; for (let k = 0; k < n; k++) { const x = x0 + (k + 0.5) * (x1 - x0) / n, y = DECK + (k + 1) * (L.ship.door.y - DECK) / n; L.rawBoxes.push(B(x, QUAY_Z - 0.6, (x1 - x0) / n / 2 + 0.02, 0.8, DECK - 1, y, 'stair', true)); }
    L.rawBoxes.push(B(17.6, QUAY_Z - 0.4, 1.6, 1.0, DECK - 1, L.ship.door.y, 'stair', true));
    for (const z of [QUAY_Z - 1.45]) L.rawBoxes.push(B(9, z, 7.5, 0.04, DECK, L.ship.door.y + 1, 'rail')); }
  L.gangway = { x0: 2, x1: 16, z: QUAY_Z - 0.6 };
  // ---------- ship-to-shore cranes on their rails along the quay ----------
  L.cranes = [-215, -163, -111].map((x, i) => ({ x, i }));
  // ---------- the container yard: rows of stacks, one to four high ----------
  L.stacks = [];
  for (let bx = 0; bx < 12; bx++) for (let bz = 0; bz < 5; bz++) for (let row = 0; row < 3; row++) {
    const x = -238 + bx * 14.4, z = -50 + bz * 22 + row * 2.8; if (r() < 0.12) continue;
    const n = 1 + Math.floor(r() * r() * 4.2); L.stacks.push({ x, z, n, seed: r() });
    L.blocks.push({ x, z, hx: 6.1, hz: 1.3, rot: 0, h: n * 2.6, kind: 'box' });
  }
  for (const s of L.stacks) if (r() < 0.25) for (const sd of [-1, 1]) L.positions.push({ x: s.x + sd * 7, z: s.z + (r() - 0.5) * 2, kind: 'box' });
  // ---------- transit sheds; the port authority tower; the grain elevator ----------
  L.sheds = [{ x: 30, z: -25, w: 100, d: 30, h: 11 }, { x: 30, z: 30, w: 100, d: 26, h: 11 }];
  for (const s of L.sheds) { L.blocks.push({ x: s.x, z: s.z, hx: s.w / 2, hz: s.d / 2, rot: 0, h: s.h, kind: 'shed' }); for (const sx of [-1, 1]) for (const sz of [-1, 1]) L.positions.push({ x: s.x + sx * (s.w / 2 + 1.2), z: s.z + sz * (s.d / 2 - 2), kind: 'shed' }); }
  L.megas = [
    { name: 'PORT AUTHORITY', x: -40, y: DECK, z: -140, rot: 0.1, w: 26, d: 22, floors: 14, fh: 3.9, bay: 4.3, T: PT.tower, seed: 1926, style: 'glass', mast: 14, lean: [0.6, -0.8] },
    { name: 'PUBLIC GRAIN ELEVATOR', x: 196, y: DECK, z: 34, rot: 0, w: 84, d: 34, floors: 8, fh: 5.4, binR: 4.2, T: PT.elevator, seed: 1949, style: 'silo', lean: [0, 1], cut: 1.2 },
    { name: 'CRANE', crane: true, x: L.cranes[1].x, y: DECK, z: QUAY_Z - 9, rot: 0, w: 20, d: 16, floors: 1, fh: 4, T: PT.crane, seed: 77, style: 'crane', lean: [0.15, 1], ground: (x, z) => (z > 9 ? -12 : 0) },
    ...[0, 2].map((i) => ({ name: 'CRANE', crane: true, x: L.cranes[i].x, y: DECK, z: QUAY_Z - 9, rot: 0, w: 20, d: 16, floors: 1, fh: 4, T: 1e6, seed: 70 + i, style: 'crane' })),
  ];
  L.megaPlans = L.megas.map(planStructure);
  for (const pl of L.megaPlans) {
    if (pl.spec.crane) for (const lx of [-9, 9]) for (const lz of [-8, 8]) L.dynBoxes.push({ ...B(pl.spec.x + lx, pl.spec.z + lz, 0.9, 0.9, DECK - 1, DECK + 40, 'leg'), until: pl.T + 1.5 });
    else L.dynBoxes.push(...structureBoxes(pl));
  }
  // ---------- the staging lot: AAVs in rows, trucks, the AA technicals; buses at the gate ----------
  L.aavs = []; for (let k = 0; k < 12; k++) { const x = 92 + (k % 6) * 22, z = -150 + Math.floor(k / 6) * 26; L.aavs.push({ x, z, rot: Math.PI / 2 + (r() - 0.5) * 0.1 }); L.blocks.push({ x, z, hx: 1.85, hz: 4.1, rot: Math.PI / 2, h: 3.1, kind: 'aav' }); L.positions.push({ x: x, z: z + 3, kind: 'aav' }, { x: x, z: z - 3, kind: 'aav' }); }
  L.aa = [{ x: 70, z: -70, rot: 0.6 }, { x: -20, z: -88, rot: -0.4 }, { x: -130, z: -95, rot: 2.6 }, { x: 160, z: -96, rot: 1.9 }, { x: 120, z: 70, rot: 0.2 }];
  for (const a of L.aa) L.cars.push([a.x, a.z, a.rot]);
  for (let k = 0; k < 10; k++) { const x = -110 + r() * 300, z = -175 + r() * 90; if (L.blocks.some((b) => Math.hypot(b.x - x, b.z - z) < 14)) continue; L.cars.push([x, z, r() * 6.28]); }
  L.buses = [{ x: -18, z: -172, rot: Math.PI / 2 }, { x: 14, z: -168, rot: Math.PI / 2 - 0.15 }];
  for (const b of L.buses) L.blocks.push({ x: b.x, z: b.z, hx: 1.3, hz: 6.2, rot: b.rot, h: 3.2, kind: 'bus' });
  // high-mast lights
  L.masts = []; for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { const x = -230 + i * 92, z = -160 + j * 100; if (L.blocks.some((b) => Math.abs(b.x - x) < b.hx + 3 && Math.abs(b.z - z) < b.hz + 3)) continue; L.masts.push({ x, z }); L.colliders.push({ x, z, r: 0.5 }); }
  for (const m of L.masts) L.rawBoxes.push(B(m.x, m.z, 0.5, 0.5, DECK - 1, DECK + 30, 'mast'));
  // bollards and cover along the quay
  for (let x = -240; x < 240; x += 16) L.positions.push({ x, z: QUAY_Z - 4, kind: 'quay' });
  // ---------- the drop: four sticks along the lot from the south-west ----------
  L.dz = { x0: 60, x1: 230, z0: -160, z1: -40 };
  cached = L; return L;
}
