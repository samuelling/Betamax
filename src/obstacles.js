// Physical world for people and bullets: oriented boxes + circles with heights, walkable surfaces
// (boardwalk deck, beach stairs, side steps, sandbag tops), and moving/wrecked vehicles at any tape time.
// Pure JS so the simulation (node or browser) and the renderer share exactly the same geometry.
import { heightFast as heightAt } from './terrain.js';
import { SC } from './scenes.js';
import { vehZ, heloPose, lcacDeckY } from './layout.js';
import { carPose } from './layoutB.js';
const CAR_DIM = { sedan: [0.92, 2.35, 1.45], wagon: [0.92, 2.4, 1.46], hatch: [0.9, 2.08, 1.48], suv: [0.97, 2.38, 1.78], pickup: [0.98, 2.7, 1.85] };
const _cp = {};

const BW_X = 2, BW_HALF = 1.2;

export class Obstacles {
  constructor(L) {
    this.L = L;
    this.boxes = []; // {x,z,c,s,hx,hz,y0,y1,kind,solid,walk}
    this.circles = []; // {x,z,r,y0,y1}
    const gy = (x, z) => heightAt(x, z);
    const ob = (x, z, hx, hz, rot, h, kind, walk = false, hi) => {
      const y0 = gy(x, z) - 0.5; this.boxes.push({ x, z, c: Math.cos(rot), s: Math.sin(rot), hx, hz, y0, y1: gy(x, z) + h, kind, walk, hi });
    };
    L.houses.forEach((h, hi) => {
      ob(h.x, h.z, h.w / 2, h.l / 2, h.rot, h.floors === 2 ? 9.5 : 6, 'house', false, hi);
      if (h.deck) for (let k = -2; k <= 2; k++) {
        const lx = k * h.w * 0.19, lz = h.l / 2 + 2.9;
        this.circles.push({ x: h.x + lx * Math.cos(h.rot) + lz * Math.sin(h.rot), z: h.z - lx * Math.sin(h.rot) + lz * Math.cos(h.rot), r: 0.12, y1: gy(h.x, h.z) + 3, hi });
      }
    });
    const S = L.snackShack; if (S) ob(S.x, S.z, S.w / 2, S.l / 2, S.rot, 5, 'shack');
    const lg = L.lifeguard; if (lg) ob(lg.x, lg.z, 0.8, 0.7, 0, 2.6, 'stand');
    // East Sandwich: fieldstone walls and picket fences you can hop, hedges you can't, utility poles
    for (const w of L.walls || []) ob(w.x, w.z, w.len / 2, w.kind === 'stone' ? 0.35 : 0.06, w.rot, w.h, 'wall', true);
    for (const h of L.hedges || []) ob(h.x, h.z, h.len / 2, 0.55, h.rot, h.h, 'hedge');
    for (const p of L.poles || []) this.circles.push({ x: p.x, z: p.z, r: 0.16, y1: gy(p.x, p.z) + 9 });
    for (const [x, z, rot] of L.cars) ob(x, z, 0.98, 2.35, rot, 1.75, 'car');
    for (const b of L.blocks || []) ob(b.x, b.z, b.hx, b.hz, b.rot, b.h, b.kind);
    for (const b of L.rawBoxes || []) this.boxes.push({ ...b });
    for (const b of L.bales || []) this.circles.push({ x: b.x, z: b.z, r: 0.85, y1: gy(b.x, b.z) + 1.5 });
    for (const k of L.rocks) if (k.s > 0.45) this.circles.push({ x: k.x, z: k.z, r: k.s * 0.95, y1: gy(k.x, k.z) + k.s * k.sq * 0.8, walk: true });
    for (const t of L.trees) this.circles.push({ x: t.x, z: t.z, r: 0.35 * t.s, y1: gy(t.x, t.z) + 4 });
    // sandbag walls: low, you can jump onto them; soldiers can't walk through them
    for (const p of L.positions) if (p.bagZ != null) ob(p.x, p.bagZ - 0.4, 1.85, 0.42, 0, 0.5, 'bags', true);
    // boardwalk railings (gaps where side steps lead down to the sand)
    const bw = L.boardwalk || [];
    for (let i = 0; i < bw.length - 1; i++) {
      const a = bw[i], b = bw[i + 1], mz = (a.z + b.z) / 2, my = (a.y + b.y) / 2;
      for (const sd of [-1, 1]) {
        if (L.boardwalkGaps.has(i * 2 + (sd > 0 ? 1 : 0))) continue;
        this.boxes.push({ x: BW_X + sd * 1.16, z: mz, c: 1, s: 0, hx: 0.06, hz: 1.02, y0: my - 3, y1: my + 1.0, kind: 'rail', walk: false });
      }
    }
    // the boardwalk deck is solid down to the sand: you walk on it, never under or through it
    for (let i = 0; i < bw.length - 1; i++) {
      const a = bw[i], b = bw[i + 1], g = Math.min(gy(BW_X, a.z), gy(BW_X, b.z));
      this.boxes.push({ x: BW_X, z: (a.z + b.z) / 2, c: 1, s: 0, hx: BW_HALF, hz: Math.abs(b.z - a.z) / 2, y0: g - 1, y1: Math.max(a.y, b.y) + 0.03, kind: 'deck', walk: true });
    }
    // beach stairs: each tread is a solid walk-on block (you climb tread by tread, you can't walk underneath),
    // with handrails along both sides
    if (L.stairs) {
      const st = L.stairs, z0 = st.z + 0.85, n = st.steps, rise = (st.top - st.bottom) / n;
      for (let k = 0; k < n; k++) {
        const zc = z0 + k * 0.3 + 0.15, ty = st.top - (k + 1) * rise;
        this.boxes.push({ x: st.x, z: zc, c: 1, s: 0, hx: 1.2, hz: 0.155, y0: gy(st.x, zc) - 1, y1: ty + 0.03, kind: 'stair', walk: true });
      }
      for (let k = 0; k < n; k += 4) {
        const za = z0 + k * 0.3, zb = z0 + Math.min(n, k + 4) * 0.3, top = st.top - k * rise;
        for (const sd of [-1, 1]) this.boxes.push({ x: st.x + sd * 1.23, z: (za + zb) / 2, c: 1, s: 0, hx: 0.05, hz: (zb - za) / 2, y0: gy(st.x, zb) - 1, y1: top + 0.95, kind: 'rail', walk: false });
      }
    }
    // spatial hash for static pieces
    this.cell = 8; this.grid = new Map();
    const put = (o, x0, x1, z0, z1) => {
      for (let cx = Math.floor(x0 / this.cell); cx <= Math.floor(x1 / this.cell); cx++) for (let cz = Math.floor(z0 / this.cell); cz <= Math.floor(z1 / this.cell); cz++) {
        const k = cx * 10007 + cz; if (!this.grid.has(k)) this.grid.set(k, []); this.grid.get(k).push(o);
      }
    };
    for (const b of this.boxes) { const r = Math.hypot(b.hx, b.hz); put(b, b.x - r, b.x + r, b.z - r, b.z + r); }
    for (const c of this.circles) put(c, c.x - c.r, c.x + c.r, c.z - c.r, c.z + c.r);
    this._near = [];
    this._dyn = [];
    this._dynT = -1;
  }

