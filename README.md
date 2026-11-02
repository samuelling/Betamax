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

The title menu also lets you start from any recorded chapter: the beach, East Sandwich, The Bomb, The Jump, or the last tape at home (Cape Cod or Texas).

## How it works
- `src/sim.js`: a deterministic forward simulation of the whole battle: about 330 Texan troops in six waves of AAVs and LCAC hovercraft, about 60 Cape Cod defenders from two helicopter insertions with M250 gunners, two Texan gunships (one shot down into the bay), rocket artillery, naval guns, drone swarms, smoke screens, Javelin kills and burning houses. Recorded at 10 Hz.
- `src/playback.js`: renders the recording at any tape position `tau`. Every effect (tracers, impacts, smoke, explosions, wrecks) is a pure function of `tau`, so rewind, fast-forward and checkpoints all come for free.
- `src/post.js`: the Betamax signal chain (chroma smear, timebase wobble, search-noise bars, head-switching noise, dropouts) over a high-fidelity render.
- `src/audio.js`: all sound is synthesized. World sounds play reversed; your gun plays forward.

## The last tape

**Tape 2 — East Sandwich** (Cape Cod track). If you end the beach as one of the Cape Cod defenders, the next tape back is East Sandwich, the morning before: old Capes along Route 6A behind fieldstone walls, pitch pine woods to the south, the salt marsh to the north. It opens on the meadow by the marsh with the extraction helicopter on the grass and you a few steps from the door; in rewind it un-lands and leaves you there. From there the squad fights yard to yard back across 6A toward the woods, against Texan teams who come out of the houses they were hiding in, until the helicopter you came in on rises out of the clearing, un-burns, and the missile that brought it down goes back into the trees. You can still take any body you kill; ending the tape as a Texan puts you on the Texas track. (`?scene=sandwich` opens straight onto it.)

**Tape 3 — The Bomb** (Cape Cod track). If you end East Sandwich as one of the men who came down in the helicopter, the tape before that is the morning Boston was hit. It opens in a hayfield outside Hopkinton with two Black Hawks on the grass — one for the Cape, one out to the fleet — and a Texan technical still firing from the road as you climb in; behind everything, thirty-odd kilometres east, the cloud. In rewind you're pulled back into the bed of a commandeered pickup and the convoy runs backwards down Route 135 through the woods and the stone-walled pastures: the Texan trucks behind you un-crash, their SUV comes back together out of a fuel-tanker fire, your own station wagon lifts out of the trees, the sound of the blast passes back over you a minute and a half after the flash, and the cloud sinks into itself. On Main Street in Ashland you climb down from the truck, walk back across the common past the bandstand and the white church, and the light comes. You can take any body, theirs included, in any car. (`?scene=bomb` opens straight onto it.)

**The Jump** (tape 4 for the Cape Cod paratroopers, reached through the Texan staging port). The hold of a C-130 at a thousand feet over the Gulf at night, red light, two sticks of sixteen standing hooked up in front of open doors. It opens with the light green and you in the door. In rewind the men who went before you come back in out of the dark one by one, their static lines reeling in; the line shuffles back up the aisle; a flak burst outside the starboard skin un-happens and two men stand back up; the Hercules flying off your wing un-burns and climbs back out of the sea into formation; the doors come down; everyone sits. Tracer climbs in slow red strings past the doors, black bursts hang at your height and stream away behind, searchlights swing, and the coast of the port you are about to drop on burns under the horizon. (`?scene=jump` opens straight onto it.)

After the beach the game runs back through the soldier's story (Ashland State Park, and tapes 2–4 of the Texas track, are placeholders for now) to an ordinary afternoon at home — the one tape that plays forward. It's a civil war — the military has split in two: one faction is from Cape Cod, the other came up from Texas. Twelve kinds of home on each side, picked from the soldier's town — on the Cape, shingled cottages, a sea captain's house, saltboxes, a cranberry farmhouse, beach cottages and a cabin on a kettle pond; in Texas, a brick ranch in the Houston suburbs, a limestone house in the Hill Country, a farmhouse on the plains, a dogtrot in the piney woods, a Gulf cottage in Galveston, a stucco courtyard house in El Paso, a double-wide among the pumpjacks and a house on Lake Travis. The homes are drawn plainly, without the tape look: sun through the windows, curtains breathing, clouds crossing the sun, birds on the lawn. Whatever the soldier's card said on the beach — the pressed flower, the dog named Biscuit, the paperback read four times — is somewhere in the house. The kitchen radio reports the country coming apart while you do the chores, and jets go over once. Wash the dishes, read, play a game, cook, fold laundry, write a letter, feed the cat, water and weed the garden. At some point you'll want to put on a tape. Then the phone rings. Once it's over there's a bonus: play the same life forward.

Garden plants are grown with the plant art from [Shortwood Meadow](https://github.com/samuelling/shortwood-meadow).

## Weapons

Every body carries a real modern weapon and drops it where it falls; in rewind it lifts back into their hands. Defenders: SIG M7, SIG M250, HK416 A5, HK M110A1 CSASS, Benelli M1014, HK MP7A2, with a SIG M18 sidearm. Texan faction: IWI Tavor X95, IWI Negev NG7, HK416 A5, MP7A2, M1014, CSASS, with a Glock 17. Taking a body gives you its gun; you can swap it for anything lying in the sand, and you always keep the sidearm.

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
