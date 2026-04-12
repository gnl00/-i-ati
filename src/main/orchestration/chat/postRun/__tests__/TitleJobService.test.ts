import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RUN_EVENTS } from '@shared/run/events'

const { emitterInstances, updateChatMock, generateTitleMock, loggerInfoMock, loggerWarnMock } = vi.hoisted(() => ({
  emitterInstances: [] as Array<{ emit: ReturnType<typeof vi.fn> }>,
  updateChatMock: vi.fn(),
  generateTitleMock: vi.fn(async () => 'generated title'),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn()
}))

vi.mock('@main/orchestration/chat/run/infrastructure', () => {
  class RunEventEmitter {
    emit = vi.fn()

    constructor() {
      emitterInstances.push(this)
    }
  }

  class RunEventEmitterFactory {
    create() {
      return new RunEventEmitter()
    }

    createOptional(meta: { submissionId?: string }) {
      if (!meta.submissionId) {
        return null
      }
      return this.create()
    }
  }

  return { RunEventEmitter, RunEventEmitterFactory }
})

vi.mock('@main/db/DatabaseService', () => ({
  default: {
    getChatById: vi.fn((chatId: number) => ({
      id: chatId,
      uuid: 'chat-1',
      title: 'Old title',
      messages: [],
      modelRef: {
        accountId: 'account-1',
        modelId: 'model-1'
      },
      workspacePath: './workspaces/chat-1',
      userInstruction: '',
      createTime: 1,
      updateTime: 1
    })),
    updateChat: updateChatMock
  }
}))

vi.mock('@main/logging/LogService', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: loggerInfoMock,
    warn: loggerWarnMock,
    error: vi.fn()
  }))
}))

vi.mock('electron', () => ({
  app: {
    isPackaged: false
  }
}))

import { TitleJobService } from '../TitleJobService'

const args = {
  submissionId: 'submission-1',
  chatEntity: {
    id: 1,
    uuid: 'chat-1',
    title: 'NewChat',
    messages: [],
    modelRef: {
      accountId: 'account-1',
      modelId: 'model-1'
    },
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
    loggerInfoMock.mockReset()
    loggerWarnMock.mockReset()
  })

  it('generates and persists a new title', async () => {
    const service = new TitleJobService(undefined, undefined, undefined, generateTitleMock)

    await service.run(args, config)

    expect(generateTitleMock).toHaveBeenCalledTimes(1)
    expect(updateChatMock).toHaveBeenCalledWith(expect.objectContaining({
      id: 1,
      title: 'generated title'
    }))
    expect(emitterInstances[0]?.emit).toHaveBeenCalledWith(RUN_EVENTS.TITLE_GENERATION_STARTED, {
      model: args.modelContext.model,
      contentLength: args.content.length
    })
    expect(emitterInstances[0]?.emit).toHaveBeenCalledWith(RUN_EVENTS.TITLE_GENERATION_COMPLETED, {
      title: 'generated title'
    })
    expect(loggerInfoMock).toHaveBeenCalledWith('title.job.completed.updated', expect.objectContaining({
      chatUuid: 'chat-1',
      title: 'generated title'
    }))
  })

  it('emits failed when title generation throws', async () => {
    const service = new TitleJobService(undefined, undefined, undefined, generateTitleMock)
    generateTitleMock.mockRejectedValueOnce(new Error('title failed'))

    await service.run(args, config)

    expect(emitterInstances[0]?.emit).toHaveBeenCalledWith(RUN_EVENTS.TITLE_GENERATION_FAILED, {
      error: expect.objectContaining({
        name: 'Error',
        message: 'title failed'
      })
    })
  })

  it('skips title generation when chat already has a non-default title', async () => {
    const service = new TitleJobService(undefined, undefined, undefined, generateTitleMock)

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

  it('logs noop completion when generated title is empty or unchanged', async () => {
    const service = new TitleJobService(undefined, undefined, undefined, generateTitleMock)
    generateTitleMock.mockResolvedValueOnce('NewChat')

    await service.run(args, config)

    expect(updateChatMock).not.toHaveBeenCalled()
    expect(loggerWarnMock).toHaveBeenCalledWith('title.job.completed.noop', expect.objectContaining({
      currentTitle: 'NewChat',
      generatedTitle: 'NewChat'
    }))
    expect(emitterInstances[0]?.emit).toHaveBeenCalledWith(RUN_EVENTS.TITLE_GENERATION_COMPLETED, {
      title: 'NewChat'
    })
  })
})