  near(x, z, r = 2, out = this._near) {
    out.length = 0;
    const stamp = (this._stamp = (this._stamp || 0) + 1);
    for (let cx = Math.floor((x - r) / this.cell); cx <= Math.floor((x + r) / this.cell); cx++) for (let cz = Math.floor((z - r) / this.cell); cz <= Math.floor((z + r) / this.cell); cz++) {
      const l = this.grid.get(cx * 10007 + cz); if (!l) continue;
      for (const o of l) if (o._st !== stamp) { o._st = stamp; out.push(o); }
    }
    return out;
  }

  // vehicles and landed helicopters at tape time t (cached per t)
  dynamic(t) {
    if (t === this._dynT) return this._dyn;
    this._dynT = t; const d = this._dyn; d.length = 0;
    this.L.vehicles.forEach((v, vi) => {
      const z = vehZ(v, t); if (z > 160) return;
      const g = Math.max(heightAt(v.x, z), v.type === 'aav' ? -0.9 : 0);
      if (v.type === 'aav') d.push({ x: v.x, z, c: 1, s: 0, hx: 1.85, hz: 4.8, y0: g - 1, y1: g + 3.0, kind: 'veh', vi, walk: false });
      else {
        // hovercraft: hull sides are solid; the deck between the side structures is walkable (that's how troops exit)
        d.push({ x: v.x - 5.55, z: z + 0.6, c: 1, s: 0, hx: 1.3, hz: 11.2, y0: g - 1, y1: g + 5.5, kind: 'veh', vi, walk: false });
        d.push({ x: v.x + 5.55, z: z + 0.6, c: 1, s: 0, hx: 1.3, hz: 11.2, y0: g - 1, y1: g + 5.5, kind: 'veh', vi, walk: false });
        d.push({ x: v.x, z: z + 12.4, c: 1, s: 0, hx: 7.2, hz: 1.0, y0: g - 1, y1: g + 6.5, kind: 'veh', vi, walk: false });
      }
    });
    for (const b of this.L.dynBoxes || []) if (t < (b.until ?? 1e9) && t >= (b.from ?? -1e9)) d.push(b);
    // The Bomb: the cars, moving or wrecked
    for (const c of this.L.rides || []) {
      const p = carPose(c, t, _cp), dm = CAR_DIM[c.kind] || CAR_DIM.sedan;
      d.push({ x: p.x, z: p.z, c: Math.cos(p.yaw), s: Math.sin(p.yaw), hx: dm[0], hz: dm[1], y0: p.y - 0.3, y1: p.y + dm[2], kind: 'car', vi: 100 + c.i, walk: false });
    }
    const hp = {};
    for (const h of this.L.helos) {
      heloPose(h, t, hp);
      if (hp.y - h.y > 1.2) continue;
      const c = Math.cos(hp.yaw), s = Math.sin(hp.yaw);
      d.push({ x: hp.x, z: hp.z + 1.5 * c, c, s, hx: 1.2, hz: 5.2, y0: hp.y - 1, y1: hp.y + 3.8, kind: 'helo', walk: false });
      d.push({ x: hp.x + Math.sin(hp.yaw) * -6.5, z: hp.z + Math.cos(hp.yaw) * -6.5, c, s, hx: 0.4, hz: 3.5, y0: hp.y + 1.5, y1: hp.y + 3.3, kind: 'helo', walk: false });
    }
    return d;
  }

