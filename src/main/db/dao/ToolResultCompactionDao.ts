import type Database from 'better-sqlite3'

export type ToolResultCompactionLevel = 'balanced' | 'minimal'
export type ToolResultCompactionStatus = 'pending' | 'running' | 'ready' | 'failed'
export type ToolResultCompactionExecutionType = 'model' | 'deterministic'

export interface ToolResultCompactionExecutionRow {
  execution_type: ToolResultCompactionExecutionType
  model_id: string | null
  prompt_version: string | null
  prompt_tokens: number | null
  completion_tokens: number | null
  latency_ms: number | null
  input_characters: number | null
  sent_characters: number | null
  input_truncated: number | null
  redaction_count: number | null
}

export interface ToolResultCompactionRow {
  id: number
  message_id: number
  tool_name: string
  tool_call_id: string | null
  level: ToolResultCompactionLevel
  status: ToolResultCompactionStatus
  content: string | null
  original_hash: string
  original_characters: number | null
  compacted_characters: number | null
  estimated_tokens: number | null
  execution_type: ToolResultCompactionExecutionType | null
  model_id: string | null
  prompt_version: string | null
  prompt_tokens: number | null
  completion_tokens: number | null
  latency_ms: number | null
  input_characters: number | null
  sent_characters: number | null
  input_truncated: number | null
  redaction_count: number | null
  compactor_id: string
  compactor_version: number
  attempts: number
  last_error_code: string | null
  created_at: number
  updated_at: number
}

export type ToolResultCompactionInsertRow = Omit<ToolResultCompactionRow, 'id'>

const READY_QUERY_BATCH_SIZE = 500

export class ToolResultCompactionDao {
  constructor(private readonly db: Database.Database) {}

  upsertPending(row: ToolResultCompactionInsertRow): number {
    this.db.prepare(`
      INSERT INTO tool_result_compactions (
        message_id, tool_name, tool_call_id, level, status, content,
        original_hash, original_characters, compacted_characters, estimated_tokens,
        execution_type, model_id, prompt_version, prompt_tokens, completion_tokens, latency_ms,
        input_characters, sent_characters, input_truncated, redaction_count,
        compactor_id, compactor_version, attempts, last_error_code, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, 'pending', NULL, ?, ?, NULL, NULL,
        NULL, NULL, NULL, NULL, NULL, NULL,
        NULL, NULL, NULL, NULL,
        ?, ?, 0, NULL, ?, ?
      )
      ON CONFLICT(message_id, level, compactor_id, compactor_version, original_hash)
      DO NOTHING
    `).run(
      row.message_id,
      row.tool_name,
      row.tool_call_id,
      row.level,
      row.original_hash,
      row.original_characters,
      row.compactor_id,
      row.compactor_version,
      row.created_at,
      row.updated_at
    )

    const stored = this.getByIdentity(
      row.message_id,
      row.level,
      row.original_hash,
      row.compactor_id,
      row.compactor_version
    )
    if (!stored) throw new Error('Tool result compaction upsert did not produce a row')
    return stored.id
  }

  markRunning(id: number, updatedAt: number): boolean {
    const result = this.db.prepare(`
      UPDATE tool_result_compactions
      SET status = 'running', attempts = attempts + 1, last_error_code = NULL, updated_at = ?
      WHERE id = ? AND status IN ('pending', 'failed')
    `).run(updatedAt, id)
    return result.changes === 1
  }

  markReady(
    id: number,
    content: string,
    compactedCharacters: number,
    estimatedTokens: number,
    execution: ToolResultCompactionExecutionRow | undefined,
    updatedAt: number
  ): void {
    this.db.prepare(`
      UPDATE tool_result_compactions
      SET status = 'ready', content = ?, compacted_characters = ?,
          estimated_tokens = ?, execution_type = ?, model_id = ?, prompt_version = ?,
          prompt_tokens = ?, completion_tokens = ?, latency_ms = ?,
          input_characters = ?, sent_characters = ?, input_truncated = ?, redaction_count = ?,
          last_error_code = NULL, updated_at = ?
      WHERE id = ? AND status = 'running'
    `).run(
      content,
      compactedCharacters,
      estimatedTokens,
      execution?.execution_type ?? null,
      execution?.model_id ?? null,
      execution?.prompt_version ?? null,
      execution?.prompt_tokens ?? null,
      execution?.completion_tokens ?? null,
      execution?.latency_ms ?? null,
      execution?.input_characters ?? null,
      execution?.sent_characters ?? null,
      execution?.input_truncated ?? null,
      execution?.redaction_count ?? null,
      updatedAt,
      id
    )
  }

  markFailed(id: number, errorCode: string, updatedAt: number): void {
    this.db.prepare(`
      UPDATE tool_result_compactions
      SET status = 'failed', last_error_code = ?, updated_at = ?
      WHERE id = ? AND status = 'running'
    `).run(errorCode, updatedAt, id)
  }

  getByIdentity(
    messageId: number,
    level: ToolResultCompactionLevel,
    originalHash: string,
    compactorId?: string,
    compactorVersion?: number
  ): ToolResultCompactionRow | undefined {
    const filters = ['message_id = ?', 'level = ?', 'original_hash = ?']
    const values: Array<string | number> = [messageId, level, originalHash]
    if (compactorId !== undefined) {
      filters.push('compactor_id = ?')
      values.push(compactorId)
    }
    if (compactorVersion !== undefined) {
      filters.push('compactor_version = ?')
      values.push(compactorVersion)
    }
    return this.db.prepare(`
      SELECT * FROM tool_result_compactions
      WHERE ${filters.join(' AND ')}
      ORDER BY compactor_version DESC, updated_at DESC
      LIMIT 1
    `).get(...values) as ToolResultCompactionRow | undefined
  }

  getReadyByMessageIds(messageIds: number[]): ToolResultCompactionRow[] {
    const uniqueMessageIds = [...new Set(messageIds)]
    const rows: ToolResultCompactionRow[] = []

    for (let offset = 0; offset < uniqueMessageIds.length; offset += READY_QUERY_BATCH_SIZE) {
      const batch = uniqueMessageIds.slice(offset, offset + READY_QUERY_BATCH_SIZE)
      const placeholders = batch.map(() => '?').join(', ')
      rows.push(...this.db.prepare(`
        SELECT * FROM tool_result_compactions
        WHERE message_id IN (${placeholders}) AND status = 'ready'
        ORDER BY message_id ASC, updated_at DESC
      `).all(...batch) as ToolResultCompactionRow[])
    }

    return rows.sort((left, right) =>
      left.message_id - right.message_id || right.updated_at - left.updated_at
    )
  }
}
