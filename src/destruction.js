// Destruction, precomputed from the battle like everything else so it rewinds exactly:
//  - craters: every ground burst digs a bowl with a raised lip at its moment; before that moment (i.e. later in
//    rewind) the sand is whole again
//  - houses: built from wall panels, floor slabs, roof panels, chimney and deck pieces. A hit blows out the pieces
//    near it and anything left unsupported comes down after; every piece flies on a ballistic path and settles.
//    In rewind the rubble lifts, flies back and the house stands up again.
import { heightAt } from './terrain.js';
import { mulberry32 } from './rng.js';

// ---------------- craters ----------------
const CR = { shell: 2.6, mortar: 1.9, drone: 1.0, mlrs: 2.4, rocket: 2.0, crash: 3.6 };
export function crater(d) { // height in units of R at normalised distance d
  if (d > 1.6) return 0;
  const bowl = d < 1 ? -0.34 * (1 - d * d) * (1 - d * d * 0.25) : 0;
  const lip = 0.09 * Math.exp(-(((d - 1.02) / 0.22) ** 2));
  return bowl + lip;
}
export const FORM = 0.18; // seconds for the bowl to open

export class CraterField {
  constructor() { this.list = []; this.cell = 6; this.grid = new Map(); }
  addExplosion(e) {
    if (e.air || e.house || !CR[e.kind]) return;
    const g = heightAt(e.ix, e.iz);
    if (e.iy - Math.max(g, 0) > 0.7) return;
    if (g < 0.05 && e.iz > 5) return; // into the water
    const R = Math.min(4.2, CR[e.kind] * Math.max(0.7, e.big || 1));
    const c = { x: e.ix, z: e.iz, R, t: e.t, i: this.list.length };
    this.list.push(c);
    const s = this.cell, r = R * 1.6;
    for (let cx = Math.floor((c.x - r) / s); cx <= Math.floor((c.x + r) / s); cx++) for (let cz = Math.floor((c.z - r) / s); cz <= Math.floor((c.z + r) / s); cz++) {
      const k = cx * 10007 + cz; if (!this.grid.has(k)) this.grid.set(k, []); this.grid.get(k).push(c);
    }
  }
  // ground offset at (x,z) at tape time t
  delta(x, z, t) {
    const l = this.grid.get(Math.floor(x / this.cell) * 10007 + Math.floor(z / this.cell));
    if (!l) return 0;
    let h = 0;
    for (const c of l) {
      const age = t - c.t; if (age <= 0) continue;
      const d = Math.hypot(x - c.x, z - c.z) / c.R; if (d > 1.6) continue;
      h += crater(d) * c.R * Math.min(1, age / FORM);
    }
    return Math.max(h, -1.4);
  }
}

