/**
 * @fileoverview Imperative Agent stream manager: extracts core logic from useAgentStream React hook
 * into a plain class for use with @unblessed/node (no React dependency).
 * Buffers rapid events (thinking_delta) into 50ms intervals and exposes an onChange callback for UI updates.
 * @module @my-agent/cli/lib/agent-stream-manager
 */
import type { AgentEvent, QuestionPayload } from '@my-agent/core'
import { Agent } from '@my-agent/core'

export type ViewEvent = AgentEvent | { type: 'user_message'; content: string }

export interface AgentStreamState {
  events: ViewEvent[]
  isRunning: boolean
  error: string | null
  pendingQuestion: QuestionPayload | null
}

/**
 * Manages the Agent's AsyncGenerator event stream outside of React.
 * Replaces the useAgentStream hook with an identical imperative API.
 */
export class AgentStreamManager {
  state: AgentStreamState = {
    events: [],
    isRunning: false,
    error: null,
    pendingQuestion: null,
  }

  private agent: Agent | null = null
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private onChange: () => void

  constructor(onChange: () => void) {
    this.onChange = onChange
  }

  private notify(): void {
    this.onChange()
  }

  private startPolling(): void {
    this.stopPolling()
    this.pollTimer = setInterval(() => {
      const agent = this.agent
      if (agent?.pendingQuestion) {
        if (this.state.pendingQuestion !== agent.pendingQuestion) {
          this.state = { ...this.state, pendingQuestion: agent.pendingQuestion! }
          this.notify()
        }
      } else {
        if (this.state.pendingQuestion !== null) {
          this.state = { ...this.state, pendingQuestion: null }
          this.notify()
        }
      }
    }, 100)
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }

  addUserMessage(content: string): void {
    this.state = {
      ...this.state,
      events: [...this.state.events, { type: 'user_message', content }],
    }
    this.notify()
  }

  addHistoryEvents(historyEvents: ViewEvent[]): void {
    this.state = {
      ...this.state,
      events: [...this.state.events, ...historyEvents],
    }
    this.notify()
  }

  async run(input: string, agent: Agent): Promise<void> {
    this.agent = agent
    this.state = {
      events: this.state.events.length > 0 ? this.state.events : [],
      isRunning: true,
      error: null,
      pendingQuestion: null,
    }
    this.startPolling()
    this.notify()

    const eventBuffer: AgentEvent[] = []
    let flushTimer: ReturnType<typeof setTimeout> | null = null

    const flush = (): void => {
      flushTimer = null
      if (eventBuffer.length === 0) return
      const batch = eventBuffer.splice(0)
      this.state = { ...this.state, events: [...this.state.events, ...batch] }
      this.notify()
    }

    try {
      for await (const event of agent.run(input)) {
        eventBuffer.push(event)
        if (!flushTimer) {
          flushTimer = setTimeout(flush, 50)
        }
      }

      if (flushTimer) clearTimeout(flushTimer)
      if (eventBuffer.length > 0) {
        const batch = eventBuffer.splice(0)
        this.state = { ...this.state, events: [...this.state.events, ...batch] }
        this.notify()
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.state = { ...this.state, error: message }
      this.notify()
    } finally {
      this.agent = null
      this.stopPolling()
      this.state = { ...this.state, isRunning: false, pendingQuestion: null }
      this.notify()
    }
  }

  answerQuestion(answers: string[]): void {
    if (this.agent) {
      this.agent.answerQuestion(answers)
    }
    this.state = { ...this.state, pendingQuestion: null }
    this.notify()
  }

  reset(): void {
    this.agent = null
    this.stopPolling()
    this.state = { events: [], isRunning: false, error: null, pendingQuestion: null }
    this.notify()
  }
}
