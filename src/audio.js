// All sound is synthesized. The world plays backwards, sample-accurately: every gunshot, crack, impact and
// explosion is scheduled so its reversed waveform ends exactly when the event happens on the tape (plus the
// speed-of-sound delay to your ears). Distance variants have their reflections baked in BEFORE reversing, so the
// echoes off the dunes and houses swell in ahead of each sound instead of trailing it. The player's own gun,
// hands and ears are the only things that run forward.
//
// What the design is based on:
//  - a rifle heard downrange is two events: the bullet's supersonic crack (an N-wave well under a millisecond)
//    and the muzzle blast, which arrives later at 343 m/s. Close to the muzzle you get the blast's low "body" and
//    the action cycling; far away only the low end and the slap-back of reflections survive (air absorbs highs).
//  - explosions: a detonation crack, a low blast body and sub-bass thump, crunchy mid frequencies, then debris
//    and sand raining back down for seconds. Into water: a dull boom and a long collapsing splash.
//  - mortar rounds arrive with a short rushing whistle; the tube's hollow "thoonk" is heard 13-18 s earlier.
import { mulberry32 } from './rng.js';
import { WILHELM_MP3 } from './wilhelm.js';

const C_SOUND = 343;
const TAU2 = Math.PI * 2;

// ---------- offline DSP helpers ----------
function coeffs(type, f, q, sr) {
  const w = TAU2 * Math.min(f, sr * 0.45) / sr, cs = Math.cos(w), al = Math.sin(w) / (2 * q);
  let b0, b1, b2;
  if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; }
  else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; }
  else { b0 = al; b1 = 0; b2 = -al; }
  const a0 = 1 + al;
  return [b0 / a0, b1 / a0, b2 / a0, (-2 * cs) / a0, (1 - al) / a0];
}
function filt(x, type, f, q, sr) {
  const [b0, b1, b2, a1, a2] = coeffs(type, f, q, sr);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i], y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = v; y2 = y1; y1 = y; x[i] = y;
  }
  return x;
}
function rms(x) { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]; return Math.sqrt(s / x.length) || 1; }
// filtered noise normalised to rms 0.3
function fnoise(r, n, type, f, q, sr) {
  const x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = r() * 2 - 1;
  if (type) filt(x, type === 'bp1' ? 'bp' : type, f, q, sr);
  if (type === 'bp') filt(x, 'bp', f, q, sr);
  const k = 0.3 / rms(x); for (let i = 0; i < n; i++) x[i] *= k;
  return x;
}
const hump = (t, tp) => (t <= 0 ? 0 : (t / tp) * (t / tp) * Math.exp(2 * (1 - t / tp)));
// N-wave: the pressure signature of a shock (instant rise, linear fall through zero, instant recovery)
function nwave(d, i0, len, amp) { len = Math.max(2, Math.round(len)); for (let k = 0; k < len && i0 + k < d.length; k++) d[i0 + k] += amp * (1 - (2 * k) / len); }
// short decaying burst of filtered noise added at t0 (debris, grains, clods)
function grain(d, r, sr, t0, amp, dec, lpk) {
  const i0 = Math.floor(t0 * sr), len = Math.floor(dec * 5 * sr); let y = 0;
  for (let k = 0; k < len && i0 + k < d.length; k++) { y += ((r() * 2 - 1) - y) * lpk; d[i0 + k] += y * amp * Math.exp(-k / (dec * sr)); }
}
function ring(d, sr, t0, f, amp, dec) {
  const i0 = Math.floor(t0 * sr), len = Math.floor(dec * 6 * sr);
  for (let k = 0; k < len && i0 + k < d.length; k++) d[i0 + k] += Math.sin(TAU2 * f * k / sr) * amp * Math.exp(-k / (dec * sr));
}
function softclip(d, drive) { const k = Math.tanh(drive); for (let i = 0; i < d.length; i++) d[i] = Math.tanh(d[i] * drive) / k; }
function fadeIn(d, sr, s = 0.0004) { const n = Math.floor(s * sr); for (let i = 0; i < n && i < d.length; i++) d[i] *= i / n; }

