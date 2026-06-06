/**
 * @fileoverview AgentEvent discriminated union type + assertNever helper for exhaustive switching
 * @module @my-agent/core/event
 */

import type { QuestionPayload } from './tools/registry.js'

export type AgentEvent =
  // ── 会话生命周期 ──
  | {
      type: 'session_start'
      sessionId: string
      timestamp: number
    }
  | {
      type: 'session_end'
      sessionId: string
      reason: string
      timestamp: number
    }

  // ── 思考/推理 ──
  | { type: 'thinking_start'; turnId: string }
  | { type: 'thinking_delta'; turnId: string; delta: string }
  | { type: 'thinking_end'; turnId: string; fullText: string }

  // ── 工具调用 ──
  | {
      type: 'tool_start'
      turnId: string
      toolName: string
      args: unknown
    }
  | {
      type: 'tool_delta'
      turnId: string
      toolName: string
      delta: string
    }
  | {
      type: 'tool_end'
      turnId: string
      toolName: string
      result: unknown
    }
  | {
      type: 'tool_error'
      turnId: string
      toolName: string
      error: string
    }

  // ── 最终回答 ──
  | { type: 'answer_start'; turnId: string }
  | { type: 'answer_delta'; turnId: string; delta: string }
  | { type: 'answer_end'; turnId: string; fullText: string }

  // ── 用户交互 ──
  | {
      type: 'interaction_required'
      turnId: string
      toolName: string
      question: QuestionPayload
    }

  // ── 记忆提取 ──
  | {
      type: 'memory_extracted'
      turnId: string
      count: number
    }

  // ── 安全/系统事件 ──
  | {
      type: 'loop_detected'
      turnId: string
      toolSequence: string[]
    }
  | {
      type: 'context_compressed'
      turnId: string
      before: number
      beforeTokens?: number
      afterTokens?: number
      after: number
      compressionType: 'auto' | 'manual'
      prunedToolResults?: number
    }
  | { type: 'error'; turnId: string; code: string; message: string }

/**
 * AgentEvent 的穷举检查辅助函数。
 * 在 switch default 分支中使用以确保所有事件类型都被处理。
 */
export function assertNever(event: never, message?: string): never {
  throw new Error(message ?? `Unhandled event type: ${event}`)
}
