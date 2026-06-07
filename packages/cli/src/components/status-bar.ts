/**
 * @fileoverview Renders status bar text (provider, context usage, running state) as unblessed tagged string.
 * @module @my-agent/cli/src/components/status-bar
 */

function contextColorTag(pct: number): string {
  if (pct >= 90) return 'red-fg'
  if (pct >= 70) return 'yellow-fg'
  return 'green-fg'
}

export function renderStatusBar(opts: {
  providerName: string
  isRunning: boolean
  eventCount: number
  error: string | null
  contextUsage?: { used: number; limit: number; percentage: number } | null
  fullWidth: number
}): string {
  const { providerName, isRunning, eventCount, error, contextUsage, fullWidth } = opts

  const statusText = error
    ? `{red-fg}Error: ${error.slice(0, 20)}{/red-fg}`
    : isRunning
      ? `{yellow-fg}Running...{/yellow-fg}`
      : `{green-fg}Ready{/green-fg}`

  const left = providerName
  const ctxPart = contextUsage
    ? ` {${contextColorTag(contextUsage.percentage)}}${contextUsage.percentage}%/${contextUsage.used < 1000 ? contextUsage.used : `${Math.round(contextUsage.used / 1000)}K`}{/${contextColorTag(contextUsage.percentage)}}`
    : ''
  const right = `${statusText} (${eventCount})`

  // Strip tags for visible length calculation
  const visibleLen = (left + ctxPart + right).replace(/\{[^}]+\}/g, '').length
  const padding = Math.max(1, fullWidth - visibleLen - 2)

  return ` ${left}${ctxPart}${' '.repeat(padding)}${right}`
}