// ---------- sound recipes (forward time; mono Float32Arrays) ----------
const RIFLES = [
  // parameters fitted (tune/opt_rifle.py) to 34 real rifle recordings: flat ~125 Hz-2 kHz blast in the first 50 ms,
  // tail centred ~500 Hz-1 kHz, little below 120 Hz. The other calibres are scaled from the fitted M7.
  // 0: invaders' 5.8 mm bullpup — sharper and brighter
  { len: 0.45, nw: 0.0007, bA: 1.0, bD: 0.0014, pA: 0.6, pD: 0.0038, bodyF: 1000, bodyQ: 0.7, bodyD: 0.02, bodyA: 0.62, hiA: 0.38, hiD: 0.01, tA: 0.29, tD: 0.055, tF: 500, blF: 1500, th0: 220, th1: 110, thD: 0.016, thA: 0.16, mech: 0.1, mechF: 3300 },
  // 1: defenders' M7 6.8 mm (fitted)
  { len: 0.45, nw: 0.0009, bA: 1.0, bD: 0.00154, pA: 0.703, pD: 0.00422, bodyF: 820, bodyQ: 0.7, bodyD: 0.022, bodyA: 0.67, hiA: 0.32, hiD: 0.01, tA: 0.31, tD: 0.058, tF: 449, blF: 1120, th0: 200, th1: 95, thD: 0.022, thA: 0.198, mech: 0.12, mechF: 2900 },
  // 2: belt-fed MGs (7.62) — longer, deeper
  { len: 0.5, nw: 0.001, bA: 1.0, bD: 0.0018, pA: 0.5, pD: 0.004, bodyF: 760, bodyQ: 0.7, bodyD: 0.022, bodyA: 0.7, hiA: 0.42, hiD: 0.01, tA: 0.3, tD: 0.05, tF: 650, blF: 1500, th0: 200, th1: 110, thD: 0.018, thA: 0.15, mech: 0.1, mechF: 2400 },
  // 3: IFV 30 mm autocannon — big pressure thump and a steel clank
  { len: 0.85, nw: 0.0018, bA: 1.0, bD: 0.004, pA: 1.2, pD: 0.02, bodyF: 420, bodyQ: 0.7, bodyD: 0.05, bodyA: 0.8, hiA: 0.25, hiD: 0.012, tA: 0.35, tD: 0.11, tF: 380, blF: 900, th0: 130, th1: 55, thD: 0.06, thA: 0.6, mech: 0.3, mechF: 1250 },
];
if (typeof globalThis !== 'undefined' && globalThis.__RIFLE_TUNE) globalThis.__RIFLE_TUNE(RIFLES);
function synthRifle(r, sr, cal, opt = {}) {
  const P = RIFLES[cal], n = Math.floor(P.len * sr), d = new Float32Array(n);
  const blastK = opt.suppressed ? 0.25 : 1, bodyK = opt.suppressed ? 0.45 : 1;
  nwave(d, 0, P.nw * sr * (0.9 + r() * 0.2), 1.0 * blastK);
  // broadband blast (flat ~125 Hz-5 kHz like the recordings), low punch, a body resonance, bright edge, short tail
  const bl = fnoise(r, n, 'lp', P.blF || 3800, 0.6, sr); filt(bl, 'hp', 90, 0.6, sr);
  const pu = fnoise(r, n, 'lp', 420, 0.6, sr), bo = fnoise(r, n, 'bp1', P.bodyF * (0.9 + r() * 0.2), P.bodyQ, sr);
  const hi = fnoise(r, n, 'bp1', 2100 + r() * 500, 0.8, sr), tl = fnoise(r, n, 'bp1', P.tF || 650, 0.55, sr);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = P.th1 + (P.th0 - P.th1) * Math.exp(-t / 0.012); ph += TAU2 * f / sr;
    d[i] += bl[i] * Math.exp(-t / P.bD) * P.bA * 3.0 * blastK
      + pu[i] * Math.exp(-t / P.pD) * P.pA * 3.0 * blastK
      + bo[i] * Math.exp(-t / P.bodyD) * P.bodyA * 3.0 * bodyK
      + hi[i] * Math.exp(-t / P.hiD) * P.hiA * 3.0 * blastK
      + Math.sin(ph) * Math.exp(-t / P.thD) * P.thA * Math.min(1, t / 0.0008)
      + tl[i] * Math.min(1, t / 0.004) * Math.exp(-t / P.tD) * P.tA * 3.0;
  }
  // the action cycling: bolt carrier slams, a few metallic modes
  const tm = 0.007 + r() * 0.005, mk = P.mech * (opt.suppressed ? 2.4 : 1);
  ring(d, sr, tm, P.mechF * (0.95 + r() * 0.1), mk, 0.005); ring(d, sr, tm, P.mechF * 1.53, mk * 0.7, 0.004); ring(d, sr, tm + 0.0005, P.mechF * 2.21, mk * 0.5, 0.003);
  grain(d, r, sr, tm, mk * 1.5, 0.002, 0.6);
  if (opt.suppressed) ring(d, sr, 0, 1700, 0.25, 0.012); // can ring
  softclip(d, 1.5); fadeIn(d, sr, 0.0001);
  return d;
}
function synthCrack(r, sr) {
  const n = Math.floor(0.16 * sr), d = new Float32Array(n);
  const L = 0.0003 + r() * 0.00015;
  nwave(d, 0, L * sr, 1.0);
  const hp = fnoise(r, n, 'hp', 3200, 0.7, sr), rg = fnoise(r, n, 'bp', 5500 + r() * 1500, 4, sr), ts = fnoise(r, n, 'bp', 2600 + r() * 600, 1.5, sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    d[i] += hp[i] * Math.exp(-t / 0.0015) * 1.6 + rg[i] * Math.exp(-t / 0.004) * 1.2 + ts[i] * (t > 0.002 ? Math.exp(-(t - 0.002) / 0.035) : 0) * 0.35;
  }
  softclip(d, 1.3);
  return d;
}
function synthImpact(r, sr, kind) {
  const len = kind === 'iHard' ? 0.85 : kind === 'iWater' ? 0.5 : 0.4, n = Math.floor(len * sr), d = new Float32Array(n);
  if (kind === 'iSand') {
    const lo = fnoise(r, n, 'lp', 700, 0.7, sr), sp = fnoise(r, n, 'hp', 2200, 0.7, sr);
    for (let i = 0; i < n; i++) { const t = i / sr; d[i] = lo[i] * Math.min(1, t / 0.001) * Math.exp(-t / 0.025) * 2.4 + sp[i] * Math.exp(-t / 0.1) * 0.35; }
    for (let k = 0; k < 24; k++) grain(d, r, sr, 0.01 + Math.pow(r(), 1.5) * 0.3, 0.12 * r(), 0.002, 0.5);
  } else if (kind === 'iWater') {
    const no = fnoise(r, n, 'bp', 1500, 0.9, sr); let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr; ph += TAU2 * (600 + 900 * (1 - Math.exp(-t / 0.02))) / sr;
      d[i] = Math.sin(ph) * Math.exp(-t / 0.035) * 0.5 + no[i] * Math.min(1, t / 0.002) * Math.exp(-t / 0.06) * 1.6;
    }
    for (let k = 0; k < 10; k++) { const t0 = 0.05 + r() * 0.35, f = 1200 + r() * 2200; ring(d, sr, t0, f, 0.08, 0.01); }
  } else if (kind === 'iBody') {
    const sl = fnoise(r, n, 'lp', 1500, 0.7, sr), cl = fnoise(r, n, 'hp', 3000, 0.7, sr);
    for (let i = 0; i < n; i++) { const t = i / sr; d[i] = Math.sin(TAU2 * 105 * t) * Math.exp(-t / 0.035) * 0.9 + sl[i] * Math.exp(-t / 0.01) * 2 + cl[i] * Math.exp(-t / 0.0015) * 1.2; }
  } else {
    // steel: inharmonic ping, often followed by a ricochet whine sliding down
    const modes = [[2350, 0.32, 0.22], [3910, 0.24, 0.13], [5720, 0.16, 0.07], [1430, 0.12, 0.3]];
    for (const [f, a, dc] of modes) ring(d, sr, 0, f * (0.93 + r() * 0.14), a, dc);
    const cl = fnoise(r, n, 'hp', 2500, 0.7, sr);
    for (let i = 0; i < n; i++) d[i] += cl[i] * Math.exp(-i / sr / 0.002) * 2;
    if (r() < 0.75) {
      let ph = 0; const f0 = 3800 + r() * 1500, f1 = 900 + r() * 700, T = 0.55;
      for (let i = Math.floor(0.03 * sr); i < n; i++) {
        const t = i / sr - 0.03; if (t > T) break;
        const f = f1 + (f0 - f1) * Math.exp(-t / 0.25) + Math.sin(t * 190) * 60; ph += TAU2 * f / sr;
        d[i] += Math.sin(ph) * hump(t, 0.06) * Math.exp(-t / 0.3) * 0.28;
      }
    }
  }
  softclip(d, 1.2); fadeIn(d, sr);
  return d;
}
// explosion kinds
const BOOMS = {
  // fitted against real detonations (decay to -10/-20/-30 dB ≈ 110/380/830 ms; energy centred ~125-250 Hz,
  // a 1 kHz shoulder, the tail as loud as the first 50 ms); see tune/ and refs/features.json
  eShell: { len: 4.0, crack: 0.6, bodyF: 300, bodyD: 0.1, bodyA: 2.4, sub: 60, subD: 0.15, subA: 0.8, cr: 1200, crD: 0.05, crA: 0.5, midA: 1.6, midD: 0.09, rumA: 0.3, rumD: 0.45, deb: 170, debT: 2.6, debA: 0.6, sand: 0.1 },
  eMortar: { len: 3.0, crack: 0.7, bodyF: 330, bodyD: 0.08, bodyA: 2.2, sub: 70, subD: 0.12, subA: 0.7, cr: 1600, crD: 0.05, crA: 0.5, midA: 1.6, midD: 0.07, rumA: 0.22, rumD: 0.35, deb: 110, debT: 1.9, debA: 0.6, sand: 0.1, frag: 1 },
  eDrone: { len: 2.0, crack: 1.0, bodyF: 520, bodyD: 0.06, bodyA: 1.8, sub: 80, subD: 0.08, subA: 0.5, cr: 2400, crD: 0.04, crA: 0.8, midA: 1.5, midD: 0.05, rumA: 0.12, rumD: 0.25, deb: 35, debT: 0.9, debA: 0.6, sand: 0.06, frag: 0.6 },
  eRocket: { len: 3.3, crack: 0.7, bodyF: 340, bodyD: 0.09, bodyA: 2.3, sub: 62, subD: 0.14, subA: 0.8, cr: 1500, crD: 0.05, crA: 0.6, midA: 1.6, midD: 0.08, rumA: 0.28, rumD: 0.42, deb: 130, debT: 2.1, debA: 0.6, sand: 0.1 },
  eBig: { len: 5.0, crack: 0.6, bodyF: 240, bodyD: 0.18, bodyA: 2.6, sub: 45, subD: 0.3, subA: 1.0, cr: 900, crD: 0.08, crA: 0.5, midA: 1.5, midD: 0.14, rumA: 0.45, rumD: 0.9, deb: 200, debT: 3.4, debA: 0.6, sand: 0.12, metal: 1 },
  eAir: { len: 3.2, crack: 1.0, bodyF: 380, bodyD: 0.09, bodyA: 2.0, sub: 60, subD: 0.14, subA: 0.6, cr: 2000, crD: 0.06, crA: 0.7, midA: 1.6, midD: 0.08, rumA: 0.35, rumD: 0.6, deb: 0, debT: 0, sand: 0, frag: 1.4 },
  eWater: { len: 4.2, crack: 0.4, bodyF: 220, bodyD: 0.12, bodyA: 2.2, sub: 50, subD: 0.2, subA: 1.0, cr: 800, crD: 0.05, crA: 0.3, midA: 1.0, midD: 0.08, rumA: 0.3, rumD: 0.5, deb: 0, debT: 0, sand: 0, water: 1 },
};
if (typeof globalThis !== 'undefined' && globalThis.__BOOM_TUNE) globalThis.__BOOM_TUNE(BOOMS);
function synthBoom(r, sr, kind) {
  const P = BOOMS[kind], n = Math.floor(P.len * sr), d = new Float32Array(n);
  nwave(d, 0, 0.0016 * sr, P.crack);
  const hi = fnoise(r, n, 'hp', 1500, 0.7, sr), body = fnoise(r, n, 'lp', P.bodyF, 0.8, sr), cr = fnoise(r, n, 'bp', P.cr, 0.8, sr), mid = fnoise(r, n, 'bp1', 750, 0.5, sr), rum = fnoise(r, n, 'lp', 140, 0.7, sr);
  filt(body, 'lp', P.bodyF * 1.2, 0.7, sr); filt(body, 'hp', 45, 0.7, sr); filt(rum, 'hp', 40, 0.7, sr);
  const kb = 0.3 / rms(body); for (let i = 0; i < n; i++) body[i] *= kb;
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = P.sub * (1 + 1.6 * Math.exp(-t / 0.05)); ph += TAU2 * f / sr;
    d[i] += hi[i] * Math.exp(-t / 0.006) * 2.6 * P.crack
      + body[i] * Math.min(1, t / 0.003) * Math.exp(-t / P.bodyD) * P.bodyA * 2.6
      + Math.sin(ph) * Math.min(1, t / 0.002) * Math.exp(-t / P.subD) * P.subA
      + cr[i] * Math.exp(-t / P.crD) * P.crA * 2.4
      + mid[i] * Math.min(1, t / 0.004) * Math.exp(-t / (P.midD || 0.2)) * (P.midA || 0) * 2.4
      + rum[i] * Math.min(1, t / 0.05) * Math.exp(-t / (P.rumD || 0.8)) * (P.rumA || 0) * 2.4;
  }
  // fragments: a few high, fast whips through the air in the first moments
  if (P.frag) for (let k = 0; k < 7 * P.frag; k++) grain(d, r, sr, 0.01 + r() * 0.12, 0.25 * r(), 0.004 + r() * 0.01, 0.5);
  // debris and clods coming back down, dense early then sparse, plus a sand-rain hiss
  if (P.deb) {
    for (let k = 0; k < P.deb; k++) {
      const t0 = 0.12 + P.debT * Math.pow(r(), 1.6), fall = 1 - t0 / (P.debT + 0.3);
      grain(d, r, sr, t0, (0.05 + r() * 0.3) * fall * (P.debA || 1), 0.003 + r() * 0.012, 0.06 + r() * 0.2);
    }
    const sd = fnoise(r, n, 'bp', 1900, 0.6, sr), tp = P.debT * 0.35;
    for (let i = 0; i < n; i++) d[i] += sd[i] * hump(i / sr, tp) * P.sand * Math.exp(-i / sr / P.debT);
    if (P.metal) for (let k = 0; k < 14; k++) { const t0 = 0.3 + r() * 2.5; ring(d, sr, t0, 600 + r() * 2400, 0.12 * r(), 0.05 + r() * 0.15); }
  }
  if (P.water) {
    // the water column collapsing: long rushing splash with droplets
    const sp = fnoise(r, n, 'hp', 900, 0.7, sr), tp = 0.9;
    for (let i = 0; i < n; i++) { const t = i / sr; d[i] += sp[i] * hump(t, tp) * Math.exp(-Math.max(0, t - tp) / 1.0) * 0.9; }
    for (let k = 0; k < 140; k++) { const t0 = 0.4 + Math.pow(r(), 0.8) * 2.8; ring(d, sr, t0, 900 + r() * 2600, 0.05 * r(), 0.008); }
  }
  { let pk = 1e-6; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(d[i])); const k = 1.3 / pk; for (let i = 0; i < n; i++) d[i] *= k; }
  softclip(d, P.drive || 1.0); fadeIn(d, sr, 0.0002);
  return d;
}
// incoming rounds: rushing whistle that grows to the moment of impact (the event is at the END of this buffer)
function synthWhistle(r, sr, kind) {
  const D = kind === 'wMortar' ? 2.1 : 1.7, n = Math.floor(D * sr), d = new Float32Array(n);
  let low = 0, band = 0, ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr, u = t / D;
    const fc = kind === 'wMortar' ? 1150 - 500 * u : 520 - 180 * u;
    const f1 = 2 * Math.sin(Math.PI * fc / sr), q = kind === 'wMortar' ? 0.35 : 0.9;
    const x = r() * 2 - 1; low += f1 * band; const high = x - low - q * band; band += f1 * high;
    ph += TAU2 * (kind === 'wMortar' ? 1250 - 420 * u : 0) / sr;
    const env = Math.exp((t - D) / (kind === 'wMortar' ? 0.5 : 0.42)) * Math.min(1, t / 0.08);
    const flutter = kind === 'wMortar' ? 1 + 0.2 * Math.sin(t * 2 * Math.PI * 23) : 1 + 0.35 * Math.sin(t * 2 * Math.PI * 31);
    d[i] = (band * 0.6 + Math.sin(ph) * 0.18) * env * flutter;
  }
  let pk = 1e-6; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(d[i]));
  const k = 0.9 / pk; for (let i = 0; i < n; i++) d[i] *= k;
  for (let i = 0; i < 64; i++) d[n - 1 - i] *= i / 64;
  return d;
}
function synthThoonk(r, sr) {
  const n = Math.floor(0.9 * sr), d = new Float32Array(n);
  nwave(d, 0, 0.002 * sr, 0.8);
  const lo = fnoise(r, n, 'lp', 420, 0.7, sr), tube = fnoise(r, n, 'bp', 520, 8, sr); let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr; ph += TAU2 * (45 + 50 * Math.exp(-t / 0.03)) / sr;
    d[i] += Math.sin(ph) * Math.exp(-t / 0.09) * 1.2 + lo[i] * Math.exp(-t / 0.03) * 2.4 + tube[i] * Math.exp(-t / 0.22) * 0.9;
  }
  softclip(d, 1.3);
  return d;
}
function synthMissile(r, sr) {
  // soft-launch pop, then the flight motor lights and roars away
  const n = Math.floor(2.4 * sr), d = new Float32Array(n);
  nwave(d, 0, 0.0015 * sr, 0.7);
  const pop = fnoise(r, n, 'lp', 900, 0.7, sr), roar = fnoise(r, n, 'lp', 2600, 0.6, sr), hiss = fnoise(r, n, 'hp', 3000, 0.7, sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr, m = t - 0.32;
    d[i] += pop[i] * Math.exp(-t / 0.04) * 2;
    if (m > 0) { const e = Math.min(1, m / 0.025) * Math.exp(-m / 0.75); d[i] += (roar[i] * 2.2 + hiss[i] * 0.8) * e * (1 + 0.3 * (r() - 0.5)); }
  }
  for (let k = 0; k < 60; k++) grain(d, r, sr, 0.33 + r() * 0.9, 0.2 * r(), 0.002, 0.7);
  softclip(d, 1.3);
  return d;
}
// impulse responses: open beach with a hard ground bounce, slap-back off the dunes and houses, rolling tail
function synthIR(r, sr, far) {
  const D = far ? 2.9 : 1.9, n = Math.floor(D * sr), d = new Float32Array(n);
  const tail = fnoise(r, n, 'lp', far ? 1000 : 1200, 0.6, sr);
  for (let i = 0; i < n; i++) { const t = i / sr; d[i] = tail[i] * Math.min(1, t / 0.05) * Math.exp(-t / (far ? 0.5 : 0.26)) * (far ? 0.5 : 0.35); }
  d[Math.floor(0.004 * sr)] += 0.5;
  const echoes = far ? [[0.09, 0.3], [0.38, 0.35], [0.7, 0.28], [1.2, 0.22], [1.9, 0.14]] : [[0.065, 0.3], [0.11, 0.22], [0.26, 0.24], [0.43, 0.18], [0.61, 0.12]];
  for (const [t0, a] of echoes) grain(d, r, sr, t0 + (r() - 0.5) * 0.02, a * 2.2, 0.006 + (far ? 0.015 : 0.008), far ? 0.1 : 0.16);
  let e = 0; for (let i = 0; i < n; i++) e += d[i] * d[i];
  const k = 1 / Math.sqrt(e || 1); for (let i = 0; i < n; i++) d[i] *= k; // unit energy: the wet gain alone sets the level
  return d;
}

