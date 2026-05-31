/**
 * @fileoverview MCPClientManager: orchestrate multiple MCP server connections, lifecycle management with AbortSignal
 * @module @my-agent/core/tools/mcp/manager
 */

import { Client } from '@modelcontextprotocol/sdk/client'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { ListToolsResultSchema, CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js'
import type { ToolRegistry } from '../registry.js'
import type { MCPServerConfig } from '../../config.js'
import { MCPTool } from './client.js'

export type MCPConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface MCPServerStatus {
  name: string
  type: string
  status: MCPConnectionStatus
  error?: string
  toolCount: number
}

/**
 * Manages MCP server connections, tool discovery, and tool registration.
 * Each server gets its own Client instance with appropriate transport.
 */
export class MCPClientManager {
  private clients = new Map<string, Client>()
  private statuses = new Map<string, MCPConnectionStatus>()
  private errors = new Map<string, string>()
  private toolCounts = new Map<string, number>()
  private abortController = new AbortController()

  constructor(private servers: Record<string, MCPServerConfig>) {}

  /**
   * Connect to all configured MCP servers, discover tools, and register them into the given ToolRegistry.
   * Returns a list of connection results.
   */
  async connectAll(registry: ToolRegistry): Promise<void> {
    const entries = Object.entries(this.servers)
    await Promise.all(entries.map(([name, config]) => this.connectServer(name, config, registry)))
  }

  private async connectServer(name: string, config: MCPServerConfig, registry: ToolRegistry): Promise<void> {
    this.statuses.set(name, 'connecting')
    const signal = this.abortController.signal

    try {
      const client = new Client(
        { name: `mycode-${name}`, version: '0.0.1' },
        { capabilities: {} },
      )

      let transport
      if (config.type === 'stdio') {
        transport = new StdioClientTransport({
          command: config.command,
          args: config.args ?? [],
          env: config.env,
          stderr: 'ignore',
        })
      } else if (config.type === 'http') {
        transport = new StreamableHTTPClientTransport(new URL(config.url), {
          requestInit: { headers: config.headers },
        })
      } else {
        throw new Error(`Unsupported MCP transport type: ${(config as Record<string, unknown>).type}`)
      }

      // Connect with timeout
      await Promise.race([
        client.connect(transport),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Connection timeout')), 15_000),
        ),
      ])

      if (signal.aborted) {
        await client.close().catch(() => {})
        return
      }

      // Discover tools
      const result = await client.request(
        { method: 'tools/list' },
        ListToolsResultSchema,
      )

      const mcpToolDefs = result.tools ?? []
      for (const toolDef of mcpToolDefs) {
        const mcpTool = new MCPTool(
          {
            callTool: async (toolName, args) => {
              const res = await client.request(
                { method: 'tools/call', params: { name: toolName, arguments: args } },
                CallToolResultSchema,
              )
              // Extract text content from response
              const content = (res as { content?: Array<Record<string, unknown>> }).content ?? []
              const textParts = content
                .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
                .map(c => c.text)
              return textParts.join('\n') || res
            },
          },
          {
            name: toolDef.name,
            description: toolDef.description,
            inputSchema: toolDef.inputSchema as Record<string, unknown>,
          },
        )

        try {
          registry.register(mcpTool)
        } catch {
          // Skip duplicate tool names silently
        }
      }

      this.clients.set(name, client)
      this.statuses.set(name, 'connected')
      this.toolCounts.set(name, mcpToolDefs.length)

      // Handle disconnect
      transport.onclose = () => {
        this.statuses.set(name, 'disconnected')
      }
      transport.onerror = (error) => {
        this.errors.set(name, error.message)
        this.statuses.set(name, 'error')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.errors.set(name, message)
      this.statuses.set(name, 'error')
    }
  }

  /** Disconnect all servers */
  async disconnectAll(): Promise<void> {
    this.abortController.abort()
    await Promise.all(
      Array.from(this.clients.entries()).map(async ([name, client]) => {
        try {
          await client.close()
        } catch {
          // Ignore close errors
        }
        this.statuses.set(name, 'disconnected')
      }),
    )
    this.clients.clear()
  }

  /** Get status of all servers */
  getStatuses(): MCPServerStatus[] {
    return Object.entries(this.servers).map(([name, config]) => ({
      name,
      type: config.type,
      status: this.statuses.get(name) ?? 'disconnected',
      error: this.errors.get(name),
      toolCount: this.toolCounts.get(name) ?? 0,
    }))
  }
}
