import type { RunModelContext } from '@main/agent/contracts'

export type CompactAgentErrorCode =
  | 'CONFIG_UNAVAILABLE'
  | 'MODEL_UNAVAILABLE'
  | 'MODEL_REQUEST_FAILED'
  | 'INVALID_RESPONSE'
  | 'EMPTY_INPUT'
  | 'EMPTY_OUTPUT'
  | 'INVALID_BUDGET'
  | 'ABORTED'
  | 'TIMEOUT'

export type CompactAgentSensitiveDataPolicy = 'redact-secrets' | 'verbatim'

export interface CompactAgentInput {
  content: string
  contentType: string
  profile: string
  maxCharacters: number
  maxInputCharacters?: number
  sensitiveDataPolicy?: CompactAgentSensitiveDataPolicy
  systemInstruction?: string
  userInstruction?: string
  promptVersion?: string
  timeoutMs?: number
  signal?: AbortSignal
}

export interface CompactAgentResult {
  content: string
  usage?: ITokenUsage
  modelId: string
  latencyMs: number
  promptVersion: string
  truncated: boolean
  inputCharacters?: number
  sentCharacters?: number
  inputTruncated?: boolean
  redactionCount?: number
}

export interface CompactAgentConfigStore {
  requireConfig(): IAppConfig
}

export interface CompactAgentModelContextResolver {
  resolve(config: IAppConfig, modelRef: ModelRef): RunModelContext | null
}

export class CompactAgentError extends Error {
  constructor(
    readonly code: CompactAgentErrorCode,
    message: string,
    readonly cause?: unknown
  ) {
    super(message)
    this.name = 'CompactAgentError'
  }
}
