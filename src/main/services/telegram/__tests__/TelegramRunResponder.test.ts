import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CHAT_RUN_EVENTS, type ChatRunEventEnvelope } from '@shared/chatRun/events'
import { TelegramRunResponder } from '../TelegramRunResponder'

const createAssistantMessage = (text: string): MessageEntity => ({
  id: 102,
  chatId: 1,
  chatUuid: 'chat-1',
  body: {
    role: 'assistant',
    content: '',
    segments: [{
      type: 'text',
      content: text,
      timestamp: Date.now()
    }],
    host: {
      type: 'telegram',
      direction: 'outbound',
      peerId: '123',
      peerType: 'private'
    }
  }
})

const createAssistantMessageWithSegments = (segments: MessageSegment[], content = ''): MessageEntity => ({
  id: 102,
  chatId: 1,
  chatUuid: 'chat-1',
  body: {
    role: 'assistant',
    content,
    segments,
    host: {
      type: 'telegram',
      direction: 'outbound',
      peerId: '123',
      peerType: 'private'
    }
  }
})

const createEvent = <T extends keyof import('@shared/chatRun/events').ChatRunEventPayloads>(
  type: T,
  payload: import('@shared/chatRun/events').ChatRunEventPayloads[T]
): ChatRunEventEnvelope<T> => ({
  type,
  payload,
  submissionId: 'submission-1',
  chatId: 1,
  chatUuid: 'chat-1',
  timestamp: Date.now(),
  sequence: 1
})

