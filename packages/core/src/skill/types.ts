/**
 * @fileoverview SkillInfo type definition for the skill system
 * @module @my-agent/core/skill/types
 */

/**
 * A discovered skill.
 * Each skill is a directory containing a SKILL.md file.
 */
export interface SkillInfo {
  /** Skill name (from frontmatter, must match directory name) */
  name: string
  /** One-line description of what the skill does (from frontmatter) */
  description: string
  /** Absolute path to the SKILL.md file */
  location: string
  /** Full markdown body of the skill (frontmatter stripped) */
  content: string
}