// ---------------- houses ----------------
export const HOUSE_MATS = ['siding', 'roof', 'trim', 'glass', 'brick', 'deck', 'floor'];
// pieces in house-local coordinates (x across width, z across length, y up from the foundation y0)
export function housePieces(h) {
  const P = [];
  const H = h.floors === 2 ? 6.2 : 3.2, fh = H / h.floors, T = 0.28;
  const nW = Math.max(2, Math.round(h.w / 2.6)), nL = Math.max(2, Math.round(h.l / 2.6));
  for (let f = 0; f < h.floors; f++) {
    // long walls (front/back, z = ±l/2) carry the windows
    for (const sd of [-1, 1]) for (let k = 0; k < nW; k++) {
      const cw = h.w / nW, cx = -h.w / 2 + (k + 0.5) * cw;
      P.push({ kind: 'wall', side: sd, axis: 'x', row: f, col: k, x: cx, y: f * fh + fh / 2, z: sd * (h.l / 2 - T / 2), sx: cw, sy: fh, sz: T, win: true });
    }
    for (const sd of [-1, 1]) for (let k = 0; k < nL; k++) {
      const cl = (h.l - 2 * T) / nL, cz = -h.l / 2 + T + (k + 0.5) * cl;
      P.push({ kind: 'wall', side: sd * 2, axis: 'z', row: f, col: k, x: sd * (h.w / 2 - T / 2), y: f * fh + fh / 2, z: cz, sx: T, sy: fh, sz: cl });
    }
    // slab at the top of this floor (ceiling / next floor)
    for (const a of [-1, 1]) for (const b of [-1, 1]) P.push({ kind: 'slab', row: f, x: a * h.w / 4, y: (f + 1) * fh - 0.1, z: b * h.l / 4, sx: h.w / 2 - 0.05, sy: 0.2, sz: h.l / 2 - 0.05 });
  }
  // roof: ridge along x, slopes facing ±z, split into panels along x; gable triangles at the ends
  const RH = h.floors === 2 ? 3.4 : 2.8, half = (h.l + 0.8) / 2, slope = Math.atan2(RH, half), slen = Math.hypot(RH, half);
  const nR = Math.max(2, Math.round(h.w / 3.2));
  for (const sd of [-1, 1]) for (let k = 0; k < nR; k++) {
    const cw = (h.w + 0.6) / nR;
    P.push({ kind: 'roof', side: sd, col: k, x: -(h.w + 0.6) / 2 + (k + 0.5) * cw, y: H + RH / 2, z: sd * half / 2, sx: cw, sy: 0.18, sz: slen });
  }
  for (const sd of [-1, 1]) P.push({ kind: 'gable', side: sd, x: sd * (h.w / 2 - 0.1), y: H + RH / 3, z: 0, sx: 0.2, sy: RH, sz: h.l });
  P.push({ kind: 'chimney', x: h.w * 0.25, y: H + 2.2, z: 0, sx: 0.9, sy: 2.2, sz: 0.9 });
  if (h.deck) {
    for (const a of [-1, 1]) P.push({ kind: 'deck', x: a * h.w * 0.2, y: 3.0, z: h.l / 2 + 1.5, sx: h.w * 0.4, sy: 0.15, sz: 3 });
    for (let k = -2; k <= 2; k++) P.push({ kind: 'post', x: k * h.w * 0.19, y: 1.5, z: h.l / 2 + 2.9, sx: 0.12, sy: 3.0, sz: 0.12 });
  }
  return P;
}
const toWorld = (h, y0, p) => {
  const c = Math.cos(h.rot), s = Math.sin(h.rot);
  return { x: h.x + p.x * c + p.z * s, y: y0 + p.y, z: h.z - p.x * s + p.z * c };
};
const BLAST = { shell: 3.4, mlrs: 3.0, rocket: 2.8, mortar: 2.3, drone: 1.7, crash: 6, vehicle: 0 };
const G = 9.8;