describe('TelegramRunResponder', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('streams assistant message updates and finalizes with plain-text edit', async () => {
    const sendMessage = vi.fn(async () => ({ message_id: 77 }))
    const editMessageText = vi.fn(async () => true)
    const responder = new TelegramRunResponder({
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

    const firstMessage = createAssistantMessage('Hello')
    await responder.handleEvent(createEvent(CHAT_RUN_EVENTS.MESSAGE_UPDATED, {
      message: firstMessage
    }))
    await vi.advanceTimersByTimeAsync(400)

    expect(sendMessage).toHaveBeenCalledWith(123, 'Hello', {
      reply_parameters: { message_id: 55 }
    })
    expect(firstMessage.body.host).toEqual(expect.objectContaining({
      type: 'telegram',
      direction: 'outbound',
      peerId: '123',
      peerType: 'private',
      messageId: '77',
      replyToMessageId: '55'
    }))

    const secondMessage = createAssistantMessage('**Hello** world')
    await responder.handleEvent(createEvent(CHAT_RUN_EVENTS.MESSAGE_UPDATED, {
      message: secondMessage
    }))
    await vi.advanceTimersByTimeAsync(400)

    expect(editMessageText).toHaveBeenNthCalledWith(1, 123, 77, '**Hello** world', {})

    await responder.handleEvent(createEvent(CHAT_RUN_EVENTS.RUN_COMPLETED, {
      assistantMessageId: 102
    }))

    expect(editMessageText).toHaveBeenNthCalledWith(2, 123, 77, '**Hello** world', {})
  })

  it('prefers stream preview updates for live telegram edits before committed assistant updates arrive', async () => {
    const sendMessage = vi.fn(async () => ({ message_id: 88 }))
    const editMessageText = vi.fn(async () => true)
    const responder = new TelegramRunResponder({
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

    await responder.handleEvent(createEvent(CHAT_RUN_EVENTS.STREAM_PREVIEW_UPDATED, {
      message: createAssistantMessage('Preview hello')
    }))
    await vi.advanceTimersByTimeAsync(400)

    expect(sendMessage).toHaveBeenCalledWith(123, 'Preview hello', {
      reply_parameters: { message_id: 56 }
    })

    await responder.handleEvent(createEvent(CHAT_RUN_EVENTS.STREAM_PREVIEW_CLEARED, {}))
    await responder.handleEvent(createEvent(CHAT_RUN_EVENTS.MESSAGE_UPDATED, {
      message: createAssistantMessage('Preview hello world')
    }))
    await vi.advanceTimersByTimeAsync(400)

    expect(editMessageText).toHaveBeenCalledWith(123, 88, 'Preview hello world', {})
  })

  it('keeps previously sent preview text when a later cycle only emits a short follow-up', async () => {
    const sendMessage = vi.fn(async () => ({ message_id: 99 }))
    const editMessageText = vi.fn(async () => true)
    const responder = new TelegramRunResponder({
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

    await responder.handleEvent(createEvent(CHAT_RUN_EVENTS.STREAM_PREVIEW_UPDATED, {
      message: createAssistantMessage('First cycle answer')
    }))
    await vi.advanceTimersByTimeAsync(400)

    expect(sendMessage).toHaveBeenCalledWith(123, 'First cycle answer', {
      reply_parameters: { message_id: 57 }
    })

    await responder.handleEvent(createEvent(CHAT_RUN_EVENTS.MESSAGE_UPDATED, {
      message: createAssistantMessageWithSegments([
        {
          type: 'toolCall',
          name: 'emotion_report',
          timestamp: 2,
          toolCallId: 'tool-1',
          content: {
            toolName: 'emotion_report',
            status: 'success',
            result: { ok: true }
          }
        }
      ])
    }))
    await vi.advanceTimersByTimeAsync(400)

    await responder.handleEvent(createEvent(CHAT_RUN_EVENTS.STREAM_PREVIEW_CLEARED, {}))

    await responder.handleEvent(createEvent(CHAT_RUN_EVENTS.STREAM_PREVIEW_UPDATED, {
      message: createAssistantMessageWithSegments([
        {
          type: 'text',
          content: '👍',
          timestamp: 3
        }
      ])
    }))
    await vi.advanceTimersByTimeAsync(400)

    expect(editMessageText).toHaveBeenCalledWith(123, 99, 'First cycle answer👍', {})
  })

  it('keeps tool output in place and appends a short follow-up after it', async () => {
    const sendMessage = vi.fn(async () => ({ message_id: 109 }))
    const editMessageText = vi.fn(async () => true)
    const responder = new TelegramRunResponder({
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

    await responder.handleEvent(createEvent(CHAT_RUN_EVENTS.STREAM_PREVIEW_UPDATED, {
      message: createAssistantMessage('First cycle answer')
    }))
    await vi.advanceTimersByTimeAsync(400)

    await responder.handleEvent(createEvent(CHAT_RUN_EVENTS.MESSAGE_UPDATED, {
      message: createAssistantMessageWithSegments([
        {
          type: 'text',
          content: 'First cycle answer',
          timestamp: 1
        },
        {
          type: 'toolCall',
          name: 'memory_retrieval',
          timestamp: 2,
          toolCallId: 'tool-1',
          content: {
            toolName: 'memory_retrieval',
            status: 'success',
            result: { ok: true }
          }
        }
      ])
    }))
    await vi.advanceTimersByTimeAsync(400)

    expect(editMessageText).toHaveBeenCalledWith(123, 109, 'First cycle answer\n\n> tool memory retrieval done', {})

    await responder.handleEvent(createEvent(CHAT_RUN_EVENTS.STREAM_PREVIEW_CLEARED, {}))

    await responder.handleEvent(createEvent(CHAT_RUN_EVENTS.STREAM_PREVIEW_UPDATED, {
      message: createAssistantMessage('👍')
    }))
    await vi.advanceTimersByTimeAsync(400)

    expect(editMessageText).toHaveBeenLastCalledWith(123, 109, 'First cycle answer\n\n> tool memory retrieval done\n👍', {})
  })

  it('replaces previously sent preview text when the later cycle produces a substantive new answer', async () => {
    const sendMessage = vi.fn(async () => ({ message_id: 100 }))
    const editMessageText = vi.fn(async () => true)
    const responder = new TelegramRunResponder({
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

    await responder.handleEvent(createEvent(CHAT_RUN_EVENTS.STREAM_PREVIEW_UPDATED, {
      message: createAssistantMessage('First cycle answer')
    }))
    await vi.advanceTimersByTimeAsync(400)

    await responder.handleEvent(createEvent(CHAT_RUN_EVENTS.STREAM_PREVIEW_CLEARED, {}))

    await responder.handleEvent(createEvent(CHAT_RUN_EVENTS.STREAM_PREVIEW_UPDATED, {
      message: createAssistantMessage('A much longer replacement answer')
    }))
    await vi.advanceTimersByTimeAsync(400)

    expect(editMessageText).toHaveBeenCalledWith(123, 100, 'A much longer replacement answer', {})
  })

  it('keeps previously sent preview text when an emotion-only tool cycle is followed by a substantive next answer', async () => {
    const sendMessage = vi.fn(async () => ({ message_id: 110 }))
    const editMessageText = vi.fn(async () => true)
    const responder = new TelegramRunResponder({
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

    await responder.handleEvent(createEvent(CHAT_RUN_EVENTS.STREAM_PREVIEW_UPDATED, {
      message: createAssistantMessage('待几天？有具体想逛的地方没，还是随便转？')
    }))
    await vi.advanceTimersByTimeAsync(400)

    await responder.handleEvent(createEvent(CHAT_RUN_EVENTS.MESSAGE_UPDATED, {
      message: createAssistantMessageWithSegments([
        {
          type: 'toolCall',
          name: 'emotion_report',
          timestamp: 2,
          toolCallId: 'tool-1',
          content: {
            toolName: 'emotion_report',
            status: 'success',
            result: {
              success: true,
              label: 'happiness',
              emoji: '😄'
            }
          }
        }
      ])
    }))
    await vi.advanceTimersByTimeAsync(400)

    await responder.handleEvent(createEvent(CHAT_RUN_EVENTS.STREAM_PREVIEW_CLEARED, {}))

    await responder.handleEvent(createEvent(CHAT_RUN_EVENTS.STREAM_PREVIEW_UPDATED, {
      message: createAssistantMessage('成都这几天天气应该不错，美食街人多，记得带好手机钱包。')
    }))
    await vi.advanceTimersByTimeAsync(400)

    expect(editMessageText).toHaveBeenLastCalledWith(
      123,
      110,
      '待几天？有具体想逛的地方没，还是随便转？成都这几天天气应该不错，美食街人多，记得带好手机钱包。',
      {}
    )

    await responder.handleEvent(createEvent(CHAT_RUN_EVENTS.RUN_COMPLETED, {
      assistantMessageId: 102
    }))

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
    const responder = new TelegramRunResponder({
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

    await responder.handleEvent(createEvent(CHAT_RUN_EVENTS.STREAM_PREVIEW_UPDATED, {
      message: createAssistantMessage('First cycle answer')
    }))
    await vi.advanceTimersByTimeAsync(400)

    await responder.handleEvent(createEvent(CHAT_RUN_EVENTS.STREAM_PREVIEW_CLEARED, {}))

    await responder.handleEvent(createEvent(CHAT_RUN_EVENTS.STREAM_PREVIEW_UPDATED, {
      message: createAssistantMessage('不是这个')
    }))
    await vi.advanceTimersByTimeAsync(400)

    expect(editMessageText).toHaveBeenCalledWith(123, 101, '不是这个', {})
  })

  it('treats short non-CJK natural-language follow-ups as replacements instead of appending them', async () => {
    const sendMessage = vi.fn(async () => ({ message_id: 102 }))
    const editMessageText = vi.fn(async () => true)
    const responder = new TelegramRunResponder({
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

    await responder.handleEvent(createEvent(CHAT_RUN_EVENTS.STREAM_PREVIEW_UPDATED, {
      message: createAssistantMessage('First cycle answer')
    }))
    await vi.advanceTimersByTimeAsync(400)

    await responder.handleEvent(createEvent(CHAT_RUN_EVENTS.STREAM_PREVIEW_CLEARED, {}))

    await responder.handleEvent(createEvent(CHAT_RUN_EVENTS.STREAM_PREVIEW_UPDATED, {
      message: createAssistantMessage('だめ')
    }))
    await vi.advanceTimersByTimeAsync(400)

    expect(editMessageText).toHaveBeenCalledWith(123, 102, 'だめ', {})
  })

  it('renders non-emotion tool calls as a quoted footer in telegram output', async () => {
    const sendMessage = vi.fn(async () => ({ message_id: 103 }))
    const editMessageText = vi.fn(async () => true)
    const responder = new TelegramRunResponder({
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

    await responder.handleEvent(createEvent(CHAT_RUN_EVENTS.MESSAGE_UPDATED, {
      message: createAssistantMessageWithSegments([
        {
          type: 'text',
          content: 'Looking it up',
          timestamp: 1
        },
        {
          type: 'toolCall',
          name: 'memory_retrieval',
          timestamp: 2,
          toolCallId: 'tool-1',
          content: {
            toolName: 'memory_retrieval',
            status: 'success',
            result: { ok: true }
          }
        }
      ])
    }))
    await vi.advanceTimersByTimeAsync(400)

    expect(sendMessage).toHaveBeenCalledWith(123, 'Looking it up\n\n> tool memory retrieval done', {
      reply_parameters: { message_id: 61 }
    })
  })

  it('does not render emotion_report tool calls in telegram output footer', async () => {
    const sendMessage = vi.fn(async () => ({ message_id: 104 }))
    const editMessageText = vi.fn(async () => true)
    const responder = new TelegramRunResponder({
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

    await responder.handleEvent(createEvent(CHAT_RUN_EVENTS.MESSAGE_UPDATED, {
      message: createAssistantMessageWithSegments([
        {
          type: 'text',
          content: 'Hi there',
          timestamp: 1
        },
        {
          type: 'toolCall',
          name: 'emotion_report',
          timestamp: 2,
          toolCallId: 'tool-1',
          content: {
            toolName: 'emotion_report',
            status: 'success',
            result: {
              success: true,
              label: 'happiness',
              emoji: '😄',
              stateText: '心情不错'
            }
          }
        }
      ])
    }))
    await vi.advanceTimersByTimeAsync(400)

    expect(sendMessage).toHaveBeenCalledWith(123, 'Hi there', {
      reply_parameters: { message_id: 62 }
    })
  })

  it('updates telegram text when only the tool footer status changes', async () => {
    const sendMessage = vi.fn(async () => ({ message_id: 105 }))
    const editMessageText = vi.fn(async () => true)
    const responder = new TelegramRunResponder({
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

    await responder.handleEvent(createEvent(CHAT_RUN_EVENTS.MESSAGE_UPDATED, {
      message: createAssistantMessageWithSegments([
        {
          type: 'text',
          content: 'Looking it up',
          timestamp: 1
        },
        {
          type: 'toolCall',
          name: 'memory_retrieval',
          timestamp: 2,
          toolCallId: 'tool-1',
          content: {
            toolName: 'memory_retrieval',
            status: 'running'
          }
        }
      ])
    }))
    await vi.advanceTimersByTimeAsync(400)

    expect(sendMessage).toHaveBeenCalledWith(123, 'Looking it up\n\n> tool memory retrieval running', {
      reply_parameters: { message_id: 63 }
    })

    await responder.handleEvent(createEvent(CHAT_RUN_EVENTS.MESSAGE_UPDATED, {
      message: createAssistantMessageWithSegments([
        {
          type: 'text',
          content: 'Looking it up',
          timestamp: 1
        },
        {
          type: 'toolCall',
          name: 'memory_retrieval',
          timestamp: 2,
          toolCallId: 'tool-1',
          content: {
            toolName: 'memory_retrieval',
            status: 'success',
            result: { ok: true }
          }
        }
      ])
    }))
    await vi.advanceTimersByTimeAsync(400)

    expect(editMessageText).toHaveBeenCalledWith(123, 105, 'Looking it up\n\n> tool memory retrieval done', {})
  })
})
