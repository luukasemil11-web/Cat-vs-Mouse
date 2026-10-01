import type { Cat, DisplayInfo, GameState, Point } from '../types'

declare global {
	interface Window {
		cursorCat: { onState: (cb: (state: GameState) => void) => void }
	}
}

const params = new URLSearchParams(location.search)
const display: DisplayInfo = {
	x: Number(params.get('x')),
	y: Number(params.get('y')),
	width: Number(params.get('width')),
	height: Number(params.get('height')),
	primary: params.get('primary') === 'true',
	platform: params.get('platform') ?? '',
}
const mod = display.platform === 'darwin' ? '⌘' : 'Ctrl'

const canvas = document.getElementById('stage') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!

function resize() {
	const dpr = window.devicePixelRatio || 1
	canvas.width = Math.round(innerWidth * dpr)
	canvas.height = Math.round(innerHeight * dpr)
	canvas.style.width = `${innerWidth}px`
	canvas.style.height = `${innerHeight}px`
}
addEventListener('resize', resize)
resize()

let latest: GameState | null = null
window.cursorCat.onState((s) => (latest = s))

const FUR = '#f2a35e'
const FUR_DARK = '#c9733a'
const INK = '#3a2618'
const CHEESE = '#ffd24a'

function frame() {
	requestAnimationFrame(frame)
	const dpr = window.devicePixelRatio || 1
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
	ctx.clearRect(0, 0, innerWidth, innerHeight)
	const s = latest
	if (!s) return

	// Work in global screen coordinates; this window only shows its own slice.
	ctx.translate(-display.x, -display.y)

	if (s.cheese) drawCheese(s.cheese, s.time)
	if (s.cat.mode === 'crouch') drawTarget(s.cursor, s.cat.modeTime)
	drawCat(s.cat, s.cursor, s.time)
	if (s.cat.mode === 'gotcha') drawBubble(s.cat, '!')
	for (const p of s.pops) drawPop(p.x, p.y, p.text, p.age)

	ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
	if (display.primary) {
		drawHud(s)
		if (s.banner) drawBanner(s.banner, s.status === 'over' ? `${s.sub} · ${mod}+Shift+R to play again` : s.sub)
	}
}
requestAnimationFrame(frame)

