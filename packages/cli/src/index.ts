#!/usr/bin/env node
/**
 * @fileoverview CLI entry point: argument parsing, warning log redirection, creates blessed Screen, launches the imperative App.
 * @module @my-agent/cli/src/index
 */
import { mkdirSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import meow from 'meow'
import blessed from 'blessed'
import { createApp } from './app.js'

const appendLog = (level: string, message: string) => {
  const logsDir = join(homedir(), '.mycode', 'logs')
  const logFile = join(logsDir, `${new Date().toISOString().slice(0, 10)}.log`)
  try {
    mkdirSync(logsDir, { recursive: true })
    appendFileSync(logFile, `[${new Date().toISOString()}] [${level}] ${message}\n`)
  } catch {
    // write failure — silently drop to avoid TUI corruption
  }
}

;(globalThis as Record<string, unknown>).AI_SDK_LOG_WARNINGS = ({
  warnings,
  provider,
  model,
}: {
  warnings: Array<unknown>
  provider: string
  model: string
}) => {
  for (const warning of warnings) {
    appendLog('WARN', `AI SDK (${provider} / ${model}): ${JSON.stringify(warning)}`)
  }
}

console.warn = (...args: unknown[]) => {
  appendLog('WARN', args.map(String).join(' '))
}

console.info = (...args: unknown[]) => {
  appendLog('INFO', args.map(String).join(' '))
}

const cli = meow(
  `
  Usage
    $ mycode [options]

  Options
    --continue, -c <sessionId>  Resume a previous session
    --help                      Show help
    --version                   Show version
`,
  {
    importMeta: import.meta,
    flags: {
      continueSessionId: {
        type: 'string',
        shortFlag: 'c',
      },
    },
  },
)

const screen = blessed.screen({
  fullUnicode: true,
  dockBorders: true,
  title: 'mycode',
})

const cleanup = createApp(screen, { continueSessionId: cli.flags.continueSessionId })

screen.key(['C-c'], () => {
  cleanup()
  screen.destroy()
  process.exit(0)
})
