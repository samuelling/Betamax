// A walking grid (2 m) over an arena, blocked wherever an obstacle is; paths found with A* and string-pulled to
// their corners. Shared by the simulations that need people to find their way through a maze of things.
import { clamp } from './rng.js';
import { Obstacles } from './obstacles.js';

export function makeNav(O, A, opts = {}) {
  const NC = opts.cell || 2, NX = Math.ceil((A.x1 - A.x0) / NC), NZ = Math.ceil((A.z1 - A.z0) / NC), blk = new Uint8Array(NX * NZ), pad = opts.pad ?? 0.65, t = opts.t ?? null;
  const cellX = (i) => A.x0 + (i + 0.5) * NC, cellZ = (j) => A.z0 + (j + 0.5) * NC;
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const x = cellX(i), z = cellZ(j);
    if (opts.walkable && !opts.walkable(x, z)) { blk[j * NX + i] = 1; continue; }
    for (const o of O.near(x, z, 1.4)) {
      if (opts.y != null && (o.y1 < opts.y + 0.3 || (o.y0 ?? -1e9) > opts.y + 1.7)) continue;   // another level
      if (o.walk && (o.y1 - o.y0) < 2.2) continue;
      if (o.hx !== undefined) { const [lx, lz] = Obstacles.local(o, x, z); if (Math.abs(lx) < o.hx + pad && Math.abs(lz) < o.hz + pad) { blk[j * NX + i] = 1; break; } }
      else if (Math.hypot(x - o.x, z - o.z) < o.r + pad - 0.1) { blk[j * NX + i] = 1; break; }
    }
  }
  void t;
  const toCell = (x, z) => [clamp(Math.floor((x - A.x0) / NC), 0, NX - 1), clamp(Math.floor((z - A.z0) / NC), 0, NZ - 1)];
  const clearLine = (x0, z0, x1, z1) => { const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.8); for (let k = 1; k < n; k++) { const [i, j] = toCell(x0 + (x1 - x0) * k / n, z0 + (z1 - z0) * k / n); if (blk[j * NX + i]) return false; } return true; };
  const gS = new Float32Array(NX * NZ), came = new Int32Array(NX * NZ), seen = new Uint32Array(NX * NZ); let stamp = 0;
  function findPath(x0, z0, x1, z1) {
    if (clearLine(x0, z0, x1, z1)) return [{ x: x1, z: z1 }];
    stamp++;
    let [si, sj] = toCell(x0, z0); let [ti, tj] = toCell(x1, z1);
    const nearest = (ci, cj) => { let bd = 1e9, bi = ci, bj = cj; for (let dj = -4; dj <= 4; dj++) for (let di = -4; di <= 4; di++) { const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= NX || j >= NZ || blk[j * NX + i]) continue; const d = di * di + dj * dj; if (d < bd) { bd = d; bi = i; bj = j; } } return [bi, bj]; };
    if (blk[tj * NX + ti]) [ti, tj] = nearest(ti, tj);
    if (blk[sj * NX + si]) [si, sj] = nearest(si, sj);
    const open = [[0, si, sj]], s0 = sj * NX + si, goal = tj * NX + ti; gS[s0] = 0; seen[s0] = stamp; came[s0] = -1;
    let found = false, iters = 0;
    while (open.length && iters++ < 12000) {
      let bi = 0; for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k;
      const [, ci, cj] = open[bi]; open[bi] = open[open.length - 1]; open.pop();
      const c = cj * NX + ci; if (c === goal) { found = true; break; }
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue; const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= NX || j >= NZ) continue;
        const n = j * NX + i; if (blk[n] && n !== goal) continue;
        if (di && dj && (blk[cj * NX + i] || blk[j * NX + ci])) continue;
        const g = gS[c] + (di && dj ? 1.414 : 1);
        if (seen[n] === stamp && gS[n] <= g) continue;
        seen[n] = stamp; gS[n] = g; came[n] = c; open.push([g + Math.hypot(ti - i, tj - j), i, j]);
      }
    }
    if (!found) return [{ x: x1, z: z1 }];
    const pts = []; for (let c = goal; c >= 0 && c !== s0; c = came[c]) pts.push({ x: cellX(c % NX), z: cellZ(Math.floor(c / NX)) });
    pts.reverse(); pts.push({ x: x1, z: z1 });
    const out = []; let px = x0, pz = z0, k = 0;
    while (k < pts.length) { let far = k; for (let m = pts.length - 1; m > k; m--) if (clearLine(px, pz, pts[m].x, pts[m].z)) { far = m; break; } out.push(pts[far]); px = pts[far].x; pz = pts[far].z; k = far + 1; }
    return out;
  }
  return { findPath, clearLine, blocked: (x, z) => { const [i, j] = toCell(x, z); return !!blk[j * NX + i]; } };
}
