import { useCallback, useEffect, useRef, useState } from 'react'
import { tokenizeText } from '@renderer/utils/tokenizeText'

/**
 * ============================================================================
 * Type Definitions
 * ============================================================================
 */

interface SegmentTypewriterOptions {
  minSpeed?: number
  maxSpeed?: number
  enabled?: boolean
  isStreaming?: boolean
  onTyping?: () => void
  onSegmentStart?: (segmentIndex: number) => void
  onSegmentComplete?: (segmentIndex: number) => void
  onAllComplete?: () => void
  // 新增：粒度控制
  granularity?: 'character' | 'token' // 默认 'token'
  // 新增：批量更新间隔（ms）
  batchUpdateInterval?: number // 默认 50ms
}

interface UseSegmentTypewriterReturn {
  activeSegmentIndex: number
  currentSegmentOffset: number
  getSegmentVisibleLength: (index: number) => number
  shouldRenderSegment: (index: number) => boolean
  isAllComplete: boolean
  forceComplete: () => void
  // 新增：获取可见的 tokens（用于动效渲染）
  getVisibleTokens: (index: number) => string[]
}

/**
 * ============================================================================
 * Utility Functions
 * ============================================================================
 */

/**
 * ============================================================================
 * Main Hook
 * ============================================================================
 */

/**
 * 优化版 Segment Typewriter Hook
 *
 * 核心改进：
 * 1. Token 级粒度：从字符升级到单词/Token，消除机械感
 * 2. 批量更新：减少 React 重渲染频率（每 50ms 更新一次状态）
 * 3. 智能速度：改进的自适应速度算法（指数衰减）
 * 4. 视觉支持：返回 tokens 数组供动效组件使用
 *
 * 性能优化：
 * - 使用 RAF 循环，零 React 重渲染（除了批量更新）
 * - Token 缓存机制，避免重复分词
 * - 队列管理，平滑处理流式输入
 */
