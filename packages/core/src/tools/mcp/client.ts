/**
 * @fileoverview MCP client wrapper: connects to MCP servers, lists and calls tools via @modelcontextprotocol/sdk
 * @module @my-agent/core/tools/mcp/client
 */

import { z } from 'zod'
import type { Tool, ToolContext } from '../registry.js'

/**
 * Convert a JSON Schema property to a Zod type.
 * Handles common cases: string, number, integer, boolean, array, object.
 */
function jsonSchemaPropToZod(schema: Record<string, unknown>, required: boolean): z.ZodType<unknown> {
  let zod: z.ZodType<unknown>

  switch (schema.type) {
    case 'string':
      zod = z.string()
      break
    case 'number':
      zod = z.number()
      break
    case 'integer':
      zod = z.number().int()
      break
    case 'boolean':
      zod = z.boolean()
      break
    case 'array': {
      const items = schema.items as Record<string, unknown> | undefined
      zod = items ? z.array(jsonSchemaPropToZod(items, true)) : z.array(z.unknown())
      break
    }
    case 'object':
    default: {
      if (schema.properties) {
        zod = jsonSchemaToZodObject(schema as Record<string, unknown>)
      } else {
        zod = z.record(z.unknown())
      }
      break
    }
  }

  if (schema.description) zod = zod.describe(schema.description as string)
  if (!required) zod = zod.optional()
  return zod
}

function jsonSchemaToZodObject(schema: Record<string, unknown>): z.ZodObject<Record<string, z.ZodType<unknown>>> {
  const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>
  const requiredFields = new Set<string>((schema.required as string[]) ?? [])
  const shape: Record<string, z.ZodType<unknown>> = {}

  for (const [key, prop] of Object.entries(properties)) {
    shape[key] = jsonSchemaPropToZod(prop, requiredFields.has(key))
  }

  return z.object(shape)
}

export function jsonSchemaToZod(schema: Record<string, unknown>): z.ZodType<unknown> {
  if (schema.properties) return jsonSchemaToZodObject(schema)
  if (schema.type === 'string') return z.string()
  if (schema.type === 'number') return z.number()
  return z.object({}).passthrough()
}

export interface MCPClientHandle {
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>
}

export class MCPTool implements Tool {
  name: string
  description: string
  parameters: z.ZodSchema<unknown>

  constructor(
    private client: MCPClientHandle,
    toolDef: { name: string; description?: string; inputSchema: Record<string, unknown> },
  ) {
    this.name = toolDef.name
    this.description = toolDef.description ?? ''
    this.parameters = jsonSchemaToZod(toolDef.inputSchema)
  }

  async *execute(args: unknown, _context: ToolContext) {
    yield { type: 'progress' as const, message: `MCP: ${this.name}` }
    const result = await this.client.callTool(this.name, args as Record<string, unknown>)
    const resultStr = typeof result === 'string' ? result : JSON.stringify(result)
    if (resultStr.length > 200) {
      yield { type: 'data' as const, chunk: resultStr.slice(0, 200) + '...' }
    } else if (resultStr) {
      yield { type: 'data' as const, chunk: resultStr }
    }
    return { result }
  }
}
