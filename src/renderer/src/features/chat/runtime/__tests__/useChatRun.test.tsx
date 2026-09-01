// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import type { RunCancelResult } from '@shared/run/cancellation'

const {
  baseModelRef,
  chatStore,
  invokeRunStart,
  invokeRunCancel,
  invokeRunSteer,
  subscribeRunEvents,
  unsubscribeRunEvents
} = vi.hoisted(() => {
  const modelRef = {
    accountId: 'account-chat',
    modelId: 'chat-model'
  }
  const unsubscribeRunEvents = vi.fn()
  const subscribeRunEvents = vi.fn(() => unsubscribeRunEvents)
  return {
    baseModelRef: modelRef,
    chatStore: {
      currentChatId: 1,
      currentChatUuid: 'chat-1',
      selectedModelRef: modelRef,
      userInstruction: 'chat instruction',
      permissionApprovalMode: 'default',
      ensureSelectedModelRef: vi.fn(() => modelRef),
      setPendingUserMessage: vi.fn(),
      clearPendingUserMessage: vi.fn(),
      resetPostRunJobs: vi.fn(),
      setLastRunOutcome: vi.fn(),
      resetPostRunJobsForChat: vi.fn(),
      setLastRunOutcomeForChat: vi.fn(),
      setRunPhaseForChat: vi.fn(),
      setRunPhase: vi.fn(),
      clearToolLiveOutputs: vi.fn(),
      resetPreviewForChat: vi.fn(),
      resetPreview: vi.fn(),
      settleLatestAssistantAfterAbortForChat: vi.fn(async () => undefined),
      settleLatestAssistantAfterAbort: vi.fn(async () => undefined),
      getRunStatusForChat: vi.fn(() => ({
        runPhase: 'idle',
        postRunJobs: {
          title: 'idle',
          compression: 'idle'
        }
      }))
    },
    invokeRunStart: vi.fn(async () => undefined),
    invokeRunCancel: vi.fn(async (): Promise<RunCancelResult> => ({
      cancelled: true,
      submissionId: 'submission-1'
    })),
    invokeRunSteer: vi.fn(async () => ({ accepted: true })),
    subscribeRunEvents,
    unsubscribeRunEvents
  }
})

vi.mock('@renderer/features/chat/state/chatStore', () => {
  const useChatStore = vi.fn(() => chatStore)
  return {
    useChatStore: Object.assign(useChatStore, {
      getState: vi.fn(() => chatStore)
    })
  }
})

vi.mock('@renderer/infrastructure/ipc', () => ({
  invokeRunStart,
  invokeRunCancel,
  invokeRunSteer,
  subscribeRunEvents
}))

vi.mock('../collectRunTools', () => ({
  collectRunTools: vi.fn(() => [])
}))

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'submission-1')
}))

vi.mock('sonner', () => ({
  toast: {
    warning: vi.fn()
  }
}))

import useChatRun, { resetChatRunRegistryForTests } from '../useChatRun'

