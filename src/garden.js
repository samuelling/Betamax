// Garden beds for the home scenes, grown with Shortwood Meadow's plant art (see plantart.js): each plant is
// built from its species look at full health and full bloom, instanced per species, swaying in the wind.
import * as THREE from 'three';
import { PlantArt, LOOKS, SIZES } from './plantart.js';

const T = THREE, TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lin = (hex) => new T.Color(hex).convertSRGBToLinear();

// wind, shared by everything that sways (world units here are metres)
export const WIND = { uTime: { value: 0 }, uWind: { value: 0.35 }, uGust: { value: 0 }, uWindDir: { value: new T.Vector2(0.8, 0.6) } };
const VERT_HEAD = 'uniform float uTime; uniform float uWind; uniform float uGust; uniform vec2 uWindDir; uniform float uSway; uniform float uSwayH;';
const VERT_PROJECT = /* glsl */`
  vec4 wp = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    wp = instanceMatrix * wp;
  #endif
  wp = modelMatrix * wp;
  if ( uSway > 0.0 ) {
    #ifdef USE_INSTANCING
      vec3 org = ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
    #else
      vec3 org = wp.xyz;
    #endif
    float h = max( wp.y - uSwayH, 0.0 );
    float bend = pow( clamp( h / 0.9, 0.0, 1.8 ), 1.6 ) * uSway;
    float ph = dot( wp.xz, uWindDir ) * 0.8 - uTime * 2.2;
    float wave = 0.55 + 0.3 * sin( ph ) + 0.15 * sin( ph * 2.7 + 1.3 );
    float push = uWind * ( 0.6 + 1.4 * uGust ) * wave;
    float flutter = sin( uTime * ( 5.0 + 3.0 * uWind ) + org.x * 35.0 + org.z * 67.0 ) * ( 0.12 + uWind ) * 0.6;
    vec2 side = vec2( -uWindDir.y, uWindDir.x );
    wp.xz += ( uWindDir * push * 4.0 * bend + side * flutter * bend ) * 0.0254;
    wp.y -= push * push * 1.2 * bend * 0.0254;
  }
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;`;

// sway: 0 = rigid; swayH: ground height in metres. inkless: tag the pixels so the cel pass draws no outlines
// through foliage (it would turn a bed into scribble)
export function sway(m, amount = 1, swayH = 0, inkless = true) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    Object.assign(sh.uniforms, WIND); sh.uniforms.uSway = { value: amount }; sh.uniforms.uSwayH = { value: swayH };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VERT_HEAD).replace('#include <project_vertex>', VERT_PROJECT);
    if (inkless && sh.fragmentShader.includes('#include <dithering_fragment>')) sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.a = 0.5;');
  };
  m.customProgramCacheKey = () => 'sway' + amount + '_' + swayH + (inkless ? 'i' : '');
  return m;
}

const texCache = {};
function mat(o, s, swayH) { return sway(new T.MeshStandardMaterial(Object.assign({ roughness: 0.8, metalness: 0 }, o)), s, swayH); }
function depthFor(map, s, swayH) { return sway(new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking, map, alphaTest: map ? 0.35 : 0 }), s, swayH, false); }

