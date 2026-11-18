// Autopilot: plays Solara Bay by feeding synthetic input into world.step.
// It pathfinds over the inner road grid, steals cars, drives missions and
// waits out the heat. The screenshot staging and the headless win-proof
// both drive through this one module, so the shots show real play.

import { LANDMARKS, TUNING, WORLD } from './config.js';
import { findRoute } from './city.js';
import { currentStep, missionTarget } from './missions.js';
import { nearestStealableCar } from './world.js';

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function blankInput() {
  return { moveX: 0, moveY: 0, run: false, throttle: 0, steer: 0, brake: false, interact: false, fire: false };
}

export function createPilot() {
  return {
    route: [],
    routeIdx: 0,
    routeKey: '',
    stuckT: 0,
    sampleT: 0,
    reverseT: 0,
    sidestepT: 0,
    sidestepX: 0,
    sidestepY: 0,
    lastX: 0,
    lastY: 0,
    cruiseTarget: null,
  };
}

function planRoute(pilot, world, tx, ty) {
  const key = `${Math.round(tx / 48)},${Math.round(ty / 48)}`;
  if (key !== pilot.routeKey || pilot.routeIdx >= pilot.route.length) {
    pilot.route = findRoute(world.city, world.player.x, world.player.y, tx, ty);
    pilot.routeIdx = 0;
    pilot.routeKey = key;
  }
  return pilot.route;
}

// Drive the car along the planned route. Returns input; `arrived` tells the
// caller the final waypoint is reached.
function driveAlongRoute(pilot, world, dt, arriveRadius) {
  const p = world.player;
  const input = blankInput();
  const route = pilot.route;
  if (route.length === 0) return { input, arrived: true };
  let idx = pilot.routeIdx;
  // Advance past waypoints already reached. The "behind" overshoot check
  // applies ONLY to intermediate waypoints: the last one must be driven
  // to, or the pilot never turns back for it.
  while (idx < route.length) {
    const wp = route[idx];
    const dx = wp.x - p.x;
    const dy = wp.y - p.y;
    const d = Math.hypot(dx, dy);
    const isLast = idx === route.length - 1;
    const radius = isLast ? arriveRadius : TUNING.waypointRadius;
    if (d < radius) {
      idx += 1;
      continue;
    }
    if (!isLast) {
      // Overshoot skip ONLY when the waypoint is close: a far waypoint
      // "behind" the car just means the car must U-turn for it. Skipping
      // far waypoints sent the pilot diagonally across blocks into walls.
      const ahead = dx * Math.cos(p.angle) + dy * Math.sin(p.angle);
      if (d < 150 && ahead < -24) {
        idx += 1;
        continue;
      }
    }
    break;
  }
  pilot.routeIdx = idx;
  if (idx >= route.length) {
    input.brake = Math.abs(p.speed) > 30;
    return { input, arrived: true };
  }
  const wp = route[idx];
  const isLast = idx === route.length - 1;
  const dx = wp.x - p.x;
  const dy = wp.y - p.y;
  const d = Math.hypot(dx, dy);
  const desired = Math.atan2(dy, dx);
  const diff = wrapAngle(desired - p.angle);
  input.steer = clamp(diff * 2.6, -1, 1);
  // Stuck recovery: reversing out beats grinding a wall.
  if (pilot.reverseT > 0) {
    pilot.reverseT -= dt;
    input.throttle = -1;
    input.steer = -input.steer;
    return { input, arrived: false };
  }
  if (isLast && d < 220) {
    // Ease into the destination instead of overshooting it.
    input.throttle = Math.abs(diff) < 0.7 ? 0.45 : 0;
    input.brake = Math.abs(p.speed) > 200;
  } else if (Math.abs(diff) > 1.05) {
    input.throttle = Math.abs(p.speed) < 60 ? 0.35 : 0;
    input.brake = Math.abs(p.speed) > 120;
  } else {
    input.throttle = 1;
  }
  return { input, arrived: false };
}

function walkToward(pilot, world, dt, tx, ty, arriveRadius) {
  const p = world.player;
  const input = blankInput();
  input.run = true;
  const dx = tx - p.x;
  const dy = ty - p.y;
  const d = Math.hypot(dx, dy);
  if (d < arriveRadius) return { input, arrived: true };
  if (pilot.sidestepT > 0) {
    pilot.sidestepT -= dt;
    input.moveX = pilot.sidestepX;
    input.moveY = pilot.sidestepY;
    return { input, arrived: false };
  }
  input.moveX = dx / d;
  input.moveY = dy / d;
  return { input, arrived: false };
}

