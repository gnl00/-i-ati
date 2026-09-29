import { describe, expect, it, vi } from 'vitest'
const { bindings } = vi.hoisted(() => ({ bindings: vi.fn() }))
vi.mock('@main/db/chat', () => ({ chatDb: { getChatHostBindingsByChatUuid: bindings } }))
import { resolveTelegramApprovalTargets } from '../TelegramApprovalTargets'

describe('Telegram approval targets', () => {
  it('routes a desktop request to active bindings, deduplicates peers/topics and excludes archived hosts', () => {
    bindings.mockReturnValue([
      { hostType: 'telegram', status: 'active', hostChatId: '123', hostThreadId: '9' },
      { hostType: 'telegram', status: 'active', hostChatId: '123', hostThreadId: '9' },
      { hostType: 'telegram', status: 'active', hostChatId: '123', hostThreadId: '10' },
      { hostType: 'telegram', status: 'archived', hostChatId: '456' },
      { hostType: 'other', status: 'active', hostChatId: '789' }
    ])
    expect(resolveTelegramApprovalTargets('chat')).toEqual([{ peerId: '123', threadId: '9' }, { peerId: '123', threadId: '10' }])
    expect(bindings).toHaveBeenCalledWith('chat')
  })
  it('retains the trusted originating Telegram peer when binding persistence is unavailable', () => {
    bindings.mockReturnValue([])
    expect(resolveTelegramApprovalTargets('chat', { type: 'telegram', direction: 'inbound', peerId: '123', threadId: '9' })).toEqual([{ peerId: '123', threadId: '9' }])
    expect(resolveTelegramApprovalTargets('chat')).toEqual([])
  })
})
