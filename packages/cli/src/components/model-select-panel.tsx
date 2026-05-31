/**
 * @fileoverview ModelSelectPanel: LLM provider selection list with keyboard navigation
 * @module @my-agent/cli/src/components/model-select-panel
 */
import { Box, Text } from 'ink'
import type { JSX } from 'react'
import type { LLMProviderConfig } from '@my-agent/core'

export function ModelSelectPanel({
  providers,
  selectIdx,
}: {
  providers: Array<[name: string, config: LLMProviderConfig]>
  selectIdx: number
}): JSX.Element {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text bold color="cyan"> 选择模型</Text>
      {providers.map(([name, prov], i) => (
        <Text key={name} inverse={i === selectIdx} color={i === selectIdx ? 'cyan' : undefined}>
          {' '}{i === selectIdx ? '▸' : ' '} {name} — {prov.model}{' '}
        </Text>
      ))}
    </Box>
  )
}
