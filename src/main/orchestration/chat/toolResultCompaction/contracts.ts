import type {
  ToolResultCompactionLevel,
  ToolResultCompactionModelInputPolicy
} from '@shared/tools/metadata-types'

export type ToolResultStatus = 'success' | 'error' | 'timeout' | 'aborted' | 'denied'

export interface ToolResultCompactionInput {
  messageId: number
  toolName: string
  toolCallId?: string
  args?: unknown
  status: ToolResultStatus
  rawContent: unknown
  level: ToolResultCompactionLevel
  modelInputPolicy?: ToolResultCompactionModelInputPolicy
  signal?: AbortSignal
}

export interface ToolResultCompactionOutput {
  content: string
  compactorId: string
  compactorVersion: number
  originalCharacters: number
  compactedCharacters: number
  estimatedTokens: number
  execution: {
    executionType: 'model' | 'deterministic'
    modelId?: string
    promptVersion?: string
    promptTokens?: number
    completionTokens?: number
    latencyMs?: number
    inputCharacters?: number
    sentCharacters?: number
    inputTruncated?: boolean
    redactionCount?: number
  }
}

export interface ToolResultCompactor {
  readonly id: string
  readonly version: number
  compact(
    input: ToolResultCompactionInput
  ): Promise<ToolResultCompactionOutput | undefined>
}
