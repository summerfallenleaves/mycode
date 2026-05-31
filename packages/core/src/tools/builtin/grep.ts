/**
 * @fileoverview Built-in grep tool: search file contents using regular expressions
 * @module @my-agent/core/tools/builtin/grep
 */

import { z } from 'zod'
import { exec } from 'node:child_process'
import type { Tool, ToolContext } from '../registry.js'

interface GrepMatch {
  file: string
  line: number
  content: string
}

export const grepTool: Tool = {
  name: 'grep',
  description: 'Search file contents using a regular expression. Returns matching files with line numbers. Supports optional file include/exclude patterns.',
  parameters: z.object({
    pattern: z.string().describe('Regular expression pattern to search for'),
    include: z.string().optional().describe('File glob pattern to include (e.g. "*.ts", "*.{ts,tsx}")'),
    path: z.string().optional().describe('Directory to search in (default: current working directory)'),
    headLimit: z.number().optional().describe('Maximum number of matches to return (default: 50)'),
  }),
  async *execute(args: unknown, context: ToolContext) {
    const { pattern, include, path, headLimit } = args as {
      pattern: string
      include?: string
      path?: string
      headLimit?: number
    }

    if (context.signal.aborted) {
      throw new Error('Tool execution cancelled')
    }

    const limit = headLimit ?? 50
    const searchDir = path ?? process.cwd()

    // Build the grep command
    // -r: recursive, -n: line numbers, -I: ignore binary, -s: suppress errors
    let cmd = `grep -rnI -m1 -E ${JSON.stringify(pattern)} ${JSON.stringify(searchDir)}`
    if (include) {
      cmd += ` --include=${JSON.stringify(include)}`
    }
    // Limit output lines to prevent huge responses
    cmd += ` | head -${limit + 1}`

    yield { type: 'progress' as const, message: `grep -rn "${pattern}" in ${searchDir}` }

    const result = await new Promise<string>((resolve, reject) => {
      exec(cmd, { maxBuffer: 5 * 1024 * 1024 }, (error, stdout) => {
        // grep exits with code 1 when no matches — that's not an error
        if (error && (error.code ?? 1) > 1) {
          reject(error)
          return
        }
        resolve(stdout.trim())
      })
    })

    if (!result) {
      yield { type: 'data' as const, chunk: '(no matches found)' }
      return { matches: [], count: 0, pattern }
    }

    const lines = result.split('\n')
    const truncated = lines.length > limit
    const displayLines = truncated ? lines.slice(0, limit) : lines

    const matches: GrepMatch[] = displayLines.map(line => {
      const sep1 = line.indexOf(':')
      const sep2 = line.indexOf(':', sep1 + 1)
      const file = line.slice(0, sep1)
      const lineNum = parseInt(line.slice(sep1 + 1, sep2), 10)
      const content = line.slice(sep2 + 1)
      return { file, line: lineNum, content }
    })

    const summary = `Found ${truncated ? limit + '+' : matches.length} match(es) for /${pattern}/`
    yield { type: 'data' as const, chunk: summary + '\n' + displayLines.join('\n') }
    return { matches, count: matches.length, truncated, pattern }
  },
}
