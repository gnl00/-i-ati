import type Database from 'better-sqlite3'

interface SmartMessageRow {
  id: string
  chat_id: number | null
  chat_uuid: string | null
  source_summary_ids: string
  source_hash: string
  title: string
  body: string
  action_prompt: string
  reason: string | null
  priority_score: number
  status: string
  generated_at: number
  expires_at: number | null
  model_id: string | null
  generation_version: number
}

interface SmartMessageCandidateSummaryRow {
  id: number
  chat_id: number
  chat_uuid: string
  summary: string
  start_message_id: number
  end_message_id: number
  compressed_at: number
  chat_title: string
  chat_update_time: number
  chat_msg_count: number
}

class SmartMessageDao {
  private stmts: {
    upsertSmartMessage: Database.Statement
    getActiveSmartMessages: Database.Statement
    markStatus: Database.Statement
    markChatMessagesStale: Database.Statement
    getBySourceHash: Database.Statement
    listRecentCandidateSummaries: Database.Statement
  }

  constructor(db: Database.Database) {
    this.stmts = {
      upsertSmartMessage: db.prepare(`
        INSERT INTO smart_messages (
          id, chat_id, chat_uuid, source_summary_ids, source_hash,
          title, body, action_prompt, reason, priority_score,
          status, generated_at, expires_at, model_id, generation_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          chat_id = excluded.chat_id,
          chat_uuid = excluded.chat_uuid,
          source_summary_ids = excluded.source_summary_ids,
          source_hash = excluded.source_hash,
          title = excluded.title,
          body = excluded.body,
          action_prompt = excluded.action_prompt,
          reason = excluded.reason,
          priority_score = excluded.priority_score,
          status = excluded.status,
          generated_at = excluded.generated_at,
          expires_at = excluded.expires_at,
          model_id = excluded.model_id,
          generation_version = excluded.generation_version
      `),
      getActiveSmartMessages: db.prepare(`
        SELECT * FROM smart_messages
        WHERE status = 'active'
          AND (expires_at IS NULL OR expires_at > ?)
        ORDER BY priority_score DESC, generated_at DESC
        LIMIT ?
      `),
      markStatus: db.prepare(`
        UPDATE smart_messages SET status = ? WHERE id = ?
      `),
      markChatMessagesStale: db.prepare(`
        UPDATE smart_messages
        SET status = 'stale'
        WHERE chat_uuid = ? AND status = 'active'
      `),
      getBySourceHash: db.prepare(`
        SELECT * FROM smart_messages
        WHERE source_hash = ? AND generation_version = ?
        LIMIT 1
      `),
      listRecentCandidateSummaries: db.prepare(`
        SELECT
          compressed_summaries.id,
          compressed_summaries.chat_id,
          compressed_summaries.chat_uuid,
          compressed_summaries.summary,
          compressed_summaries.start_message_id,
          compressed_summaries.end_message_id,
          compressed_summaries.compressed_at,
          chats.title AS chat_title,
          chats.update_time AS chat_update_time,
          chats.msg_count AS chat_msg_count
        FROM compressed_summaries
        INNER JOIN chats ON chats.id = compressed_summaries.chat_id
        WHERE compressed_summaries.status = 'active'
          AND compressed_summaries.compressed_at >= ?
        ORDER BY chats.update_time DESC, compressed_summaries.compressed_at DESC, compressed_summaries.end_message_id DESC
        LIMIT ?
      `)
    }
  }

  upsert(row: SmartMessageRow): void {
    this.stmts.upsertSmartMessage.run(
      row.id,
      row.chat_id,
      row.chat_uuid,
      row.source_summary_ids,
      row.source_hash,
      row.title,
      row.body,
      row.action_prompt,
      row.reason,
      row.priority_score,
      row.status,
      row.generated_at,
      row.expires_at,
      row.model_id,
      row.generation_version
    )
  }

  getActive(now: number, limit: number): SmartMessageRow[] {
    return this.stmts.getActiveSmartMessages.all(now, limit) as SmartMessageRow[]
  }

  markStatus(id: string, status: string): void {
    this.stmts.markStatus.run(status, id)
  }

  markChatMessagesStale(chatUuid: string): void {
    this.stmts.markChatMessagesStale.run(chatUuid)
  }

  getBySourceHash(sourceHash: string, generationVersion: number): SmartMessageRow | undefined {
    return this.stmts.getBySourceHash.get(sourceHash, generationVersion) as SmartMessageRow | undefined
  }

  listRecentCandidateSummaries(since: number, limit: number): SmartMessageCandidateSummaryRow[] {
    return this.stmts.listRecentCandidateSummaries.all(since, limit) as SmartMessageCandidateSummaryRow[]
  }
}

export { SmartMessageDao }
export type { SmartMessageCandidateSummaryRow, SmartMessageRow }