export function computeDestruction(L, explosions) {
  const craters = new CraterField();
  for (const e of explosions) craters.addExplosion(e);
  const houses = L.houses.map((h, hi) => {
    const y0 = heightAt(h.x, h.z) - 0.3;
    const pieces = housePieces(h).map((p, pi) => ({ ...p, hi, pi, c: toWorld(h, y0, p), t: Infinity }));
    return { h, hi, y0, pieces, openT: Infinity, hit: false };
  });
  const r = mulberry32(4242);
  const launch = (p, t, ix, iy, iz, power) => {
    if (p.t <= t) return;
    let dx = p.c.x - ix, dy = p.c.y - iy, dz = p.c.z - iz; const d = Math.hypot(dx, dy, dz) || 1; dx /= d; dy /= d; dz /= d;
    p.t = t;
    p.v = [dx * power + (r() - 0.5) * 2, Math.max(1.5, dy * power) + 1.5 + r() * 3, dz * power + (r() - 0.5) * 2];
    p.w = [(r() - 0.5) * 7, (r() - 0.5) * 7, (r() - 0.5) * 7];
  };
  const drop = (p, t) => {
    if (p.t <= t) return;
    p.t = t;
    p.v = [(r() - 0.5) * 1.6, -0.5 - r(), (r() - 0.5) * 1.6];
    p.w = [(r() - 0.5) * 2.4, (r() - 0.5) * 1.2, (r() - 0.5) * 2.4];
  };
  for (const e of explosions) {
    const R = (BLAST[e.kind] || 0) * (e.house ? 1.4 : 1) * Math.min(1.6, e.big || 1);
    if (!R || e.air) continue;
    for (const H of houses) {
      if (Math.hypot(H.h.x - e.ix, H.h.z - e.iz) > Math.max(H.h.w, H.h.l) / 2 + R + 1) continue;
      let any = false;
      for (const p of H.pieces) {
        if (p.t <= e.t) continue;
        const d = Math.hypot(p.c.x - e.ix, (p.c.y - e.iy) * 0.8, p.c.z - e.iz);
        if (d < R) { launch(p, e.t, e.ix, e.iy, e.iz, 4 + 13 * (1 - d / R)); any = true; }
      }
      if (!any) continue;
      H.hit = true;
      // what's left unsupported comes down after the blast
      for (let pass = 0; pass < 4; pass++) {
        const walls = H.pieces.filter((p) => p.kind === 'wall'), gone = walls.filter((p) => p.t <= e.t + 2).length / walls.length;
        for (const p of H.pieces) {
          if (p.t <= e.t + 2) continue;
          let fall = false;
          if (p.kind === 'wall' && p.row > 0) fall = walls.some((q) => q.side === p.side && q.col === p.col && q.row === p.row - 1 && q.t <= e.t + 2);
          else if (p.kind === 'slab') fall = gone > 0.45 || walls.filter((q) => q.row === p.row && q.t <= e.t + 2 && Math.hypot(q.x - p.x, q.z - p.z) < Math.max(H.h.w, H.h.l) * 0.45).length >= 3;
          else if (p.kind === 'roof') fall = gone > 0.3 || walls.some((q) => q.row === H.h.floors - 1 && q.axis === 'x' && q.side === p.side && Math.abs(q.x - p.x) < 1.8 && q.t <= e.t + 2);
          else if (p.kind === 'gable') fall = walls.filter((q) => q.axis === 'z' && Math.sign(q.side) === p.side && q.t <= e.t + 2).length >= 2;
          else if (p.kind === 'chimney') fall = H.pieces.some((q) => q.kind === 'roof' && q.t <= e.t + 2);
          else if (p.kind === 'deck') fall = H.pieces.filter((q) => q.kind === 'post' && q.t <= e.t + 2).length >= 2;
          if (fall) drop(p, e.t + 0.25 + pass * 0.25 + r() * 0.35);
        }
      }
      const walls = H.pieces.filter((p) => p.kind === 'wall');
      const ts = walls.map((p) => p.t).sort((a, b) => a - b), k = Math.ceil(walls.length * 0.35) - 1;
      H.openT = Math.min(H.openT, ts[k]);
    }
  }
  // ballistic flight to the ground, then the piece settles where it lands
  for (const H of houses) for (const p of H.pieces) {
    if (p.t === Infinity) continue;
    const half = Math.min(p.sx, p.sy, p.sz) / 2 + 0.05;
    let T = 0.05;
    for (let it = 0; it < 4; it++) {
      const x = p.c.x + p.v[0] * T, z = p.c.z + p.v[2] * T, g = Math.max(heightAt(x, z), -0.5) + half;
      // solve c.y + vy T - G/2 T² = g
      const a = -G / 2, b = p.v[1], cc = p.c.y - g, disc = b * b - 4 * a * cc;
      T = disc > 0 ? Math.max(0.05, (-b - Math.sqrt(disc)) / (2 * a)) : 0.4;
    }
    p.land = T;
    p.rest = [p.c.x + p.v[0] * T, p.c.y + p.v[1] * T - G / 2 * T * T, p.c.z + p.v[2] * T];
  }
  return { craters, houses };
}

// world position + rotation (axis-angle components, radians) of a flying piece at time since launch a
export function pieceState(p, a, out) {
  const T = p.land, t = Math.min(a, T);
  out.x = p.c.x + p.v[0] * t; out.y = p.c.y + p.v[1] * t - G / 2 * t * t; out.z = p.c.z + p.v[2] * t;
  const s = t + Math.min(0.35, Math.max(0, a - T)) * 0.3; // a little tumble while settling
  out.rx = p.w[0] * s; out.ry = p.w[1] * s; out.rz = p.w[2] * s;
  return out;
}
