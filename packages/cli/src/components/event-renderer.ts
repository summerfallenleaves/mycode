/**
 * @fileoverview Renders ViewEvent[] to blessed tagged strings for ScrollableText content area.
 * Groups events into turns (user_message boundaries), consolidates tool calls into single
 * visual units, and formats each tool type with structured summaries.
 * @module @my-agent/cli/src/components/event-renderer
 */
import type { AgentEvent } from '@my-agent/core'
import type { ViewEvent } from '../lib/agent-stream-manager.js'

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen) + '...'
}

function headTail(str: string, headLines: number, tailLines: number, maxLineLen: number): string {
  const allLines = str.split('\n')
  if (allLines.length <= headLines + tailLines + 1) {
    return allLines.map(l => truncate(l, maxLineLen)).join('\n')
  }
  const head = allLines.slice(0, headLines).map(l => truncate(l, maxLineLen))
  const tail = allLines.slice(-tailLines).map(l => truncate(l, maxLineLen))
  const omitted = allLines.length - headLines - tailLines
  return [...head, `  ... 省略 ${omitted} 行 ...`, ...tail].join('\n')
}

function formatToolArgs(toolName: string, args: unknown): string {
  const a = args as Record<string, unknown>
  switch (toolName) {
    case 'bash':
      return `$ ${a.command ?? ''}`
    case 'read_file':
      return a.path ? String(a.path) : ''
    case 'write':
      return a.path ? `${a.path} (${formatSize(a.content)})` : ''
    case 'edit':
      return a.path ? String(a.path) : ''
    case 'grep':
      return a.pattern ? `"${a.pattern}" in ${a.include ?? '.'}` : 'grep'
    case 'glob':
      return a.pattern ? `"${a.pattern}"` : 'glob'
    case 'question':
      return a.question ? truncate(String(a.question), 60) : 'question'
    case 'todowrite':
      return `${a.todos ? (a.todos as unknown[]).length : 0} items`
    default:
      return truncate(JSON.stringify(args), 80)
  }
}

function formatSize(content: unknown): string {
  if (typeof content !== 'string') return '?'
  const len = content.length
  return len < 1024 ? `${len}B` : `${(len / 1024).toFixed(1)}K`
}

function formatToolResult(toolName: string, result: unknown): string {
  const r = result as Record<string, unknown>

  switch (toolName) {
    case 'bash': {
      const exitCode = r.exitCode as number
      const stdout = r.stdout as string | undefined
      const stderr = r.stderr as string | undefined
      const exit = exitCode !== 0 ? ` (exit ${exitCode})` : ''
      if (!stdout && !stderr) return exit || '(无输出)'
      const output = (stdout || stderr)!.trim()
      if (!output) return exit || '(无输出)'
      return `${headTail(output, 3, 1, 120)}${exit}`
    }
    case 'read_file': {
      const path = r.path as string
      const content = r.content as string | undefined
      if (!path) return ''
      if (!content) return path
      const lines = content.split('\n').length
      return `${path} (${lines} 行)`
    }
    case 'edit': {
      const path = r.path as string
      const error = r.error as string | undefined
      if (error) return `${path} — {red-fg}${error}{/red-fg}`
      const count = r.replacements as number
      const oldStr = r.old as string
      const newStr = r.new as string
      const summary = count > 1 ? ` (${count} 处替换)` : ''
      return `${path}${summary}: "${truncate(oldStr, 40)}" → "${truncate(newStr, 40)}"`
    }
    case 'write': {
      const path = r.path as string
      return path ? `${path} (${formatSize(r.content)})` : ''
    }
    case 'grep': {
      const pattern = r.pattern as string
      const matches = r.matches as Array<{ file: string; line: number; content: string }> | undefined
      const truncated = r.truncated as boolean | undefined
      const count = matches?.length ?? 0
      const tag = truncated ? `${count}+` : `${count}`
      if (!matches || count === 0) return `"${pattern}" — 无匹配`
      const preview = matches.slice(0, 5).map(m => `${m.file}:${m.line}: ${truncate(m.content, 80)}`)
      const tail = count > 5 ? `\n  ... 还有 ${count - 5} 个匹配` : ''
      return `"${pattern}" (${tag} matches)\n${preview.join('\n')}${tail}`
    }
    case 'glob': {
      const pattern = r.pattern as string
      const files = r.files as string[] | undefined
      const count = files?.length ?? 0
      if (!files || count === 0) return `"${pattern}" — 无匹配`
      const preview = files.slice(0, 5).map(f => truncate(f, 80))
      const tail = count > 5 ? `\n  ... 还有 ${count - 5} 个文件` : ''
      return `"${pattern}" (${count} files)\n${preview.join('\n')}${tail}`
    }
    default:
      return truncate(JSON.stringify(result), 200)
  }
}