function drawCat(cat: Cat, cursor: Point, time: number) {
	const speed = Math.hypot(cat.vx, cat.vy)
	ctx.save()
	ctx.translate(cat.x, cat.y)

	// Ground shadow
	ctx.fillStyle = 'rgba(0,0,0,0.18)'
	ctx.beginPath()
	ctx.ellipse(0, 26, 38, 7, 0, 0, Math.PI * 2)
	ctx.fill()

	ctx.scale(cat.facing, 1)
	ctx.lineWidth = 2.5
	ctx.lineJoin = 'round'
	ctx.lineCap = 'round'
	ctx.strokeStyle = INK

	if (cat.mode === 'sleep') {
		drawSleepingCat(time, cat.facing)
		ctx.restore()
		return
	}

	let bodyY = 0
	let stretch = 1
	let squash = 1
	let rearLift = 0
	if (cat.mode === 'crouch') {
		bodyY = 8
		rearLift = Math.sin(cat.modeTime * 40) * 3 // butt wiggle
	} else if (cat.mode === 'pounce') {
		stretch = 1.3
		squash = 0.8
		bodyY = -6
	} else if (cat.mode === 'recover') {
		bodyY = 3
	}

	const phase = cat.stride * 0.09
	const swing = cat.mode === 'pounce' ? 0.9 : Math.min(1, speed / 150) * 0.55

	// Legs: far pair first (darker), then near pair on top
	const leg = (x: number, a: number, color: string) => {
		ctx.strokeStyle = color
		ctx.lineWidth = 6
		ctx.beginPath()
		ctx.moveTo(x * stretch, bodyY + 8)
		ctx.lineTo(x * stretch + Math.sin(a) * 12, bodyY + 8 + Math.cos(a) * (18 - bodyY * 0.6))
		ctx.stroke()
	}
	leg(-18, -Math.sin(phase) * swing, FUR_DARK)
	leg(16, Math.sin(phase) * swing, FUR_DARK)

	// Tail
	const flick = cat.mode === 'crouch' ? Math.sin(cat.modeTime * 25) * 10 : Math.sin(time * 3) * 8
	ctx.strokeStyle = INK
	ctx.lineWidth = 9
	ctx.beginPath()
	ctx.moveTo(-26 * stretch, bodyY - 4 + rearLift)
	ctx.quadraticCurveTo(-50 * stretch, bodyY - 6, -52 * stretch + flick * 0.3, bodyY - 34 + flick)
	ctx.stroke()
	ctx.strokeStyle = FUR
	ctx.lineWidth = 5.5
	ctx.stroke()

	// Body
	ctx.save()
	ctx.translate(0, bodyY)
	ctx.rotate(rearLift * -0.01)
	ctx.scale(stretch, squash)
	ctx.fillStyle = FUR
	ctx.strokeStyle = INK
	ctx.lineWidth = 2.5
	ctx.beginPath()
	ctx.ellipse(0, 0, 30, 15, 0, 0, Math.PI * 2)
	ctx.fill()
	ctx.stroke()
	// Tabby stripes
	ctx.strokeStyle = FUR_DARK
	ctx.lineWidth = 3
	for (const sx of [-14, -3, 8]) {
		ctx.beginPath()
		ctx.moveTo(sx, -14)
		ctx.quadraticCurveTo(sx + 3, -7, sx, -1)
		ctx.stroke()
	}
	ctx.restore()

	leg(-10, Math.sin(phase) * swing, FUR)
	leg(22, -Math.sin(phase) * swing, FUR)

	// Head
	const hx = 30 * stretch
	const hy = bodyY - 14 + (cat.mode === 'crouch' ? 6 : 0)
	ctx.strokeStyle = INK
	ctx.lineWidth = 2.5
	ctx.fillStyle = FUR
	// Ears
	for (const [ex, tilt] of [
		[-7, -1],
		[5, 1],
	] as const) {
		ctx.beginPath()
		ctx.moveTo(hx + ex - 5, hy - 8)
		ctx.lineTo(hx + ex + tilt * 2, hy - 24 + (cat.mode === 'crouch' ? 4 : 0))
		ctx.lineTo(hx + ex + 6, hy - 9)
		ctx.closePath()
		ctx.fill()
		ctx.stroke()
	}
	ctx.beginPath()
	ctx.arc(hx, hy, 14, 0, Math.PI * 2)
	ctx.fill()
	ctx.stroke()

	// Eye tracks the cursor (in the cat's mirrored local space)
	const ex = hx + 5
	const ey = hy - 3
	const lookX = (cursor.x - (cat.x + ex * cat.facing)) * cat.facing
	const lookY = cursor.y - (cat.y + ey)
	const lookLen = Math.hypot(lookX, lookY) || 1
	ctx.fillStyle = '#fffbe6'
	ctx.beginPath()
	ctx.ellipse(ex, ey, 4.5, 5.5, 0, 0, Math.PI * 2)
	ctx.fill()
	ctx.stroke()
	const pupil = cat.mode === 'crouch' || cat.mode === 'pounce' ? 3.2 : 1.6
	ctx.fillStyle = '#111'
	ctx.beginPath()
	ctx.ellipse(ex + (lookX / lookLen) * 1.8, ey + (lookY / lookLen) * 2.2, pupil * 0.8, pupil * 1.6, 0, 0, Math.PI * 2)
	ctx.fill()

	// Nose, mouth, whiskers
	ctx.fillStyle = '#e66b7a'
	ctx.beginPath()
	ctx.arc(hx + 13, hy + 3, 2.2, 0, Math.PI * 2)
	ctx.fill()
	ctx.strokeStyle = INK
	ctx.lineWidth = 1.2
	for (const wy of [2, 5]) {
		ctx.beginPath()
		ctx.moveTo(hx + 9, hy + wy)
		ctx.lineTo(hx + 26, hy + wy - 3 + wy * 0.6)
		ctx.stroke()
	}
	ctx.restore()
}

