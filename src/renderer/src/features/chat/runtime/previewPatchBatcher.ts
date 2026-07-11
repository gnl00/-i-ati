import type { MessageSegmentPatch } from '@shared/chat/render-events'
import { createRendererLogger } from '@renderer/shared/logging/rendererLogger'
import {
  recordAssistantStreamingPreviewPatchBatch,
  flushAssistantStreamingPreviewPatchBatchSummary,
  type AssistantStreamingPerfFlushReason
} from '@renderer/features/chat/message/typewriter/assistantStreamingPerf'

type PatchScheduler = (callback: () => void) => number
type PatchCanceller = (handle: number) => void
type PreviewPatchBatcherFlushReason = 'raf' | 'sync' | 'schedule_error'

const logger = createRendererLogger('PreviewPatchBatcher')

export type PreviewPatchBatcherOptions = {
  applyPatches: (patches: MessageSegmentPatch[]) => void
  schedule?: PatchScheduler
  cancel?: PatchCanceller
  now?: () => number
}

const getPatchSegmentIdentity = (patch: MessageSegmentPatch): string => {
  return patch.segment.segmentId || `${patch.segment.type}:${'timestamp' in patch.segment ? patch.segment.timestamp : 'unknown'}`
}

function normalizeUnknownError(error: unknown): { name?: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    }
  }

  return {
    message: String(error)
  }
}

function getPatchTextLength(patch: MessageSegmentPatch): number | undefined {
  const segment = patch.segment
  if ((segment.type === 'text' || segment.type === 'reasoning') && typeof segment.content === 'string') {
    return segment.content.length
  }
  if (typeof patch.content === 'string') {
    return patch.content.length
  }
  return undefined
}

function getDefaultScheduler(): PatchScheduler {
  const frameTarget = typeof window !== 'undefined' ? window : globalThis
  if (typeof frameTarget.requestAnimationFrame === 'function') {
    return (callback) => frameTarget.requestAnimationFrame(callback)
  }

  return (callback) => globalThis.setTimeout(callback, 16) as unknown as number
}

function getDefaultCanceller(): PatchCanceller {
  const frameTarget = typeof window !== 'undefined' ? window : globalThis
  if (typeof frameTarget.cancelAnimationFrame === 'function') {
    return (handle) => frameTarget.cancelAnimationFrame(handle)
  }

  return (handle) => globalThis.clearTimeout(handle)
}

export function compactPreviewSegmentPatches(
  patches: MessageSegmentPatch[]
): MessageSegmentPatch[] {
  let compacted: MessageSegmentPatch[] = []
  let indexBySegmentId = new Map<string, number>()

  for (const patch of patches) {
    if (patch.replaceSegments) {
      compacted = [patch]
      indexBySegmentId = new Map([[getPatchSegmentIdentity(patch), 0]])
      continue
    }

    const identity = getPatchSegmentIdentity(patch)
    const existingIndex = indexBySegmentId.get(identity)
    if (existingIndex !== undefined) {
      const existingPatch = compacted[existingIndex]
      compacted[existingIndex] = existingPatch.replaceSegments
        ? {
            ...existingPatch,
            ...patch,
            replaceSegments: existingPatch.replaceSegments
          }
        : patch
      continue
    }

    indexBySegmentId.set(identity, compacted.length)
    compacted.push(patch)
  }

  return compacted
}

export class PreviewPatchBatcher {
  private patches: MessageSegmentPatch[] = []
  private scheduledHandle = 0
  private firstQueuedAt = 0
  private readonly applyPatches: (patches: MessageSegmentPatch[]) => void
  private readonly schedule: PatchScheduler
  private readonly cancelScheduled: PatchCanceller
  private readonly now: () => number

  constructor(options: PreviewPatchBatcherOptions) {
    this.applyPatches = options.applyPatches
    this.schedule = options.schedule ?? getDefaultScheduler()
    this.cancelScheduled = options.cancel ?? getDefaultCanceller()
    this.now = options.now ?? Date.now
  }

  enqueue(patch: MessageSegmentPatch): void {
    if (this.patches.length === 0) {
      this.firstQueuedAt = this.now()
    }

    this.patches.push(patch)

    if (this.scheduledHandle !== 0) return

    try {
      this.scheduledHandle = this.schedule(() => {
        this.scheduledHandle = 0
        this.flush('raf')
      })
    } catch (error) {
      this.scheduledHandle = 0
      logger.error('assistant_streaming.preview_patch_batch.schedule_failed', {
        error: normalizeUnknownError(error),
        pendingPatchCount: this.patches.length,
        segmentId: getPatchSegmentIdentity(patch),
        segmentType: patch.segment.type,
        textLength: getPatchTextLength(patch)
      })
      this.flush('schedule_error')
    }
  }

  flush(reason: PreviewPatchBatcherFlushReason = 'sync'): void {
    if (this.patches.length === 0) return

    const pending = this.patches
    this.patches = []
    const compacted = compactPreviewSegmentPatches(pending)

    recordAssistantStreamingPreviewPatchBatch({
      eventCount: pending.length,
      flushedPatchCount: compacted.length,
      delayMs: Math.max(0, this.now() - this.firstQueuedAt),
      reason
    })

    this.applyPatches(compacted)
  }

  cancel(): void {
    if (this.scheduledHandle !== 0) {
      this.cancelScheduled(this.scheduledHandle)
      this.scheduledHandle = 0
    }
    this.patches = []
  }

  flushPerfSummary(reason: AssistantStreamingPerfFlushReason): void {
    flushAssistantStreamingPreviewPatchBatchSummary(reason)
  }
}
