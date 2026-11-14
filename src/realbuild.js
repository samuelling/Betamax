// The photoreal beach's built world: Cape Cod houses (breakable, piece by piece), the boardwalk and its stairs, the
// snack shack, dune fencing, the parking lot and its furniture, sandbags, the minefield's wire, and the boulders on
// the flats. Everything is procedural three.js geometry written straight into a few big vertex buffers ("soups"),
// one per material, so the whole set costs a few dozen draw calls. Collision lives in layout.js / obstacles.js and
// is not touched: footprints, deck and tread heights here follow the layout exactly.
import * as THREE from 'three';
import { heightAt, LOT } from './terrain.js';
import { mulberry32, fbm, hash2 } from './rng.js';
import * as TX from './textures.js';

const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
const PX = 1, NX = 2, PY = 4, NY = 8, PZ = 16, NZ = 32;
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _m4 = new THREE.Matrix4(), _m4b = new THREE.Matrix4(), _e = new THREE.Euler(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);

// ---------------------------------------------------------------------------------------------------------------------
// vertex soup: growable indexed buffers for one material
class Soup {
  constructor(piece) {
    this.cap = 1024; this.icap = 2048; this.nv = 0; this.ni = 0;
    this.p = new Float32Array(this.cap * 3); this.n = new Float32Array(this.cap * 3); this.u = new Float32Array(this.cap * 2); this.c = new Float32Array(this.cap * 3);
    this.k = piece ? new Float32Array(this.cap) : null; this.i = new Uint32Array(this.icap);
  }
  need(v, i) {
    if (this.nv + v > this.cap) {
      while (this.nv + v > this.cap) this.cap *= 2;
      const g = (a, s) => { const b = new a.constructor(this.cap * s); b.set(a); return b; };
      this.p = g(this.p, 3); this.n = g(this.n, 3); this.u = g(this.u, 2); this.c = g(this.c, 3); if (this.k) this.k = g(this.k, 1);
    }
    if (this.ni + i > this.icap) { while (this.ni + i > this.icap) this.icap *= 2; const b = new Uint32Array(this.icap); b.set(this.i); this.i = b; }
  }
  geometry() {
    const g = new THREE.BufferGeometry(), nv = this.nv;
    g.setAttribute('position', new THREE.BufferAttribute(this.p.slice(0, nv * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.n.slice(0, nv * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(this.u.slice(0, nv * 2), 2));
    g.setAttribute('color', new THREE.BufferAttribute(this.c.slice(0, nv * 3), 3));
    if (this.k) g.setAttribute('piece', new THREE.BufferAttribute(this.k.slice(0, nv), 1));
    g.setIndex(new THREE.BufferAttribute(this.i.slice(0, this.ni), 1));
    return g;
  }
}

// a kit: soups by material name, with a shared transform stack, vertex colour and piece id
export class Kit {
  constructor(piece = false) { this.S = {}; this.piece = piece; this.M = new THREE.Matrix4(); this.stack = []; this.r = 1; this.g = 1; this.b = 1; this.pid = 0; this.tris = 0; }
  soup(name) { return this.S[name] || (this.S[name] = new Soup(this.piece)); }
  push(m) { this.stack.push(this.M.clone()); this.M.multiply(m); return this; }
  pushT(x, y, z, ry = 0, rx = 0, rz = 0) { _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(1, 1, 1); return this.push(_m4b.compose(_p, _q, _s)); }
  // a frame from an origin and three orthonormal axes (columns)
  pushF(o, U, V, N) { _m4b.set(U[0], V[0], N[0], o[0], U[1], V[1], N[1], o[1], U[2], V[2], N[2], o[2], 0, 0, 0, 1); return this.push(_m4b); }
  pop() { this.M.copy(this.stack.pop()); return this; }
  // display-space colour, optionally jittered in value
  col(r, g, b, j = 0, rnd = null) { const k = j && rnd ? 1 + (rnd() - 0.5) * 2 * j : 1; this.r = lin(clamp01(r * k)); this.g = lin(clamp01(g * k)); this.b = lin(clamp01(b * k)); return this; }
  colA(c, k = 1) { return this.col(c[0] * k, c[1] * k, c[2] * k); }
  _vert(s, x, y, z, nx, ny, nz, u, v) {
    const e = this.M.elements, i = s.nv++;
    s.p[i * 3] = e[0] * x + e[4] * y + e[8] * z + e[12]; s.p[i * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; s.p[i * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    s.n[i * 3] = e[0] * nx + e[4] * ny + e[8] * nz; s.n[i * 3 + 1] = e[1] * nx + e[5] * ny + e[9] * nz; s.n[i * 3 + 2] = e[2] * nx + e[6] * ny + e[10] * nz;
    s.u[i * 2] = u; s.u[i * 2 + 1] = v; s.c[i * 3] = this.r; s.c[i * 3 + 1] = this.g; s.c[i * 3 + 2] = this.b; if (s.k) s.k[i] = this.pid;
    return i;
  }
  // quad A,B,C,D counter-clockwise seen from the front; uv = [ua,va, ub,vb, uc,vc, ud,vd]
  quad(mat, A, B, C, D, uv) {
    const s = this.soup(mat); s.need(4, 6);
    let nx = (B[1] - A[1]) * (D[2] - A[2]) - (B[2] - A[2]) * (D[1] - A[1]), ny = (B[2] - A[2]) * (D[0] - A[0]) - (B[0] - A[0]) * (D[2] - A[2]), nz = (B[0] - A[0]) * (D[1] - A[1]) - (B[1] - A[1]) * (D[0] - A[0]);
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const a = this._vert(s, A[0], A[1], A[2], nx, ny, nz, uv ? uv[0] : 0, uv ? uv[1] : 0), b = this._vert(s, B[0], B[1], B[2], nx, ny, nz, uv ? uv[2] : 0, uv ? uv[3] : 0);
    const c = this._vert(s, C[0], C[1], C[2], nx, ny, nz, uv ? uv[4] : 0, uv ? uv[5] : 0), d = this._vert(s, D[0], D[1], D[2], nx, ny, nz, uv ? uv[6] : 0, uv ? uv[7] : 0);
    s.i[s.ni++] = a; s.i[s.ni++] = b; s.i[s.ni++] = c; s.i[s.ni++] = a; s.i[s.ni++] = c; s.i[s.ni++] = d; this.tris += 2;
  }
  tri(mat, A, B, C, uv) {
    const s = this.soup(mat); s.need(3, 3);
    let nx = (B[1] - A[1]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[1] - A[1]), ny = (B[2] - A[2]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[2] - A[2]), nz = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const a = this._vert(s, A[0], A[1], A[2], nx, ny, nz, uv ? uv[0] : 0, uv ? uv[1] : 0), b = this._vert(s, B[0], B[1], B[2], nx, ny, nz, uv ? uv[2] : 0, uv ? uv[3] : 0), c = this._vert(s, C[0], C[1], C[2], nx, ny, nz, uv ? uv[4] : 0, uv ? uv[5] : 0);
    s.i[s.ni++] = a; s.i[s.ni++] = b; s.i[s.ni++] = c; this.tris += 1;
  }
  // box centred at (cx,cy,cz). o: { rx, ry, rz (applied Y, then X, then Z), su, sv (tiles per metre), g (grain axis 0/1/2 → v runs along it),
  // skip (face mask), uo, vo }. UVs are metric, projected per face from the box's own (unrotated) coordinates plus its centre.
  box(mat, cx, cy, cz, sx, sy, sz, o) {
    const s = this.soup(mat), rot = o && (o.rx || o.ry || o.rz);
    if (rot) this.pushT(cx, cy, cz, o.ry || 0, o.rx || 0, o.rz || 0);
    const ox = rot ? 0 : cx, oy = rot ? 0 : cy, oz = rot ? 0 : cz, h = [sx / 2, sy / 2, sz / 2], c0 = [ox, oy, oz], cc = [cx, cy, cz];
    const su = o && o.su != null ? o.su : 1, sv = o && o.sv != null ? o.sv : su, g = o && o.g != null ? o.g : -1, skip = o && o.skip ? o.skip : 0, uo = (o && o.uo) || 0, vo = (o && o.vo) || 0;
    for (let f = 0; f < 6; f++) {
      if (skip & (1 << f)) continue;
      const a = f >> 1, sg = f & 1 ? -1 : 1;
      // in-plane axes (b, c) with b x c = sg * a
      let b, c; if (a === 0) { b = sg > 0 ? 1 : 2; c = sg > 0 ? 2 : 1; } else if (a === 1) { b = sg > 0 ? 2 : 0; c = sg > 0 ? 0 : 2; } else { b = sg > 0 ? 0 : 1; c = sg > 0 ? 1 : 0; }
      // uv axes: u horizontal (x, or z on the x faces), v up (y, or z on the y faces) — unless a grain axis is asked for
      let ua, va; if (a === 0) { ua = 2; va = 1; } else if (a === 1) { ua = 0; va = 2; } else { ua = 0; va = 1; }
      if (g >= 0 && ua === g) { const t = ua; ua = va; va = t; }
      s.need(4, 6); const nrm = [0, 0, 0]; nrm[a] = sg; const base = s.nv;
      for (let k = 0; k < 4; k++) {
        const q = [0, 0, 0]; q[a] = sg * h[a]; q[b] = (k === 0 || k === 3 ? -1 : 1) * h[b]; q[c] = (k < 2 ? -1 : 1) * h[c];
        this._vert(s, c0[0] + q[0], c0[1] + q[1], c0[2] + q[2], nrm[0], nrm[1], nrm[2], (cc[ua] + q[ua]) * su + uo, (cc[va] + q[va]) * sv + vo);
      }
      s.i[s.ni++] = base; s.i[s.ni++] = base + 1; s.i[s.ni++] = base + 2; s.i[s.ni++] = base; s.i[s.ni++] = base + 2; s.i[s.ni++] = base + 3; this.tris += 2;
    }
    if (rot) this.pop();
  }
  // any BufferGeometry (already in the kit's current local space); uv scale optional
  geo(mat, g, su = 1, sv = su) {
    const s = this.soup(mat), P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, n = P.count, I = g.index;
    s.need(n, I ? I.count : n); const base = s.nv;
    for (let i = 0; i < n; i++) this._vert(s, P.getX(i), P.getY(i), P.getZ(i), N.getX(i), N.getY(i), N.getZ(i), U ? U.getX(i) * su : 0, U ? U.getY(i) * sv : 0);
    if (I) for (let i = 0; i < I.count; i++) s.i[s.ni++] = base + I.getX(i); else for (let i = 0; i < n; i++) s.i[s.ni++] = base + i;
    this.tris += (I ? I.count : n) / 3;
  }
  // cylinder along y by default; rx/rz tilt it. open: no caps
  cyl(mat, x, y, z, rt, rb, hgt, seg = 8, o) {
    const g = new THREE.CylinderGeometry(rt, rb, hgt, seg, 1, !!(o && o.open));
    _e.set((o && o.rx) || 0, (o && o.ry) || 0, (o && o.rz) || 0, 'YXZ'); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(1, 1, 1); g.applyMatrix4(_m4.compose(_p, _q, _s));
    this.geo(mat, g, (o && o.su) || 1); g.dispose();
  }
  sph(mat, x, y, z, r, ws = 8, hs = 6, sx = 1, sy = 1, sz = 1) {
    const g = new THREE.SphereGeometry(r, ws, hs); g.scale(sx, sy, sz); g.translate(x, y, z); this.geo(mat, g); g.dispose();
  }
  // a tube through points (array of [x,y,z])
  tube(mat, pts, rad, seg = 5, closed = false, per = 3) {
    const cv = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])), closed, 'catmullrom', 0.3);
    const g = new THREE.TubeGeometry(cv, Math.max(2, (pts.length - 1) * per), rad, seg, closed); this.geo(mat, g); g.dispose();
  }
  // meshes, one per material that has anything in it
  build(parent, mats, { cast = true, receive = true, each = null } = {}) {
    const out = [];
    for (const [name, s] of Object.entries(this.S)) {
      if (!s.nv) continue;
      const mat = mats[name]; if (!mat) throw new Error('realbuild: no material ' + name);
      const m = new THREE.Mesh(s.geometry(), mat); m.castShadow = cast && !mat.userData.noCast; m.receiveShadow = receive; m.name = 'rb:' + name;
      if (each) each(m, name); parent.add(m); out.push(m);
    }
    return out;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// materials. Textures are shared; every call makes fresh materials (the houses' ones get the piece-matrix shader hook)
let _tex = null;
function textures() {
  if (_tex) return _tex;
  _tex = { cedar: TX.makeCedarShingleSet(), clap: TX.makeClapboardSet(), roof: TX.makeAsphaltShingleSet(), brick: TX.makeBrickSet(), concrete: TX.makeConcreteSet(), plank: TX.makePlankSet(), burlap: TX.makeBurlapSet(), glassN: TX.makeGlassNormal() };
  return _tex;
}
const pbr = (set, o = {}, det = null) => {
  const m = new THREE.MeshStandardMaterial(Object.assign({ map: set.map, normalMap: set.normalMap, roughnessMap: set.roughnessMap, roughness: 1, metalness: 0, vertexColors: true }, o));
  if (det) m.userData.det4 = det; return m;
};
const flat = (rough, metal, det, o = {}) => { const m = new THREE.MeshStandardMaterial(Object.assign({ color: 0xffffff, roughness: rough, metalness: metal, vertexColors: true }, o)); if (det) m.userData.det4 = det; return m; };
export function makeMats() {
  const T = textures();
  return {
    shingle: pbr(T.cedar, { normalScale: new THREE.Vector2(1.5, 1.5) }, [5, 0.0015, 0.22, 0.12, [1, 0.16, 1]]),
    clap: pbr(T.clap, { normalScale: new THREE.Vector2(1.3, 1.3) }, [4, 0.0008, 0.16, 0.2, [0.16, 1, 0.16]]),
    roof: pbr(T.roof, { normalScale: new THREE.Vector2(1.2, 1.2) }, [7, 0.002, 0.2, 0.08]),
    brick: pbr(T.brick, { normalScale: new THREE.Vector2(1.4, 1.4) }, [3, 0.002, 0.22, 0.12]),
    concrete: pbr(T.concrete, {}, [1.3, 0.004, 0.3, 0.14]),
    wood: pbr(T.plank, { normalScale: new THREE.Vector2(1.2, 1.2) }, [3.2, 0.003, 0.4, 0.2, [0.07, 1, 1]]),
    trim: flat(0.55, 0, [3.5, 0.0012, 0.2, 0.3, [0.2, 1, 0.2]]),            // painted millwork
    plain: flat(0.88, 0, [2.2, 0.004, 0.36, 0.16]),                          // raw lumber, plaster, rubber, anything matt
    metal: flat(0.42, 0.75, [2.4, 0.0025, 0.3, 0.4]),                        // galvanised and painted steel, aluminium
    glass: new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.19, 0.24, 0.29, THREE.SRGBColorSpace), roughness: 0.06, metalness: 0.9, normalMap: T.glassN, normalScale: new THREE.Vector2(0.12, 0.12), envMapIntensity: 1.25, vertexColors: true }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xfff1d0, emissive: new THREE.Color(1.0, 0.72, 0.36), emissiveIntensity: 1.6, roughness: 0.4, vertexColors: true }),
  };
}
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
const lowQ = (q) => !!q && q.terrainSeg < 300;

