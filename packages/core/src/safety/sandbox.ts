/**
 * @fileoverview File system sandbox interface: restricts file read/write to allowed paths
 * @module @my-agent/core/safety/sandbox
 */

const ALLOWED_COMMANDS = new Set([
  'ls', 'cat', 'head', 'tail', 'wc',
  'find', 'grep', 'rg', 'ag',
  'pwd', 'echo', 'which', 'stat',
  'git', 'node', 'bun',
])

const BLOCKED_PATTERNS = [
  /rm\s+-rf/,
  /sudo/,
  /chmod\s+777/,
  />/,
  /\|/,
  /`.*`/,
  /\$\(.*\)/,
]

export function isCommandAllowed(command: string): { ok: true } | { ok: false; reason: string } {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(command)) {
      return { ok: false, reason: `Command blocked by pattern: ${pattern}` }
    }
  }

  const cmd = command.split(/\s+/)[0]
  if (!cmd) return { ok: false, reason: 'Empty command' }
  if (!ALLOWED_COMMANDS.has(cmd)) {
    return { ok: false, reason: `Command "${cmd}" is not in the allowlist` }
  }

  return { ok: true }
}
