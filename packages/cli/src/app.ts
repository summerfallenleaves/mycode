/**
 * @fileoverview Imperative App: creates @unblessed/node split-screen layout, manages state via plain objects,
 * handles keyboard input, and connects to Agent via AgentStreamManager.
 * @module @my-agent/cli/src/app
 */
import { execSync } from 'node:child_process'
import blessed from 'blessed'
import {
  Agent, createChatModel, ToolRegistry, readConfig, readFileTool, editTool, writeTool,
  bashTool, grepTool, globTool, questionTool, todowriteTool, memoryTool,
  MCPClientManager, scanSkills, addProvider, FileSessionStore, FileMemoryStore, readTodos,
  appendRule,
} from '@my-agent/core'
import type { LLMProviderConfig, MCPServerStatus, SkillInfo, TodoItem, QuestionPayload } from '@my-agent/core'
import { AgentStreamManager } from './lib/agent-stream-manager.js'
import type { ViewEvent } from './lib/agent-stream-manager.js'
import { renderEvents } from './components/event-renderer.js'
import { renderSidebar } from './components/sidebar.js'
import { renderStatusBar } from './components/status-bar.js'
import {
  renderWelcomeHint, renderModelSelectPanel, renderMcpListPanel, renderSkillsListPanel,
  renderQuestionPanel, renderUnknownCmdPanel, renderShellOutputPanel,
  renderConnectWizardPanel, renderResumeList, renderAutoComplete, renderStatusMsg,
  COMMANDS,
} from './components/panels.js'
import type { ShellOutputData, ConnectStep, ConnectConfig } from './components/panels.js'
import { calculateLayout } from './lib/terminal-layout.js'
import type { LayoutRegion } from './lib/terminal-layout.js'
import pkg from '../package.json' with { type: 'json' }

const PKG_VERSION = pkg.version as string
type ProviderEntry = [name: string, config: LLMProviderConfig]

function getProviderList(): ProviderEntry[] {
  const { config } = readConfig()
  return Object.entries(config.llm.providers)
}

const SHARED_TOOLS = new ToolRegistry()
SHARED_TOOLS.register(readFileTool)
SHARED_TOOLS.register(editTool)
SHARED_TOOLS.register(writeTool)
SHARED_TOOLS.register(bashTool)
SHARED_TOOLS.register(grepTool)
SHARED_TOOLS.register(globTool)
SHARED_TOOLS.register(questionTool)
SHARED_TOOLS.register(todowriteTool)
SHARED_TOOLS.register(memoryTool)

const SESSION_STORE = new FileSessionStore(`${process.cwd()}/.mycode/sessions`)

const { config: startConfig } = readConfig()
const MCP_MANAGER = startConfig.mcpServers && Object.keys(startConfig.mcpServers).length > 0
  ? new MCPClientManager(startConfig.mcpServers)
  : null
if (MCP_MANAGER) {
  MCP_MANAGER.connectAll(SHARED_TOOLS)
}

function createAgent(providerName: string, preScannedSkills?: SkillInfo[], resumeSessionId?: string): Agent {
  const { config } = readConfig()
  const provider = config.llm.providers[providerName]
  if (!provider) throw new Error(`Provider "${providerName}" not found`)
  const apiKey = process.env.MYCODE_API_KEY ?? provider.apiKey
  return new Agent({
    model: createChatModel({ format: provider.format, baseUrl: provider.baseUrl, apiKey, model: provider.model }),
    modelName: provider.model,
    tools: SHARED_TOOLS,
    systemPrompt: config.agent.systemPrompt,
    maxSteps: config.agent.maxSteps,
    runTimeoutMs: config.agent.runTimeoutMs,
    maxContextTokens: config.agent.maxContextTokens,
    autoMemoryExtraction: config.agent.autoMemoryExtraction,
    contextCompressionThreshold: config.agent.contextCompressionThreshold,
    skillsConfig: config.skills,
    skills: preScannedSkills,
    projectRoot: process.cwd(),
    sessionStore: SESSION_STORE,
    resumeSessionId,
  })
}

interface AppState {
  input: string
  cursorIndex: number
  selectedIdx: number
  isRunning: boolean
  error: string | null
  events: ViewEvent[]
  todos: TodoItem[]
  activeProvider: string
  contextUsage: { used: number; limit: number; percentage: number } | null
  showModelSelect: boolean
  modelSelectIdx: number
  showMcpList: boolean
  mcpStatuses: MCPServerStatus[]
  showSkillsList: boolean
  skills: SkillInfo[]
  shellOutput: ShellOutputData | null
  connectStep: ConnectStep
  connectConfig: ConnectConfig
  connectSelectIdx: number
  unknownCmd: string | null
  showResumeList: boolean
  resumeList: Array<{ sessionId: string; messageCount: number; updatedAt: string }>
  resumeSelectIdx: number
  statusMsg: { text: string; color: string } | null
  pendingQuestion: QuestionPayload | null
}

