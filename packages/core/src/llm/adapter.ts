/**
 * @fileoverview Vercel AI SDK adapter: LLMConfig/LLMMessage types, createAdapter(), provider format support (openai/anthropic), developer→system role fix
 * @module @my-agent/core/llm/adapter
 */

import type { ToolSet } from 'ai'
import { stepCountIs } from 'ai'

export type ProviderFormat = 'openai' | 'anthropic'

export interface LLMConfig {
  format: ProviderFormat
  baseUrl: string
  apiKey: string
  model: string
  contextWindow?: number
  maxOutputTokens?: number
}

export interface LLMMessage {
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: string
  toolName?: string
  toolResult?: unknown
}

export type LLMStreamEvent =
  | { type: 'text-delta'; delta: string }
  | { type: 'tool-start'; toolName: string; args: unknown }
  | { type: 'tool-end'; toolName: string; result: unknown }

export interface LLMStreamResult {
  stream: AsyncGenerator<LLMStreamEvent, void, undefined>
  responseMessages: Promise<Array<LLMMessage>>
}

export interface LLMAdapter {
  streamText(params: {
    model: string
    system?: string
    messages: Array<LLMMessage>
    tools: Record<string, { description?: string; inputSchema: unknown; execute?: (args: unknown) => Promise<unknown> }>
    maxSteps?: number
    signal?: AbortSignal
  }): LLMStreamResult
}

function toProviderMessage(msg: LLMMessage): Record<string, unknown> {
  if (msg.role === 'tool') {
    return { role: 'tool', content: JSON.stringify({ result: msg.toolResult }) }
  }
  return { role: msg.role, content: msg.content }
}

export function createAdapter(config: LLMConfig): LLMAdapter {
  return {
    streamText(params) {
      let resolveMessages: (msgs: Array<LLMMessage>) => void = () => {}
      const responseMessages = new Promise<Array<LLMMessage>>(resolve => { resolveMessages = resolve })

      async function* runStream(): AsyncGenerator<LLMStreamEvent> {
        const [vStreamText, languageModel] = await Promise.all([
          import('ai').then(m => m.streamText),
          createLanguageModel(config),
        ])

        const result = vStreamText({
          model: languageModel as never,
          system: params.system,
          messages: params.messages.map(toProviderMessage) as never,
          tools: params.tools as ToolSet,
          stopWhen: stepCountIs(params.maxSteps ?? 5),
          abortSignal: params.signal,
        })

        // Extract response messages in parallel with stream consumption
        const responsePromise = result.response.then((res: any) => {
          const msgs: Array<LLMMessage> = []
          for (const raw of res.messages ?? []) {
            if (raw.role === 'assistant') {
              let content = ''
              if (typeof raw.content === 'string') {
                content = raw.content
              } else if (Array.isArray(raw.content)) {
                content = raw.content
                  .filter((part: any) => part.type === 'text')
                  .map((part: any) => part.text)
                  .join('')
              }
              msgs.push({ role: 'assistant', content })
            } else if (raw.role === 'tool') {
              msgs.push({ role: 'tool', content: typeof raw.content === 'string' ? raw.content : JSON.stringify(raw.content) })
            }
          }
          return msgs
        })

        for await (const chunk of result.fullStream) {
          switch (chunk.type) {
            case 'text-delta':
              yield { type: 'text-delta', delta: chunk.text }
              break
            case 'tool-call':
              yield { type: 'tool-start', toolName: chunk.toolName, args: chunk.input }
              break
            case 'tool-result':
              yield { type: 'tool-end', toolName: chunk.toolName, result: chunk.output }
              break
            case 'error':
              throw new Error((chunk.error as Error).message)
          }
        }

        resolveMessages(await responsePromise)
      }

      return { stream: runStream(), responseMessages }
    },
  }
}

async function createLanguageModel(config: LLMConfig): Promise<unknown> {
  if (config.format === 'anthropic') {
    const { createAnthropic } = await import('@ai-sdk/anthropic')
    const provider = createAnthropic({ baseURL: config.baseUrl, apiKey: config.apiKey })
    return provider.chat(config.model)
  }
  const { createOpenAI } = await import('@ai-sdk/openai')
  const provider = createOpenAI({ baseURL: config.baseUrl, apiKey: config.apiKey })
  const rawModel = provider.chat(config.model) as any

  const origGetArgs = rawModel.getArgs.bind(rawModel)
  rawModel.getArgs = async (options: Record<string, unknown>) => {
    const result = await origGetArgs(options)
    if (result.args?.messages) {
      for (const msg of result.args.messages) {
        if (msg.role === 'developer') msg.role = 'system'
      }
    }
    return result
  }
  return rawModel
}
