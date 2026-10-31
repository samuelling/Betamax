// node boom_one.mjs kind '{json}' outprefix nvariants
const [kind, js, pre, nv] = [process.argv[2], process.argv[3], process.argv[4], Number(process.argv[5] || 3)];
const over = JSON.parse(js);
globalThis.__BOOM_TUNE = (B) => Object.assign(B[kind], over);
const A = await import('/home/claude/backwash/src/audio.js?' + Date.now());
const { mulberry32 } = await import('/home/claude/backwash/src/rng.js');
const fs = await import('fs');
const sr = 48000;
for (let v = 0; v < nv; v++) {
  const x0 = A.synthBoom(mulberry32(2000 + v * 37), sr, kind), pad = Math.floor(0.3 * sr), x = new Float32Array(x0.length + pad * 2); x.set(x0, pad);
  const n = x.length, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  let pk = 0; for (const q of x) pk = Math.max(pk, Math.abs(q)); const k = 0.95 / pk;
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(x[i] * k * 32767), 44 + i * 2);
  fs.writeFileSync(`${pre}_${v}.wav`, b);
}
