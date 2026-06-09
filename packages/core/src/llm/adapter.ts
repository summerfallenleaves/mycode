import { ChatOpenAI } from '@langchain/openai'
import { ChatAnthropic } from '@langchain/anthropic'
import { ChatDeepSeek } from '@langchain/deepseek'
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'

export type ProviderFormat = 'openai' | 'anthropic' | 'deepseek'

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

function toLangChainMessages(messages: Array<LLMMessage>): Array<HumanMessage | AIMessage | SystemMessage | ToolMessage> {
  return messages.map(msg => {
    switch (msg.role) {
      case 'user':
        return new HumanMessage({ content: msg.content })
      case 'assistant':
        return new AIMessage({ content: msg.content })
      case 'system':
        return new SystemMessage({ content: msg.content })
      case 'tool':
        return new ToolMessage({
          content: msg.content,
          tool_call_id: msg.toolName ?? 'unknown',
          name: msg.toolName ?? 'unknown',
        })
    }
  })
}

export function createChatModel(config: LLMConfig): BaseChatModel {
  switch (config.format) {
    case 'anthropic':
      return new ChatAnthropic({
        apiKey: config.apiKey,
        anthropicApiUrl: config.baseUrl,
        model: config.model,
      })
    case 'deepseek':
      return new ChatDeepSeek({
        apiKey: config.apiKey,
        configuration: { baseURL: config.baseUrl },
        model: config.model,
      })
    case 'openai':
    default:
      return new ChatOpenAI({
        apiKey: config.apiKey,
        configuration: { baseURL: config.baseUrl },
        model: config.model,
      })
  }
}

export function createAdapter(config: LLMConfig): LLMAdapter {
  const model = createChatModel(config)
  return {
    streamText(params) {
      let resolveMessages: (msgs: Array<LLMMessage>) => void = () => {}
      const responseMessages = new Promise<Array<LLMMessage>>(resolve => { resolveMessages = resolve })

      async function* runStream(): AsyncGenerator<LLMStreamEvent> {
        const lcMessages = toLangChainMessages(params.messages)

        const toolKeys = Object.keys(params.tools ?? {})

        if (toolKeys.length === 0) {
          const messagesForModel = params.system
            ? [new SystemMessage({ content: params.system }), ...lcMessages]
            : lcMessages

          let hasOutput = false
          try {
            const stream = await model.stream(messagesForModel, { signal: params.signal })
            for await (const chunk of stream) {
              if (typeof chunk.content === 'string' && chunk.content) {
                hasOutput = true
                yield { type: 'text-delta', delta: chunk.content }
              } else if (Array.isArray(chunk.content)) {
                for (const part of chunk.content) {
                  if (part.type === 'text' && part.text) {
                    hasOutput = true
                    yield { type: 'text-delta', delta: part.text }
                  }
                }
              }
            }
          } catch (err) {
            if (!hasOutput && err instanceof Error && err.name === 'AI_NoOutputGeneratedError') {
              yield { type: 'text-delta', delta: '（API 返回了空响应，请重试）' }
            }
            throw err
          }
          resolveMessages([])
          return
        }

        const { createReactAgent } = await import('@langchain/langgraph/prebuilt')

        const agent = createReactAgent({
          llm: model,
          tools: params.tools as any,
          prompt: params.system,
        })

        let collectedToolResults: Array<LLMMessage> = []
        let hasOutput = false

        try {
          const stream = agent.streamEvents(
            { messages: lcMessages },
            { version: 'v2', signal: params.signal }
          )

          for await (const event of stream) {
            switch (event.event) {
              case 'on_chat_model_stream': {
                const chunk = event.data.chunk
                if (typeof chunk.content === 'string' && chunk.content) {
                  hasOutput = true
                  yield { type: 'text-delta', delta: chunk.content }
                }
                break
              }
              case 'on_tool_start': {
                hasOutput = true
                const toolName = event.name
                const args = event.data.input
                yield { type: 'tool-start', toolName, args }
                break
              }
              case 'on_tool_end': {
                hasOutput = true
                const toolName = event.name
                const result = event.data.output.content
                yield { type: 'tool-end', toolName, result }

                const output = event.data.output
                collectedToolResults.push({
                  role: 'tool',
                  content: typeof output.content === 'string' ? output.content : JSON.stringify(output.content),
                  toolName: output.name ?? toolName,
                  toolResult: output.content,
                })
                break
              }
            }
          }
        } catch (err) {
          if (!hasOutput && err instanceof Error && err.name === 'AI_NoOutputGeneratedError') {
            yield { type: 'text-delta', delta: '（API 返回了空响应，请重试）' }
          }
          throw err
        }

        resolveMessages(collectedToolResults)
      }

      return { stream: runStream(), responseMessages }
    },
  }
}