// ---------- forward "bang": the first instant of a report, played forward on top of the reversed shot ----------
function synthBang(r, sr, cal) {
  const x = synthRifle(r, sr, cal), n = Math.floor(0.14 * sr), d = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / sr; d[i] = x[i] * (t < 0.004 ? 1 : Math.exp(-(t - 0.004) / (cal === 3 ? 0.03 : 0.016))); }
  return d;
}
// ---------- voices: screams, cries and groans (formant synthesis) ----------
// additive glottal source shaped by a vowel's formant envelope, with jitter, shimmer, period-doubling roughness
// and breath noise. Pain screams sit high (f0 300-500 Hz) with raised F1; groans are low and breathy.
const VOWELS = { aa: [[1020, 160, 1], [1480, 180, 0.45], [2800, 260, 0.1], [3500, 300, 0.05]], uh: [[620, 110, 1], [1050, 140, 0.55], [2500, 250, 0.25], [3400, 300, 0.12]], eh: [[950, 150, 1], [1750, 180, 0.5], [2700, 250, 0.1], [3600, 300, 0.05]] };
function synthVoice(r, sr, kind) {
  const P = {
    yelp: { dur: 0.45 + r() * 0.2, f0: [240, 480, 260], vowel: 'aa', rough: 0.25, breath: 0.12, bursts: 1 },
    scream: { dur: 1.2 + r() * 0.8, f0: [210, 370 + r() * 100, 200 + r() * 50], vowel: r() < 0.5 ? 'aa' : 'eh', rough: 0.45, breath: 0.18, bursts: 1 + Math.floor(r() * 2) },
    groan: { dur: 1.0 + r() * 0.6, f0: [120, 140, 95], vowel: 'uh', rough: 0.35, breath: 0.35, bursts: 2 },
    cry: { dur: 0.8 + r() * 0.4, f0: [220, 380, 240], vowel: 'eh', rough: 0.3, breath: 0.2, bursts: 2 },
    grunt: { dur: 0.22 + r() * 0.12, f0: [170, 210, 140], vowel: 'uh', rough: 0.5, breath: 0.3, bursts: 1 },
  }[kind];
  const n = Math.floor(P.dur * sr), d = new Float32Array(n), F = VOWELS[P.vowel].map(([f, b, a]) => [f * (kind === 'scream' || kind === 'yelp' ? 1.12 : 1), b, a]);
  const env = (f) => { let g = 0; for (const [fc, bw, a] of F) g += a / (1 + ((f - fc) / bw) ** 2); return g + 0.02; };
  // breath gaps between bursts
  const cuts = []; for (let b = 1; b < P.bursts; b++) cuts.push((b / P.bursts) * P.dur + (r() - 0.5) * 0.1);
  let ph = 0, jit = 0, shim = 1; const gk = new Float32Array(49);
  const br = fnoise(r, n, 'bp', F[0][0], 1.2, sr), br2 = fnoise(r, n, 'bp', F[1][0], 2, sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr, u = t / P.dur;
    if (i % 200 === 0) { jit += (r() - 0.5) * 0.06 - jit * 0.2; shim = 0.85 + r() * 0.3; }
    const f0c = u < 0.18 ? P.f0[0] + (P.f0[1] - P.f0[0]) * (u / 0.18) : P.f0[1] + (P.f0[2] - P.f0[1]) * ((u - 0.18) / 0.82);
    const f0 = f0c * (1 + jit + 0.025 * Math.sin(t * TAU2 * 6.5));
    ph += f0 / sr; if (ph > 2) ph -= 2; // two-period phase for subharmonics
    let v = 0;
    const K = Math.min(48, Math.floor(7500 / f0));
    if (i % 48 === 0) for (let k = 1; k <= K; k++) gk[k] = env(k * f0) / Math.pow(k, 0.35);
    for (let k = 1; k <= K; k++) v += Math.sin(TAU2 * k * ph) * gk[k];
    v += Math.sin(TAU2 * ph) * 0.12; // strong fundamental: screams are loud, pressed phonation
    v += P.rough * Math.sin(Math.PI * ph) * env(f0 * 0.5) * (0.5 + 0.5 * Math.sin(t * 40)); // period doubling: growl
    let a = Math.min(1, t / 0.035) * Math.min(1, (P.dur - t) / 0.12) * shim;
    for (const c of cuts) a *= 1 - Math.exp(-(((t - c) / 0.045) ** 2));
    d[i] = v * a * 0.22 + (br[i] * 0.8 + br2[i] * 0.5) * P.breath * a;
  }
  softclip(d, 1.4); fadeIn(d, sr, 0.003);
  return d;
}

