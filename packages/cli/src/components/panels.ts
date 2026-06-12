/**
 * @fileoverview Renders various modal panels (welcome, model select, MCP list, etc.) as unblessed tagged strings.
 * Each function returns a tagged string for the content area.
 * @module @my-agent/cli/src/components/panels
 */
import type { LLMProviderConfig, MCPServerStatus, SkillInfo } from '@my-agent/core'
import type { QuestionPayload } from '@my-agent/core'

export interface ShellOutputData {
  command: string
  stdout: string
  stderr: string
  exitCode: number
}

export type ConnectStep = 'format' | 'url' | 'model' | 'apikey' | 'name' | 'done' | null

export interface ConnectConfig {
  format?: 'openai' | 'anthropic'
  baseUrl?: string
  model?: string
  apiKey?: string
  providerName?: string
}

export const COMMANDS = ['/compact', '/connect', '/exit', '/forget', '/init', '/mcps', '/memory', '/models', '/new', '/q', '/remember', '/resume', '/rule', '/skills'] as const
export const COMMAND_HELP: Record<string, string> = {
  '/connect': '连接新模型',
  '/exit': '退出',
  '/forget': '删除会话记忆（按 ID）',
  '/init': '生成或更新项目 AGENTS.md',
  '/mcps': 'MCP 服务器状态',
  '/memory': '查看当前会话记忆',
  '/models': '切换模型',
  '/new': '开始新对话',
  '/q': '退出（快捷）',
  '/remember': '存入会话记忆',
  '/resume': '恢复历史会话',
  '/rule': '存入项目规则（MYCODE.md）',
  '/skills': '查看可用技能',
}

export function renderWelcomeHint(skillCommands: Array<{ name: string; desc: string }>): string {
  const lines: string[] = []
  lines.push('')
  lines.push('Welcome to mycode — AI Coding Agent')
  lines.push('')
  lines.push('{gray-fg}常用命令：{/gray-fg}')
  for (const cmd of COMMANDS) {
    if (cmd === '/q') continue
    lines.push(`{gray-fg}  ${cmd}  ${COMMAND_HELP[cmd]}{/gray-fg}`)
  }
  lines.push(`{gray-fg}  !<命令>  执行 shell 命令{/gray-fg}`)
  if (skillCommands.length > 0) {
    lines.push('')
    lines.push('{gray-fg}技能命令：{/gray-fg}')
    for (const s of skillCommands) {
      lines.push(`{gray-fg}  /{bold}${s.name}{/bold}  ${s.desc}{/gray-fg}`)
    }
  }
  lines.push('')
  lines.push('{gray-fg}直接输入问题开始对话，输入 / 查看所有命令{/gray-fg}')
  return lines.join('\n')
}

export function renderModelSelectPanel(providers: Array<[name: string, config: LLMProviderConfig]>, selectIdx: number): string {
  const lines: string[] = []
  lines.push('{bold}{cyan-fg} 选择模型{/cyan-fg}{/bold}')
  for (let i = 0; i < providers.length; i++) {
    const [name, prov] = providers[i]!
    const prefix = i === selectIdx ? '▸' : ' '
    if (i === selectIdx) {
      lines.push(`{inverse} ${prefix} ${name} — ${prov.model} {/inverse}`)
    } else {
      lines.push(` ${prefix} ${name} — ${prov.model}`)
    }
  }
  return lines.join('\n')
}

export function renderMcpListPanel(statuses: MCPServerStatus[]): string {
  const lines: string[] = []
  lines.push('{bold}{cyan-fg} MCP 服务器{/bold}{/cyan-fg}  {gray-fg}按 ESC 退出{/gray-fg}')
  if (statuses.length === 0) {
    lines.push('{gray-fg}  (未配置 MCP 服务器){/gray-fg}')
  }
  for (const s of statuses) {
    const statusColor = s.status === 'connected' ? 'green-fg' : s.status === 'error' ? 'red-fg' : 'yellow-fg'
    const toolInfo = s.toolCount > 0 ? ` {gray-fg}(${s.toolCount} tools){/gray-fg}` : ''
    const errorInfo = s.error ? ` {red-fg}${s.error}{/red-fg}` : ''
    lines.push(` ${s.name} {gray-fg}${s.type}{/gray-fg} {${statusColor}}${s.status}{/${statusColor}}${toolInfo}${errorInfo}`)
  }
  return lines.join('\n')
}

export function renderSkillsListPanel(skills: SkillInfo[]): string {
  const lines: string[] = []
  lines.push('{bold}{green-fg} 可用技能{/green-fg}{/bold}  {gray-fg}按 ESC 退出{/gray-fg}')
  if (skills.length === 0) {
    lines.push('{gray-fg}  (未配置技能，将 SKILL.md 放入 .mycode/skills/ 目录){/gray-fg}')
  }
  for (const s of skills) {
    lines.push(` {bold}${s.name}{/bold}`)
    if (s.description) {
      lines.push(`  {gray-fg}${s.description}{/gray-fg}`)
    }
    lines.push(`  {gray-fg}${s.location}{/gray-fg}`)
  }
  return lines.join('\n')
}

