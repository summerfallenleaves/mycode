/**
 * @fileoverview Barrel file re-exporting all public API from the shared package (types, diff, markdown)
 * @module @my-agent/shared/index
 */
export type { MarkdownToken, DiffLine } from './types.js'
export { parseMarkdown } from './markdown.js'
export { computeDiff } from './diff.js'