// ---------- machine loops (seamless) ----------
// tonal parts are snapped to whole cycles of the loop; noise parts are cross-faded across the seam
function loopify(a, L, X) { const o = new Float32Array(L); o.set(a.subarray(0, L)); for (let i = 0; i < X; i++) { const w = i / X; o[i] = a[i] * w + a[L + i] * (1 - w); } return o; }
const snap = (f, sec) => Math.max(1, Math.round(f * sec)) / sec;
export const ENGINE = {
  // tracked amphibious IFV: turbo-diesel V8, firing frequency ~ rpm/60 * 4 (cruise ~2200 rpm)
  ifv: { sec: 3, fire: 46, exhaustLP: 240, knockF: 900, knock: 0.12, turbo: 2900, turboA: 0, rumble: 0.8, uneven: 0.35 },
  // tracks: link strikes as the track wraps the sprocket and idlers, plus intermittent squeal
  track: { sec: 2, rate: 26, clank: 0.22, squeal: 0.02, rumble: 0.6 },
  // LCAC: four gas turbines, two 4-blade ducted propellers, lift fans
  lcac: { sec: 3, prop: 21.5, blades: 4, turb: [1150, 5200, 7900], turbA: [0.08, 0.05, 0.03], roar: 1.0, fan: 310 },
  // UH-60 class: 4-blade main rotor at ~258 rpm, 4-blade tail rotor at ~1190 rpm, two T700 turboshafts
  uh60: { sec: 4, main: 4.3, mainBlades: 4, tail: 19.8, tailBlades: 4, slap: 1.0, whine: 6800, whineA: 0.004, slapLP: 450 },
  // attack helicopter: 5-blade main rotor ~240 rpm, 3-blade tail
  gunship: { sec: 4, main: 4.7, mainBlades: 5, tail: 19, tailBlades: 4, slap: 1.2, whine: 7400, whineA: 0.005, slapLP: 520 },
};
function synthEngine(r, sr, P) {
  const L = Math.floor(P.sec * sr), X = Math.floor(0.25 * sr), n = L + X, d = new Float32Array(n);
  const f = snap(P.fire, P.sec), per = sr / f, ex = fnoise(r, n, 'lp', P.exhaustLP, 0.7, sr), kn = fnoise(r, n, 'bp', P.knockF, 1.2, sr); filt(ex, 'hp', 70, 0.7, sr);
  const amps = [1, 1 - P.uneven * 0.5, 1 - P.uneven * 0.2, 1 - P.uneven];
  for (let i = 0; i < n; i++) {
    const ph = (i % per) / per, cyl = Math.floor(i / per) % 4, a = amps[cyl];
    const pulse = Math.exp(-ph * 6) * a;
    const load = 0.8 + 0.2 * Math.sin(TAU2 * i / sr / P.sec) + 0.1 * Math.sin(TAU2 * 3 * i / sr / P.sec);
    d[i] = load * ex[i] * (0.35 + pulse * 1.6) * P.rumble * 2 + kn[i] * Math.exp(-ph * 22) * a * P.knock * 2
      + Math.sin(TAU2 * snap(P.turbo, P.sec) * i / sr) * P.turboA + Math.sin(TAU2 * f * 3 * i / sr) * 0.08 * (0.6 + 0.4 * Math.sin(TAU2 * i / sr / P.sec * 2));
  }
  softclip(d, 1.2);
  return loopify(d, L, X);
}
function synthTrack(r, sr, P) {
  const L = Math.floor(P.sec * sr), X = Math.floor(0.2 * sr), n = L + X, d = new Float32Array(n);
  const rate = snap(P.rate, P.sec), per = 1 / rate, rb = fnoise(r, n, 'bp1', 180, 0.7, sr);
  for (let i = 0; i < n; i++) d[i] = rb[i] * P.rumble;
  for (let t = 0; t < n / sr; t += per) {
    const tt = t + (r() - 0.5) * per * 0.25, a = P.clank * (0.6 + r() * 0.6);
    ring(d, sr, tt, 380 + r() * 800, a * 0.5, 0.012 + r() * 0.02); ring(d, sr, tt, 1500 + r() * 1200, a * 0.15, 0.005);
    grain(d, r, sr, tt, a * 0.9, 0.005, 0.12);
  }
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr, sq = Math.max(0, Math.sin(TAU2 * t / P.sec * 2 + 1.3)) ** 3;
    ph += TAU2 * (1350 + Math.sin(t * 9) * 120) / sr; d[i] += Math.sin(ph) * sq * P.squeal;
  }
  softclip(d, 1.2);
  return loopify(d, L, X);
}
function synthLCAC(r, sr, P) {
  const L = Math.floor(P.sec * sr), X = Math.floor(0.25 * sr), n = L + X, d = new Float32Array(n);
  const bpf = snap(P.prop * P.blades, P.sec), roar = fnoise(r, n, 'lp', 2600, 0.6, sr), lo = fnoise(r, n, 'lp', 220, 0.7, sr), fan = fnoise(r, n, 'bp', P.fan, 3, sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr, bp = (t * bpf) % 1, chop = Math.exp(-bp * 6);
    let v = roar[i] * P.roar * 1.6 + lo[i] * (0.8 + chop * 1.4) * 1.4 + fan[i] * 0.5;
    for (let h = 1; h <= 4; h++) v += Math.sin(TAU2 * bpf * h * t) * 0.16 / h;
    P.turb.forEach((tf, k) => { v += Math.sin(TAU2 * snap(tf, P.sec) * t) * P.turbA[k]; });
    d[i] = v;
  }
  softclip(d, 1.1);
  return loopify(d, L, X);
}
function synthRotor(r, sr, P) {
  const L = Math.floor(P.sec * sr), X = Math.floor(0.2 * sr), n = L + X, d = new Float32Array(n);
  const bpf = snap(P.main * P.mainBlades, P.sec), tpf = snap(P.tail * P.tailBlades, P.sec);
  const slapN = fnoise(r, n, 'lp', P.slapLP || 600, 0.7, sr), wash = fnoise(r, n, 'lp', 500, 0.6, sr), hiss = fnoise(r, n, 'bp1', 1600, 0.7, sr); filt(slapN, 'hp', 60, 0.7, sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr, bp = (t * bpf) % 1, tp = (t * tpf) % 1;
    const blade = Math.exp(-bp * 14) * P.slap;           // advancing-blade slap
    let thump = 0; for (let h = 4; h <= 12; h++) thump += Math.sin(TAU2 * bpf * h * t + h * 1.3) * 0.08 * Math.exp(-(((h - 7) / 3) ** 2)); // rotor harmonics (≈50-200 Hz)
    const tail = Math.sin(TAU2 * tpf * t) * 0.1 + Math.sin(TAU2 * tpf * 2 * t) * 0.04;
    const gust = 1 + 0.25 * Math.sin(TAU2 * t / P.sec) + 0.15 * Math.sin(TAU2 * 3 * t / P.sec + 1);
    d[i] = (slapN[i] * blade * 2.4 + wash[i] * (0.3 + blade * 1.3) + thump + tail + hiss[i] * (0.04 + blade * 0.25)) * gust
      + Math.sin(TAU2 * snap(P.whine, P.sec) * t) * P.whineA;
  }
  softclip(d, 1.2);
  return loopify(d, L, X);
}
const ENGINE_POOLS = { ifv: 3, track: 3, lcac: 2, uh60: 2, gunship: 2 };
const ENGINE_REF = { ifv: [14, 0.55], track: [10, 0.5], lcac: [30, 0.9], uh60: [35, 0.9], gunship: [40, 0.95] };

