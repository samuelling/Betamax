// Shared, deterministic placement of everything at Mayflower Beach.
import { mulberry32, smoothstep } from './rng.js';
import { crestD, heightAt, ARENA, LOT } from './terrain.js';

let cached = null;

export function buildLayout() {
  if (cached) return cached;
  const r = mulberry32(1620);
  const L = { ARENA, LOT };

  // rocks scattered across the flats
  L.rocks = [];
  for (let i = 0; i < 220; i++) {
    const x = (r() - 0.5) * 300, z = 25 + r() * 130;
    const s = 0.25 + Math.pow(r(), 3) * 1.2;
    L.rocks.push({ x, z, s, rot: r() * 6.28, sq: 0.5 + r() * 0.4 });
  }

  // defender fighting positions: a dense crest line plus a second line on the back of the dunes
  L.positions = [];
  for (let i = 0; i < 40 && L.positions.length < 34; i++) {
    const x = -104 + i * 5.6 + (r() - 0.5) * 2;
    if (Math.abs(x - 2) < 3.5) continue;
    const c = crestD(x);
    L.positions.push({ x, z: -(c + 2.0), bagZ: -(c + 0.1), line: 0 });
  }
  for (let i = 0; i < 16; i++) {
    const x = -96 + i * 12.5 + (r() - 0.5) * 4;
    const c = crestD(x);
    L.positions.push({ x, z: -(c + 13 + r() * 5), bagZ: null, line: 1 });
  }
  // boardwalk: from the lot over the dune to the beach, along x = 2
  L.boardwalk = [];
  const bx = 2;
  for (let z = LOT.z1 + 2; z <= -(crestD(bx) - 12); z += 2) L.boardwalk.push({ x: bx, z });
  const raw = L.boardwalk.map((p) => heightAt(p.x, p.z));
  L.boardwalk.forEach((p, i) => {
    let m = -1e9; for (let k = -3; k <= 3; k++) { const j = Math.min(raw.length - 1, Math.max(0, i + k)); m = Math.max(m, raw[j]); }
    p.y = m + 0.35;
  });
  // the lot end comes down to the asphalt as a gentle ramp (it used to hang 1.4 m in the air)
  for (let pass = 0; pass < 2; pass++) L.boardwalk.forEach((p, i) => { p.y = Math.min(p.y, raw[i] + 0.12 + i * 0.32); });
  const end = L.boardwalk[L.boardwalk.length - 1];
  L.stairs = { x: bx, z: end.z, top: end.y, bottom: heightAt(bx, end.z + 6) };
  L.stairs.steps = Math.max(4, Math.round((L.stairs.top - L.stairs.bottom) / 0.19));
  L.stairs.bottom = heightAt(bx, end.z + 0.85 + L.stairs.steps * 0.3);
  // gaps in the railings (both sides) every ~10 m, with side steps down to the sand
  L.boardwalkGaps = new Set();
  for (let i = 2; i < L.boardwalk.length - 2; i += 5) { L.boardwalkGaps.add(i * 2); L.boardwalkGaps.add(i * 2 + 1); }
  L.cars = [[-36, -76, 0.1], [-30, -77, -0.05], [-12, -94, 1.5], [14, -112, 0.05], [34, -110, -0.1], [-40, -118, 0.3], [40, -80, 1.2]];

  L.snackShack = { x: 18, z: LOT.z1 + 3, w: 15, l: 8, rot: 0 };
  L.lifeguard = { x: -6, z: -4 };

  // big shingled houses along the dune, east (-x) and west (+x)
  L.houses = [];
  [-62, -84, -107, 60, 83, 106].forEach((x) => {
    const c = crestD(x);
    L.houses.push({ x: x + (r() - 0.5) * 4, z: -(c + 12 + r() * 6), rot: (r() - 0.5) * 0.12, w: 13 + r() * 4, l: 9 + r() * 3, floors: 2, deck: true });
  });
  for (let i = 0; i < 30; i++) {
    const x = (r() - 0.5) * 480, z = -(150 + r() * 160);
    if (Math.abs(x) < 60 && z > -175) continue;
    L.houses.push({ x, z, rot: (r() - 0.5) * 0.6 + (r() < 0.3 ? Math.PI / 2 : 0), w: 8 + r() * 3, l: 6 + r() * 2, floors: 1, deck: false });
  }
  L.trees = [];
  for (let i = 0; i < 360; i++) {
    const x = (r() - 0.5) * 560;
    const z = -(78 + r() * 270);
    if (Math.abs(x) < 62 && z > -140) continue;
    if (z > -(crestD(x) + 22)) continue;
    if (L.houses.some((h) => Math.hypot(h.x - x, h.z - z) < Math.max(h.w, h.l) * 0.85)) continue;
    L.trees.push({ x, z, s: 0.7 + r() * 0.8, rot: r() * 6.28 });
  }

  // ---------- invasion vehicles: six waves ----------
  L.vehicles = [];
  const add = (type, x, tArrive, zStop, wave) => L.vehicles.push({
    type, x, tArrive, zStop, wave, cap: type === 'aav' ? 10 : 14,
    zStart: type === 'aav' ? 330 : 680, approach: type === 'aav' ? 30 : 22, destroyT: -1, jitter: r(),
  });
  const waves = [
    { t: 14, aav: [-82, -50, -18, 14, 46, 78] },
    { t: 40, lcac: [-62, -2, 58] },
    { t: 64, aav: [-98, -66, -34, -4, 28, 60, 94] },
    { t: 90, lcac: [-84, -28, 30, 86] },
    { t: 116, aav: [-90, -58, -24, 10, 42, 74] },
    { t: 140, lcac: [-52, 8, 66] },
  ];
  waves.forEach((w, wi) => {
    (w.aav || []).forEach((x, i) => add('aav', x + (r() - 0.5) * 7, w.t + i * 0.6 + r(), 6 + r() * 14, wi + 1));
    (w.lcac || []).forEach((x, i) => add('lcac', x + (r() - 0.5) * 8, w.t + i * 1.4 + r(), 20 + r() * 8, wi + 1));
  });
  // defender anti-armour (Javelin) kills: about half the AAVs and a third of the hovercraft
  L.vehicles.forEach((v) => {
    const p = v.type === 'aav' ? 0.5 : 0.33;
    if (r() < p) v.destroyT = v.tArrive + (v.type === 'aav' ? 8 : 14) + r() * 30;
  });
  // smoke screens laid at each landing
  L.smokes = [];
  waves.forEach((w) => { for (let k = 0; k < 5; k++) L.smokes.push({ t: w.t + 1 + r() * 4, x: -110 + r() * 220, z: 4 + r() * 22, r: 1 }); });

  // ---------- defender helicopters: insertion + reinforcement ----------
  L.helos = [
    { x: -26, z: -98, tTouch: 24 }, { x: 2, z: -112, tTouch: 27.5 }, { x: 28, z: -94, tTouch: 31 },
    { x: -34, z: -116, tTouch: 76 }, { x: 0, z: -96, tTouch: 79 }, { x: 34, z: -116, tTouch: 82 },
  ];
  L.helos.forEach((h) => { h.y = LOT.y; h.tLift = h.tTouch + 11; h.cap = 10; });

  // ---------- invader gunships over the bay ----------
  L.gunships = [
    { tIn: 30, cx: -30, cz: 150, ax: 85, az: 30, alt: 46, w: 0.11, ph: 0, downT: 128 },
    { tIn: 58, cx: 40, cz: 175, ax: 75, az: 25, alt: 54, w: 0.09, ph: 2.1, downT: -1 },
  ];
  // houses (big ones on the dunes) that can burn
  // ---------- minefield border ----------
  const lanes = L.vehicles.map((v) => v.x);
  const inLane = (x) => lanes.some((lx) => Math.abs(lx - x) < 7);
  L.minePosts = [];
  const post = (x, z, ang) => L.minePosts.push({ x, z, ang });
  for (let x = ARENA.x0; x <= ARENA.x1; x += 11) { post(x, ARENA.z0, 0); if (!inLane(x)) post(x, ARENA.z1, Math.PI); }
  for (let z = ARENA.z0 + 11; z < ARENA.z1; z += 11) { post(ARENA.x0, z, -Math.PI / 2); post(ARENA.x1, z, Math.PI / 2); }
  L.wireRuns = [];
  for (let x = ARENA.x0; x < ARENA.x1; x += 6) {
    L.wireRuns.push({ x: x + 3, z: ARENA.z0 - 1.5, rot: 0 });
    if (!inLane(x + 3)) L.wireRuns.push({ x: x + 3, z: ARENA.z1 + 1.5, rot: 0 });
  }
  for (let z = ARENA.z0; z < ARENA.z1; z += 6) { L.wireRuns.push({ x: ARENA.x0 - 1.5, z: z + 3, rot: Math.PI / 2 }); L.wireRuns.push({ x: ARENA.x1 + 1.5, z: z + 3, rot: Math.PI / 2 }); }
  L.mines = [];
  for (let i = 0; i < 300; i++) {
    const side = Math.floor(r() * 4);
    const off = 3 + r() * 14;
    let x, z;
    if (side === 0) { x = ARENA.x0 + r() * (ARENA.x1 - ARENA.x0); z = ARENA.z0 - off; }
    else if (side === 1) { x = ARENA.x0 + r() * (ARENA.x1 - ARENA.x0); z = ARENA.z1 + off; if (inLane(x)) continue; }
    else if (side === 2) { x = ARENA.x0 - off; z = ARENA.z0 + r() * (ARENA.z1 - ARENA.z0); }
    else { x = ARENA.x1 + off; z = ARENA.z0 + r() * (ARENA.z1 - ARENA.z0); }
    L.mines.push({ x, z, rot: r() * 6.28 });
  }

  // colliders for the player (circles)
  L.colliders = [];
  L.houses.forEach((h) => {
    if (h.floors !== 2) return;
    for (let k = 0; k < 3; k++) {
      const t = (k / 2 - 0.5) * h.w * 0.6;
      L.colliders.push({ x: h.x + Math.cos(h.rot) * t, z: h.z - Math.sin(h.rot) * t, r: h.l * 0.55 });
    }
  });
  L.colliders.push({ x: L.snackShack.x - 4, z: L.snackShack.z, r: 4.2 }, { x: L.snackShack.x + 4, z: L.snackShack.z, r: 4.2 });
  L.rocks.forEach((k) => { if (k.s > 0.8) L.colliders.push({ x: k.x, z: k.z, r: k.s * 0.9 }); });
  cached = L;
  return L;
}

