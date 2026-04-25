import { describe, expect, it, vi } from 'vitest'
import type { AgentEvent } from '@main/agent/runtime/events/AgentEvent'
import { HostRenderEventMapper } from '@main/hosts/shared/render'

vi.mock('../../mapping/ChatEventMapper', () => ({
  ChatEventMapper: class {
    emitStreamPreviewUpdated = vi.fn()
    emitStreamPreviewSegmentUpdated = vi.fn()
    emitStreamPreviewCleared = vi.fn()
    emitToolResultAttached = vi.fn()
    emitMessageUpdated = vi.fn()
    emitMessageSegmentUpdated = vi.fn()
  }
}))

vi.mock('../../persistence/ChatStepStore', () => ({
  ChatStepStore: class {
    persistAssistantMessage = vi.fn((message: MessageEntity) => message)
    persistToolResultMessage = vi.fn((body: ChatMessage, chatId?: number, chatUuid?: string) => ({
      id: 900,
      chatId,
      chatUuid,
      body
    }))
  }
}))

import { ChatRenderResponder } from '../ChatRenderResponder'

const mapperByResponder = new WeakMap<ChatRenderResponder, HostRenderEventMapper>()

const dispatchAgentEvent = async (
  responder: ChatRenderResponder,
  event: AgentEvent
): Promise<void> => {
  const mapper = mapperByResponder.get(responder) || new HostRenderEventMapper()
  mapperByResponder.set(responder, mapper)
  for (const hostEvent of mapper.map(event)) {
    await responder.handle(hostEvent)
  }
}

