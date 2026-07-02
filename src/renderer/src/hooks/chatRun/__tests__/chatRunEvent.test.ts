import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CHAT_HOST_EVENTS, CHAT_RENDER_EVENTS } from '@shared/run/events'
import { RUN_LIFECYCLE_EVENTS } from '@shared/run/lifecycle-events'
import { RUN_MAINTENANCE_EVENTS } from '@shared/run/maintenance-events'
import type { MessageSegmentPatch } from '@shared/chat/render-events'
import { MESSAGE_SOURCE } from '@shared/messages/messageSources'

const latestStore = {
  currentChatUuid: 'chat-live',
  runPhase: 'idle' as 'idle' | 'submitting' | 'streaming' | 'post_run' | 'cancelling',
  postRunJobs: { title: 'idle' as const, compression: 'idle' as const },
  upsertMessage: vi.fn(),
  upsertMessageForChat: vi.fn(),
  setScrollHint: vi.fn(),
  patchMessageSegment: vi.fn(),
  patchMessageSegmentForChat: vi.fn(),
  updateLastAssistantMessageWithError: vi.fn(),
  updateLastAssistantMessageWithErrorForChat: vi.fn(),
  settleLatestAssistantAfterAbort: vi.fn(),
  settleLatestAssistantAfterAbortForChat: vi.fn(),
  getRunStatusForChat: vi.fn((_chatUuid: string) => ({
    runPhase: latestStore.runPhase,
    postRunJobs: latestStore.postRunJobs,
    lastRunOutcome: 'idle'
  })),
  setRunPhaseForChat: vi.fn(),
  setPostRunJobStateForChat: vi.fn(),
  resetPostRunJobsForChat: vi.fn(),
  setLastRunOutcomeForChat: vi.fn(),
  clearPendingUserMessage: vi.fn()
}

vi.mock('@renderer/store/chatStore', () => ({
  useChatStore: {
    getState: vi.fn(() => latestStore)
  }
}))

const {
  scheduleAssistantStreamingPerfRecentSessionFlush,
  recordAssistantStreamingPreviewPatchBatch,
  flushAssistantStreamingPreviewPatchBatchSummary
} = vi.hoisted(() => ({
  scheduleAssistantStreamingPerfRecentSessionFlush: vi.fn(),
  recordAssistantStreamingPreviewPatchBatch: vi.fn(),
  flushAssistantStreamingPreviewPatchBatchSummary: vi.fn()
}))

const {
  rendererLoggerError
} = vi.hoisted(() => ({
  rendererLoggerError: vi.fn()
}))

vi.mock('@renderer/services/logging/rendererLogger', () => ({
  createRendererLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: rendererLoggerError
  }))
}))

vi.mock('@renderer/components/chat/chatMessage/typewriter/assistantStreamingPerf', () => ({
  scheduleAssistantStreamingPerfRecentSessionFlush,
  recordAssistantStreamingPreviewPatchBatch,
  flushAssistantStreamingPreviewPatchBatchSummary
}))

import { handleChatRunEvent, handleChatRunEventSafely } from '../chatRunEvent'

function createInput() {
  return {
    submissionId: 'submission-1',
    chatStore: {
      applyReadyChat: vi.fn(),
      updateChatList: vi.fn(),
      resetPreview: vi.fn(),
      resetPreviewForChat: vi.fn(),
      setMessages: vi.fn(),
      setMessagesForChat: vi.fn(),
      setScrollHint: vi.fn(),
      clearScrollHint: vi.fn(),
      setRunPhase: vi.fn(),
      setRunPhaseForChat: vi.fn(),
      replacePreviewMessage: vi.fn(),
      replacePreviewMessageForChat: vi.fn(),
      applyPreviewSegmentPatch: vi.fn(),
      applyPreviewSegmentPatchForChat: vi.fn(),
      applyPreviewSegmentPatches: vi.fn(),
      applyPreviewSegmentPatchesForChat: vi.fn(),
      setPostRunJobState: vi.fn(),
      setPostRunJobStateForChat: vi.fn(),
      setLastRunOutcome: vi.fn(),
      setLastRunOutcomeForChat: vi.fn(),
      currentChatUuid: 'chat-stale'
    },
    runChatUuidRef: { current: 'chat-1' },
    runCompletedRef: { current: false },
    lastErrorMessageRef: { current: null },
    clearedErrorMessageIdsRef: { current: new Set<number>() },
    hasPendingBlockingPostRunJobs: vi.fn(() => false),
    maybeCleanupAfterBackgroundJobs: vi.fn(),
    resetRunLifecycle: vi.fn(),
    cleanupActiveRun: vi.fn()
  } as unknown as Parameters<typeof handleChatRunEvent>[0]
}