// gunship pose: arrives from the bay, flies a racetrack facing the beach; one is shot down
export function gunshipPose(g, t, out) {
  const tt = Math.max(t, g.tIn);
  const a = (tt - g.tIn) * g.w + g.ph;
  out.x = g.cx + Math.sin(a) * g.ax; out.z = g.cz + Math.cos(a * 2) * g.az; out.y = g.alt + Math.sin(a * 1.7) * 4;
  out.yaw = Math.PI + Math.cos(a) * 0.35; out.pitch = 0.08; out.roll = -Math.cos(a) * 0.25; out.alive = true; out.burn = 0;
  if (t < g.tIn) { const k = g.tIn - t; out.z += k * 45; out.y += k * 0.5; out.pitch = 0.15; }
  if (g.downT > 0 && t > g.downT) {
    const d = t - g.downT, fall = Math.min(d, 6.5);
    const p0 = gunshipPose({ ...g, downT: -1 }, g.downT, {});
    out.x = p0.x + fall * 9; out.z = p0.z + fall * 6; out.y = Math.max(-1.5, p0.y - 0.5 * 4.5 * fall * fall);
    out.yaw = p0.yaw + fall * fall * 0.9; out.roll = Math.min(1.2, fall * 0.4); out.pitch = 0.3 * Math.min(1, fall);
    out.burn = 1; out.alive = d < 6.5;
  }
  return out;
}

