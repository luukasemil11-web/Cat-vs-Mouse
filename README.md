# Cat vs Mouse

A cat-and-mouse game where **you are the mouse** and the mouse is your real cursor. A cartoon cat walks around on top of your real desktop and chases your pointer across every window and every monitor. Clicks still pass through to whatever is underneath.

## Download

Grab the latest version from the [Releases page](https://github.com/luukasemil11-web/Cat-vs-Mouse/releases/latest):

| System                         | File                                   |
| ------------------------------ | -------------------------------------- |
| macOS (Apple Silicon or Intel) | `Cat-vs-Mouse-…-mac-universal.dmg`     |
| Windows                        | `Cat-vs-Mouse-…-win-x64.exe`           |
| Linux                          | `Cat-vs-Mouse-…-linux-x86_64.AppImage` |

**macOS:** open the `.dmg` and drag **Cat vs Mouse** into Applications. The app isn't signed with a paid Apple developer certificate, so the first launch is blocked:

1. Open the app. macOS says it can't verify it. Click **Done**.
2. Go to **System Settings → Privacy & Security**, scroll down, and click **Open Anyway** next to "Cat vs Mouse".
3. Confirm with your password. From then on it opens normally.

The game has no window or Dock icon: it lives in the menu bar (the cat face) and on top of your screen.

**Windows:** run the `.exe`. If you see "Windows protected your PC", click **More info → Run anyway**.

**Linux:** make the AppImage executable (`chmod +x`) and run it.

## Play

- Move your cursor over the 🧀 to score.
- The cat stalks you, crouches (a red target locks onto your cursor), and then **pounces**. Dodge sideways.
- If it touches your cursor, you lose a life. After three, it's game over. Your best score is saved.
- The cat speeds up as your score goes up.

| Shortcut             | Action         |
| -------------------- | -------------- |
| `Ctrl/⌘ + Shift + P` | Pause / resume |
| `Ctrl/⌘ + Shift + R` | Restart        |
| `Ctrl/⌘ + Shift + Q` | Quit           |

There's also a menu-bar / tray icon with the same actions.

## Run from source

```bash
git clone https://github.com/luukasemil11-web/Cat-vs-Mouse
cd Cat-vs-Mouse && npm install && npm start
```

## Make a new release

1. Bump `"version"` in `package.json` and commit.
2. Tag it and push the tag: `git tag v1.0.1 && git push origin v1.0.1`
3. GitHub Actions builds the Mac, Windows and Linux apps and publishes them on the Releases page (about 5–10 minutes).

To build locally instead: `npm run dist` (outputs to `release/`). The app icon is drawn by `node scripts/make-icon.mjs`.

## How it works

- `src/main.ts` opens one transparent, frameless, always-on-top, **click-through** window (`setIgnoreMouseEvents(true)`) per display. It reads the global cursor position with `screen.getCursorScreenPoint()` 60 times a second.
- `src/game.ts` is the simulation: steering toward a predicted cursor position, crouch → pounce → recover, cheese spawns, lives, and difficulty scaling.
- `src/renderer/renderer.ts` draws the cat, cheese and HUD on a canvas in global screen coordinates. Each window draws only its own slice, so the cat can walk from one monitor onto the next.

## Platform notes

- **Windows / macOS:** works out of the box. On macOS the overlay also floats above full-screen apps.
- **Linux (X11):** works. Transparency needs a compositing window manager (most desktops have one).
- **Linux (Wayland):** Wayland doesn't let apps read the global cursor position, so the cat can't see you. Log into an X11 session instead.
