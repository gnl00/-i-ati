import { memo, useEffect, useMemo, useRef } from 'react'
import {
  recordAssistantStreamingTailPerf,
  type AssistantStreamingPerfMode
} from './assistantStreamingPerf'
import { tokenizeText } from '@renderer/utils/tokenizeText'
import { useEnterTransition } from './use-enter-transition'

const DELTA_MASK_START_OPACITY = 0.45

const AnimatedDelta = memo(({
  content,
  trigger
}: {
  content: string
  trigger: string
}) => {
  const entered = useEnterTransition(trigger, { throttleMs: 90 })

  return (
    <span
      className={[
        'inline whitespace-pre-wrap',
        'transition-[opacity,transform,filter] duration-220 ease-out',
        'motion-reduce:transition-none motion-reduce:opacity-100 motion-reduce:translate-y-0 motion-reduce:blur-0',
        entered ? 'opacity-100 translate-y-0 blur-0' : 'opacity-0 translate-y-[2px] blur-xs'
      ].join(' ')}
      style={{
        opacity: entered ? 1 : 0,
        WebkitMaskImage: entered
          ? `linear-gradient(to right, rgba(0, 0, 0, ${DELTA_MASK_START_OPACITY}), rgba(0, 0, 0, 1))`
          : undefined,
        maskImage: entered
          ? `linear-gradient(to right, rgba(0, 0, 0, ${DELTA_MASK_START_OPACITY}), rgba(0, 0, 0, 1))`
          : undefined
      }}
    >
      {content}
    </span>
  )
})

export interface LatestDeltaLayout {
  staticText: string
  animatedText: string
  tokenCount: number
  visibleTextLength: number
  deltaTokenCount: number
  animatedNodeCount: number
  isAppendOnly: boolean
}

function isAppendOnlyDelta(previousTokens: string[], currentTokens: string[]): boolean {
  if (previousTokens.length > currentTokens.length) {
    return false
  }

  for (let index = 0; index < previousTokens.length; index += 1) {
    if (previousTokens[index] !== currentTokens[index]) {
      return false
    }
  }

  return true
}

export function buildLatestDeltaLayout(currentTokens: string[], previousTokens: string[]): LatestDeltaLayout {
  const currentText = currentTokens.join('')
  const appendOnly = isAppendOnlyDelta(previousTokens, currentTokens)

  if (!appendOnly) {
    return {
      staticText: currentText,
      animatedText: '',
      tokenCount: currentTokens.length,
      visibleTextLength: currentText.length,
      deltaTokenCount: 0,
      animatedNodeCount: 0,
      isAppendOnly: false
    }
  }

  const deltaTokens = currentTokens.slice(previousTokens.length)
  const deltaHasVisibleContent = deltaTokens.some((token) => /\S/.test(token))

  if (!deltaHasVisibleContent) {
    return {
      staticText: currentText,
      animatedText: '',
      tokenCount: currentTokens.length,
      visibleTextLength: currentText.length,
      deltaTokenCount: deltaTokens.length,
      animatedNodeCount: 0,
      isAppendOnly: true
    }
  }

  const staticTokens = currentTokens.slice(0, previousTokens.length)
  return {
    staticText: staticTokens.join(''),
    animatedText: deltaTokens.join(''),
    tokenCount: currentTokens.length,
    visibleTextLength: currentText.length,
    deltaTokenCount: deltaTokens.length,
    animatedNodeCount: 1,
    isAppendOnly: true
  }
}

interface FluidTypewriterLatestDeltaProps {
  content?: string
  visibleCount?: number
  visibleTokens?: string[]
  perfSessionId?: string
  perfSegmentId?: string
  perfMode?: AssistantStreamingPerfMode
}

export const FluidTypewriterLatestDelta = ({
  content = '',
  visibleCount,
  visibleTokens,
  perfSessionId,
  perfSegmentId,
  perfMode = 'lite'
}: FluidTypewriterLatestDeltaProps) => {
  const previousTokensRef = useRef<string[]>([])

  const tokenized = useMemo(() => {
    const t0 = performance.now()
    return {
      tokens: visibleTokens ?? tokenizeText(content),
      tokenizeMs: performance.now() - t0
    }
  }, [content, visibleTokens])

  const visible = useMemo(() => {
    if (visibleTokens) {
      return visibleTokens
    }
    if (visibleCount === undefined) {
      return tokenized.tokens
    }
    return tokenized.tokens.slice(0, visibleCount)
  }, [tokenized.tokens, visibleCount, visibleTokens])

  const layout = useMemo(() => {
    const t0 = performance.now()
    const built = buildLatestDeltaLayout(visible, previousTokensRef.current)
    return {
      ...built,
      chunkBuildMs: performance.now() - t0
    }
  }, [visible])

  useEffect(() => {
    previousTokensRef.current = visible
  }, [visible])

  const activeSegmentId = perfSegmentId ?? 'unknown'
  const activeSessionId = perfSessionId ?? `assistant-text-segment:${activeSegmentId}:${perfMode}`

  useEffect(() => {
    recordAssistantStreamingTailPerf({
      sessionId: activeSessionId,
      segmentId: activeSegmentId,
      mode: perfMode,
      visibleTextLength: layout.visibleTextLength,
      tokenCount: layout.tokenCount,
      animatedNodeCount: layout.animatedNodeCount,
      tokenizeMs: tokenized.tokenizeMs,
      chunkBuildMs: layout.chunkBuildMs
    })
  }, [
    activeSegmentId,
    activeSessionId,
    layout.animatedNodeCount,
    layout.chunkBuildMs,
    layout.tokenCount,
    layout.visibleTextLength,
    perfMode,
    tokenized.tokenizeMs
  ])

  const animationTrigger = `${layout.tokenCount}:${layout.deltaTokenCount}`

  return (
    <span className="wrap-break-word">
      {layout.staticText ? <span className="whitespace-pre-wrap">{layout.staticText}</span> : null}
      {layout.animatedText ? (
        <AnimatedDelta content={layout.animatedText} trigger={animationTrigger} />
      ) : null}
    </span>
  )
}
