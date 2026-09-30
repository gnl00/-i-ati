import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DatabaseService from '@main/db/DatabaseService'
import { TelegramGatewayService } from '../TelegramGatewayService'
import { ToolConfirmationManager } from '@main/orchestration/chat/run/infrastructure/tool-confirmation'
import type { Bot } from 'grammy'
import type { RunEventEmitter, RunEventSink } from '@main/agent/contracts'
import type { RunEventEnvelope } from '@shared/run/events'
import type { ToolConfirmation } from '@shared/tools/confirmation'
import type { TelegramInboundEnvelope } from '@main/hosts/telegram'
import type { MainAgentRunInput } from '@main/orchestration/chat/run'

const {
  binding,
  chat,
  config,
  logger,
  modelRef,
  subscribeApprovals
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
    modelRef,
    subscribeApprovals: vi.fn()
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
    subscribeToolConfirmations: subscribeApprovals,
    submit: vi.fn(() => ({ submissionId: 'test', completion: Promise.resolve({ state: 'completed' }) }))
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
  editMessageText?: ReturnType<typeof vi.fn>
  runExecute?: (input: MainAgentRunInput) => Promise<unknown>
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
      sendMessage: args.sendMessage ?? vi.fn().mockResolvedValue({ message_id: 77 }),
      editMessageText: args.editMessageText ?? vi.fn().mockResolvedValue(true)
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
    submit: vi.fn((input) => ({
      submissionId: 'test',
      completion: args.runExecute
        ? args.runExecute(input)
        : Promise.resolve({ state: 'completed' })
    })),
    submitTelegramToolConfirmation: vi.fn()
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

  it('clears the active submission when admission fails synchronously', async () => {
    const service = createService()
    const runError = new Error('duplicate submission')
    const gateway = service as unknown as {
      runService: { submit: ReturnType<typeof vi.fn> }
      commandService: { unregisterActiveSubmission: ReturnType<typeof vi.fn> }
      handleEnvelope: (envelope: TelegramInboundEnvelope, modelRef: ModelRef) => Promise<void>
    }
    gateway.runService.submit.mockImplementationOnce(() => { throw runError })

    await gateway.handleEnvelope(createEnvelope(), modelRef)
    await flushPromises()

    expect(logger.error).toHaveBeenCalledWith('update.run_failed', runError)
    expect(gateway.commandService.unregisterActiveSubmission)
      .toHaveBeenCalledWith('123:9', 'submission-id')
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

  it('projects a desktop approval to each bound endpoint once and synchronizes their terminal decisions', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ message_id: 91 })
    const editMessageText = vi.fn().mockResolvedValue(true)
    const service = createService({ sendMessage, editMessageText })
    const listener = subscribeApprovals.mock.lastCall![0]
    const targets = [{ peerId: '123', threadId: '9' }, { peerId: '456' }]
    listener(approval(), targets)
    listener(approval(), targets)
    await (service as unknown as GatewayProbe).queueConfirmationSync()
    expect(sendMessage).toHaveBeenCalledTimes(2)
    expect(sendMessage.mock.calls.map(([peer]) => peer)).toEqual([123, 456])
    listener(approval({ status: 'approved', version: 2 }), targets)
    await (service as unknown as GatewayProbe).queueConfirmationSync()
    expect(editMessageText).toHaveBeenCalledTimes(2)
    expect(editMessageText.mock.calls.map(([, , text]) => text)).toEqual(['<blockquote>tool exec approved</blockquote>', '<blockquote>tool exec approved</blockquote>'])
  })

  it('keeps projections while Telegram delivery is disabled and respects policy when resumed', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ message_id: 91 })
    const service = createService({ sendMessage })
    const policy = { ...config.telegram, enabled: false, allowedChatIds: ['123'] }
    ;(service as unknown as { appConfigStore: { getConfig: () => unknown } }).appConfigStore.getConfig = (): unknown => ({ telegram: policy })
    subscribeApprovals.mock.lastCall![0](approval(), [{ peerId: '123' }, { peerId: '456' }])
    await (service as unknown as GatewayProbe).queueConfirmationSync()
    expect(sendMessage).not.toHaveBeenCalled()
    policy.enabled = true
    await (service as unknown as GatewayProbe).queueConfirmationSync()
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(sendMessage.mock.calls[0][0]).toBe(123)
  })

  it('sends Telegram approval buttons for tool confirmation events', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ message_id: 91 })
    const runExecute = vi.fn(async () => {
      subscribeApprovals.mock.lastCall![0](approval({ confirmationId: 'approval-1', toolCallId: 'call-1' }), [{ peerId: '123', threadId: '9' }])
      return { state: 'completed' }
    })
    const service = createService({ sendMessage, runExecute })

    await (service as any).handleEnvelope(createEnvelope(), modelRef)
    await flushPromises()

    expect(sendMessage).toHaveBeenCalledWith(
      123,
      '<blockquote>tool exec needs approval</blockquote>',
      expect.objectContaining({
        parse_mode: 'HTML',
        message_thread_id: 9,
        reply_markup: {
          inline_keyboard: [[
            { text: 'Approve', callback_data: 'tgcmd:tool_confirm:approve:approval-1' },
            { text: 'Deny', callback_data: 'tgcmd:tool_confirm:deny:approval-1' }
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


type GatewayProbe = {
  trackConfirmation: (descriptor: ToolConfirmation, envelope: TelegramInboundEnvelope) => Promise<void>
  queueConfirmationSync: () => Promise<void>
  bot: Bot | null
  registerHandlers: (bot: { on: ReturnType<typeof vi.fn> }, modelRef: ModelRef) => void
  runService: { submitTelegramToolConfirmation: ToolConfirmationManager['submitTelegram'] }
}

const createApprovalSink = (service: TelegramGatewayService): RunEventSink => ({
  handleEvent: event => (service as unknown as GatewayProbe).trackConfirmation(event.payload as ToolConfirmation, createEnvelope())
})

const approval = (patch: Partial<ToolConfirmation> = {}): ToolConfirmation => ({
  confirmationId: 'approval', submissionId: 'run', chatUuid: 'chat-uuid', toolCallId: 'call', name: 'exec',
  status: 'pending', version: 1, createdAt: 1, expiresAt: 300001, ...patch
})
const approvalEvent = (descriptor: ToolConfirmation): RunEventEnvelope<'tool.confirmation.required' | 'tool.confirmation.resolved'> => ({
  type: descriptor.status === 'pending' ? 'tool.confirmation.required' : 'tool.confirmation.resolved',
  payload: descriptor, submissionId: descriptor.submissionId, chatUuid: descriptor.chatUuid,
  sequence: descriptor.version, timestamp: descriptor.createdAt
})

afterEach(() => vi.useRealTimers())

describe('Telegram authoritative approval projection', () => {
  it.each(['approved', 'denied', 'expired', 'cancelled'] as const)('removes buttons for a remote %s decision', async status => {
    const editMessageText = vi.fn().mockResolvedValue(true)
    const service = createService({ editMessageText })
    const sink = createApprovalSink(service)
    await sink.handleEvent(approvalEvent(approval()))
    await sink.handleEvent(approvalEvent(approval({ status, version: 2 })))
    expect(editMessageText).toHaveBeenCalledWith(123, 77, expect.stringContaining(status === 'expired' ? 'expired' : status), {
      parse_mode: 'HTML', reply_markup: { inline_keyboard: [] }
    })
    await sink.handleEvent(approvalEvent(approval()))
    expect(editMessageText).toHaveBeenCalledTimes(1)
  })

  it('reconciles a decision arriving while the approval message is being sent', async () => {
    let resolveSend!: (value: { message_id: number }) => void
    const sendMessage = vi.fn(() => new Promise(resolve => { resolveSend = resolve }))
    const editMessageText = vi.fn().mockResolvedValue(true)
    const service = createService({ sendMessage, editMessageText })
    const sink = createApprovalSink(service)
    const first = sink.handleEvent(approvalEvent(approval()))
    await flushPromises()
    const second = sink.handleEvent(approvalEvent(approval({ status: 'denied', version: 2 })))
    resolveSend({ message_id: 91 })
    await Promise.all([first, second])
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(editMessageText).toHaveBeenCalledWith(123, 91, '<blockquote>tool exec denied</blockquote>', expect.objectContaining({ reply_markup: { inline_keyboard: [] } }))
  })

  it('retries failed presentation and keeps the resolved state during gateway downtime', async () => {
    vi.useFakeTimers()
    const editMessageText = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(true)
    const service = createService({ editMessageText })
    const sink = createApprovalSink(service)
    await sink.handleEvent(approvalEvent(approval()))
    await sink.handleEvent(approvalEvent(approval({ status: 'approved', version: 2 })))
    await vi.advanceTimersByTimeAsync(5000)
    expect(editMessageText).toHaveBeenCalledTimes(2)
    const bot = (service as unknown as GatewayProbe).bot!
    ;(service as unknown as GatewayProbe).bot = null
    await sink.handleEvent(approvalEvent(approval({ confirmationId: 'offline-approval', status: 'expired', version: 3 })))
    ;(service as unknown as GatewayProbe).bot = bot
    await (service as unknown as GatewayProbe).queueConfirmationSync()
    expect(bot.api.sendMessage).toHaveBeenLastCalledWith(123, '<blockquote>tool exec approval expired</blockquote>', expect.objectContaining({ reply_markup: { inline_keyboard: [] } }))
  })

  it('reports the Main winner for a competing callback and invalidates stale buttons after restart', async () => {
    const service = createService()
    const manager = new ToolConfirmationManager()
    const sink = createApprovalSink(service)
    const emit = vi.fn<RunEventEmitter['emit']>((type, payload) => {
      expect(type).toMatch(/^tool\.confirmation\.(required|resolved)$/)
      void sink.handleEvent(approvalEvent(payload as ToolConfirmation))
    })
    const promise = manager.request({ submissionId: 'run', chatUuid: 'chat-uuid', emit, setChatMeta: vi.fn() }, { toolCallId: 'call', name: 'exec' }, { peerId: '123', threadId: '9' })
    const descriptor = manager.snapshot('chat-uuid').confirmations[0]
    manager.submit({ ...descriptor, approved: false }, { host: 'chat' })
    await promise
    ;(service as unknown as GatewayProbe).runService.submitTelegramToolConfirmation = manager.submitTelegram.bind(manager)
    const on = vi.fn()
    ;(service as unknown as GatewayProbe).registerHandlers({ on }, modelRef)
    const callback = on.mock.calls.find(([name]) => name === 'callback_query:data')![1]
    const ctx = {
      update: { update_id: 1 }, from: { id: 456 },
      callbackQuery: { data: `tgcmd:tool_confirm:approve:${descriptor.confirmationId}`, message: { message_id: 77, chat: { id: 123, type: 'supergroup' }, message_thread_id: 9 } },
      answerCallbackQuery: vi.fn().mockResolvedValue(true), editMessageReplyMarkup: vi.fn().mockResolvedValue(true)
    }
    await callback(ctx)
    expect(ctx.answerCallbackQuery).toHaveBeenLastCalledWith({ text: 'Denied.' })
    expect(ctx.editMessageReplyMarkup).toHaveBeenCalledWith({ reply_markup: { inline_keyboard: [] } })
    ctx.callbackQuery.data = 'tgcmd:tool_confirm:approve:obsolete'
    await callback(ctx)
    expect(ctx.answerCallbackQuery).toHaveBeenLastCalledWith({ text: 'Approval expired or is no longer available.' })
    await (service as unknown as GatewayProbe).queueConfirmationSync()
  })
})
