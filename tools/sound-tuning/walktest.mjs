// sweep a player-sized body at the boardwalk/stairs from many directions; report where it ends up inside geometry
import { buildLayout } from '/home/claude/backwash/src/layout.js';
import { Obstacles } from '/home/claude/backwash/src/obstacles.js';
import { heightFast as heightAt } from '/home/claude/backwash/src/terrain.js';
const L = buildLayout(), O = new Obstacles(L), bw = L.boardwalk, st = L.stairs;
const deckAt = (z) => { const z0 = bw[0].z, dz = bw[1].z - bw[0].z, k = (z - z0) / dz; if (k < 0 || k >= bw.length - 1) return null; const i = Math.floor(k), f = k - i; return bw[i].y + (bw[i + 1].y - bw[i].y) * f; };
const bad = []; let n = 0;
for (let z0 = -72; z0 <= -26; z0 += 1.5) for (const side of [-1, 1]) for (const ang of [-0.6, 0, 0.6]) {
  let x = 2 + side * 6, z = z0, y = O.surfaceY(x, z, 1e9, 100);
  const dx = -side * Math.cos(ang), dz = Math.sin(ang);
  for (let k = 0; k < 240; k++) {
    let nx = x + dx * 6.6 / 60, nz = z + dz * 6.6 / 60;
    [nx, nz] = O.pushOut(nx, nz, 0.34, y, 100, -1, 1.7);
    let gy = O.surfaceY(nx, nz, y, 100);
    if (gy > y + 0.5) { nx = x; nz = z; gy = O.surfaceY(x, z, y, 100); }
    x = nx; z = nz; y += (gy - y) * 0.3; if (Math.abs(gy - y) < 0.3) y = gy;
    n++;
    const d = deckAt(z);
    if (d != null && Math.abs(x - 2) < 1.12 && y < d - 0.2 && d - y < 1.85) { bad.push([z0, side, ang, x.toFixed(2), z.toFixed(2), y.toFixed(2), d.toFixed(2), 'under-deck']); break; }
    // stairs: under the treads
    const sz0 = st.z + 0.85, len = st.steps * 0.3;
    if (Math.abs(x - st.x) < 1.15 && z > sz0 && z < sz0 + len) { const kk = Math.floor((z - sz0) / 0.3), ty = st.top - (kk + 1) * (st.top - st.bottom) / st.steps; if (y < ty - 0.25 && ty - y < 1.85) { bad.push([z0, side, ang, x.toFixed(2), z.toFixed(2), y.toFixed(2), ty.toFixed(2), 'under-stairs']); break; } }
  }
}
console.log('runs', n, 'violations', bad.length); console.log(bad.slice(0, 15).map((b) => b.join(' ')).join('\n'));
