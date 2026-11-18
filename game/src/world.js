// Solara Bay — the world: pure game logic, no DOM, no audio, no canvas.
// The browser feeds it input and draws it; Node can run it headless to
// prove the game is winnable. Everything here is deterministic per seed.

import { LANDMARKS, PALETTE, START_CASH, TUNING, WORLD } from './config.js';
import { collideWithBuildings, findRoute, generateCity, nearestNode, nodePos } from './city.js';
import { createMissionState, startMission, updateMission } from './missions.js';
import { makeRng } from './random.js';

const CAR_COLORS = ['#d94f3d', '#3d7bd9', '#e8e3d5', '#2f2f33', '#e8a13d', '#5aa86b', '#8a5fc0', '#d97fb0', '#4db3c9', '#c9d13d'];
const PED_SHIRTS = ['#e86a5a', '#5a8de8', '#e8c95a', '#6bc46b', '#c96bd8', '#e8e8e8', '#5ad8c9', '#e89a5a'];
const { width: WORLD_W, height: WORLD_H, cols, rows, block } = WORLD;

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

let nextCarId = 1;
let nextPedId = 1;

function randomInnerNode(rng) {
  return { i: rng.int(1, cols - 1), j: rng.int(1, rows - 1) };
}

function makeCar(x, y, angle, kind, color) {
  return {
    id: nextCarId++,
    x, y, angle, speed: 0,
    kind, // traffic | parked | police
    color,
    hp: kind === 'police' ? 60 : 45,
    driver: kind === 'traffic' ? 'npc' : null, // npc | player | police | null
    route: [],
    routeIdx: 0,
    routeCooldown: 0,
    stuckT: 0,
    lastX: x,
    lastY: y,
    ramCd: 0,
    disabled: false,
    sirenPhase: Math.random() * Math.PI * 2,
  };
}

export function createWorld(seed, opts = {}) {
  const rng = makeRng(seed);
  const city = generateCity(seed);
  const world = {
    seed,
    rng,
    city,
    time: 0,
    cash: opts.cash ?? START_CASH,
    player: {
      x: 812, y: 2268, angle: -Math.PI / 2, hp: 100,
      inCar: false, carId: null, speed: 0, moving: false,
      lastDamageT: -99, fireCd: 0, bustT: 0,
    },
    cars: [],
    peds: [],
    cops: [],
    bullets: [],
    particles: [],
    wanted: { heat: 0, stars: 0 },
    mission: createMissionState(),
    camera: { x: 812, y: 2268 },
    shake: 0,
    overlay: null, // 'busted' | 'wasted'
    frozen: false,
    events: [],
    stats: { shots: 0, steals: 0, busted: 0, wasted: 0, crashes: 0 },
  };

  // Traffic: 14 cars cruising the inner road grid.
  for (let n = 0; n < 14; n++) {
    const node = randomInnerNode(rng);
    const p = nodePos(node.i, node.j);
    const car = makeCar(p.x + rng.range(-30, 30), p.y + rng.range(-30, 30), rng.range(0, Math.PI * 2), 'traffic', rng.pick(CAR_COLORS));
    car.speed = TUNING.trafficSpeed * rng.range(0.7, 1);
    assignTrafficRoute(world, car);
    world.cars.push(car);
  }

  // Parked cars: 12, two of them right by the safehouse so the first job
  // (and any smoke test) always has wheels nearby.
  const parkedSpots = [
    { x: 900, y: 2304, angle: 0 },
    { x: 700, y: 2110, angle: Math.PI / 2 },
  ];
  for (let n = 0; n < 10; n++) {
    const node = randomInnerNode(rng);
    const p = nodePos(node.i, node.j);
    const along = rng.chance(0.5);
    parkedSpots.push({
      x: p.x + (along ? rng.range(-150, 150) : rng.pick([-1, 1]) * (WORLD.roadHalf + 14)),
      y: p.y + (along ? rng.pick([-1, 1]) * (WORLD.roadHalf + 14) : rng.range(-150, 150)),
      angle: along ? 0 : Math.PI / 2,
    });
  }
  for (const s of parkedSpots) {
    world.cars.push(makeCar(s.x, s.y, s.angle, 'parked', rng.pick(CAR_COLORS)));
  }

  // Pedestrians: 26, walking the sidewalks.
  for (let n = 0; n < 26; n++) {
    const node = randomInnerNode(rng);
    const p = nodePos(node.i, node.j);
    const ped = {
      id: nextPedId++,
      x: p.x + rng.range(-120, 120),
      y: p.y + rng.range(-120, 120),
      angle: rng.range(0, Math.PI * 2),
      speed: TUNING.pedSpeed * rng.range(0.8, 1.2),
      tx: p.x, ty: p.y,
      state: 'walk',
      fleeT: 0,
      threat: null,
      shirt: rng.pick(PED_SHIRTS),
      dead: false,
      deadT: 0,
    };
    pickPedTarget(world, ped);
    world.peds.push(ped);
  }

  if (opts.missionIndex) {
    world.mission.index = Math.min(opts.missionIndex, 5);
    if (world.mission.index >= 5) world.mission.phase = 'complete';
  }
  if (world.mission.phase !== 'complete') startMission(world);
  return world;
}