// which recipe, how many variants, which distance bands
const RECIPES = {
  r0: { v: 3, bands: ['near', 'mid', 'far'], make: (r, sr) => synthRifle(r, sr, 0) },
  r1: { v: 3, bands: ['near', 'mid', 'far'], make: (r, sr) => synthRifle(r, sr, 1) },
  r2: { v: 3, bands: ['near', 'mid', 'far'], make: (r, sr) => synthRifle(r, sr, 2) },
  r3: { v: 2, bands: ['near', 'mid', 'far'], make: (r, sr) => synthRifle(r, sr, 3) },
  crack: { v: 4, bands: ['near'], make: synthCrack },
  iSand: { v: 3, bands: ['near'], make: (r, sr) => synthImpact(r, sr, 'iSand') },
  iWater: { v: 2, bands: ['near'], make: (r, sr) => synthImpact(r, sr, 'iWater') },
  iBody: { v: 2, bands: ['near'], make: (r, sr) => synthImpact(r, sr, 'iBody') },
  iHard: { v: 3, bands: ['near'], make: (r, sr) => synthImpact(r, sr, 'iHard') },
  wMortar: { v: 2, bands: ['near', 'mid'], make: (r, sr) => synthWhistle(r, sr, 'wMortar'), anchorEnd: true },
  wShell: { v: 2, bands: ['near', 'mid'], make: (r, sr) => synthWhistle(r, sr, 'wShell'), anchorEnd: true },
  thoonk: { v: 2, bands: ['far'], make: synthThoonk },
  missile: { v: 1, bands: ['near', 'mid', 'far'], make: synthMissile },
};
for (const c of [0, 1, 2, 3]) RECIPES['b' + c] = { v: 3, bands: ['near', 'mid', 'far'], make: (r, sr) => synthBang(r, sr, c), fwd: true, nobake: true };
for (const k of ['yelp', 'scream', 'groan', 'cry', 'grunt']) RECIPES['v' + k] = { v: k === 'scream' ? 5 : 3, bands: ['near', 'mid'], make: (r, sr) => synthVoice(r, sr, k) };
for (const k of Object.keys(BOOMS)) RECIPES[k] = { v: k === 'eMortar' || k === 'eShell' ? 3 : 2, bands: ['near', 'mid', 'far'], make: (r, sr) => synthBoom(r, sr, k) };
const BAND = { near: { lp: 16000, dry: 1, wet: 0.12, far: 0, level: 1 }, mid: { lp: 6500, dry: 0.7, wet: 0.4, far: 0, level: 0.9 }, far: { lp: 1300, lp2: 20000, shelf: 9, dry: 1, wet: 0.28, far: 1, level: 0.8 } };
// distance law per family: [reference distance, gain, audible range]
const FAMILY = {
  b: [11, 0.75, 450], v: [7, 0.9, 170],
  r: [11, 1.0, 450], crack: [3, 1.0, 9], i: [4, 0.6, 40], e: [32, 1.7, 1500], w: [18, 0.8, 180], thoonk: [60, 1.0, 900], missile: [25, 0.9, 600],
};
const fam = (kind) => (kind[0] === 'b' ? 'b' : kind[0] === 'v' ? 'v' : kind[0] === 'r' ? 'r' : kind[0] === 'i' ? 'i' : kind[0] === 'e' ? 'e' : kind[0] === 'w' ? 'w' : kind);

export class Audio {
  constructor() { this.ctx = null; this.voices = []; this.wv = []; this.enabled = false; this.sched = new Map(); this.lastTau = null; this.rate = 1; this.ready = false; }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.sr = ctx.sampleRate;
    this.master = ctx.createGain(); this.master.gain.value = 0.9;
    this.ears = ctx.createBiquadFilter(); this.ears.type = 'lowpass'; this.ears.frequency.value = 20000; this.ears.Q.value = 0.5;
    this.muffle = ctx.createBiquadFilter(); this.muffle.type = 'lowpass'; this.muffle.frequency.value = 18000;
    this.comp = ctx.createDynamicsCompressor(); this.comp.threshold.value = -16; this.comp.knee.value = 8; this.comp.ratio.value = 8; this.comp.attack.value = 0.001; this.comp.release.value = 0.25;
    this.master.connect(this.ears).connect(this.muffle).connect(this.comp).connect(ctx.destination);
    this.worldBus = ctx.createGain(); this.worldBus.connect(this.master);
    const r = mulberry32(99);
    // impulse responses (also used live for the player's forward gun)
    this.irNear = synthIR(mulberry32(41), this.sr, false); this.irFar = synthIR(mulberry32(42), this.sr, true);
    this.verb = ctx.createConvolver(); this.verb.normalize = false; this.verb.buffer = this.toBuf(this.irNear);
    this.verbGain = ctx.createGain(); this.verbGain.gain.value = 0.35; this.verb.connect(this.verbGain).connect(this.master);

