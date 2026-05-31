/**
 * @fileoverview Skill registry: load skills from configured paths and provide formatted list for system prompt injection
 * @module @my-agent/core/skill/index
 */

import type { SkillInfo } from './types.js'

export type { SkillInfo } from './types.js'
export { scanSkills } from './loader.js'
export type { ScanOptions } from './loader.js'

/**
 * Format a skill list into a string block suitable for injection into system prompt.
 * Shows name, description, and the full content of each skill.
 */
export function formatSkillPrompt(skills: SkillInfo[]): string {
  if (skills.length === 0) return ''

  const blocks: string[] = ['## Available Skills']
  blocks.push(
    'You have access to the following skills. When a task matches a skill\'s description, use its instructions.',
    '',
  )

  for (const skill of skills) {
    blocks.push(`### ${skill.name}`)
    if (skill.description) blocks.push(`Description: ${skill.description}`)
    blocks.push('')
    if (skill.content) blocks.push(skill.content)
    blocks.push('')
  }

  return blocks.join('\n')
}
