// The Port: the Texan staging port on the ship channel at Corpus Christi, at night. The wharf is a flat concrete
// apron 3 m above the water; the channel is to the north (+z); across it, the refinery. -x is east, toward the bay
// and the Harbor Bridge.
export const ARENA_PORT = { x0: -252, x1: 252, z0: -192, z1: 84 };
export const QUAY_Z = 88, DECK = 3.0, FAR_SHORE = 380;
export function heightPort(x, z) {
  if (z < QUAY_Z) return DECK;
  if (z > FAR_SHORE) return DECK + Math.min(4, (z - FAR_SHORE) * 0.05);
  return -9;
}