function pickPedTarget(world, ped) {
  const node = randomInnerNode(world.rng);
  const p = nodePos(node.i, node.j);
  ped.tx = p.x + world.rng.range(-100, 100);
  ped.ty = p.y + world.rng.range(-100, 100);
}

function assignTrafficRoute(world, car) {
  const from = nearestNode(car.x, car.y);
  const to = randomInnerNode(world.rng);
  car.route = findRoute(world.city, from.i * block, from.j * block, to.i * block, to.j * block);
  car.routeIdx = 0;
}

export function addHeat(world, amount) {
  world.wanted.heat = clamp(world.wanted.heat + amount, 0, 100);
}

function spawnParticles(world, x, y, n, color, speed = 120) {
  for (let i = 0; i < n; i++) {
    const a = world.rng.range(0, Math.PI * 2);
    const s = world.rng.range(speed * 0.3, speed);
    world.particles.push({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: world.rng.range(0.3, 0.8),
      maxLife: 0.8,
      color,
      size: world.rng.range(2, 5),
    });
  }
}

function damagePlayer(world, amount) {
  const p = world.player;
  if (p.hp <= 0 || world.overlay) return;
  p.hp = Math.max(0, p.hp - amount);
  p.lastDamageT = world.time;
  if (p.hp <= 0) {
    world.overlay = 'wasted';
    world.frozen = true;
    world.stats.wasted += 1;
    world.events.push({ type: 'wasted' });
  }
}

function bustPlayer(world) {
  if (world.overlay) return;
  world.overlay = 'busted';
  world.frozen = true;
  world.stats.busted += 1;
  world.events.push({ type: 'busted' });
}

// After a bust/waste: respawn at the safehouse, take the cash cut, restart
// the current mission from its briefing.
export function resumeFromOverlay(world) {
  const p = world.player;
  const s = LANDMARKS.safehouse;
  p.x = s.x + 44;
  p.y = s.y - 36;
  p.hp = 100;
  p.inCar = false;
  p.carId = null;
  p.bustT = 0;
  world.wanted.heat = 0;
  world.wanted.stars = 0;
  world.cash = Math.round(world.cash * (1 - TUNING.respawnCashCut));
  world.cars = world.cars.filter((c) => c.kind !== 'police');
  world.cops = [];
  world.bullets = [];
  world.overlay = null;
  world.frozen = false;
  world.mission.failed += 1;
  startMission(world);
}

