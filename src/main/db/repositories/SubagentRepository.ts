import type Database from 'better-sqlite3'
import type { SubagentRecord } from '@tools/subagent/index.d'

export type StoredSubagentRun = {
  record: SubagentRecord
  inputJson: string
  transcriptJson?: string
}

export type SubagentMessage = {
  id: string; childId: string; sender: string; body: string; mode: 'message' | 'task'
  status: 'pending' | 'delivered' | 'consumed' | 'ambiguous'; runId?: string
}

export const SUBAGENT_SCHEMA = `
  CREATE TABLE IF NOT EXISTS subagent_sessions (
    id TEXT PRIMARY KEY,
    parent_chat_uuid TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(parent_chat_uuid) REFERENCES chats(uuid) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS subagent_runs (
    id TEXT PRIMARY KEY,
    child_id TEXT NOT NULL,
    status TEXT NOT NULL,
    revision INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    owner_pid INTEGER NOT NULL,
    record_json TEXT NOT NULL,
    input_json TEXT NOT NULL,
    transcript_json TEXT,
    FOREIGN KEY(child_id) REFERENCES subagent_sessions(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS subagent_messages (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    child_id TEXT NOT NULL,
    sender TEXT NOT NULL,
    body TEXT NOT NULL,
    mode TEXT NOT NULL,
    status TEXT NOT NULL,
    run_id TEXT,
    FOREIGN KEY(child_id) REFERENCES subagent_sessions(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_subagent_messages_pending ON subagent_messages(child_id, status, sequence);
  CREATE INDEX IF NOT EXISTS idx_subagent_runs_child ON subagent_runs(child_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_subagent_runs_active ON subagent_runs(child_id)
    WHERE status IN ('queued', 'running', 'waiting_for_confirmation', 'cancelling');
`

export class SubagentRepository {
  constructor(private readonly db: Database.Database) {}

  save(run: StoredSubagentRun): void {
    const { record } = run
    if (!record.run_id) throw new Error('Subagent run ID is required for persistence.')
    this.db.transaction(() => {
      this.db.prepare('INSERT OR IGNORE INTO subagent_sessions (id, parent_chat_uuid, created_at) VALUES (?, ?, ?)')
        .run(record.id, record.parent_chat_uuid ?? null, record.created_at)
      this.db.prepare(`INSERT INTO subagent_runs
        (id, child_id, status, revision, created_at, owner_pid, record_json, input_json, transcript_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET status = excluded.status, revision = excluded.revision,
          record_json = excluded.record_json, input_json = excluded.input_json,
          transcript_json = COALESCE(excluded.transcript_json, subagent_runs.transcript_json)
        WHERE subagent_runs.revision < excluded.revision
          AND subagent_runs.status NOT IN ('completed', 'failed', 'cancelled', 'interrupted')`)
        .run(record.run_id, record.id, record.status, record.revision ?? 1, record.created_at, process.pid,
          JSON.stringify(record), run.inputJson, run.transcriptJson ?? null)
      const input = JSON.parse(run.inputJson) as { requestMessageId?: string; initialMessageIds?: string[] }
      if (record.status === 'queued') {
        for (const id of [input.requestMessageId, ...(input.initialMessageIds ?? [])].filter((id): id is string => Boolean(id))) {
          this.deliverMessage(id, record.run_id!)
        }
      }
    })()
  }

  get(childId: string, runId?: string): StoredSubagentRun | null {
    const row = (runId
      ? this.db.prepare('SELECT record_json, input_json, transcript_json FROM subagent_runs WHERE child_id = ? AND id = ?').get(childId, runId)
      : this.db.prepare('SELECT record_json, input_json, transcript_json FROM subagent_runs WHERE child_id = ? ORDER BY rowid DESC LIMIT 1').get(childId)
    ) as { record_json: string; input_json: string; transcript_json: string | null } | undefined
    return row ? { record: JSON.parse(row.record_json), inputJson: row.input_json, transcriptJson: row.transcript_json ?? undefined } : null
  }

