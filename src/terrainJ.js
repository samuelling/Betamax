// The Jump: the cargo hold of a C-130 at 1,100 ft over the Gulf, at night. The world is drawn in the aircraft's
// frame: the floor is still, the ground and the sea and the flak go past. Nose toward -z, the ramp at +z; the two
// paratroop doors are at the back of the hold, port (-x) and starboard (+x).
export const ARENA_JUMP = { x0: -400, x1: 400, z0: -400, z1: 400 };
export const CABIN = { hx: 1.55, z0: -7.6, z1: 7.6, h: 2.7, doorZ0: 4.95, doorZ1: 5.85, doorH: 1.85 };
export const DROP = -335;        // the ground, a thousand feet and change below the floor
export const V = 67;             // 130 knots: drop speed
export function heightJump(x, z) {
  if (Math.abs(x) <= CABIN.hx + 0.05 && z >= CABIN.z0 && z <= CABIN.z1 + 1.6) return z > CABIN.z1 ? (z - CABIN.z1) * 0.12 : 0;   // the floor, and the foot of the ramp
  return DROP;
}
