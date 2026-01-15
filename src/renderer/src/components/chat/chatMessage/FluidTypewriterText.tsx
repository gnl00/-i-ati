import { motion } from 'framer-motion'
import { useMemo } from 'react'
import { tokenizeText } from '@renderer/utils/tokenizeText'

/**
 * 单个 Token 的动效组件
 * 实现 Apple Intelligence / Vercel AI SDK 风格的流体渐显效果
 *
 * 动效组合：Blur (模糊) + Fade (渐显) + Slide (上浮)
 */
const AnimatedToken = ({
  children,
  index
}: {
  children: string
  index: number
}) => {
  return (
    <motion.span
      layout="position"
      initial={{
        opacity: 0,
        y: 5,
        filter: 'blur(4px)'
      }}
      animate={{
        opacity: 1,
        y: 0,
        filter: 'blur(0px)'
      }}
      transition={{
        duration: 0.3,
        ease: "easeOut",
        delay: 0.02 // 极短延迟，避免同时渲染太生硬
      }}
      className="inline-block whitespace-pre-wrap"
    >
      {children}
    </motion.span>
  )
}

interface FluidTypewriterTextProps {
  content: string
  visibleCount: number
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
  content,
  visibleCount,
  animationWindow = 20
}: FluidTypewriterTextProps) => {
  // 缓存 tokenize 结果
  const tokens = useMemo(() => tokenizeText(content), [content])

  // 只截取当前可见的部分
  const visibleTokens = tokens.slice(0, visibleCount)

  // 计算动画窗口的起始位置
  const animationStartIndex = Math.max(0, visibleTokens.length - animationWindow)

  return (
    <span className="break-words">
      {visibleTokens.map((token, i) => {
        // 性能优化：只有最后 N 个 token 需要动画
        // 之前的可以直接渲染为普通文本
        if (i < animationStartIndex) {
          return (
            <span key={i} className="whitespace-pre-wrap">
              {token}
            </span>
          )
        }

        return (
          <AnimatedToken key={i} index={i}>
            {token}
          </AnimatedToken>
        )
      })}
    </span>
  )
}
