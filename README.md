# BETAMAX

*A battle, in rewind.* Mayflower Beach, Dennis, Cape Cod. Dawn, low tide.

A modern amphibious invasion comes across the tidal flats and is met by a helicopter-inserted platoon on the dunes, and the whole thing plays on a VCR in reverse. Bullets fly back into their guns, the dead get up, burning vehicles un-burn, helicopters lift off backward. You are the only thing moving forward.

When you kill someone, the tape drops to PLAY and you become them. The rest of the battle keeps rewinding, now with you on the other side. Keep going until the tape reaches the moment your current body first arrived: dropped off by a helicopter, or carried in on an amphibious vehicle or hovercraft.

Inspired by the rewound bombing raid in *Slaughterhouse-Five*.

## Play
Open `index.html` (a single self-contained file), or enable GitHub Pages on `main` / root.

- **Desktop:** WASD, mouse, click to fire, right-click to aim, Shift sprint, C crouch, Space jump, R reload, P / Esc pause (sensitivity settings).
- **Touch (phone/iPad):** floating left stick, drag right side to look, FIRE (drag to aim while firing), AIM, DUCK, JUMP, RLD, pause. Light aim assist (toggle in pause).

Reversed bullets still hurt. The edges of the beach are mined.

## How it works
- `src/sim.js`: a deterministic forward simulation of the whole battle: about 330 invaders in six waves of AAVs and LCAC hovercraft, about 60 defenders from two helicopter insertions with M250 gunners, two invader gunships (one shot down into the bay), rocket artillery, naval guns, drone swarms, smoke screens, Javelin kills and burning houses. Recorded at 10 Hz.
- `src/playback.js`: renders the recording at any tape position `tau`. Every effect (tracers, impacts, smoke, explosions, wrecks) is a pure function of `tau`, so rewind, fast-forward and checkpoints all come for free.
- `src/post.js`: the Betamax signal chain (chroma smear, timebase wobble, search-noise bars, head-switching noise, dropouts) over a high-fidelity render.
- `src/audio.js`: all sound is synthesized. World sounds play reversed; your gun plays forward.

## Build
```
npm install
node build.mjs   # writes index.html (single file, three.js inlined)
```

## Sound credits

- **Wilhelm scream** — take 4 of the original 1951 session recording ("Man getting bit by an alligator, and he screams"), from the Sunset Editorial collection donated to USC Cinema; released under CC0 1.0 (public domain) by Craig Smith on Freesound, sound #675810: https://freesound.org/people/craigsmith/sounds/675810/ (licence page saved in `credits/`). One dying soldier per tape gets it, reversed.
- Everything else is synthesized in the browser and fitted to measurements of real recordings (`tools/sound-tuning/`).
