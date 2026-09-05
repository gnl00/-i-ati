import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const profile = vi.hoisted(() => ({ path: '' }))
vi.mock('electron', () => ({ app: { getPath: (): string => profile.path } }))

const describeNative = process.versions.electron ? describe : describe.skip

describeNative('schedule schema upgrade with persisted SQLite data', () => {
  let database: import('../Database').AppDatabase | undefined

  afterEach(() => {
    database?.close()
    if (profile.path) rmSync(profile.path, { recursive: true, force: true })
  })

  it('preserves existing chats, messages, tasks and runs across upgrade and reopen', async () => {
    profile.path = mkdtempSync(join(tmpdir(), 'ati-schedule-schema-'))
    const { AppDatabase } = await import('../Database')
    database = AppDatabase.getInstance()
    let db = database.initialize()

    // Reconstruct the preceding occurrence schema while keeping all other production tables.
    db.exec(`
      DROP TABLE scheduled_task_run_attempts;
      ALTER TABLE scheduled_task_runs DROP COLUMN execution_chat_uuid;
      INSERT INTO chats (id, uuid, title, create_time, update_time)
        VALUES (1, 'source-chat', 'Original conversation', 1, 1);
      INSERT INTO messages (id, chat_id, chat_uuid, body)
        VALUES (1, 1, 'source-chat', '{"role":"user","content":"Keep this history"}');
      INSERT INTO scheduled_tasks (
        id, chat_uuid, goal, schedule_type, run_at, status, created_at, updated_at
      ) VALUES ('task-1', 'source-chat', 'Independent instruction', 'once', 1000, 'pending', 1, 1);
      INSERT INTO scheduled_task_runs (
        id, task_id, scheduled_for, next_attempt_at, status, created_at, updated_at
      ) VALUES ('run-1', 'task-1', 1000, 1000, 'pending', 1, 1);
    `)
    const chat = db.prepare('SELECT * FROM chats WHERE id = 1').get()
    const message = db.prepare('SELECT * FROM messages WHERE id = 1').get()
    const task = db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get('task-1')
    const run = db.prepare('SELECT * FROM scheduled_task_runs WHERE id = ?').get('run-1') as object
    database.close()

    db = database.initialize()
    expect(db.prepare('SELECT * FROM chats WHERE id = 1').get()).toEqual(chat)
    expect(db.prepare('SELECT * FROM messages WHERE id = 1').get()).toEqual(message)
    expect(db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get('task-1')).toEqual(task)
    expect(db.prepare('SELECT * FROM scheduled_task_runs WHERE id = ?').get('run-1')).toEqual({
      ...run,
      execution_chat_uuid: null
    })
    expect(db.prepare('SELECT * FROM scheduled_task_run_attempts').all()).toEqual([])

    db.prepare(`INSERT INTO scheduled_task_run_attempts
      (run_id, attempt, submission_id, chat_uuid, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run('run-1', 1, 'submission-1', 'execution-chat', 1001)
    const attempt = db.prepare('SELECT * FROM scheduled_task_run_attempts').get()
    database.close()

    db = database.initialize()
    expect(db.prepare('SELECT * FROM scheduled_task_run_attempts').all()).toEqual([attempt])
    expect(db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get('task-1')).toEqual(task)
    expect(db.prepare('SELECT * FROM messages WHERE id = 1').get()).toEqual(message)
    expect(database.initialize()).toBe(db)
  })
})
