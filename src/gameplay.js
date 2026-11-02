// The game on top of the tape.
//
// The tape plays your body's past backward. Four verbs make that something you do rather than watch:
//   CATCH    every round your body fired comes back out of whatever it hit and flies home to your gun.
//            Aim at where it landed as it leaves and it goes back in the magazine. Miss it and the tape slips.
//   TRACKING how well you're keeping your past. Shown as the tape speed: SP, LP, EP. At EP the people on the
//            tape can see you, and the ones on the other side shoot at you, live, off script.
//   SLOW     caught rounds charge the VCR's slow. Q: the tape crawls, you don't.
//   TAKE     kill someone and you're them (that was always true). Bodies still in the thick of it are marked,
//            so taking one is how you get from one fight to the next.
// The window each body has is cut into sub-battles from the data (where the fighting near you is), with lulls
// between them that the tape can skim at ×2.
import * as THREE from 'three';
import { SHOT_F, MODE, HZ } from './sim.js';

const TITLES = { beach: 'THE BEACH', sandwich: 'EAST SANDWICH', bomb: 'THE BOMB', jump: 'THE JUMP', port: 'THE PORT', ship: 'THE NIGHT BEFORE', ash: 'ASHLAND' };
const ROMAN = ['', '', ' II', ' III', ' IV', ' V', ' VI'];

// where on each tape a fight is, in words
function zone(scene, x, y, z, spd) {
  switch (scene) {
    case 'beach': return z > -14 ? 'THE SAND' : z > -66 ? (Math.abs(x) > 70 ? 'THE HOUSES' : 'THE CREST') : z > -84 ? 'THE BACK DUNE' : 'THE LOT';
    case 'sandwich': { const lz = Math.hypot(x + 58, z - 56), cr = Math.hypot(x - 40, z + 74); return lz < 34 ? 'THE MEADOW' : cr < 38 ? 'THE WRECK' : Math.abs(z) < 16 ? 'ROUTE 6A' : 'THE YARDS'; }
    case 'bomb': return spd > 7 ? 'ROUTE 135' : x > 1100 ? 'THE HAYFIELD' : x < -1300 ? 'THE COMMON' : 'THE ROADSIDE';
    case 'port': return y > 40 ? 'UNDER THE CANOPY' : y > 9 ? 'THE CRANES' : z > 62 ? 'THE QUAY' : z < -100 ? 'THE GATE' : 'THE BOX YARD';
    case 'ship': return y > 19 ? 'THE FLIGHT DECK' : x > 95 ? 'THE WELL DECK' : y > 8 ? 'THE STAIRS' : 'THE HANGAR';
    case 'ash': { if (Math.hypot(x + 62, z + 92) < 36 || Math.hypot(x - 22, z + 140) < 36) return 'THE CAMP'; if (Math.hypot(x - 92, z + 36) < 42) return 'THE LOT'; if (Math.hypot(x + 40, z - 70) < 122) return 'THE SHORE'; return 'THE WOODS'; }
    case 'jump': return 'THE HOLD';
  }
  return 'THE LINE';
}

const CSS = `
  #gpEcho { position: absolute; inset: 0; }
  .echo { position: absolute; left: 0; top: 0; transform: translate(-50%,-50%); display: none; text-align: center; color: #ffd36a; font-size: clamp(18px,2.2vw,26px); line-height: 1; }
  .echo i { position: absolute; left: 50%; top: 50%; border: 2px solid rgba(255,211,106,.85); border-radius: 50%; transform: translate(-50%,-50%); box-shadow: 0 0 6px rgba(0,0,0,.6); }
  .echo b { font-weight: normal; display: block; }
  .echo span { position: absolute; left: 50%; top: 120%; transform: translateX(-50%); font-size: .7em; white-space: nowrap; opacity: .85; }
  .echo.live { color: #fff4cf; } .echo.live i { border-color: #fff4cf; border-width: 3px; }
  .echo.on { color: #8dffb0; } .echo.on i { border-color: #8dffb0; }
  .echo.edge b { font-size: 1.2em; }
  .pop { position: absolute; transform: translate(-50%,-50%); font-size: clamp(18px,2.2vw,26px); pointer-events: none; transition: transform .7s ease-out, opacity .7s; white-space: nowrap; }
  .take { position: absolute; left: 0; top: 0; transform: translate(-50%,-100%); display: none; text-align: center; font-size: clamp(15px,1.7vw,19px); line-height: 1; opacity: .9; }
  .take b { display: block; font-weight: normal; font-size: 1.3em; }
  #gpObj { position: absolute; top: 15.5%; left: 5%; font-size: clamp(16px,2vw,22px); line-height: 1.3; opacity: .92; }
  #gpObj small { opacity: .7; font-size: .85em; }
  #gpSeg { position: absolute; left: 0; right: 0; top: 17%; text-align: center; font-size: clamp(24px,4vw,46px); opacity: 0; transition: opacity .5s; line-height: 1.05; }
  #gpSeg small { display: block; font-size: .45em; opacity: .8; letter-spacing: 3px; }
  #gpSlow { position: absolute; bottom: 5%; left: calc(5% + clamp(150px,18vw,230px)); font-size: clamp(16px,2vw,22px); opacity: .85; }
  #sp.ep { color: #ff6a55; animation: gpblink .5s steps(2,start) infinite; }
  #sp.lp { color: #ffd36a; }
  @keyframes gpblink { to { opacity: .35; } }
`;

