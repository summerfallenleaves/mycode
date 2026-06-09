/**
 * @fileoverview ToolRegistry class, Tool/ToolContext/ToolEvent/ToolResult interfaces, Vercel AI SDK tool set conversion
 * @module @my-agent/core/tools/registry
 */

import { z } from 'zod'

export interface QuestionOption {
  label: string
  description?: string
}

export interface QuestionPayload {
  question: string
  header?: string
  options?: Array<QuestionOption>
  multiple?: boolean
}

export interface ToolContext {
  sessionId: string
  /** Absolute path to the session's private directory (.mycode/sessions/{sessionId}/). Tools should store session-scoped data here. */
  sessionDir: string
  /** Absolute path to the project root directory. Tools can use this for project-scoped storage. */
  projectRoot: string
  signal: AbortSignal
  logger: (msg: string) => void
  askQuestion?: (question: QuestionPayload) => Promise<string[]>
  /** Callback for tools to emit progress/data events. Agent uses this to bridge ToolEvent → AgentEvent for CLI real-time display. */
  emitToolEvent?: (event: ToolEvent) => void
}

export type ToolEvent =
  | { type: 'progress'; message: string }
  | { type: 'data'; chunk: string }
  | { type: 'question_ask'; question: QuestionPayload }

export type ToolResult = Record<string, unknown>

export interface Tool<TNext = undefined> {
  name: string
  description: string
  parameters: z.ZodSchema<unknown>
  execute(
    args: unknown,
    context: ToolContext,
  ): AsyncGenerator<ToolEvent, ToolResult, TNext>
}

export class ToolRegistry {
  private tools = new Map<string, Tool<unknown>>()

  register<TNext>(tool: Tool<TNext>): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`)
    }
    this.tools.set(tool.name, tool as Tool<unknown>)
  }

  get(name: string): Tool<unknown> | undefined {
    return this.tools.get(name)
  }

  getAll(): Tool<unknown>[] {
    return Array.from(this.tools.values())
  }

  toToolSet(
    context: ToolContext,
  ): Record<string, { description: string; inputSchema: z.ZodSchema<unknown>; execute: (args: unknown) => Promise<unknown> }> {
    const set: Record<string, { description: string; inputSchema: z.ZodSchema<unknown>; execute: (args: unknown) => Promise<unknown> }> = {}
    for (const tool of this.tools.values()) {
      set[tool.name] = {
        description: tool.description,
        inputSchema: tool.parameters,
        execute: async (args: unknown) => {
          const generator = tool.execute(args, context)
          let result: ToolResult = {}
          let next = await generator.next()
          while (!next.done) {
            const event = next.value as ToolEvent
            if (event.type === 'question_ask' && context.askQuestion) {
              const answer = await context.askQuestion(event.question)
              next = await generator.next(answer as never)
            } else {
              context.emitToolEvent?.(event)
              next = await generator.next()
            }
          }
          if (next.value) result = next.value as ToolResult
          return result
        },
      }
    }
    return set
  }

  toLangChainTools(context: ToolContext): Array<ReturnType<typeof import('langchain').tool>> {
    const tools: Array<ReturnType<typeof import('langchain').tool>> = []
    for (const mycodeTool of this.tools.values()) {
      const wrapper = {
        name: mycodeTool.name,
        description: mycodeTool.description,
        schema: mycodeTool.parameters,
        invoke: async (input: unknown) => {
          // LangChain may wrap single-arg tools as { input: ... }
          let args = input
          if (args && typeof args === 'object' && !Array.isArray(args)
            && Object.keys(args).length === 1 && 'input' in (args as Record<string, unknown>)) {
            const inner = (args as Record<string, unknown>).input
            args = typeof inner === 'string' ? JSON.parse(inner) : inner
          }
          const generator = mycodeTool.execute(args, context)
          let result: ToolResult = {}
          let next = await generator.next()
          while (!next.done) {
            const event = next.value as ToolEvent
            if (event.type === 'question_ask' && context.askQuestion) {
              const answer = await context.askQuestion(event.question)
              next = await generator.next(answer as never)
            } else {
              context.emitToolEvent?.(event)
              next = await generator.next()
            }
          }
          if (next.value) result = next.value as ToolResult
          return JSON.stringify(result)
        },
      }
      tools.push(wrapper as any)
    }
    return tools
  }
}
