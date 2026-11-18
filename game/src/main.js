// Solara Bay — boot, game loop, screens, save/load.
// The loop is the only place that touches the DOM; the simulation in
// world.js stays pure so Node can run it headless.

import { SAVE_KEY, WORLD } from './config.js';
import { createPilot, drivePilot } from './autopilot.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { drawBriefing, drawCenterMessage, drawComplete, drawHud, drawTitle, drawWorld, VIEW_H, VIEW_W } from './render.js';
import { applyShot } from './shots.js';
import { createWorld, nearestStealableCar, resumeFromOverlay, stepWorld } from './world.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (typeof save.cash !== 'number' || typeof save.missionIndex !== 'number') return null;
    return save;
  } catch {
    return null;
  }
}

function writeSave(world) {
  try {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ cash: world.cash, missionIndex: Math.min(world.mission.index, 5) }),
    );
  } catch {
    // Storage unavailable (private mode, file://): the game still plays.
  }
}

function seedFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const seed = Number(params.get('seed'));
  if (Number.isInteger(seed) && seed > 0) return seed;
  return (Date.now() % 90000) + 7;
}

const save = readSave();
const seed = seedFromUrl();

const game = {
  world: createWorld(seed),
  screen: 'title', // title | playing | paused | busted | wasted | complete
  pilot: createPilot(),
  autoPilot: false,
  input: createInput(canvas),
  audio: createAudio(),
  muted: false,
  hintT: 12,
  completeShown: false,
  shotReady: false,
  shotFlagged: false,
  hasSave: save !== null,
  time: 0,
};

// The mission clock stays frozen while the title screen shows.
game.world.freezeMission = true;

function startGame(useSave) {
  if (useSave && save) {
    game.world = createWorld(seed, { cash: save.cash, missionIndex: save.missionIndex });
    if (save.missionIndex >= 5) game.completeShown = true;
  } else {
    game.world = createWorld(seed);
  }
  game.pilot = createPilot();
  game.world.freezeMission = false;
  game.screen = 'playing';
  game.hintT = 12;
  game.audio.unlock();
  game.audio.click();
}

function drainEvents() {
  for (const e of game.world.events) {
    if (e.type === 'shot') game.audio.shot();
    else if (e.type === 'crash') game.audio.crash(e.mag);
    else if (e.type === 'enterCar') game.audio.steal();
    else if (e.type === 'missionComplete') {
      game.audio.jingle(true);
      writeSave(game.world);
    } else if (e.type === 'missionFailed') game.audio.jingle(false);
    else if (e.type === 'gameComplete') {
      game.audio.jingle(true);
      writeSave(game.world);
      game.screen = 'complete';
      game.completeShown = true;
    } else if (e.type === 'busted' || e.type === 'wasted') {
      game.audio.busted();
      game.screen = e.type;
      writeSave(game.world);
    }
  }
  game.world.events.length = 0;
}

function updateAudio(dt) {
  const world = game.world;
  const p = world.player;
  game.audio.engine(p.inCar ? Math.abs(p.speed) / 540 : 0, p.inCar);
  let siren = false;
  for (const car of world.cars) {
    if (car.kind === 'police' && car.driver === 'police') {
      const d = Math.hypot(car.x - p.x, car.y - p.y);
      if (d < 750) {
        siren = true;
        break;
      }
    }
  }
  game.audio.siren(siren && world.wanted.stars > 0, dt);
}

function stepGame(dt) {
  const world = game.world;
  if (game.screen !== 'playing') return;
  const input = game.autoPilot ? drivePilot(game.pilot, world, dt) : game.input.read(world.camera);
  // Skip the briefing early with Enter.
  if (world.mission.phase === 'briefing' && game.input.wasPressed('Enter')) {
    world.mission.briefingT = 0;
  }
  stepWorld(world, input, dt);
  drainEvents();
  game.hintT = Math.max(0, game.hintT - dt);
  // Keep the world alive behind the title too (traffic, crowds).
  if (world.overlay && game.screen === 'playing') {
    game.screen = world.overlay;
  }
}

