import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 滚动到底部选项
 */
interface UseScrollToBottomOptions {
  /** 是否启用滚动功能 */
  enabled?: boolean
  /** 是否使用平滑滚动 */
  smooth?: boolean
  /** 滚动开始时的回调 */
  onScrollStart?: () => void
  /** 滚动结束时的回调 */
  onScrollEnd?: () => void
}

/**
 * 滚动到底部返回值
 */
interface UseScrollToBottomReturn {
  /** 滚动到底部函数 */
  scrollToBottom: (smooth?: boolean) => void
  /** 节流滚动函数（用于流式输出） */
  scrollToBottomThrottled: () => void
  /** 是否正在滚动 */
  isScrolling: boolean
  /** 滚动目标元素的 ref */
  targetRef: React.RefObject<HTMLDivElement>
}

/**
 * 统一管理滚动到底部的逻辑
 *
 * @example
 * ```tsx
 * const { scrollToBottom, scrollToBottomThrottled, targetRef } = useScrollToBottom({
 *   onScrollEnd: () => setShowButton(false)
 * })
 *
 * // 在 JSX 中
 * <div ref={targetRef}>
 *   <div id="bottom-marker" />
 * </div>
 *
 * // 使用
 * scrollToBottom(true) // 平滑滚动
 * scrollToBottomThrottled() // 节流滚动
 * ```
 */
export function useScrollToBottom(
  options: UseScrollToBottomOptions = {}
): UseScrollToBottomReturn {
  const {
    enabled = true,
    smooth = false,
    onScrollStart,
    onScrollEnd
  } = options

  const targetRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [isScrolling, setIsScrolling] = useState(false)

  // 缓动函数：easeOutCubic - 快速开始，缓慢结束
  const easeOutCubic = useCallback((t: number): number => {
    return 1 - Math.pow(1 - t, 3)
  }, [])

  // 平滑滚动到底部
  const smoothScrollToBottom = useCallback(() => {
    const container = targetRef.current
    if (!container || !enabled) return

    // 取消之前的滚动动画
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }

    onScrollStart?.()
    setIsScrolling(true)

    const startPos = container.scrollTop
    const getEndPos = () => container.scrollHeight - container.clientHeight
    const initialEndPos = getEndPos()
    const initialDistance = initialEndPos - startPos

    // 如果已经在底部，直接返回
    if (Math.abs(initialDistance) < 1) {
      setIsScrolling(false)
      onScrollEnd?.()
      return
    }

    // 根据滚动距离动态调整动画时长（最小 300ms，最大 800ms）
    const duration = Math.min(Math.max(Math.abs(initialDistance) * 0.5, 300), 800)
    const startTime = performance.now()

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = easeOutCubic(progress)

      // 在每一帧重新计算目标位置，确保滚动到真正的底部
      const currentEndPos = getEndPos()
      const currentDistance = currentEndPos - startPos

      // 使用当前计算的距离和目标位置
      container.scrollTop = startPos + currentDistance * eased

      // 检查是否已经到达底部（允许一些误差）
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
      const isAtBottom = distanceFromBottom < 1

      if (progress < 1 && !isAtBottom) {
        rafRef.current = requestAnimationFrame(animate)
      } else {
        // 确保滚动到真正的底部
        container.scrollTop = currentEndPos
        rafRef.current = 0
        setIsScrolling(false)
        onScrollEnd?.()
      }
    }

    rafRef.current = requestAnimationFrame(animate)
  }, [enabled, easeOutCubic, onScrollStart, onScrollEnd])

  // 核心滚动函数
  const scrollToBottom = useCallback((smoothOverride?: boolean) => {
    if (!enabled || !targetRef.current) return

    const container = targetRef.current
    const shouldSmooth = smoothOverride ?? smooth

    // 关键修改：无论平滑还是立即滚动，都要先取消之前的动画和定时器
    // 这样可以避免滚动冲突导致的"顿一下"现象
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    if (shouldSmooth) {
      smoothScrollToBottom()
    } else {
      // 立即滚动
      onScrollStart?.()
      setIsScrolling(true)
      container.scrollTop = container.scrollHeight - container.clientHeight
      setIsScrolling(false)
      onScrollEnd?.()
    }
  }, [enabled, smooth, smoothScrollToBottom, onScrollStart, onScrollEnd])

  // 节流版本 - 用于流式输出
  const scrollToBottomThrottled = useCallback(() => {
    if (!enabled) return

    // 取消之前的 RAF（如果有）
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }

    // 清除之前的 timeout（如果有）
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    // 100ms 防抖 + RAF
    timeoutRef.current = setTimeout(() => {
      rafRef.current = requestAnimationFrame(() => {
        scrollToBottom(false)
        rafRef.current = 0
      })
      timeoutRef.current = null
    }, 100)
  }, [enabled, scrollToBottom])

  // 清理
  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return {
    scrollToBottom,
    scrollToBottomThrottled,
    isScrolling,
    targetRef
  }
}
