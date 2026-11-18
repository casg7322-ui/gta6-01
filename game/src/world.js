// World simulation for Solara Bay. Pure logic (no DOM, no canvas) so the
// Node win-proof can run the exact same code headlessly. The browser only
// feeds input in and draws state out.
import {
  CAR, COP, EVENTS, PITCH, PLAYER, STEP, WORLD_H, WORLD_W,
  WANTED_MAX, SAVE_KEY,
} from './config.js';
import { buildCity, findPath, hitBuilding, moveCircle, PLACES, randomRoadPoint } from './city.js';
import { MISSIONS, missionByIndex } from './missions.js';

const CAR_COLORS = ['#e74c3c', '#3498db', '#f1c40f', '#ecf0f1', '#2ecc71', '#9b59b6', '#e67e22', '#1abc9c', '#95a5a6', '#d35400'];
const CAR_NAMES = ['Comet', 'Sandpiper', 'Marlin', 'Pelican', 'Cactus', 'Sunbeam', 'Dune', 'Coral', 'Harbor', 'Flamingo'];
const PED_SHIRTS = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#9b59b6', '#e67e22', '#ecf0f1', '#fd79a8'];

let nextId = 1;

function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function dist(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

export function createWorld(rng, seed = 7, saved = null) {
  const city = buildCity(rng);
  const state = {
    seed,
    time: 0,
    city,
    player: {
      x: PLACES.safehouse.x + 60, y: PLACES.safehouse.y + 40, angle: 0,
      hp: PLAYER.health, money: PLAYER.startMoney, ammo: PLAYER.startAmmo,
      inCar: null, wanted: 0, wantedTimer: 0, quietTimer: 0,
      fireCooldown: 0, respawnT: 0,
    },
    cars: [],
    peds: [],
    cops: [],
    bullets: [],
    particles: [],
    missionIndex: 0,
    missionStep: 0,
    missionTimer: 0,
    missionActive: false,
    missionBriefT: 0,
    checkpointIndex: 0,
    banner: null,
    stats: { missionsDone: 0, carsStolen: 0, pedsDown: 0, copsDown: 0, moneyEarned: 0, distanceDriven: 0 },
    over: false,
    busted: false,
    complete: false,
    sfx: [],
  };

  if (saved) {
    state.player.money = saved.money ?? PLAYER.startMoney;
    state.missionIndex = Math.min(saved.missionIndex ?? 0, MISSIONS.length);
    state.player.x = saved.x ?? state.player.x;
    state.player.y = saved.y ?? state.player.y;
    state.stats = { ...state.stats, ...(saved.stats ?? {}) };
  }

  const world = { state, rng };

  function spawnCar(kind, x, y, angle, withDriver) {
    const car = {
      id: nextId += 1, kind, x, y, angle, speed: 0, color: rng.pick(CAR_COLORS),
      name: rng.pick(CAR_NAMES), driver: withDriver ? 'npc' : null, hp: CAR.health,
      path: [], pathIndex: 0, repathT: 0, targetSpeed: rng.range(140, 200),
      stuckT: 0, ramCooldown: 0, sirenT: rng.next() * 0.5,
    };
    state.cars.push(car);
    return car;
  }

  function spawnPed(x, y) {
    const ped = {
      id: nextId += 1, x, y, angle: rng.range(0, Math.PI * 2),
      speed: rng.range(55, 95), state: 'walk', panicT: 0,
      path: [], pathIndex: 0, repathT: 0, down: false, shirt: rng.pick(PED_SHIRTS),
    };
    state.peds.push(ped);
    return ped;
  }

  function retargetCar(car) {
    const dest = randomRoadPoint(rng);
    car.path = findPath(car.x, car.y, dest.x, dest.y);
    car.pathIndex = 0;
    car.repathT = rng.range(4, 9);
  }

  function retargetPed(ped) {
    const dest = randomRoadPoint(rng);
    ped.path = findPath(ped.x, ped.y, dest.x, dest.y);
    ped.pathIndex = 0;
    ped.repathT = rng.range(6, 12);
  }

  function seedPopulation() {
    // Traffic cars on the roads.
    for (let i = 0; i < 14; i += 1) {
      const p = randomRoadPoint(rng);
      const axis = rng.chance(0.5) ? 0 : Math.PI / 2;
      const c = spawnCar('traffic', p.x, p.y, axis + (rng.chance(0.5) ? 0 : Math.PI), true);
      retargetCar(c);
    }
    // Parked cars along road edges (some with a driver inside).
    for (let i = 0; i < 12; i += 1) {
      const p = randomRoadPoint(rng);
      const vertical = rng.chance(0.5);
      const off = (rng.chance(0.5) ? 1 : -1) * 34;
      const x = vertical ? p.x + off : p.x;
      const y = vertical ? p.y : p.y + off;
      if (hitBuilding(city, x, y, 24)) continue;
      spawnCar('parked', x, y, vertical ? Math.PI / 2 : 0, rng.chance(0.35));
    }
    // A couple of cars near the safehouse so mission 1 starts fast.
    spawnCar('parked', PLACES.safehouse.x + 34, PLACES.safehouse.y + 120, Math.PI / 2, false);
    spawnCar('parked', PLACES.safehouse.x - 34, PLACES.safehouse.y - 140, -Math.PI / 2, false);
    for (let i = 0; i < 26; i += 1) {
      const p = randomRoadPoint(rng);
      const ped = spawnPed(p.x, p.y);
      retargetPed(ped);
    }
  }

  function addWanted(n, reason) {
    const p = state.player;
    const before = p.wanted;
    p.wanted = Math.max(0, Math.min(WANTED_MAX, p.wanted + n));
    p.quietTimer = 0;
    if (p.wanted > before) {
      state.sfx.push('wanted');
      return EVENTS.WANTED_UP;
    }
    return EVENTS.NONE;
  }

  function playerPos() {
    const p = state.player;
    if (p.inCar) {
      const car = state.cars.find((c) => c.id === p.inCar);
      if (car) return { x: car.x, y: car.y };
    }
    return { x: p.x, y: p.y };
  }

  function currentMission() {
    return missionByIndex(state.missionIndex);
  }

  function currentStep() {
    const m = currentMission();
    return m ? m.steps[state.missionStep] : null;
  }

  function startMissionStep() {
    const step = currentStep();
    if (!step) return;
    state.missionTimer = step.time ?? 0;
    state.checkpointIndex = 0;
    if (step.wantedOnEnter) addWanted(step.wantedOnEnter, 'heat');
    if (step.type === 'lose-wanted') addWanted(2, 'spotted');
  }

  function completeStep() {
    state.missionStep += 1;
    const m = currentMission();
    if (state.missionStep >= m.steps.length) {
      completeMission();
    } else {
      startMissionStep();
    }
  }

  function completeMission() {
    const m = currentMission();
    state.player.money += m.reward;
    state.stats.missionsDone += 1;
    state.stats.moneyEarned += m.reward;
    state.banner = { title: 'MISSION COMPLETE', sub: `${m.title} — +$${m.reward}`, t: 4, kind: 'good' };
    state.sfx.push('mission');
    state.missionIndex += 1;
    state.missionStep = 0;
    state.missionActive = false;
    state.missionBriefT = 2.5;
    if (state.missionIndex >= MISSIONS.length) {
      state.complete = true;
      state.banner = { title: 'KING OF SOLARA', sub: 'You finished the story. Solara Bay is yours — free roam unlocked.', t: 6, kind: 'win' };
      state.sfx.push('win');
    }
    saveGame();
  }

  function failStep(reason) {
    state.banner = { title: 'FAILED', sub: reason, t: 3, kind: 'bad' };
    state.sfx.push('fail');
    startMissionStep();
  }

  function saveGame() {
    try {
      const pos = playerPos();
      const data = {
        money: state.player.money, missionIndex: state.missionIndex,
        x: pos.x, y: pos.y, stats: state.stats,
      };
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      }
      world._savedData = data;
    } catch { /* storage off — progress lasts this visit only */ }
  }

  function respawn(reason) {
    const p = state.player;
    const loss = Math.min(p.money, Math.max(100, Math.floor(p.money * 0.2)));
    p.money -= loss;
    p.hp = PLAYER.health;
    p.wanted = 0;
    p.inCar = null;
    p.x = PLACES.safehouse.x + 60;
    p.y = PLACES.safehouse.y + 40;
    state.cops = [];
    state.cars = state.cars.filter((c) => c.kind !== 'police');
    state.banner = { title: reason === 'busted' ? 'BUSTED' : 'WASTED', sub: `You lost $${loss}. Back at the safehouse.`, t: 4, kind: 'bad' };
    startMissionStep();
    saveGame();
  }

  function nearestCar(x, y, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const c of state.cars) {
      if (c.hp <= 0) continue;
      const d = dist(x, y, c.x, c.y);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  function enterCar(car) {
    const p = state.player;
    if (car.kind === 'police') addWanted(2, 'cop-car');
    else if (car.driver === 'npc') {
      addWanted(1, 'steal');
      state.stats.carsStolen += 1;
      // The driver bails out and runs.
      const ped = spawnPed(car.x + 30, car.y + 30);
      ped.state = 'flee';
      ped.panicT = 5;
      state.sfx.push('steal');
    } else if (car.kind === 'parked' || car.kind === 'traffic') {
      addWanted(1, 'steal');
      state.stats.carsStolen += 1;
      state.sfx.push('steal');
    }
    car.driver = 'player';
    car.kind = 'player';
    p.inCar = car.id;
    p.x = car.x;
    p.y = car.y;
    if (currentStep()?.type === 'steal-car') completeStep();
  }

  function exitCar() {
    const p = state.player;
    const car = state.cars.find((c) => c.id === p.inCar);
    if (!car) { p.inCar = null; return; }
    car.driver = null;
    car.kind = 'parked';
    car.speed = 0;
    const side = car.angle + Math.PI / 2;
    const px = Math.max(PLAYER.radius + 2, Math.min(WORLD_W - PLAYER.radius - 2, car.x + Math.cos(side) * 40));
    const py = Math.max(PLAYER.radius + 2, Math.min(WORLD_H - PLAYER.radius - 2, car.y + Math.sin(side) * 40));
    const moved = moveCircle(city, px, py, 0, 0, PLAYER.radius);
    p.x = moved.x;
    p.y = moved.y;
    p.angle = car.angle;
    p.inCar = null;
  }

  function shootAt(tx, ty) {
    const p = state.player;
    if (p.inCar || p.fireCooldown > 0) return;
    p.fireCooldown = 0.22;
    const a = angleTo(p.x, p.y, tx, ty);
    p.angle = a;
    state.bullets.push({
      x: p.x + Math.cos(a) * 20, y: p.y + Math.sin(a) * 20,
      vx: Math.cos(a) * 950, vy: Math.sin(a) * 950, life: 0.6,
    });
    state.sfx.push('shot');
    if (p.wanted === 0) addWanted(1, 'shooting');
  }

  function stepPlayer(dt, input) {
    const p = state.player;
    p.fireCooldown = Math.max(0, p.fireCooldown - dt);
    if (p.inCar) {
      const car = state.cars.find((c) => c.id === p.inCar);
      if (!car || car.hp <= 0) { p.inCar = null; return; }
      const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
      if (input.up) car.speed += CAR.accel * dt;
      else if (input.down) car.speed -= (car.speed > 0 ? CAR.brake : CAR.reverseAccel) * dt;
      else car.speed -= car.speed * CAR.drag * dt;
      car.speed = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, car.speed));
      const turn = steer * CAR.turnRate * dt * (0.35 + 0.65 * Math.min(1, Math.abs(car.speed) / 120)) * (car.speed >= 0 ? 1 : -1);
      car.angle += turn;
      const nx = Math.cos(car.angle) * car.speed * dt;
      const ny = Math.sin(car.angle) * car.speed * dt;
      const before = { x: car.x, y: car.y };
      const moved = moveCircle(city, car.x, car.y, nx, ny, CAR.radius);
      car.x = moved.x;
      car.y = moved.y;
      if (moved.hit && Math.abs(car.speed) > 180) {
        car.hp -= 12;
        car.speed *= -0.25;
        state.sfx.push('crash');
        state.particles.push({ x: car.x, y: car.y, t: 0.4, kind: 'crash' });
      } else if (moved.hit) {
        car.speed *= 0.4;
      }
      state.stats.distanceDriven += dist(before.x, before.y, car.x, car.y);
      p.x = car.x;
      p.y = car.y;
      p.angle = car.angle;
      if (car.hp <= 0) {
        exitCar();
        state.sfx.push('crash');
      }
      if (input.enter) exitCar();
      return;
    }
    // On foot.
    let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const len = Math.hypot(mx, my);
    if (len > 0) {
      mx /= len;
      my /= len;
      const speed = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
      const moved = moveCircle(city, p.x, p.y, mx * speed * dt, my * speed * dt, PLAYER.radius);
      p.x = moved.x;
      p.y = moved.y;
      p.angle = Math.atan2(my, mx);
    }
    if (input.shoot && input.aimX !== undefined) shootAt(input.aimX, input.aimY);
    if (input.enter) {
      const car = nearestCar(p.x, p.y, 52);
      if (car) enterCar(car);
    }
  }

  function stepCarAI(car, dt) {
    if (car.kind === 'parked' || car.hp <= 0) return;
    car.repathT -= dt;
    if (car.pathIndex >= car.path.length || car.repathT <= 0) retargetCar(car);
    const target = car.path[car.pathIndex];
    if (!target) return;
    const d = dist(car.x, car.y, target.x, target.y);
    if (d < 26) { car.pathIndex += 1; return; }
    // Slow down for the car ahead.
    let desired = car.targetSpeed;
    for (const other of state.cars) {
      if (other === car || other.hp <= 0) continue;
      const od = dist(car.x, car.y, other.x, other.y);
      if (od < 70) {
        const ahead = Math.cos(angleTo(car.x, car.y, other.x, other.y) - car.angle);
        if (ahead > 0.6) desired = Math.min(desired, 40);
      }
    }
    const want = angleTo(car.x, car.y, target.x, target.y);
    const diff = angleDiff(car.angle, want);
    car.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
    if (Math.abs(diff) > 1.1) desired = Math.min(desired, 70);
    car.speed += Math.max(-260 * dt, Math.min(260 * dt, desired - car.speed));
    const nx = Math.cos(car.angle) * car.speed * dt;
    const ny = Math.sin(car.angle) * car.speed * dt;
    const moved = moveCircle(city, car.x, car.y, nx, ny, CAR.radius);
    if (moved.hit) {
      car.speed *= 0.3;
      car.pathIndex += 1;
    }
    car.x = moved.x;
    car.y = moved.y;
  }

  function stepPeds(dt) {
    const pos = playerPos();
    for (const ped of state.peds) {
      if (ped.down) continue;
      // Flee from gunfire, speeding cars and the player when the heat is on.
      let threat = null;
      if (state.player.wanted >= 2) threat = pos;
      for (const b of state.bullets) {
        if (dist(ped.x, ped.y, b.x, b.y) < 200) threat = { x: b.x, y: b.y };
      }
      if (threat && ped.state !== 'flee') { ped.state = 'flee'; ped.panicT = 4; }
      if (ped.state === 'flee') {
        ped.panicT -= dt;
        if (!threat || ped.panicT <= 0) { ped.state = 'walk'; retargetPed(ped); continue; }
        const a = angleTo(threat.x, threat.y, ped.x, ped.y);
        const moved = moveCircle(city, ped.x, ped.y, Math.cos(a) * 170 * dt, Math.sin(a) * 170 * dt, 10);
        ped.x = moved.x;
        ped.y = moved.y;
        ped.angle = a;
        continue;
      }
      ped.repathT -= dt;
      if (ped.pathIndex >= ped.path.length || ped.repathT <= 0) retargetPed(ped);
      const target = ped.path[ped.pathIndex];
      if (!target) continue;
      if (dist(ped.x, ped.y, target.x, target.y) < 18) { ped.pathIndex += 1; continue; }
      const a = angleTo(ped.x, ped.y, target.x, target.y);
      const moved = moveCircle(city, ped.x, ped.y, Math.cos(a) * ped.speed * dt, Math.sin(a) * ped.speed * dt, 10);
      ped.x = moved.x;
      ped.y = moved.y;
      ped.angle = a;
    }
  }

  function spawnPolice() {
    const p = state.player;
    const pos = playerPos();
    const want = Math.min(p.wanted + 1, 5);
    const active = state.cars.filter((c) => c.kind === 'police' && c.hp > 0).length;
    if (active >= want) return;
    // Spawn at an inner road intersection away from the player.
    for (let tries = 0; tries < 8; tries += 1) {
      const node = { i: rng.int(1, 9), j: rng.int(1, 7) };
      const x = node.i * PITCH;
      const y = node.j * PITCH;
      if (dist(x, y, pos.x, pos.y) < 700) continue;
      const car = spawnCar('police', x, y, rng.range(0, Math.PI * 2), 'cop');
      car.color = '#2b4acb';
      car.targetSpeed = COP.carSpeed;
      return;
    }
  }

  function stepPolice(dt) {
    const p = state.player;
    const pos = playerPos();
    const step = currentStep();
    // The safehouse is a real hideout: while the player sits there on the
    // lose-wanted job, the police lose the trail and stop hunting.
    const hiding = step?.type === 'lose-wanted' && dist(pos.x, pos.y, PLACES.safehouse.x, PLACES.safehouse.y) < 140;
    // No heat, no hunt: once the wanted level hits zero the SBPD lost the
    // trail — cruisers drive off and foot cops stand down instead of
    // busting a player the law is no longer after.
    const calm = hiding || p.wanted === 0;
    if (calm) {
      state.cops = [];
      for (const car of state.cars) {
        if (car.kind !== 'police' || car.hp <= 0) continue;
        car.repathT -= dt;
        if (car.repathT <= 0 || car.pathIndex >= car.path.length) retargetCar(car);
        stepCarAI(car, dt);
      }
    } else {
      spawnPolice();
    }
    for (const car of state.cars) {
      if (car.kind !== 'police' || car.hp <= 0) continue;
      if (calm) continue;
      car.sirenT += dt;
      car.repathT -= dt;
      if (car.repathT <= 0 || car.pathIndex >= car.path.length) {
        car.path = findPath(car.x, car.y, pos.x, pos.y);
        car.pathIndex = 0;
        car.repathT = 1;
      }
      const target = car.path[car.pathIndex];
      if (target) {
        if (dist(car.x, car.y, target.x, target.y) < 26) car.pathIndex += 1;
        const want = angleTo(car.x, car.y, target.x, target.y);
        const diff = angleDiff(car.angle, want);
        car.angle += Math.max(-3 * dt, Math.min(3 * dt, diff));
        const desired = Math.abs(diff) > 1 ? 120 : COP.carSpeed;
        car.speed += Math.max(-320 * dt, Math.min(320 * dt, desired - car.speed));
      }
      const nx = Math.cos(car.angle) * car.speed * dt;
      const ny = Math.sin(car.angle) * car.speed * dt;
      const moved = moveCircle(city, car.x, car.y, nx, ny, CAR.radius);
      car.x = moved.x;
      car.y = moved.y;
      if (moved.hit) car.speed *= 0.4;
      // Ram the player's car.
      if (p.inCar) {
        const pc = state.cars.find((c) => c.id === p.inCar);
        if (pc && car.ramCooldown <= 0 && dist(car.x, car.y, pc.x, pc.y) < 52) {
          pc.hp -= COP.ramDamage;
          car.ramCooldown = 0.8;
          state.sfx.push('crash');
          state.particles.push({ x: pc.x, y: pc.y, t: 0.4, kind: 'crash' });
          if (pc.hp <= 0) { exitCar(); state.sfx.push('crash'); }
        }
      } else if (dist(car.x, car.y, p.x, p.y) < 44) {
        // A cop car catches the player on foot: busted.
        state.busted = true;
      }
      car.ramCooldown = Math.max(0, car.ramCooldown - dt);
    }
    // Foot cops when the player is on foot and the heat is on.
    if (!calm && p.wanted >= 2 && !p.inCar && state.cops.length < 2) {
      if (rng.chance(dt * 0.7)) {
        state.cops.push({
          id: nextId += 1, x: pos.x + (rng.chance(0.5) ? 320 : -320), y: pos.y + rng.range(-200, 200),
          angle: 0, speed: COP.footSpeed,
        });
      }
    }
    for (const cop of state.cops) {
      const a = angleTo(cop.x, cop.y, pos.x, pos.y);
      cop.angle = a;
      const moved = moveCircle(city, cop.x, cop.y, Math.cos(a) * cop.speed * dt, Math.sin(a) * cop.speed * dt, 12);
      cop.x = moved.x;
      cop.y = moved.y;
      if (dist(cop.x, cop.y, p.x, p.y) < 30 && !p.inCar) state.busted = true;
    }
    // The heat cools when no cop can see the player.
    let nearestCop = Infinity;
    for (const c of state.cars) if (c.kind === 'police' && c.hp > 0) nearestCop = Math.min(nearestCop, dist(c.x, c.y, pos.x, pos.y));
    for (const c of state.cops) nearestCop = Math.min(nearestCop, dist(c.x, c.y, pos.x, pos.y));
    if (p.wanted > 0) {
      if (hiding) {
        p.wantedTimer += dt;
        if (p.wantedTimer >= 2.5) { p.wanted -= 1; p.wantedTimer = 0; state.sfx.push('cooldown'); }
      } else if (nearestCop > 520) {
        p.quietTimer += dt;
        if (p.quietTimer >= 8) { p.wanted -= 1; p.quietTimer = 0; state.sfx.push('cooldown'); }
      } else {
        p.quietTimer = 0;
        p.wantedTimer = 0;
      }
    }
  }

  function stepBullets(dt) {
    for (const b of state.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0) continue;
      if (hitBuilding(city, b.x, b.y, 2)) { b.life = 0; continue; }
      for (const ped of state.peds) {
        if (!ped.down && dist(b.x, b.y, ped.x, ped.y) < 15) {
          ped.down = true;
          b.life = 0;
          state.stats.pedsDown += 1;
          addWanted(1, 'assault');
          state.particles.push({ x: ped.x, y: ped.y, t: 0.5, kind: 'hit' });
          break;
        }
      }
      if (b.life <= 0) continue;
      for (const cop of state.cops) {
        if (dist(b.x, b.y, cop.x, cop.y) < 15) {
          state.cops = state.cops.filter((c) => c !== cop);
          b.life = 0;
          state.stats.copsDown += 1;
          addWanted(1, 'cop-down');
          state.particles.push({ x: cop.x, y: cop.y, t: 0.5, kind: 'hit' });
          break;
        }
      }
      if (b.life <= 0) continue;
      for (const car of state.cars) {
        if (car.hp > 0 && dist(b.x, b.y, car.x, car.y) < 22) {
          car.hp -= 34;
          b.life = 0;
          if (car.kind === 'police' && car.hp <= 0) {
            state.stats.copsDown += 1;
            addWanted(1, 'cop-down');
          }
          break;
        }
      }
    }
    state.bullets = state.bullets.filter((b) => b.life > 0);
  }

  function stepCarPedCollisions() {
    const p = state.player;
    if (!p.inCar) return;
    const car = state.cars.find((c) => c.id === p.inCar);
    if (!car || Math.abs(car.speed) < 150) return;
    for (const ped of state.peds) {
      if (ped.down) continue;
      if (dist(car.x, car.y, ped.x, ped.y) < 30) {
        ped.down = true;
        state.stats.pedsDown += 1;
        addWanted(1, 'hit-and-run');
        state.particles.push({ x: ped.x, y: ped.y, t: 0.5, kind: 'hit' });
      }
    }
  }

  function stepMissions(dt) {
    const m = currentMission();
    if (!m) return;
    if (!state.missionActive) {
      state.missionBriefT -= dt;
      if (state.missionBriefT <= 0) {
        state.missionActive = true;
        startMissionStep();
      }
      return;
    }
    const step = currentStep();
    if (!step) return;
    const pos = playerPos();
    if (step.time) {
      state.missionTimer -= dt;
      if (state.missionTimer <= 0) {
        failStep(step.type === 'checkpoints' ? 'Out of time — the crew moved on.' : 'Out of time — try again.');
        return;
      }
    }
    if (step.type === 'goto' || step.type === 'goto-timed') {
      const place = PLACES[step.place];
      if (dist(pos.x, pos.y, place.x, place.y) < (step.radius ?? 90)) completeStep();
    } else if (step.type === 'checkpoints') {
      const places = step.places.map((k) => PLACES[k]);
      const target = places[state.checkpointIndex];
      if (target && dist(pos.x, pos.y, target.x, target.y) < 90) {
        state.checkpointIndex += 1;
        state.sfx.push('checkpoint');
        if (state.checkpointIndex >= places.length) completeStep();
      }
    } else if (step.type === 'lose-wanted') {
      const atHouse = dist(pos.x, pos.y, PLACES.safehouse.x, PLACES.safehouse.y) < (step.radius ?? 110);
      if (atHouse && state.player.wanted === 0) completeStep();
    }
    // A 'steal-car' step completes inside enterCar().
  }

  function step(dt, input) {
    state.sfx = [];
    state.time += dt;
    let events = EVENTS.NONE;
    if (state.banner) {
      state.banner.t -= dt;
      if (state.banner.t <= 0) state.banner = null;
    }
    for (const pt of state.particles) pt.t -= dt;
    state.particles = state.particles.filter((pt) => pt.t > 0);

    if (!state.over && !state.busted && !state.complete) {
      stepPlayer(dt, input);
      for (const car of state.cars) {
        if (car.kind === 'traffic' && car.hp > 0) stepCarAI(car, dt);
      }
      stepPeds(dt);
      stepPolice(dt);
      stepBullets(dt);
      stepCarPedCollisions();
      stepMissions(dt);
      // Health regens when calm.
      if (state.player.wanted === 0 && state.player.hp < PLAYER.health) {
        state.player.hp = Math.min(PLAYER.health, state.player.hp + 2 * dt);
      }
      if (state.player.hp <= 0) {
        events |= EVENTS.WASTED;
        state.sfx.push('wasted');
        respawn('wasted');
      }
      if (state.busted) {
        state.busted = false;
        events |= EVENTS.BUSTED;
        state.sfx.push('busted');
        respawn('busted');
      }
    }
    if (state.complete && !world._winReported) {
      world._winReported = true;
      events |= EVENTS.WIN;
    }
    return events;
  }

  seedPopulation();
  state.missionBriefT = 2.5;
  world.step = step;
  world.saveGame = saveGame;
  world.currentMission = currentMission;
  world.currentStep = currentStep;
  world.playerPos = playerPos;
  world.addWanted = addWanted;
  world.nearestCar = nearestCar;
  world.enterCar = enterCar;
  world.exitCar = exitCar;
  world.state = state;
  return world;
}

export function loadSave() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
