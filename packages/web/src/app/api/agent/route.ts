/**
 * @fileoverview SSE API route with POST handler that runs the Agent and streams AsyncGenerator<AgentEvent> as Server-Sent Events
 * @module @my-agent/web/src/app/api/agent/route
 */

import { Agent, createAdapter, ToolRegistry, readFileTool, editTool, writeTool, bashTool, grepTool, globTool, questionTool, todowriteTool } from '@my-agent/core'

// SSE 端点：将 AsyncGenerator<AgentEvent> 映射为 Server-Sent Events
export async function POST(req: Request) {
  const body = (await req.json()) as { input?: string }
  const input = body.input ?? ''

  if (!input.trim()) {
    return new Response(JSON.stringify({ error: 'input is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const agent = new Agent({
    llm: createAdapter({
      format: 'openai',
      baseUrl: 'https://api.deepseek.com',
      apiKey: process.env.MYCODE_API_KEY ?? '',
      model: 'deepseek-v4-flash',
    }),
    tools: (() => {
      const t = new ToolRegistry()
      t.register(readFileTool)
      t.register(editTool)
      t.register(writeTool)
      t.register(bashTool)
  t.register(grepTool)
  t.register(globTool)
  t.register(questionTool)
  t.register(todowriteTool)
      return t
    })(),
    systemPrompt: '你是mycode，由summerfallenleaves开发的AI助手。',
  })

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of agent.run(input)) {
          controller.enqueue(`data: ${JSON.stringify(event)}\n\n`)
        }
        controller.enqueue('data: [DONE]\n\n')
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        controller.enqueue(`data: ${JSON.stringify({ type: 'error', message })}\n\n`)
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
