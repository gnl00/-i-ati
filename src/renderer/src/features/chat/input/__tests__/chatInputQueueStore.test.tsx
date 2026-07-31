// @vitest-environment happy-dom

import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RUN_LIFECYCLE_EVENTS } from '@shared/run/lifecycle-events'
import { RUN_STEERING_EVENTS } from '@shared/run/steering-events'
import type { RunEvent } from '@shared/run/events'
import {
  EMPTY_CHAT_INPUT_QUEUE_OWNER,
  getChatInputQueueKey,
  resetChatInputQueueStoreForTests,
  selectQueuedPayloadForFlush,
  useChatInputQueueStore,
  type ChatInputQueueOwner,
  type ChatInputQueueScope
} from '../chatInputQueueStore'
import type { QueuedChatMessage } from '../queuePolicy'

const queuedMessage = (
  id: string,
  status: QueuedChatMessage['status'] = 'queued'
): QueuedChatMessage => ({
  id,
  status,
  text: `message ${id}`,
  images: []
})

const runAcceptedEvent = (
  submissionId: string,
  chatUuid: string
): RunEvent => ({
  type: RUN_LIFECYCLE_EVENTS.RUN_ACCEPTED,
  submissionId,
  chatUuid,
  sequence: 1,
  timestamp: 1,
  payload: { accepted: true, submissionId }
})

const steeringReturnedEvent = (
  submissionId: string,
  chatUuid: string,
  queueItemIds: string[]
): RunEvent => ({
  type: RUN_STEERING_EVENTS.STEERING_RETURNED,
  submissionId,
  chatUuid,
  sequence: 2,
  timestamp: 2,
  payload: { queueItemIds }
})

const steeringConsumedEvent = (
  submissionId: string,
  chatUuid: string,
  queueItemId: string
): RunEvent => ({
  type: RUN_STEERING_EVENTS.STEERING_CONSUMED,
  submissionId,
  chatUuid,
  sequence: 3,
  timestamp: 3,
  payload: { queueItemId }
})

function QueueProbe({
  scope,
  onChange
}: {
  scope: ChatInputQueueScope
  onChange: (owner: ChatInputQueueOwner) => void
}): null {
  const owner = useChatInputQueueStore(state => (
    state.owners[getChatInputQueueKey(scope)] ?? EMPTY_CHAT_INPUT_QUEUE_OWNER
  ))

  useEffect(() => {
    onChange(owner)
  }, [onChange, owner])

  return null
}