function updateStuck(pilot, world, dt, trying) {
  const p = world.player;
  // Sample movement over a half-second window: per-tick movement is tiny
  // even at full speed, so a per-tick check would cry "stuck" constantly.
  pilot.sampleT = (pilot.sampleT ?? 0) + dt;
  if (pilot.sampleT < 0.5) return;
  pilot.sampleT = 0;
  const moved = Math.hypot(p.x - pilot.lastX, p.y - pilot.lastY);
  pilot.lastX = p.x;
  pilot.lastY = p.y;
  if (trying && moved < 26) {
    pilot.stuckT += 0.5;
  } else {
    pilot.stuckT = 0;
  }
  if (pilot.stuckT > 2.2) {
    pilot.stuckT = 0;
    // Replan from wherever the recovery leaves the car: the old route
    // was plotted from the wedged position and may be stale.
    pilot.routeKey = '';
    if (p.inCar) {
      pilot.reverseT = 0.9;
    } else {
      // Sidestep perpendicular to the direction the pilot faces.
      const a = p.angle + Math.PI / 2;
      pilot.sidestepX = Math.cos(a);
      pilot.sidestepY = Math.sin(a);
      pilot.sidestepT = 0.6;
    }
  }
}

// The pilot's one decision per tick.
export function drivePilot(pilot, world, dt) {
  const p = world.player;
  const input = blankInput();
  if (world.frozen || world.overlay) return input;

  // Briefings: hold the brakes. Idle momentum slides ~500 px into a wall.
  if (world.mission.phase === 'briefing') {
    input.brake = Math.abs(p.speed) > 30;
    return input;
  }

  // A wrecked car is no use: get out and find another.
  if (p.inCar) {
    const car = world.cars.find((c) => c.id === p.carId);
    if (car && car.disabled) {
      input.interact = true;
      return input;
    }
  }

  const step = currentStep(world.mission);
  const target = missionTarget(world);
  const wanted = world.wanted.stars > 0;

  // --- On foot: wheels first when hunted, else when a car is close. ---
  if (!p.inCar) {
    const needCar = !step || step.kind === 'car' || wanted;
    const nearCar = nearestStealableCar(world, p.x, p.y, needCar ? 2600 : 380);
    if (nearCar) {
      const d = Math.hypot(nearCar.x - p.x, nearCar.y - p.y);
      if (d < TUNING.enterRadius - 2) {
        input.interact = true;
        return input;
      }
      const walk = walkToward(pilot, world, dt, nearCar.x, nearCar.y, TUNING.walkArrive);
      updateStuck(pilot, world, dt, true);
      return walk.input;
    }
    if (needCar) {
      // No car in range: run toward the middle of town where cars gather.
      const walk = walkToward(pilot, world, dt, WORLD.width / 2, WORLD.height / 2, 60);
      updateStuck(pilot, world, dt, true);
      return walk.input;
    }
    // On foot with no car nearby and no need for one: walk the road route.
    if (target) {
      planRoute(pilot, world, target.x, target.y);
      const route = pilot.route;
      const wp = route[Math.min(pilot.routeIdx, route.length - 1)];
      if (wp) {
        const isLast = pilot.routeIdx >= route.length - 1;
        const arrived = Math.hypot(wp.x - p.x, wp.y - p.y) < (isLast ? TUNING.carArrive : 34);
        if (arrived && !isLast) pilot.routeIdx += 1;
        const walk = walkToward(pilot, world, dt, wp.x, wp.y, isLast ? TUNING.carArrive : 34);
        updateStuck(pilot, world, dt, true);
        return walk.input;
      }
    }
    return input;
  }

  // --- In a car: drive the mission, or cruise when the story is done. ---
  if (world.mission.phase === 'complete' || !step) {
    if (!pilot.cruiseTarget) {
      pilot.cruiseTarget = { x: 960 + Math.random() * 1920, y: 768 + Math.random() * 1536 };
      pilot.routeKey = '';
    }
    planRoute(pilot, world, pilot.cruiseTarget.x, pilot.cruiseTarget.y);
    const res = driveAlongRoute(pilot, world, dt, TUNING.carArrive);
    if (res.arrived) pilot.cruiseTarget = null;
    updateStuck(pilot, world, dt, !res.arrived);
    return res.input;
  }

  if (step.kind === 'car') return input; // already in a car; mission advances

  if (step.kind === 'loseHeat') {
    const s = LANDMARKS.safehouse;
    const dSafe = Math.hypot(s.x - p.x, s.y - p.y);
    if (dSafe < TUNING.safehouseRadius * 0.55) {
      // Parked inside the safehouse: brakes on, let the heat burn off.
      input.brake = Math.abs(p.speed) > 20;
      return input;
    }
    planRoute(pilot, world, s.x, s.y);
    const res = driveAlongRoute(pilot, world, dt, TUNING.carArrive);
    updateStuck(pilot, world, dt, !res.arrived);
    return res.input;
  }

  if (target) {
    planRoute(pilot, world, target.x, target.y);
    const res = driveAlongRoute(pilot, world, dt, TUNING.carArrive);
    updateStuck(pilot, world, dt, !res.arrived);
    return res.input;
  }
  return input;
}
