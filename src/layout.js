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

  // defender fighting positions along the crest
  L.positions = [];
  for (let i = 0; i < 26 && L.positions.length < 24; i++) {
    const x = -96 + i * 7.6 + (r() - 0.5) * 2.5;
    if (Math.abs(x - 2) < 4) continue;
    const c = crestD(x);
    L.positions.push({ x, z: -(c + 2.0), bagZ: -(c + 0.1) });
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
  const end = L.boardwalk[L.boardwalk.length - 1];
  L.stairs = { x: bx, z: end.z, top: end.y, bottom: heightAt(bx, end.z + 6) };

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

  // ---------- invasion vehicles ----------
  L.vehicles = [];
  const add = (type, x, tArrive, zStop, wave, cap) => L.vehicles.push({
    type, x, tArrive, zStop, wave, cap,
    zStart: type === 'aav' ? 330 : 680, approach: type === 'aav' ? 30 : 22, destroyT: -1, jitter: r(),
  });
  [-72, -38, -8, 33, 68].forEach((x, i) => add('aav', x + (r() - 0.5) * 6, 14 + i * 0.7 + r(), 10 + r() * 7, 1, 8));
  [-54, 50].forEach((x, i) => add('lcac', x + (r() - 0.5) * 6, 60 + i * 2.2, 22 + r() * 4, 2, 12));
  [-90, 16, 88].forEach((x, i) => add('aav', x + (r() - 0.5) * 6, 110 + i * 1.1 + r(), 14 + r() * 6, 3, 8));
  add('lcac', -22, 116.5, 26, 3, 12);
  L.vehicles[1].destroyT = L.vehicles[1].tArrive + 16;
  L.vehicles[3].destroyT = L.vehicles[3].tArrive + 27;
  L.vehicles[6].destroyT = L.vehicles[6].tArrive + 24;
  L.vehicles[8].destroyT = L.vehicles[8].tArrive + 12;

  // ---------- defender helicopters ----------
  L.helos = [
    { x: -24, z: -98, tTouch: 24 },
    { x: 3, z: -112, tTouch: 27.5 },
    { x: 28, z: -94, tTouch: 31 },
  ];
  L.helos.forEach((h) => { h.y = LOT.y; h.tLift = h.tTouch + 10.5; });

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
export function vehSpeed(v, t) { return (vehZ(v, t - 0.05) - vehZ(v, t + 0.05)) / 0.1; }

// helicopter pose
export function heloPose(h, t, out) {
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
