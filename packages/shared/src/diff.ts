/**
 * @fileoverview computeDiff(): simple line-level diff computation between oldText and newText, returns DiffLine[]
 * @module @my-agent/shared/diff
 */
import type { DiffLine } from './types.js'

/**
 * 简单的行级别 Diff 计算。
 * 实际项目可替换为 `diff` 库。
 */
export function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')
  const result: DiffLine[] = []
  const maxLen = Math.max(oldLines.length, newLines.length)

  for (let i = 0; i < maxLen; i++) {
    if (i >= oldLines.length) {
      result.push({ type: 'added', content: newLines[i] ?? '', lineNumber: i + 1 })
    } else if (i >= newLines.length) {
      result.push({ type: 'removed', content: oldLines[i] ?? '', lineNumber: i + 1 })
    } else if (oldLines[i] !== newLines[i]) {
      result.push({ type: 'removed', content: oldLines[i] ?? '', lineNumber: i + 1 })
      result.push({ type: 'added', content: newLines[i] ?? '', lineNumber: i + 1 })
    } else {
      result.push({ type: 'unchanged', content: oldLines[i] ?? '', lineNumber: i + 1 })
    }
  }

  return result
}
