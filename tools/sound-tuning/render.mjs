// node render.mjs outdir  -> writes raw synth wavs at 48 kHz
import * as A from '/home/claude/backwash/src/audio.js';
import { mulberry32 } from '/home/claude/backwash/src/rng.js';
import fs from 'fs';
const out = process.argv[2] || '/home/claude/tune/out'; fs.mkdirSync(out, { recursive: true });
const sr = 48000;
function wav(name, x) {
  const n = x.length, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  let pk = 0; for (const v of x) pk = Math.max(pk, Math.abs(v)); const k = pk > 0.99 ? 0.99 / pk : 1;
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i] * k)) * 32767), 44 + i * 2);
  fs.writeFileSync(`${out}/${name}.wav`, b);
}
const pad = (x, sec = 0.3) => { const o = new Float32Array(x.length + Math.floor(sec * sr) * 2); o.set(x, Math.floor(sec * sr)); return o; };
for (let v = 0; v < 4; v++) {
  for (const c of [0, 1, 2, 3]) wav(`rifle${c}_${v}`, pad(A.synthRifle(mulberry32(1000 + v * 37 + c), sr, c)));
  for (const k of Object.keys(A.BOOMS)) wav(`${k}_${v}`, pad(A.synthBoom(mulberry32(2000 + v * 37), sr, k)));
  wav(`crack_${v}`, pad(A.synthCrack(mulberry32(3000 + v), sr)));
  wav(`iHard_${v}`, pad(A.synthImpact(mulberry32(3100 + v), sr, 'iHard')));
}
// MG bursts: 8-round bursts at the configured cyclic rate
const rpm = Number(process.env.MG_RPM || 700);
for (let v = 0; v < 4; v++) {
  const n = 8, gap = 60 / rpm, len = Math.floor((n * gap + 0.8) * sr), o = new Float32Array(len), r = mulberry32(5000 + v);
  for (let k = 0; k < n; k++) { const x = A.synthRifle(mulberry32(5100 + v * 10 + k), sr, 2), i0 = Math.floor((0.2 + k * gap * (0.97 + r() * 0.06)) * sr); for (let i = 0; i < x.length && i0 + i < len; i++) o[i0 + i] += x[i]; }
  wav(`mg_${v}`, o);
}
for (const cls of ['ifv', 'lcac', 'uh60', 'gunship', 'track']) {
  const P = A.ENGINE[cls], r = mulberry32(300);
  const x = cls === 'track' ? A.synthTrack(r, sr, P) : cls === 'lcac' ? A.synthLCAC(r, sr, P) : cls === 'ifv' ? A.synthEngine(r, sr, P) : A.synthRotor(r, sr, P);
  const o = new Float32Array(x.length * 4); for (let k = 0; k < 4; k++) o.set(x, k * x.length); wav(`${cls}`, o);
}
for (let v = 0; v < 4; v++) for (const k of ['scream', 'groan', 'yelp', 'cry']) wav(`v${k}_${v}`, A.synthVoice(mulberry32(70 + v * 13 + k.length), sr, k));
{ const r = mulberry32(300), e = A.synthEngine(r, sr, A.ENGINE.ifv), t = A.synthTrack(mulberry32(301), sr, A.ENGINE.track); const n = sr * 12, o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = e[i % e.length] * 0.55 + t[i % t.length] * 0.4; wav('tankmix', o); }
// impulse responses for the python side
wav('irNear', A.synthIR(mulberry32(41), sr, false)); wav('irFar', A.synthIR(mulberry32(42), sr, true));
console.log('ok');
