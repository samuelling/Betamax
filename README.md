# BETAMAX

*A battle, in rewind.* Mayflower Beach, Dennis, Cape Cod. Dawn, low tide.

A modern amphibious invasion comes across the tidal flats and is met by a helicopter-inserted platoon on the dunes, and the whole thing plays on a VCR in reverse. Bullets fly back into their guns, the dead get up, burning vehicles un-burn, helicopters lift off backward. You are the only thing moving forward.

When you kill someone, the tape drops to PLAY and you become them. The rest of the battle keeps rewinding, now with you on the other side. Keep going until the tape reaches the moment your current body first arrived: dropped off by a helicopter, or carried in on an amphibious vehicle or hovercraft.

Inspired by the rewound bombing raid in *Slaughterhouse-Five*.

## Play
Open `index.html` (a single self-contained file), or enable GitHub Pages on `main` / root.

- **Desktop:** WASD, mouse, click to fire, right-click to aim, Shift sprint, C crouch, Space jump, R reload, 1 / 2 / X / mouse wheel to switch primary and sidearm, F or E to swap for a gun on the ground (and to use things at home; Q or Tab to stop), T double-speed rewind, V slow, P / Esc pause (sensitivity settings, VCR filter on/off).
- **Touch (phone/iPad):** floating left stick, drag right side to look, FIRE (drag to aim while firing), AIM, DUCK, JUMP, RLD, ×2, SLOW, pause. Light aim assist (toggle in pause).

Reversed bullets still hurt, and every one is tracer you can see. The edges of the beach are mined.

### The look
Cel-shaded after the sister game *Ashland*:
- Every surface takes its light in Ashland's four hard bands.
- Outlines are a darker, plummier tint of whatever they outline, not black. Guns and vehicles get Ashland's constant-width hull outline, and guns get their own studio key light and a hard highlight band, so they read in any light.
- It's the last day of October, so the oaks and maples are red, orange and gold against dark pines.
- The VHS signal chain still sits on top.

### Who's who
- **Cape Cod** wears Atlantic blue-greys with blue ID tape (helmet band, upper arms, a patch front and back) and is outlined in blue ink.
- **Texas** wears coyote tan with red tape and is outlined in red. The coloured outline holds at any distance.
- Vehicles carry the same ink: blue for the Cape's helicopters, Hercules and commandeered cars; red for Texas's landing craft, gunships, ship and technicals.

### Playing the tape, not watching it
- **Catch your rounds.** Every round your body fired comes back out of whatever it hit and flies home to your gun. A diamond marks where each one landed, with a ring closing on the moment it leaves. Have your sights on it when it goes and it's back in the magazine, with the gun sound reversed. Rounds fired at someone you killed are marked KILL; catch those and they stand up clean.
- **Tracking: SP / LP / EP.** The tape speed in the corner shows how well you're keeping your past. Caught rounds raise it; dropped rounds, and wandering more than about 30 m from where your body was, lower it. In SP the tape protects you: anything your past survived, ordnance and stray rounds alike, passes you by as long as you stand where it stood. At **EP** the people on the tape can see you. The other side turns and shoots at you, live and off script, until you get your tracking back. At zero the tape snaps and you go back to the last body you took.
- **Slow (V, or SLOW on touch).** Caught rounds and clean sub-battles charge the VCR's slow. The tape crawls at 0.3× and you don't.
- **Take a body.** Kill anyone and you become them (friendly fire included). Bodies near you that are still in the thick of a fight are marked ◆ TAKE. Taking one is how you get from a quiet stretch to the next fight.
- **Sub-battles.** Each body's window is cut, from the recording, into the fights it was in (THE CREST, THE BOX YARD, THE FLIGHT DECK…), with the lulls between them. A sub-battle where you catch 70% of your rounds is CLEAN, and pays out full health and slow. Lulls skim by themselves at ×2, or ×3 if the wait is a long one, and drop back to ×1 on contact. **T** (or ×2 on touch) runs the whole tape at double-speed rewind.
- Each tape gets a grade at the end, SP, LP or EP, from your tracking and the share of rounds you caught.

