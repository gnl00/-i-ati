import { useCallback, useEffect, useRef, useState } from 'react'

interface SegmentTypewriterOptions {
  minSpeed?: number
  maxSpeed?: number
  enabled?: boolean
  isStreaming?: boolean
  onTyping?: () => void
  onSegmentStart?: (segmentIndex: number) => void
  onSegmentComplete?: (segmentIndex: number) => void
  onAllComplete?: () => void
}

interface UseSegmentTypewriterReturn {
  // 当前正在 typewriter 的 segment 索引
  activeSegmentIndex: number

  // 当前活跃 segment 的显示长度
  currentSegmentOffset: number

  // 辅助函数：获取指定 segment 应该显示的内容长度
  getSegmentVisibleLength: (index: number) => number

  // 辅助函数：判断指定 segment 是否应该渲染
  shouldRenderSegment: (index: number) => boolean

  // 是否所有 segments 都完成了 typewriter
  isAllComplete: boolean
}

/**
 * 基于 Character Queue 的 typewriter hook
 * 核心思想：为每个 text segment 维护独立的字符队列，逐字输出，实现流畅的打字效果。
 *
 * 关键优化：
 * 1. 字符队列机制：每个字符独立入队出队，消除批量步进的跳跃感
 * 2. 动态速度控制：基于队列长度调整速度，长文本快，短文本慢
 * 3. 简化动画循环：使用队列消费替代复杂的 offset 步进逻辑
 *
 * 维护的状态：
 * - activeSegmentIndex: 当前正在处理的 segment 索引
 * - currentSegmentOffset: 当前 segment 已消费的字符数
 * - segmentQueuesRef: 每个 segment 的待显示字符队列
 * - consumedLengthsRef: 每个 segment 的已消费字符数
 * - contentSnapshotsRef: 用于检测内容变化的快照
 */
