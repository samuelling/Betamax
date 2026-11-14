// Betamax signal chain: the render is clean and high-fidelity; the tape degrades it.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { makeTapeNoiseTex } from './textures.js';
import { REAL } from './real.js';

// ---------------------------------------------------------------- the photoreal chain (the beach)
// The scene goes to its own multisampled HDR target with a depth texture; from the depth alone come ambient
// occlusion (half-res, then a depth-aware blur) and the air: ground mist that thickens with distance and glows
// toward the sun.
const QV = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const AO_FRAG = /* glsl */`
  uniform sampler2D tDepth; uniform vec2 uRes; uniform mat4 uProj, uProjInv; varying vec2 vUv;
  vec3 vp(vec2 uv){ float d = texture2D(tDepth, uv).x; vec4 v = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return v.xyz / v.w; }
  void main(){
    float d = texture2D(tDepth, vUv).x; if (d >= 0.99999) { gl_FragColor = vec4(1.0); return; }
    vec3 p = vp(vUv); vec2 px = 1.0 / uRes;
    vec3 pr = vp(vUv + vec2(px.x, 0.0)), pl = vp(vUv - vec2(px.x, 0.0)), pu = vp(vUv + vec2(0.0, px.y)), pd = vp(vUv - vec2(0.0, px.y));
    vec3 dx = abs(pr.z - p.z) < abs(p.z - pl.z) ? pr - p : p - pl, dy = abs(pu.z - p.z) < abs(p.z - pd.z) ? pu - p : p - pd;
    vec3 n = normalize(cross(dx, dy));
    float radius = clamp(-p.z * 0.09, 0.22, 1.5);                    // metres: tight up close, broad far off
    float ruv = min(radius * uProj[1][1] * 0.5 / max(-p.z, 0.05), 0.11);
    float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    float occ = 0.0; float asp = uRes.y / uRes.x;
    for (int i = 0; i < 12; i++) {
      float a = (float(i) + ign) * 2.39996323, r = sqrt((float(i) + 0.5) / 12.0) * ruv;
      vec3 s = vp(vUv + vec2(cos(a) * asp, sin(a)) * r), v = s - p; float l = length(v) + 1e-4;
      occ += max(dot(n, v) / l - 0.1, 0.0) * (1.0 - smoothstep(radius * 0.7, radius * 1.8, l));
    }
    gl_FragColor = vec4(vec3(clamp(1.0 - occ / 12.0 * 2.1, 0.0, 1.0)), 1.0);
  }`;
const AIR_FRAG = /* glsl */`
  uniform sampler2D tScene, tAO, tDepth; uniform vec2 uRes; uniform mat4 uProjInv, uCamMat; uniform vec3 uCamPos, uSunDir, uFogCol, uSunCol;
  uniform float uMist, uHaze, uAO; varying vec2 vUv;
  vec3 vp(vec2 uv, float d){ vec4 v = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return v.xyz / v.w; }
  void main(){
    vec3 col = texture2D(tScene, vUv).rgb; float d = texture2D(tDepth, vUv).x;
    vec3 pv = vp(vUv, d); vec3 rd = normalize((uCamMat * vec4(normalize(pv), 0.0)).xyz);
    float mu = max(dot(rd, uSunDir), 0.0);
    if (d < 0.99999) {
      // ambient occlusion, blurred across the half-res buffer but not across depth edges
      vec2 hp = 2.0 / uRes; float z0 = -pv.z, ao = 0.0, wsum = 0.0;
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec2 o = vec2(float(i), float(j)) * hp;
        float z = -vp(vUv + o, texture2D(tDepth, vUv + o).x).z; float w = exp(-abs(z - z0) / (0.04 * z0 + 0.02));
        ao += texture2D(tAO, vUv + o).r * w; wsum += w; }
      ao = ao / max(wsum, 1e-4);
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col *= mix(1.0, mix(ao, 1.0, smoothstep(0.5, 2.2, lum) * 0.6), uAO);    // mostly out of the shade: direct sun fills a crease
      // the air
      float dist = length(pv), k = 0.05, ry = abs(rd.y) < 1e-3 ? 1e-3 : rd.y;
      float fh = uMist * exp(-k * max(uCamPos.y, 0.0)) * (1.0 - exp(-k * ry * dist)) / (k * ry);
      float f = 1.0 - exp(-max(fh, 0.0) - dist * uHaze);
      vec3 hz = mix(uFogCol, uSunCol, pow(mu, 5.0) * 0.6);
      col = mix(col, hz, clamp(f, 0.0, 1.0));
      col += uSunCol * pow(mu, 10.0) * (1.0 - exp(-dist * 0.004)) * 0.14;
    }
    gl_FragColor = vec4(col, 1.0);
  }`;