    this.B = {};
    // the player's own guns, forward: M7 wears a suppressor (blast down, action and crack up), the bullpup doesn't
    this.B.player = [0, 1, 2].map((k) => this.toBuf(synthRifle(mulberry32(11 + k), this.sr, 1, { suppressed: true })));
    this.B.playerInv = [0, 1, 2].map((k) => this.toBuf(synthRifle(mulberry32(21 + k), this.sr, 0)));
    this.B.boom = this.toBuf(synthBoom(mulberry32(5), this.sr, 'eMortar'));
    this.B.ring = this.toBuf(this.makeTinnitus());
    this.B.whoosh = this.makeWhoosh(r);
    this.B.thump = this.makeThump();
    this.B.click = this.makeClick(r, 0.04);
    this.B.clunk = this.makeClick(r, 0.25);
    // weapon handling foley
    this.B.magOut = this.makeFoley(r, [[0, 0.5, 2400], [0.03, 0.3, 900]]);
    this.B.magIn = this.makeFoley(r, [[0, 0.9, 1600], [0.012, 0.6, 3800], [0.05, 0.3, 700]]);
    this.B.tug = this.makeFoley(r, [[0, 0.3, 1200]]);
    this.B.bolt = this.makeFoley(r, [[0, 1.0, 900], [0.004, 0.8, 4200], [0.03, 0.4, 300]]);
    this.B.rack = this.makeFoley(r, [[0, 0.7, 2000], [0.09, 1.0, 1000], [0.1, 0.6, 4000]]);
    this.B.drop = this.makeFoley(r, [[0, 0.5, 400], [0.06, 0.25, 600]]);
    this.B.brass = this.makeFoley(r, [[0, 0.25, 6500], [0.05, 0.12, 7200]]);
    this.R = { whoosh: this.rev(this.B.whoosh) };

    // world sounds: synthesize raw forward recipes now (usable immediately), bake reflections in the background
    this.W = {};
    this.bakeP = this.bakeAll();
    this.wilhelmId = -1; this.wilhelmArmed = false;
    this.loadWilhelm();

