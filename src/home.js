// The last tape, and the only one that plays forward: an ordinary afternoon at home. Chores, a garden, a cat in a
// patch of sun. At some point you're drawn to put on a tape and sit down; then the phone rings.
import { enhance } from './homelife.js';
import { story } from './homestory.js';
import * as THREE from 'three';
import { Post } from './post.js';
import { cultureSheet, buildHouse, furnish, buildYard, mk, col, std, B, RB, CY } from './homebuild.js';
import { WIND } from './garden.js';
import { pickHouse, HOUSES } from './housetypes.js';
import { mulberry32 } from './rng.js';

const T = THREE, TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------------ words
const TASKS = {
  us: { dishes: 'Do the dishes', read: 'Finish the book', game: 'Beat my high score', water: 'Water the garden', weed: 'Weed the beds', harvest: 'Pick the tomatoes', cook: 'Make chowder', laundry: 'Fold the laundry', type: 'Write to Gram', cat: 'Feed Quahog' },
  tx: { dishes: 'Dishes', read: 'Finish my book', game: 'Beat my high score', water: 'Water before it gets hot', weed: 'Pull the weeds', harvest: 'Pick tomatoes + peppers', cook: 'Make chili', laundry: 'Fold the laundry', type: 'Write Mamaw', cat: 'Feed Pepper' },
};
const TEMPLATES = [
  ['gardener', ['water', 'weed', 'harvest']], ['cook', ['harvest', 'cook', 'dishes']], ['reader', ['read', 'dishes', 'cat']], ['gamer', ['game', 'dishes', 'laundry']],
  ['putterer', ['laundry', 'cat', 'water']], ['writer', ['type', 'dishes', 'read']], ['tidy', ['laundry', 'dishes', 'weed']], ['homebody', ['cook', 'cat', 'read']],
];
function pickTemplate(ident, id) {
  const l = ident.life || '';
  if (/garden|harvest|Tomatoes/.test(l)) return TEMPLATES[0];
  if (/paperback|read/i.test(l)) return TEMPLATES[2];
  if (/Wrote|sister|first in the family/.test(l)) return TEMPLATES[5];
  if (/radios|carpenter|Fixed/.test(l)) return TEMPLATES[4];
  if (/bakery/.test(l)) return TEMPLATES[1];
  if (/chess/.test(l)) return TEMPLATES[3];
  return TEMPLATES[(id * 7 + 3) % TEMPLATES.length];
}
const BOOK = {
  us: [
    ['The tide goes out twice a day whether anyone watches or not. My father said that was the', 'whole trick to living near water: it does not need you. You learn its hours the way you learn a person’s handwriting, slowly, and then all at once.'],
    ['In August the flats behind the jetty open up for a mile. You can walk out to where the', 'channel bends and stand on sand that was sea at breakfast. The gulls follow you as if you might be bringing them something. You never are.'],
    ['He kept a notebook of the tides for forty years. When he died we found the last page', 'half filled in, the times written ahead, a week of mornings he had already counted on. I still have it. I check it sometimes. It is never wrong.'],
  ],
  tx: [
    ['The creek behind my grandmother’s place ran only after a storm, and then only for a day or two.', 'We would hear it from the porch at night, a sound like somebody talking low in the next room, and in the morning it would be gone and the rocks would be white again.'],
    ['She kept a coffee can of pecans by the door and cracked them in her lap while the radio', 'did the cattle prices. The shells went in the flower bed. She said the bluebonnets liked it. I never knew if that was true. They came up every April anyway.'],
    ['The last summer I stayed there the heat broke in September all at once, the way it does,', 'a norther coming down across the pasture like a door opening. She stood in the yard with her eyes shut and said, there. There it is. I think of that more than anything.'],
  ],
};
const LETTER = {
  us: 'Dear Gram,\n\nThe tomatoes came in early this year, too many to give away. The hydrangeas went blue like you said they would if I put the coffee grounds down. The cat sleeps in the window all afternoon.\n\nI think about the beach a lot lately. I don’t know why.\n\nLove,\n',
  tx: 'Dear Mamaw,\n\nIt has not rained in three weeks. I water the tomatoes before sunup and they still sulk by four o’clock. The peppers love it. Pepper (the cat, not the peppers) sleeps on the cool tile in the kitchen all day.\n\nI keep thinking about the coast. I don’t know why.\n\nLove you,\n',
};

