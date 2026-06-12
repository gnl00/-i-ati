import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CHAT_HOST_EVENTS } from '@shared/chat/host-events'
import type { HostRenderEvent } from '@main/hosts/shared/render'
import { ChatToolSideEffectSink } from '../ChatToolSideEffectSink'

vi.mock('@main/db/DatabaseService', () => ({
  default: {
    getChatByUuid: vi.fn()
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
  let emitter: { emit: ReturnType<typeof vi.fn> }
  let getChatByUuid: ReturnType<typeof vi.fn<GetChatByUuid>>

  beforeEach(() => {
    emitter = {
      emit: vi.fn()
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
