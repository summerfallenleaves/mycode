/**
 * @fileoverview Agent class with AsyncGenerator-based run loop; AgentConfig interface; orchestrates LLM calls, tool execution, and event emission
 * @module @my-agent/core/agent
 */

import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import type { AgentEvent } from './event.js'
import type { LLMAdapter, LLMMessage } from './llm/adapter.js'
import { ToolRegistry, type ToolContext, type ToolEvent, type QuestionPayload } from './tools/registry.js'
import { createTimeoutSignal } from './safety/timeout.js'
import { scanSkills, formatSkillPrompt } from './skill/index.js'
import type { SkillInfo } from './skill/index.js'
import type { SkillsConfig } from './config.js'
import { findConfigDir } from './config.js'

export interface AgentConfig {
  llm: LLMAdapter
  model?: string
  tools?: ToolRegistry
  systemPrompt?: string
  maxSteps?: number
  sessionTimeoutMs?: number
  /** Skills configuration from mycode.jsonc */
  skillsConfig?: SkillsConfig
  /** Pre-scanned skills. If provided, skips disk scanning. */
  skills?: SkillInfo[]
  /** Project root directory for resolving skill paths */
  projectRoot?: string
  /** Context window limit in tokens. Used for usage display. */
  maxContextTokens?: number
}

export class Agent {
  private readonly config: Required<AgentConfig> & { resolvedSystemPrompt: string }
  private readonly sessionId: string
  private readonly sessionDir: string
  private messages: Array<LLMMessage> = []
  private resolveQuestion: ((answers: string[]) => void) | null = null

  /** When set during tool execution, the agent is waiting for user input to a question tool call. */
  pendingQuestion: QuestionPayload | null = null

  constructor(config: AgentConfig) {
    const defaults = {
      model: 'deepseek-v4-flash',
      tools: new ToolRegistry(),
      systemPrompt: '你是mycode，由summerfallenleaves开发的AI助手。',
      maxSteps: 5,
      sessionTimeoutMs: 300_000,
      skillsConfig: {} as SkillsConfig,
      projectRoot: process.cwd(),
      maxContextTokens: 200_000,
    }
    const merged = { ...defaults, ...config }

    // Scan skills from configured paths and append to system prompt
    const skillsEnabled = merged.skillsConfig?.enabled ?? true
    let skillPrompt = ''
    if (skillsEnabled) {
      const extraPaths = merged.skillsConfig?.paths ?? []
      const skills = merged.skills ?? scanSkills({ projectRoot: merged.projectRoot, extraPaths })
      skillPrompt = formatSkillPrompt(skills)
    }

    this.config = {
      ...merged,
      skills: merged.skills ?? [],
      resolvedSystemPrompt: skillPrompt
        ? `${merged.systemPrompt}\n\n${skillPrompt}`
        : merged.systemPrompt,
    }
    this.sessionId = randomUUID()
    this.sessionDir = resolve(findConfigDir(), 'sessions', this.sessionId)
    mkdirSync(this.sessionDir, { recursive: true })
  }

  async *run(input: string): AsyncGenerator<AgentEvent, void, undefined> {
    const turnId = randomUUID()
    const signal = createTimeoutSignal(this.config.sessionTimeoutMs)

    this.messages.push({ role: 'user', content: input })

    yield { type: 'session_start', sessionId: this.sessionId, timestamp: Date.now() }
    yield { type: 'thinking_start', turnId }

    const toolEventBuffer: ToolEvent[] = []

    const toolContext: ToolContext = {
      sessionId: this.sessionId,
      sessionDir: this.sessionDir,
      signal,
      logger: () => {},
      emitToolEvent: (event) => { toolEventBuffer.push(event) },
      askQuestion: async (question) => {
        this.pendingQuestion = question
        return await new Promise<string[]>(resolve => {
          this.resolveQuestion = resolve
        }).finally(() => {
          this.pendingQuestion = null
          this.resolveQuestion = null
        })
      },
    }

    const { stream, responseMessages } = this.config.llm.streamText({
      model: this.config.model,
      system: this.config.resolvedSystemPrompt,
      messages: this.messages,
      tools: this.config.tools.toToolSet(toolContext),
      maxSteps: this.config.maxSteps,
      signal,
    })

    try {
      for await (const chunk of stream) {
        switch (chunk.type) {
          case 'text-delta':
            yield { type: 'thinking_delta', turnId, delta: chunk.delta }
            break
          case 'tool-start':
            yield { type: 'tool_start', turnId, toolName: chunk.toolName, args: chunk.args }
            break
          case 'tool-end': {
            // Drain buffered progress/data events as tool_delta
            for (const ev of toolEventBuffer) {
              if (ev.type === 'progress') {
                yield { type: 'tool_delta', turnId, toolName: chunk.toolName, delta: ev.message }
              } else if (ev.type === 'data') {
                yield { type: 'tool_delta', turnId, toolName: chunk.toolName, delta: ev.chunk }
              }
            }
            toolEventBuffer.length = 0
            yield { type: 'tool_end', turnId, toolName: chunk.toolName, result: chunk.result }
            break
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      yield { type: 'error', turnId, code: 'agent_error', message }
      yield { type: 'thinking_end', turnId, fullText: '' }
      yield { type: 'session_end', sessionId: this.sessionId, reason: 'error', timestamp: Date.now() }
      return
    }

    // Sync response messages back to conversation context
    const newMessages = await responseMessages
    for (const msg of newMessages) {
      this.messages.push(msg)
    }

    yield { type: 'thinking_end', turnId, fullText: '' }
    yield { type: 'session_end', sessionId: this.sessionId, reason: 'completed', timestamp: Date.now() }
  }

  getSessionId(): string {
    return this.sessionId
  }

  getMessages(): readonly LLMMessage[] {
    return this.messages
  }

  /**
   * Return estimated context usage based on message content length.
   * Includes the resolved system prompt (with injected skills) since it's sent with every LLM call.
   * Uses a rough 2-char-per-token heuristic for mixed CJK/English.
   */
  getContextUsage(): { used: number; limit: number; percentage: number } {
    const systemLength = this.config.resolvedSystemPrompt.length
    const messagesLength = this.messages
      .map(m => (m.role === 'tool' ? JSON.stringify(m.toolResult ?? '') : m.content))
      .join('\n')
      .length
    const used = Math.ceil((systemLength + messagesLength) / 2) || 0
    const limit = this.config.maxContextTokens
    return {
      used,
      limit,
      percentage: used === 0 ? 0 : Math.min(100, Math.round((used / limit) * 100)),
    }
  }

  /** Provide an answer to the currently pending question. Resumes the blocked tool execution. */
  answerQuestion(answers: string[]): void {
    if (this.resolveQuestion) {
      this.resolveQuestion(answers)
    }
  }
}
