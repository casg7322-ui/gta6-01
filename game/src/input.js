// Keyboard + mouse input. The game loop polls this once per frame and gets
// the same input shape the autopilot produces, so human and pilot play
// through the same code path.

export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  const mouse = { x: 0, y: 0, down: false, clicked: false };
  let interactQueued = false;
  let anyKeyQueued = false;

  const onKeyDown = (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (!e.repeat) {
      pressed.add(e.code);
      anyKeyQueued = true;
      if (e.code === 'KeyE') interactQueued = true;
    }
    keys.add(e.code);
  };
  const onKeyUp = (e) => keys.delete(e.code);
  const onMouseMove = (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    mouse.y = ((e.clientY - rect.top) / rect.height) * canvas.height;
  };
  const onMouseDown = (e) => {
    if (e.button === 0) {
      mouse.down = true;
      mouse.clicked = true;
    }
  };
  const onMouseUp = (e) => {
    if (e.button === 0) mouse.down = false;
  };
  const onBlur = () => {
    keys.clear();
    mouse.down = false;
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);

  return {
    mouse,
    // True once for the frame the key went down.
    wasPressed(code) {
      return pressed.has(code);
    },
    consumeAnyKey() {
      const v = anyKeyQueued;
      anyKeyQueued = false;
      return v;
    },
    consumeClick() {
      const v = mouse.clicked;
      mouse.clicked = false;
      return v;
    },
    // Full gameplay input for this frame, in world coordinates.
    read(camera) {
      const left = keys.has('KeyA') || keys.has('ArrowLeft');
      const right = keys.has('KeyD') || keys.has('ArrowRight');
      const up = keys.has('KeyW') || keys.has('ArrowUp');
      const down = keys.has('KeyS') || keys.has('ArrowDown');
      const input = {
        moveX: (right ? 1 : 0) - (left ? 1 : 0),
        moveY: (down ? 1 : 0) - (up ? 1 : 0),
        run: keys.has('ShiftLeft') || keys.has('ShiftRight'),
        throttle: (up ? 1 : 0) - (down ? 1 : 0),
        steer: (right ? 1 : 0) - (left ? 1 : 0),
        brake: keys.has('Space'),
        interact: interactQueued,
        fire: mouse.down,
        aimX: camera.x - canvas.width / 2 + mouse.x,
        aimY: camera.y - canvas.height / 2 + mouse.y,
      };
      interactQueued = false;
      return input;
    },
    // Call at the end of each frame so edge triggers fire exactly once.
    endFrame() {
      pressed.clear();
    },
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
    },
  };
}
