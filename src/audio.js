// All sound is synthesized. World sounds play reversed; the player's own gun plays forward.
import { mulberry32 } from './rng.js';

export class Audio {
  constructor() { this.ctx = null; this.voices = []; this.enabled = false; }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.sr = ctx.sampleRate;
    this.master = ctx.createGain(); this.master.gain.value = 0.9;
    this.muffle = ctx.createBiquadFilter(); this.muffle.type = 'lowpass'; this.muffle.frequency.value = 18000;
    this.comp = ctx.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.ratio.value = 6; this.comp.attack.value = 0.002; this.comp.release.value = 0.2;
    this.master.connect(this.muffle).connect(this.comp).connect(ctx.destination);
    const r = mulberry32(99);
    this.B = {};
    const shot = (seed, heavy) => this.makeShot(mulberry32(seed), heavy);
    this.B.shot = [shot(1, 0), shot(2, 0), shot(3, 0)];
    this.B.heavy = [shot(4, 1)];
    this.B.player = [shot(11, 0.4), shot(12, 0.4)];
    this.B.playerInv = [shot(21, 0.6)];
    this.B.boom = this.makeBoom(r);
    this.B.whiz = this.makeWhiz(r);
    this.B.whoosh = this.makeWhoosh(r);
    this.B.thump = this.makeThump();
    this.B.click = this.makeClick(r, 0.04);
    this.B.clunk = this.makeClick(r, 0.25);
    this.B.mine = this.makeBoom(mulberry32(5));
    const rev = (b) => { const o = this.ctx.createBuffer(1, b.length, this.sr); const s = b.getChannelData(0), d = o.getChannelData(0); for (let i = 0; i < s.length; i++) d[i] = s[s.length - 1 - i]; return o; };
    const far = (b) => { const o = this.ctx.createBuffer(1, b.length, this.sr); const s = b.getChannelData(0), d = o.getChannelData(0); let y = 0; for (let i = 0; i < s.length; i++) { y += (s[i] - y) * 0.12; d[i] = y * 2.2; } return o; };
    this.R = {
      shot: this.B.shot.map(rev), shotFar: this.B.shot.map((b) => rev(far(b))), heavy: this.B.heavy.map(rev),
      boom: rev(this.B.boom), whiz: rev(this.B.whiz), whoosh: rev(this.B.whoosh),
    };
    // loops
    this.loops = {};
    this.loops.hiss = this.loop(this.makeNoiseLoop(r, 'hiss'), 0.035);
    this.loops.sea = this.loop(rev(this.makeSea(r)), 0.25);
    this.loops.wind = this.loop(this.makeNoiseLoop(r, 'wind'), 0.12);
    this.loops.heli = this.loop(this.makeHeli(r), 0);
    this.loops.drone = this.loop(this.makeDroneBuzz(r), 0);
    this.loops.battle = this.loop(rev(this.makeBattleBed(r)), 0.22);
    this.loops.fire = this.loop(this.makeNoiseLoop(r, 'fire'), 0);
    this.enabled = true;
  }

  // ---------- synthesis ----------
  buf(sec) { return this.ctx.createBuffer(1, Math.floor(sec * this.sr), this.sr); }
  makeShot(r, heavy) {
    const b = this.buf(0.6), d = b.getChannelData(0), sr = this.sr;
    let lp = 0, lp2 = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr, n = r() * 2 - 1;
      lp += (n - lp) * 0.25; lp2 += (n - lp2) * 0.04;
      const crack = n * Math.exp(-t / 0.006) * 1.0;
      const body = lp * Math.exp(-t / (0.05 + heavy * 0.04)) * 0.9;
      const thump = Math.sin(2 * Math.PI * (60 + heavy * -15) * t * (1 + Math.exp(-t / 0.02))) * Math.exp(-t / (0.07 + heavy * 0.05)) * (0.8 + heavy * 0.5);
      const tail = lp2 * Math.exp(-t / 0.25) * 0.6;
      d[i] = (crack + body + thump + tail) * 0.55 * Math.min(1, t / 0.0005);
    }
    return b;
  }
  makeBoom(r) {
    const b = this.buf(3.0), d = b.getChannelData(0), sr = this.sr;
    let lp = 0, lp2 = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr, n = r() * 2 - 1;
      lp += (n - lp) * 0.02; lp2 += (n - lp2) * 0.15;
      const v = lp * 6 * Math.exp(-t / 0.9) + lp2 * Math.exp(-t / 0.12) * 1.2 + Math.sin(2 * Math.PI * 38 * t) * Math.exp(-t / 0.4) * 0.9 + n * Math.exp(-t / 0.01) * 0.8;
      d[i] = Math.tanh(v * 1.1) * 0.95;
    }
    return b;
  }
  makeWhiz(r) {
    const b = this.buf(0.28), d = b.getChannelData(0), sr = this.sr;
    let ph = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr; const f = 2600 - t * 6000;
      ph += 2 * Math.PI * f / sr;
      const env = Math.sin(Math.PI * t / 0.28) ** 2;
      d[i] = (Math.sin(ph) * 0.3 + (r() * 2 - 1) * 0.4) * env * 0.5;
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
      else if (kind === 'wind') { a += (n - a) * 0.01; c = 0.6 + 0.4 * Math.sin(i / this.sr * 0.7 * Math.PI) ; d[i] = a * 6 * c; }
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
    const b = this.buf(2), d = b.getChannelData(0), sr = this.sr;
    let a = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr, n = r() * 2 - 1; a += (n - a) * 0.05;
      const blade = Math.pow(0.5 + 0.5 * Math.cos(2 * Math.PI * 5 * t), 6);
      d[i] = (a * 3 * (0.3 + blade) + Math.sin(2 * Math.PI * 22 * t) * 0.3 * blade) * 0.8;
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

  loop(buffer, gain) {
    const src = this.ctx.createBufferSource(); src.buffer = buffer; src.loop = true;
    const g = this.ctx.createGain(); g.gain.value = gain;
    src.connect(g).connect(this.master); src.start();
    return { src, g };
  }
  setLoop(name, gain, rate) {
    if (!this.enabled) return;
    const l = this.loops[name]; if (!l) return;
    l.g.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.08);
    if (rate) l.src.playbackRate.setTargetAtTime(rate, this.ctx.currentTime, 0.1);
  }

  play(buffer, gain = 1, pan = 0, rate = 1) {
    if (!this.enabled || !buffer) return;
    const now = this.ctx.currentTime;
    this.voices = this.voices.filter((v) => v.end > now);
    if (this.voices.length > 26) { const v = this.voices.shift(); try { v.src.stop(); } catch (e) { /* */ } }
    const src = this.ctx.createBufferSource(); src.buffer = buffer; src.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = gain;
    const p = this.ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
    src.connect(g).connect(p).connect(this.master);
    src.start();
    this.voices.push({ src, end: now + buffer.duration / rate });
  }

  // world sound at position, given listener
  at(kind, x, y, z, L, extra) {
    if (!this.enabled) return;
    const dx = x - L.x, dy = y - L.y, dz = z - L.z;
    const d = Math.hypot(dx, dy, dz);
    const pan = (dx * L.rx + dz * L.rz) / (d + 1);
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    if (kind === 'shot') {
      const g = 1.0 / (1 + d / 14);
      if (g < 0.02) return;
      if (extra === 2) this.play(pick(this.R.heavy), g * 1.3, pan, 0.9);
      else this.play(d > 55 ? pick(this.R.shotFar) : pick(this.R.shot), g * 0.8, pan, extra === 1 ? 0.92 + Math.random() * 0.05 : 1.02 + Math.random() * 0.05);
    } else if (kind === 'boom') {
      this.play(this.R.boom, Math.min(1.4, 2.5 / (1 + d / 30)) * extra, pan, 0.9 + Math.random() * 0.15);
    } else if (kind === 'whiz') {
      this.play(this.R.whiz, 0.5, pan, 0.9 + Math.random() * 0.3);
    }
  }
}
