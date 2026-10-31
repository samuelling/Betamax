import * as THREE from 'three';
import { heightAt, ARENA } from './terrain.js';
import { std } from './world.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

function cylBetween(a, b, r, mat) {
  const d = new THREE.Vector3().subVectors(b, a); const len = d.length();
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 3, 10), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

function buildGun(side, flashTex) {
  const g = new THREE.Group();
  const metal = std([0.08, 0.085, 0.09], 0.38, 0.75), poly = std([0.12, 0.12, 0.11], 0.6, 0.1);
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m; };
  let sightY, muzzleZ;
  if (side === 0) {
    const tan = std([0.48, 0.42, 0.32], 0.7, 0.05);
    add(new RoundedBoxGeometry(0.052, 0.075, 0.30, 2, 0.008), metal, 0, 0, 0);
    add(new RoundedBoxGeometry(0.06, 0.066, 0.3, 2, 0.01), tan, 0, 0.004, -0.29);
    add(new THREE.CylinderGeometry(0.011, 0.011, 0.16, 10), metal, 0, 0.01, -0.5, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.017, 0.017, 0.06, 10), metal, 0, 0.01, -0.6, Math.PI / 2);
    add(new THREE.BoxGeometry(0.032, 0.15, 0.07), poly, 0, -0.1, -0.05, 0.18);
    add(new THREE.BoxGeometry(0.032, 0.1, 0.045), poly, 0, -0.085, 0.1, -0.35);
    add(new RoundedBoxGeometry(0.05, 0.075, 0.2, 2, 0.01), tan, 0, -0.012, 0.26);
    add(new THREE.BoxGeometry(0.024, 0.012, 0.56), metal, 0, 0.044, -0.12);
    // holographic sight
    const hs = std([0.06, 0.06, 0.06], 0.5, 0.4);
    add(new RoundedBoxGeometry(0.05, 0.022, 0.08, 1, 0.006), hs, 0, 0.058, -0.04);
    add(new THREE.BoxGeometry(0.006, 0.05, 0.075), hs, 0.024, 0.088, -0.04);
    add(new THREE.BoxGeometry(0.006, 0.05, 0.075), hs, -0.024, 0.088, -0.04);
    add(new THREE.BoxGeometry(0.05, 0.006, 0.075), hs, 0, 0.115, -0.04);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.042, 0.044), new THREE.MeshPhysicalMaterial({ color: 0x88aacc, transparent: true, opacity: 0.12, roughness: 0, metalness: 0 }));
    glass.position.set(0, 0.089, -0.075); g.add(glass);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0016, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.3, 0.2), toneMapped: false }));
    dot.position.set(0, 0.089, -0.074); g.add(dot);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.0085, 0.0095, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.2, 0.15), toneMapped: false, transparent: true, opacity: 0.8 }));
    ring.position.copy(dot.position); g.add(ring);
    sightY = 0.089; muzzleZ = -0.64;
  } else {
    const wood = std([0.13, 0.13, 0.12], 0.55, 0.15);
    add(new RoundedBoxGeometry(0.05, 0.07, 0.34, 2, 0.008), metal, 0, 0, -0.02);
    add(new RoundedBoxGeometry(0.056, 0.06, 0.24, 2, 0.01), wood, 0, -0.004, -0.3);
    add(new THREE.CylinderGeometry(0.01, 0.01, 0.24, 10), metal, 0, 0.016, -0.5, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.016, 0.016, 0.07, 10), metal, 0, 0.016, -0.64, Math.PI / 2);
    const mag = new THREE.Group(); g.add(mag);
    const m1 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.07), poly); m1.position.set(0, -0.07, -0.08); m1.rotation.x = 0.15; mag.add(m1);
    const m2 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.07), poly); m2.position.set(0, -0.15, -0.11); m2.rotation.x = 0.45; mag.add(m2);
    add(new THREE.BoxGeometry(0.032, 0.1, 0.045), poly, 0, -0.08, 0.1, -0.35);
    add(new RoundedBoxGeometry(0.045, 0.07, 0.24, 2, 0.01), wood, 0, -0.02, 0.27, -0.08);
    add(new THREE.BoxGeometry(0.03, 0.012, 0.2), metal, 0, 0.042, -0.05);
    // iron sights
    add(new THREE.BoxGeometry(0.03, 0.02, 0.012), metal, 0, 0.052, 0.07);
    add(new THREE.BoxGeometry(0.004, 0.032, 0.006), metal, 0, 0.05, -0.58);
    add(new THREE.BoxGeometry(0.03, 0.006, 0.012), metal, 0, 0.034, -0.58);
    sightY = 0.062; muzzleZ = -0.69;
  }
  // flash
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), new THREE.MeshBasicMaterial({ map: flashTex, color: new THREE.Color(4, 2.4, 1.1), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  flash.position.set(0, 0.012, muzzleZ - 0.06); flash.visible = false; g.add(flash);
  const flash2 = flash.clone(); flash2.rotation.y = Math.PI / 2; flash2.scale.set(0.6, 1.6, 1); g.add(flash2);
  g.userData = { sightY, muzzleZ, flash, flash2 };
  return g;
}

function buildArms(side, gun) {
  const sleeve = std(side === 0 ? [0.47, 0.43, 0.33] : [0.24, 0.27, 0.26], 0.9);
  const glove = std(side === 0 ? [0.3, 0.27, 0.2] : [0.06, 0.06, 0.06], 0.8);
  const a = new THREE.Group();
  const gripR = new THREE.Vector3(0, -0.07, 0.1), gripL = new THREE.Vector3(0, -0.02, -0.3);
  a.add(cylBetween(new THREE.Vector3(0.16, -0.2, 0.42), gripR.clone().add(new THREE.Vector3(0.02, -0.02, 0.06)), 0.042, sleeve));
  a.add(cylBetween(new THREE.Vector3(-0.22, -0.22, 0.12), gripL.clone().add(new THREE.Vector3(-0.03, -0.02, 0.04)), 0.04, sleeve));
  const g1 = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.085, 0.09, 2, 0.02), glove); g1.position.copy(gripR); g1.position.x += 0.012; a.add(g1);
  const g2 = new THREE.Mesh(new RoundedBoxGeometry(0.055, 0.07, 0.1, 2, 0.02), glove); g2.position.copy(gripL); g2.position.y -= 0.015; a.add(g2);
  gun.add(a);
}

