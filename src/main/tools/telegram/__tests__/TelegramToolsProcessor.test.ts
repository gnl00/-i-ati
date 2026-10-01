import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  processTelegramGateway,
  processTelegramSearchTargets,
  processTelegramSendMessage,
  processTelegramSetupTool
} from '../TelegramToolsProcessor'

const {
  getConfigMock,
  initConfigMock,
  saveConfigMock,
  startMock,
  startWithTokenMock,
  stopMock,
  getStatusMock,
  sendTextMock
} = vi.hoisted(() => ({
  getConfigMock: vi.fn(),
  initConfigMock: vi.fn(),
  saveConfigMock: vi.fn(),
  startMock: vi.fn(),
  startWithTokenMock: vi.fn(),
  stopMock: vi.fn(),
  getStatusMock: vi.fn(),
  sendTextMock: vi.fn()
}))

const {
  getAllChatsMock,
  getChatHostBindingsByChatUuidMock,
  saveMessageMock,
  getChatByUuidMock,
  updateChatMock,
  updateChatHostBindingLastMessageMock,
  getTelegramTargetMock,
  saveTelegramTargetMock,
  saveTelegramReceiptMock
} = vi.hoisted(() => ({
  getAllChatsMock: vi.fn(),
  getChatHostBindingsByChatUuidMock: vi.fn(),
  saveMessageMock: vi.fn(),
  getChatByUuidMock: vi.fn(),
  updateChatMock: vi.fn(),
  getTelegramTargetMock: vi.fn(),
  saveTelegramTargetMock: vi.fn(),
  saveTelegramReceiptMock: vi.fn(),
  updateChatHostBindingLastMessageMock: vi.fn()
}))

vi.mock('@main/db/config', () => ({
  configDb: {
    getConfig: getConfigMock,
    initConfig: initConfigMock,
    saveConfig: saveConfigMock
  }
}))

vi.mock('@main/services/telegram', () => ({
  telegramGatewayService: {
    start: startMock,
    startWithToken: startWithTokenMock,
    stop: stopMock,
    getStatus: getStatusMock,
    sendText: sendTextMock
  }
}))

vi.mock('@main/db/DatabaseService', () => ({
  default: {
    getTelegramTarget: getTelegramTargetMock,
    saveTelegramTarget: saveTelegramTargetMock,
    saveTelegramReceipt: saveTelegramReceiptMock,
    getAllChats: getAllChatsMock,
    getChatHostBindingsByChatUuid: getChatHostBindingsByChatUuidMock,
    saveMessage: saveMessageMock,
    getChatByUuid: getChatByUuidMock,
    updateChat: updateChatMock,
    updateChatHostBindingLastMessage: updateChatHostBindingLastMessageMock
  }
}))

