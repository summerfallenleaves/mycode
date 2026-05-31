/**
 * @fileoverview ShellOutputPanel: displays shell command stdout/stderr/exitCode in a bordered panel
 * @module @my-agent/cli/src/components/shell-output-panel
 */
import { Box, Text } from 'ink'
import type { JSX } from 'react'

export interface ShellOutputData {
  command: string
  stdout: string
  stderr: string
  exitCode: number
}

export function ShellOutputPanel({ data }: { data: ShellOutputData }): JSX.Element {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={data.exitCode === 0 ? 'green' : 'red'} paddingX={1}>
      <Box>
        <Text bold color={data.exitCode === 0 ? 'green' : 'red'}> $ </Text>
        <Text bold>{data.command}</Text>
        <Text dimColor>  按 ESC 返回</Text>
      </Box>
      {data.stdout && (
        <Box marginTop={1} flexDirection="column">
          <Text>{data.stdout}</Text>
        </Box>
      )}
      {data.stderr && (
        <Box marginTop={1} flexDirection="column">
          <Text color="red">{data.stderr}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor>exit code: {data.exitCode}</Text>
      </Box>
    </Box>
  )
}