// weathered New England palette (display space)
const C = {
  white: [0.90, 0.89, 0.85], cream: [0.86, 0.82, 0.70], cedarGrey: [0.60, 0.58, 0.54], cedarSilver: [0.70, 0.68, 0.64], cedarBrown: [0.56, 0.43, 0.31], cedarDark: [0.40, 0.33, 0.27],
  lumber: [0.72, 0.60, 0.42], plaster: [0.84, 0.82, 0.77], ply: [0.62, 0.52, 0.38], floor: [0.52, 0.40, 0.28], greyWood: [0.60, 0.56, 0.50], post: [0.50, 0.46, 0.40],
  conc: [0.74, 0.73, 0.70], lead: [0.42, 0.44, 0.46], galv: [0.62, 0.64, 0.66], black: [0.07, 0.07, 0.08], brass: [0.72, 0.56, 0.26], copper: [0.36, 0.52, 0.46],
  rust: [0.42, 0.24, 0.14], green: [0.14, 0.26, 0.18], navy: [0.12, 0.18, 0.30], red: [0.52, 0.12, 0.10], teal: [0.16, 0.36, 0.38], yellow: [0.80, 0.66, 0.22], terra: [0.62, 0.36, 0.25],
};

// ---------------------------------------------------------------------------------------------------------------------
// small shared parts
// a rectangle at depth n in the current frame (u right, y up, n toward the viewer), with an optional hole; uv = (u + uo) * su, y * sv
function holeFace(K, mat, u0, u1, y0, y1, n, op, su, sv, uo, back = false) {
  const R = (a, b, c, d) => {
    if (c - a < 1e-4 || d - b < 1e-4) return;
    const uv = [(a + uo) * su, b * sv, (c + uo) * su, b * sv, (c + uo) * su, d * sv, (a + uo) * su, d * sv];
    if (back) K.quad(mat, [a, b, n], [a, d, n], [c, d, n], [c, b, n], [uv[0], uv[1], uv[6], uv[7], uv[4], uv[5], uv[2], uv[3]]);
    else K.quad(mat, [a, b, n], [c, b, n], [c, d, n], [a, d, n], uv);
  };
  if (!op) return R(u0, y0, u1, y1);
  R(u0, y0, op.x0, y1); R(op.x1, y0, u1, y1); R(op.x0, y0, op.x1, op.y0); R(op.x0, op.y1, op.x1, y1);
}
// one board of the plank texture on a box: the board runs along axis g, 'across' is the other axis of its broad face
function plank(K, mat, cx, cy, cz, sx, sy, sz, g, rnd, o) {
  const across = g === 0 ? (sz >= sy ? 2 : 1) : g === 2 ? (sx >= sy ? 0 : 1) : (sx >= sz ? 0 : 2), c = [cx, cy, cz], sdim = [sx, sy, sz], su = 1 / (8 * sdim[across]);
  K.box(mat, cx, cy, cz, sx, sy, sz, Object.assign({ g, su, sv: 1 / 2.4, uo: Math.floor(rnd() * 8) / 8 - (c[across] - sdim[across] / 2) * su, vo: rnd() }, o || {}));
}
// a wall lantern: back plate, lit body, cap
function lantern(K, u, y, n) {
  K.colA(C.black); K.box('metal', u, y, n + 0.01, 0.1, 0.22, 0.02); K.box('metal', u, y + 0.02, n + 0.05, 0.03, 0.03, 0.07);
  K.box('metal', u, y + 0.105, n + 0.1, 0.13, 0.03, 0.13); K.box('metal', u, y - 0.075, n + 0.1, 0.1, 0.02, 0.1);
  K.col(1, 1, 1); K.box('lamp', u, y + 0.015, n + 0.1, 0.085, 0.15, 0.085);
}
// a double-hung window in an opening (panel frame). st: { trimC, sashC, munt: [cols, rows], shutC }, lod 0..2
function windowUnit(K, op, st, lod, shutters) {
  const x0 = op.x0, x1 = op.x1, y0 = op.y0, y1 = op.y1, W = x1 - x0, xm = (x0 + x1) / 2, ym = (y0 + y1) / 2, cw = 0.09, d = 0.03;
  K.colA(st.trimC);
  K.box('trim', x0 - cw / 2, ym, d / 2, cw, y1 - y0, d, { skip: NZ }); K.box('trim', x1 + cw / 2, ym, d / 2, cw, y1 - y0, d, { skip: NZ });
  K.box('trim', xm, y1 + 0.055, d / 2 + 0.003, W + 2 * cw, 0.11, d + 0.006, { skip: NZ });
  if (lod > 0) K.box('trim', xm, y1 + 0.118, 0.028, W + 2 * cw + 0.05, 0.016, 0.056, { skip: NZ });
  K.box('trim', xm, y0 - 0.024, 0.035, W + 2 * cw + 0.07, 0.048, 0.11, { skip: NZ, rx: 0.07 });
  if (lod > 1) K.box('trim', xm, y0 - 0.09, 0.011, W + 0.12, 0.085, 0.022, { skip: NZ });
  const sw = 0.045, sash = (ya, yb, n) => {
    K.colA(st.sashC);
    K.box('trim', x0 + sw / 2, (ya + yb) / 2, n - 0.0175, sw, yb - ya, 0.035, { skip: NZ | NX }); K.box('trim', x1 - sw / 2, (ya + yb) / 2, n - 0.0175, sw, yb - ya, 0.035, { skip: NZ | PX });
    K.box('trim', xm, ya + sw / 2, n - 0.0175, W - 2 * sw, sw, 0.035, { skip: NZ | PX | NX }); K.box('trim', xm, yb - sw / 2, n - 0.0175, W - 2 * sw, sw, 0.035, { skip: NZ | PX | NX });
    const gx0 = x0 + sw, gx1 = x1 - sw, gy0 = ya + sw, gy1 = yb - sw, gn = n - 0.022;
    K.col(1, 1, 1); K.quad('glass', [gx0, gy0, gn], [gx1, gy0, gn], [gx1, gy1, gn], [gx0, gy1, gn], [gx0 * 1.3, gy0 * 1.3, gx1 * 1.3, gy0 * 1.3, gx1 * 1.3, gy1 * 1.3, gx0 * 1.3, gy1 * 1.3]);
    if (lod > 0 && st.munt) {
      K.colA(st.sashC);
      for (let i = 1; i < st.munt[0]; i++) K.box('trim', gx0 + (gx1 - gx0) * i / st.munt[0], (gy0 + gy1) / 2, gn + 0.006, 0.018, gy1 - gy0, 0.012, { skip: NZ | PY | NY });
      for (let j = 1; j < st.munt[1]; j++) K.box('trim', (gx0 + gx1) / 2, gy0 + (gy1 - gy0) * j / st.munt[1], gn + 0.006, gx1 - gx0, 0.018, 0.012, { skip: NZ | PX | NX });
    }
  };
  sash(ym - 0.022, y1, -0.03); sash(y0, ym + 0.022, -0.066);
  if (shutters && st.shutC) {
    const shw = Math.min(0.46, W / 2), sh = y1 - y0 + 0.02;
    for (const sd of [-1, 1]) {
      const cx = (sd < 0 ? x0 - cw : x1 + cw) + sd * (shw / 2 + 0.012);
      K.colA(st.shutC);
      if (lod > 1) {
        K.box('trim', cx - shw / 2 + 0.025, ym, 0.02, 0.05, sh, 0.03, { skip: NZ }); K.box('trim', cx + shw / 2 - 0.025, ym, 0.02, 0.05, sh, 0.03, { skip: NZ });
        for (const ry of [y0 + 0.03, ym, y1 - 0.01]) K.box('trim', cx, ry, 0.02, shw - 0.1, 0.06, 0.03, { skip: NZ | PX | NX });
        K.box('trim', cx, ym, 0.007, shw - 0.1, sh - 0.06, 0.004, { skip: NZ | PX | NX | PY | NY });   // the dark behind the louvres
        for (const [a, b] of [[y0 + 0.06, ym - 0.03], [ym + 0.03, y1 - 0.04]]) { const n = Math.max(2, Math.round((b - a) / 0.07)); for (let i = 0; i < n; i++) K.box('trim', cx, a + (i + 0.5) * (b - a) / n, 0.02, shw - 0.1, 0.05, 0.008, { skip: PX | NX, rx: 0.6 }); }
      } else {
        K.box('trim', cx, ym, 0.016, shw, sh, 0.022, { skip: NZ });
        if (lod > 0) for (const [a, b] of [[y0 + 0.07, ym - 0.04], [ym + 0.04, y1 - 0.05]]) K.box('trim', cx, (a + b) / 2, 0.03, shw - 0.12, b - a, 0.008, { skip: NZ });
      }
    }
  }
}
// a panelled front door in an opening, with casing, crosshead, threshold, hardware and a lantern
function doorUnit(K, op, st, lod, rnd, hood) {
  const x0 = op.x0, x1 = op.x1, y0 = op.y0, y1 = op.y1, W = x1 - x0, xm = (x0 + x1) / 2, ym = (y0 + y1) / 2, cw = 0.11, d = 0.034;
  K.colA(st.trimC);
  K.box('trim', x0 - cw / 2, ym, d / 2, cw, y1 - y0, d, { skip: NZ }); K.box('trim', x1 + cw / 2, ym, d / 2, cw, y1 - y0, d, { skip: NZ });
  K.box('trim', xm, y1 + 0.09, d / 2 + 0.004, W + 2 * cw + 0.06, 0.18, d + 0.008, { skip: NZ }); K.box('trim', xm, y1 + 0.195, 0.04, W + 2 * cw + 0.16, 0.03, 0.08, { skip: NZ });
  K.colA(C.galv); K.box('metal', xm, y0 - 0.012, -0.02, W + 0.04, 0.03, 0.2);
  // the slab, six panels (or four and two lights)
  K.colA(st.doorC); K.box('trim', xm, ym, -0.07, W, y1 - y0, 0.045, { skip: 0 });
  const lights = rnd() < 0.45, H = y1 - y0, rows = [[0.07, 0.36], [0.42, 0.74], [0.80, 0.94]];
  for (let c = 0; c < 2; c++) for (let k = 0; k < 3; k++) {
    const px = xm + (c - 0.5) * W * 0.44, pw = W * 0.34, a = y0 + rows[k][0] * H, b = y0 + rows[k][1] * H;
    if (k === 2 && lights) { K.col(1, 1, 1); K.quad('glass', [px - pw / 2, a, -0.046], [px + pw / 2, a, -0.046], [px + pw / 2, b, -0.046], [px - pw / 2, b, -0.046]); K.colA(st.doorC); }
    else if (lod > 0) { K.colA(st.doorC, 0.9); K.box('trim', px, (a + b) / 2, -0.046, pw, b - a, 0.006, { skip: NZ }); K.colA(st.doorC); K.box('trim', px, (a + b) / 2, -0.041, pw - 0.07, b - a - 0.07, 0.012, { skip: NZ }); }
  }
  if (lod > 0) {
    K.colA(C.brass); K.cyl('metal', x1 - 0.085, y0 + 0.95, -0.02, 0.028, 0.028, 0.06, 8, { rx: Math.PI / 2 }); K.box('metal', x1 - 0.085, y0 + 0.95, -0.044, 0.05, 0.16, 0.006);
    K.cyl('metal', x1 - 0.085, y0 + 1.12, -0.036, 0.022, 0.022, 0.02, 8, { rx: Math.PI / 2 });
    if (lod > 1) K.box('metal', xm, y0 + 0.13, -0.045, W - 0.1, 0.2, 0.004, { skip: NZ });
    lantern(K, x1 + cw + 0.2, y0 + 1.72, 0);
  }
  if (hood) {   // a little bracketed hood over the door
    const hw2 = W / 2 + cw + 0.25, hy = y1 + 0.34;
    K.colA(st.trimC);
    for (const sd of [-1, 1]) { K.box('trim', sd * (hw2 - 0.06) + xm, hy - 0.2, 0.03, 0.05, 0.42, 0.06, { skip: NZ }); K.box('trim', sd * (hw2 - 0.06) + xm, hy - 0.17, 0.26, 0.05, 0.05, 0.62, { rx: -0.62 }); }
    K.box('trim', xm, hy + 0.07, 0.31, hw2 * 2, 0.05, 0.66, { rx: 0.3 });
    K.colA(st.roofC); K.box('roof', xm, hy + 0.105, 0.32, hw2 * 2 + 0.04, 0.02, 0.7, { rx: 0.3, su: 0.5, sv: -0.5 });
  }
}
// sliding glass doors onto a deck
function sliderUnit(K, op, st) {
  const x0 = op.x0, x1 = op.x1, y0 = op.y0, y1 = op.y1, W = x1 - x0, xm = (x0 + x1) / 2, ym = (y0 + y1) / 2, cw = 0.09, d = 0.03;
  K.colA(st.trimC);
  K.box('trim', x0 - cw / 2, ym, d / 2, cw, y1 - y0, d, { skip: NZ }); K.box('trim', x1 + cw / 2, ym, d / 2, cw, y1 - y0, d, { skip: NZ });
  K.box('trim', xm, y1 + 0.055, d / 2 + 0.003, W + 2 * cw, 0.11, d + 0.006, { skip: NZ }); K.box('trim', xm, y1 + 0.118, 0.028, W + 2 * cw + 0.05, 0.016, 0.056, { skip: NZ });
  K.colA(C.galv); K.box('metal', xm, y0 - 0.01, -0.02, W, 0.025, 0.16);
  const leaf = (a, b, n) => {
    const fw = 0.06; K.colA(st.sashC);
    K.box('trim', a + fw / 2, ym, n - 0.02, fw, y1 - y0, 0.04, { skip: NZ }); K.box('trim', b - fw / 2, ym, n - 0.02, fw, y1 - y0, 0.04, { skip: NZ });
    K.box('trim', (a + b) / 2, y0 + fw / 2, n - 0.02, b - a - 2 * fw, fw, 0.04, { skip: NZ | PX | NX }); K.box('trim', (a + b) / 2, y1 - fw / 2, n - 0.02, b - a - 2 * fw, fw, 0.04, { skip: NZ | PX | NX });
    K.col(1, 1, 1); const g0 = a + fw, g1 = b - fw, h0 = y0 + fw, h1 = y1 - fw, gn = n - 0.024;
    K.quad('glass', [g0, h0, gn], [g1, h0, gn], [g1, h1, gn], [g0, h1, gn], [g0 * 0.8, h0 * 0.8, g1 * 0.8, h0 * 0.8, g1 * 0.8, h1 * 0.8, g0 * 0.8, h1 * 0.8]);
  };
  leaf(x0, xm + 0.03, -0.03); leaf(xm - 0.03, x1, -0.075);
  K.colA(C.black); K.box('metal', xm + 0.09, y0 + 1.0, -0.066, 0.025, 0.22, 0.03);
}