class RealPass extends Pass {
  constructor(scene, camera, samples) {
    super(); this.scene = scene; this.camera = camera; this.needsSwap = true;
    const rt = this.sceneRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples });
    rt.depthTexture = new THREE.DepthTexture(4, 4); rt.depthTexture.type = THREE.UnsignedIntType;
    this.aoRT = new THREE.WebGLRenderTarget(2, 2, { type: THREE.UnsignedByteType });
    this.ao = new THREE.ShaderMaterial({ uniforms: { tDepth: { value: rt.depthTexture }, uRes: { value: new THREE.Vector2(2, 2) }, uProj: { value: camera.projectionMatrix }, uProjInv: { value: camera.projectionMatrixInverse } }, vertexShader: QV, fragmentShader: AO_FRAG, depthTest: false, depthWrite: false });
    this.air = new THREE.ShaderMaterial({ uniforms: { tScene: { value: rt.texture }, tAO: { value: this.aoRT.texture }, tDepth: { value: rt.depthTexture }, uRes: { value: new THREE.Vector2(4, 4) },
      uProjInv: { value: camera.projectionMatrixInverse }, uCamMat: { value: camera.matrixWorld }, uCamPos: { value: camera.position }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uFogCol: { value: new THREE.Color(0.46, 0.5, 0.57) }, uSunCol: { value: new THREE.Color(1.0, 0.62, 0.34) }, uMist: { value: 0.0016 }, uHaze: { value: 0.0003 }, uAO: { value: 1 } }, vertexShader: QV, fragmentShader: AIR_FRAG, depthTest: false, depthWrite: false });
    this.fsq = new FullScreenQuad(this.ao);
  }
  setSize(w, h) { this.sceneRT.setSize(w, h); const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1); this.aoRT.setSize(hw, hh); this.ao.uniforms.uRes.value.set(hw, hh); this.air.uniforms.uRes.value.set(w, h); }
  render(renderer, writeBuffer) {
    renderer.setRenderTarget(this.sceneRT); renderer.clear(); renderer.render(this.scene, this.camera);
    this.fsq.material = this.ao; renderer.setRenderTarget(this.aoRT); this.fsq.render(renderer);
    this.fsq.material = this.air; renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.fsq.render(renderer);
  }
}
// the lens and the lab: a touch of fringing at the edges, a little sharpening, a war-film grade, grain
const GRADE = {
  uniforms: { tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 }, uGrain: { value: 1 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uTime, uGrain; varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
    void main(){
      vec2 q = vUv - 0.5; float r2 = dot(q, q); vec2 px = 1.0 / uRes;
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      c.r = texture2D(tDiffuse, vUv + q * r2 * 0.008).r; c.b = texture2D(tDiffuse, vUv - q * r2 * 0.008).b;
      vec3 bl = (texture2D(tDiffuse, vUv + vec2(px.x, 0.0)).rgb + texture2D(tDiffuse, vUv - vec2(px.x, 0.0)).rgb + texture2D(tDiffuse, vUv + vec2(0.0, px.y)).rgb + texture2D(tDiffuse, vUv - vec2(0.0, px.y)).rgb) * 0.25;
      c = max(c + (c - bl) * 0.32, 0.0);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, 0.9);                                                        // a little bleach
      c *= mix(vec3(0.93, 0.99, 1.07), vec3(1.05, 1.0, 0.94), smoothstep(0.05, 0.65, l));   // cool shadows, warm lights
      c = mix(c, c * c * (3.0 - 2.0 * c), 0.42);                                        // contrast
      c *= 1.0 - r2 * 0.62;
      c += (rnd(vUv * uRes + fract(uTime) * 311.0) - 0.5) * 0.035 * uGrain * (1.0 - l * 0.5);
      gl_FragColor = vec4(c, 1.0);
    }`,
};

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
    this.scenePass = new RenderPass(scene, camera); this.composer.addPass(this.scenePass);
    this.real = new RealPass(scene, camera, q.msaa || 0); this.real.enabled = false; this.composer.addPass(this.real);
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
    this.grade = new ShaderPass(GRADE); this.grade.enabled = false; this.composer.addPass(this.grade);
    this.vhs = new ShaderPass(VHS);
    this.vhs.uniforms.tNoise.value = makeTapeNoiseTex();
    this.composer.addPass(this.vhs);
    this.u = this.vhs.uniforms;
  }
  setSize(w, h, pr) { this.composer.setPixelRatio(pr); this.composer.setSize(w, h); this.u.uRes.value.set(w * pr, h * pr); this.cel.uniforms.uRes.value.set(w * pr, h * pr); this.grade.uniforms.uRes.value.set(w * pr, h * pr); }
  render(t, sunDir) {
    this.u.uTime.value = t;
    const on = REAL.on;
    this.scenePass.enabled = this.cel.enabled = !on; this.real.enabled = this.grade.enabled = on;
    this.grade.uniforms.uTime.value = t; this.grade.uniforms.uGrain.value = this.u.uVcr.value > 0.5 ? 0.4 : 1;
    if (this.bloom) { this.bloom.strength = on ? 0.32 : 0.5; this.bloom.radius = on ? 0.75 : 0.55; this.bloom.threshold = on ? 1.0 : 0.92; }
    if (on && sunDir) this.real.air.uniforms.uSunDir.value.copy(sunDir);
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
