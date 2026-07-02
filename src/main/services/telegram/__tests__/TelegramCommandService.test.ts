import { beforeEach, describe, expect, it, vi } from 'vitest'
import DatabaseService from '@main/db/DatabaseService'
import { ChatModelContextResolver } from '@main/hosts/chat/config/ChatModelContextResolver'
import { TelegramCommandService } from '../TelegramCommandService'
import type { TelegramCommand } from '../telegram-command-parser'

vi.mock('@main/db/DatabaseService', () => ({
  default: {
    updateChat: vi.fn()
  }
}))

vi.mock('@main/orchestration/chat/run', () => ({
  RunService: vi.fn(function () {
    return {
      cancel: vi.fn()
    }
  })
}))

const config: IAppConfig = {
  providerDefinitions: [
    {
      id: 'openai',
      displayName: 'OpenAI',
      adapterPluginId: 'openai-chat-compatible-adapter'
    },
    {
      id: 'openrouter',
      displayName: 'OpenRouter',
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
          label: 'GPT-4.1 OpenAI',
          type: 'llm'
        }
      ]
    },
    {
      id: 'account-openrouter',
      providerId: 'openrouter',
      label: 'OpenRouter Account',
      apiUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'key',
      models: [
        {
          id: 'gpt-4.1',
          label: 'GPT-4.1 OpenRouter',
          type: 'llm'
        }
      ]
    }
  ]
}

const envelope = {
  updateId: 1,
  messageId: '10',
  chatId: '100',
  chatType: 'private',
  fromUserId: '200',
  username: 'tester',
  displayName: 'Tester',
  text: '',
  media: [],
  isMentioned: false,
  replyToBot: false,
  receivedAt: 1
} as const

const mainModelRef: ModelRef = {
  accountId: 'account-openai',
  modelId: 'gpt-4.1'
}

const createChat = (modelRef: ModelRef = mainModelRef): ChatEntity => ({
  id: 1,
  uuid: 'chat-uuid',
  title: 'NewChat',
  messages: [],
  modelRef,
  createTime: 1,
  updateTime: 1
})

const createService = (
  chat = createChat(),
  runService = { cancel: vi.fn() },
  hostChatBindingService = {
    createAndBind: vi.fn().mockResolvedValue({
      chat,
      binding: {
        id: 1,
        hostType: 'telegram',
        hostChatId: envelope.chatId,
        chatId: chat.id,
        chatUuid: chat.uuid,
        status: 'active',
        createTime: 1,
        updateTime: 1
      },
      created: true
    })
  }
): TelegramCommandService => {
  const configStore = {
    requireConfig: () => config
  }
  const adapter = {
    resolveOrCreateSession: vi.fn().mockResolvedValue({
      chat,
      binding: {
        id: 1,
        hostType: 'telegram',
        hostChatId: envelope.chatId,
        chatId: chat.id,
        chatUuid: chat.uuid,
        status: 'active',
        createTime: 1,
        updateTime: 1
      },
      created: false
    })
  }

  return new TelegramCommandService(
    configStore as any,
    new ChatModelContextResolver(),
    adapter as any,
    hostChatBindingService as any,
    runService as any
  )
}

const execute = async (
  service: TelegramCommandService,
  command: TelegramCommand
) => service.execute(command, envelope as any, mainModelRef)