export class Gameplay {
  constructor(hooks) {
    this.h = hooks;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const hud = document.getElementById('hud');
    const mk = (tag, id, cls) => { const e = document.createElement(tag); if (id) e.id = id; if (cls) e.className = cls; hud.appendChild(e); return e; };
    this.echoBox = mk('div', 'gpEcho');
    this.echoEls = [0, 1, 2, 3].map(() => { const e = document.createElement('div'); e.className = 'echo'; e.innerHTML = '<i></i><b>&#9671;</b><span></span>'; this.echoBox.appendChild(e); return e; });
    this.takeEls = [0, 1].map(() => { const e = document.createElement('div'); e.className = 'take'; e.innerHTML = '<b>&#9670;</b>TAKE'; this.echoBox.appendChild(e); return e; });
    this.objEl = mk('div', 'gpObj'); this.segEl = mk('div', 'gpSeg'); this.slowEl = mk('div', 'gpSlow');
    this.spEl = document.getElementById('sp');
    this.v = new THREE.Vector3(); this.v2 = new THREE.Vector3(); this.f = new THREE.Vector3();
    this.lullAuto = true;
    this.taught = {};
    this.runLog = [];
    this.reset();
  }

  // ------------------------------------------------------------ setup
  reset() {
    this.trk = 100; this.slow = 0; this.slowOn = false; this.autoX = 1;
    this.stats = { caught: 0, total: 0, clean: 0, segs: 0, trkSum: 0, trkN: 0, takes: 0 };
    this.judged = new Set(); this.face = new Map(); this.aware = new Map(); this.hits = [];
    this.lastMiss = -9; this.real = 0; this.segOn = -1; this.segDone = new Set(); this.segStat = new Map();
    this.cue = new Set(); this.wasLull = false; this.bres = new Map(); this.cineUntil = -1;
  }
  setTape(S, scene) {
    this.S = S; this.scene = scene;
    if (!S._gp) {
      // index every shot by who fired it (ascending fire time, as the shots are stored)
      const by = new Map(), A = S.shots;
      for (let i = 0; i < S.nShots; i++) { const sh = A[i * SHOT_F + 8]; if (sh < 0) continue; let l = by.get(sh); if (!l) by.set(sh, l = []); l.push(i); }
      const deathBy = new Map(); for (const d of S.deaths) if (d.killer != null && d.killer >= 0) deathBy.set(d.id, d);
      S._gp = { by, deathBy, bursts: new Map(), segs: new Map() };
    }
    this.D = S._gp;
  }
  rec(id, t, out) {
    const S = this.S, st = Math.max(0, Math.min(S.steps - 1, Math.round(t * HZ))), o = (id * S.steps + st) * 9, r = S.rec;
    out.x = r[o]; out.y = r[o + 1]; out.z = r[o + 2]; out.mode = r[o + 8]; return out;
  }
  // your body's shots, grouped into bursts at one target
  bursts(id) {
    let b = this.D.bursts.get(id); if (b) return b;
    const A = this.S.shots, l = this.D.by.get(id) || []; b = [];
    let cur = null;
    for (const si of l) {
      const o = si * SHOT_F, ft = A[o], it = A[o + 1], tg = A[o + 9];
      if (cur) {
        const lo = cur.last * SHOT_F;
        const far = Math.hypot(A[lo + 5] - A[o + 5], A[lo + 6] - A[o + 6], A[lo + 7] - A[o + 7]);
        if (ft - A[lo] > 1.3 || (tg !== cur.target && tg >= 0 && cur.target >= 0) || far > 4.5) cur = null;
      }
      if (!cur) { cur = { shots: [], t0: ft, t1: it, target: tg, last: si, kill: false }; b.push(cur); }
      cur.shots.push(si); cur.last = si; cur.t1 = Math.max(cur.t1, it); if (cur.target < 0 && tg >= 0) cur.target = tg;
    }
    for (const u of b) { const d = u.target >= 0 && this.D.deathBy.get(u.target); u.kill = !!(d && d.killer === id && d.t >= u.t0 - 0.05 && d.t <= u.t1 + 0.35); }
    this.D.bursts.set(id, b);
    return b;
  }
  // how much is going on around a body, second by second, cut into the fights and the waits between them
  segments(id) {
    let sg = this.D.segs.get(id); if (sg) return sg;
    const S = this.S, me = S.actors[id], A = S.shots, n = S.nShots;
    const t1 = Math.max(0, me.spawn); let t2 = Math.min(S.steps / HZ - 0.1, me.deathTime > 0 ? me.deathTime : S.steps / HZ - 0.1);
    { const q = {}; while (t2 > t1 + 1 && this.rec(id, t2, q).mode === MODE.HIDDEN) t2 -= 0.5; }   // gone aboard, or not yet arrived
    const T0 = Math.floor(t1), T1 = Math.ceil(t2), len = Math.max(1, T1 - T0);
    const act = new Float32Array(len), pos = [], p = {}, q = {};
    for (let k = 0; k < len; k++) {
      const t = T0 + k + 0.5; this.rec(id, t, p); pos.push([p.x, p.y, p.z]);
      let a = 0;
      for (const o of S.actors) {
        if (o.id === id || o.side === me.side || o.spawn > t || (o.deathTime > 0 && o.deathTime < t)) continue;
        this.rec(o.id, t, q); if (q.mode !== MODE.GROUND) continue;
        const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < 38) a += 0.7; else if (d < 70) a += 0.15;
      }
      act[k] = a;
    }
    // shots: your own, and anyone else's that passes close
    let i0 = 0; while (i0 < n && A[i0 * SHOT_F] < T0) i0++;
    for (let si = i0; si < n; si++) {
      const o = si * SHOT_F, ft = A[o]; if (ft >= T1) break;
      const k = Math.floor(ft - T0); if (k < 0 || k >= len) continue;
      if (A[o + 8] === id) { act[k] += 0.9; continue; }
      const [px, , pz] = pos[k], sx = A[o + 2], sz = A[o + 4], dx = A[o + 5] - sx, dz = A[o + 7] - sz, L2 = dx * dx + dz * dz || 1;
      const u = Math.max(0, Math.min(1, ((px - sx) * dx + (pz - sz) * dz) / L2));
      if (Math.hypot(sx + dx * u - px, sz + dz * u - pz) < 8) act[k] += 0.22;
    }
    for (const e of S.explosions) { const k = Math.floor(e.t - T0); if (k >= 0 && k < len) { const [px, , pz] = pos[k]; if (Math.hypot(e.ix - px, e.iz - pz) < 50) act[Math.min(len - 1, k)] += 3; } }
    // smooth, threshold, merge close runs, drop short ones
    const sm = new Float32Array(len);
    for (let k = 0; k < len; k++) { let s = 0, c = 0; for (let j = Math.max(0, k - 3); j <= Math.min(len - 1, k + 3); j++) { s += act[j]; c++; } sm[k] = s / c; }
    let runs = []; let start = -1;
    for (let k = 0; k <= len; k++) { const on = k < len && sm[k] > 1.1; if (on && start < 0) start = k; if (!on && start >= 0) { runs.push([start, k]); start = -1; } }
    const merged = [];
    for (const r of runs) { const l = merged[merged.length - 1]; if (l && r[0] - l[1] < 9) l[1] = r[1]; else merged.push([...r]); }
    runs = merged.filter((r) => r[1] - r[0] >= 9);
    // long fights get split where you move a long way, so a sub-battle is one place
    const out = [];
    for (const [a, b] of runs) {
      let s = a;
      if (Math.hypot(pos[b - 1][0] - pos[a][0], pos[b - 1][2] - pos[a][2]) / (b - a) > 7) { out.push([a, b]); continue; }   // a run down a road is one fight, however far it goes
      for (let k = a + 12; k < b; k++) { const P = pos[s], Q = pos[k]; if (Math.hypot(Q[0] - P[0], Q[2] - P[2]) > 55 && b - k >= 9 && k - s >= 12) { out.push([s, k]); s = k; } }
      out.push([s, b]);
    }
    // a long fight in one place is several: cut it where it eases off most
    for (let k = 0; k < out.length; k++) {
      const [a, b] = out[k]; if (b - a < 56) continue;
      let best = -1, bv = 1e9; for (let j = a + 22; j <= b - 22; j++) if (sm[j] < bv) { bv = sm[j]; best = j; }
      if (best > 0) { out.splice(k, 1, [a, best], [best, b]); k--; }
    }
    sg = out.map(([a, b]) => {
      const med = (j) => { const v = pos.slice(a, b).map((q) => q[j]).sort((x, y) => x - y); return v[v.length >> 1]; };   // where you spend the fight, not its average
      const mx = med(0), my = med(1), mz = med(2), c = b - a;
      const spd = Math.hypot(pos[b - 1][0] - pos[a][0], pos[b - 1][2] - pos[a][2]) / c;
      return { t0: T0 + a, t1: T0 + b, name: zone(this.scene, mx, my, mz, spd) };
    });
    for (const q of sg) q.base = q.name;
    this.D.segs.set(id, sg);
    return sg;
  }
  setBody(id, tau) {
    this.body = id; this.myBursts = this.bursts(id); this.mySegs = this.segments(id);
    this.myShots = this.D.by.get(id) || []; this._bo = null;
    // anything already behind you on this body's tape (later in time than now) doesn't count
    for (const si of this.myShots) if (this.S.shots[si * SHOT_F] >= tau) this.judged.add(si);
    this.segOn = -1;
    for (let k = 0; k < this.mySegs.length; k++) if (this.mySegs[k].t0 >= tau) this.segDone.add(id * 100 + k);
    // the same place twice gets a numeral, counted in the order you'll play them (backward) from where you came in
    { const seen = {}; for (let k = this.mySegs.length - 1; k >= 0; k--) { const q = this.mySegs[k]; if (q.t0 >= tau) continue; seen[q.base] = (seen[q.base] || 0) + 1; q.name = q.base + (seen[q.base] > 1 ? ' ' + ['', '', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][Math.min(8, seen[q.base])] : ''); } }
    this.aware.clear(); this.face.clear();
  }
  onTake(friendly) { this.stats.takes++; this.trk = Math.max(this.trk, 65); this.bump(friendly ? -10 : 5); this.slow = Math.min(1, this.slow + 0.06); }
  bump(d) { this.trk = Math.max(0, Math.min(100, this.trk + d)); if (d < 0) this.lastMiss = this.real; }
  trySlow() { if (this.slowOn) { this.slowOn = false; return true; } if (this.slow >= 0.2) { this.slowOn = true; this.h.sound('slow'); return true; } return false; }
  snapshot() { return { bres: new Map([...this.bres].map(([k, v]) => [k, { ...v }])), trk: this.trk, slow: this.slow, stats: { ...this.stats }, judged: new Set(this.judged), segDone: new Set(this.segDone), segStat: new Map([...this.segStat].map(([k, v]) => [k, { ...v }])) }; }
  restore(s, body, tau) { this.bres = new Map([...s.bres].map(([k, v]) => [k, { ...v }])); this.trk = Math.max(60, s.trk); this.slow = s.slow; this.stats = { ...s.stats }; this.judged = new Set(s.judged); this.segDone = new Set(s.segDone); this.segStat = new Map([...s.segStat].map(([k, v]) => [k, { ...v }])); this.slowOn = false; this.setBody(body, tau); }
  grade(t = this.trk) { return t >= 70 ? 'SP' : t >= 35 ? 'LP' : 'EP'; }
  finishTape() {
    const s = this.stats, avg = s.trkN ? s.trkSum / s.trkN : this.trk;
    const rate = s.total ? s.caught / s.total : 1;
    const g = avg >= 72 && rate >= 0.6 ? 'SP' : avg >= 45 && rate >= 0.35 ? 'LP' : 'EP';
    this.runLog.push({ title: TITLES[this.scene] || this.scene, grade: g, caught: s.caught, total: s.total, clean: s.clean, segs: s.segs, takes: s.takes });
    this.hideAll();
    return g;
  }
  vis(on) { if (on === this._vis) return; this._vis = on; this.echoBox.style.display = this.objEl.style.display = this.slowEl.style.display = on ? '' : 'none'; if (!on) { this.segEl.style.opacity = 0; this.spEl.className = ''; this.spEl.innerHTML = 'SP &nbsp;BETAMAX'; } }
  hideAll() { for (const e of this.echoEls) e.style.display = 'none'; for (const e of this.takeEls) e.style.display = 'none'; this.objEl.innerHTML = ''; this.slowEl.textContent = ''; this.segEl.style.opacity = 0; this.spEl.className = ''; this.spEl.innerHTML = 'SP &nbsp;BETAMAX'; }

  // ------------------------------------------------------------ per frame
  // v: { camera, player, pb, tau, tauPrev, dt, touch, muzzle(), alive(i,t), los(a,b) }
  update(v) {
    const S = this.S, A = S.shots, { camera, player: p, pb, tau, tauPrev, dt } = v;
    this.real += dt; this.hits.length = 0;
    const me = S.actors[this.body], side = me.side;
    camera.getWorldDirection(this.f);
    const cam = camera.position;
    const past = this.rec(this.body, tau, {});
    const dPast = Math.hypot(p.pos.x - past.x, p.pos.z - past.z);
    const playing = v.playing;

    // ---- slow
    if (this.slowOn) { this.slow -= dt / 6; if (this.slow <= 0) { this.slow = 0; this.slowOn = false; this.h.sound('slowEnd'); } }

    // ---- catches: judge each of your past rounds as the tape passes the moment it left your gun
    if (playing && tau < tauPrev) {
      const l = this.myShots;
      let lo = 0, hi = l.length; while (lo < hi) { const m = (lo + hi) >> 1; if (A[l[m] * SHOT_F] < tau) lo = m + 1; else hi = m; }
      for (let k = lo; k < l.length; k++) {
        const si = l[k], o = si * SHOT_F, ft = A[o]; if (ft > tauPrev) break;
        if (this.judged.has(si)) continue;
        this.judged.add(si);
        this.v.set(A[o + 5], A[o + 6], A[o + 7]);
        const d = this.v2.subVectors(this.v, cam).length();
        const err = Math.acos(Math.max(-1, Math.min(1, this.v2.dot(this.f) / Math.max(1e-6, d))));
        const tol = Math.max(0.05, Math.atan2(1.05, d)) * (v.touch ? 1.6 : 1);
        const inRange = Math.hypot(p.pos.x - A[o + 2], p.pos.z - A[o + 4]) < 32;
        const ok = inRange && err < tol;
        const b = this.burstOf(si);
        let r = this.bres.get(b); if (!r) this.bres.set(b, r = { c: 0, n: 0 }); r.n++; if (ok) r.c++;
        if (ok) { this.h.caught(this.v, si); }
        else this.h.dropped(this.v, new THREE.Vector3(A[o + 2], A[o + 3], A[o + 4]));
        if (r.n === b.shots.length) this.judgeBurst(b, r, inRange);
      }
    }

    // ---- markers for rounds about to come home
    const show = [];
    if (playing) {
      const bs = this.myBursts;
      for (let k = bs.length - 1; k >= 0 && show.length < 4; k--) {
        const b = bs[k];
        if (b.t0 > tau + 0.05) continue;    // already behind you
        if (b.t1 < tau - 2.6) break;        // not yet
        const r = this.bres.get(b); if (r && r.n === b.shots.length) continue;
        show.push(b);
      }
    }
    const W = innerWidth, H = innerHeight;
    for (let k = 0; k < this.echoEls.length; k++) {
      const e = this.echoEls[k], b = show[k];
      if (!b) { e.style.display = 'none'; continue; }
      // aim at the next round of this burst still to come home
      let si = b.shots[b.shots.length - 1];
      for (let j = b.shots.length - 1; j >= 0; j--) if (!this.judged.has(b.shots[j])) { si = b.shots[j]; break; }
      const o = si * SHOT_F; this.v.set(A[o + 5], A[o + 6], A[o + 7]);
      const live = tau <= b.t1 + 0.05;
      const lead = Math.max(0, tau - b.t1);
      this.v2.copy(this.v).project(camera);
      let x = (this.v2.x * 0.5 + 0.5) * W, y = (-this.v2.y * 0.5 + 0.5) * H;
      const behind = this.v2.z > 1, off = behind || x < 0 || x > W || y < 0 || y > H;
      if (off) { // pin to the edge, pointing the way
        let dx = x - W / 2, dy = y - H / 2; if (behind) { dx = -dx; dy = -dy; }
        const s = Math.min((W / 2 - 40) / Math.max(1e-3, Math.abs(dx)), (H / 2 - 40) / Math.max(1e-3, Math.abs(dy)));
        x = W / 2 + dx * s; y = H / 2 + dy * s;
        e.querySelector('b').innerHTML = '&#9650;'; e.querySelector('b').style.transform = `rotate(${Math.atan2(dx, -dy)}rad)`;
      } else { e.querySelector('b').innerHTML = live ? '&#9670;' : '&#9671;'; e.querySelector('b').style.transform = ''; }
      const d = this.v.distanceTo(cam);
      const err = Math.acos(Math.max(-1, Math.min(1, this.v2.subVectors(this.v, cam).dot(this.f) / Math.max(1e-6, d))));
      const on = !off && err < Math.max(0.05, Math.atan2(1.05, d)) * (v.touch ? 1.6 : 1);
      e.className = 'echo' + (live ? ' live' : '') + (on ? ' on' : '') + (off ? ' edge' : '');
      const ring = off ? 0 : 20 + lead * 26;
      const ri = e.querySelector('i'); ri.style.width = ri.style.height = ring + 'px'; ri.style.display = off ? 'none' : '';
      const rr = this.bres.get(b), left = b.shots.length - (rr ? rr.n : 0);
      const wreck = b.kill && this.scene === 'bomb' && S.actors[b.target] && S.actors[b.target].car >= 0;
      e.querySelector('span').textContent = (wreck ? 'UN-WRECK ' : b.kill ? 'KILL ' : '') + (left > 1 ? '×' + left : '');
      if (wreck && live) this.cineUntil = this.real + 0.25;   // the tape slows itself for the wrecks you made
      e.style.display = ''; e.style.left = x + 'px'; e.style.top = y + 'px';
      if (!this.cue.has(b)) { this.cue.add(b); this.h.sound('cue'); if (!this.taught.catch) { this.taught.catch = true; this.h.teach('Your rounds are coming home. Aim where they landed as they leave &mdash; <em>catch them</em> back into the magazine.'); } }
    }

    // ---- tracking
    if (playing) {
      if (dPast > 30) { this.bump(-dt * (dPast > 60 ? 6 : 3)); }
      else if (this.real - this.lastMiss > 6) this.trk = Math.min(100, this.trk + dt * 1.2);
      this.stats.trkSum += this.trk * dt; this.stats.trkN += dt;
      if (this.trk <= 0) this.h.snap();
    }
    const g = this.grade();
    this.spEl.className = g === 'EP' ? 'ep' : g === 'LP' ? 'lp' : '';
    const blocks = Math.round(this.trk / 10);
    this.spEl.innerHTML = `${g} &nbsp;${'▮'.repeat(blocks)}<span style="opacity:.3">${'▮'.repeat(10 - blocks)}</span>${g === 'EP' ? ' &nbsp;THEY CAN SEE YOU' : dPast > 22 && playing ? ' &nbsp;TRACKING' : ''}`;
    if (g === 'EP' && playing && !this.taught.ep) { this.taught.ep = true; this.h.teach('Tracking lost. You’re not where you were &mdash; <em>and the tape can see you.</em> Catch rounds, get back to your past.'); }
    this.slowEl.innerHTML = this.slowOn ? '&#9664; SLOW' : this.slow >= 0.2 ? `${v.touch ? '' : '[V] '}SLOW ${'▮'.repeat(Math.round(this.slow * 5))}` : this.slow > 0 ? `<span style="opacity:.45">SLOW ${'▮'.repeat(Math.max(1, Math.round(this.slow * 5)))}</span>` : '';

    // ---- they can see you: live fire from the other side, off the tape
    this.face.clear();
    if (playing && g === 'EP') {
      const cands = [];
      for (let i = 0; i < S.N; i++) {
        if (i === this.body || S.actors[i].side === side) continue;
        const hh = pb.hit[i]; if (!hh.ok || !v.alive(i, tau)) continue;
        const d = Math.hypot(hh.pos.x - p.pos.x, hh.pos.z - p.pos.z); if (d < 65) cands.push([d, i]);
      }
      cands.sort((a, b) => a[0] - b[0]);
      const k = Math.max(0, 1 - this.trk / 35);
      for (const [d, i] of cands.slice(0, 3)) {
        const hh = pb.hit[i];
        this.face.set(i, Math.atan2(p.pos.x - hh.pos.x, p.pos.z - hh.pos.z));
        let t = this.aware.get(i); if (t === undefined) t = 0.8 + Math.random() * 1.2;
        t -= dt * (this.slowOn ? 0.3 : 1);
        if (t <= 0) {
          t = 1.5 + Math.random() * 1.6 - k * 0.6;
          this.v.copy(hh.neck); this.v.y -= 0.1;
          this.v2.set(p.pos.x, p.pos.y + p.eyeH * 0.75, p.pos.z);
          if (v.los(this.v, this.v2)) {
            const moving = Math.hypot(p.vel.x, p.vel.z) > 3;
            const prob = Math.max(0.08, 0.42 - d / 170) * (p.crouch > 0.5 ? 0.65 : 1) * (moving ? 0.7 : 1) * (0.7 + 0.5 * k);
            const hit = Math.random() < prob;
            const end = this.v2.clone(); if (!hit) { end.x += (Math.random() - 0.5) * 2.6; end.y += (Math.random() - 0.3) * 1.6; end.z += (Math.random() - 0.5) * 2.6; end.sub(this.v).multiplyScalar(1.6).add(this.v); }
            this.h.liveShot(this.v.clone(), end, side ? 0 : 1, d, hit);
            if (hit) this.hits.push({ dmg: 13 + Math.random() * 7, bullet: true, fromX: hh.pos.x, fromZ: hh.pos.z });
          }
        }
        this.aware.set(i, t);
      }
    } else this.aware.clear();

    // ---- sub-battles
    const sg = this.mySegs;
    let on = -1, next = -1;
    for (let k = sg.length - 1; k >= 0; k--) { if (tau <= sg[k].t1 + 0.01 && tau >= sg[k].t0) { on = k; break; } }
    for (let k = sg.length - 1; k >= 0; k--) if (sg[k].t1 < tau) { next = k; break; }
    if (playing && on !== this.segOn) {
      if (this.segOn >= 0) this.closeSeg(this.segOn);
      if (on >= 0 && !this.segDone.has(this.body * 100 + on)) {
        const left = sg.slice(0, on + 1).length;
        this.banner(`<small>&#9664; SUB-BATTLE &nbsp;${sg.length - on} / ${sg.length}</small>${sg[on].name}`);
        this.h.sound('seg');
      }
      this.segOn = on;
    }
    if (playing && this.segOn >= 0 && tau < sg[this.segOn].t0) { this.closeSeg(this.segOn); this.segOn = -1; }

    // ---- lulls: nothing near you on the tape for a while; skim it
    const hostileNear = this.hostileWithin(28, tau, p.pos);
    const toNext = next >= 0 ? tau - sg[next].t1 : tau - me.spawn;
    const inLull = playing && on < 0 && toNext > 7 && !hostileNear && this.real - (v.lastHit || -9) > 3 && !show.length;
    const wantX = inLull && this.lullAuto ? (toNext > 14 ? 3 : 2) : 1;   // a long wait goes by at ×3
    if (wantX !== this.autoX) { this.autoX = wantX; if (wantX === 1 && this.wasLull && next >= 0) this.h.sound('contact'); }
    this.wasLull = inLull;
    if (inLull && wantX > 1 && !this.taught.lull) { this.taught.lull = true; this.h.teach('Nothing on the tape here. It skims at &times;2 &mdash; or <em>take a body that’s still fighting</em> &#9670;'); }

    // ---- bodies still in the thick of it
    const takes = [];
    if (playing && (this.real | 0) !== this.lastTakeScan) {
      this.lastTakeScan = this.real | 0; this.takeList = [];
      const myHeat = this.heat(this.body, tau);
      for (let i = 0; i < S.N; i++) {
        if (i === this.body) continue; const a = S.actors[i], hh = pb.hit[i];
        if (!hh.ok || !v.alive(i, tau) || tau - a.spawn < 20) continue;
        const d = hh.pos.distanceTo(p.pos); if (d > 85 || d < 4) continue;
        const ht = this.heat(i, tau); if (ht >= 6 && ht > myHeat * 1.5 + 2) this.takeList.push([ht / (1 + d / 40), i]);
      }
      this.takeList.sort((a, b) => b[0] - a[0]); this.takeList.length = Math.min(2, this.takeList.length);
    }
    if (playing && this.takeList) for (const [, i] of this.takeList) takes.push(i);
    for (let k = 0; k < this.takeEls.length; k++) {
      const e = this.takeEls[k], i = takes[k];
      if (i === undefined || !pb.hit[i].ok) { e.style.display = 'none'; continue; }
      this.v.copy(pb.hit[i].head); this.v.y += 0.55; this.v2.copy(this.v).project(camera);
      if (this.v2.z > 1 || Math.abs(this.v2.x) > 1 || Math.abs(this.v2.y) > 1) { e.style.display = 'none'; continue; }
      e.style.display = ''; e.style.left = ((this.v2.x * 0.5 + 0.5) * W) + 'px'; e.style.top = ((-this.v2.y * 0.5 + 0.5) * H) + 'px';
      e.style.color = S.actors[i].side !== side ? '#ff9a70' : '#cfe3ff';
    }

    // ---- the objective line
    if (playing) {
      const fmt = (s) => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
      let html = '';
      if (on >= 0) {
        const ss = this.segStat.get(this.body * 100 + on) || { c: 0, n: 0 };
        const tot = this.myBursts.filter((b) => b.t1 <= sg[on].t1 + 0.01 && b.t0 >= sg[on].t0 - 0.01).length;
        html = `&#9664; ${sg[on].name} <small>${sg.length - on}/${sg.length}</small><br><small>${tot ? `CATCH ${ss.c}/${tot} &middot; ` : 'SURVIVE &middot; '}${fmt((tau - sg[on].t0) / (this.rate || 1))}</small>`;
      } else if (next >= 0) html = `<small>${this.autoX > 1 ? `&#9664;&#9664; &times;${this.autoX} &middot; ` : ''}NEXT: ${sg[next].name} IN ${fmt(toNext / (this.rate || 1))}</small>`;
      else html = `<small>${this.autoX > 1 ? `&#9664;&#9664; &times;${this.autoX} &middot; ` : ''}HOME</small>`;
      this.objEl.innerHTML = html;
    }
    return this.hits;
  }
  burstOf(si) {
    let b = this._bo && this._bo.get(si); if (b) return b;
    this._bo = this._bo || new Map();
    for (const u of this.myBursts) for (const s of u.shots) this._bo.set(s, u);
    return this._bo.get(si);
  }
  judgeBurst(b, r, inRange) {
    const ok = r.c / r.n >= 0.6;
    this.stats.total++; if (ok) this.stats.caught++;
    // count it toward the sub-battle it belongs to
    const sg = this.mySegs; for (let k = 0; k < sg.length; k++) if (b.t1 <= sg[k].t1 + 0.01 && b.t0 >= sg[k].t0 - 0.01) {
      const key = this.body * 100 + k; const s = this.segStat.get(key) || { c: 0, n: 0 }; s.n++; if (ok) s.c++; this.segStat.set(key, s);
    }
    if (ok) { this.bump(3 + b.shots.length * 0.4); this.slow = Math.min(1, this.slow + 0.025 + 0.01 * b.shots.length); }
    else this.bump(inRange ? -4 : -2);   // out of range is already costing you by the second
    this.h.burst(b, ok, inRange);
  }
  closeSeg(k) {
    const key = this.body * 100 + k; if (this.segDone.has(key)) return; this.segDone.add(key);
    const sg = this.mySegs[k], s = this.segStat.get(key) || { c: 0, n: 0 };
    const clean = (s.n === 0 || s.c / s.n >= 0.7) && this.trk >= 50;
    this.stats.segs++; if (clean) this.stats.clean++;
    if (clean) { this.slow = Math.min(1, this.slow + 0.25); this.bump(8); }
    this.h.segDone(sg, s, clean);
  }
  banner(html) { this.segEl.innerHTML = html; this.segEl.style.opacity = 1; clearTimeout(this.bt); this.bt = setTimeout(() => (this.segEl.style.opacity = 0), 2600); }
  pop(world, camera, text, color) {
    this.v.copy(world).project(camera); if (this.v.z > 1) return;
    const e = document.createElement('div'); e.className = 'pop'; e.textContent = text; e.style.color = color;
    e.style.left = ((this.v.x * 0.5 + 0.5) * innerWidth) + 'px'; e.style.top = ((-this.v.y * 0.5 + 0.5) * innerHeight) + 'px';
    this.echoBox.appendChild(e); requestAnimationFrame(() => { e.style.transform = 'translate(-50%,-180%)'; e.style.opacity = 0; }); setTimeout(() => e.remove(), 800);
  }
  hostileWithin(r, tau, pos) {
    const S = this.S, side = S.actors[this.body].side, q = {};
    for (const a of S.actors) {
      if (a.side === side || a.spawn > tau || (a.deathTime > 0 && a.deathTime < tau)) continue;
      this.rec(a.id, tau, q); if (q.mode !== MODE.GROUND) continue;
      if (Math.abs(q.x - pos.x) < r && Math.abs(q.z - pos.z) < r && Math.hypot(q.x - pos.x, q.z - pos.z) < r) return true;
    }
    return false;
  }
  // how many rounds a body fires in the next 20 s of tape (that is, the 20 s before now)
  heat(id, tau) {
    const l = this.D.by.get(id); if (!l) return 0; const A = this.S.shots;
    let lo = 0, hi = l.length; while (lo < hi) { const m = (lo + hi) >> 1; if (A[l[m] * SHOT_F] < tau - 20) lo = m + 1; else hi = m; }
    let n = 0; for (let k = lo; k < l.length && A[l[k] * SHOT_F] <= tau; k++) n++;
    return n;
  }
}
