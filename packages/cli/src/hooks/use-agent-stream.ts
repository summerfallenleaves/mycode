/**
 * @fileoverview Custom hook: consumes AsyncGenerator<AgentEvent> from Agent.run(), dispatches ViewEvent to Ink rendering state, polls pending questions. Batches rapid events (thinking_delta) into 50ms intervals to reduce screen flicker.
 * @module @my-agent/cli/src/hooks/use-agent-stream
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import type { AgentEvent, QuestionPayload } from '@my-agent/core'
import { Agent } from '@my-agent/core'

export type ViewEvent = AgentEvent | { type: 'user_message'; content: string }

export interface AgentStreamState {
  events: ViewEvent[]
  isRunning: boolean
  error: string | null
  /** When non-null, the agent is waiting for the user to answer a question. */
  pendingQuestion: QuestionPayload | null
}

/**
 * 将 Agent 的 AsyncGenerator 事件流连接到 React 状态。
 * Ink 和 React Web 都可以使用（纯 React hook，无 DOM依赖）。
 * 自动轮询 Agent.pendingQuestion 以支持 question 工具的交互流程。
 */
export function useAgentStream() {
  const [state, setState] = useState<AgentStreamState>({
    events: [],
    isRunning: false,
    error: null,
    pendingQuestion: null,
  })
  const isRunningRef = useRef(false)
  const agentRef = useRef<Agent | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Poll for pending questions while agent is running
  useEffect(() => {
    if (isRunningRef.current) {
      pollTimerRef.current = setInterval(() => {
        const agent = agentRef.current
        if (agent?.pendingQuestion) {
          setState(prev => {
            // Only update if the question actually changed
            if (prev.pendingQuestion === agent.pendingQuestion) return prev
            return { ...prev, pendingQuestion: agent.pendingQuestion! }
          })
        } else {
          setState(prev => {
            if (prev.pendingQuestion === null) return prev
            return { ...prev, pendingQuestion: null }
          })
        }
      }, 100)
    }
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    }
  }, [state.isRunning])

  const addUserMessage = useCallback((content: string) => {
    setState(prev => ({
      ...prev,
      events: [...prev.events, { type: 'user_message', content }],
    }))
  }, [])

  const addHistoryEvents = useCallback((historyEvents: ViewEvent[]) => {
    setState(prev => ({
      ...prev,
      events: [...prev.events, ...historyEvents],
    }))
  }, [])

  const run = useCallback(async (input: string, agent: Agent) => {
    agentRef.current = agent
    isRunningRef.current = true
    setState(prev => {
      const events = prev.events.length > 0 ? prev.events : []
      return { events, isRunning: true, error: null, pendingQuestion: null }
    })

    // Buffer rapid events (e.g. thinking_delta) and flush at 50ms intervals
    // to avoid flooding Ink with dozens of re-renders per second.
    const eventBuffer: AgentEvent[] = []
    let flushTimer: ReturnType<typeof setTimeout> | null = null

    const flush = () => {
      flushTimer = null
      if (eventBuffer.length === 0) return
      const batch = eventBuffer.splice(0)
      setState(prev => ({
        ...prev,
        events: [...prev.events, ...batch],
      }))
    }

    try {
      for await (const event of agent.run(input)) {
        eventBuffer.push(event)
        if (!flushTimer) {
          flushTimer = setTimeout(flush, 50)
        }
      }

      // Flush remaining buffered events after stream ends
      if (flushTimer) clearTimeout(flushTimer)
      if (eventBuffer.length > 0) {
        const batch = eventBuffer.splice(0)
        setState(prev => ({
          ...prev,
          events: [...prev.events, ...batch],
        }))
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setState(prev => ({ ...prev, error: message }))
    } finally {
      isRunningRef.current = false
      agentRef.current = null
      setState(prev => ({ ...prev, isRunning: false, pendingQuestion: null }))
    }
  }, [])

  const answerQuestion = useCallback((answers: string[]) => {
    const agent = agentRef.current
    if (agent) {
      agent.answerQuestion(answers)
    }
    setState(prev => ({ ...prev, pendingQuestion: null }))
  }, [])

  const reset = useCallback(() => {
    isRunningRef.current = false
    agentRef.current = null
    if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    setState({ events: [], isRunning: false, error: null, pendingQuestion: null })
  }, [])

  return { ...state, addUserMessage, addHistoryEvents, run, answerQuestion, reset }
}
