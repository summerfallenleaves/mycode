/**
 * @fileoverview Session persistence interface and FileSessionStore implementation
 * @module @my-agent/core/session/store
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { resolve, join } from 'node:path'
import type { Message } from './context.js'

export interface SessionStore {
  save(sessionId: string, messages: readonly Message[]): Promise<void>
  load(sessionId: string): Promise<Message[] | null>
  list(): Promise<Array<{ sessionId: string; messageCount: number; updatedAt: string }>>
  delete(sessionId: string): Promise<void>
}

interface SessionFile {
  version: 1
  sessionId: string
  createdAt: string
  updatedAt: string
  messages: Message[]
}

function formatTimestamp(ms: number): string {
  const date = new Date(ms)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  const milliseconds = String(date.getMilliseconds()).padStart(3, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`
}

export class FileSessionStore implements SessionStore {
  private readonly sessionsDir: string

  constructor(sessionsDir: string) {
    this.sessionsDir = sessionsDir
    mkdirSync(this.sessionsDir, { recursive: true })
  }

  async save(sessionId: string, messages: readonly Message[]): Promise<void> {
    const sessionDir = resolve(this.sessionsDir, sessionId)
    mkdirSync(sessionDir, { recursive: true })

    const filePath = join(sessionDir, 'messages.json')
    const now = formatTimestamp(Date.now())

    let createdAt = now
    try {
      const existing = readFileSync(filePath, 'utf-8')
      const parsed = JSON.parse(existing) as SessionFile
      createdAt = parsed.createdAt ?? now
    } catch {}

    const data: SessionFile = {
      version: 1,
      sessionId,
      createdAt,
      updatedAt: now,
      messages: messages as Message[],
    }

    writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8')
  }

  async load(sessionId: string): Promise<Message[] | null> {
    const filePath = join(this.sessionsDir, sessionId, 'messages.json')

    try {
      const raw = readFileSync(filePath, 'utf-8')
      const data = JSON.parse(raw) as SessionFile
      return data.messages ?? []
    } catch {
      return null
    }
  }

  async list(): Promise<Array<{ sessionId: string; messageCount: number; updatedAt: string }>> {
    const entries: Array<{ sessionId: string; messageCount: number; updatedAt: string }> = []

    try {
      const dirs = readdirSync(this.sessionsDir, { withFileTypes: true })

      for (const dir of dirs) {
        if (!dir.isDirectory()) continue

        const filePath = join(this.sessionsDir, dir.name, 'messages.json')
        try {
          const raw = readFileSync(filePath, 'utf-8')
          const data = JSON.parse(raw) as SessionFile
          entries.push({
            sessionId: dir.name,
            messageCount: data.messages?.length ?? 0,
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
