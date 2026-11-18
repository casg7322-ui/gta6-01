// Boot and the one loop for Solara Bay: input is read every frame, the world
// advances in fixed 1/60 s steps, and the renderer paints what is there. The
// game moves between title, play, paused, busted and complete screens.
// ?seed=N fixes the city and traffic. ?shot=title|play|chase|mission|complete
// (with &seed=N) stages that scene instead of running the loop, paints it
// twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, loadSave } from './world.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_COMPLETE, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';
import { ensureAudio, playSfx, toggleMute, updateAmbience } from './audio.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const saved = loadSave();
const world = createWorld(createRandom(seed), seed, saved);
const renderer = createRenderer(canvas);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    const extra = { saveExists: !!saved, saveMission: saved?.missionIndex ?? 0, saveMoney: saved?.money ?? 0, muted: false };
    renderer.draw(world.state, scene.screen, extra);
    painted += 1;
    if (painted < 3) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let muted = false;
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  function startGame(fresh) {
    ensureAudio();
    if (fresh) {
      try { window.localStorage.removeItem(SAVE_KEY); } catch {}
      const freshWorld = createWorld(createRandom(seed), seed, null);
      // Swap the world's state in place so the renderer keeps working.
      Object.assign(world.state, freshWorld.state);
      world.state.cars = freshWorld.state.cars;
      world.state.peds = freshWorld.state.peds;
    }
    world.state.missionBriefT = 2.5;
    world.state.missionActive = false;
    screen = SCREEN_PLAY;
    announce('Playing. Mara Voss, Solara Bay.');
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      muted = toggleMute();
    }
    if (actions & ACTION_CONFIRM) {
      ensureAudio();
      if (screen === SCREEN_TITLE) startGame(false);
      else if (screen === SCREEN_OVER || screen === SCREEN_BUSTED || screen === SCREEN_COMPLETE) startGame(true);
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
    return actions;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = handleActions();
    const frameInput = input.frameInput(renderer.camera);
    frameInput.enter = !!(actions & ACTION_ENTER) && screen === SCREEN_PLAY;
    if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP) {
        const events = world.step(STEP, frameInput);
        frameInput.enter = false;
        frameInput.shoot = false;
        accumulator -= STEP;
        if (world.state.complete) screen = SCREEN_COMPLETE;
        void events;
      }
      const p = world.state.player;
      const car = p.inCar ? world.state.cars.find((c) => c.id === p.inCar) : null;
      updateAmbience(p.wanted, !!car, car ? car.speed : 0);
      for (const sfx of world.state.sfx) playSfx(sfx);
    } else if (screen === SCREEN_TITLE) {
      // The city lives behind the title.
      while (accumulator >= STEP) {
        world.step(STEP, { up: false, down: false, left: false, right: false, run: false, enter: false, shoot: false });
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    const extra = {
      saveExists: !!saved,
      saveMission: saved?.missionIndex ?? 0,
      saveMoney: saved?.money ?? 0,
      muted,
    };
    renderer.draw(world.state, screen, extra);
    if (world.state.complete && screen === SCREEN_PLAY) screen = SCREEN_COMPLETE;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Solara Bay. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
