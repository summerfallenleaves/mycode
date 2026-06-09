import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { resolve, join } from 'node:path'

export interface SessionStore {
  save(sessionId: string, data: SessionFileV2): Promise<void>
  load(sessionId: string): Promise<SessionFileV2 | null>
  list(): Promise<Array<{ sessionId: string; turnCount: number; updatedAt: string }>>
  delete(sessionId: string): Promise<void>
}

export type TurnEntry =
  | { type: 'user'; content: string }
  | { type: 'thinking'; content: string }
  | { type: 'tool_call'; toolName: string; args: unknown }
  | { type: 'tool_result'; toolName: string; result: unknown }
  | { type: 'answer'; content: string }

export interface TurnRecord {
  turnId: string
  entries: TurnEntry[]
}

export interface SessionFileV2 {
  version: 2
  sessionId: string
  createdAt: string
  updatedAt: string
  systemPrompt: string
  turns: TurnRecord[]
}

function formatTimestamp(ms: number): string {
  const date = new Date(ms)
  const y = date.getFullYear()
  const mo = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')
  const s = String(date.getSeconds()).padStart(2, '0')
  const ms2 = String(date.getMilliseconds()).padStart(3, '0')
  return `${y}-${mo}-${d} ${h}:${mi}:${s}.${ms2}`
}

export class FileSessionStore implements SessionStore {
  private readonly sessionsDir: string

  constructor(sessionsDir: string) {
    this.sessionsDir = sessionsDir
    mkdirSync(this.sessionsDir, { recursive: true })
  }

  async save(sessionId: string, data: SessionFileV2): Promise<void> {
    const sessionDir = resolve(this.sessionsDir, sessionId)
    mkdirSync(sessionDir, { recursive: true })

    const filePath = join(sessionDir, 'messages.json')
    const now = formatTimestamp(Date.now())

    const file: SessionFileV2 = {
      ...data,
      sessionId,
      updatedAt: now,
    }

    writeFileSync(filePath, JSON.stringify(file, null, 2) + '\n', 'utf-8')
  }

  async load(sessionId: string): Promise<SessionFileV2 | null> {
    const filePath = join(this.sessionsDir, sessionId, 'messages.json')

    try {
      const raw = readFileSync(filePath, 'utf-8')
      return JSON.parse(raw) as SessionFileV2
    } catch {
      return null
    }
  }

  async list(): Promise<Array<{ sessionId: string; turnCount: number; updatedAt: string }>> {
    const entries: Array<{ sessionId: string; turnCount: number; updatedAt: string }> = []

    try {
      const dirs = readdirSync(this.sessionsDir, { withFileTypes: true })

      for (const dir of dirs) {
        if (!dir.isDirectory()) continue

        const filePath = join(this.sessionsDir, dir.name, 'messages.json')
        try {
          const raw = readFileSync(filePath, 'utf-8')
          const data = JSON.parse(raw) as SessionFileV2
          entries.push({
            sessionId: dir.name,
            turnCount: data.turns?.length ?? 0,
            updatedAt: data.updatedAt ?? '',
          })
        } catch {}
      }
    } catch {}

    return entries.sort((a, b) => {
      const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
      const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
      return timeB - timeA
    })
  }

  async delete(sessionId: string): Promise<void> {
    const sessionDir = resolve(this.sessionsDir, sessionId)
    try {
      rmSync(sessionDir, { recursive: true, force: true })
    } catch {}
  }
}
