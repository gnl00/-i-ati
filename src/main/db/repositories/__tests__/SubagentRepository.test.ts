import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { SUBAGENT_SCHEMA, SubagentRepository } from '../SubagentRepository'
import type { SubagentRecord } from '@tools/subagent/index.d'

const describeNative = process.versions.electron ? describe : describe.skip

describeNative('persisted subagent runs', () => {
  let db: Database.Database | undefined
  afterEach(() => db?.close())
  const setup = (filename = ':memory:'): SubagentRepository => {
    db = new Database(filename)
    db.pragma('foreign_keys = ON')
    db.exec('CREATE TABLE chats (uuid TEXT UNIQUE); INSERT INTO chats VALUES (\'chat\')')
    db.exec(SUBAGENT_SCHEMA)
    return new SubagentRepository(db)
  }
  const record: SubagentRecord = { id: 'child', run_id: 'run', status: 'queued', revision: 1, role: 'coder', task: 'inspect', parent_chat_uuid: 'chat', created_at: 1 }

  it('keeps terminal evidence immutable, supports fresh readers and cascades chat deletion', () => {
    const repo = setup()
    repo.save({ record, inputJson: '{"task":"inspect"}' })
    repo.save({ record: { ...record, revision: 2, status: 'completed', summary: 'done' }, inputJson: '{}', transcriptJson: '{"records":[]}' })
    repo.save({ record: { ...record, revision: 3, status: 'failed' }, inputJson: '{}' })
    const reopened = new SubagentRepository(db!)
    expect(reopened.get('child')?.record.status).toBe('completed')
    expect(reopened.get('child', 'run')?.transcriptJson).toBe('{"records":[]}')
    expect(reopened.get('child', 'other')).toBeNull()
    expect(reopened.list('chat')).toHaveLength(1)
    db!.prepare('DELETE FROM chats WHERE uuid = ?').run('chat')
    expect(reopened.get('child')).toBeNull()
  })

  it('marks abandoned runs interrupted and preserves evidence without restarting anything', () => {
    const repo = setup()
    repo.save({ record, inputJson: '{}', transcriptJson: '{"records":[]}' })
    repo.recoverInterrupted()
    expect(repo.get('child')?.record).toMatchObject({ status: 'interrupted', revision: 2 })
    expect(repo.get('child')?.transcriptJson).toBe('{"records":[]}')
    repo.recoverInterrupted()
    expect(repo.get('child')?.record.revision).toBe(2)
  })
  it('binds task receipts transactionally and keeps interrupted deliveries ambiguous', () => {
    const repo = setup()
    repo.save({ record: { ...record, status: 'completed' }, inputJson: '{}' })
    const message = { id: 'task-message', childId: record.id, sender: 'chat', body: 'continue', mode: 'task' as const }
    repo.sendMessage(message)
    const second = { ...record, run_id: 'run-2', created_at: 2, revision: 2 }
    repo.save({ record: second, inputJson: JSON.stringify({ requestMessageId: message.id }) })
    expect(repo.sendMessage(message)).toMatchObject({ runId: 'run-2', status: 'delivered' })
    expect(() => repo.sendMessage({ ...message, body: 'different' })).toThrow('different content')
    expect(() => repo.save({ record: { ...second, run_id: 'run-3', created_at: 3 }, inputJson: '{}' })).toThrow()
    expect(repo.get(record.id)?.record.run_id).toBe('run-2')
    repo.recoverInterrupted()
    expect(repo.getMessage(message.id)?.status).toBe('ambiguous')
    expect(repo.pendingMessages(record.id)).toEqual([])
    expect(repo.messagesForRun('run-2')).toHaveLength(1)
  })

  it('preserves another live process and interrupts only a provably missing owner', () => {
    const repo = setup()
    repo.save({ record, inputJson: '{}' })
    db!.prepare('UPDATE subagent_runs SET owner_pid = ?').run(process.ppid)
    repo.recoverInterrupted()
    expect(repo.get(record.id)?.record.status).toBe('queued')
    db!.prepare('UPDATE subagent_runs SET owner_pid = ?').run(2147483647)
    repo.recoverInterrupted()
    expect(repo.get(record.id)?.record.status).toBe('interrupted')
  })

  it('bounds pending messages while preserving retry identity and order', () => {
    const repo = setup()
    repo.save({ record, inputJson: '{}' })
    for (let i = 0; i < 16; i++) repo.sendMessage({ id: `message-${i}`, childId: record.id, sender: 'chat', body: String(i), mode: 'message' })
    expect(repo.pendingMessages(record.id).map(message => message.id)).toEqual(Array.from({ length: 16 }, (_, i) => `message-${i}`))
    expect(() => repo.sendMessage({ id: 'overflow', childId: record.id, sender: 'chat', body: 'overflow', mode: 'message' })).toThrow('full')
    expect(repo.sendMessage({ id: 'message-0', childId: record.id, sender: 'chat', body: '0', mode: 'message' }).status).toBe('pending')
    const task = repo.sendMessage({ id: 'continue-full-inbox', childId: record.id, sender: 'chat', body: 'Continue and consume the inbox.', mode: 'task' })
    expect(task.status).toBe('pending')
    repo.deliverMessage(task.id, record.run_id!)
    expect(repo.pendingMessages(record.id)).toHaveLength(16)
  })

  it('holds the SQLite writer lock before checking inbox capacity', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ati-subagent-inbox-'))
    let peer: Database.Database | undefined
    try {
      const filename = join(directory, 'chat.db')
      const repo = setup(filename)
      peer = new Database(filename, { timeout: 0 })
      repo.save({ record, inputJson: '{}' })
      for (let i = 0; i < 15; i++) repo.sendMessage({ id: `message-${i}`, childId: record.id, sender: 'chat', body: String(i), mode: 'message' })
      const prepare = db!.prepare.bind(db!)
      let attempted = false
      const spy = vi.spyOn(db!, 'prepare').mockImplementation((sql: string): Database.Statement => {
        if (sql.startsWith('SELECT COUNT(*)')) {
          attempted = true
          expect(() => peer!.prepare("INSERT INTO subagent_messages (id, child_id, sender, body, mode, status) VALUES ('competitor', 'child', 'chat', 'racing message', 'message', 'pending')").run()).toThrow(/locked/)
        }
        return prepare(sql)
      })
      try {
        repo.sendMessage({ id: 'message-15', childId: record.id, sender: 'chat', body: 'last slot', mode: 'message' })
        expect(attempted).toBe(true)
        expect(repo.pendingMessages(record.id)).toHaveLength(16)
      } finally {
        spy.mockRestore()
      }
    } finally {
      peer?.close()
      db?.close()
      db = undefined
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('selects the newest admitted run even when the wall clock moves backwards', () => {
    const repo = setup()
    repo.save({ record: { ...record, status: 'completed', created_at: 10000 }, inputJson: '{}' })
    repo.save({ record: { ...record, run_id: 'new-run', created_at: 1, revision: 2 }, inputJson: '{}' })
    expect(repo.get(record.id)?.record.run_id).toBe('new-run')
    expect(repo.list('chat')[0].run_id).toBe('new-run')
  })

})
