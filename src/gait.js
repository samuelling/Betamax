// Gait selection, shared by the simulation (which advances each soldier's step phase) and the animation (which
// blends the mocap clips) so feet stay planted: every soldier gets his own walk, run, crouch, limp and idle from
// the clip library, and the step length the sim uses is exactly the blend of the clips the animation shows.
import { CLIPS } from './mocap.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const H = (id, k) => ((((id + 1) * 2654435761) ^ (k * 40503 + 977)) >>> 0) / 4294967296;
const pick = (arr, id, k) => arr[Math.floor(H(id, k) * arr.length) % arr.length];

// rifle captures (mocap_rifle.js): the walk, the combat jog, the sprint, and the hunched advance all carry the weapon
const WALKS = ['m_rifle_walk'];
const RUNS = ['m_rifle_run', 'f_rifle_run'];
const CROUCH = ['t_crouch_firing', 'f_rifle_crouch'];
const LIMPS = ['c_limp', 'c_limp_drag', 'c_limp_hobble'];
const IDLES = ['m_rifle_idle', 'f_rifle_stand'];

const cache = new Map();
export function styleOf(id, mg) {
  const key = id * 2 + (mg ? 1 : 0);
  let s = cache.get(key);
  if (!s) {
    s = {
      walk: pick(WALKS, id, 1),
      run: pick(RUNS, id, 2),
      crouch: pick(CROUCH, id, 3),
      limp: pick(LIMPS, id, 4),
      idle: pick(IDLES, id, 5),
      idleOff: H(id, 6) * 20,
      sprint: 'mw_layer0', aim: 'm_rifle_aim_idle', walkFire: 't_walking_firing', crouchRun: 'm_rifle_run',
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
  const wRun = smooth(1.6, 2.3, speed);
  let wWalk = 1 - wRun, wR = wRun;
  // hunched, low movement between cover
  const wc = smooth(0.4, 0.75, crouch) * 0.85;
  const fast = smooth(1.3, 2.4, speed);
  // the wounded limp at walking pace and labour into a jog when they have to run
  const wl = hurt ? (1 - smooth(1.0, 2.3, speed)) * 0.9 : 0;
  const wj = hurt ? smooth(1.0, 2.3, speed) * 0.6 : 0;
  const rest = (1 - wc) * (1 - wl) * (1 - wj);
  if (wWalk * rest > 0.001) out.push([st.walk, wWalk * rest]);
  { const ws = st.sprint ? smooth(3.3, 4.1, speed) : 0; if (wR * rest * (1 - ws) > 0.001) out.push([st.run, wR * rest * (1 - ws)]); if (wR * rest * ws > 0.001) out.push([st.sprint, wR * rest * ws]); }
  if (wc * (1 - wl) * (1 - wj) > 0.001) {
    const k = wc * (1 - wl) * (1 - wj);
    if (1 - fast > 0.001) out.push([st.crouch, k * (1 - fast)]);
    if (fast > 0.001) out.push([st.crouchRun || 'c_crouch_run', k * fast]);
  }
  if (wl > 0.001) out.push([st.limp, wl * (1 - wj)]);
  if (wj > 0.001) out.push(['c_jog', wj]);
  return out;
}
// the same blend without allocating: fills names[]/weights[] and returns the count (animation hot path)
export function gaitBlendFlat(st, speed, crouch, hurt, names, weights) {
  let n = 0;
  const wRun = smooth(1.6, 2.3, speed);
  const wc = smooth(0.4, 0.75, crouch) * 0.85;
  const fast = smooth(1.3, 2.4, speed);
  const wl = hurt ? (1 - smooth(1.0, 2.3, speed)) * 0.9 : 0;
  const wj = hurt ? smooth(1.0, 2.3, speed) * 0.6 : 0;
  const rest = (1 - wc) * (1 - wl) * (1 - wj), k = wc * (1 - wl) * (1 - wj);
  if ((1 - wRun) * rest > 0.001) { names[n] = st.walk; weights[n++] = (1 - wRun) * rest; }
  { const ws = st.sprint ? smooth(3.3, 4.1, speed) : 0; if (wRun * rest * (1 - ws) > 0.001) { names[n] = st.run; weights[n++] = wRun * rest * (1 - ws); } if (wRun * rest * ws > 0.001) { names[n] = st.sprint; weights[n++] = wRun * rest * ws; } }
  if (k > 0.001) {
    if (1 - fast > 0.001) { names[n] = st.crouch; weights[n++] = k * (1 - fast); }
    if (fast > 0.001) { names[n] = st.crouchRun || 'c_crouch_run'; weights[n++] = k * fast; }
  }
  if (wl > 0.001) { names[n] = st.limp; weights[n++] = wl * (1 - wj); }
  if (wj > 0.001) { names[n] = 'c_jog'; weights[n++] = wj; }
  return n;
}
export function gaitStride(st, speed, crouch, hurt) {
  const b = gaitBlend(st, speed, crouch, hurt);
  let s = 0, w = 0; for (const [k, x] of b) { s += STRIDE[k] * x; w += x; }
  return w > 0 ? s / w : 1.45;
}
