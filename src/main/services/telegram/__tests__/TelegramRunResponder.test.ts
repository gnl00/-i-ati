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

  it('streams assistant message updates and finalizes with rich text edit', async () => {
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

    expect(editMessageText).toHaveBeenNthCalledWith(2, 123, 77, '<b>Hello</b> world', {
      parse_mode: 'HTML'
    })
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
})