The title menu also lets you start from any recorded chapter: the beach, East Sandwich, The Bomb, The Jump, or the last tape at home (Cape Cod or Texas).

## How it works
- `src/sim.js`: a deterministic forward simulation of the whole battle: about 330 Texan troops in six waves of AAVs and LCAC hovercraft, about 60 Cape Cod defenders from two helicopter insertions with M250 gunners, two Texan gunships (one shot down into the bay), rocket artillery, naval guns, drone swarms, smoke screens, Javelin kills and burning houses. Recorded at 10 Hz.
- `src/playback.js`: renders the recording at any tape position `tau`. Every effect (tracers, impacts, smoke, explosions, wrecks) is a pure function of `tau`, so rewind, fast-forward and checkpoints all come for free.
- `src/post.js`: the Betamax signal chain (chroma smear, timebase wobble, search-noise bars, head-switching noise, dropouts) over a high-fidelity render.
- `src/audio.js`: all sound is synthesized. World sounds play reversed; your gun plays forward.

## The last tape

**Tape 2 — East Sandwich** (Cape Cod track). If you end the beach as one of the Cape Cod defenders, the next tape back is East Sandwich, the morning before: old Capes along Route 6A behind fieldstone walls, pitch pine woods to the south, the salt marsh to the north. It opens on the meadow by the marsh with the extraction helicopter on the grass and you a few steps from the door; in rewind it un-lands and leaves you there. From there the squad fights yard to yard back across 6A toward the woods, against Texan teams who come out of the houses they were hiding in, until the helicopter you came in on rises out of the clearing, un-burns, and the missile that brought it down goes back into the trees. You can still take any body you kill; ending the tape as a Texan puts you on the Texas track. (`?scene=sandwich` opens straight onto it.)

**Tape 3 — The Bomb** (Cape Cod track). *How it plays:* every pickup on the road is a technical with a .50 on a post in the bed, and on the Cape's truck that gun is yours. A strip along the top of the screen shows the road from Ashland to the hayfield: your truck, the Cape's cars in blue, the Texans' in red. It makes clear that you were running west and they were chasing, while the tape carries everyone back east. Three of the Texan wrecks are yours. As the tape reaches each one it slows by itself, and your rounds come back out of the burning car. Catch them and the car un-crashes and falls in behind you again. Take a Texan gunner and you're on their .50, firing at the convoy you just left. The Cape's cars carry a white anchor on blue; the Texans' are coyote tan with a white lone star on red. If you end East Sandwich as one of the men who came down in the helicopter, the tape before that is the morning Boston was hit. It opens in a hayfield outside Hopkinton with two Black Hawks on the grass — one for the Cape, one out to the fleet — and a Texan technical still firing from the road as you climb in; behind everything, thirty-odd kilometres east, the cloud. In rewind you're pulled back into the bed of a commandeered pickup and the convoy runs backwards down Route 135 through the woods and the stone-walled pastures: the Texan trucks behind you un-crash, their SUV comes back together out of a fuel-tanker fire, your own station wagon lifts out of the trees, the sound of the blast passes back over you a minute and a half after the flash, and the cloud sinks into itself. On Main Street in Ashland you climb down from the truck, walk back across the common past the bandstand and the white church, and the light comes. You can take any body, theirs included, in any car. (`?scene=bomb` opens straight onto it.)

**The Jump** (tape 4 for the Cape Cod paratroopers). It opens on the ground in the port's container yard, where you came down, your spent canopy beside you. In rewind you lift off the concrete and the canopy fills above you. Then you rise for nearly a minute back up through the night, with stick-mates hanging around you. Green AA tracer climbs past you in streams, and 40 mm flak bursts at your height and collapses back into points of light. Rifles in the yard fire up at you, and below you the grain elevator stands back up out of its dust. You can shoot back down, and catch your own rounds as they climb out of the yard and into your rifle. Kill an AA gunner and you're on the ground as a Texan. Near the top the canopy pulls back into its pack and you fly up to the Hercules's door. The tape cuts inside: the hold at a thousand feet, red light, two sticks of sixteen standing hooked up. The men who went before you come back in out of the dark; the line shuffles back up the aisle; a flak burst outside the starboard skin un-happens; the Hercules on your wing un-burns and climbs back into formation; the doors come down; everyone sits. (`?scene=jump` opens on the hold alone.)