// ------------------------------------------------------------------ audio bits (all synthesized, quietly)
class HomeAudio {
  constructor(A, us, amb = []) {
    this.A = A; this.ctx = A.ctx; this.us = us; this.ok = !!(A && A.ctx); this.amb = amb;
    if (!this.ok) return;
    const ctx = this.ctx;
    this.bus = ctx.createGain(); this.bus.gain.value = 0.9; this.bus.connect(A.master);
    this.out = ctx.createGain(); this.outLP = ctx.createBiquadFilter(); this.outLP.type = 'lowpass'; this.outLP.frequency.value = 18000;
    this.out.connect(this.outLP).connect(this.bus);
    this.r = mulberry32(us ? 77 : 78);
    const sr = ctx.sampleRate;
    // wind: a long loop of filtered noise
    { const n = sr * 6, b = ctx.createBuffer(2, n, sr); for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); let y = 0, y2 = 0; for (let i = 0; i < n; i++) { y += 0.02 * ((Math.random() * 2 - 1) - y); y2 += 0.3 * (y - y2); d[i] = y2 * 2.2 * (0.6 + 0.4 * Math.sin(i / n * TAU * 2 + c)); } }
      const s = ctx.createBufferSource(); s.buffer = b; s.loop = true; const g = ctx.createGain(); g.gain.value = 0.45; s.connect(g).connect(this.out); s.start(); this.wind = g; }
    this.loops = {};
    this.birdT = 1; this.farT = 12; this.tick = 0;
    // steady beds of sound some places have
    const bed = (fn, gain) => { const n = sr * 8, b = ctx.createBuffer(2, n, sr); for (let c = 0; c < 2; c++) fn(b.getChannelData(c), sr, mulberry32(c + 9)); const s2 = ctx.createBufferSource(); s2.buffer = b; s2.loop = true; const g = ctx.createGain(); g.gain.value = gain; s2.connect(g).connect(this.out); s2.start(); };
    if (amb.includes('surf')) bed((d, sr2, r) => { let y = 0, y2 = 0; for (let i = 0; i < d.length; i++) { const t = i / sr2, sw = Math.pow(0.5 + 0.5 * Math.sin(TAU * t / 8 - 1), 3); y += 0.08 * ((r() * 2 - 1) - y); y2 += 0.02 * ((r() * 2 - 1) - y2); d[i] = (y * 1.5 * (0.2 + sw) + y2 * 2) * 0.8; } }, 0.6);
    if (amb.includes('traffic')) bed((d, sr2, r) => { let y = 0; for (let i = 0; i < d.length; i++) { const t = i / sr2; y += 0.01 * ((r() * 2 - 1) - y); d[i] = y * 3 * (0.6 + 0.4 * Math.sin(TAU * t / 8)); } }, 0.5);
    if (amb.includes('lake')) bed((d, sr2, r) => { for (let i = 0; i < d.length; i++) d[i] = 0; for (let k = 0; k < 40; k++) { const i0 = Math.floor(r() * d.length); let y = 0; for (let i = 0; i < 6000 && i0 + i < d.length; i++) { y += 0.2 * ((r() * 2 - 1) - y); d[i0 + i] += y * Math.sin(Math.PI * i / 6000) * 0.4; } } }, 0.5);
    if (amb.includes('cicadas')) bed((d, sr2, r) => { // a tree full of cicadas: a pulsing high buzz that swells and fades
      let ph = 0, y = 0; for (let i = 0; i < d.length; i++) { const t = i / sr2, sw = Math.pow(0.5 + 0.5 * Math.sin(TAU * t / 8 - 1.2), 2); ph += TAU * (4700 + 300 * Math.sin(t * 0.9)) / sr2; y += 0.6 * ((r() * 2 - 1) - y);
        d[i] = (Math.sin(ph) * 0.5 + y * 0.5) * (0.55 + 0.45 * Math.pow(0.5 + 0.5 * Math.sin(TAU * 62 * t), 4)) * (0.15 + 0.85 * sw) * 0.09; } }, 0.55);
    if (amb.includes('wind') && this.wind) this.wind.gain.value = 0.9;
    if (amb.includes('bees')) bed((d, sr2) => { let ph = 0; for (let i = 0; i < d.length; i++) { const t = i / sr2; ph += TAU * (210 + 8 * Math.sin(t * 3)) / sr2; d[i] = (((ph / TAU) % 1) - 0.5) * 0.05 * (0.6 + 0.4 * Math.sin(t * 0.7)); } }, 0.35);
  }
  setInside(k) { if (this.ok) this.outLP.frequency.setTargetAtTime(k ? 1400 : 18000, this.ctx.currentTime, 0.3); }
  env(x, d, sr) { return x; }
  play(fn, dur, gain = 1, pan = 0, dest) {
    if (!this.ok) return;
    const ctx = this.ctx, sr = ctx.sampleRate, n = Math.max(1, Math.floor(dur * sr)), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
    fn(d, sr, this.r);
    const s = ctx.createBufferSource(); s.buffer = b; const g = ctx.createGain(); g.gain.value = gain; const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1);
    s.connect(g).connect(p).connect(dest || this.bus); s.start(); return s;
  }
  loop(name, on, make, gain = 1) {
    if (!this.ok) return;
    const L = this.loops[name];
    if (on && !L) {
      const ctx = this.ctx, sr = ctx.sampleRate, n = Math.floor(sr * 2), b = ctx.createBuffer(1, n, sr); make(b.getChannelData(0), sr, this.r);
      const s = ctx.createBufferSource(); s.buffer = b; s.loop = true; const g = ctx.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(gain, ctx.currentTime, 0.08);
      s.connect(g).connect(this.bus); s.start(); this.loops[name] = { s, g };
    } else if (!on && L) { L.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1); L.s.stop(this.ctx.currentTime + 0.5); delete this.loops[name]; }
  }
  // a bird somewhere outside
  bird(pan, far) {
    const us = this.us, r = this.r, kind = Math.floor(r() * 3);
    this.play((d, sr) => {
      let t0 = 0; const notes = kind === 0 ? 3 + Math.floor(r() * 3) : kind === 1 ? 1 : 6 + Math.floor(r() * 6);
      for (let k = 0; k < notes; k++) {
        const f0 = (us ? [2600, 3800, 4400] : [3200, 4200, 5200])[kind] * (0.9 + r() * 0.2), f1 = f0 * (kind === 0 ? 1.25 : kind === 1 ? 0.55 : 0.92), L = kind === 2 ? 0.05 : 0.11 + r() * 0.08;
        const i0 = Math.floor(t0 * sr), n = Math.floor(L * sr); let ph = 0;
        for (let i = 0; i < n && i0 + i < d.length; i++) { const u = i / n, f = f0 + (f1 - f0) * u; ph += TAU * f / sr; d[i0 + i] += Math.sin(ph + 0.6 * Math.sin(ph * 0.5)) * Math.sin(Math.PI * u) * 0.35; }
        t0 += L + (kind === 2 ? 0.025 : 0.06 + r() * 0.08);
      }
    }, 2.2, (far ? 0.18 : 0.4) * (0.6 + this.r() * 0.6), pan, this.out);
  }
  farOne() {
    const pool = this.amb.filter((k) => !['surf', 'traffic', 'lake', 'bees'].includes(k)); if (!pool.length) return this.far();
    const k = pool[Math.floor(this.r() * pool.length)], r = this.r, P = (r() - 0.5) * 1.6;
    const voice = (d, sr, f0, f1, L, form, amp = 0.3, vib = 0) => { let ph = 0; const n = Math.min(d.length, Math.floor(L * sr)); for (let i = 0; i < n; i++) { const u = i / n, f = f0 + (f1 - f0) * u + Math.sin(i / sr * 30) * vib; ph += TAU * f / sr; let v = 0; for (let h = 1; h < 8; h++) v += Math.sin(ph * h) / h * Math.exp(-Math.pow((f * h - form) / 500, 2)); d[i] += v * amp * Math.sin(Math.PI * u); } };
    if (k === 'mower' || k === 'train') return this.far(k);
    if (k === 'pumpjack' || k === 'wind') return this.play((d, sr) => { for (let c = 0; c < 2; c++) { const i0 = Math.floor(c * 2.6 * sr); voice(d.subarray(i0), sr, 300 + r() * 60, 240, 0.7, 700, 0.18, 12); } }, 5.5, 0.18, P, this.out);
    if (k === 'gulls') this.play((d, sr) => { let t0 = 0; for (let c = 0; c < 3 + Math.floor(r() * 3); c++) { const i0 = Math.floor(t0 * sr), sub = d.subarray(i0); voice(sub, sr, 1500, 900 + r() * 300, 0.35, 1800, 0.25); t0 += 0.4 + r() * 0.3; } }, 2.5, 0.35, P, this.out);
    if (k === 'dogs') this.play((d, sr) => { let t0 = 0; for (let c = 0; c < 2 + Math.floor(r() * 3); c++) { const i0 = Math.floor(t0 * sr); voice(d.subarray(i0), sr, 420, 300, 0.16, 900, 0.5); t0 += 0.35 + r() * 0.3; } }, 2.0, 0.3, P, this.out);
    if (k === 'cows') this.play((d, sr) => voice(d, sr, 140, 105, 1.6, 600, 0.6), 1.8, 0.35, P, this.out);
    if (k === 'rooster') this.play((d, sr) => { const parts = [[600, 700, 0.18], [700, 900, 0.22], [900, 950, 0.45], [950, 600, 0.6]]; let t0 = 0; for (const [a, b, L] of parts) { voice(d.subarray(Math.floor(t0 * sr)), sr, a, b, L, 1600, 0.35); t0 += L + 0.02; } }, 1.8, 0.3, P, this.out);
    if (k === 'loons') this.play((d, sr) => { voice(d, sr, 600, 880, 1.2, 900, 0.4, 6); voice(d.subarray(Math.floor(1.3 * sr)), sr, 880, 820, 1.4, 900, 0.4, 8); }, 3.0, 0.3, P, this.out);
    if (k === 'church') this.play((d, sr) => { for (let s2 = 0; s2 < 4; s2++) { const i0 = Math.floor(s2 * 1.6 * sr), f = [392, 330, 294, 262][s2 % 4]; for (let i = 0; i + i0 < d.length; i++) { const t = i / sr; d[i0 + i] += (Math.sin(TAU * f * t) + 0.6 * Math.sin(TAU * f * 2.4 * t) + 0.4 * Math.sin(TAU * f * 3.0 * t) + 0.3 * Math.sin(TAU * f * 0.5 * t)) * Math.exp(-t / 2.2) * 0.2; } } }, 8.0, 0.3, P, this.out);
    if (k === 'trolley') this.play((d, sr) => { let ph = 0; for (let i = 0; i < d.length; i++) { const t = i / sr, env = Math.sin(Math.PI * t / 7); ph += TAU * (110 + 40 * Math.sin(t * 0.5)) / sr; d[i] = (Math.sin(ph) * 0.15 + (t > 2 && t < 2.4 ? Math.sin(TAU * 1800 * t) * Math.exp(-(t - 2) * 8) * 0.3 : 0)) * env; } }, 7, 0.4, P, this.out);
    if (k === 'kids') this.play((d, sr) => { let t0 = 0; for (let c = 0; c < 4; c++) { voice(d.subarray(Math.floor(t0 * sr)), sr, 420 + r() * 200, 380 + r() * 200, 0.25 + r() * 0.3, 1200, 0.25); t0 += 0.3 + r() * 0.5; } }, 3.0, 0.2, P, this.out);
  }
  far(kind) { // a mower down the street / a suburban train across the fields
    if (kind === 'mower' || (!kind && this.us)) this.play((d, sr, r) => { let ph = 0, y = 0; for (let i = 0; i < d.length; i++) { const t = i / sr, env = Math.sin(Math.PI * t / 9); ph += TAU * (88 + 6 * Math.sin(t * 0.7)) / sr; y += 0.05 * ((r() * 2 - 1) - y); d[i] = ((ph % TAU) / TAU - 0.5 + y * 2) * env * 0.12; } }, 9, 0.5, 0.6, this.out);
    else this.play((d, sr, r) => { let y = 0; for (let i = 0; i < d.length; i++) { const t = i / sr, env = Math.sin(Math.PI * t / 10); y += 0.01 * ((r() * 2 - 1) - y); const horn = t > 2 && t < 3.6 ? (Math.sin(TAU * 311 * t) + 0.6 * Math.sin(TAU * 370 * t)) * 0.05 * Math.sin(Math.PI * (t - 2) / 1.6) : 0; d[i] = (y * 5 * (1 + 0.5 * Math.sin(t * 9)) + horn) * env * 0.3; } }, 10, 0.45, -0.5, this.out);
  }
  update(dt, inside) {
    if (!this.ok) return;
    this.birdT -= dt; if (this.birdT < 0) { this.birdT = 0.8 + this.r() * 3.5; this.bird(this.r() * 2 - 1, this.r() < 0.4); }
    this.farT -= dt; if (this.farT < 0) { this.farT = 18 + this.r() * 35; this.farOne(); }
    this.setInside(inside);
  }
  // one-shots
  click(g = 0.5, f = 2400) { this.play((d, sr, r) => { for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = ((r() * 2 - 1) * Math.exp(-t / 0.003) + Math.sin(TAU * f * t) * Math.exp(-t / 0.02) * 0.4); } }, 0.08, g); }
  thud(g = 0.6, f = 110) { this.play((d, sr, r) => { for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = Math.sin(TAU * f * t * (1 - t * 2)) * Math.exp(-t / 0.05) + (r() * 2 - 1) * Math.exp(-t / 0.008) * 0.4; } }, 0.25, g); }
  clink(g = 0.4) { this.play((d, sr, r) => { const fs = [2200 + r() * 600, 3700 + r() * 500, 5300]; for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = fs.reduce((a, f, k) => a + Math.sin(TAU * f * t) * Math.exp(-t / (0.12 - k * 0.03)) / (k + 1), 0) * 0.5; } }, 0.4, g); }
  swish(g = 0.4, L = 0.3, f = 3000) { this.play((d, sr, r) => { let y = 0; for (let i = 0; i < d.length; i++) { const u = i / d.length; y += (f / sr) * ((r() * 2 - 1) - y); d[i] = y * Math.sin(Math.PI * u) * 3; } }, L, g); }
  bell(g = 0.4) { this.play((d, sr) => { for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = (Math.sin(TAU * 2100 * t) + 0.5 * Math.sin(TAU * 5400 * t)) * Math.exp(-t / 0.5) * 0.4; } }, 1.2, g); }
  beep(f, L = 0.06, g = 0.25) { this.play((d, sr) => { for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = (Math.sin(TAU * f * t) > 0 ? 0.3 : -0.3) * Math.min(1, (L - t) / 0.01); } }, L, g); }
  step(inside) { this.play((d, sr, r) => { let y = 0; for (let i = 0; i < d.length; i++) { const t = i / sr; y += (inside ? 0.05 : 0.3) * ((r() * 2 - 1) - y); d[i] = (inside ? Math.sin(TAU * 90 * t) * Math.exp(-t / 0.03) * 0.6 : 0) + y * Math.exp(-t / (inside ? 0.02 : 0.06)) * (inside ? 1 : 2); } }, 0.18, inside ? 0.14 : 0.08, (this.r() - 0.5) * 0.3); }
  ring() { // a mechanical telephone bell: two gongs struck ~20 times a second
    const us = this.us;
    this.play((d, sr) => { for (let i = 0; i < d.length; i++) { const t = i / sr, on = us ? (t < 2) : (t < 1); const strike = Math.pow(0.5 + 0.5 * Math.sin(TAU * 20 * t), 6); d[i] = on ? (Math.sin(TAU * 1080 * t) + 0.7 * Math.sin(TAU * 1340 * t) + 0.3 * Math.sin(TAU * 2900 * t)) * (0.35 + 0.65 * strike) * 0.3 : 0; } }, us ? 2.2 : 1.2, 0.7, -0.3);
  }
  // the story's sounds
  chord(g = 0.22) { this.play((d, sr) => { const fs = [220, 277.2, 329.6, 440]; for (let i = 0; i < d.length; i++) { const t = i / sr, e = Math.min(1, t / 0.8) * Math.exp(-Math.max(0, t - 0.8) / 1.6); d[i] = fs.reduce((a, f, k) => a + Math.sin(TAU * f * t + k) * (k === 3 ? 0.3 : 0.5), 0) * e * 0.3; } }, 4.5, g); }
  hum(g = 0.2) { this.play((d, sr) => { const mel = [392, 440, 392, 349, 330, 349, 392, 0, 392, 523, 494, 440, 392]; let ph = 0; for (let i = 0; i < d.length; i++) { const t = i / sr, n = Math.floor(t / 0.42), f = mel[n % mel.length], u = (t / 0.42) % 1; if (!f) continue; ph += TAU * f * (1 + 0.012 * Math.sin(t * 34) + (Math.sin(n * 7.1) * 0.025)) / sr; const v = Math.sin(ph) + 0.5 * Math.sin(2 * ph) + 0.25 * Math.sin(3 * ph); d[i] = v * Math.sin(Math.PI * u) * 0.25; } }, 5.5, g); }
  talk(dur, g, rate = 1) { this.play((d, sr, r) => { let ph = 0, y = 0, y2 = 0, lo = 0; const syl = 4.3 * rate; for (let i = 0; i < d.length; i++) { const t = i / sr, s = Math.floor(t * syl), u = (t * syl) % 1, gap = Math.sin(s * 12.9898) > 0.75 ? 0 : 1, f0 = 118 + 20 * Math.sin(s * 3.1) + 10 * Math.sin(t * 2);
      ph += TAU * f0 / sr; const src = ((ph / TAU) % 1) - 0.5 + (r() - 0.5) * 0.4; y += 0.25 * (src - y); y2 += 0.04 * (y - y2); lo += 0.6 * (((r() * 2 - 1) * 0.04) - lo); d[i] = ((y - y2) * 2.2 * Math.pow(Math.sin(Math.PI * u), 0.6) * gap + lo) * Math.min(1, t * 4, (dur - t) * 4); } }, dur, g, -0.2); }
  jets() { this.play((d, sr, r) => { let y = 0, y2 = 0; for (let i = 0; i < d.length; i++) { const t = i / sr, near = Math.exp(-Math.pow((t - 2.4) / 1.1, 2)), tail = t > 2.4 ? Math.exp(-(t - 2.4) / 2.2) : 0; const c = 0.02 + 0.25 * near; y += c * ((r() * 2 - 1) - y); y2 += 0.02 * ((r() * 2 - 1) - y2); d[i] = y * (0.15 + 1.6 * near + 0.5 * tail) * Math.min(1, t / 1.5) + y2 * 3 * (near + tail * 0.6); } }, 8, 0.55); }
  helis() { this.play((d, sr, r) => { let y = 0; for (let i = 0; i < d.length; i++) { const t = i / sr, env = Math.sin(Math.PI * t / 12), beat = Math.pow(0.5 + 0.5 * Math.sin(TAU * 4.6 * t), 8) + 0.6 * Math.pow(0.5 + 0.5 * Math.sin(TAU * 5.3 * t + 1), 8); y += 0.03 * ((r() * 2 - 1) - y); d[i] = y * 6 * beat * env; } }, 12, 0.3, 0.5, this.out); }
  thin(k) { if (!this.ok) return; this.out.gain.value = 1 - 0.8 * k; }
  tock(g) { this.tk = !this.tk; const f = this.tk ? 2600 : 2100; this.play((d, sr, r) => { for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = (Math.sin(TAU * f * t) * Math.exp(-t / 0.012) + (r() * 2 - 1) * Math.exp(-t / 0.002) * 0.5) * 0.8; } }, 0.06, g, -0.3); }
  purr(on) { this.loop('purr', on, (d, sr, r) => { let y = 0; for (let i = 0; i < d.length; i++) { const t = i / sr; y += 0.05 * ((r() * 2 - 1) - y); d[i] = y * 4 * Math.pow(0.5 + 0.5 * Math.sin(TAU * 26 * t), 3) * (0.6 + 0.4 * Math.sin(TAU * t * 0.5)); } }, 0.5); }
  water(on, g = 0.35) { this.loop('water', on, (d, sr, r) => { let y = 0, y2 = 0; for (let i = 0; i < d.length; i++) { y += 0.4 * ((r() * 2 - 1) - y); y2 += 0.1 * (y - y2); d[i] = (y - y2) * 1.2 * (0.85 + 0.15 * Math.sin(i / sr * 37)); } }, g); }
  simmer(on) { this.loop('simmer', on, (d, sr, r) => { for (let i = 0; i < d.length; i++) d[i] = 0; for (let k = 0; k < 60; k++) { const i0 = Math.floor(r() * d.length), f = 300 + r() * 900; for (let i = 0; i < 1200 && i0 + i < d.length; i++) d[i0 + i] += Math.sin(TAU * f * i / sr * (1 + i / 3000)) * Math.exp(-i / 300) * 0.3; } }, 0.25); }
}

