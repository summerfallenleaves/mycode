/**
 * @fileoverview SkillsListPanel: displays available skills with name, description, and location
 * @module @my-agent/cli/src/components/skills-list-panel
 */
import { Box, Text } from 'ink'
import type { JSX } from 'react'
import type { SkillInfo } from '@my-agent/core'

export function SkillsListPanel({ skills }: { skills: SkillInfo[] }): JSX.Element {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={1}>
      <Box>
        <Text bold color="green"> 可用技能</Text>
        <Text dimColor>  按 ESC 退出</Text>
      </Box>
      {skills.length === 0 ? (
        <Text dimColor>  (未配置技能，将 SKILL.md 放入 .mycode/skills/ 目录)</Text>
      ) : skills.map(s => (
        <Box key={s.name} flexDirection="column">
          <Box>
            <Text>{' '}{s.name}</Text>
          </Box>
          {s.description && (
            <Box marginLeft={2}>
              <Text dimColor>{s.description}</Text>
            </Box>
          )}
          <Box marginLeft={2}>
            <Text dimColor>{s.location}</Text>
          </Box>
        </Box>
      ))}
    </Box>
  )
}
