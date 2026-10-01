export type CatMode = 'sleep' | 'prowl' | 'crouch' | 'pounce' | 'recover' | 'gotcha'

export type GameStatus = 'ready' | 'playing' | 'paused' | 'over'

export interface Point {
	x: number
	y: number
}

export interface Cat extends Point {
	vx: number
	vy: number
	mode: CatMode
	/** 1 = facing right, -1 = facing left */
	facing: 1 | -1
	/** Distance walked, drives the leg animation */
	stride: number
	/** Seconds spent in the current mode */
	modeTime: number
}

export interface Pop extends Point {
	text: string
	age: number
}

export interface GameState {
	time: number
	status: GameStatus
	cat: Cat
	cursor: Point
	cheese: Point | null
	pops: Pop[]
	score: number
	best: number
	lives: number
	maxLives: number
	/** Big centered message, if any */
	banner: string | null
	sub: string | null
}

export interface DisplayInfo {
	x: number
	y: number
	width: number
	height: number
	primary: boolean
	platform: string
}
