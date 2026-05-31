/**
 * @fileoverview Built-in file writing tool
 * @module @my-agent/core/tools/builtin/write
 */

import { z } from 'zod'
import { writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Tool, ToolContext } from '../registry.js'

export const writeTool: Tool = {
  name: 'write',
  description: 'Write content to a file. Creates parent directories if they do not exist. Overwrites existing files.',
  parameters: z.object({
    path: z.string().describe('Absolute path to the file to write'),
    content: z.string().describe('The content to write to the file'),
  }),
  async *execute(args: unknown, _context: ToolContext) {
    const { path, content } = args as { path: string; content: string }
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, content, 'utf-8')
    return { path, size: content.length, content }
  },
}
