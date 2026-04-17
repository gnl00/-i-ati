import { memo, useEffect, useMemo } from 'react'
import { tokenizeText } from '@renderer/utils/tokenizeText'
import {
  recordAssistantStreamingTailPerf,
  type AssistantStreamingPerfMode
} from './assistantStreamingPerf'
import { useEnterTransition } from './use-enter-transition'

const DEFAULT_LIVE_TOKEN_LIMIT = 4

const AnimatedToken = memo(({ children }: { children: string }) => {
  const entered = useEnterTransition('enter')

  return (
    <span
      className={[
        'inline-block whitespace-pre-wrap',
        'transition-[opacity,transform,filter] duration-200 ease-out',
        'motion-reduce:transition-none motion-reduce:opacity-100 motion-reduce:translate-y-0 motion-reduce:blur-0',
        entered ? 'opacity-100 blur-0' : 'opacity-0 blur-xs'
      ].join(' ')}
    >
      {children}
    </span>
  )
})

const StaticToken = memo(({ children }: { children: string }) => {
  return <span className="whitespace-pre-wrap">{children}</span>
})

export interface FluidTypewriterTextV2Layout {
  visible: string[]
  staticPrefixText: string
  settledTailText: string
  liveAnimatedTokens: string[]
  liveStartIndex: number
}

export function buildFluidTypewriterTextV2Layout(args: {
  tokens: string[]
  visibleTokens?: string[]
  visibleCount?: number
  animationWindow: number
  liveTokenLimit?: number
}): FluidTypewriterTextV2Layout {
  const visible = args.visibleTokens
    ? args.visibleTokens
    : args.visibleCount === undefined
      ? args.tokens
      : args.tokens.slice(0, args.visibleCount)

  const liveTokenLimit = Math.max(1, args.liveTokenLimit ?? DEFAULT_LIVE_TOKEN_LIMIT)
  const tailWindow = Math.max(liveTokenLimit, args.animationWindow)
  const settledStartIndex = Math.max(0, visible.length - tailWindow)
  const liveStartIndex = Math.max(settledStartIndex, visible.length - liveTokenLimit)

  return {
    visible,
    staticPrefixText: visible.slice(0, settledStartIndex).join(''),
    settledTailText: visible.slice(settledStartIndex, liveStartIndex).join(''),
    liveAnimatedTokens: visible.slice(liveStartIndex),
    liveStartIndex
  }
}

interface FluidTypewriterTextV2Props {
  content?: string
  visibleCount?: number
  visibleTokens?: string[]
  animationWindow?: number
  liveTokenLimit?: number
  perfSessionId?: string
  perfSegmentId?: string
  perfMode?: AssistantStreamingPerfMode
}

export const FluidTypewriterTextV2 = ({
  content = '',
  visibleCount,
  visibleTokens,
  animationWindow = 15,
  liveTokenLimit = DEFAULT_LIVE_TOKEN_LIMIT,
  perfSessionId,
  perfSegmentId,
  perfMode = 'lite'
}: FluidTypewriterTextV2Props) => {
  const tokenized = useMemo(() => {
    const t0 = performance.now()
    return {
      tokens: visibleTokens ?? tokenizeText(content),
      tokenizeMs: performance.now() - t0
    }
  }, [content, visibleTokens])

  const layout = useMemo(() => {
    const t0 = performance.now()
    const built = buildFluidTypewriterTextV2Layout({
      tokens: tokenized.tokens,
      visibleTokens,
      visibleCount,
      animationWindow,
      liveTokenLimit
    })

    return {
      ...built,
      chunkBuildMs: performance.now() - t0
    }
  }, [animationWindow, liveTokenLimit, tokenized.tokens, visibleCount, visibleTokens])

  const isWhitespaceToken = (token: string) => /^\s+$/.test(token)
  const activeSegmentId = perfSegmentId ?? 'unknown'
  const activeSessionId = perfSessionId ?? `assistant-text-segment:${activeSegmentId}:${perfMode}`

  useEffect(() => {
    recordAssistantStreamingTailPerf({
      sessionId: activeSessionId,
      segmentId: activeSegmentId,
      mode: perfMode,
      visibleTextLength: layout.visible.join('').length,
      tokenCount: layout.visible.length,
      animatedNodeCount: layout.liveAnimatedTokens.length,
      tokenizeMs: tokenized.tokenizeMs,
      chunkBuildMs: layout.chunkBuildMs
    })
  }, [
    activeSegmentId,
    activeSessionId,
    layout.chunkBuildMs,
    layout.liveAnimatedTokens.length,
    layout.visible,
    perfMode,
    tokenized.tokenizeMs
  ])

  return (
    <span className="wrap-break-word">
      {layout.staticPrefixText ? <span className="whitespace-pre-wrap">{layout.staticPrefixText}</span> : null}
      {layout.settledTailText ? <span className="whitespace-pre-wrap">{layout.settledTailText}</span> : null}
      {layout.liveAnimatedTokens.map((token, index) => {
        const tokenIndex = layout.liveStartIndex + index
        if (isWhitespaceToken(token)) {
          return <StaticToken key={tokenIndex}>{token}</StaticToken>
        }

        return (
          <AnimatedToken key={tokenIndex}>
            {token}
          </AnimatedToken>
        )
      })}
    </span>
  )
}
