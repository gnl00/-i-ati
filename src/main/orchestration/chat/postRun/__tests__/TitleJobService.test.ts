import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RUN_EVENTS } from '@shared/run/events'
import type { AgentOptions, AgentResult } from '@main/agent'

type TitleAgent = (
  name: string,
  systemPrompt: string,
  tools: string[],
  messages: UnifiedRequestMessage[],
  loop?: boolean,
  options?: AgentOptions
) => Promise<AgentResult>

const {
  emitterInstances,
  getChatByIdMock,
  updateChatMock,
  titleAgentMock,
  loggerInfoMock,
  loggerWarnMock
} = vi.hoisted(() => ({
  emitterInstances: [] as Array<{ emit: ReturnType<typeof vi.fn> }>,
  getChatByIdMock: vi.fn(),
  updateChatMock: vi.fn(),
  titleAgentMock: vi.fn<TitleAgent>(async () => ({
    type: 'tool_call',
    toolCalls: [{
      name: 'chat_set_title',
      args: { title: 'generated title', chat_uuid: 'chat-1' },
      result: { success: true, title: 'generated title' },
      success: true
    }]
  })),
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
    getChatById: getChatByIdMock,
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
    getChatByIdMock.mockReset()
    getChatByIdMock.mockReturnValue({
      ...args.chatEntity,
      title: 'NewChat'
    })
    updateChatMock.mockReset()
    titleAgentMock.mockReset()
    titleAgentMock.mockResolvedValue({
      type: 'tool_call',
      toolCalls: [{
        name: 'chat_set_title',
        args: { title: 'generated title', chat_uuid: 'chat-1' },
        result: { success: true, title: 'generated title' },
        success: true
      }]
    })
    loggerInfoMock.mockReset()
    loggerWarnMock.mockReset()
  })

  it('runs the title agent and emits the generated title', async () => {
    const service = new TitleJobService(undefined, undefined, undefined, titleAgentMock)
    args.modelContext.providerDefinition.requestOverrides = {
      temperature: 0.2,
      tool_choice: { type: 'function', function: { name: 'chat_set_title' } },
      reasoning_effort: 'high'
    }
    getChatByIdMock
      .mockReturnValueOnce({
        ...args.chatEntity,
        title: 'NewChat'
      })
      .mockReturnValueOnce({
        ...args.chatEntity,
        title: 'generated title'
      })

    await service.run(args, config)

    expect(titleAgentMock).toHaveBeenCalledTimes(1)
    expect(titleAgentMock).toHaveBeenCalledWith(
      'title-generator',
      expect.stringContaining('chat-1'),
      ['chat_set_title'],
      [{
        role: 'user',
        content: [
          '<title-context>',
          `  <user>${args.content}</user>`,
          '</title-context>'
        ].join('\n')
      }],
      false,
      expect.objectContaining({
        model: args.modelContext.model,
        account: args.modelContext.account,
        providerDefinition: args.modelContext.providerDefinition,
        requestOptions: expect.objectContaining({ thinking: { enabled: false } }),
        sanitizeOverrides: expect.any(Function)
      })
    )
    const sanitizeOverrides = titleAgentMock.mock.calls[0][5]?.sanitizeOverrides
    if (typeof sanitizeOverrides !== 'function') {
      throw new Error('Expected title agent sanitizeOverrides option')
    }
    expect(sanitizeOverrides({
      temperature: 0.2,
      output_config: { effort: 'high', top_k: 10 }
    })).toEqual({
      temperature: 0.2,
      output_config: { top_k: 10 }
    })
    expect(sanitizeOverrides({
      tool_choice: { type: 'function', function: { name: 'chat_set_title' } }
    })).toEqual(undefined)

    expect(updateChatMock).not.toHaveBeenCalled()
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

  it('flattens title context without assistant tool calls or reasoning payload', async () => {
    const service = new TitleJobService(undefined, undefined, undefined, titleAgentMock)
    const toolCallId = 'call-title-secret'

    await service.run({
      ...args,
      messageBuffer: [
        {
          id: 201,
          body: {
            role: 'user',
            content: '<x & y>',
            segments: []
          }
        },
        {
          id: 202,
          body: {
            role: 'assistant',
            content: 'assistant fallback text',
            toolCalls: [{
              id: toolCallId,
              name: 'search',
              args: { query: 'hidden' }
            }],
            segments: [
              {
                type: 'reasoning',
                content: 'private chain of thought'
              },
              {
                type: 'text',
                content: 'assistant visible text'
              }
            ]
          }
        }
      ]
    }, config)

    const titleMessages = titleAgentMock.mock.calls[0][3]

    expect(titleMessages).toHaveLength(1)
    expect(titleMessages[0].role).toBe('user')
    expect(titleMessages[0].content).toContain('<title-context>')
    expect(titleMessages[0].content).toContain('<user>&lt;x &amp; y&gt;</user>')
    expect(titleMessages[0].content).toContain('<assistant>assistant visible text</assistant>')

    const serialized = JSON.stringify(titleMessages)
    expect(serialized).not.toContain('toolCalls')
    expect(serialized).not.toContain('tool_calls')
    expect(serialized).not.toContain('reasoning')
    expect(serialized).not.toContain('reasoning_content')
    expect(serialized).not.toContain(toolCallId)
  })

  it('emits failed when title generation throws', async () => {
    const service = new TitleJobService(undefined, undefined, undefined, titleAgentMock)
    titleAgentMock.mockRejectedValueOnce(new Error('title failed'))

    await service.run(args, config)

    expect(emitterInstances[0]?.emit).toHaveBeenCalledWith(RUN_EVENTS.TITLE_GENERATION_FAILED, {
      error: expect.objectContaining({
        name: 'Error',
        message: 'title failed'
      })
    })
  })

  it('skips title generation when chat already has a non-default title', async () => {
    const service = new TitleJobService(undefined, undefined, undefined, titleAgentMock)

    await service.run({
      ...args,
      chatEntity: {
        ...args.chatEntity,
        title: 'Existing title'
      }
    }, config)

    expect(titleAgentMock).not.toHaveBeenCalled()
    expect(updateChatMock).not.toHaveBeenCalled()
    expect(emitterInstances[0]).toBeUndefined()
  })

  it('skips title generation when the latest chat already has a generated title', async () => {
    const service = new TitleJobService(undefined, undefined, undefined, titleAgentMock)
    getChatByIdMock.mockReturnValueOnce({
      ...args.chatEntity,
      title: 'Existing generated title'
    })

    await service.run(args, config)

    expect(titleAgentMock).not.toHaveBeenCalled()
    expect(updateChatMock).not.toHaveBeenCalled()
    expect(emitterInstances[0]?.emit).toHaveBeenCalledWith(RUN_EVENTS.TITLE_GENERATION_COMPLETED, {
      title: 'Existing generated title'
    })
  })

  it('reports the latest title after the title agent tool call completes', async () => {
    const service = new TitleJobService(undefined, undefined, undefined, titleAgentMock)
    getChatByIdMock
      .mockReturnValueOnce({
        ...args.chatEntity,
        title: 'NewChat'
      })
      .mockReturnValueOnce({
        ...args.chatEntity,
        title: 'First generated title'
      })

    await service.run(args, config)

    expect(titleAgentMock).toHaveBeenCalledTimes(1)
    expect(updateChatMock).not.toHaveBeenCalled()
    expect(loggerInfoMock).toHaveBeenCalledWith('title.job.completed.updated', expect.objectContaining({
      title: 'First generated title'
    }))
    expect(emitterInstances[0]?.emit).toHaveBeenCalledWith(RUN_EVENTS.TITLE_GENERATION_COMPLETED, {
      title: 'First generated title'
    })
  })

  it('logs no tool call completion when the title agent returns text', async () => {
    const service = new TitleJobService(undefined, undefined, undefined, titleAgentMock)
    titleAgentMock.mockResolvedValueOnce({
      type: 'text',
      content: 'NEED_MORE_CONTEXT'
    })

    await service.run(args, config)

    expect(updateChatMock).not.toHaveBeenCalled()
    expect(loggerWarnMock).toHaveBeenCalledWith('title.job.completed.no_tool_call', expect.objectContaining({
      currentTitle: 'NewChat',
      content: 'NEED_MORE_CONTEXT'
    }))
    expect(emitterInstances[0]?.emit).toHaveBeenCalledWith(RUN_EVENTS.TITLE_GENERATION_COMPLETED, {
      title: 'NewChat'
    })
  })
})