export function nearestStealableCar(world, x, y, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of world.cars) {
    if (car.disabled) continue;
    if (car.driver === 'player') continue;
    const d = dist(x, y, car.x, car.y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

function enterCar(world, car) {
  const p = world.player;
  if (car.driver === 'npc') {
    // The driver flees on foot; stealing an occupied car draws heat.
    const ped = {
      id: nextPedId++,
      x: car.x + 26, y: car.y + 10, angle: 0,
      speed: TUNING.pedFleeSpeed, tx: car.x + 300, ty: car.y - 200,
      state: 'flee', fleeT: 3, threat: { x: car.x, y: car.y },
      shirt: world.rng.pick(PED_SHIRTS), dead: false, deadT: 0,
    };
    world.peds.push(ped);
    addHeat(world, TUNING.heatStealOccupied);
  }
  if (car.kind === 'police') addHeat(world, TUNING.heatStealPolice);
  car.driver = 'player';
  car.route = [];
  p.inCar = true;
  p.carId = car.id;
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
  world.stats.steals += 1;
  world.events.push({ type: 'enterCar', police: car.kind === 'police' });
}

function exitCar(world) {
  const p = world.player;
  const car = world.cars.find((c) => c.id === p.carId);
  if (!car) {
    p.inCar = false;
    p.carId = null;
    return;
  }
  car.driver = null;
  car.speed = 0;
  if (car.kind === 'traffic') car.kind = 'parked';
  p.inCar = false;
  p.carId = null;
  p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
  p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
  const fixed = collideWithBuildings(world.city, p.x, p.y, TUNING.playerRadius);
  p.x = fixed.x;
  p.y = fixed.y;
  world.events.push({ type: 'exitCar' });
}

// One shared car-driving step: steering keeps a minimum bite at low speed
// so U-turns stay possible, and braking is stronger than the throttle.
function driveCar(car, steer, throttle, brake, dt) {
  const speedAbs = Math.abs(car.speed);
  const turnFactor = Math.max(TUNING.carMinTurnFactor, Math.min(1, speedAbs / 150));
  const dir = car.speed < -1 ? -1 : 1;
  car.angle += steer * TUNING.carTurn * turnFactor * dir * dt;
  if (brake) {
    const s = Math.sign(car.speed);
    car.speed -= s * TUNING.carBrake * dt;
    if (Math.sign(car.speed) !== s) car.speed = 0;
  } else if (throttle > 0) {
    car.speed += TUNING.carAccel * throttle * dt;
  } else if (throttle < 0) {
    car.speed += TUNING.carReverseAccel * throttle * dt;
  }
  car.speed -= car.speed * TUNING.carDrag * dt;
  car.speed = clamp(car.speed, -TUNING.carMaxReverse, TUNING.carMaxSpeed);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
}

function steerToward(car, tx, ty, maxSpeed, dt) {
  const desired = Math.atan2(ty - car.y, tx - car.x);
  const diff = wrapAngle(desired - car.angle);
  const steer = clamp(diff * 2.4, -1, 1);
  const throttle = Math.abs(diff) < 1.1 ? 1 : 0.25;
  driveCar(car, steer, throttle, false, dt);
  if (car.speed > maxSpeed) car.speed = maxSpeed;
}

function updatePlayer(world, input, dt) {
  const p = world.player;
  p.fireCd = Math.max(0, p.fireCd - dt);
  if (p.inCar) {
    const car = world.cars.find((c) => c.id === p.carId);
    if (!car) {
      p.inCar = false;
      p.carId = null;
      return;
    }
    if (input.interact) {
      exitCar(world);
      return;
    }
    const before = car.speed;
    driveCar(car, input.steer, input.throttle, input.brake, dt);
    const hit = collideWithBuildings(world.city, car.x, car.y, TUNING.carRadius);
    if (hit.hit) {
      const impact = Math.abs(before);
      car.x = hit.x;
      car.y = hit.y;
      car.speed *= 0.35;
      if (impact > 280) {
        damagePlayer(world, (impact - 280) / 45);
        world.shake = Math.min(14, world.shake + impact / 60);
        spawnParticles(world, car.x, car.y, 10, '#ffb347', 200);
        world.events.push({ type: 'crash', mag: impact });
        world.stats.crashes += 1;
      }
    }
    car.x = clamp(car.x, 20, WORLD_W - 20);
    car.y = clamp(car.y, 20, WORLD_H - 20);
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    p.speed = car.speed;
    p.moving = Math.abs(car.speed) > 20;
    return;
  }

  // On foot.
  if (input.interact) {
    const car = nearestStealableCar(world, p.x, p.y, TUNING.enterRadius);
    if (car) {
      enterCar(world, car);
      return;
    }
  }
  const mx = input.moveX;
  const my = input.moveY;
  const len = Math.hypot(mx, my);
  const speed = input.run ? TUNING.runSpeed : TUNING.walkSpeed;
  p.moving = len > 0.1;
  if (len > 0.1) {
    const nx = mx / len;
    const ny = my / len;
    p.x += nx * speed * dt;
    p.y += ny * speed * dt;
    p.angle = Math.atan2(ny, nx);
  }
  const fixed = collideWithBuildings(world.city, p.x, p.y, TUNING.playerRadius);
  p.x = fixed.x;
  p.y = fixed.y;
  p.x = clamp(p.x, 12, WORLD_W - 12);
  p.y = clamp(p.y, 12, WORLD_H - 12);
  p.speed = p.moving ? speed : 0;

  // Pistol: aim with the mouse, click to fire.
  if (input.fire && p.fireCd <= 0 && input.aimX !== undefined) {
    const a = Math.atan2(input.aimY - p.y, input.aimX - p.x);
    p.angle = a;
    world.bullets.push({
      x: p.x + Math.cos(a) * 16,
      y: p.y + Math.sin(a) * 16,
      vx: Math.cos(a) * TUNING.bulletSpeed,
      vy: Math.sin(a) * TUNING.bulletSpeed,
      life: TUNING.bulletRange / TUNING.bulletSpeed,
    });
    p.fireCd = TUNING.fireInterval;
    world.stats.shots += 1;
    addHeat(world, TUNING.heatShot);
    spawnParticles(world, p.x + Math.cos(a) * 20, p.y + Math.sin(a) * 20, 3, '#ffd94d', 160);
    world.events.push({ type: 'shot' });
    // Nearby pedestrians flee the gunshot.
    for (const ped of world.peds) {
      if (!ped.dead && dist(p.x, p.y, ped.x, ped.y) < 320) {
        ped.state = 'flee';
        ped.fleeT = 3;
        ped.threat = { x: p.x, y: p.y };
      }
    }
  }
}

function updateTraffic(world, dt) {
  for (const car of world.cars) {
    if (car.kind !== 'traffic' || car.driver !== 'npc' || car.disabled) continue;
    car.routeCooldown -= dt;
    if (car.route.length === 0 || car.routeIdx >= car.route.length) {
      if (car.routeCooldown <= 0) {
        assignTrafficRoute(world, car);
        car.routeCooldown = 1;
      }
      continue;
    }
    const wp = car.route[car.routeIdx];
    const d = dist(car.x, car.y, wp.x, wp.y);
    if (d < TUNING.waypointRadius) {
      car.routeIdx += 1;
      continue;
    }
    steerToward(car, wp.x, wp.y, TUNING.trafficSpeed, dt);
    const hit = collideWithBuildings(world.city, car.x, car.y, TUNING.carRadius);
    if (hit.hit) {
      car.x = hit.x;
      car.y = hit.y;
      car.speed *= 0.3;
      if (car.routeCooldown <= 0) {
        assignTrafficRoute(world, car);
        car.routeCooldown = 2;
      }
    }
    car.x = clamp(car.x, 20, WORLD_W - 20);
    car.y = clamp(car.y, 20, WORLD_H - 20);
  }
}

function updatePolice(world, dt) {
  const p = world.player;
  const stars = world.wanted.stars;
  const police = world.cars.filter((c) => c.kind === 'police');
  const want = stars > 0 ? Math.min(1 + stars, 5) : 0;
  // Spawn more patrol cars while the heat is on; they go calm at 0 stars.
  if (police.length < want) {
    const node = randomInnerNode(world.rng);
    const pos = nodePos(node.i, node.j);
    const d = dist(p.x, p.y, pos.x, pos.y);
    if (d > 480 && d < 1600) {
      const car = makeCar(pos.x, pos.y, Math.atan2(p.y - pos.y, p.x - pos.x), 'police', '#f2f2f2');
      car.driver = 'police';
      car.speed = 200;
      world.cars.push(car);
    }
  }
  if (stars === 0) {
    // Calm: patrol cars already out keep cruising slowly, then leave.
    for (const car of police) {
      car.speed = Math.max(0, car.speed - 120 * dt);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
    }
    if (world.time % 1 < dt) {
      // Occasionally thin the herd once the heat is off.
      const idle = world.cars.findIndex((c) => c.kind === 'police' && c.driver === 'police' && Math.abs(c.speed) < 5);
      if (idle !== -1 && world.rng.chance(0.4)) world.cars.splice(idle, 1);
    }
    return;
  }
  const safe = LANDMARKS.safehouse;
  for (const car of police) {
    if (car.driver !== 'police' || car.disabled) continue;
    car.ramCd = Math.max(0, car.ramCd - dt);
    const dPlayer = dist(car.x, car.y, p.x, p.y);
    const dSafe = dist(car.x, car.y, safe.x, safe.y);
    const playerHiding = dist(p.x, p.y, safe.x, safe.y) < TUNING.safehouseRadius;
    if (playerHiding && dSafe < TUNING.safehouseRadius + 60) {
      // The SBPD does not raid the safehouse: they hold the perimeter.
      driveCar(car, 0, 0, true, dt);
      continue;
    }
    if (dPlayer > 430) {
      if (car.route.length === 0 || car.routeIdx >= car.route.length || car.routeCooldown <= 0) {
        const from = nearestNode(car.x, car.y);
        const to = nearestNode(p.x, p.y);
        car.route = findRoute(world.city, from.i * block, from.j * block, to.i * block, to.j * block);
        car.routeIdx = 0;
        car.routeCooldown = 2.5;
      }
      car.routeCooldown -= dt;
      const wp = car.route[car.routeIdx];
      if (wp) {
        if (dist(car.x, car.y, wp.x, wp.y) < TUNING.waypointRadius) car.routeIdx += 1;
        else steerToward(car, wp.x, wp.y, TUNING.policeSpeed, dt);
      }
    } else {
      // Close in: chase and ram — but each patrol car aims at its own
      // offset around the player, so the pack surrounds instead of
      // piling onto one point and pinning the car in a scrum.
      car.route = [];
      const toPlayer = Math.atan2(p.y - car.y, p.x - car.x);
      const lane = ((car.id % 3) - 1) * 74;
      const tx = p.x + Math.cos(toPlayer + Math.PI / 2) * lane;
      const ty = p.y + Math.sin(toPlayer + Math.PI / 2) * lane;
      const cap = dPlayer < 150 ? 330 : TUNING.policeSpeed;
      steerToward(car, tx, ty, cap, dt);
    }
    const hit = collideWithBuildings(world.city, car.x, car.y, TUNING.carRadius);
    if (hit.hit) {
      car.x = hit.x;
      car.y = hit.y;
      car.speed *= 0.4;
    }
    car.x = clamp(car.x, 20, WORLD_W - 20);
    car.y = clamp(car.y, 20, WORLD_H - 20);
    // Ramming the player's car hurts.
    if (dPlayer < TUNING.carRadius * 2 + 4 && car.ramCd <= 0) {
      const impact = Math.abs(car.speed) + Math.abs(p.speed || 0);
      if (impact > 120) {
        damagePlayer(world, 2);
        car.ramCd = 1;
        world.shake = Math.min(10, world.shake + 4);
        spawnParticles(world, (car.x + p.x) / 2, (car.y + p.y) / 2, 6, '#ffb347', 160);
        world.events.push({ type: 'crash', mag: impact });
      }
    }
  }
}

function updateCops(world, dt) {
  const p = world.player;
  const stars = world.wanted.stars;
  const want = stars >= 2 ? Math.min(stars, 4) : 0;
  if (world.cops.length < want) {
    const node = randomInnerNode(world.rng);
    const pos = nodePos(node.i, node.j);
    const d = dist(p.x, p.y, pos.x, pos.y);
    if (d > 280 && d < 900) {
      world.cops.push({ x: pos.x, y: pos.y, angle: 0, route: [], routeIdx: 0, routeCooldown: 0 });
    }
  }
  if (stars === 0) {
    world.cops = [];
    return;
  }
  const safe = LANDMARKS.safehouse;
  const playerHiding = dist(p.x, p.y, safe.x, safe.y) < TUNING.safehouseRadius;
  let busting = false;
  for (const cop of world.cops) {
    const dPlayer = dist(cop.x, cop.y, p.x, p.y);
    if (playerHiding && dist(cop.x, cop.y, safe.x, safe.y) < TUNING.safehouseRadius + 40) {
      continue; // hold the perimeter with the patrol cars
    }
    let tx = p.x;
    let ty = p.y;
    if (dPlayer > 300) {
      if (cop.route.length === 0 || cop.routeIdx >= cop.route.length || cop.routeCooldown <= 0) {
        const from = nearestNode(cop.x, cop.y);
        const to = nearestNode(p.x, p.y);
        cop.route = findRoute(world.city, from.i * block, from.j * block, to.i * block, to.j * block);
        cop.routeIdx = 0;
        cop.routeCooldown = 3;
      }
      cop.routeCooldown -= dt;
      const wp = cop.route[cop.routeIdx];
      if (wp) {
        if (dist(cop.x, cop.y, wp.x, wp.y) < 30) cop.routeIdx += 1;
        else {
          tx = wp.x;
          ty = wp.y;
        }
      }
    }
    const a = Math.atan2(ty - cop.y, tx - cop.x);
    cop.angle = a;
    cop.x += Math.cos(a) * TUNING.copRunSpeed * dt;
    cop.y += Math.sin(a) * TUNING.copRunSpeed * dt;
    const fixed = collideWithBuildings(world.city, cop.x, cop.y, TUNING.playerRadius);
    cop.x = fixed.x;
    cop.y = fixed.y;
    if (!p.inCar && dPlayer < TUNING.bustDistance) busting = true;
  }
  if (busting && !p.inCar) {
    p.bustT += dt;
    if (p.bustT >= TUNING.bustTime) bustPlayer(world);
  } else {
    p.bustT = Math.max(0, p.bustT - dt * 2);
  }
}

function updatePeds(world, dt) {
  const p = world.player;
  for (const ped of world.peds) {
    if (ped.dead) {
      ped.deadT += dt;
      if (ped.deadT > 18) {
        // A fresh face wanders in from elsewhere in the city.
        const node = randomInnerNode(world.rng);
        const pos = nodePos(node.i, node.j);
        ped.x = pos.x;
        ped.y = pos.y;
        ped.dead = false;
        ped.deadT = 0;
        ped.state = 'walk';
        pickPedTarget(world, ped);
      }
      continue;
    }
    if (ped.state === 'flee') {
      ped.fleeT -= dt;
      // Threat may be gone by the time the ped reacts — guard the null.
      const threat = ped.threat;
      if (threat) {
        const a = Math.atan2(ped.y - threat.y, ped.x - threat.x);
        ped.angle = a;
        ped.x += Math.cos(a) * TUNING.pedFleeSpeed * dt;
        ped.y += Math.sin(a) * TUNING.pedFleeSpeed * dt;
      }
      if (ped.fleeT <= 0) {
        ped.state = 'walk';
        ped.threat = null;
        pickPedTarget(world, ped);
      }
    } else {
      const d = dist(ped.x, ped.y, ped.tx, ped.ty);
      if (d < 24) {
        pickPedTarget(world, ped);
      } else {
        const a = Math.atan2(ped.ty - ped.y, ped.tx - ped.x);
        ped.angle = a;
        ped.x += Math.cos(a) * ped.speed * dt;
        ped.y += Math.sin(a) * ped.speed * dt;
      }
      // A fast car bearing down makes pedestrians scatter.
      for (const car of world.cars) {
        if (Math.abs(car.speed) > 200 && dist(ped.x, ped.y, car.x, car.y) < 110) {
          ped.state = 'flee';
          ped.fleeT = 2.5;
          ped.threat = { x: car.x, y: car.y };
          break;
        }
      }
    }
    const fixed = collideWithBuildings(world.city, ped.x, ped.y, 9);
    ped.x = fixed.x;
    ped.y = fixed.y;
    ped.x = clamp(ped.x, 10, WORLD_W - 10);
    ped.y = clamp(ped.y, 10, WORLD_H - 10);
    // Run over by a moving car.
    for (const car of world.cars) {
      if (Math.abs(car.speed) > 60 && dist(ped.x, ped.y, car.x, car.y) < TUNING.carRadius) {
        ped.dead = true;
        ped.deadT = 0;
        if (car.driver === 'player') addHeat(world, TUNING.heatKillPed);
        spawnParticles(world, ped.x, ped.y, 8, '#d94f3d', 120);
        break;
      }
    }
  }
  // A moving car can also hit the player on foot.
  if (!p.inCar) {
    for (const car of world.cars) {
      if (Math.abs(car.speed) > 120 && dist(p.x, p.y, car.x, car.y) < TUNING.carRadius + 8) {
        damagePlayer(world, Math.min(18, (Math.abs(car.speed) - 120) / 12));
        const a = Math.atan2(p.y - car.y, p.x - car.x);
        p.x += Math.cos(a) * 26;
        p.y += Math.sin(a) * 26;
        world.shake = Math.min(12, world.shake + 6);
        break;
      }
    }
  }
}

function updateCarCollisions(world) {
  const cars = world.cars;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = TUNING.carRadius * 2 - 6;
      if (d === 0 || d >= min) continue;
      const nx = dx / d;
      const ny = dy / d;
      const overlap = (min - d) / 2;
      const closing = Math.abs(a.speed - b.speed);
      a.x -= nx * overlap;
      a.y -= ny * overlap;
      b.x += nx * overlap;
      b.y += ny * overlap;
      // Only a real impact trades momentum. At low closing speed the cars
      // just push apart — otherwise a police pile-up averages the player's
      // speed to zero every frame and the car can never escape.
      if (closing < 120) continue;
      const avg = (a.speed + b.speed) / 2;
      a.speed = avg * 0.6;
      b.speed = avg * 0.6;
      if (closing > 260) {
        spawnParticles(world, (a.x + b.x) / 2, (a.y + b.y) / 2, 8, '#ffb347', 180);
        world.events.push({ type: 'crash', mag: closing });
        if (a.driver === 'player' || b.driver === 'player') {
          damagePlayer(world, (closing - 260) / 50);
          world.shake = Math.min(12, world.shake + 5);
          world.stats.crashes += 1;
        }
        const police = a.kind === 'police' ? a : b.kind === 'police' ? b : null;
        const playerCar = a.driver === 'player' ? a : b.driver === 'player' ? b : null;
        if (police && playerCar) addHeat(world, TUNING.heatRamPolice);
      }
    }
  }
}