export class Player {
  constructor(camera, scene, flashTex) {
    this.cam = camera;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; this.crouch = 0; this.onGround = true;
    this.health = 100; this.side = 0; this.ammo = 30; this.reload = 0; this.cool = 0; this.ads = 0; this.adsOn = false;
    this.recoil = 0; this.recoilYaw = 0; this.bob = 0; this.lastHit = -10; this.shake = 0;
    this.vm = new THREE.Group(); camera.add(this.vm);
    this.guns = [buildGun(0, flashTex), buildGun(1, flashTex)];
    this.guns.forEach((g, i) => { buildArms(i, g); g.visible = false; g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } }); this.vm.add(g); });
    this.muzzleLight = new THREE.PointLight(0xffaa55, 0, 9, 2); scene.add(this.muzzleLight);
    this.flashT = 0;
    this.tmp = new THREE.Vector3();
    this.mag = 30;
  }

  setSide(side) {
    this.side = side; this.guns.forEach((g, i) => (g.visible = i === side));
    this.mag = side === 0 ? 30 : 30; this.ammo = this.mag; this.reload = 0;
  }
  get gun() { return this.guns[this.side]; }
  get eyeH() { return 1.62 - this.crouch * 0.55; }

  update(dt, inp, colliders, boardwalk) {
    // look
    // ADS scales sensitivity with the FOV change so aim feels consistent
    const sens = 0.0022 * (1 - this.ads * 0.32);
    this.yaw -= inp.lookX * sens; this.pitch -= inp.lookY * sens;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    // crouch / ads
    this.crouch += ((inp.crouch ? 1 : 0) - this.crouch) * Math.min(1, dt * 10);
    this.ads += ((inp.ads && this.reload <= 0 ? 1 : 0) - this.ads) * Math.min(1, dt * 12);
    // move
    const sprint = inp.sprint && inp.moveZ > 0.3 && this.ads < 0.3 && this.crouch < 0.3;
    let sp = sprint ? 6.6 : 4.2;
    sp *= 1 - this.crouch * 0.45; sp *= 1 - this.ads * 0.35;
    const gy0 = heightAt(this.pos.x, this.pos.z);
    if (gy0 < -0.25) sp *= 0.6; // wading in pools/sea
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    let wx = fx * inp.moveZ + rx * inp.moveX, wz = fz * inp.moveZ + rz * inp.moveX;
    const l = Math.hypot(wx, wz); if (l > 1) { wx /= l; wz /= l; }
    // snappy ground control: fast to start, faster to stop; little air control
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
    // hard outer clamp beyond the minefield (you'll be dead long before)
    nx = Math.max(ARENA.x0 - 25, Math.min(ARENA.x1 + 25, nx));
    nz = Math.max(ARENA.z0 - 25, Math.min(ARENA.z1 + 25, nz));
    let gy = Math.max(heightAt(nx, nz), -1.1);
    // boardwalk deck
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
    // weapon timers
    this.cool -= dt;
    if (this.reload > 0) { this.reload -= dt; if (this.reload <= 0) this.ammo = this.mag; }
    if (inp.reload && this.reload <= 0 && this.ammo < this.mag) this.reload = 2.1;
    this.recoil *= Math.exp(-dt * 10); this.recoilYaw *= Math.exp(-dt * 10);
    this.shake *= Math.exp(-dt * 4);
    // camera
    const bobA = Math.min(1, hs / 5) * (1 - this.ads * 0.8);
    this.cam.position.set(this.pos.x, this.pos.y + this.eyeH + Math.abs(Math.sin(this.bob * Math.PI)) * 0.05 * bobA, this.pos.z);
    const sh = this.shake;
    this.cam.rotation.set(this.pitch + this.recoil * 0.6 + (Math.random() - 0.5) * sh * 0.05, this.yaw + this.recoilYaw + (Math.random() - 0.5) * sh * 0.05, Math.sin(this.bob * Math.PI) * 0.004 * bobA, 'YXZ');
    // viewmodel placement
    const gun = this.gun, ud = gun.userData;
    const hip = this.tmp.set(0.15, -0.2, -0.3);
    const ads = new THREE.Vector3(0, -ud.sightY, -0.21);
    gun.position.lerpVectors(hip, ads, this.ads);
    gun.position.x += Math.sin(this.bob * Math.PI) * 0.008 * bobA + inp.lookX * -0.00004;
    gun.position.y += -Math.abs(Math.cos(this.bob * Math.PI)) * 0.008 * bobA + inp.lookY * 0.00004;
    gun.position.z += this.recoil * 0.06;
    const rl = this.reload > 0 ? Math.sin(Math.min(1, (2.1 - this.reload) / 2.1) * Math.PI) : 0;
    gun.rotation.set(this.recoil * 0.5 - rl * 0.6, sprint ? 0.5 : 0, sprint ? 0.25 : rl * 0.5);
    if (sprint) gun.position.add(this.tmp.set(-0.05, -0.05, 0.05));
    this.flashT -= dt;
    ud.flash.visible = ud.flash2.visible = this.flashT > 0;
    this.muzzleLight.intensity = this.flashT > 0 ? 18 : 0;
    return { sprint };
  }

  tryFire(inp) {
    if (!inp.fire || this.cool > 0 || this.reload > 0) return false;
    if (this.ammo <= 0) { this.reload = 2.1; return false; }
    this.cool = this.side === 0 ? 0.075 : 0.095;
    this.ammo--;
    this.recoil += 0.022 * (1 - this.ads * 0.5);
    this.pitch += 0.006 * (1 - this.ads * 0.4);
    this.recoilYaw += (Math.random() - 0.5) * 0.008;
    this.flashT = 0.04;
    const ud = this.gun.userData;
    ud.flash.rotation.z = Math.random() * 6; ud.flash.scale.setScalar(0.7 + Math.random() * 0.6);
    this.gun.updateMatrixWorld(true);
    const mp = new THREE.Vector3(0, 0.012, ud.muzzleZ).applyMatrix4(this.gun.matrixWorld);
    this.muzzleLight.position.copy(mp);
    if (this.ammo === 0) this.reload = 2.1;
    return mp;
  }
}
