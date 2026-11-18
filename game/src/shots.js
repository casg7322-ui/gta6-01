// Screenshot staging: ?shot=title|play|chase|mission|complete&seed=N
// Stages a REAL scene by fast-forwarding the autopilot through the actual
// game — never a mock — then sets window.__shotReady when the frame is live.

import { LANDMARKS } from './config.js';
import { drivePilot } from './autopilot.js';
import { resumeFromOverlay, stepWorld } from './world.js';

function fastForward(game, seconds, until, onResume) {
  const steps = Math.ceil(seconds * 60);
  for (let i = 0; i < steps; i++) {
    if (game.world.overlay) {
      resumeFromOverlay(game.world);
      if (onResume) onResume(game.world);
    }
    const input = drivePilot(game.pilot, game.world, 1 / 60);
    stepWorld(game.world, input, 1 / 60);
    if (until && until(game.world)) return true;
  }
  return false;
}

function policeNear(world, radius) {
  let n = 0;
  for (const car of world.cars) {
    if (car.kind === 'police' && car.driver === 'police') {
      const d = Math.hypot(car.x - world.player.x, car.y - world.player.y);
      if (d < radius) n += 1;
    }
  }
  return n;
}

function startPlaying(game) {
  game.screen = 'playing';
  game.autoPilot = true;
  game.world.freezeMission = false;
  game.hintT = 0;
}

export function shotParam() {
  const params = new URLSearchParams(window.location.search);
  return params.get('shot');
}

// Runs once at boot when ?shot= is present. Returns true when a shot was staged.
export function applyShot(game) {
  const kind = shotParam();
  if (!kind) return false;
  const world = game.world;

  if (kind === 'title') {
    game.screen = 'title';
    game.shotReady = true;
    return true;
  }

  if (kind === 'complete') {
    world.mission.index = 5;
    world.mission.phase = 'complete';
    world.cash = 2900;
    world.player.x = LANDMARKS.penthouse.x + 60;
    world.player.y = LANDMARKS.penthouse.y + 40;
    world.camera.x = world.player.x;
    world.camera.y = world.player.y;
    game.screen = 'complete';
    game.shotReady = true;
    return true;
  }

  if (kind === 'play') {
    startPlaying(game);
    // Land the frame mid-drive, never mid-briefing: one guarded run that
    // stops the moment the car is moving under an active mission.
    fastForward(game, 75, (w) => w.player.inCar && w.mission.phase === 'active' && Math.abs(w.player.speed) > 150);
    game.shotReady = true;
    return true;
  }

  if (kind === 'chase') {
    startPlaying(game);
    fastForward(game, 30, (w) => w.player.inCar);
    world.wanted.heat = 100;
    const reheat = (w) => {
      w.wanted.heat = 100;
    };
    fastForward(
      game,
      40,
      (w) => w.wanted.stars >= 5 && policeNear(w, 850) >= 2 && policeNear(w, 520) >= 1,
      reheat,
    );
    // Settle into an active chase frame, not a briefing gap.
    fastForward(game, 8, (w) => w.mission.phase === 'active' && policeNear(w, 520) >= 1, reheat);
    game.shotReady = true;
    return true;
  }

  if (kind === 'mission') {
    startPlaying(game);
    fastForward(game, 200, (w) => w.mission.index >= 1 && w.mission.phase === 'active');
    fastForward(game, 12, (w) => w.mission.phase === 'active' && w.player.inCar && Math.abs(w.player.speed) > 120);
    game.shotReady = true;
    return true;
  }

  return false;
}
