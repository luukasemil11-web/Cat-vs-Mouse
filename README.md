# Cursor Cat

A cat-and-mouse game where **you are the mouse** and the mouse is your real cursor. A cartoon cat walks around on top of your real desktop and chases your pointer across every window and every monitor. Clicks still pass through to whatever is underneath.

## Play

```bash
cd Cat-vs-Mouse
npm install
npm start
```

- Move your cursor over the 🧀 to score.
- The cat stalks you, crouches (a red target locks onto your cursor), and then **pounces**. Dodge sideways.
- If it touches your cursor, you lose a life. After three, it's game over. Your best score is saved.
- The cat speeds up as your score goes up.

| Shortcut             | Action         |
| -------------------- | -------------- |
| `Ctrl/⌘ + Shift + P` | Pause / resume |
| `Ctrl/⌘ + Shift + R` | Restart        |
| `Ctrl/⌘ + Shift + Q` | Quit           |

There's also a tray / menu-bar icon with the same actions.

## How it works

- `src/main.ts` opens one transparent, frameless, always-on-top, **click-through** window (`setIgnoreMouseEvents(true)`) per display. It reads the global cursor position with `screen.getCursorScreenPoint()` 60 times a second.
- `src/game.ts` is the simulation: steering toward a predicted cursor position, crouch → pounce → recover, cheese spawns, lives, and difficulty scaling.
- `src/renderer/renderer.ts` draws the cat, cheese and HUD on a canvas in global screen coordinates. Each window draws only its own slice, so the cat can walk from one monitor onto the next.

## Platform notes

- **Windows / macOS:** works out of the box. On macOS the overlay also floats above full-screen apps.
- **Linux (X11):** works. Transparency needs a compositing window manager (most desktops have one).
- **Linux (Wayland):** Wayland doesn't let apps read the global cursor position, so the cat can't see you. Log into an X11 session instead.