export function vehZ(v, t) {
  const t0 = v.tArrive - v.approach;
  if (t <= t0) return v.zStart;
  if (t >= v.tArrive) return v.zStop;
  const u = (t - t0) / v.approach;
  const e = 1 - Math.pow(1 - u, 2.2);
  return v.zStart + (v.zStop - v.zStart) * e;
}
export function vehRamp(v, t) {
  const u = (t - (v.tArrive + 0.6)) / 1.4;
  return u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
}
// hovercraft: hull base height (rides higher while under way) and the walkable deck/bow-ramp height at world z
export function lcacBase(v, t) { return Math.max(heightAt(v.x, vehZ(v, t)), 0) + (t < v.tArrive ? 0.3 : 0.12); }
export function lcacDeckY(v, t, pz) {
  const z = vehZ(v, t), top = lcacBase(v, t) + 2.06, lz = pz - z;
  if (lz > -10.6) return top;
  const g = Math.max(heightAt(v.x, pz), 0), k = Math.max(0, Math.min(1, (lz + 14.2) / 3.6)) * vehRamp(v, t);
  return g + (top - g) * k;
}
export function vehSpeed(v, t) { return (vehZ(v, t - 0.05) - vehZ(v, t + 0.05)) / 0.1; }

// helicopter pose
export function heloPose(h, t, out) {
  if (h.kind === 'crash') return crashPose(h, t, out);
  if (h.kind === 'extract') return extractPose(h, t, out);
  if (h.kind === 'insert') return insertPose(h, t, out);
  const u = h.tTouch - t;
  out.x = h.x; out.z = h.z; out.y = h.y; out.yaw = 0; out.pitch = 0;
  if (u > 0) {
    const flare = Math.min(u, 4);
    const far = Math.max(0, u - 4);
    out.y = h.y + flare * 1.2 + Math.min(far * 5.5, 70);
    out.z = h.z - far * 48 - flare * flare * 2.2;
    out.x = h.x + Math.sin(far * 0.05) * far * 2;
    out.pitch = u < 4 ? -0.25 * smoothstep(0, 3, flare) : 0.12;
  } else if (t > h.tLift) {
    const w = t - h.tLift;
    out.yaw = Math.PI * smoothstep(0.5, 4, w);
    out.y = h.y + w * w * 0.9 + w * 2;
    const fw = Math.max(0, w - 3);
    out.z = h.z - fw * fw * 2.6 - fw * 6;
    out.pitch = 0.18 * smoothstep(3, 5, w);
  }
  return out;
}