interface ToolCallGroup {
  toolName: string
  args: unknown
  status: 'running' | 'completed' | 'error'
  result?: unknown
  errorMessage?: string
  deltas: string[]
}

function renderToolSummary(group: ToolCallGroup): string {
  const { toolName, args, status, result, errorMessage } = group
  const colorTag = status === 'running' ? 'yellow-fg' : status === 'error' ? 'red-fg' : 'green-fg'
  const icon = status === 'running' ? '●' : status === 'error' ? '✗' : '✓'

  const argSummary = formatToolArgs(toolName, args)
  const header = `{${colorTag}}${icon}{/${colorTag}} {bold}${toolName}{/bold} ${argSummary}`

  if (status === 'running') return header

  if (status === 'error') {
    const msg = errorMessage ?? 'unknown error'
    return `${header}\n  {red-fg}${truncate(msg, 200)}{/red-fg}`
  }

  const resultSummary = formatToolResult(toolName, result)
  if (!resultSummary) return header

  return `${header}\n  {gray-fg}${resultSummary}{/gray-fg}`
}

function renderNonToolEvent(event: AgentEvent): string {
  switch (event.type) {
    case 'session_start':
    case 'session_end':
    case 'thinking_start':
    case 'thinking_end':
    case 'answer_start':
    case 'answer_end':
    case 'tool_start':
    case 'tool_delta':
    case 'tool_end':
    case 'tool_error':
      return ''
    case 'thinking_delta':
      return ''
    case 'answer_delta':
      return event.delta
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

function consolidateToolCalls(events: ViewEvent[]): ToolCallGroup[] {
  const groups: ToolCallGroup[] = []
  const pending = new Map<number, ToolCallGroup>()

  for (const event of events) {
    const e = event as AgentEvent
    if (e.type === 'tool_start') {
      const group: ToolCallGroup = {
        toolName: e.toolName,
        args: e.args,
        status: 'running',
        deltas: [],
      }
      groups.push(group)
      pending.set(groups.length - 1, group)
    } else if (e.type === 'tool_delta') {
      for (const g of groups) {
        if (g.toolName === e.toolName && g.status === 'running') {
          g.deltas.push(e.delta)
          break
        }
      }
    } else if (e.type === 'tool_end') {
      for (let i = groups.length - 1; i >= 0; i--) {
        const g = groups[i]!
        if (g.toolName === e.toolName && g.status === 'running') {
          g.status = 'completed'
          g.result = e.result
          pending.delete(i)
          break
        }
      }
    } else if (e.type === 'tool_error') {
      for (let i = groups.length - 1; i >= 0; i--) {
        const g = groups[i]!
        if (g.toolName === e.toolName && g.status === 'running') {
          g.status = 'error'
          g.errorMessage = e.error
          pending.delete(i)
          break
        }
      }
    }
  }

  return groups
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
    const turnEvents = turn.events

    if (ti > 0) {
      parts.push('{gray-fg}───{/gray-fg}')
    }

    const userEvent = turnEvents.find(e => e.type === 'user_message')
    if (userEvent) {
      const content = (userEvent as { type: 'user_message'; content: string }).content
      parts.push(`{bold}{cyan-fg}» ${content}{/cyan-fg}{/bold}`)
    }

    const toolGroups = consolidateToolCalls(turnEvents)

    const answerParts: string[] = []
    const otherParts: string[] = []
    const thinkingDeltas: string[] = []

    for (const event of turnEvents) {
      const e = event as AgentEvent | { type: 'user_message'; content: string }
      if (e.type === 'user_message' || e.type === 'tool_start' || e.type === 'tool_delta'
        || e.type === 'tool_end' || e.type === 'tool_error') {
        continue
      }
      if (e.type === 'answer_delta') {
        answerParts.push(e.delta)
        continue
      }
      if (e.type === 'thinking_delta') {
        thinkingDeltas.push(e.delta)
        continue
      }
      const rendered = renderNonToolEvent(e)
      if (rendered) otherParts.push(rendered)
    }

    for (const group of toolGroups) {
      parts.push(renderToolSummary(group))
    }

    for (const p of otherParts) {
      parts.push(p)
    }

    const thinkingText = thinkingDeltas.join('')
    if (thinkingText) parts.push(thinkingText)

    const answerText = answerParts.join('')
    if (answerText) parts.push(answerText)

    if (isLastTurnRunning && ti === visibleTurns.length - 1) {
      parts.push('{yellow-fg}▌{/yellow-fg}')
    }
  }

  return parts.join('\n')
}
