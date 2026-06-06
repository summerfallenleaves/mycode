import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
import type { MemoryEntry, MemoryFile, MemoryType, MemoryScope } from './types.js'
import { MAX_ENTRIES, MAX_ENTRY_LENGTH, MAX_SEARCH_RESULTS, MEMORY_CONTEXT_MAX_CHARS } from './types.js'

const MEMORY_FILE = 'memory.json'

export function getMemoryDir(scope: MemoryScope, projectRoot?: string): string {
  if (scope === 'global') {
    return resolve(homedir(), '.mycode', 'memory')
  }
  return resolve(projectRoot ?? process.cwd(), '.mycode', 'memory')
}

function formatTimestamp(): string {
  const d = new Date()
  const pad = (n: number, len = 2) => String(n).padStart(len, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
}

/** Split text into searchable tokens: English words + Chinese character bigrams */
function tokenize(text: string): string[] {
  const lower = text.toLowerCase()
  const tokens = new Set<string>()

  // English words (split on non-alphanumeric)
  for (const word of lower.split(/[^a-z0-9]+/)) {
    if (word.length >= 2) tokens.add(word)
  }

  // Chinese character bigrams (sliding window of 2)
  const chineseChars = lower.replace(/[^\u4e00-\u9fff]/g, '')
  for (let i = 0; i < chineseChars.length - 1; i++) {
    tokens.add(chineseChars.slice(i, i + 2))
  }

  return [...tokens]
}

export class FileMemoryStore {
  private readonly filePath: string
  readonly scope: MemoryScope

  constructor(scope: MemoryScope, projectRoot?: string) {
    this.scope = scope
    const dir = getMemoryDir(scope, projectRoot)
    mkdirSync(dir, { recursive: true })
    this.filePath = resolve(dir, MEMORY_FILE)
  }

  private readFile(): MemoryFile {
    if (!existsSync(this.filePath)) {
      return { version: 1, entries: [] }
    }
    try {
      const raw = readFileSync(this.filePath, 'utf-8')
      return JSON.parse(raw) as MemoryFile
    } catch {
      return { version: 1, entries: [] }
    }
  }

  private writeFile(data: MemoryFile): void {
    const tmp = this.filePath + '.tmp'
    writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf-8')
    renameSync(tmp, this.filePath)
  }

  add(params: {
    type: MemoryType
    content: string
    tags?: string[]
    sourceSessionId?: string
  }): { entry: MemoryEntry; error?: string } {
    const content = params.content.trim()
    if (!content) {
      return { entry: {} as MemoryEntry, error: 'Content is required' }
    }
    if (content.length > MAX_ENTRY_LENGTH) {
      return { entry: {} as MemoryEntry, error: `Content exceeds ${MAX_ENTRY_LENGTH} characters` }
    }

    // Secret filter: reject if content matches common key patterns
    if (/sk-[a-zA-Z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[a-zA-Z0-9]{36}|gho_[a-zA-Z0-9]{36}/.test(content)) {
      return { entry: {} as MemoryEntry, error: 'Content appears to contain secrets or API keys' }
    }

    const data = this.readFile()

    if (data.entries.length >= MAX_ENTRIES) {
      return { entry: {} as MemoryEntry, error: `Memory store is full (max ${MAX_ENTRIES} entries)` }
    }

    const now = formatTimestamp()
    const entry: MemoryEntry = {
      id: randomUUID(),
      type: params.type,
      content,
      tags: params.tags ?? [],
      scope: this.scope,
      createdAt: now,
      updatedAt: now,
      sourceSessionId: params.sourceSessionId,
    }

    data.entries.push(entry)
    this.writeFile(data)
    return { entry }
  }

  search(params: { query?: string; type?: MemoryType }): MemoryEntry[] {
    const data = this.readFile()
    let results = data.entries

    if (params.type) {
      results = results.filter(e => e.type === params.type)
    }

    if (params.query) {
      const q = params.query.toLowerCase()
      const queryTokens = tokenize(q)

      // Score each entry by relevance
      const scored: Array<{ entry: MemoryEntry; score: number }> = []

      for (const entry of results) {
        const lowerContent = entry.content.toLowerCase()
        const lowerTags = entry.tags.map(t => t.toLowerCase())
        let score = 0

        // Exact substring match (highest weight)
        if (lowerContent.includes(q)) score += 10
        // Tag match
        if (lowerTags.some(t => t.includes(q) || q.includes(t))) score += 8

        // Token-level matching
        const entryTokens = tokenize(entry.content)
        for (const qt of queryTokens) {
          for (const et of entryTokens) {
            if (et === qt) {
              score += 3
            } else if (et.includes(qt) || qt.includes(et)) {
              score += 1
            }
          }
        }

        // Recency bonus: only applies if there's already a content match
        if (score > 0) {
          const ageDays = (Date.now() - new Date(entry.updatedAt.replace(' ', 'T')).getTime()) / 86400000
          if (ageDays < 7) score += 2
        }

        if (score > 0) scored.push({ entry, score })
      }

      // Sort by score descending, then by updatedAt descending
      scored.sort((a, b) => b.score - a.score || b.entry.updatedAt.localeCompare(a.entry.updatedAt))
      results = scored.map(s => s.entry)
    } else {
      results = [...results].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    }

    return results.slice(0, MAX_SEARCH_RESULTS)
  }

  list(): MemoryEntry[] {
    const data = this.readFile()
    return [...data.entries].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  delete(id: string): { found: boolean } {
    const data = this.readFile()
    const idx = data.entries.findIndex(e => e.id === id)
    if (idx === -1) return { found: false }
    data.entries.splice(idx, 1)
    this.writeFile(data)
    return { found: true }
  }
}

export function formatMemoryContext(projectRoot: string): string {
  const projectStore = new FileMemoryStore('project', projectRoot)
  const globalStore = new FileMemoryStore('global')

  const projectEntries = projectStore.list()
  const globalEntries = globalStore.list()

  const seenIds = new Set<string>()
  const all: MemoryEntry[] = []

  for (const e of [...projectEntries, ...globalEntries]) {
    if (!seenIds.has(e.id)) {
      seenIds.add(e.id)
      all.push(e)
    }
  }

  all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  if (all.length === 0) return ''

  const lines: string[] = ['## Relevant Project Context']
  let charCount = 0

  for (const entry of all) {
    const line = `- [${entry.type}] ${entry.content}${entry.tags.length ? ` (${entry.tags.join(', ')})` : ''}`
    if (charCount + line.length + 1 > MEMORY_CONTEXT_MAX_CHARS) break
    lines.push(line)
    charCount += line.length + 1
  }

  return lines.join('\n')
}
