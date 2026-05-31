/**
 * @fileoverview UnknownCmdPanel: displays error when user types an unrecognized /command
 * @module @my-agent/cli/src/components/unknown-cmd-panel
 */
import { Box, Text } from 'ink'
import type { JSX } from 'react'

export function UnknownCmdPanel({ cmd }: { cmd: string }): JSX.Element {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="red" paddingX={1}>
      <Box>
        <Text bold color="red"> 未知命令：</Text>
        <Text bold>{cmd}</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>输入 / 查看所有可用命令，按任意键继续</Text>
      </Box>
    </Box>
  )
}
