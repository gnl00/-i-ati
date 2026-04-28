import { describe, expect, it, vi } from 'vitest'
import type { MessageSegmentPatch } from '@shared/chat/render-events'
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
})