describe('ChatRenderResponder', () => {
  it('keeps final text when a completed step also contains tool calls', async () => {
    const emitter = {
      emit: vi.fn()
    } as any

    const placeholder: MessageEntity = {
      id: 101,
      chatId: 1,
      chatUuid: 'chat-1',
      body: {
        role: 'assistant',
        content: '',
        segments: []
      }
    }

    const messageEntities = [placeholder]
    const adapter = new ChatRenderResponder(emitter, messageEntities, placeholder)

    await dispatchAgentEvent(adapter, {
      type: 'step.completed',
      timestamp: 123,
      step: {
        status: 'completed',
        stepId: 'step-1',
        stepIndex: 0,
        startedAt: 100,
        completedAt: 123,
        content: 'final answer',
        toolCalls: [{
          id: 'tool-1',
          type: 'function',
          function: {
            name: 'read',
            arguments: '{"path":"README.md"}'
          },
          index: 0
        }],
        finishReason: 'stop'
      }
    })

    const finalMessage = adapter.getFinalAssistantMessage()
    expect(finalMessage.body.content).toBe('final answer')
    expect(finalMessage.body.segments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'text',
          content: 'final answer'
        }),
        expect.objectContaining({
          type: 'toolCall',
          name: 'read'
        })
      ])
    )
  })

  it('marks stream preview bodies with stream_preview source', async () => {
    const emitter = {
      emit: vi.fn()
    } as any

    const placeholder: MessageEntity = {
      id: 101,
      chatId: 1,
      chatUuid: 'chat-1',
      body: {
        role: 'assistant',
        content: '',
        segments: []
      }
    }

    const adapter = new ChatRenderResponder(emitter, [placeholder], placeholder)

    await dispatchAgentEvent(adapter, {
      type: 'step.delta',
      stepId: 'step-1',
      stepIndex: 0,
      timestamp: 123,
      delta: {
        type: 'content_delta',
        timestamp: 123,
        content: 'hello'
      },
      snapshot: {
        content: 'hello',
        reasoning: '',
        toolCalls: []
      }
    })

    const emitStreamPreviewUpdated = (adapter as any).messageEvents.emitStreamPreviewUpdated as ReturnType<typeof vi.fn>
    expect(emitStreamPreviewUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          source: 'stream_preview',
          content: 'hello'
        })
      })
    )
  })

  it('keeps preview text segment identity stable across incremental content updates', async () => {
    const emitter = {
      emit: vi.fn()
    } as any

    const placeholder: MessageEntity = {
      id: 101,
      chatId: 1,
      chatUuid: 'chat-1',
      body: {
        role: 'assistant',
        content: '',
        segments: []
      }
    }

    const adapter = new ChatRenderResponder(emitter, [placeholder], placeholder)

    await dispatchAgentEvent(adapter, {
      type: 'step.delta',
      stepId: 'step-1',
      stepIndex: 0,
      timestamp: 123,
      delta: {
        type: 'content_delta',
        timestamp: 123,
        content: 'hello'
      },
      snapshot: {
        content: 'hello',
        reasoning: '',
        toolCalls: []
      }
    })

    await dispatchAgentEvent(adapter, {
      type: 'step.delta',
      stepId: 'step-1',
      stepIndex: 0,
      timestamp: 124,
      delta: {
        type: 'content_delta',
        timestamp: 124,
        content: ' world'
      },
      snapshot: {
        content: 'hello world',
        reasoning: '',
        toolCalls: []
      }
    })

    const emitStreamPreviewUpdated = (adapter as any).messageEvents.emitStreamPreviewUpdated as ReturnType<typeof vi.fn>
    const emitStreamPreviewSegmentUpdated = (adapter as any).messageEvents.emitStreamPreviewSegmentUpdated as ReturnType<typeof vi.fn>
    const firstPreviewBody = emitStreamPreviewUpdated.mock.calls[0][0].body as ChatMessage
    const firstTextSegment = firstPreviewBody.segments.find(
      (segment): segment is TextSegment => segment.type === 'text'
    )
    const secondPatch = emitStreamPreviewSegmentUpdated.mock.calls[0][1] as {
      segment: TextSegment
      content?: string
    }
    const secondTextSegment = secondPatch.segment

    expect(firstTextSegment?.segmentId).toBe('preview:step-1:text:0')
    expect(secondTextSegment?.segmentId).toBe('preview:step-1:text:0')
    expect(secondTextSegment?.content).toBe('hello world')
    expect(secondPatch.content).toBe('hello world')
  })

  it('updates assistant tool-call segments when tool execution completes', async () => {
    const emitter = {
      emit: vi.fn()
    } as any

    const placeholder: MessageEntity = {
      id: 101,
      chatId: 1,
      chatUuid: 'chat-1',
      body: {
        role: 'assistant',
        content: '',
        segments: []
      }
    }

    const messageEntities = [placeholder]
    const adapter = new ChatRenderResponder(emitter, messageEntities, placeholder)

    await dispatchAgentEvent(adapter, {
      type: 'step.completed',
      timestamp: 123,
      step: {
        status: 'completed',
        stepId: 'step-1',
        stepIndex: 0,
        startedAt: 100,
        completedAt: 123,
        content: '',
        toolCalls: [{
          id: 'tool-1',
          type: 'function',
          function: {
            name: 'read',
            arguments: '{"path":"README.md"}'
          },
          index: 0
        }],
        finishReason: 'tool_calls'
      }
    })

    await dispatchAgentEvent(adapter, {
      type: 'tool.execution_progress',
      phase: 'completed',
      timestamp: 124,
      result: {
        status: 'success',
        stepId: 'step-1',
        toolCallId: 'tool-1',
        toolCallIndex: 0,
        toolName: 'read',
        cost: 1680,
        content: 'file content'
      }
    })

    expect(adapter.getFinalAssistantMessage().body.segments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'toolCall',
          toolCallId: 'tool-1',
          cost: 1680,
          isError: false,
          content: expect.objectContaining({
            status: 'success',
            result: 'file content'
          })
        })
      ])
    )
    expect(messageEntities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          body: expect.objectContaining({
            role: 'tool',
            toolCallId: 'tool-1',
            content: 'file content'
          })
        })
      ])
    )
  })

  it('does not re-emit tool confirmation outward events from chat host', async () => {
    const emitter = {
      emit: vi.fn()
    } as any

    const placeholder: MessageEntity = {
      id: 101,
      chatId: 1,
      chatUuid: 'chat-1',
      body: {
        role: 'assistant',
        content: '',
        segments: []
      }
    }

    const responder = new ChatRenderResponder(emitter, [placeholder], placeholder)

    await responder.handle({
      type: 'host.tool.confirmation.required',
      timestamp: 123,
      stepId: 'step-1',
      toolCallId: 'tool-1',
      toolCallIndex: 0,
      toolName: 'execute_command'
    })

    expect(emitter.emit).not.toHaveBeenCalled()
  })

  it('emits committed assistant updates for persisted assistant drafts', async () => {
    const emitter = {
      emit: vi.fn()
    } as any

    const placeholder: MessageEntity = {
      id: 101,
      chatId: 1,
      chatUuid: 'chat-1',
      body: {
        role: 'assistant',
        content: '',
        segments: []
      }
    }

    const adapter = new ChatRenderResponder(emitter, [placeholder], placeholder)

    await dispatchAgentEvent(adapter, {
      type: 'step.completed',
      timestamp: 123,
      step: {
        status: 'completed',
        stepId: 'step-1',
        stepIndex: 0,
        startedAt: 100,
        completedAt: 123,
        content: 'final answer',
        toolCalls: [],
        finishReason: 'stop'
      }
    })

    const emitStreamPreviewUpdated = (adapter as any).messageEvents.emitStreamPreviewUpdated as ReturnType<typeof vi.fn>
    const emitMessageUpdated = (adapter as any).messageEvents.emitMessageUpdated as ReturnType<typeof vi.fn>

    expect(emitStreamPreviewUpdated).not.toHaveBeenCalled()
    expect(emitMessageUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          content: 'final answer',
          segments: expect.arrayContaining([
            expect.objectContaining({
              type: 'text',
              segmentId: 'committed:step-1:text:0',
              content: 'final answer'
            })
          ]),
          typewriterCompleted: false
        })
      })
    )
  })

  it('emits committed tool progress updates for persisted assistant drafts', async () => {
    const emitter = {
      emit: vi.fn()
    } as any

    const placeholder: MessageEntity = {
      id: 101,
      chatId: 1,
      chatUuid: 'chat-1',
      body: {
        role: 'assistant',
        content: '',
        segments: []
      }
    }

    const adapter = new ChatRenderResponder(emitter, [placeholder], placeholder)

    await dispatchAgentEvent(adapter, {
      type: 'step.completed',
      timestamp: 123,
      step: {
        status: 'completed',
        stepId: 'step-1',
        stepIndex: 0,
        startedAt: 100,
        completedAt: 123,
        content: '',
        toolCalls: [{
          id: 'tool-1',
          type: 'function',
          function: {
            name: 'read',
            arguments: '{"path":"README.md"}'
          },
          index: 0
        }],
        finishReason: 'tool_calls'
      }
    })

    const emitMessageUpdated = (adapter as any).messageEvents.emitMessageUpdated as ReturnType<typeof vi.fn>
    const emitStreamPreviewUpdated = (adapter as any).messageEvents.emitStreamPreviewUpdated as ReturnType<typeof vi.fn>
    emitMessageUpdated.mockClear()
    emitStreamPreviewUpdated.mockClear()

    await dispatchAgentEvent(adapter, {
      type: 'tool.execution_progress',
      phase: 'started',
      stepId: 'step-1',
      timestamp: 124,
      toolCallId: 'tool-1',
      toolCallIndex: 0,
      toolName: 'read'
    })

    expect(emitStreamPreviewUpdated).not.toHaveBeenCalled()
    expect(emitMessageUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          segments: expect.arrayContaining([
            expect.objectContaining({
              type: 'toolCall',
              toolCallId: 'tool-1',
              content: expect.objectContaining({
                status: 'running'
              })
            })
          ])
        })
      })
    )
    expect(emitMessageUpdated).toHaveBeenCalledTimes(1)
  })

  it('keeps persisted tool-progress updates non-final while committed draft remains typewriter-complete', async () => {
    const emitter = {
      emit: vi.fn()
    } as any

    const placeholder: MessageEntity = {
      id: 101,
      chatId: 1,
      chatUuid: 'chat-1',
      body: {
        role: 'assistant',
        content: '',
        segments: []
      }
    }

    const adapter = new ChatRenderResponder(emitter, [placeholder], placeholder)

    await dispatchAgentEvent(adapter, {
      type: 'step.delta',
      stepId: 'step-1',
      stepIndex: 0,
      timestamp: 120,
      delta: {
        type: 'content_delta',
        timestamp: 120,
        content: 'hello'
      },
      snapshot: {
        content: 'hello',
        reasoning: '',
        toolCalls: []
      }
    })

    await dispatchAgentEvent(adapter, {
      type: 'step.completed',
      timestamp: 121,
      step: {
        status: 'completed',
        stepId: 'step-1',
        stepIndex: 0,
        startedAt: 100,
        completedAt: 121,
        content: 'hello',
        toolCalls: [{
          id: 'tool-1',
          type: 'function',
          function: {
            name: 'read',
            arguments: '{"path":"README.md"}'
          },
          index: 0
        }],
        finishReason: 'tool_calls'
      }
    })

    const emitStreamPreviewUpdated = (adapter as any).messageEvents.emitStreamPreviewUpdated as ReturnType<typeof vi.fn>
    const emitMessageUpdated = (adapter as any).messageEvents.emitMessageUpdated as ReturnType<typeof vi.fn>
    emitStreamPreviewUpdated.mockClear()
    emitMessageUpdated.mockClear()

    await dispatchAgentEvent(adapter, {
      type: 'tool.execution_progress',
      phase: 'started',
      stepId: 'step-1',
      timestamp: 122,
      toolCallId: 'tool-1',
      toolCallIndex: 0,
      toolName: 'read'
    })

    expect(emitStreamPreviewUpdated).not.toHaveBeenCalled()
    expect(emitMessageUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          typewriterCompleted: true
        })
      })
    )
    expect(emitMessageUpdated).toHaveBeenCalledTimes(1)
    expect(adapter.getFinalAssistantMessage().body.typewriterCompleted).toBe(true)
  })

  it('re-emits committed assistant updates when a tool segment changes', async () => {
    const emitter = {
      emit: vi.fn()
    } as any

    const placeholder: MessageEntity = {
      id: 101,
      chatId: 1,
      chatUuid: 'chat-1',
      body: {
        role: 'assistant',
        content: '',
        segments: []
      }
    }

    const adapter = new ChatRenderResponder(emitter, [placeholder], placeholder)

    await dispatchAgentEvent(adapter, {
      type: 'step.completed',
      timestamp: 123,
      step: {
        status: 'completed',
        stepId: 'step-1',
        stepIndex: 0,
        startedAt: 100,
        completedAt: 123,
        content: 'final answer',
        toolCalls: [{
          id: 'tool-1',
          type: 'function',
          function: {
            name: 'read',
            arguments: '{"path":"README.md"}'
          },
          index: 0
        }],
        finishReason: 'tool_calls'
      }
    })

    const emitStreamPreviewUpdated = (adapter as any).messageEvents.emitStreamPreviewUpdated as ReturnType<typeof vi.fn>
    const emitMessageUpdated = (adapter as any).messageEvents.emitMessageUpdated as ReturnType<typeof vi.fn>
    emitStreamPreviewUpdated.mockClear()
    emitMessageUpdated.mockClear()

    await dispatchAgentEvent(adapter, {
      type: 'tool.execution_progress',
      phase: 'completed',
      timestamp: 124,
      result: {
        status: 'success',
        stepId: 'step-1',
        toolCallId: 'tool-1',
        toolCallIndex: 0,
        toolName: 'read',
        cost: 1680,
        content: 'file content'
      }
    })

    expect(emitStreamPreviewUpdated).not.toHaveBeenCalled()
    expect(emitMessageUpdated).toHaveBeenCalledTimes(1)
    expect(emitMessageUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          content: 'final answer',
          segments: expect.arrayContaining([
            expect.objectContaining({
              type: 'toolCall',
              toolCallId: 'tool-1',
              content: expect.objectContaining({
                status: 'success',
                result: 'file content'
              })
            })
          ])
        })
      })
    )
  })

  it('preserves prior tool-call result segments when a later completed step adds final text', async () => {
    const emitter = {
      emit: vi.fn()
    } as any

    const placeholder: MessageEntity = {
      id: 101,
      chatId: 1,
      chatUuid: 'chat-1',
      body: {
        role: 'assistant',
        content: '',
        segments: []
      }
    }

    const adapter = new ChatRenderResponder(emitter, [placeholder], placeholder)

    await dispatchAgentEvent(adapter, {
      type: 'step.completed',
      timestamp: 123,
      step: {
        status: 'completed',
        stepId: 'step-1',
        stepIndex: 0,
        startedAt: 100,
        completedAt: 123,
        content: '',
        toolCalls: [{
          id: 'tool-1',
          type: 'function',
          function: {
            name: 'read',
            arguments: '{"path":"README.md"}'
          },
          index: 0
        }],
        finishReason: 'tool_calls'
      }
    })

    await dispatchAgentEvent(adapter, {
      type: 'tool.execution_progress',
      phase: 'completed',
      timestamp: 124,
      result: {
        status: 'success',
        stepId: 'step-1',
        toolCallId: 'tool-1',
        toolCallIndex: 0,
        toolName: 'read',
        content: 'file content'
      }
    })

    await dispatchAgentEvent(adapter, {
      type: 'step.completed',
      timestamp: 130,
      step: {
        status: 'completed',
        stepId: 'step-2',
        stepIndex: 1,
        startedAt: 125,
        completedAt: 130,
        content: 'Final answer',
        toolCalls: [],
        finishReason: 'stop'
      }
    })

    expect(adapter.getFinalAssistantMessage().body.content).toBe('Final answer')
    expect(adapter.getFinalAssistantMessage().body.segments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'toolCall',
          toolCallId: 'tool-1',
          content: expect.objectContaining({
            status: 'success',
            result: 'file content'
          })
        }),
        expect.objectContaining({
          type: 'text',
          content: 'Final answer'
        })
      ])
    )
  })

  it('preserves prior committed text when a later completed step adds a follow-up after tool execution', async () => {
    const emitter = {
      emit: vi.fn()
    } as any

    const placeholder: MessageEntity = {
      id: 101,
      chatId: 1,
      chatUuid: 'chat-1',
      body: {
        role: 'assistant',
        content: '',
        segments: []
      }
    }

    const adapter = new ChatRenderResponder(emitter, [placeholder], placeholder)

    await dispatchAgentEvent(adapter, {
      type: 'step.completed',
      timestamp: 120,
      step: {
        status: 'completed',
        stepId: 'step-1',
        stepIndex: 0,
        startedAt: 100,
        completedAt: 120,
        content: '让我先看看这颗新脑袋。',
        toolCalls: [{
          id: 'tool-1',
          type: 'function',
          function: {
            name: 'emotion_report',
            arguments: '{}'
          },
          index: 0
        }],
        finishReason: 'tool_calls'
      }
    })

    await dispatchAgentEvent(adapter, {
      type: 'tool.execution_progress',
      phase: 'completed',
      timestamp: 121,
      result: {
        status: 'success',
        stepId: 'step-1',
        toolCallId: 'tool-1',
        toolCallIndex: 0,
        toolName: 'emotion_report',
        content: {
          success: true,
          label: 'joy',
          emoji: '🙂',
          intensity: 7
        }
      }
    })

    await dispatchAgentEvent(adapter, {
      type: 'step.completed',
      timestamp: 130,
      step: {
        status: 'completed',
        stepId: 'step-2',
        stepIndex: 1,
        startedAt: 125,
        completedAt: 130,
        content: '新脑袋新气象，等着你验货 🫡',
        toolCalls: [],
        finishReason: 'stop'
      }
    })

    expect(adapter.getFinalAssistantMessage().body.content).toBe(
      '让我先看看这颗新脑袋。\n\n新脑袋新气象，等着你验货 🫡'
    )
    expect(adapter.getFinalAssistantMessage().body.emotion).toMatchObject({
      label: 'joy',
      emoji: '🙂',
      intensity: 7,
      source: 'tool'
    })
    expect(adapter.getFinalAssistantMessage().body.segments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'toolCall',
          name: 'emotion_report',
          presentation: {
            transcriptVisible: false
          }
        }),
        expect.objectContaining({
          type: 'text',
          segmentId: 'committed:step-1:text:0',
          content: '让我先看看这颗新脑袋。'
        }),
        expect.objectContaining({
          type: 'text',
          segmentId: 'committed:step-2:text:0',
          content: '新脑袋新气象，等着你验货 🫡'
        })
      ])
    )
  })

  it('preserves prior reasoning segments when a later completed step adds only follow-up text', async () => {
    const emitter = {
      emit: vi.fn()
    } as any

    const placeholder: MessageEntity = {
      id: 101,
      chatId: 1,
      chatUuid: 'chat-1',
      body: {
        role: 'assistant',
        content: '',
        segments: []
      }
    }

    const adapter = new ChatRenderResponder(emitter, [placeholder], placeholder)

    await dispatchAgentEvent(adapter, {
      type: 'step.completed',
      timestamp: 120,
      step: {
        status: 'completed',
        stepId: 'step-1',
        stepIndex: 0,
        startedAt: 100,
        completedAt: 120,
        content: '先帮你检查一遍。',
        reasoning: '正在核对你的当前配置和默认行为。',
        toolCalls: [{
          id: 'tool-1',
          type: 'function',
          function: {
            name: 'read',
            arguments: '{"path":"README.md"}'
          },
          index: 0
        }],
        finishReason: 'tool_calls'
      }
    })

    await dispatchAgentEvent(adapter, {
      type: 'tool.execution_progress',
      phase: 'completed',
      timestamp: 121,
      result: {
        status: 'success',
        stepId: 'step-1',
        toolCallId: 'tool-1',
        toolCallIndex: 0,
        toolName: 'read',
        content: 'ok'
      }
    })

    await dispatchAgentEvent(adapter, {
      type: 'step.completed',
      timestamp: 130,
      step: {
        status: 'completed',
        stepId: 'step-2',
        stepIndex: 1,
        startedAt: 125,
        completedAt: 130,
        content: '新脑袋新气象，等着你验货 🫡',
        reasoning: '',
        toolCalls: [],
        finishReason: 'stop'
      }
    })

    expect(adapter.getFinalAssistantMessage().body.segments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'reasoning',
          segmentId: 'committed:step-1:reasoning:0',
          content: '正在核对你的当前配置和默认行为。'
        }),
        expect.objectContaining({
          type: 'text',
          segmentId: 'committed:step-2:text:0',
          content: '新脑袋新气象，等着你验货 🫡'
        })
      ])
    )
  })

  it('materializes separate reasoning episodes with independent timing boundaries', async () => {
    const emitter = {
      emit: vi.fn()
    } as any

    const placeholder: MessageEntity = {
      id: 101,
      chatId: 1,
      chatUuid: 'chat-1',
      body: {
        role: 'assistant',
        content: '',
        segments: []
      }
    }

    const adapter = new ChatRenderResponder(emitter, [placeholder], placeholder)

    await dispatchAgentEvent(adapter, {
      type: 'step.started',
      timestamp: 100,
      stepId: 'step-1',
      stepIndex: 0
    })

    await dispatchAgentEvent(adapter, {
      type: 'step.delta',
      stepId: 'step-1',
      stepIndex: 0,
      timestamp: 101,
      delta: {
        type: 'reasoning_delta',
        timestamp: 101,
        reasoning: 'reasoning-1'
      },
      snapshot: {
        content: '',
        reasoning: 'reasoning-1',
        toolCalls: []
      }
    })

    await dispatchAgentEvent(adapter, {
      type: 'step.delta',
      stepId: 'step-1',
      stepIndex: 0,
      timestamp: 115,
      delta: {
        type: 'tool_call_started',
        timestamp: 115,
        toolCallId: 'tool-1',
        toolCallIndex: 0,
        toolName: 'read'
      },
      snapshot: {
        content: '',
        reasoning: 'reasoning-1',
        toolCalls: []
      }
    })

    await dispatchAgentEvent(adapter, {
      type: 'step.delta',
      stepId: 'step-1',
      stepIndex: 0,
      timestamp: 120,
      delta: {
        type: 'reasoning_delta',
        timestamp: 120,
        reasoning: 'reasoning-2'
      },
      snapshot: {
        content: '',
        reasoning: 'reasoning-1reasoning-2',
        toolCalls: []
      }
    })

    await dispatchAgentEvent(adapter, {
      type: 'step.delta',
      stepId: 'step-1',
      stepIndex: 0,
      timestamp: 138,
      delta: {
        type: 'content_delta',
        timestamp: 138,
        content: 'final text'
      },
      snapshot: {
        content: 'final text',
        reasoning: 'reasoning-1reasoning-2',
        toolCalls: []
      }
    })

    await dispatchAgentEvent(adapter, {
      type: 'step.completed',
      timestamp: 140,
      step: {
        status: 'completed',
        stepId: 'step-1',
        stepIndex: 0,
        startedAt: 100,
        completedAt: 140,
        content: 'final text',
        reasoning: 'reasoning-1reasoning-2',
        toolCalls: [{
          id: 'tool-1',
          type: 'function',
          function: {
            name: 'read',
            arguments: '{}'
          },
          index: 0
        }],
        finishReason: 'stop'
      }
    })

    expect(adapter.getFinalAssistantMessage().body.segments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'reasoning',
          segmentId: 'committed:step-1:reasoning:0',
          content: 'reasoning-1',
          timestamp: 101,
          endedAt: 115
        }),
        expect.objectContaining({
          type: 'toolCall',
          segmentId: 'committed:step-1:tool:tool-1',
          timestamp: 115
        }),
        expect.objectContaining({
          type: 'reasoning',
          segmentId: 'committed:step-1:reasoning:1',
          content: 'reasoning-2',
          timestamp: 120,
          endedAt: 138
        }),
        expect.objectContaining({
          type: 'text',
          segmentId: 'committed:step-1:text:0',
          content: 'final text',
          timestamp: 138
        })
      ])
    )
  })

  it('falls back to full preview update when text starts after reasoning and closes its timing window', async () => {
    const emitter = {
      emit: vi.fn()
    } as any

    const placeholder: MessageEntity = {
      id: 101,
      chatId: 1,
      chatUuid: 'chat-1',
      body: {
        role: 'assistant',
        content: '',
        segments: []
      }
    }

    const adapter = new ChatRenderResponder(emitter, [placeholder], placeholder)

    await dispatchAgentEvent(adapter, {
      type: 'step.started',
      timestamp: 100,
      stepId: 'step-1',
      stepIndex: 0
    })

    await dispatchAgentEvent(adapter, {
      type: 'step.delta',
      stepId: 'step-1',
      stepIndex: 0,
      timestamp: 101,
      delta: {
        type: 'reasoning_delta',
        timestamp: 101,
        reasoning: 'thinking'
      },
      snapshot: {
        content: '',
        reasoning: 'thinking',
        toolCalls: []
      }
    })

    await dispatchAgentEvent(adapter, {
      type: 'step.delta',
      stepId: 'step-1',
      stepIndex: 0,
      timestamp: 130,
      delta: {
        type: 'content_delta',
        timestamp: 130,
        content: 'answer'
      },
      snapshot: {
        content: 'answer',
        reasoning: 'thinking',
        toolCalls: []
      }
    })

    const emitStreamPreviewUpdated = (adapter as any).messageEvents.emitStreamPreviewUpdated as ReturnType<typeof vi.fn>
    const emitStreamPreviewSegmentUpdated = (adapter as any).messageEvents.emitStreamPreviewSegmentUpdated as ReturnType<typeof vi.fn>
    const latestPreview = emitStreamPreviewUpdated.mock.calls.at(-1)?.[0]?.body as ChatMessage
    const reasoningSegment = latestPreview.segments.find(
      (segment): segment is ReasoningSegment => segment.type === 'reasoning'
    )

    expect(emitStreamPreviewUpdated).toHaveBeenCalledTimes(2)
    expect(emitStreamPreviewSegmentUpdated).not.toHaveBeenCalled()
    expect(reasoningSegment).toEqual(
      expect.objectContaining({
        segmentId: 'preview:step-1:reasoning:0',
        timestamp: 101,
        endedAt: 130
      })
    )
    expect(latestPreview.segments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'text',
          segmentId: 'preview:step-1:text:0',
          content: 'answer',
          timestamp: 130
        })
      ])
    )
  })

  it('keeps reasoning timing stable after later committed tool updates', async () => {
    const emitter = {
      emit: vi.fn()
    } as any

    const placeholder: MessageEntity = {
      id: 101,
      chatId: 1,
      chatUuid: 'chat-1',
      body: {
        role: 'assistant',
        content: '',
        segments: []
      }
    }

    const adapter = new ChatRenderResponder(emitter, [placeholder], placeholder)

    await dispatchAgentEvent(adapter, {
      type: 'step.completed',
      timestamp: 140,
      step: {
        status: 'completed',
        stepId: 'step-1',
        stepIndex: 0,
        startedAt: 100,
        completedAt: 140,
        content: '',
        reasoning: 'reasoning',
        toolCalls: [{
          id: 'tool-1',
          type: 'function',
          function: {
            name: 'read',
            arguments: '{}'
          },
          index: 0
        }],
        finishReason: 'tool_calls'
      }
    })

    await dispatchAgentEvent(adapter, {
      type: 'tool.execution_progress',
      phase: 'completed',
      timestamp: 220,
      result: {
        status: 'success',
        stepId: 'step-1',
        toolCallId: 'tool-1',
        toolCallIndex: 0,
        toolName: 'read',
        content: 'ok'
      }
    })

    const reasoningSegment = adapter.getFinalAssistantMessage().body.segments.find(
      (segment): segment is ReasoningSegment => segment.type === 'reasoning'
    )

    expect(reasoningSegment).toEqual(
      expect.objectContaining({
        segmentId: 'committed:step-1:reasoning:0',
        timestamp: 100,
        endedAt: 140
      })
    )
  })

  it('marks committed assistant message as typewriter completed when preview was already active', async () => {
    const emitter = {
      emit: vi.fn()
    } as any

    const placeholder: MessageEntity = {
      id: 101,
      chatId: 1,
      chatUuid: 'chat-1',
      body: {
        role: 'assistant',
        content: '',
        segments: []
      }
    }

    const adapter = new ChatRenderResponder(emitter, [placeholder], placeholder)

    await dispatchAgentEvent(adapter, {
      type: 'step.delta',
      stepId: 'step-1',
      stepIndex: 0,
      timestamp: 120,
      delta: {
        type: 'content_delta',
        timestamp: 120,
        content: 'hello'
      },
      snapshot: {
        content: 'hello',
        reasoning: '',
        toolCalls: []
      }
    })

    await dispatchAgentEvent(adapter, {
      type: 'step.completed',
      timestamp: 123,
      step: {
        status: 'completed',
        stepId: 'step-1',
        stepIndex: 0,
        startedAt: 100,
        completedAt: 123,
        content: 'hello',
        toolCalls: [],
        finishReason: 'stop'
      }
    })

    expect(adapter.getFinalAssistantMessage().body).toEqual(
      expect.objectContaining({
        content: 'hello',
        typewriterCompleted: true
      })
    )
  })

  it('keeps tool-call segments ordered by first appearance across steps with repeated per-step indexes', async () => {
    const emitter = {
      emit: vi.fn()
    } as any

    const placeholder: MessageEntity = {
      id: 101,
      chatId: 1,
      chatUuid: 'chat-1',
      body: {
        role: 'assistant',
        content: '',
        segments: []
      }
    }

    const adapter = new ChatRenderResponder(emitter, [placeholder], placeholder)

    await dispatchAgentEvent(adapter, {
      type: 'step.completed',
      timestamp: 100,
      step: {
        status: 'completed',
        stepId: 'step-1',
        stepIndex: 0,
        startedAt: 90,
        completedAt: 100,
        content: '',
        toolCalls: [{
          id: 'tool-b',
          type: 'function',
          function: {
            name: 'read',
            arguments: '{"path":"b.txt"}'
          },
          index: 0
        }],
        finishReason: 'tool_calls'
      }
    })

    await dispatchAgentEvent(adapter, {
      type: 'tool.execution_progress',
      phase: 'completed',
      timestamp: 101,
      result: {
        status: 'success',
        stepId: 'step-1',
        toolCallId: 'tool-b',
        toolCallIndex: 0,
        toolName: 'read',
        content: 'b'
      }
    })

    await dispatchAgentEvent(adapter, {
      type: 'step.completed',
      timestamp: 110,
      step: {
        status: 'completed',
        stepId: 'step-2',
        stepIndex: 1,
        startedAt: 105,
        completedAt: 110,
        content: 'done',
        toolCalls: [{
          id: 'tool-a',
          type: 'function',
          function: {
            name: 'read',
            arguments: '{"path":"a.txt"}'
          },
          index: 0
        }],
        finishReason: 'tool_calls'
      }
    })

    await dispatchAgentEvent(adapter, {
      type: 'tool.execution_progress',
      phase: 'completed',
      timestamp: 111,
      result: {
        status: 'success',
        stepId: 'step-2',
        toolCallId: 'tool-a',
        toolCallIndex: 0,
        toolName: 'read',
        content: 'a'
      }
    })

    const toolCallSegments = adapter.getFinalAssistantMessage().body.segments.filter(
      (segment): segment is ToolCallSegment => segment.type === 'toolCall'
    )

    expect(toolCallSegments.map(segment => segment.toolCallId)).toEqual(['tool-b', 'tool-a'])
  })
})
