import * as THREE from 'three';
import { heightAt, ARENA } from './terrain.js';
import { Arms, evalReload, pathPoint, reloadDuration } from './weapons.js';
import { WEAPONS, primaryOf, sidearmOf } from './arsenal.js';

export class Player {
  constructor(camera, scene, flashTex) {
    this.cam = camera;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; this.crouch = 0; this.onGround = true;
    this.health = 100; this.side = 0; this.ammo = 20; this.mag = 20; this.cool = 0; this.ads = 0;
    this.recoil = 0; this.recoilYaw = 0; this.bob = 0; this.lastHit = -10; this.shake = 0;
    this.reloadT = -1; this.reloadTac = false; this.reloadDur = 0; this.events = [];
    this.vm = new THREE.Group(); camera.add(this.vm);
    this.flashTex = flashTex;
    this.arms = [new Arms(0), new Arms(1)];
    this.arms.forEach((a) => { this.vm.add(a.g); a.g.visible = false; });
    this.cache = new Map(); this.gunObj = null;
    this.slots = { primary: { id: 'm7', ammo: 21 }, sidearm: { id: 'm18', ammo: 18 } }; this.cur = 'primary';
    this.swapT = -1; this.swapTo = null; this.trigHeld = false;
    this.muzzleLight = new THREE.PointLight(0xffaa55, 0, 9, 2); scene.add(this.muzzleLight);
    this.flashT = 0;
    this.tmp = new THREE.Vector3();
    this.rl = { gunOff: new THREE.Vector3(), gunRot: new THREE.Euler(), path: null, magState: 'in', events: [], jolt: 0, seat: 0 };
    this.lastEvT = 0;
  }

