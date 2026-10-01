import type { Cat, CatMode, GameState, Point } from './types'

export interface Rect {
	x: number
	y: number
	width: number
	height: number
}

const MAX_LIVES = 3
const READY_SECONDS = 3
const CATCH_RADIUS = 34
const CHEESE_RADIUS = 30
const CHEESE_MARGIN = 90

// Cat tuning (px/s, seconds)
const PROWL_SPEED = 250
const PROWL_ACCEL = 6
const CROUCH_RANGE = 230
const CROUCH_TIME = 0.55
const POUNCE_SPEED = 1150
const POUNCE_TIME = 0.3
const RECOVER_TIME = 0.55
const POUNCE_COOLDOWN = 1.1
const GOTCHA_TIME = 1.4
const GRACE_TIME = 2

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

export class Game {
	state: GameState
	private cursorVel: Point = { x: 0, y: 0 }
	private pounceDir: Point = { x: 0, y: 0 }
	private cooldown = 0
	private grace = 0
	private statusTime = 0

	constructor(
		private getAreas: () => Rect[],
		best: number,
		private onBest: (best: number) => void
	) {
		this.state = {
			time: 0,
			status: 'ready',
			cat: newCat({ x: 0, y: 0 }),
			cursor: { x: 0, y: 0 },
			cheese: null,
			pops: [],
			score: 0,
			best,
			lives: MAX_LIVES,
			maxLives: MAX_LIVES,
			banner: null,
			sub: null,
		}
	}

	/** Difficulty multiplier: the cat gets quicker as you score. */
	get difficulty() {
		return 1 + Math.min(this.state.score, 30) * 0.035
	}

	restart(cursor: Point) {
		const s = this.state
		s.status = 'ready'
		s.score = 0
		s.lives = MAX_LIVES
		s.pops = []
		s.cheese = null
		s.cat = newCat(this.farPointFrom(cursor))
		this.cooldown = 0
		this.grace = 0
		this.statusTime = 0
	}

	togglePause() {
		const s = this.state
		if (s.status === 'playing') {
			s.status = 'paused'
			setMode(s.cat, 'sleep')
		} else if (s.status === 'paused') {
			s.status = 'ready'
			this.statusTime = 0
		}
	}

	step(dt: number, cursor: Point) {
		const s = this.state
		s.time += dt
		this.statusTime += dt

		// Smoothed cursor velocity, so the cat can lead its target
		if (dt > 0) {
			const k = Math.min(1, dt * 12)
			this.cursorVel.x += ((cursor.x - s.cursor.x) / dt - this.cursorVel.x) * k
			this.cursorVel.y += ((cursor.y - s.cursor.y) / dt - this.cursorVel.y) * k
		}
		s.cursor = { ...cursor }

		s.pops = s.pops.filter((p) => (p.age += dt) < 1)

		switch (s.status) {
			case 'ready': {
				const left = Math.ceil(READY_SECONDS - this.statusTime)
				s.banner = left > 0 ? String(left) : 'Go!'
				s.sub = 'You are the mouse. Grab the cheese, dodge the cat.'
				setMode(s.cat, 'sleep')
				if (!s.cheese) s.cheese = this.spawnCheese()
				if (this.statusTime >= READY_SECONDS) {
					s.status = 'playing'
					s.banner = null
					s.sub = null
					setMode(s.cat, 'prowl')
				}
				break
			}
			case 'playing':
				this.stepCat(dt)
				this.checkCheese()
				break
			case 'paused':
				s.banner = 'Paused'
				s.sub = 'The cat is napping.'
				break
			case 'over':
				s.banner = `Game over — ${s.score} cheese`
				s.sub = s.score >= s.best && s.score > 0 ? 'New best!' : `Best: ${s.best}`
				this.stepCat(dt)
				break
		}
	}

	private stepCat(dt: number) {
		const s = this.state
		const cat = s.cat
		const d = this.difficulty
		cat.modeTime += dt
		this.cooldown -= dt
		this.grace -= dt

		const toCursor = { x: s.cursor.x - cat.x, y: s.cursor.y - cat.y }
		const range = Math.hypot(toCursor.x, toCursor.y)

		switch (cat.mode) {
			case 'sleep':
			case 'prowl': {
				if (cat.mode === 'sleep') setMode(cat, 'prowl')
				const lead = Math.min(0.35, range / 1200)
				const target = {
					x: s.cursor.x + this.cursorVel.x * lead,
					y: s.cursor.y + this.cursorVel.y * lead,
				}
				// During the grace period after a catch the cat saunters off instead
				const away = this.grace > 0 ? -0.6 : 1
				steer(cat, target, PROWL_SPEED * d * away, PROWL_ACCEL, dt)
				if (this.grace <= 0 && this.cooldown <= 0 && range < CROUCH_RANGE * Math.sqrt(d)) setMode(cat, 'crouch')
				break
			}
			case 'crouch': {
				damp(cat, 14, dt)
				cat.facing = toCursor.x >= 0 ? 1 : -1
				if (cat.modeTime >= CROUCH_TIME / Math.sqrt(d)) {
					const lead = 0.18
					const tx = s.cursor.x + this.cursorVel.x * lead - cat.x
					const ty = s.cursor.y + this.cursorVel.y * lead - cat.y
					const len = Math.hypot(tx, ty) || 1
					this.pounceDir = { x: tx / len, y: ty / len }
					setMode(cat, 'pounce')
				}
				break
			}
			case 'pounce': {
				const speed = POUNCE_SPEED * Math.sqrt(d)
				cat.vx = this.pounceDir.x * speed
				cat.vy = this.pounceDir.y * speed
				if (cat.modeTime >= POUNCE_TIME) setMode(cat, 'recover')
				break
			}
			case 'recover':
				damp(cat, 8, dt)
				if (cat.modeTime >= RECOVER_TIME) {
					this.cooldown = POUNCE_COOLDOWN / d
					setMode(cat, 'prowl')
				}
				break
			case 'gotcha':
				damp(cat, 20, dt)
				if (cat.modeTime >= GOTCHA_TIME && s.status === 'playing') {
					s.banner = null
					s.sub = null
					this.grace = GRACE_TIME
					this.cooldown = GRACE_TIME + POUNCE_COOLDOWN
					setMode(cat, 'prowl')
				}
				break
		}

		cat.x += cat.vx * dt
		cat.y += cat.vy * dt
		cat.stride += Math.hypot(cat.vx, cat.vy) * dt
		if (cat.mode !== 'crouch' && Math.abs(cat.vx) > 25) cat.facing = cat.vx > 0 ? 1 : -1
		this.keepOnScreen(cat)

		if (s.status === 'playing' && cat.mode !== 'gotcha' && this.grace <= 0 && dist(cat, s.cursor) < CATCH_RADIUS) {
			this.caught()
		}
	}

