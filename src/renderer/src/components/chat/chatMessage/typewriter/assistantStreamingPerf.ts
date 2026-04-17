import { createRendererPerfLogger } from '@renderer/services/logging/rendererLogger'

export type AssistantStreamingPerfMode = 'markdown' | 'switch' | 'lite' | 'code'
export type AssistantStreamingPerfFlushReason =
  | 'manual'
  | 'unmount'
  | 'run_completed'
  | 'run_failed'
  | 'run_aborted'

interface AssistantStreamingPerfSession {
  sessionId: string
  segmentId: string
  mode: AssistantStreamingPerfMode
  renderCount: number
  commitCount: number
  totalCommitMs: number
  maxCommitMs: number
  totalParseMs: number
  totalTokenizeMs: number
  totalChunkBuildMs: number
  maxTailTokenCount: number
  maxTailAnimatedNodeCount: number
  maxBlockCount: number
  maxVisibleTextLength: number
  updatedAtMs: number
}

export interface AssistantStreamingPerfSnapshot extends Omit<AssistantStreamingPerfSession, 'updatedAtMs'> {
  avgCommitMs: number
}

const logger = createRendererPerfLogger('AssistantStreamingPerf')
const sessions = new Map<string, AssistantStreamingPerfSession>()
let scheduledFlushTimer: ReturnType<typeof setTimeout> | null = null

function isEnabled(): boolean {
  return Boolean((globalThis as any).__ASSISTANT_STREAMING_PERF__)
}

function buildSummary(input: {
  sessionId: string
  segmentId: string
  mode: AssistantStreamingPerfMode
}): AssistantStreamingPerfSession {
  return {
    sessionId: input.sessionId,
    segmentId: input.segmentId,
    mode: input.mode,
    renderCount: 0,
    commitCount: 0,
    totalCommitMs: 0,
    maxCommitMs: 0,
    totalParseMs: 0,
    totalTokenizeMs: 0,
    totalChunkBuildMs: 0,
    maxTailTokenCount: 0,
    maxTailAnimatedNodeCount: 0,
    maxBlockCount: 0,
    maxVisibleTextLength: 0,
    updatedAtMs: Date.now()
  }
}

function getSummary(input: {
  sessionId: string
  segmentId: string
  mode: AssistantStreamingPerfMode
}): AssistantStreamingPerfSession {
  const existing = sessions.get(input.sessionId)
  if (existing) {
    return existing
  }

  const summary = buildSummary(input)
  sessions.set(input.sessionId, summary)
  logger.debug('assistant_streaming.session.started', {
    sessionId: input.sessionId,
    segmentId: input.segmentId,
    mode: input.mode
  })
  return summary
}

function touchSummary(summary: AssistantStreamingPerfSession): void {
  summary.updatedAtMs = Date.now()
}

function toSnapshot(summary: AssistantStreamingPerfSession): AssistantStreamingPerfSnapshot {
  const { updatedAtMs: _updatedAtMs, ...snapshot } = summary
  return {
    ...snapshot,
    avgCommitMs: summary.commitCount === 0 ? 0 : summary.totalCommitMs / summary.commitCount
  }
}

export function isAssistantStreamingPerfEnabled(): boolean {
  return isEnabled()
}

export function recordAssistantStreamingSwitchRender(args: {
  sessionId: string
  segmentId: string
  mode: AssistantStreamingPerfMode
  renderer: 'full-markdown' | 'lite'
  isTyping: boolean
  visibleTextLength: number
  durationMs: number
}): void {
  if (!isEnabled()) return

  const summary = getSummary(args)
  touchSummary(summary)
  summary.renderCount += 1
  summary.maxVisibleTextLength = Math.max(summary.maxVisibleTextLength, args.visibleTextLength)
  logger.debug('assistant_streaming.switch.render', args)
}

export function recordAssistantStreamingLiteParse(args: {
  sessionId: string
  segmentId: string
  mode: AssistantStreamingPerfMode
  visibleTextLength: number
  blockCount: number
  durationMs: number
}): void {
  if (!isEnabled()) return

  const summary = getSummary(args)
  touchSummary(summary)
  summary.totalParseMs += args.durationMs
  summary.maxBlockCount = Math.max(summary.maxBlockCount, args.blockCount)
  summary.maxVisibleTextLength = Math.max(summary.maxVisibleTextLength, args.visibleTextLength)
  logger.debug('assistant_streaming.lite.parse', args)
}