function updateBullets(world, dt) {
  for (const b of world.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
  }
  world.bullets = world.bullets.filter((b) => {
    if (b.life <= 0) return false;
    if (b.x < 0 || b.x > WORLD_W || b.y < 0 || b.y > WORLD_H) return false;
    // Buildings stop bullets.
    for (const rect of world.city.buildings) {
      if (b.x >= rect.x && b.x <= rect.x + rect.w && b.y >= rect.y && b.y <= rect.y + rect.h) {
        spawnParticles(world, b.x, b.y, 3, '#e8d98a', 120);
        return false;
      }
    }
    for (const car of world.cars) {
      if (car.driver === 'player' || car.disabled) continue;
      if (dist(b.x, b.y, car.x, car.y) < TUNING.carRadius) {
        car.hp -= 25;
        spawnParticles(world, b.x, b.y, 5, '#ffb347', 150);
        if (car.hp <= 0) {
          car.disabled = true;
          car.speed = 0;
          if (car.driver === 'npc') {
            car.driver = null;
            const ped = {
              id: nextPedId++,
              x: car.x + 26, y: car.y + 10, angle: 0,
              speed: TUNING.pedFleeSpeed, tx: car.x + 300, ty: car.y - 200,
              state: 'flee', fleeT: 3, threat: { x: world.player.x, y: world.player.y },
              shirt: world.rng.pick(PED_SHIRTS), dead: false, deadT: 0,
            };
            world.peds.push(ped);
          }
          addHeat(world, car.kind === 'police' ? 18 : 10);
        }
        return false;
      }
    }
    for (const ped of world.peds) {
      if (ped.dead) continue;
      if (dist(b.x, b.y, ped.x, ped.y) < 13) {
        ped.dead = true;
        ped.deadT = 0;
        addHeat(world, TUNING.heatKillPed);
        spawnParticles(world, ped.x, ped.y, 8, '#d94f3d', 120);
        return false;
      }
    }
    return true;
  });
}

