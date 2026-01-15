import { motion } from 'framer-motion'
import { memo, useCallback, useMemo } from 'react'
import { tokenizeText } from '@renderer/utils/tokenizeText'

/**
 * 单个 Token 的动效组件
 * 实现 Apple Intelligence / Vercel AI SDK 风格的流体渐显效果
 *
 * 动效组合：Fade (渐显) + Slide (上浮)
 */
const AnimatedToken = memo(({ children }: { children: string }) => {
  return (
    <motion.span
      initial={{
        opacity: 0,
        y: 4
      }}
      animate={{
        opacity: 1,
        y: 0
      }}
      transition={{
        duration: 0.18,
        ease: [0.22, 1, 0.36, 1]
      }}
      className="inline-block whitespace-pre-wrap will-change-transform"
    >
      {children}
    </motion.span>
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
  animationWindow = 12
}: FluidTypewriterTextProps) => {
  // 缓存 tokenize 结果（如已传入 visibleTokens，则跳过分词）
  const tokens = useMemo(() => {
    if (visibleTokens) return visibleTokens
    return tokenizeText(content)
  }, [content, visibleTokens])

  // 只截取当前可见的部分
  const visible = useMemo(() => {
    if (visibleTokens) return visibleTokens
    if (visibleCount === undefined) return tokens
    return tokens.slice(0, visibleCount)
  }, [visibleTokens, visibleCount, tokens])

  // 计算动画窗口的起始位置
  const animationStartIndex = Math.max(0, visible.length - animationWindow)
  const staticText = useMemo(() => {
    if (animationStartIndex === 0) return ''
    return visible.slice(0, animationStartIndex).join('')
  }, [visible, animationStartIndex])
  const animatedTokens = useMemo(() => {
    return visible.slice(animationStartIndex)
  }, [visible, animationStartIndex])
  const isWhitespaceToken = useCallback((token: string) => /^\s+$/.test(token), [])

  return (
    <span className="break-words">
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
