/**
 * @fileoverview Built-in todowrite tool: create, update, and manage structured todo lists for coding sessions
 * @module @my-agent/core/tools/builtin/todowrite
 */

import { z } from 'zod'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import type { Tool, ToolContext } from '../registry.js'

const TODO_FILE = 'todos.json'

const todoItemSchema = z.object({
  content: z.string().describe('Task description'),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).describe('Current status'),
  priority: z.enum(['high', 'medium', 'low']).optional().describe('Priority level'),
})

export type TodoItem = z.infer<typeof todoItemSchema>

function findProjectRoot(): string {
  let dir = process.cwd()
  while (true) {
    if (existsSync(resolve(dir, '.mycode/mycode.jsonc'))) {
      return dir
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return process.cwd()
}

export function getTodoPath(sessionDir?: string): string {
  if (sessionDir) {
    return resolve(sessionDir, TODO_FILE)
  }
  return resolve(findProjectRoot(), '.mycode', TODO_FILE)
}

export function readTodos(sessionDir?: string): TodoItem[] {
  const path = getTodoPath(sessionDir)
  if (!existsSync(path)) return []
  try {
    const raw = readFileSync(path, 'utf-8')
    return JSON.parse(raw) as TodoItem[]
  } catch {
    return []
  }
}

function writeTodos(todos: TodoItem[], sessionDir?: string): void {
  const path = getTodoPath(sessionDir)
  writeFileSync(path, JSON.stringify(todos, null, 2) + '\n', 'utf-8')
}

export const todowriteTool: Tool = {
  name: 'todowrite',
  description:
    'Manage a structured todo list for the current coding session. Use this to track progress on multi-step tasks. Operations: create (replace all), update (change status by content match), add (append new items), get (read current list).',
  parameters: z.object({
    operation: z.enum(['create', 'update', 'add', 'get']).describe('Operation to perform'),
    todos: z.array(todoItemSchema).optional().describe('Todo items (required for create/update/add)'),
  }),
  async *execute(args: unknown, context: ToolContext) {
    const { operation, todos } = args as { operation: string; todos?: TodoItem[] }
    const sessionDir = context.sessionDir

    switch (operation) {
      case 'create': {
        if (!todos || todos.length === 0) {
          return { error: 'todos array is required for create operation', status: 'failed' }
        }
        writeTodos(todos, sessionDir)
        yield { type: 'data', chunk: `Created ${todos.length} todo(s)` }
        return { todos, count: todos.length, status: 'created' }
      }

      case 'add': {
        if (!todos || todos.length === 0) {
          return { error: 'todos array is required for add operation', status: 'failed' }
        }
        const existing = readTodos(sessionDir)
        const updated = [...existing, ...todos]
        writeTodos(updated, sessionDir)
        yield { type: 'data', chunk: `Added ${todos.length} todo(s), total: ${updated.length}` }
        return { todos: updated, count: updated.length, added: todos.length, status: 'added' }
      }

      case 'update': {
        if (!todos || todos.length === 0) {
          return { error: 'todos array is required for update operation', status: 'failed' }
        }
        const existing = readTodos(sessionDir)
        let updatedCount = 0
        for (const update of todos) {
          const idx = existing.findIndex(t => t.content === update.content)
          if (idx >= 0) {
            existing[idx] = { ...existing[idx], ...update }
            updatedCount++
          }
        }
        writeTodos(existing, sessionDir)
        yield { type: 'data', chunk: `Updated ${updatedCount} todo(s)` }
        return { todos: existing, count: existing.length, updated: updatedCount, status: 'updated' }
      }

      case 'get': {
        const existing = readTodos(sessionDir)
        const summary = existing.length === 0
          ? 'No todos found'
          : existing.map((t, i) => `${i + 1}. [${t.status}] ${t.content}${t.priority ? ` (${t.priority})` : ''}`).join('\n')
        yield { type: 'data', chunk: summary }
        return { todos: existing, count: existing.length, status: 'retrieved' }
      }

      default:
        return { error: `Unknown operation: ${operation}`, status: 'failed' }
    }
  },
}
