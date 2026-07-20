import type {
  ToolResultCompactionInsertRow,
  ToolResultCompactionExecutionRow,
  ToolResultCompactionExecutionType,
  ToolResultCompactionLevel,
  ToolResultCompactionRow,
  ToolResultCompactionStatus
} from '../dao/ToolResultCompactionDao'

export interface ToolResultCompactionExecution {
  executionType: ToolResultCompactionExecutionType
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

export interface ToolResultCompaction {
  id: number
  messageId: number
  toolName: string
  toolCallId?: string
  level: ToolResultCompactionLevel
  status: ToolResultCompactionStatus
  content?: string
  originalHash: string
  originalCharacters?: number
  compactedCharacters?: number
  estimatedTokens?: number
  executionType?: ToolResultCompactionExecutionType
  modelId?: string
  promptVersion?: string
  promptTokens?: number
  completionTokens?: number
  latencyMs?: number
  inputCharacters?: number
  sentCharacters?: number
  inputTruncated?: boolean
  redactionCount?: number
  compactorId: string
  compactorVersion: number
  attempts: number
  lastErrorCode?: string
  createdAt: number
  updatedAt: number
}

export interface CreateToolResultCompaction {
  messageId: number
  toolName: string
  toolCallId?: string
  level: ToolResultCompactionLevel
  originalHash: string
  originalCharacters?: number
  compactorId: string
  compactorVersion: number
  createdAt?: number
}

export const toToolResultCompaction = (row: ToolResultCompactionRow): ToolResultCompaction => ({
  id: row.id,
  messageId: row.message_id,
  toolName: row.tool_name,
  toolCallId: row.tool_call_id ?? undefined,
  level: row.level,
  status: row.status,
  content: row.content ?? undefined,
  originalHash: row.original_hash,
  originalCharacters: row.original_characters ?? undefined,
  compactedCharacters: row.compacted_characters ?? undefined,
  estimatedTokens: row.estimated_tokens ?? undefined,
  executionType: row.execution_type ?? undefined,
  modelId: row.model_id ?? undefined,
  promptVersion: row.prompt_version ?? undefined,
  promptTokens: row.prompt_tokens ?? undefined,
  completionTokens: row.completion_tokens ?? undefined,
  latencyMs: row.latency_ms ?? undefined,
  inputCharacters: row.input_characters ?? undefined,
  sentCharacters: row.sent_characters ?? undefined,
  inputTruncated: row.input_truncated == null ? undefined : row.input_truncated === 1,
  redactionCount: row.redaction_count ?? undefined,
  compactorId: row.compactor_id,
  compactorVersion: row.compactor_version,
  attempts: row.attempts,
  lastErrorCode: row.last_error_code ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at
})

export const toToolResultCompactionInsertRow = (
  input: CreateToolResultCompaction,
  now: number
): ToolResultCompactionInsertRow => ({
  message_id: input.messageId,
  tool_name: input.toolName,
  tool_call_id: input.toolCallId ?? null,
  level: input.level,
  status: 'pending',
  content: null,
  original_hash: input.originalHash,
  original_characters: input.originalCharacters ?? null,
  compacted_characters: null,
  estimated_tokens: null,
  execution_type: null,
  model_id: null,
  prompt_version: null,
  prompt_tokens: null,
  completion_tokens: null,
  latency_ms: null,
  input_characters: null,
  sent_characters: null,
  input_truncated: null,
  redaction_count: null,
  compactor_id: input.compactorId,
  compactor_version: input.compactorVersion,
  attempts: 0,
  last_error_code: null,
  created_at: input.createdAt ?? now,
  updated_at: now
})

export const toToolResultCompactionExecutionRow = (
  execution: ToolResultCompactionExecution
): ToolResultCompactionExecutionRow => ({
  execution_type: execution.executionType,
  model_id: execution.modelId ?? null,
  prompt_version: execution.promptVersion ?? null,
  prompt_tokens: execution.promptTokens ?? null,
  completion_tokens: execution.completionTokens ?? null,
  latency_ms: execution.latencyMs ?? null,
  input_characters: execution.inputCharacters ?? null,
  sent_characters: execution.sentCharacters ?? null,
  input_truncated: execution.inputTruncated == null
    ? null
    : Number(execution.inputTruncated),
  redaction_count: execution.redactionCount ?? null
})
