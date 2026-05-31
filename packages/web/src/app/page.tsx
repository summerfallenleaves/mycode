/**
 * @fileoverview Home page (client component) with chat input and event list display, uses useAgentSSE hook to interact with the agent API
 * @module @my-agent/web/src/app/page
 */

'use client'

import { useState, type JSX } from 'react'
import { useAgentSSE } from '../hooks/use-agent-sse'

export default function HomePage(): JSX.Element {
  const [input, setInput] = useState('')
  const { events, isRunning, error, run, cancel } = useAgentSSE()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (input.trim()) run(input.trim())
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 20 }}>
      <h1>mycode</h1>

      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="输入你的问题..."
          disabled={isRunning}
          style={{ width: '80%', padding: 8, fontSize: 16 }}
        />
        <button type="submit" disabled={isRunning} style={{ padding: '8px 16px', marginLeft: 8 }}>
          {isRunning ? '运行中...' : '发送'}
        </button>
        {isRunning && (
          <button type="button" onClick={cancel} style={{ padding: '8px 16px', marginLeft: 8 }}>
            取消
          </button>
        )}
      </form>

      {error && <p style={{ color: 'red' }}>Error: {error}</p>}

      <div style={{ marginTop: 20 }}>
        {events.map((event, i) => {
          switch (event.type) {
            case 'thinking_delta':
              return <span key={i}>{event.delta}</span>
            case 'tool_start':
              return <p key={i}><strong>Tool:</strong> {event.toolName} {JSON.stringify(event.args)}</p>
            case 'tool_end':
              return <p key={i}><strong>Result:</strong> {JSON.stringify(event.result)}</p>
            case 'tool_error':
              return <p key={i} style={{ color: 'red' }}><strong>Tool Error:</strong> {event.error}</p>
            case 'error':
              return <p key={i} style={{ color: 'red' }}>Error: {event.message}</p>
            default:
              return null
          }
        })}
      </div>
    </div>
  )
}
