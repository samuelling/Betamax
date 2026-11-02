// Betamax signal chain: the render is clean and high-fidelity; the tape degrades it.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeTapeNoiseTex } from './textures.js';

const VHS = {
  uniforms: {
    tDiffuse: { value: null }, tNoise: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
    uRew: { value: 1 }, uFF: { value: 0 }, uAmt: { value: 1 }, uDamage: { value: 0 }, uFlash: { value: 0 }, uDesat: { value: 0 }, uStatic: { value: 0 }, uPause: { value: 0 }, uStuck: { value: 0 }, uVcr: { value: 1 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse, tNoise; uniform float uTime, uRew, uFF, uAmt, uDamage, uFlash, uDesat, uStatic, uPause, uStuck, uVcr; uniform vec2 uRes;
    varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
    vec3 toYIQ(vec3 c){ return vec3(dot(c, vec3(0.299,0.587,0.114)), dot(c, vec3(0.596,-0.274,-0.322)), dot(c, vec3(0.211,-0.523,0.312))); }
    vec3 toRGB(vec3 y){ return vec3(y.x + 0.956*y.y + 0.621*y.z, y.x - 0.272*y.y - 0.647*y.z, y.x - 1.106*y.y + 1.703*y.z); }
    void main(){
      vec2 uv = vUv; float t = uTime;
      // stuck slow-rewind: the picture hops vertically and a fat noise bar sits on screen
      float hop = floor(t*14.0);
      uv.y += uStuck * (rnd(vec2(hop, 3.1)) - 0.5) * 0.012;
      uv.y = fract(uv.y + uStuck * step(0.93, rnd(vec2(hop, 7.7))) * 0.08);
      float lines = 486.0;
      float ln = floor(uv.y * lines);
      float spd = clamp(uRew*0.6 + uFF*1.6 + uPause*0.4 + uStuck*0.9, 0.0, 2.0);
      // gentle per-line timebase wobble
      float jit = (rnd(vec2(ln, floor(t*29.97))) - 0.5) * 0.0009 * uAmt;
      jit += sin(uv.y*9.0 + t*1.7) * 0.0006 * uAmt;
      // search-noise bars while the tape is shuttling
      float dir = uFF > 0.01 ? 1.0 : -1.0;
      float by = mix(fract(t * (0.11 + uFF*0.9) * dir + 0.3), 0.68 + sin(t*0.9)*0.04 + (rnd(vec2(hop,1.0))-0.5)*0.02, uStuck);
      float by2 = fract(by + 0.52 + sin(t*0.3)*0.05);
      float band = smoothstep(0.045, 0.0, abs(uv.y - by)) * spd + smoothstep(0.022, 0.0, abs(uv.y - by2)) * spd * 0.7;
      band = min(band, 1.2);
      jit += band * (rnd(vec2(ln, t)) - 0.4) * 0.05;
      // head-switching noise at the bottom of frame
      float hs = smoothstep(0.03, 0.0, uv.y);
      jit += hs * (0.02 + 0.02*rnd(vec2(ln, floor(t*60.0))));
      uv.x += jit;
      // luma sharp-ish, chroma smeared and delayed
      vec3 base = texture2D(tDiffuse, uv).rgb;
      vec3 y = toYIQ(base);
      float ly = 0.0;
      ly += toYIQ(texture2D(tDiffuse, uv + vec2(-1.0/uRes.x, 0.0)).rgb).x;
      ly += toYIQ(texture2D(tDiffuse, uv + vec2( 1.0/uRes.x, 0.0)).rgb).x;
      y.x = y.x*1.35 - ly*0.175; // slight sharpening ring
      vec2 ch = vec2(0.0);
      for (int i = -4; i <= 4; i++) {
        vec2 o = vec2((float(i)*2.2 + 3.0*uAmt)/uRes.x, 0.0);
        ch += toYIQ(texture2D(tDiffuse, uv + o).rgb).yz;
      }
      y.yz = ch / 9.0 * mix(0.95, 0.0, uDesat);
      vec3 col = toRGB(y);
      // tape noise
      float n = texture2D(tNoise, uv*vec2(1.5, 4.0) + vec2(fract(t*7.13), fract(t*3.71))).r;
      col = mix(col, vec3(n*0.9), clamp(band*0.6 + hs*0.35 + uStatic, 0.0, 1.0));
      // dropouts: short white streaks
      float dr = rnd(vec2(floor(uv.y*lines), floor(t*24.0)));
      float streak = step(0.9975 - spd*0.004, dr) * step(rnd(vec2(floor(uv.x*30.0), dr)), 0.35);
      col += streak * 0.6 * uAmt;
      // fine grain + subtle scanlines
      col += (rnd(vUv*uRes + fract(t)*100.0) - 0.5) * 0.045 * uAmt;
      col *= 0.955 + 0.045*sin(vUv.y*uRes.y*1.5708);
      // grade: lifted blacks, soft highlights, warm cast
      col = col * vec3(1.03, 0.99, 0.94) * 0.95 + vec3(0.022, 0.02, 0.026);
      col = mix(vec3(dot(col, vec3(0.333))), col, 1.08); col = (col - 0.5) * 1.06 + 0.5;
      // vignette
      vec2 q = vUv - 0.5;
      col *= 1.0 - dot(q, q) * 0.75;
      // the VCR off (settings): the clean picture, keeping only what the game needs you to see
      if (uVcr < 0.5) { vec3 c0 = texture2D(tDiffuse, vUv).rgb; col = mix(c0, vec3(dot(c0, vec3(0.299, 0.587, 0.114))), uDesat * 0.85); col *= 1.0 - uPause * 0.25; }
      // damage + flash
      col = mix(col, vec3(0.5, 0.02, 0.02), uDamage * smoothstep(0.2, 0.75, length(q)*1.5));
      col = mix(col, vec3(1.0), uFlash);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

// crepuscular rays: radial blur of the bright sky toward the sun (occluders darken it for free)
const RAYS = {
  uniforms: { tDiffuse: { value: null }, uSun: { value: new THREE.Vector2(0.5, 0.5) }, uAmt: { value: 0 }, uAspect: { value: 1 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uSun; uniform float uAmt; uniform float uAspect; varying vec2 vUv;
    void main(){
      vec4 base = texture2D(tDiffuse, vUv);
      if (uAmt <= 0.001) { gl_FragColor = base; return; }
      vec2 d = (uSun - vUv) / 48.0 * 0.85;
      vec2 p = vUv; float decay = 1.0; vec3 acc = vec3(0.0);
      for (int i = 0; i < 48; i++) {
        p += d;
        vec3 c = texture2D(tDiffuse, p).rgb;
        float l = dot(c, vec3(0.3, 0.5, 0.2));
        acc += max(c - 1.35, 0.0) * decay;
        decay *= 0.965;
      }
      vec2 q = (vUv - uSun) * vec2(uAspect, 1.0);
      float fall = 1.0 / (1.0 + dot(q, q) * 6.0);
      gl_FragColor = vec4(base.rgb + acc / 48.0 * uAmt * vec3(1.0, 0.8, 0.6) * (0.4 + fall), base.a);
    }`,
};

// cel shading: luminance pulled into a few soft-edged bands (hue kept, a little extra saturation) plus ink
// outlines from the depth buffer — silhouettes and creases where 1/z stops being planar
const CEL = {
  uniforms: {
    tDiffuse: { value: null }, tDepth: { value: null }, uRes: { value: new THREE.Vector2(1, 1) },
    uNear: { value: 0.05 }, uFar: { value: 5000 }, uBands: { value: 0 }, uInk: { value: 1 }, uOn: { value: 1 }, uSat: { value: 1.14 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse, tDepth; uniform vec2 uRes; uniform float uNear, uFar, uBands, uInk, uOn, uSat;
    varying vec2 vUv;
    float linZ(vec2 uv){ float d = texture2D(tDepth, uv).x; float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
    void main(){
      vec4 base = texture2D(tDiffuse, vUv);
      if (uOn < 0.5) { gl_FragColor = base; return; }
      vec3 c = base.rgb;
      // bands
      // the light is banded in the materials now (Ashland's ramp); here only a little extra colour
      vec3 col = c;
      if (uBands > 0.5) { float lum = max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 1e-5); float p = pow(lum, 1.0 / 2.2) * uBands; float q = (floor(p) + smoothstep(0.42, 0.58, fract(p))) / uBands; col = c * pow(max(q, 0.0), 2.2) / lum; }
      float g = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = max(mix(vec3(g), col, uSat), 0.0);
      // ink: Ashland's — a darker, plummier tint of whatever it outlines, not black
      vec2 px = 1.5 / uRes;
      float z0 = linZ(vUv);
      // a soldier's side, coded in alpha by the soldier material (0.9 Cape Cod, 0.8 Texas): their ink is their colour
      float tc = 0.0;
      for (int i = 0; i < 4; i++) { vec2 o = i == 0 ? vec2(px.x, 0.0) : i == 1 ? vec2(-px.x, 0.0) : i == 2 ? vec2(0.0, px.y) : vec2(0.0, -px.y);
        float a = texture2D(tDiffuse, vUv + o * 1.4).a; if (a > 0.85 && a < 0.95) tc = 1.0; else if (a > 0.75 && a < 0.85 && tc < 0.5) tc = 2.0; }
      if (base.a > 0.85 && base.a < 0.95) tc = 1.0; else if (base.a > 0.75 && base.a < 0.85) tc = 2.0;
      if (z0 < uFar * 0.98 && base.a > 0.75) {
        float w0 = 1.0 / z0;
        float wl = 1.0 / linZ(vUv - vec2(px.x, 0.0)), wr = 1.0 / linZ(vUv + vec2(px.x, 0.0));
        float wd = 1.0 / linZ(vUv - vec2(0.0, px.y)), wu = 1.0 / linZ(vUv + vec2(0.0, px.y));
        float lap = abs(wl + wr - 2.0 * w0) + abs(wd + wu - 2.0 * w0);
        float sil = max(max(abs(wl - w0), abs(wr - w0)), max(abs(wd - w0), abs(wu - w0)));
        float e = max(smoothstep(0.02, 0.05, lap / w0), smoothstep(0.1, 0.2, sil / w0));
        float fade = 1.0 - smoothstep(60.0, 260.0, z0);
        vec3 ink = tc > 1.5 ? vec3(0.42, 0.035, 0.02) : tc > 0.5 ? vec3(0.02, 0.07, 0.42) : col * vec3(0.34, 0.27, 0.31) * 0.85 + vec3(0.004, 0.003, 0.004);
        col = mix(col, ink, e * (tc > 0.5 ? 1.0 : fade) * uInk);
      }
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class Post {
  constructor(renderer, scene, camera, q) {
    this.composer = new EffectComposer(renderer);
    // the scene pass renders into renderTarget2; give it a depth texture for the ink lines
    const rt = this.composer.renderTarget2;
    rt.depthTexture = new THREE.DepthTexture(rt.width, rt.height); rt.depthTexture.type = THREE.UnsignedIntType;
    this.composer.addPass(new RenderPass(scene, camera));
    this.cel = new ShaderPass(CEL); this.cel.uniforms.tDepth.value = rt.depthTexture;
    this.cel.uniforms.uNear.value = camera.near; this.cel.uniforms.uFar.value = camera.far;
    this.composer.addPass(this.cel);
    this.rays = new ShaderPass(RAYS); this.composer.addPass(this.rays);
    this.camera = camera; this._v = new THREE.Vector3();
    if (q.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.5, 0.55, 0.92);
      this.composer.addPass(this.bloom);
    }
    this.composer.addPass(new OutputPass());
    this.vhs = new ShaderPass(VHS);
    this.vhs.uniforms.tNoise.value = makeTapeNoiseTex();
    this.composer.addPass(this.vhs);
    this.u = this.vhs.uniforms;
  }
  setSize(w, h, pr) { this.composer.setPixelRatio(pr); this.composer.setSize(w, h); this.u.uRes.value.set(w * pr, h * pr); this.cel.uniforms.uRes.value.set(w * pr, h * pr); }
  render(t, sunDir) {
    this.u.uTime.value = t;
    this.cel.uniforms.uNear.value = this.camera.near; this.cel.uniforms.uFar.value = this.camera.far;
    if (sunDir) {
      const c = this.camera, v = this._v.copy(c.position).addScaledVector(sunDir, 1000).project(c);
      const fwd = new THREE.Vector3(); c.getWorldDirection(fwd);
      const facing = fwd.dot(sunDir);
      const ru = this.rays.uniforms;
      ru.uSun.value.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5);
      const edge = Math.max(0, 1 - Math.max(Math.abs(v.x), Math.abs(v.y)) / 1.6);
      ru.uAmt.value = facing > 0 ? Math.min(1, facing * 2) * edge * 5 : 0;
      ru.uAspect.value = c.aspect;
    }
    this.composer.render();
  }
}