    this.eng = {};
    setTimeout(() => this.makeEngines(), 30);
    // loops
    this.loops = {};
    this.loops.hiss = this.loop(this.makeNoiseLoop(r, 'hiss'), 0.035);
    this.loops.sea = this.loop(this.rev(this.makeSea(r)), 0.25);
    this.loops.wind = this.loop(this.makeNoiseLoop(r, 'wind'), 0.12);
    this.loops.heli = this.loop(this.makeHeli(r), 0);
    this.loops.drone = this.loop(this.makeDroneBuzz(r), 0);
    this.loops.battle = this.loop(this.rev(this.makeBattleBed(r)), 0.22);
    this.loops.fire = this.loop(this.makeNoiseLoop(r, 'fire'), 0);
    this.enabled = true;
  }

  makeEngines() {
    const ctx = this.ctx;
    // positional machine voices (vehicle engines, tracks, rotors) — reversed loops on the world bus
    for (const [cls, k] of Object.entries(ENGINE_POOLS)) {
      const P = ENGINE[cls], rr = mulberry32(300 + cls.length * 17);
      const x = cls === 'track' ? synthTrack(rr, this.sr, P) : cls === 'lcac' ? synthLCAC(rr, this.sr, P) : cls === 'ifv' ? synthEngine(rr, this.sr, P) : synthRotor(rr, this.sr, P);
      const buf = this.rev(this.toBuf(x));
      this.eng[cls] = [];
      for (let j = 0; j < k; j++) {
        const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.loopStart = 0; src.loopEnd = buf.duration;
        const g = ctx.createGain(); g.gain.value = 0;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 8000; lp.Q.value = 0.5;
        const pn = ctx.createStereoPanner();
        src.connect(g).connect(lp).connect(pn).connect(this.worldBus);
        src.start(ctx.currentTime, (j * 0.37) % buf.duration);
        this.eng[cls].push({ src, g, lp, pn, id: -1 });
      }
    }
  }

  // one soldier per tape gets the Wilhelm scream (reversed, like everything else)
  async loadWilhelm() {
    try {
      const bin = atob(WILHELM_MP3), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const ab = await new Promise((res, rej) => { const p = this.ctx.decodeAudioData(u8.buffer, res, rej); if (p && p.then) p.then(res, rej); });
      const ch = ab.getChannelData(0), sr0 = ab.sampleRate;
      const n = Math.floor(ch.length * this.sr / sr0), x = new Float32Array(n);
      for (let i = 0; i < n; i++) { const f = i * sr0 / this.sr, k = Math.floor(f), t = f - k; x[i] = (ch[k] || 0) * (1 - t) + (ch[k + 1] || 0) * t; }
      let pk = 1e-6; for (const v of x) pk = Math.max(pk, Math.abs(v)); for (let i = 0; i < n; i++) x[i] *= 0.95 / pk;
      const mid = x.slice(); filt(mid, 'lp', 5000, 0.6, this.sr);
      this.W.vwilhelm = { near: [this.entry(x, 0)], mid: [this.entry(mid, 0)], fwd: false };
    } catch (e) { console.warn('wilhelm', e); }
  }

  toBuf(x) { const b = this.ctx.createBuffer(1, x.length, this.sr); b.getChannelData(0).set(x); return b; }
  rev(b) { const o = this.ctx.createBuffer(1, b.length, this.sr); const s = b.getChannelData(0), d = o.getChannelData(0); for (let i = 0; i < s.length; i++) d[i] = s[s.length - 1 - i]; return o; }
  // a playable world sound: reversed buffer, duration and the anchor (seconds into the FORWARD buffer where the event is)
  entry(x, a) { const fwd = this.toBuf(x); return { fwd, rev: this.rev(fwd), D: x.length / this.sr, a }; }

  async bakeAll() {
    const sr = this.sr, yieldUI = () => new Promise((res) => setTimeout(res, 0));
    // 1) synthesize every recipe (a little at a time so the game keeps its frame rate); usable dry right away
    for (const [kind, rc] of Object.entries(RECIPES)) {
      const vs = [];
      for (let v = 0; v < rc.v; v++) { vs.push(rc.make(mulberry32(1000 + v * 37 + kind.length * 101 + kind.charCodeAt(1) * 7), sr)); await yieldUI(); }
      const W = { raw: vs, fwd: !!rc.fwd };
      for (const b of rc.bands) W[b] = vs.map((x) => { let y = x; if (rc.nobake && b !== 'near') { y = x.slice(); filt(y, 'lp', BAND[b].lp * 0.8, 0.6, sr); filt(y, 'lp', BAND[b].lp, 0.6, sr); } return this.entry(y, rc.anchorEnd ? x.length / sr : 0); });
      this.W[kind] = W;
      await yieldUI();
    }
    this.ready = true;
    // 2) bake distance and reflections into each variant
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC) return;
    const render = (oc) => new Promise((res) => { const p = oc.startRendering(); if (p && p.then) p.then(res); else oc.oncomplete = (e) => res(e.renderedBuffer); });
    const bake = async (x, band) => {
      const ir = band.far ? this.irFar : this.irNear;
      const oc = new OAC(1, x.length + ir.length, sr);
      const src = oc.createBufferSource(); const b = oc.createBuffer(1, x.length, sr); b.getChannelData(0).set(x); src.buffer = b;
      const lp = oc.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = band.lp; lp.Q.value = 0.5;
      const lp2 = oc.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = band.lp2 || band.lp * 1.4; lp2.Q.value = 0.5;
      const sh = oc.createBiquadFilter(); sh.type = 'lowshelf'; sh.frequency.value = 220; sh.gain.value = band.shelf || 0;
      const dry = oc.createGain(); dry.gain.value = band.dry;
      const cv = oc.createConvolver(); cv.normalize = false; const ib = oc.createBuffer(1, ir.length, sr); ib.getChannelData(0).set(ir); cv.buffer = ib;
      const wet = oc.createGain(); wet.gain.value = band.wet;
      src.connect(lp).connect(lp2).connect(sh); sh.connect(dry).connect(oc.destination); sh.connect(cv).connect(wet).connect(oc.destination);
      src.start();
      const out = (await render(oc)).getChannelData(0);
      // trim the inaudible end, fade it so the reversed version swells in without a click
      let peak = 0; for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
      let end = out.length - 1; while (end > x.length && Math.abs(out[end]) < peak * 0.004) end--;
      const y = out.slice(0, end + 1), fl = Math.min(y.length, Math.floor(0.12 * sr));
      for (let i = 0; i < fl; i++) y[y.length - 1 - i] *= i / fl;
      // level-match to the dry recipe (distance loss is applied live), and keep peaks sane
      const k0 = (rms(x) * band.level) / rms(y.subarray(0, Math.min(y.length, x.length * 2)));
      let pk = 0; for (let i = 0; i < y.length; i++) pk = Math.max(pk, Math.abs(y[i]));
      const k = Math.min(k0, 1.1 / (pk || 1)); for (let i = 0; i < y.length; i++) y[i] *= k;
      return y;
    };
    try {
      for (const [kind, rc] of Object.entries(RECIPES)) {
        if (rc.nobake) continue;
        for (const bn of rc.bands) {
          const band = BAND[bn], list = [];
          for (const x of this.W[kind].raw) list.push(this.entry(await bake(x, band), rc.anchorEnd ? x.length / sr : 0));
          this.W[kind][bn] = list;
        }
        await yieldUI();
      }
      // the distant battle bed, rebuilt from the baked far sounds
      const bed = this.makeBattleBedBaked();
      const L = this.loops.battle, g = L.g.gain.value;
      try { L.src.stop(); } catch (e) { /* */ }
      this.loops.battle = this.loop(this.rev(this.toBuf(bed)), g);
    } catch (e) { console.warn('audio bake', e); }
  }

  makeTinnitus() {
    const sr = this.sr, n = Math.floor(3.5 * sr), d = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / sr; d[i] = (Math.sin(TAU2 * 3900 * t) + 0.35 * Math.sin(TAU2 * 5650 * t)) * Math.min(1, t / 0.08) * Math.exp(-t / 1.1) * 0.12; }
    return d;
  }

  // ---------- world scheduling ----------
  // tape bookkeeping: tape speed sets the pitch of everything already sounding (a real tape slowing down),
  // and a jump in tape time (checkpoint restore) drops everything scheduled.
  update(tau, rate, dt) {
    if (!this.enabled) return;
    const now = this.ctx.currentTime;
    if (this.lastTau !== null && Math.abs(tau - (this.lastTau - rate * dt)) > 0.3) this.resetWorld();
    this.lastTau = tau;
    const rr = Math.max(0.02, Math.min(3, rate));
    if (Math.abs(rr - this.rate) > 0.01) for (const v of this.wv) v.src.playbackRate.setTargetAtTime(rr, now, 0.04);
    this.rate = rr;
    this.worldBus.gain.setTargetAtTime(rate < 0.05 ? 0 : 1, now, 0.06);
    this.wv = this.wv.filter((v) => v.end > now);
    if ((this._prune = (this._prune || 0) + dt) > 1) { this._prune = 0; for (const [k, te] of this.sched) if (Math.abs(te - tau) > 12) this.sched.delete(k); }
  }
  resetWorld() {
    for (const v of this.wv) { try { v.src.stop(); } catch (e) { /* */ } }
    this.wv = []; this.sched.clear();
  }
  // machines: emitters = [{cls, id, x, y, z, load}] — nearest few per class get the voices
  engines(emitters, L) {
    if (!this.enabled) return;
    const now = this.ctx.currentTime;
    for (const [cls, pool] of Object.entries(this.eng)) {
      if (!pool.length) continue;
      const list = emitters.filter((e) => e.cls === cls);
      for (const e of list) e.d = Math.hypot(e.x - L.x, e.y - L.y, e.z - L.z);
      list.sort((a, b) => a.d - b.d); list.length = Math.min(list.length, pool.length);
      // keep voices attached to the same emitter where possible (no jumps in level)
      const free = pool.filter((v) => !list.some((e) => e.id === v.id));
      for (const e of list) if (!pool.some((v) => v.id === e.id)) { const v = free.shift(); if (v) v.id = e.id; }
      for (const v of pool) {
        const e = list.find((q) => q.id === v.id);
        if (!e) { v.g.gain.setTargetAtTime(0, now, 0.15); v.id = -1; continue; }
        const [ref, g0] = ENGINE_REF[cls], d = e.d;
        const dx = e.x - L.x, dz = e.z - L.z, behind = (dx * L.fx + dz * L.fz) < 0 ? 0.6 : 1;
        v.g.gain.setTargetAtTime(g0 * e.load * ref / (ref + d), now, 0.12);
        v.lp.frequency.setTargetAtTime(Math.max(300, 16000 * Math.exp(-d / 220) * behind), now, 0.12);
        v.pn.pan.setTargetAtTime(Math.max(-1, Math.min(1, (dx * L.rx + dz * L.rz) / (d + 3))) * 0.9, now, 0.1);
        v.src.playbackRate.setTargetAtTime(this.rate * (e.pitch || 1), now, 0.15);
      }
    }
  }

  // a world event at tape time te. Called every frame while the event is near; plays once.
  world(id, kind, te, x, y, z, gm, tau, L) {
    if (!this.ready || this.sched.has(id) || this.rate < 0.5) return;
    const dx = x - L.x, dy = y - L.y, dz = z - L.z, d = Math.hypot(dx, dy, dz);
    const [ref, g0, range] = FAMILY[fam(kind)];
    if (d > range) { this.sched.set(id, te); return; }
    const W = this.W[kind]; if (!W) return;
    const band = d < 35 && W.near ? 'near' : d < 140 && W.mid ? 'mid' : W.far ? 'far' : W.mid ? 'mid' : 'near';
    const list = W[band], e = list[id % list.length];
    const arrive = te + d / C_SOUND;
    // reversed: starts at arrive + (D - a) and ends on the event. forward ("bang"): starts on the event.
    const trigger = W.fwd ? arrive : arrive + (e.D - e.a);
    if (tau - trigger > 0.06 * this.rate) return; // not yet
    this.sched.set(id, te);
    const offset = Math.max(0, trigger - tau);
    if (offset >= e.D - 0.02) return; // already passed
    const g = g0 * gm * ref / (ref + d);
    if (g < 0.008) return;
    const now = this.ctx.currentTime, when = now + Math.max(0, tau - trigger) / this.rate;
    // voice budget: the quietest world voice makes room
    if (this.wv.length >= 56) {
      let mi = 0; for (let i = 1; i < this.wv.length; i++) if (this.wv[i].g < this.wv[mi].g) mi = i;
      if (this.wv[mi].g >= g) return;
      try { this.wv[mi].src.stop(); } catch (er) { /* */ } this.wv.splice(mi, 1);
    }
    const src = this.ctx.createBufferSource(); src.buffer = W.fwd ? e.fwd : e.rev; src.playbackRate.value = this.rate;
    const gn = this.ctx.createGain(); gn.gain.value = g;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.5;
    // air absorption + head shadow for sounds behind you
    const behind = (dx * L.fx + dz * L.fz) < 0 ? 0.55 : 1;
    lp.frequency.value = Math.max(400, 19000 * Math.exp(-d / 260) * behind);
    const pn = this.ctx.createStereoPanner(); pn.pan.value = Math.max(-1, Math.min(1, (dx * L.rx + dz * L.rz) / (d + 2))) * (d > 150 ? 0.6 : 0.95);
    src.connect(gn).connect(lp).connect(pn).connect(this.worldBus);
    src.start(when, offset);
    this.wv.push({ src, g, end: when + (e.D - offset) / this.rate });
    // a blast close enough to hurt your ears: ringing and a dulled world, starting at the moment of the blast
    if (kind[0] === 'e' && !W.fwd && d < 20 * Math.max(1, gm)) this.deafen(when + (e.D - e.a - offset) / this.rate, 1 - d / (20 * Math.max(1, gm)));
  }
  deafen(at, k) {
    const ears = this.ears.frequency;
    ears.cancelScheduledValues(at); ears.setValueAtTime(20000, at); ears.linearRampToValueAtTime(600 + 2400 * (1 - k), at + 0.04); ears.setTargetAtTime(20000, at + 0.3, 0.9 + k);
    const src = this.ctx.createBufferSource(); src.buffer = this.B.ring;
    const g = this.ctx.createGain(); g.gain.value = 0.3 + 0.9 * k; src.connect(g).connect(this.comp); src.start(at);
  }

  // the player's own shot: forward, close, with the beach answering back
  gun(side) {
    if (!this.enabled) return;
    const set = side === 0 ? this.B.player : this.B.playerInv, b = set[Math.floor(Math.random() * set.length)];
    const src = this.ctx.createBufferSource(); src.buffer = b; src.playbackRate.value = (side === 0 ? 1.0 : 0.98) + Math.random() * 0.04;
    const g = this.ctx.createGain(); g.gain.value = side === 0 ? 0.55 : 0.62;
    src.connect(g); g.connect(this.master); g.connect(this.verb);
    src.start();
  }

  // ---------- simple synthesis for foley and loops ----------
  buf(sec) { return this.ctx.createBuffer(1, Math.floor(sec * this.sr), this.sr); }
  makeFoley(r, hits) {
    const b = this.buf(0.25), d = b.getChannelData(0), sr = this.sr;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr; let v = 0;
      for (const [t0, amp, f] of hits) { const dt = t - t0; if (dt < 0) continue; v += amp * Math.exp(-dt / 0.012) * (Math.sin(2 * Math.PI * f * dt) * 0.6 + (r() * 2 - 1) * 0.5); }
      d[i] = v * 0.7;
    }
    return b;
  }
  makeWhoosh(r) {
    const b = this.buf(1.6), d = b.getChannelData(0), sr = this.sr;
    let lp = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr; const k = 0.01 + (t / 1.6) * 0.3;
      lp += ((r() * 2 - 1) - lp) * k;
      d[i] = lp * Math.sin(Math.PI * t / 1.6) * 1.4;
    }
    return b;
  }
  makeThump() {
    const b = this.buf(0.5), d = b.getChannelData(0), sr = this.sr;
    for (let i = 0; i < d.length; i++) { const t = i / sr; const beat = (tt) => tt > 0 ? Math.sin(2 * Math.PI * 50 * tt) * Math.exp(-tt / 0.06) : 0; d[i] = (beat(t) + 0.7 * beat(t - 0.22)) * 0.9; }
    return b;
  }
  makeClick(r, len) {
    const b = this.buf(len), d = b.getChannelData(0), sr = this.sr;
    for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = ((r() * 2 - 1) * Math.exp(-t / 0.004) + Math.sin(2 * Math.PI * 140 * t) * Math.exp(-t / (len * 0.3))) * 0.6; }
    return b;
  }
  makeNoiseLoop(r, kind) {
    const b = this.buf(4), d = b.getChannelData(0);
    let a = 0, c = 0;
    for (let i = 0; i < d.length; i++) {
      const n = r() * 2 - 1;
      if (kind === 'hiss') { a += (n - a) * 0.7; d[i] = (n - a) * 0.5; }
      else if (kind === 'wind') { a += (n - a) * 0.01; c = 0.6 + 0.4 * Math.sin(i / this.sr * 0.7 * Math.PI); d[i] = a * 6 * c; }
      else { a += (n - a) * 0.08; d[i] = a * (r() < 0.002 ? 6 : 1.4); }
    }
    return b;
  }
  makeSea(r) {
    const b = this.buf(9), d = b.getChannelData(0), sr = this.sr;
    let a = 0, c = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr, n = r() * 2 - 1;
      a += (n - a) * 0.04; c += (n - c) * 0.35;
      const lap = (tt) => (tt > 0 ? Math.exp(-tt / 0.5) * Math.min(1, tt / 0.06) : 0);
      const env = 0.25 + lap(t - 1.0) + 0.8 * lap(t - 3.7) + 0.9 * lap(t - 6.1) + 0.6 * lap(t - 8.0);
      d[i] = (a * 2.5 + c * 0.25) * env * 0.6;
    }
    return b;
  }
  makeHeli(r) {
    // UH-60 class: four-blade main rotor slap (~4.3 Hz rotor, ~17 Hz blade pass) over turbine whine
    const b = this.buf(2), d = b.getChannelData(0), sr = this.sr;
    let a = 0, ph = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr, n = r() * 2 - 1; a += (n - a) * 0.05;
      const blade = Math.pow(0.5 + 0.5 * Math.cos(2 * Math.PI * 17.5 * t), 10);
      ph += TAU2 * 1850 / sr;
      d[i] = (a * 3 * (0.25 + blade * 1.2) + Math.sin(2 * Math.PI * 17.5 * t) * 0.25 * blade + Math.sin(ph) * 0.03) * 0.8;
    }
    return b;
  }
  makeDroneBuzz(r) {
    const b = this.buf(1), d = b.getChannelData(0), sr = this.sr;
    let p1 = 0, p2 = 0;
    for (let i = 0; i < d.length; i++) {
      p1 += 2 * Math.PI * 190 / sr; p2 += 2 * Math.PI * 203 / sr;
      d[i] = (((p1 / Math.PI) % 2) - 1) * 0.25 + (((p2 / Math.PI) % 2) - 1) * 0.2 + (r() * 2 - 1) * 0.1;
    }
    return b;
  }
  makeBattleBed(r) {
    const b = this.buf(6), d = b.getChannelData(0), sr = this.sr;
    let a = 0;
    const pops = []; for (let k = 0; k < 90; k++) pops.push([r() * 6, 0.2 + r() * 0.8]);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr, n = r() * 2 - 1; a += (n - a) * 0.03;
      let v = a * 0.6;
      for (const [pt, amp] of pops) { const dt = t - pt; if (dt > 0 && dt < 0.25) v += a * 8 * amp * Math.exp(-dt / 0.05); }
      d[i] = v * 0.5;
    }
    return b;
  }
  // distant fighting beyond the arena: far-band rifles in bursts and the odd far boom (forward; reversed on use)
  makeBattleBedBaked() {
    const sr = this.sr, n = Math.floor(10 * sr), d = new Float32Array(n), r = mulberry32(77);
    const add = (e, t0, g) => { const x = e.fwd.getChannelData(0), i0 = Math.floor(t0 * sr); for (let k = 0; k < x.length; k++) d[(i0 + k) % n] += x[k] * g; };
    const rif = ['r0', 'r1', 'r2'];
    for (let burst = 0; burst < 70; burst++) {
      const k = rif[Math.floor(r() * 3)], list = this.W[k].far, t0 = r() * 10, cnt = 1 + Math.floor(r() * 6), g = 0.04 + r() * 0.12, gap = k === 'r2' ? 0.085 : 0.11 + r() * 0.2;
      for (let j = 0; j < cnt; j++) add(list[(burst + j) % list.length], t0 + j * gap, g);
    }
    for (let k = 0; k < 4; k++) add(this.W.eShell.far[k % 3], r() * 10, 0.12 + r() * 0.15);
    return d;
  }

  loop(buffer, gain, dest = this.master) {
    const src = this.ctx.createBufferSource(); src.buffer = buffer; src.loop = true;
    const g = this.ctx.createGain(); g.gain.value = gain;
    src.connect(g).connect(dest); src.start();
    return { src, g };
  }
  setLoop(name, gain, rate) {
    if (!this.enabled) return;
    const l = this.loops[name]; if (!l) return;
    l.g.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.08);
    if (rate) l.src.playbackRate.setTargetAtTime(rate, this.ctx.currentTime, 0.1);
  }

  // forward, non-positional (UI, foley, the player's own events)
  play(buffer, gain = 1, pan = 0, rate = 1) {
    if (!this.enabled || !buffer) return;
    const now = this.ctx.currentTime;
    this.voices = this.voices.filter((v) => v.end > now);
    if (this.voices.length > 20) { const v = this.voices.shift(); try { v.src.stop(); } catch (e) { /* */ } }
    const src = this.ctx.createBufferSource(); src.buffer = buffer; src.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = gain;
    const p = this.ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
    src.connect(g).connect(p).connect(this.master);
    src.start();
    this.voices.push({ src, end: now + buffer.duration / rate });
  }

  // the player's own blast (stepping on a mine): forward, and it takes your hearing with it
  at(kind, x, y, z, L, extra) {
    if (!this.enabled) return;
    if (kind === 'boom') { this.play(this.B.boom, 1.6 * (extra || 1)); this.deafen(this.ctx.currentTime + 0.005, 1); }
  }
}

// exported for offline rendering / tuning against reference recordings
export { synthBang, synthVoice, synthRifle, synthCrack, synthImpact, synthBoom, synthWhistle, synthThoonk, synthMissile, synthEngine, synthTrack, synthLCAC, synthRotor, synthIR, RIFLES, BOOMS };
