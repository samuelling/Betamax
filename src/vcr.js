// The opening: a dark den, a CRT television with a Beta deck on top, the tape held at the slot.
// Click and it goes in, the deck clunks and spins up, the set warms into its blue screen, and the
// camera sinks down into the picture until the menu on the glass is the whole screen.
import * as THREE from 'three';

const ease = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
const ease3 = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

function canvas(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw && draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return { c, g, t };
}
function rnd(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function woodTex(seed, base = [92, 58, 34]) {
  return canvas(512, 512, (g, w, h) => {
    const r = rnd(seed);
    g.fillStyle = `rgb(${base})`; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 1) {
      const v = Math.sin(y * 0.05 + Math.sin(y * 0.011) * 4) * 0.5 + 0.5;
      g.fillStyle = `rgba(30,16,8,${0.08 + v * 0.16})`; g.fillRect(0, y, w, 1);
    }
    for (let k = 0; k < 90; k++) { g.strokeStyle = `rgba(20,10,4,${0.05 + r() * 0.12})`; g.beginPath(); const y = r() * h; g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + (r() - 0.5) * 30, w * 0.6, y + (r() - 0.5) * 30, w, y + (r() - 0.5) * 20); g.stroke(); }
  }).t;
}

const SCREEN_GLSL = /* glsl */`
  uniform sampler2D map; uniform float uOn; uniform float uTime; uniform float uNoise; uniform float uFx;
  varying vec2 vUv;
  float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main(){
    vec2 c = vUv - 0.5;
    float r2 = dot(c, c);
    vec2 uv = 0.5 + c * (1.0 + 0.12 * r2 * uFx);        // a little barrel
    // power-on: a bright line opens into the picture
    float open = smoothstep(0.0, 1.0, (uOn - 0.15) / 0.5);
    float band = abs(vUv.y - 0.5) * 2.0;
    float vis = step(band, max(open, 0.012 * step(0.02, uOn)));
    vec3 col = texture2D(map, uv).rgb;
    // tracking noise
    float row = floor(vUv.y * 140.0);
    float tear = uNoise * step(0.82, h(vec2(row, floor(uTime * 24.0))));
    col = mix(col, vec3(h(vUv * 400.0 + uTime)), clamp(uNoise * 0.6 + tear, 0.0, 1.0));
    col *= mix(1.0, 0.86 + 0.14 * sin(vUv.y * 900.0), uFx);   // scanlines
    vec2 q = abs(c) * 2.0; float rr = pow(pow(q.x, 7.0) + pow(q.y, 7.0), 1.0 / 7.0);   // rounded-rect tube face
    float face = mix(1.0, 1.0 - smoothstep(0.93, 0.985, rr), uFx);
    col *= mix(1.0, 1.0 - 0.45 * smoothstep(0.1, 0.5, r2), uFx) * face;
    col += vec3(1.0) * (1.0 - open) * step(0.02, uOn) * vis * 1.4;   // the white line
    float flick = mix(1.0, (0.97 + 0.03 * h(vec2(floor(uTime * 30.0), 1.0))) * 1.15, uFx);
    vec3 offc = (vec3(0.018, 0.02, 0.019) + 0.02 * (0.4 - r2)) * face;       // dark glass
    float spec = 0.05 * exp(-dot(c - vec2(-0.22, 0.2), c - vec2(-0.22, 0.2)) * 40.0);
    gl_FragColor = vec4(mix(offc, col * flick, vis * step(0.02, uOn)) + spec * face * uFx, 1.0);
    #include <colorspace_fragment>
  }`;

// the menu, as the set shows it — and the full-screen title is this very picture, so the two can't differ
export const MENU_W = 1024, MENU_H = 768, PLAY_BOX = [362, 498, 300, 86];
export function drawMenu(g, w = MENU_W, h = MENU_H) {
  g.save();
  const gr = g.createRadialGradient(w / 2, h / 2, 50, w / 2, h / 2, 700); gr.addColorStop(0, '#2e2a22'); gr.addColorStop(1, '#0b0a08');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = '#f4f1e8';
  g.shadowColor = 'rgba(255,40,60,.6)'; g.shadowOffsetX = -3; g.font = '190px "VT323", "Courier New", monospace'; g.fillText('BETAMAX', w / 2, 330);
  g.shadowColor = 'rgba(0,0,0,0)'; g.shadowOffsetX = 0;
  g.font = '34px "VT323", "Courier New", monospace'; g.fillText('a battle, in rewind \u00B7 Mayflower Beach, Dennis', w / 2, 410);
  const [bx, by, bw, bh] = PLAY_BOX;
  g.strokeStyle = '#f4f1e8'; g.lineWidth = 5; g.strokeRect(bx, by, bw, bh);
  g.font = '62px "VT323", "Courier New", monospace'; g.fillText('\u25B6 PLAY', w / 2, by + 64);
  g.globalAlpha = 0.55; g.font = '26px "VT323", "Courier New", monospace';
  g.fillText('WASD \u00B7 MOUSE \u00B7 CLICK FIRE \u00B7 R RELOAD \u00B7 1/2 GUNS \u00B7 F SWAP', w / 2, 700);
  g.globalAlpha = 1; g.textAlign = 'left';
  g.font = '40px "VT323", "Courier New", monospace'; g.fillText('\u25C0\u25C0 REW', 60, 80);
  g.restore();
}

