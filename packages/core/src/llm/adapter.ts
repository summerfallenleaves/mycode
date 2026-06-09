import { ChatOpenAI } from '@langchain/openai'
import { ChatAnthropic } from '@langchain/anthropic'
import { ChatDeepSeek } from '@langchain/deepseek'
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
