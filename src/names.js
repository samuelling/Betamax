import { mulberry32 } from './rng.js';

const DEF_FIRST = ['Danny', 'Ruth', 'Marcus', 'Theo', 'Joanna', 'Eli', 'Owen', 'Teresa', 'Luis', 'Maggie', 'Cal', 'Nate', 'Rosa', 'Will', 'Frankie', 'Sam', 'Ike', 'June', 'Pete', 'Dee', 'Kofi', 'Hank', 'Mae', 'Tommy', 'Ana', 'Gus', 'Wes', 'Lena'];
const DEF_LAST = ['Hale', 'Costa', 'Nickerson', 'Doane', 'Snow', 'Atwood', 'Pina', 'Mayo', 'Rich', 'Sears', 'Okafor', 'Ryder', 'Kelley', 'Freeman', 'Souza', 'Burke', 'Nguyen', 'Crowell', 'Baker', 'Lopes', 'Higgins', 'Walsh', 'Brennan', 'Eldredge'];
const DEF_TOWN = ['Wellfleet', 'Truro', 'Chatham', 'Eastham', 'Orleans', 'Brewster', 'Harwich', 'Dennis', 'Yarmouth', 'Hyannis', 'Barnstable', 'Falmouth', 'Woods Hole', 'Mashpee', 'Sandwich', 'Bourne', 'Provincetown', 'Osterville', 'Cotuit'];
const DEF_RANK = ['PVT', 'PFC', 'SPC', 'CPL', 'SGT'];

// a civil war: the other side came up from Texas — names and towns from across the state
const INV_FIRST_M = ['Cody', 'Travis', 'Wyatt', 'Colt', 'Jesse', 'Luis', 'Javier', 'Darnell', 'Brandon', 'Kyle', 'Dustin', 'Ty', 'Ray', 'Hector', 'Garrett', 'Caleb', 'Tomas', 'Bo', 'Reggie', 'Mateo'];
const INV_FIRST_F = ['Shelby', 'Kayla', 'Maria', 'Brittany', 'Tasha', 'Lupe', 'Amber', 'Savannah', 'Jolene', 'Destiny'];
const INV_LAST = ['Garza', 'Hernandez', 'Pruitt', 'Dawson', 'Trevino', 'McKinney', 'Briscoe', 'Hollis', 'Cantu', 'Whitaker', 'Gonzales', 'Boone', 'Tate', 'Rios', 'Haskins', 'Villarreal', 'Peebles', 'Odom', 'Sandoval', 'Kimbrough', 'Lott', 'Navarro', 'Shelton', 'Washington'];
const INV_TOWN = ['Lubbock', 'Amarillo', 'Abilene', 'Odessa', 'Midland', 'San Angelo', 'Beaumont', 'Waco', 'Tyler', 'Nacogdoches', 'Lufkin', 'Fredericksburg', 'Kerrville', 'Galveston', 'Corpus Christi', 'Laredo', 'El Paso', 'San Antonio', 'Austin', 'Round Rock', 'Plano', 'Katy', 'Pasadena', 'Conroe', 'Marble Falls', 'Brownsville'];
const INV_RANK = ['PVT', 'PFC', 'SPC', 'CPL', 'SGT'];
export const FEMALE = new Set(['Ruth', 'Joanna', 'Teresa', 'Maggie', 'Rosa', 'June', 'Dee', 'Mae', 'Ana', 'Lena', ...INV_FIRST_F]);

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
  'Had never seen this ocean before this week.',
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
  'Wanted to see snow, just once.',
  'Fixed radios. Could fix anything with a hum.',
];

export function makeIdentity(side, idx) {
  const r = mulberry32(9001 + idx * 131 + side * 7);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const age = 18 + Math.floor(r() * r() * 17);
  const life = LIVES[(idx * 7 + side * 3 + Math.floor(r() * 5)) % LIVES.length];
  if (side === 0) {
    const first = pick(DEF_FIRST);
    return { rank: pick(DEF_RANK), first, last: pick(DEF_LAST), town: pick(DEF_TOWN) + ', MA', age, life, fem: FEMALE.has(first) };
  }
  const fem = r() < 0.18, first = pick(fem ? INV_FIRST_F : INV_FIRST_M), last = pick(INV_LAST);
  return { rank: pick(INV_RANK), first, last, town: pick(INV_TOWN) + ', TX', age, life, fem };
}
