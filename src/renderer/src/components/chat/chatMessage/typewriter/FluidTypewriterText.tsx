import { memo, useCallback, useEffect, useMemo } from 'react'
import { tokenizeText } from '@renderer/utils/tokenizeText'
import {
  recordAssistantStreamingTailPerf,
  type AssistantStreamingPerfMode
} from './assistantStreamingPerf'
import { useEnterTransition } from './use-enter-transition'

/**
 * 单个 Token 的动效组件
 * 实现 Apple Intelligence / Vercel AI SDK 风格的流体渐显效果
 *
 * 动效组合：Fade (渐显) + Slide (上浮)
 */
const AnimatedToken = memo(({ children }: { children: string }) => {
  const entered = useEnterTransition('enter')
  return (
    <span
      className={[
        "inline-block whitespace-pre-wrap",
        "transition-[opacity,transform,filter] duration-200 ease-out",
        "motion-reduce:transition-none motion-reduce:opacity-100 motion-reduce:translate-y-0 motion-reduce:blur-0",
        entered ? "opacity-100 blur-0" : "opacity-0 blur-xs"
      ].join(' ')}
    >
      {children}
    </span>
  )
})

const StaticToken = memo(({ children }: { children: string }) => {
  return <span className="whitespace-pre-wrap">{children}</span>
})

interface FluidTypewriterTextProps {
  content?: string
  visibleCount?: number
  visibleTokens?: string[]
  // 性能优化：只对最后 N 个 token 应用动画
  animationWindow?: number
  perfSessionId?: string
  perfSegmentId?: string
  perfMode?: AssistantStreamingPerfMode
}

/**
 * 流体打字机文本渲染组件
 *
 * 性能优化策略：
 * - 只对最后 N 个 token 应用动画（默认 20）
 * - 已完成的 token 固化为普通 span，减少 DOM 节点和动画开销
 * - 使用 useMemo 缓存 tokenize 结果
 */
export const FluidTypewriterText = ({
  content = '',
  visibleCount,
  visibleTokens,
  animationWindow = 15,
  perfSessionId,
  perfSegmentId,
  perfMode = 'lite'
}: FluidTypewriterTextProps) => {
  // 缓存 tokenize 结果（如已传入 visibleTokens，则跳过分词）
  const tokenized = useMemo(() => {
    const t0 = performance.now()
    return {
      tokens: visibleTokens ?? tokenizeText(content),
      tokenizeMs: performance.now() - t0
    }
  }, [content, visibleTokens])
  const tokens = tokenized.tokens
  const tokenizeMs = tokenized.tokenizeMs

  // 只截取当前可见的部分
  const layout = useMemo(() => {
    const t0 = performance.now()
    const visible = visibleTokens
      ? visibleTokens
      : visibleCount === undefined
        ? tokens
        : tokens.slice(0, visibleCount)
    const animationStartIndex = Math.max(0, visible.length - animationWindow)
    return {
      visible,
      animationStartIndex,
      staticText: animationStartIndex === 0 ? '' : visible.slice(0, animationStartIndex).join(''),
      animatedTokens: visible.slice(animationStartIndex),
      chunkBuildMs: performance.now() - t0
    }
  }, [visibleTokens, visibleCount, tokens, animationWindow])
  const visible = layout.visible
  const animationStartIndex = layout.animationStartIndex
  const staticText = layout.staticText
  const animatedTokens = layout.animatedTokens
  const chunkBuildMs = layout.chunkBuildMs
  const isWhitespaceToken = useCallback((token: string) => /^\s+$/.test(token), [])
  const activeSegmentId = perfSegmentId ?? 'unknown'
  const activeSessionId = perfSessionId ?? `assistant-text-segment:${activeSegmentId}:${perfMode}`

  useEffect(() => {
    recordAssistantStreamingTailPerf({
      sessionId: activeSessionId,
      segmentId: activeSegmentId,
      mode: perfMode,
      visibleTextLength: visible.join('').length,
      tokenCount: visible.length,
      animatedNodeCount: animatedTokens.length,
      tokenizeMs,
      chunkBuildMs
    })
  }, [activeSegmentId, activeSessionId, animatedTokens.length, chunkBuildMs, perfMode, tokenizeMs, visible])

  return (
    <span className="wrap-break-word">
      {staticText ? <span className="whitespace-pre-wrap">{staticText}</span> : null}
      {animatedTokens.map((token, i) => {
        const tokenIndex = animationStartIndex + i
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
