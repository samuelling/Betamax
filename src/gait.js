// Gait selection, shared by the simulation (which advances each soldier's step phase) and the animation (which
// blends the mocap clips) so feet stay planted: every soldier gets his own walk, run, crouch, limp and idle from
// the clip library, and the step length the sim uses is exactly the blend of the clips the animation shows.
import { CLIPS } from './mocap.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const H = (id, k) => ((((id + 1) * 2654435761) ^ (k * 40503 + 977)) >>> 0) / 4294967296;
const pick = (arr, id, k) => arr[Math.floor(H(id, k) * arr.length) % arr.length];

const WALKS = ['walk', 'c_walk_relaxed', 'c_walk_hurried', 'c_walk_tactical'];
const RUNS = ['run', 'c_run', 'c_sprint', 'c_run'];
const CROUCH = ['c_crouch_walk', 'c_sneak'];
const LIMPS = ['c_limp', 'c_limp_drag', 'c_limp_hobble'];
const IDLES = ['idle', 'c_idle_shift', 'c_idle_ready', 'c_idle_look', 'c_idle_nervous', 'c_idle_ready'];

const cache = new Map();
export function styleOf(id, mg) {
  const key = id * 2 + (mg ? 1 : 0);
  let s = cache.get(key);
  if (!s) {
    s = {
      walk: mg && H(id, 9) < 0.6 ? 'c_walk_heavy' : pick(WALKS, id, 1),
      run: pick(RUNS, id, 2),
      crouch: pick(CROUCH, id, 3),
      limp: pick(LIMPS, id, 4),
      idle: pick(IDLES, id, 5),
      idleOff: H(id, 6) * 20,
    };
    cache.set(key, s);
  }
  return s;
}

export const STRIDE = {};
for (const [k, c] of Object.entries(CLIPS)) STRIDE[k] = c.stride || 1;

// locomotion blend for a speed (m/s), crouch (0..1) and whether he's been wounded. Returns [[clip, weight], ...]
// summing to 1 (the idle blend is separate, by wMove).
const _L = [];
export function gaitBlend(st, speed, crouch, hurt, out = _L) {
  out.length = 0;
  const wRun = smooth(2.3, 3.9, speed);
  let wWalk = 1 - wRun, wR = wRun;
  // hunched, low movement between cover
  const wc = smooth(0.4, 0.75, crouch) * 0.85;
  const fast = smooth(1.3, 2.4, speed);
  // the wounded limp at walking pace and labour into a jog when they have to run
  const wl = hurt ? (1 - smooth(1.0, 2.3, speed)) * 0.9 : 0;
  const wj = hurt ? smooth(1.0, 2.3, speed) * 0.6 : 0;
  const rest = (1 - wc) * (1 - wl) * (1 - wj);
  if (wWalk * rest > 0.001) out.push([st.walk, wWalk * rest]);
  if (wR * rest > 0.001) out.push([st.run, wR * rest]);
  if (wc * (1 - wl) * (1 - wj) > 0.001) {
    const k = wc * (1 - wl) * (1 - wj);
    if (1 - fast > 0.001) out.push([st.crouch, k * (1 - fast)]);
    if (fast > 0.001) out.push(['c_crouch_run', k * fast]);
  }
  if (wl > 0.001) out.push([st.limp, wl * (1 - wj)]);
  if (wj > 0.001) out.push(['c_jog', wj]);
  return out;
}
export function gaitStride(st, speed, crouch, hurt) {
  const b = gaitBlend(st, speed, crouch, hurt);
  let s = 0, w = 0; for (const [k, x] of b) { s += STRIDE[k] * x; w += x; }
  return w > 0 ? s / w : 1.45;
}
