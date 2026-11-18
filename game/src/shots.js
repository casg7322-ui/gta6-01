// Screenshot staging + the autopilot. The autopilot plays the real game with
// the real rules (it only feeds input into world.step), so a staged frame is
// what a short game really looks like — and the same code proves the win path
// in Node: drive the story to KING OF SOLARA without a human.
import { STEP } from './config.js';
import { findPath, PLACES } from './city.js';
import { MISSIONS } from './missions.js';

const SAMPLE = STEP;

function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function dist(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

export function createPilot(world) {
  const state = world.state;
  let path = [];
  let pathIndex = 0;
  let pathKey = '';
  let stuckT = 0;
  let lastPos = null;
  let reverseT = 0;

  function targetFor() {
    const m = MISSIONS[state.missionIndex];
    if (!m) return null;
    if (!state.missionActive) return { kind: 'wait' };
    const step = m.steps[state.missionStep];
    if (!step) return null;
    if (step.type === 'steal-car') return { kind: 'car' };
    if (step.type === 'checkpoints') {
      const key = step.places[state.checkpointIndex];
      return key ? { kind: 'point', x: PLACES[key].x, y: PLACES[key].y, key: `${m.id}:${state.checkpointIndex}` } : null;
    }
    if (step.place) return { kind: 'point', x: PLACES[step.place].x, y: PLACES[step.place].y, key: `${m.id}:${state.missionStep}` };
    return null;
  }

  function nearestCar() {
    let best = null;
    let bestD = Infinity;
    for (const c of state.cars) {
      if (c.kind === 'police' || c.hp <= 0) continue;
      const d = dist(state.player.x, state.player.y, c.x, c.y);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  function ensurePath(tx, ty, key) {
    const k = `${key ?? ''}@${Math.round(tx / 384)},${Math.round(ty / 384)}`;
    if (k !== pathKey || pathIndex >= path.length) {
      path = findPath(state.player.x, state.player.y, tx, ty);
      pathIndex = 0;
      pathKey = k;
    }
  }

  function followPath() {
    const input = { up: false, down: false, left: false, right: false, run: false, enter: false, shoot: false };
    if (pathIndex >= path.length) return input;
    const wp = path[pathIndex];
    const p = state.player;
    const wpDist = dist(p.x, p.y, wp.x, wp.y);
    const isLast = pathIndex === path.length - 1;
    // Advance when close, or (in a car, at an intermediate waypoint) when the
    // waypoint is behind us (we overshot it). The last waypoint is the real
    // target: never skip it, or the pilot can never turn around to reach it.
    const wpAngle = Math.atan2(wp.y - p.y, wp.x - p.x);
    const behind = p.inCar && !isLast && Math.cos(wpAngle - p.angle) < -0.4 && wpDist < 220;
    const arriveR = p.inCar ? 60 : 16;
    if (wpDist < arriveR || behind) {
      pathIndex += 1;
      return followPath();
    }
    if (p.inCar) {
      const car = state.cars.find((c) => c.id === p.inCar);
      if (!car) return input;
      // Stuck detection: barely moving while trying to drive.
      if (lastPos) {
        const moved = dist(p.x, p.y, lastPos.x, lastPos.y);
        if (car.speed < 40) stuckT += SAMPLE;
        else stuckT = 0;
        if (moved < 1 && car.speed > 60) stuckT += SAMPLE;
      }
      lastPos = { x: p.x, y: p.y };
      if (reverseT > 0) {
        reverseT -= SAMPLE;
        input.down = true;
        input.left = true; // swing the rear while backing out
        input.right = false;
        return input;
      }
      if (stuckT > 3) {
        stuckT = 0;
        reverseT = 0.5;
        path = findPath(p.x, p.y, path[path.length - 1].x, path[path.length - 1].y);
        pathIndex = 0;
        return input;
      }
      const want = Math.atan2(wp.y - p.y, wp.x - p.x);
      const diff = angleDiff(car.angle, want);
      if (diff > 0.12) input.left = true;
      else if (diff < -0.12) input.right = true;
      // Speed plan: slow for the next corner, fast on a straight. A 90-degree
      // turn on this grid at full speed overshoots the intersection and spins.
      // Brake early for the final waypoint (the real target) so the car
      // arrives under control instead of sailing past it.
      const corner = Math.abs(diff) > 0.5 || wpDist < 200;
      const desired = isLast ? (wpDist < 350 ? 150 : 350) : (corner ? 190 : 480);
      if (car.speed > desired + 60) input.down = true;
      else if (car.speed < desired) input.up = true;
      else if (car.speed > desired) input.down = true;
      return input;
    }
    // On foot: walk toward the waypoint.
    const dx = wp.x - p.x;
    const dy = wp.y - p.y;
    if (dx > 8) input.right = true;
    else if (dx < -8) input.left = true;
    if (dy > 8) input.down = true;
    else if (dy < -8) input.up = true;
    input.run = true;
    return input;
  }

  // Steal the nearest car: walk to it, press E when close. Returns the
  // input for this frame, or null when already in a car.
  function seekCar() {
    const p = state.player;
    if (p.inCar) return null;
    const car = nearestCar();
    if (!car) return { up: false, down: false, left: false, right: false, run: false, enter: false, shoot: false };
    if (dist(p.x, p.y, car.x, car.y) < 52) return { up: false, down: false, left: false, right: false, run: false, enter: true, shoot: false };
    ensurePath(car.x, car.y, `car${car.id}`);
    return followPath();
  }

  // One frame of autopilot input.
  function input() {
    const target = targetFor();
    const p = state.player;
    const idle = { up: false, down: false, left: false, right: false, run: false, enter: false, shoot: false };
    if (!target) return idle;
    // On foot with the heat on, a car is safety: a cop cruiser outruns a
    // runner, so always grab wheels first instead of walking to the target.
    if (!p.inCar && p.wanted > 0 && target.kind !== 'car') {
      return seekCar();
    }
    // Between missions (briefing) the pilot waits — but a car with momentum
    // would coast hundreds of pixels, so brake to a stop first.
    if (target.kind === 'wait') {
      if (p.inCar) {
        const car = state.cars.find((c) => c.id === p.inCar);
        if (car && Math.abs(car.speed) > 30) return { ...idle, down: true };
      }
      return idle;
    }
    if (target.kind === 'car') {
      return seekCar() ?? idle;
    }
    // target.kind === 'point'
    const d = dist(p.x, p.y, target.x, target.y);
    if (!p.inCar) {
      // Walk to a car first when the target is far; walk directly when close.
      if (d > 260) {
        const car = nearestCar();
        if (car) {
          if (dist(p.x, p.y, car.x, car.y) < 52) return { ...idle, enter: true };
          ensurePath(car.x, car.y, `car${car.id}`);
          return followPath();
        }
      }
      ensurePath(target.x, target.y, target.key);
      return followPath();
    }
    ensurePath(target.x, target.y, target.key);
    return followPath();
  }

  return { input };
}

// Stage a screenshot scene: play the real rules forward from a fresh world
// for a fixed time, steered by the autopilot. Returns { screen, best }.
export function stageShot(name, world) {
  const state = world.state;
  const pilot = createPilot(world);
  const runFor = (seconds, until) => {
    const steps = Math.floor(seconds / SAMPLE);
    for (let i = 0; i < steps; i += 1) {
      world.step(SAMPLE, pilot.input());
      if (until && until()) break;
    }
  };
  world.step(0.001, { up: false, down: false, left: false, right: false, run: false, enter: false, shoot: false });
  if (name === 'play') {
    runFor(38);
    return { screen: 'play', best: 0 };
  }
  if (name === 'chase') {
    // Mid-story, mid-map: the getaway is under way and the heat is on.
    // Give the cruisers time to close in so one is in frame.
    runFor(58);
    world.addWanted(3, 'heat');
    runFor(24);
    return { screen: 'play', best: 0 };
  }
  if (name === 'mission') {
    runFor(120, () => state.stats.missionsDone >= 1 && state.banner);
    return { screen: 'play', best: 0 };
  }
  if (name === 'complete') {
    runFor(900, () => state.complete);
    return { screen: state.complete ? 'complete' : 'play', best: 0 };
  }
  // title (default)
  runFor(6);
  return { screen: 'title', best: 0 };
}