function updateWanted(world, dt) {
  const p = world.player;
  const safe = LANDMARKS.safehouse;
  const inSafehouse = dist(p.x, p.y, safe.x, safe.y) < TUNING.safehouseRadius;
  let seen = false;
  for (const car of world.cars) {
    if (car.kind === 'police' && car.driver === 'police' && dist(p.x, p.y, car.x, car.y) < 480) {
      seen = true;
      break;
    }
  }
  if (!seen) {
    for (const cop of world.cops) {
      if (dist(p.x, p.y, cop.x, cop.y) < 420) {
        seen = true;
        break;
      }
    }
  }
  if (inSafehouse) {
    world.wanted.heat = Math.max(0, world.wanted.heat - TUNING.heatDecaySafehouse * dt);
  } else if (!seen) {
    world.wanted.heat = Math.max(0, world.wanted.heat - TUNING.heatDecayUnseen * dt);
  }
  world.wanted.stars = world.wanted.heat <= 0 ? 0 : Math.min(TUNING.maxStars, Math.ceil(world.wanted.heat / TUNING.heatPerStar));
}

function updateCamera(world, dt) {
  const p = world.player;
  const tx = clamp(p.x, 640, WORLD_W - 640);
  const ty = clamp(p.y, 360, WORLD_H - 360);
  const k = 1 - Math.exp(-6 * dt);
  world.camera.x += (tx - world.camera.x) * k;
  world.camera.y += (ty - world.camera.y) * k;
  world.shake = Math.max(0, world.shake - 30 * dt);
}

