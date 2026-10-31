// Pure terrain functions (shared by the simulation and the renderer).
// Mayflower Beach, Dennis MA. +z = north (Cape Cod Bay), -z = inland (south). -x = east.
// Low tide at dawn: the waterline sits ~140m out across rippled tidal flats with pools and sandbars.
import { fbm, vnoise, smoothstep } from './rng.js';

export const WATERLINE_Z = 140;
export const ARENA = { x0: -125, x1: 125, z0: -138, z1: 132 };
export const LOT = { x0: -48, x1: 48, z0: -128, z1: -70, y: 3.6 };

export function crestD(x) {
  return 46 + (fbm(x * 0.009 + 11.3, 3.1, 3) - 0.5) * 12;
}

function flats(x, z) {
  // gentle slope seaward with long-shore sandbars and troughs (tide pools)
  let y = -0.04 + (WATERLINE_Z - z) * 0.0032;
  const bend = (fbm(x * 0.006, 2.2, 3) - 0.5) * 40;
  y += Math.sin((z + bend) * 0.075) * 0.13 * smoothstep(0, 30, z) * smoothstep(WATERLINE_Z + 10, WATERLINE_Z - 30, z);
  y += (fbm(x * 0.03 + 7, z * 0.03 - 3, 4) - 0.5) * 0.32;
  y += (vnoise(x * 0.9, z * 0.35) - 0.5) * 0.035; // ripple marks
  return y;
}

export function heightAt(x, z) {
  if (z > WATERLINE_Z + 20) {
    const f = flats(x, WATERLINE_Z + 20);
    return f - (z - WATERLINE_Z - 20) * 0.03;
  }
  if (z > 8) return flats(x, z);
  const d = -z; // > -8
  // blend from flats into the upper beach
  const fl = flats(x, 8);
  let y = fl + Math.max(0, d + 8) * 0.045;
  const c = crestD(x);
  const amp = 3.2 + 2.6 * fbm(x * 0.02 + 5.1, 9.2, 3);
  const g = (d - c) / (d < c ? 8 : 12);
  y += Math.exp(-g * g) * amp;
  const hum = smoothstep(c - 14, c - 4, d);
  y += (fbm(x * 0.07, z * 0.07, 3) - 0.5) * 1.8 * hum;
  // inland plateau
  const back = smoothstep(c + 4, c + 22, d);
  const plateau = LOT.y + (fbm(x * 0.012 + 40, z * 0.012 + 40, 4) - 0.5) * 4;
  y = y * (1 - back) + plateau * back;
  // parking lot graded flat
  const lotM = lotMask(x, z);
  y = y * (1 - lotM) + LOT.y * lotM;
  y += (vnoise(x * 0.5, z * 0.5) - 0.5) * 0.05 * (1 - hum) * (1 - lotM);
  return y;
}

export function lotMask(x, z) {
  const mx = smoothstep(LOT.x1 + 6, LOT.x1, Math.abs(x));
  const mz = smoothstep(LOT.z1 + 6, LOT.z1, z) * smoothstep(LOT.z0 - 6, LOT.z0, z);
  return mx * mz;
}
export function onLot(x, z) { return Math.abs(x) < LOT.x1 && z < LOT.z1 && z > LOT.z0; }

export function grassMask(x, z) {
  const d = -z;
  if (d < 20) return 0;
  if (onLot(x, z)) return 0;
  const c = crestD(x);
  const n = fbm(x * 0.05 + 3, z * 0.05 - 7, 3);
  const dune = smoothstep(c - 12, c - 4, d);
  const boardwalkGap = Math.abs(x - 2) < 3 ? 0 : 1;
  return Math.max(0, Math.min(1, dune * (0.35 + n * 1.1))) * boardwalkGap * (1 - lotMask(x, z));
}

export function inMinefield(x, z) {
  return x < ARENA.x0 || x > ARENA.x1 || z < ARENA.z0 || z > ARENA.z1;
}