describe('chat input queue owner', () => {
  let container: HTMLDivElement
  let root: Root | null

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true
    resetChatInputQueueStoreForTests()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    container.remove()
    vi.restoreAllMocks()
  })

  it('rekeys a pending submission queue and restores it after the Welcome composer remounts', () => {
    const pendingScope = { chatUuid: null, submissionId: 'submission-1' }
    const chatScope = { chatUuid: 'chat-1', submissionId: 'submission-1' }
    const observed: ChatInputQueueOwner[] = []

    act(() => {
      root?.render(<QueueProbe scope={pendingScope} onChange={owner => observed.push(owner)} />)
      useChatInputQueueStore.getState().setMessages(pendingScope, [queuedMessage('q1')])
    })
    expect(observed.at(-1)?.messages.map(message => message.id)).toEqual(['q1'])

    act(() => {
      root?.unmount()
    })
    root = null

    useChatInputQueueStore.getState().routeRunEvent(
      runAcceptedEvent('submission-1', 'chat-1'),
      'chat-1'
    )

    const remountedObserved: ChatInputQueueOwner[] = []
    root = createRoot(container)
    act(() => {
      root?.render(<QueueProbe scope={chatScope} onChange={owner => remountedObserved.push(owner)} />)
    })

    expect(remountedObserved.at(-1)).toMatchObject({
      chatUuid: 'chat-1',
      submissionId: 'submission-1'
    })
    expect(remountedObserved.at(-1)?.messages.map(message => message.id)).toEqual(['q1'])
  })

  it('keeps each chat queue isolated while the visible chat switches', () => {
    const chatOneScope = { chatUuid: 'chat-1', submissionId: 'submission-1' }
    const chatTwoScope = { chatUuid: 'chat-2', submissionId: 'submission-2' }
    const observed: ChatInputQueueOwner[] = []
    const onChange = (owner: ChatInputQueueOwner): void => {
      observed.push(owner)
    }

    useChatInputQueueStore.getState().setMessages(chatOneScope, [queuedMessage('q1')])
    useChatInputQueueStore.getState().setMessages(chatTwoScope, [queuedMessage('q2')])

    act(() => {
      root?.render(<QueueProbe scope={chatOneScope} onChange={onChange} />)
    })
    expect(observed.at(-1)?.messages.map(message => message.id)).toEqual(['q1'])

    act(() => {
      root?.render(<QueueProbe scope={chatTwoScope} onChange={onChange} />)
    })
    expect(observed.at(-1)?.messages.map(message => message.id)).toEqual(['q2'])

    act(() => {
      root?.render(<QueueProbe scope={chatOneScope} onChange={onChange} />)
    })
    expect(observed.at(-1)?.messages.map(message => message.id)).toEqual(['q1'])
  })

  it('drops a scheduled flush after the active queue scope changes', () => {
    const chatOneScope = { chatUuid: 'chat-1', submissionId: 'submission-1' }
    const chatTwoScope = { chatUuid: 'chat-2', submissionId: 'submission-2' }
    const chatOneKey = getChatInputQueueKey(chatOneScope)
    const chatTwoKey = getChatInputQueueKey(chatTwoScope)
    useChatInputQueueStore.getState().setMessages(chatOneScope, [queuedMessage('q1')])
    useChatInputQueueStore.getState().setMessages(chatTwoScope, [queuedMessage('q2')])

    expect(selectQueuedPayloadForFlush({
      owners: useChatInputQueueStore.getState().owners,
      scheduledQueueKey: chatOneKey,
      activeQueueKey: chatTwoKey
    })).toBeNull()
    expect(selectQueuedPayloadForFlush({
      owners: useChatInputQueueStore.getState().owners,
      scheduledQueueKey: chatTwoKey,
      activeQueueKey: chatTwoKey
    })).toEqual({ text: 'message q2', images: [] })
  })

  it('routes returned and consumed events while the composer is unmounted', () => {
    const chatOneScope = { chatUuid: 'chat-1', submissionId: 'submission-1' }
    const chatTwoScope = { chatUuid: 'chat-2', submissionId: 'submission-2' }

    useChatInputQueueStore.getState().setMessages(chatOneScope, [queuedMessage('q1', 'inserting')])
    useChatInputQueueStore.getState().setMessages(chatTwoScope, [queuedMessage('q2', 'inserting')])
    act(() => {
      root?.unmount()
    })
    root = null

    useChatInputQueueStore.getState().routeRunEvent(
      steeringReturnedEvent('submission-1', 'chat-1', ['q1']),
      'chat-1'
    )
    useChatInputQueueStore.getState().routeRunEvent(
      steeringConsumedEvent('submission-2', 'chat-2', 'q2'),
      'chat-2'
    )

    expect(useChatInputQueueStore.getState().owners[getChatInputQueueKey(chatOneScope)]?.messages)
      .toEqual([queuedMessage('q1')])
    expect(useChatInputQueueStore.getState().owners[getChatInputQueueKey(chatTwoScope)])
      .toBeUndefined()
  })

  it('retains an edited payload in the owner for remount restoration', () => {
    const scope = { chatUuid: 'chat-1', submissionId: 'submission-1' }
    const image = 'data:image/png;base64,image' as unknown as ClipbordImg
    const message = { ...queuedMessage('q1'), text: 'edit me', images: [image] }

    useChatInputQueueStore.getState().setMessages(scope, [message])
    expect(useChatInputQueueStore.getState().beginEditing(scope)).toEqual(message)

    const owner = useChatInputQueueStore.getState().owners[getChatInputQueueKey(scope)]
    expect(owner).toMatchObject({
      messages: [],
      editingMessage: message
    })
  })

  it('prunes owners after queue, pause, and editing state are cleared', () => {
    const scope = { chatUuid: 'chat-1', submissionId: 'submission-1' }
    const key = getChatInputQueueKey(scope)

    useChatInputQueueStore.getState().setPaused(scope, false)
    expect(useChatInputQueueStore.getState().owners[key]).toBeUndefined()

    useChatInputQueueStore.getState().setMessages(scope, [queuedMessage('q1')])
    useChatInputQueueStore.getState().setMessages(scope, [])
    expect(useChatInputQueueStore.getState().owners[key]).toBeUndefined()

    useChatInputQueueStore.getState().setPaused(scope, true)
    useChatInputQueueStore.getState().setPaused(scope, false)
    expect(useChatInputQueueStore.getState().owners[key]).toBeUndefined()

    useChatInputQueueStore.getState().setMessages(scope, [queuedMessage('q2')])
    useChatInputQueueStore.getState().beginEditing(scope)
    useChatInputQueueStore.getState().finishEditing(scope)
    expect(useChatInputQueueStore.getState().owners[key]).toBeUndefined()
  })
})