// One fixed step of the simulation. Input shape:
// { moveX, moveY, run, throttle, steer, brake, interact, fire, aimX, aimY }
export function stepWorld(world, input, dt) {
  if (world.frozen) return;
  world.time += dt;
  const p = world.player;
  // Health comes back slowly once the player has been safe for a while.
  if (p.hp > 0 && p.hp < 100 && world.time - p.lastDamageT > TUNING.hpRegenDelay) {
    p.hp = Math.min(100, p.hp + TUNING.hpRegenRate * dt);
  }
  updatePlayer(world, input, dt);
  if (world.frozen) return;
  updateTraffic(world, dt);
  updatePolice(world, dt);
  updateCops(world, dt);
  updatePeds(world, dt);
  updateCarCollisions(world);
  updateBullets(world, dt);
  updateWanted(world, dt);
  // The title screen steps the world to keep traffic alive, but the
  // mission clock must not run until the player actually starts.
  if (!world.freezeMission) updateMission(world, dt);
  for (const part of world.particles) {
    part.x += part.vx * dt;
    part.y += part.vy * dt;
    part.vx *= 1 - 2.4 * dt;
    part.vy *= 1 - 2.4 * dt;
    part.life -= dt;
  }
  world.particles = world.particles.filter((part) => part.life > 0);
  updateCamera(world, dt);
}

export { LANDMARKS, PALETTE, TUNING, WORLD };
