/**
 * @fileoverview StreamingText component: renders Markdown text incrementally token by token in terminal
 * @module @my-agent/cli/src/components/streaming-text
 */
import { Text } from 'ink'
import type { JSX } from 'react'

interface StreamingTextProps {
  content: string
  isStreaming?: boolean
}

export function StreamingText({ content, isStreaming }: StreamingTextProps): JSX.Element {
  return (
    <Text>
      {content}
      {isStreaming && <Text color="yellow">▌</Text>}
    </Text>
  )
}
