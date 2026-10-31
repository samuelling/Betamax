import { mulberry32 } from './rng.js';

const DEF_FIRST = ['Danny', 'Ruth', 'Marcus', 'Theo', 'Joanna', 'Eli', 'Owen', 'Teresa', 'Luis', 'Maggie', 'Cal', 'Nate', 'Rosa', 'Will', 'Frankie', 'Sam', 'Ike', 'June', 'Pete', 'Dee', 'Kofi', 'Hank', 'Mae', 'Tommy', 'Ana', 'Gus', 'Wes', 'Lena'];
const DEF_LAST = ['Hale', 'Costa', 'Nickerson', 'Doane', 'Snow', 'Atwood', 'Pina', 'Mayo', 'Rich', 'Sears', 'Okafor', 'Ryder', 'Kelley', 'Freeman', 'Souza', 'Burke', 'Nguyen', 'Crowell', 'Baker', 'Lopes', 'Higgins', 'Walsh', 'Brennan', 'Eldredge'];
const DEF_TOWN = ['Wellfleet', 'Truro', 'Chatham', 'Eastham', 'Brockton', 'Worcester', 'Lowell', 'Falmouth', 'Fall River', 'New Bedford', 'Provincetown', 'Hyannis', 'Dorchester', 'Quincy', 'Orleans', 'Somerville', 'Watertown', 'Pittsfield'];
const DEF_RANK = ['PVT', 'PFC', 'SPC', 'CPL', 'SGT'];

const INV_FIRST = ['Ilsar', 'Tavin', 'Oresh', 'Kael', 'Vardo', 'Emric', 'Lusk', 'Anzo', 'Teiv', 'Moro', 'Halvic', 'Sela', 'Brann', 'Odrin', 'Yeva', 'Corin', 'Davor', 'Esk', 'Riv', 'Mattis', 'Ulo', 'Pell', 'Noor', 'Zarek', 'Ines', 'Garo'];
const INV_PRE = ['Dr', 'V', 'Ors', 'K', 'T', 'Br', 'Hal', 'Mer', 'Z', 'Esk', 'Sor', 'Ven', 'Gal', 'Ruv'];
const INV_VOW = ['a', 'e', 'o', 'i', 'u', 'ae'];
const INV_SUF = ['mm', 'sk', 'lenk', 'var', 'rin', 'tov', 'dek', 'nar', 'sel', 'lov', 'mir', 'ech'];
const INV_TOWN = ['Vessa', 'Ordun', 'Low Marrow', 'Saint Ilse', 'Brennick', 'Varr', 'Tolven', 'Hasp', 'Kael Harbor', 'Esmer', 'Drovna', 'Old Calder'];
const INV_RANK = ['RFN', 'RFN', 'LCP', 'CPL', 'SGT'];

const LIVES = [
  'Wrote to a sister every Sunday.',
  'Could name every star over home.',
  'Was saving for a fishing boat.',
  'Learned to swim at nine, in cold water.',
  'Had a daughter, not yet met.',
  'Carried a photo of a dog named Biscuit.',
  'Wanted to be a carpenter, like a father before.',
  'Sang badly and often.',
  'Kept a pressed flower inside the helmet.',
  'Had never seen the ocean before this week.',
  'Promised to be home for the harvest.',
  'Was afraid of the dark. Still is.',
  'Counted things when nervous. Counting now.',
  'Had a terrible laugh that made everyone else laugh.',
  'Missed the smell of the bakery downstairs.',
  'Was nineteen and felt forty.',
  'Drew birds in the margins of everything.',
  'Was going to propose at the new year.',
  'Had read the same paperback four times.',
  'Best chess player in the company.',
  'Had a scar from a bicycle, age six.',
  'Could not really see without glasses. Told no one.',
  'Knew every word to a song nobody else liked.',
  'Was the first in the family to finish school.',
  'Owed a friend money and meant to pay it back.',
  'Taught a little brother to ride a bike last spring.',
  'Liked mornings exactly like this one, before.',
  'Had a garden going back home. Tomatoes.',
  'Wanted to see snow in a city, just once.',
  'Fixed radios. Could fix anything with a hum.',
];

export function makeIdentity(side, idx) {
  const r = mulberry32(9001 + idx * 131 + side * 7);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const age = 18 + Math.floor(r() * r() * 17);
  const life = LIVES[(idx * 7 + side * 3 + Math.floor(r() * 5)) % LIVES.length];
  if (side === 0) {
    return { rank: pick(DEF_RANK), first: pick(DEF_FIRST), last: pick(DEF_LAST), town: pick(DEF_TOWN) + ', MA', age, life };
  }
  const last = pick(INV_PRE) + pick(INV_VOW) + pick(INV_SUF);
  return { rank: pick(INV_RANK), first: pick(INV_FIRST), last: last[0].toUpperCase() + last.slice(1), town: pick(INV_TOWN), age, life };
}
