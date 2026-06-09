import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import type { AgentEvent } from './event.js'
import type { LLMAdapter, LLMMessage } from './llm/adapter.js'
import { ToolRegistry, type ToolContext, type ToolEvent, type QuestionPayload } from './tools/registry.js'
import { createTimeoutSignal } from './safety/timeout.js'
import { scanSkills, formatSkillPrompt } from './skill/index.js'
import type { SkillInfo } from './skill/index.js'
import type { SkillsConfig } from './config.js'
import { loadMycodeMd } from './memory/mycode-md.js'
import { formatMemoryContext, FileMemoryStore } from './memory/store.js'
import type { SessionStore } from './session/store.js'

export interface AgentConfig {
  llm?: LLMAdapter
  model?: BaseChatModel
  modelName?: string
  tools?: ToolRegistry
  systemPrompt?: string
  maxSteps?: number
  runTimeoutMs?: number
  skillsConfig?: SkillsConfig
  skills?: SkillInfo[]
  projectRoot?: string
  maxContextTokens?: number
  sessionStore?: SessionStore | null
  resumeSessionId?: string
  autoMemoryExtraction?: boolean
  contextCompressionThreshold?: number
  maxToolResultLength?: number
  minCompressionInterval?: number
}

type InternalAgentConfig = Required<Omit<AgentConfig, 'model' | 'llm' | 'sessionStore' | 'resumeSessionId'>> & {
  resolvedSystemPrompt: string
  model?: BaseChatModel
  llm?: LLMAdapter
  sessionStore: SessionStore | null
  resumeSessionId: string | undefined
}

export class Agent {
  private readonly config: InternalAgentConfig
  private sessionId: string | null = null
  private sessionDir: string | null = null
  private readonly sessionStore: SessionStore | null
  private readonly resumeSessionId: string | undefined
  private messages: Array<LLMMessage> = []
  private resolveQuestion: ((answers: string[]) => void) | null = null
  private compressionTurnCount: number = 0

  pendingQuestion: QuestionPayload | null = null

  constructor(config: AgentConfig) {
    const defaults = {
      modelName: 'deepseek-v4-flash',
      tools: new ToolRegistry(),
      systemPrompt: '你是mycode，由summerfallenleaves开发的AI助手。',
      maxSteps: 5,
      runTimeoutMs: 300_000,
      skillsConfig: {} as SkillsConfig,
      projectRoot: process.cwd(),
      maxContextTokens: 200_000,
      sessionStore: null as SessionStore | null,
      resumeSessionId: undefined as string | undefined,
      autoMemoryExtraction: false as boolean,
      contextCompressionThreshold: 70 as number,
      maxToolResultLength: 2_000 as number,
      minCompressionInterval: 3 as number,
    }
    const merged = { ...defaults, ...config }
    if (config.model) merged.model = config.model

    const skillsEnabled = merged.skillsConfig?.enabled ?? true
    let skillPrompt = ''
    if (skillsEnabled) {
      const extraPaths = merged.skillsConfig?.paths ?? []
      const skills = merged.skills ?? scanSkills({ projectRoot: merged.projectRoot, extraPaths })
      skillPrompt = formatSkillPrompt(skills)
    }

    const mycodeMdContent = loadMycodeMd(merged.projectRoot)
    const baseParts: string[] = [merged.systemPrompt]
    if (mycodeMdContent) baseParts.push(mycodeMdContent)

    this.sessionStore = merged.sessionStore
    this.resumeSessionId = merged.resumeSessionId

    if (merged.resumeSessionId) {
      this.sessionId = merged.resumeSessionId
      this.sessionDir = resolve(process.cwd(), '.mycode', 'sessions', this.sessionId)
      mkdirSync(this.sessionDir, { recursive: true })

      const messagesPath = join(this.sessionDir, 'messages.json')
      try {
        const raw = readFileSync(messagesPath, 'utf-8')
        const data = JSON.parse(raw) as { messages: Array<{ role: string; content: string; toolName?: string; toolResult?: unknown }> }
        if (data.messages) {
          this.messages = data.messages.map(m => ({
            role: m.role,
            content: m.content,
            ...(m.toolName ? { toolName: m.toolName } : {}),
            ...(m.toolResult !== undefined ? { toolResult: m.toolResult } : {}),
          })) as Array<LLMMessage>
        }
      } catch {
        // Session file missing or corrupt — start with empty history
      }

      const memoryContext = formatMemoryContext(this.sessionDir)
      if (memoryContext) baseParts.push(memoryContext)
    }

    const basePrompt = baseParts.join('\n\n')

    this.config = {
      ...merged,
      skills: merged.skills ?? [],
      model: merged.model,
      resolvedSystemPrompt: skillPrompt
        ? `${basePrompt}\n\n${skillPrompt}`
        : basePrompt,
    }
  }