export function renderQuestionPanel(question: QuestionPayload): string {
  const lines: string[] = []
  lines.push(`{bold}{yellow-fg} ? {/yellow-fg}{/bold} {bold}${question.header ?? '需要你的输入'}{/bold}`)
  lines.push(question.question)
  if (question.options && question.options.length > 0) {
    for (let i = 0; i < question.options.length; i++) {
      const opt = question.options[i]!
      const desc = opt.description ? ` — ${opt.description}` : ''
      lines.push(`{gray-fg}  ${i + 1}. {/gray-fg}${opt.label}{gray-fg}${desc}{/gray-fg}`)
    }
    lines.push('{gray-fg}输入选项编号后按 Enter{/gray-fg}')
  } else {
    lines.push('{gray-fg}输入回答后按 Enter{/gray-fg}')
  }
  return lines.join('\n')
}

export function renderUnknownCmdPanel(cmd: string): string {
  const lines: string[] = []
  lines.push(`{bold}{red-fg} 未知命令：{/red-fg}{/bold}{bold}${cmd}{/bold}`)
  lines.push('{gray-fg}输入 / 查看所有可用命令，按任意键继续{/gray-fg}')
  return lines.join('\n')
}

export function renderShellOutputPanel(data: ShellOutputData): string {
  const lines: string[] = []
  const color = data.exitCode === 0 ? 'green-fg' : 'red-fg'
  lines.push(`{bold}{${color}} $ {/${color}}{/bold}{bold}${data.command}{/bold}  {gray-fg}按 ESC 返回{/gray-fg}`)
  if (data.stdout) {
    lines.push(data.stdout)
  }
  if (data.stderr) {
    lines.push(`{red-fg}${data.stderr}{/red-fg}`)
  }
  lines.push(`{gray-fg}exit code: ${data.exitCode}{/gray-fg}`)
  return lines.join('\n')
}

export function renderConnectWizardPanel(step: ConnectStep, config: ConnectConfig, selectIdx: number): string {
  if (!step) return ''

  const lines: string[] = []
  lines.push('{bold}{magenta-fg} /connect {/magenta-fg}{/bold} {gray-fg} 按 ESC 取消{/gray-fg}')

  if (step === 'format') {
    lines.push('选择 API 格式：')
    lines.push('')
    const items = ['OpenAI 兼容格式', 'Anthropic 格式']
    for (let i = 0; i < items.length; i++) {
      const prefix = i === selectIdx ? '▸' : ' '
      if (i === selectIdx) {
        lines.push(`{inverse} ${prefix} ${items[i]} {/inverse}`)
      } else {
        lines.push(` ${prefix} ${items[i]}`)
      }
    }
    lines.push('')
    lines.push('{gray-fg}Tab/↑↓ 选择，Enter 确认{/gray-fg}')
  }

  if (step === 'url') {
    lines.push('输入 Base URL：')
    lines.push('{gray-fg}例如：https://api.openai.com/v1{/gray-fg}')
  }

  if (step === 'model') {
    lines.push('输入模型名称：')
    lines.push('{gray-fg}例如：gpt-5.2, claude-sonnet-4-20250514{/gray-fg}')
  }

  if (step === 'apikey') {
    lines.push('输入 API Key：')
    lines.push('{gray-fg}也可以通过环境变量 MYCODE_API_KEY 设置{/gray-fg}')
  }

  if (step === 'name') {
    lines.push('为这个模型配置命名：')
    lines.push('{gray-fg}例如：my-gpt, work-claude{/gray-fg}')
  }

  if (step === 'done') {
    if (config.providerName?.startsWith('错误')) {
      lines.push(`{red-fg}连接失败：${config.providerName}{/red-fg}`)
    } else {
      lines.push(`{green-fg}✓ 已连接：${config.providerName}{/green-fg}`)
      lines.push(`{gray-fg}格式：${config.format} | 模型：${config.model}{/gray-fg}`)
      lines.push('{gray-fg}按任意键返回{/gray-fg}')
    }
  }

  return lines.join('\n')
}

export function renderResumeList(
  resumeList: Array<{ sessionId: string; turnCount: number; updatedAt: string }>,
  selectIdx: number,
): string {
  const lines: string[] = []
  lines.push('{bold}历史会话 (Enter 恢复, Esc 取消){/bold}')
  if (resumeList.length === 0) {
    lines.push('{gray-fg}暂无历史会话{/gray-fg}')
  }
  for (let i = 0; i < resumeList.length; i++) {
    const s = resumeList[i]!
    const text = ` ${i + 1}. ${s.sessionId.slice(0, 8)}... (${s.turnCount} 轮对话)`
    if (i === selectIdx) {
      lines.push(`{inverse}${text}{/inverse}`)
    } else {
      lines.push(text)
    }
  }
  return lines.join('\n')
}

export function renderAutoComplete(matches: string[], selectedIdx: number): string {
  const lines: string[] = []
  for (let i = 0; i < matches.length; i++) {
    if (i === selectedIdx) {
      lines.push(`{inverse} ${matches[i]} {/inverse}`)
    } else {
      lines.push(` ${matches[i]} `)
    }
  }
  return lines.join('\n')
}

export function renderStatusMsg(text: string, color: string): string {
  return `{${color}-fg}${text}{/${color}-fg}`
}
