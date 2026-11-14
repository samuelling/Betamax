// Character motion. Locomotion is built for a tape that plays in either direction: every pose is a pure function of
// tape time. Feet are planted on footprints taken from the recorded track (so they cannot skate), the pelvis rides a
// smoothed track with real mocap pelvis/shoulder rotation layered on, the head is stabilised on the line of sight and
// the rifle is carried by a separate posture layer (aim / low ready / carry) with recoil, inertia and reload paths.
// Deaths are precomputed particle ragdolls with joint limits, self collision and ground friction.
import * as THREE from 'three';
import { CLIPS } from './mocap.js';
import { gaitBlendFlat } from './gait.js';
import { J, NJ } from './rig.js';
import { heightFast as heightAt } from './terrain.js';

// mocap joint order: hips spine chest neck head shL elbL handL shR elbR handR hipL kneeL ankleL toeL hipR kneeR ankleR toeR
const MJ = { hips: 0, spine: 1, chest: 2, neck: 3, head: 4, shL: 5, shR: 8, hipL: 11, kneeL: 12, ankleL: 13, toeL: 14, hipR: 15, kneeR: 16, ankleR: 17, toeR: 18 };
const NM = 19, NM3 = NM * 3;
const NEED = [MJ.hips, MJ.spine, MJ.chest, MJ.neck, MJ.shL, MJ.shR, MJ.hipL, MJ.hipR];
export const STEP_C = 0.25;            // gait clock value (mod 1) at which the left foot is at mid-stance; the right is half a cycle on
const clip = {};
for (const k of Object.keys(CLIPS)) {
  const c = CLIPS[k]; const d = Float32Array.from(c.data), n = c.n;
  let m = 0; for (let f = 0; f < n; f++) m += d[f * NM3 + 1]; m /= n;
  // where in the clip the left foot passes under the hips: every clip is re-timed so that this lands on STEP_C
  let mid = STEP_C;
  if (c.loop !== false && c.stride > 0) for (let f = 0; f < n; f++) {
    const g = (f + 1) % n, z0 = d[f * NM3 + MJ.ankleL * 3 + 2] - d[f * NM3 + 2], z1 = d[g * NM3 + MJ.ankleL * 3 + 2] - d[g * NM3 + 2];
    if (z0 >= 0 && z1 < 0) mid = (f + z0 / (z0 - z1)) / n;
  }
  // mean heading of pelvis and chest (idles stand bladed in the capture; we add our own stance instead)
  let yp = 0, yc = 0;
  for (let f = 0; f < n; f++) {
    const o = f * NM3;
    yp += Math.atan2(-(d[o + MJ.hipL * 3 + 2] - d[o + MJ.hipR * 3 + 2]), d[o + MJ.hipL * 3] - d[o + MJ.hipR * 3]);
    yc += Math.atan2(-(d[o + MJ.shL * 3 + 2] - d[o + MJ.shR * 3 + 2]), d[o + MJ.shL * 3] - d[o + MJ.shR * 3]);
  }
  clip[k] = { n, d, hipsMean: m, dur: c.dur, mid, yawP: yp / n, yawC: yc / n };
}
const DEF_STYLE = { walk: 'walk', run: 'run', crouch: 'c_crouch_walk', limp: 'c_limp', idle: 'idle', idleOff: 0 };
const Mx = new Float64Array(NM3);
let _hm = 0, _yp = 0, _yc = 0;
function accClip(c, u, w) {
  const f = (((u % 1) + 1) % 1) * c.n; const i0 = Math.floor(f) % c.n, i1 = (i0 + 1) % c.n, t = f - Math.floor(f);
  const a = i0 * NM3, b = i1 * NM3, d = c.d;
  for (let q = 0; q < NEED.length; q++) {
    const k = NEED[q] * 3;
    Mx[k] += (d[a + k] + (d[b + k] - d[a + k]) * t) * w; Mx[k + 1] += (d[a + k + 1] + (d[b + k + 1] - d[a + k + 1]) * t) * w; Mx[k + 2] += (d[a + k + 2] + (d[b + k + 2] - d[a + k + 2]) * t) * w;
  }
  _hm += c.hipsMean * w; _yp += c.yawP * w; _yc += c.yawC * w;
}

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const t1 = V(), t2 = V();

export function ik(S, T, a, b, pole, outJ, outEnd) {
  const dir = t1.subVectors(T, S);
  let d = dir.length(); dir.divideScalar(d || 1);
  d = Math.min(Math.max(d, Math.abs(a - b) + 1e-3), a + b - 1e-3);
  const cosA = (a * a + d * d - b * b) / (2 * a * d);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const p = t2.copy(pole).addScaledVector(dir, -pole.dot(dir));
  if (p.lengthSq() < 1e-8) p.set(0, 0, 1); p.normalize();
  outJ.copy(S).addScaledVector(dir, a * cosA).addScaledVector(p, a * sinA);
  if (outEnd) outEnd.subVectors(T, outJ).normalize().multiplyScalar(b).add(outJ);
  return outJ;
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };

// ---- 3x3 bases as 9 numbers: columns X (left), Y (up), Z (forward) ----
const Rp = new Float64Array(9), Rc = new Float64Array(9), Rh = new Float64Array(9);
function setBasis(m, xx, xy, xz, yx, yy, yz) {
  let l = Math.hypot(yx, yy, yz) || 1; yx /= l; yy /= l; yz /= l;
  const d = xx * yx + xy * yy + xz * yz; xx -= yx * d; xy -= yy * d; xz -= yz * d;
  l = Math.hypot(xx, xy, xz); if (l < 1e-6) { xx = 1; xy = 0; xz = 0; l = 1; } xx /= l; xy /= l; xz /= l;
  m[0] = xx; m[1] = xy; m[2] = xz; m[3] = yx; m[4] = yy; m[5] = yz;
  m[6] = xy * yz - xz * yy; m[7] = xz * yx - xx * yz; m[8] = xx * yy - xy * yx;
}
function ident(m) { m[0] = 1; m[1] = 0; m[2] = 0; m[3] = 0; m[4] = 1; m[5] = 0; m[6] = 0; m[7] = 0; m[8] = 1; }
// rotations about the actor's own axes (applied to every column): yaw turns forward toward +x (left),
// pitch tips the top forward (+z), roll tips the top toward -x (right)
function wYaw(m, a) { const c = Math.cos(a), s = Math.sin(a); for (let k = 0; k < 9; k += 3) { const x = m[k], z = m[k + 2]; m[k] = x * c + z * s; m[k + 2] = -x * s + z * c; } }
function wPitch(m, a) { const c = Math.cos(a), s = Math.sin(a); for (let k = 0; k < 9; k += 3) { const y = m[k + 1], z = m[k + 2]; m[k + 1] = y * c - z * s; m[k + 2] = y * s + z * c; } }
function wRoll(m, a) { const c = Math.cos(a), s = Math.sin(a); for (let k = 0; k < 9; k += 3) { const x = m[k], y = m[k + 1]; m[k] = x * c - y * s; m[k + 1] = x * s + y * c; } }

const PL = new Float64Array(NJ * 3);   // the pose in actor-local space
// joint k = joint b + m * (x, y, z)
function put(k, b, m, x, y, z) {
  k *= 3; b *= 3;
  PL[k] = PL[b] + m[0] * x + m[3] * y + m[6] * z; PL[k + 1] = PL[b + 1] + m[1] * x + m[4] * y + m[7] * z; PL[k + 2] = PL[b + 2] + m[2] * x + m[5] * y + m[8] * z;
}
// two-bone IK on PL: root joint s, target (tx,ty,tz), lengths a,b, pole; writes mid joint jm and end joint je
function ikL(s, tx, ty, tz, a, b, px, py, pz, jm, je) {
  s *= 3; jm *= 3; je *= 3;
  const sx = PL[s], sy = PL[s + 1], sz = PL[s + 2];
  let dx = tx - sx, dy = ty - sy, dz = tz - sz, d = Math.hypot(dx, dy, dz) || 1e-6; dx /= d; dy /= d; dz /= d;
  d = Math.min(Math.max(d, Math.abs(a - b) + 1e-3), a + b - 1e-3);
  const cosA = (a * a + d * d - b * b) / (2 * a * d), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const pd = px * dx + py * dy + pz * dz; px -= dx * pd; py -= dy * pd; pz -= dz * pd;
  let pl = Math.hypot(px, py, pz); if (pl < 1e-4) { px = 0; py = 0; pz = 1; pl = 1; } px /= pl; py /= pl; pz /= pl;
  const mx = sx + dx * a * cosA + px * a * sinA, my = sy + dy * a * cosA + py * a * sinA, mz = sz + dz * a * cosA + pz * a * sinA;
  PL[jm] = mx; PL[jm + 1] = my; PL[jm + 2] = mz;
  let ex = tx - mx, ey = ty - my, ez = tz - mz; const el = Math.hypot(ex, ey, ez) || 1e-6;
  PL[je] = mx + ex / el * b; PL[je + 1] = my + ey / el * b; PL[je + 2] = mz + ez / el * b;
}

// ---- per-soldier variation: nobody in a squad moves like the man next to him ----
const hsh = (id, k) => ((((id + 1) * 2654435761) ^ (k * 40503 + 977)) >>> 0) / 4294967296;
export function variation(id) {
  const h = (k) => hsh(id, k + 20);
  return {
    stride: 0.93 + h(1) * 0.14,          // stride length scale (cadence follows)
    width: 0.9 + h(2) * 0.25,            // stance width
    bob: 0.8 + h(3) * 0.45, sway: 0.75 + h(4) * 0.6,
    hunch: -0.02 + h(5) * 0.09,          // habitual forward curl of the upper back
    blade: 0.75 + h(6) * 0.5,            // how far he turns his support side to the target
    carry: h(7) < 0.6 ? 1 : -1,          // sprint carry: muzzle up across the chest, or down
    alert: h(8) < 0.45 ? 0.55 + h(9) * 0.4 : h(9) * 0.15, // holds his sights up in cover, or rests at low ready
    breathHz: 0.21 + h(10) * 0.1, ph0: h(11) * 6.283, ph1: h(12) * 6.283, ph2: h(13) * 6.283, ph3: h(14) * 6.283,
    scan: 0.25 + h(15) * 0.45, scanHz: 0.5 + h(16) * 0.6, shiftHz: 0.09 + h(17) * 0.08,
    elbow: h(18), lift: 0.85 + h(19) * 0.35, clock: h(20), lean: 0.85 + h(21) * 0.35,
  };
}
const SD0 = variation(0);

