/**
 * @fileoverview Skill scanner: discovers skills by scanning configured directories for SKILL.md files, parses YAML frontmatter, and deduplicates by name
 * @module @my-agent/core/skill/loader
 */

import { existsSync, readFileSync } from 'node:fs'
import { readdirSync } from 'node:fs'
import { resolve, isAbsolute } from 'node:path'
import type { SkillInfo } from './types.js'
import { findConfigDir } from '../config.js'

// ── Frontmatter Parser ──

interface Frontmatter {
  name?: string
  description?: string
  [key: string]: unknown
}

/**
 * Parse YAML-like frontmatter from a markdown file.
 * Delimited by `---` lines. Only extracts `name` and `description` fields.
 * Returns the parsed frontmatter and the body content after frontmatter.
 */
function parseFrontmatter(raw: string): { data: Frontmatter; content: string } {
  const lines = raw.split('\n')
  const firstLine = lines[0]
  if (lines.length < 2 || !firstLine || firstLine.trim() !== '---') {
    return { data: {}, content: raw }
  }

  let endIndex = -1
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (line && line.trim() === '---') {
      endIndex = i
      break
    }
  }

  if (endIndex === -1) {
    return { data: {}, content: raw }
  }

  const frontmatterLines = lines.slice(1, endIndex)
  const data: Frontmatter = {}

  for (const line of frontmatterLines) {
    const colonIndex = line.indexOf(':')
    if (colonIndex === -1) continue
    const key = line.slice(0, colonIndex).trim()
    let value: string | number | boolean = line.slice(colonIndex + 1).trim()

    // Remove surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    data[key] = value
  }

  const content = lines.slice(endIndex + 1).join('\n').trim()
  return { data, content }
}

// ── Directory Scanning ──

const SKILL_FILE = 'SKILL.md'

/**
 * Scan a single directory for skills (directories containing SKILL.md).
 */
function scanDirectory(dir: string): SkillInfo[] {
  if (!existsSync(dir)) return []

  const results: SkillInfo[] = []

  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const skillDir = resolve(dir, entry.name)
      const skillFile = resolve(skillDir, SKILL_FILE)

      if (!existsSync(skillFile)) continue

      try {
        const raw = readFileSync(skillFile, 'utf-8')
        const { data, content } = parseFrontmatter(raw)
        const name = data.name ?? entry.name
        const description = data.description ?? ''

        results.push({ name, description, location: skillFile, content })
      } catch {
        // Skip unreadable skills
        continue
      }
    }
  } catch {
    // Skip unreadable directories
  }

  return results
}

// ── Path Resolution ──

/**
 * Resolve a skill path relative to the project root.
 * If the path is already absolute, return it as-is.
 */
function resolveSkillPath(path: string, projectRoot: string): string {
  return isAbsolute(path) ? path : resolve(projectRoot, path)
}

// ── Public API ──

export interface ScanOptions {
  /** Project root directory, used to resolve relative paths */
  projectRoot: string
  /** Additional skill paths from config (relative or absolute) */
  extraPaths: string[]
}

/**
 * Discover all skills from default path and extra paths, deduplicated by name.
 * Default path: <projectRoot>/.mycode/skills
 * Extra paths: resolved relative to projectRoot (or absolute)
 */
export function scanSkills(options: ScanOptions): SkillInfo[] {
  const { projectRoot, extraPaths } = options
  const seen = new Set<string>()
  const allSkills: SkillInfo[] = []

  const pathsToScan = new Set<string>()

  // 1. 配置目录下的 skills（~/.mycode/skills 或 .mycode/skills）
  try {
    pathsToScan.add(resolve(findConfigDir(), 'skills'))
  } catch {
    // findConfigDir may throw if no config found — skip default path
  }

  // 2. Extra paths from config
  for (const p of extraPaths) {
    pathsToScan.add(resolveSkillPath(p, projectRoot))
  }

  // Scan each directory
  for (const dir of pathsToScan) {
    const skills = scanDirectory(dir)
    for (const skill of skills) {
      if (!seen.has(skill.name)) {
        seen.add(skill.name)
        allSkills.push(skill)
      }
    }
  }

  return allSkills
}
