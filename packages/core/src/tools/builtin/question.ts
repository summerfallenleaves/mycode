/**
 * @fileoverview Built-in question tool: ask the user for input, preferences, or decisions during agent execution
 * @module @my-agent/core/tools/builtin/question
 */

import { z } from 'zod'
import type { Tool, ToolContext } from '../registry.js'

const questionOptionSchema = z.object({
  label: z.string().describe('Display text for this option (1-5 words)'),
  description: z.string().optional().describe('Explanation of what this option means'),
})

export const questionTool: Tool<string[]> = {
  name: 'question',
  description:
    'Ask the user a question with optional multiple-choice options. Use when you need to disambiguate requirements, get preferences, or let the user make a decision. Returns the user\'s selected option label(s).',
  parameters: z.object({
    question: z.string().describe('The question to ask the user'),
    header: z.string().max(30).optional().describe('Short header/label for the question (max 30 chars)'),
    options: z.array(questionOptionSchema).optional().describe('Available choices (if omitted, user can type a free-form answer)'),
    multiple: z.boolean().optional().describe('Allow selecting multiple options (default: false, only valid when options is provided)'),
  }),
  async *execute(args: unknown, context: ToolContext) {
    const { question, header, options, multiple } = args as {
      question: string
      header?: string
      options?: Array<{ label: string; description?: string }>
      multiple?: boolean
    }

    yield { type: 'progress', message: `Asking: ${question}` }

    // If no askQuestion handler on context, the tool can't work
    if (!context.askQuestion) {
      return { error: 'No askQuestion handler available in context', answer: null, status: 'failed' }
    }

    // Yield the question_ask event — toToolSet() will intercept this,
    // call context.askQuestion(), and feed the answer back via generator.next(answer)
    const answer: string[] = yield {
      type: 'question_ask',
      question: { question, header, options, multiple },
    }

    return { answer, status: 'answered' }
  },
}
