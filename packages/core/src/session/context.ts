/**
 * @fileoverview SessionContext class: Message history, token counting, context compression
 * @module @my-agent/core/session/context
 */

export interface Message {
  role: 'user' | 'assistant' | 'tool'
  content: string
  toolName?: string
  toolResult?: unknown
}

export class SessionContext {
  private messages: Message[] = []
  private tokenCount = 0

  constructor(
    private readonly maxTokens: number = 128_000,
    private readonly compressionRatio: number = 0.5,
  ) {}

  add(message: Message): void {
    this.messages.push(message)
    this.tokenCount += this.estimateTokens(message.content)
  }

  getMessages(): readonly Message[] {
    return this.messages
  }

  /** 是否接近上限，需要压缩 */
  needsCompression(): boolean {
    return this.tokenCount > this.maxTokens * this.compressionRatio
  }

  /**
   * 压缩上下文：保留系统提示和最近的对话，对中间历史进行摘要。
   * 返回压缩前后 token 数。
   */
  compress(): { before: number; after: number } {
    const before = this.tokenCount

    // 保留最新的 50% 消息，对前面的消息做摘要（占位实现）
    const keepCount = Math.max(1, Math.ceil(this.messages.length / 2))
    const recentMessages = this.messages.slice(-keepCount)

    this.messages = [
      { role: 'assistant', content: `[... 前面 ${this.messages.length - keepCount} 条消息已压缩 ...]` },
      ...recentMessages,
    ]
    this.tokenCount = this.messages.reduce((sum, m) => sum + this.estimateTokens(m.content), 0)

    return { before, after: this.tokenCount }
  }

  private estimateTokens(text: string): number {
    // 粗略估计：中英文混合约 1 token/2 字符
    return Math.ceil(text.length / 2)
  }
}
