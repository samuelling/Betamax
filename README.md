# BETAMAX

*A battle, in rewind.* Mayflower Beach, Dennis, Cape Cod. Dawn, low tide.

A modern amphibious invasion comes across the tidal flats and is met by a helicopter-inserted platoon on the dunes, and the whole thing plays on a VCR in reverse. Bullets fly back into their guns, the dead get up, burning vehicles un-burn, helicopters lift off backward. You are the only thing moving forward.

When you kill someone, the tape drops to PLAY and you become them. The rest of the battle keeps rewinding, now with you on the other side. Keep going until the tape reaches the moment your current body first arrived: dropped off by a helicopter, or carried in on an amphibious vehicle or hovercraft.

Inspired by the rewound bombing raid in *Slaughterhouse-Five*.

## Play
Open `index.html` (a single self-contained file), or enable GitHub Pages on `main` / root.

- **Desktop:** WASD, mouse, click to fire, right-click to aim, Shift sprint, C crouch, Space jump, R reload, 1 / 2 / X / mouse wheel to switch primary and sidearm, F or E to swap for a gun on the ground (and to use things at home; Q or Tab to stop), P / Esc pause (sensitivity settings).
- **Touch (phone/iPad):** floating left stick, drag right side to look, FIRE (drag to aim while firing), AIM, DUCK, JUMP, RLD, pause. Light aim assist (toggle in pause).

Reversed bullets still hurt. The edges of the beach are mined.

## How it works
- `src/sim.js`: a deterministic forward simulation of the whole battle: about 330 invaders in six waves of AAVs and LCAC hovercraft, about 60 defenders from two helicopter insertions with M250 gunners, two invader gunships (one shot down into the bay), rocket artillery, naval guns, drone swarms, smoke screens, Javelin kills and burning houses. Recorded at 10 Hz.
- `src/playback.js`: renders the recording at any tape position `tau`. Every effect (tracers, impacts, smoke, explosions, wrecks) is a pure function of `tau`, so rewind, fast-forward and checkpoints all come for free.
- `src/post.js`: the Betamax signal chain (chroma smear, timebase wobble, search-noise bars, head-switching noise, dropouts) over a high-fidelity render.
- `src/audio.js`: all sound is synthesized. World sounds play reversed; your gun plays forward.

## The last tape

After the beach the game runs back through the soldier's story (scenes 2–4 are placeholders for now) to an ordinary afternoon at home — the one tape that plays forward. Twelve kinds of home on each side, picked from the soldier's town: Cape Cod cottages, triple-deckers, colonials, farmhouses, beach cottages and a lake cabin around Massachusetts; dachas, log izbas, Khrushchyovka and Stalin-era flats, a Finnish house on the Karelian isthmus and a dacha by the Gulf around St. Petersburg. Wash the dishes, read, play a game, cook, fold laundry, write a letter, feed the cat, water and weed the garden. At some point you'll want to put on a tape. Then the phone rings. Once it's over there's a bonus: play the same life forward.

Garden plants are grown with the plant art from [Shortwood Meadow](https://github.com/samuelling/shortwood-meadow).

## Weapons

Every body carries a real modern weapon and drops it where it falls; in rewind it lifts back into their hands. Defenders: SIG M7, SIG M250, HK416 A5, HK M110A1 CSASS, Benelli M1014, HK MP7A2, with a SIG M18 sidearm. Invaders: IWI Tavor X95, IWI Negev NG7, HK416 A5, MP7A2, M1014, CSASS, with a Glock 17. Taking a body gives you its gun; you can swap it for anything lying in the sand, and you always keep the sidearm.

## Build
```
npm install
node build.mjs   # writes index.html (single file, three.js inlined)
```

## Sound credits

- **Betamax deck:** the tape insertion, threading and PLAY sounds are edited from "Sony Betamax Tape Insertion & Ejection Sounds" and "Sony Betamax Operating Sounds" by Daniel D. Teoli Jr. (Internet Archive, Public Domain Mark 1.0). The running transport loop is synthesized to the measured spectrum of the same recording.

- **Wilhelm scream** — take 4 of the original 1951 session recording ("Man getting bit by an alligator, and he screams"), from the Sunset Editorial collection donated to USC Cinema; released under CC0 1.0 (public domain) by Craig Smith on Freesound, sound #675810: https://freesound.org/people/craigsmith/sounds/675810/ (licence page saved in `credits/`). Up to three dying soldiers per tape get it (at least 40 s apart), alternating forward and reversed.
- Everything else is synthesized in the browser and fitted to measurements of real recordings (`tools/sound-tuning/`).

## Motion capture

- walk/run/idle: Mixamo, via the three.js Soldier.glb example.
- All `c_*` clips (walks, sprint, crouch/sneak, limps, idles): CMU Graphics Lab Motion Capture Database, mocap.cs.cmu.edu. "The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217." Converter in `tools/mocap/`.
