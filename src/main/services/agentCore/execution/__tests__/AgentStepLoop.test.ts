import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentStepLoop } from '../AgentStepLoop'
import type { ParseResult } from '../parser'
import type { AgentStepCommitter } from '../AgentStepCommitter'
import type { RequestHistory } from '../RequestHistory'
import { AssistantStepAssembler } from '@main/services/hostAdapters/chat/execution/AssistantStepAssembler'

const { unifiedChatRequestMock } = vi.hoisted(() => ({
  unifiedChatRequestMock: vi.fn()
}))

vi.mock('@main/request/index', () => ({
  unifiedChatRequest: unifiedChatRequestMock
}))

const createAsyncResponse = (chunks: IUnifiedResponse[]) => ({
  async *[Symbol.asyncIterator]() {
    for (const chunk of chunks) {
      yield chunk
    }
  }
})

const createParseResult = (input: Partial<ParseResult>): ParseResult => ({
  contentDelta: '',
  reasoningDelta: '',
  segmentDeltas: [],
  toolCalls: [],
  hasThinkTag: false,
  isInThinkTag: false,
  ...input
})

class InMemoryRequestHistory implements RequestHistory {
  readonly messages: ChatMessage[]

  constructor(initialMessages: ChatMessage[]) {
    this.messages = [...initialMessages]
  }

  syncRequest(request: IUnifiedRequest): void {
    request.messages = [...this.messages]
  }

  appendAssistantCycle(message: ChatMessage): void {
    this.messages.push(message)
  }

  appendToolResult(message: ChatMessage): void {
    this.messages.push(message)
  }

  getMessages(): ChatMessage[] {
    return [...this.messages]
  }
}

class InMemoryStepCommitter implements AgentStepCommitter {
  readonly toolOnlySnapshots: string[] = []
  readonly committedSnapshots: string[] = []
  readonly previewSnapshots: string[] = []
  previewClearedCount = 0
  readonly finalAssistantMessage: MessageEntity = {
    id: 200,
    chatUuid: 'chat-1',
    body: {
      role: 'assistant',
      content: '',
      segments: [],
      typewriterCompleted: false
    }
  }

  private artifacts: import('@main/services/agentCore/types').StepArtifact[] = []
  private lastUsage?: ITokenUsage
  private readonly assembler = new AssistantStepAssembler(this.finalAssistantMessage.body)

  beginCycle(): void {
    this.assembler.beginCycle()
  }

  updateStreamPreview(snapshot: import('../AssistantCycleBuffer').AssistantCycleSnapshot): void {
    this.previewSnapshots.push(snapshot.content)
    const { previewBody } = this.assembler.updatePreview(snapshot)
    if (previewBody) {
      this.finalAssistantMessage.body = previewBody
    }
  }

  clearStreamPreview(): void {
    this.previewClearedCount += 1
    const { committedBody } = this.assembler.clearPreview()
    this.finalAssistantMessage.body = committedBody
  }

  commitToolOnlyCycle(snapshot: import('../AssistantCycleBuffer').AssistantCycleSnapshot): void {
    this.toolOnlySnapshots.push(snapshot.content)
    const { committedBody } = this.assembler.commitToolCycle(snapshot)
    this.finalAssistantMessage.body = committedBody
  }

  commitFinalCycle(snapshot: import('../AssistantCycleBuffer').AssistantCycleSnapshot): void {
    this.committedSnapshots.push(snapshot.content)
    const { committedBody } = this.assembler.commitFinalCycle(snapshot)
    this.finalAssistantMessage.body = committedBody
  }

  setLastUsage(usage: ITokenUsage): void {
    this.lastUsage = usage
  }

  getLastUsage(): ITokenUsage | undefined {
    return this.lastUsage
  }

  async commitToolResult(_message: ChatMessage): Promise<void> {}

  getFinalAssistantMessage(): MessageEntity {
    return this.finalAssistantMessage
  }

  getArtifacts(): import('@main/services/agentCore/types').StepArtifact[] {
    return this.artifacts
  }
}

