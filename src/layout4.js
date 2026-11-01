// East Sandwich: where everything stands. Old Capes along Route 6A behind fieldstone walls, a lane north to the
// marsh and the meadow where the extraction lands, a sand road south into the pitch pines where the helicopter
// came down. Same shape as the beach layout, so the simulation, collisions and renderer can share it.
import { mulberry32 } from './rng.js';
import { heightAt, ARENA } from './terrain.js';
import { road6A, laneX, sandRoadX, MARSH_Z, LZ, CRASH, roadInfo } from './terrain4.js';

let cached = null;

export function buildSandwichLayout() {
  if (cached) return cached;
  const r = mulberry32(1639);   // the year the town was incorporated
  const L = { scene: 'sandwich', ARENA, LZ, CRASH };
  L.rocks = []; L.vehicles = []; L.gunships = []; L.smokes = []; L.minePosts = []; L.wireRuns = []; L.mines = []; L.colliders = [];
  L.houses = []; L.cars = []; L.trees = []; L.walls = []; L.poles = []; L.mailboxes = []; L.hedges = [];
  const free = (x, z, rad) => L.houses.every((h) => Math.hypot(h.x - x, h.z - z) > rad + Math.max(h.w, h.l) / 2) && roadInfo(x, z).d > rad;
  const tangent6A = (x) => Math.atan2(road6A(x + 1) - road6A(x - 1), 2);

  // ---------- houses ----------
  const house = (x, z, rot, floors, deck, front) => {
    const w = floors === 2 ? 10 + r() * 2 : 9 + r() * 3, l = floors === 2 ? 8 : 7 + r() * 1.5;
    L.houses.push({ x, z, w, l, rot, floors, deck, front, color: Math.floor(r() * 5) });
  };
  // along 6A, both sides, the house fronts toward the road
  for (const side of [1, -1]) {
    for (let x = -108 + (side > 0 ? 0 : 12); x < 112; x += 24 + r() * 7) {
      if (side > 0 && Math.abs(x - laneX(road6A(x) + 10)) < 15) continue;
      if (side < 0 && Math.abs(x - sandRoadX(road6A(x) - 10)) < 14) continue;
      const set = 15 + r() * 5, z = road6A(x) + side * set;
      const rot = -tangent6A(x) + (side > 0 ? Math.PI : 0);   // local +z (the front) faces the road
      house(x, z, rot, r() < 0.3 ? 2 : 1, r() < 0.35, side);
    }
  }
  // along the lane to the marsh
  for (const z of [32, 50, 66]) for (const side of [1, -1]) {
    if (side < 0 && z > 40) continue;   // the meadow is to the west
    const x = laneX(z) + side * (14 + r() * 3);
    house(x, z, side > 0 ? -Math.PI / 2 : Math.PI / 2, r() < 0.25 ? 2 : 1, r() < 0.3, 0);
  }
  // a couple back in the woods off the sand road
  for (const z of [-44, -66]) { const side = z === -44 ? 1 : -1; house(sandRoadX(z) + side * 15, z, side > 0 ? -Math.PI / 2 : Math.PI / 2, 1, false, 0); }

  // ---------- fieldstone walls along the road frontage, picket fences and privet hedges between lots ----------
  for (const h of L.houses) {
    if (h.front) {
      const zf = road6A(h.x) + h.front * 6.2, ang = tangent6A(h.x);
      for (const sd of [-1, 1]) { const len = h.w * 0.8 + 3; const cx = h.x + sd * (len / 2 + 1.6); L.walls.push({ x: cx, z: road6A(cx) + h.front * 6.2, len, rot: -ang, h: 0.85, kind: r() < 0.7 ? 'stone' : 'picket' }); }
      L.mailboxes.push({ x: h.x + 3.2, z: road6A(h.x + 3.2) + h.front * 5.3, rot: -ang });
      // the drive, with the car parked in it
      if (r() < 0.75) { const dx = h.x + h.w / 2 + 2.6, dz = (zf + h.z) / 2; L.cars.push([dx, dz, -ang + Math.PI / 2 + (r() - 0.5) * 0.2]); }
    }
    // a hedge or fence down one side of the lot
    const sx = h.x + Math.cos(h.rot) * (h.w / 2 + 4) * (r() < 0.5 ? 1 : -1), sz = h.z - Math.sin(h.rot) * (h.w / 2 + 4);
    L.hedges.push({ x: sx, z: sz, len: h.l + 8, rot: h.rot + Math.PI / 2, h: 1.6 + r() * 0.6 });
  }
  // a few cars abandoned on 6A when it started
  for (const x of [-70, -12, 58, 92]) L.cars.push([x, road6A(x) + (r() - 0.5) * 3, -tangent6A(x) + Math.PI / 2 + (r() - 0.5) * 0.5]);
  // utility poles on the south side of 6A
  for (let x = -120; x <= 120; x += 32) L.poles.push({ x, z: road6A(x) - 5.6 });

  // ---------- trees: big shade trees in the yards, pitch pine and oak woods to the south, cedars at the marsh edge ----------
  for (const h of L.houses) for (let k = 0; k < 2; k++) {
    const a = r() * 6.28, d = Math.max(h.w, h.l) / 2 + 5 + r() * 6, x = h.x + Math.cos(a) * d, z = h.z + Math.sin(a) * d;
    if (free(x, z, 2.5)) L.trees.push({ x, z, s: 1.0 + r() * 0.6, rot: r() * 6.28, kind: r() < 0.6 ? 'oak' : 'maple' });
  }
  for (let i = 0; i < 420; i++) {
    const x = -125 + r() * 250, z = -125 + r() * 95;
    if (z > road6A(x) - 22) continue;
    if (Math.hypot(x - CRASH.x, z - CRASH.z) < 16) continue;            // the clearing it came down in
    if (Math.abs(x - sandRoadX(z)) < 5) continue;
    if (!free(x, z, 1.6)) continue;
    L.trees.push({ x, z, s: 0.8 + r() * 0.5, rot: r() * 6.28, kind: r() < 0.7 ? 'pine' : 'oak' });
  }
  for (let i = 0; i < 70; i++) {
    const x = -125 + r() * 250, z = MARSH_Z - 14 + r() * 14;
    if (Math.hypot(x - LZ.x, z - LZ.z) < 34 || !free(x, z, 2)) continue;
    L.trees.push({ x, z, s: 0.7 + r() * 0.4, rot: r() * 6.28, kind: 'cedar' });
  }

  // ---------- cover: corners of houses, behind walls, at tree trunks and cars ----------
  L.positions = [];
  const pos = (x, z, kind) => { if (x > ARENA.x0 + 4 && x < ARENA.x1 - 4 && z > ARENA.z0 + 4 && z < ARENA.z1 - 4) L.positions.push({ x, z, kind }); };
  for (const h of L.houses) for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const lx = sx * (h.w / 2 + 1.2), lz = sz * (h.l / 2 + 1.2);
    pos(h.x + lx * Math.cos(h.rot) + lz * Math.sin(h.rot), h.z - lx * Math.sin(h.rot) + lz * Math.cos(h.rot), 'house');
  }
  for (const w of L.walls) for (const sd of [-1, 1]) for (const u of [-0.3, 0.3]) pos(w.x + Math.cos(w.rot) * w.len * u - Math.sin(w.rot) * sd * 0.9, w.z - Math.sin(w.rot) * w.len * u - Math.cos(w.rot) * sd * 0.9, 'wall');
  for (const t of L.trees) if (t.kind !== 'cedar' && r() < 0.35) pos(t.x + (r() - 0.5) * 1.6, t.z + (r() - 0.5) * 1.6, 'tree');
  for (const [x, z] of L.cars) for (const sd of [-1, 1]) pos(x + sd * 1.9, z, 'car');

  // ---------- the two helicopters ----------
  //   0: the one you came in on — hit by a missile over the woods, down in the clearing
  //   1: the extraction, into the meadow by the marsh: it takes you on to the beach
  L.helos = [
    { kind: 'crash', x: CRASH.x, z: CRASH.z, y: heightAt(CRASH.x, CRASH.z), tHit: 6.5, tDown: 11, cap: 10 },
    { kind: 'extract', x: LZ.x, z: LZ.z, y: heightAt(LZ.x, LZ.z), tTouch: 166, tLift: 186, cap: 10 },
  ];
  cached = L;
  return L;
}
