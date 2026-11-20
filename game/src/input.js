// Keyboard and mouse state for the whole game. Held keys live in a Set the systems poll each
// step; one-shot presses are remembered until the frame ends, so a tap between two frames is
// never lost and never counted twice. The mouse position is kept in screen space; the player
// code turns it into a world-space aim point through the camera. Everything is wired up by
// the single createInput(canvas) call at boot; after that this module is pure polled state,
// with no callbacks back into game code.

/** Keys the page must never scroll or react to while the game has focus. */
const GAME_KEYS = new Set([
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyF',
]);

export function createInput(canvas) {
  const down = new Set();
  const pressed = new Set();
  const mouse = { x: 0, y: 0, down: false, clicked: false };
  let wheel = 0;

  window.addEventListener('keydown', (event) => {
    if (!event.repeat) pressed.add(event.code);
    down.add(event.code);
    if (GAME_KEYS.has(event.code)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    down.delete(event.code);
  });
  // A key released while the tab is hidden never sends its keyup: let go of everything.
  window.addEventListener('blur', () => {
    down.clear();
    mouse.down = false;
  });
  canvas.addEventListener('pointermove', (event) => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
  });
  canvas.addEventListener('pointerdown', (event) => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
    mouse.down = true;
    mouse.clicked = true;
  });
  window.addEventListener('pointerup', () => {
    mouse.down = false;
  });
  // The canvas owns its right-click: no browser menu over the game.
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.addEventListener('wheel', (event) => {
    wheel += Math.sign(event.deltaY);
    event.preventDefault();
  }, { passive: false });

  return {
    down,
    pressed,
    mouse,
    /** Net wheel notches this frame; the player spends them switching weapons. */
    get wheel() {
      return wheel;
    },
    /** True while the key is physically held. */
    isDown(code) {
      return down.has(code);
    },
    /** True only in the frame the key went down. */
    wasPressed(code) {
      return pressed.has(code);
    },
    /** The on-foot steering axis from WASD or the arrow keys: -1, 0 or 1 on each axis. */
    axis() {
      const x = (down.has('KeyD') || down.has('ArrowRight') ? 1 : 0) - (down.has('KeyA') || down.has('ArrowLeft') ? 1 : 0);
      const y = (down.has('KeyS') || down.has('ArrowDown') ? 1 : 0) - (down.has('KeyW') || down.has('ArrowUp') ? 1 : 0);
      return { x, y };
    },
    /** Called once per rendered frame, after every step has had its chance to read presses. */
    endFrame() {
      pressed.clear();
      mouse.clicked = false;
      wheel = 0;
    },
  };
}
