// What makes the last afternoon more than chores: the thing from their life that you saw on the beach is here in the
// house; the radio in the kitchen reports the country coming apart; jets go over once; and when the pull toward the
// tape begins the house tilts — the light goes gold, the outside sounds drain away and the clock gets loud.
import * as THREE from 'three';
import { mk, col, std, B, RB, CY } from './homebuild.js';

const T = THREE, TAU = Math.PI * 2;
const $ = (id) => document.getElementById(id);

// a little canvas picture
function card(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return t; }
const paper = (g, w, h, c = '#f4efe2') => { g.fillStyle = c; g.fillRect(0, 0, w, h); for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.04})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } };
const hand = (g, txt, x, y, px = 22, c = '#1e2350') => { g.fillStyle = c; g.font = `italic ${px}px "Bradley Hand", "Comic Sans MS", cursive`; g.fillText(txt, x, y); };

// places in the house (the floor plan is the same in every home)
const AT = {
  coffee: [-2.78, 0.445, -2.5], kitchenTable: [2.95, 0.775, 1.95], desk: [3.74, 0.765, -3.7], deskR: [4.66, 0.765, -3.68], counter: [0.45, 0.9, 4.15], counterR: [5.45, 0.9, 4.2],
  fridge: [5.165, 1.62, 2.5], diploma: [-2.2, 1.55, -0.08], shelfTop: [1.2, 1.985, -2.75], mudroom: [-3.0, 0, 2.7], barrel: [-0.9, 0.84, 4.95], yard: [7.6, 0, 6.6], night: [1.42, 0.32, -0.25],
};
const V = (a) => new T.Vector3(a[0], a[1], a[2]);

// picture frames
function frameOn(s, at, tex, w, h, ry = 0, lean = true) {
  const g = new T.Group(); g.position.copy(V(at)); g.rotation.y = ry; s.add(g);
  mk(g, B(w + 0.04, h + 0.04, 0.02), col('#3a2a1e', 0.5), 0, h / 2 + 0.02, 0, 0, lean ? -0.18 : 0);
  const p = mk(g, new T.PlaneGeometry(w, h), std({ map: tex, roughness: 0.6 }), 0, h / 2 + 0.02, 0.012, 0, lean ? -0.18 : 0); p.castShadow = false;
  if (lean) p.position.z += 0.004;
  return g;
}
const onFridge = (s, tex, w = 0.18, h = 0.13, dy = 0) => { const p = mk(s, new T.PlaneGeometry(w, h), std({ map: tex, roughness: 0.8 }), AT.fridge[0], AT.fridge[1] + dy, AT.fridge[2], -Math.PI / 2); p.castShadow = false; mk(s, CY(0.012, 0.012, 0.01, 10), col('#c83a2a', 0.4), AT.fridge[0] - 0.006, AT.fridge[1] + dy + h / 2 - 0.02, AT.fridge[2], 0, 0, Math.PI / 2); return p; };