describe('handleChatRunEvent', () => {
  beforeEach(() => {
    latestStore.currentChatUuid = 'chat-live'
    latestStore.runPhase = 'idle'
    latestStore.postRunJobs = { title: 'idle', compression: 'idle' }
    latestStore.upsertMessage.mockReset()
    latestStore.upsertMessageForChat.mockReset()
    latestStore.setScrollHint.mockReset()
    latestStore.patchMessageSegment.mockReset()
    latestStore.patchMessageSegmentForChat.mockReset()
    latestStore.updateLastAssistantMessageWithError.mockReset()
    latestStore.updateLastAssistantMessageWithErrorForChat.mockReset()
    latestStore.settleLatestAssistantAfterAbort.mockReset()
    latestStore.settleLatestAssistantAfterAbortForChat.mockReset()
    latestStore.getRunStatusForChat.mockClear()
    latestStore.setRunPhaseForChat.mockReset()
    latestStore.setPostRunJobStateForChat.mockReset()
    latestStore.resetPostRunJobsForChat.mockReset()
    latestStore.setLastRunOutcomeForChat.mockReset()
    latestStore.clearPendingUserMessage.mockReset()
    scheduleAssistantStreamingPerfRecentSessionFlush.mockReset()
    rendererLoggerError.mockReset()
  })

  it('uses the latest store state when handling user message creation', async () => {
    latestStore.runPhase = 'submitting'
    const input = createInput()

    await handleChatRunEvent(input, {
      submissionId: 'submission-1',
      chatId: 1,
      chatUuid: 'chat-1',
      timestamp: 1,
      sequence: 1,
      type: CHAT_RENDER_EVENTS.MESSAGE_CREATED,
      payload: {
        message: {
          id: 11,
          chatId: 1,
          chatUuid: 'chat-1',
          body: {
            role: 'user',
            content: 'hello',
            segments: []
          }
        }
      }
    })

    expect(latestStore.upsertMessageForChat).toHaveBeenCalledWith('chat-1', expect.objectContaining({ id: 11 }))
    expect(latestStore.setScrollHint).not.toHaveBeenCalled()
    expect(input.chatStore.setScrollHint).not.toHaveBeenCalled()
  })

  it('clears optimistic pending user message when the visible user message is committed', async () => {
    latestStore.currentChatUuid = 'chat-1'
    const input = createInput()

    await handleChatRunEvent(input, {
      submissionId: 'submission-1',
      chatId: 1,
      chatUuid: 'chat-1',
      timestamp: 1,
      sequence: 1,
      type: CHAT_RENDER_EVENTS.MESSAGE_CREATED,
      payload: {
        message: {
          id: 11,
          chatId: 1,
          chatUuid: 'chat-1',
          body: {
            role: 'user',
            content: 'hello',
            segments: []
          }
        }
      }
    })

    expect(latestStore.clearPendingUserMessage).toHaveBeenCalledWith('submission-1')
    expect(latestStore.setScrollHint).toHaveBeenCalledWith(expect.objectContaining({
      type: 'user-sent',
      messageId: 11
    }))
  })

  it('upserts hidden user messages without treating them as user-sent scroll intent', async () => {
    latestStore.currentChatUuid = 'chat-1'
    const input = createInput()

    await handleChatRunEvent(input, {
      submissionId: 'submission-1',
      chatId: 1,
      chatUuid: 'chat-1',
      timestamp: 1,
      sequence: 1,
      type: CHAT_RENDER_EVENTS.MESSAGE_CREATED,
      payload: {
        message: {
          id: 12,
          chatId: 1,
          chatUuid: 'chat-1',
          body: {
            role: 'user',
            source: MESSAGE_SOURCE.VISION_OBSERVATION,
            content: '<vision_observation status="ok">Summary</vision_observation>',
            segments: []
          }
        }
      }
    })

    expect(latestStore.upsertMessageForChat).toHaveBeenCalledWith('chat-1', expect.objectContaining({ id: 12 }))
    expect(latestStore.clearPendingUserMessage).not.toHaveBeenCalled()
    expect(latestStore.setScrollHint).not.toHaveBeenCalled()
    expect(input.chatStore.setScrollHint).not.toHaveBeenCalled()
  })

  it('uses the last visible message as the conversation-switch scroll target', async () => {
    latestStore.currentChatUuid = 'chat-1'
    const input = createInput()

    await handleChatRunEvent(input, {
      submissionId: 'submission-1',
      chatId: 1,
      chatUuid: 'chat-1',
      timestamp: 1,
      sequence: 1,
      type: CHAT_HOST_EVENTS.MESSAGES_LOADED,
      payload: {
        messages: [
          {
            id: 10,
            chatId: 1,
            chatUuid: 'chat-1',
            body: {
              role: 'user',
              content: 'visible',
              segments: []
            }
          },
          {
            id: 11,
            chatId: 1,
            chatUuid: 'chat-1',
            body: {
              role: 'user',
              source: MESSAGE_SOURCE.VISION_OBSERVATION,
              content: '<vision_observation status="ok">Summary</vision_observation>',
              segments: []
            }
          }
        ] as MessageEntity[]
      }
    })

    expect(input.chatStore.setMessagesForChat).toHaveBeenCalledWith('chat-1', expect.any(Array))
    expect(input.chatStore.setScrollHint).toHaveBeenCalledWith(expect.objectContaining({
      type: 'conversation-switch',
      index: 0
    }))
  })

  it('does not select a background chat shell when an existing chat becomes ready', async () => {
    latestStore.currentChatUuid = 'chat-live'
    latestStore.runPhase = 'streaming'
    latestStore.getRunStatusForChat.mockReturnValueOnce({
      runPhase: 'idle',
      postRunJobs: { title: 'idle', compression: 'idle' },
      lastRunOutcome: 'idle'
    })
    const input = createInput()

    await handleChatRunEvent(input, {
      submissionId: 'submission-1',
      chatId: 1,
      chatUuid: 'chat-1',
      timestamp: 1,
      sequence: 1,
      type: CHAT_HOST_EVENTS.CHAT_READY,
      payload: {
        chatEntity: {
          id: 1,
          uuid: 'chat-1',
          title: 'Background chat',
          messages: [],
          createTime: 1,
          updateTime: 1
        },
        workspacePath: '/tmp/chat-1'
      }
    })

    expect(input.chatStore.applyReadyChat).toHaveBeenCalledWith(
      expect.objectContaining({ uuid: 'chat-1' }),
      { selectShell: false }
    )
    expect(latestStore.setRunPhaseForChat).toHaveBeenCalledWith('chat-1', 'submitting')
  })

  it('selects the chat shell when a new chat becomes ready for a pending run', async () => {
    latestStore.currentChatUuid = null as unknown as string
    latestStore.runPhase = 'submitting'
    latestStore.getRunStatusForChat.mockReturnValueOnce({
      runPhase: 'idle',
      postRunJobs: { title: 'idle', compression: 'idle' },
      lastRunOutcome: 'idle'
    })
    const input = createInput()
    input.runChatUuidRef.current = null

    await handleChatRunEvent(input, {
      submissionId: 'submission-1',
      chatId: 1,
      timestamp: 1,
      sequence: 1,
      type: CHAT_HOST_EVENTS.CHAT_READY,
      payload: {
        chatEntity: {
          id: 1,
          uuid: 'chat-1',
          title: 'New chat',
          messages: [],
          createTime: 1,
          updateTime: 1
        },
        workspacePath: '/tmp/chat-1'
      }
    })

    expect(input.chatStore.applyReadyChat).toHaveBeenCalledWith(
      expect.objectContaining({ uuid: 'chat-1' }),
      { selectShell: true }
    )
    expect(input.runChatUuidRef.current).toBe('chat-1')
    expect(latestStore.setRunPhaseForChat).toHaveBeenCalledWith('chat-1', 'submitting')
  })

  it('moves submitting runs into streaming when the first assistant message arrives', async () => {
    latestStore.runPhase = 'submitting'
    const input = createInput()

    await handleChatRunEvent(input, {
      submissionId: 'submission-1',
      chatId: 1,
      chatUuid: 'chat-1',
      timestamp: 1,
      sequence: 1,
      type: CHAT_RENDER_EVENTS.MESSAGE_UPDATED,
      payload: {
        message: {
          id: 12,
          chatId: 1,
          chatUuid: 'chat-1',
          body: {
            role: 'assistant',
            content: 'hi',
            segments: []
          }
        }
      }
    })

    expect(latestStore.setRunPhaseForChat).toHaveBeenCalledWith('chat-1', 'streaming')
    expect(input.chatStore.resetPreviewForChat).toHaveBeenCalledWith('chat-1')
    expect(latestStore.upsertMessageForChat).toHaveBeenCalledTimes(1)
  })

  it('moves submitting runs into streaming when the first preview arrives', async () => {
    latestStore.runPhase = 'submitting'
    const input = createInput()

    await handleChatRunEvent(input, {
      submissionId: 'submission-1',
      chatId: 1,
      chatUuid: 'chat-1',
      timestamp: 1,
      sequence: 1,
      type: CHAT_RENDER_EVENTS.PREVIEW_UPDATED,
      payload: {
        message: {
          chatId: 1,
          chatUuid: 'chat-1',
          body: {
            role: 'assistant',
            source: 'stream_preview',
            content: 'hi',
            segments: []
          }
        }
      }
    })

    expect(latestStore.setRunPhaseForChat).toHaveBeenCalledWith('chat-1', 'streaming')
    expect(input.chatStore.replacePreviewMessageForChat).toHaveBeenCalledWith(
      'chat-1',
      expect.objectContaining({ chatUuid: 'chat-1' })
    )
  })

  it('routes preview and committed segment patches to the correct store actions', async () => {
    const input = createInput()
    const patch: MessageSegmentPatch = {
      segment: {
        type: 'text',
        segmentId: 'seg-1',
        content: 'partial',
        timestamp: 1
      }
    }

    await handleChatRunEvent(input, {
      submissionId: 'submission-1',
      chatId: 1,
      chatUuid: 'chat-1',
      timestamp: 1,
      sequence: 1,
      type: CHAT_RENDER_EVENTS.PREVIEW_SEGMENT_UPDATED,
      payload: {
        chatId: 1,
        chatUuid: 'chat-1',
        patch
      }
    })

    await handleChatRunEvent(input, {
      submissionId: 'submission-1',
      chatId: 1,
      chatUuid: 'chat-1',
      timestamp: 2,
      sequence: 2,
      type: CHAT_RENDER_EVENTS.MESSAGE_SEGMENT_UPDATED,
      payload: {
        messageId: 99,
        patch
      }
    })

    expect(input.chatStore.applyPreviewSegmentPatchForChat).toHaveBeenCalledWith('chat-1', patch)
    expect(latestStore.patchMessageSegmentForChat).toHaveBeenCalledWith('chat-1', 99, patch)
  })

  it('queues preview segment patches when a preview patch batcher is available', async () => {
    const enqueue = vi.fn()
    const flush = vi.fn()
    const flushPerfSummary = vi.fn()
    const input = {
      ...createInput(),
      previewPatchBatcher: {
        enqueue,
        flush,
        flushPerfSummary
      }
    } as unknown as Parameters<typeof handleChatRunEvent>[0]
    const patch: MessageSegmentPatch = {
      segment: {
        type: 'text',
        segmentId: 'seg-1',
        content: 'partial',
        timestamp: 1
      }
    }

    await handleChatRunEvent(input, {
      submissionId: 'submission-1',
      chatId: 1,
      chatUuid: 'chat-1',
      timestamp: 1,
      sequence: 1,
      type: CHAT_RENDER_EVENTS.PREVIEW_SEGMENT_UPDATED,
      payload: {
        chatId: 1,
        chatUuid: 'chat-1',
        patch
      }
    })

    expect(enqueue).toHaveBeenCalledWith(patch)
    expect(input.chatStore.applyPreviewSegmentPatchForChat).not.toHaveBeenCalled()
  })

  it('logs event handler failures without rejecting the run event subscription', async () => {
    const enqueueError = new TypeError('Illegal invocation')
    const input = {
      ...createInput(),
      previewPatchBatcher: {
        enqueue: vi.fn(() => {
          throw enqueueError
        }),
        flush: vi.fn(),
        flushPerfSummary: vi.fn()
      }
    } as unknown as Parameters<typeof handleChatRunEvent>[0]
    const patch: MessageSegmentPatch = {
      segment: {
        type: 'text',
        segmentId: 'seg-1',
        content: 'partial',
        timestamp: 1
      }
    }

    await expect(handleChatRunEventSafely(input, {
      submissionId: 'submission-1',
      chatId: 1,
      chatUuid: 'chat-1',
      timestamp: 1,
      sequence: 1,
      type: CHAT_RENDER_EVENTS.PREVIEW_SEGMENT_UPDATED,
      payload: {
        chatId: 1,
        chatUuid: 'chat-1',
        patch
      }
    })).resolves.toBeUndefined()

    expect(rendererLoggerError).toHaveBeenCalledWith(
      'chat_run.event_handler_failed',
      expect.objectContaining({
        type: CHAT_RENDER_EVENTS.PREVIEW_SEGMENT_UPDATED,
        submissionId: 'submission-1',
        sequence: 1,
        chatId: 1,
        chatUuid: 'chat-1',
        segmentId: 'seg-1',
        segmentType: 'text',
        textLength: 'partial'.length,
        error: expect.objectContaining({
          name: 'TypeError',
          message: 'Illegal invocation'
        })
      })
    )
  })

  it('flushes pending preview patches before run completion cleanup', async () => {
    const flush = vi.fn()
    const flushPerfSummary = vi.fn()
    const input = {
      ...createInput(),
      previewPatchBatcher: {
        enqueue: vi.fn(),
        flush,
        flushPerfSummary
      }
    } as unknown as Parameters<typeof handleChatRunEvent>[0]

    await handleChatRunEvent(input, {
      submissionId: 'submission-1',
      chatId: 1,
      chatUuid: 'chat-1',
      timestamp: 3,
      sequence: 3,
      type: RUN_LIFECYCLE_EVENTS.RUN_COMPLETED,
      payload: {
        assistantMessageId: 12
      }
    })

    expect(flush).toHaveBeenCalledWith('sync')
    expect(flushPerfSummary).toHaveBeenCalledWith('run_completed')
    expect(input.chatStore.resetPreviewForChat).toHaveBeenCalledWith('chat-1')
  })

  it('schedules a perf flush when the run completes', async () => {
    const input = createInput()

    await handleChatRunEvent(input, {
      submissionId: 'submission-1',
      chatId: 1,
      chatUuid: 'chat-1',
      timestamp: 3,
      sequence: 3,
      type: RUN_LIFECYCLE_EVENTS.RUN_COMPLETED,
      payload: {
        assistantMessageId: 12
      }
    })

    expect(scheduleAssistantStreamingPerfRecentSessionFlush).toHaveBeenCalledWith({
      reason: 'run_completed'
    })
    expect(input.chatStore.setLastRunOutcomeForChat).toHaveBeenCalledWith('chat-1', 'completed')
  })

  it('keeps title-only post-run work from entering post_run phase', async () => {
    const input = createInput()
    input.runCompletedRef.current = true

    await handleChatRunEvent(input, {
      submissionId: 'submission-1',
      chatId: 1,
      chatUuid: 'chat-1',
      timestamp: 4,
      sequence: 4,
      type: RUN_MAINTENANCE_EVENTS.POSTRUN_PLAN,
      payload: {
        title: 'pending',
        compression: 'skipped'
      }
    })

    expect(input.chatStore.setPostRunJobStateForChat).toHaveBeenCalledWith('chat-1', 'title', 'pending')
    expect(input.chatStore.setPostRunJobStateForChat).toHaveBeenCalledWith('chat-1', 'compression', 'idle')
    expect(input.chatStore.setRunPhaseForChat).not.toHaveBeenCalledWith('chat-1', 'post_run')
    expect(input.maybeCleanupAfterBackgroundJobs).toHaveBeenCalledWith('chat-1')
  })

  it('enters post_run phase while compression is pending', async () => {
    const input = createInput()
    input.runCompletedRef.current = true

    await handleChatRunEvent(input, {
      submissionId: 'submission-1',
      chatId: 1,
      chatUuid: 'chat-1',
      timestamp: 4,
      sequence: 4,
      type: RUN_MAINTENANCE_EVENTS.POSTRUN_PLAN,
      payload: {
        title: 'skipped',
        compression: 'pending'
      }
    })

    expect(input.chatStore.setPostRunJobStateForChat).toHaveBeenCalledWith('chat-1', 'compression', 'pending')
    expect(input.chatStore.setRunPhaseForChat).toHaveBeenCalledWith('chat-1', 'post_run')
    expect(input.maybeCleanupAfterBackgroundJobs).not.toHaveBeenCalled()
  })
})
