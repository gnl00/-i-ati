// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RUN_TOOL_EVENTS } from '@shared/run/tool-events'
import type { RunEvent } from '@shared/run/events'

let runEventHandler: ((event: RunEvent) => void) | undefined
const invokeRunToolUserQuestionListPending = vi.fn()

vi.mock('@renderer/infrastructure/ipc', () => ({
  subscribeRunEvents: (handler: (event: RunEvent) => void) => {
    runEventHandler = handler
    return vi.fn()
  },
  invokeRunToolUserQuestionListPending: (data: unknown) => invokeRunToolUserQuestionListPending(data),
  invokeRunToolUserQuestionSubmit: vi.fn()
}))

import { useToolUserQuestionStore } from '../../state/toolUserQuestionStore'
import { useToolUserQuestions } from '../useToolUserQuestions'

const pending = {
  submissionId: 'submission-1',
  chatUuid: 'chat-1',
  toolCallId: 'call-1',
  interactionId: 'interaction-1',
  questions: [{
    id: 'choice',
    prompt: 'Choose',
    type: 'single_select' as const,
    required: true,
    options: [{ id: 'recommended', label: 'Recommended', recommended: true }]
  }],
  timeoutMs: 60_000,
  createdAt: 1_000,
  expiresAt: 61_000
}

function Harness({ chatUuid }: { chatUuid: string }): null {
  useToolUserQuestions(chatUuid)
  return null
}

describe('useToolUserQuestions', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    runEventHandler = undefined
    invokeRunToolUserQuestionListPending.mockReset()
    invokeRunToolUserQuestionListPending.mockResolvedValue({ questions: [pending] })
    useToolUserQuestionStore.setState({ pendingRequests: [], hydratingChatUuid: null })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  it('hydrates the active chat and removes the card on resolution', async () => {
    await act(async () => {
      root.render(<Harness chatUuid="chat-1" />)
    })

    expect(invokeRunToolUserQuestionListPending).toHaveBeenCalledWith({ chatUuid: 'chat-1' })
    expect(useToolUserQuestionStore.getState().pendingRequests).toEqual([pending])

    act(() => {
      runEventHandler?.({
        submissionId: 'submission-1',
        chatUuid: 'chat-1',
        type: RUN_TOOL_EVENTS.TOOL_USER_QUESTION_RESOLVED,
        payload: {
          toolCallId: 'call-1',
          interactionId: 'interaction-1',
          status: 'auto_submitted'
        },
        timestamp: 61_000,
        sequence: 2
      })
    })

    expect(useToolUserQuestionStore.getState().pendingRequests).toEqual([])
  })

  it('ignores required events owned by another chat', async () => {
    invokeRunToolUserQuestionListPending.mockResolvedValue({ questions: [] })
    await act(async () => {
      root.render(<Harness chatUuid="chat-1" />)
    })

    act(() => {
      runEventHandler?.({
        submissionId: 'submission-2',
        chatUuid: 'chat-2',
        type: RUN_TOOL_EVENTS.TOOL_USER_QUESTION_REQUIRED,
        payload: {
          toolCallId: 'call-2',
          interactionId: 'interaction-2',
          questions: pending.questions,
          timeoutMs: 60_000,
          createdAt: 2_000,
          expiresAt: 62_000
        },
        timestamp: 2_000,
        sequence: 1
      })
    })

    expect(useToolUserQuestionStore.getState().pendingRequests).toEqual([])
  })
})
