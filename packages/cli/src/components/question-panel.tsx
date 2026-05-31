/**
 * @fileoverview QuestionPanel: displays a question from the question tool with numbered options
 * @module @my-agent/cli/src/components/question-panel
 */
import { Box, Text } from 'ink'
import type { JSX } from 'react'
import type { QuestionPayload } from '@my-agent/core'

export function QuestionPanel({ question }: { question: QuestionPayload }): JSX.Element {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
      <Box>
        <Text bold color="yellow"> ? </Text>
        <Text bold>{question.header ?? '需要你的输入'}</Text>
      </Box>
      <Box marginTop={1}>
        <Text>{question.question}</Text>
      </Box>
      {question.options && question.options.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          {question.options.map((opt, i) => (
            <Box key={opt.label}>
              <Text dimColor>{'  '}{i + 1}. </Text>
              <Text>{opt.label}</Text>
              {opt.description && <Text dimColor> — {opt.description}</Text>}
            </Box>
          ))}
          <Box marginTop={1}>
            <Text dimColor>输入选项编号后按 Enter</Text>
          </Box>
        </Box>
      )}
      {(!question.options || question.options.length === 0) && (
        <Box marginTop={1}>
          <Text dimColor>输入回答后按 Enter</Text>
        </Box>
      )}
    </Box>
  )
}