// where a foot goes relative to the body centre when it is planted: wider and bladed (support foot forward,
// strong foot back and turned out) when standing with a rifle, narrow when moving. still = 1 standing .. 0 moving
export function stanceOffset(k, still, sd, o) {
  const s = k === 0 ? 1 : -1;
  o[0] = s * (0.085 + 0.055 * still) * sd.width;
  o[1] = still * (k === 0 ? 0.10 : -0.13);
  o[2] = s * 0.10 + (k === 0 ? 0.02 : -0.4) * still;   // toe-out (yaw)
  return o;
}
const SO = [0, 0, 0];
const FT = new Float64Array(16);
const FOOT = 0.1787, SOLE = 0.08, BALL = 0.13, HEEL = 0.07, ANK = 0.0, LEGMAX = 0.848;
let _ax = 0, _ay = 0, _az = 0, _Fx = 0, _Fy = 0, _Fz = 0;
// ankle position for a foot whose sole rests on ground point G (under the ankle when flat), heading yaw, pitched th
// (toe down positive). Pitching up from the neutral th0 rolls over the ball of the foot; pitching toe-up rocks on the heel.
function footPose(gx, gy, gz, yaw, th, th0) {
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const c0 = Math.cos(th0), s0 = Math.sin(th0), c = Math.cos(th), s = Math.sin(th);
  // F = forward*c - up*s ; U = up*c + forward*s   (in the foot's vertical plane: h = along heading, v = up)
  let h, v;
  if (th >= th0) { h = BALL * c0 - BALL * c + SOLE * s; v = -BALL * s0 + BALL * s + SOLE * c; }
  else { h = -HEEL * c0 + HEEL * c + SOLE * s; v = HEEL * s0 - HEEL * s + SOLE * c; }
  h -= SOLE * s0; v += SOLE - SOLE * c0;   // so that the neutral pose stands the ankle straight over G
  _ax = gx + fx * h; _ay = gy + v + ANK; _az = gz + fz * h;
  _Fx = fx * c; _Fy = -s; _Fz = fz * c;
}
const GN = [null, null, null, null, null, null], GW = [0, 0, 0, 0, 0, 0];
const LEGS = [[J.hipL, J.kneeL, J.ankleL, J.toeL, 1], [J.hipR, J.kneeR, J.ankleR, J.toeR, -1]];
const AN = new Float64Array(8);   // per foot: ankle xyz + pitch
const FD = new Float64Array(8);   // per foot: foot forward xyz, heading

/**
 * Compute a living pose in actor-local space (facing +z, left = +x, feet on y = 0), write world joints.
 * Required: p.speed, p.crouch, p.pitch, p.idleT. Everything else is optional (see Soldiers.motion):
 *  C (gait clock, cycles; falls back to p.u), cad (cycles/s), vx,vz / ax,az (local velocity / acceleration),
 *  bodyYaw (pelvis heading relative to the line of sight), offX/offY/offZ (body centre relative to the given root),
 *  ft + g (16 floats of local footprints [L now, L other, R now, R other] x (x,y,z,yaw) and their weight),
 *  gx,gz (ground gradient), eng (0..1 on the sights), kick/kickB/climb (recoil: weapon, torso, muzzle rise),
 *  yawErr/pitErr (weapon lag behind the line of sight), headYaw, sup + sdx,sdz (suppression and where it came from),
 *  flinch + fdx,fdz, stag (hit reactions), reload, exert, t, sd (variation()), lod (0 full .. 2 far), mode, side, st, hurt
 */