describe('TelegramCommandService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates Telegram chats with the default title so post-run title generation can run', async () => {
    const hostChatBindingService = {
      createAndBind: vi.fn().mockResolvedValue({
        chat: createChat(),
        binding: {
          id: 1,
          hostType: 'telegram',
          hostChatId: envelope.chatId,
          chatId: 1,
          chatUuid: 'chat-uuid',
          status: 'active',
          createTime: 1,
          updateTime: 1
        },
        created: true
      })
    }
    const service = createService(createChat(), undefined, hostChatBindingService)

    await execute(service, {
      name: 'newchat',
      args: '',
      raw: '/newchat'
    })

    expect(hostChatBindingService.createAndBind).toHaveBeenCalledWith(expect.objectContaining({
      hostType: 'telegram',
      hostChatId: envelope.chatId,
      hostUserId: envelope.fromUserId,
      title: 'NewChat',
      metadata: {
        chatType: envelope.chatType,
        username: envelope.username,
        displayName: envelope.displayName
      }
    }))
  })

  it('switches duplicate model ids by provider token', async () => {
    const service = createService()

    const response = await execute(service, {
      name: 'model',
      args: 'openrouter gpt-4.1',
      raw: '/model openrouter gpt-4.1'
    })

    expect(DatabaseService.updateChat).toHaveBeenCalledWith(expect.objectContaining({
      modelRef: {
        accountId: 'account-openrouter',
        modelId: 'gpt-4.1'
      }
    }))
    expect(response.text).toContain('Chat model updated.')
    expect(response.text).toContain('Provider: openrouter (OpenRouter)')
    expect(response.text).toContain('Command: /model openrouter gpt-4.1')
  })

  it('lists copyable provider-qualified model commands', async () => {
    const service = createService()

    const response = await execute(service, {
      name: 'models',
      args: '',
      raw: '/models'
    })

    expect(response.parseMode).toBe('HTML')
    expect(response.text).toContain('<pre>/model openai gpt-4.1</pre>')
    expect(response.text).toContain('<pre>/model openrouter gpt-4.1</pre>')
    expect(response.text).toContain('/model &lt;provider&gt; &lt;model id&gt;')
  })

  it('returns provider-qualified candidates for ambiguous legacy model ids', async () => {
    const service = createService()

    const response = await execute(service, {
      name: 'model',
      args: 'gpt-4.1',
      raw: '/model gpt-4.1'
    })

    expect(DatabaseService.updateChat).toHaveBeenCalledTimes(0)
    expect(response.text).toContain('Multiple models matched "gpt-4.1":')
    expect(response.text).toContain('/model openai gpt-4.1')
    expect(response.text).toContain('/model openrouter gpt-4.1')
  })

  it('keeps exact label matching when the first token is not a provider', async () => {
    const service = createService()

    await execute(service, {
      name: 'model',
      args: 'GPT-4.1 OpenAI',
      raw: '/model GPT-4.1 OpenAI'
    })

    expect(DatabaseService.updateChat).toHaveBeenCalledWith(expect.objectContaining({
      modelRef: {
        accountId: 'account-openai',
        modelId: 'gpt-4.1'
      }
    }))
  })

  it('shows the provider-qualified command in status', async () => {
    const service = createService(createChat({
      accountId: 'account-openrouter',
      modelId: 'gpt-4.1'
    }))

    const response = await execute(service, {
      name: 'status',
      args: '',
      raw: '/status'
    })

    expect(response.text).toContain('Provider: openrouter (OpenRouter)')
    expect(response.text).toContain('Account: OpenRouter Account')
    expect(response.text).toContain('Command: /model openrouter gpt-4.1')
  })

  it('cancels the active submission for stop', async () => {
    const runService = { cancel: vi.fn() }
    const service = createService(createChat(), runService)

    service.registerActiveSubmission('100', 'submission-id')

    const response = await execute(service, {
      name: 'stop',
      args: '',
      raw: '/stop'
    })

    expect(runService.cancel).toHaveBeenCalledWith('submission-id')
    expect(response.text).toBe('Stopped current generation session.')
  })

  it('keeps a newer active submission when an older run unregisters', async () => {
    const runService = { cancel: vi.fn() }
    const service = createService(createChat(), runService)

    service.registerActiveSubmission('100', 'old-submission')
    service.registerActiveSubmission('100', 'new-submission')
    service.unregisterActiveSubmission('100', 'old-submission')

    await execute(service, {
      name: 'stop',
      args: '',
      raw: '/stop'
    })

    expect(runService.cancel).toHaveBeenCalledWith('new-submission')
  })

  it('reports missing active submissions for stop', async () => {
    const runService = { cancel: vi.fn() }
    const service = createService(createChat(), runService)

    const response = await execute(service, {
      name: 'stop',
      args: '',
      raw: '/stop'
    })

    expect(runService.cancel).toHaveBeenCalledTimes(0)
    expect(response.text).toBe('No active request to stop.')
  })
})
