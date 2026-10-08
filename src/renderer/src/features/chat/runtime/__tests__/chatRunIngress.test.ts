import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHAT_RENDER_EVENTS } from '@shared/chat/render-events'
import { CHAT_HOST_EVENTS } from '@shared/chat/host-events'
import { RUN_LIFECYCLE_EVENTS } from '@shared/run/lifecycle-events'
import type { RunEvent } from '@shared/run/events'

const ipc = vi.hoisted(() => ({ handler: undefined as ((event: RunEvent) => void) | undefined, stop: vi.fn() }))
vi.mock('@renderer/infrastructure/ipc', () => ({
  subscribeRunEvents: vi.fn((handler: (event: RunEvent) => void) => {
    ipc.handler = handler
    return ipc.stop
  })
}))
vi.mock('@renderer/features/chat/persistenceService', () => ({ messagePersistence: {
  getMessagesByChatUuid: vi.fn(async () => []), saveMessage: vi.fn(async () => 1),
  updateMessage: vi.fn(), patchMessageUiState: vi.fn(), deleteMessage: vi.fn()
} }))

let ingress: typeof import('../chatRunEvent')
let store: typeof import('../../state/chatStore')['useChatStore']
let release: (() => void) | undefined
const message = (revision: number, content: string): MessageEntity => ({
  id: 100, revision, chatId: 1, chatUuid: 'tg-chat',
  body: { role: 'assistant', source: 'telegram', content, segments: [] }
})
const event = (type: RunEvent['type'], payload: unknown, chatUuid = 'tg-chat'): RunEvent => ({
  type, payload, chatUuid, submissionId: 'remote-run', sequence: 1, timestamp: 1
} as RunEvent)
async function emit(value: RunEvent): Promise<void> {
  ipc.handler!(value)
  for (let n = 0; n < 8; n += 1) await Promise.resolve()
}

beforeAll(async () => {
  vi.stubGlobal('__APP_VERSION__', 'test')
  ingress = await import('../chatRunEvent')
  store = (await import('../../state/chatStore')).useChatStore
})
beforeEach(() => {
  ipc.stop.mockClear()
  store.setState({ currentChatUuid: 'tg-chat', currentChatId: 1, messages: [],
    transcriptBuffersByChatUuid: {}, runUiByChatUuid: {}, chatSkillsRevisionByChatUuid: {}, preview: { message: null },
    runPhase: 'idle', postRunJobs: { title: 'idle', compression: 'idle' } })
  release = ingress.retainChatRunIngress()
})
afterEach(() => { release?.(); release = undefined })

describe('app run ingress', () => {
  it('consumes a Telegram run without a desktop submit and rejects an older message revision', async () => {
    await emit(event(RUN_LIFECYCLE_EVENTS.RUN_STATE_CHANGED, { state: 'preparing' }))
    expect(store.getState().getRunStatusForChat('tg-chat').runPhase).toBe('submitting')
    await emit(event(CHAT_RENDER_EVENTS.MESSAGE_CREATED, { message: message(1, 'working') }))
    await emit(event(CHAT_RENDER_EVENTS.MESSAGE_UPDATED, { message: message(3, 'final answer') }))
    await emit(event(CHAT_RENDER_EVENTS.MESSAGE_UPDATED, { message: message(2, 'old partial') }))
    await emit(event(RUN_LIFECYCLE_EVENTS.RUN_COMPLETED, { assistantMessageId: 100 }))
    expect(store.getState().messages[0].body.content).toBe('final answer')
    expect(store.getState().messages[0].revision).toBe(3)
    expect(store.getState().getRunStatusForChat('tg-chat').lastRunOutcome).toBe('completed')
    await emit(event(CHAT_RENDER_EVENTS.MESSAGE_UPDATED, { message: message(2, 'late partial') }))
    expect(store.getState().getRunStatusForChat('tg-chat').runPhase).toBe('idle')
    expect(store.getState().messages[0].body.content).toBe('final answer')
    expect(ipc.stop).not.toHaveBeenCalled()
  })

  it('merges a run history snapshot without replacing a newer committed event', async () => {
    await emit(event(CHAT_RENDER_EVENTS.MESSAGE_UPDATED, { message: message(4, 'new event') }))
    await emit(event(CHAT_HOST_EVENTS.MESSAGES_LOADED, { messages: [message(2, 'old snapshot')] }))
    expect(store.getState().messages[0].revision).toBe(4)
    expect(store.getState().messages[0].body.content).toBe('new event')
  })

  it('updates a background chat without taking over the selected shell', async () => {
    store.setState({ currentChatUuid: 'other-chat', messages: [] })
    await emit(event(CHAT_RENDER_EVENTS.MESSAGE_CREATED, { message: message(1, 'background') }))
    expect(store.getState().currentChatUuid).toBe('other-chat')
    expect(store.getState().messages).toEqual([])
    expect(store.getState().transcriptBuffersByChatUuid['tg-chat'].messages[0].body.content).toBe('background')
  })

  it('refreshes background chat skills through the app ingress while preserving the selected chat', async () => {
    store.setState({ currentChatUuid: 'other-chat', currentChatId: 2 })
    await emit(event(CHAT_RENDER_EVENTS.TOOL_RESULT_ATTACHED, {
      toolCallId: 'load-tool',
      message: {
        chatUuid: 'tg-chat',
        body: { role: 'tool', name: 'load_skill', content: '{"success":true}', segments: [] }
      }
    }))
    await emit(event(CHAT_RENDER_EVENTS.TOOL_RESULT_ATTACHED, {
      toolCallId: 'unload-tool',
      message: {
        chatUuid: 'tg-chat',
        body: { role: 'tool', name: 'unload_skill', content: '{"success":true}', segments: [] }
      }
    }))

    expect(store.getState().chatSkillsRevisionByChatUuid).toEqual({ 'tg-chat': 2 })
    expect(store.getState().currentChatUuid).toBe('other-chat')
    expect(store.getState().currentChatId).toBe(2)
  })

  it('serializes events and keeps title updates alive after run completion', async () => {
    ipc.handler!(event(CHAT_RENDER_EVENTS.MESSAGE_CREATED, { message: message(1, 'first') }))
    ipc.handler!(event(CHAT_RENDER_EVENTS.MESSAGE_UPDATED, { message: message(2, 'last') }))
    await emit(event(RUN_LIFECYCLE_EVENTS.RUN_COMPLETED, { assistantMessageId: 100 }))
    const update = vi.spyOn(store.getState(), 'updateChatList')
    await emit(event(CHAT_HOST_EVENTS.CHAT_UPDATED, { chatEntity: { id: 1, uuid: 'tg-chat', title: 'New title' } }))
    expect(store.getState().messages[0].body.content).toBe('last')
    expect(update).toHaveBeenCalledOnce()
    update.mockRestore()
  })
})
