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
  const visionModelRef = {
    accountId: 'account-openai',
    modelId: 'gpt-4o-vision'
  }

  const chat = {
    id: 10,
    uuid: 'chat-uuid',
    title: 'NewChat',
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
          },
          {
            id: 'gpt-4o-vision',
            label: 'GPT-4o Vision',
            type: 'vlm'
          }
        ]
      }
    ],
    tools: {
      mainModel: modelRef,
      visionModel: visionModelRef
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
      executeCallback: vi.fn(),
      registerActiveSubmission: vi.fn(),
      unregisterActiveSubmission: vi.fn(),
      hasActiveSubmission: vi.fn(() => false)
    }
  })
}))

const flushPromises = async (): Promise<void> => {
  await new Promise(process.nextTick)
}

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
  sendMessage?: ReturnType<typeof vi.fn>
  runExecute?: ReturnType<typeof vi.fn>
  hasActiveSubmission?: ReturnType<typeof vi.fn>
  attachmentContext?: {
    mediaCtx: any[]
    documentTextBlocks: string[]
  }
} = {}): TelegramGatewayService => {
  const service = new TelegramGatewayService()

  ;(service as any).logger = logger
  ;(service as any).bot = {
    api: {
      sendChatAction: args.sendChatAction ?? vi.fn().mockResolvedValue(true),
      sendMessage: args.sendMessage ?? vi.fn().mockResolvedValue({ message_id: 77 })
    }
  }
  ;(service as any).adapter = {
    resolveOrCreateSession: vi.fn().mockResolvedValue({
      chat,
      binding,
      created: false
    }),
    buildRunInput: vi.fn((inputArgs) => ({
      submissionId: 'submission-id',
      modelRef: inputArgs.modelRef,
      chatModelRef: inputArgs.chatModelRef,
      chatId: chat.id,
      chatUuid: chat.uuid,
      input: {
        textCtx: 'hello',
        mediaCtx: inputArgs.mediaCtx,
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
    }))
  }
  ;(service as any).appConfigStore = {
    requireConfig: vi.fn(() => config),
    getConfig: vi.fn(() => config)
  }
  ;(service as any).fileService = {
    buildAttachmentContext: vi.fn().mockResolvedValue(args.attachmentContext ?? {
      mediaCtx: [],
      documentTextBlocks: []
    })
  }
  ;(service as any).runService = {
    execute: args.runExecute ?? vi.fn().mockResolvedValue({
      state: 'completed'
    }),
    resolveToolConfirmation: vi.fn()
  }
  if (args.hasActiveSubmission) {
    ;(service as any).commandService.hasActiveSubmission = args.hasActiveSubmission
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

  it('returns after starting the agent run so stop commands can be handled', async () => {
    let resolveRun: (value: { state: 'completed' }) => void = () => undefined
    const runExecute = vi.fn(() => new Promise<{ state: 'completed' }>((resolve) => {
      resolveRun = resolve
    }))
    const service = createService({ runExecute })

    await (service as any).handleEnvelope(createEnvelope(), modelRef)

    expect(runExecute).toHaveBeenCalledTimes(1)
    expect(DatabaseService.updateChatHostBindingLastMessage).toHaveBeenCalledTimes(0)

    resolveRun({ state: 'completed' })
    await flushPromises()

    expect(DatabaseService.updateChatHostBindingLastMessage).toHaveBeenCalledWith(11, '55')
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
    await flushPromises()

    expect(logger.warn).toHaveBeenCalledWith('typing_action.failed', {
      updateId: 42,
      chatId: '123',
      threadId: '9',
      error: 'rate limited'
    })
    expect(runExecute).toHaveBeenCalledTimes(1)
    expect(DatabaseService.updateChatHostBindingLastMessage).toHaveBeenCalledWith(11, '55')
  })

  it('registers and unregisters active submissions with matching ids', async () => {
    const runExecute = vi.fn().mockResolvedValue({ state: 'completed' })
    const service = createService({ runExecute })
    const commandService = (service as any).commandService

    await (service as any).handleEnvelope(createEnvelope(), modelRef)

    expect(commandService.registerActiveSubmission).toHaveBeenCalledWith('123:9', 'submission-id')

    await flushPromises()

    expect(commandService.unregisterActiveSubmission).toHaveBeenCalledWith('123:9', 'submission-id')
  })

  it('logs run failures and clears the matching active submission', async () => {
    const runError = new Error('boom')
    const runExecute = vi.fn().mockRejectedValue(runError)
    const service = createService({ runExecute })
    const commandService = (service as any).commandService

    await (service as any).handleEnvelope(createEnvelope(), modelRef)
    await flushPromises()

    expect(logger.error).toHaveBeenCalledWith('update.run_failed', runError)
    expect(commandService.unregisterActiveSubmission).toHaveBeenCalledWith('123:9', 'submission-id')
  })

  it('keeps chat model for Telegram media and passes mediaCtx into the shared run path', async () => {
    const runExecute = vi.fn().mockResolvedValue({ state: 'completed' })
    const service = createService({
      runExecute,
      attachmentContext: {
        mediaCtx: [{
          type: 'image_url',
          image_url: { url: 'data:image/png;base64,abc' }
        }],
        documentTextBlocks: []
      }
    })

    await (service as any).handleEnvelope(createEnvelope({
      media: [{ kind: 'photo', fileId: 'file-1' }] as any
    }), modelRef)

    expect(runExecute).toHaveBeenCalledTimes(1)
    expect(runExecute.mock.calls[0][0].modelRef).toEqual(modelRef)
    expect(runExecute.mock.calls[0][0].chatModelRef).toEqual(modelRef)
    expect(runExecute.mock.calls[0][0].input.mediaCtx).toHaveLength(1)
    expect(logger.info).toHaveBeenCalledWith('model.selected', expect.objectContaining({
      model: 'account-openai/gpt-4.1',
      mediaCount: 1
    }))
  })

  it('sends Telegram approval buttons for tool confirmation events', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ message_id: 91 })
    const runExecute = vi.fn(async (_input, options) => {
      await options.eventSinks[0].handleEvent({
        type: 'tool.confirmation.required',
        payload: {
          toolCallId: 'call-1',
          name: 'execute_command'
        },
        submissionId: 'submission-id',
        sequence: 1,
        timestamp: 1
      })
      return { state: 'completed' }
    })
    const service = createService({ sendMessage, runExecute })

    await (service as any).handleEnvelope(createEnvelope(), modelRef)
    await flushPromises()

    expect(sendMessage).toHaveBeenCalledWith(
      123,
      '<blockquote>tool execute command needs approval</blockquote>',
      expect.objectContaining({
        parse_mode: 'HTML',
        message_thread_id: 9,
        reply_parameters: { message_id: 55 },
        reply_markup: {
          inline_keyboard: [[
            { text: 'Approve', callback_data: 'tgcmd:tool_confirm:approve:call-1' },
            { text: 'Deny', callback_data: 'tgcmd:tool_confirm:deny:call-1' }
          ]]
        }
      })
    )
  })

  it('does not start a new run while the previous Telegram run is still active', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ message_id: 92 })
    const runExecute = vi.fn().mockResolvedValue({ state: 'completed' })
    const hasActiveSubmission = vi.fn(() => true)
    const service = createService({ sendMessage, runExecute, hasActiveSubmission })

    await (service as any).handleEnvelope(createEnvelope(), modelRef)

    expect(hasActiveSubmission).toHaveBeenCalledWith('123:9')
    expect((service as any).adapter.resolveOrCreateSession).toHaveBeenCalledTimes(0)
    expect(runExecute).toHaveBeenCalledTimes(0)
    expect(sendMessage).toHaveBeenCalledWith(123, 'Previous request is still stopping. Please wait a moment.', {
      message_thread_id: 9,
      reply_parameters: { message_id: 55 }
    })
  })
})
