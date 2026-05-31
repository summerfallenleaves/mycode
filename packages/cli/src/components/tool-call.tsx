/**
 * @fileoverview ToolCall component: displays tool invocation status card with tool-specific formatting
 * @module @my-agent/cli/src/components/tool-call
 */
import { Box, Text } from 'ink'
import type { JSX } from 'react'

interface ToolCallProps {
  toolName: string
  args: unknown
  status: 'running' | 'completed' | 'error'
  result?: unknown
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen) + '...'
}

function formatResult(toolName: string, result: unknown): string {
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
      const oldPreview = truncate(oldStr, 80)
      const newPreview = truncate(newStr, 80)
      return `编辑文件: ${path}\n原: ${oldPreview}\n新: ${newPreview}`
    }

    case 'write': {
      const path = r.path as string
      const content = r.content as string
      if (!path) return ''
      const contentPreview = truncate(content, 200)
      return `写入文件: ${path}\n内容:\n${contentPreview}`
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

export function ToolCall({ toolName, args, status, result }: ToolCallProps): JSX.Element {
  const color = status === 'running' ? 'yellow' : status === 'error' ? 'red' : 'green'
  const icon = status === 'running' ? '●' : status === 'error' ? '✗' : '✓'

  return (
    <Box flexDirection="column" marginY={1}>
      <Box>
        <Text color={color}>{icon}</Text>
        <Text bold> {toolName}</Text>
        <Text dimColor> {JSON.stringify(args)}</Text>
      </Box>
      {result != null && (
        <Box marginLeft={2}>
          <Text dimColor>{formatResult(toolName, result)}</Text>
        </Box>
      )}
    </Box>
  )
}
