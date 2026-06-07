/**
 * @fileoverview Renders ViewEvent[] to unblessed tagged strings for ScrollableText content area.
 * Groups events into turns (user_message boundaries) and formats each event type with ANSI tags.
 * @module @my-agent/cli/src/components/event-renderer
 */
import type { AgentEvent } from '@my-agent/core'
import type { ViewEvent } from '../lib/agent-stream-manager.js'

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen) + '...'
}

function formatToolResult(toolName: string, result: unknown): string {
  const r = result as Record<string, unknown>

  switch (toolName) {
    case 'read_file': {
      const path = r.path as string
      return path ? `读取文件: ${path}` : ''
    }
    case 'edit': {
      const path = r.path as string
      const oldStr = r.old as string
      const newStr = r.new as string
      if (!path) return ''
      return `编辑文件: ${path}\n原: ${truncate(oldStr, 80)}\n新: ${truncate(newStr, 80)}`
    }
    case 'write': {
      const path = r.path as string
      const content = r.content as string
      if (!path) return ''
      return `写入文件: ${path}\n内容:\n${truncate(content, 200)}`
    }
    case 'bash': {
      const command = r.command as string
      return command ? `执行命令: $ ${command}` : ''
    }
    case 'grep': {
      const pattern = r.pattern as string
      const matches = r.matches as Array<{ file: string; line: number; content: string }> | undefined
      const cmd = pattern ? `grep -rn "${pattern}"` : 'grep'
      if (!matches || matches.length === 0) return `${cmd}\n(无匹配结果)`
      const lines = matches.map(m => `${m.file}:${m.line}: ${m.content}`)
      return `${cmd}\n${truncate(lines.join('\n'), 200)}`
    }
    case 'glob': {
      const pattern = r.pattern as string
      const files = r.files as string[] | undefined
      const cmd = pattern ? `glob "${pattern}"` : 'glob'
      if (!files || files.length === 0) return `${cmd}\n(无匹配文件)`
      return `${cmd}\n${truncate(files.join('\n'), 200)}`
    }
    default:
      return JSON.stringify(result)
  }
}

function renderToolCall(
  toolName: string,
  args: unknown,
  status: 'running' | 'completed' | 'error',
  result?: unknown,
): string {
  const colorTag = status === 'running' ? 'yellow-fg' : status === 'error' ? 'red-fg' : 'green-fg'
  const icon = status === 'running' ? '●' : status === 'error' ? '✗' : '✓'
  const lines: string[] = []
  lines.push(`{${colorTag}}${icon}{/${colorTag}} {bold}${toolName}{/bold} {gray-fg}${JSON.stringify(args)}{/gray-fg}`)
  if (result != null) {
    lines.push(`  {gray-fg}${formatToolResult(toolName, result)}{/gray-fg}`)
  }
  return lines.join('\n')
}

function renderEvent(event: AgentEvent): string {
  switch (event.type) {
    case 'session_start':
    case 'session_end':
    case 'thinking_start':
    case 'thinking_end':
    case 'answer_start':
    case 'answer_end':
      return ''
    case 'thinking_delta':
      return ''
    case 'answer_delta':
      return event.delta
    case 'tool_start':
      return renderToolCall(event.toolName, event.args, 'running')
    case 'tool_end':
      return renderToolCall(event.toolName, {}, 'completed', event.result)
    case 'tool_error':
      return renderToolCall(event.toolName, {}, 'error')
    case 'tool_delta':
      return `   {gray-fg}${event.delta}{/gray-fg}`
    case 'error':
      return `{red-fg}Error: ${event.message}{/red-fg}`
    case 'interaction_required':
      return `{yellow-fg}Agent is waiting for input: ${event.question.question}{/yellow-fg}`
    case 'memory_extracted':
      return `{green-fg}已自动提取 ${event.count} 条记忆{/green-fg}`
    case 'context_compressed': {
      const detail = event.beforeTokens != null
        ? ` (${Math.round(event.beforeTokens / 1000)}K → ${Math.round((event.afterTokens ?? 0) / 1000)}K tokens)`
        : ''
      const pruneInfo = event.prunedToolResults
        ? `，裁剪 ${event.prunedToolResults} 个工具结果`
        : ''
      return `{yellow-fg}${event.compressionType === 'manual' ? '手动压缩' : '自动压缩'}：${event.before} → ${event.after} 条消息${detail}${pruneInfo}{/yellow-fg}`
    }
    case 'loop_detected':
      return `{red-fg}Loop detected: ${event.toolSequence.join(' → ')}{/red-fg}`
  }
}

export function renderEvents(events: ViewEvent[], isRunning: boolean, maxTurns?: number): string {
  const turns: Array<{ events: ViewEvent[] }> = []
  let currentTurn: ViewEvent[] = []
  for (const e of events) {
    if (e.type === 'user_message') {
      if (currentTurn.length > 0) turns.push({ events: currentTurn })
      currentTurn = [e]
    } else {
      currentTurn.push(e)
    }
  }
  if (currentTurn.length > 0) turns.push({ events: currentTurn })

  const isLastTurnRunning = isRunning && turns.length > 0
  const visibleTurns = maxTurns ? turns.slice(-maxTurns) : turns

  const parts: string[] = []

  for (let ti = 0; ti < visibleTurns.length; ti++) {
    const turn = visibleTurns[ti]!
    const events = turn.events

    if (ti > 0) {
      parts.push('{gray-fg}───{/gray-fg}')
    }

    const aiEvents = events.filter(e => e.type !== 'user_message')
    const userEvent = events.find(e => e.type === 'user_message')

    if (userEvent) {
      const content = (userEvent as { type: 'user_message'; content: string }).content
      parts.push(`{bold}{cyan-fg}» ${content}{/cyan-fg}{/bold}`)
    }

    for (const event of aiEvents) {
      if (event.type === 'thinking_delta') continue
      const rendered = renderEvent(event as AgentEvent)
      if (rendered) parts.push(rendered)
    }

    const thinkingText = aiEvents
      .filter((e): e is { type: 'thinking_delta'; turnId: string; delta: string } => e.type === 'thinking_delta')
      .map(e => e.delta)
      .join('')

    if (thinkingText) {
      parts.push(thinkingText)
    }

    if (isLastTurnRunning && ti === visibleTurns.length - 1) {
      parts.push('{yellow-fg}▌{/yellow-fg}')
    }
  }

  return parts.join('\n')
}
