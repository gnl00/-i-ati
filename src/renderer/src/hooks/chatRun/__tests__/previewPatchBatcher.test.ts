import { describe, expect, it, vi } from 'vitest'
import type { MessageSegmentPatch } from '@shared/chat/render-events'

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
  })),
  createRendererPerfLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}))

import {
  PreviewPatchBatcher,
  compactPreviewSegmentPatches
} from '../previewPatchBatcher'

const textPatch = (
  id: string,
  content: string,
  timestamp = 1
): MessageSegmentPatch => ({
  segment: {
    type: 'text',
    segmentId: id,
    content,
    timestamp
  },
  content
})

const reasoningPatch = (
  id: string,
  content: string,
  timestamp = 2
): MessageSegmentPatch => ({
  segment: {
    type: 'reasoning',
    segmentId: id,
    content,
    timestamp
  }
})

describe('compactPreviewSegmentPatches', () => {
  it('keeps the latest patch for each segment identity', () => {
    const compacted = compactPreviewSegmentPatches([
      textPatch('text-1', 'h'),
      reasoningPatch('reasoning-1', 'thinking'),
      textPatch('text-1', 'hello')
    ])

    expect(compacted.map(patch => patch.segment.segmentId)).toEqual([
      'text-1',
      'reasoning-1'
    ])
    expect((compacted[0]?.segment as TextSegment).content).toBe('hello')
  })

  it('uses the latest replaceSegments patch as the structural base', () => {
    const firstText = textPatch('text-1', 'hello')
    const replacePatch: MessageSegmentPatch = {
      ...textPatch('text-2', 'world'),
      replaceSegments: [
        {
          type: 'text',
          segmentId: 'text-2',
          content: 'world',
          timestamp: 2
        }
      ]
    }
    const trailingReasoning = reasoningPatch('reasoning-1', 'after')

    const compacted = compactPreviewSegmentPatches([
      firstText,
      replacePatch,
      trailingReasoning
    ])

    expect(compacted).toEqual([replacePatch, trailingReasoning])
  })

  it('preserves replaceSegments when merging a later patch for the same segment', () => {
    const replacementSnapshot: MessageSegment[] = [
      {
        type: 'text',
        segmentId: 'text-1',
        content: 'hello',
        timestamp: 1
      },
      {
        type: 'text',
        segmentId: 'text-2',
        content: 'world',
        timestamp: 2
      }
    ]
    const replacePatch: MessageSegmentPatch = {
      ...textPatch('text-2', 'world'),
      replaceSegments: replacementSnapshot
    }
    const trailingPatch = textPatch('text-2', 'world!', 3)

    const compacted = compactPreviewSegmentPatches([
      replacePatch,
      trailingPatch
    ])

    expect(compacted).toHaveLength(1)
    expect(compacted[0]?.replaceSegments).toBe(replacementSnapshot)
    expect((compacted[0]?.segment as TextSegment).content).toBe('world!')
    expect(compacted[0]?.content).toBe('world!')
  })
})

describe('PreviewPatchBatcher', () => {
  it('applies compacted patches on the scheduled frame', () => {
    let scheduledCallback: (() => void) | undefined
    let now = 100
    const applyPatches = vi.fn()
    const batcher = new PreviewPatchBatcher({
      applyPatches,
      now: () => now,
      schedule: (callback) => {
        scheduledCallback = callback
        return 1
      },
      cancel: vi.fn()
    })

    batcher.enqueue(textPatch('text-1', 'h'))
    batcher.enqueue(textPatch('text-1', 'hello'))
    now = 116
    scheduledCallback?.()

    expect(applyPatches).toHaveBeenCalledTimes(1)
    expect(applyPatches.mock.calls[0]?.[0]).toEqual([
      textPatch('text-1', 'hello')
    ])
  })

  it('binds the default frame scheduler to the global target', () => {
    const globalWithFrames = globalThis as typeof globalThis & {
      requestAnimationFrame?: (callback: FrameRequestCallback) => number
      cancelAnimationFrame?: (handle: number) => void
    }
    const originalRequestAnimationFrame = globalWithFrames.requestAnimationFrame
    const originalCancelAnimationFrame = globalWithFrames.cancelAnimationFrame
    const applyPatches = vi.fn()

    globalWithFrames.requestAnimationFrame = function (callback: FrameRequestCallback) {
      expect(this).toBe(globalThis)
      callback(0)
      return 1
    }
    globalWithFrames.cancelAnimationFrame = vi.fn()

    try {
      const batcher = new PreviewPatchBatcher({
        applyPatches
      })

      expect(() => batcher.enqueue(textPatch('text-1', 'hello'))).not.toThrow()
      expect(applyPatches).toHaveBeenCalledWith([
        textPatch('text-1', 'hello')
      ])
    } finally {
      globalWithFrames.requestAnimationFrame = originalRequestAnimationFrame
      globalWithFrames.cancelAnimationFrame = originalCancelAnimationFrame
    }
  })

  it('flushes queued patches synchronously when scheduling fails', () => {
    rendererLoggerError.mockReset()
    const applyPatches = vi.fn()
    const batcher = new PreviewPatchBatcher({
      applyPatches,
      schedule: () => {
        throw new TypeError('Illegal invocation')
      },
      cancel: vi.fn()
    })

    expect(() => batcher.enqueue(textPatch('text-1', 'hello'))).not.toThrow()
    expect(applyPatches).toHaveBeenCalledTimes(1)
    expect(applyPatches).toHaveBeenCalledWith([
      textPatch('text-1', 'hello')
    ])
    expect(rendererLoggerError).toHaveBeenCalledWith(
      'assistant_streaming.preview_patch_batch.schedule_failed',
      expect.objectContaining({
        pendingPatchCount: 1,
        segmentId: 'text-1',
        segmentType: 'text',
        textLength: 5,
        error: expect.objectContaining({
          name: 'TypeError',
          message: 'Illegal invocation'
        })
      })
    )
  })
})
