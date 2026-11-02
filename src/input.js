// Keyboard + raw mouse (pointer lock) and a touch layout for phones and iPads.
const load = () => { try { return JSON.parse(localStorage.getItem('betamax-settings') || '{}'); } catch (e) { return {}; } };

export class Input {
  constructor(canvas, touchRoot) {
    this.keys = {}; this.mouse = { l: false, r: false };
    this.lx = 0; this.ly = 0;
    this.touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.t = { mx: 0, mz: 0, fire: false, ads: false, crouch: false, jump: false, reload: false, sprint: false };
    this.crouchToggle = false;
    this.canvas = canvas;
    this.settings = Object.assign({ sens: 1.0, touchSens: 1.0, invert: false, assist: true, adsHold: true, vcr: true }, load());
    this.jumpBuf = 0;
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys[e.code] = true;
      if (e.code === 'KeyC' || e.code === 'ControlLeft') this.crouchToggle = !this.crouchToggle;
      if (e.code === 'Space') { this.jumpBuf = 0.15; e.preventDefault(); }
      if (e.code === 'Digit1') this.slotReq = 1; if (e.code === 'Digit2') this.slotReq = 2; if (e.code === 'KeyX') this.slotReq = 3;
      if (e.code === 'KeyF' || e.code === 'KeyE') this.useReq = true;
    });
    addEventListener('wheel', (e) => { if (document.pointerLockElement === canvas && Math.abs(e.deltaY) > 2) { const n = performance.now(); if (n - (this.wheelT || 0) > 250) { this.slotReq = 3; this.wheelT = n; } } }, { passive: true });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas) return;
      // drop the occasional bogus spike some browsers emit on lock/unlock
      if (Math.abs(e.movementX) > 350 || Math.abs(e.movementY) > 350) return;
      this.lx += e.movementX; this.ly += e.movementY;
    });
    addEventListener('mousedown', (e) => { if (document.pointerLockElement !== canvas) return; if (e.button === 0) this.mouse.l = true; if (e.button === 2) { this.mouse.r = this.settings.adsHold ? true : !this.mouse.r; } });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.mouse.l = false; if (e.button === 2 && this.settings.adsHold) this.mouse.r = false; });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('blur', () => { this.keys = {}; this.mouse.l = this.mouse.r = false; });
    if (this.touch) this.buildTouch(touchRoot);
  }

  save() { try { localStorage.setItem('betamax-settings', JSON.stringify(this.settings)); } catch (e) { /* storage unavailable */ } }
  get locked() { return document.pointerLockElement === this.canvas; }

  lock() {
    if (this.touch && !matchMedia('(pointer: fine)').matches) return;
    const c = this.canvas;
    try {
      const p = c.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { const q = c.requestPointerLock(); if (q && q.catch) q.catch(() => {}); } catch (e) { /* */ } });
    } catch (e) { try { c.requestPointerLock(); } catch (e2) { /* */ } }
  }

  buildTouch(root) {
    root.style.display = 'block';
    const stick = root.querySelector('#stick'), knob = root.querySelector('#knob');
    let sid = null, sx = 0, sy = 0, lid = null, lpx = 0, lpy = 0;
    const lookMove = (x, y) => {
      const dx = x - lpx, dy = y - lpy; lpx = x; lpy = y;
      // response curve: precise for small drags, quick for flicks
      const k = this.settings.touchSens * 1.25;
      const ax = Math.abs(dx), ay = Math.abs(dy);
      this.lx += dx * k * (0.8 + Math.min(ax, 30) * 0.035);
      this.ly += dy * k * (0.8 + Math.min(ay, 30) * 0.035);
    };
    const btn = (id, key, toggle) => {
      const el = root.querySelector(id);
      el.addEventListener('touchstart', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (toggle) { this.t[key] = !this.t[key]; el.classList.toggle('on', this.t[key]); }
        else { this.t[key] = true; el.classList.add('on'); }
        if (key === 'jump') this.jumpBuf = 0.15;
        if (key === 'fire') { const tt = e.changedTouches[0]; lid = tt.identifier; lpx = tt.clientX; lpy = tt.clientY; }
      }, { passive: false });
      const up = (e) => { e.preventDefault(); if (!toggle) { this.t[key] = false; el.classList.remove('on'); } if (key === 'fire') lid = null; };
      el.addEventListener('touchend', up, { passive: false }); el.addEventListener('touchcancel', up, { passive: false });
    };
    for (const [id, f] of [['#bSwap', () => (this.useReq = true)], ['#bGun', () => (this.slotReq = 3)]]) { const el = root.querySelector(id); if (el) el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); f(); }, { passive: false }); }
    btn('#bFire', 'fire'); btn('#bFire2', 'fire'); btn('#bAds', 'ads', true); btn('#bCrouch', 'crouch', true); btn('#bJump', 'jump'); btn('#bReload', 'reload');
    this.syncTouch = () => { root.querySelector('#bAds').classList.toggle('on', this.t.ads); root.querySelector('#bCrouch').classList.toggle('on', this.t.crouch); };
    root.addEventListener('touchstart', (e) => {
      for (const tt of e.changedTouches) {
        if (tt.clientX < innerWidth * 0.42 && sid === null) {
          sid = tt.identifier; sx = tt.clientX; sy = tt.clientY;
          stick.style.left = (sx - 60) + 'px'; stick.style.top = (sy - 60) + 'px'; stick.style.bottom = 'auto'; stick.style.opacity = 1;
        } else if (lid === null) { lid = tt.identifier; lpx = tt.clientX; lpy = tt.clientY; }
      }
    }, { passive: false });
    root.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const tt of e.changedTouches) {
        if (tt.identifier === sid) {
          let dx = tt.clientX - sx, dy = tt.clientY - sy; const d = Math.hypot(dx, dy), m = 55;
          // floating stick: drag the base along if the thumb overruns it
          if (d > m * 1.25) { sx += dx / d * (d - m * 1.25); sy += dy / d * (d - m * 1.25); stick.style.left = (sx - 60) + 'px'; stick.style.top = (sy - 60) + 'px'; dx = tt.clientX - sx; dy = tt.clientY - sy; }
          const dd = Math.hypot(dx, dy); const cl = Math.min(dd, m);
          const nx = dd > 0 ? dx / dd * cl : 0, ny = dd > 0 ? dy / dd * cl : 0;
          knob.style.transform = `translate(${nx}px,${ny}px)`;
          const mag = Math.max(0, (cl - 6) / (m - 6)); // small dead zone
          this.t.mx = dd > 0 ? (dx / dd) * mag : 0; this.t.mz = dd > 0 ? (-dy / dd) * mag : 0;
          this.t.sprint = dd > m * 1.05 && -dy / dd > 0.7;
        } else if (tt.identifier === lid) lookMove(tt.clientX, tt.clientY);
      }
    }, { passive: false });
    const end = (e) => {
      for (const tt of e.changedTouches) {
        if (tt.identifier === sid) { sid = null; this.t.mx = this.t.mz = 0; this.t.sprint = false; knob.style.transform = ''; stick.style.opacity = 0.35; }
        if (tt.identifier === lid) lid = null;
      }
    };
    root.addEventListener('touchend', end); root.addEventListener('touchcancel', end);
  }

  read(dt) {
    const k = this.keys, s = this.settings;
    this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    const inv = s.invert ? -1 : 1;
    const ms = this.touch && !this.locked ? 1 : s.sens;
    const o = {
      moveX: Math.max(-1, Math.min(1, (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0) + this.t.mx)),
      moveZ: Math.max(-1, Math.min(1, (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0) + this.t.mz)),
      lookX: this.lx * ms, lookY: this.ly * ms * inv,
      fire: this.mouse.l || this.t.fire,
      ads: this.mouse.r || this.t.ads || !!k.KeyQ,
      crouch: this.crouchToggle || this.t.crouch,
      jump: this.jumpBuf > 0,
      reload: k.KeyR || this.t.reload,
      sprint: k.ShiftLeft || k.ShiftRight || this.t.sprint,
      touchLook: this.touch && !this.locked,
      slot: this.slotReq || 0, use: !!this.useReq,
    };
    this.slotReq = 0; this.useReq = false;
    this.lx = this.ly = 0; this.t.reload = false;
    return o;
  }
  consumeJump() { this.jumpBuf = 0; }
}
