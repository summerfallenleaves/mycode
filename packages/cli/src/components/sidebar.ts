/**
 * @fileoverview Renders TodoItem[] to unblessed tagged strings for the right sidebar Box.
 * @module @my-agent/cli/src/components/sidebar
 */
import type { TodoItem } from '@my-agent/core'

function statusIcon(status: TodoItem['status']): string {
  switch (status) {
    case 'pending': return '○'
    case 'in_progress': return '◉'
    case 'completed': return '✓'
    case 'cancelled': return '✕'
  }
}

function statusColorTag(status: TodoItem['status']): string {
  switch (status) {
    case 'pending': return 'gray-fg'
    case 'in_progress': return 'yellow-fg'
    case 'completed': return 'green-fg'
    case 'cancelled': return 'red-fg'
  }
}

export function renderSidebar(todos: TodoItem[], width: number): string {
  const innerWidth = width - 2
  const maxVisible = 30
  const visible = todos.slice(0, maxVisible)
  const remaining = todos.length - maxVisible
  const lines: string[] = []

  lines.push(`{bold}{cyan-fg} Todos{/cyan-fg}{/bold} {gray-fg}(${todos.length}){/gray-fg}`)

  if (todos.length === 0) {
    lines.push('{gray-fg}No todos{/gray-fg}')
    return lines.join('\n')
  }

  for (const t of visible) {
    const colorTag = statusColorTag(t.status)
    const icon = statusIcon(t.status)
    const dimWrap = t.status === 'completed' || t.status === 'cancelled'
    const text = t.content.length > innerWidth - 3
      ? t.content.slice(0, innerWidth - 4) + '…'
      : t.content
    if (dimWrap) {
      lines.push(`{${colorTag}}${icon}{/${colorTag}} {gray-fg}${text}{/gray-fg}`)
    } else {
      lines.push(`{${colorTag}}${icon}{/${colorTag}} ${text}`)
    }
  }

  if (remaining > 0) {
    lines.push(`{gray-fg}... +${remaining} more{/gray-fg}`)
  }

  return lines.join('\n')
}
