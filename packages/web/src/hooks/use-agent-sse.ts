/**
 * @fileoverview Custom React hook that fetches POST /api/agent, parses the SSE stream, and returns events, isRunning, error, run, and cancel
 * @module @my-agent/web/src/hooks/use-agent-sse
 */

'use client'

import { useState, useCallback, useRef } from 'react'
import type { AgentEvent } from '@my-agent/core'

interface SSEState {
  events: AgentEvent[]
  isRunning: boolean
  error: string | null
}

export function useAgentSSE() {
  const [state, setState] = useState<SSEState>({
    events: [],
    isRunning: false,
    error: null,
  })
  const abortRef = useRef<AbortController | null>(null)

  const run = useCallback(async (input: string) => {
    abortRef.current?.abort()
    const abort = new AbortController()
    abortRef.current = abort

    setState({ events: [], isRunning: true, error: null })

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
        signal: abort.signal,
      })

      if (!res.ok) {
        setState({ events: [], isRunning: false, error: `HTTP ${res.status}` })
        return
      }

      const reader = res.body?.getReader()
      if (!reader) {
        setState({ events: [], isRunning: false, error: 'No response body' })
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue
            try {
              const event = JSON.parse(data) as AgentEvent
              setState(prev => ({
                ...prev,
                events: [...prev.events, event],
              }))
            } catch {
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      const message = err instanceof Error ? err.message : String(err)
      setState(prev => ({ ...prev, error: message }))
    } finally {
      setState(prev => ({ ...prev, isRunning: false }))
    }
  }, [])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    setState({ events: [], isRunning: false, error: null })
  }, [])

  return { ...state, run, cancel }
}
