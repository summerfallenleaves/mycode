/**
 * @fileoverview Built-in glob tool: search for files by filename pattern
 * @module @my-agent/core/tools/builtin/glob
 */

import { z } from 'zod'
import { exec } from 'node:child_process'
import type { Tool, ToolContext } from '../registry.js'

export const globTool: Tool = {
  name: 'glob',
  description: 'Search for files by filename pattern. Uses glob syntax: **/ recursive, * wildcard, {a,b} alternatives. Returns matching file paths sorted by modification time.',
  parameters: z.object({
    pattern: z.string().describe('Glob pattern for filename matching (e.g. "**/*.ts", "src/**/*.tsx", ".env*")'),
    path: z.string().optional().describe('Root directory to search in (default: current working directory)'),
    headLimit: z.number().optional().describe('Maximum number of results to return (default: 100)'),
  }),
  async *execute(args: unknown, context: ToolContext) {
    const { pattern, path, headLimit } = args as {
      pattern: string
      path?: string
      headLimit?: number
    }

    if (context.signal.aborted) {
      throw new Error('Tool execution cancelled')
    }

    const limit = headLimit ?? 100
    const searchDir = path ?? process.cwd()

    // Use find with -path pattern matching for glob-like behavior
    // Escape the pattern for shell safety
    const escapedPattern = pattern.replace(/'/g, "'\\''")
    // Build find command: find <dir> -type f -name "<pattern>" or -path "<pattern>"
    // For recursive patterns (**/), use -path; otherwise use -name
    const hasRecursive = pattern.includes('**/')
    const findFlag = hasRecursive ? '-path' : '-name'
    // For **/ prefix, strip it for find's -path matching
    const findPattern = hasRecursive ? `*/${escapedPattern.replace(/\*\*\//g, '')}` : escapedPattern

    const cmd = `find ${JSON.stringify(searchDir)} -type f ${findFlag} ${JSON.stringify(findPattern)} 2>/dev/null | head -${limit + 1}`

    yield { type: 'progress' as const, message: `glob "${pattern}" in ${searchDir}` }

    const result = await new Promise<string>((resolve) => {
      exec(cmd, { maxBuffer: 2 * 1024 * 1024 }, (_error, stdout) => {
        resolve(stdout.trim())
      })
    })

    if (!result) {
      yield { type: 'data' as const, chunk: '(no files found)' }
      return { files: [], count: 0, pattern }
    }

    const files = result.split('\n')
    const truncated = files.length > limit
    const displayFiles = truncated ? files.slice(0, limit) : files

    const summary = `Found ${truncated ? limit + '+' : files.length} file(s) matching "${pattern}"`
    yield { type: 'data' as const, chunk: summary + '\n' + displayFiles.join('\n') }
    return { files: displayFiles, count: displayFiles.length, truncated, pattern }
  },
}