function drawSleepingCat(time: number, facing: 1 | -1) {
	const breathe = 1 + Math.sin(time * 2) * 0.03
	ctx.save()
	ctx.translate(0, 8)
	ctx.scale(breathe, breathe)
	ctx.fillStyle = FUR
	// Tail wrapped around
	ctx.lineWidth = 9
	ctx.beginPath()
	ctx.arc(0, 4, 26, 0.1, Math.PI * 0.9)
	ctx.stroke()
	ctx.strokeStyle = FUR
	ctx.lineWidth = 5.5
	ctx.stroke()
	ctx.strokeStyle = INK
	ctx.lineWidth = 2.5
	ctx.beginPath()
	ctx.ellipse(0, 0, 30, 18, 0, 0, Math.PI * 2)
	ctx.fill()
	ctx.stroke()
	ctx.beginPath()
	ctx.arc(18, -6, 13, 0, Math.PI * 2)
	ctx.fill()
	ctx.stroke()
	for (const ex of [10, 22]) {
		ctx.beginPath()
		ctx.moveTo(ex - 5, -14)
		ctx.lineTo(ex, -26)
		ctx.lineTo(ex + 5, -16)
		ctx.fill()
		ctx.stroke()
	}
	// Closed eye
	ctx.beginPath()
	ctx.arc(23, -6, 3.5, 0.2, Math.PI - 0.2)
	ctx.stroke()
	ctx.restore()

	// Zzz drifting up (not mirrored, so the letters read correctly)
	ctx.save()
	ctx.scale(facing, 1)
	const zx = 26 * facing
	ctx.fillStyle = INK
	ctx.font = 'bold 16px system-ui, sans-serif'
	for (let i = 0; i < 3; i++) {
		const t = (time * 0.6 + i / 3) % 1
		ctx.globalAlpha = 1 - t
		ctx.fillText('z', zx + t * 18, -24 - t * 34)
	}
	ctx.restore()
}

function drawCheese(p: Point, time: number) {
	const bob = Math.sin(time * 3) * 3
	ctx.save()
	ctx.translate(p.x, p.y + bob)
	// Glow so it's visible on any wallpaper
	const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 38)
	glow.addColorStop(0, 'rgba(255,220,80,0.55)')
	glow.addColorStop(1, 'rgba(255,220,80,0)')
	ctx.fillStyle = glow
	ctx.beginPath()
	ctx.arc(0, 0, 38, 0, Math.PI * 2)
	ctx.fill()

	ctx.fillStyle = CHEESE
	ctx.strokeStyle = '#8a5a00'
	ctx.lineWidth = 2.5
	ctx.lineJoin = 'round'
	ctx.beginPath()
	ctx.moveTo(-18, 10)
	ctx.lineTo(18, 10)
	ctx.lineTo(18, -4)
	ctx.lineTo(-18, -14)
	ctx.closePath()
	ctx.fill()
	ctx.stroke()
	ctx.fillStyle = '#e0a800'
	for (const [hx, hy, r] of [
		[-8, 2, 3],
		[6, 4, 2.5],
		[10, -2, 2],
	]) {
		ctx.beginPath()
		ctx.arc(hx, hy, r, 0, Math.PI * 2)
		ctx.fill()
	}
	ctx.restore()
}

