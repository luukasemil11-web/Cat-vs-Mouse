// Draws build/icon.png (1024×1024) without any image libraries: run `node scripts/make-icon.mjs`.
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const N = 1024
const SS = 3 // supersamples per axis, for smooth edges

const inTri = (px, py, [ax, ay], [bx, by], [cx, cy]) => {
	const s = (ax - cx) * (py - cy) - (ay - cy) * (px - cx)
	const t = (bx - ax) * (py - ay) - (by - ay) * (px - ax)
	const u = (cx - bx) * (py - by) - (cy - by) * (px - bx)
	return (s >= 0 && t >= 0 && u >= 0) || (s <= 0 && t <= 0 && u <= 0)
}
const inEllipse = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1
const inRoundRect = (x, y, x0, y0, x1, y1, r) => {
	const qx = Math.max(x0 + r - x, 0, x - (x1 - r))
	const qy = Math.max(y0 + r - y, 0, y - (y1 - r))
	return x >= x0 && x <= x1 && y >= y0 && y <= y1 && qx * qx + qy * qy <= r * r
}

const BG = [255, 214, 102]
const INK = [58, 38, 24]
const FUR = [242, 163, 94]
const PINK = [230, 107, 122]
const EYE = [255, 251, 230]

// Returns [r,g,b,a] for one sample point in 0..1024 space; later layers win.
function sample(x, y) {
	if (!inRoundRect(x, y, 100, 100, 924, 924, 185)) return null
	let c = BG
	const earL = [
		[250, 470],
		[290, 170],
		[470, 330],
	]
	const earR = [
		[774, 470],
		[734, 170],
		[554, 330],
	]
	const grow = (tri, k) => tri.map(([px, py]) => [512 + (px - 512) * k, 520 + (py - 520) * k])
	if (inTri(x, y, ...grow(earL, 1.06)) || inTri(x, y, ...grow(earR, 1.06)) || inEllipse(x, y, 512, 560, 296, 256)) c = INK
	if (inTri(x, y, ...earL) || inTri(x, y, ...earR) || inEllipse(x, y, 512, 560, 278, 238)) c = FUR
	if (inTri(x, y, [300, 420], [320, 250], [430, 350]) || inTri(x, y, [724, 420], [704, 250], [594, 350])) c = PINK
	for (const ex of [410, 614]) {
		if (inEllipse(x, y, ex, 520, 62, 74)) c = INK
		if (inEllipse(x, y, ex, 520, 50, 62)) c = EYE
		if (inEllipse(x, y, ex + 6, 524, 18, 50)) c = INK
	}
	if (inTri(x, y, [480, 618], [544, 618], [512, 656])) c = PINK
	return [...c, 255]
}

const raw = Buffer.alloc(N * (N * 4 + 1))
for (let y = 0; y < N; y++) {
	raw[y * (N * 4 + 1)] = 0
	for (let x = 0; x < N; x++) {
		let r = 0,
			g = 0,
			b = 0,
			a = 0
		for (let sy = 0; sy < SS; sy++)
			for (let sx = 0; sx < SS; sx++) {
				const s = sample(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS)
				if (s) {
					r += s[0]
					g += s[1]
					b += s[2]
					a += 255
				}
			}
		const o = y * (N * 4 + 1) + 1 + x * 4
		const n = SS * SS
		const cov = a / 255 || 1
		raw[o] = r / cov
		raw[o + 1] = g / cov
		raw[o + 2] = b / cov
		raw[o + 3] = a / n
	}
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
	let c = n
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
	return c >>> 0
})
const crc32 = (buf) => {
	let c = 0xffffffff
	for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
	return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
	const len = Buffer.alloc(4)
	len.writeUInt32BE(data.length)
	const td = Buffer.concat([Buffer.from(type), data])
	const crc = Buffer.alloc(4)
	crc.writeUInt32BE(crc32(td))
	return Buffer.concat([len, td, crc])
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(N, 0)
ihdr.writeUInt32BE(N, 4)
ihdr.set([8, 6, 0, 0, 0], 8)
const png = Buffer.concat([
	Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
	chunk('IHDR', ihdr),
	chunk('IDAT', deflateSync(raw, { level: 9 })),
	chunk('IEND', Buffer.alloc(0)),
])
writeFileSync(new URL('../build/icon.png', import.meta.url), png)
console.info(`wrote build/icon.png (${png.length} bytes)`)
