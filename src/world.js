import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { heightAt, grassMask, crestD, lotMask, onLot, WATERLINE_Z, ARENA, LOT } from './terrain.js';
import { buildLayout, vehZ, vehRamp, heloPose } from './layout.js';
import { mulberry32, fbm, smoothstep } from './rng.js';
import * as TX from './textures.js';

export const SUN_DIR = new THREE.Vector3(-0.9, 0.26, 0.28).normalize();

export const SKY_GLSL = /* glsl */`
uniform vec3 uSunDir;
vec3 skyCol(vec3 d){
  float h = d.y;
  vec3 horizon = vec3(0.70,0.62,0.56);
  vec3 zenith = vec3(0.20,0.30,0.48);
  float t = pow(clamp(h,0.0,1.0), 0.42);
  vec3 c = mix(horizon, zenith, t);
  c = mix(c, horizon*0.8, smoothstep(0.0,-0.25,h));
  float s = max(dot(d, uSunDir), 0.0);
  vec3 sunC = vec3(1.0,0.70,0.42);
  c += sunC * (pow(s, 6.0)*0.35 + pow(s, 32.0)*0.6 + pow(s,300.0)*3.0);
  c += sunC * smoothstep(0.99955, 0.9998, s) * 40.0;
  c += vec3(0.20,0.14,0.10) * exp(-abs(h)*12.0) * (0.35 + 0.65*pow(s,2.0));
  // a few streaky high clouds
  return c;
}`;

export function skyColorJS(d) {
  const h = d.y;
  const t = Math.pow(Math.min(Math.max(h, 0), 1), 0.42);
  let c = [0.70 + (0.20 - 0.70) * t, 0.62 + (0.30 - 0.62) * t, 0.56 + (0.48 - 0.56) * t];
  const s = Math.max(d.x * SUN_DIR.x + d.y * SUN_DIR.y + d.z * SUN_DIR.z, 0);
  const g = Math.pow(s, 6) * 0.35 + Math.pow(s, 32) * 0.6;
  const band = Math.exp(-Math.abs(h) * 12) * (0.35 + 0.65 * s * s);
  return [c[0] + 1.0 * g + 0.2 * band, c[1] + 0.7 * g + 0.14 * band, c[2] + 0.42 * g + 0.1 * band];
}

// ------- tiny geometry helpers -------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
function place(g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(sx, sy, sz);
  _m.compose(_p, _q, _s);
  return g.applyMatrix4(_m);
}
const box = (w, h, d, ...t) => place(new THREE.BoxGeometry(w, h, d), ...t);
const rbox = (w, h, d, r, ...t) => place(new RoundedBoxGeometry(w, h, d, 2, r), ...t);
const cyl = (rt, rb, h, seg, ...t) => place(new THREE.CylinderGeometry(rt, rb, h, seg), ...t);
function cleanAttrs(g) {
  // merge requires identical attribute sets
  const keep = ['position', 'normal', 'uv'];
  for (const k of Object.keys(g.attributes)) if (!keep.includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g.index ? g.toNonIndexed() : g;
}
export function merge(list) { return mergeGeometries(list.map(cleanAttrs), false); }

class Builder {
  constructor() { this.groups = new Map(); }
  add(mat, g) { if (!this.groups.has(mat)) this.groups.set(mat, []); this.groups.get(mat).push(g); }
  build(parent, { cast = true, receive = true } = {}) {
    const meshes = [];
    for (const [mat, list] of this.groups) {
      const m = new THREE.Mesh(merge(list), mat);
      m.castShadow = cast; m.receiveShadow = receive; parent.add(m); meshes.push(m);
    }
    return meshes;
  }
}

export function std(color, rough = 0.85, metal = 0, extra = {}) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(...color, THREE.SRGBColorSpace), roughness: rough, metalness: metal, ...extra });
}

// ===========================================================================
export class World {
  constructor(renderer, scene, quality) {
    this.scene = scene; this.renderer = renderer; this.q = quality;
    this.L = buildLayout();
    this.uTau = { value: 0 };
    this.root = new THREE.Group(); scene.add(this.root);
    this.buildSky();
    this.buildLights();
    this.buildTerrain();
    this.buildWater();
    this.buildGrass();
    this.buildRocks();
    this.buildBeachStuff();
    this.buildHouses();
    this.buildTrees();
    this.buildLot();
    this.buildMinefield();
    this.buildSandbags();
    this.buildFleet();
    this.buildVehicles();
    this.buildHelos();
    this.buildDecals();
    this.buildTracks();
  }