function drawTarget(p: Point, t: number) {
	const r = 26 - Math.min(1, t * 2) * 8
	ctx.save()
	ctx.strokeStyle = 'rgba(230,60,60,0.85)'
	ctx.lineWidth = 2.5
	ctx.beginPath()
	ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
	ctx.stroke()
	for (let i = 0; i < 4; i++) {
		const a = (i * Math.PI) / 2
		ctx.beginPath()
		ctx.moveTo(p.x + Math.cos(a) * (r - 6), p.y + Math.sin(a) * (r - 6))
		ctx.lineTo(p.x + Math.cos(a) * (r + 6), p.y + Math.sin(a) * (r + 6))
		ctx.stroke()
	}
	ctx.restore()
}

function drawBubble(cat: Cat, text: string) {
	ctx.save()
	ctx.translate(cat.x + cat.facing * 30, cat.y - 62)
	ctx.fillStyle = '#fff'
	ctx.strokeStyle = INK
	ctx.lineWidth = 2
	ctx.beginPath()
	ctx.arc(0, 0, 16, 0, Math.PI * 2)
	ctx.fill()
	ctx.stroke()
	ctx.fillStyle = '#d33'
	ctx.font = 'bold 22px system-ui, sans-serif'
	ctx.textAlign = 'center'
	ctx.textBaseline = 'middle'
	ctx.fillText(text, 0, 1)
	ctx.restore()
}

function drawPop(x: number, y: number, text: string, age: number) {
	ctx.save()
	ctx.globalAlpha = 1 - age
	ctx.font = 'bold 22px system-ui, sans-serif'
	ctx.textAlign = 'center'
	ctx.lineWidth = 4
	ctx.strokeStyle = '#fff'
	ctx.fillStyle = '#b07800'
	ctx.strokeText(text, x, y - 24 - age * 40)
	ctx.fillText(text, x, y - 24 - age * 40)
	ctx.restore()
}

function pill(x: number, y: number, w: number, h: number) {
	ctx.beginPath()
	ctx.roundRect(x, y, w, h, h / 2)
}

function drawHud(s: GameState) {
	const hearts = '♥'.repeat(Math.max(0, s.lives)) + '♡'.repeat(Math.max(0, s.maxLives - s.lives))
	const text = `🧀 ${s.score}   ${hearts}   best ${s.best}`
	const hint = `${mod}+Shift+P pause · ${mod}+Shift+R restart · ${mod}+Shift+Q quit`
	ctx.save()
	ctx.font = '600 15px system-ui, sans-serif'
	const w1 = ctx.measureText(text).width
	ctx.font = '12px system-ui, sans-serif'
	const w2 = ctx.measureText(hint).width
	const w = Math.max(w1, w2) + 32
	const x = innerWidth / 2 - w / 2
	const y = 34
	ctx.fillStyle = 'rgba(20,16,12,0.72)'
	pill(x, y, w, 46)
	ctx.fill()
	ctx.textAlign = 'center'
	ctx.fillStyle = '#fff'
	ctx.font = '600 15px system-ui, sans-serif'
	ctx.fillText(text, innerWidth / 2, y + 20)
	ctx.fillStyle = 'rgba(255,255,255,0.7)'
	ctx.font = '12px system-ui, sans-serif'
	ctx.fillText(hint, innerWidth / 2, y + 37)
	ctx.restore()
}

function drawBanner(title: string, sub: string | null) {
	ctx.save()
	ctx.textAlign = 'center'
	ctx.textBaseline = 'middle'
	const cx = innerWidth / 2
	const cy = innerHeight * 0.32
	ctx.font = '800 56px system-ui, sans-serif'
	const w = Math.max(ctx.measureText(title).width, 360) + 64
	ctx.fillStyle = 'rgba(20,16,12,0.72)'
	ctx.beginPath()
	ctx.roundRect(cx - w / 2, cy - 54, w, sub ? 120 : 92, 22)
	ctx.fill()
	ctx.fillStyle = '#fff'
	ctx.fillText(title, cx, cy - 8)
	if (sub) {
		ctx.font = '500 17px system-ui, sans-serif'
		ctx.fillStyle = 'rgba(255,255,255,0.8)'
		ctx.fillText(sub, cx, cy + 38)
	}
	ctx.restore()
}
