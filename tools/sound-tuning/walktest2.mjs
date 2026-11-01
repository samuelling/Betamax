import { buildLayout, vehZ } from '/home/claude/backwash/src/layout.js';
import { Obstacles } from '/home/claude/backwash/src/obstacles.js';
const L = buildLayout(), O = new Obstacles(L);
const inside = (o, x, z, m) => { const [lx, lz] = Obstacles.local(o, x, z); return Math.abs(lx) < o.hx - m && Math.abs(lz) < o.hz - m; };
const res = {}; const T = 100;
const targets = O.boxes.filter((o) => !o.walk).concat(O.dynamic(60).map((o) => ({ ...o, dyn: true })));
for (const o of targets) {
  const k = o.kind; res[k] = res[k] || [0, 0];
  for (let a = 0; a < 16; a++) {
    const ang = a / 16 * Math.PI * 2, R = Math.hypot(o.hx, o.hz) + 3;
    let x = o.x + Math.sin(ang) * R, z = o.z + Math.cos(ang) * R, y = O.surfaceY(x, z, 1e9, o.dyn ? 60 : T);
    for (let s = 0; s < 200; s++) {
      const dx = o.x - x, dz = o.z - z, d = Math.hypot(dx, dz) || 1;
      let nx = x + dx / d * 0.11, nz = z + dz / d * 0.11;
      [nx, nz] = O.pushOut(nx, nz, 0.34, y, o.dyn ? 60 : T, -1, 1.7);
      let gy = O.surfaceY(nx, nz, y, o.dyn ? 60 : T); if (gy > y + 0.5) { nx = x; nz = z; gy = y; }
      x = nx; z = nz; y = gy;
    }
    res[k][0]++; if (inside(o, x, z, 0.05) && y < o.y1 - 0.42) res[k][1]++;
  }
}
console.log(JSON.stringify(res));