// East Sandwich (-x is east, as at the beach), helicopter 0: low over the pines from the west, hit, a flat spin into the clearing, on its side
function crashPose(h, t, out) {
  const hitX = h.x + 34, hitZ = h.z + 6, alt = 34;
  out.roll = 0; out.dead = false; out.spin = 0;
  if (t <= h.tHit) {   // straight and level, east
    const d = (h.tHit - t) * 46;
    out.x = hitX + d; out.z = hitZ + Math.sin(d * 0.01) * 6; out.y = h.y + alt + Math.min(20, d * 0.04); out.yaw = -Math.PI / 2; out.pitch = 0.1;
    return out;
  }
  const k = Math.min(1, (t - h.tHit) / (h.tDown - h.tHit)), e = k * k;
  out.x = hitX + (h.x - hitX) * (1 - (1 - k) * (1 - k)); out.z = hitZ + (h.z - hitZ) * k;
  out.y = h.y + 0.9 + (alt - 0.9) * (1 - e);
  out.yaw = -Math.PI / 2 + k * k * 9.5; out.pitch = 0.1 + Math.sin(k * 7) * 0.15; out.roll = Math.sin(k * 5) * 0.25;
  out.spin = 1 - k;
  if (t >= h.tDown) {   // down: tipped onto its left side, tail broken round
    const s = Math.min(1, (t - h.tDown) / 0.8);
    out.x = h.x; out.z = h.z; out.y = h.y + 0.9 + (1 - s) * 0.4; out.yaw = -Math.PI / 2 + 9.5 + s * 0.4; out.pitch = 0.1 + s * 0.05; out.roll = -1.25 * s * s; out.dead = true; out.spin = 0;
  }
  return out;
}
// East Sandwich, helicopter 1: in over the marsh from the north-east, down in the meadow, off east (-x) toward Dennis
function extractPose(h, t, out) {
  // arrives from direction (ax, az), leaves toward (dx, dz); defaults are East Sandwich's (from the north-east, off east)
  const ax = h.ax ?? -0.62, az = h.az ?? 0.78, dx = h.dx ?? -1, dz = h.dz ?? 0.07, yIn = Math.atan2(-ax, -az), yOut = Math.atan2(dx, dz);
  const u = h.tTouch - t;
  out.x = h.x; out.z = h.z; out.y = h.y; out.yaw = yIn; out.pitch = 0; out.roll = 0; out.dead = false; out.spin = 1;
  if (u > 0) {
    const flare = Math.min(u, 4), far = Math.max(0, u - 4), d = far * 46 + flare * flare * 2.2;
    out.x = h.x + d * ax; out.z = h.z + d * az; out.y = h.y + flare * 1.2 + Math.min(far * 4.5, 55);
    out.pitch = u < 4 ? -0.25 * smoothstep(0, 3, flare) : 0.12;
  } else if (t > h.tLift) {
    const w = t - h.tLift, turn = smoothstep(0.5, 4, w);
    let dy = yOut - yIn; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
    out.yaw = yIn + turn * dy;
    out.y = h.y + w * w * 0.9 + w * 2;
    const fw = Math.max(0, w - 3), d = fw * fw * 2.6 + fw * 6;
    out.x = h.x + d * dx; out.z = h.z + d * dz;
    out.pitch = 0.18 * smoothstep(3, 5, w);
  }
  return out;
}

