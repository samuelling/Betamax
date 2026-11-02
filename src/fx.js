import * as THREE from 'three';

// Camera-facing instanced quads, refilled every frame.
export class Billboards {
  constructor(scene, max, tex, additive, fogColor) {
    this.max = max;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.pos = new Float32Array(max * 4); // xyz size
    this.col = new Float32Array(max * 4); // rgba
    this.rot = new Float32Array(max);
    this.aPos = new THREE.InstancedBufferAttribute(this.pos, 4).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aRot = new THREE.InstancedBufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iCol', this.aCol); g.setAttribute('iRot', this.aRot);
    g.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: tex }, uFogColor: { value: fogColor }, uFogDensity: { value: 0.0022 } },
      vertexShader: `attribute vec4 iPos; attribute vec4 iCol; attribute float iRot; varying vec2 vUv; varying vec4 vCol; varying float vFog;
        uniform float uFogDensity;
        void main(){ vUv = uv; vCol = iCol;
          vec4 mv = modelViewMatrix * vec4(iPos.xyz, 1.0);
          float c = cos(iRot), s = sin(iRot);
          vec2 p = vec2(c*position.x - s*position.y, s*position.x + c*position.y) * iPos.w;
          mv.xy += p;
          float d = -mv.z; vFog = 1.0 - exp(-pow(uFogDensity*d, 2.0));
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D uTex; uniform vec3 uFogColor; varying vec2 vUv; varying vec4 vCol; varying float vFog;
        void main(){ vec4 t = texture2D(uTex, vUv);
          ${additive ? 'gl_FragColor = vec4(vCol.rgb * t.a * vCol.a * (1.0 - vFog), 1.0);' : 'gl_FragColor = vec4(mix(vCol.rgb, uFogColor, vFog), t.a * vCol.a);'} }`,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 4 : 3;
    scene.add(this.mesh);
    this.n = 0; this.g = g;
  }
  begin() { this.n = 0; }
  push(x, y, z, size, r, g, b, a, rot = 0) {
    if (this.n >= this.max || a <= 0.002) return;
    const i = this.n++;
    this.pos[i * 4] = x; this.pos[i * 4 + 1] = y; this.pos[i * 4 + 2] = z; this.pos[i * 4 + 3] = size;
    this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b; this.col[i * 4 + 3] = a;
    this.rot[i] = rot;
  }
  end() {
    this.g.instanceCount = this.n;
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aRot.needsUpdate = true;
    this.aPos.addUpdateRange(0, this.n * 4); this.aCol.addUpdateRange(0, this.n * 4); this.aRot.addUpdateRange(0, this.n);
  }
}

// Glowing line segments (tracers, missile streaks). Built on the CPU as camera-facing quads each frame (the
// instanced version drew nothing on some GPUs), with a minimum on-screen width so far tracer still reads.
export class Tracers {
  constructor(scene, max) {
    this.max = max;
    this.a = new Float32Array(max * 4); this.b = new Float32Array(max * 4); this.c = new Float32Array(max * 4);
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 4 * 3); this.col = new Float32Array(max * 4 * 4); this.uv = new Float32Array(max * 4 * 2);
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aUv = new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('aCol', this.aCol); g.setAttribute('aUv', this.aUv);
    const idx = new Uint32Array(max * 6); for (let i = 0; i < max; i++) { const v = i * 4, o = i * 6; idx[o] = v; idx[o + 1] = v + 1; idx[o + 2] = v + 2; idx[o + 3] = v; idx[o + 4] = v + 2; idx[o + 5] = v + 3; }
    g.setIndex(new THREE.BufferAttribute(idx, 1)); g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: `attribute vec4 aCol; attribute vec2 aUv; varying vec2 vP; varying vec4 vC; void main(){ vP = aUv; vC = aCol; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec2 vP; varying vec4 vC;
        void main(){ float a = (1.0 - abs(vP.y)); a = a*a; float h = mix(0.25, 1.0, vP.x);
          gl_FragColor = vec4(vC.rgb * a * h * vC.a, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 5;
    scene.add(this.mesh); this.g = g; this.n = 0;
  }
  begin() { this.n = 0; }
  // tail (ax..) to head (bx..)
  push(ax, ay, az, aw, bx, by, bz, bw, r, g, b, a) {
    if (this.n >= this.max) return;
    const i = this.n++ * 4;
    this.a[i] = ax; this.a[i + 1] = ay; this.a[i + 2] = az; this.a[i + 3] = aw;
    this.b[i] = bx; this.b[i + 1] = by; this.b[i + 2] = bz; this.b[i + 3] = bw;
    this.c[i] = r; this.c[i + 1] = g; this.c[i + 2] = b; this.c[i + 3] = a;
  }
  end() {
    const cam = Tracers.camera, P = this.pos, C = this.col, U = this.uv, A = this.a, B = this.b, K = this.c;
    const cx = cam ? cam.position.x : 0, cy = cam ? cam.position.y : 0, cz = cam ? cam.position.z : 0;
    let n = 0;
    for (let s = 0; s < this.n; s++) {
      const o = s * 4, ax = A[o], ay = A[o + 1], az = A[o + 2], bx = B[o], by = B[o + 1], bz = B[o + 2];
      let dx = bx - ax, dy = by - ay, dz = bz - az; const dl = Math.hypot(dx, dy, dz) || 1e-6; dx /= dl; dy /= dl; dz /= dl;
      const vx = (ax + bx) / 2 - cx, vy = (ay + by) / 2 - cy, vz = (az + bz) / 2 - cz, vd = Math.hypot(vx, vy, vz) || 1;
      let sx = dy * vz - dz * vy, sy = dz * vx - dx * vz, sz = dx * vy - dy * vx; const sl = Math.hypot(sx, sy, sz);
      if (sl < 1e-6 * vd) continue;   // end-on: nothing to see
      sx /= sl; sy /= sl; sz /= sl;
      const da = Math.hypot(ax - cx, ay - cy, az - cz), db = Math.hypot(bx - cx, by - cy, bz - cz);
      const wa = Math.max(A[o + 3], da * 0.0018), wb = Math.max(B[o + 3], db * 0.0018);
      const v = n * 4, p = v * 3, q = v * 4, u = v * 2;
      P[p] = ax - sx * wa; P[p + 1] = ay - sy * wa; P[p + 2] = az - sz * wa;
      P[p + 3] = bx - sx * wb; P[p + 4] = by - sy * wb; P[p + 5] = bz - sz * wb;
      P[p + 6] = bx + sx * wb; P[p + 7] = by + sy * wb; P[p + 8] = bz + sz * wb;
      P[p + 9] = ax + sx * wa; P[p + 10] = ay + sy * wa; P[p + 11] = az + sz * wa;
      for (let k = 0; k < 4; k++) { C[q + k * 4] = K[o]; C[q + k * 4 + 1] = K[o + 1]; C[q + k * 4 + 2] = K[o + 2]; C[q + k * 4 + 3] = K[o + 3]; }
      U[u] = 0; U[u + 1] = -1; U[u + 2] = 1; U[u + 3] = -1; U[u + 4] = 1; U[u + 5] = 1; U[u + 6] = 0; U[u + 7] = 1;
      n++;
    }
    this.g.setDrawRange(0, n * 6);
    for (const at of [this.aPos, this.aCol, this.aUv]) { at.needsUpdate = true; at.clearUpdateRanges(); at.addUpdateRange(0, n * 4 * at.itemSize); }
  }
}