export const useSegmentTypewriter = (
  segments: MessageSegment[],
  options: SegmentTypewriterOptions = {}
): UseSegmentTypewriterReturn => {
  const {
    minSpeed = 5,
    maxSpeed = 20,
    enabled = true,
    isStreaming = false,
    onTyping,
    onSegmentStart,
    onSegmentComplete,
    onAllComplete
  } = options

  // State
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number>(-1)
  const [currentSegmentOffset, setCurrentSegmentOffset] = useState<number>(0)
  const [isAllComplete, setIsAllComplete] = useState<boolean>(false)

  // Refs
  const animationFrameRef = useRef<number | null>(null)
  const lastUpdateRef = useRef<number>(0)
  const onSegmentStartRef = useRef(onSegmentStart)
  const onSegmentCompleteRef = useRef(onSegmentComplete)
  const onAllCompleteRef = useRef(onAllComplete)
  const onTypingRef = useRef(onTyping)

  // Data Refs (to access fresh data in RAF loop)
  const segmentsRef = useRef(segments)
  const isStreamingRef = useRef(isStreaming)

  // Queue Management Refs (for character-level queue mechanism)
  const segmentQueuesRef = useRef<Map<number, string[]>>(new Map())
  const consumedLengthsRef = useRef<Map<number, number>>(new Map())
  const processedLengthRef = useRef<Map<number, number>>(new Map()) // 记录已经添加到队列的长度
  const completedSegmentsRef = useRef<Set<number>>(new Set()) // 记录已完成的 text segments

  // Keep refs up to date
  useEffect(() => {
    onSegmentStartRef.current = onSegmentStart
    onSegmentCompleteRef.current = onSegmentComplete
    onAllCompleteRef.current = onAllComplete
    onTypingRef.current = onTyping
    segmentsRef.current = segments
    isStreamingRef.current = isStreaming
  }, [onSegmentStart, onSegmentComplete, onAllComplete, onTyping, segments, isStreaming])

  // Queue Management Functions
  // 确保 segment 队列是最新的（增量添加新字符）
  const ensureSegmentQueue = useCallback((segmentIndex: number, content: string) => {
    const consumed = consumedLengthsRef.current.get(segmentIndex) || 0
    const processed = processedLengthRef.current.get(segmentIndex) || 0

    // 计算从上次处理后新增的内容
    const newContent = content.slice(processed)

    if (!newContent) {
      // 没有新内容
      return
    }

    // 将新字符添加到队列
    const chars = newContent.split('')
    const queue = segmentQueuesRef.current.get(segmentIndex) || []
    queue.push(...chars)
    segmentQueuesRef.current.set(segmentIndex, queue)

    // 更新已处理的长度
    processedLengthRef.current.set(segmentIndex, content.length)
  }, [])

  // 消费下一个字符
  const consumeNextChar = useCallback((segmentIndex: number) => {
    const queue = segmentQueuesRef.current.get(segmentIndex)
    if (queue && queue.length > 0) {
      queue.shift()
      const consumed = consumedLengthsRef.current.get(segmentIndex) || 0
      consumedLengthsRef.current.set(segmentIndex, consumed + 1)
      return true
    }
    return false
  }, [])

  // 清理 segment 队列
  const cleanupSegmentQueue = useCallback((segmentIndex: number) => {
    segmentQueuesRef.current.delete(segmentIndex)
    processedLengthRef.current.delete(segmentIndex)
    // consumedLengthsRef 保留，用于判断是否已完成
  }, [])

  // 重置状态
  const resetState = useCallback(() => {
    setActiveSegmentIndex(-1)
    setCurrentSegmentOffset(0)
    setIsAllComplete(false)

    // 清理所有队列管理 Refs
    segmentQueuesRef.current.clear()
    consumedLengthsRef.current.clear()
    processedLengthRef.current.clear()
    completedSegmentsRef.current.clear()

    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
  }, [])

  // Helper Functions
  // 查找下一个待处理的 text segment
  const findNextPendingSegment = useCallback(() => {
    const currentSegments = segmentsRef.current

    for (let i = 0; i < currentSegments.length; i++) {
      const segment = currentSegments[i]
      if (segment.type !== 'text') continue

      const consumed = consumedLengthsRef.current.get(i) || 0
      if (consumed < segment.content.length) {
        return i
      }
    }

    return -1
  }, [])

  // 计算动态速度（复用 useTypewriter 的算法）
  const calculateSpeed = useCallback((queueLength: number) => {
    if (queueLength > 100) return minSpeed
    return Math.max(minSpeed, Math.min(maxSpeed,
      maxSpeed - (queueLength / 100) * (maxSpeed - minSpeed)))
  }, [minSpeed, maxSpeed])

  // 移动到下一个 segment
  const moveToNextSegment = useCallback(() => {
    if (activeSegmentIndex !== -1) {
      cleanupSegmentQueue(activeSegmentIndex)
    }

    const nextIndex = findNextPendingSegment()
    if (nextIndex !== -1) {
      setActiveSegmentIndex(nextIndex)
      onSegmentStartRef.current?.(nextIndex)
    } else {
      setActiveSegmentIndex(-1)
      if (!isStreamingRef.current) {
        setIsAllComplete(true)
        onAllCompleteRef.current?.()
      }
    }
  }, [activeSegmentIndex, findNextPendingSegment, cleanupSegmentQueue])

  // 动画循环
  const animate = useCallback((timestamp: number) => {
    const currentSegments = segmentsRef.current

    // 1. 启动第一个 segment
    if (activeSegmentIndex === -1) {
      const nextIndex = findNextPendingSegment()
      if (nextIndex !== -1) {
        setActiveSegmentIndex(nextIndex)
        onSegmentStartRef.current?.(nextIndex)
      } else if (!isStreamingRef.current) {
        setIsAllComplete(true)
        onAllCompleteRef.current?.()
        return
      }
      animationFrameRef.current = requestAnimationFrame(animate)
      return
    }

    // 2. 验证当前 segment
    const currentSegment = currentSegments[activeSegmentIndex]
    if (!currentSegment || currentSegment.type !== 'text') {
      moveToNextSegment()
      animationFrameRef.current = requestAnimationFrame(animate)
      return
    }

    // 3. 确保队列最新
    ensureSegmentQueue(activeSegmentIndex, currentSegment.content)

    // 4. 计算速度
    const queue = segmentQueuesRef.current.get(activeSegmentIndex)
    const queueLength = queue?.length || 0
    const speed = calculateSpeed(queueLength)

    // 5. 消费字符
    if (timestamp - lastUpdateRef.current >= speed) {
      const charConsumed = consumeNextChar(activeSegmentIndex)

      if (charConsumed) {
        const consumed = consumedLengthsRef.current.get(activeSegmentIndex) || 0
        setCurrentSegmentOffset(consumed)
        onTypingRef.current?.()
        lastUpdateRef.current = timestamp

        // 检查是否刚刚消费了最后一个字符
        if (consumed >= currentSegment.content.length) {
          // 标记为已完成
          completedSegmentsRef.current.add(activeSegmentIndex)
          onSegmentCompleteRef.current?.(activeSegmentIndex)
          moveToNextSegment()
          animationFrameRef.current = requestAnimationFrame(animate)
          return
        }
      } else {
        // 队列为空，检查是否完成
        const consumed = consumedLengthsRef.current.get(activeSegmentIndex) || 0

        if (consumed >= currentSegment.content.length) {
          // 当前 segment 完成，移动到下一个
          completedSegmentsRef.current.add(activeSegmentIndex)
          onSegmentCompleteRef.current?.(activeSegmentIndex)
          moveToNextSegment()
          animationFrameRef.current = requestAnimationFrame(animate)
          return
        }
      }
    }

    // 继续动画循环
    animationFrameRef.current = requestAnimationFrame(animate)
  }, [activeSegmentIndex, minSpeed, maxSpeed, findNextPendingSegment, calculateSpeed, ensureSegmentQueue, consumeNextChar, moveToNextSegment])

  // 启动/停止/重置逻辑
  useEffect(() => {
    if (!enabled) {
      // Disable 时重置状态，或者直接标记为全部完成？
      // 现在的需求是 disabled 时显示全部，所以在组件层处理渲染，
      // 这里只需要保证如果不 enable，就不会跑动画消耗资源。
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      return
    }

    // 如果 enabled 且未完成，开始动画
    if (!isAllComplete && animationFrameRef.current === null) {
      animationFrameRef.current = requestAnimationFrame(animate)
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
  }, [enabled, isAllComplete, animate])


  // 辅助函数
  const getSegmentVisibleLength = useCallback((index: number) => {
    // 如果未启用，或者已经全部完成，显示全长
    if (!enabled || isAllComplete) return Infinity

    const segment = segmentsRef.current[index]
    if (!segment || segment.type !== 'text') {
      // 非 text segments 不需要打字机效果，显示全部
      return Infinity
    }

    // 已完成的 text segments 显示全部
    if (completedSegmentsRef.current.has(index)) return Infinity

    if (index < activeSegmentIndex) return Infinity // 之前的 text segments 都显示全
    if (index > activeSegmentIndex) return 0        // 之后的 text segments 都不显示
    return currentSegmentOffset                     // 当前的显示 offset
  }, [enabled, isAllComplete, activeSegmentIndex, currentSegmentOffset])

  const shouldRenderSegment = useCallback((index: number) => {
    if (!enabled || isAllComplete) return true

    const segment = segmentsRef.current[index]
    if (!segment) return false

    // 非 text segments（reasoning, toolCall）总是立即渲染
    if (segment.type !== 'text') return true

    // text segments 的渲染逻辑
    // 如果已完成，总是显示
    if (completedSegmentsRef.current.has(index)) return true

    // 如果是当前正在处理的，显示
    if (index === activeSegmentIndex) return true

    // 否则不显示
    return false
  }, [enabled, isAllComplete, activeSegmentIndex])

  return {
    activeSegmentIndex,
    currentSegmentOffset,
    getSegmentVisibleLength,
    shouldRenderSegment,
    isAllComplete
  }
}