describe('useChatRun', () => {
  let container: HTMLDivElement
  let root: Root
  let hookResult: ReturnType<typeof useChatRun> | undefined

  function Probe() {
    hookResult = useChatRun()
    return null
  }

  function getHookResult(): ReturnType<typeof useChatRun> {
    if (!hookResult) {
      throw new Error('Expected chat run hook to be mounted')
    }
    return hookResult
  }

  beforeEach(() => {
    resetChatRunRegistryForTests()
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    invokeRunStart.mockClear()
    invokeRunCancel.mockClear()
    invokeRunSteer.mockClear()
    subscribeRunEvents.mockClear()
    subscribeRunEvents.mockImplementation(() => unsubscribeRunEvents)
    ;(toast.warning as ReturnType<typeof vi.fn>).mockClear()
    unsubscribeRunEvents.mockClear()
    for (const mock of [
      chatStore.ensureSelectedModelRef,
      chatStore.setPendingUserMessage,
      chatStore.clearPendingUserMessage,
      chatStore.resetPostRunJobs,
      chatStore.setLastRunOutcome,
      chatStore.resetPostRunJobsForChat,
      chatStore.setLastRunOutcomeForChat,
      chatStore.setRunPhaseForChat,
      chatStore.setRunPhase,
      chatStore.clearToolLiveOutputs,
      chatStore.resetPreviewForChat,
      chatStore.resetPreview,
      chatStore.settleLatestAssistantAfterAbortForChat,
      chatStore.settleLatestAssistantAfterAbort,
      chatStore.getRunStatusForChat
    ]) {
      mock.mockClear()
    }
    chatStore.getRunStatusForChat.mockReset().mockReturnValue({
      runPhase: 'idle',
      postRunJobs: {
        title: 'idle',
        compression: 'idle'
      }
    })
    chatStore.currentChatId = 1
    chatStore.currentChatUuid = 'chat-1'
    chatStore.selectedModelRef = baseModelRef
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    hookResult = undefined
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
    resetChatRunRegistryForTests()
  })

  it('keeps the chat-selected modelRef when submitting image media', async () => {
    await act(async () => {
      root.render(<Probe />)
    })

    await act(async () => {
      await hookResult?.onSubmit('describe this', ['data:image/png;base64,abc'], {
        stream: true
      })
    })

    expect(invokeRunStart).toHaveBeenCalledWith(expect.objectContaining({
      submissionId: 'submission-1',
      modelRef: baseModelRef,
      chatModelRef: baseModelRef,
      chatId: 1,
      chatUuid: 'chat-1',
      input: expect.objectContaining({
        textCtx: 'describe this',
        mediaCtx: ['data:image/png;base64,abc'],
        stream: true
      })
    }))
    const runInput = (
      invokeRunStart.mock.calls as unknown as Array<[{ input: Record<string, unknown> }]>
    )[0]?.[0].input
    expect(runInput).toMatchObject({
      chatUserInstruction: 'chat instruction'
    })
    expect(runInput).not.toHaveProperty('userInstruction')
  })

  it('sets pending user message for pure image submissions', async () => {
    await act(async () => {
      root.render(<Probe />)
    })

    await act(async () => {
      await hookResult?.onSubmit('', ['data:image/png;base64,abc'], {
        stream: true
      })
    })

    expect(chatStore.setPendingUserMessage).toHaveBeenCalledWith(expect.objectContaining({
      submissionId: 'submission-1',
      chatUuid: 'chat-1',
      text: '',
      mediaCtx: ['data:image/png;base64,abc']
    }))
    expect(invokeRunStart).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.objectContaining({
        textCtx: '',
        mediaCtx: ['data:image/png;base64,abc']
      })
    }))
  })

  it('clears transient tool output when a run handle is cleaned up', async () => {
    invokeRunStart.mockRejectedValueOnce(new Error('start failed'))
    await act(async () => {
      root.render(<Probe />)
    })

    await expect(act(async () => {
      await hookResult?.onSubmit('hello', [], { stream: true })
    })).rejects.toThrow('start failed')

    expect(chatStore.clearToolLiveOutputs).toHaveBeenCalledWith('submission-1')
  })

  it('steers the active run with exact submission and chat identities', async () => {
    await act(async () => {
      root.render(<Probe />)
    })
    await act(async () => {
      await hookResult?.onSubmit('hello', [], { stream: true })
    })

    await expect(getHookResult().steer({
      queueItemId: 'queue-1',
      text: 'focus here',
      images: ['data:image/png;base64,abc']
    })).resolves.toEqual({ accepted: true })
    expect(invokeRunSteer).toHaveBeenCalledWith({
      submissionId: 'submission-1',
      chatUuid: 'chat-1',
      queueItemId: 'queue-1',
      text: 'focus here',
      images: ['data:image/png;base64,abc']
    })
  })

  it('rejects ArrayBuffer steering images before invoking IPC', async () => {
    await act(async () => {
      root.render(<Probe />)
    })
    await act(async () => {
      await hookResult?.onSubmit('hello', [], { stream: true })
    })

    await expect(getHookResult().steer({
      queueItemId: 'queue-buffer',
      text: 'inspect this',
      images: [new ArrayBuffer(4)]
    })).resolves.toEqual({ accepted: false, reason: 'invalid_request' })
    expect(invokeRunSteer).not.toHaveBeenCalled()
  })

  it('keeps the active run available after the composer remounts', async () => {
    await act(async () => {
      root.render(<Probe />)
    })
    await act(async () => {
      await hookResult?.onSubmit('hello', [], { stream: true })
    })

    await act(async () => {
      root.unmount()
    })
    root = createRoot(container)
    hookResult = undefined
    await act(async () => {
      root.render(<Probe />)
    })

    await expect(getHookResult().steer({
      queueItemId: 'queue-after-remount',
      text: 'keep this direction',
      images: []
    })).resolves.toEqual({ accepted: true })
    expect(invokeRunSteer).toHaveBeenCalledWith({
      submissionId: 'submission-1',
      chatUuid: 'chat-1',
      queueItemId: 'queue-after-remount',
      text: 'keep this direction',
      images: []
    })
  })

  it('cancels by chatUuid after the renderer registry is cleared', async () => {
    await act(async () => {
      root.render(<Probe />)
    })
    await act(async () => {
      await hookResult?.onSubmit('hello', [], { stream: true })
    })

    resetChatRunRegistryForTests()

    await act(async () => {
      await getHookResult().cancel()
    })

    expect(invokeRunCancel).toHaveBeenCalledWith({
      chatUuid: 'chat-1',
      reason: 'user_cancelled'
    })
  })

  it('sends both active identities on the normal cancellation path', async () => {
    await act(async () => {
      root.render(<Probe />)
    })
    await act(async () => {
      await hookResult?.onSubmit('hello', [], { stream: true })
    })

    await act(async () => {
      await getHookResult().cancel()
    })

    expect(invokeRunCancel).toHaveBeenCalledWith({
      submissionId: 'submission-1',
      chatUuid: 'chat-1',
      reason: 'user_cancelled'
    })
  })

  it('settles idle and clears the stale handle when main reports run_not_found', async () => {
    chatStore.getRunStatusForChat.mockReturnValue({
      runPhase: 'streaming',
      postRunJobs: {
        title: 'idle',
        compression: 'idle'
      }
    })
    invokeRunCancel.mockResolvedValueOnce({
      cancelled: false,
      reason: 'run_not_found'
    })

    await act(async () => {
      root.render(<Probe />)
    })
    await act(async () => {
      await hookResult?.onSubmit('hello', [], { stream: true })
    })

    await act(async () => {
      await getHookResult().cancel()
    })

    expect(chatStore.setRunPhaseForChat).toHaveBeenLastCalledWith('chat-1', 'idle')
    expect(chatStore.clearToolLiveOutputs).toHaveBeenCalledWith('submission-1')
    expect(toast.warning).toHaveBeenCalledWith('The current run has already finished')
  })

  it('keeps cancellation pending until run.aborted performs terminal cleanup', async () => {
    await act(async () => {
      root.render(<Probe />)
    })
    await act(async () => {
      await hookResult?.onSubmit('hello', [], { stream: true })
    })

    await act(async () => {
      await getHookResult().cancel()
    })

    expect(chatStore.clearToolLiveOutputs).not.toHaveBeenCalled()
    expect(chatStore.setRunPhaseForChat).toHaveBeenLastCalledWith('chat-1', 'cancelling')

    const onRunEvent = (
      subscribeRunEvents.mock.calls as unknown as Array<[(event: unknown) => void]>
    )[0]?.[0]
    await act(async () => {
      onRunEvent({
        type: 'run.aborted',
        submissionId: 'submission-1',
        sequence: 1,
        chatUuid: 'chat-1',
        payload: { reason: 'user_cancelled' }
      })
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(chatStore.clearToolLiveOutputs).toHaveBeenCalledWith('submission-1')
    expect(chatStore.setLastRunOutcomeForChat).toHaveBeenCalledWith('chat-1', 'aborted')
  })
})