export function posePose(p, out, x, y, z, yaw) {
  const speed = p.speed || 0, sd = p.sd || SD0, lod = p.lod | 0, t = p.t !== undefined ? p.t : (p.idleSec !== undefined ? p.idleSec : p.idleT * 1.97);
  const wRun = smooth(2.3, 3.9, speed), wMove = smooth(0.12, 0.9, speed), still = 1 - wMove;
  const boat = p.mode === 1;
  const c = boat ? 1 : p.crouch;
  const kneel = boat ? 1 : smooth(0.55, 0.9, c) * still;
  const crouchMove = c * (1 - kneel);
  const C = p.C !== undefined ? p.C : (p.u || 0);
  const g = boat || !p.ft ? 0 : (p.g === undefined ? 1 : p.g);
  const vx = p.vx || 0, vz = p.vz !== undefined ? p.vz : speed, axl = p.ax || 0, azl = p.az || 0;
  const eng = p.eng !== undefined ? p.eng : 1 - wRun * 0.85;
  const kick = p.kick !== undefined ? p.kick : (p.recoil || 0), kickB = p.kickB || 0, climb = p.climb || 0;
  const sup = p.sup || 0, fl = p.flinch || 0, stag = p.stag || 0, fdx = p.fdx || 0, fdz = p.fdz || 0;
  const exert = p.exert || 0, bodyYaw = clamp(p.bodyYaw || 0, -1.1, 1.1);
  const aimW = boat ? 0.25 : clamp(Math.max(eng, sd.alert * kneel), 0, 1) * (1 - 0.55 * wRun);
  const rl = p.reload >= 0 ? p.reload : -1;
  const rlT = rl >= 0 ? smooth(0, 0.14, rl) * (1 - smooth(0.84, 1, rl)) : 0;

  // ---- mocap: pelvis and ribcage motion of this soldier's own gait, re-timed onto the step clock ----
  const st = p.st || DEF_STYLE;
  Mx.fill(0); _hm = 0; _yp = 0; _yc = 0;
  if (wMove > 0.001) {
    const nb = gaitBlendFlat(st, speed, c, !!p.hurt, GN, GW);
    for (let q = 0; q < nb; q++) { const cl = clip[GN[q]]; accClip(cl, C - STEP_C + cl.mid, GW[q] * wMove); }
  }
  let idleHY = 0;
  { const ic = clip[st.idle] || clip.idle; idleHY = ic.hipsMean; if (still > 0.001) accClip(ic, (t + st.idleOff) / ic.dur, still); else { _hm += 0; } }
  const baseHY = _hm;
  const hx0 = Mx[0], hy0 = Mx[1], hz0 = Mx[2];
  setBasis(Rp, Mx[MJ.hipL * 3] - Mx[MJ.hipR * 3], Mx[MJ.hipL * 3 + 1] - Mx[MJ.hipR * 3 + 1], Mx[MJ.hipL * 3 + 2] - Mx[MJ.hipR * 3 + 2], Mx[3] - hx0, Mx[4] - hy0, Mx[5] - hz0);
  setBasis(Rc, Mx[MJ.shL * 3] - Mx[MJ.shR * 3], Mx[MJ.shL * 3 + 1] - Mx[MJ.shR * 3 + 1], Mx[MJ.shL * 3 + 2] - Mx[MJ.shR * 3 + 2], Mx[MJ.neck * 3] - Mx[MJ.chest * 3], Mx[MJ.neck * 3 + 1] - Mx[MJ.chest * 3 + 1], Mx[MJ.neck * 3 + 2] - Mx[MJ.chest * 3 + 2]);

  // ---- slow life: breath, weight shifts, a wandering eye ----
  const breath = Math.sin(t * 6.2832 * (sd.breathHz + exert * 0.35) + sd.ph0);
  const brA = 0.35 + exert * 0.65;
  let shift = 0, scanY = 0, scanP = 0;
  if (lod < 2) {
    shift = (Math.sin(t * 6.2832 * sd.shiftHz + sd.ph1) + 0.5 * Math.sin(t * 6.2832 * sd.shiftHz * 2.3 + sd.ph2)) * still * (1 - kneel * 0.6);
    const a = t * sd.scanHz, sc = Math.sin(a + sd.ph2) * Math.sin(a * 0.37 + sd.ph3) + 0.35 * Math.sin(a * 0.23 + sd.ph1);
    const look = (1 - eng) * (1 - 0.6 * wRun) * (1 - rlT);
    scanY = clamp(sc * 1.6, -1, 1) * sd.scan * look; scanP = 0.07 * Math.sin(a * 0.61 + sd.ph0) * look;
  }

  // ---- lean: into the direction of travel, into acceleration, into the turn; a hit shoves the trunk along the bullet ----
  const lk = sd.lean;
  let leanF = clamp(vz * 0.026 * lk + azl * 0.028, -0.3, 0.34) + crouchMove * 0.33 + kneel * 0.08 + sd.hunch + sup * 0.26 + stag * 0.12;
  let leanS = clamp(vx * 0.022 * lk + axl * 0.03, -0.26, 0.26);   // toward +x
  leanF += fdz * fl * 0.2; leanS += fdx * fl * 0.2;
  if (sup > 0) { leanF += (p.sdz || 0) * sup * 0.08; leanS += (p.sdx || 0) * sup * 0.1; }
  const pit = p.pitch || 0;
  const blade = (1 - wRun) * (1 - 0.6 * wMove) * sd.blade * (boat ? 0.3 : 1);
  const twist = fl * (fdx * 0.5) * 0.35;   // a round in one shoulder spins him
  // undo the capture's own mean heading, then: body heading, stance, recoil
  wYaw(Rp, -_yp + bodyYaw - 0.2 * blade + twist * 0.4 - kickB * 0.012);
  wPitch(Rp, leanF * 0.4); wRoll(Rp, -leanS * 0.5);
  wYaw(Rc, -_yc + bodyYaw * 0.42 - 0.33 * blade + twist - kickB * 0.045 + scanY * 0.18 + (p.yawErr || 0) * 0.25);
  wPitch(Rc, leanF - pit * 0.35 - kickB * 0.035 - breath * 0.006 * brA + rlT * 0.06); wRoll(Rc, -leanS + aimW * 0.03);

  // ---- feet ----
  const Sn = 1.45 + 1.5 * wRun - 0.4 * smooth(0.4, 0.8, c) * (1 - wRun);
  const duty = clamp(0.8 / Sn, 0.26, 0.6);
  const tread = boat ? 0 : speed / Math.max(p.cad || speed / Sn, 0.35);
  const gxs = p.gx || 0, gzs = p.gz || 0;
  const thO = 0.62 + 0.3 * wRun, thS = 0.3 * (1 - 0.8 * wRun);
  const liftH = (0.045 + 0.3 * wRun + 0.03 * crouchMove) * sd.lift;
  for (let k = 0; k < 2; k++) {
    const ck = STEP_C + 0.5 * k, n = Math.floor(C - ck + 0.5), q = C - ck - n, sgn = k === 0 ? 1 : -1, o = k * 8;
    // footprints: recorded ones, or a treadmill when there is no track to plant on
    stanceOffset(k, still, sd, SO);
    const sgo = q >= 0 ? 1 - q : -1 - q;
    FT[o] = SO[0] + vx / (speed + 1e-3) * -q * tread; FT[o + 1] = 0; FT[o + 2] = SO[1] + (speed > 1e-3 ? vz / speed : 1) * -q * tread; FT[o + 3] = SO[2];
    FT[o + 4] = SO[0] + vx / (speed + 1e-3) * sgo * tread; FT[o + 5] = 0; FT[o + 6] = SO[1] + (speed > 1e-3 ? vz / speed : 1) * sgo * tread; FT[o + 7] = SO[2];
    if (g > 0) { const f = p.ft; for (let a = 0; a < 8; a++) FT[o + a] += (f[o + a] - FT[o + a]) * g; }
    // kneeling: the strong-side foot goes back onto its toes, knee to the ground; the support foot barely moves
    let knP = 0, knL = 0;
    if (kneel > 0) {
      const kx = k === 0 ? 0.03 : 0.0, kz = k === 0 ? 0.08 : -0.34, ky = k === 0 ? 0 : 0.4;
      for (let a = 0; a < 8; a += 4) {
        const yw = FT[o + a + 3], s = Math.sin(yw - SO[2]), cc = Math.cos(yw - SO[2]);
        FT[o + a] += (kx * cc + kz * s) * kneel; FT[o + a + 2] += (-kx * s + kz * cc) * kneel; FT[o + a + 3] += ky * kneel;
      }
      if (k === 1) { knP = 0.95 * kneel; knL = 4 * kneel * (1 - kneel) * 0.07; }
    }
    const Ax = FT[o], Ay = FT[o + 1], Az = FT[o + 2], Aw = FT[o + 3], Bx = FT[o + 4], By = FT[o + 5], Bz = FT[o + 6], Bw = FT[o + 7];
    const m = smooth(0.03, 0.3, Math.hypot(Bx - Ax, Bz - Az) + 0.25 * Math.abs(Bw - Aw) + 0.5 * Math.abs(By - Ay));
    const th0A = -Math.atan(clamp(gxs * Math.sin(Aw) + gzs * Math.cos(Aw), -0.5, 0.5));
    const r = q / duty;
    let ankx, anky, ankz, th, fwx, fwy, fwz, hd;
    if (r >= -0.5 && r <= 0.5) {
      th = th0A + knP;
      if (r < -0.32) { const u = (r + 0.5) / 0.18; th -= m * thS * (1 - u) * (1 - u); }
      else if (r > 0) { const u = r * 2; th += m * thO * u * u; }
      footPose(Ax, Ay, Az, Aw, th, th0A);
      ankx = _ax; anky = _ay + knL; ankz = _az; fwx = _Fx; fwy = _Fy; fwz = _Fz; hd = Aw;
    } else {
      // swing: from the toe-off pose on one footprint to the heel-strike pose on the next
      const th0B = -Math.atan(clamp(gxs * Math.sin(Bw) + gzs * Math.cos(Bw), -0.5, 0.5));
      let s, x0, y0, z0, x1, y1, z1, w0, w1, a0, a1;
      if (q > 0) {
        s = (q - duty * 0.5) / (1 - duty);
        a0 = th0A + knP + m * thO; footPose(Ax, Ay, Az, Aw, a0, th0A); x0 = _ax; y0 = _ay; z0 = _az; w0 = Aw;
        a1 = th0B + knP - m * thS; footPose(Bx, By, Bz, Bw, a1, th0B); x1 = _ax; y1 = _ay; z1 = _az; w1 = Bw;
      } else {
        s = 1 - (-q - duty * 0.5) / (1 - duty);
        a0 = th0B + knP + m * thO; footPose(Bx, By, Bz, Bw, a0, th0B); x0 = _ax; y0 = _ay; z0 = _az; w0 = Bw;
        a1 = th0A + knP - m * thS; footPose(Ax, Ay, Az, Aw, a1, th0A); x1 = _ax; y1 = _ay; z1 = _az; w1 = Aw;
      }
      s = clamp(s, 0, 1);
      const e = s * s * (3 - 2 * s), bump = Math.sin(Math.PI * Math.pow(s, 0.82));
      ankx = x0 + (x1 - x0) * e; ankz = z0 + (z1 - z0) * e; anky = y0 + (y1 - y0) * e + m * liftH * bump + knL;
      th = a0 + (a1 - a0) * e + m * (0.55 * wRun + 0.12) * Math.sin(Math.PI * s) * (1 - s);
      hd = w0 + (w1 - w0) * e;
      const cth = Math.cos(th); fwx = Math.sin(hd) * cth; fwy = -Math.sin(th); fwz = Math.cos(hd) * cth;
    }
    AN[k * 4] = ankx; AN[k * 4 + 1] = anky; AN[k * 4 + 2] = ankz; AN[k * 4 + 3] = th;
    FD[k * 4] = fwx; FD[k * 4 + 1] = fwy; FD[k * 4 + 2] = fwz; FD[k * 4 + 3] = hd;
  }

  // ---- pelvis: rides the smoothed track, sways and bobs with the capture, and never asks a leg to be longer than it is ----
  const hip = J.hips * 3;
  const hxl = hx0 * (1 - kneel) * sd.sway + (p.offX || 0) + shift * 0.022 + fdx * (fl * 0.05 + stag * 0.07) + clamp(axl, -6, 6) * 0.004;
  const hzl = hz0 * (1 - kneel) + (p.offZ || 0) - kneel * (boat ? 0.04 : 0.12) + fdz * (fl * 0.05 + stag * 0.07) - kickB * 0.012 + clamp(azl, -6, 6) * 0.004;
  const bob = (hy0 - baseHY) * (1 - kneel) * sd.bob;
  let hyl = 0.955 - crouchMove * 0.3 - kneel * 0.39 - sup * 0.07 * (1 - kneel) - stag * 0.05 + bob + (p.offY || 0);
  if (!boat) for (let k = 0; k < 2; k++) {
    const sgn = k === 0 ? 1 : -1, jx = hxl + Rp[0] * sgn * 0.095, jz = hzl + Rp[2] * sgn * 0.095;
    const hd2 = (AN[k * 4] - jx) * (AN[k * 4] - jx) + (AN[k * 4 + 2] - jz) * (AN[k * 4 + 2] - jz);
    const lim = AN[k * 4 + 1] + Math.sqrt(Math.max(LEGMAX * LEGMAX - hd2, 0.04)) + 0.05 - Rp[1] * sgn * 0.095;
    hyl = smin(hyl, lim, 0.05);
  }
  PL[hip] = hxl; PL[hip + 1] = hyl; PL[hip + 2] = hzl;
  put(J.spine, J.hips, Rp, 0, 0.13, 0.005);
  {
    let ux = Rp[3] + Rc[3], uy = Rp[4] + Rc[4], uz = Rp[5] + Rc[5]; const l = Math.hypot(ux, uy, uz) || 1;
    const s3 = J.spine * 3, c3 = J.chest * 3;
    PL[c3] = PL[s3] + ux / l * 0.23; PL[c3 + 1] = PL[s3 + 1] + uy / l * 0.23; PL[c3 + 2] = PL[s3 + 2] + uz / l * 0.23;
  }
  put(J.neck, J.chest, Rc, 0, 0.17, -0.01);
  const shr = 0.004 * breath * brA + sup * 0.022;   // shoulders rise with the breath, and hunch under fire
  put(J.shL, J.chest, Rc, 0.196, 0.12 + shr, -0.01 + aimW * 0.012);
  put(J.shR, J.chest, Rc, -0.196, 0.12 + shr + aimW * 0.012, -0.01 - kick * 0.012);
  put(J.hipL, J.hips, Rp, 0.095, -0.05, 0);
  put(J.hipR, J.hips, Rp, -0.095, -0.05, 0);

  // ---- legs ----
  for (let k = 0; k < 2; k++) {
    const L = LEGS[k], sgn = L[4], hd = FD[k * 4 + 3];
    let px = Math.sin(hd) * 0.55 + Rp[6] * 0.6 + Rp[0] * sgn * 0.14, py = 0.12, pz = Math.cos(hd) * 0.55 + Rp[8] * 0.6 + Rp[2] * sgn * 0.14;
    if (kneel > 0 && k === 1) { px += (0 - px) * kneel; py += (-1 - py) * kneel; pz += (0.3 - pz) * kneel; }
    ikL(L[0], AN[k * 4], AN[k * 4 + 1], AN[k * 4 + 2], 0.43, 0.43, px, py, pz, L[1], L[2]);
    const a3 = L[2] * 3, t3 = L[3] * 3;
    PL[t3] = PL[a3] + FD[k * 4] * FOOT; PL[t3 + 1] = PL[a3 + 1] + FD[k * 4 + 1] * FOOT; PL[t3 + 2] = PL[a3 + 2] + FD[k * 4 + 2] * FOOT;
  }

  // ---- rifle: three postures blended (on the sights / low ready / sprint carry), then lag, sway and recoil ----
  const bp = p.side === 1;
  const sh3 = J.shR * 3, ch3 = J.chest * 3;
  const wA = aimW, wC = boat ? 0 : wRun * (1 - wA) * (1 - rlT), wL = Math.max(0, 1 - wA - wC);
  const gw = wMove * (1 - 0.6 * wA);   // how much the stride gets into the weapon
  const wob = Math.sin(C * 12.566 - 0.9), wob2 = Math.sin(C * 6.2832 + 0.6);
  const ap = pit + (p.pitErr || 0) + kick * 0.035 + climb * 0.05 + breath * 0.004 * brA + gw * 0.02 * wob, ay = (p.yawErr || 0) + kick * 0.012 * (sd.elbow - 0.5) + gw * 0.014 * wob2;
  const adx = Math.sin(ay) * Math.cos(ap), ady = Math.sin(ap), adz = Math.cos(ay) * Math.cos(ap);
  // on the sights: butt in the shoulder pocket, bore along the line of sight
  const bx = PL[sh3] + Rc[0] * 0.06 + Rc[3] * -0.035 + Rc[6] * 0.07 - adx * kick * 0.028, by = PL[sh3 + 1] + Rc[1] * 0.06 + Rc[4] * -0.035 + Rc[7] * 0.07 - ady * kick * 0.028, bz = PL[sh3 + 2] + Rc[2] * 0.06 + Rc[5] * -0.035 + Rc[8] * 0.07 - adz * kick * 0.028;
  const gl = bp ? 0.27 : 0.3;
  // low ready: butt stays put, muzzle dropped and across
  const lx = 0.2, ly = -0.56, lz = 0.8;
  const ldx = Rc[0] * lx + Rc[3] * ly + Rc[6] * lz, ldy = Rc[1] * lx + Rc[4] * ly + Rc[7] * lz, ldz = Rc[2] * lx + Rc[5] * ly + Rc[8] * lz;
  // sprint carry: across the chest
  const cu = sd.carry > 0 ? 0.42 : -0.46;
  const cdx = Rc[0] * 0.6 + Rc[3] * cu + Rc[6] * 0.55, cdy = Rc[1] * 0.6 + Rc[4] * cu + Rc[7] * 0.55, cdz = Rc[2] * 0.6 + Rc[5] * cu + Rc[8] * 0.55;
  const ccy = sd.carry > 0 ? -0.13 : -0.06;
  const cgx = PL[ch3] + Rc[0] * -0.11 + Rc[3] * ccy + Rc[6] * 0.2, cgy = PL[ch3 + 1] + Rc[1] * -0.11 + Rc[4] * ccy + Rc[7] * 0.2, cgz = PL[ch3 + 2] + Rc[2] * -0.11 + Rc[5] * ccy + Rc[8] * 0.2;
  let dx = adx * wA + ldx * wL + cdx * wC, dy = ady * wA + ldy * wL + cdy * wC, dz = adz * wA + ldz * wL + cdz * wC;
  let gx = (bx + adx * gl) * wA + (bx + ldx * gl - Rc[3] * 0.03) * wL + cgx * wC, gy = (by + ady * gl) * wA + (by + ldy * gl - Rc[4] * 0.03) * wL + cgy * wC, gz = (bz + adz * gl) * wA + (bz + ldz * gl - Rc[5] * 0.03) * wL + cgz * wC;
  // the weapon has mass: it trails the body's acceleration and rides the stride a beat late
  gx -= clamp(axl, -8, 8) * 0.0035; gz -= clamp(azl, -8, 8) * 0.0035; gy -= gw * 0.012 * wob + (1 - wA) * breath * 0.003 * brA;
  if (lod === 0) { dx += 0.004 * Math.sin(t * 1.7 + sd.ph1) * (1 + exert); dy += 0.004 * Math.sin(t * 2.3 + sd.ph2) * (1 + exert); }
  // reload: weapon comes back into the workspace, canted, muzzle up
  if (rlT > 0) { dy += 0.5 * rlT; dx += 0.22 * rlT; gx += 0.03 * rlT; gy += 0.04 * rlT; gz -= 0.05 * rlT; }
  { const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l; }
  // support hand on the handguard — or working the magazine
  const sl = bp ? 0.19 : 0.23;
  let sx = gx + dx * sl, sy = gy + dy * sl - 0.028, sz = gz + dz * sl;
  let lookDown = 0;
  if (rl >= 0) {
    const k = rl, ph = (a, b) => smooth(a, b, k);
    const wo = bp ? -0.15 : 0.1;
    // magazine well: below the bore
    const wx = gx + dx * wo + dx * dy * 0.12, wy = gy + dy * wo - (1 - dy * dy) * 0.12, wz = gz + dz * wo + dz * dy * 0.12;
    // pouch on the front of the carrier, bolt release on the left of the receiver
    const px = PL[ch3] + Rc[0] * 0.07 + Rc[3] * -0.16 + Rc[6] * 0.19, py = PL[ch3 + 1] + Rc[1] * 0.07 + Rc[4] * -0.16 + Rc[7] * 0.19, pz = PL[ch3 + 2] + Rc[2] * 0.07 + Rc[5] * -0.16 + Rc[8] * 0.19;
    const qx = gx + dx * (bp ? -0.1 : 0.05) + Rc[0] * 0.05, qy = gy + dy * (bp ? -0.1 : 0.05) + Rc[1] * 0.05, qz = gz + dz * (bp ? -0.1 : 0.05) + Rc[2] * 0.05;
    let w = ph(0.03, 0.16); sx += (wx - sx) * w; sy += (wy - sy) * w; sz += (wz - sz) * w;
    // strip the magazine down and away, to the pouch, and back up into the well from below
    const dn = ph(0.16, 0.24) * (1 - ph(0.56, 0.66)); sy -= 0.07 * dn;
    w = ph(0.22, 0.4) * (1 - ph(0.46, 0.64)); sx += (px - sx) * w; sy += (py - sy) * w; sz += (pz - sz) * w;
    const arc = Math.sin(Math.PI * ph(0.2, 0.42)) * (1 - ph(0.42, 0.43)) + Math.sin(Math.PI * ph(0.46, 0.66)) * (1 - ph(0.66, 0.67));
    sx += Rc[0] * 0.05 * arc; sy += Rc[1] * 0.05 * arc; sz += Rc[2] * 0.05 * arc + 0.03 * arc;
    w = ph(0.72, 0.79) * (1 - ph(0.84, 0.95)); sx += (qx - sx) * w; sy += (qy - sy) * w; sz += (qz - sz) * w;
    lookDown = ph(0.08, 0.22) * (1 - ph(0.6, 0.78));
  }
  // never let go of the weapon: slide the hand back along it until the arm reaches
  { const l3 = J.shL * 3; for (let it = 0; it < 2; it++) { const d = Math.hypot(sx - PL[l3], sy - PL[l3 + 1], sz - PL[l3 + 2]); if (d > 0.525) { const b = Math.min(sl + 0.05, (d - 0.52) * 1.3); sx -= dx * b; sy -= dy * b; sz -= dz * b; } } }
  const g3 = J.grip * 3, m3 = J.muzzle * 3, ml = bp ? 0.5 : 0.72;
  PL[g3] = gx; PL[g3 + 1] = gy; PL[g3 + 2] = gz; PL[m3] = gx + dx * ml; PL[m3 + 1] = gy + dy * ml; PL[m3 + 2] = gz + dz * ml;
  const eo = 0.25 + sd.elbow * 0.3;
  ikL(J.shR, gx, gy, gz, 0.28, 0.26, -eo - 0.25 * wC, -1, -0.25, J.elbR, J.handR);
  ikL(J.shL, sx, sy, sz, 0.28, 0.26, eo + 0.15, -1, 0.05 - 0.2 * wC, J.elbL, J.handL);

  // ---- head: level, on the line of sight, a little ahead of the turn; down on the stock when on the sights ----
  ident(Rh);
  wRoll(Rh, aimW * 0.11 - leanS * 0.25 + fdx * fl * -0.15);
  wPitch(Rh, -pit * 0.8 + sup * 0.3 + leanF * 0.12 + scanP + lookDown * 0.5 + fdz * fl * 0.25 + aimW * 0.06 - kick * 0.02);
  wYaw(Rh, (p.headYaw || 0) + scanY + bodyYaw * 0.08 + lookDown * 0.15);
  {
    const n3 = J.neck * 3, h3 = J.head * 3;
    let ux = Rh[3] * 0.13 + Rh[6] * 0.012 + (Rc[3] - Rh[3]) * 0.045, uy = Rh[4] * 0.13 + Rh[7] * 0.012 + (Rc[4] - Rh[4]) * 0.045, uz = Rh[5] * 0.13 + Rh[8] * 0.012 + (Rc[5] - Rh[5]) * 0.045;
    // cheek to the stock: toward the strong shoulder, forward and down
    ux += aimW * (Rc[0] * -0.03 + Rc[6] * 0.03); uy += aimW * (Rc[1] * -0.03 + Rc[7] * 0.03) - sup * 0.02; uz += aimW * (Rc[2] * -0.03 + Rc[8] * 0.03);
    const l = 0.1306 / (Math.hypot(ux, uy, uz) || 1);
    PL[h3] = PL[n3] + ux * l; PL[h3 + 1] = PL[n3 + 1] + uy * l; PL[h3 + 2] = PL[n3 + 2] + uz * l;
  }

  // ---- to world ----
  const cy = Math.cos(yaw), sy2 = Math.sin(yaw);
  for (let k = 0; k < NJ * 3; k += 3) {
    const qx = PL[k], qz = PL[k + 2];
    out[k] = x + qx * cy + qz * sy2; out[k + 1] = y + PL[k + 1]; out[k + 2] = z - qx * sy2 + qz * cy;
  }
}
// the head's own frame from the last posePose call, as world axes (left, up, forward) — the bone frame built from
// joints alone cannot know which way the face is turned
export function lastHeadBasis(yaw, o) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  for (let k = 0; k < 9; k += 3) { o[k] = Rh[k] * cy + Rh[k + 2] * sy; o[k + 1] = Rh[k + 1]; o[k + 2] = -Rh[k] * sy + Rh[k + 2] * cy; }
  return o;
}