function drawGame() {
  const world = game.world;
  const p = world.player;
  if (game.screen === 'title') {
    // Slow pan over the living city.
    const t = game.time * 0.05;
    world.camera.x = 1920 + Math.cos(t) * 700;
    world.camera.y = 1536 + Math.sin(t * 0.8) * 420;
    drawTitle(ctx, world, { hasSave: game.hasSave });
    return;
  }
  if (game.screen === 'complete') {
    drawComplete(ctx, world);
    return;
  }
  drawWorld(ctx, world);
  if (game.screen === 'playing') {
    let prompt = null;
    if (!p.inCar) {
      const near = nearestStealableCar(world, p.x, p.y, 90);
      if (near) prompt = near.kind === 'police' ? 'Press E to steal the police car  (+2 wanted)' : 'Press E to steal this car';
    }
    drawHud(ctx, world, { prompt, showHint: game.hintT > 0 });
    if (world.mission.phase === 'briefing') drawBriefing(ctx, world);
    return;
  }
  if (game.screen === 'paused') {
    drawHud(ctx, world, {});
    ctx.fillStyle = 'rgba(18, 14, 8, 0.6)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fbf6e9';
    ctx.font = '900 56px Georgia, serif';
    ctx.fillText('PAUSED', VIEW_W / 2, VIEW_H / 2 - 30);
    ctx.fillStyle = 'rgba(251,246,233,0.85)';
    ctx.font = '16px Trebuchet MS, Verdana, sans-serif';
    ctx.fillText('WASD walk & drive  ·  E steal / enter / exit  ·  Mouse aim + click shoot', VIEW_W / 2, VIEW_H / 2 + 16);
    ctx.fillText('Shift run  ·  Space brake  ·  M mute  ·  Esc resume', VIEW_W / 2, VIEW_H / 2 + 44);
    return;
  }
  if (game.screen === 'busted') {
    drawCenterMessage(ctx, 'BUSTED', ['The SBPD finally caught up with Mara.', 'They take their cut. The debt stays.'], '#7fb2ff');
    return;
  }
  if (game.screen === 'wasted') {
    drawCenterMessage(ctx, 'WASTED', ['Mara wakes up at the safehouse, lighter in the pocket.', 'Solara Bay is not done with her yet.'], '#ff7a6b');
  }
}

function handleKeys() {
  const input = game.input;
  if (input.wasPressed('KeyM')) {
    game.muted = !game.muted;
    game.audio.setMuted(game.muted);
  }
  if (game.screen === 'title') {
    if (input.wasPressed('Enter') || input.consumeClick()) {
      startGame(game.hasSave);
    } else if (input.wasPressed('KeyN')) {
      startGame(false);
    }
    return;
  }
  if (game.screen === 'playing') {
    if (input.wasPressed('Escape') || input.wasPressed('KeyP')) {
      game.screen = 'paused';
      game.audio.click();
    }
    return;
  }
  if (game.screen === 'paused') {
    if (input.wasPressed('Escape') || input.wasPressed('KeyP') || input.wasPressed('Enter')) {
      game.screen = 'playing';
      game.audio.click();
    }
    return;
  }
  if (game.screen === 'busted' || game.screen === 'wasted') {
    if (input.wasPressed('Enter') || input.consumeClick()) {
      resumeFromOverlay(game.world);
      game.screen = 'playing';
      game.audio.click();
    }
    return;
  }
  if (game.screen === 'complete') {
    if (input.wasPressed('Enter') || input.consumeClick()) {
      game.screen = 'playing';
      game.audio.click();
    }
  }
}

// The title screen's city stays alive: step the world with no input.
function stepTitle(dt) {
  const world = game.world;
  stepWorld(world, { moveX: 0, moveY: 0, run: false, throttle: 0, steer: 0, brake: false, interact: false, fire: false }, dt);
  drainEvents();
}

let last = performance.now();
let acc = 0;
const STEP = 1 / 60;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  game.time += dt;
  game.audio.unlock();
  handleKeys();
  acc += dt;
  let guard = 0;
  while (acc >= STEP && guard < 6) {
    if (game.screen === 'title') stepTitle(STEP);
    else stepGame(STEP);
    acc -= STEP;
    guard += 1;
  }
  if (guard >= 6) acc = 0;
  updateAudio(dt);
  drawGame();
  if (game.shotReady && !game.shotFlagged) {
    game.shotFlagged = true;
    window.__shotReady = true;
  }
  game.input.endFrame();
}

// Staging (?shot=...) runs before the first frame so the screenshot sees
// the finished scene, not the setup.
applyShot(game);
requestAnimationFrame(frame);
