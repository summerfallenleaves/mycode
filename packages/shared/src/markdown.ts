/**
 * @fileoverview parseMarkdown(): parse Markdown text into renderable tokens for terminal/web display
 * @module @my-agent/shared/markdown
 */
import type { MarkdownToken } from './types.js'

/**
 * 极简 Markdown 分词器。
 * CLI（Ink）和 Web（React）共用同一份解析逻辑来渲染 Markdown。
 */
export function parseMarkdown(text: string): MarkdownToken[] {
  const tokens: MarkdownToken[] = []
  const lines = text.split('\n')

  for (const line of lines) {
    if (line.startsWith('```')) {
      const language = line.replace('```', '').trim()
      tokens.push({ type: 'code' as const, content: '', language: language || undefined })
    } else if (line.startsWith('#')) {
      tokens.push({ type: 'heading' as const, content: line.replace(/^#+\s*/, '') })
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      tokens.push({ type: 'list' as const, content: line.slice(2) })
    } else if (line.startsWith('**') && line.endsWith('**')) {
      tokens.push({ type: 'bold' as const, content: line.slice(2, -2) })
    } else {
      tokens.push({ type: 'text' as const, content: line })
    }
  }

  return tokens
}
