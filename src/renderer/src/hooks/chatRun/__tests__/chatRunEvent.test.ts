import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CHAT_RENDER_EVENTS } from '@shared/chat/render-events'
import { RUN_LIFECYCLE_EVENTS } from '@shared/run/lifecycle-events'
import type { MessageSegmentPatch } from '@shared/chat/render-events'

const latestStore = {
  currentChatUuid: 'chat-live',
  runPhase: 'idle' as 'idle' | 'submitting' | 'streaming' | 'post_run' | 'cancelling',
  upsertMessage: vi.fn(),
  setScrollHint: vi.fn(),
  patchMessageSegment: vi.fn(),
  updateLastAssistantMessageWithError: vi.fn(),
  settleLatestAssistantAfterAbort: vi.fn()
}

vi.mock('@renderer/store/chatStore', () => ({
  useChatStore: {
    getState: vi.fn(() => latestStore)
  }
}))

const { scheduleAssistantStreamingPerfRecentSessionFlush } = vi.hoisted(() => ({
  scheduleAssistantStreamingPerfRecentSessionFlush: vi.fn()
}))

vi.mock('@renderer/components/chat/chatMessage/typewriter/assistantStreamingPerf', () => ({
  scheduleAssistantStreamingPerfRecentSessionFlush
}))

import { handleChatRunEvent } from '../chatRunEvent'

function createInput() {
  return {
    submissionId: 'submission-1',
    chatStore: {
      applyReadyChat: vi.fn(),
      updateChatList: vi.fn(),
      resetPreview: vi.fn(),
      setMessages: vi.fn(),
      setScrollHint: vi.fn(),
      clearScrollHint: vi.fn(),
      setRunPhase: vi.fn(),
      replacePreviewMessage: vi.fn(),
      applyPreviewSegmentPatch: vi.fn(),
      setPostRunJobState: vi.fn(),
      setLastRunOutcome: vi.fn(),
      currentChatUuid: 'chat-stale'
    },
    runCompletedRef: { current: false },
    lastErrorMessageRef: { current: null },
    clearedErrorMessageIdsRef: { current: new Set<number>() },
    hasPendingPostRunJobs: vi.fn(() => false),
    maybeCleanupAfterBackgroundJobs: vi.fn(),
    resetRunLifecycle: vi.fn(),
    cleanupActiveRun: vi.fn()
  } as unknown as Parameters<typeof handleChatRunEvent>[0]
}

describe('handleChatRunEvent', () => {
  beforeEach(() => {
    latestStore.currentChatUuid = 'chat-live'
    latestStore.runPhase = 'idle'
    latestStore.upsertMessage.mockReset()
    latestStore.setScrollHint.mockReset()
    latestStore.patchMessageSegment.mockReset()
    latestStore.updateLastAssistantMessageWithError.mockReset()
    latestStore.settleLatestAssistantAfterAbort.mockReset()
    scheduleAssistantStreamingPerfRecentSessionFlush.mockReset()
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

    expect(latestStore.upsertMessage).toHaveBeenCalledTimes(1)
    expect(latestStore.setScrollHint).toHaveBeenCalledWith({
      type: 'user-sent',
      chatUuid: 'chat-live',
      messageId: 11
    })
    expect(input.chatStore.setScrollHint).not.toHaveBeenCalled()
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

    expect(input.chatStore.setRunPhase).toHaveBeenCalledWith('streaming')
    expect(input.chatStore.resetPreview).toHaveBeenCalledTimes(1)
    expect(latestStore.upsertMessage).toHaveBeenCalledTimes(1)
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

    expect(input.chatStore.applyPreviewSegmentPatch).toHaveBeenCalledWith(patch)
    expect(latestStore.patchMessageSegment).toHaveBeenCalledWith(99, patch)
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
    expect(input.chatStore.setLastRunOutcome).toHaveBeenCalledWith('completed')
  })
})
