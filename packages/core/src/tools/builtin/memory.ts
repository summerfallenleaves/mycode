/**
 * @fileoverview Memory tool: session-scoped add/search/list + MYCODE.md rule action for shared project/global rules
 * @module @my-agent/core/tools/builtin/memory
 */

import { z } from 'zod'
import type { Tool, ToolContext } from '../registry.js'
import { FileMemoryStore } from '../../memory/store.js'
import { appendRule } from '../../memory/mycode-md.js'
import { MEMORY_TYPES } from '../../memory/types.js'
import type { MemoryType } from '../../memory/types.js'

const memoryParams = z.object({
  action: z.enum(['search', 'add', 'list', 'rule']).describe('Action to perform'),
  scope: z.enum(['project', 'global']).optional().describe('Rule scope, only for "rule" action: project (default) or global'),
  type: z.enum(MEMORY_TYPES).optional().describe('Memory type (for add/rule actions) or filter (for search)'),
  query: z.string().optional().describe('Search query (for search action)'),
  content: z.string().optional().describe('Memory/rule content (for add/rule actions)'),
  tags: z.array(z.string()).optional().describe('Tags (for add action, session memory)'),
})

export const memoryTool: Tool = {
  name: 'memory',
  description:
    'Session-scoped memory and shared rule management. ' +
    'Actions: add (store to session memory.json), search (find in session memory), list (show session memory), rule (append shared rule to MYCODE.md). ' +
    '"add/search/list" operate on current session memory. "rule" writes a persistent rule to project or global MYCODE.md (not manageable via /memory /forget commands). ' +
    'Proactively store non-obvious project-specific insights. Do NOT store information already in MYCODE.md or obvious from the codebase.',
  parameters: memoryParams,
  async *execute(args: unknown, context: ToolContext) {
    const parsed = memoryParams.safeParse(args)
    if (!parsed.success) {
      return { error: `Invalid parameters: ${parsed.error.message}`, status: 'failed' }
    }

    const { action, scope, type, query, content, tags } = parsed.data

    switch (action) {
      case 'add': {
        if (!content) {
          return { error: 'content is required for add action', status: 'failed' }
        }
        const store = new FileMemoryStore(context.sessionDir)
        const typeVal = type ?? 'fact'
        const result = store.add({ type: typeVal, content, tags, sourceSessionId: context.sessionId })
        if (result.error) {
          return { error: result.error, status: 'failed' }
        }
        yield { type: 'data', chunk: `Stored session memory: ${result.entry.content.slice(0, 100)}` }
        return { id: result.entry.id, type: result.entry.type, status: 'stored' }
      }

      case 'search': {
        const store = new FileMemoryStore(context.sessionDir)
        const results = store.search({ query, type })
        if (results.length === 0) {
          yield { type: 'data', chunk: 'No matching memories found.' }
          return { entries: [], count: 0, status: 'no_results' }
        }
        const summary = results
          .map(e => `- [${e.type}] ${e.content.slice(0, 100)}${e.tags.length ? ` (tags: ${e.tags.join(', ')})` : ''}`)
          .join('\n')
        yield { type: 'data', chunk: `Found ${results.length} memory result(s):\n${summary}` }
        return { entries: results, count: results.length, status: 'retrieved' }
      }

      case 'list': {
        const store = new FileMemoryStore(context.sessionDir)
        const entries = store.list()
        if (entries.length === 0) {
          yield { type: 'data', chunk: 'No session memories stored yet.' }
          return { entries: [], count: 0, status: 'empty' }
        }
        const summary = entries
          .map(e => `- [${e.type}] ${e.content.slice(0, 100)}${e.tags.length ? ` (tags: ${e.tags.join(', ')})` : ''}`)
          .join('\n')
        yield { type: 'data', chunk: `Session memories (${entries.length} total):\n${summary}` }
        return { entries, count: entries.length, status: 'listed' }
      }

      case 'rule': {
        if (!content) {
          return { error: 'content is required for rule action', status: 'failed' }
        }
        const typeVal = (type ?? 'convention') as MemoryType
        const target = scope ?? 'project'
        const result = appendRule(target, context.projectRoot, { type: typeVal, content })
        if (result.error) {
          return { error: result.error, status: 'failed' }
        }
        yield { type: 'data', chunk: `Appended ${target} rule: [${typeVal}] ${content.slice(0, 100)}` }
        return { target, type: typeVal, status: 'appended' }
      }

      default:
        return { error: `Unknown action: ${action}`, status: 'failed' }
    }
  },
}
