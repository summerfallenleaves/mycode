/**
 * @fileoverview McpListPanel: displays MCP server connection statuses in a bordered panel
 * @module @my-agent/cli/src/components/mcp-list-panel
 */
import { Box, Text } from 'ink'
import type { JSX } from 'react'
import type { MCPServerStatus } from '@my-agent/core'

export function McpListPanel({ statuses }: { statuses: MCPServerStatus[] }): JSX.Element {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Box>
        <Text bold color="cyan"> MCP 服务器</Text>
        <Text dimColor>  按 ESC 退出</Text>
      </Box>
      {statuses.length === 0 ? (
        <Text dimColor>  (未配置 MCP 服务器)</Text>
      ) : statuses.map(s => (
        <Box key={s.name}>
          <Text>{' '}{s.name}{' '}</Text>
          <Text dimColor>{s.type}{' '}</Text>
          <Text color={s.status === 'connected' ? 'green' : s.status === 'error' ? 'red' : 'yellow'}>
            {s.status}
          </Text>
          {s.toolCount > 0 && <Text dimColor>{' '}({s.toolCount} tools)</Text>}
          {s.error && <Text color="red">{' '}{s.error}</Text>}
        </Box>
      ))}
    </Box>
  )
}