  // is any solid (non walk-on) obstacle within r of (x,z)?
  anyNear(x, z, r, t) {
    for (const o of this.near(x, z, r)) if (!o.walk) return true;
    for (const o of this.dynamic(t)) if (Math.abs(x - o.x) < o.hx + o.hz + r && Math.abs(z - o.z) < o.hx + o.hz + r) return true;
    return false;
  }

  // local coordinates in a box frame
  static local(b, x, z) { const dx = x - b.x, dz = z - b.z; return [dx * b.c - dz * b.s, dx * b.s + dz * b.c]; }
  static world(b, lx, lz) { return [b.x + lx * b.c + lz * b.s, b.z - lx * b.s + lz * b.c]; }

  // push a body (radius r, feet at y, height hgt) out of obstacles; returns [x, z]. ignoreVeh: vehicle index to pass through
  pushOut(x, z, r, y, t, ignoreVeh = -1, hgt = 1.7) {
    const nearL = this.near(x, z, r + 2, this._pl || (this._pl = []));
    const dyn = t != null ? this.dynamic(t) : [];
    for (let it = 0; it < 2; it++) {
      for (const list of [nearL, dyn]) {
        for (const o of list) {
          if (o.vi !== undefined && o.vi === ignoreVeh) continue;
          if (o.hi !== undefined && this.ruined(o, t)) continue;
          if (o.hx !== undefined && list === dyn) { const rr = o.hx + o.hz + r; if (Math.abs(x - o.x) > rr || Math.abs(z - o.z) > rr) continue; }
          if (o.hx !== undefined) {
            if (y + hgt < o.y0 || y > o.y1 - 0.42) continue; // above it (standing on top) or below
            const [lx, lz] = Obstacles.local(o, x, z);
            const cx = Math.max(-o.hx, Math.min(o.hx, lx)), cz = Math.max(-o.hz, Math.min(o.hz, lz));
            let dx = lx - cx, dz = lz - cz; const d = Math.hypot(dx, dz);
            if (d >= r) continue;
            let nlx, nlz;
            if (d > 1e-5) { nlx = cx + dx / d * r; nlz = cz + dz / d * r; }
            else { // centre inside the box: exit through the nearest face
              const ex = o.hx - Math.abs(lx), ez = o.hz - Math.abs(lz);
              if (ex < ez) { nlx = Math.sign(lx || 1) * (o.hx + r); nlz = lz; } else { nlx = lx; nlz = Math.sign(lz || 1) * (o.hz + r); }
            }
            [x, z] = Obstacles.world(o, nlx, nlz);
          } else {
            if (y > o.y1 - 0.35) continue;
            const dx = x - o.x, dz = z - o.z, d = Math.hypot(dx, dz), m = o.r + r;
            if (d < m && d > 1e-5) { x = o.x + dx / d * m; z = o.z + dz / d * m; }
          }
        }
      }
    }
    return [x, z];
  }

