/**
 * @fileoverview MYCODE.md loader: loads project rules from ~/.mycode/MYCODE.md (global) and <projectRoot>/MYCODE.md (project), appends them
 * @module @my-agent/core/memory/mycode-md
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { homedir } from 'node:os'

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
