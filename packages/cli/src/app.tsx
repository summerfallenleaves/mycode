/**
 * @fileoverview Root Ink App component: WelcomeHint, input handling (useInput), command system (/exit, /new, /models, /mcps, /skills), orchestrates useAgentStream with config from .mycode/mycode.jsonc
 * @module @my-agent/cli/src/app
 */
import { Box, Text, useInput, useStderr } from 'ink'
import { useRef, useState, useMemo, useCallback, useEffect } from 'react'
import type { JSX } from 'react'
import { execSync } from 'node:child_process'
import { Agent, createAdapter, ToolRegistry, readConfig, readFileTool, editTool, writeTool, bashTool, grepTool, globTool, questionTool, todowriteTool, MCPClientManager, scanSkills, addProvider, FileSessionStore } from '@my-agent/core'
import type { LLMProviderConfig, MCPServerStatus, SkillInfo } from '@my-agent/core'
import { useAgentStream } from './hooks/use-agent-stream.js'
import type { ViewEvent } from './hooks/use-agent-stream.js'
import { StatusBar } from './components/status-bar.js'
import { ShellOutputPanel } from './components/shell-output-panel.js'
import type { ShellOutputData } from './components/shell-output-panel.js'
import { ConnectWizardPanel } from './components/connect-wizard-panel.js'
import type { ConnectStep, ConnectConfig } from './components/connect-wizard-panel.js'
import { McpListPanel } from './components/mcp-list-panel.js'
import { SkillsListPanel } from './components/skills-list-panel.js'
import { ModelSelectPanel } from './components/model-select-panel.js'
import { QuestionPanel } from './components/question-panel.js'
import { UnknownCmdPanel } from './components/unknown-cmd-panel.js'
import { EventStream } from './components/event-stream.js'

const COMMANDS = ['/connect', '/exit', '/mcps', '/models', '/new', '/q', '/resume', '/skills'] as const
const PKG_VERSION = '0.0.1'

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
    llm: createAdapter({
      format: provider.format,
      baseUrl: provider.baseUrl,
      apiKey,
      model: provider.model,
    }),
    tools: SHARED_TOOLS,
    systemPrompt: config.agent.systemPrompt,
    maxSteps: config.agent.maxSteps,
    sessionTimeoutMs: config.agent.sessionTimeoutMs,
    maxContextTokens: config.agent.maxContextTokens,
    skillsConfig: config.skills,
    skills: preScannedSkills,
    projectRoot: process.cwd(),
    sessionStore: SESSION_STORE,
    resumeSessionId,
  })
}

const COMMAND_HELP: Record<string, string> = {
  '/connect': '连接新模型',
  '/exit': '退出',
  '/mcps': 'MCP 服务器状态',
  '/models': '切换模型',
  '/new': '开始新对话',
  '/q': '退出（快捷）',
  '/resume': '恢复历史会话',
  '/skills': '查看可用技能',
}

