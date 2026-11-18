// The story of Solara Bay: five jobs from Sal Marin, the fixer who runs the
// night market. All names, places and dialogue are original.
import { PLACES } from './city.js';

export const MISSIONS = [
  {
    id: 'first-wheels',
    title: 'First Wheels',
    reward: 150,
    briefing: 'Sal: "Mara, you walk everywhere in this town. Fix that. Take any car — any car — and bring it to my paint shop. Don\'t ask whose it is."',
    steps: [
      { type: 'steal-car', text: 'Steal any car (walk up to one and press E)' },
      { type: 'goto', place: 'paintShop', text: 'Drive it to the Paint Shop', radius: 90 },
    ],
  },
  {
    id: 'the-delivery',
    title: 'The Delivery',
    reward: 300,
    briefing: 'Sal: "Package for the Marina. No questions, no stops, no cops. Ninety seconds — the boat does not wait for slow drivers."',
    steps: [
      { type: 'goto-timed', place: 'marina', time: 90, text: 'Deliver the package to the Marina (90s)' },
    ],
  },
  {
    id: 'heat-wave',
    title: 'Heat Wave',
    reward: 450,
    briefing: 'Sal: "You were seen. Two stars and climbing. Get to the safehouse and stay out of sight — the heat dies down when nobody can see you."',
    steps: [
      { type: 'lose-wanted', place: 'safehouse', text: 'Reach the Safehouse and lose the heat', radius: 110 },
    ],
  },
  {
    id: 'the-getaway',
    title: 'The Getaway',
    reward: 600,
    briefing: 'Sal: "The crew needs a driver for tonight. Prove it: hit the Plaza, the Market, then the Marina — in that order — inside two minutes."',
    steps: [
      { type: 'checkpoints', places: ['plaza', 'market', 'marina'], time: 120, text: 'Hit the checkpoints in order: Plaza, Market, Marina (120s)' },
    ],
  },
  {
    id: 'king-of-solara',
    title: 'King of Solara',
    reward: 1000,
    briefing: 'Sal: "Last one. Pick up the crate at the Docks — the whole harbor will be watching — then bring it to the Penthouse. Do this and you run this town."',
    steps: [
      { type: 'goto', place: 'docks', text: 'Pick up the crate at the Docks', radius: 90 },
      { type: 'goto', place: 'penthouse', text: 'Deliver the crate to the Penthouse — the police are coming', radius: 90, wantedOnEnter: 3 },
    ],
  },
];

export function missionByIndex(i) {
  return MISSIONS[i] ?? null;
}

export function placeOf(step) {
  return step.place ? PLACES[step.place] : null;
}

export function placeList(step) {
  return (step.places ?? []).map((key) => PLACES[key]);
}
