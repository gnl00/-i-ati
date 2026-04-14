import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RUN_STATES } from '@shared/run/lifecycle-events'
import type {
  AgentRenderMessageState,
  AgentRenderToolCallState,
  HostRenderEvent
} from '@main/hosts/shared/render'
import { TelegramRenderResponder } from '../TelegramRenderResponder'

const createState = (args: {
  stepId?: string
  text?: string
  toolCalls?: AgentRenderToolCallState[]
} = {}): AgentRenderMessageState => {
  const {
    stepId = 'step-1',
    text = '',
    toolCalls = []
  } = args

  return {
    stepId,
    content: text,
    blocks: [
      ...(text
        ? [{
          kind: 'text' as const,
          blockId: `${stepId}:text:0`,
          stepId,
          content: text,
          startedAt: 1
        }]
        : []),
      ...toolCalls.map((toolCall, index) => ({
        kind: 'tool' as const,
        blockId: `${stepId}:tool:${index}`,
        stepId,
        toolCallId: toolCall.toolCallId,
        startedAt: index + 2
      }))
    ],
    toolCalls
  }
}

const toolCall = (
  args: Partial<AgentRenderToolCallState> & Pick<AgentRenderToolCallState, 'toolCallId' | 'name' | 'status'>
): AgentRenderToolCallState => ({
  toolCallId: args.toolCallId,
  toolCallIndex: args.toolCallIndex ?? 0,
  name: args.name,
  status: args.status,
  ...(args.args ? { args: args.args } : {}),
  ...(args.cost !== undefined ? { cost: args.cost } : {}),
  ...(args.result !== undefined ? { result: args.result } : {}),
  ...(args.error ? { error: args.error } : {})
})

const previewUpdated = (preview: AgentRenderMessageState, timestamp = Date.now()): HostRenderEvent => ({
  type: 'host.preview.updated',
  timestamp,
  preview
})

const committedUpdated = (
  committed: AgentRenderMessageState,
  timestamp = Date.now(),
  previewWasActive = false
): HostRenderEvent => ({
  type: 'host.committed.updated',
  timestamp,
  committed,
  previewWasActive
})

const previewCleared = (timestamp = Date.now()): HostRenderEvent => ({
  type: 'host.preview.cleared',
  timestamp
})

const lifecycleUpdated = (state: typeof RUN_STATES[keyof typeof RUN_STATES], timestamp = Date.now()): HostRenderEvent => ({
  type: 'host.lifecycle.updated',
  timestamp,
  state
})

