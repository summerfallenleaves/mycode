/**
 * @fileoverview Shared TypeScript types: MarkdownToken, DiffLine for CLI/Web frontends
 * @module @my-agent/shared/types
 */
export interface MarkdownToken {
  type: 'text' | 'code' | 'heading' | 'bold' | 'list'
  content: string
  language?: string
}

export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged'
  content: string
  lineNumber: number
}