export function recordAssistantStreamingTailPerf(args: {
  sessionId: string
  segmentId: string
  mode: AssistantStreamingPerfMode
  visibleTextLength: number
  tokenCount: number
  animatedNodeCount: number
  tokenizeMs: number
  chunkBuildMs: number
}): void {
  if (!isEnabled()) return

  const summary = getSummary(args)
  touchSummary(summary)
  summary.totalTokenizeMs += args.tokenizeMs
  summary.totalChunkBuildMs += args.chunkBuildMs
  summary.maxTailTokenCount = Math.max(summary.maxTailTokenCount, args.tokenCount)
  summary.maxTailAnimatedNodeCount = Math.max(summary.maxTailAnimatedNodeCount, args.animatedNodeCount)
  summary.maxVisibleTextLength = Math.max(summary.maxVisibleTextLength, args.visibleTextLength)
  logger.debug('assistant_streaming.tail.render', args)
}

export function recordAssistantStreamingCommit(args: {
  sessionId: string
  segmentId: string
  mode: AssistantStreamingPerfMode
  phase: 'mount' | 'update' | 'nested-update'
  actualDuration: number
  baseDuration: number
}): void {
  if (!isEnabled()) return

  const summary = getSummary(args)
  touchSummary(summary)
  summary.commitCount += 1
  summary.totalCommitMs += args.actualDuration
  summary.maxCommitMs = Math.max(summary.maxCommitMs, args.actualDuration)
  logger.debug('assistant_streaming.render.commit', args)
}

export function flushAssistantStreamingPerfSession(
  sessionId: string,
  reason: AssistantStreamingPerfFlushReason = 'manual'
): AssistantStreamingPerfSnapshot | null {
  if (!isEnabled()) return null

  const summary = sessions.get(sessionId)
  if (!summary) return null

  sessions.delete(sessionId)
  const snapshot = toSnapshot(summary)
  logger.info('assistant_streaming.session.summary', {
    ...snapshot,
    reason
  })
  return snapshot
}

export function flushRecentAssistantStreamingPerfSessions(args?: {
  reason?: AssistantStreamingPerfFlushReason
  idleWindowMs?: number
}): AssistantStreamingPerfSnapshot[] {
  if (!isEnabled()) return []

  const reason = args?.reason ?? 'manual'
  const idleWindowMs = args?.idleWindowMs ?? 5_000
  const now = Date.now()
  const flushedSnapshots: AssistantStreamingPerfSnapshot[] = []

  for (const [sessionId, summary] of sessions.entries()) {
    if (now - summary.updatedAtMs > idleWindowMs) {
      continue
    }

    const snapshot = flushAssistantStreamingPerfSession(sessionId, reason)
    if (snapshot) {
      flushedSnapshots.push(snapshot)
    }
  }

  return flushedSnapshots
}

export function scheduleAssistantStreamingPerfRecentSessionFlush(args?: {
  reason?: AssistantStreamingPerfFlushReason
  delayMs?: number
  idleWindowMs?: number
}): void {
  if (!isEnabled()) return

  if (scheduledFlushTimer) {
    clearTimeout(scheduledFlushTimer)
  }

  const reason = args?.reason ?? 'manual'
  const delayMs = args?.delayMs ?? 80
  const idleWindowMs = args?.idleWindowMs ?? 5_000

  scheduledFlushTimer = setTimeout(() => {
    scheduledFlushTimer = null
    flushRecentAssistantStreamingPerfSessions({
      reason,
      idleWindowMs
    })
  }, delayMs)
}

export function getAssistantStreamingPerfSnapshot(sessionId: string): AssistantStreamingPerfSnapshot | null {
  const summary = sessions.get(sessionId)
  return summary ? toSnapshot(summary) : null
}

export function resetAssistantStreamingPerfSessions(): void {
  if (scheduledFlushTimer) {
    clearTimeout(scheduledFlushTimer)
    scheduledFlushTimer = null
  }
  sessions.clear()
}
