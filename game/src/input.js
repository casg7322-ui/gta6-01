// Keyboard + mouse input. Enter / shoot / pause are edge-triggered actions:
// takeActions() returns them once, then clears them, so holding E does not
// enter and exit a car in the same second.
import { SCREENS } from './config.js';

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_MUTE = 8;

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;

  function onKeyDown(e) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'Enter' || e.code === 'Space') actions |= ACTION_CONFIRM;
    if (e.code === 'KeyE') actions |= ACTION_ENTER;
    if (e.code === 'Escape' || e.code === 'KeyP') actions |= ACTION_PAUSE;
    if (e.code === 'KeyM') actions |= ACTION_MUTE;
  }

  function onKeyUp(e) {
    keys.delete(e.code);
  }

  function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
  }

  function onMouseDown(e) {
    onMouseMove(e);
    mouseDown = true;
    actions |= ACTION_CONFIRM;
  }

  function onMouseUp() {
    mouseDown = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);

  return {
    // Held movement keys, as a -1/0/1 pair.
    direction() {
      const x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      const y = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
      return { x, y };
    },
    // One-shot actions since the last call.
    takeActions() {
      const a = actions;
      actions = 0;
      return a;
    },
    isShooting() {
      return mouseDown;
    },
    mouse() {
      return { x: mouseX, y: mouseY };
    },
    get run() {
      return keys.has('ShiftLeft') || keys.has('ShiftRight');
    },
    // Build the per-frame input object the world consumes.
    frameInput(camera) {
      const d = this.direction();
      const m = this.mouse();
      const worldAim = camera ? camera.toWorld(m.x, m.y) : { x: 0, y: 0 };
      return {
        up: d.y < 0, down: d.y > 0, left: d.x < 0, right: d.x > 0,
        run: this.run,
        enter: false, // filled in by main.js from takeActions()
        shoot: this.isShooting(),
        aimX: worldAim.x, aimY: worldAim.y,
      };
    },
  };
}
