import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chatDb } from '@main/db/chat'
import { CHAT_RENDER_EVENTS } from '@shared/chat/render-events'
import { CHAT_HOST_EVENTS } from '@shared/chat/host-events'
import type { RunEventEmitter } from '@main/agent/contracts'
import type { HostRenderEvent } from '@main/hosts/shared/render'
import { ChatToolSideEffectSink } from '../ChatToolSideEffectSink'

vi.mock('@main/db/DatabaseService', () => ({
  default: {
    getChatByUuid: vi.fn(),
    getMessageById: vi.fn()
  }
}))

const chatEntity: ChatEntity = {
  id: 1,
  uuid: 'chat-1',
  title: 'Updated title',
  messages: [],
  updateTime: 2,
  createTime: 1
}

type GetChatByUuid = (chatUuid: string) => ChatEntity | undefined

const createToolResultEvent = (overrides: Record<string, unknown> = {}): HostRenderEvent => ({
  type: 'host.tool.result.available',
  timestamp: 123,
  result: {
    stepId: 'step-1',
    toolCallId: 'tool-1',
    toolCallIndex: 0,
    toolName: 'chat_set_title',
    status: 'success',
    content: {
      success: true,
      title: 'Updated title'
    },
    ...overrides
  } as any
})

describe('ChatToolSideEffectSink', () => {
  let emitter: RunEventEmitter
  let getChatByUuid: ReturnType<typeof vi.fn<GetChatByUuid>>

  beforeEach(() => {
    emitter = {
      submissionId: 'submission',
      setChatMeta: vi.fn<RunEventEmitter['setChatMeta']>(),
      emit: vi.fn<RunEventEmitter['emit']>()
    }
    getChatByUuid = vi.fn<GetChatByUuid>(() => chatEntity)
  })

  it('emits CHAT_UPDATED after successful chat_set_title tool result', () => {
    const sink = new ChatToolSideEffectSink({
      emitter: emitter as any,
      chatUuid: 'chat-1',
      getChatByUuid
    })

    sink.handle(createToolResultEvent())

    expect(getChatByUuid).toHaveBeenCalledWith('chat-1')
    expect(emitter.emit).toHaveBeenCalledWith(CHAT_HOST_EVENTS.CHAT_UPDATED, {
      chatEntity
    })
  })

  it('stays quiet for failed chat_set_title tool result', () => {
    const sink = new ChatToolSideEffectSink({
      emitter: emitter as any,
      chatUuid: 'chat-1',
      getChatByUuid
    })

    sink.handle(createToolResultEvent({
      status: 'error',
      content: {
        success: true
      },
      error: {
        message: 'failed'
      }
    }))

    expect(getChatByUuid).not.toHaveBeenCalled()
    expect(emitter.emit).not.toHaveBeenCalled()
  })

  it('publishes a Telegram delivery copy into the source transcript immediately', () => {
    const message: MessageEntity = { id: 77, chatId: 1, chatUuid: 'chat-1', revision: 1,
      body: { role: 'assistant', content: 'Reminder', source: 'telegram_delivery', segments: [] } }
    vi.spyOn(chatDb, 'getMessageById').mockReturnValue(message)
    new ChatToolSideEffectSink({ emitter, chatUuid: 'chat-1', getChatByUuid }).handle(createToolResultEvent({
      toolName: 'telegram_send_message', content: { success: true, deliveryMessageId: 77 }
    }))
    expect(emitter.emit).toHaveBeenCalledWith(CHAT_RENDER_EVENTS.MESSAGE_CREATED, { message })
    expect(emitter.emit).toHaveBeenCalledWith(CHAT_HOST_EVENTS.CHAT_UPDATED, { chatEntity })
  })

  it('does not publish a missing or foreign delivery copy', () => {
    const sink = new ChatToolSideEffectSink({ emitter, chatUuid: 'chat-1', getChatByUuid })
    sink.handle(createToolResultEvent({ toolName: 'telegram_send_message', content: { success: true, deliveryRecorded: false } }))
    vi.spyOn(chatDb, 'getMessageById').mockReturnValue({ id: 77, chatUuid: 'other', body: { role: 'assistant', content: 'Other', source: 'telegram_delivery', segments: [] } })
    sink.handle(createToolResultEvent({ toolName: 'telegram_send_message', content: { success: true, deliveryMessageId: 77 } }))
    expect(emitter.emit).not.toHaveBeenCalled()
  })

  it('stays quiet for other tool results', () => {
    const sink = new ChatToolSideEffectSink({
      emitter: emitter as any,
      chatUuid: 'chat-1',
      getChatByUuid
    })

    sink.handle(createToolResultEvent({
      toolName: 'read'
    }))

    expect(getChatByUuid).not.toHaveBeenCalled()
    expect(emitter.emit).not.toHaveBeenCalled()
  })

  it('stays quiet without chatUuid', () => {
    const sink = new ChatToolSideEffectSink({
      emitter: emitter as any,
      getChatByUuid
    })

    sink.handle(createToolResultEvent())

    expect(getChatByUuid).not.toHaveBeenCalled()
    expect(emitter.emit).not.toHaveBeenCalled()
  })

  it('stays quiet when chat lookup misses', () => {
    getChatByUuid.mockReturnValue(undefined)
    const sink = new ChatToolSideEffectSink({
      emitter: emitter as any,
      chatUuid: 'chat-1',
      getChatByUuid
    })

    sink.handle(createToolResultEvent())

    expect(getChatByUuid).toHaveBeenCalledWith('chat-1')
    expect(emitter.emit).not.toHaveBeenCalled()
  })
})