  // AAV tread marks pressed into the wet flats; they exist only where the vehicle has already passed
  buildTracks() {
    this.tracks = [];
    for (const v of this.L.vehicles) {
      if (v.type !== 'aav') continue;
      const z0 = v.zStop - 4, z1 = Math.min(WATERLINE_Z + 15, 160);
      const segs = Math.ceil((z1 - z0) / 1.5);
      const pos = [], uv = [], idx = [];
      for (const sx of [-1.55, 1.55]) {
        const base = pos.length / 3;
        for (let k = 0; k <= segs; k++) {
          const z = z0 + (k / segs) * (z1 - z0);
          for (const w of [-0.27, 0.27]) { const x = v.x + sx + w; pos.push(x, heightAt(x, z) + 0.025, z); uv.push(w > 0 ? 1 : 0, z); }
          if (k < segs) { const a = base + k * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      const mat = new THREE.ShaderMaterial({
        uniforms: { uZ: { value: 999 } }, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3,
        vertexShader: 'varying vec2 vUv; varying float vZ; void main(){ vUv = uv; vZ = position.z; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
        fragmentShader: `uniform float uZ; varying vec2 vUv; varying float vZ;
          void main(){
            if (vZ < uZ - 3.5) discard;
            float tread = step(0.45, fract(vUv.y * 3.2));
            float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
            gl_FragColor = vec4(vec3(0.16, 0.13, 0.1), (0.28 + 0.2 * tread) * edge);
          }`,
      });
      const m = new THREE.Mesh(g, mat); m.renderOrder = 2; this.root.add(m);
      this.tracks.push({ v, m });
    }
  }

  // ---------------- sky ----------------
  buildSky() {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uSunDir: { value: SUN_DIR } },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize((modelMatrix*vec4(position,1.0)).xyz - cameraPosition); vec4 p = projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: `${SKY_GLSL}
        varying vec3 vDir;
        float hsh(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
        float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hsh(i),hsh(i+vec2(1,0)),f.x), mix(hsh(i+vec2(0,1)),hsh(i+vec2(1,1)),f.x), f.y); }
        void main(){
          vec3 d = normalize(vDir);
          vec3 c = skyCol(d);
          if (d.y > 0.0) {
            vec2 uv = d.xz / (d.y + 0.08) * 1.4;
            float n = vn(uv*vec2(1.0,4.0)) * 0.5 + vn(uv*vec2(2.1,8.0))*0.3 + vn(uv*vec2(4.3,15.0))*0.2;
            float cl = smoothstep(0.55, 0.85, n) * smoothstep(0.0, 0.15, d.y) * 0.55;
            float s = max(dot(d, uSunDir), 0.0);
            vec3 cc = mix(vec3(0.95,0.75,0.62), vec3(1.4,0.95,0.65), pow(s, 4.0));
            c = mix(c, cc, cl);
          }
          gl_FragColor = vec4(c, 1.0);
        }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(4500, 32, 16), mat);
    this.sky.frustumCulled = false; this.sky.renderOrder = -10;
    this.scene.add(this.sky);
    // environment map from the sky
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), mat.clone()));
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(envScene, 0.02).texture;
    this.scene.environmentIntensity = 0.75;
    const fc = skyColorJS(new THREE.Vector3(-SUN_DIR.x, 0.02, -SUN_DIR.z).normalize());
    this.fogColor = new THREE.Color(fc[0] * 0.92, fc[1] * 0.92, fc[2] * 0.92);
    this.scene.fog = new THREE.FogExp2(this.fogColor, 0.0022);
  }

  buildLights() {
    const sun = new THREE.DirectionalLight(new THREE.Color(1.0, 0.8, 0.62), 3.4);
    sun.castShadow = true;
    const ms = this.q.shadow;
    sun.shadow.mapSize.set(ms, ms);
    const c = sun.shadow.camera; c.left = -70; c.right = 70; c.top = 70; c.bottom = -70; c.near = 1; c.far = 500;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
    this.scene.add(sun, sun.target);
    this.sun = sun;
    this.hemi = new THREE.HemisphereLight(new THREE.Color(0.55, 0.62, 0.78), new THREE.Color(0.45, 0.38, 0.3), 0.55);
    this.scene.add(this.hemi);
  }

  // ---------------- terrain ----------------
  buildTerrain() {
    const W = 1100, D = 1150, sx = this.q.terrainSeg, sz = Math.round(this.q.terrainSeg * D / W);
    const g = new THREE.PlaneGeometry(W, D, sx, sz);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, 130);
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const wet = new Float32Array(pos.count);
    const c = new THREE.Color();
    const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const DRY = [0.93, 0.86, 0.72], WET = [0.60, 0.54, 0.44], WRACK = [0.32, 0.27, 0.2], GRASS = [0.52, 0.53, 0.33], SCRUB = [0.30, 0.33, 0.21], ALGAE = [0.40, 0.42, 0.30], ASPH = [0.2, 0.2, 0.21];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const y = heightAt(x, z);
      pos.setY(i, y);
      let k;
      let w = 0;
      if (z > 4) {
        const low = smoothstep(0.2, -0.15, y);
        k = mix(WET, mix(WET, [0.5, 0.45, 0.36], 0.6), low);
        const alg = fbm(x * 0.04 + 9, z * 0.04, 3);
        k = mix(k, ALGAE, smoothstep(0.58, 0.72, alg) * 0.6);
        w = smoothstep(4, 14, z);
      } else {
        k = DRY;
        const wr = Math.exp(-Math.pow((z - 2.5 + (fbm(x * 0.05, 1, 2) - 0.5) * 3) / 1.2, 2)) * smoothstep(0.35, 0.6, fbm(x * 0.15, 3, 2));
        k = mix(k, WRACK, wr * 0.8);
        k = mix(k, WET, smoothstep(0, 6, z) * 0.7);
        w = smoothstep(0, 6, z) * 0.6;
        const gm = grassMask(x, z);
        k = mix(k, GRASS, gm * 0.75);
        const d = -z, cr = crestD(x);
        const inland = smoothstep(cr + 6, cr + 26, d);
        k = mix(k, mix(SCRUB, DRY, smoothstep(0.62, 0.75, fbm(x * 0.03, z * 0.03, 3)) * 0.7), inland);
        k = mix(k, ASPH, lotMask(x, z));
      }
      if (y < -0.4) k = mix(k, [0.38, 0.36, 0.3], smoothstep(-0.4, -2, y));
      c.setRGB(k[0], k[1], k[2], THREE.SRGBColorSpace);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      wet[i] = w;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('wet', new THREE.BufferAttribute(wet, 1));
    g.computeVertexNormals();
    const sand = TX.makeSandTextures();
    sand.map.repeat.set(220, 230); sand.normal.repeat.set(220, 230);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: sand.map, normalMap: sand.normal, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 1.0, metalness: 0 });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float wet; varying float vWet;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWet = wet;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vWet;')
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(0.97, 0.18, vWet);')
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n normal = normalize(mix(normal, normalize(vNormal), vWet*0.65));');
    };
    const mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = true;
    this.root.add(mesh);
    this.terrain = mesh;
  }

  // ---------------- water ----------------
  buildWater() {
    // height texture for depth-based shading of tide pools and shoreline
    const HX = 1000, HZ0 = -40, HZ1 = 700, NX = 400, NZ = 296;
    const data = new Uint16Array(NX * NZ);
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const x = -HX / 2 + (i / (NX - 1)) * HX, z = HZ0 + (j / (NZ - 1)) * (HZ1 - HZ0);
      data[j * NX + i] = THREE.DataUtils.toHalfFloat(heightAt(x, z));
    }
    const ht = new THREE.DataTexture(data, NX, NZ, THREE.RedFormat, THREE.HalfFloatType);
    ht.magFilter = ht.minFilter = THREE.LinearFilter; ht.needsUpdate = true;
    const nrm = TX.makeWaterNormal();
    const uni = {
      uTime: this.uTau, uSunDir: { value: SUN_DIR }, uNormal: { value: nrm }, uHeight: { value: ht },
      uHRect: { value: new THREE.Vector4(-HX / 2, HZ0, HX, HZ1 - HZ0) }, uFogDensity: { value: 0.0022 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: uni, transparent: true, depthWrite: false,
      vertexShader: `uniform float uTime; varying vec3 vW; varying float vWave;
        void main(){ vec4 w = modelMatrix*vec4(position,1.0);
          float off = smoothstep(${WATERLINE_Z.toFixed(1)}-10.0, ${WATERLINE_Z.toFixed(1)}+80.0, w.z);
          float wv = sin(w.z*0.21 + uTime*1.1 + sin(w.x*0.013)*2.0)*0.09 + sin(w.z*0.09 - w.x*0.04 + uTime*0.6)*0.14;
          w.y += wv*off; vWave = wv*off; vW = w.xyz;
          gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `${SKY_GLSL}
        uniform float uTime; uniform sampler2D uNormal; uniform sampler2D uHeight; uniform vec4 uHRect; uniform float uFogDensity;
        varying vec3 vW; varying float vWave;
        void main(){
          vec2 huv = (vW.xz - uHRect.xy) / uHRect.zw;
          float floorY = texture2D(uHeight, clamp(huv, 0.0, 1.0)).r;
          float depth = vW.y - floorY;
          if (depth < 0.0) discard;
          float off = smoothstep(${WATERLINE_Z.toFixed(1)}-20.0, ${WATERLINE_Z.toFixed(1)}+60.0, vW.z);
          vec2 uv1 = vW.xz*0.045 + vec2(0.0, uTime*0.02);
          vec2 uv2 = vW.xz*0.13 + vec2(uTime*0.015, -uTime*0.04);
          vec3 n1 = texture2D(uNormal, uv1).xyz*2.0-1.0, n2 = texture2D(uNormal, uv2).xyz*2.0-1.0;
          float str = mix(0.12, 0.45, off);
          vec3 n = normalize(vec3((n1.x+n2.x)*str, 1.0, (n1.y+n2.y)*str));
          vec3 V = normalize(cameraPosition - vW);
          vec3 R = reflect(-V, n); R.y = max(R.y, 0.01);
          vec3 refl = skyCol(normalize(R));
          float fres = 0.02 + 0.98*pow(1.0 - max(dot(n, V), 0.0), 5.0);
          vec3 deep = vec3(0.03,0.09,0.10), shallow = vec3(0.30,0.36,0.30);
          vec3 col = mix(shallow, deep, smoothstep(0.0, 3.5, depth));
          col *= 0.55 + 0.45*max(dot(n, uSunDir), 0.0);
          col = mix(col, refl, fres);
          float s = max(dot(R, uSunDir), 0.0);
          col += vec3(1.0,0.75,0.5) * (pow(s, 420.0)*30.0 + pow(s, 60.0)*0.4);
          float foamN = texture2D(uNormal, vW.xz*0.35 + vec2(uTime*0.03, 0.0)).z;
          float edge = smoothstep(0.08, 0.0, depth) * off;
          float brk = smoothstep(0.25, 0.0, abs(depth - 0.55 - vWave*1.5)) * off * smoothstep(0.6, 0.9, foamN);
          float foam = clamp(edge*0.8 + brk*0.6, 0.0, 1.0);
          col = mix(col, vec3(0.95,0.93,0.88), foam);
          float alpha = clamp(smoothstep(0.0, 0.5, depth)*0.88 + fres*0.4 + foam, 0.0, 1.0);
          alpha = max(alpha, smoothstep(0.0,0.04,depth)*0.35);
          float dist = length(cameraPosition - vW);
          float ff = 1.0 - exp(-pow(uFogDensity*dist, 2.0));
          vec3 hd = normalize(vec3(vW.x - cameraPosition.x, 0.0, vW.z - cameraPosition.z)); hd.y = 0.015;
          col = mix(col, skyCol(normalize(hd))*0.95, ff);
          gl_FragColor = vec4(col, mix(alpha, 1.0, ff));
        }`,
    });
    const g = new THREE.PlaneGeometry(1400, 1500, 280, 300);
    g.rotateX(-Math.PI / 2); g.translate(0, 0, 690);
    this.water = new THREE.Mesh(g, mat);
    this.water.renderOrder = 1; this.water.frustumCulled = false;
    this.root.add(this.water);
    // far ocean ring so the horizon is water
    const far = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2).translate(0, -0.2, 0), mat);
    far.renderOrder = 0; this.root.add(far);
  }

  // ---------------- dune grass ----------------
  buildGrass() {
    const tex = TX.makeGrassTex();
    const blade = merge([
      place(new THREE.PlaneGeometry(1.3, 0.95), 0, 0.47, 0),
      place(new THREE.PlaneGeometry(1.3, 0.95), 0, 0.47, 0, 0, Math.PI / 2, 0),
      place(new THREE.PlaneGeometry(1.1, 0.8), 0, 0.4, 0, 0, Math.PI / 4, 0),
    ]);
    const n = blade.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
    const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9 });
    const uT = this.uTau;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uT;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
          float sway = sin(uTime*1.9 + ip.x*0.35 + ip.z*0.21) * 0.6 + sin(uTime*3.7 + ip.x*1.3)*0.25;
          transformed.x += sway * 0.12 * position.y * position.y;
          transformed.z += sway * 0.05 * position.y;`);
    };
    const count = this.q.grass;
    const im = new THREE.InstancedMesh(blade, mat, count);
    const r = mulberry32(42);
    let k = 0, tries = 0;
    const col = new THREE.Color();
    while (k < count && tries < count * 30) {
      tries++;
      const x = (r() - 0.5) * 340, z = -(20 + r() * 160);
      let m = grassMask(x, z);
      const d = -z;
      if (d > crestD(x) + 18) m = onLot(x, z) || lotMask(x, z) > 0.1 ? 0 : 0.18;
      if (r() > m) continue;
      const y = heightAt(x, z);
      const s = 0.6 + r() * 0.9;
      place(new THREE.BufferGeometry());
      _e.set(0, r() * 6.28, (r() - 0.5) * 0.2); _q.setFromEuler(_e); _p.set(x, y - 0.05, z); _s.set(s, s * (0.8 + r() * 0.5), s);
      _m.compose(_p, _q, _s); im.setMatrixAt(k, _m);
      col.setRGB(0.85 + r() * 0.3, 0.85 + r() * 0.25, 0.75 + r() * 0.2); im.setColorAt(k, col);
      k++;
    }
    im.count = k;
    im.receiveShadow = true; im.castShadow = false;
    this.root.add(im);
  }

  buildRocks() {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const p = g.attributes.position; const r = mulberry32(3);
    for (let i = 0; i < p.count; i++) { const f = 0.8 + r() * 0.35; p.setXYZ(i, p.getX(i) * f, p.getY(i) * f, p.getZ(i) * f); }
    g.computeVertexNormals();
    const mat = std([0.42, 0.40, 0.37], 0.6);
    const im = new THREE.InstancedMesh(g, mat, this.L.rocks.length);
    const col = new THREE.Color();
    this.L.rocks.forEach((k, i) => {
      _e.set(r() * 0.5, k.rot, r() * 0.5); _q.setFromEuler(_e); _p.set(k.x, heightAt(k.x, k.z) - k.s * 0.2, k.z); _s.set(k.s, k.s * k.sq, k.s * 1.1);
      _m.compose(_p, _q, _s); im.setMatrixAt(i, _m);
      const v = 0.75 + r() * 0.4; col.setRGB(v, v * 0.97, v * 0.92); im.setColorAt(i, col);
    });
    im.castShadow = im.receiveShadow = true;
    this.root.add(im);
  }

  // ---------------- boardwalk, shack, lifeguard ----------------
  buildBeachStuff() {
    const B = new Builder();
    const wood = std([0.55, 0.47, 0.38], 0.9), gray = std([0.62, 0.6, 0.56], 0.9), white = std([0.9, 0.9, 0.86], 0.7);
    const bw = this.L.boardwalk;
    for (let i = 0; i < bw.length - 1; i++) {
      const a = bw[i], b = bw[i + 1];
      const len = Math.hypot(b.z - a.z, b.y - a.y);
      const ang = Math.atan2(b.y - a.y, b.z - a.z);
      const mz = (a.z + b.z) / 2, my = (a.y + b.y) / 2;
      for (let s = 0; s < 6; s++) {
        const t = (s + 0.5) / 6;
        B.add(wood, box(2.4, 0.06, len / 6 - 0.04, a.x, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t, -ang, 0, 0));
      }
      // stringers and posts
      [-1.1, 1.1].forEach((ox) => {
        B.add(gray, box(0.1, 0.18, len, a.x + ox, my - 0.12, mz, -ang, 0, 0));
        const gy = heightAt(a.x + ox, a.z);
        const h = a.y - gy + 0.3;
        B.add(gray, box(0.14, h, 0.14, a.x + ox, gy + h / 2 - 0.3, a.z));
        if (i % 2 === 0) B.add(gray, box(0.09, 0.95, 0.09, a.x + ox * 1.05, a.y + 0.48, a.z));
        B.add(wood, box(0.08, 0.08, len, a.x + ox * 1.05, my + 0.92, mz, -ang, 0, 0));
      });
    }
    // stairs down to beach
    const st = this.L.stairs;
    const steps = Math.max(4, Math.round((st.top - st.bottom) / 0.2));
    for (let k = 0; k < steps; k++) {
      const y = st.top - (k + 1) * (st.top - st.bottom) / steps;
      B.add(wood, box(2.4, 0.06, 0.32, st.x, y, st.z + 1 + k * 0.3));
    }
    // snack shack: gray shingle, white trim, low hip roof, serving windows
    const S = this.L.snackShack;
    const shingle = new THREE.MeshStandardMaterial({ map: TX.makeShingleTex(), roughness: 0.95 });
    shingle.map.wrapS = shingle.map.wrapT = THREE.RepeatWrapping; shingle.map.repeat.set(3, 1);
    const sy = heightAt(S.x, S.z);
    B.add(shingle, box(S.w, 3.2, S.l, S.x, sy + 1.6, S.z));
    B.add(std([0.25, 0.25, 0.27], 0.8), place(new THREE.ConeGeometry(S.w * 0.72, 1.8, 4, 1), S.x, sy + 4.1, S.z, 0, Math.PI / 4, 0, 1, 1, S.l / S.w));
    B.add(white, box(S.w + 0.2, 0.25, S.l + 0.2, S.x, sy + 3.25, S.z));
    for (let k = 0; k < 3; k++) B.add(std([0.06, 0.07, 0.08], 0.2), box(2.2, 1.1, 0.06, S.x - 4 + k * 4, sy + 1.9, S.z + S.l / 2 + 0.02));
    [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => B.add(white, box(0.2, 3.2, 0.2, S.x + sx * S.w / 2, sy + 1.6, S.z + sz * S.l / 2))));
    this.shackSign = { x: S.x, y: sy + 3.0, z: S.z + S.l / 2 + 0.12 };
    // lifeguard stand
    const lg = this.L.lifeguard, ly = heightAt(lg.x, lg.z);
    [[-0.7, -0.6], [0.7, -0.6], [-0.7, 0.6], [0.7, 0.6]].forEach(([ox, oz]) => B.add(white, box(0.12, 2.6, 0.12, lg.x + ox, ly + 1.3, lg.z + oz, oz * 0.1, 0, -ox * 0.1)));
    B.add(white, box(1.5, 0.08, 1.2, lg.x, ly + 2.5, lg.z));
    B.add(white, box(1.5, 0.9, 0.08, lg.x, ly + 2.95, lg.z - 0.6));
    for (let k = 0; k < 4; k++) B.add(white, box(1.3, 0.06, 0.12, lg.x, ly + 0.5 + k * 0.5, lg.z + 0.68));
    B.add(std([0.75, 0.15, 0.12], 0.8), box(1.4, 0.5, 0.05, lg.x, ly + 2.95, lg.z - 0.65));
    B.build(this.root);
    // shack sign texture
    const c = document.createElement('canvas'); c.width = 512; c.height = 96;
    const g = c.getContext('2d'); g.fillStyle = '#1d3b57'; g.fillRect(0, 0, 512, 96);
    g.fillStyle = '#f2ead8'; g.font = 'bold 54px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('MAYFLOWER BEACH', 256, 50);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.3), new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }));
    sign.position.set(this.shackSign.x, this.shackSign.y, this.shackSign.z);
    this.root.add(sign);
  }

  buildHouses() {
    const B = new Builder();
    const sh = TX.makeShingleTex(); sh.wrapS = sh.wrapT = THREE.RepeatWrapping; sh.repeat.set(4, 2);
    const shingle = new THREE.MeshStandardMaterial({ map: sh, roughness: 0.95 });
    const roof = std([0.2, 0.2, 0.22], 0.85), trim = std([0.92, 0.92, 0.88], 0.6), glass = std([0.05, 0.07, 0.09], 0.08, 0.2), brick = std([0.45, 0.22, 0.17], 0.9), deck = std([0.5, 0.42, 0.33], 0.9);
    const roofGeo = (w, h, l) => {
      const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.lineTo(-w / 2, 0);
      const g = new THREE.ExtrudeGeometry(s, { depth: l, bevelEnabled: false }); g.translate(0, 0, -l / 2); return g;
    };
    for (const h of this.L.houses) {
      const y0 = heightAt(h.x, h.z) - 0.3;
      const H = h.floors === 2 ? 6.2 : 3.2;
      const parts = [];
      const add = (mat, g) => { g.rotateY(h.rot); g.translate(h.x, y0, h.z); B.add(mat, g); };
      add(shingle, box(h.w, H, h.l, 0, H / 2, 0));
      add(roof, place(roofGeo(h.l + 0.8, h.floors === 2 ? 3.4 : 2.8, h.w + 0.6), 0, H, 0, 0, Math.PI / 2, 0));
      add(trim, box(h.w + 0.1, 0.2, h.l + 0.1, 0, H, 0));
      [-1, 1].forEach((a) => [-1, 1].forEach((b) => add(trim, box(0.18, H, 0.18, a * h.w / 2, H / 2, b * h.l / 2))));
      add(brick, box(0.9, 2.2, 0.9, h.w * 0.25, H + 2.2, 0));
      const nW = Math.floor(h.w / 2.6);
      for (let f = 0; f < h.floors; f++) for (let k = 0; k < nW; k++) {
        const wx = -h.w / 2 + (k + 0.5) * (h.w / nW);
        [1, -1].forEach((sd) => {
          add(glass, box(1.1, 1.4, 0.06, wx, 1.7 + f * 3, sd * (h.l / 2 + 0.02)));
          add(trim, box(1.35, 0.12, 0.1, wx, 1.0 + f * 3, sd * (h.l / 2 + 0.04)));
          add(trim, box(1.35, 0.12, 0.1, wx, 2.42 + f * 3, sd * (h.l / 2 + 0.04)));
        });
      }
      if (h.deck) {
        add(deck, box(h.w * 0.8, 0.15, 3, 0, 3.0, h.l / 2 + 1.5));
        for (let k = -2; k <= 2; k++) add(trim, box(0.12, 3.0, 0.12, k * h.w * 0.19, 1.5, h.l / 2 + 2.9));
        add(trim, box(h.w * 0.8, 0.08, 0.08, 0, 4.0, h.l / 2 + 2.95));
        add(glass, box(3, 2.2, 0.06, 0, 1.3 + 3, h.l / 2 + 0.03));
      }
    }
    B.build(this.root);
  }

  buildTrees() {
    const trunk = cyl(0.12, 0.2, 4, 6, 0, 2, 0);
    const r = mulberry32(17);
    const blobs = [];
    for (let k = 0; k < 5; k++) blobs.push(place(new THREE.IcosahedronGeometry(1.4 + r() * 0.8, 1), (r() - 0.5) * 2, 3.6 + r() * 2.2, (r() - 0.5) * 2, 0, 0, 0, 1, 0.65, 1));
    const crown = merge(blobs);
    const ti = new THREE.InstancedMesh(trunk, std([0.33, 0.25, 0.2], 0.95), this.L.trees.length);
    const ci = new THREE.InstancedMesh(crown, std([0.18, 0.25, 0.15], 0.9), this.L.trees.length);
    const col = new THREE.Color();
    this.L.trees.forEach((t, i) => {
      _e.set(0, t.rot, 0); _q.setFromEuler(_e); _p.set(t.x, heightAt(t.x, t.z) - 0.2, t.z); _s.set(t.s, t.s * (0.9 + r() * 0.4), t.s);
      _m.compose(_p, _q, _s); ti.setMatrixAt(i, _m); ci.setMatrixAt(i, _m);
      const v = 0.8 + r() * 0.4; col.setRGB(v, v, v * 0.9); ci.setColorAt(i, col);
    });
    ti.castShadow = ci.castShadow = true; ti.receiveShadow = ci.receiveShadow = true;
    this.root.add(ti, ci);
  }

  buildLot() {
    const Lt = LOT, w = Lt.x1 - Lt.x0, l = Lt.z1 - Lt.z0;
    const c = document.createElement('canvas'); c.width = 1024; c.height = Math.round(1024 * l / w);
    const g = c.getContext('2d');
    g.fillStyle = '#3a3a3c'; g.fillRect(0, 0, c.width, c.height);
    const r = mulberry32(4);
    for (let i = 0; i < 9000; i++) { const v = 40 + r() * 40; g.fillStyle = `rgba(${v},${v},${v + 3},0.5)`; g.fillRect(r() * c.width, r() * c.height, 2, 2); }
    g.strokeStyle = 'rgba(235,235,225,0.85)'; g.lineWidth = 3;
    const px = c.width / w;
    for (let row = 0; row < 3; row++) {
      const zc = 10 + row * 18;
      for (let x = 3; x < w - 3; x += 2.8) {
        g.beginPath(); g.moveTo(x * px, (zc - 5) * px); g.lineTo(x * px, (zc + 5) * px); g.stroke();
      }
      g.beginPath(); g.moveTo(3 * px, zc * px); g.lineTo((w - 3) * px, zc * px); g.stroke();
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: t, roughness: 0.92 }));
    m.position.set((Lt.x0 + Lt.x1) / 2, Lt.y + 0.03, (Lt.z0 + Lt.z1) / 2);
    m.receiveShadow = true; this.root.add(m);
    // abandoned cars
    const B = new Builder();
    const cols = [[0.55, 0.57, 0.6], [0.15, 0.17, 0.2], [0.6, 0.12, 0.1], [0.85, 0.85, 0.82], [0.2, 0.3, 0.45], [0.35, 0.37, 0.3]];
    const tire = std([0.05, 0.05, 0.05], 0.9), glass = std([0.08, 0.1, 0.12], 0.1, 0.3);
    const cars = [[-36, -76, 0.1], [-30, -77, -0.05], [-12, -94, 1.5], [14, -112, 0.05], [34, -110, -0.1], [-40, -118, 0.3], [40, -80, 1.2]];
    this.L.cars = cars;
    cars.forEach(([x, z, rot], i) => {
      const mat = std(cols[i % cols.length], 0.35, 0.4);
      const add = (mt, gg) => { gg.rotateY(rot); gg.translate(x, Lt.y, z); B.add(mt, gg); };
      add(mat, rbox(1.9, 0.8, 4.6, 0.2, 0, 0.75, 0));
      add(glass, rbox(1.7, 0.65, 2.6, 0.18, 0, 1.4, -0.2));
      add(mat, box(1.72, 0.06, 2.4, 0, 1.73, -0.2));
      [[-0.85, 1.4], [0.85, 1.4], [-0.85, -1.45], [0.85, -1.45]].forEach(([wx, wz]) => add(tire, place(new THREE.CylinderGeometry(0.36, 0.36, 0.25, 14), wx, 0.36, wz, 0, 0, Math.PI / 2)));
      this.L.colliders.push({ x, z, r: 1.6 }, { x: x + Math.sin(rot) * 1.5, z: z + Math.cos(rot) * 1.5, r: 1.2 }, { x: x - Math.sin(rot) * 1.5, z: z - Math.cos(rot) * 1.5, r: 1.2 });
    });
    B.build(this.root);
  }

  buildMinefield() {
    const B = new Builder();
    const post = std([0.4, 0.33, 0.25], 0.9);
    const wire = std([0.35, 0.35, 0.36], 0.5, 0.7);
    this.L.minePosts.forEach((p) => {
      const y = heightAt(p.x, p.z);
      B.add(post, box(0.1, 1.6, 0.1, p.x, y + 0.6, p.z));
    });
    // concertina coils as helix tubes
    const pts = []; const turns = 16, len = 6, rad = 0.45;
    for (let i = 0; i <= turns * 12; i++) { const a = (i / 12) * Math.PI * 2; pts.push(new THREE.Vector3(-len / 2 + (i / (turns * 12)) * len, rad + Math.sin(a) * rad, Math.cos(a) * rad)); }
    const coil = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), turns * 12, 0.012, 3, false);
    const ci = new THREE.InstancedMesh(coil, wire, this.L.wireRuns.length);
    this.L.wireRuns.forEach((w, i) => {
      _e.set(0, w.rot, 0); _q.setFromEuler(_e); _p.set(w.x, heightAt(w.x, w.z) - 0.1, w.z); _s.set(1, 1, 1);
      _m.compose(_p, _q, _s); ci.setMatrixAt(i, _m);
    });
    ci.castShadow = true;
    this.root.add(ci);
    B.build(this.root);
    // signs
    const c = document.createElement('canvas'); c.width = 256; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#c8b9a0'; g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#b3160f'; g.beginPath(); g.moveTo(128, 12); g.lineTo(246, 220); g.lineTo(10, 220); g.closePath(); g.fill();
    g.fillStyle = '#f1ead9'; g.beginPath(); g.arc(128, 120, 34, 0, Math.PI * 2); g.fill(); g.fillRect(108, 140, 40, 26);
    g.fillStyle = '#b3160f'; g.beginPath(); g.arc(115, 118, 9, 0, 7); g.arc(141, 118, 9, 0, 7); g.fill(); g.fillRect(124, 135, 8, 10);
    g.strokeStyle = '#f1ead9'; g.lineWidth = 10; g.beginPath(); g.moveTo(80, 160); g.lineTo(176, 196); g.moveTo(176, 160); g.lineTo(80, 196); g.stroke();
    g.fillStyle = '#111'; g.font = 'bold 30px Arial'; g.textAlign = 'center'; g.fillText('DANGER  MINES', 128, 250);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const signGeo = new THREE.PlaneGeometry(0.8, 0.8);
    const si = new THREE.InstancedMesh(signGeo, new THREE.MeshStandardMaterial({ map: t, roughness: 0.8, side: THREE.DoubleSide }), this.L.minePosts.length);
    this.L.minePosts.forEach((p, i) => {
      _e.set(0, p.ang, 0.06); _q.setFromEuler(_e); _p.set(p.x, heightAt(p.x, p.z) + 1.15, p.z); _s.set(1, 1, 1);
      _m.compose(_p, _q, _s); si.setMatrixAt(i, _m);
    });
    this.root.add(si);
    // mine discs
    const mg = cyl(0.17, 0.2, 0.09, 12, 0, 0, 0);
    const mi = new THREE.InstancedMesh(mg, std([0.24, 0.28, 0.18], 0.7, 0.2), this.L.mines.length);
    this.L.mines.forEach((m, i) => {
      _e.set(0.1, m.rot, 0.05); _q.setFromEuler(_e); _p.set(m.x, heightAt(m.x, m.z) + 0.01, m.z); _s.set(1, 1, 1);
      _m.compose(_p, _q, _s); mi.setMatrixAt(i, _m);
    });
    this.root.add(mi);
  }

  buildSandbags() {
    const bag = new RoundedBoxGeometry(0.62, 0.24, 0.36, 2, 0.1);
    const n = this.L.positions.length * 11;
    const im = new THREE.InstancedMesh(bag, std([0.56, 0.5, 0.38], 0.95), n);
    const r = mulberry32(6); let k = 0; const col = new THREE.Color();
    for (const p of this.L.positions) {
      for (let layer = 0; layer < 2; layer++) {
        const cnt = layer ? 5 : 6;
        for (let i = 0; i < cnt; i++) {
          const t = (i - (cnt - 1) / 2) * 0.62;
          const ang = t * 0.25;
          const x = p.x + t, z = p.bagZ - Math.abs(t) * 0.25;
          const y = heightAt(x, z) + 0.1 + layer * 0.22;
          _e.set((r() - 0.5) * 0.1, ang + (r() - 0.5) * 0.15, (r() - 0.5) * 0.1); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(1, 1, 1);
          _m.compose(_p, _q, _s); im.setMatrixAt(k, _m);
          const v = 0.85 + r() * 0.25; col.setRGB(v, v, v * 0.95); im.setColorAt(k, col); k++;
        }
      }
    }
    im.count = k; im.castShadow = im.receiveShadow = true;
    this.root.add(im);
  }

  // distant invasion fleet silhouettes (manually fogged so they read through the haze)
  buildFleet() {
    const B = new Builder();
    const fc = skyColorJS(new THREE.Vector3(0, 0.01, 1).normalize());
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(fc[0] * 0.62, fc[1] * 0.62, fc[2] * 0.66), fog: false });
    const ship = (x, z, L, s) => {
      B.add(mat, box(L, 7 * s, 14 * s, x, 3.5 * s, z));
      B.add(mat, box(L * 0.25, 14 * s, 10 * s, x + L * 0.1, 12 * s, z));
      B.add(mat, box(L * 0.06, 10 * s, 3 * s, x + L * 0.12, 22 * s, z));
      B.add(mat, place(new THREE.ConeGeometry(7 * s, L * 0.2, 4), x - L * 0.55, 3.5 * s, z, 0, 0, Math.PI / 2, 1, 1, 0.5));
    };
    ship(-600, 1800, 240, 1.4); ship(250, 2100, 180, 1.1); ship(900, 1700, 150, 1); ship(-1300, 2300, 200, 1.2); ship(-150, 1500, 120, 0.9);
    B.build(this.root, { cast: false, receive: false });
  }

  // ---------------- invasion vehicles ----------------
  buildVehicles() {
    this.vehicles = [];
    const hullC = std([0.27, 0.29, 0.26], 0.75, 0.25), dark = std([0.08, 0.08, 0.08], 0.9), char = std([0.05, 0.045, 0.04], 1.0);
    const lcacC = std([0.45, 0.47, 0.48], 0.7, 0.2), skirt = std([0.07, 0.07, 0.07], 0.95);
    for (const v of this.L.vehicles) {
      const grp = new THREE.Group();
      const ramp = new THREE.Group();
      const B = new Builder(), R = new Builder();
      if (v.type === 'aav') {
        // side profile, front at -z
        const s = new THREE.Shape();
        [[4.1, 0.5], [4.1, 2.7], [3.7, 3.15], [-2.2, 3.15], [-4.0, 2.0], [-4.3, 1.0], [-3.7, 0.5]].forEach(([z, y], i) => i ? s.lineTo(z, y) : s.moveTo(z, y));
        const hg = new THREE.ExtrudeGeometry(s, { depth: 3.3, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 1 });
        hg.translate(0, 0, -1.65); hg.rotateY(Math.PI / 2);
        B.add(hullC, hg);
        [-1, 1].forEach((sd) => {
          B.add(dark, box(0.55, 0.9, 7.6, sd * 1.55, 0.55, 0));
          for (let k = 0; k < 6; k++) B.add(dark, place(new THREE.CylinderGeometry(0.38, 0.38, 0.5, 12), sd * 1.55, 0.45, -3 + k * 1.2, 0, 0, Math.PI / 2));
        });
        B.add(hullC, box(1.1, 0.7, 1.4, 0.7, 3.5, -0.8));
        B.add(dark, place(new THREE.CylinderGeometry(0.06, 0.06, 2.0, 8), 0.7, 3.55, -2.4, Math.PI / 2, 0, 0));
        B.add(dark, place(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 8), 0.4, 3.55, -2.0, Math.PI / 2, 0, 0));
        B.add(std([0.1, 0.12, 0.13], 0.2, 0.4), box(2.4, 0.3, 0.05, 0, 2.8, -3.9));
        R.add(hullC, box(2.4, 2.0, 0.15, 0, 1.0, 0));
        ramp.position.set(0, 0.6, 4.1);
        v.height = 3.2;
      } else {
        B.add(skirt, rbox(14.5, 1.6, 27, 0.7, 0, 0.8, 0));
        B.add(lcacC, box(14, 0.6, 26, 0, 1.8, 0));
        [-1, 1].forEach((sd) => {
          B.add(lcacC, box(2.6, 2.8, 22, sd * 5.6, 3.5, 1));
          B.add(std([0.1, 0.12, 0.13], 0.2, 0.4), box(0.05, 0.7, 2.2, sd * 4.28, 4.3, -6));
          // ducted fans at the stern
          const fan = new THREE.TorusGeometry(2.0, 0.35, 8, 20); place(fan, sd * 3.6, 5.2, 12.3);
          B.add(lcacC, fan);
          B.add(dark, place(new THREE.CylinderGeometry(2.0, 2.0, 0.6, 20, 1, true), sd * 3.6, 5.2, 12.3, Math.PI / 2, 0, 0));
          B.add(lcacC, box(0.5, 3.4, 0.5, sd * 3.6, 3.4, 12.0));
        });
        B.add(lcacC, box(2.4, 2.4, 2.6, -5.6, 6.0, -6.5));
        R.add(lcacC, box(8.2, 3.0, 0.2, 0, 1.5, 0));
        ramp.position.set(0, 2.0, -12.8);
        v.height = 5;
      }
      const meshes = B.build(grp);
      R.build(ramp);
      grp.add(ramp);
      this.root.add(grp);
      const fanBlades = [];
      this.vehicles.push({ v, grp, ramp, meshes, rampMeshes: ramp.children, charred: false, char, fanBlades });
    }
  }

  buildHelos() {
    this.helos = [];
    const body = std([0.16, 0.18, 0.15], 0.6, 0.3), dark = std([0.04, 0.04, 0.04], 0.6), glass = std([0.05, 0.07, 0.08], 0.05, 0.6);
    for (const h of this.L.helos) {
      const grp = new THREE.Group();
      const B = new Builder();
      B.add(body, rbox(2.3, 2.1, 7.2, 0.7, 0, 1.75, 0.6));
      B.add(glass, rbox(2.0, 1.4, 1.8, 0.5, 0, 2.1, 4.1, -0.25, 0, 0));
      B.add(body, place(new THREE.CylinderGeometry(0.35, 0.75, 8.5, 10), 0, 2.4, -6.4, Math.PI / 2 + 0.06, 0, 0));
      B.add(body, box(0.25, 2.4, 1.4, 0, 3.6, -10.5, -0.3, 0, 0));
      B.add(body, box(3.2, 0.12, 0.8, 0, 2.6, -9.6));
      B.add(body, rbox(1.6, 0.8, 3.2, 0.3, 0, 3.1, 0.4));
      B.add(dark, box(2.32, 1.3, 1.8, 0, 1.7, 1.0));
      [[-1, 2.6], [1, 2.6]].forEach(([sx, z]) => { B.add(dark, place(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 12), sx * 1.2, 0.3, z, 0, 0, Math.PI / 2)); B.add(body, box(0.1, 0.6, 0.1, sx * 1.1, 0.6, z)); });
      B.add(dark, place(new THREE.CylinderGeometry(0.22, 0.22, 0.2, 12), 0, 0.5, -9.8, 0, 0, Math.PI / 2));
      B.build(grp);
      const rotor = new THREE.Group();
      const blades = []; for (let k = 0; k < 4; k++) blades.push(box(0.5, 0.05, 8.2, 0, 0, 4.1, 0, (k * Math.PI) / 2, 0));
      const rm = new THREE.Mesh(merge(blades), dark); rm.castShadow = true; rotor.add(rm);
      rotor.position.set(0, 3.75, 0.5); grp.add(rotor);
      const tail = new THREE.Group(); tail.add(new THREE.Mesh(merge([box(0.05, 1.6, 0.18, 0, 0, 0), box(0.05, 0.18, 1.6, 0, 0, 0)]), dark));
      tail.position.set(0.25, 3.8, -10.8); grp.add(tail);
      this.root.add(grp);
      this.helos.push({ h, grp, rotor, tail, pose: {} });
    }
  }

  buildDecals() {
    const tex = TX.makeScorchTex();
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, color: 0xffffff });
    this.decals = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat, 80);
    this.decals.count = 0; this.decals.renderOrder = 2;
    this.root.add(this.decals);
  }

  // ---------------------------------------------------------------
  update(tau, cam, explosions) {
    this.uTau.value = tau;
    // sun shadow follows camera
    const s = this.sun;
    const tx = Math.round(cam.position.x / 4) * 4, tz = Math.round(cam.position.z / 4) * 4;
    s.target.position.set(tx, 0, tz);
    s.position.set(tx + SUN_DIR.x * 200, SUN_DIR.y * 200, tz + SUN_DIR.z * 200);
    // vehicles
    for (const o of this.vehicles) {
      const v = o.v;
      const z = vehZ(v, tau);
      const moving = tau < v.tArrive;
      const gy = heightAt(v.x, z);
      const wy = v.type === 'aav' ? Math.max(gy, -1.2) : Math.max(gy, 0) + 0.35 * (moving ? 1 : 0.6);
      o.grp.position.set(v.x, wy + (moving ? Math.sin(tau * 2.1 + v.jitter * 6) * 0.06 : 0), z);
      o.grp.rotation.set(moving ? Math.sin(tau * 1.3 + v.jitter * 4) * 0.02 : 0, 0, 0);
      const rp = vehRamp(v, tau);
      if (v.type === 'aav') o.ramp.rotation.x = rp * 1.25; else o.ramp.rotation.x = -rp * 1.3;
      const dead = v.destroyT > 0 && tau >= v.destroyT;
      if (dead !== o.charred) {
        o.charred = dead;
        for (const m of o.meshes) { if (!m.userData.mat) m.userData.mat = m.material; m.material = dead ? o.char : m.userData.mat; }
        for (const m of o.ramp.children) { if (!m.userData.mat) m.userData.mat = m.material; m.material = dead ? o.char : m.userData.mat; }
        if (dead) { o.grp.rotation.z = 0.04; }
      }
    }
    for (const o of this.helos) {
      const p = heloPose(o.h, tau, o.pose);
      o.grp.position.set(p.x, p.y, p.z);
      o.grp.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
      o.rotor.rotation.y = tau * 28;
      o.tail.rotation.x = tau * 60;
    }
    for (const t of this.tracks) t.m.material.uniforms.uZ.value = vehZ(t.v, tau);
    // scorch decals
    let n = 0;
    for (const e of explosions) {
      if (tau < e.t || n >= 80) continue;
      const sz = e.big > 1 ? 9 : 5.5;
      _e.set(0, e.t * 7, 0); _q.setFromEuler(_e); _p.set(e.ix, heightAt(e.ix, e.iz) + 0.06, e.iz); _s.set(sz, 1, sz);
      _m.compose(_p, _q, _s); this.decals.setMatrixAt(n++, _m);
    }
    this.decals.count = n; this.decals.instanceMatrix.needsUpdate = true;
  }
}
