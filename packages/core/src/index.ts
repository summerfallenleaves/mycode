/**
 * @fileoverview Barrel file re-exporting all public API from the core package (Agent, events, adapter, tools, session, safety, config)
 * @module @my-agent/core/index
 */

export { Agent } from './agent.js'
export type { AgentConfig } from './agent.js'

export type { AgentEvent } from './event.js'
export { assertNever } from './event.js'

export type { LLMAdapter, LLMConfig, ProviderFormat } from './llm/adapter.js'
export { createAdapter } from './llm/adapter.js'

export { ToolRegistry } from './tools/registry.js'
export type { Tool, ToolContext, ToolEvent, ToolResult, QuestionPayload, QuestionOption } from './tools/registry.js'
export { readFileTool, editTool, writeTool, bashTool, grepTool, globTool, questionTool, todowriteTool } from './tools/builtin/index.js'
export { getTodoPath, readTodos } from './tools/builtin/todowrite.js'
export type { TodoItem } from './tools/builtin/todowrite.js'

export { SessionContext } from './session/context.js'
export type { Message } from './session/context.js'
export { FileSessionStore } from './session/store.js'
export type { SessionStore } from './session/store.js'

export { withTimeout, createTimeoutSignal } from './safety/timeout.js'

export { MCPClientManager } from './tools/mcp/manager.js'
export type { MCPServerStatus } from './tools/mcp/manager.js'

export { readConfig, getActiveProvider, findConfigDir, addProvider } from './config.js'
export type { MycodeConfig, LLMProviderConfig, MCPServerConfig, SkillsConfig, AgentConfig as AgentRuntimeConfig } from './config.js'

export { scanSkills, formatSkillPrompt } from './skill/index.js'
export type { SkillInfo } from './skill/index.js'

export { loadMycodeMd, appendRule } from './memory/mycode-md.js'
export { FileMemoryStore, formatMemoryContext } from './memory/store.js'
export type { MemoryEntry, MemoryType, MemoryFile } from './memory/types.js'
export { MEMORY_TYPES } from './memory/types.js'

export { memoryTool } from './tools/builtin/memory.js'