// The Night Before: in low over the stern, a hover while the ropes go, away over the bow — and, if it's hit, rolling
// off into the sea
function insertPose(h, t, out) {
  out.roll = 0; out.dead = false; out.spin = 1; out.pitch = 0; out.yaw = -Math.PI / 2;
  const u = h.tHover - t;
  if (u > 0) { const far = Math.max(0, u - 4), flare = Math.min(u, 4), d = far * 52 + flare * flare * 2.4;
    out.x = h.x + d; out.z = h.z + far * 3; out.y = h.y + flare * 0.9 + Math.min(far * 0.8, 12); out.pitch = u < 4 ? -0.22 * smoothstep(0, 3, flare) : 0.1; return out; }
  if (t < h.tLeave) { out.x = h.x + Math.sin(t * 0.8) * 0.5; out.y = h.y + Math.sin(t * 1.1) * 0.35; out.z = h.z + Math.sin(t * 0.6) * 0.4; out.roll = Math.sin(t * 0.9) * 0.02; return out; }
  const k = t - h.tLeave; out.x = h.x - 3 * k * k - 4 * k; out.y = h.y + 1.6 * k; out.z = h.z - 0.6 * k * k; out.pitch = Math.min(0.2, 0.08 * k);
  if (h.tHit && t > h.tHit) {
    const kk = t - h.tHit, k0 = h.tHit - h.tLeave, x0 = h.x - 3 * k0 * k0 - 4 * k0, y0 = h.y + 1.6 * k0, z0 = h.z - 0.6 * k0 * k0, v = 6 * k0 + 4;
    out.x = x0 - v * kk * 0.8; out.z = z0 - kk * 6 - kk * kk * 1.5; out.y = Math.max(-1.5 - Math.max(0, kk - 4) * 1.2, y0 - 4.9 * kk * kk * 0.6);
    out.roll = -Math.min(1.6, kk * 0.6); out.pitch = 0.3; out.yaw = -Math.PI / 2 - kk * 0.9; out.spin = Math.max(0, 1 - kk * 0.15);
    out.dead = out.y < 0.5; if (out.y < -6) out.y = -40;
  }
  return out;
}