// ---------------- ragdoll ----------------
const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [2, 5], [2, 8], [5, 8], [5, 6], [6, 7], [8, 9], [9, 10], [0, 11], [0, 15], [11, 15], [11, 12], [12, 13], [13, 14], [15, 16], [16, 17], [17, 18], [19, 20]];
const STIFF = [[0, 2], [5, 11], [8, 15], [5, 15], [8, 11], [1, 5], [1, 8], [11, 1], [15, 1], [2, 11], [2, 15], [3, 5], [3, 8], [12, 14], [16, 18], [4, 2], [4, 5], [4, 8]];
const RAD = [0.12, 0.12, 0.13, 0.07, 0.11, 0.07, 0.05, 0.05, 0.07, 0.05, 0.05, 0.08, 0.06, 0.05, 0.04, 0.08, 0.06, 0.05, 0.04, 0.03, 0.03];

export function simulateRagdoll(start, prevStart, impulse, seed, frames = 75, groundFn = null, wallFn = null) {
  // start: Float32Array(NJ*3) pose at death; prevStart: pose 1/30s earlier (for momentum)
  const n = NJ, P = Float32Array.from(start), Q = new Float32Array(n * 3);
  const dt = 1 / 60;
  let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = 0; i < n * 3; i++) Q[i] = P[i] - (start[i] - prevStart[i]) * 0.5; // velocity * dt (30Hz -> 60Hz)
  for (let i = 0; i < n; i++) {
    const w = impulse.w[i] ?? impulse.wDefault;
    Q[i * 3] -= (impulse.x * w + (rnd() - 0.5) * impulse.jitter) * dt;
    Q[i * 3 + 1] -= (impulse.y * w + (rnd() - 0.2) * impulse.jitter * 0.5) * dt;
    Q[i * 3 + 2] -= (impulse.z * w + (rnd() - 0.5) * impulse.jitter) * dt;
  }
  // knees buckle
  for (const k of [12, 16]) { Q[k * 3] -= impulse.kx * dt; Q[k * 3 + 2] -= impulse.kz * dt; }
  const cons = [];
  const len = (a, b) => Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]);
  for (const [a, b] of BONES) cons.push([a, b, len(a, b), 1]);
  for (const [a, b] of STIFF) cons.push([a, b, len(a, b), 0.6]);
  const gripC = [10, 19, len(10, 19), 1];
  const out = new Float32Array(frames * n * 3);
  const G = new Float32Array(n);
  const steps = frames * 2;
  for (let st = 0; st < steps; st++) {
    // integrate
    for (let i = 0; i < n; i++) {
      for (let a = 0; a < 3; a++) {
        const k = i * 3 + a; const cur = P[k];
        let vel = (cur - Q[k]) * 0.993;
        P[k] = cur + vel + (a === 1 ? -9.8 * dt * dt : 0);
        Q[k] = cur;
      }
    }
    if (wallFn && st % 3 === 0) for (let i = 0; i < n; i++) {
      // bodies fold against walls, hulls and railings instead of passing through them
      const k = i * 3, r = wallFn(P[k], P[k + 2], P[k + 1] - RAD[i], RAD[i]);
      if (r[0] !== P[k] || r[1] !== P[k + 2]) { Q[k] += r[0] - P[k]; Q[k + 2] += r[1] - P[k + 2]; P[k] = r[0]; P[k + 2] = r[1]; Q[k] += (P[k] - Q[k]) * 0.5; Q[k + 2] += (P[k + 2] - Q[k + 2]) * 0.5; }
    }
    for (let i = 0; i < n; i++) G[i] = (groundFn ? groundFn(P[i * 3], P[i * 3 + 2], P[i * 3 + 1] - RAD[i]) : Math.max(heightAt(P[i * 3], P[i * 3 + 2]), -0.8)) + RAD[i];
    for (let it = 0; it < 6; it++) {
      const list = st < 10 ? cons.concat([gripC]) : cons;
      for (const [a, b, L, k] of list) {
        const ax = a * 3, bx = b * 3;
        const dx = P[bx] - P[ax], dy = P[bx + 1] - P[ax + 1], dz = P[bx + 2] - P[ax + 2];
        const d = Math.hypot(dx, dy, dz) || 1e-6;
        const diff = (d - L) / d * 0.5 * k;
        P[ax] += dx * diff; P[ax + 1] += dy * diff; P[ax + 2] += dz * diff;
        P[bx] -= dx * diff; P[bx + 1] -= dy * diff; P[bx + 2] -= dz * diff;
      }
      for (let i = 0; i < n; i++) {
        const k = i * 3; const g = G[i];
        if (P[k + 1] < g) {
          P[k + 1] = g;
          Q[k] += (P[k] - Q[k]) * 0.35; Q[k + 2] += (P[k + 2] - Q[k + 2]) * 0.35; // friction
          if (Q[k + 1] < g) Q[k + 1] = g + (Q[k + 1] - g) * 0.1;
        }
      }
    }
    if (st % 2 === 1) out.set(P, ((st - 1) / 2) * n * 3);
  }
  return out;
}
