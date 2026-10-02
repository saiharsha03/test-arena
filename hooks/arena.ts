// The arena: Clawd fights the test run. Pure: which commands are test runs, what their output
// counted, and the frame for a moment of the fight.
import { canvas, clawd, CLAWD_W, mix, pack, put, rect, rnd, sprite, text, type Canvas } from './px'
import type { Run } from '../types'

export const ROWS = 7
const GROUND = ROWS * 2 - 1

// ------------------------------------------------------------------ test runs

const RUNNERS = /\b(py\.?test|manage\.py\s+test|(?:pnpm|npm|yarn|bun)\s+(?:run\s+)?test(?::[\w-]+)?|vitest|jest|make\s+test[\w-]*|go\s+test|cargo\s+test|phpunit|rspec|mocha|tox|unittest)\b/
const NOT_A_RUN = /^\s*(grep|rg|cat|echo|ls|find|sed|head|tail|git|which|type)\b/

/** The runner a shell command starts ("pytest", "manage.py test"), or null when it runs no tests. */
export function runnerOf(command: string): string | null {
  if (NOT_A_RUN.test(command)) return null
  const m = RUNNERS.exec(command)
  return m ? m[1]!.replace(/\s+/g, ' ').replace(' run ', ' ') : null
}

const last = (re: RegExp, s: string) => {
  const all = [...s.matchAll(re)]
  return all.length ? Number(all[all.length - 1]![1]) : null
}

/** What a run's output counted. Django says "Ran N tests ... FAILED (failures=1, errors=2)";
 * pytest, jest, vitest, cargo all print "N passed" / "N failed": the last of each is the summary. */
export function countsOf(output: string, isError: boolean): Pick<Run, 'passed' | 'failed' | 'isCounted'> {
  const ran = last(/Ran (\d+) tests?/g, output)
  if (ran !== null) {
    const failed = (last(/failures=(\d+)/g, output) ?? 0) + (last(/errors=(\d+)/g, output) ?? 0)
    return { passed: Math.max(0, ran - failed), failed, isCounted: true }
  }
  const passed = last(/(\d+) passed/g, output)
  const failed = last(/(\d+) failed/g, output)
  const errors = last(/(\d+) errors?\b/g, output)
  if (passed === null && failed === null) return { passed: isError ? 0 : 1, failed: isError ? 1 : 0, isCounted: false }
  return { passed: passed ?? 0, failed: (failed ?? 0) + (errors ?? 0), isCounted: true }
}

export function seconds(ms: number): string {
  const s = Math.max(0, Math.round(ms / 100) / 10)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, '0')}s`
}

/** The health bar as two runs of blocks: passed (green), failed (red). */
export function bar(run: Run, width: number): [string, string] {
  const total = run.passed + run.failed
  if (!total) return ['', '░'.repeat(width)]
  const green = Math.round((run.passed / total) * width)
  const red = run.failed > 0 ? Math.max(1, width - green) : 0
  return ['█'.repeat(width - red), '█'.repeat(red)]
}

// ------------------------------------------------------------------ the fight

const SLIME = [
  '.MMMM.',
  'MEMMEM',
  'MMMMMM',
  'M.MM.M',
]
const GREY = 0x7a6a9a
const RED = 0xd9534f
const GREEN = 0x5fb36a
const STEEL = 0xc8ccd8
const X0 = 26  // where the first monster stands
const GAP = 9

const slime = (c: Canvas, x: number, colour: number, t: number, k: number) => {
  const bob = Math.floor(t / 260 + k) % 2
  sprite(c, SLIME, { M: colour, E: 0x1a1410 }, x, GROUND - 4 + bob)
}

const poof = (c: Canvas, x: number, y: number, k: number, colour: number) => {
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    put(c, x + Math.cos(a) * (1 + k * 3), y + Math.sin(a) * (1 + k * 2), mix(colour, 0x1b1b1e, k))
  }
}

const grave = (c: Canvas, x: number) => {
  put(c, x + 1, GROUND - 3, GREEN); rect(c, x, GROUND - 2, 3, 1, GREEN); put(c, x + 1, GROUND - 1, GREEN)
}

const sword = (c: Canvas, [hx, hy]: [number, number], up: boolean) => {
  for (let i = 1; i <= 4; i++) put(c, hx + i, up ? hy - i : hy, STEEL)
}

/** Clawd and the run at `t` ms on the clock: a column of monsters marching in while it runs,
 * graves for the passed and red monsters for the failed once it is done. */
export function frame(run: Run | null, t: number, columns: number): Uint32Array {
  const c = canvas(columns, ROWS)
  for (let x = 0; x < columns; x++) put(c, x, GROUND, 0x2a2d36)
  const slots = Math.max(1, Math.min(16, Math.floor((columns - X0) / GAP)))

  if (!run) {
    sword(c, clawd(c, t, 'stand', 2, GROUND), true)
    text(c, X0, 2, 'waiting for a test run', 0x6b6f7a)
    return pack(c)
  }

  if (run.status === 'running') {
    const p = (t % 1200) / 1200
    const hand = clawd(c, t, 'swing', 2, GROUND)
    sword(c, hand, p < 0.6)
    for (let k = 0; k < slots; k++) {
      const x = X0 + k * GAP - GAP * p
      if (k === 0 && p > 0.6) poof(c, x + 3, GROUND - 3, (p - 0.6) / 0.4, GREEN)
      else slime(c, x, GREY, t, k)
    }
    text(c, X0, 0, run.label, 0x8a8f9c)
    return pack(c)
  }

  const total = run.passed + run.failed
  const shown = Math.min(slots, total)
  const reds = run.failed ? Math.min(shown, Math.max(1, Math.round((run.failed / total) * shown))) : 0
  const lunge = reds > 0 && t % 1600 < 300
  if (!reds) {  // confetti over a clean run, above Clawd's head
    for (let i = 0; i < 10; i++) {
      const life = Math.floor((t / 120) + i * 2.3) % 7
      put(c, 2 + CLAWD_W / 2 + Math.round((rnd(i, 3) - 0.5) * 20), life, [0xffd54f, 0x5fb36a, 0xdfe7ff, 0xd97757][i % 4]!)
    }
  }
  const hand = clawd(c, t, reds ? (lunge ? 'hurt' : 'stand') : 'cheer', 2, GROUND)
  sword(c, hand, !reds)
  for (let k = 0; k < shown; k++) {
    const x = X0 + k * GAP
    if (k < reds) slime(c, k === 0 && lunge ? x - 6 : x, RED, t, k)
    else grave(c, x + 1)
  }
  return pack(c)
}