describe('AgentStepLoop', () => {
  beforeEach(() => {
    unifiedChatRequestMock.mockReset()
  })

  it('separates tool cycles in request history while keeping only the latest cycle in the visible assistant draft', async () => {
    const parserResults: ParseResult[] = [
      createParseResult({
        contentDelta: 'Cycle one summary',
        segmentDeltas: [{ type: 'text', content: 'Cycle one summary' }],
        toolCalls: [{
          id: 'tool-1',
          name: 'emotion_report',
          args: '{}',
          status: 'pending',
          index: 0
        }]
      }),
      createParseResult({
        contentDelta: 'Final answer',
        segmentDeltas: [{ type: 'text', content: 'Final answer' }],
        toolCalls: []
      })
    ]

    const parser = {
      parse: vi.fn(() => {
        const next = parserResults.shift()
        if (!next) {
          throw new Error('No parse result queued')
        }
        return next
      }),
      getState: vi.fn(),
      setState: vi.fn(),
      reset: vi.fn()
    }

    unifiedChatRequestMock
      .mockResolvedValueOnce(createAsyncResponse([{ content: 'cycle-1' } as IUnifiedResponse]))
      .mockResolvedValueOnce(createAsyncResponse([{ content: 'cycle-2' } as IUnifiedResponse]))

    const requestHistory = new InMemoryRequestHistory([
      { role: 'user', content: 'hello', segments: [] }
    ])
    const stepCommitter = new InMemoryStepCommitter()

    const loop = new AgentStepLoop(
      {
        request: {
          adapterPluginId: 'test',
          baseUrl: 'https://example.com',
          apiKey: 'key',
          model: 'model-1',
          modelType: 'llm',
          messages: [],
          stream: true
        },
        modelName: 'model-1',
        signal: new AbortController().signal,
        chatUuid: 'chat-1'
      },
      {
        parser: parser as any,
        requestHistory,
        stepCommitter,
        beforeFetch: vi.fn(),
        afterFetch: vi.fn(),
        toolService: {
          execute: vi.fn(async () => [{
            id: 'tool-1',
            index: 0,
            name: 'emotion_report',
            content: { ok: true },
            cost: 0,
            status: 'success' as const
          }])
        }
      }
    )

    const result = await loop.execute()
    const assistantMessages = result.requestHistoryMessages.filter(message => message.role === 'assistant')

    expect(assistantMessages).toHaveLength(2)
    expect(assistantMessages[0]).toMatchObject({
      content: 'Cycle one summary'
    })
    expect(assistantMessages[1]).toMatchObject({
      content: 'Final answer'
    })
    expect(result.requestHistoryMessages.filter(message => message.role === 'tool')).toHaveLength(1)
    expect(stepCommitter.previewSnapshots).toEqual(['Cycle one summary', 'Final answer'])
    expect(stepCommitter.toolOnlySnapshots).toEqual(['Cycle one summary', 'Cycle one summary'])
    expect(stepCommitter.committedSnapshots).toEqual(['Final answer'])
    expect(stepCommitter.previewClearedCount).toBe(4)
    expect(stepCommitter.getFinalAssistantMessage().body.content).toBe('Final answer')
    expect(stepCommitter.getFinalAssistantMessage().body.segments).toEqual([
      expect.objectContaining({ type: 'toolCall', toolCallId: 'tool-1' }),
      expect.objectContaining({ type: 'text', content: 'Final answer' })
    ])
    expect(stepCommitter.getFinalAssistantMessage().body.toolCalls).toEqual([
      expect.objectContaining({ id: 'tool-1' })
    ])
    expect(stepCommitter.getFinalAssistantMessage().body.content).not.toContain('Cycle one summary')
  })

  it('always continues after tool calls and commits the final visible answer on the next no-tool cycle', async () => {
    const parser = {
      parse: vi
        .fn()
        .mockReturnValueOnce(createParseResult({
          contentDelta: 'Intermediate tool cycle answer',
          segmentDeltas: [{ type: 'text', content: 'Intermediate tool cycle answer' }],
          toolCalls: [{
            id: 'tool-1',
            name: 'emotion_report',
            args: '{}',
            status: 'pending',
            index: 0
          }]
        }))
        .mockReturnValueOnce(createParseResult({
          contentDelta: 'Final answer after tool execution',
          segmentDeltas: [{ type: 'text', content: 'Final answer after tool execution' }],
          toolCalls: []
        })),
      getState: vi.fn(),
      setState: vi.fn(),
      reset: vi.fn()
    }

    unifiedChatRequestMock
      .mockResolvedValueOnce(createAsyncResponse([{ content: 'cycle-1' } as IUnifiedResponse]))
      .mockResolvedValueOnce(createAsyncResponse([{ content: 'cycle-2' } as IUnifiedResponse]))

    const requestHistory = new InMemoryRequestHistory([
      { role: 'user', content: 'hello', segments: [] }
    ])
    const stepCommitter = new InMemoryStepCommitter()

    const loop = new AgentStepLoop(
      {
        request: {
          adapterPluginId: 'test',
          baseUrl: 'https://example.com',
          apiKey: 'key',
          model: 'model-1',
          modelType: 'llm',
          messages: [],
          stream: true
        },
        modelName: 'model-1',
        signal: new AbortController().signal,
        chatUuid: 'chat-1'
      },
      {
        parser: parser as any,
        requestHistory,
        stepCommitter,
        beforeFetch: vi.fn(),
        afterFetch: vi.fn(),
        toolService: {
          execute: vi.fn(async () => [{
            id: 'tool-1',
            index: 0,
            name: 'emotion_report',
            content: { ok: true },
            cost: 0,
            status: 'success' as const
          }])
        }
      }
    )

    const result = await loop.execute()

    expect(unifiedChatRequestMock).toHaveBeenCalledTimes(2)
    expect(result.requestHistoryMessages.filter(message => message.role === 'assistant')).toHaveLength(2)
    expect(result.requestHistoryMessages.filter(message => message.role === 'tool')[0]).toMatchObject({
      role: 'tool',
      name: 'emotion_report'
    })
    expect(stepCommitter.previewSnapshots).toEqual([
      'Intermediate tool cycle answer',
      'Final answer after tool execution'
    ])
    expect(stepCommitter.getFinalAssistantMessage().body.content).toBe('Final answer after tool execution')
    expect(stepCommitter.toolOnlySnapshots).toEqual([
      'Intermediate tool cycle answer',
      'Intermediate tool cycle answer'
    ])
    expect(stepCommitter.committedSnapshots).toEqual(['Final answer after tool execution'])
    expect(stepCommitter.previewClearedCount).toBe(4)
    expect(stepCommitter.getFinalAssistantMessage().body.toolCalls).toEqual([
      expect.objectContaining({ id: 'tool-1' })
    ])
  })

  it('keeps reasoning and merges tool calls across multiple tool-only cycles before the final answer', async () => {
    const parser = {
      parse: vi
        .fn()
        .mockReturnValueOnce(createParseResult({
          reasoningDelta: 'reasoning one',
          toolCalls: [{
            id: 'tool-1',
            name: 'memory_retrieval',
            args: '{}',
            status: 'pending',
            index: 0
          }]
        }))
        .mockReturnValueOnce(createParseResult({
          reasoningDelta: 'reasoning two',
          toolCalls: [{
            id: 'tool-2',
            name: 'emotion_report',
            args: '{}',
            status: 'pending',
            index: 0
          }]
        }))
        .mockReturnValueOnce(createParseResult({
          contentDelta: 'Final answer',
          segmentDeltas: [{ type: 'text', content: 'Final answer' }],
          toolCalls: []
        })),
      getState: vi.fn(),
      setState: vi.fn(),
      reset: vi.fn()
    }

    unifiedChatRequestMock
      .mockResolvedValueOnce(createAsyncResponse([{ content: 'cycle-1' } as IUnifiedResponse]))
      .mockResolvedValueOnce(createAsyncResponse([{ content: 'cycle-2' } as IUnifiedResponse]))
      .mockResolvedValueOnce(createAsyncResponse([{ content: 'cycle-3' } as IUnifiedResponse]))

    const requestHistory = new InMemoryRequestHistory([
      { role: 'user', content: 'hello', segments: [] }
    ])
    const stepCommitter = new InMemoryStepCommitter()

    const loop = new AgentStepLoop(
      {
        request: {
          adapterPluginId: 'test',
          baseUrl: 'https://example.com',
          apiKey: 'key',
          model: 'model-1',
          modelType: 'llm',
          messages: [],
          stream: true
        },
        modelName: 'model-1',
        signal: new AbortController().signal,
        chatUuid: 'chat-1'
      },
      {
        parser: parser as any,
        requestHistory,
        stepCommitter,
        beforeFetch: vi.fn(),
        afterFetch: vi.fn(),
        toolService: {
          execute: vi
            .fn()
            .mockResolvedValueOnce([{
              id: 'tool-1',
              index: 0,
              name: 'memory_retrieval',
              content: { ok: true },
              cost: 0,
              status: 'success' as const
            }])
            .mockResolvedValueOnce([{
              id: 'tool-2',
              index: 0,
              name: 'emotion_report',
              content: { ok: true },
              cost: 0,
              status: 'success' as const
            }])
        }
      }
    )

    await loop.execute()

    expect(stepCommitter.getFinalAssistantMessage().body.segments).toEqual([
      expect.objectContaining({ type: 'reasoning', content: 'reasoning one' }),
      expect.objectContaining({ type: 'toolCall', toolCallId: 'tool-1' }),
      expect.objectContaining({ type: 'reasoning', content: 'reasoning two' }),
      expect.objectContaining({ type: 'toolCall', toolCallId: 'tool-2' }),
      expect.objectContaining({ type: 'text', content: 'Final answer' })
    ])
    expect(stepCommitter.getFinalAssistantMessage().body.toolCalls).toEqual([
      expect.objectContaining({ id: 'tool-1' }),
      expect.objectContaining({ id: 'tool-2' })
    ])
  })

  it('does not collapse identical reasoning text from different tool cycles when timestamps collide', async () => {
    const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(100)
    try {
      const parser = {
        parse: vi
          .fn()
          .mockReturnValueOnce(createParseResult({
            reasoningDelta: 'same reasoning',
            toolCalls: [{
              id: 'tool-1',
              name: 'memory_retrieval',
              args: '{}',
              status: 'pending',
              index: 0
            }]
          }))
          .mockReturnValueOnce(createParseResult({
            reasoningDelta: 'same reasoning',
            toolCalls: [{
              id: 'tool-2',
              name: 'emotion_report',
              args: '{}',
              status: 'pending',
              index: 0
            }]
          }))
          .mockReturnValueOnce(createParseResult({
            contentDelta: 'Final answer',
            toolCalls: []
          })),
        getState: vi.fn(),
        setState: vi.fn(),
        reset: vi.fn()
      }

      unifiedChatRequestMock
        .mockResolvedValueOnce(createAsyncResponse([{ content: 'cycle-1' } as IUnifiedResponse]))
        .mockResolvedValueOnce(createAsyncResponse([{ content: 'cycle-2' } as IUnifiedResponse]))
        .mockResolvedValueOnce(createAsyncResponse([{ content: 'cycle-3' } as IUnifiedResponse]))

      const requestHistory = new InMemoryRequestHistory([
        { role: 'user', content: 'hello', segments: [] }
      ])
      const stepCommitter = new InMemoryStepCommitter()

      const loop = new AgentStepLoop(
        {
          request: {
            adapterPluginId: 'test',
            baseUrl: 'https://example.com',
            apiKey: 'key',
            model: 'model-1',
            modelType: 'llm',
            messages: [],
            stream: true
          },
          modelName: 'model-1',
          signal: new AbortController().signal,
          chatUuid: 'chat-1'
        },
        {
          parser: parser as any,
          requestHistory,
          stepCommitter,
          beforeFetch: vi.fn(),
          afterFetch: vi.fn(),
          toolService: {
            execute: vi
              .fn()
              .mockResolvedValueOnce([{
                id: 'tool-1',
                index: 0,
                name: 'memory_retrieval',
                content: { ok: true },
                cost: 0,
                status: 'success' as const
              }])
              .mockResolvedValueOnce([{
                id: 'tool-2',
                index: 0,
                name: 'emotion_report',
                content: { ok: true },
                cost: 0,
                status: 'success' as const
              }])
          }
        }
      )

      await loop.execute()

      expect(
        stepCommitter.getFinalAssistantMessage().body.segments.filter(
          (segment) => segment.type === 'reasoning' && segment.content === 'same reasoning'
        )
      ).toHaveLength(2)
    } finally {
      dateNowSpy.mockRestore()
    }
  })
})
