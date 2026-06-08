/**
 * @fileoverview MYCODE.md loader and rule appender: loads project rules from ~/.mycode/MYCODE.md (global) and <projectRoot>/MYCODE.md (project), appends them; provides appendRule() for structured rule writing
 * @module @my-agent/core/memory/mycode-md
 */

import { existsSync, readFileSync, appendFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { homedir } from 'node:os'
import type { MemoryType } from './types.js'

const MYCODE_FILENAME = 'MYCODE.md'
const GLOBAL_DIR = resolve(homedir(), '.mycode')

/**
 * Load MYCODE.md content from global (~/.mycode/MYCODE.md) and project (<projectRoot>/MYCODE.md).
 * Uses append strategy: global content first, project content second.
 * Returns a formatted markdown section, or empty string if neither file exists.
 */
export function loadMycodeMd(projectRoot: string): string {
  const globalPath = resolve(GLOBAL_DIR, MYCODE_FILENAME)
  const projectPath = resolve(projectRoot, MYCODE_FILENAME)

  const globalExists = existsSync(globalPath)
  const projectExists = existsSync(projectPath)

  if (!globalExists && !projectExists) return ''

  const parts: string[] = ['## Project Rules']

  if (globalExists) {
    const content = readFileSync(globalPath, 'utf-8').trim()
    if (content) parts.push(content)
  }

  if (projectExists) {
    const content = readFileSync(projectPath, 'utf-8').trim()
    if (content) parts.push(content)
  }

  return parts.join('\n\n')
}

/** Append a structured rule line to a MYCODE.md file (project or global). Creates the file if it doesn't exist. */
export function appendRule(target: 'project' | 'global', projectRoot: string, params: {
  type: MemoryType
  content: string
}): { error?: string } {
  const content = params.content.trim()
  if (!content) return { error: 'Content is required' }

  // Secret filter: reject if content matches common key patterns
  if (/sk-[a-zA-Z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[a-zA-Z0-9]{36}|gho_[a-zA-Z0-9]{36}/.test(content)) {
    return { error: 'Content appears to contain secrets or API keys' }
  }

  const filePath = target === 'global'
    ? resolve(GLOBAL_DIR, MYCODE_FILENAME)
    : resolve(projectRoot, MYCODE_FILENAME)

  mkdirSync(dirname(filePath), { recursive: true })

  const line = `\n- [${params.type}] ${content}`
  appendFileSync(filePath, line, 'utf-8')

  return {}
}
