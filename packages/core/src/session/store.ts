/**
 * @fileoverview Session persistence interface (to be implemented)
 * @module @my-agent/core/session/store
 */

import type { Message } from './context.js'

export interface SessionStore {
  save(sessionId: string, messages: readonly Message[]): Promise<void>
  load(sessionId: string): Promise<Message[] | null>
  list(): Promise<Array<{ sessionId: string; messageCount: number; updatedAt: number }>>
  delete(sessionId: string): Promise<void>
}
