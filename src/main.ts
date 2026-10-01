import { app, BrowserWindow, globalShortcut, Menu, nativeImage, screen, Tray, type Display } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { Game } from './game'

const TICK_MS = 1000 / 60

// Transparent, click-through windows on Linux need these (and an X11 session — see README).
if (process.platform === 'linux') {
	app.commandLine.appendSwitch('enable-transparent-visuals')
	app.disableHardwareAcceleration()
}

if (!app.requestSingleInstanceLock()) app.quit()

let windows: BrowserWindow[] = []
let tray: Tray | null = null
let game: Game
let ticker: NodeJS.Timeout | null = null

const bestFile = () => path.join(app.getPath('userData'), 'best.json')

function loadBest(): number {
	try {
		return Number(JSON.parse(fs.readFileSync(bestFile(), 'utf8')).best) || 0
	} catch {
		return 0
	}
}

function saveBest(best: number) {
	try {
		fs.mkdirSync(path.dirname(bestFile()), { recursive: true })
		fs.writeFileSync(bestFile(), JSON.stringify({ best }))
	} catch (err) {
		console.error('Could not save best score', err)
	}
}

/** One transparent, click-through, always-on-top window per monitor. */
function createOverlay(display: Display) {
	const { x, y, width, height } = display.bounds
	const win = new BrowserWindow({
		x,
		y,
		width,
		height,
		transparent: true,
		backgroundColor: '#00000000',
		frame: false,
		hasShadow: false,
		resizable: false,
		movable: false,
		minimizable: false,
		maximizable: false,
		fullscreenable: false,
		focusable: false,
		skipTaskbar: true,
		alwaysOnTop: true,
		enableLargerThanScreen: true,
		show: false,
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
			backgroundThrottling: false,
		},
	})
	win.setIgnoreMouseEvents(true)
	win.setAlwaysOnTop(true, 'screen-saver')
	win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
	win.loadFile(path.join(__dirname, '..', 'static', 'index.html'), {
		query: {
			x: String(x),
			y: String(y),
			width: String(width),
			height: String(height),
			primary: String(display.id === screen.getPrimaryDisplay().id),
			platform: process.platform,
		},
	})
	win.once('ready-to-show', () => {
		win.setBounds({ x, y, width, height })
		win.showInactive()
	})
	return win
}

function rebuildOverlays() {
	for (const w of windows) if (!w.isDestroyed()) w.destroy()
	windows = screen.getAllDisplays().map(createOverlay)
}

function workAreas() {
	return screen.getAllDisplays().map((d) => d.workArea)
}

function startLoop() {
	let last = performance.now()
	ticker = setInterval(() => {
		const now = performance.now()
		const dt = Math.min(0.05, (now - last) / 1000)
		last = now
		game.step(dt, screen.getCursorScreenPoint())
		for (const w of windows) if (!w.isDestroyed()) w.webContents.send('state', game.state)
	}, TICK_MS)
}

/** A tiny cat-head icon drawn pixel by pixel, so the app ships without binary assets. */
function catIcon() {
	const size = 32
	const buf = Buffer.alloc(size * size * 4)
	const inTri = (px: number, py: number, ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => {
		const s = (ax - cx) * (py - cy) - (ay - cy) * (px - cx)
		const t = (bx - ax) * (py - ay) - (by - ay) * (px - ax)
		const u = (cx - bx) * (py - by) - (cy - by) * (px - bx)
		return (s >= 0 && t >= 0 && u >= 0) || (s <= 0 && t <= 0 && u <= 0)
	}
	for (let py = 0; py < size; py++) {
		for (let px = 0; px < size; px++) {
			const head = Math.hypot(px - 16, py - 19) < 11
			const ears = inTri(px, py, 6, 14, 8, 2, 15, 10) || inTri(px, py, 26, 14, 24, 2, 17, 10)
			const eye = Math.hypot(px - 12, py - 18) < 2 || Math.hypot(px - 20, py - 18) < 2
			const i = (py * size + px) * 4
			if (eye) buf.set([30, 30, 30, 255], i)
			else if (head || ears) buf.set([97, 162, 244, 255], i) // BGRA orange
		}
	}
	// scaleFactor 2: a crisp 16pt icon on Retina menu bars instead of a blurry 32pt one
	return nativeImage.createFromBitmap(buf, { width: size, height: size, scaleFactor: 2 })
}

function buildTray() {
	try {
		tray = new Tray(catIcon())
		tray.setToolTip('Cat vs Mouse')
		tray.setContextMenu(
			Menu.buildFromTemplate([
				{ label: 'Pause / resume', click: () => game.togglePause() },
				{ label: 'Restart', click: () => game.restart(screen.getCursorScreenPoint()) },
				{ type: 'separator' },
				{ label: 'Quit', click: () => app.quit() },
			])
		)
	} catch (err) {
		// Some Linux desktops have no tray; the keyboard shortcuts still work.
		console.warn('Tray unavailable', err)
	}
}

function registerShortcuts() {
	const bind = (accel: string, fn: () => void) => {
		if (!globalShortcut.register(accel, fn)) console.warn(`Could not register shortcut ${accel}`)
	}
	bind('CommandOrControl+Shift+P', () => game.togglePause())
	bind('CommandOrControl+Shift+R', () => game.restart(screen.getCursorScreenPoint()))
	bind('CommandOrControl+Shift+Q', () => app.quit())
}

app.whenReady().then(async () => {
	if (process.platform === 'darwin') app.dock?.hide()
	// Linux compositors sometimes need a beat before transparent windows render correctly
	if (process.platform === 'linux') await new Promise((r) => setTimeout(r, 300))

	game = new Game(workAreas, loadBest(), saveBest)
	game.restart(screen.getCursorScreenPoint())

	rebuildOverlays()
	screen.on('display-added', rebuildOverlays)
	screen.on('display-removed', rebuildOverlays)
	screen.on('display-metrics-changed', rebuildOverlays)

	buildTray()
	registerShortcuts()
	startLoop()
})

app.on('will-quit', () => {
	globalShortcut.unregisterAll()
	if (ticker) clearInterval(ticker)
	tray?.destroy()
})

// Overlays are destroyed on display changes; don't let that end the game.
app.on('window-all-closed', () => {})
