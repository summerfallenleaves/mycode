export const MEMORY_TYPES = ['convention', 'decision', 'fact', 'preference', 'lesson'] as const
export type MemoryType = (typeof MEMORY_TYPES)[number]

export const MEMORY_SCOPES = ['project', 'global'] as const
export type MemoryScope = (typeof MEMORY_SCOPES)[number]

export interface MemoryEntry {
  id: string
  type: MemoryType
  content: string
  tags: string[]
  scope: MemoryScope
  createdAt: string
  updatedAt: string
  sourceSessionId?: string
}

export interface MemoryFile {
  version: 1
  entries: MemoryEntry[]
}

export const MAX_ENTRIES = 500
export const MAX_ENTRY_LENGTH = 500
export const MAX_SEARCH_RESULTS = 10

/** Max total characters for memory entries injected into system prompt at session start */
export const MEMORY_CONTEXT_MAX_CHARS = 4000