function WelcomeHint({ skillCommands }: { skillCommands: Array<{ name: string; desc: string }> }): JSX.Element {
  return (
    <Box flexDirection="column" paddingY={1}>
      <Text>Welcome to mycode — AI Coding Agent</Text>
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>常用命令：</Text>
        {COMMANDS.filter(c => c !== '/q').map(cmd => (
          <Box key={cmd}>
            <Text dimColor>{'  '}{cmd}{'  '}{COMMAND_HELP[cmd]}</Text>
          </Box>
        ))}
        <Text dimColor>{'  '}!{'<命令>'}{'  '}执行 shell 命令</Text>
      </Box>
      {skillCommands.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>技能命令：</Text>
          {skillCommands.map(s => (
            <Box key={s.name}>
              <Text dimColor>{'  '}/<Text bold>{s.name}</Text>{'  '}{s.desc}</Text>
            </Box>
          ))}
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor>直接输入问题开始对话，输入 / 查看所有命令</Text>
      </Box>
    </Box>
  )
}

interface AppProps {
  continueSessionId?: string
}

export default function App({ continueSessionId }: AppProps): JSX.Element {
  const [input, setInput] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [showModelSelect, setShowModelSelect] = useState(false)
  const [modelSelectIdx, setModelSelectIdx] = useState(0)
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null)
  const [showMcpList, setShowMcpList] = useState(false)
  const [mcpStatuses, setMcpStatuses] = useState<MCPServerStatus[]>(
    () => MCP_MANAGER?.getStatuses() ?? [],
  )
  const [showSkillsList, setShowSkillsList] = useState(false)
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [shellOutput, setShellOutput] = useState<ShellOutputData | null>(null)
  const [connectStep, setConnectStep] = useState<ConnectStep>(null)
  const [connectConfig, setConnectConfig] = useState<ConnectConfig>({})
  const [connectSelectIdx, setConnectSelectIdx] = useState(0)
  const [unknownCmd, setUnknownCmd] = useState<string | null>(null)
  const [contextUsage, setContextUsage] = useState<{ used: number; limit: number; percentage: number } | null>(null)
  const [showResumeList, setShowResumeList] = useState(false)
  const [resumeList, setResumeList] = useState<Array<{ sessionId: string; messageCount: number; updatedAt: string }>>([])
  const [resumeSelectIdx, setResumeSelectIdx] = useState(0)
  const { events, isRunning, error, run, reset, addUserMessage, addHistoryEvents, pendingQuestion, answerQuestion } = useAgentStream()
  const agentRef = useRef<Agent | null>(null)
  const { stderr } = useStderr()
  const sessionRestoredRef = useRef(false)
  const skillsRef = useRef(skills)
  useEffect(() => { skillsRef.current = skills }, [skills])

  const allProviders = useMemo(() => getProviderList(), [])
  const activeProvider = selectedProvider ?? allProviders[0]?.[0] ?? ''

  // Poll MCP status for live UI updates (connections started at module level)
  useEffect(() => {
    if (!MCP_MANAGER) return
    const poll = setInterval(() => {
      setMcpStatuses([...MCP_MANAGER.getStatuses()])
    }, 500)
    return () => clearInterval(poll)
  }, [])

  // Poll context usage from active agent for UI display
  useEffect(() => {
    const poll = setInterval(() => {
      const agent = agentRef.current
      if (agent) {
        setContextUsage(agent.getContextUsage())
      }
    }, 2000)
    return () => clearInterval(poll)
  }, [])

  // Scan skills on mount
  useEffect(() => {
    try {
      const { config } = readConfig()
      const extraPaths = config.skills?.paths ?? []
      const found = scanSkills({ projectRoot: process.cwd(), extraPaths })
      setSkills(found)
      // Pre-create agent so /exit always has a session ID
      if (!continueSessionId && !agentRef.current) {
        agentRef.current = createAgent(activeProvider, found)
      }
    } catch {
      setSkills([])
    }
  }, [])

  useEffect(() => {
    if (!continueSessionId) return
    if (sessionRestoredRef.current) return
    sessionRestoredRef.current = true

    SESSION_STORE.load(continueSessionId).then(msgs => {
      if (msgs && msgs.length > 0) {
        const agent = createAgent(activeProvider, skillsRef.current, continueSessionId)
        agentRef.current = agent
        
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
        addHistoryEvents(historyEvents)
      } else {
        setUnknownCmd(`会话 ${continueSessionId.slice(0, 8)}... 不存在或为空`)
      }
    }).catch(() => {
      setUnknownCmd(`会话 ${continueSessionId.slice(0, 8)}... 加载失败`)
    })
  }, [continueSessionId, activeProvider])

  // Build dynamic command set: static commands + skill-derived commands
  const allCommands = useMemo(() => {
    const staticCmds = COMMANDS as readonly string[]
    const skillCmds = skills.map(s => `/${s.name}`)
    // Deduplicate: if a skill name collides with a static command, static wins
    const staticSet = new Set(staticCmds)
    return [...staticCmds, ...skillCmds.filter(cmd => !staticSet.has(cmd))]
  }, [skills])

  // Extract the first token of input for auto-complete matching, so "/skill-cr some text" still shows "/skill-creator" as a match
  const cmdPart = input.includes(' ') ? input.slice(0, input.indexOf(' ')) : input
  const isExactCommand = allCommands.includes(input) || allCommands.includes(cmdPart)
  const matches = (input.startsWith('/') || cmdPart.startsWith('/')) && !isExactCommand
    ? allCommands.filter(c => c.startsWith(cmdPart))
    : []

  const handleModelSelect = useCallback((name: string) => {
    setSelectedProvider(name)
    agentRef.current = createAgent(name, skills)
    setShowModelSelect(false)
  }, [skills])

  useInput((_input, key) => {
    // Model selection mode
    if (showModelSelect) {
      if (key.escape) {
        setShowModelSelect(false)
        return
      }
      if (key.return) {
        const entry = allProviders[modelSelectIdx]
        if (entry) handleModelSelect(entry[0])
        return
      }
      if ((key.tab && !key.shift) || key.downArrow) {
        setModelSelectIdx(prev => (prev + 1) % allProviders.length)
        return
      }
      if ((key.shift && key.tab) || key.upArrow) {
        setModelSelectIdx(prev => (prev - 1 + allProviders.length) % allProviders.length)
        return
      }
      return
    }

    if (showResumeList) {
      if (key.escape) {
        setShowResumeList(false)
        return
      }
      if (key.return && resumeList.length > 0) {
        const selected = resumeList[resumeSelectIdx]
        if (selected) {
          reset()
          const agent = createAgent(activeProvider, skills, selected.sessionId)
          agentRef.current = agent
          setShowResumeList(false)
          setInput('')
        }
        return
      }
      if ((key.tab && !key.shift) || key.downArrow) {
        setResumeSelectIdx(prev => (prev + 1) % resumeList.length)
        return
      }
      if ((key.shift && key.tab) || key.upArrow) {
        setResumeSelectIdx(prev => (prev - 1 + resumeList.length) % resumeList.length)
        return
      }
      return
    }

    // Question answer mode
    if (pendingQuestion) {
      if (key.escape) {
        answerQuestion([])
        setInput('')
        return
      }
      if (key.return && input.trim()) {
        const trimmed = input.trim()
        if (pendingQuestion.options && pendingQuestion.options.length > 0) {
          const idx = parseInt(trimmed, 10) - 1
          if (idx >= 0 && idx < pendingQuestion.options.length) {
            answerQuestion([pendingQuestion.options[idx]!.label])
            setInput('')
          }
          return
        }
        answerQuestion([trimmed])
        setInput('')
        return
      }
      if (key.backspace) {
        setInput(prev => prev.slice(0, -1))
        return
      }
      setInput(prev => prev + _input)
      setSelectedIdx(0)
      return
    }

    if (connectStep) {
      if (connectStep === 'done') {
        setConnectStep(null)
        setConnectConfig({})
        setInput('')
        return
      }
      if (key.escape) {
        setConnectStep(null)
        setConnectConfig({})
        setInput('')
        return
      }
      if (connectStep === 'format') {
        if ((key.tab && !key.shift) || key.downArrow) {
          setConnectSelectIdx(prev => (prev + 1) % 2)
          return
        }
        if ((key.shift && key.tab) || key.upArrow) {
          setConnectSelectIdx(prev => (prev - 1 + 2) % 2)
          return
        }
        if (key.return) {
          const format = connectSelectIdx === 0 ? 'openai' : 'anthropic'
          setConnectConfig(prev => ({ ...prev, format }))
          setConnectStep('url')
          setConnectSelectIdx(0)
          setInput('')
          return
        }
        return
      }
      if (key.return && input.trim()) {
        const trimmed = input.trim()
        if (connectStep === 'url') {
          setConnectConfig(prev => ({ ...prev, baseUrl: trimmed }))
          setConnectStep('model')
          setInput('')
          return
        }
        if (connectStep === 'model') {
          setConnectConfig(prev => ({ ...prev, model: trimmed }))
          setConnectStep('apikey')
          setInput('')
          return
        }
        if (connectStep === 'apikey') {
          setConnectConfig(prev => ({ ...prev, apiKey: trimmed }))
          setConnectStep('name')
          setInput('')
          return
        }
        if (connectStep === 'name') {
          try {
            addProvider({
              name: trimmed,
              format: connectConfig.format!,
              baseUrl: connectConfig.baseUrl!,
              apiKey: connectConfig.apiKey!,
              model: connectConfig.model!,
              setDefault: true,
            })
            setConnectConfig(prev => ({ ...prev, providerName: trimmed }))
            setSelectedProvider(trimmed)
            agentRef.current = createAgent(trimmed, skills)
            setConnectStep('done')
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            setConnectConfig(prev => ({ ...prev, providerName: `错误: ${msg}` }))
            setConnectStep('done')
          }
          setInput('')
          return
        }
        return
      }
      if (key.backspace) {
        setInput(prev => prev.slice(0, -1))
        return
      }
      setInput(prev => prev + _input)
      return
    }

    // Normal mode
    if (unknownCmd) {
      setUnknownCmd(null)
      return
    }
    if (showMcpList || showSkillsList) {
      if (key.escape) { setShowMcpList(false); setShowSkillsList(false) }
      return
    }
    if (shellOutput) {
      if (key.escape || key.return) { setShellOutput(null) }
      return
    }
    if (key.escape) {
      if (input.startsWith('/') && matches.length > 0) {
        setInput('')
        return
      }
      reset()
      setInput('')
      agentRef.current = null
      setSelectedProvider(null)
      return
    }
    if (key.return && input.trim()) {
      let submitInput = input.trim()
      if (matches.length > 0) {
        const selected = matches[selectedIdx]
        if (selected) {
          submitInput = selected
        }
      }
      const trimmed = submitInput
      if (trimmed.startsWith('!') && trimmed.length > 1) {
        const cmd = trimmed.slice(1).trim()
        if (cmd) {
          try {
            const stdout = execSync(cmd, {
              timeout: 30_000,
              maxBuffer: 5 * 1024 * 1024,
              encoding: 'utf-8',
              stdio: ['pipe', 'pipe', 'pipe'],
            })
            setShellOutput({ command: cmd, stdout: stdout.trim(), stderr: '', exitCode: 0 })
          } catch (err: unknown) {
            const e = err as { stdout?: string; stderr?: string; status?: number }
            setShellOutput({
              command: cmd,
              stdout: (e.stdout ?? '').toString().trim(),
              stderr: (e.stderr ?? '').toString().trim(),
              exitCode: e.status ?? 1,
            })
          }
        }
        setInput('')
        return
      }
      if (trimmed === '/exit' || trimmed === '/q') {
        const sessionId = agentRef.current?.getSessionId()
        if (sessionId) {
          stderr.write(`\n恢复会话：mycode -c ${sessionId}\n`)
        }
        process.exit(0)
        return
      }
      if (trimmed === '/new') {
        reset()
        agentRef.current = null
        setInput('')
        return
      }
      if (trimmed === '/resume') {
        SESSION_STORE.list().then(list => {
          setResumeList(list)
          setShowResumeList(true)
          setResumeSelectIdx(0)
        })
        setInput('')
        return
      }
      if (trimmed === '/models') {
        setShowModelSelect(true)
        setModelSelectIdx(0)
        setInput('')
        return
      }
      if (trimmed === '/mcps') {
        setShowMcpList(true)
        setInput('')
        return
      }
      if (trimmed === '/skills') {
        setShowSkillsList(true)
        setInput('')
        return
      }
      if (trimmed === '/connect') {
        setConnectStep('format')
        setConnectConfig({})
        setConnectSelectIdx(0)
        setInput('')
        return
      }
      // Check if input matches a skill command (/skill-name)
      // Split at first space so "/skill-name do something" matches skill "skill-name" with args "do something"
      const spaceIdx = trimmed.indexOf(' ')
      const skillToken = spaceIdx >= 0 ? trimmed.slice(0, spaceIdx) : trimmed
      const skillArgs = spaceIdx >= 0 ? trimmed.slice(spaceIdx + 1).trim() : ''
      const matchedSkill = trimmed.startsWith('/')
        ? skills.find(s => `/${s.name}` === skillToken)
        : undefined
      if (matchedSkill) {
        reset()
        const agent = createAgent(activeProvider, skills)
        agentRef.current = agent
        const skillDescription = `请使用 ${matchedSkill.name} 技能来帮助我。\n\n技能说明：${matchedSkill.description}`
        const userMsg = skillArgs
          ? `${skillDescription}\n\n用户要求：${skillArgs}`
          : skillDescription
        addUserMessage(userMsg)
        run(userMsg, agent)
        setInput('')
        return
      }
      if (trimmed.startsWith('/')) {
        setUnknownCmd(trimmed)
        setInput('')
        return
      }
      if (!agentRef.current) {
        agentRef.current = createAgent(activeProvider, skills)
      }
      addUserMessage(input.trim())
      run(input.trim(), agentRef.current)
      setInput('')
      return
    }
    if ((key.tab && !key.shift) || key.downArrow) {
      if (matches.length > 0) {
        setSelectedIdx(prev => (prev + 1) % matches.length)
      }
      return
    }
    if ((key.shift && key.tab) || key.upArrow) {
      if (matches.length > 0) {
        setSelectedIdx(prev => (prev - 1 + matches.length) % matches.length)
      }
      return
    }
    if (key.backspace) {
      setInput(prev => prev.slice(0, -1))
      return
    }
    setInput(prev => prev + _input)
    setSelectedIdx(0)
  })

  return (
    <Box flexDirection="column" height="100%" padding={1}>
      <Box marginBottom={1}>
        <Text bold>mycode</Text>
        <Text dimColor> v{PKG_VERSION}</Text>
        <Text dimColor> — {activeProvider}</Text>
      </Box>

      <Box flexDirection="column" flexGrow={1}>
        {showMcpList ? <McpListPanel statuses={mcpStatuses} />
        : showSkillsList ? <SkillsListPanel skills={skills} />
        : shellOutput ? <ShellOutputPanel data={shellOutput} />
        : connectStep ? <ConnectWizardPanel step={connectStep} config={connectConfig} selectIdx={connectSelectIdx} />
        : unknownCmd ? <UnknownCmdPanel cmd={unknownCmd} />
        : showModelSelect ? <ModelSelectPanel providers={allProviders} selectIdx={modelSelectIdx} />
        : showResumeList ? (
          <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1}>
            <Text bold>历史会话 (Enter 恢复, Esc 取消)</Text>
            {resumeList.length === 0 ? (
              <Text dimColor>暂无历史会话</Text>
            ) : (
              resumeList.map((s, i) => (
                <Text key={s.sessionId} inverse={i === resumeSelectIdx} color={i === resumeSelectIdx ? 'cyan' : undefined}>
                  {` ${i + 1}. ${s.sessionId.slice(0, 8)}... (${s.messageCount} 条消息)`}
                </Text>
              ))
            )}
          </Box>
        )
        : pendingQuestion ? <QuestionPanel question={pendingQuestion} />
        : events.length === 0 ? <WelcomeHint skillCommands={skills.map(s => ({ name: s.name, desc: s.description }))} />
        : <EventStream events={events} isRunning={isRunning} />}
      </Box>

      {!showModelSelect && matches.length > 0 && (
        <Box flexDirection="column" borderStyle="round" borderColor="gray" marginTop={1} paddingX={1}>
          {matches.map((cmd, i) => (
            <Text key={cmd} inverse={i === selectedIdx} color={i === selectedIdx ? 'cyan' : undefined}>
              {' '}{cmd}{' '}
            </Text>
          ))}
        </Box>
      )}
      <Box marginTop={1}>
        <Text bold>&gt; </Text>
        <Text>{input}</Text>
        {!isRunning && <Text color="yellow">▌</Text>}
      </Box>

      <StatusBar providerName={activeProvider} model="" isRunning={isRunning} eventCount={events.length} error={error} contextUsage={contextUsage} />
    </Box>
  )
}
