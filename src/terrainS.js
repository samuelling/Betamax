// The Night Before: the assault ship "7" at sea, the night before the landing. The ship's frame: bow toward -x,
// the stern gate at +x, flight deck 21 m up. Below it, aft, the well deck where the AAVs and the hovercraft wait.
export const ARENA_SHIP = { x0: -92, x1: 172, z0: -22, z1: 22 };
export const HULL = { x0: -85, x1: 165, hz: 16, deck: 21 };
export const WELL = { x0: 95, x1: 161, hz: 7.4, floor: 2.5, roof: 19.4 };
export const STAIR = { x0: 76, x1: 112, z0: -10.8, z1: -8.2, steps: 46 };   // port side, clear of the island
export function heightShip(x, z) {
  if (x > HULL.x1) return x < HULL.x1 + 8 && Math.abs(z) < WELL.hz ? WELL.floor - (x - HULL.x1) * 0.6 : -14;   // the stern gate, down into the sea
  if (x < HULL.x0) return -14;
  const bow = x < HULL.x0 + 45 ? (HULL.x0 + 45 - x) / 45 : 0; if (Math.abs(z) > HULL.hz * (1 - bow * 0.75) - 0.5) return -14;
  if (x > WELL.x0 && Math.abs(z) < WELL.hz) return WELL.floor;
  if (x > STAIR.x0 && x < STAIR.x1 && z > STAIR.z0 && z < STAIR.z1) return WELL.floor;
  if (x > 108.6 && x < 112.4 && z > STAIR.z1 - 0.1 && z < -WELL.hz + 0.1) return WELL.floor;   // the doorway between them
  return HULL.deck;
}