	private caught() {
		const s = this.state
		s.lives -= 1
		setMode(s.cat, 'gotcha')
		s.cat.vx = 0
		s.cat.vy = 0
		if (s.lives <= 0) {
			s.status = 'over'
			if (s.score > s.best) {
				s.best = s.score
				this.onBest(s.best)
			}
		} else {
			s.banner = 'Gotcha!'
			s.sub = `${s.lives} ${s.lives === 1 ? 'life' : 'lives'} left`
		}
	}

	private checkCheese() {
		const s = this.state
		if (!s.cheese) s.cheese = this.spawnCheese()
		if (s.cheese && dist(s.cheese, s.cursor) < CHEESE_RADIUS) {
			s.score += 1
			s.pops.push({ x: s.cheese.x, y: s.cheese.y, text: '+1', age: 0 })
			s.cheese = this.spawnCheese()
		}
	}

	private spawnCheese(): Point | null {
		const areas = this.getAreas()
		if (!areas.length) return null
		// Prefer spots that aren't right next to the cursor or the cat
		let best: Point | null = null
		let bestScore = -Infinity
		for (let i = 0; i < 12; i++) {
			const a = areas[Math.floor(Math.random() * areas.length)]
			const m = Math.min(CHEESE_MARGIN, a.width / 4, a.height / 4)
			const p = { x: a.x + m + Math.random() * (a.width - 2 * m), y: a.y + m + Math.random() * (a.height - 2 * m) }
			const fromCursor = dist(p, this.state.cursor)
			const fromCat = dist(p, this.state.cat)
			const score = Math.min(fromCursor, 700) + Math.min(fromCat, 400) * 0.5
			if (score > bestScore) {
				bestScore = score
				best = p
			}
		}
		return best
	}

	private farPointFrom(p: Point): Point {
		const areas = this.getAreas()
		let far: Point = { x: p.x + 400, y: p.y }
		let farD = -1
		for (const a of areas) {
			for (const c of [
				{ x: a.x + 60, y: a.y + a.height - 60 },
				{ x: a.x + a.width - 60, y: a.y + a.height - 60 },
				{ x: a.x + 60, y: a.y + 60 },
				{ x: a.x + a.width - 60, y: a.y + 60 },
			]) {
				const d = dist(c, p)
				if (d > farD) {
					farD = d
					far = c
				}
			}
		}
		return far
	}

	/** Clamp the cat to the nearest display so it never wanders off into the void. */
	private keepOnScreen(cat: Cat) {
		const areas = this.getAreas()
		if (!areas.length) return
		const inside = areas.some((a) => cat.x >= a.x && cat.x <= a.x + a.width && cat.y >= a.y && cat.y <= a.y + a.height)
		if (inside) return
		let best = { x: cat.x, y: cat.y }
		let bestD = Infinity
		for (const a of areas) {
			const c = { x: clamp(cat.x, a.x, a.x + a.width), y: clamp(cat.y, a.y, a.y + a.height) }
			const d = dist(c, cat)
			if (d < bestD) {
				bestD = d
				best = c
			}
		}
		cat.x = best.x
		cat.y = best.y
	}
}

function newCat(p: Point): Cat {
	return { x: p.x, y: p.y, vx: 0, vy: 0, mode: 'sleep', facing: -1, stride: 0, modeTime: 0 }
}

function setMode(cat: Cat, mode: CatMode) {
	if (cat.mode === mode) return
	cat.mode = mode
	cat.modeTime = 0
}

function steer(cat: Cat, target: Point, speed: number, accel: number, dt: number) {
	const dx = target.x - cat.x
	const dy = target.y - cat.y
	const len = Math.hypot(dx, dy)
	// Ease off when very close so the cat doesn't jitter on top of the target
	const s = speed * Math.min(1, len / 60)
	const want = len > 0 ? { x: (dx / len) * s, y: (dy / len) * s } : { x: 0, y: 0 }
	const k = Math.min(1, accel * dt)
	cat.vx += (want.x - cat.vx) * k
	cat.vy += (want.y - cat.vy) * k
}

function damp(cat: Cat, rate: number, dt: number) {
	const k = Math.exp(-rate * dt)
	cat.vx *= k
	cat.vy *= k
}

function clamp(v: number, lo: number, hi: number) {
	return Math.max(lo, Math.min(hi, v))
}