  // height of the walkable surface under (x,z) for someone whose feet are at yPrev (steps up to ~0.45 m)
  surfaceY(x, z, yPrev = 1e9, t = null) {
    let y = Math.max(heightAt(x, z) + (t != null && this.D ? this.D.craters.delta(x, z, t) : 0), SC.id === 'beach' || SC.id === 'sandwich' ? -0.9 : -1e4);   // off a ship, or out of an aircraft, you fall
    const L = this.L, bw = L.boardwalk || [];
    const ax = bw.length ? Math.abs(x - BW_X) : 99;
    const step = (h) => { if (h > y && h <= yPrev + 0.48) y = h; };
    // deck
    if (ax < BW_HALF + 0.05) {
      const z0 = bw[0].z, dz = bw[1].z - bw[0].z, k = (z - z0) / dz;
      if (k >= 0 && k < bw.length - 1) { const i = Math.floor(k), f = k - i; step(bw[i].y + (bw[i + 1].y - bw[i].y) * f + 0.03); }
      // stairs down to the beach (quantised steps)
      const st = L.stairs, sz0 = st.z + 0.85, n = st.steps, len = n * 0.3;
      if (z >= sz0 && z <= sz0 + len + 0.15) { const kk = Math.min(n - 1, Math.floor((z - sz0) / 0.3)); step(st.top - (kk + 1) * (st.top - st.bottom) / n + 0.03); }
    } else if (ax < BW_HALF + 0.9) {
      // side steps at railing gaps
      const z0 = bw[0].z, dz = bw[1].z - bw[0].z, i = Math.floor((z - z0) / dz);
      if (i >= 0 && i < bw.length - 1 && L.boardwalkGaps.has(i * 2 + (x > BW_X ? 1 : 0))) {
        const deck = (bw[i].y + bw[i + 1].y) / 2, g = heightAt(x, z);
        const u = (ax - BW_HALF) / 0.9; const kk = Math.floor(u * 3);
        step(deck - (kk + 1) * (deck - g) / 3);
      }
    }
    // walkable tops (sandbags, rocks, and the hovercraft deck)
    for (const o of this.near(x, z, 1, this._sl || (this._sl = []))) {
      if (!o.walk || o.kind === 'deck') continue;
      if (o.hx !== undefined) { const [lx, lz] = Obstacles.local(o, x, z); if (Math.abs(lx) <= o.hx && Math.abs(lz) <= o.hz) step(o.y1); }
      else if (Math.hypot(x - o.x, z - o.z) < o.r * 0.8) step(o.y1);
    }
    if (t != null && z > -5) for (const v of L.vehicles) {
      if (v.type !== 'lcac' || Math.abs(x - v.x) > 4.3) continue;
      const vz = vehZ(v, t);
      if (z > vz - 14.2 && z < vz + 11) step(lcacDeckY(v, t, z));
    }
    return y;
  }

  // ground for ragdolls: highest walkable surface (no step limit)
  // resting height for a body part near height y (a corpse under the deck stays under it)
  restY(x, z, y = 1e9, t = null) { return this.surfaceY(x, z, y + 0.35, t); }
  // destruction (craters, ruined houses) — set once the battle's explosions are known
  setDestruction(D) { this.D = D; }
  ruined(o, t) { return o.hi !== undefined && t != null && this.D && t >= this.D.houses[o.hi].openT; }

  // first obstacle hit along a segment (for bullets/LOS). returns t in [0,1] or -1. Ignores low walk-on pieces.
  segment(ax, ay, az, bx, by, bz, t, ignoreVeh = -1, includeLow = false) {
    let best = -1;
    const minx = Math.min(ax, bx), maxx = Math.max(ax, bx), minz = Math.min(az, bz), maxz = Math.max(az, bz);
    const cands = [];
    for (let cx = Math.floor(minx / this.cell); cx <= Math.floor(maxx / this.cell); cx++) for (let cz = Math.floor(minz / this.cell); cz <= Math.floor(maxz / this.cell); cz++) {
      const l = this.grid.get(cx * 10007 + cz); if (l) for (const o of l) if (o.hx !== undefined && (includeLow || !o.walk) && o.kind !== 'rail' && !this.ruined(o, t)) cands.push(o);
    }
    if (t != null) for (const o of this.dynamic(t)) if (ignoreVeh instanceof Set ? !ignoreVeh.has(o.vi) : o.vi !== ignoreVeh) cands.push(o);
    for (const o of cands) {
      // slab test in the box frame
      const [lax, laz] = Obstacles.local(o, ax, az), [lbx, lbz] = Obstacles.local(o, bx, bz);
      const dx = lbx - lax, dz = lbz - laz;
      let t0 = 0, t1 = 1;
      const slab = (p, d, h) => { if (Math.abs(d) < 1e-9) return Math.abs(p) <= h; let u0 = (-h - p) / d, u1 = (h - p) / d; if (u0 > u1) [u0, u1] = [u1, u0]; t0 = Math.max(t0, u0); t1 = Math.min(t1, u1); return t0 <= t1; };
      if (!slab(lax, dx, o.hx) || !slab(laz, dz, o.hz)) continue;
      const yAt = ay + (by - ay) * t0;
      if (yAt > o.y1 || yAt < o.y0) { const yEnd = ay + (by - ay) * t1; if ((yAt > o.y1 && yEnd > o.y1) || (yAt < o.y0 && yEnd < o.y0)) continue; }
      if (best < 0 || t0 < best) best = t0;
    }
    return best;
  }
}

export const BOARDWALK = { x: BW_X, half: BW_HALF };
