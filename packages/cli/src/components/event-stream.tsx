/**
 * @fileoverview EventStream: renders AgentEvent[] grouped by question-answer turn, with ToolCall cards, streaming text, and system events
 * @module @my-agent/cli/src/components/event-stream
 */
import { Box, Text } from 'ink'
import type { JSX } from 'react'
import type { ViewEvent } from '../hooks/use-agent-stream.js'
import { StreamingText } from './streaming-text.js'
import { ToolCall } from './tool-call.js'

export function EventStream({
  events,
  isRunning,
}: {
  events: ViewEvent[]
  isRunning: boolean
}): JSX.Element {
  // Group events into turns: a turn starts with a user_message and includes all AI events until the next user_message.
  // This ensures each turn contains exactly one question + its full answer (thinking, tools, final text).
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

  const children = turns.flatMap((turn, ti) => {
    const elements: JSX.Element[] = []

    if (ti > 0) {
      elements.push(
        <Text key={`sep-${ti}`} color="gray">───</Text>,
      )
    }

    // Separate AI content from user message for two-column layout
    const aiEvents = turn.events.filter(e => e.type !== 'user_message')
    const userEvent = turn.events.find(e => e.type === 'user_message')

    // Render user message (right column) — shown first chronologically
    if (userEvent) {
      elements.push(
        <Box key={`user-${ti}`} justifyContent="flex-end" width="100%">
          <Box>
            <Text bold color="cyan">{userEvent.content}</Text>
          </Box>
        </Box>,
      )
    }

    // Render AI content (left column) — tool calls, thinking text, errors
    for (const event of aiEvents) {
      switch (event.type) {
        case 'session_start':
          break
        case 'session_end':
          break
        case 'thinking_start':
        case 'thinking_end':
          break
        case 'thinking_delta':
          break
        case 'answer_start':
        case 'answer_end':
          break
        case 'answer_delta':
          elements.push(
            <StreamingText
              key={`ans-${ti}-${elements.length}`}
              content={event.delta}
              isStreaming={isLastTurnRunning && ti === turns.length - 1}
            />,
          )
          break
        case 'tool_start':
          elements.push(
            <ToolCall key={`tool-${ti}-${event.toolName}`} toolName={event.toolName} args={event.args} status="running" />,
          )
          break
        case 'tool_end':
          elements.push(
            <ToolCall key={`tool-${ti}-${event.toolName}-end`} toolName={event.toolName} args={{}} status="completed" result={event.result} />,
          )
          break
        case 'tool_error':
          elements.push(
            <ToolCall key={`tool-${ti}-${event.toolName}-err`} toolName={event.toolName} args={{}} status="error" />,
          )
          break
        case 'tool_delta':
          elements.push(
            <Box key={`tool-${ti}-${event.toolName}-delta-${elements.length}`} marginLeft={3}>
              <Text dimColor>{event.delta}</Text>
            </Box>,
          )
          break
        case 'error':
          elements.push(
            <Text key={`err-${ti}`} color="red">Error: {event.message}</Text>,
          )
          break
        case 'interaction_required':
          elements.push(
            <Text key={`int-${ti}`} color="yellow">Agent is waiting for input: {event.question.question}</Text>,
          )
          break
      }
    }

    // Aggregate thinking_delta from AI events into a single streaming text block per turn
    const text = aiEvents
      .filter((e): e is { type: 'thinking_delta'; turnId: string; delta: string } => e.type === 'thinking_delta')
      .map(e => e.delta)
      .join('')

    if (text) {
      elements.push(
        <StreamingText
          key={`text-${ti}`}
          content={text}
          isStreaming={isLastTurnRunning && ti === turns.length - 1}
        />,
      )
    }

    return elements
  })

  return <>{children}</>
}