  private initializeSession(): void {
    if (this.sessionId) return

    this.sessionId = this.resumeSessionId ?? randomUUID()
    this.sessionDir = resolve(process.cwd(), '.mycode', 'sessions', this.sessionId)
    mkdirSync(this.sessionDir, { recursive: true })
  }

  async *run(input: string): AsyncGenerator<AgentEvent, void, undefined> {
    this.initializeSession()

    const turnId = randomUUID()
    const signal = createTimeoutSignal(this.config.runTimeoutMs)

    this.messages.push({ role: 'user', content: input })

    if (this.config.contextCompressionThreshold > 0) {
      const compressed = await this.compressContext('auto')
      if (compressed) {
        yield {
          type: 'context_compressed', turnId,
          before: compressed.before,
          after: compressed.after,
          beforeTokens: compressed.beforeTokens,
          afterTokens: compressed.afterTokens,
          compressionType: 'auto',
          prunedToolResults: compressed.prunedToolResults,
        }
      }
    }

    yield { type: 'session_start', sessionId: this.sessionId!, timestamp: Date.now() }
    yield { type: 'thinking_start', turnId }

    const toolEventBuffer: ToolEvent[] = []

    const toolContext: ToolContext = {
      sessionId: this.sessionId!,
      sessionDir: this.sessionDir!,
      projectRoot: this.config.projectRoot,
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

    const model = this.config.model ?? this.getFallbackModel()

    try {
      if (model) {
        yield* this.runWithLangChain(model, toolContext, toolEventBuffer, turnId, signal)
      } else {
        yield* this.runWithAdapter(signal, turnId, toolContext, toolEventBuffer)
      }

      this.compressionTurnCount++
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      yield { type: 'error', turnId, code: 'agent_error', message }
      yield { type: 'thinking_end', turnId, fullText: '' }
      yield { type: 'session_end', sessionId: this.sessionId!, reason: 'error', timestamp: Date.now() }
      await this.persistMessages()

      if (this.config.autoMemoryExtraction) {
        const memories = await this.extractMemory(model)
        if (memories.length > 0) {
          yield { type: 'memory_extracted', turnId, count: memories.length }
        }
      }
      return
    }

    yield { type: 'thinking_end', turnId, fullText: '' }
    yield { type: 'session_end', sessionId: this.sessionId!, reason: 'completed', timestamp: Date.now() }
    await this.persistMessages()

    if (this.config.autoMemoryExtraction) {
      const memories = await this.extractMemory(model)
      if (memories.length > 0) {
        yield { type: 'memory_extracted', turnId, count: memories.length }
      }
    }
  }

  private async *runWithLangChain(
    model: BaseChatModel,
    toolContext: ToolContext,
    toolEventBuffer: ToolEvent[],
    turnId: string,
    signal: AbortSignal,
  ): AsyncGenerator<AgentEvent, void, undefined> {
    const { createReactAgent } = await import('@langchain/langgraph/prebuilt')
    const { tool: lcTool } = await import('langchain')

    const lcTools = this.config.tools.toLangChainTools(toolContext).map((t: any) =>
      lcTool(t.invoke, { name: t.name, description: t.description, schema: t.schema })
    )

    const lcMessages = this.messages.map(msg => {
      switch (msg.role) {
        case 'user': return new HumanMessage({ content: msg.content })
        case 'assistant': return new HumanMessage({ content: msg.content })
        case 'system': return new SystemMessage({ content: msg.content })
        default: return new HumanMessage({ content: msg.content })
      }
    })

    const agent = createReactAgent({
      llm: model,
      tools: lcTools,
      prompt: this.config.resolvedSystemPrompt,
    })

    try {
      const stream = agent.streamEvents(
        { messages: lcMessages },
        { version: 'v2', signal }
      )

      for await (const event of stream) {
        switch (event.event) {
          case 'on_chat_model_stream': {
            const chunk = event.data.chunk
            if (typeof chunk.content === 'string' && chunk.content) {
              yield { type: 'thinking_delta', turnId, delta: chunk.content }
            }
            break
          }
          case 'on_tool_start': {
            const toolName = event.name
            const args = event.data.input
            yield { type: 'tool_start', turnId, toolName, args }
            break
          }
          case 'on_tool_end': {
            const toolName = event.name
            for (const ev of toolEventBuffer) {
              if (ev.type === 'progress') {
                yield { type: 'tool_delta', turnId, toolName, delta: ev.message }
              } else if (ev.type === 'data') {
                yield { type: 'tool_delta', turnId, toolName, delta: ev.chunk }
              }
            }
            toolEventBuffer.length = 0

            const output = event.data.output
            const result = output.content
            yield { type: 'tool_end', turnId, toolName, result }
            this.messages.push({
              role: 'tool',
              content: typeof result === 'string' ? result : JSON.stringify(result),
              toolName,
              toolResult: result,
            })
            break
          }
        }
      }
    } catch (err) {
      const errAny = err as any
      if (errAny?.name === 'AI_NoOutputGeneratedError') {
        yield { type: 'thinking_delta', turnId, delta: '（API 返回了空响应，请重试）' }
      }
      throw err
    }
  }

  private async *runWithAdapter(
    signal: AbortSignal,
    turnId: string,
    toolContext: ToolContext,
    toolEventBuffer: ToolEvent[],
  ): AsyncGenerator<AgentEvent, void, undefined> {
    const llm = this.config.llm
    if (!llm) {
      yield { type: 'error', turnId, code: 'agent_error', message: 'No LLM adapter configured' }
      return
    }
    const { stream, responseMessages } = llm.streamText({
      model: this.config.modelName,
      system: this.config.resolvedSystemPrompt,
      messages: this.messages,
      tools: this.config.tools.toToolSet(toolContext),
      maxSteps: this.config.maxSteps,
      signal,
    })

    for await (const chunk of stream) {
      switch (chunk.type) {
        case 'text-delta':
          yield { type: 'thinking_delta', turnId, delta: chunk.delta }
          break
        case 'tool-start':
          yield { type: 'tool_start', turnId, toolName: chunk.toolName, args: chunk.args }
          break
        case 'tool-end': {
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

    const newMessages = await responseMessages
    for (const msg of newMessages) {
      this.messages.push(msg)
    }
  }

  private getFallbackModel(): BaseChatModel | undefined {
    return undefined
  }

  private async persistMessages(): Promise<void> {
    if (!this.sessionStore || !this.sessionId) return

    const toSave = this.messages.map(m => ({
      role: m.role as 'user' | 'assistant' | 'tool',
      content: m.content,
      ...(m.toolName ? { toolName: m.toolName } : {}),
      ...(m.toolResult ? { toolResult: m.toolResult } : {}),
    }))

    await this.sessionStore.save(this.sessionId, toSave)
  }

  private async compressContext(compressionType: 'auto' | 'manual' = 'auto'): Promise<{
    before: number
    after: number
    beforeTokens: number
    afterTokens: number
    prunedToolResults?: number
  } | null> {
    const threshold = this.config.contextCompressionThreshold
    if (threshold <= 0) return null

    if (compressionType === 'auto') {
      if (this.compressionTurnCount < this.config.minCompressionInterval) return null
    }

    const usage = this.getContextUsage()
    if (usage.percentage < threshold) return null

    const minKeepTurns = 2
    let userCount = 0
    let compressEnd = 0
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const m = this.messages[i]
      if (!m) continue
      if (m.role === 'user') userCount++
      if (userCount === minKeepTurns) {
        compressEnd = i
        break
      }
    }

    if (compressEnd < 1) return null

    const toCompress = this.messages
      .slice(0, compressEnd)
      .filter(m => m.role === 'user' || m.role === 'assistant')

    if (toCompress.length < 2) return null

    const beforeTokens = this.estimateTokensForMessages()

    const conversationText = toCompress
      .map(m => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`)
      .join('\n')

    const prompt = `将以下对话压缩为一段简洁的摘要，保留所有重要信息：

- 做出的架构决策及其理由
- 关于项目或代码库的关键事实
- 已确认的需求和偏好
- 重要的代码变更及其目的
- 任何仍然开放的问题或待办事项

用中文回答，控制在 300 字以内。

对话：
${conversationText}

摘要：`

    try {
      const model = this.config.model ?? this.getCompressionModel()
      if (!model) return null

      const systemMsg = new SystemMessage({ content: '你是一个高效的对话压缩系统。将长对话压缩为简洁摘要，不丢失关键信息。' })
      const userMsg = new HumanMessage({ content: prompt })
      const result = await model.invoke([systemMsg, userMsg])
      const summary = typeof result.content === 'string' ? result.content : ''

      if (!summary.trim()) {
        const pruned = this.pruneToolResults()
        if (pruned) {
          return { before: this.messages.length, after: this.messages.length, beforeTokens, afterTokens: this.estimateTokensForMessages(), prunedToolResults: pruned.prunedCount }
        }
        return null
      }

      const summaryMsg: LLMMessage = {
        role: 'assistant',
        content: `[此前对话已压缩] ${summary.trim()}`,
      }
      const before = this.messages.length
      this.messages = [summaryMsg, ...this.messages.slice(compressEnd)]
      const after = this.messages.length

      const pruned = this.pruneToolResults()
      const afterTokens = this.estimateTokensForMessages()

      this.compressionTurnCount = 0

      return { before, after, beforeTokens, afterTokens, prunedToolResults: pruned?.prunedCount }
    } catch {
      const pruned = this.pruneToolResults()
      if (pruned) {
        return { before: this.messages.length, after: this.messages.length, beforeTokens, afterTokens: this.estimateTokensForMessages(), prunedToolResults: pruned.prunedCount }
      }
      return null
    }
  }

  private getCompressionModel(): BaseChatModel | undefined {
    if (this.config.model) return this.config.model
    return undefined
  }

  private estimateTokensForMessages(): number {
    const text = this.messages
      .map(m => (m.role === 'tool' ? JSON.stringify(m.toolResult ?? '') : m.content))
      .join('\n')
    return Math.ceil(text.length / 2) || 0
  }

  private pruneToolResults(): { beforeTokens: number; afterTokens: number; prunedCount: number } | null {
    const maxLen = this.config.maxToolResultLength
    if (maxLen <= 0) return null

    const beforeTokens = this.estimateTokensForMessages()
    let prunedCount = 0

    for (const msg of this.messages) {
      if (msg.role === 'tool' && msg.toolResult !== undefined) {
        const serialized = JSON.stringify(msg.toolResult)
        if (serialized.length <= maxLen) continue

        if (typeof msg.toolResult === 'string') {
          msg.content = `${msg.toolResult.slice(0, maxLen)}...[truncated: ${serialized.length} chars]`
        } else {
          msg.content = `[tool result truncated: original ${serialized.length} chars]`
        }
        msg.toolResult = undefined
        prunedCount++
      }
    }

    if (prunedCount === 0) return null

    const afterTokens = this.estimateTokensForMessages()
    return { beforeTokens, afterTokens, prunedCount }
  }

  private async extractMemory(model?: BaseChatModel): Promise<Array<{ id: string }>> {
    const relevantMessages = this.messages.filter(m => m.role === 'user' || m.role === 'assistant')
    if (relevantMessages.length < 2) return []

    const llm = model ?? this.config.model
    if (!llm) return []

    const conversationText = relevantMessages
      .slice(-20)
      .map(m => `${m.role === 'user' ? '用户' : '助手'}: ${m.content.slice(0, 500)}`)
      .join('\n')

    const prompt = `分析以下对话，提取需要跨 session 记住的重要信息。

关注点：
- 项目规范和编码约定
- 架构决策及其理由
- 有关代码库或项目的重要事实
- 用户偏好和工作风格
- 对话中吸取的经验教训

如果没有重要信息，返回空数组。

对话：
${conversationText}

只返回合法的 JSON 数组，不要 markdown、不要代码围栏、不要解释。
每个元素：
{
  "type": "convention" | "decision" | "fact" | "preference" | "lesson",
  "content": "描述内容（最多 200 字）",
  "tags": ["标签1", "标签2"]
}`

    try {
      const systemMsg = new SystemMessage({ content: '你是 mycode 的记忆提取系统。从对话中提取结构化记忆。' })
      const userMsg = new HumanMessage({ content: prompt })
      const result = await llm.invoke([systemMsg, userMsg])

      let fullText = typeof result.content === 'string' ? result.content : ''
      if (!fullText) return []

      const cleaned = fullText.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim()
      const items = JSON.parse(cleaned)
      if (!Array.isArray(items)) return []

      const store = new FileMemoryStore(this.sessionDir!)
      const MEMORY_TYPES = new Set(['convention', 'decision', 'fact', 'preference', 'lesson'])
      const results: Array<{ id: string }> = []

      for (const item of items) {
        if (!item || typeof item !== 'object') continue
        const type = item.type && MEMORY_TYPES.has(item.type) ? item.type : 'fact'
        const content = typeof item.content === 'string' ? item.content.slice(0, 500) : ''
        if (!content) continue
        const tags = Array.isArray(item.tags) ? item.tags.filter((t: unknown) => typeof t === 'string').slice(0, 3) : []
        const result = store.add({
          type: type as 'convention' | 'decision' | 'fact' | 'preference' | 'lesson',
          content,
          tags,
          sourceSessionId: this.sessionId ?? undefined,
        })
        if (!result.error) {
          results.push({ id: result.entry.id })
        }
      }

      return results
    } catch {
      return []
    }
  }

  getSessionId(): string | null {
    return this.sessionId
  }

  getSessionDir(): string | null {
    return this.sessionDir
  }

  getMessages(): readonly LLMMessage[] {
    return this.messages
  }

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

  async compactMessages(): Promise<{
    before: number
    after: number
    beforeTokens: number
    afterTokens: number
    prunedToolResults?: number
  } | null> {
    return this.compressContext('manual')
  }

  answerQuestion(answers: string[]): void {
    if (this.resolveQuestion) {
      this.resolveQuestion(answers)
    }
  }
}
