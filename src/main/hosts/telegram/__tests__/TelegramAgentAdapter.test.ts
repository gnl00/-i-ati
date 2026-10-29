import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TelegramAgentAdapter } from '../TelegramAgentAdapter'
import type { TelegramInboundEnvelope } from '../types'

const { getReplyChat, getChat, resolveOrCreate, getConversation, setConversation } = vi.hoisted(() => ({
  getConversation: vi.fn(), setConversation: vi.fn(), getReplyChat: vi.fn(), getChat: vi.fn(), resolveOrCreate: vi.fn()
}))
vi.mock('@main/db/chat', () => ({ chatDb: { getTelegramConversation: getConversation, setTelegramConversation: setConversation, getTelegramReplyChat: getReplyChat, getChatByUuid: getChat } }))
vi.mock('@main/hosts/shared/HostChatBindingService', () => ({
  HostChatBindingService: class { resolveOrCreate = resolveOrCreate }
}))

const envelope: TelegramInboundEnvelope = {
  updateId: 1, messageId: '21', chatId: '1001', chatType: 'private', text: 'reply',
  media: [], isMentioned: false, replyToBot: true, replyToMessageId: '20', receivedAt: 1
}
const modelRef = { accountId: 'account', modelId: 'model' }
const source = { id: 2, uuid: 'medicine', title: 'Medicine', messages: [], createTime: 1, updateTime: 1 }

describe('Telegram reply routing', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    resolveOrCreate.mockResolvedValue({ chat: { ...source, uuid: 'gold' }, binding: { id: 1 }, created: false })
  })

  it('routes a reply to its recorded source and makes it the default conversation', async () => {
    getReplyChat.mockReturnValue('medicine')
    getChat.mockReturnValue(source)
    const result = await new TelegramAgentAdapter().resolveOrCreateSession({ ...envelope, threadId: '9' }, modelRef, 'bot')
    expect(getReplyChat).toHaveBeenCalledWith('bot', '1001', '20', '9')
    expect(result).toEqual({ chat: source, created: false })
    expect(resolveOrCreate).not.toHaveBeenCalled()
    expect(setConversation).toHaveBeenCalledWith(expect.objectContaining({ botId: 'bot', hostChatId: '1001', hostThreadId: '9', chatUuid: 'medicine' }))
  })

  it('continues the latest delivered conversation and preserves an explicit reply for the next message', async () => {
    let current = 'scheduler'
    getConversation.mockImplementation((_bot, _peer, _topic, messageId) => messageId === '20' ? 'medicine' : current)
    setConversation.mockImplementation(target => { current = target.chatUuid })
    getChat.mockImplementation(uuid => ({ ...source, uuid }))
    const adapter = new TelegramAgentAdapter()
    const ordinary = { ...envelope, replyToBot: false }
    expect((await adapter.resolveOrCreateSession(ordinary, modelRef, 'bot')).chat.uuid).toBe('scheduler')
    expect((await adapter.resolveOrCreateSession(envelope, modelRef, 'bot')).chat.uuid).toBe('medicine')
    expect((await adapter.resolveOrCreateSession(ordinary, modelRef, 'bot')).chat.uuid).toBe('medicine')
    expect(resolveOrCreate).not.toHaveBeenCalled()
  })

  it.each([
    { replyToBot: false }, { replyToMessageId: undefined }
  ])('uses ordinary inbound routing for %j', async (patch) => {
    const result = await new TelegramAgentAdapter().resolveOrCreateSession({ ...envelope, ...patch }, modelRef, 'bot')
    expect(result.chat.uuid).toBe('gold')
    expect(getReplyChat).not.toHaveBeenCalled()
    expect(resolveOrCreate).toHaveBeenCalledTimes(1)
  })

  it('falls back for unknown receipts, deleted sources, and missing bot identity', async () => {
    const adapter = new TelegramAgentAdapter()
    expect((await adapter.resolveOrCreateSession(envelope, modelRef, 'bot')).chat.uuid).toBe('gold')
    getReplyChat.mockReturnValue('deleted')
    expect((await adapter.resolveOrCreateSession(envelope, modelRef, 'bot')).chat.uuid).toBe('gold')
    getReplyChat.mockClear()
    await adapter.resolveOrCreateSession(envelope, modelRef)
    expect(getReplyChat).not.toHaveBeenCalled()
  })
})