// ---------------------------------------------------------------- what each life left in the house
const ECHO = {
  'Wrote to a sister every Sunday.': { at: 'desk', look: 'Look at the letters', desc: 'Her letters, every one of them, tied up with string. You still owe her this week’s.',
    build(s, a) { for (let k = 0; k < 9; k++) mk(s, B(0.16, 0.006, 0.11), col(k % 3 ? '#efe8d6' : '#dfe8f0', 0.9), a.x, a.y + 0.004 + k * 0.007, a.z, (Math.random() - 0.5) * 0.25); mk(s, B(0.005, 0.07, 0.115), col('#a8442c', 0.8), a.x, a.y + 0.033, a.z); } },
  'Could name every star over home.': { at: 'desk', look: 'Look at the star chart', desc: 'Your star chart, every one pencilled in by name. You’d know them all tonight.',
    build(s, a) { const t = card(256, 256, (g, w, h) => { g.fillStyle = '#1a2440'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(200,210,240,.35)'; g.beginPath(); g.arc(w / 2, h / 2, 120, 0, TAU); g.stroke(); for (let i = 0; i < 160; i++) { g.fillStyle = '#f4f0dc'; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2); } g.strokeStyle = 'rgba(240,230,180,.6)'; g.beginPath(); const pts = [[60, 80], [95, 70], [130, 90], [150, 120], [190, 115]]; pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); g.fillStyle = 'rgba(240,230,180,.8)'; g.font = 'italic 11px serif'; g.fillText('Ursa Major', 90, 60); g.fillText('Arcturus', 170, 150); g.fillText('Vega', 50, 190); });
      const p = mk(s, new T.PlaneGeometry(0.3, 0.3), std({ map: t, roughness: 0.8 }), a.x, a.y + 0.004, a.z, 0.2, -Math.PI / 2); p.castShadow = false; } },
  'Was saving for a fishing boat.': { at: 'counter', look: 'Look at the jar', desc: 'The boat jar. Four hundred and twelve dollars, counted twice.',
    build(s, a) { mk(s, CY(0.07, 0.07, 0.2, 18), std({ color: 0xe8f0f0, roughness: 0.05, transparent: true, opacity: 0.35 }), a.x, a.y + 0.1, a.z); for (let k = 0; k < 12; k++) mk(s, B(0.06, 0.004, 0.03), col('#8aa878', 0.8), a.x + (Math.random() - 0.5) * 0.06, a.y + 0.01 + k * 0.009, a.z + (Math.random() - 0.5) * 0.06, Math.random() * 3); mk(s, new T.PlaneGeometry(0.08, 0.04), std({ map: card(128, 64, (g, w, h) => { paper(g, w, h); hand(g, 'BOAT', 22, 44, 34); }) }), a.x, a.y + 0.12, a.z - 0.071, Math.PI); } },
  'Learned to swim at nine, in cold water.': { at: 'coffee', look: 'Look at the photo', desc: 'You, nine years old, blue-lipped and grinning. The water was so cold.',
    build(s, a) { frameOn(s, [a.x, a.y, a.z], card(160, 120, (g, w, h) => { const sky = g.createLinearGradient(0, 0, 0, 60); sky.addColorStop(0, '#9ab8d0'); sky.addColorStop(1, '#d8e0e0'); g.fillStyle = sky; g.fillRect(0, 0, w, 60); g.fillStyle = '#3a6a7a'; g.fillRect(0, 56, w, 64); g.fillStyle = '#e8c8a0'; g.beginPath(); g.arc(80, 62, 9, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,.6)'; for (let i = 0; i < 20; i++) g.fillRect(Math.random() * w, 60 + Math.random() * 60, 12, 2); g.fillStyle = 'rgba(255,240,200,.15)'; g.fillRect(0, 0, w, h); }), 0.16, 0.12, Math.PI / 2 + 0.4); } },
  'Had a daughter, not yet met.': { at: 'fridge', look: 'Look at the picture', desc: 'The ultrasound, held up with a magnet. Due in March. You’ve picked a name, but you haven’t said it out loud.',
    build(s) { onFridge(s, card(160, 120, (g, w, h) => { g.fillStyle = '#0a0a0a'; g.fillRect(0, 0, w, h); g.fillStyle = '#222'; g.beginPath(); g.moveTo(80, 10); g.arc(80, 10, 110, Math.PI * 0.3, Math.PI * 0.7); g.fill(); g.fillStyle = 'rgba(220,220,220,.7)'; g.beginPath(); g.ellipse(70, 70, 26, 18, -0.3, 0, TAU); g.fill(); g.beginPath(); g.arc(100, 58, 13, 0, TAU); g.fill(); for (let i = 0; i < 600; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.12})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } g.fillStyle = '#ddd'; g.font = '9px monospace'; g.fillText('GA 14w2d', 6, 112); }), 0.17, 0.13); } },
  'Carried a photo of a dog named Biscuit.': { at: 'coffee', look: 'Look at the photo', desc: 'Biscuit. The photo you carry everywhere has its twin here, and his collar still hangs by the back door.',
    build(s, a) { frameOn(s, [a.x, a.y, a.z], card(160, 120, (g, w, h) => { g.fillStyle = '#6a8a4a'; g.fillRect(0, 0, w, h); g.fillStyle = '#c89a5a'; g.beginPath(); g.ellipse(80, 78, 42, 26, 0, 0, TAU); g.fill(); g.beginPath(); g.arc(112, 50, 20, 0, TAU); g.fill(); g.fillStyle = '#8a6a3a'; g.beginPath(); g.ellipse(124, 40, 7, 13, 0.4, 0, TAU); g.fill(); g.fillStyle = '#1a1a1a'; g.beginPath(); g.arc(118, 48, 2.5, 0, TAU); g.arc(128, 56, 3, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,240,200,.15)'; g.fillRect(0, 0, w, h); }), 0.16, 0.12, Math.PI / 2 + 0.4);
      const c = mk(s, new T.TorusGeometry(0.06, 0.01, 6, 20), col('#a8302a', 0.6), -3.4, 1.45, 4.4); c.scale.set(1, 1.3, 1); } },
  'Wanted to be a carpenter, like a father before.': { at: 'mudroom', look: 'Look at the birdhouse', desc: 'A birdhouse, half built, your father’s old plane beside it. The roof still needs doing.',
    build(s, a, H) { const w = col('#a8875a', 0.8); mk(s, B(1.2, 0.05, 0.6), col('#7a5a3a', 0.8), a.x, 0.82, a.z); for (const [dx, dz] of [[-0.55, -0.25], [0.55, -0.25], [-0.55, 0.25], [0.55, 0.25]]) mk(s, B(0.05, 0.8, 0.05), col('#7a5a3a', 0.8), a.x + dx, 0.4, a.z + dz); mk(s, B(0.18, 0.2, 0.16), w, a.x - 0.2, 0.945, a.z); mk(s, CY(0.025, 0.025, 0.01, 12), col('#1a1a1a', 0.9), a.x - 0.2, 0.97, a.z - 0.081, 0, Math.PI / 2); mk(s, B(0.2, 0.012, 0.11), w, a.x + 0.1, 0.85, a.z + 0.1, 0.3); mk(s, B(0.22, 0.05, 0.06), col('#5a3a1e', 0.6), a.x + 0.3, 0.87, a.z - 0.1, -0.4); for (let k = 0; k < 14; k++) mk(s, B(0.02, 0.002, 0.008), w, a.x + (Math.random() - 0.5) * 0.9, 0.846, a.z + (Math.random() - 0.5) * 0.4, Math.random() * 3); H.cols.push([a.x - 0.62, a.z - 0.32, a.x + 0.62, a.z + 0.32]); } },
  'Sang badly and often.': { at: 'deskR', look: 'Put the record on', desc: 'You put the record on and sing along. Badly. Nobody’s here to mind.', song: true,
    build(s, a) { mk(s, RB(0.4, 0.1, 0.32, 0.01), col('#6a4a2a', 0.5), a.x, a.y + 0.05, a.z); const rec = mk(s, CY(0.15, 0.15, 0.004, 32), col('#111', 0.3), a.x - 0.03, a.y + 0.105, a.z); mk(s, CY(0.05, 0.05, 0.005, 20), col('#c8302a', 0.6), a.x - 0.03, a.y + 0.107, a.z); mk(s, B(0.012, 0.012, 0.2), col('#c8c8c8', 0.3, 0.8), a.x + 0.13, a.y + 0.12, a.z + 0.02, 0.4); return { spin: rec }; } },
  'Kept a pressed flower inside the helmet.': { at: 'coffee', look: 'Look at the book', desc: 'A flower from the garden, pressed flat in the big dictionary. You meant to take it with you.',
    build(s, a) { mk(s, RB(0.2, 0.07, 0.27, 0.01), col('#3a2a2a', 0.7), a.x, a.y + 0.035, a.z, 0.3); const p = mk(s, new T.PlaneGeometry(0.17, 0.24), std({ map: card(128, 180, (g, w, h) => { paper(g, w, h, '#efe8d4'); g.fillStyle = 'rgba(60,40,30,.5)'; for (let y = 12; y < h; y += 7) g.fillRect(8, y, w - 16, 2); g.strokeStyle = '#5a7a3a'; g.lineWidth = 2; g.beginPath(); g.moveTo(64, 160); g.lineTo(62, 80); g.stroke(); g.fillStyle = '#b84a8a'; for (let k = 0; k < 6; k++) { g.beginPath(); g.ellipse(62 + Math.cos(k) * 9, 70 + Math.sin(k) * 9, 8, 4, k, 0, TAU); g.fill(); } }), roughness: 0.9 }), a.x, a.y + 0.072, a.z, 0.3, -Math.PI / 2); p.castShadow = false; } },
  'Had never seen this ocean before this week.': { at: 'fridge', look: 'Look at the postcard', desc: 'A postcard of a beach you’d never been to, from a friend. “Wish you were here.”',
    build(s, a, H) { onFridge(s, card(192, 128, (g, w, h) => { g.fillStyle = '#8ab8d8'; g.fillRect(0, 0, w, 50); g.fillStyle = '#2a6a8a'; g.fillRect(0, 50, w, 30); g.fillStyle = '#e8d8b0'; g.fillRect(0, 80, w, 48); g.fillStyle = '#f4f0e6'; g.font = 'bold 18px sans-serif'; g.fillText('GREETINGS FROM', 14, 30); g.fillStyle = '#c84a2a'; g.font = 'bold 22px sans-serif'; g.fillText(H.us ? 'GALVESTON' : 'THE CAPE', 26, 112); }), 0.19, 0.125, -0.05); } },
  'Promised to be home for the harvest.': { at: 'fridge', look: 'Look at the note', desc: 'Your own handwriting: the harvest, end of September. You promised them you’d be there.',
    build(s) { onFridge(s, card(160, 160, (g, w, h) => { paper(g, w, h, '#fbf3a8'); hand(g, 'HARVEST', 18, 50, 30); hand(g, 'Sept 20th —', 18, 92, 24); hand(g, 'be there!!', 30, 130, 24, '#a8302a'); }), 0.14, 0.14); } },
  'Was afraid of the dark. Still is.': { at: 'night', look: 'Look at the night-light', desc: 'The night-light by the door. You’ve never told anyone. You never will.',
    build(s, a) { mk(s, RB(0.06, 0.08, 0.04, 0.01), std({ color: 0xfff0c8, emissive: new T.Color(0xffd890), emissiveIntensity: 1.2, roughness: 0.5 }), a.x - 0.02, a.y, a.z); const l = new T.PointLight(0xffd8a0, 0.25, 1.6, 2); l.position.set(a.x - 0.15, a.y + 0.05, a.z); s.add(l); } },
  'Counted things when nervous. Counting now.': { at: 'kitchenTable', look: 'Look at the buttons', desc: 'Buttons from the tin, sorted into piles of ten. You don’t remember doing it.',
    build(s, a) { for (let p = 0; p < 5; p++) for (let k = 0; k < 10; k++) mk(s, CY(0.011, 0.011, 0.004, 10), col(['#c8302a', '#2a4a8a', '#e8e0cc', '#3a6a3a', '#1a1a1a'][p], 0.5), a.x - 0.2 + p * 0.09 + (Math.random() - 0.5) * 0.01, a.y + 0.004 + k * 0.0042, a.z + (Math.random() - 0.5) * 0.01); mk(s, CY(0.06, 0.06, 0.05, 20), col('#8a8e92', 0.3, 0.8), a.x + 0.28, a.y + 0.025, a.z - 0.1); } },
  'Had a terrible laugh that made everyone else laugh.': { at: 'deskR', look: 'Play the message', message: true, desc: '“It’s me. Still laughing about Saturday — that laugh of yours, the whole bar lost it. Call me back, you goon.”',
    build(s, a) { mk(s, RB(0.2, 0.06, 0.15, 0.01), col('#1a1a1a', 0.4), a.x, a.y + 0.03, a.z); const led = mk(s, B(0.012, 0.006, 0.012), new T.MeshBasicMaterial({ color: 0xff3020 }), a.x + 0.06, a.y + 0.062, a.z - 0.05); for (const dx of [-0.04, 0.0]) mk(s, CY(0.022, 0.022, 0.004, 14), col('#5a5a5a', 0.4, 0.5), a.x + dx, a.y + 0.062, a.z + 0.02); return { blink: led }; } },
  'Missed the smell of the bakery downstairs.': { at: 'counter', look: 'Look at the bread', desc: 'Bread from the bakery, still warm in its paper bag. The whole kitchen smells of it.',
    build(s, a) { mk(s, B(0.16, 0.26, 0.11), col('#c8a878', 0.95), a.x, a.y + 0.13, a.z); const l = mk(s, CY(0.05, 0.06, 0.24, 14), col('#b8783a', 0.8), a.x, a.y + 0.27, a.z, 0, 0.3, 0.2); l.scale.set(1, 1, 0.8); } },
  'Was nineteen and felt forty.': { at: 'kitchenTable', look: 'Look at the cards', desc: 'Birthday cards from last week, still standing. Nineteen. It doesn’t feel like it.',
    build(s, a) { for (let k = 0; k < 3; k++) { const g = new T.Group(); g.position.set(a.x - 0.15 + k * 0.15, a.y, a.z + (k % 2) * 0.05); g.rotation.y = (k - 1) * 0.3; s.add(g); const c = card(96, 128, (q, w, h) => { q.fillStyle = ['#e8c84a', '#8ab8d8', '#e88a8a'][k]; q.fillRect(0, 0, w, h); q.fillStyle = '#fff'; q.font = 'bold 48px sans-serif'; q.fillText('19', 22, 80); }); const m = std({ map: c, side: T.DoubleSide, roughness: 0.8 }); const p1 = mk(g, new T.PlaneGeometry(0.1, 0.13), m, -0.025, 0.065, 0, 0.5); const p2 = mk(g, new T.PlaneGeometry(0.1, 0.13), col('#f4f0e6', 0.8), 0.025, 0.065, -0.02, -0.5); p1.castShadow = p2.castShadow = false; } } },
  'Drew birds in the margins of everything.': { at: 'desk', look: 'Look at the sketchbook', desc: 'Your sketchbook. Birds in every margin. The one from the lawn this morning is already in it.',
    build(s, a) { const p = mk(s, new T.PlaneGeometry(0.34, 0.24), std({ map: card(256, 180, (g, w, h) => { paper(g, w, h, '#f6f2e6'); g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(w / 2 - 1, 0, 2, h); g.strokeStyle = '#2a2a2a'; g.lineWidth = 1.5; for (let k = 0; k < 5; k++) { const x = 30 + (k % 3) * 70 + (k > 2 ? 30 : 0), y = 40 + (k > 2 ? 80 : 0); g.beginPath(); g.ellipse(x, y, 18, 11, -0.2, 0, TAU); g.moveTo(x + 14, y - 8); g.arc(x + 20, y - 12, 7, 0, TAU); g.moveTo(x + 27, y - 12); g.lineTo(x + 34, y - 10); g.moveTo(x - 16, y + 2); g.lineTo(x - 30, y + 8); g.moveTo(x - 2, y + 10); g.lineTo(x - 4, y + 22); g.moveTo(x + 4, y + 10); g.lineTo(x + 6, y + 22); g.stroke(); } }), roughness: 0.9 }), a.x, a.y + 0.004, a.z, 0.15, -Math.PI / 2); p.castShadow = false; } },
  'Was going to propose at the new year.': { at: 'desk', look: 'Look at the little box', desc: 'The ring, in its box, tucked behind the books. New Year’s Eve. You had the whole thing planned.',
    build(s, a) { mk(s, RB(0.06, 0.045, 0.06, 0.012), col('#2a1e4a', 0.6), a.x, a.y + 0.0225, a.z); mk(s, new T.TorusGeometry(0.012, 0.0025, 8, 20), std({ color: 0xe8c86a, metalness: 1, roughness: 0.2 }), a.x, a.y + 0.055, a.z, 0, 0, 0); } },
  'Had read the same paperback four times.': { at: 'coffee', look: 'Look at the paperback', desc: 'That paperback, spine cracked white from reading. Fourth time through. You still underline things.',
    build(s, a) { mk(s, B(0.11, 0.025, 0.17), col('#c8642a', 0.85), a.x, a.y + 0.0125, a.z, 0.5); for (let k = 0; k < 5; k++) mk(s, B(0.112, 0.002, 0.004), col('#f4f0e6', 0.8), a.x, a.y + 0.0125, a.z - 0.06 + k * 0.03, 0.5); } },
  'Best chess player in the company.': { at: 'kitchenTable', look: 'Look at the board', desc: 'A game by mail, half finished. It’s your move. It’s been your move for a week.',
    build(s, a) { const t = card(256, 256, (g, w, h) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#6a4a2a' : '#e8d8b0'; g.fillRect(x * 32, y * 32, 32, 32); } }); mk(s, B(0.34, 0.02, 0.34), std({ map: t, roughness: 0.5 }), a.x, a.y + 0.01, a.z); for (let k = 0; k < 14; k++) { const wht = k % 2, px = a.x - 0.15 + Math.floor(Math.random() * 8) * 0.0425 + 0.021, pz = a.z - 0.15 + Math.floor(Math.random() * 8) * 0.0425 + 0.021; mk(s, CY(0.008, 0.013, 0.03 + (k % 4) * 0.008, 10), col(wht ? '#f0e8d8' : '#1a1a1a', 0.4), px, a.y + 0.035, pz); } } },
  'Had a scar from a bicycle, age six.': { at: 'yard', look: 'Look at the old bike', desc: 'The bike that gave you the scar on your chin. Too small for you since you were ten. You never could throw it out.', bike: 0.7 },
  'Could not really see without glasses. Told no one.': { at: 'coffee', look: 'Pick up your glasses', desc: 'Your glasses. You never wear them in front of anyone. Things are sharper with them on.',
    build(s, a) { const m = col('#1a1a1a', 0.3); for (const dx of [-0.032, 0.032]) mk(s, new T.TorusGeometry(0.024, 0.003, 6, 20), m, a.x + dx, a.y + 0.01, a.z, 0, -Math.PI / 2 + 0.2); mk(s, B(0.02, 0.003, 0.003), m, a.x, a.y + 0.012, a.z); for (const dx of [-0.058, 0.058]) mk(s, B(0.003, 0.003, 0.12), m, a.x + dx, a.y + 0.005, a.z - 0.06); } },
  'Knew every word to a song nobody else liked.': { at: 'deskR', look: 'Play the tape', desc: 'That song. Nobody else can stand it. You know every word, and you sing them all.', song: true,
    build(s, a) { mk(s, RB(0.3, 0.12, 0.09, 0.01), col('#2a2a2a', 0.4, 0.3), a.x, a.y + 0.06, a.z); for (const dx of [-0.09, 0.09]) mk(s, CY(0.035, 0.035, 0.005, 20), col('#4a4a4a', 0.6), a.x + dx, a.y + 0.07, a.z - 0.046, 0, Math.PI / 2); mk(s, B(0.07, 0.045, 0.004), col('#c8c8c0', 0.3), a.x, a.y + 0.06, a.z - 0.046); } },
  'Was the first in the family to finish school.': { at: 'diploma', look: 'Look at the diploma', desc: 'The diploma, framed by your mother. She cried the whole way through the ceremony.',
    build(s, a) { const g = new T.Group(); g.position.copy(a); g.rotation.y = Math.PI; s.add(g); mk(g, B(0.44, 0.34, 0.02), col('#2a1e14', 0.4), 0, 0, 0); const p = mk(g, new T.PlaneGeometry(0.38, 0.28), std({ map: card(256, 190, (q, w, h) => { paper(q, w, h, '#f6f0dc'); q.fillStyle = '#2a2a3a'; q.font = 'bold 20px serif'; q.fillText('Diploma', 88, 44); q.font = 'italic 12px serif'; q.fillText('is hereby awarded this', 70, 80); q.font = '10px serif'; q.fillText('with all the rights and privileges', 50, 120); q.fillStyle = '#c8a24a'; q.beginPath(); q.arc(200, 150, 18, 0, TAU); q.fill(); }), roughness: 0.7 }), 0, 0, 0.011); p.castShadow = false; } },
  'Owed a friend money and meant to pay it back.': { at: 'kitchenTable', look: 'Look at the envelope', desc: 'An envelope with sixty dollars in it and a name on the front. You keep meaning to drop it off.',
    build(s, a, H) { const nm = H.us ? 'Danny' : 'Cody'; const p = mk(s, new T.PlaneGeometry(0.2, 0.11), std({ map: card(200, 110, (g, w, h) => { paper(g, w, h, '#f2ecdc'); hand(g, 'for ' + nm, 46, 64, 28); }), roughness: 0.9 }), a.x, a.y + 0.003, a.z, -0.2, -Math.PI / 2); p.castShadow = false; } },
  'Taught a little brother to ride a bike last spring.': { at: 'yard', look: 'Look at the little bike', desc: 'Your brother’s bike, training wheels off now. You ran beside him the whole length of the street.', bike: 0.55 },
  'Liked mornings exactly like this one, before.': { at: 'barrel', look: 'Look at the mug', desc: 'This morning’s coffee, gone cold on the barrel lid. It was a good morning. The kind you like best.',
    build(s, a) { mk(s, CY(0.04, 0.035, 0.09, 16), std({ color: 0xe8e0d0, roughness: 0.25 }), a.x + 0.1, a.y + 0.045, a.z); mk(s, CY(0.036, 0.036, 0.003, 16), col('#3a2414', 0.2), a.x + 0.1, a.y + 0.08, a.z); } },
  'Had a garden going back home. Tomatoes.': { at: 'barrel', look: 'Look at the seed envelope', desc: 'Seed saved from last year’s tomatoes, in an envelope in your own hand. Next year’s garden.',
    build(s, a) { const p = mk(s, new T.PlaneGeometry(0.11, 0.15), std({ map: card(110, 150, (g, w, h) => { paper(g, w, h, '#e8dcc0'); hand(g, 'Tomato', 10, 40, 22); hand(g, 'Brandywine', 6, 72, 18); hand(g, 'saved', 20, 110, 18); }), roughness: 0.9 }), a.x - 0.08, a.y + 0.003, a.z, 0.4, -Math.PI / 2); p.castShadow = false; } },
  'Wanted to see snow, just once.': { at: 'shelfTop', look: 'Look at the snow globe', desc: 'A snow globe somebody brought back for you. You shake it sometimes, when nobody’s around.',
    build(s, a) { mk(s, CY(0.045, 0.05, 0.03, 16), col('#5a3a24', 0.5), a.x, a.y + 0.015, a.z); mk(s, new T.SphereGeometry(0.045, 18, 14), std({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.3 }), a.x, a.y + 0.07, a.z); mk(s, new T.ConeGeometry(0.02, 0.04, 8), col('#2a5a3a', 0.8), a.x, a.y + 0.06, a.z); } },
  'Fixed radios. Could fix anything with a hum.': { at: 'deskR', look: 'Look at the radio', radio: true, desc: 'The radio you fixed last week, back off, valves glowing. It hums a little before it talks.' },
};

// a bicycle, leaning on its kickstand
function bike(s, a, sc, H) {
  const g = new T.Group(); g.position.copy(a); g.rotation.set(0, 0.6, 0.12); g.scale.setScalar(sc); s.add(g);
  const fr = col(H.us ? '#c8302a' : '#2a5aa8', 0.4, 0.4), tire = col('#1a1a1a', 0.9), chrome = col('#c8c8c8', 0.25, 0.9);
  for (const z of [-0.5, 0.5]) { mk(g, new T.TorusGeometry(0.33, 0.03, 8, 28), tire, 0, 0.36, z, Math.PI / 2); for (let k = 0; k < 8; k++) mk(g, CY(0.004, 0.004, 0.64, 4), chrome, 0, 0.36, z, 0, k * Math.PI / 8 + Math.PI / 2); }
  mk(g, CY(0.022, 0.022, 0.75, 8), fr, 0, 0.55, -0.02, 0, Math.PI / 2 - 0.25); mk(g, CY(0.022, 0.022, 0.6, 8), fr, 0, 0.5, 0.2, 0, -0.9); mk(g, CY(0.02, 0.02, 0.5, 8), fr, 0, 0.62, -0.42, 0, 0.3);
  mk(g, RB(0.1, 0.04, 0.24, 0.02), col('#1a1a1a', 0.6), 0, 0.78, 0.32); mk(g, CY(0.015, 0.015, 0.46, 8), chrome, 0, 0.86, -0.46, 0, 0, Math.PI / 2);
  H.cols.push([a.x - 0.45, a.z - 0.45, a.x + 0.45, a.z + 0.45]);
}

// the news, side by side: escalating, then the station drifts off as the pull to the tape begins
const NEWS = {
  us: ['…sunny on the Cape, highs near seventy-eight. Heavy traffic at the Sagamore Bridge into this evening…',
    '…the Pentagon says it has lost contact with several units in the Southwest. A spokesman called the situation “fluid”…',
    '…Guard commanders in Texas say they will no longer take orders from Washington. Active-duty bases there have declared for them…',
    '…the Navy confirms ships have left their berths in Norfolk and Corpus Christi. It will not say under whose orders…',
    '…the governor has activated the Massachusetts National Guard. Joint Base Cape Cod is closed to the public…',
    '…airspace over New England is closed to civilian traffic until further notice…',
    '…unconfirmed reports of landing craft in Nantucket Sound. We are working to confirm…',
    '…stay tuned to this station. Again: please stay tuned to this station…'],
  tx: ['…hot one today, upper nineties, heat index past one-oh-five. Check on your neighbors, folks…',
    '…Guard commanders at Camp Mabry say they will not comply with the federal order. Active-duty units across the state have joined them…',
    '…Washington is calling it a mutiny. Austin is calling it self-defense. Lines at the gas pumps from Amarillo to Brownsville…',
    '…the amphibious ships in Corpus Christi put to sea before dawn. Nobody is saying where they’re headed…',
    '…the governor has activated the Guard and the State Guard. If you’ve got orders, report as ordered…',
    '…the FAA has closed the airspace. If you hear jets today, we’re told they’re ours…',
    '…reports of a convoy northbound on I-35, a long one. Stay off the interstate…',
    '…we’ll keep the lights on here as long as we can. Stay with us…'],
};

export function story(H) {
  const s = H.scene, us = H.us, life = H.ident.life || '', S = { t: 0, tilt: 0, tick: 0, newsI: 0, newsT: 18, jetT: 85, heliT: 190, shake: 0 };
  // ---------------- the echo
  const E = ECHO[life];
  let radioAt = V(AT.counterR);
  if (E) {
    const a = V(AT[E.at]);
    if (E.build) S.parts = E.build(s, a, H) || {};
    if (E.bike) bike(s, a, E.bike, H);
    if (E.radio) radioAt = a;
    S.echo = { at: E.radio ? a.clone().setY(a.y + 0.1) : a.clone().setY(a.y + 0.08), E };
    H.acts.push({ id: 'echo', at: S.echo.at, reach: 1.4, instant: true, parent: H,
      label: () => (S.seen ? null : E.look),
      click: () => { S.seen = true; H.say(E.desc, `“${life}”`, 9); H.audio.chord(); if (E.song) H.audio.hum(); if (E.message) H.audio.click(0.4, 900); } });
  }
  // ---------------- the radio
  const rg = new T.Group(); rg.position.copy(radioAt); rg.rotation.y = E && E.radio ? Math.PI + 0.1 : 0.2; s.add(rg);
  mk(rg, RB(0.32, 0.18, 0.14, 0.03), col(us ? '#7a5a3a' : '#c8b48a', 0.5), 0, 0.09, 0);
  mk(rg, new T.PlaneGeometry(0.16, 0.12), std({ map: card(64, 48, (g) => { g.fillStyle = '#3a3026'; g.fillRect(0, 0, 64, 48); g.strokeStyle = '#2a2018'; for (let x = 2; x < 64; x += 4) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 48); g.stroke(); } }), roughness: 0.9 }), -0.06, 0.09, -0.071, Math.PI);
  const dial = mk(rg, new T.PlaneGeometry(0.09, 0.03), std({ color: 0xf0d8a0, emissive: new T.Color(0xffc870), emissiveIntensity: 0.6, roughness: 0.5 }), 0.09, 0.12, -0.071, Math.PI);
  for (const dx of [0.06, 0.12]) mk(rg, CY(0.015, 0.015, 0.02, 12), col('#2a2a2a', 0.4), dx, 0.05, -0.075, 0, Math.PI / 2);
  S.radio = rg; S.dial = dial;
  // the line on screen for what the radio says
  let el = $('radio'); if (!el) { el = document.createElement('div'); el.id = 'radio'; el.style.cssText = 'position:absolute;left:10%;right:10%;top:12%;text-align:center;font-style:italic;font-size:clamp(14px,2vw,20px);opacity:0;transition:opacity 1s;color:#f2ead8;text-shadow:0 1px 3px #000;pointer-events:none'; document.body.appendChild(el); }
  S.el = el;
  S.update = (dt) => update(H, S, dt);
  S.dispose = () => { el.style.opacity = 0; };
  return S;
}

function update(H, S, dt) {
  S.t += dt; const t = S.t, cam = H.cam, A = H.audio;
  const radioD = cam.position.distanceTo(S.radio.position), near = H.inside && radioD < 7.5;
  // the news
  if (H.phase === 'free' || H.phase === 'compelled') {
    S.newsT -= dt;
    if (S.newsT < 0 && H.phase === 'free' && S.newsI < NEWS.us.length) {
      const line = NEWS[H.us ? 'us' : 'tx'][S.newsI++]; S.newsT = 34;
      const g = Math.max(0.03, 0.5 * Math.min(1, 2.2 / Math.max(1, radioD))) * (H.inside ? 1 : 0.35);
      A.talk(5.5, g, S.newsI > 4 ? 1.15 : 1);
      if (near) { S.el.textContent = `RADIO — ${line}`; S.el.style.opacity = 1; clearTimeout(S.elT); S.elT = setTimeout(() => (S.el.style.opacity = 0), 6500); }
    }
    if (H.phase === 'compelled' && !S.static) { S.static = true; A.loop('radioStatic', true, (d, sr, r) => { let y = 0; for (let i = 0; i < d.length; i++) { y += 0.7 * ((r() * 2 - 1) - y); d[i] = y * (0.6 + 0.4 * Math.sin(i / sr * 3)); } }, 0.025); if (near) { S.el.textContent = 'RADIO — …the station drifts into static.'; S.el.style.opacity = 1; clearTimeout(S.elT); S.elT = setTimeout(() => (S.el.style.opacity = 0), 4000); } }
  }
  if (S.static && H.phase !== 'compelled') { A.loop('radioStatic', false); S.static = false; S.staticDone = true; }
  S.dial.material.emissiveIntensity = S.staticDone ? 0.1 : 0.5 + 0.1 * Math.sin(t * 7);
  // jets: once, low, hard enough to rattle the windows
  if (H.phase === 'free' && (S.jetT -= dt) < 0 && !S.jets) {
    S.jets = []; const m = col('#6a7078', 0.5, 0.4);
    for (let k = 0; k < 2; k++) { const j = new T.Group(); mk(j, CY(0.6, 0.4, 14, 10), m, 0, 0, 0, 0, Math.PI / 2); const w = new T.Shape(); w.moveTo(0, 4); w.lineTo(6, -3); w.lineTo(-6, -3); w.lineTo(0, 4); mk(j, new T.ShapeGeometry(w), m, 0, 0, -1, 0, Math.PI / 2).material.side = T.DoubleSide; mk(j, B(0.2, 3, 2.5), m, 0, 1.5, -6); j.userData.k = k; H.scene.add(j); S.jets.push(j); }
    S.jetU = 0; A.jets(); }
  if (S.jets) { S.jetU += dt; const u = S.jetU;
    S.jets.forEach((j) => { const k = j.userData.k; j.position.set(-30 + k * 26, 85 + k * 6, -500 + (u - k * 0.4) * 230); j.rotation.y = 0; });
    const over = Math.max(0, 1 - Math.abs(u - 2.3) / 1.4); S.shake = Math.max(S.shake, over);
    if (u > 2.0 && !S.rattled) { S.rattled = true; A.clink(0.25); setTimeout(() => A.clink(0.2), 180); }
    if (u > 6) { S.jets.forEach((j) => H.scene.remove(j)); S.jets = null; S.jetT = 1e9; } }
  if ((S.heliT -= dt) < 0 && H.phase === 'free') { S.heliT = 1e9; A.helis(); }
  if (S.shake > 0) { S.shake = Math.max(0, S.shake - dt * 0.6); cam.position.x += (Math.random() - 0.5) * 0.012 * S.shake; cam.position.y += (Math.random() - 0.5) * 0.012 * S.shake; }
  // echo bits that move
  if (S.parts) { if (S.parts.spin && S.seen) S.parts.spin.rotation.y -= dt * 3.5; if (S.parts.blink) S.parts.blink.visible = S.seen || Math.sin(t * 6) > 0; }
  // the tilt toward the tape: gold light (homelife reads H.tilt), outside drains away, the clock gets loud
  if (H.phase !== 'free') S.tilt = Math.min(1, S.tilt + dt / 50);
  H.tilt = S.tilt;
  A.thin(S.tilt);
  if (S.tilt > 0 && H.phase !== 'call') { S.tick += dt; if (S.tick > 1) { S.tick -= 1; if (H.inside) A.tock(0.03 + 0.22 * S.tilt); } }
}
