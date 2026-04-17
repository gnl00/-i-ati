import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  processTelegramSearchTargets,
  processTelegramSendMessage,
  processTelegramSetupTool
} from '../TelegramToolsProcessor'

const {
  getConfigMock,
  initConfigMock,
  saveConfigMock,
  startWithTokenMock,
  stopMock,
  getStatusMock,
  sendTextMock
} = vi.hoisted(() => ({
  getConfigMock: vi.fn(),
  initConfigMock: vi.fn(),
  saveConfigMock: vi.fn(),
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
  updateChatHostBindingLastMessageMock
} = vi.hoisted(() => ({
  getAllChatsMock: vi.fn(),
  getChatHostBindingsByChatUuidMock: vi.fn(),
  saveMessageMock: vi.fn(),
  getChatByUuidMock: vi.fn(),
  updateChatMock: vi.fn(),
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
    startWithToken: startWithTokenMock,
    stop: stopMock,
    getStatus: getStatusMock,
    sendText: sendTextMock
  }
}))

vi.mock('@main/db/DatabaseService', () => ({
  default: {
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
        defaultModel: {
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
        source: 'telegram',
        host: expect.objectContaining({
          direction: 'outbound',
          peerId: '1001',
          threadId: '7',
          messageId: '9001'
        })
      })
    }))
    expect(updateChatMock).toHaveBeenCalled()
    expect(updateChatHostBindingLastMessageMock).toHaveBeenCalledWith(11, '9001')
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
