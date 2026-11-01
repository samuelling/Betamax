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
          ${additive ? 'gl_FragColor = vec4(vCol.rgb * t.a * vCol.a * (1.0 - vFog), 1.0);' : 'float e = smoothstep(0.26, 0.34, t.a); float shade = mix(0.8, 1.08, step(0.5, vUv.y + (t.a - 0.5) * 0.35)); gl_FragColor = vec4(mix(vCol.rgb * shade, uFogColor, vFog), e * vCol.a * 0.62);'} }`,
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

// Glowing line segments (tracers, missile streaks)
export class Tracers {
  constructor(scene, max) {
    this.max = max;
    const g = new THREE.InstancedBufferGeometry();
    // x: 0..1 along, y: -1..1 across
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.a = new Float32Array(max * 4); this.b = new Float32Array(max * 4); this.c = new Float32Array(max * 4);
    this.aA = new THREE.InstancedBufferAttribute(this.a, 4).setUsage(THREE.DynamicDrawUsage);
    this.aB = new THREE.InstancedBufferAttribute(this.b, 4).setUsage(THREE.DynamicDrawUsage);
    this.aC = new THREE.InstancedBufferAttribute(this.c, 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iA', this.aA); g.setAttribute('iB', this.aB); g.setAttribute('iC', this.aC);
    g.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: `attribute vec4 iA; attribute vec4 iB; attribute vec4 iC; varying vec2 vP; varying vec4 vC;
        void main(){ vP = position.xy; vC = iC;
          vec4 a = modelViewMatrix*vec4(iA.xyz,1.0), b = modelViewMatrix*vec4(iB.xyz,1.0);
          vec4 m = mix(a, b, position.x);
          vec3 d = normalize(b.xyz - a.xyz + vec3(1e-5));
          vec3 side = normalize(cross(d, normalize(-m.xyz)));
          float w = mix(iA.w, iB.w, position.x);
          float pix = max(w, -m.z * 0.0018);
          m.xyz += side * position.y * pix;
          gl_Position = projectionMatrix*m; }`,
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
    this.g.instanceCount = this.n;
    for (const at of [this.aA, this.aB, this.aC]) { at.needsUpdate = true; at.addUpdateRange(0, this.n * 4); }
  }
}