describe('TelegramToolsProcessor', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    startWithTokenMock.mockResolvedValue(undefined)
    sendTextMock.mockResolvedValue({ ok: true, messageId: '9001' })
    getStatusMock.mockReturnValue({
      running: true,
      starting: false,
      configured: true,
      enabled: true,
      botUsername: 'ati_bot',
      botId: '123'
    })
    getAllChatsMock.mockReturnValue([])
    getChatHostBindingsByChatUuidMock.mockReturnValue([])
    saveMessageMock.mockReturnValue(77)
    updateChatMock.mockReturnValue(undefined)
    updateChatHostBindingLastMessageMock.mockReturnValue(undefined)
  })

  it('records every overflow receipt and reports partial delivery without retrying', async () => {
    getChatByUuidMock.mockReturnValue({ id: 1, uuid: 'source', title: 'Source', messages: [] })
    sendTextMock.mockResolvedValue({ ok: true, messageId: '9001', messageIds: ['9001', '9002'], partial: true })
    const result = await processTelegramSendMessage({ chat_uuid: 'source', chat_id: '123', text: 'x'.repeat(5000) })
    expect(result).toMatchObject({ success: true, deliveryComplete: false, sentMessageIds: ['9001', '9002'], deliveryRecorded: true })
    expect(result.message).toContain('Do not resend')
    expect(sendTextMock).toHaveBeenCalledTimes(1)
    expect(saveTelegramReceiptMock.mock.calls.map(([, id]) => id)).toEqual(['9001', '9002'])
    expect(saveMessageMock.mock.calls[0][0].body.content).toContain('Telegram delivery was incomplete.')
  })

  it('rejects oversized proactive text before saving a target or sending', async () => {
    const result = await processTelegramSendMessage({ text: 'x'.repeat(30001), chat_uuid: 'source' })
    expect(result).toMatchObject({ success: false, message: 'text must be at most 30000 characters.' })
    expect(saveTelegramTargetMock).not.toHaveBeenCalled()
    expect(sendTextMock).not.toHaveBeenCalled()
  })

  it('requires bot_token', async () => {
    const result = await processTelegramSetupTool({})

    expect(result.success).toBe(false)
    expect(result.message).toContain('bot_token')
    expect(startWithTokenMock).not.toHaveBeenCalled()
    expect(saveConfigMock).not.toHaveBeenCalled()
  })

  it('starts gateway and saves telegram config after startup', async () => {
    const config = {
      version: 2,
      providerDefinitions: [
        {
          id: 'openrouter',
          displayName: 'OpenRouter',
          adapterPluginId: 'openai-response-compatible-adapter'
        }
      ],
      accounts: [
        {
          id: 'acc-1',
          providerId: 'openrouter',
          label: 'OpenRouter Main',
          apiUrl: 'https://openrouter.ai/api/v1',
          apiKey: 'sk-test',
          models: []
        }
      ],
      tools: {
        mainModel: {
          accountId: 'acc-1',
          modelId: 'gpt-5.4'
        }
      },
      telegram: {
        enabled: false,
        mode: 'polling',
        dmPolicy: 'open'
      }
    }
    getConfigMock.mockReturnValue(config)

    const result = await processTelegramSetupTool({
      bot_token: ' 123:abc '
    })

    expect(startWithTokenMock).toHaveBeenCalledWith('123:abc')
    expect(saveConfigMock).toHaveBeenCalledWith({
      version: 2,
      tools: config.tools,
      telegram: {
        ...config.telegram,
        enabled: true,
        botToken: '123:abc',
        botUsername: 'ati_bot',
        botId: '123',
        mode: 'polling'
      }
    })
    expect(result.success).toBe(true)
    expect(result.botUsername).toBe('ati_bot')
  })

  it('does not save config when startup fails', async () => {
    getConfigMock.mockReturnValue({ version: 2, tools: {} })
    startWithTokenMock.mockRejectedValue(new Error('bad token'))

    const result = await processTelegramSetupTool({
      bot_token: 'bad-token'
    })

    expect(result.success).toBe(false)
    expect(result.message).toContain('bad token')
    expect(saveConfigMock).not.toHaveBeenCalled()
  })

  it('stops gateway when config save fails after startup', async () => {
    getConfigMock.mockReturnValue({ version: 2, tools: {}, telegram: {} })
    saveConfigMock.mockImplementation(() => {
      throw new Error('disk full')
    })

    const result = await processTelegramSetupTool({
      bot_token: '123:abc'
    })

    expect(stopMock).toHaveBeenCalledTimes(1)
    expect(result.success).toBe(false)
    expect(result.message).toContain('disk full')
  })

  it('searches Telegram targets from existing chat bindings', async () => {
    getAllChatsMock.mockReturnValue([
      {
        id: 1,
        uuid: 'chat-1',
        title: 'Alice Telegram',
        messages: [],
        createTime: 10,
        updateTime: 100
      },
      {
        id: 2,
        uuid: 'chat-2',
        title: 'Dev Group',
        messages: [],
        createTime: 20,
        updateTime: 200
      }
    ])
    getChatHostBindingsByChatUuidMock.mockImplementation((chatUuid: string) => {
      if (chatUuid === 'chat-1') {
        return [{
          id: 11,
          hostType: 'telegram',
          hostChatId: '1001',
          hostUserId: '501',
          chatId: 1,
          chatUuid: 'chat-1',
          status: 'active',
          metadata: {
            chatType: 'private',
            username: 'alice',
            displayName: 'Alice'
          },
          createTime: 10,
          updateTime: 110
        }]
      }

      if (chatUuid === 'chat-2') {
        return [{
          id: 12,
          hostType: 'telegram',
          hostChatId: '-1002002',
          hostThreadId: '12',
          chatId: 2,
          chatUuid: 'chat-2',
          status: 'active',
          metadata: {
            chatType: 'supergroup',
            username: 'dev_group',
            displayName: 'Dev Group'
          },
          createTime: 20,
          updateTime: 220
        }]
      }

      return []
    })

    const result = await processTelegramSearchTargets({
      query: 'alice',
      limit: 5
    })

    expect(result.success).toBe(true)
    expect(result.count).toBe(1)
    expect(result.items[0]).toMatchObject({
      targetChatUuid: 'chat-1',
      chatTitle: 'Alice Telegram',
      telegramChatId: '1001',
      telegramUserId: '501',
      username: 'alice',
      displayName: 'Alice',
      chatType: 'private'
    })
    expect(result.items[0].matchReasons).toContain('username')
  })

  it('sends a Telegram message using the current chat binding and persists the outbound message', async () => {
    getChatHostBindingsByChatUuidMock.mockImplementation((chatUuid: string) => {
      if (chatUuid === 'chat-1') {
        return [{
          id: 11,
          hostType: 'telegram',
          hostChatId: '1001',
          hostThreadId: '7',
          hostUserId: '501',
          chatId: 1,
          chatUuid: 'chat-1',
          status: 'active',
          metadata: {
            chatType: 'private',
            username: 'alice',
            displayName: 'Alice'
          },
          createTime: 10,
          updateTime: 110
        }]
      }

      return []
    })
    getAllChatsMock.mockReturnValue([{
      id: 1,
      uuid: 'chat-1',
      title: 'Alice Telegram',
      messages: [1, 2],
      createTime: 10,
      updateTime: 100
    }])
    getChatByUuidMock.mockReturnValue({
      id: 1,
      uuid: 'chat-1',
      title: 'Alice Telegram',
      messages: [1, 2],
      createTime: 10,
      updateTime: 100
    })

    const result = await processTelegramSendMessage({
      text: 'hello from tool',
      chat_uuid: 'chat-1'
    })

    expect(result.success).toBe(true)
    expect(sendTextMock).toHaveBeenCalledWith({
      chatId: '1001',
      text: 'hello from tool',
      threadId: '7',
      replyToMessageId: undefined
    })
    expect(saveMessageMock).toHaveBeenCalledWith(expect.objectContaining({
      chatId: 1,
      chatUuid: 'chat-1',
      body: expect.objectContaining({
        role: 'assistant',
        content: 'hello from tool',
        source: 'telegram_delivery',
        host: expect.objectContaining({
          direction: 'outbound',
          peerId: '1001',
          threadId: '7',
          messageId: '9001'
        })
      })
    }))
    expect(updateChatMock).toHaveBeenCalled()
    expect(updateChatHostBindingLastMessageMock).not.toHaveBeenCalled()
    expect(saveTelegramReceiptMock).toHaveBeenCalledWith(expect.objectContaining({ chatUuid: 'chat-1', botId: '123' }), '9001', 77)
  })

  const source = { id: 2, uuid: 'medicine', title: 'Medicine', messages: [10], createTime: 1, updateTime: 2 }
  const targetChat = { id: 1, uuid: 'gold', title: 'Gold', messages: [1], createTime: 1, updateTime: 2 }
  const binding = { id: 11, hostType: 'telegram', hostChatId: '1001', chatId: 1, chatUuid: 'gold',
    status: 'active', metadata: { chatType: 'private' }, createTime: 1, updateTime: 2 }
  const setupCrossChat = (): void => {
    getChatByUuidMock.mockImplementation((uuid: string) => uuid === 'medicine' ? source : uuid === 'gold' ? targetChat : undefined)
    getAllChatsMock.mockReturnValue([targetChat])
    getChatHostBindingsByChatUuidMock.mockImplementation((uuid: string) => uuid === 'gold' ? [binding] : [])
  }

  it('records a cross-chat send in its source and associates the recipient without rebinding inbound', async () => {
    setupCrossChat()
    const result = await processTelegramSendMessage({ text: 'reminder', chat_uuid: 'medicine', target_chat_uuid: 'gold' })
    expect(saveMessageMock).toHaveBeenCalledWith(expect.objectContaining({ chatId: 2, chatUuid: 'medicine', body: expect.objectContaining({ content: 'reminder', source: 'telegram_delivery' }) }))
    expect(result).toMatchObject({ success: true, sourceChatUuid: 'medicine', deliveryRecorded: true })
    expect(saveTelegramTargetMock).toHaveBeenCalledWith(expect.objectContaining({ chatId: 2, chatUuid: 'medicine', hostChatId: '1001', botId: '123' }))
    expect(updateChatMock).toHaveBeenCalledWith(expect.objectContaining({ uuid: 'medicine', messages: [10, 77] }))
    expect(updateChatHostBindingLastMessageMock).not.toHaveBeenCalled()
  })

  it('reuses the saved delivery target for a chat without an inbound binding', async () => {
    setupCrossChat()
    getTelegramTargetMock.mockReturnValue({ chatId: 2, chatUuid: 'medicine', botId: '123', hostChatId: '2002', hostThreadId: '9' })
    await processTelegramSendMessage({ text: 'next', chat_uuid: 'medicine' })
    expect(getTelegramTargetMock).toHaveBeenCalledWith('medicine', '123')
    expect(sendTextMock).toHaveBeenCalledWith(expect.objectContaining({ chatId: '2002', threadId: '9' }))
  })

  it('associates the only reachable recipient automatically', async () => {
    setupCrossChat()
    expect(await processTelegramSendMessage({ text: 'reminder', chat_uuid: 'medicine' })).toMatchObject({ success: true })
    expect(sendTextMock).toHaveBeenCalledWith(expect.objectContaining({ chatId: '1001' }))
  })

  it('deduplicates peers but requires selection for different recipients or topics', async () => {
    setupCrossChat()
    getChatHostBindingsByChatUuidMock.mockImplementation((uuid: string) => uuid === 'gold' ? [binding, { ...binding, id: 12 }] : [])
    expect((await processTelegramSendMessage({ text: 'one', chat_uuid: 'medicine' })).success).toBe(true)
    sendTextMock.mockClear()
    saveTelegramTargetMock.mockClear()
    getChatHostBindingsByChatUuidMock.mockImplementation((uuid: string) => uuid === 'gold' ? [binding, { ...binding, id: 12, hostThreadId: '9' }] : [])
    const result = await processTelegramSendMessage({ text: 'ambiguous', chat_uuid: 'medicine' })
    expect(result).toMatchObject({ success: false, candidates: expect.any(Array) })
    expect(result.candidates).toHaveLength(2)
    expect(sendTextMock).not.toHaveBeenCalled()
    expect(saveTelegramTargetMock).not.toHaveBeenCalled()
  })

  it('honors explicit peer selection even when the current chat has a binding', async () => {
    setupCrossChat()
    await processTelegramSendMessage({ text: 'override', chat_uuid: 'gold', chat_id: '2002', thread_id: '8' })
    expect(sendTextMock).toHaveBeenCalledWith(expect.objectContaining({ chatId: '2002', threadId: '8' }))
  })

  it('does not fall back from invalid explicit targets or archived current bindings', async () => {
    setupCrossChat()
    expect((await processTelegramSendMessage({ text: 'invalid', chat_uuid: 'medicine', target_chat_uuid: 'missing' })).success).toBe(false)
    getChatHostBindingsByChatUuidMock.mockReturnValue([{ ...binding, status: 'archived' }])
    expect((await processTelegramSendMessage({ text: 'archived', chat_uuid: 'gold' })).message).toContain('archived')
    expect(sendTextMock).not.toHaveBeenCalled()
  })

  it('requires a source chat and fails before sending if association persistence fails', async () => {
    setupCrossChat()
    expect((await processTelegramSendMessage({ text: 'no source', target_chat_uuid: 'gold' })).success).toBe(false)
    saveTelegramTargetMock.mockImplementation(() => { throw new Error('database unavailable') })
    expect((await processTelegramSendMessage({ text: 'failed association', chat_uuid: 'medicine' })).success).toBe(false)
    expect(sendTextMock).not.toHaveBeenCalled()
  })

  it('does not record successful delivery after a network failure', async () => {
    setupCrossChat()
    sendTextMock.mockRejectedValue(new Error('network unavailable'))
    expect((await processTelegramSendMessage({ text: 'failed', chat_uuid: 'medicine' })).success).toBe(false)
    expect(saveMessageMock).not.toHaveBeenCalled()
    expect(saveTelegramReceiptMock).not.toHaveBeenCalled()
  })

  it('reports sent success separately when local receipt persistence fails', async () => {
    setupCrossChat()
    saveTelegramReceiptMock.mockImplementation(() => { throw new Error('disk full') })
    const result = await processTelegramSendMessage({ text: 'sent', chat_uuid: 'medicine' })
    expect(result).toMatchObject({ success: true, sentMessageId: '9001', deliveryRecorded: false })
    expect(result.message).toContain('Do not resend')
    expect(sendTextMock).toHaveBeenCalledTimes(1)
  })

  it('fails Telegram send when the gateway is not running', async () => {
    getStatusMock.mockReturnValue({
      running: false,
      starting: false,
      configured: true,
      enabled: true,
      botUsername: 'ati_bot',
      botId: '123'
    })
    getChatByUuidMock.mockReturnValue({
      id: 1,
      uuid: 'chat-1',
      title: 'Alice Telegram',
      messages: [],
      createTime: 10,
      updateTime: 100
    })
    getChatHostBindingsByChatUuidMock.mockReturnValue([{
      id: 11,
      hostType: 'telegram',
      hostChatId: '1001',
      chatId: 1,
      chatUuid: 'chat-1',
      status: 'active',
      createTime: 10,
      updateTime: 110
    }])

    const result = await processTelegramSendMessage({
      text: 'hello from tool',
      chat_uuid: 'chat-1'
    })

    expect(result.success).toBe(false)
    expect(result.message).toContain('not running')
    expect(sendTextMock).not.toHaveBeenCalled()
  })
})