**The Night Before** (Texas tape 2). If you end the beach as a Texan, the tape before is the night aboard the "7", the assault ship they came off in their AAVs and hovercraft. It opens in the well deck as the last man climbs into an AAV. In rewind a Cape Cod boarding team comes back up the stair from the boats, and you go back up after them with three others: the sortie your section made to the flight deck, under illumination flares, with the destroyer burning on the beam. Then you come back down the stair into the well deck under the amber beacons of general quarters. The fight across the flight deck un-happens, their Black Hawk climbs back out of the sea onto its ropes, and the destroyer on the starboard beam rises from the water in two halves, closes up, and its magazine un-explodes. The boarding team came out to the fleet in The Bomb's second helicopter; the company came aboard at the port.

**The Port** (Texas tape 3). Corpus Christi, at night: the wharf under sodium high-masts, the container yard, the assault ship alongside with its gangway lit, the refinery burning across the channel. It opens at the top of the gangway. In rewind your section's night runs backward: holding the gangway, falling back through the yard, and the push into the stacked containers where the paratroopers came down. Meanwhile the port authority tower, the grain elevator and a ship-to-shore crane come back up out of their own rubble and dust, and Cape Cod paratroopers rise back into the sky through the tracer under their canopies — take one and you go back up with it, to The Jump.

Big buildings come down — and in rewind go back up — with every piece flying, tumbling and landing on its own rubble heap, and the dust surge rolling out and sucked back in: a resort hotel up the beach to the east; one of the two 150 m chimneys of the power station by the canal, seen across the marsh from East Sandwich; the Telechron clock factory on Main Street in Ashland in The Bomb; the tower, the grain elevator and the crane at the port; and the radio mast at the Texan camp in Ashland.

The small things run backward too.
- Casings lie where they fell, then leap off the ground back into the rifles as the tape reaches each shot.
- Each footfall's puff of sand or dust gathers back in under the boot.
- Gulls and crows fly backward over the daytime tapes.
- Autumn leaves lift off the ground and flutter back up onto their branches.
- Smoke from the morning wood stoves sinks back down the chimneys.
- On Ashland's reservoir, the beach's water and the port's channel, rings close in on a point. On the lake a fish leaps out of the middle of them, tail first, back to where it jumped from.

A waypoint marker shows where your current body came from, a few seconds back along the path it actually took, then its arrival point.

**Ashland State Park** (tape 4 on both tracks). First light over the reservoir, mist on the water, hammocks still strung between the pines above the beach. The Bomb's scouts came out of these woods; its Texans, and the Port's, came out of the camps hidden in them. In rewind the camp's radio mast stands back up and the fuel bladder un-burns, the firefight in the trees un-happens, the sleepers go back into their tents, and the scouts walk backwards up the shore path to the pickup they came in.

After the beach the game runs back through the soldier's story, one tape further back each time, to an ordinary afternoon at home to an ordinary afternoon at home — the one tape that plays forward. It's a civil war — the military has split in two: one faction is from Cape Cod, the other came up from Texas. Twelve kinds of home on each side, picked from the soldier's town — on the Cape, shingled cottages, a sea captain's house, saltboxes, a cranberry farmhouse, beach cottages and a cabin on a kettle pond; in Texas, a brick ranch in the Houston suburbs, a limestone house in the Hill Country, a farmhouse on the plains, a dogtrot in the piney woods, a Gulf cottage in Galveston, a stucco courtyard house in El Paso, a double-wide among the pumpjacks and a house on Lake Travis. The homes are drawn plainly, without the tape look: sun through the windows, curtains breathing, clouds crossing the sun, birds on the lawn. Whatever the soldier's card said on the beach — the pressed flower, the dog named Biscuit, the paperback read four times — is somewhere in the house. The kitchen radio reports the country coming apart while you do the chores, and jets go over once. Wash the dishes, read, play a game, cook, fold laundry, write a letter, feed the cat, water and weed the garden. At some point you'll want to put on a tape. Then the phone rings. Once it's over there's a bonus: play the same life forward.

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