  list(chatUuid: string): SubagentRecord[] {
    const rows = this.db.prepare(`SELECT r.record_json FROM subagent_sessions s JOIN subagent_runs r ON r.child_id = s.id
      WHERE s.parent_chat_uuid = ? AND r.rowid = (SELECT rowid FROM subagent_runs WHERE child_id = s.id ORDER BY rowid DESC LIMIT 1)`)
      .all(chatUuid) as Array<{ record_json: string }>
    return rows.map(row => JSON.parse(row.record_json) as SubagentRecord)
  }

  getMessage(id: string): SubagentMessage | null {
    const row = this.db.prepare('SELECT * FROM subagent_messages WHERE id = ?').get(id) as
      { id: string; child_id: string; sender: string; body: string; mode: SubagentMessage['mode']; status: SubagentMessage['status']; run_id: string | null } | undefined
    return row ? { id: row.id, childId: row.child_id, sender: row.sender, body: row.body, mode: row.mode, status: row.status, runId: row.run_id ?? undefined } : null
  }

  sendMessage(input: Omit<SubagentMessage, 'status' | 'runId'>): SubagentMessage {
    return this.db.transaction(() => {
      const existing = this.getMessage(input.id)
      if (existing) {
        if (existing.childId !== input.childId || existing.sender !== input.sender || existing.body !== input.body || existing.mode !== input.mode) throw new Error('Message ID already belongs to different content.')
        return existing
      }
      if (input.mode === 'message') {
        const count = this.db.prepare("SELECT COUNT(*) AS count FROM subagent_messages WHERE child_id = ? AND status = 'pending' AND mode = 'message'").get(input.childId) as { count: number }
        if (count.count >= 16) throw new Error('Subagent inbox is full.')
      }
      this.db.prepare("INSERT INTO subagent_messages (id, child_id, sender, body, mode, status) VALUES (?, ?, ?, ?, ?, 'pending')")
        .run(input.id, input.childId, input.sender, input.body, input.mode)
      return this.getMessage(input.id)!
    }).immediate()
  }

  pendingMessages(childId: string): SubagentMessage[] {
    const ids = this.db.prepare("SELECT id FROM subagent_messages WHERE child_id = ? AND status = 'pending' ORDER BY sequence").all(childId) as Array<{ id: string }>
    return ids.map(row => this.getMessage(row.id)!)
  }

  deliverMessage(id: string, runId: string): void {
    this.db.prepare("UPDATE subagent_messages SET status = 'delivered', run_id = ? WHERE id = ? AND status = 'pending'").run(runId, id)
  }

  acknowledgeMessage(id: string, runId: string): void {
    this.db.prepare("UPDATE subagent_messages SET status = 'consumed' WHERE id = ? AND run_id = ? AND status = 'delivered'").run(id, runId)
  }

  messagesForRun(runId: string): SubagentMessage[] {
    const ids = this.db.prepare('SELECT id FROM subagent_messages WHERE run_id = ? ORDER BY sequence').all(runId) as Array<{ id: string }>
    return ids.map(row => this.getMessage(row.id)!)
  }

  recoverInterrupted(): void {
    const rows = this.db.prepare("SELECT child_id, id, owner_pid FROM subagent_runs WHERE status IN ('queued', 'running', 'waiting_for_confirmation', 'cancelling')")
      .all() as Array<{ child_id: string; id: string; owner_pid: number }>
    this.db.transaction(() => {
      for (const row of rows) {
        if (row.owner_pid > 0 && row.owner_pid !== process.pid) {
          try {
            process.kill(row.owner_pid, 0)
            continue
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ESRCH') continue
          }
        }
        const run = this.get(row.child_id, row.id)!
        const record = { ...run.record, status: 'interrupted' as const, revision: (run.record.revision ?? 0) + 1, finished_at: Date.now(), error: 'The application stopped before this run finished. Inspect its evidence before explicitly starting another run.' }
        this.save({ ...run, record })
        this.db.prepare("UPDATE subagent_messages SET status = 'ambiguous' WHERE run_id = ? AND status IN ('delivered', 'consumed')").run(row.id)
      }
    })()
  }
}
