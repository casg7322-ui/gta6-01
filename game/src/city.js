// The city of Solara Bay: a road grid, blocks of buildings, parks, a beach
// strip along the south edge, and the fixed story locations. Pure data and
// math (no DOM), so the Node win-proof can import it too.
import { COLS, PITCH, ROAD_W, ROWS, WORLD_H, WORLD_W, COLORS } from './config.js';

// Fixed story locations — every one sits on a road centreline so a car can
// reach it.
export const PLACES = {
  safehouse: { name: 'Safehouse', x: 1 * PITCH, y: 1 * PITCH, label: 'SAFEHOUSE' },
  paintShop: { name: 'Paint Shop', x: 4 * PITCH, y: 2 * PITCH, label: 'PAINT SHOP' },
  marina: { name: 'Marina', x: 9 * PITCH, y: 1 * PITCH, label: 'MARINA' },
  docks: { name: 'Docks', x: 1 * PITCH, y: 6 * PITCH, label: 'DOCKS' },
  penthouse: { name: 'Penthouse', x: 8 * PITCH, y: 3 * PITCH, label: 'PENTHOUSE' },
  plaza: { name: 'Central Plaza', x: 5 * PITCH, y: 4 * PITCH, label: 'PLAZA' },
  market: { name: 'Night Market', x: 3 * PITCH, y: 5 * PITCH, label: 'MARKET' },
};

export function buildCity(rng) {
  const buildings = [];
  const trees = [];
  const parks = [];
  const beachUmbrellas = [];
  for (let bx = 0; bx < COLS; bx += 1) {
    for (let by = 0; by < ROWS; by += 1) {
      const x0 = bx * PITCH + ROAD_W / 2 + 8;
      const y0 = by * PITCH + ROAD_W / 2 + 8;
      const x1 = (bx + 1) * PITCH - ROAD_W / 2 - 8;
      const y1 = (by + 1) * PITCH - ROAD_W / 2 - 8;
      // The south row is the beach: sand, palms and umbrellas, no buildings.
      if (by === ROWS - 1) {
        for (let i = 0; i < 7; i += 1) {
          const ux = rng.range(x0 + 20, x1 - 20);
          const uy = rng.range(y0 + 20, y1 - 20);
          beachUmbrellas.push({ x: ux, y: uy, color: rng.pick(['#ff6b6b', '#2ec4b6', '#ffd23f', '#ff9f1c']) });
          trees.push({ x: ux + rng.range(-40, 40), y: uy + rng.range(-30, 30), r: rng.range(9, 13) });
        }
        continue;
      }
      // A few blocks are parks.
      if (rng.chance(0.14)) {
        parks.push({ x0, y0, x1, y1 });
        for (let i = 0; i < 9; i += 1) {
          trees.push({ x: rng.range(x0 + 16, x1 - 16), y: rng.range(y0 + 16, y1 - 16), r: rng.range(10, 16) });
        }
        continue;
      }
      // Otherwise 1–3 buildings per block.
      const count = rng.int(1, 3);
      for (let i = 0; i < count; i += 1) {
        const w = rng.range(70, (x1 - x0) / count - 12);
        const h = rng.range(70, y1 - y0 - 16);
        const x = x0 + (i * (x1 - x0)) / count + rng.range(4, 14);
        const y = y0 + rng.range(6, Math.max(8, y1 - y0 - h - 6));
        buildings.push({
          x, y, w, h,
          color: rng.pick(COLORS.buildingRoof),
          tall: rng.chance(0.3),
          windows: rng.int(2, 5),
        });
      }
      // Street trees on block corners.
      if (rng.chance(0.6)) trees.push({ x: x0 + 6, y: y0 + 6, r: 10 });
      if (rng.chance(0.6)) trees.push({ x: x1 - 6, y: y1 - 6, r: 10 });
    }
  }
  return { buildings, trees, parks, beachUmbrellas };
}

// --- Road graph: intersections at every (i*PITCH, j*PITCH) ---
// The outer roads (i=0, i=COLS, j=0, j=ROWS) sit half off the map, so a car
// chasing a waypoint on one grinds against the world edge forever. Pathing
// only ever uses the inner intersections, which are fully on the map.
export function nearestNode(x, y) {
  const i = Math.max(1, Math.min(COLS - 1, Math.round(x / PITCH)));
  const j = Math.max(1, Math.min(ROWS - 1, Math.round(y / PITCH)));
  return { i, j, x: i * PITCH, y: j * PITCH };
}

export function nodeKey(i, j) {
  return `${i},${j}`;
}

// Breadth-first path over the intersection grid. Returns waypoints
// [{x, y}, ...] from start to goal (inclusive), or [] when unreachable.
export function findPath(sx, sy, gx, gy) {
  const start = nearestNode(sx, sy);
  const goal = nearestNode(gx, gy);
  if (start.i === goal.i && start.j === goal.j) return [{ x: gx, y: gy }];
  const prev = new Map();
  const queue = [start];
  prev.set(nodeKey(start.i, start.j), null);
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur.i === goal.i && cur.j === goal.j) break;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = cur.i + di;
      const nj = cur.j + dj;
      if (ni < 1 || ni > COLS - 1 || nj < 1 || nj > ROWS - 1) continue;
      const key = nodeKey(ni, nj);
      if (prev.has(key)) continue;
      prev.set(key, cur);
      queue.push({ i: ni, j: nj, x: ni * PITCH, y: nj * PITCH });
    }
  }
  const goalKey = nodeKey(goal.i, goal.j);
  if (!prev.has(goalKey)) return [];
  const path = [];
  let cur = goal;
  while (cur) {
    path.unshift({ x: cur.x, y: cur.y });
    cur = prev.get(nodeKey(cur.i, cur.j));
  }
  path.push({ x: gx, y: gy });
  return path;
}

// Distance from a point to the nearest road centreline (0 when on a road).
export function roadDistance(x, y) {
  const dx = Math.min(x % PITCH, PITCH - (x % PITCH));
  const dy = Math.min(y % PITCH, PITCH - (y % PITCH));
  const onV = dx <= ROAD_W / 2;
  const onH = dy <= ROAD_W / 2;
  if (onV || onH) return 0;
  return Math.min(dx - ROAD_W / 2, dy - ROAD_W / 2);
}

export function onRoad(x, y) {
  return roadDistance(x, y) === 0;
}

// Circle vs buildings: returns the first building hit, or null.
export function hitBuilding(city, x, y, r) {
  for (const b of city.buildings) {
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return b;
  }
  return null;
}

// Move a circle with axis-separated collision against buildings and the
// world edge. Returns {x, y, hit} — hit is true when a wall blocked motion.
export function moveCircle(city, x, y, dx, dy, r) {
  let hit = false;
  const nx = x + dx;
  if (!hitBuilding(city, nx, y, r) && nx >= r && nx <= WORLD_W - r) x = nx;
  else hit = true;
  const ny = y + dy;
  if (!hitBuilding(city, x, ny, r) && ny >= r && ny <= WORLD_H - r) y = ny;
  else hit = true;
  return { x, y, hit };
}

// A random point on an inner road, for spawning traffic and pedestrians.
export function randomRoadPoint(rng) {
  if (rng.chance(0.5)) {
    return { x: rng.int(1, COLS - 1) * PITCH, y: rng.range(PITCH, WORLD_H - PITCH) };
  }
  return { x: rng.range(PITCH, WORLD_W - PITCH), y: rng.int(1, ROWS - 1) * PITCH };
}
