// @vitest-environment happy-dom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LOG_WRITE } from '@shared/constants'
import { AssistantTextSegmentContent } from '../../assistant-message/renderers/AssistantTextSegmentContent'
import {
  flushAssistantStreamingPerfSession,
  flushRecentAssistantStreamingPerfSessions,
  resetAssistantStreamingPerfSessions
} from '../assistantStreamingPerf'

vi.mock('@renderer/utils/styleLoaders', () => ({
  loadKatexStyles: vi.fn().mockResolvedValue(undefined)
}))

describe('assistant streaming perf baseline harness', () => {
  let container: HTMLDivElement
  let root: Root
  const send = vi.fn()

  beforeEach(() => {
    send.mockReset()
    resetAssistantStreamingPerfSessions()
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    ;(globalThis as any).__ASSISTANT_STREAMING_PERF__ = true
    ;(globalThis as any).__STREAMING_TEXT_RENDER_MODE = 'switch'
    ;(window as any).electron = {
      ipcRenderer: {
        send
      }
    }

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    delete (globalThis as any).__ASSISTANT_STREAMING_PERF__
    delete (globalThis as any).__STREAMING_TEXT_RENDER_MODE
    delete (window as any).electron

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it('captures a repeatable synthetic streaming baseline and routes logs to perf target', async () => {
    const segment: TextSegment = {
      type: 'text',
      segmentId: 'baseline-segment',
      timestamp: 1,
      content: [
        '# Streaming baseline',
        '',
        'This is a long assistant response used to measure the current token-node streaming renderer.',
        'It includes enough text to exercise parsing, tokenization, and animated tail rendering over several updates.',
        '',
        '- first list item',
        '- second list item',
        '',
        '> quoted line for parser coverage'
      ].join('\n')
    }

    const checkpoints = [48, 96, 144, 192, segment.content.length]

    for (const length of checkpoints) {
      await act(async () => {
        root.render(
          <AssistantTextSegmentContent
            segment={segment}
            visibleText={segment.content.slice(0, length)}
            isTyping={true}
          />
        )
      })
    }

    const snapshot = flushAssistantStreamingPerfSession(
      'assistant-text-segment:baseline-segment:switch'
    )

    expect(snapshot).not.toBeNull()
    expect(snapshot?.renderCount ?? 0).toBeGreaterThan(0)
    expect(snapshot?.commitCount ?? 0).toBeGreaterThan(0)
    expect(snapshot?.totalParseMs ?? 0).toBeGreaterThanOrEqual(0)
    expect(snapshot?.totalTokenizeMs ?? 0).toBeGreaterThanOrEqual(0)
    expect(snapshot?.maxTailAnimatedNodeCount ?? 0).toBeGreaterThan(0)

    const perfWrites = send.mock.calls
      .filter(([channel]) => channel === LOG_WRITE)
      .map(([, payload]) => payload)
      .filter((payload) => payload?.target === 'perf')

    expect(perfWrites.length).toBeGreaterThan(0)
    expect(perfWrites.some((payload) => payload.message === 'assistant_streaming.session.summary')).toBe(true)

    console.log('[assistant-streaming-baseline]', snapshot)
  })

  it('flushes recently updated sessions without waiting for unmount', async () => {
    const segment: TextSegment = {
      type: 'text',
      segmentId: 'recent-segment',
      timestamp: 2,
      content: 'recent streaming payload'
    }

    await act(async () => {
      root.render(
        <AssistantTextSegmentContent
          segment={segment}
          visibleText="recent"
          isTyping={true}
        />
      )
    })

    const snapshots = flushRecentAssistantStreamingPerfSessions({
      reason: 'run_completed',
      idleWindowMs: 1_000
    })

    expect(snapshots).toHaveLength(1)
    expect(snapshots[0]?.sessionId).toBe('assistant-text-segment:recent-segment:switch')
    expect(
      send.mock.calls.some(([, payload]) =>
        payload?.target === 'perf'
        && payload?.message === 'assistant_streaming.session.summary'
        && payload?.context?.reason === 'run_completed'
      )
    ).toBe(true)
  })
})