// ------------------------------------------------------------------ the scene
export class Home {
  constructor(o) {
    this.o = o; const r = o.renderer;
    this.us = o.side === 0; this.house = (o.house && HOUSES[o.side ? 'tx' : 'us'].find((h) => h.id === o.house)) || pickHouse(o.side, o.ident, o.id); this.C = cultureSheet(this.us ? 'us' : 'tx', this.house);
    this.ident = o.ident; this.tpl = pickTemplate(o.ident, o.id);
    const s = this.scene = new T.Scene();
    const cam = this.cam = new T.PerspectiveCamera(70, innerWidth / innerHeight, 0.03, 400); s.add(cam);
    // sky: late afternoon, sun low in the west-south-west
    const ENV = { afternoon: { d: [-0.62, 0.62, 0.48], c: 0xffe2b8, i: 3.8, h: 0.95, sky: [0x8fb6dc, 0xf3d7a8] }, golden: { d: [-0.85, 0.34, 0.42], c: 0xffc488, i: 3.6, h: 0.8, sky: [0x7a9ac8, 0xf8c890] },
      morning: { d: [0.7, 0.45, 0.55], c: 0xfff0d8, i: 3.6, h: 0.95, sky: [0x9ac0e8, 0xeae4d4] }, overcast: { d: [-0.4, 0.8, 0.45], c: 0xdde4ec, i: 1.5, h: 1.7, sky: [0xa8b0b8, 0xccd0d2] },
      hot: { d: [-0.5, 0.8, 0.36], c: 0xfff2dc, i: 4.4, h: 1.0, sky: [0x6a9ad4, 0xe6e2d6] } }[this.house.env.time] || {};
    this.env = ENV;
    this.sunDir = new T.Vector3(...ENV.d).normalize();
    const [skyTop, skyHor] = ENV.sky;
    const sky = new T.Mesh(new T.SphereGeometry(300, 32, 16), new T.ShaderMaterial({ side: T.BackSide, depthWrite: false, fog: false,
      uniforms: { uTop: { value: new T.Color(skyTop) }, uHor: { value: new T.Color(skyHor) }, uSun: { value: this.sunDir }, uT: { value: 0 }, uCloud: { value: this.house.env.time === 'overcast' ? 0.85 : 0.45 } },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 uTop, uHor, uSun; uniform float uT, uCloud; varying vec3 vD;
        float hh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hh(i), hh(i + vec2(1, 0)), f.x), mix(hh(i + vec2(0, 1)), hh(i + vec2(1, 1)), f.x), f.y); }
        float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int k = 0; k < 5; k++){ s += a * vn(p); p = p * 2.03 + vec2(11.3, 7.1); a *= 0.5; } return s; }
        void main(){ float h = clamp(vD.y, 0.0, 1.0); vec3 c = mix(uHor, uTop, pow(h, 0.55)); float s = max(dot(vD, uSun), 0.0);
          c += vec3(1.0, 0.8, 0.5) * (pow(s, 12.0) * 0.5 + pow(s, 600.0) * 4.0);
          // fair-weather cumulus drifting on a slow breeze
          if (vD.y > 0.0) { vec2 q = vD.xz / (vD.y + 0.12) * 0.9 + vec2(uT * 0.006, uT * 0.002);
            float n = fbm(q), d = smoothstep(1.0 - uCloud * 0.62, 1.0 - uCloud * 0.62 + 0.22, n) * smoothstep(0.0, 0.18, vD.y);
            float lit = 0.75 + 0.35 * fbm(q + uSun.xz * 0.06) + pow(s, 6.0) * 0.6;
            vec3 cc = mix(vec3(0.62, 0.64, 0.7), vec3(1.0, 0.96, 0.9), clamp(lit - 0.4, 0.0, 1.0)) * (0.9 + 0.2 * uHor);
            c = mix(c, cc, d * 0.92); }
          c = mix(c, vec3(0.55, 0.6, 0.5), smoothstep(0.02, -0.06, vD.y));
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }` }));
    s.add(sky); this.sky = sky;
    s.fog = new T.Fog(new T.Color(skyHor).lerp(new T.Color(0x9ab0a0), 0.3), 40, 160);
    const hemi = new T.HemisphereLight(0xbcd2ec, 0x6a6a52, ENV.h); s.add(hemi); s.add(new T.AmbientLight(0xfff4e4, 0.35));
    const sun = this.sun = new T.DirectionalLight(ENV.c, ENV.i); sun.position.copy(this.sunDir).multiplyScalar(60).add(new T.Vector3(0, 0, 8)); sun.target.position.set(0, 0, 8); s.add(sun, sun.target);
    sun.castShadow = true; const sc = sun.shadow.camera; sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.near = 10; sc.far = 130;
    sun.shadow.mapSize.set(o.low ? 2048 : 4096, o.low ? 2048 : 4096); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    // environment light from the sky
    { const pm = new T.PMREMGenerator(r), es = new T.Scene(); es.add(sky.clone()); s.environment = pm.fromScene(es, 0.04).texture; s.environmentIntensity = 0.35; pm.dispose(); }
    // the place
    const H = buildHouse(this.C, r); s.add(H.g); this.cols = H.A.cols; this.windows = H.A.windows;
    this.A = furnish(this.C, H.g, this.cols, r);
    const Y = buildYard(this.C, r, this.cols, o.low); s.add(Y.g); this.Y = Y.A; this.Yg = Y.g;
    this.expo0 = r.toneMappingExposure; this.tm0 = r.toneMapping; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;   // home keeps its own, softer picture
    this.post = new Post(r, s, cam, o.Q); this.post.setSize(innerWidth, innerHeight, o.Q.pr); this.post.cel.uniforms.uFar.value = 400;
    const pu = this.post.u; for (const k of ['uRew', 'uFF', 'uPause', 'uDesat', 'uDamage', 'uFlash', 'uStuck']) if (pu[k]) pu[k].value = 0; if (pu.uAmt) pu.uAmt.value = 1;
    // you
    this.pos = new T.Vector3(3.6, 0, 0.9); this.yaw = -Math.PI / 2 + 0.25; this.pitch = -0.05; this.bob = 0; this.vel = new T.Vector3();
    this.anims = [];
    this.t = 0; this.tape = 0; this.done = new Set(); this.act = null; this.held = null; this.phase = 'free'; this.prevUse = false; this.prevFire = false;
    this.audio = new HomeAudio(o.audio, this.us, this.house.amb || []);
    this.buildCat(); this.drawNote(); this.buildActivities();
    this.dust = this.makeDust();
    this.life = enhance(this);
    this.story = story(this);
    this.tvMat = new T.MeshBasicMaterial({ color: 0x0a0c0b }); this.A.tvScreen.material = this.tvMat;
    this.msgT = 0;
    for (const id of ['mode', 'counter', 'sp']) { const e = $(id); if (e) e.style.visibility = 'hidden'; }
    this.say(this.us ? 'An afternoon off.' : 'Saturday. Going to be a hot one.', '', 4);
  }
  dispose() { if (this.story) { this.story.dispose(); this.audio.loop('radioStatic', false); } for (const id of ['mode', 'counter', 'sp']) { const e = $(id); if (e) e.style.visibility = ''; } this.o.renderer.toneMappingExposure = this.expo0 || 1.0; if (this.tm0 != null) this.o.renderer.toneMapping = this.tm0; this.audio.loop && Object.keys(this.audio.loops || {}).forEach((k) => this.audio.loop(k, false)); if (this.audio.bus) this.audio.bus.gain.setTargetAtTime(0, this.audio.ctx.currentTime, 0.3); }
  resize() { this.cam.aspect = innerWidth / innerHeight; this.cam.updateProjectionMatrix(); this.post.setSize(innerWidth, innerHeight, this.o.Q.pr); }
  say(a, b = '', dur = 4) { const c = $('sub'); c.innerHTML = a + (b ? `<br><em style="opacity:.75">${b}</em>` : ''); c.style.opacity = 1; clearTimeout(this._sayT); this._sayT = setTimeout(() => (c.style.opacity = 0), dur * 1000); }

  drawNote() {
    const c = this.A.noteTex.userData.c, g = c.getContext('2d');
    g.fillStyle = this.us ? '#fbf3a8' : '#f4efe2'; g.fillRect(0, 0, c.width, c.height);
    if (!this.us) { g.strokeStyle = 'rgba(80,110,170,.4)'; for (let y = 40; y < c.height; y += 30) { g.beginPath(); g.moveTo(10, y); g.lineTo(c.width - 10, y); g.stroke(); } }
    g.fillStyle = '#1e2350'; g.font = 'italic 30px "Bradley Hand", "Comic Sans MS", cursive';
    g.fillText(this.us ? 'Today:' : 'To do:', 18, 44);
    g.font = 'italic 25px "Bradley Hand", "Comic Sans MS", cursive';
    this.tpl[1].forEach((k, i) => { const y = 96 + i * 60; g.fillStyle = '#1e2350'; g.fillText('☐ ' + TASKS[this.us ? 'us' : 'tx'][k], 18, y); if (this.done.has(k)) { g.strokeStyle = '#1e2350'; g.lineWidth = 3; g.beginPath(); g.moveTo(14, y - 9); g.lineTo(234, y - 7); g.stroke(); } });
    this.A.noteTex.needsUpdate = true;
    const list = this.tpl[1].map((k) => `${this.done.has(k) ? '<s>' : ''}${TASKS[this.us ? 'us' : 'tx'][k]}${this.done.has(k) ? '</s>' : ''}`).join('<br>');
    const el = $('todo'); if (el) el.innerHTML = list;
  }
  finish(k) {
    if (this.done.has(k)) return;
    this.done.add(k); this.drawNote(); this.audio.click(0.25, 1800);
    if (this.tpl[1].filter((x) => this.done.has(x)).length >= 2 && this.phase === 'free') setTimeout(() => this.compel(), 2500);
  }
  // the pull toward the tape
  compel() {
    if (this.phase !== 'free') return;
    this.phase = 'compelled'; this.compelT = 0;
    if (this.o.audio && this.o.audio.startMusic) { this.o.audio.musicVol = 0.22; this.o.audio.startMusic(); this.o.audio.musicTape(1, 0); }
    this.say('You feel like watching something.', '', 5);
    // the set comes on by itself to snow and hiss, as if it were waiting for the tape
    const snow = this.snowMat = new T.ShaderMaterial({ uniforms: { uT: { value: 0 } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float uT; varying vec2 vUv; float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); } void main(){ vec2 c = vUv - 0.5; vec2 g = floor(vUv * vec2(220.0, 160.0)); float n = h(g + floor(uT * 30.0) * 7.31); float roll = smoothstep(0.08, 0.0, abs(fract(vUv.y + uT * 0.13) - 0.5)) * 0.25; float v = n * 0.75 + roll + 0.08; v *= 1.0 - 1.2 * dot(c, c); gl_FragColor = vec4(vec3(v) * vec3(0.92, 0.96, 1.0), 1.0); }' });
    snow.toneMapped = false; this.A.tvScreen.material = snow;
    this.snowLight = new T.PointLight(0xc8d8ff, 0.5, 4.5, 1.6); this.snowLight.position.set(-4.9, 0.9, -2.3); this.scene.add(this.snowLight);
    this.audio.loop('snow', true, (d, sr, r) => { let y = 0; for (let i = 0; i < d.length; i++) { y += 0.55 * ((r() * 2 - 1) - y); d[i] = y * 0.9; } }, 0.07);
    this.nudgeT = 0;
  }

  // ---------------- the cat
  buildCat() {
    const c = this.cat = new T.Group(); this.scene.add(c);
    const fur = col(this.us ? '#c87a3a' : '#7a7a7e', 0.9), pale = col(this.us ? '#f0e0c8' : '#d8d8d8', 0.9);
    const body = mk(c, new T.SphereGeometry(0.16, 20, 14), fur, 0, 0.13, 0); body.scale.set(1.0, 0.75, 1.7);
    const head = this.catHead = new T.Group(); head.position.set(0, 0.2, 0.26); c.add(head);
    mk(head, new T.SphereGeometry(0.085, 18, 14), fur, 0, 0, 0).scale.set(1.05, 0.9, 1);
    mk(head, new T.SphereGeometry(0.04, 12, 10), pale, 0, -0.025, 0.06);
    for (const s of [-1, 1]) { mk(head, new T.ConeGeometry(0.03, 0.06, 4), fur, s * 0.05, 0.075, -0.005, 0, 0, s * -0.25); mk(head, new T.SphereGeometry(0.012, 8, 6), col('#2a2a1a', 0.2), s * 0.032, 0.015, 0.075); }
    const tail = this.catTail = new T.Group(); tail.position.set(0, 0.14, -0.26); c.add(tail);
    for (let k = 0; k < 6; k++) mk(tail, new T.SphereGeometry(0.03 - k * 0.002, 10, 8), fur, 0, k * 0.01, -k * 0.045);
    this.catLegs = [];
    for (const [x, z] of [[-0.07, 0.15], [0.07, 0.15], [-0.07, -0.14], [0.07, -0.14]]) this.catLegs.push(mk(c, CY(0.025, 0.022, 0.1, 8), fur, x, 0.04, z));
    c.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    // asleep in the sun on the living-room floor
    this.catHome = new T.Vector3(-4.2, 0, -2.9); c.position.copy(this.catHome); c.rotation.y = 1.2;
    this.catState = 'sleep'; this.catT = 0;
  }
  updateCat(dt) {
    const c = this.cat; this.catT += dt;
    const breathe = 1 + Math.sin(this.t * 2.2) * 0.02;
    c.children[0].scale.set(1.0 * breathe, 0.75 * breathe, 1.7);
    this.catTail.rotation.y = Math.sin(this.t * (this.catState === 'eat' ? 3 : 0.8)) * 0.4;
    const walkTo = (p, speed = 0.7) => { const d = new T.Vector3().subVectors(p, c.position); d.y = 0; const L = d.length(); if (L < 0.05) return true; const want = Math.atan2(d.x, d.z); let da = want - c.rotation.y; da = Math.atan2(Math.sin(da), Math.cos(da)); c.rotation.y += da * Math.min(1, dt * 5); c.position.addScaledVector(d.normalize(), Math.min(L, speed * dt)); this.catLegs.forEach((l, i) => (l.rotation.x = Math.sin(this.t * 10 + i * Math.PI / 2 + (i > 1 ? Math.PI : 0)) * 0.5)); return false; };
    if (this.catState === 'sleep') { this.catHead.position.y = 0.12; this.catHead.rotation.x = 0.5; this.catLegs.forEach((l) => (l.visible = false)); c.children[0].position.y = 0.09; }
    else { this.catHead.position.y = 0.2; this.catLegs.forEach((l) => (l.visible = true)); c.children[0].position.y = 0.13; this.catHead.rotation.x = 0; }
    if (this.catState === 'toBowl') { this.catHead.rotation.x = 0; if (walkTo(new T.Vector3(this.A.bowl.x, 0, this.A.bowl.z - 0.35))) { this.catState = 'eat'; this.catT = 0; c.rotation.y = 0; } }
    else if (this.catState === 'eat') { this.catHead.rotation.x = 0.6 + Math.sin(this.t * 6) * 0.08; if (this.catT > 7) { this.catState = 'back'; this.A.kibble.visible = false; this.finish('cat'); } }
    else if (this.catState === 'back') { if (walkTo(this.catHome)) { this.catState = 'sleep'; c.rotation.y = 1.2; } }
  }

  // ---------------- activities
  buildActivities() {
    const A = this.A, Y = this.Y, us = this.us, act = this.acts = [];
    const L = (en) => en;
    // dishes
    const plates = [], dirty = col('#d8d0b8', 0.5), clean = col('#f6f4ee', 0.25);
    for (let k = 0; k < 3; k++) { const p = mk(this.scene, CY(0.12, 0.09, 0.02, 24), dirty.clone(), A.stack.x, A.stack.y + 0.012 + k * 0.022, A.stack.z); p.userData.k = k; plates.push(p); }
    act.push({ id: 'dishes', at: A.sink, reach: 1.6, label: () => L('Wash the dishes'), pose: { p: new T.Vector3(1.6, 1.58, 3.35), l: new T.Vector3(1.6, 0.78, 4.15) },
      n: 0, busy: -1, enter() { this.parent.audio.water(true); }, exit() { this.parent.audio.water(false); },
      click() { if (this.busy >= 0 || this.n >= plates.length) return; this.busy = 0; this.cur = plates[plates.length - 1 - this.n]; },
      update(dt) {
        if (this.busy < 0) return;
        this.busy += dt; const p = this.cur, b = this.busy, Hm = this.parent;
        if (b < 0.4) p.position.lerpVectors(new T.Vector3(A.stack.x, A.stack.y + 0.1, A.stack.z), new T.Vector3(A.sink.x, 0.82, A.sink.z), ease(b / 0.4));
        else if (b < 1.7) { p.position.set(A.sink.x + Math.sin(b * 18) * 0.03, 0.82, A.sink.z + Math.cos(b * 14) * 0.02); p.rotation.z = Math.sin(b * 9) * 0.3; if (Math.random() < dt * 8) Hm.audio.swish(0.15, 0.12, 5000); p.material.color.lerp(clean.color, dt * 1.2); }
        else if (b < 2.1) { const k = ease((b - 1.7) / 0.4); p.position.lerpVectors(new T.Vector3(A.sink.x, 0.85, A.sink.z), new T.Vector3(A.rack.x - 0.17 + this.n * 0.055 * 1.2, 1.0, A.rack.z), k); p.rotation.set(0, 0, k * Math.PI / 2); }
        else { p.material.color.copy(clean.color); this.busy = -1; this.n++; Hm.audio.clink(0.35); if (this.n >= plates.length) Hm.finish('dishes'); }
      },
      hint: () => L('click: wash a plate') });
    // read
    const book = this.book = new T.Group(); book.visible = false; this.cam.add(book);
    const pageL = this.pageTexL = this.pageTex(), pageR = this.pageTexR = this.pageTex();
    mk(book, B(0.42, 0.02, 0.3), col(us ? '#5a2a24' : '#2a3a5a', 0.6), 0, -0.012, 0);
    const pl = mk(book, new T.PlaneGeometry(0.2, 0.28), std({ map: pageL, roughness: 0.9 }), -0.102, 0.001, 0, 0, -Math.PI / 2); pl.rotation.set(-Math.PI / 2, 0, 0.04);
    const pr = mk(book, new T.PlaneGeometry(0.2, 0.28), std({ map: pageR, roughness: 0.9 }), 0.102, 0.001, 0, 0, -Math.PI / 2); pr.rotation.set(-Math.PI / 2, 0, -0.04);
    const turn = new T.Group(); book.add(turn); const tp = mk(turn, new T.PlaneGeometry(0.2, 0.28), std({ color: 0xf4efe2, roughness: 0.9, side: T.DoubleSide }), 0.1, 0.002, 0, 0, 0, 0); tp.rotation.x = -Math.PI / 2; turn.visible = false;
    book.position.set(0, -0.2, -0.42); book.rotation.x = 0.95;
    book.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    act.push({ id: 'read', at: new T.Vector3(A.chairSeat.x, 0.6, A.chairSeat.z), reach: 1.5, label: () => L('Sit and read'), pose: { p: new T.Vector3(A.chairSeat.x, 1.1, A.chairSeat.z), yaw: A.chairYaw + Math.PI, pitch: -0.45 },
      spread: 0, flip: -1, enter() { book.visible = true; this.parent.drawSpread(this.spread); }, exit() { book.visible = false; },
      click() { if (this.flip >= 0) return; this.flip = 0; turn.visible = true; this.parent.audio.swish(0.35, 0.35, 2500); },
      update(dt) { if (this.flip < 0) return; this.flip += dt; turn.rotation.z = ease(this.flip / 0.55) * Math.PI; if (this.flip > 0.55) { this.flip = -1; turn.visible = false; this.spread++; if (this.spread >= BOOK.us.length) { this.spread = 0; this.parent.finish('read'); } this.parent.drawSpread(this.spread); } },
      hint: () => L('click: turn the page') });
    // video game on the living-room TV
    const gc = document.createElement('canvas'); gc.width = 256; gc.height = 192; const gt = new T.CanvasTexture(gc); gt.colorSpace = T.SRGBColorSpace; gt.magFilter = T.NearestFilter;
    this.gameTex = gt; this.gameMat = new T.MeshBasicMaterial({ map: gt, toneMapped: false });
    act.push({ id: 'game', at: A.consolePos, reach: 1.6, label: () => L('Play a game'), pose: { p: new T.Vector3(-4.1, 0.95, -2.3), l: new T.Vector3(-5.3, 0.82, -2.3) }, free: true,
      enter() { const H = this.parent; H.A.tvScreen.material = H.gameMat; this.g = us ? breakout(gc) : blocks(gc); },
      exit() { const H = this.parent; H.A.tvScreen.material = H.tvMat; },
      update(dt, I) { const H = this.parent; const ev = this.g.step(dt, I); gt.needsUpdate = true; if (ev.beep) H.audio.beep(ev.beep, 0.05, 0.2); if (ev.win) H.finish('game'); },
      hint: () => (us ? 'A / D move · click launch · Q stop' : 'A / D move · click rotate · S drop · Q stop') });
    // laundry
    const folds = [];
    act.push({ id: 'laundry', at: A.foldTable, reach: 1.6, label: () => L('Fold the laundry'), pose: { p: new T.Vector3(-4.75, 1.55, 0.8), l: new T.Vector3(-5.45, 0.82, 0.8) },
      n: 0, busy: -1,
      click() { if (this.busy >= 0 || this.n >= 3) return; this.busy = 0; const c = mk(this.parent.scene, new T.PlaneGeometry(0.6, 0.6), std({ color: new T.Color(['#e8e4d8', '#5a7a9a', '#c84a3a', '#f4f0e6', '#3a5a3a', '#e8c84a'][this.n]), roughness: 1, side: T.DoubleSide }), A.basket.x, A.basket.y + 0.1, A.basket.z); c.rotation.x = -Math.PI / 2; this.cur = c; folds.push(c); this.parent.audio.swish(0.25, 0.4, 1200); },
      update(dt) {
        if (this.busy < 0) return; this.busy += dt; const c = this.cur, b = this.busy, tgt = new T.Vector3(A.foldTable.x, A.foldTable.y + 0.01 + this.n * 0.03, A.foldTable.z);
        if (b < 0.5) { c.position.lerpVectors(new T.Vector3(A.basket.x, A.basket.y + 0.4, A.basket.z), tgt, ease(b / 0.5)); c.position.y += Math.sin(b / 0.5 * Math.PI) * 0.3; c.rotation.z = b * 2; }
        else if (b < 1.4) { const k = ease((b - 0.5) / 0.9); c.scale.set(1 - 0.55 * Math.min(1, k * 2), 1 - 0.5 * Math.max(0, k * 2 - 1), 1); c.rotation.z = 0; if (Math.random() < dt * 4) this.parent.audio.swish(0.12, 0.2, 900); }
        else { this.busy = -1; this.n++; if (this.n >= 3) this.parent.finish('laundry'); }
      }, hint: () => L('click: fold') });
    // typing
    act.push({ id: 'type', at: A.typewriter.position, reach: 1.6, label: () => L('Write a letter'), pose: { p: new T.Vector3(4.2, 1.18, -3.15), l: new T.Vector3(4.2, 0.92, -3.9) },
      n: 0, keys: true,
      key() { const H = this.parent, txt = LETTER[us ? 'us' : 'tx'] + this.parent.ident.first; if (this.n >= txt.length) return; const k = Math.min(txt.length, this.n + 8); const ch = txt.slice(this.n, k); this.n = k; H.drawLetter(txt.slice(0, this.n)); H.audio.click(0.4, 1400 + Math.random() * 400); if (ch.includes('\n')) H.audio.bell(0.25); if (this.n >= txt.length) H.finish('type'); },
      click() { this.key(); }, update() {}, free: true, hint: () => L('type (any key) · Tab to stop') });
    // cooking
    const veg = new T.Group(); veg.position.copy(A.board); this.scene.add(veg);
    const vegCol = us ? ['#e8d8a8', '#f2ecd8', '#8ab05a'] : ['#c8301a', '#f2ecd8', '#3a7a2a'];
    const whole = []; for (let k = 0; k < 3; k++) { const v = mk(veg, new T.SphereGeometry(0.045, 14, 10), col(vegCol[k], 0.5), -0.12 + k * 0.1, 0.04, 0.04); v.scale.set(1, 0.9, k === 2 && !us ? 1.8 : 1); whole.push(v); }
    const knife = new T.Group(); knife.position.set(0.12, 0.02, -0.06); veg.add(knife); mk(knife, B(0.02, 0.06, 0.2), std({ color: 0xd8dcde, metalness: 0.9, roughness: 0.2 }), 0, 0.03, 0); mk(knife, RB(0.025, 0.03, 0.11, 0.01), col('#2a1a12', 0.6), 0, 0.03, 0.15);
    const slices = [];
    act.push({ id: 'cook', at: A.stove, reach: 1.7, label: () => L('Make dinner'), pose: { p: new T.Vector3(4.55, 1.6, 3.3), l: new T.Vector3(4.55, 0.9, 4.05) },
      stage: 0, n: 0, chop: -1, stir: 0,
      click() {
        const H = this.parent;
        if (this.stage === 0 && this.chop < 0) { this.chop = 0; H.audio.thud(0.5, 160); H.audio.click(0.3, 3000); const s = mk(veg, CY(0.04, 0.04, 0.012, 14), col(vegCol[this.n % 3], 0.5), -0.15 + (this.n % 6) * 0.05, 0.01, -0.07); slices.push(s); this.n++; const w = whole[Math.min(2, Math.floor(this.n / 3))]; if (w) w.scale.multiplyScalar(0.85); if (this.n >= 5) { this.stage = 1; whole.forEach((v) => (v.visible = false)); } }
        else if (this.stage === 1) { this.stage = 2; this.toss = 0; H.audio.swish(0.3, 0.4, 900); H.audio.simmer(true); }
      },
      update(dt, I) {
        const H = this.parent;
        if (this.chop >= 0) { this.chop += dt; knife.position.y = 0.02 + Math.abs(Math.sin(this.chop * 14)) * 0.05 * (1 - this.chop / 0.25); if (this.chop > 0.25) this.chop = -1; }
        if (this.stage === 2) { this.toss += dt; const k = ease(this.toss / 0.6); slices.forEach((s, i) => { const from = s.userData.from || (s.userData.from = s.position.clone()); s.position.lerpVectors(from, new T.Vector3(-0.85, 0.12, -0.0), k); s.position.y += Math.sin(k * Math.PI) * 0.2; if (k >= 1) s.visible = false; }); if (k >= 1) { this.stage = 3; H.A.soup.material.color.set(us ? 0xe8dcc0 : 0x7a2a12); } }
        if (this.stage === 3) { if (I.held) { this.stir += dt; H.A.pot.rotation.y += dt * 3; } if (this.stir > 2) { this.stage = 4; H.finish('cook'); } }
        if (this.stage >= 2) H.steam = Math.min(1, (H.steam || 0) + dt * 0.3);
      },
      hint() { return [L('click: chop'), L('click: into the pot'), '', L('hold click: stir'), L('simmering')][this.stage]; } });
    // garden: water, weed, harvest — done walking about, not from a fixed pose
    act.push({ id: 'can', at: Y.can.position, reach: 1.4, label: () => (this.held === 'can' ? null : L('Pick up the watering can')), instant: true, click: () => this.hold('can') });
    act.push({ id: 'bag', at: A.foodBag, reach: 1.3, label: () => (this.held === 'bag' || this.done.has('cat') ? null : L('Get the cat food')), instant: true, click: () => this.hold('bag') });
    act.push({ id: 'bowl', at: A.bowl, reach: 1.4, label: () => (this.held === 'bag' && !A.kibble.visible ? L('Fill the bowl') : null), instant: true,
      click: () => { A.kibble.visible = true; this.audio.swish(0.4, 0.6, 2200); this.hold(null); this.catState = 'toBowl'; } });
    act.push({ id: 'pet', get at() { return new T.Vector3().copy(this.parent.cat.position).setY(0.2); }, reach: 1.3, label: () => (this.catState === 'sleep' ? L('Pet the cat') : null), instant: true,
      click: () => { this.audio.purr(true); clearTimeout(this._purr); this._purr = setTimeout(() => this.audio.purr(false), 4000); } });
    // the tape and the ending
    act.push({ id: 'takeTape', at: A.tapePos, get reach() { return this.parent.phase === 'compelled' && this.parent.inside ? 6 : 1.6; }, label: () => (this.phase === 'compelled' && !this.held ? L('Take the tape') : null), instant: true, click: () => { this.hold('tape'); A.theTape.visible = false; this.audio.click(0.3, 900); } });
    act.push({ id: 'insert', at: A.vcrPos, reach: 1.6, label: () => (this.held === 'tape' ? L('Put the tape in') : null), instant: true, click: () => this.insertTape() });
    act.push({ id: 'couch', at: new T.Vector3(A.couchSeat.x, 0.5, A.couchSeat.z), reach: 1.6, label: () => (this.phase === 'playing' ? L('Sit down') : null), instant: true, click: () => this.sitDown() });
    act.push({ id: 'phone', at: A.phonePos, reach: 2.4, label: () => (this.phase === 'ringing' ? L('Answer the phone') : null), instant: true, click: () => this.answer() });
    act.forEach((a) => (a.parent = this));
  }
  pageTex() { const c = document.createElement('canvas'); c.width = 256; c.height = 358; const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.userData = { c }; return t; }
  drawSpread(i) {
    const pages = BOOK[this.us ? 'us' : 'tx'][i];
    [this.pageTexL, this.pageTexR].forEach((t, k) => {
      const c = t.userData.c, g = c.getContext('2d'); g.fillStyle = '#f4efe2'; g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = 'rgba(0,0,0,.07)'; g.fillRect(k ? 0 : c.width - 12, 0, 12, c.height);
      g.fillStyle = '#2a2420'; g.font = '15px Georgia, "Times New Roman", serif';
      const words = pages[k].split(' '); let line = '', y = 34;
      for (const w of words) { const test = line ? line + ' ' + w : w; if (g.measureText(test).width > c.width - 40) { g.fillText(line, 20, y); y += 21; line = w; } else line = test; }
      if (line) g.fillText(line, 20, y);
      g.font = '12px Georgia, serif'; g.fillText(String(i * 2 + 41 + k), c.width / 2 - 6, c.height - 14);
      t.needsUpdate = true;
    });
  }
  drawLetter(txt) {
    const c = this.A.paperTex.userData.c, g = c.getContext('2d'); g.fillStyle = '#f6f2e8'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#1a1a1a'; g.font = '11px "Courier New", monospace';
    let x = 16, y = 26;
    for (const ch of txt) { if (ch === '\n') { x = 16; y += 14; continue; } if (x > c.width - 20) { x = 16; y += 14; } g.fillText(ch, x, y); x += 6.6; }
    this.A.paperTex.needsUpdate = true;
  }
  hold(what) {
    const prev = this.held; this.held = what;
    if (this.heldObj) { this.cam.remove(this.heldObj); this.heldObj = null; }
    if (prev === 'can') { this.Y.can.visible = true; this.audio.water(false); }
    if (what === 'can') { this.Y.can.visible = false; const c = this.Y.can.clone(); c.visible = true; c.position.set(0.32, -0.42, -0.6); c.rotation.set(0, Math.PI * 0.85, 0); c.scale.setScalar(0.9); this.cam.add(c); this.heldObj = c; this.audio.click(0.3, 600); }
    if (what === 'bag') { const g = new T.Group(); mk(g, RB(0.2, 0.32, 0.1, 0.03), col(this.us ? '#c8442a' : '#e8c84a', 0.7), 0, 0, 0); g.position.set(0.3, -0.35, -0.55); g.rotation.set(0.2, -0.3, 0); this.cam.add(g); this.heldObj = g; }
    if (what === 'tape') { const g = new T.Group(); mk(g, B(0.156, 0.025, 0.096), col('#151515', 0.4), 0, 0, 0); mk(g, new T.PlaneGeometry(0.12, 0.07), std({ color: 0xefe8d6 }), 0, 0.0126, 0, 0, 0, 0).rotation.x = -Math.PI / 2; g.position.set(0.18, -0.24, -0.45); g.rotation.set(0.6, 0.3, 0); this.cam.add(g); this.heldObj = g; }
    if (this.heldObj) this.heldObj.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
  }
  insertTape() {
    this.hold(null); this.phase = 'playing'; this.playT = 0;
    const au = this.o.audio; if (au && au.vcrInsert) { if (au.vcrRunSrc) { try { au.vcrRunSrc.stop(); } catch (e) { /* */ } } au.vcrSkipped = false; au.vcrRunSrc = null; au.vcrInsert(0.85); }
    this.A.vcrLed.material.color.set(0x5affd8);
    this.audio.loop('snow', false); if (this.snowLight) { this.scene.remove(this.snowLight); this.snowLight = null; } this.A.tvScreen.material = this.tvMat; this.snowMat = null;
    this.say(this.us ? '' : '', '', 0.1);
  }
  sitDown() { this.phase = 'sitting'; this.sitT = 0; this.act = { id: 'couch', pose: { p: new T.Vector3(this.A.couchSeat.x, 1.05, this.A.couchSeat.z), l: this.A.tvPos }, free: true, update() {}, parent: this }; this.actT = 0; this.from = { p: this.cam.position.clone(), q: this.cam.quaternion.clone() }; }
  answer() {
    this.phase = 'call'; this.callT = 0; this.A.receiver.position.set(0.0, 0.4, 0.3); this.A.receiver.visible = false;
    this.audio.click(0.5, 500);
    const f = this.ident.first, l = this.ident.last, town = this.ident.town;
    this.lines = this.us
      ? [[0.8, `“Hello — is this ${f} ${l}?”`, ''], [4.2, '“This is Staff Sergeant Morales, with your unit.”', ''], [8.0, '“The governor’s activated the Guard. You report to Joint Base Cape Cod, oh-six-hundred tomorrow.”', ''], [14.5, '“…Hello? Are you still there?”', '']]
      : [[0.8, `“Hey — ${f} ${l}?”`, ''], [4.2, '“This is Sergeant First Class Garza, Texas Military Department.”', ''], [8.0, '“The governor’s called up the Guard. Muster at Camp Mabry, oh-six-hundred tomorrow. Bring your gear.”', ''], [14.5, '“…You still there?”', '']];
    this.lineI = 0;
  }

  // ---------------- dust in the sunbeams
  makeDust() {
    const n = 160, geo = new T.BufferGeometry(), p = new Float32Array(n * 3), r = mulberry32(5);
    for (let i = 0; i < n; i++) { p[i * 3] = -6 + r() * 7.5; p[i * 3 + 1] = 0.3 + r() * 2.2; p[i * 3 + 2] = -4.4 + r() * 4.2; }
    geo.setAttribute('position', new T.BufferAttribute(p, 3));
    const m = new T.PointsMaterial({ size: 0.008, color: 0xfff0d0, transparent: true, opacity: 0.35, depthWrite: false, blending: T.AdditiveBlending });
    const pts = new T.Points(geo, m); this.scene.add(pts); return pts;
  }

  // ---------------- movement
  collide(x, z, r = 0.25) {
    for (const [x0, z0, x1, z1] of this.cols) {
      const cx = clamp(x, x0, x1), cz = clamp(z, z0, z1), dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz);
      if (d < r) { if (d < 1e-4) { const pushL = x - x0, pushR = x1 - x, pushD = z - z0, pushU = z1 - z, m = Math.min(pushL, pushR, pushD, pushU); if (m === pushL) x = x0 - r; else if (m === pushR) x = x1 + r; else if (m === pushD) z = z0 - r; else z = z1 + r; } else { x = cx + dx / d * r; z = cz + dz / d * r; } }
    }
    return [clamp(x, -11.6, 11.6), clamp(z, -4.25, 21.6)];
  }
  get inside() { return Math.abs(this.pos.x) < 6 && Math.abs(this.pos.z) < 4.5; }

  // ---------------- per frame
  update(dt, I) {
    this.t += dt; this.tape += dt;
    WIND.uTime.value = this.t; WIND.uGust.value = Math.max(0, Math.sin(this.t * 0.31) * Math.sin(this.t * 0.17 + 1)) * 0.8;
    const use = I.use && !this.prevUse, fireDown = I.fire && !this.prevFire; this.prevUse = I.use; this.prevFire = I.fire;
    const click = use || fireDown;
    const cam = this.cam;
    // look
    this.yaw -= I.lookX * 0.0022; this.pitch = clamp(this.pitch - I.lookY * 0.0022, -1.35, 1.35);
    const moving = Math.abs(I.moveX) + Math.abs(I.moveZ) > 0.1;
    // leave a fixed-pose activity by walking off
    if (this.act && this.act.id !== 'couch' && ((moving && !this.act.free) || I.leave)) this.leave();
    if (!this.act && this.phase !== 'call') {
      const sp = I.sprint ? 3.4 : 2.0, fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      let wx = fx * I.moveZ + rx * I.moveX, wz = fz * I.moveZ + rz * I.moveX; const l = Math.hypot(wx, wz); if (l > 1) { wx /= l; wz /= l; }
      this.vel.x += (wx * sp - this.vel.x) * Math.min(1, dt * 9); this.vel.z += (wz * sp - this.vel.z) * Math.min(1, dt * 9);
      const [nx, nz] = this.collide(this.pos.x + this.vel.x * dt, this.pos.z + this.vel.z * dt);
      this.pos.x = nx; this.pos.z = nz;
      const hs = Math.hypot(this.vel.x, this.vel.z); const pb = this.bob; this.bob += hs * dt * 1.8; if (Math.floor(pb) !== Math.floor(this.bob)) this.audio.step(this.inside);
      cam.position.set(this.pos.x, 1.62 + Math.abs(Math.sin(this.bob * Math.PI)) * 0.025 * Math.min(1, hs / 2), this.pos.z);
      cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    } else if (this.act) {
      // glide into the activity's pose
      this.actT += dt; const k = ease(Math.min(1, this.actT / 0.7)), P = this.act.pose;
      const tq = new T.Quaternion();
      if (P.l) { const m = new T.Matrix4().lookAt(P.p, P.l, new T.Vector3(0, 1, 0)); tq.setFromRotationMatrix(m); }
      else tq.setFromEuler(new T.Euler(P.pitch || 0, P.yaw || 0, 0, 'YXZ'));
      // a little free look on top
      const look = new T.Quaternion().setFromEuler(new T.Euler(clamp(this.pitch - (this.pitch0 || 0), -0.35, 0.35), clamp(this.yaw - (this.yaw0 || 0), -0.6, 0.6), 0, 'YXZ'));
      cam.position.lerpVectors(this.from.p, P.p, k); cam.quaternion.slerpQuaternions(this.from.q, tq.multiply(look), k);
      if (this.act.update) this.act.update(dt, { ...I, held: I.fire || I.use, moveX: I.moveX, moveZ: I.moveZ, rot: this._rot, drop: I.moveZ < -0.5 });
      if (this.act.click && click && this.actT > 0.5) this.act.click();
      if (this.act.keys && this._typed) { this._typed = false; this.act.key(); }
    }
    // what's in front of you
    let best = null, bd = 1e9;
    if (!this.act && this.phase !== 'call') {
      const fwd = new T.Vector3(); cam.getWorldDirection(fwd);
      for (const a of this.acts) {
        const at = a.at; if (!at) continue;
        const lab = a.label(); if (!lab) continue;
        if (a.id && this.done.has(a.id) && !a.instant && a.id !== 'read' && a.id !== 'game') continue;
        const d = new T.Vector3().subVectors(at, cam.position), dist = d.length(); if (dist > (a.reach || 1.5) + 0.6) continue;
        const ang = Math.acos(clamp(d.normalize().dot(fwd), -1, 1)); if (ang > 0.55) continue;
        const sc = ang * 2 + dist; if (sc < bd) { bd = sc; best = a; }
      }
      // garden work with things in hand / under the eye
      if (!best) best = this.gardenTarget(fwd);
    }
    const pk = $('pick');
    if (best) { pk.innerHTML = `${this.o.touch ? 'TAP' : '[E]'} &nbsp;${best.label()}`; pk.style.opacity = 1; } else if (this.act && this.act.hint) { pk.innerHTML = `<small>${this.act.hint()}${this.act.free ? '' : ` · walk away to stop`}</small>`; pk.style.opacity = 0.8; } else pk.style.opacity = 0;
    if (best && click) {
      if (best.instant) best.click(); else if (best.garden) best.garden(); else this.enter(best);
    }
    // holding to water
    if (this.held === 'can') this.water(dt, I.fire || I.use);
    this.anims = this.anims.filter((f) => !f());
    // world life
    this.updateCat(dt);
    this.audio.update(dt, this.inside);
    if (this.A.hands) { const min = 16 * 60 + 40 + this.tape / 60; this.A.hands[0].rotation.z = -(min / 60 / 12) * TAU; this.A.hands[1].rotation.z = -(min / 60) * TAU; }
    if (this.A.pend) this.A.pend.rotation.z = Math.sin(this.t * Math.PI) * 0.12;
    this.dust.rotation.y = Math.sin(this.t * 0.05) * 0.02; this.dust.position.y = Math.sin(this.t * 0.3) * 0.05;
    if (this.steam) this.steamFx(dt);
    if (this.life) this.life.update(dt);
    if (this.story) this.story.update(dt);
    // the ending
    this.ending(dt);
    // fallback: after a long while the pull comes anyway
    if (this.phase === 'free' && this.t > 240) this.compel();
    if (this.snowMat) { this.snowMat.uniforms.uT.value = this.t; if (this.snowLight) this.snowLight.intensity = 0.4 + Math.random() * 0.25; }
    if (this.phase === 'compelled' && this.held !== 'tape') { this.nudgeT += dt; if (this.nudgeT > 40) { this.nudgeT = 0; this.say(this.inside ? 'The tape’s on the bottom shelf of the bookcase.' : 'The TV’s on inside. Hissing.', '', 4); } }
    if (this.phase === 'compelled' || this.phase === 'playing') { this.compelT = (this.compelT || 0) + dt; this.A.vcrLed.material.color.setHSL(0.47, 0.8, 0.2 + 0.25 * (0.5 + 0.5 * Math.sin(this.t * 4))); this.A.theTape.material.emissive = new T.Color(0x332a10).multiplyScalar(0.5 + 0.5 * Math.sin(this.t * 3)); }
    // HUD
    // no tape read-out at home: just the room
    $('mode').textContent = ''; $('counter').textContent = '';
    // render
    if (this.tvLive && this.o.tv) this.o.tv(dt);
    this.post.render(this.t, this.sunDir);
  }
  enter(a) {
    if (this.held === 'can' || this.held === 'bag') this.hold(null);
    this.act = a; this.actT = 0; this.from = { p: this.cam.position.clone(), q: this.cam.quaternion.clone() }; this.yaw0 = this.yaw; this.pitch0 = this.pitch;
    if (a.enter) a.enter();
  }
  leave() {
    const a = this.act; if (!a) return; if (a.exit) a.exit(); this.act = null;
    const e = new T.Euler().setFromQuaternion(this.cam.quaternion, 'YXZ'); this.yaw = e.y; this.pitch = clamp(e.x, -1.2, 1.2);
    if (a.pose) { const p = a.pose.p; const [nx, nz] = this.collide(p.x - Math.sin(this.yaw) * -0.35, p.z - Math.cos(this.yaw) * -0.35); this.pos.set(nx, 0, nz); }
  }
  // look at a weed / a fruit / a dry patch; act on it
  gardenTarget(fwd) {
    const cam = this.cam, Y = this.Y, us = this.us;
    const near = (obj, reach) => { const p = obj.getWorldPosition ? obj.getWorldPosition(new T.Vector3()) : obj; const d = new T.Vector3().subVectors(p, cam.position), L = d.length(); if (L > reach) return null; const ang = Math.acos(clamp(d.normalize().dot(fwd), -1, 1)); return ang < 0.32 ? ang + L * 0.1 : null; };
    let best = null, bs = 1e9;
    for (const w of Y.weeds) { if (!w.visible || w.userData.pulled) continue; const s = near(w, 2.3); if (s != null && s < bs) { bs = s; best = { label: () => 'Pull the weed', garden: () => this.pull(w) }; } }
    for (const f of Y.fruit) { if (!f.visible || f.userData.picked) continue; const s = near(f, 2.0); if (s != null && s < bs) { bs = s; best = { label: () => 'Pick it', garden: () => this.pick(f) }; } }
    return best;
  }
  pull(w) {
    w.userData.pulled = true; this.audio.swish(0.4, 0.25, 1800); this.audio.thud(0.2, 80);
    const t0 = this.t, p0 = w.position.clone();
    this.anims.push(() => { const k = (this.t - t0) / 0.6; if (k >= 1) { w.visible = false; const n = this.Y.weeds.filter((x) => x.userData.pulled).length; if (n >= Math.min(4, this.Y.weeds.length)) this.finish('weed'); return true; } w.position.set(p0.x, p0.y + ease(k) * 0.5, p0.z); w.rotation.y += 0.2; w.scale.setScalar(0.35 * (1 - k * 0.6)); });
  }
  pick(f) {
    this.audio.click(0.3, 700); this.audio.swish(0.15, 0.15, 3000);
    const t0 = this.t, p0 = f.getWorldPosition(new T.Vector3());
    f.userData.picked = true;
    this.anims.push(() => { const k = (this.t - t0) / 0.35; if (k >= 1) { f.visible = false; const n = this.Y.fruit.filter((x) => x.userData.picked).length; if (n >= Math.min(4, this.Y.fruit.length)) this.finish('harvest'); return true; } const tgt = this.cam.position.clone().add(new T.Vector3(0, -0.4, 0)); f.position.lerpVectors(p0, tgt, ease(k)); });
  }
  water(dt, pouring) {
    const c = this.heldObj; if (!c) return; c.updateMatrixWorld(true);
    c.rotation.z = THREE.MathUtils.lerp(c.rotation.z, pouring ? 0.7 : 0, Math.min(1, dt * 6));
    this.audio.water(pouring, 0.25);
    if (!this.waterFx) { const n = 120, g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(new Float32Array(n * 3), 3)); this.waterFx = new T.Points(g, new T.PointsMaterial({ size: 0.02, color: 0xcfe6ff, transparent: true, opacity: 0.8, depthWrite: false })); this.scene.add(this.waterFx); this.waterP = Array.from({ length: n }, () => ({ t: 9, p: new T.Vector3(), v: new T.Vector3() })); }
    const spout = new T.Vector3(0, 0.4, -0.38).applyMatrix4(c.matrixWorld), fwd = new T.Vector3(); this.cam.getWorldDirection(fwd);
    const P = this.waterFx.geometry.attributes.position;
    this.waterP.forEach((q, i) => {
      if (q.t > 0.9 && pouring && Math.random() < dt * 60) { q.t = 0; q.p.copy(spout); q.v.set(fwd.x * 1.2 + (Math.random() - 0.5) * 0.3, 0.2, fwd.z * 1.2 + (Math.random() - 0.5) * 0.3); }
      q.t += dt; q.v.y -= 9.8 * dt; q.p.addScaledVector(q.v, dt); if (q.p.y < 0) q.t = 9;
      if (q.t > 0.9) P.setXYZ(i, 0, -100, 0); else P.setXYZ(i, q.p.x, q.p.y, q.p.z);
    });
    P.needsUpdate = true;
    if (pouring) {
      // the stream lands about here
      const land = new T.Vector3(spout.x + fwd.x * 0.55, 0, spout.z + fwd.z * 0.55);
      for (const d of this.Y.dry) { if (d.userData.wet >= 1) continue; if (Math.hypot(d.position.x - land.x, d.position.z - land.z) < 0.75) { d.userData.wet = (d.userData.wet || 0) + dt / 2.5; d.material.color.lerpColors(new T.Color(0xb89a74), new T.Color(0x2a1e14), Math.min(1, d.userData.wet)); d.material.opacity = 0.55 + 0.25 * Math.min(1, d.userData.wet); if (d.userData.wet >= 1) { this.audio.click(0.15, 900); if (this.Y.dry.every((x) => x.userData.wet >= 1)) this.finish('water'); } } }
    }
  }
  steamFx(dt) {
    if (!this.steamPts) { const n = 60, g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(new Float32Array(n * 3), 3)); this.steamPts = new T.Points(g, new T.PointsMaterial({ size: 0.06, color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false })); this.scene.add(this.steamPts); this.steamP = Array.from({ length: n }, (_, i) => ({ t: i / n * 2 })); }
    const P = this.steamPts.geometry.attributes.position, c = this.A.pot.position;
    this.steamP.forEach((q, i) => { q.t += dt; if (q.t > 2) q.t = 0; const k = q.t / 2; P.setXYZ(i, c.x + Math.sin(i * 7 + this.t) * 0.05 * (1 + k * 3), c.y + 0.2 + k * 0.7, c.z + Math.cos(i * 3 + this.t) * 0.05 * (1 + k * 3)); });
    P.needsUpdate = true; this.steamPts.material.opacity = 0.25 * this.steam;
  }

  // ---------------- tape, couch, phone
  ending(dt) {
    if (this.phase === 'playing' || this.phase === 'sitting' || this.phase === 'ringing') {
      this.playT += dt;
      if (this.playT > 6.0 && !this.tvLive) { this.tvLive = true; if (this.o.tvTexture) { this.A.tvScreen.material = new T.ShaderMaterial({ uniforms: { map: { value: this.o.tvTexture }, uT: { value: 0 } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: 'uniform sampler2D map; uniform float uT; varying vec2 vUv; void main(){ vec2 c = vUv - 0.5; vec3 col = texture2D(map, vUv).rgb; col *= 0.86 + 0.14 * sin(vUv.y * 700.0); col *= 1.0 - 0.6 * dot(c, c) * 2.0; gl_FragColor = vec4(col * 1.3, 1.0); }' }); this.tvLight = new T.PointLight(0x9ab8ff, 0.8, 4, 1.5); this.tvLight.position.set(-4.9, 0.9, -2.3); this.scene.add(this.tvLight); } }
      if (this.tvLight) this.tvLight.intensity = 0.6 + Math.random() * 0.4;
    }
    if (this.phase === 'sitting') { this.sitT += dt; if (this.sitT > 12) { this.phase = 'ringing'; this.ringT = 0; this.rings = 0; } }
    if (this.phase === 'ringing') { this.ringT -= dt; if (this.ringT <= 0) { this.audio.ring(); this.ringT = this.us ? 6 : 5; this.rings++; } if (this.rings === 1 && this.act) { /* stay seated; the prompt asks */ } if (this.act && this.act.id === 'couch') { this.act = null; const e = new T.Euler().setFromQuaternion(this.cam.quaternion, 'YXZ'); this.yaw = e.y; this.pitch = e.x; this.pos.set(this.A.couchSeat.x, 0, this.A.couchSeat.z); } }
    if (this.phase === 'call') {
      this.callT += dt;
      // look at the TV while listening; the receiver is at your ear
      const tgt = new T.Matrix4().lookAt(this.cam.position, this.A.tvPos, new T.Vector3(0, 1, 0)); const q = new T.Quaternion().setFromRotationMatrix(tgt);
      this.cam.quaternion.slerp(q, Math.min(1, dt * 1.5));
      while (this.lineI < this.lines.length && this.callT >= this.lines[this.lineI][0]) { const [, a, b] = this.lines[this.lineI++]; this.say(a, b, 4.2); }
      if (this.callT > 19 && !this.ended) { this.ended = true; if (this.o.onEnd) this.o.onEnd(); }
    }
  }
}

// ------------------------------------------------------------------ the two TV games
function breakout(c) {
  const g = c.getContext('2d'), W = c.width, Hh = c.height;
  const S = { px: W / 2, bx: W / 2, by: Hh - 30, vx: 0, vy: 0, stuck: true, bricks: [], hits: 0, won: false, t: 0 };
  const cols = ['#e8442a', '#f0a030', '#f0e04a', '#5ac85a', '#4a8ae8'];
  for (let r = 0; r < 5; r++) for (let k = 0; k < 10; k++) S.bricks.push({ x: 8 + k * 24, y: 24 + r * 10, a: true, c: cols[r] });
  return { step(dt, I) {
    const ev = {}; S.t += dt;
    S.px = clamp(S.px + I.moveX * 200 * dt + (I.lookX || 0) * 0.3, 20, W - 20);
    if (S.stuck) { S.bx = S.px; S.by = Hh - 26; if (I.held) { S.stuck = false; S.vx = 70; S.vy = -110; ev.beep = 660; } }
    else { S.bx += S.vx * dt; S.by += S.vy * dt;
      if (S.bx < 4 || S.bx > W - 4) { S.vx *= -1; S.bx = clamp(S.bx, 4, W - 4); ev.beep = 330; }
      if (S.by < 14) { S.vy = Math.abs(S.vy); ev.beep = 330; }
      if (S.by > Hh - 24 && S.by < Hh - 16 && Math.abs(S.bx - S.px) < 22 && S.vy > 0) { S.vy = -Math.abs(S.vy) * 1.02; S.vx += (S.bx - S.px) * 3; ev.beep = 440; }
      if (S.by > Hh) { S.stuck = true; ev.beep = 110; }
      for (const b of S.bricks) if (b.a && S.bx > b.x && S.bx < b.x + 22 && S.by > b.y && S.by < b.y + 8) { b.a = false; S.vy *= -1; S.hits++; ev.beep = 880; if (S.hits === 6) ev.win = true; break; } }
    g.fillStyle = '#05060a'; g.fillRect(0, 0, W, Hh);
    for (const b of S.bricks) if (b.a) { g.fillStyle = b.c; g.fillRect(b.x, b.y, 22, 8); }
    g.fillStyle = '#e8e8e8'; g.fillRect(S.px - 20, Hh - 20, 40, 5); g.fillRect(S.bx - 2, S.by - 2, 4, 4);
    g.font = '12px monospace'; g.fillText('SCORE ' + String(S.hits * 10).padStart(4, '0'), 6, 12); g.fillText('HI 0150', W - 64, 12);
    return ev;
  } };
}
function blocks(c) {
  const g = c.getContext('2d'), W = c.width, Hh = c.height, CW = 10, CH = 18, sz = 10, ox = (W - CW * sz) / 2, oy = 6;
  const P = [[[0, 0], [1, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [2, 0], [3, 0]], [[0, 0], [1, 0], [2, 0], [1, 1]], [[0, 0], [1, 0], [2, 0], [2, 1]], [[0, 0], [1, 0], [2, 0], [0, 1]], [[0, 0], [1, 0], [1, 1], [2, 1]], [[1, 0], [2, 0], [0, 1], [1, 1]]];
  const cols = ['#e8c84a', '#4ac8e8', '#b84ae8', '#e88a2a', '#2a5ae8', '#e8442a', '#4ae84a'];
  const grid = Array.from({ length: CH }, () => Array(CW).fill(-1));
  let cur, cx, cy, fall = 0, mv = 0, lines = 0, rotLock = false, dropT = 0;
  const spawn = () => { const k = Math.floor(Math.random() * 7); cur = { k, b: P[k].map((p) => [...p]) }; cx = 4; cy = 0; if (!fits(cur.b, cx, cy)) for (const row of grid) row.fill(-1); };
  const fits = (b, x, y) => b.every(([u, v]) => x + u >= 0 && x + u < CW && y + v < CH && (y + v < 0 || grid[y + v][x + u] < 0));
  spawn();
  return { step(dt, I) {
    const ev = {};
    mv -= dt; if (Math.abs(I.moveX) > 0.5 && mv <= 0) { const d = Math.sign(I.moveX); if (fits(cur.b, cx + d, cy)) { cx += d; ev.beep = 220; } mv = 0.12; } if (Math.abs(I.moveX) < 0.5) mv = 0;
    if (I.held && !rotLock) { const nb = cur.b.map(([u, v]) => [1 - v + 1, u]); if (fits(nb, cx, cy)) { cur.b = nb; ev.beep = 330; } rotLock = true; } if (!I.held) rotLock = false;
    fall += dt * (I.moveZ < -0.5 ? 12 : 2.2);
    if (fall >= 1) { fall = 0; if (fits(cur.b, cx, cy + 1)) cy++; else {
      for (const [u, v] of cur.b) if (cy + v >= 0) grid[cy + v][cx + u] = cur.k;
      for (let y = CH - 1; y >= 0; y--) if (grid[y].every((q) => q >= 0)) { grid.splice(y, 1); grid.unshift(Array(CW).fill(-1)); lines++; y++; ev.beep = 990; if (lines === 1) ev.win = true; }
      ev.beep = ev.beep || 140; spawn(); } }
    g.fillStyle = '#060608'; g.fillRect(0, 0, W, Hh); g.strokeStyle = '#3a3a4a'; g.strokeRect(ox - 1, oy - 1, CW * sz + 2, CH * sz + 2);
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) if (grid[y][x] >= 0) { g.fillStyle = cols[grid[y][x]]; g.fillRect(ox + x * sz, oy + y * sz, sz - 1, sz - 1); }
    g.fillStyle = cols[cur.k]; for (const [u, v] of cur.b) if (cy + v >= 0) g.fillRect(ox + (cx + u) * sz, oy + (cy + v) * sz, sz - 1, sz - 1);
    g.fillStyle = '#e8e8e8'; g.font = '11px monospace'; g.fillText('LINES ' + lines, 6, 16); g.fillText('HI 3', W - 60, 16);
    return ev;
  } };
}
