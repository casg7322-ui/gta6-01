// Solara Bay — shared constants: city size, palette, tuning, landmarks.
// Every system reads from here so the whole game stays in one balance pass.

export const WORLD = {
  width: 3840,
  height: 3072,
  cols: 10, // blocks across
  rows: 8, // blocks down
  block: 384, // road spacing in px
  roadHalf: 46, // half the road width
  sidewalk: 26, // sidewalk band outside the road edge
};

// Sun-soaked coastal palette: warm neutrals, one gold accent.
export const PALETTE = {
  ground: '#e7dcc3',
  groundAlt: '#dfd2b2',
  road: '#4a4238',
  roadEdge: '#6b6152',
  roadLine: '#e8d98a',
  sidewalk: '#cfc0a0',
  sand: '#f4dfa8',
  water: '#62b8cc',
  waterDeep: '#3f93ad',
  park: '#8fbf6f',
  parkDark: '#6da354',
  building: ['#f0e3c8', '#e5b49a', '#d9a441', '#b3c4a4', '#a9c3d4', '#d8cbb2', '#e8cfa0', '#c9a6a0'],
  roof: ['#b8543f', '#8a6f4d', '#5d7a5a', '#4f6b7a', '#a8763e', '#7a5a6e'],
  gold: '#f2b705',
  goldDark: '#c78f04',
  ink: '#241f18',
  paper: '#fbf6e9',
  hudGlass: 'rgba(24, 20, 14, 0.62)',
  hudEdge: 'rgba(242, 183, 5, 0.55)',
  police: '#2b4fd8',
  policeLight: '#ff3b30',
};

export const DISTRICTS = [
  { name: 'Old Town', x0: 0, y0: 0, x1: 1536, y1: 1536, tint: '#e9d9b8' },
  { name: 'Downtown', x0: 1536, y0: 0, x1: 2688, y1: 1536, tint: '#e3d3ac' },
  { name: 'Marina', x0: 2688, y0: 0, x1: 3840, y1: 1536, tint: '#d9e2c8' },
  { name: 'Harbor', x0: 2688, y0: 1536, x1: 3840, y1: 3072, tint: '#e0cda6' },
  { name: 'South Beach', x0: 0, y0: 1536, x1: 2688, y1: 3072, tint: '#f0dfae' },
];

// Landmarks sit on inner intersections so every driver can reach them by road.
export const LANDMARKS = {
  safehouse: { x: 768, y: 2304, label: 'Safehouse', sub: 'Mara\u2019s flat' },
  docks: { x: 3072, y: 2304, label: 'The Docks', sub: 'Harbor cranes' },
  penthouse: { x: 3072, y: 768, label: 'Penthouse', sub: 'Marina tower' },
  market: { x: 768, y: 768, label: 'Night Market', sub: 'Old Town stalls' },
  dropoff: { x: 1920, y: 1536, label: 'Drop-off', sub: 'Sal\u2019s garage' },
  checkpoint: { x: 2688, y: 1152, label: 'Checkpoint', sub: 'Downtown east' },
  getaway: { x: 3072, y: 2688, label: 'Harbor Overlook', sub: 'South pier' },
};

export const TUNING = {
  walkSpeed: 175,
  runSpeed: 268,
  carAccel: 430,
  carReverseAccel: 300,
  carMaxSpeed: 540,
  carMaxReverse: 190,
  carTurn: 2.5, // rad/s at full steer
  carMinTurnFactor: 0.35, // cars still steer when slow (U-turns stay possible)
  carDrag: 0.55,
  carBrake: 620,
  trafficSpeed: 185,
  policeSpeed: 565,
  copRunSpeed: 245,
  pedSpeed: 62,
  pedFleeSpeed: 190,
  bulletSpeed: 900,
  bulletRange: 520,
  fireInterval: 0.24,
  playerRadius: 11,
  carRadius: 24,
  enterRadius: 54, // press E inside this to get in a car
  walkArrive: 16, // autopilot walk target radius (smaller than enterRadius)
  carArrive: 74,
  waypointRadius: 46,
  safehouseRadius: 260,
  heatStealOccupied: 22,
  heatStealPolice: 45,
  heatShot: 8,
  heatKillPed: 26,
  heatRamPolice: 14,
  heatDecayUnseen: 2.4,
  heatDecaySafehouse: 9,
  heatPerStar: 20,
  maxStars: 5,
  bustDistance: 26,
  bustTime: 1.2,
  respawnCashCut: 0.15,
  hpRegenDelay: 6,
  hpRegenRate: 3,
};

export const SAVE_KEY = 'solara-bay-save-v1';
export const START_CASH = 150;