export const useSegmentTypewriterNext = (
  segments: MessageSegment[],
  options: SegmentTypewriterOptions = {}
): UseSegmentTypewriterReturn => {
  const {
    minSpeed = 30,        // Token 级默认 30ms
    maxSpeed = 80,        // Token 级默认 80ms
    enabled = true,
    isStreaming = false,
    onTyping,
    onSegmentStart,
    onSegmentComplete,
    onAllComplete,
    granularity = 'token',
    batchUpdateInterval = 50
  } = options

  // State
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number>(-1)
  const [currentSegmentOffset, setCurrentSegmentOffset] = useState<number>(0)
  const [isAllComplete, setIsAllComplete] = useState<boolean>(false)

  // Refs
  const animationFrameRef = useRef<number | null>(null)
  const lastUpdateRef = useRef<number>(0)
  const lastStateUpdateRef = useRef<number>(0) // 用于批量更新
  const lastRenderedOffsetRef = useRef<number>(0)
  const onSegmentStartRef = useRef(onSegmentStart)
  const onSegmentCompleteRef = useRef(onSegmentComplete)
  const onAllCompleteRef = useRef(onAllComplete)
  const onTypingRef = useRef(onTyping)

  // Data Refs
  const segmentsRef = useRef(segments)
  const isStreamingRef = useRef(isStreaming)

  // Queue Management Refs
  // 注意：现在队列存储的是 tokens 而不是 characters
  const segmentQueuesRef = useRef<Map<string, string[]>>(new Map())
  const consumedLengthsRef = useRef<Map<string, number>>(new Map())
  const processedLengthRef = useRef<Map<string, number>>(new Map())
  const completedSegmentsRef = useRef<Set<string>>(new Set())

  // 新增：缓存每个 segment 的 tokenized 结果
  const tokenCacheRef = useRef<Map<string, string[]>>(new Map())
  const lastLoggedTokenCountRef = useRef<Map<string, number>>(new Map())
  const segmentContentSnapshotRef = useRef<Map<string, string>>(new Map())

  const activeSegmentKeyRef = useRef<string | null>(null)

  // Keep refs up to date
  useEffect(() => {
    onSegmentStartRef.current = onSegmentStart
    onSegmentCompleteRef.current = onSegmentComplete
    onAllCompleteRef.current = onAllComplete
    onTypingRef.current = onTyping
    segmentsRef.current = segments
    isStreamingRef.current = isStreaming
  }, [onSegmentStart, onSegmentComplete, onAllComplete, onTyping, segments, isStreaming])

  /**
   * ============================================================================
   * Queue Management Functions
   * ============================================================================
   */

  // 分词函数（根据粒度选择）
  const splitContent = useCallback((content: string): string[] => {
    if (granularity === 'character') {
      return Array.from(content)
    }
    return tokenizeText(content)
  }, [granularity])

  const getSegmentKey = useCallback((segment: MessageSegment, index: number): string => {
    if (segment.type === 'toolCall' && segment.toolCallId) {
      return `tool-${segment.toolCallId}`
    }
    if (segment.type === 'error' && segment.error?.timestamp) {
      return `error-${segment.error.timestamp}`
    }
    const timestamp = (segment as { timestamp?: number }).timestamp
    if (timestamp) {
      return `${segment.type}-${timestamp}`
    }
    return `${segment.type}-${index}`
  }, [])

  const findSegmentIndexByKey = useCallback((key: string): number => {
    const currentSegments = segmentsRef.current
    for (let i = 0; i < currentSegments.length; i++) {
      if (getSegmentKey(currentSegments[i], i) === key) {
        return i
      }
    }
    return -1
  }, [getSegmentKey])

  // 确保 segment 队列是最新的（增量添加新 tokens）
  const ensureSegmentQueue = useCallback((segmentKey: string, content: string) => {
    const processed = processedLengthRef.current.get(segmentKey) || 0

    // 获取新增的原始文本
    const newRawContent = content.slice(processed)
    if (!newRawContent) return

    // 使用 splitContent 进行分词
    const queue = segmentQueuesRef.current.get(segmentKey) || []
    queue.push(...splitContent(newRawContent))
    segmentQueuesRef.current.set(segmentKey, queue)

    // 更新已处理的原始字符串长度
    processedLengthRef.current.set(segmentKey, content.length)

    // 更新 token 缓存
    const allTokens = splitContent(content)
    tokenCacheRef.current.set(segmentKey, allTokens)
  }, [splitContent])

  useEffect(() => {
    segments.forEach((segment, segmentIndex) => {
      if (segment.type !== 'text') return

      const segmentKey = getSegmentKey(segment, segmentIndex)
      const previousContent = segmentContentSnapshotRef.current.get(segmentKey)
      if (previousContent === segment.content) return
      segmentContentSnapshotRef.current.set(segmentKey, segment.content)

      const tokens = splitContent(segment.content)
      tokenCacheRef.current.set(segmentKey, tokens)

      const lastLoggedCount = lastLoggedTokenCountRef.current.get(segmentKey) || 0
      if (tokens.length > lastLoggedCount) {
        // console.log('[TypewriterTokens]', { segmentIndex, tokens: tokens.slice(lastLoggedCount) })
        lastLoggedTokenCountRef.current.set(segmentKey, tokens.length)
      }
    })
  }, [segments, splitContent, getSegmentKey])

  // 消费下一个 token
  const consumeNextToken = useCallback((segmentKey: string) => {
    const queue = segmentQueuesRef.current.get(segmentKey)
    if (queue && queue.length > 0) {
      queue.shift()
      const consumed = consumedLengthsRef.current.get(segmentKey) || 0
      consumedLengthsRef.current.set(segmentKey, consumed + 1)
      return true
    }
    return false
  }, [])

  // 清理 segment 队列
  const cleanupSegmentQueue = useCallback((segmentKey: string) => {
    segmentQueuesRef.current.delete(segmentKey)
    processedLengthRef.current.delete(segmentKey)
    tokenCacheRef.current.delete(segmentKey)
  }, [])

  const getLastTextSegmentIndex = useCallback(() => {
    const currentSegments = segmentsRef.current
    for (let i = currentSegments.length - 1; i >= 0; i--) {
      if (currentSegments[i]?.type === 'text') return i
    }
    return -1
  }, [])

  const shouldCompleteSegment = useCallback((segmentIndex: number) => {
    if (!isStreamingRef.current) return true
    const lastTextIndex = getLastTextSegmentIndex()
    return lastTextIndex === -1 || segmentIndex !== lastTextIndex
  }, [getLastTextSegmentIndex])

  /**
   * ============================================================================
   * Speed & Control Functions
   * ============================================================================
   */

  // 改进的速度算法 - 指数衰减 + 自适应加速
  const calculateSpeed = useCallback((queueLength: number) => {
    // 基础速度
    const baseSpeed = maxSpeed

    // 当队列积压时，指数加速
    // queueLength = 0-10: 慢速 (maxSpeed)
    // queueLength = 10-50: 中速 (线性加速)
    // queueLength > 50: 快速 (minSpeed)
    if (queueLength <= 10) {
      return baseSpeed
    } else if (queueLength <= 50) {
      // 线性加速
      const factor = (queueLength - 10) / 40 // 0 to 1
      return baseSpeed - factor * (baseSpeed - minSpeed) * 0.5
    } else {
      // 最大加速
      return minSpeed
    }
  }, [minSpeed, maxSpeed])

  // 查找下一个待处理的 text segment
  const findNextPendingSegment = useCallback(() => {
    const currentSegments = segmentsRef.current

    for (let i = 0; i < currentSegments.length; i++) {
      const segment = currentSegments[i]
      if (segment.type !== 'text') continue

      const segmentKey = getSegmentKey(segment, i)
      const consumed = consumedLengthsRef.current.get(segmentKey) || 0
      const tokens = tokenCacheRef.current.get(segmentKey) || splitContent(segment.content)

      if (consumed < tokens.length) {
        return getSegmentKey(segment, i)
      }
    }

    return null
  }, [splitContent, getSegmentKey])

  // 强制完成打字机效果
  const forceComplete = useCallback(() => {
    setIsAllComplete(true)

    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    onAllCompleteRef.current?.()
  }, [])

  // 移动到下一个 segment
  const moveToNextSegment = useCallback(() => {
    const currentKey = activeSegmentKeyRef.current
    if (currentKey) {
      cleanupSegmentQueue(currentKey)
    }

    const nextKey = findNextPendingSegment()
    if (nextKey) {
      activeSegmentKeyRef.current = nextKey
      const nextIndex = findSegmentIndexByKey(nextKey)
      setActiveSegmentIndex(nextIndex)
      setCurrentSegmentOffset(0)
      lastRenderedOffsetRef.current = 0
      if (nextIndex !== -1) {
        onSegmentStartRef.current?.(nextIndex)
      }
    } else {
      setActiveSegmentIndex(-1)
      activeSegmentKeyRef.current = null
      if (!isStreamingRef.current) {
        setIsAllComplete(true)
        onAllCompleteRef.current?.()
      }
    }
  }, [findNextPendingSegment, cleanupSegmentQueue, findSegmentIndexByKey])

  /**
   * ============================================================================
   * Animation Loop
   * ============================================================================
   */

  // 动画循环 - 核心逻辑
  const animate = useCallback((timestamp: number) => {
    const currentSegments = segmentsRef.current

    // 1. 启动第一个 segment
    if (!activeSegmentKeyRef.current) {
      const nextKey = findNextPendingSegment()
      if (nextKey) {
        activeSegmentKeyRef.current = nextKey
        const nextIndex = findSegmentIndexByKey(nextKey)
        setActiveSegmentIndex(nextIndex)
        if (nextIndex !== -1) {
          onSegmentStartRef.current?.(nextIndex)
        }
      } else if (!isStreamingRef.current) {
        setIsAllComplete(true)
        onAllCompleteRef.current?.()
        return
      }
      animationFrameRef.current = requestAnimationFrame(animate)
      return
    }

    // 2. 验证当前 segment
    const currentKey = activeSegmentKeyRef.current
    if (!currentKey) {
      moveToNextSegment()
      animationFrameRef.current = requestAnimationFrame(animate)
      return
    }

    const currentIndex = findSegmentIndexByKey(currentKey)
    if (currentIndex === -1) {
      moveToNextSegment()
      animationFrameRef.current = requestAnimationFrame(animate)
      return
    }

    const currentSegment = currentSegments[currentIndex]
    if (!currentSegment || currentSegment.type !== 'text') {
      moveToNextSegment()
      animationFrameRef.current = requestAnimationFrame(animate)
      return
    }

    // 3. 确保队列最新
    const resolvedKey = getSegmentKey(currentSegment, currentIndex)
    if (resolvedKey !== currentKey) {
      activeSegmentKeyRef.current = resolvedKey
    }
    ensureSegmentQueue(currentKey, currentSegment.content)

    // 4. 计算速度
    const queue = segmentQueuesRef.current.get(currentKey)
    const queueLength = queue?.length || 0
    const speed = calculateSpeed(queueLength)

    // 5. 消费 token
    if (timestamp - lastUpdateRef.current >= speed) {
      const tokenConsumed = consumeNextToken(currentKey)

      if (tokenConsumed) {
        const consumed = consumedLengthsRef.current.get(currentKey) || 0

        // 批量更新优化：不是每个 token 都更新状态
        const shouldUpdateState = timestamp - lastStateUpdateRef.current >= batchUpdateInterval

        if (shouldUpdateState) {
          setCurrentSegmentOffset(consumed)
          lastRenderedOffsetRef.current = consumed
          lastStateUpdateRef.current = timestamp
          onTypingRef.current?.()
        }

        lastUpdateRef.current = timestamp

        // 获取 token 总数
        const tokens = tokenCacheRef.current.get(currentKey)
        const totalTokens = tokens?.length || 0

        // 检查是否完成
        if (consumed >= totalTokens) {
          if (lastRenderedOffsetRef.current !== consumed) {
            setCurrentSegmentOffset(consumed)
            lastRenderedOffsetRef.current = consumed
            onTypingRef.current?.()
          }
        if (shouldCompleteSegment(currentIndex)) {
          completedSegmentsRef.current.add(currentKey)
          onSegmentCompleteRef.current?.(currentIndex)
          moveToNextSegment()
        }
          animationFrameRef.current = requestAnimationFrame(animate)
          return
        }
      } else {
        // 队列为空，检查是否完成
        const consumed = consumedLengthsRef.current.get(currentKey) || 0
        const tokens = tokenCacheRef.current.get(currentKey)
        const totalTokens = tokens?.length || 0

        if (consumed >= totalTokens) {
          if (lastRenderedOffsetRef.current !== consumed) {
            setCurrentSegmentOffset(consumed)
            lastRenderedOffsetRef.current = consumed
            onTypingRef.current?.()
          }
          if (shouldCompleteSegment(currentIndex)) {
            completedSegmentsRef.current.add(currentKey)
            onSegmentCompleteRef.current?.(currentIndex)
            moveToNextSegment()
          }
          animationFrameRef.current = requestAnimationFrame(animate)
          return
        }
      }
    }

    // 继续动画循环
    animationFrameRef.current = requestAnimationFrame(animate)
  }, [
    activeSegmentIndex,
    findNextPendingSegment,
    calculateSpeed,
    ensureSegmentQueue,
    consumeNextToken,
    moveToNextSegment,
    batchUpdateInterval,
    shouldCompleteSegment,
    getSegmentKey,
    findSegmentIndexByKey
  ])

  useEffect(() => {
    const activeKey = activeSegmentKeyRef.current
    if (!activeKey) {
      if (activeSegmentIndex !== -1) {
        setActiveSegmentIndex(-1)
      }
      return
    }
    const nextIndex = findSegmentIndexByKey(activeKey)
    if (nextIndex !== -1 && nextIndex !== activeSegmentIndex) {
      setActiveSegmentIndex(nextIndex)
    }
  }, [segments, activeSegmentIndex, findSegmentIndexByKey])

  /**
   * ============================================================================
   * Lifecycle & Helper Functions
   * ============================================================================
   */

  // 启动/停止逻辑
  useEffect(() => {
    if (!enabled) {
      if (activeSegmentIndex === -1 && animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      return
    }

    if (!isAllComplete && animationFrameRef.current === null) {
      animationFrameRef.current = requestAnimationFrame(animate)
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
  }, [enabled, isAllComplete, animate, activeSegmentIndex])

  // 辅助函数：获取指定 segment 应该显示的内容长度
  const getSegmentVisibleLength = useCallback((index: number) => {
    if (!enabled || isAllComplete) return Infinity

    const segment = segmentsRef.current[index]
    if (!segment || segment.type !== 'text') {
      return Infinity
    }

    const segmentKey = getSegmentKey(segment, index)
    if (completedSegmentsRef.current.has(segmentKey)) return Infinity

    if (segmentKey === activeSegmentKeyRef.current) {
      return currentSegmentOffset
    }

    const tokens = tokenCacheRef.current.get(segmentKey) || splitContent(segment.content)
    const consumed = consumedLengthsRef.current.get(segmentKey) || 0
    if (consumed >= tokens.length) {
      return Infinity
    }
    return 0
  }, [enabled, isAllComplete, currentSegmentOffset, getSegmentKey, splitContent])

  // 辅助函数：判断指定 segment 是否应该渲染
  const shouldRenderSegment = useCallback((index: number) => {
    if (!enabled || isAllComplete) return true

    const segment = segmentsRef.current[index]
    if (!segment) return false

    if (segment.type !== 'text') return true

    const segmentKey = getSegmentKey(segment, index)
    if (completedSegmentsRef.current.has(segmentKey)) return true

    if (segmentKey === activeSegmentKeyRef.current) return true

    const tokens = tokenCacheRef.current.get(segmentKey) || splitContent(segment.content)
    const consumed = consumedLengthsRef.current.get(segmentKey) || 0
    if (consumed >= tokens.length) return true

    return false
  }, [enabled, isAllComplete, getSegmentKey, splitContent])

  // 新增：获取可见的 tokens（用于动效渲染）
  const getVisibleTokens = useCallback((index: number) => {
    const segment = segmentsRef.current[index]
    if (!segment || segment.type !== 'text') return []

    const segmentKey = getSegmentKey(segment, index)
    const tokens = tokenCacheRef.current.get(segmentKey) || splitContent(segment.content)
    const visibleLength = getSegmentVisibleLength(index)

    if (visibleLength === Infinity) {
      return tokens
    }

    return tokens.slice(0, visibleLength)
  }, [getSegmentVisibleLength, splitContent, getSegmentKey])

  return {
    activeSegmentIndex,
    currentSegmentOffset,
    getSegmentVisibleLength,
    shouldRenderSegment,
    isAllComplete,
    forceComplete,
    getVisibleTokens
  }
}