function createState(): AppState {
  const allProviders = getProviderList()
  return {
    input: '',
    cursorIndex: 0,
    selectedIdx: 0,
    isRunning: false,
    error: null,
    events: [],
    todos: [],
    activeProvider: allProviders[0]?.[0] ?? '',
    contextUsage: null,
    showModelSelect: false,
    modelSelectIdx: 0,
    showMcpList: false,
    mcpStatuses: MCP_MANAGER?.getStatuses() ?? [],
    showSkillsList: false,
    skills: [],
    shellOutput: null,
    connectStep: null,
    connectConfig: {},
    connectSelectIdx: 0,
    unknownCmd: null,
    showResumeList: false,
    resumeList: [],
    resumeSelectIdx: 0,
    statusMsg: null,
    pendingQuestion: null,
  }
}

export function createApp(screen: blessed.Widgets.Screen, opts: { continueSessionId?: string }): () => void {
  const s = createState()
  const layout: LayoutRegion = calculateLayout(Number(screen.width), Number(screen.height))

  const streamManager = new AgentStreamManager(() => {
    s.events = streamManager.state.events
    s.isRunning = streamManager.state.isRunning
    s.error = streamManager.state.error
    s.pendingQuestion = streamManager.state.pendingQuestion
    update()
  })

  let agent: Agent | null = null

  const hasSidebar = layout.sidebarWidth > 0
  const contentW = hasSidebar ? `${Math.round(layout.contentWidth / layout.realColumns * 100)}%` : '100%'

  const contentArea = blessed.scrollabletext({
    parent: screen,
    top: 0,
    left: 0,
    width: contentW,
    height: '100%-2',
    scrollable: true,
    alwaysScroll: true,
    keys: true,
    tags: true,
  })

  const statusBar = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: contentW,
    height: 1,
    tags: true,
  })

  const inputBox = blessed.box({
    parent: screen,
    bottom: 1,
    left: 0,
    width: contentW,
    height: 1,
    tags: true,
  })

  let sidebarBox: blessed.Widgets.BoxElement | undefined

  if (hasSidebar) {
    const sepLeft = `${Math.round(layout.contentWidth / layout.realColumns * 100)}%`
    blessed.box({
      parent: screen,
      top: 0,
      left: sepLeft,
      width: 1,
      height: '100%',
      style: { bg: 'gray' },
    })

    sidebarBox = blessed.box({
      parent: screen,
      top: 0,
      left: `${Math.round((layout.contentWidth + 1) / layout.realColumns * 100)}%`,
      width: '100%',
      height: '100%',
      tags: true,
    })
  }

  const strWidth = blessed.unicode.strWidth.bind(blessed.unicode)

  function positionCursorForIme(): void {
    if (s.showModelSelect || s.showResumeList || s.connectStep) return
    const row = Number(screen.height) - 2
    const prefixWidth = 2
    const col = prefixWidth + strWidth(s.input.slice(0, s.cursorIndex))
    screen.program.flush()
    process.stdout.write(`\x1b[${row + 1};${col + 1}H`)
    screen.program.x = col
    screen.program.y = row
  }

  function update(): void {
    renderContentArea()
    renderInputLine()
    renderStatusBarLine()
    if (sidebarBox) renderSidebarBox()
    screen.render()
  }

  // 在 blessed draw() 完成后同步定位光标到输入框，
  // 避免 sc/rc 恢复到错误位置或 setImmediate 与高频 update() 竞态。
  screen.on('render', positionCursorForIme)

  function renderContentArea(): void {
    const maxTurns = Math.max(2, Math.floor((layout.realRows - 10) / 4))
    const titleLine = `{bold}mycode{/bold} {gray-fg}v${PKG_VERSION}{/gray-fg} {gray-fg}—{/gray-fg} {gray-fg}${s.activeProvider}{/gray-fg}`

    let content: string

    if (s.showMcpList) {
      content = renderMcpListPanel(s.mcpStatuses)
    } else if (s.showSkillsList) {
      content = renderSkillsListPanel(s.skills)
    } else if (s.shellOutput) {
      content = renderShellOutputPanel(s.shellOutput)
    } else if (s.connectStep) {
      content = renderConnectWizardPanel(s.connectStep, s.connectConfig, s.connectSelectIdx)
    } else if (s.unknownCmd) {
      content = renderUnknownCmdPanel(s.unknownCmd)
    } else if (s.showModelSelect) {
      content = renderModelSelectPanel(getProviderList(), s.modelSelectIdx)
    } else if (s.showResumeList) {
      content = renderResumeList(s.resumeList, s.resumeSelectIdx)
    } else if (s.pendingQuestion) {
      const questionContent = renderQuestionPanel(s.pendingQuestion)
      const eventContent = s.events.length > 0 ? renderEvents(s.events, s.isRunning, maxTurns) : ''
      content = eventContent ? `${eventContent}\n\n${questionContent}` : questionContent
    } else if (s.events.length === 0) {
      const skillCommands = s.skills.map(sk => ({ name: sk.name, desc: sk.description }))
      content = renderWelcomeHint(skillCommands)
    } else {
      content = renderEvents(s.events, s.isRunning, maxTurns)
    }

    if (s.statusMsg) {
      content += `\n${renderStatusMsg(s.statusMsg.text, s.statusMsg.color)}`
    }

    const cmdPart = s.input.includes(' ') ? s.input.slice(0, s.input.indexOf(' ')) : s.input
    const allCommands = buildAllCommands()
    const isExactCommand = allCommands.includes(s.input) || allCommands.includes(cmdPart)
    const matches = (s.input.startsWith('/') || cmdPart.startsWith('/')) && !isExactCommand
      ? allCommands.filter(c => c.startsWith(cmdPart))
      : []

    if (!s.showModelSelect && matches.length > 0) {
      content += `\n${renderAutoComplete(matches, s.selectedIdx)}`
    }

    contentArea.setContent(`${titleLine}\n${content}`)
    contentArea.setScrollPerc(100)
  }

  function renderInputLine(): void {
    if (s.isRunning) {
      inputBox.setContent(`{bold}{green-fg}>{/green-fg}{/bold} ${s.input}`)
    } else {
      const before = s.input.slice(0, s.cursorIndex)
      const cur = s.input[s.cursorIndex] ?? ' '
      const after = s.input.slice(s.cursorIndex + 1)
      inputBox.setContent(`{bold}{green-fg}>{/green-fg}{/bold} ${before}{inverse}{yellow-fg}${cur}{/yellow-fg}{/inverse}${after}`)
    }
  }

  function renderStatusBarLine(): void {
    statusBar.setContent(renderStatusBar({
      providerName: s.activeProvider,
      isRunning: s.isRunning,
      eventCount: s.events.length,
      error: s.error,
      contextUsage: s.contextUsage,
      fullWidth: layout.contentWidth,
    }))
  }

  function renderSidebarBox(): void {
    if (!sidebarBox) return
    sidebarBox.setContent('')
    sidebarBox.setContent(renderSidebar(s.todos, layout.sidebarWidth))
  }

  function clearInput(): void {
    s.input = ''
    s.cursorIndex = 0
    s.selectedIdx = 0
  }

  function buildAllCommands(): string[] {
    const staticCmds = COMMANDS as readonly string[]
    const skillCmds = s.skills.map(sk => `/${sk.name}`)
    const staticSet = new Set(staticCmds)
    return [...staticCmds, ...skillCmds.filter(cmd => !staticSet.has(cmd))]
  }

  const timers: ReturnType<typeof setInterval>[] = []

  timers.push(setInterval(() => {
    const sessionDir = agent?.getSessionDir()
    if (!sessionDir) {
      if (s.todos.length > 0) { s.todos = []; update() }
      return
    }
    try {
      const items = readTodos(sessionDir)
      const json = JSON.stringify(items)
      if (json !== JSON.stringify(s.todos)) {
        s.todos = items
        update()
      }
    } catch {
      // file not found — keep previous
    }
  }, 2000))

  if (MCP_MANAGER) {
    timers.push(setInterval(() => {
      const statuses = MCP_MANAGER.getStatuses()
      const json = JSON.stringify(statuses)
      if (json !== JSON.stringify(s.mcpStatuses)) {
        s.mcpStatuses = [...statuses]
        if (s.showMcpList) update()
      }
    }, 500))
  }

  timers.push(setInterval(() => {
    if (agent) {
      const usage = agent.getContextUsage()
      const json = JSON.stringify(usage)
      if (json !== JSON.stringify(s.contextUsage)) {
        s.contextUsage = usage
        update()
      }
    }
  }, 2000))

  // Scan skills + initial agent creation
  try {
    const { config } = readConfig()
    const extraPaths = config.skills?.paths ?? []
    const found = scanSkills({ projectRoot: process.cwd(), extraPaths })
    s.skills = found
    if (!opts.continueSessionId && !agent) {
      agent = createAgent(s.activeProvider, found)
    }
  } catch {
    s.skills = []
  }

  // Session restore
  if (opts.continueSessionId) {
    const sid = opts.continueSessionId
    SESSION_STORE.load(sid).then(msgs => {
      if (msgs && msgs.length > 0) {
        agent = createAgent(s.activeProvider, s.skills, sid)
        const historyEvents: ViewEvent[] = []
        for (const msg of msgs) {
          if (msg.role === 'user') {
            historyEvents.push({ type: 'user_message', content: msg.content })
          } else if (msg.role === 'assistant') {
            historyEvents.push({ type: 'answer_start', turnId: `history-${Date.now()}` })
            historyEvents.push({ type: 'answer_delta', turnId: `history-${Date.now()}`, delta: msg.content })
            historyEvents.push({ type: 'answer_end', turnId: `history-${Date.now()}`, fullText: msg.content })
          }
        }
        streamManager.addHistoryEvents(historyEvents)
      } else {
        s.unknownCmd = `会话 ${sid.slice(0, 8)}... 不存在或为空`
        update()
      }
    }).catch(() => {
      s.unknownCmd = `会话 ${sid.slice(0, 8)}... 加载失败`
      update()
    })
  }

  // Key handler
  screen.on('keypress', (_ch: string, key: { name: string; ctrl: boolean; shift: boolean; meta: boolean; sequence: string }) => {
    const ch = _ch
    const allProviders = getProviderList()

    // Model selection mode
    if (s.showModelSelect) {
      if (key.name === 'escape') { s.showModelSelect = false; update(); return }
      if (key.name === 'return' || key.name === 'enter') {
        const entry = allProviders[s.modelSelectIdx]
        if (entry) {
          s.activeProvider = entry[0]
          agent = createAgent(entry[0], s.skills)
        }
        s.showModelSelect = false
        update()
        return
      }
      if (key.name === 'down' || (key.name === 'tab' && !key.shift)) {
        s.modelSelectIdx = (s.modelSelectIdx + 1) % allProviders.length
        update()
        return
      }
      if (key.name === 'up' || (key.name === 'tab' && key.shift)) {
        s.modelSelectIdx = (s.modelSelectIdx - 1 + allProviders.length) % allProviders.length
        update()
        return
      }
      return
    }

    // Resume list mode
    if (s.showResumeList) {
      if (key.name === 'escape') { s.showResumeList = false; update(); return }
      if ((key.name === 'return' || key.name === 'enter') && s.resumeList.length > 0) {
        const selected = s.resumeList[s.resumeSelectIdx]
        if (selected) {
          streamManager.reset()
          agent = createAgent(s.activeProvider, s.skills, selected.sessionId)
          clearInput()
          s.showResumeList = false
          SESSION_STORE.load(selected.sessionId).then(msgs => {
            if (msgs && msgs.length > 0) {
              const historyEvents: ViewEvent[] = []
              for (const msg of msgs) {
                if (msg.role === 'user') {
                  historyEvents.push({ type: 'user_message', content: msg.content })
                } else if (msg.role === 'assistant') {
                  historyEvents.push({ type: 'answer_start', turnId: `history-${Date.now()}` })
                  historyEvents.push({ type: 'answer_delta', turnId: `history-${Date.now()}`, delta: msg.content })
                  historyEvents.push({ type: 'answer_end', turnId: `history-${Date.now()}`, fullText: msg.content })
                }
              }
              streamManager.addHistoryEvents(historyEvents)
            }
          })
          update()
        }
        return
      }
      if (key.name === 'down' || (key.name === 'tab' && !key.shift)) {
        s.resumeSelectIdx = (s.resumeSelectIdx + 1) % s.resumeList.length
        update()
        return
      }
      if (key.name === 'up' || (key.name === 'tab' && key.shift)) {
        s.resumeSelectIdx = (s.resumeSelectIdx - 1 + s.resumeList.length) % s.resumeList.length
        update()
        return
      }
      return
    }

    // Question answer mode
    if (s.pendingQuestion) {
      if (key.name === 'escape') {
        streamManager.answerQuestion([])
        clearInput()
        update()
        return
      }
      if ((key.name === 'return' || key.name === 'enter') && s.input.trim()) {
        const trimmed = s.input.trim()
        if (s.pendingQuestion.options && s.pendingQuestion.options.length > 0) {
          const idx = parseInt(trimmed, 10) - 1
          if (idx >= 0 && idx < s.pendingQuestion.options.length) {
            streamManager.answerQuestion([s.pendingQuestion.options[idx]!.label])
            clearInput()
          }
          update()
          return
        }
        streamManager.answerQuestion([trimmed])
        clearInput()
        update()
        return
      }
      if (key.name === 'backspace') {
        s.input = s.input.slice(0, s.cursorIndex - 1) + s.input.slice(s.cursorIndex)
        s.cursorIndex = Math.max(0, s.cursorIndex - 1)
        update()
        return
      }
      if (key.name === 'left') { s.cursorIndex = Math.max(0, s.cursorIndex - 1); update(); return }
      if (key.name === 'right') { s.cursorIndex = Math.min(s.input.length, s.cursorIndex + 1); update(); return }
      if (ch && !key.ctrl && !key.meta) {
        s.input = s.input.slice(0, s.cursorIndex) + ch + s.input.slice(s.cursorIndex)
        s.cursorIndex += ch.length
        s.selectedIdx = 0
        update()
      }
      return
    }

    // Connect wizard
    if (s.connectStep) {
      if (s.connectStep === 'done') {
        s.connectStep = null
        s.connectConfig = {}
        clearInput()
        update()
        return
      }
      if (key.name === 'escape') {
        s.connectStep = null
        s.connectConfig = {}
        clearInput()
        update()
        return
      }
      if (s.connectStep === 'format') {
        if (key.name === 'down' || (key.name === 'tab' && !key.shift)) {
          s.connectSelectIdx = (s.connectSelectIdx + 1) % 2
          update()
          return
        }
        if (key.name === 'up' || (key.name === 'tab' && key.shift)) {
          s.connectSelectIdx = (s.connectSelectIdx - 1 + 2) % 2
          update()
          return
        }
        if (key.name === 'return' || key.name === 'enter') {
          s.connectConfig.format = s.connectSelectIdx === 0 ? 'openai' : 'anthropic'
          s.connectStep = 'url'
          s.connectSelectIdx = 0
          clearInput()
          update()
          return
        }
        return
      }
      if ((key.name === 'return' || key.name === 'enter') && s.input.trim()) {
        const trimmed = s.input.trim()
        if (s.connectStep === 'url') {
          s.connectConfig.baseUrl = trimmed
          s.connectStep = 'model'
          clearInput()
          update()
          return
        }
        if (s.connectStep === 'model') {
          s.connectConfig.model = trimmed
          s.connectStep = 'apikey'
          clearInput()
          update()
          return
        }
        if (s.connectStep === 'apikey') {
          s.connectConfig.apiKey = trimmed
          s.connectStep = 'name'
          clearInput()
          update()
          return
        }
        if (s.connectStep === 'name') {
          try {
            addProvider({
              name: trimmed,
              format: s.connectConfig.format!,
              baseUrl: s.connectConfig.baseUrl!,
              apiKey: s.connectConfig.apiKey!,
              model: s.connectConfig.model!,
              setDefault: true,
            })
            s.connectConfig.providerName = trimmed
            s.activeProvider = trimmed
            agent = createAgent(trimmed, s.skills)
            s.connectStep = 'done'
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            s.connectConfig.providerName = `错误: ${msg}`
            s.connectStep = 'done'
          }
          clearInput()
          update()
          return
        }
        return
      }
      if (key.name === 'backspace') {
        s.input = s.input.slice(0, s.cursorIndex - 1) + s.input.slice(s.cursorIndex)
        s.cursorIndex = Math.max(0, s.cursorIndex - 1)
        update()
        return
      }
      if (key.name === 'left') { s.cursorIndex = Math.max(0, s.cursorIndex - 1); update(); return }
      if (key.name === 'right') { s.cursorIndex = Math.min(s.input.length, s.cursorIndex + 1); update(); return }
      if (ch && !key.ctrl && !key.meta) {
        s.input = s.input.slice(0, s.cursorIndex) + ch + s.input.slice(s.cursorIndex)
        s.cursorIndex += ch.length
        update()
      }
      return
    }

    // Dismiss overlays
    if (s.unknownCmd) { s.unknownCmd = null; update(); return }
    if (s.showMcpList || s.showSkillsList) {
      if (key.name === 'escape') { s.showMcpList = false; s.showSkillsList = false; update() }
      return
    }
    if (s.shellOutput) {
      if (key.name === 'escape' || key.name === 'return' || key.name === 'enter') { s.shellOutput = null; update() }
      return
    }

    // Escape in normal mode
    if (key.name === 'escape') {
      const cmdPart = s.input.includes(' ') ? s.input.slice(0, s.input.indexOf(' ')) : s.input
      const allCommands = buildAllCommands()
      const matches = s.input.startsWith('/') || cmdPart.startsWith('/')
        ? allCommands.filter(c => c.startsWith(cmdPart))
        : []
      if (s.input.startsWith('/') && matches.length > 0) {
        clearInput()
        update()
        return
      }
      streamManager.reset()
      clearInput()
      agent = null
      s.activeProvider = getProviderList()[0]?.[0] ?? ''
      update()
      return
    }

    // Enter: submit
    if ((key.name === 'return' || key.name === 'enter') && s.input.trim()) {
      handleSubmit()
      return
    }

    // Tab / arrow autocomplete
    const cmdPart2 = s.input.includes(' ') ? s.input.slice(0, s.input.indexOf(' ')) : s.input
    const allCommands2 = buildAllCommands()
    const isExact = allCommands2.includes(s.input) || allCommands2.includes(cmdPart2)
    const matches2 = (s.input.startsWith('/') || cmdPart2.startsWith('/')) && !isExact
      ? allCommands2.filter(c => c.startsWith(cmdPart2))
      : []

    if (key.name === 'down' || (key.name === 'tab' && !key.shift)) {
      if (matches2.length > 0) { s.selectedIdx = (s.selectedIdx + 1) % matches2.length; update() }
      return
    }
    if (key.name === 'up' || (key.name === 'tab' && key.shift)) {
      if (matches2.length > 0) { s.selectedIdx = (s.selectedIdx - 1 + matches2.length) % matches2.length; update() }
      return
    }

    // Navigation
    if (key.name === 'left') { s.cursorIndex = Math.max(0, s.cursorIndex - 1); update(); return }
    if (key.name === 'right') { s.cursorIndex = Math.min(s.input.length, s.cursorIndex + 1); update(); return }
    if (key.name === 'home') { s.cursorIndex = 0; update(); return }
    if (key.name === 'end') { s.cursorIndex = s.input.length; update(); return }
    if (key.name === 'backspace') {
      s.input = s.input.slice(0, s.cursorIndex - 1) + s.input.slice(s.cursorIndex)
      s.cursorIndex = Math.max(0, s.cursorIndex - 1)
      s.selectedIdx = 0
      update()
      return
    }
    if (key.name === 'delete') {
      s.input = s.input.slice(0, s.cursorIndex) + s.input.slice(s.cursorIndex + 1)
      update()
      return
    }

    // Regular character
    if (ch && !key.ctrl && !key.meta) {
      s.input = s.input.slice(0, s.cursorIndex) + ch + s.input.slice(s.cursorIndex)
      s.cursorIndex += ch.length
      s.selectedIdx = 0
      update()
    }
  })

  function handleSubmit(): void {
    let submitInput = s.input.trim()

    const cmdPart = submitInput.includes(' ') ? submitInput.slice(0, submitInput.indexOf(' ')) : submitInput
    const allCommands = buildAllCommands()
    const isExact = allCommands.includes(submitInput) || allCommands.includes(cmdPart)
    const matches = (submitInput.startsWith('/') || cmdPart.startsWith('/')) && !isExact
      ? allCommands.filter(c => c.startsWith(cmdPart))
      : []

    if (matches.length > 0 && s.selectedIdx < matches.length) {
      const selected = matches[s.selectedIdx]
      if (selected) submitInput = selected
    }

    // Shell command
    if (submitInput.startsWith('!') && submitInput.length > 1) {
      const cmd = submitInput.slice(1).trim()
      if (cmd) {
        try {
          const stdout = execSync(cmd, { timeout: 30_000, maxBuffer: 5 * 1024 * 1024, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })
          s.shellOutput = { command: cmd, stdout: stdout.trim(), stderr: '', exitCode: 0 }
        } catch (err: unknown) {
          const e = err as { stdout?: string; stderr?: string; status?: number }
          s.shellOutput = { command: cmd, stdout: (e.stdout ?? '').toString().trim(), stderr: (e.stderr ?? '').toString().trim(), exitCode: e.status ?? 1 }
        }
      }
      clearInput()
      update()
      return
    }

    // Exit
    if (submitInput === '/exit' || submitInput === '/q') {
      const sessionId = agent?.getSessionId()
      screen.destroy()
      if (sessionId) {
        process.stdout.write(`\n恢复会话：mycode -c ${sessionId}\n`)
      }
      process.exit(0)
      return
    }

    if (submitInput === '/new') {
      streamManager.reset()
      agent = null
      clearInput()
      update()
      return
    }

    if (submitInput === '/compact') {
      if (agent) {
        agent.compactMessages().then(result => {
          if (result) {
            const tokensSaved = result.beforeTokens - result.afterTokens
            const tokensInfo = tokensSaved > 0 ? `，节省 ${tokensSaved < 1000 ? `${tokensSaved}` : `${(tokensSaved / 1000).toFixed(1)}K`} tokens` : ''
            const msg = `压缩完成：${result.before} → ${result.after} 条消息${tokensInfo}` +
              (result.prunedToolResults ? `，裁剪了 ${result.prunedToolResults} 个工具结果` : '')
            s.statusMsg = { text: msg, color: 'green' }
          } else {
            s.statusMsg = { text: '上下文无需压缩', color: 'yellow' }
          }
          s.contextUsage = agent!.getContextUsage()
          update()
        })
      } else {
        s.statusMsg = { text: '没有活跃的 Agent 会话', color: 'yellow' }
      }
      clearInput()
      update()
      return
    }

    if (submitInput === '/resume') {
      SESSION_STORE.list().then(list => {
        s.resumeList = list
        s.showResumeList = true
        s.resumeSelectIdx = 0
        update()
      })
      clearInput()
      return
    }

    if (submitInput === '/models') {
      s.showModelSelect = true
      s.modelSelectIdx = 0
      clearInput()
      update()
      return
    }

    if (submitInput === '/mcps') {
      s.showMcpList = true
      clearInput()
      update()
      return
    }

    if (submitInput === '/skills') {
      s.showSkillsList = true
      clearInput()
      update()
      return
    }

    if (submitInput === '/connect') {
      s.connectStep = 'format'
      s.connectConfig = {}
      s.connectSelectIdx = 0
      clearInput()
      update()
      return
    }

    if (submitInput.startsWith('/remember ')) {
      const content = submitInput.slice('/remember '.length).trim()
      if (!content) { clearInput(); update(); return }
      const sessionDir = agent?.getSessionDir()
      if (!sessionDir) {
        s.statusMsg = { text: '请先开始一次对话再使用 /remember', color: 'yellow' }
        clearInput()
        update()
        return
      }
      const store = new FileMemoryStore(sessionDir)
      const result = store.add({ type: 'fact', content, tags: [] })
      s.statusMsg = result.error
        ? { text: `记忆存储失败: ${result.error}`, color: 'red' }
        : { text: `已记住: ${content.slice(0, 60)}`, color: 'green' }
      clearInput()
      update()
      return
    }

    if (submitInput === '/forget') {
      const sessionDir = agent?.getSessionDir()
      if (!sessionDir) {
        s.statusMsg = { text: '请先开始一次对话再使用 /forget', color: 'yellow' }
        clearInput()
        update()
        return
      }
      const store = new FileMemoryStore(sessionDir)
      const entries = store.list()
      if (entries.length === 0) {
        s.statusMsg = { text: '暂无记忆可删除', color: 'yellow' }
      } else {
        const summary = entries.slice(0, 20).map((e, i) => `${i + 1}. [${e.id.slice(0, 8)}] [${e.type}] ${e.content.slice(0, 60)}`).join('\n')
        s.unknownCmd = `记忆列表（输入 /forget <id> 删除）：\n${summary}`
      }
      clearInput()
      update()
      return
    }

    if (submitInput.startsWith('/forget ')) {
      const idPart = submitInput.slice('/forget '.length).trim()
      if (idPart) {
        const sessionDir = agent?.getSessionDir()
        if (!sessionDir) {
          s.statusMsg = { text: '请先开始一次对话再使用 /forget', color: 'yellow' }
          clearInput()
          update()
          return
        }
        const store = new FileMemoryStore(sessionDir)
        const result = store.delete(idPart)
        s.statusMsg = result.found
          ? { text: `已删除记忆: ${idPart.slice(0, 8)}...`, color: 'green' }
          : { text: `未找到记忆: ${idPart.slice(0, 8)}...`, color: 'red' }
      }
      clearInput()
      update()
      return
    }

    if (submitInput === '/memory') {
      const sessionDir = agent?.getSessionDir()
      if (!sessionDir) {
        s.statusMsg = { text: '请先开始一次对话再使用 /memory', color: 'yellow' }
        clearInput()
        update()
        return
      }
      const store = new FileMemoryStore(sessionDir)
      const entries = store.list()
      const lines: string[] = []
      if (entries.length > 0) {
        lines.push(`--- 当前会话记忆 (${entries.length} 条) ---`)
        entries.slice(0, 10).forEach((e, i) => {
          lines.push(`${i + 1}. [${e.type}] ${e.content.slice(0, 80)}`)
        })
      }
      if (lines.length === 0) {
        s.statusMsg = { text: '暂无记忆。使用 /remember <内容> 存入。', color: 'yellow' }
      } else {
        lines.push('')
        lines.push('使用 /remember <内容> 存入会话记忆，/rule <内容> 存入项目规则')
        s.unknownCmd = lines.join('\n')
      }
      clearInput()
      update()
      return
    }

    if (submitInput.startsWith('/rule ')) {
      const content = submitInput.slice('/rule '.length).trim()
      if (content) {
        const result = appendRule('project', process.cwd(), { type: 'convention', content })
        s.statusMsg = result.error
          ? { text: `规则存储失败: ${result.error}`, color: 'red' }
          : { text: `已存入项目规则: ${content.slice(0, 60)}`, color: 'green' }
      }
      clearInput()
      update()
      return
    }

    if (submitInput === '/init') {
      if (!s.activeProvider) {
        s.statusMsg = { text: '请先配置 LLM Provider', color: 'yellow' }
        clearInput()
        update()
        return
      }
      const initPrompt = `分析当前代码库，生成或增量更新项目根目录的 AGENTS.md 文件。

AGENTS.md 是给 AI 编码助手的项目规则文件，每次会话启动时自动注入。它应该简洁（200 行以内），只包含 AI 无法自行推断的项目特有信息。

需要覆盖的章节：
1. 项目指南 — 项目类型、技术栈、monorepo 结构、默认分支等
2. 常用命令 — 构建、测试、lint、开发模式等（给出具体命令，用表格展示）
3. 风格指南 — 代码风格约定（只写与语言默认不同的部分，给出正确和错误示例）
4. 目录结构 — 简要的目录说明（仅列出核心目录和每个目录的职责）

排除的内容：
- 依赖列表（AI 可以自己读 package.json）
- 语言标准约定（AI 已知的标准实践）
- 显而易见的配置

分析数据源：根目录和各包的 package.json、tsconfig.json、lint/format 配置文件（如 biome.json、.eslintrc）、README.md、已有的 AGENTS.md。如果有其他 AI 工具的规则文件（如 .cursorrules、.cursor/rules/、CLAUDE.md），也整合进来。

如果 AGENTS.md 已存在，阅读现有内容，保留所有人工编写的自定义规则，只补充缺失或修正过时的内容。不要删除任何现有章节。

完成后使用 write 工具将内容写入项目根目录的 AGENTS.md。`

      if (!agent) {
        agent = createAgent(s.activeProvider, s.skills)
      }
      streamManager.addUserMessage('/init')
      clearInput()
      streamManager.run(initPrompt, agent)
      return
    }

    // Skill command
    const spaceIdx = submitInput.indexOf(' ')
    const skillToken = spaceIdx >= 0 ? submitInput.slice(0, spaceIdx) : submitInput
    const skillArgs = spaceIdx >= 0 ? submitInput.slice(spaceIdx + 1).trim() : ''
    const matchedSkill = submitInput.startsWith('/')
      ? s.skills.find(sk => `/${sk.name}` === skillToken)
      : undefined
    if (matchedSkill) {
      streamManager.reset()
      agent = createAgent(s.activeProvider, s.skills)
      const skillDescription = `请使用 ${matchedSkill.name} 技能来帮助我。\n\n技能说明：${matchedSkill.description}`
      const userMsg = skillArgs ? `${skillDescription}\n\n用户要求：${skillArgs}` : skillDescription
      streamManager.addUserMessage(userMsg)
      clearInput()
      streamManager.run(userMsg, agent)
      return
    }

    // Unknown command
    if (submitInput.startsWith('/')) {
      s.unknownCmd = submitInput
      clearInput()
      update()
      return
    }

    // Normal message to agent
    if (!agent) {
      agent = createAgent(s.activeProvider, s.skills)
    }
    streamManager.addUserMessage(submitInput)
    clearInput()
    streamManager.run(submitInput, agent)
  }

  const cleanup = () => {
    for (const t of timers) clearInterval(t)
    streamManager.reset()
  }

  update()

  return cleanup
}
