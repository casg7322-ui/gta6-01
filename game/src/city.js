// City generation for Solara Bay: a road grid, blocks of buildings and parks,
// a beach along the south edge, a marina in the north-east, and the road
// graph the traffic, police and autopilot all drive on.
//
// The graph uses ONLY inner intersections (1..cols-1, 1..rows-1). The outer
// ring roads sit half off the map, so routing through them grinds cars into
// the world edge forever.

import { DISTRICTS, LANDMARKS, PALETTE, WORLD } from './config.js';
import { makeRng } from './random.js';

const { cols, rows, block, width, height } = WORLD;

function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d;
  }
  return DISTRICTS[0];
}

export function nodeId(i, j) {
  return `${i},${j}`;
}

export function nodePos(i, j) {
  return { x: i * block, y: j * block };
}

// Nearest inner intersection to a world point.
export function nearestNode(x, y) {
  const i = Math.max(1, Math.min(cols - 1, Math.round(x / block)));
  const j = Math.max(1, Math.min(rows - 1, Math.round(y / block)));
  return { i, j };
}

// Breadth-first route over inner intersections. Returns a list of world
// points (road centres) from the start node to the goal node, inclusive.
export function findRoute(city, fromX, fromY, toX, toY) {
  const start = nearestNode(fromX, fromY);
  const goal = nearestNode(toX, toY);
  const startKey = nodeId(start.i, start.j);
  const goalKey = nodeId(goal.i, goal.j);
  if (startKey === goalKey) return [nodePos(goal.i, goal.j)];
  const prev = new Map();
  const queue = [startKey];
  prev.set(startKey, null);
  while (queue.length > 0) {
    const key = queue.shift();
    if (key === goalKey) break;
    const [ci, cj] = key.split(',').map(Number);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = ci + di;
      const nj = cj + dj;
      if (ni < 1 || ni > cols - 1 || nj < 1 || nj > rows - 1) continue;
      const nk = nodeId(ni, nj);
      if (prev.has(nk)) continue;
      prev.set(nk, key);
      queue.push(nk);
    }
  }
  if (!prev.has(goalKey)) return [nodePos(goal.i, goal.j)];
  const path = [];
  let key = goalKey;
  while (key !== null) {
    const [pi, pj] = key.split(',').map(Number);
    path.push(nodePos(pi, pj));
    key = prev.get(key);
  }
  path.reverse();
  return path;
}

export function generateCity(seed) {
  const rng = makeRng(seed);
  const buildings = [];
  const parks = [];
  const trees = [];
  const waters = [];

  // Marina water: the north-east corner blocks are open water with docks.
  const marinaBlocks = new Set(['8,0', '9,0', '9,1']);
  // South Beach: the bottom row of blocks is sand, no buildings.
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const key = `${c},${r}`;
      const bx = c * block;
      const by = r * block;
      const inner = 74; // inset from the road edge
      if (marinaBlocks.has(key)) {
        waters.push({ x: bx + 8, y: by + 8, w: block - 16, h: block - 16 });
        continue;
      }
      if (r === rows - 1 && c < 7) {
        // Beach strip: palms only, the sand is drawn by the renderer.
        const palms = rng.int(2, 5);
        for (let p = 0; p < palms; p++) {
          trees.push({ x: bx + rng.range(60, block - 60), y: by + rng.range(90, block - 40), palm: true });
        }
        continue;
      }
      if (rng.chance(0.16)) {
        parks.push({ x: bx + inner - 18, y: by + inner - 18, w: block - 2 * (inner - 18), h: block - 2 * (inner - 18) });
        const count = rng.int(4, 8);
        for (let p = 0; p < count; p++) {
          trees.push({ x: bx + rng.range(inner, block - inner), y: by + rng.range(inner, block - inner), palm: false });
        }
        continue;
      }
      // A block holds one big building or a pair of smaller ones.
      const twin = rng.chance(0.45);
      const spots = twin
        ? [
            { x: bx + inner, y: by + inner, w: block - 2 * inner, h: (block - 2 * inner) / 2 - 14 },
            { x: bx + inner, y: by + inner + (block - 2 * inner) / 2 + 14, w: block - 2 * inner, h: (block - 2 * inner) / 2 - 14 },
          ]
        : [{ x: bx + inner, y: by + inner, w: block - 2 * inner, h: block - 2 * inner }];
      for (const s of spots) {
        const tall = districtAt(bx + block / 2, by + block / 2).name === 'Downtown' && rng.chance(0.5);
        buildings.push({
          x: s.x,
          y: s.y,
          w: s.w,
          h: s.h,
          color: rng.pick(PALETTE.building),
          roof: rng.pick(PALETTE.roof),
          tall,
          floors: tall ? rng.int(6, 12) : rng.int(1, 3),
        });
      }
      if (rng.chance(0.5)) {
        trees.push({ x: bx + rng.range(inner, block - inner), y: by + rng.range(inner, block - inner), palm: rng.chance(0.3) });
      }
    }
  }

  // Landmark footprints: clear buildings near landmarks so their plazas read.
  const landmarks = {};
  for (const [name, lm] of Object.entries(LANDMARKS)) {
    landmarks[name] = { ...lm };
  }

  return {
    seed,
    buildings,
    parks,
    trees,
    waters,
    landmarks,
    districtAt,
    // Road centre lines, for the renderer and the minimap.
    verticalRoads: Array.from({ length: cols + 1 }, (_, i) => i * block),
    horizontalRoads: Array.from({ length: rows + 1 }, (_, j) => j * block),
  };
}

// Circle-vs-rectangle push-out used by every moving thing.
export function resolveCircleRect(px, py, radius, rect) {
  const cx = Math.max(rect.x, Math.min(px, rect.x + rect.w));
  const cy = Math.max(rect.y, Math.min(py, rect.y + rect.h));
  const dx = px - cx;
  const dy = py - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= radius * radius) return null;
  if (d2 === 0) return { x: px, y: rect.y - radius, hit: true };
  const d = Math.sqrt(d2);
  const push = radius - d;
  return { x: px + (dx / d) * push, y: py + (dy / d) * push, hit: true };
}

export function collideWithBuildings(city, x, y, radius) {
  let nx = x;
  let ny = y;
  let hit = false;
  for (const b of city.buildings) {
    // Cheap broad-phase: skip buildings far away.
    if (nx < b.x - radius || nx > b.x + b.w + radius || ny < b.y - radius || ny > b.y + b.h + radius) continue;
    const r = resolveCircleRect(nx, ny, radius, b);
    if (r) {
      nx = r.x;
      ny = r.y;
      hit = true;
    }
  }
  return { x: nx, y: ny, hit };
}

export { WORLD, LANDMARKS };
export const CITY_WIDTH = width;
export const CITY_HEIGHT = height;
