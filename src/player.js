import * as THREE from 'three';
import { heightAt, ARENA } from './terrain.js';
import { buildM7, buildBullpup, Arms, evalReload, pathPoint, reloadDuration } from './weapons.js';

export class Player {
  constructor(camera, scene, flashTex) {
    this.cam = camera;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; this.crouch = 0; this.onGround = true;
    this.health = 100; this.side = 0; this.ammo = 20; this.mag = 20; this.cool = 0; this.ads = 0;
    this.recoil = 0; this.recoilYaw = 0; this.bob = 0; this.lastHit = -10; this.shake = 0;
    this.reloadT = -1; this.reloadTac = false; this.reloadDur = 0; this.events = [];
    this.vm = new THREE.Group(); camera.add(this.vm);
    this.guns = [buildM7(), buildBullpup()];
    this.arms = [new Arms(0), new Arms(1)];
    this.handMags = this.guns.map((g) => { const m = g.userData.makeMag(); return m; });
    this.guns.forEach((g, i) => {
      g.visible = false;
      g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
      this.vm.add(g); this.vm.add(this.arms[i].g); this.arms[i].g.visible = false;
      this.arms[i].hand[0].add(this.handMags[i]); this.handMags[i].visible = false;
      this.handMags[i].position.set(0, 0.06, -0.03); this.handMags[i].traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
      // muzzle flashes
      const ud = g.userData;
      const fm = new THREE.MeshBasicMaterial({ map: flashTex, color: new THREE.Color(4, 2.4, 1.1), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      const s = ud.suppressed ? 0.12 : 0.3;
      const f1 = new THREE.Mesh(new THREE.PlaneGeometry(s, s), fm); f1.position.set(0, 0.0, ud.muzzleZ - s * 0.3);
      const f2 = new THREE.Mesh(new THREE.PlaneGeometry(s * 0.6, s * 1.8), fm); f2.rotation.y = Math.PI / 2; f2.position.copy(f1.position);
      g.add(f1, f2); f1.visible = f2.visible = false; ud.flash = f1; ud.flash2 = f2;
    });
    this.muzzleLight = new THREE.PointLight(0xffaa55, 0, 9, 2); scene.add(this.muzzleLight);
    this.flashT = 0;
    this.tmp = new THREE.Vector3();
    this.rl = { gunOff: new THREE.Vector3(), gunRot: new THREE.Euler(), path: null, magState: 'in', events: [], jolt: 0, seat: 0 };
    this.lastEvT = 0;
  }

  setSide(side) {
    this.side = side;
    this.guns.forEach((g, i) => { g.visible = i === side; this.arms[i].g.visible = i === side; });
    this.mag = this.gun.userData.magSize; this.ammo = this.mag + 1; this.reloadT = -1;
    this.gun.userData.mag.visible = true; this.handMags[side].visible = false;
  }
  get gun() { return this.guns[this.side]; }
  get eyeH() { return 1.62 - this.crouch * 0.55; }
  get reloading() { return this.reloadT >= 0; }
  get reload() { return this.reloadT >= 0 ? 1 : 0; }

  startReload() {
    if (this.reloadT >= 0 || this.ammo >= this.mag + 1) return;
    this.reloadTac = this.ammo > 0;
    this.reloadT = 0; this.lastEvT = -1;
    this.reloadDur = reloadDuration(this.gun.userData.bullpup, this.reloadTac);
  }

  update(dt, inp, colliders, boardwalk) {
    const sens = 0.0022 * (1 - this.ads * 0.32);
    this.yaw -= inp.lookX * sens; this.pitch -= inp.lookY * sens;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    this.crouch += ((inp.crouch ? 1 : 0) - this.crouch) * Math.min(1, dt * 10);
    this.ads += ((inp.ads && this.reloadT < 0 ? 1 : 0) - this.ads) * Math.min(1, dt * 13);
    const sprint = inp.sprint && inp.moveZ > 0.3 && this.ads < 0.3 && this.crouch < 0.3;
    let sp = sprint ? 6.6 : 4.2;
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
    for (const c of colliders) {
      const dx = nx - c.x, dz = nz - c.z, d = Math.hypot(dx, dz), m = c.r + 0.35;
      if (d < m && d > 1e-4) { nx = c.x + dx / d * m; nz = c.z + dz / d * m; }
    }
    nx = Math.max(ARENA.x0 - 25, Math.min(ARENA.x1 + 25, nx));
    nz = Math.max(ARENA.z0 - 25, Math.min(ARENA.z1 + 25, nz));
    let gy = Math.max(heightAt(nx, nz), -1.1);
    if (boardwalk && Math.abs(nx - 2) < 1.25) {
      const bw = boardwalk; const z0 = bw[0].z, dz = bw[1].z - bw[0].z;
      const k = (nz - z0) / dz;
      if (k >= 0 && k < bw.length - 1) {
        const i = Math.floor(k), f = k - i; const dy = bw[i].y + (bw[i + 1].y - bw[i].y) * f + 0.03;
        if (this.pos.y > dy - 0.6) gy = Math.max(gy, dy);
      }
    }
    this.pos.x = nx; this.pos.z = nz;
    this.pos.y += this.vel.y * dt;
    if (this.pos.y <= gy) { this.pos.y = gy; this.vel.y = 0; this.onGround = true; }
    else if (this.pos.y - gy < 0.25 && this.vel.y <= 0) { this.pos.y += (gy - this.pos.y) * Math.min(1, dt * 15); this.onGround = true; }
    else this.onGround = false;

    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.bob += hs * dt * 1.9;
    this.cool -= dt;
    if (inp.reload) this.startReload();
    // reload timeline
    const ud = this.gun.userData;
    const rl = this.rl;
    let reloading = false;
    if (this.reloadT >= 0) {
      reloading = true;
      const prev = this.reloadT;
      this.reloadT += dt;
      evalReload(ud, this.reloadTac, this.reloadT, rl);
      for (const [te, name] of rl.events) if (prev < te && this.reloadT >= te) this.events.push(name);
      if (this.reloadT >= this.reloadDur) {
        this.ammo = this.reloadTac ? this.mag + 1 : this.mag;
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
    const gun = this.gun;
    const hip = this.tmp.set(0.14, -0.2, -0.34);
    const adsP = new THREE.Vector3(0, -ud.sightY, -ud.eyeZ);
    gun.position.lerpVectors(hip, adsP, this.ads);
    gun.position.x += Math.sin(this.bob * Math.PI) * 0.008 * bobA + inp.lookX * -0.00004;
    gun.position.y += -Math.abs(Math.cos(this.bob * Math.PI)) * 0.008 * bobA + inp.lookY * 0.00004;
    gun.position.z += this.recoil * 0.07;
    gun.rotation.set(this.recoil * 0.45, (sprint ? 0.55 : 0.02 * (1 - this.ads)), sprint ? 0.3 : 0);
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
    this.handMags[this.side].visible = st === 'hand' || st === 'swap';
    if (ud.bullpup === false && reloading && st === 'in' && !this.reloadTac) ud.mag.position.y = ud.magHome.y - (1 - rl.seat) * 0.0;
    // charging handle rack
    ud.chargeHandle.position.z = (ud.bullpup ? -0.12 : 0.09) + (reloading && rl.jolt > 0.05 && ud.bullpup ? 0.08 * rl.jolt : 0);
    // arms: right hand on grip, left hand follows reload path or handguard
    const A = this.arms[this.side];
    const toCam = (v) => v.clone().applyMatrix4(gun.matrix);
    const gripR = toCam(new THREE.Vector3(0.012, -0.095, 0.065));
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
    if (!inp.fire || this.cool > 0 || this.reloadT >= 0) return false;
    if (this.ammo <= 0) { this.startReload(); return false; }
    const ud = this.gun.userData;
    this.cool = 60 / ud.rpm;
    this.ammo--;
    const kick = ud.bullpup ? 0.02 : 0.026; // 6.8x51 kicks harder
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
