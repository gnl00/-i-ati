import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { ChatDao } from '../../dao/ChatDao'
import { ScheduledTaskDao } from '../../dao/ScheduledTaskDao'
import { ScheduledTaskRepository } from '../ScheduledTaskRepository'

const profile = vi.hoisted(() => ({ path: '' }))
vi.mock('electron', () => ({ app: { getPath: (): string => profile.path } }))

const describeNative = process.versions.electron ? describe : describe.skip

describeNative('scheduled execution chat transaction with native SQLite', () => {
  let database: import('../../core/Database').AppDatabase
  let db: Database.Database
  let dao: ScheduledTaskDao
  let repository: ScheduledTaskRepository

  beforeAll(async () => {
    profile.path = mkdtempSync(join(tmpdir(), 'ati-schedule-transaction-'))
    const { AppDatabase } = await import('../../core/Database')
    database = AppDatabase.getInstance()
    db = database.initialize()
    dao = new ScheduledTaskDao(db)
    const chatDao = new ChatDao(db)
    repository = new ScheduledTaskRepository({
      hasDb: (): boolean => true,
      getDb: (): Database.Database => db,
      getScheduledTaskRepo: (): ScheduledTaskDao => dao,
      getChatRepo: (): ChatDao => chatDao
    })
  })

  afterEach(() => {
    db.exec(`
      DROP TRIGGER IF EXISTS reject_execution_binding;
      DELETE FROM scheduled_tasks;
      DELETE FROM chats;
    `)
  })

  afterAll(() => {
    database?.close()
    if (profile.path) rmSync(profile.path, { recursive: true, force: true })
  })

  function startAttempt(): void {
    db.exec(`
      INSERT INTO chats (uuid, title, create_time, update_time)
        VALUES ('source-chat', 'Original conversation', 1, 1);
      INSERT INTO scheduled_tasks (
        id, chat_uuid, goal, schedule_type, run_at, status, created_at, updated_at
      ) VALUES ('task-1', 'source-chat', 'Generate a report', 'once', 1000, 'pending', 1, 1);
      INSERT INTO scheduled_task_runs (
        id, task_id, scheduled_for, next_attempt_at, status, created_at, updated_at
      ) VALUES ('run-1', 'task-1', 1000, 1000, 'pending', 1, 1);
    `)
    dao.claimDueRuns(1000, 1)
    dao.startRunAttempt('run-1', 'submission-1', 1000)
  }

  const executionChat = (): ChatEntity => ({
    uuid: 'execution-chat',
    title: 'Generate a report',
    messages: [],
    msgCount: 0,
    modelRef: { accountId: 'test-account', modelId: 'test-model' },
    userInstruction: '',
    permissionApprovalMode: 'manual',
    createTime: 1001,
    updateTime: 1001
  })

  it('commits the empty chat, attempt association and current run chat together', () => {
    startAttempt()
    const result = repository.createExecutionChatAndBindAttempt(
      'run-1', 1, 'submission-1', executionChat(), 1001
    )

    expect(result.chat).toMatchObject({ uuid: 'execution-chat', id: expect.any(Number), messages: [] })
    expect(db.prepare('SELECT uuid FROM chats WHERE id = ?').get(result.chat.id)).toEqual({ uuid: 'execution-chat' })
    expect(result.run).toMatchObject({ id: 'run-1', execution_chat_uuid: 'execution-chat' })
    expect(db.prepare('SELECT uuid, msg_count, user_instruction FROM chats WHERE uuid = ?').get('execution-chat'))
      .toEqual({ uuid: 'execution-chat', msg_count: 0, user_instruction: '' })
    expect(dao.getRunById('run-1')?.execution_chat_uuid).toBe('execution-chat')
    expect(dao.listRunAttempts('run-1')).toEqual([{
      run_id: 'run-1', attempt: 1, submission_id: 'submission-1', chat_uuid: 'execution-chat', created_at: 1001
    }])
    expect(db.prepare('SELECT COUNT(*) AS count FROM messages').get()).toEqual({ count: 0 })
  })

  it('leaves no chat behind when the attempt was cancelled before binding', () => {
    startAttempt()
    dao.cancelTask('task-1', 'cancelled', 1001)

    expect(() => repository.createExecutionChatAndBindAttempt(
      'run-1', 1, 'submission-1', executionChat(), 1002
    )).toThrow('Scheduled run binding unavailable')

    expect(db.prepare('SELECT uuid FROM chats').all()).toEqual([{ uuid: 'source-chat' }])
    expect(dao.listRunAttempts('run-1')).toEqual([])
    expect(dao.getRunById('run-1')).toMatchObject({ status: 'cancelled', execution_chat_uuid: null })
  })

  it('rolls back the chat and inserted association when the run update fails', () => {
    startAttempt()
    db.exec(`
      CREATE TRIGGER reject_execution_binding
      BEFORE UPDATE OF execution_chat_uuid ON scheduled_task_runs
      WHEN NEW.execution_chat_uuid = 'execution-chat'
      BEGIN
        SELECT RAISE(ABORT, 'injected binding failure');
      END;
    `)

    expect(() => repository.createExecutionChatAndBindAttempt(
      'run-1', 1, 'submission-1', executionChat(), 1002
    )).toThrow('injected binding failure')

    expect(db.prepare('SELECT uuid FROM chats').all()).toEqual([{ uuid: 'source-chat' }])
    expect(dao.listRunAttempts('run-1')).toEqual([])
    expect(dao.getRunById('run-1')).toMatchObject({
      status: 'running', attempt_count: 1, submission_id: 'submission-1', execution_chat_uuid: null
    })
  })
})
