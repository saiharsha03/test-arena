export type Run = {
  label: string  // the runner: "pytest", "manage.py test", "pnpm test"
  status: 'running' | 'done'
  passed: number
  failed: number
  isCounted: boolean  // false: the output named no counts, so pass/fail came from the exit alone
  startedAt: number
  endedAt: number
}

declare module 'claude-code' {
  interface PluginState {
    'test-arena': { run: Run | null; isShown: boolean }
  }
}
