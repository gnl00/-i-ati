import { createRequire } from 'node:module';
import type Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { MessageDao } from '../../dao/MessageDao';
import { MessageRepository } from '../MessageRepository';
import { buildContextMessages } from '@main/hosts/chat/preparation/request/buildContextMessages';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (
    path: string,
  ) => Pick<Database.Database, 'exec' | 'close' | 'prepare'>;
};
function fixture(): {
  db: InstanceType<typeof DatabaseSync>;
  dao: MessageDao;
  repo: MessageRepository;
  add(body: ChatMessage): number;
} {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id INTEGER,
    chat_uuid TEXT, body TEXT NOT NULL, tokens INTEGER, token_usage TEXT, revision INTEGER NOT NULL DEFAULT 1);
    CREATE INDEX idx_messages_chat_uuid ON messages(chat_uuid);`);
  const dao = new MessageDao(db as Database.Database);
  const repo = new MessageRepository({
    hasDb: (): boolean => true,
    getMessageRepo: (): MessageDao => dao,
    getChatRepo: (): undefined => undefined,
    getMessageSearchRepo: (): undefined => undefined,
  });
  return {
    db,
    dao,
    repo,
    add: (body) =>
      dao.insertMessage({
        chat_id: 1,
        chat_uuid: 'chat',
        revision: 1,
        body: JSON.stringify(body),
        tokens: null,
        token_usage: null,
      }),
  };
}
const summary = (ids: number[]): CompressedSummaryEntity =>
  ({
    chatId: 1,
    chatUuid: 'chat',
    messageIds: ids,
    startMessageId: Math.min(...ids),
    endMessageId: Math.max(...ids),
    summary: 'Earlier conversation',
    status: 'active',
  }) as CompressedSummaryEntity;
const message = (role: ChatMessage['role'], content: string): ChatMessage => ({
  role,
  content,
  segments: [],
});

describe('model history selection', () => {
  it('materializes only an uncovered tail while full UI history remains available', () => {
    const { db, repo, add } = fixture();
    try {
      const covered = Array.from({ length: 1200 }, () =>
        add(message('user', 'COVERED_BODY'.repeat(100))),
      );
      const userId = add(message('user', 'recent input'));
      const callId = add({
        ...message('assistant', ''),
        toolCalls: [
          {
            id: 'read-1',
            type: 'function',
            function: { name: 'read', arguments: '{}' },
          },
        ],
      });
      const toolId = add({
        ...message('tool', 'file text'),
        toolCallId: 'read-1',
        name: 'read',
      });
      const selected = repo.getMessagesForModel('chat', summary(covered));
      expect(selected.messages.map((item) => item.id)).toEqual([
        userId,
        callId,
        toolId,
      ]);
      expect(selected.summary?.summary).toBe('Earlier conversation');
      expect(JSON.stringify(selected.messages)).not.toContain('COVERED_BODY');
      const context = buildContextMessages({
        messages: selected.messages,
        summary: selected.summary,
        summaryValidated: true,
        contexts: [],
      });
      expect(context[0].content).toContain('Earlier conversation');
      expect(
        context.find((item) => item.role === 'assistant')?.toolCalls?.[0].id,
      ).toBe('read-1');
      expect(context.find((item) => item.role === 'tool')?.toolCallId).toBe(
        'read-1',
      );
      expect(repo.getMessagesByChatUuid('chat')).toHaveLength(1203);
    } finally {
      db.close();
    }
  });

  it.each(
    [
      [1, 2],
      [1, 3],
      [2, 3],
      [1, 1, 2],
    ].map((ids) => ({ ids })),
  )('falls back for split tool groups or invalid coverage $ids', ({ ids }) => {
    const { db, repo, add } = fixture();
    try {
      add(message('user', 'input'));
      add({
        ...message('assistant', ''),
        toolCalls: [
          {
            id: 'call',
            type: 'function',
            function: { name: 'read', arguments: '{}' },
          },
        ],
      });
      add({ ...message('tool', 'result'), toolCallId: 'call', name: 'read' });
      add(message('assistant', 'answer'));
      const selected = repo.getMessagesForModel('chat', summary(ids));
      expect(selected.summary).toBeNull();
      expect(selected.messages).toHaveLength(4);
    } finally {
      db.close();
    }
  });

  it('rejects foreign branch coverage and deleted source rows', () => {
    const { db, repo, dao, add } = fixture();
    try {
      add(message('user', 'one'));
      add(message('assistant', 'two'));
      add(message('user', 'three'));
      expect(
        repo.getMessagesForModel('chat', {
          ...summary([1, 2]),
          chatUuid: 'parent',
        }).summary,
      ).toBeNull();
      dao.deleteMessage(1);
      const selected = repo.getMessagesForModel('chat', summary([1, 2]));
      expect(selected.summary).toBeNull();
      expect(selected.messages.map((item) => item.id)).toEqual([2, 3]);
    } finally {
      db.close();
    }
  });
});
