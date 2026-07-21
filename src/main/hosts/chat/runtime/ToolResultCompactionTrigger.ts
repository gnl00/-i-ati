import type { ToolResultFact } from '@main/agent/runtime/tools/ToolResultFact'

export interface ToolResultCompactionTrigger {
  schedule(input: {
    messageId: number
    result: ToolResultFact
    rawContent: string
    args?: unknown
    signal?: AbortSignal
  }): void
}

export const noopToolResultCompactionTrigger: ToolResultCompactionTrigger = {
  schedule: () => {}
}
