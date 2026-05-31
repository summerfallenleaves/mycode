/**
 * @fileoverview StatusBar component: shows agent state (thinking/executing/idle), model name, context usage, session info at bottom of terminal
 * @module @my-agent/cli/src/components/status-bar
 */
import { Box, Text } from 'ink'
import type { JSX } from 'react'

interface ContextUsage {
  used: number
  limit: number
  percentage: number
}

interface StatusBarProps {
  providerName: string
  model: string
  isRunning: boolean
  eventCount: number
  error: string | null
  contextUsage?: ContextUsage | null
}

function contextColor(pct: number): string {
  if (pct >= 90) return 'red'
  if (pct >= 70) return 'yellow'
  return 'green'
}

export function StatusBar({ providerName, model, isRunning, eventCount, error, contextUsage }: StatusBarProps): JSX.Element {
  const status = error
    ? { color: 'red' as const, text: `Error: ${error}` }
    : isRunning
      ? { color: 'yellow' as const, text: 'Running...' }
      : { color: 'green' as const, text: 'Ready' }

  return (
    <Box borderStyle="single" paddingX={1} width="100%">
      <Text>{providerName} / {model}</Text>
      {contextUsage && (
        <Text>
          {' '}
          <Text color={contextColor(contextUsage.percentage)}>
            {contextUsage.percentage}%/{contextUsage.used < 1000 ? contextUsage.used : `${Math.round(contextUsage.used / 1000)}K`}
          </Text>
        </Text>
      )}
      <Box flexGrow={1} />
      <Text color={status.color}>{status.text} ({eventCount} events)</Text>
    </Box>
  )
}
