import { z } from 'zod'
import type { Tool, ToolContext } from '../registry.js'
import { FileMemoryStore } from '../../memory/store.js'
import { MEMORY_TYPES, MEMORY_SCOPES } from '../../memory/types.js'
import type { MemoryScope } from '../../memory/types.js'

const memoryParams = z.object({
  action: z.enum(['search', 'add', 'list']).describe('Action to perform'),
  scope: z.enum(MEMORY_SCOPES).optional().describe('Memory scope: project (current project) or global (all projects)'),
  type: z.enum(MEMORY_TYPES).optional().describe('Filter by memory type (for search)'),
  query: z.string().optional().describe('Search query (for search action)'),
  content: z.string().optional().describe('Memory content (for add action)'),
  tags: z.array(z.string()).optional().describe('Tags for the memory entry (for add action)'),
})

export const memoryTool: Tool = {
  name: 'memory',
  description:
    'Persistent project memory. Use this to store and retrieve important information across sessions: conventions, architectural decisions, facts about the project, user preferences, and lessons learned. ' +
    'Actions: search (find relevant memories), add (store new information), list (show all memories). ' +
    'Scope: project (default, current project only) or global (shared across all projects). ' +
    'Proactively store non-obvious project-specific insights. Do NOT store information already in MYCODE.md or obvious from the codebase.',
  parameters: memoryParams,
  async *execute(args: unknown, context: ToolContext) {
    const parsed = memoryParams.safeParse(args)
    if (!parsed.success) {
      return { error: `Invalid parameters: ${parsed.error.message}`, status: 'failed' }
    }

    const { action, scope, type, query, content, tags } = parsed.data
    const targetScope: MemoryScope = scope ?? 'project'
    const store = new FileMemoryStore(targetScope, context.projectRoot)

    switch (action) {
      case 'add': {
        if (!content) {
          return { error: 'content is required for add action', status: 'failed' }
        }
        const typeVal = type ?? 'fact'
        const result = store.add({ type: typeVal, content, tags, sourceSessionId: context.sessionId })
        if (result.error) {
          return { error: result.error, status: 'failed' }
        }
        yield { type: 'data', chunk: `Stored memory: ${result.entry.content.slice(0, 100)}` }
        return { id: result.entry.id, type: result.entry.type, status: 'stored' }
      }

      case 'search': {
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
        const entries = store.list()
        if (entries.length === 0) {
          yield { type: 'data', chunk: 'No memories stored yet.' }
          return { entries: [], count: 0, status: 'empty' }
        }
        const summary = entries
          .map(e => `- [${e.type}] ${e.content.slice(0, 100)}${e.tags.length ? ` (tags: ${e.tags.join(', ')})` : ''}`)
          .join('\n')
        yield { type: 'data', chunk: `All memories (${entries.length} total):\n${summary}` }
        return { entries, count: entries.length, status: 'listed' }
      }

      default:
        return { error: `Unknown action: ${action}`, status: 'failed' }
    }
  },
}
