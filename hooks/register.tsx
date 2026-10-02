import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { bar, countsOf, frame, ROWS, runnerOf, seconds } from './arena'
import { encode } from './px'
import type { Run } from '../types'

const run = atom({ plugin: 'test-arena', key: 'run' } as const, null)
const isShown = atom({ plugin: 'test-arena', key: 'isShown' } as const, false)

const FRAME_MS = 100
const BAR = 16

/** The band's Raster while it is on screen; a reload forgets it until the next draw. */
const band = { mount: null as { requestId: string; columns: number } | null, last: '' }

async function paint($: EngineInterface) {
  const m = band.mount
  if (!m) return
  const cells = encode(frame(await read($, run), await $.clock.now(), m.columns))
  if (cells === band.last) return
  band.last = cells
  const r = await $.ui.blit({ requestId: m.requestId, key: 'arena', cells })
  if ('deny' in r && r.deny) {
    band.mount = null
    $.ui.invalidate('ui.render')
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'test-arena', description: 'Show or hide Clawd fighting your test runs above the prompt' })
    if (e.isInteractive) $.clock.every(FRAME_MS, () => void paint($))
    return next(e)
  })

  on('command.run', { command: 'test-arena' }, async $ => {
    const shown = await update($, isShown, v => !v)
    if (!shown) band.mount = null
    return { text: shown ? 'Test Arena shown above the prompt.' : 'Test Arena hidden.' }
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (e.tool !== 'Bash' || e.run_in_background) return next(e)
    const label = runnerOf(e.command)
    if (!label) return next(e)
    const startedAt = await $.clock.now()
    await update($, run, () => ({ label, status: 'running', passed: 0, failed: 0, isCounted: false, startedAt, endedAt: startedAt }))
    const ran = await next(e)
    const counts = countsOf(ran.text ?? '', ran.isError === true || 'deny' in ran && !!ran.deny)
    const done: Run = { label, status: 'done', ...counts, startedAt, endedAt: await $.clock.now() }
    await update($, run, () => done)
    return ran
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || e.surface !== 'terminal' || !(await read($, isShown))) return next(e)
    const columns = Math.min(160, e.props.bodyColumns - 1)
    if (columns < 50) return next(e)
    const { Box, Text, Raster } = $.ui.resolve(e)
    const now = await $.clock.now()
    const r = await read($, run)
    band.mount = { requestId: e.requestId, columns }
    band.last = encode(frame(r, now, columns))
    const rest = await next(e)
    const [green, red] = r ? bar(r, BAR) : ['', '']
    const line = !r ? (
      <Text dimColor>⚔ Test Arena · runs pytest, manage.py test, vitest, jest, pnpm test… · /test-arena hides</Text>
    ) : r.status === 'running' ? (
      <Text><Text color="#d97757">⚔ {r.label}</Text><Text dimColor> fighting… {seconds(now - r.startedAt)}</Text></Text>
    ) : (
      <Text>
        <Text color="#d97757">⚔ {r.label} </Text>
        <Text color="#5fb36a">{green}</Text><Text color="#d9534f">{red}</Text>
        <Text dimColor> {r.isCounted ? `${r.passed} passed · ${r.failed} failed` : r.failed ? 'failed (no counts)' : 'passed (no counts)'} · {seconds(r.endedAt - r.startedAt)}</Text>
      </Text>
    )
    return (
      <Box flexDirection="column">
        <Raster key="arena" columns={columns} rows={ROWS} cells={band.last} />
        {line}
        {rest}
      </Box>
    )
  })
}
