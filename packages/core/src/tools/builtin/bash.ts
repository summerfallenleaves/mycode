/**
 * @fileoverview Built-in shell command execution tool
 * @module @my-agent/core/tools/builtin/bash
 */

import { z } from 'zod'
import { exec } from 'node:child_process'
import { writeFile, unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import type { Tool, ToolContext } from '../registry.js'

export const bashTool: Tool = {
  name: 'bash',
  description: 'Execute a shell command. Returns combined stdout and stderr output.',
  parameters: z.object({
    command: z.string().describe('The shell command to execute'),
    workdir: z.string().optional().describe('Working directory for the command'),
    timeout: z.number().optional().describe('Timeout in milliseconds (default: 30000)'),
  }),
  async *execute(args: unknown, context: ToolContext) {
    const { command, workdir, timeout } = args as {
      command: string
      workdir?: string
      timeout?: number
    }

    const id = randomUUID().slice(0, 8)
    const scriptPath = `/tmp/mycode-bash-${id}.sh`

    yield { type: 'progress' as const, message: `$ ${command}` }

    // Write command to temp script to avoid shell escaping issues
    await writeFile(scriptPath, '#!/bin/sh\n' + command + '\n', 'utf-8')

    const result = await new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve) => {
      const child = exec(
        `sh ${scriptPath}`,
        {
          cwd: workdir,
          timeout: timeout ?? 30_000,
          maxBuffer: 10 * 1024 * 1024, // 10MB
        },
        (error, stdout, stderr) => {
          const exitCode = error?.code ?? 0
          resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode })
        },
      )

      context.signal.addEventListener('abort', () => {
        child.kill('SIGTERM')
      })
    })

    // Clean up temp script
    await unlink(scriptPath).catch(() => {})

    yield { type: 'data' as const, chunk: result.stdout || result.stderr || '(no output)' }
    return { command, exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr }
  },
}
