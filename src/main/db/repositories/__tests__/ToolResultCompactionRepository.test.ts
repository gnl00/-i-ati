import { describe, expect, it, vi } from 'vitest'
import { ToolResultCompactionRepository } from '../ToolResultCompactionRepository'

const row = {
  id: 7,
  message_id: 11,
  tool_name: 'web_fetch',
  tool_call_id: 'call-1',
  level: 'balanced' as const,
  status: 'ready' as const,
  content: 'compact',
  original_hash: 'hash-1',
  original_characters: 10_000,
  compacted_characters: 500,
  estimated_tokens: 125,
  execution_type: 'model' as const,
  model_id: 'lite-model',
  prompt_version: 'web-fetch-v1',
  prompt_tokens: 1_000,
  completion_tokens: 125,
  latency_ms: 450,
  input_characters: 10_000,
  sent_characters: 8_000,
  input_truncated: 1,
  redaction_count: 3,
  compactor_id: 'web-document',
  compactor_version: 1,
  attempts: 1,
  last_error_code: null,
  created_at: 100,
  updated_at: 200
}

const createDao = () => ({
  upsertPending: vi.fn(() => 7),
  markRunning: vi.fn(() => true),
  markReady: vi.fn(),
  markFailed: vi.fn(),
  getByIdentity: vi.fn(() => row),
  getReadyByMessageIds: vi.fn(() => [row])
})

describe('ToolResultCompactionRepository', () => {
  it('creates an idempotent pending record with repository timestamps', () => {
    const dao = createDao()
    const repository = new ToolResultCompactionRepository({
      hasDb: () => true,
      getToolResultCompactionDao: () => dao as any,
      now: () => 300
    })

    expect(repository.createPending({
      messageId: 11,
      toolName: 'web_fetch',
      toolCallId: 'call-1',
      level: 'balanced',
      originalHash: 'hash-1',
      originalCharacters: 10_000,
      compactorId: 'web-document',
      compactorVersion: 1,
      createdAt: 100
    })).toBe(7)
    expect(dao.upsertPending).toHaveBeenCalledWith(expect.objectContaining({
      message_id: 11,
      status: 'pending',
      original_hash: 'hash-1',
      created_at: 100,
      updated_at: 300
    }))
  })

  it('persists lifecycle transitions', () => {
    const dao = createDao()
    const repository = new ToolResultCompactionRepository({
      hasDb: () => true,
      getToolResultCompactionDao: () => dao as any,
      now: () => 300
    })

    expect(repository.markRunning(7)).toBe(true)
    repository.markReady(7, 'compact', 500, 125, {
      executionType: 'model',
      modelId: 'lite-model',
      promptVersion: 'web-fetch-v1',
      promptTokens: 1_000,
      completionTokens: 125,
      latencyMs: 450,
      inputCharacters: 10_000,
      sentCharacters: 8_000,
      inputTruncated: true,
      redactionCount: 3
    })
    repository.markReady(8, 'deterministic compact', 400, 100)
    repository.markFailed(8, 'timeout')

    expect(dao.markRunning).toHaveBeenCalledWith(7, 300)
    expect(dao.markReady).toHaveBeenCalledWith(
      7,
      'compact',
      500,
      125,
      {
        execution_type: 'model',
        model_id: 'lite-model',
        prompt_version: 'web-fetch-v1',
        prompt_tokens: 1_000,
        completion_tokens: 125,
        latency_ms: 450,
        input_characters: 10_000,
        sent_characters: 8_000,
        input_truncated: 1,
        redaction_count: 3
      },
      300
    )
    expect(dao.markReady).toHaveBeenCalledWith(
      8,
      'deterministic compact',
      400,
      100,
      undefined,
      300
    )
    expect(dao.markFailed).toHaveBeenCalledWith(8, 'timeout', 300)
  })

  it('maps batch-ready and exact identity lookups', () => {
    const dao = createDao()
    const repository = new ToolResultCompactionRepository({
      hasDb: () => true,
      getToolResultCompactionDao: () => dao as any
    })

    expect(repository.getReadyByMessageIds([11])).toEqual([expect.objectContaining({
      id: 7,
      messageId: 11,
      status: 'ready',
      content: 'compact',
      executionType: 'model',
      modelId: 'lite-model',
      promptVersion: 'web-fetch-v1',
      promptTokens: 1_000,
      completionTokens: 125,
      latencyMs: 450,
      inputCharacters: 10_000,
      sentCharacters: 8_000,
      inputTruncated: true,
      redactionCount: 3
    })])
    expect(repository.getByMessageLevelAndHash(
      11,
      'balanced',
      'hash-1',
      'web-document',
      1
    )).toEqual(expect.objectContaining({ id: 7, originalHash: 'hash-1' }))
    expect(dao.getByIdentity).toHaveBeenCalledWith(
      11,
      'balanced',
      'hash-1',
      'web-document',
      1
    )
  })

  it('guards access before database initialization', () => {
    const repository = new ToolResultCompactionRepository({
      hasDb: () => false,
      getToolResultCompactionDao: () => undefined
    })
    expect(() => repository.getReadyByMessageIds([11])).toThrow('Database not initialized')
  })
})