// items: [{ k: species, x, z (metres), s: size factor, seed }]. Returns a Group (internally in inches).
export function buildBed(renderer, items, groundY = 0, detail = 1) {
  const art = PlantArt.make(T), root = new T.Group(); root.scale.setScalar(0.0254); root.position.y = groundY;
  const stemGeo = new T.CylinderGeometry(1, 1, 1, 6, 1, true).translate(0, 0.5, 0);
  const by = {};
  for (const it of items) (by[it.k] || (by[it.k] = [])).push(it);
  const _m = new T.Matrix4(), _p = new T.Vector3(), _s = new T.Vector3(), _q = new T.Quaternion(), _a = new T.Vector3(), _b = new T.Vector3(), _c = new T.Color(), _Y = new T.Vector3(0, 1, 0);
  for (const [k, list] of Object.entries(by)) {
    const L = LOOKS[k], F = PlantArt.FL[L.flStyle], [H0, S0] = SIZES[k] || [24, 20];
    const lt = texCache['leaf:' + L.leaf] || (texCache['leaf:' + L.leaf] = PlantArt.leafTexture(T, L.leaf, renderer));
    const ft = texCache['fl:' + k] || (texCache['fl:' + k] = PlantArt.flowerTexture(T, L, renderer));
    const gens = list.map((it, i) => art.gen(L, (it.seed || i + 1) * 7919 + k.length * 31));
    const nl = gens.reduce((a, G) => a + G.leaves.length, 0), nf = gens.reduce((a, G) => a + G.fls.length, 0);
    const ns = gens.reduce((a, G) => a + (L.form === 'rosette' ? G.spires : G.stems).reduce((b, p) => b + p.length - 1, 0), 0);
    const leaf = new T.InstancedMesh(PlantArt.leafGeometry(T, L), mat({ map: lt, alphaTest: 0.35, roughness: L.gloss ? 0.45 : 0.72, side: T.DoubleSide }, 1, groundY), Math.max(1, nl));
    const fl = new T.InstancedMesh(PlantArt.flowerGeometry(T, L), mat({ map: ft, alphaTest: 0.35, roughness: 0.55, side: F && F.kind === 'sphere' ? T.DoubleSide : T.FrontSide }, 1, groundY), Math.max(1, nf));
    const st = ns ? new T.InstancedMesh(stemGeo, mat({ roughness: 0.8 }, 1, groundY), ns) : null;
    leaf.customDepthMaterial = depthFor(lt, 1, groundY); fl.customDepthMaterial = depthFor(ft, 1, groundY); if (st) st.customDepthMaterial = depthFor(null, 1, groundY);
    let il = 0, iF = 0, is = 0;
    const leafCol = lin(L.leafCol), stemCol = lin(L.stemCol);
    list.forEach((it, n) => {
      const G = gens[n], s = it.s || 1, R = S0 / 2 * s, H = H0 * s, cx = it.x / 0.0254, cz = it.z / 0.0254;
      const W = (p, out) => out.set(cx + p[0] * R, p[1] * H, cz + p[2] * R);
      for (let li = 0; li < G.leaves.length; li++) {
        const lf = G.leaves[li]; if (detail < 1 && ((li * 7919) % 100) / 100 > detail) continue;
        W(lf.p, _p);
        if (lf.sword) _s.set(L.leafIn[0] * (0.8 + lf.v * 0.4), lf.sword * H, 1); else _s.set(L.leafIn[0] * lf.s, L.leafIn[1] * lf.s, 1);
        _m.compose(_p, lf.q, _s); leaf.setMatrixAt(il, _m);
        _c.copy(leafCol).multiplyScalar(0.82 + 0.36 * lf.v); leaf.setColorAt(il, _c); il++;
      }
      if (st) {
        const rad = L.stemR || (0.06 + 0.0035 * H0);
        for (const pts of (L.form === 'rosette' ? G.spires : G.stems)) for (let i = 0; i < pts.length - 1; i++) {
          W(pts[i], _a); W(pts[i + 1], _b); _b.sub(_a); const len = _b.length(); if (len < 0.05) continue;
          _q.setFromUnitVectors(_Y, _b.multiplyScalar(1 / len)); _s.set(rad * (1 - i * 0.18), len, rad * (1 - i * 0.18));
          _m.compose(_a, _q, _s); st.setMatrixAt(is, _m); st.setColorAt(is, stemCol); is++;
        }
      }
      for (const f of G.fls) {
        W(f.p, _p);
        if (F && F.kind === 'spike') _s.set(L.flIn[0] * f.s, L.flIn[1] * f.s, L.flIn[0] * f.s);
        else { const d = (Array.isArray(L.flIn) ? L.flIn[0] : L.flIn) * f.s; _s.set(d, d, d); }
        _m.compose(_p, f.q, _s); fl.setMatrixAt(iF, _m); fl.setColorAt(iF, _c.setRGB(1, 1, 1)); iF++;
      }
    });
    for (const [m, n] of [[leaf, il], [fl, iF], [st, is]]) if (m) { m.count = n; m.castShadow = m.receiveShadow = true; m.frustumCulled = false; root.add(m); }
  }
  return root;
}

// a quick textured cross-billboard set (lawn tufts, weeds, distant trees)
export function crossTex(w, h, draw) {
  const [c, g] = PlantArt.canvas(w, h); draw(g, w, h);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
}
export const crossGeo = (n, cap) => PlantArt.crossGeo(T, n, false, cap);
export const rngOf = PlantArt.rngOf;
