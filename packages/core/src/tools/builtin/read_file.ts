/**
 * @fileoverview Built-in file reading tool
 * @module @my-agent/core/tools/builtin/read_file
 */

import { z } from 'zod'
import { readFile } from 'node:fs/promises'
import type { Tool, ToolContext } from '../registry.js'

export const readFileTool: Tool = {
  name: 'read_file',
  description: 'Read the contents of a file from the local filesystem. Returns the file content as text.',
  parameters: z.object({
    path: z.string().describe('Absolute path to the file to read'),
  }),
  async *execute(args: unknown, _context: ToolContext) {
    const { path } = args as { path: string }
    const content = await readFile(path, 'utf-8')
    return { path, content }
  },
}