describe('tg_gateway_tool', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    getStatusMock.mockReturnValue({
      running: false, starting: false, configured: true, enabled: true,
      hasMainModel: true, lastUpdateId: 0
    })
  })

  it('returns status without starting, stopping, or changing config', async () => {
    const result = await processTelegramGateway({ action: 'status' })
    expect(result).toMatchObject({ success: true, action: 'status', status: { running: false } })
    expect(startMock).not.toHaveBeenCalled()
    expect(stopMock).not.toHaveBeenCalled()
    expect(saveConfigMock).not.toHaveBeenCalled()
  })

  it('queues startup and returns the starting state', async () => {
    startMock.mockImplementation(async () => {
      getStatusMock.mockReturnValue({ running: false, starting: true })
    })
    expect(await processTelegramGateway({ action: 'start' })).toMatchObject({
      success: true, status: { running: false, starting: true }
    })
    expect(startMock).toHaveBeenCalledOnce()
    expect(startWithTokenMock).not.toHaveBeenCalled()
    expect(saveConfigMock).not.toHaveBeenCalled()
  })

  it('reports an already running gateway', async () => {
    getStatusMock.mockReturnValue({ running: true, starting: false })
    expect(await processTelegramGateway({ action: 'start' })).toMatchObject({ success: true })
  })

  it.each([
    [{ configured: false }, 'telegram_setup_tool'],
    [{ enabled: false }, 'Enable Telegram'],
    [{ hasMainModel: false }, 'main model'],
    [{ lastError: 'Network failed' }, 'status.lastError']
  ])('reports skipped startup for %j', async (status, message) => {
    getStatusMock.mockReturnValue({
      running: false, starting: false, configured: true, enabled: true,
      hasMainModel: true, ...status
    })
    const result = await processTelegramGateway({ action: 'start' })
    expect(result.success).toBe(false)
    expect(result.message).toContain(message)
  })

  it('stops the gateway without changing configuration', async () => {
    const result = await processTelegramGateway({ action: 'stop' })
    expect(stopMock).toHaveBeenCalledOnce()
    expect(result).toMatchObject({ success: true, status: { running: false, starting: false } })
    expect(saveConfigMock).not.toHaveBeenCalled()
  })

  it('reports startup exceptions', async () => {
    startMock.mockRejectedValue(new Error('Config unavailable'))
    expect(await processTelegramGateway({ action: 'start' })).toMatchObject({
      success: false, message: 'Telegram gateway start failed: Config unavailable'
    })
  })

  it.each([undefined, 'restart', ''])('rejects invalid action %s without side effects', async action => {
    expect(await processTelegramGateway({ action } as Parameters<typeof processTelegramGateway>[0])).toMatchObject({ success: false })
    expect(startMock).not.toHaveBeenCalled()
    expect(stopMock).not.toHaveBeenCalled()
    expect(getStatusMock).not.toHaveBeenCalled()
  })
})
