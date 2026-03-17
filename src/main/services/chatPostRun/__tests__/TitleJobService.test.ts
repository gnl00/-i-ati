import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CHAT_RUN_EVENTS } from '@shared/chatRun/events'

const { emitterInstances, updateChatMock, generateTitleMock } = vi.hoisted(() => ({
  emitterInstances: [] as Array<{ emit: ReturnType<typeof vi.fn> }>,
  updateChatMock: vi.fn(),
  generateTitleMock: vi.fn(async () => 'generated title')
}))

vi.mock('@main/services/chatRun/infrastructure', () => {
  class ChatRunEventEmitter {
    emit = vi.fn()

    constructor() {
      emitterInstances.push(this)
    }
  }

  class ChatRunEventEmitterFactory {
    create() {
      return new ChatRunEventEmitter()
    }

    createOptional(meta: { submissionId?: string }) {
      if (!meta.submissionId) {
        return null
      }
      return this.create()
    }
  }

  return { ChatRunEventEmitter, ChatRunEventEmitterFactory }
})

vi.mock('@main/services/DatabaseService', () => ({
  default: {
    getChatById: vi.fn((chatId: number) => ({
      id: chatId,
      uuid: 'chat-1',
      title: 'Old title',
      messages: [],
      model: 'model-1',
      workspacePath: './workspaces/chat-1',
      userInstruction: '',
      createTime: 1,
      updateTime: 1
    })),
    updateChat: updateChatMock
  }
}))

vi.mock('@main/services/TitleService', () => ({
  generateTitle: generateTitleMock
}))

import { TitleJobService } from '../TitleJobService'

const args = {
  submissionId: 'submission-1',
  chatEntity: {
    id: 1,
    uuid: 'chat-1',
    title: 'NewChat',
    messages: [],
    model: 'model-1',
    workspacePath: './workspaces/chat-1',
    userInstruction: '',
    createTime: 1,
    updateTime: 1
  },
  messageBuffer: [],
  content: 'generate a better title',
  modelContext: {
    model: { id: 'model-1', label: 'model-1', type: 'llm' },
    account: { id: 'account-1', providerId: 'provider-1', apiUrl: 'https://example.com', apiKey: 'key', models: [] },
    providerDefinition: { id: 'provider-1', adapterPluginId: 'openai-chat-compatible-adapter' }
  }
} as any

const config = {
  tools: {
    titleGenerateEnabled: true
  }
} as any

describe('TitleJobService', () => {
  beforeEach(() => {
    emitterInstances.length = 0
    updateChatMock.mockReset()
    generateTitleMock.mockReset()
    generateTitleMock.mockResolvedValue('generated title')
  })

  it('generates and persists a new title', async () => {
    const service = new TitleJobService()

    await service.run(args, config)

    expect(generateTitleMock).toHaveBeenCalledTimes(1)
    expect(updateChatMock).toHaveBeenCalledWith(expect.objectContaining({
      id: 1,
      title: 'generated title'
    }))
    expect(emitterInstances[0]?.emit).toHaveBeenCalledWith(CHAT_RUN_EVENTS.TITLE_GENERATE_STARTED, {
      model: args.modelContext.model,
      contentLength: args.content.length
    })
    expect(emitterInstances[0]?.emit).toHaveBeenCalledWith(CHAT_RUN_EVENTS.TITLE_GENERATE_COMPLETED, {
      title: 'generated title'
    })
  })

  it('emits failed when title generation throws', async () => {
    const service = new TitleJobService()
    generateTitleMock.mockRejectedValueOnce(new Error('title failed'))

    await service.run(args, config)

    expect(emitterInstances[0]?.emit).toHaveBeenCalledWith(CHAT_RUN_EVENTS.TITLE_GENERATE_FAILED, {
      error: expect.objectContaining({
        name: 'Error',
        message: 'title failed'
      })
    })
  })

  it('skips title generation when chat already has a non-default title', async () => {
    const service = new TitleJobService()

    await service.run({
      ...args,
      chatEntity: {
        ...args.chatEntity,
        title: 'Existing title'
      }
    }, config)

    expect(generateTitleMock).not.toHaveBeenCalled()
    expect(updateChatMock).not.toHaveBeenCalled()
    expect(emitterInstances[0]).toBeUndefined()
  })
})
