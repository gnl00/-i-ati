import type { MessageSegmentPatch } from '@shared/chat/render-events'
import {
  recordAssistantStreamingPreviewPatchBatch,
  flushAssistantStreamingPreviewPatchBatchSummary,
  type AssistantStreamingPerfFlushReason
} from '@renderer/components/chat/chatMessage/typewriter/assistantStreamingPerf'

type PatchScheduler = (callback: () => void) => number
type PatchCanceller = (handle: number) => void

export type PreviewPatchBatcherOptions = {
  applyPatches: (patches: MessageSegmentPatch[]) => void
  schedule?: PatchScheduler
  cancel?: PatchCanceller
  now?: () => number
}

const getPatchSegmentIdentity = (patch: MessageSegmentPatch): string => {
  return patch.segment.segmentId || `${patch.segment.type}:${'timestamp' in patch.segment ? patch.segment.timestamp : 'unknown'}`
}

function getDefaultScheduler(): PatchScheduler {
  if (typeof requestAnimationFrame === 'function') {
    return requestAnimationFrame
  }

  return (callback) => globalThis.setTimeout(callback, 16) as unknown as number
}

function getDefaultCanceller(): PatchCanceller {
  if (typeof cancelAnimationFrame === 'function') {
    return cancelAnimationFrame
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

    this.scheduledHandle = this.schedule(() => {
      this.scheduledHandle = 0
      this.flush('raf')
    })
  }

  flush(reason: 'raf' | 'sync' = 'sync'): void {
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
