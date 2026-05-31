/**
 * @fileoverview JSONC config reader: MycodeConfig + LLMProviderConfig + MCPServerConfig types, readConfig(), getActiveProvider() with env var override
 * @module @my-agent/core/config
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { homedir } from 'node:os'

// ── 类型定义 ──

export interface LLMProviderConfig {
  format: 'openai' | 'anthropic'
  baseUrl: string
  apiKey: string
  model: string
  contextWindow?: number
  maxOutputTokens?: number
}

export interface AgentConfig {
  systemPrompt: string
  maxSteps: number
  sessionTimeoutMs: number
  maxContextTokens: number
}

export interface MCPServerStdioConfig {
  type: 'stdio'
  command: string
  args?: string[]
  env?: Record<string, string>
}

export interface MCPServerHttpConfig {
  type: 'http'
  url: string
  headers?: Record<string, string>
}

export type MCPServerConfig = MCPServerStdioConfig | MCPServerHttpConfig

export interface SkillsConfig {
  enabled?: boolean
  paths?: string[]
}

export interface MycodeConfig {
  llm: {
    defaultProvider: string
    providers: Record<string, LLMProviderConfig>
  }
  agent: AgentConfig
  mcpServers?: Record<string, MCPServerConfig>
  skills?: SkillsConfig
}

// ── JSONC 解析 ──

const PLACEHOLDER = '\u0000'

function stripJsoncComments(jsonc: string): string {
  const protectedJsonc = jsonc.replace(
    /"(?:[^"\\]|\\.)*"/g,
    match => match.replaceAll('/', PLACEHOLDER),
  )
  const noComments = protectedJsonc.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '')
  const noNumSeparators = noComments.replace(
    /-?\d[\d_.]*(?:[eE][+-]?\d+)?/g,
    match => (match.includes('_') ? match.replace(/_/g, '') : match),
  )
  return noNumSeparators.replaceAll(PLACEHOLDER, '/')
}

// ── 读取配置 ──

const CONFIG_PATH = '.mycode/mycode.jsonc'
const HOME_CONFIG_DIR = resolve(homedir(), '.mycode')
const HOME_CONFIG_FILE = resolve(HOME_CONFIG_DIR, 'mycode.jsonc')

export interface ReadConfigResult {
  config: MycodeConfig
  configDir: string
}

export function readConfig(rootDir?: string): ReadConfigResult {
  const dir = rootDir ?? findConfigDir()
  const configFile = resolve(dir, 'mycode.jsonc')

  if (!existsSync(configFile)) {
    throw new Error(
      `Config file not found at ${configFile}. Ensure ~/.mycode/mycode.jsonc exists or the project root contains .mycode/mycode.jsonc.`,
    )
  }

  const raw = readFileSync(configFile, 'utf-8')
  const json = stripJsoncComments(raw)
  const config = JSON.parse(json) as MycodeConfig

  if (!config.llm?.defaultProvider || !config.llm?.providers) {
    throw new Error('Invalid config: missing llm.defaultProvider or llm.providers')
  }

  return { config, configDir: dir }
}

/**
 * 查找配置目录。
 * 优先顺序：
 * 1. ~/.mycode/ 目录（如果存在 mycode.jsonc）
 * 2. 从当前工作目录向上遍历，查找包含 .mycode/mycode.jsonc 的目录
 * 3. 如果都找不到，抛出错误
 */
export function findConfigDir(): string {
  // 1. 优先检查 ~/.mycode/
  if (existsSync(HOME_CONFIG_FILE)) {
    return HOME_CONFIG_DIR
  }

  // 2. 从当前目录向上查找
  let dir = process.cwd()
  while (true) {
    if (existsSync(resolve(dir, CONFIG_PATH))) {
      return resolve(dir, '.mycode')
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  throw new Error('Cannot find .mycode/mycode.jsonc. Ensure ~/.mycode/mycode.jsonc exists or you are in a project directory with .mycode/mycode.jsonc.')
}

export function getActiveProvider(config: MycodeConfig): LLMProviderConfig {
  const providerName = config.llm.defaultProvider
  const provider = config.llm.providers[providerName]
  if (!provider) {
    throw new Error(`Provider "${providerName}" not found in config`)
  }
  const apiKey = process.env.MYCODE_API_KEY ?? provider.apiKey
  return { ...provider, apiKey }
}

export interface AddProviderParams {
  name: string
  format: 'openai' | 'anthropic'
  baseUrl: string
  apiKey: string
  model: string
  setDefault?: boolean
}

export function addProvider(params: AddProviderParams): void {
  const configDir = findConfigDir()
  const configFile = resolve(configDir, 'mycode.jsonc')

  const raw = readFileSync(configFile, 'utf-8')
  const json = stripJsoncComments(raw)
  const config = JSON.parse(json) as MycodeConfig

  config.llm.providers[params.name] = {
    format: params.format,
    baseUrl: params.baseUrl,
    apiKey: params.apiKey,
    model: params.model,
  }

  if (params.setDefault !== false) {
    config.llm.defaultProvider = params.name
  }

  writeFileSync(configFile, JSON.stringify(config, null, 2) + '\n', 'utf-8')
}
