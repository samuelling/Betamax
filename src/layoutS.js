// The Night Before: the ship's decks as solid things, what's parked on them, and when.
import { mulberry32 } from './rng.js';
import { ARENA_SHIP, HULL, WELL, STAIR } from './terrainS.js';

export const ST = { come: 2, helo: 10, hover: 19, ropes: 19.6, leave: 28, heloHit: 31.5, escortHit: 57, escortBlast: 60.5, stairs: 88, board: 140 };
let cached = null;
export function buildShipLayout() {
  if (cached) return cached;
  const r = mulberry32(1973);
  const L = { scene: 'ship', ARENA: ARENA_SHIP, T: ST, HULL, WELL, STAIR };
  for (const k of ['houses', 'cars', 'trees', 'walls', 'poles', 'mailboxes', 'hedges', 'positions', 'rocks', 'vehicles', 'gunships', 'smokes', 'minePosts', 'wireRuns', 'mines', 'colliders', 'blocks', 'rawBoxes', 'dynBoxes']) L[k] = [];
  const B = (x, z, hx, hz, y0, y1, kind, walk = false) => ({ x, z, c: 1, s: 0, hx, hz, y0, y1, kind, walk });
  const W = WELL, D = HULL.deck;
  // ---------- the flight deck over the well deck and the stair; the well's walls; the stair itself ----------
  L.rawBoxes.push(B((W.x0 + HULL.x1) / 2, 0, (HULL.x1 - W.x0) / 2, W.hz, W.roof, D, 'fdeck', true));
  L.rawBoxes.push(B((STAIR.x0 + 12 + STAIR.x1) / 2, (STAIR.z0 + STAIR.z1) / 2, (STAIR.x1 - STAIR.x0 - 12) / 2, (STAIR.z1 - STAIR.z0) / 2, W.roof, D, 'fdeck', true));   // open over the top 12 m: headroom
  for (const sd of [-1, 1]) {
    if (sd > 0) L.rawBoxes.push(B((W.x0 + W.x1) / 2, sd * (W.hz + 0.3), (W.x1 - W.x0) / 2, 0.3, W.floor - 1, W.roof, 'bulk'));
    else { const z = -(W.hz + 0.3); L.rawBoxes.push(B((W.x0 + 108.6) / 2, z, (108.6 - W.x0) / 2, 0.3, W.floor - 1, W.roof, 'bulk')); L.rawBoxes.push(B((112.4 + W.x1) / 2, z, (W.x1 - 112.4) / 2, 0.3, W.floor - 1, W.roof, 'bulk')); L.rawBoxes.push(B(110.5, z, 1.9, 0.3, W.floor + 3.2, W.roof, 'bulk')); }   // the doorway to the stair
  }
  L.rawBoxes.push(B(W.x0 - 0.3, 0, 0.3, W.hz + 0.6, W.floor - 1, W.roof, 'bulk'));
  // the stair corridor: walls each side, the steps (each a block you step up onto)
  L.rawBoxes.push(B((STAIR.x0 + 108.6) / 2, STAIR.z1 + 0.1, (108.6 - STAIR.x0) / 2, 0.1, W.floor - 1, D, 'bulk'));
  L.rawBoxes.push(B((STAIR.x0 + STAIR.x1) / 2, STAIR.z0 - 0.1, (STAIR.x1 - STAIR.x0) / 2, 0.1, W.floor - 1, D, 'bulk'));
  L.rawBoxes.push(B(STAIR.x1 + 0.3, (STAIR.z0 + STAIR.z1) / 2, 0.3, (STAIR.z1 - STAIR.z0) / 2 + 0.2, W.floor - 1, D, 'bulk'));
  const run = (STAIR.x1 - 0.4 - STAIR.x0) / STAIR.steps, rise = (D - W.floor) / STAIR.steps;
  L.steps = [];
  for (let k = 0; k < STAIR.steps; k++) { const x = STAIR.x1 - 0.4 - (k + 0.5) * run, y = W.floor + (k + 1) * rise; L.steps.push({ x, y }); L.rawBoxes.push(B(x, (STAIR.z0 + STAIR.z1) / 2, run / 2 + 0.01, (STAIR.z1 - STAIR.z0) / 2, W.floor - 1, y, 'step', true)); }
  L.stairTop = { x: STAIR.x0 - 1.2, z: (STAIR.z0 + STAIR.z1) / 2, y: D }; L.stairBot = { x: 110.5, z: -(W.hz - 1.2), y: W.floor };
  // ---------- the island, aircraft and tractors on deck ----------
  L.island = { x0: 38, x1: 86, z0: 9.5, z1: 16 };
  L.rawBoxes.push(B((L.island.x0 + L.island.x1) / 2, (L.island.z0 + L.island.z1) / 2, (L.island.x1 - L.island.x0) / 2, (L.island.z1 - L.island.z0) / 2, D - 1, D + 30, 'island'));
  L.islandDoors = [{ x: 46, z: L.island.z0 - 0.6 }, { x: 72, z: L.island.z0 - 0.6 }];
  L.craft = [];
  for (let k = 0; k < 5; k++) { const x = -60 + k * 22, z = -9 + (k % 2) * 1.5; L.craft.push({ x, z, rot: Math.PI / 2 + (r() - 0.5) * 0.2, kind: k === 2 ? 'heavy' : 'tilt', burnT: k === 1 ? 47 : -1 }); }
  for (const c of L.craft) { L.blocks.push({ x: c.x, z: c.z, hx: 2.6, hz: 9, rot: c.rot, h: 5.5, kind: 'craft' }); for (const sd of [-1, 1]) L.positions.push({ x: c.x + sd * 9.8, z: c.z + 3.5, kind: 'craft', deck: true }, { x: c.x + sd * 4, z: c.z - 4, kind: 'craft', deck: true }); }
  L.tugs = []; for (let k = 0; k < 6; k++) { const x = -40 + k * 20 + r() * 6, z = 2 + r() * 5; L.tugs.push({ x, z, rot: r() * 6.28 }); L.blocks.push({ x, z, hx: 1.1, hz: 1.8, rot: 0, h: 1.4, kind: 'tug' }); L.positions.push({ x: x + 2.4, z, kind: 'tug', deck: true }); }
  for (const d of L.islandDoors) L.positions.push({ x: d.x + 5, z: d.z - 2, kind: 'island', deck: true }, { x: d.x - 5, z: d.z - 2, kind: 'island', deck: true });
  L.positions.push({ x: L.island.x0 - 2.5, z: 12, kind: 'island', deck: true }, { x: L.island.x1 + 2.5, z: 12, kind: 'island', deck: true }, { x: 30, z: -4, kind: 'deck', deck: true }, { x: 95, z: 4, kind: 'deck', deck: true }, { x: 120, z: -6, kind: 'deck', deck: true }, { x: 145, z: 3, kind: 'deck', deck: true });
  // ---------- the well deck: the hovercraft aft by the gate, four AAVs ahead of it ----------
  L.lcac = { x: 145, z: 0, hx: 6.6, hz: 12.5 };
  L.rawBoxes.push(B(L.lcac.x, L.lcac.z, L.lcac.hz, L.lcac.hx, W.floor - 1, W.floor + 5, 'lcac'));
  L.aavs = []; for (let k = 0; k < 4; k++) { const x = 104 + Math.floor(k / 2) * 12, z = (k % 2 ? 1 : -1) * 3.3; L.aavs.push({ x, z, rot: Math.PI / 2, ramp: { x: x + 4.9, z } , burnT: k === 3 ? 124 : -1 }); L.blocks.push({ x, z, hx: 1.7, hz: 4.1, rot: Math.PI / 2, h: 3.1, kind: 'aav' }); }
  for (const a of L.aavs) L.positions.push({ x: a.x - 5.4, z: a.z, kind: 'aav', well: true }, { x: a.x + 6, z: a.z + (a.z > 0 ? 1.4 : -1.4), kind: 'aav', well: true });
  L.positions.push({ x: 99, z: -6, kind: 'well', well: true }, { x: 99, z: 6, kind: 'well', well: true }, { x: 128, z: -6.4, kind: 'well', well: true }, { x: 128, z: 6.4, kind: 'well', well: true }, { x: 131, z: 0, kind: 'well', well: true });
  L.wellDoor = { x: W.x0 + 1.2, z: 0 };
  // ---------- the helicopter that brings the boarding team, and is hit leaving ----------
  L.helos = [{ kind: 'insert', x: 22, y: D + 13, z: -1, tHover: ST.hover, tLeave: ST.leave, tHit: ST.heloHit, tTouch: 1e9, tLift: 1e9 }];
  // ---------- the escorts: a destroyer off the starboard beam that's hit; a frigate to port ----------
  L.escort = { x: 60, z: 420, rot: -Math.PI / 2, len: 154, hit: ST.escortHit, blast: ST.escortBlast };
  L.frigate = { x: -300, z: -620, rot: -Math.PI / 2 - 0.05, len: 138 };
  cached = L; return L;
}
