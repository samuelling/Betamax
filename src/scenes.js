// Which tape is in the deck. Terrain, layout and the simulation all ask this.
//   beach    — Mayflower Beach, Dennis (tape 1 played, scene 5 in the story)
//   sandwich — East Sandwich, the downed helicopter (scene 4, the Cape Cod track)
export const SC = { id: 'beach' };
const hooks = [];
export function onScene(fn) { hooks.push(fn); }
export function setScene(id) { if (SC.id === id) return; SC.id = id; for (const f of hooks) f(id); }