  // a gun model, built the first time it's needed
  model(id) {
    if (this.cache.has(id)) return this.cache.get(id);
    const g = WEAPONS[id].build(), ud = g.userData;
    g.visible = false;
    g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
    this.vm.add(g);
    ud.handMag = ud.makeMag(); ud.handMag.visible = false; ud.handMag.position.set(0, 0.06, -0.03);
    ud.handMag.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    ud.chHome = ud.chargeHandle.position.z;
    const fm = new THREE.MeshBasicMaterial({ map: this.flashTex, color: new THREE.Color(4, 2.4, 1.1), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const s = ud.suppressed ? 0.12 : ud.pistol ? 0.16 : ud.tube ? 0.42 : 0.3;
    const f1 = new THREE.Mesh(new THREE.PlaneGeometry(s, s), fm); f1.position.set(0, 0.0, ud.muzzleZ - s * 0.3);
    const f2 = new THREE.Mesh(new THREE.PlaneGeometry(s * 0.6, s * 1.8), fm); f2.rotation.y = Math.PI / 2; f2.position.copy(f1.position);
    g.add(f1, f2); f1.visible = f2.visible = false; ud.flash = f1; ud.flash2 = f2;
    this.cache.set(id, g);
    return g;
  }
  // become a body: its own weapon, and the sidearm everyone on its side carries
  setBody(a) { this.setLoadout(a.side, primaryOf(a), sidearmOf(a.side)); }
  setSide(side) { this.setLoadout(side, side === 0 ? 'm7' : 'x95', sidearmOf(side)); }
  setLoadout(side, primary, sidearm, slots) {
    this.side = side;
    this.arms.forEach((a, i) => (a.g.visible = i === side));
    const full = (id) => WEAPONS[id] && (this.model(id).userData.magSize + (this.model(id).userData.tube ? 0 : 1));
    this.slots = slots ? JSON.parse(JSON.stringify(slots)) : { primary: { id: primary, ammo: full(primary) }, sidearm: { id: sidearm, ammo: full(sidearm) } };
    this.cur = 'primary'; this.swapT = -1; this.swapTo = null;
    this.equip();
  }
  equip() {
    if (this.gunObj) { this.gunObj.visible = false; this.gunObj.userData.handMag.visible = false; }
    const sl = this.slots[this.cur], g = this.model(sl.id), ud = g.userData;
    this.gunObj = g; g.visible = true;
    this.arms[this.side].hand[0].add(ud.handMag); ud.handMag.visible = false;
    this.mag = ud.magSize; this.ammo = sl.ammo; this.reloadT = -1;
    ud.mag.visible = true;
  }
  // 1 / 2 / wheel: lower one gun and bring up the other
  switchTo(slot) {
    if (slot === this.cur || this.swapT >= 0) return false;
    this.swapTo = slot; this.swapT = 0; this.reloadT = -1; return true;
  }
  // take a gun off the ground into the primary slot; returns what you put down
  pickUp(id) {
    const old = this.slots.primary;
    this.slots[this.cur].ammo = this.ammo;
    this.slots.primary = { id, ammo: this.model(id).userData.magSize + (this.model(id).userData.tube ? 0 : 1) };
    if (this.cur === 'primary') this.ammo = this.slots.primary.ammo;
    this.swapTo = 'primary'; this.swapT = 0; this.reloadT = -1;
    return old;
  }
  get weaponName() { return WEAPONS[this.slots[this.cur].id].name; }
  get gun() { return this.gunObj; }
  get eyeH() { return 1.62 - this.crouch * 0.55; }
  get reloading() { return this.reloadT >= 0; }
  get reload() { return this.reloadT >= 0 ? 1 : 0; }

  startReload() {
    if (this.reloadT >= 0 || this.ammo >= this.mag + 1) return;
    if (this.swapT >= 0) return;
    this.reloadTac = this.ammo > 0;
    this.reloadT = 0; this.lastEvT = -1;
    const ud = this.gun.userData; if (ud.tube && this.ammo >= this.mag) return void (this.reloadT = -1);
    this.rl.missing = this.mag - this.ammo;
    this.reloadDur = reloadDuration(ud, this.reloadTac, this.rl.missing);
  }

  update(dt, inp, obs, tau) {
    const sens = 0.0022 * (1 - this.ads * 0.32);
    this.yaw -= inp.lookX * sens; this.pitch -= inp.lookY * sens;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    this.crouch += ((inp.crouch ? 1 : 0) - this.crouch) * Math.min(1, dt * 10);
    this.ads += ((inp.ads && this.reloadT < 0 ? 1 : 0) - this.ads) * Math.min(1, dt * 13);
    const sprint = inp.sprint && inp.moveZ > 0.3 && this.ads < 0.3 && this.crouch < 0.3;
    let sp = (sprint ? 6.6 : 4.2) * (this.gun.userData.heavy || 1);
    sp *= 1 - this.crouch * 0.45; sp *= 1 - this.ads * 0.35;
    if (this.reloadT >= 0) sp *= 0.8;
    const gy0 = heightAt(this.pos.x, this.pos.z);
    if (gy0 < -0.25) sp *= 0.6;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    let wx = fx * inp.moveZ + rx * inp.moveX, wz = fz * inp.moveZ + rz * inp.moveX;
    const l = Math.hypot(wx, wz); if (l > 1) { wx /= l; wz /= l; }
    const want = Math.hypot(wx, wz) > 0.01;
    const acc = this.onGround ? (want ? 16 : 22) : 2.5;
    this.vel.x += (wx * sp - this.vel.x) * Math.min(1, dt * acc);
    this.vel.z += (wz * sp - this.vel.z) * Math.min(1, dt * acc);
    this.coyote = this.onGround ? 0.12 : Math.max(0, (this.coyote || 0) - dt);
    this.jumped = false;
    if (inp.jump && this.coyote > 0 && this.vel.y <= 0.5) { this.vel.y = 4.8; this.onGround = false; this.coyote = 0; this.jumped = true; }
    this.vel.y -= 18 * dt;
    let nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    // solid world: slide along walls, hulls, railings; step up stairs and decks (<= ~0.45 m)
    [nx, nz] = obs.pushOut(nx, nz, 0.34, this.pos.y, tau, -1, this.eyeH + 0.1);
    let gy = obs.surfaceY(nx, nz, this.pos.y, tau);
    if (gy > this.pos.y + 0.5 && this.onGround) { nx = this.pos.x; nz = this.pos.z; gy = obs.surfaceY(nx, nz, this.pos.y, tau); }
    nx = Math.max(ARENA.x0 - 25, Math.min(ARENA.x1 + 25, nx));
    nz = Math.max(ARENA.z0 - 25, Math.min(ARENA.z1 + 25, nz));
    this.vel.x = (nx - this.pos.x) / Math.max(dt, 1e-4) * 0.5 + this.vel.x * 0.5;
    this.vel.z = (nz - this.pos.z) / Math.max(dt, 1e-4) * 0.5 + this.vel.z * 0.5;
    this.pos.x = nx; this.pos.z = nz;
    this.pos.y += this.vel.y * dt;
    if (this.pos.y <= gy) { this.pos.y = gy; this.vel.y = 0; this.onGround = true; }
    else if (this.pos.y - gy < 0.3 && this.vel.y <= 0) { this.pos.y += (gy - this.pos.y) * Math.min(1, dt * 18); this.onGround = true; }
    else this.onGround = false;

    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.bob += hs * dt * 1.9;
    this.cool -= dt;
    if (inp.reload) this.startReload();
    // reload timeline
    let ud = this.gun.userData;
    const rl = this.rl;
    let reloading = false;
    if (this.reloadT >= 0) {
      reloading = true;
      const prev = this.reloadT;
      this.reloadT += dt;
      evalReload(ud, this.reloadTac, this.reloadT, rl);
      for (const [te, name] of rl.events) if (prev < te && this.reloadT >= te) this.events.push(name);
      if (this.reloadT >= this.reloadDur) {
        this.ammo = ud.tube ? this.mag : this.reloadTac ? this.mag + 1 : this.mag;
        this.reloadT = -1; reloading = false;
      }
    }
    this.recoil *= Math.exp(-dt * 10); this.recoilYaw *= Math.exp(-dt * 10);
    this.shake *= Math.exp(-dt * 4);
    // camera
    const bobA = Math.min(1, hs / 5) * (1 - this.ads * 0.8);
    this.cam.position.set(this.pos.x, this.pos.y + this.eyeH + Math.abs(Math.sin(this.bob * Math.PI)) * 0.05 * bobA, this.pos.z);
    const sh = this.shake;
    this.cam.rotation.set(this.pitch + this.recoil * 0.6 + (Math.random() - 0.5) * sh * 0.05, this.yaw + this.recoilYaw + (Math.random() - 0.5) * sh * 0.05, Math.sin(this.bob * Math.PI) * 0.004 * bobA, 'YXZ');

    // ---- viewmodel ----
    // weapon swap: the one in hand drops out of frame, the other comes up
    let swapDrop = 0;
    if (this.swapT >= 0) {
      this.swapT += dt;
      if (this.swapT < 0.22) swapDrop = this.swapT / 0.22;
      else {
        if (this.swapTo) { this.slots[this.cur].ammo = this.ammo; this.cur = this.swapTo; this.swapTo = null; this.equip(); this.events.push('draw'); }
        swapDrop = 1 - Math.min(1, (this.swapT - 0.22) / 0.28);
        if (this.swapT >= 0.5) this.swapT = -1;
      }
    }
    this.slots[this.cur].ammo = this.ammo;
    const gun = this.gun; ud = gun.userData;
    const hip = this.tmp.copy(ud.hip || new THREE.Vector3(0.14, -0.2, -0.34));
    const adsP = new THREE.Vector3(0, -ud.sightY, -ud.eyeZ);
    gun.position.lerpVectors(hip, adsP, this.ads);
    gun.position.x += Math.sin(this.bob * Math.PI) * 0.008 * bobA + inp.lookX * -0.00004;
    gun.position.y += -Math.abs(Math.cos(this.bob * Math.PI)) * 0.008 * bobA + inp.lookY * 0.00004;
    gun.position.z += this.recoil * 0.07;
    gun.rotation.set(this.recoil * 0.45 - swapDrop * 0.9, (sprint ? 0.55 : 0.02 * (1 - this.ads)), sprint ? 0.3 : 0);
    gun.position.y -= swapDrop * swapDrop * 0.28;
    if (sprint) gun.position.add(new THREE.Vector3(-0.04, -0.06, 0.05));
    if (reloading) {
      gun.position.add(rl.gunOff);
      gun.rotation.x += rl.gunRot.x + rl.jolt * 0.04; gun.rotation.y += rl.gunRot.y; gun.rotation.z += rl.gunRot.z;
      gun.position.z += rl.jolt * 0.02;
    }
    gun.updateMatrix();
    // magazine visibility
    const st = reloading ? rl.magState : 'in';
    ud.mag.visible = st === 'in' || st === 'swap';
    ud.handMag.visible = st === 'hand' || st === 'swap';
    if (ud.bullpup === false && reloading && st === 'in' && !this.reloadTac) ud.mag.position.y = ud.magHome.y - (1 - rl.seat) * 0.0;
    // charging handle rack
    ud.chargeHandle.position.z = ud.chHome + (reloading && rl.jolt > 0.05 && (ud.bullpup || ud.tube) ? 0.08 * rl.jolt : 0)
      + (ud.pistol ? (this.flashT > 0 ? 0.03 : 0) + (this.ammo === 0 && !reloading ? 0.025 : 0) : 0);
    // arms: right hand on grip, left hand follows reload path or handguard
    const A = this.arms[this.side];
    const toCam = (v) => v.clone().applyMatrix4(gun.matrix);
    const gripR = toCam(ud.grip);
    A.solve(1, new THREE.Vector3(0.22, -0.5, 0.3), gripR, new THREE.Vector3(1, -0.6, 0.2), gun.quaternion);
    let lh = toCam(ud.support);
    if (reloading && rl.path) {
      const [a, b, k] = pathPoint(rl.path, this.reloadT);
      const pt = (name) => {
        switch (name) {
          case 'support': return toCam(ud.support);
          case 'pouch': return new THREE.Vector3(-0.06, -0.45, -0.18);
          case 'pocket': return new THREE.Vector3(-0.3, -0.5, -0.05);
          case 'below': return toCam(ud.magwell.clone().add(new THREE.Vector3(0, -0.13, 0.02)));
          case 'well': return toCam(ud.magwell.clone().add(new THREE.Vector3(0, -0.06, 0)));
          case 'catch': return toCam(ud.boltCatch || ud.support);
          case 'charge': return toCam(ud.charge);
          case 'chargeBack': return toCam(ud.charge.clone().add(new THREE.Vector3(0, 0, 0.08)));
          default: return toCam(ud.support);
        }
      };
      lh = pt(a).lerp(pt(b), k);
    }
    A.solve(0, new THREE.Vector3(-0.16, -0.56, 0.18), lh, new THREE.Vector3(-1, -0.7, 0.1), gun.quaternion);
    // flash
    this.flashT -= dt;
    ud.flash.visible = ud.flash2.visible = this.flashT > 0;
    this.muzzleLight.intensity = this.flashT > 0 ? (ud.suppressed ? 7 : 20) : 0;
    ud.reticle.visible = this.ads > 0.4;
    return { sprint };
  }

  tryFire(inp) {
    const ud = this.gun.userData, held = this.trigHeld; this.trigHeld = inp.fire;
    if (!inp.fire || this.cool > 0 || this.reloadT >= 0 || this.swapT >= 0) return false;
    if (!ud.auto && held) return false; // semi-auto: one shot per pull
    if (this.ammo <= 0) { this.startReload(); return false; }
    this.cool = 60 / ud.rpm;
    this.ammo--;
    const kick = ud.kick || 0.024;
    this.recoil += kick * (1 - this.ads * 0.5);
    this.pitch += 0.0065 * (1 - this.ads * 0.4);
    this.recoilYaw += (Math.random() - 0.5) * 0.008;
    this.flashT = 0.04;
    ud.flash.rotation.z = Math.random() * 6; ud.flash.scale.setScalar(0.7 + Math.random() * 0.6);
    this.gun.updateMatrixWorld(true);
    const mp = new THREE.Vector3(0, 0, ud.muzzleZ).applyMatrix4(this.gun.matrixWorld);
    this.muzzleLight.position.copy(mp);
    // ejection port world position + right vector for brass
    this.eject = { p: new THREE.Vector3(0.03, 0.0, ud.bullpup ? 0.08 : -0.02).applyMatrix4(this.gun.matrixWorld), r: new THREE.Vector3(1, 0.4, 0.2).transformDirection(this.gun.matrixWorld) };
    if (this.ammo === 0) this.startReload();
    return mp;
  }
  // world-space position of the gun's magazine (for dropped mags)
  magWorld() { const ud = this.gun.userData; ud.mag.updateMatrixWorld(true); return { p: new THREE.Vector3().setFromMatrixPosition(ud.mag.matrixWorld), q: new THREE.Quaternion().setFromRotationMatrix(ud.mag.matrixWorld) }; }
}