describe('TelegramRenderResponder', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('streams assistant updates and finalizes with plain-text edit', async () => {
    const sendMessage = vi.fn(async () => ({ message_id: 77 }))
    const editMessageText = vi.fn(async () => true)
    const responder = new TelegramRenderResponder({
      bot: {
        api: {
          sendMessage,
          editMessageText
        }
      } as any,
      envelope: {
        updateId: 1,
        messageId: '55',
        chatId: '123',
        chatType: 'private',
        text: 'hello',
        media: [],
        isMentioned: false,
        replyToBot: false,
        receivedAt: Date.now()
      }
    })

    await responder.handle(committedUpdated(createState({ text: 'Hello' })))
    await vi.advanceTimersByTimeAsync(400)

    expect(sendMessage).toHaveBeenCalledWith(123, 'Hello', {
      reply_parameters: { message_id: 55 }
    })

    await responder.handle(committedUpdated(createState({ text: '**Hello** world' })))
    await vi.advanceTimersByTimeAsync(400)

    expect(editMessageText).toHaveBeenNthCalledWith(1, 123, 77, '**Hello** world', {})

    await responder.handle(lifecycleUpdated(RUN_STATES.COMPLETED))

    expect(editMessageText).toHaveBeenNthCalledWith(2, 123, 77, '**Hello** world', {})
  })

  it('prefers preview updates before committed output arrives', async () => {
    const sendMessage = vi.fn(async () => ({ message_id: 88 }))
    const editMessageText = vi.fn(async () => true)
    const responder = new TelegramRenderResponder({
      bot: {
        api: {
          sendMessage,
          editMessageText
        }
      } as any,
      envelope: {
        updateId: 2,
        messageId: '56',
        chatId: '123',
        chatType: 'private',
        text: 'hello',
        media: [],
        isMentioned: false,
        replyToBot: false,
        receivedAt: Date.now()
      }
    })

    await responder.handle(previewUpdated(createState({ text: 'Preview hello' })))
    await vi.advanceTimersByTimeAsync(400)

    expect(sendMessage).toHaveBeenCalledWith(123, 'Preview hello', {
      reply_parameters: { message_id: 56 }
    })

    await responder.handle(previewCleared())
    await responder.handle(committedUpdated(createState({ text: 'Preview hello world' })))
    await vi.advanceTimersByTimeAsync(400)

    expect(editMessageText).toHaveBeenCalledWith(123, 88, 'Preview hello world', {})
  })

  it('updates telegram text when preview snapshots advance', async () => {
    const sendMessage = vi.fn(async () => ({ message_id: 89 }))
    const editMessageText = vi.fn(async () => true)
    const responder = new TelegramRenderResponder({
      bot: {
        api: {
          sendMessage,
          editMessageText
        }
      } as any,
      envelope: {
        updateId: 21,
        messageId: '66',
        chatId: '123',
        chatType: 'private',
        text: 'hello',
        media: [],
        isMentioned: false,
        replyToBot: false,
        receivedAt: Date.now()
      }
    })

    await responder.handle(previewUpdated(createState({ text: 'Hel' })))
    await vi.advanceTimersByTimeAsync(400)

    expect(sendMessage).toHaveBeenCalledWith(123, 'Hel', {
      reply_parameters: { message_id: 66 }
    })

    await responder.handle(previewUpdated(createState({ text: 'Hello' })))
    await vi.advanceTimersByTimeAsync(400)

    expect(editMessageText).toHaveBeenCalledWith(123, 89, 'Hello', {})
  })

  it('keeps previously sent preview text when a later cycle only emits a short follow-up', async () => {
    const sendMessage = vi.fn(async () => ({ message_id: 99 }))
    const editMessageText = vi.fn(async () => true)
    const responder = new TelegramRenderResponder({
      bot: {
        api: {
          sendMessage,
          editMessageText
        }
      } as any,
      envelope: {
        updateId: 3,
        messageId: '57',
        chatId: '123',
        chatType: 'private',
        text: 'hello',
        media: [],
        isMentioned: false,
        replyToBot: false,
        receivedAt: Date.now()
      }
    })

    await responder.handle(previewUpdated(createState({ text: 'First cycle answer' })))
    await vi.advanceTimersByTimeAsync(400)

    expect(sendMessage).toHaveBeenCalledWith(123, 'First cycle answer', {
      reply_parameters: { message_id: 57 }
    })

    await responder.handle(committedUpdated(createState({
      toolCalls: [
        toolCall({
          toolCallId: 'tool-1',
          name: 'emotion_report',
          status: 'success',
          result: { ok: true }
        })
      ]
    })))
    await vi.advanceTimersByTimeAsync(400)

    await responder.handle(previewCleared())
    await responder.handle(previewUpdated(createState({ text: '👍' })))
    await vi.advanceTimersByTimeAsync(400)

    expect(editMessageText).toHaveBeenCalledWith(123, 99, 'First cycle answer👍', {})
  })

  it('keeps tool output in place and appends a short follow-up after it', async () => {
    const sendMessage = vi.fn(async () => ({ message_id: 109 }))
    const editMessageText = vi.fn(async () => true)
    const responder = new TelegramRenderResponder({
      bot: {
        api: {
          sendMessage,
          editMessageText
        }
      } as any,
      envelope: {
        updateId: 10,
        messageId: '64',
        chatId: '123',
        chatType: 'private',
        text: 'hello',
        media: [],
        isMentioned: false,
        replyToBot: false,
        receivedAt: Date.now()
      }
    })

    await responder.handle(previewUpdated(createState({ text: 'First cycle answer' })))
    await vi.advanceTimersByTimeAsync(400)

    await responder.handle(committedUpdated(createState({
      text: 'First cycle answer',
      toolCalls: [
        toolCall({
          toolCallId: 'tool-1',
          name: 'memory_retrieval',
          status: 'success',
          result: { ok: true }
        })
      ]
    })))
    await vi.advanceTimersByTimeAsync(400)

    expect(editMessageText).toHaveBeenCalledWith(123, 109, 'First cycle answer\n\n> tool memory retrieval done', {})

    await responder.handle(previewCleared())
    await responder.handle(previewUpdated(createState({ text: '👍' })))
    await vi.advanceTimersByTimeAsync(400)

    expect(editMessageText).toHaveBeenLastCalledWith(
      123,
      109,
      'First cycle answer\n\n> tool memory retrieval done\n👍',
      {}
    )
  })

  it('replaces previously sent preview text when the later cycle produces a substantive new answer', async () => {
    const sendMessage = vi.fn(async () => ({ message_id: 100 }))
    const editMessageText = vi.fn(async () => true)
    const responder = new TelegramRenderResponder({
      bot: {
        api: {
          sendMessage,
          editMessageText
        }
      } as any,
      envelope: {
        updateId: 4,
        messageId: '58',
        chatId: '123',
        chatType: 'private',
        text: 'hello',
        media: [],
        isMentioned: false,
        replyToBot: false,
        receivedAt: Date.now()
      }
    })

    await responder.handle(previewUpdated(createState({ text: 'First cycle answer' })))
    await vi.advanceTimersByTimeAsync(400)

    await responder.handle(previewCleared())
    await responder.handle(previewUpdated(createState({ text: 'A much longer replacement answer' })))
    await vi.advanceTimersByTimeAsync(400)

    expect(editMessageText).toHaveBeenCalledWith(123, 100, 'A much longer replacement answer', {})
  })

  it('keeps previously sent preview text when an emotion-only tool cycle is followed by a substantive next answer', async () => {
    const sendMessage = vi.fn(async () => ({ message_id: 110 }))
    const editMessageText = vi.fn(async () => true)
    const responder = new TelegramRenderResponder({
      bot: {
        api: {
          sendMessage,
          editMessageText
        }
      } as any,
      envelope: {
        updateId: 11,
        messageId: '65',
        chatId: '123',
        chatType: 'private',
        text: 'hello',
        media: [],
        isMentioned: false,
        replyToBot: false,
        receivedAt: Date.now()
      }
    })

    await responder.handle(previewUpdated(createState({ text: '待几天？有具体想逛的地方没，还是随便转？' })))
    await vi.advanceTimersByTimeAsync(400)

    await responder.handle(committedUpdated(createState({
      toolCalls: [
        toolCall({
          toolCallId: 'tool-1',
          name: 'emotion_report',
          status: 'success',
          result: {
            success: true,
            label: 'happiness',
            emoji: '😄'
          }
        })
      ]
    })))
    await vi.advanceTimersByTimeAsync(400)

    await responder.handle(previewCleared())
    await responder.handle(previewUpdated(createState({ text: '成都这几天天气应该不错，美食街人多，记得带好手机钱包。' })))
    await vi.advanceTimersByTimeAsync(400)

    expect(editMessageText).toHaveBeenLastCalledWith(
      123,
      110,
      '待几天？有具体想逛的地方没，还是随便转？成都这几天天气应该不错，美食街人多，记得带好手机钱包。',
      {}
    )

    await responder.handle(lifecycleUpdated(RUN_STATES.COMPLETED))

    expect(editMessageText).toHaveBeenLastCalledWith(
      123,
      110,
      '待几天？有具体想逛的地方没，还是随便转？成都这几天天气应该不错，美食街人多，记得带好手机钱包。',
      {}
    )
  })

  it('treats short natural-language follow-ups as replacements instead of appending them', async () => {
    const sendMessage = vi.fn(async () => ({ message_id: 101 }))
    const editMessageText = vi.fn(async () => true)
    const responder = new TelegramRenderResponder({
      bot: {
        api: {
          sendMessage,
          editMessageText
        }
      } as any,
      envelope: {
        updateId: 5,
        messageId: '59',
        chatId: '123',
        chatType: 'private',
        text: 'hello',
        media: [],
        isMentioned: false,
        replyToBot: false,
        receivedAt: Date.now()
      }
    })

    await responder.handle(previewUpdated(createState({ text: 'First cycle answer' })))
    await vi.advanceTimersByTimeAsync(400)

    await responder.handle(previewCleared())
    await responder.handle(previewUpdated(createState({ text: '不是这个' })))
    await vi.advanceTimersByTimeAsync(400)

    expect(editMessageText).toHaveBeenCalledWith(123, 101, '不是这个', {})
  })

  it('treats short non-CJK natural-language follow-ups as replacements instead of appending them', async () => {
    const sendMessage = vi.fn(async () => ({ message_id: 102 }))
    const editMessageText = vi.fn(async () => true)
    const responder = new TelegramRenderResponder({
      bot: {
        api: {
          sendMessage,
          editMessageText
        }
      } as any,
      envelope: {
        updateId: 6,
        messageId: '60',
        chatId: '123',
        chatType: 'private',
        text: 'hello',
        media: [],
        isMentioned: false,
        replyToBot: false,
        receivedAt: Date.now()
      }
    })

    await responder.handle(previewUpdated(createState({ text: 'First cycle answer' })))
    await vi.advanceTimersByTimeAsync(400)

    await responder.handle(previewCleared())
    await responder.handle(previewUpdated(createState({ text: 'だめ' })))
    await vi.advanceTimersByTimeAsync(400)

    expect(editMessageText).toHaveBeenCalledWith(123, 102, 'だめ', {})
  })

  it('renders non-emotion tool calls as a quoted footer in telegram output', async () => {
    const sendMessage = vi.fn(async () => ({ message_id: 103 }))
    const editMessageText = vi.fn(async () => true)
    const responder = new TelegramRenderResponder({
      bot: {
        api: {
          sendMessage,
          editMessageText
        }
      } as any,
      envelope: {
        updateId: 7,
        messageId: '61',
        chatId: '123',
        chatType: 'private',
        text: 'hello',
        media: [],
        isMentioned: false,
        replyToBot: false,
        receivedAt: Date.now()
      }
    })

    await responder.handle(committedUpdated(createState({
      text: 'Looking it up',
      toolCalls: [
        toolCall({
          toolCallId: 'tool-1',
          name: 'memory_retrieval',
          status: 'success',
          result: { ok: true }
        })
      ]
    })))
    await vi.advanceTimersByTimeAsync(400)

    expect(sendMessage).toHaveBeenCalledWith(123, 'Looking it up\n\n> tool memory retrieval done', {
      reply_parameters: { message_id: 61 }
    })
  })

  it('does not render emotion_report tool calls in telegram output footer', async () => {
    const sendMessage = vi.fn(async () => ({ message_id: 104 }))
    const editMessageText = vi.fn(async () => true)
    const responder = new TelegramRenderResponder({
      bot: {
        api: {
          sendMessage,
          editMessageText
        }
      } as any,
      envelope: {
        updateId: 8,
        messageId: '62',
        chatId: '123',
        chatType: 'private',
        text: 'hello',
        media: [],
        isMentioned: false,
        replyToBot: false,
        receivedAt: Date.now()
      }
    })

    await responder.handle(committedUpdated(createState({
      text: 'Hi there',
      toolCalls: [
        toolCall({
          toolCallId: 'tool-1',
          name: 'emotion_report',
          status: 'success',
          result: {
            success: true,
            label: 'happiness',
            emoji: '😄',
            stateText: '心情不错'
          }
        })
      ]
    })))
    await vi.advanceTimersByTimeAsync(400)

    expect(sendMessage).toHaveBeenCalledWith(123, 'Hi there', {
      reply_parameters: { message_id: 62 }
    })
  })

  it('updates telegram text when only the tool footer status changes', async () => {
    const sendMessage = vi.fn(async () => ({ message_id: 105 }))
    const editMessageText = vi.fn(async () => true)
    const responder = new TelegramRenderResponder({
      bot: {
        api: {
          sendMessage,
          editMessageText
        }
      } as any,
      envelope: {
        updateId: 9,
        messageId: '63',
        chatId: '123',
        chatType: 'private',
        text: 'hello',
        media: [],
        isMentioned: false,
        replyToBot: false,
        receivedAt: Date.now()
      }
    })

    await responder.handle(committedUpdated(createState({
      text: 'Looking it up',
      toolCalls: [
        toolCall({
          toolCallId: 'tool-1',
          name: 'memory_retrieval',
          status: 'running'
        })
      ]
    })))
    await vi.advanceTimersByTimeAsync(400)

    expect(sendMessage).toHaveBeenCalledWith(123, 'Looking it up\n\n> tool memory retrieval running', {
      reply_parameters: { message_id: 63 }
    })

    await responder.handle(committedUpdated(createState({
      text: 'Looking it up',
      toolCalls: [
        toolCall({
          toolCallId: 'tool-1',
          name: 'memory_retrieval',
          status: 'success',
          result: { ok: true }
        })
      ]
    })))
    await vi.advanceTimersByTimeAsync(400)

    expect(editMessageText).toHaveBeenCalledWith(123, 105, 'Looking it up\n\n> tool memory retrieval done', {})
  })

  it('does not duplicate committed text when run completion follows multi-tool committed output', async () => {
    const sendMessage = vi.fn(async () => ({ message_id: 106 }))
    const editMessageText = vi.fn(async () => true)
    const responder = new TelegramRenderResponder({
      bot: {
        api: {
          sendMessage,
          editMessageText
        }
      } as any,
      envelope: {
        updateId: 12,
        messageId: '66',
        chatId: '123',
        chatType: 'private',
        text: 'hello',
        media: [],
        isMentioned: false,
        replyToBot: false,
        receivedAt: Date.now()
      }
    })

    const finalText = [
      '记住了，爹。',
      '',
      '我已经记下两件事：',
      '- 后续加一个 email 发送 tool',
      '- 再加一个我能主动发送 Telegram 消息的功能'
    ].join('\n')

    await responder.handle(committedUpdated(createState({
      text: finalText,
      toolCalls: [
        toolCall({
          toolCallId: 'tool-1',
          name: 'memory_retrieval',
          status: 'success',
          result: { ok: true }
        }),
        toolCall({
          toolCallId: 'tool-2',
          name: 'memory_save',
          status: 'success',
          result: { ok: true }
        })
      ]
    })))
    await vi.advanceTimersByTimeAsync(400)

    expect(sendMessage).toHaveBeenCalledWith(
      123,
      `${finalText}\n\n> tool memory retrieval done\n\n> tool memory save done`,
      { reply_parameters: { message_id: 66 } }
    )

    await responder.handle(lifecycleUpdated(RUN_STATES.COMPLETED))

    expect(editMessageText).toHaveBeenLastCalledWith(
      123,
      106,
      `${finalText}\n\n> tool memory retrieval done\n\n> tool memory save done`,
      {}
    )
    expect(editMessageText).toHaveBeenCalledTimes(1)
  })
})
