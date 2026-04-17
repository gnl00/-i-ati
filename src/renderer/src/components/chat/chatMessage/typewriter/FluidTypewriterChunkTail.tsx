import { memo, useEffect, useMemo } from 'react'
import {
  recordAssistantStreamingTailPerf,
  type AssistantStreamingPerfMode
} from './assistantStreamingPerf'
import { tokenizeText } from '@renderer/utils/tokenizeText'
import { useEnterTransition } from './use-enter-transition'

const DEFAULT_MAX_CHUNK_COUNT = 4
const CHUNK_TAIL_MASK_START_OPACITY = 0.45

const AnimatedChunk = memo(({
  content
}: {
  content: string
}) => {
  const entered = useEnterTransition(content, { throttleMs: 90 })

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
          ? `linear-gradient(to right, rgba(0, 0, 0, ${CHUNK_TAIL_MASK_START_OPACITY}), rgba(0, 0, 0, 1))`
          : undefined,
        maskImage: entered
          ? `linear-gradient(to right, rgba(0, 0, 0, ${CHUNK_TAIL_MASK_START_OPACITY}), rgba(0, 0, 0, 1))`
          : undefined
      }}
    >
      {content}
    </span>
  )
})

const StaticChunk = memo(({ content }: { content: string }) => {
  return <span className="whitespace-pre-wrap">{content}</span>
})

export interface ChunkTailLayout {
  prefixText: string
  animatedChunks: string[]
  animatedChunkCount: number
  lastAnimatedChunkIndex: number
  tokenCount: number
  visibleTextLength: number
}

export function buildChunkTailLayout(
  tokens: string[],
  animationWindow: number,
  maxChunkCount = DEFAULT_MAX_CHUNK_COUNT
): ChunkTailLayout {
  if (tokens.length === 0) {
    return {
      prefixText: '',
      animatedChunks: [],
      animatedChunkCount: 0,
      lastAnimatedChunkIndex: -1,
      tokenCount: 0,
      visibleTextLength: 0
    }
  }

  const animationStartIndex = Math.max(0, tokens.length - animationWindow)
  const prefixTokens = tokens.slice(0, animationStartIndex)
  const tailTokens = tokens.slice(animationStartIndex)
  const chunkSize = Math.max(1, Math.ceil(tailTokens.length / Math.max(1, maxChunkCount)))
  const animatedChunks: string[] = []

  for (let index = 0; index < tailTokens.length; index += chunkSize) {
    animatedChunks.push(tailTokens.slice(index, index + chunkSize).join(''))
  }

  const lastAnimatedChunkIndex = [...animatedChunks]
    .map((chunk, index) => ({ chunk, index }))
    .reverse()
    .find(({ chunk }) => /\S/.test(chunk))?.index ?? -1

  return {
    prefixText: prefixTokens.join(''),
    animatedChunks,
    animatedChunkCount: lastAnimatedChunkIndex === -1 ? 0 : 1,
    lastAnimatedChunkIndex,
    tokenCount: tokens.length,
    visibleTextLength: tokens.join('').length
  }
}

interface FluidTypewriterChunkTailProps {
  content?: string
  visibleCount?: number
  visibleTokens?: string[]
  animationWindow?: number
  perfSessionId?: string
  perfSegmentId?: string
  perfMode?: AssistantStreamingPerfMode
}

export const FluidTypewriterChunkTail = ({
  content = '',
  visibleCount,
  visibleTokens,
  animationWindow = 15,
  perfSessionId,
  perfSegmentId,
  perfMode = 'lite'
}: FluidTypewriterChunkTailProps) => {
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
    const built = buildChunkTailLayout(visible, animationWindow)
    return {
      ...built,
      chunkBuildMs: performance.now() - t0
    }
  }, [visible, animationWindow])

  const activeSegmentId = perfSegmentId ?? 'unknown'
  const activeSessionId = perfSessionId ?? `assistant-text-segment:${activeSegmentId}:${perfMode}`

  useEffect(() => {
    recordAssistantStreamingTailPerf({
      sessionId: activeSessionId,
      segmentId: activeSegmentId,
      mode: perfMode,
      visibleTextLength: layout.visibleTextLength,
      tokenCount: layout.tokenCount,
      animatedNodeCount: layout.animatedChunkCount,
      tokenizeMs: tokenized.tokenizeMs,
      chunkBuildMs: layout.chunkBuildMs
    })
  }, [
    activeSegmentId,
    activeSessionId,
    layout.animatedChunkCount,
    layout.chunkBuildMs,
    layout.tokenCount,
    layout.visibleTextLength,
    perfMode,
    tokenized.tokenizeMs
  ])

  return (
    <span className="wrap-break-word">
      {layout.prefixText ? <span className="whitespace-pre-wrap">{layout.prefixText}</span> : null}
      {layout.animatedChunks.map((chunk, index) => {
        if (!/\S/.test(chunk)) {
          return <StaticChunk key={index} content={chunk} />
        }

        if (index === layout.lastAnimatedChunkIndex) {
          return <AnimatedChunk key={index} content={chunk} />
        }

        return <StaticChunk key={index} content={chunk} />
      })}
    </span>
  )
}
