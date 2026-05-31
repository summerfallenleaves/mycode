/**
 * @fileoverview Built-in file editing tool (exact string replacement)
 * @module @my-agent/core/tools/builtin/edit
 */

import { z } from 'zod'
import { readFile, writeFile } from 'node:fs/promises'
import type { Tool, ToolContext } from '../registry.js'

export const editTool: Tool = {
  name: 'edit',
  description: 'Edit a file by finding and replacing text. Uses exact string matching. Returns the number of replacements made.',
  parameters: z.object({
    path: z.string().describe('Absolute path to the file to edit'),
    old: z.string().describe('The exact text to find and replace'),
    new: z.string().describe('The replacement text'),
  }),
  async *execute(args: unknown, _context: ToolContext) {
    const { path, old: oldStr, new: newStr } = args as { path: string; old: string; new: string }
    const content = await readFile(path, 'utf-8')
    if (!content.includes(oldStr)) {
      return { error: `String not found in file: ${path}`, replacements: 0 }
    }
    const newContent = content.replaceAll(oldStr, newStr)
    const count = (content.match(new RegExp(oldStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length
    await writeFile(path, newContent, 'utf-8')
    return { path, replacements: count, old: oldStr, new: newStr }
  },
}
