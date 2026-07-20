import type { ToolResultFact } from '@main/agent/runtime/tools/ToolResultFact'

export interface ToolResultContentResolution {
  content: string
}

export interface ToolResultContentResolver {
  resolve(input: {
    messageId: number
    result: ToolResultFact
    rawContent: string
    args?: unknown
    signal?: AbortSignal
  }): Promise<ToolResultContentResolution>
}

export const rawToolResultContentResolver: ToolResultContentResolver = {
  resolve: async ({ rawContent }) => ({
    content: rawContent
  })
}
