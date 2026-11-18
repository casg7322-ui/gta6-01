// SOLARA BAY — an original open-world crime game, built for gta6-01.
// All names, places, characters and art in this file are invented here.
// Nothing is taken from Rockstar Games or any other commercial game.
export const WORLD_W = 3840;
export const WORLD_H = 3072;
export const PITCH = 384; // distance between road centrelines
export const ROAD_W = 96;
export const COLS = 10; // blocks across
export const ROWS = 8; // blocks down
export const STEP = 1 / 60; // fixed simulation step

export const GAME_NAME = 'SOLARA BAY';
export const GAME_TAGLINE = 'Sun. Salt. Second chances.';
export const SAVE_KEY = 'solara-bay-save-v1';
export const BEST_KEY = 'solara-bay-best-v1';

export const PLAYER = {
  radius: 14,
  walkSpeed: 230,
  runSpeed: 300,
  health: 100,
  startMoney: 250,
  startAmmo: 48,
};

export const CAR = {
  length: 54,
  width: 26,
  radius: 20,
  accel: 420,
  brake: 700,
  reverseAccel: 260,
  maxSpeed: 540,
  maxReverse: 180,
  turnRate: 2.6, // rad/s at full lock, scaled by speed
  drag: 0.55,
  health: 100,
};

export const WANTED_MAX = 5;
export const COP = { carSpeed: 330, footSpeed: 250, ramDamage: 6, touchDamage: 12 };

export const SCREENS = {
  TITLE: 'title',
  PLAY: 'play',
  PAUSED: 'paused',
  OVER: 'over', // wasted
  BUSTED: 'busted',
  COMPLETE: 'complete', // story finished
};

export const EVENTS = {
  NONE: 0,
  MISSION_COMPLETE: 1,
  WIN: 2,
  WASTED: 4,
  BUSTED: 8,
  WANTED_UP: 16,
  WANTED_DOWN: 32,
  SHOT: 64,
  CRASH: 128,
};

// Sun-soaked coastal palette: warm sand, teal sea, terracotta roofs.
export const COLORS = {
  grass: '#7fae62',
  park: '#6da055',
  sand: '#e8cf9a',
  sea: '#2e8fa8',
  seaDeep: '#1f6f88',
  road: '#3a3f47',
  roadEdge: '#2c3038',
  lane: '#d8c56a',
  sidewalk: '#b9b3a4',
  buildingRoof: ['#c96f4a', '#d9a05b', '#8a6f8e', '#5b7d8a', '#a8513f', '#7d8a5b', '#946b4a'],
  buildingEdge: '#00000033',
  plaza: '#cbb98f',
  tree: '#3f7a3a',
  treeDark: '#2f5c2c',
  player: '#ffd23f',
  cop: '#2b4acb',
  copLight: '#ff3b30',
  hudBg: 'rgba(12, 16, 24, 0.72)',
  hudText: '#f5efe0',
  accent: '#ff9f1c',
  accent2: '#2ec4b6',
};

export const DISTRICTS = [
  { name: 'Old Town', x0: 0, y0: 0, x1: 1536, y1: 1536 },
  { name: 'Downtown', x0: 1536, y0: 0, x1: 2688, y1: 1536 },
  { name: 'Marina', x0: 2688, y0: 0, x1: 3840, y1: 1536 },
  { name: 'Harbor', x0: 0, y0: 1536, x1: 1920, y1: 3072 },
  { name: 'South Beach', x0: 1920, y0: 1536, x1: 3840, y1: 3072 },
];

export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d.name;
  }
  return 'Solara Bay';
}
