import { useEffect, useRef, useState } from 'react'

/**
 * Intersection Observer 选项
 */
interface UseIntersectionObserverOptions {
  /** 交叉阈值，0.0 到 1.0 之间 */
  threshold?: number
  /** 根元素，默认为视口 */
  root?: Element | null
  /** 根元素的边距 */
  rootMargin?: string
  /** 交叉状态变化时的回调 */
  onIntersect?: (isIntersecting: boolean) => void
}

/**
 * 使用 Intersection Observer API 检测元素是否在视口中
 *
 * 相比手动监听 scroll 事件，Intersection Observer 有以下优势：
 * - 浏览器原生优化，性能更好
 * - 自动处理节流，无需手动实现
 * - 代码更简洁，可读性更强
 *
 * @example
 * ```tsx
 * // 检测聊天是否滚动到底部
 * const { targetRef, isIntersecting: isAtBottom } = useIntersectionObserver({
 *   rootMargin: '10px', // 距离底部 10px 就认为在底部
 *   onIntersect: (isIntersecting) => {
 *     if (isIntersecting) {
 *       setShowScrollToBottomButton(false)
 *     }
 *   }
 * })
 *
 * // 在 JSX 中标记底部位置
 * <div ref={scrollContainerRef}>
 *   {messages.map(...)}
 *   <div ref={targetRef} className="h-px" /> // 底部标记
 * </div>
 * ```
 */
export function useIntersectionObserver(
  options: UseIntersectionObserverOptions = {}
): {
  targetRef: React.RefObject<HTMLDivElement>
  isIntersecting: boolean
} {
  const {
    threshold = 0,
    root = null,
    rootMargin = '0px',
    onIntersect
  } = options

  const targetRef = useRef<HTMLDivElement>(null)
  const [isIntersecting, setIsIntersecting] = useState(false)

  useEffect(() => {
    const element = targetRef.current
    if (!element) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        const intersecting = entry.isIntersecting
        setIsIntersecting(intersecting)
        onIntersect?.(intersecting)
      },
      { threshold, root, rootMargin }
    )

    observer.observe(element)

    return () => {
      observer.disconnect()
    }
  }, [threshold, root, rootMargin, onIntersect])

  return {
    targetRef,
    isIntersecting
  }
}