export class VCRIntro {
  constructor(renderer) {
    this.r = renderer;
    const s = this.scene = new THREE.Scene();
    s.background = new THREE.Color(0x050403);
    s.fog = new THREE.Fog(0x050403, 2.2, 5.5);
    this.cam = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.01, 30);
    this.t = 0; this.phase = 'load'; this.pt = 0;

    // room
    const floorM = new THREE.MeshStandardMaterial({ map: woodTex(3, [70, 46, 30]), roughness: 0.8 }); floorM.map.wrapS = floorM.map.wrapT = THREE.RepeatWrapping; floorM.map.repeat.set(4, 4);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10).rotateX(-Math.PI / 2), floorM); s.add(floor);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(10, 4), new THREE.MeshStandardMaterial({ map: canvas(256, 256, (g, w, h) => {
      g.fillStyle = '#3c3a2a'; g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 32) { g.fillStyle = 'rgba(90,80,40,.35)'; g.fillRect(x, 0, 10, h); g.fillStyle = 'rgba(20,18,10,.25)'; g.fillRect(x + 16, 0, 3, h); }
    }).t, roughness: 1 }));
    wall.material.map.wrapS = THREE.RepeatWrapping; wall.material.map.repeat.set(12, 1); wall.position.set(0, 2, -0.6); s.add(wall);
    // low stand
    const standM = new THREE.MeshStandardMaterial({ map: woodTex(7), roughness: 0.7 });
    const stand = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.38, 0.62), standM); stand.position.set(0, 0.19, 0); s.add(stand);

    // television: wood cabinet, dark bezel, a deep tube
    const tv = this.tv = new THREE.Group(); tv.position.set(0, 0.38, 0); s.add(tv);
    const wood = new THREE.MeshStandardMaterial({ map: woodTex(11, [96, 60, 32]), roughness: 0.55 });
    const bezM = new THREE.MeshStandardMaterial({ color: 0x1a1816, roughness: 0.5 });
    const metal = new THREE.MeshStandardMaterial({ color: 0xa9a59c, roughness: 0.35, metalness: 0.8 });
    const add = (p, g, m, x, y, z) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); p.add(o); return o; };
    add(tv, new THREE.BoxGeometry(0.82, 0.6, 0.5), wood, 0, 0.3, 0);
    add(tv, new THREE.BoxGeometry(0.6, 0.48, 0.02), bezM, -0.07, 0.31, 0.251);
    // speaker grille + knobs on the right
    const grille = canvas(64, 256, (g, w, h) => { g.fillStyle = '#211d18'; g.fillRect(0, 0, w, h); g.fillStyle = '#0c0a08'; for (let y = 4; y < h; y += 7) g.fillRect(4, y, w - 8, 3); }).t;
    add(tv, new THREE.PlaneGeometry(0.12, 0.26), new THREE.MeshStandardMaterial({ map: grille, roughness: 0.9 }), 0.31, 0.2, 0.2515);
    for (const [y, rr] of [[0.47, 0.03], [0.39, 0.024]]) { const k = add(tv, new THREE.CylinderGeometry(rr, rr * 1.1, 0.03, 20).rotateX(Math.PI / 2), metal, 0.31, y, 0.265); k.rotation.z = 0.6; }
    const led = this.tvLed = add(tv, new THREE.SphereGeometry(0.005, 8, 8), new THREE.MeshBasicMaterial({ color: 0x220400 }), 0.31, 0.08, 0.252);
    // the glass
    this.screenC = canvas(1024, 768);
    this.screenU = { map: { value: this.screenC.t }, uOn: { value: 0 }, uTime: { value: 0 }, uNoise: { value: 0 }, uFx: { value: 1 } };
    const sg = new THREE.PlaneGeometry(0.54, 0.405);
    const vs = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
    this.screen = add(tv, sg, new THREE.ShaderMaterial({ uniforms: this.screenU, vertexShader: vs, fragmentShader: SCREEN_GLSL }), -0.07, 0.31, 0.2625);
    this.screenPos = new THREE.Vector3(-0.07, 0.38 + 0.31, 0.2625);
    // glass sheen

    // the deck on top
    const vcr = this.vcr = new THREE.Group(); vcr.position.set(0.0, 0.98, 0.05); s.add(vcr);
    const body = new THREE.MeshStandardMaterial({ color: 0x232325, roughness: 0.45, metalness: 0.5 });
    add(vcr, new THREE.BoxGeometry(0.46, 0.105, 0.36), body, 0, 0.0525, 0);
    const front = canvas(1024, 240, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#b9b6ae'); gr.addColorStop(1, '#8e8b84'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 2) { g.fillStyle = `rgba(255,255,255,${0.03 + Math.random() * 0.04})`; g.fillRect(x, 0, 1, h); }
      g.fillStyle = '#1b1b1d'; g.fillRect(40, 70, 470, 92);                  // slot surround
      g.fillStyle = '#2a2a2c'; g.font = 'bold 30px Helvetica, Arial'; g.fillText('Beta', 44, 50);
      g.font = '18px Helvetica, Arial'; g.fillText('VIDEO CASSETTE RECORDER  ·  SP  ·  Hi-Fi', 120, 48);
      g.fillStyle = '#121214'; g.fillRect(600, 64, 300, 70);                // display window
      const btn = ['EJECT', 'REW', 'PLAY', 'FF', 'STOP', 'PAUSE', 'REC'];
      g.font = '13px Helvetica, Arial'; g.fillStyle = '#2a2a2c';
      btn.forEach((b, k) => g.fillText(b, 552 + k * 64, 220));
      g.fillStyle = '#2a2a2c'; g.fillText('POWER', 930, 220);
    }).t;
    add(vcr, new THREE.PlaneGeometry(0.46, 0.105), new THREE.MeshStandardMaterial({ map: front, roughness: 0.4, metalness: 0.4 }), 0, 0.0525, 0.1805);
    // the cassette door (hinged at the top) and buttons
    const doorPivot = this.door = new THREE.Group(); doorPivot.position.set(-0.112, 0.0525 + 0.0105 - 0.0, 0.182); vcr.add(doorPivot);
    add(doorPivot, new THREE.BoxGeometry(0.2, 0.034, 0.004), new THREE.MeshStandardMaterial({ color: 0x0f0f10, roughness: 0.3, metalness: 0.3 }), 0, -0.017, 0.002);
    for (let k = 0; k < 7; k++) add(vcr, new THREE.BoxGeometry(0.022, 0.009, 0.008), metal, 0.031 + k * 0.0286 - 0.0, 0.026, 0.184);
    this.power = add(vcr, new THREE.BoxGeometry(0.018, 0.009, 0.008), new THREE.MeshStandardMaterial({ color: 0x5a1a10, roughness: 0.4 }), 0.2, 0.026, 0.184);
    // fluorescent display
    this.disp = canvas(256, 64);
    this.dispMesh = add(vcr, new THREE.PlaneGeometry(0.134, 0.0315), new THREE.MeshBasicMaterial({ map: this.disp.t, toneMapped: false }), 0.1, 0.0525 + 0.0105, 0.1812);

    // the tape: smaller than VHS, black, two reels behind the window, a hand-written label
    const tape = this.tape = new THREE.Group(); s.add(tape);
    const shell = new THREE.MeshStandardMaterial({ color: 0x111112, roughness: 0.4 });
    add(tape, new THREE.BoxGeometry(0.156, 0.025, 0.096), shell, 0, 0, 0);
    const label = canvas(512, 300, (g, w, h) => {
      g.fillStyle = '#efe8d6'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#c23b2a'; g.fillRect(0, 0, w, 34);
      g.fillStyle = '#efe8d6'; g.font = 'bold 22px Helvetica, Arial'; g.fillText('L-750   BETA', 16, 25);
      g.strokeStyle = 'rgba(40,60,120,.35)'; for (let y = 80; y < h; y += 46) { g.beginPath(); g.moveTo(14, y); g.lineTo(w - 14, y); g.stroke(); }
      g.fillStyle = '#1e2350'; g.font = 'italic 44px "Bradley Hand", "Comic Sans MS", cursive';
      g.save(); g.translate(22, 120); g.rotate(-0.03); g.fillText('Mayflower Beach', 0, 0); g.restore();
      g.font = 'italic 34px "Bradley Hand", "Comic Sans MS", cursive';
      g.save(); g.translate(30, 172); g.rotate(-0.02); g.fillText('— do not rewind', 0, 0); g.restore();
      g.fillStyle = '#7a1d14'; g.save(); g.translate(330, 250); g.rotate(-0.08); g.fillText('SO IT GOES', 0, 0); g.restore();
    }).t;
    const lab = add(tape, new THREE.PlaneGeometry(0.12, 0.07).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: label, roughness: 0.8 }), 0.004, 0.0126, -0.004);
    lab.rotation.y = 0;
    const win = add(tape, new THREE.PlaneGeometry(0.05, 0.016), new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 0.1, metalness: 0.2 }), 0, 0.002, 0.0481);
    const spine = canvas(256, 40, (g, w, h) => { g.fillStyle = '#efe8d6'; g.fillRect(0, 0, w, h); g.fillStyle = '#1e2350'; g.font = 'italic 26px "Bradley Hand", "Comic Sans MS", cursive'; g.fillText('Dennis, MA — the end', 8, 29); }).t;
    add(tape, new THREE.PlaneGeometry(0.1, 0.016), new THREE.MeshStandardMaterial({ map: spine, roughness: 0.8 }), -0.025, 0.0, 0.0482).position.y = 0.0;
    win.position.x = 0.045;
    this.slot = new THREE.Vector3(-0.112, 0.98 + 0.045, 0.05 + 0.18);

    // light: a warm lamp off to the left, a cool spill from a window, and the set itself once it's on
    s.add(new THREE.HemisphereLight(0x302820, 0x080604, 0.6));
    const lamp = new THREE.PointLight(0xffb070, 5.5, 7, 1.5); lamp.position.set(-1.4, 1.6, 0.9); s.add(lamp);
    const cool = new THREE.DirectionalLight(0x6f86b0, 0.35); cool.position.set(2, 2.5, 1.5); s.add(cool);
    this.glow = new THREE.PointLight(0x7aa0ff, 0, 3, 1.5); this.glow.position.set(-0.07, 0.7, 0.7); s.add(this.glow);

    this.p0 = new THREE.Vector3(0.42, 1.3, 1.08); this.l0 = new THREE.Vector3(-0.06, 0.9, 0.12);
    // looking straight into the glass, so close the picture overfills the window
    this.setTape(0);
    this.drawDisplay('12:00', true);
    this.drawScreen('off');
    this.onResize();
  }
  onResize() { this.cam.aspect = innerWidth / innerHeight; this.cam.updateProjectionMatrix(); }
  ready() { this.phase = 'wait'; this.pt = 0; }

  setTape(k) {
    // hovering in front of the slot, then pushed home
    const s = this.slot, bob = this.phase === 'wait' ? Math.sin(this.t * 1.7) * 0.004 : 0;
    const a = ease(Math.min(1, k * 1.6)), b = ease3(Math.max(0, (k - 0.35) / 0.65));
    this.tape.position.set(s.x + 0.01 * (1 - a), s.y + 0.03 * (1 - a) + bob, s.z + 0.2 - 0.12 * a - 0.1 * b);
    this.tape.rotation.set(-0.35 * (1 - a), 0.2 * (1 - a), 0.05 * (1 - a));
    this.tape.visible = b < 0.999;
    this.door.rotation.x = -1.35 * Math.min(1, Math.max(0, (k - 0.3) / 0.35)) * (1 - ease(Math.max(0, (k - 0.95) / 0.1)));
  }
  drawDisplay(txt, blink) {
    const { g, t } = this.disp;
    g.fillStyle = '#060807'; g.fillRect(0, 0, 256, 64);
    const on = !blink || Math.floor(this.t * 2) % 2 === 0;
    g.font = 'bold 40px "Courier New", monospace'; g.textBaseline = 'middle';
    g.shadowColor = '#5affd8'; g.shadowBlur = 10; g.fillStyle = on ? '#79ffe0' : '#0d1a16';
    g.fillText(txt, 14, 34); g.shadowBlur = 0;
    t.needsUpdate = true;
  }
  drawScreen(mode, k = 0) {
    const { g, t } = this.screenC, w = 1024, h = 768;
    if (mode === 'off') { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); }
    else if (mode === 'blue') {
      g.fillStyle = '#1631c8'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff'; g.font = '64px "VT323", "Courier New", monospace'; g.fillText('PLAY ▶', 70, 110);
      g.fillText('SP', 70, 690); g.fillText('0:00:00', 700, 690);
    } else if (mode === 'menu') {
      drawMenu(g, w, h);
      if (document.fonts && !this._fontWait) { this._fontWait = 1; document.fonts.load('64px "VT323"').then(() => { drawMenu(g, w, h); t.needsUpdate = true; }).catch(() => {}); }
    }
    t.needsUpdate = true;
  }

  insert(audio) {
    if (this.phase !== 'wait') return false;
    this.phase = 'insert'; this.pt = 0; this.audio = audio; this.cues = {};
    if (audio && audio.vcrInsert) audio.vcrInsert(0.85);
    return true;
  }
  cue(name, at, fn) { if (this.pt >= at && !this.cues[name]) { this.cues[name] = 1; fn(); } }

  // returns progress of the final dive into the glass (0..1), or -1 before it
  update(dt) {
    this.t += dt; this.pt += dt;
    const U = this.screenU; U.uTime.value = this.t;
    const c = this.cam;
    let dive = -1;
    if (this.phase === 'load' || this.phase === 'wait') {
      this.setTape(0);
      if (Math.floor(this.t * 2) !== this._bl) { this._bl = Math.floor(this.t * 2); this.drawDisplay('12:00', true); }
      const sway = Math.sin(this.t * 0.4) * 0.01;
      c.position.set(this.p0.x + sway, this.p0.y + Math.sin(this.t * 0.3) * 0.006, this.p0.z); c.lookAt(this.l0);
    } else {
      const T = this.pt, A = this.audio;
      this.setTape(Math.min(1, T / 1.1));
      this.cue('clunk', 0.85, () => { this.drawDisplay('LOAD', false); this.power.material.color.set(0xff3418); });
      this.cue('thread', 2.8, () => this.drawDisplay('LOAD  \u25CF', false));
      this.cue('play', 4.55, () => this.drawDisplay('\u25B6 0:00', false));
      this.cue('tvon', 4.7, () => { this.drawScreen('blue'); this.tvLed.material.color.set(0xff2a10); if (A && A.tvOn) A.tvOn(); });
      this.cue('menu', 5.95, () => { this.drawScreen('menu'); if (A && A.startMusic) A.startMusic(); });
      U.uOn.value = Math.min(1, Math.max(0, (T - 4.7) / 0.6));
      U.uNoise.value = T > 5.6 && T < 6.05 ? 0.5 + 0.5 * Math.sin(T * 40) : (T > 4.7 && T < 4.95 ? 0.3 : 0);
      this.glow.intensity = U.uOn.value * (T > 5.95 ? 1.1 : 2.0);
      this.glow.color.set(T > 5.95 ? 0xd8c8a8 : 0x5a7aff);
      // while it loads, lean in toward the deck; once it plays, sink down to the set and into the glass
      const D = this.fillDist(), fill = new THREE.Vector3().copy(this.screenPos).add(new THREE.Vector3(0, 0, D * 1.45));
      const lean = ease(Math.min(1, T / 4.2)) * 0.12;
      const p0 = new THREE.Vector3().copy(this.p0).lerp(new THREE.Vector3(-0.05, 1.05, 0.2), lean);
      const k = ease3(Math.min(1, Math.max(0, (T - 4.4) / 2.2)));
      const pos = new THREE.Vector3().lerpVectors(p0, fill, k);
      pos.x += Math.sin(k * Math.PI) * 0.12; pos.y += Math.sin(k * Math.PI) * 0.06;
      const look = new THREE.Vector3().lerpVectors(this.l0, this.screenPos, ease(Math.min(1, k * 1.25)));
      c.position.copy(pos); c.lookAt(look);
      if (T > 6.6) {
        // the last push: the bezel slides out of frame, the tube's curve and lines relax, and the picture
        // is left covering the window exactly as the full-screen menu will
        dive = Math.min(1, (T - 6.6) / 0.9);
        const e = ease3(dive);
        c.position.set(this.screenPos.x, this.screenPos.y, this.screenPos.z + D * (1.45 - 0.45 * e)); c.lookAt(this.screenPos);
        U.uFx.value = 1 - ease(Math.max(0, (dive - 0.2) / 0.8));
      }
    }
    this.r.setRenderTarget(null);
    this.r.render(this.scene, this.cam);
    return dive;
  }
  // distance at which the 4:3 picture just covers the window (CSS 'cover')
  fillDist() {
    const t = Math.tan(this.cam.fov * Math.PI / 360), a = this.cam.aspect;
    return Math.min(0.2025 / t, 0.27 / (t * a));
  }
  // a second click while it loads: straight to the menu
  skip() { if (this.phase === 'insert' && this.pt < 5.95) { this.pt = 5.95; return true; } return false; }
  dispose() { this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
}
