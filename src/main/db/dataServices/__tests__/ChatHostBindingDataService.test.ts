import { describe, expect, it } from 'vitest'
import { ChatHostBindingDataService } from '../ChatHostBindingDataService'

const createRepo = () => {
  const rows: any[] = []

  return {
    rows,
    insertBinding(row: any) {
      const next = { ...row, id: rows.length + 1 }
      rows.push(next)
      return next.id
    },
    getBindingByHost(hostType: string, hostChatId: string, hostThreadId?: string | null) {
      return [...rows]
        .filter(item =>
        item.host_type === hostType &&
        item.host_chat_id === hostChatId &&
        item.host_thread_id === (hostThreadId ?? null)
        )
        .sort((a, b) => (b.updated_at - a.updated_at) || (b.id - a.id))[0]
    },
    getBindingsByChatUuid(chatUuid: string) {
      return rows.filter(item => item.chat_uuid === chatUuid)
    },
    updateBindingById(id: number, row: any) {
      const index = rows.findIndex(item => item.id === id)
      if (index >= 0) {
        rows[index] = { ...rows[index], ...row, id }
      }
    },
    updateLastHostMessageId(id: number, lastHostMessageId: string | null, updatedAt: number) {
      const row = rows.find(item => item.id === id)
      if (row) {
        row.last_host_message_id = lastHostMessageId
        row.updated_at = updatedAt
      }
    },
    updateStatus(id: number, status: 'active' | 'archived', updatedAt: number) {
      const row = rows.find(item => item.id === id)
      if (row) {
        row.status = status
        row.updated_at = updatedAt
      }
    }
  }
}

describe('ChatHostBindingDataService', () => {
  it('saves and reads host bindings with metadata', () => {
    const repo = createRepo()
    const service = new ChatHostBindingDataService({
      hasDb: () => true,
      getChatHostBindingRepo: () => repo as any
    })

    const id = service.saveBinding({
      hostType: 'telegram',
      hostChatId: '123',
      hostThreadId: '99',
      hostUserId: 'u1',
      chatId: 7,
      chatUuid: 'chat-uuid',
      lastHostMessageId: 'm1',
      status: 'active',
      metadata: { chatType: 'private' },
      createTime: 1,
      updateTime: 2
    })

    const binding = service.getBindingByHost('telegram', '123', '99')

    expect(id).toBe(1)
    expect(binding).toMatchObject({
      id: 1,
      hostType: 'telegram',
      hostChatId: '123',
      hostThreadId: '99',
      hostUserId: 'u1',
      chatId: 7,
      chatUuid: 'chat-uuid',
      lastHostMessageId: 'm1',
      status: 'active'
    })
    expect(binding?.metadata).toEqual({ chatType: 'private' })
  })

  it('upserts by host tuple and updates status/message id', () => {
    const repo = createRepo()
    const service = new ChatHostBindingDataService({
      hasDb: () => true,
      getChatHostBindingRepo: () => repo as any
    })

    service.upsertBinding({
      hostType: 'telegram',
      hostChatId: 'group-1',
      chatId: 1,
      chatUuid: 'chat-1',
      status: 'active',
      createTime: 10,
      updateTime: 10
    })

    service.upsertBinding({
      hostType: 'telegram',
      hostChatId: 'group-1',
      chatId: 2,
      chatUuid: 'chat-2',
      status: 'active',
      metadata: { title: 'Group' },
      createTime: 10,
      updateTime: 11
    })

    const binding = service.getBindingByHost('telegram', 'group-1')
    expect(binding?.chatId).toBe(2)
    expect(binding?.chatUuid).toBe('chat-2')
    expect(binding?.metadata).toEqual({ title: 'Group' })

    service.updateLastHostMessageId(binding!.id!, 'msg-42')
    service.updateStatus(binding!.id!, 'archived')

    const updated = service.getBindingByHost('telegram', 'group-1')
    expect(updated?.lastHostMessageId).toBe('msg-42')
    expect(updated?.status).toBe('archived')
  })

  it('updates the latest null-thread binding instead of inserting duplicates', () => {
    const repo = createRepo()
    const service = new ChatHostBindingDataService({
      hasDb: () => true,
      getChatHostBindingRepo: () => repo as any
    })

    service.saveBinding({
      hostType: 'telegram',
      hostChatId: 'dm-1',
      chatId: 1,
      chatUuid: 'chat-1',
      status: 'active',
      createTime: 10,
      updateTime: 10
    })

    service.upsertBinding({
      hostType: 'telegram',
      hostChatId: 'dm-1',
      chatId: 2,
      chatUuid: 'chat-2',
      status: 'active',
      createTime: 10,
      updateTime: 11
    })

    expect(repo.rows).toHaveLength(1)
    expect(repo.rows[0]).toMatchObject({
      id: 1,
      chat_id: 2,
      chat_uuid: 'chat-2',
      host_thread_id: null
    })
  })
})
