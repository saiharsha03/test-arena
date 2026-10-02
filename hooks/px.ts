// Pixels for a Raster: each cell is two pixels stacked (▀), so a W x H canvas fills W columns x H/2 rows.
// Pure. Clawd's sprite is the one from clawd-spinner (no hat).

export const DEF = 0x01000000  // the terminal's own colour: transparent here

export type Glyph = { x: number; row: number; ch: string; fg: number }
export type Canvas = { W: number; H: number; px: Uint32Array; glyphs: Glyph[] }

export const canvas = (W: number, rows: number): Canvas =>
  ({ W, H: rows * 2, px: new Uint32Array(W * rows * 2).fill(DEF), glyphs: [] })

export function put(c: Canvas, x: number, y: number, colour: number) {
  x = Math.round(x)
  y = Math.round(y)
  if (x >= 0 && x < c.W && y >= 0 && y < c.H) c.px[y * c.W + x] = colour
}

export function rect(c: Canvas, x: number, y: number, w: number, h: number, colour: number) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(c, x + i, y + j, colour)
}

/** Text on the canvas: one glyph per column at a cell row, drawn only over empty cells. */
export function text(c: Canvas, x: number, row: number, s: string, fg: number) {
  ;[...s].forEach((ch, i) => c.glyphs.push({ x: Math.round(x) + i, row, ch, fg }))
}

export function sprite(c: Canvas, art: string[], pal: Record<string, number>, x: number, y: number, flip = false) {
  const w = Math.max(...art.map(r => r.length))
  art.forEach((row, j) => [...row].forEach((ch, i) => ch !== '.' && pal[ch] !== undefined && put(c, x + (flip ? w - 1 - i : i), y + j, pal[ch]!)))
}

/** A stable random number in [0, 1) for the same inputs. */
export function rnd(a: number, b = 0): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35)
  h = Math.imul(h ^ (h >>> 15), 0x27d4eb2f)
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296
}

export const mix = (a: number, b: number, k: number) => {
  k = Math.min(1, Math.max(0, k))
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k) << s
  return ch(16) | ch(8) | ch(0)
}

/** The cells, packed for a Raster: columns * rows triplets of [codePoint, fg, bg]. */
export function pack(c: Canvas): Uint32Array {
  const rows = c.H / 2
  const out = new Uint32Array(c.W * rows * 3)
  for (let r = 0; r < rows; r++) {
    for (let x = 0; x < c.W; x++) {
      const top = c.px[2 * r * c.W + x]!
      const bot = c.px[(2 * r + 1) * c.W + x]!
      const i = (r * c.W + x) * 3
      if (top === DEF && bot === DEF) out.set([0x20, DEF, DEF], i)
      else if (top === bot) out.set([0x2588, top, DEF], i)
      else if (top === DEF) out.set([0x2584, bot, DEF], i)
      else out.set([0x2580, top, bot], i)
    }
  }
  for (const g of c.glyphs) {
    const i = (g.row * c.W + g.x) * 3
    if (g.x >= 0 && g.x < c.W && g.row >= 0 && g.row < rows && out[i] === 0x20) out.set([g.ch.codePointAt(0)!, g.fg, DEF], i)
  }
  return out
}

/** Base64 of the cells, as RasterProps.cells wants them. */
export const encode = (cells: Uint32Array): string => new Uint8Array(cells.buffer).toBase64()

// ------------------------------------------------------------------ Clawd

export const CLAWD = 0xd97757
const ART = [
  '..CCCCCCCCCC..',
  '..CCECCCCECC..',
  '..CCECCCCECC..',
  '..CCCCCCCCCC..',
  '..CCCCCCCCCC..',
]
const LEGS = ['..C.C....C.C..', '...C.C..C.C...']
export const CLAWD_W = 14
export const CLAWD_H = ART.length + 1

export type Pose = 'stand' | 'walk' | 'swing' | 'cheer' | 'hurt'

/** Clawd standing on `ground` (the pixel row under the legs), at x, facing right (1) or left (-1). Returns the hand. */
export function clawd(c: Canvas, t: number, pose: Pose, x: number, ground: number, facing: 1 | -1 = 1): [number, number] {
  const f = Math.floor(t / 83)
  const blink = f % 47 < 2
  const ox = Math.round(x)
  const hop = pose === 'cheer' ? -(Math.floor(t / 300) % 2) : 0
  const breathe = pose === 'stand' && Math.floor(t / 700) % 2 ? 1 : 0
  const top = ground - CLAWD_H + hop + breathe
  const at = (i: number) => (facing > 0 ? ox + i : ox + CLAWD_W - 1 - i)
  const P = (i: number, yy: number, colour: number) => put(c, at(i), yy, colour)
  const body = pose === 'hurt' && f % 4 < 2 ? 0xffffff : CLAWD
  const shade = mix(body, 0x000000, 0.18)
  const pal: Record<string, number> = { C: body, E: blink ? body : 0x1a1410 }
  ART.forEach((row, j) => [...row].forEach((ch, i) => ch !== '.' && pal[ch] !== undefined && P(i, top + j, pal[ch]!)))
  for (let i = 2; i < 12; i++) P(i, top + 4, shade)
  const stepping = pose === 'walk' || pose === 'cheer'
  ;[...LEGS[stepping ? (f >> 1) % 2 : 0]!].forEach((ch, i) => ch === 'C' && P(i, top + ART.length, shade))
  const armY = top + 2
  const beat = Math.floor(t / 300) % 2
  const left: [number, number][] = pose === 'cheer' && beat === 0 ? [[1, armY - 1], [0, armY - 2]] : [[1, armY], [0, armY]]
  let right: [number, number][] = [[12, armY], [13, armY]]
  if (pose === 'cheer' && beat === 1) right = [[12, armY - 1], [13, armY - 2]]
  if (pose === 'swing') right = t % 600 < 380 ? [[12, armY - 1], [13, armY - 2]] : [[12, armY], [13, armY + 1]]
  for (const [i, yy] of [...left, ...right]) P(i, yy, body)
  const [hi, hy] = right[right.length - 1]!
  return [at(hi), hy]
}
