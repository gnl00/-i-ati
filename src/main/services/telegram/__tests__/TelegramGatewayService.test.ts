import { beforeEach, describe, expect, it, vi } from 'vitest'
import DatabaseService from '@main/db/DatabaseService'
import { TelegramGatewayService } from '../TelegramGatewayService'
import type { TelegramInboundEnvelope } from '@main/hosts/telegram'

const {
  binding,
  chat,
  config,
  logger,
  modelRef
} = vi.hoisted(() => {
  const modelRef = {
    accountId: 'account-openai',
    modelId: 'gpt-4.1'
  }

  const chat = {
    id: 10,
    uuid: 'chat-uuid',
    title: 'Telegram Chat',
    messages: [],
    modelRef,
    createTime: 1,
    updateTime: 1
  }

  const binding = {
    id: 11,
    hostType: 'telegram',
    hostChatId: '123',
    chatId: 10,
    chatUuid: 'chat-uuid',
    status: 'active',
    createTime: 1,
    updateTime: 1
  }

  const config = {
    providerDefinitions: [
      {
        id: 'openai',
        displayName: 'OpenAI',
        adapterPluginId: 'openai-chat-compatible-adapter'
      }
    ],
    accounts: [
      {
        id: 'account-openai',
        providerId: 'openai',
        label: 'OpenAI Account',
        apiUrl: 'https://api.openai.com/v1',
        apiKey: 'key',
        models: [
          {
            id: 'gpt-4.1',
            label: 'GPT-4.1',
            type: 'llm'
          }
        ]
      }
    ],
    tools: {
      defaultModel: modelRef
    },
    telegram: {
      enabled: true,
      botToken: 'token',
      mode: 'polling'
    }
  }

  return {
    binding,
    chat,
    config,
    logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
    },
    modelRef
  }
})

vi.mock('@main/db/DatabaseService', () => ({
  default: {
    updateChatHostBindingLastMessage: vi.fn()
  }
}))

vi.mock('@main/logging/LogService', () => ({
  createLogger: vi.fn(() => logger)
}))

vi.mock('@main/orchestration/chat/run', () => ({
  RunService: vi.fn(function () {
    return {
    execute: vi.fn().mockResolvedValue({ state: 'completed' })
    }
  })
}))

vi.mock('@main/hosts/chat/config/AppConfigStore', () => ({
  AppConfigStore: vi.fn(function () {
    return {
    requireConfig: vi.fn(() => config),
    getConfig: vi.fn(() => config)
    }
  })
}))

vi.mock('@main/hosts/telegram', () => {
  return {
    TelegramAgentAdapter: vi.fn(function () {
      return {
      resolveOrCreateSession: vi.fn().mockResolvedValue({
        chat,
        binding,
        created: false
      }),
      buildRunInput: vi.fn()
      }
    })
  }
})

vi.mock('@main/hosts/telegram/runtime', () => ({
  TelegramRenderResponder: vi.fn(function () {
    return {
    handle: vi.fn()
    }
  })
}))

vi.mock('../TelegramFileService', () => ({
  TelegramFileService: vi.fn(function () {
    return {
      buildAttachmentContext: vi.fn().mockResolvedValue({
        mediaCtx: [],
        documentTextBlocks: []
      })
    }
  })
}))

vi.mock('../TelegramCommandService', () => ({
  TelegramCommandService: vi.fn(function () {
    return {
      execute: vi.fn(),
      executeCallback: vi.fn()
    }
  })
}))

const createEnvelope = (overrides: Partial<TelegramInboundEnvelope> = {}): TelegramInboundEnvelope => ({
  updateId: 42,
  messageId: '55',
  chatId: '123',
  chatType: 'supergroup',
  threadId: '9',
  fromUserId: '777',
  username: 'tester',
  displayName: 'Tester',
  text: 'hello',
  media: [],
  isMentioned: false,
  replyToBot: false,
  receivedAt: 1,
  ...overrides
})

const createService = (args: {
  sendChatAction?: ReturnType<typeof vi.fn>
  runExecute?: ReturnType<typeof vi.fn>
} = {}): TelegramGatewayService => {
  const service = new TelegramGatewayService()

  ;(service as any).logger = logger
  ;(service as any).bot = {
    api: {
      sendChatAction: args.sendChatAction ?? vi.fn().mockResolvedValue(true)
    }
  }
  ;(service as any).adapter = {
    resolveOrCreateSession: vi.fn().mockResolvedValue({
      chat,
      binding,
      created: false
    }),
    buildRunInput: vi.fn().mockReturnValue({
      submissionId: 'submission-id',
      modelRef,
      chatId: chat.id,
      chatUuid: chat.uuid,
      input: {
        textCtx: 'hello',
        mediaCtx: [],
        source: 'telegram',
        stream: true
      },
      host: {
        type: 'telegram',
        updateId: 42,
        chatId: '123',
        messageId: '55',
        chatType: 'supergroup',
        threadId: '9'
      },
      replyTarget: {
        type: 'telegram',
        chatId: '123',
        threadId: '9',
        replyToMessageId: '55'
      }
    })
  }
  ;(service as any).appConfigStore = {
    requireConfig: vi.fn(() => config),
    getConfig: vi.fn(() => config)
  }
  ;(service as any).fileService = {
    buildAttachmentContext: vi.fn().mockResolvedValue({
      mediaCtx: [],
      documentTextBlocks: []
    })
  }
  ;(service as any).runService = {
    execute: args.runExecute ?? vi.fn().mockResolvedValue({
      state: 'completed'
    })
  }

  return service
}

describe('TelegramGatewayService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends typing action once before the agent run starts', async () => {
    const sendChatAction = vi.fn().mockResolvedValue(true)
    const order: string[] = []
    const runExecute = vi.fn(async () => {
      order.push('run')
      return { state: 'completed' }
    })
    sendChatAction.mockImplementation(() => {
      order.push('typing')
      return Promise.resolve(true)
    })
    const service = createService({ sendChatAction, runExecute })

    await (service as any).handleEnvelope(createEnvelope(), modelRef)

    expect(sendChatAction).toHaveBeenCalledTimes(1)
    expect(sendChatAction).toHaveBeenCalledWith(123, 'typing', {
      message_thread_id: 9
    })
    expect(order).toEqual(['typing', 'run'])
    expect(runExecute).toHaveBeenCalledTimes(1)
  })

  it('omits thread option for chats without a thread id', async () => {
    const sendChatAction = vi.fn().mockResolvedValue(true)
    const service = createService({ sendChatAction })

    await (service as any).handleEnvelope(createEnvelope({ threadId: undefined }), modelRef)

    expect(sendChatAction).toHaveBeenCalledWith(123, 'typing', {})
  })

  it('logs typing action failures and continues the agent run', async () => {
    const sendChatAction = vi.fn().mockRejectedValue(new Error('rate limited'))
    const runExecute = vi.fn().mockResolvedValue({ state: 'completed' })
    const service = createService({ sendChatAction, runExecute })

    await (service as any).handleEnvelope(createEnvelope(), modelRef)
    await new Promise(process.nextTick)

    expect(logger.warn).toHaveBeenCalledWith('typing_action.failed', {
      updateId: 42,
      chatId: '123',
      threadId: '9',
      error: 'rate limited'
    })
    expect(runExecute).toHaveBeenCalledTimes(1)
    expect(DatabaseService.updateChatHostBindingLastMessage).toHaveBeenCalledWith(11, '55')
  })
})
