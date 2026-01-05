import { useCallback, useEffect, useRef, useState } from 'react'

interface SegmentTypewriterOptions {
  minSpeed?: number
  maxSpeed?: number
  enabled?: boolean
  onSegmentStart?: (segmentIndex: number) => void
  onSegmentComplete?: (segmentIndex: number) => void
  onAllComplete?: () => void
}

interface UseSegmentTypewriterReturn {
  // 已显示的 segments（包括完整的和部分 typewriter 的）
  displayedSegments: MessageSegment[]

  // 当前正在 typewriter 的 text segment 索引（-1 表示无）
  activeTextIndex: number

  // 当前活跃 text segment 的显示文本（ typewriter 进度）
  displayedText: string

  // 已完成的 text segment 索引集合
  completedTextIndices: Set<number>

  // 是否所有 text segments 都完成
  isAllComplete: boolean
}

/**
 * 基于 segments 的 typewriter hook
 * 单一活跃 text segment：只有一个 text segment 在进行 typewriter
 * 已完成的 text segments：立即显示完整内容
 * 未完成的 text segments：不显示，等待 typewriter 到达
 * 自动切换：完成一个 text segment 后，自动开始下一个
 */
export const useSegmentTypewriter = (
  segments: MessageSegment[],
  options: SegmentTypewriterOptions = {}
): UseSegmentTypewriterReturn => {
  const {
    minSpeed = 5,
    maxSpeed = 20,
    enabled = true,
    onSegmentStart,
    onSegmentComplete,
    onAllComplete
  } = options

  // 状态
  const [displayedSegments, setDisplayedSegments] = useState<MessageSegment[]>([])
  const [activeTextIndex, setActiveTextIndex] = useState<number>(-1)
  const [displayedText, setDisplayedText] = useState<string>('')
  const [completedTextIndices, setCompletedTextIndices] = useState<Set<number>>(new Set())
  const [isAllComplete, setIsAllComplete] = useState<boolean>(false)

  // Refs
  const queueRef = useRef<string[]>([])
  const animationFrameRef = useRef<number | null>(null)
  const lastUpdateRef = useRef<number>(0)
  const previousTextRef = useRef<string>('')
  const pendingTextSegmentsRef = useRef<number[]>([]) // 未完成的 text segment 索引队列
  const displayedTextLengthRef = useRef<number>(0) // 当前显示文本的长度
  const onSegmentStartRef = useRef(onSegmentStart)
  const onSegmentCompleteRef = useRef(onSegmentComplete)
  const onAllCompleteRef = useRef(onAllComplete)

  // Keep refs up to date
  useEffect(() => {
    onSegmentStartRef.current = onSegmentStart
    onSegmentCompleteRef.current = onSegmentComplete
    onAllCompleteRef.current = onAllComplete
  }, [onSegmentStart, onSegmentComplete, onAllComplete])

  // 重置状态
  const resetState = useCallback(() => {
    console.log('[DEBUG-HOOK] resetState called')
    setDisplayedSegments([])
    setActiveTextIndex(-1)
    setDisplayedText('')
    setCompletedTextIndices(new Set())
    setIsAllComplete(false)
    queueRef.current = []
    pendingTextSegmentsRef.current = []
    previousTextRef.current = ''
    lastUpdateRef.current = 0
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    console.log('[DEBUG-HOOK] resetState completed')
  }, [])

  // 开始一个 text segment 的 typewriter
  const startTypewriterForSegment = useCallback((segment: TextSegment, index: number, forceRestart: boolean = false) => {
    console.log(`[DEBUG-HOOK] startTypewriterForSegment called for segment ${index}:`, segment.content)
    console.log(`[DEBUG-HOOK] Current animationFrameRef:`, animationFrameRef.current)
    console.log(`[DEBUG-HOOK] Force restart:`, forceRestart)

    // 如果不是强制重启，且当前已有活跃 segment，则只处理流式更新
    if (!forceRestart && activeTextIndex === index && queueRef.current.length > 0) {
      console.log(`[DEBUG-HOOK] Segment ${index} already active, skipping restart`)
      return
    }

    // 初始化队列
    queueRef.current = segment.content.split('')

    // 如果是强制重启，清空之前的状态
    if (forceRestart) {
      previousTextRef.current = ''
      displayedTextLengthRef.current = 0
      setDisplayedText('')
    } else {
      // 如果是首次启动，previousTextRef 应该匹配当前 displayedText 的长度
      const currentDisplayedLength = displayedTextLengthRef.current
      previousTextRef.current = segment.content.slice(0, currentDisplayedLength)
      console.log(`[DEBUG-HOOK] Preserving previous text length:`, previousTextRef.current.length)
    }

    setActiveTextIndex(index)

    console.log(`[DEBUG-HOOK] Initialized:`, {
      queueLength: queueRef.current.length,
      activeTextIndex: index,
      displayedTextLength: displayedTextLengthRef.current,
      previousTextLength: previousTextRef.current.length
    })

    // 通知开始
    onSegmentStartRef.current?.(index)

    // 开始动画
    if (animationFrameRef.current === null) {
      console.log(`[DEBUG-HOOK] Starting animation frame`)
      animationFrameRef.current = requestAnimationFrame(animate)
    } else {
      console.log(`[DEBUG-HOOK] Animation already running, skipping`)
    }
  }, [activeTextIndex, animate])

  // 动画函数 - 重构以避免循环依赖
  const animate = useCallback((timestamp: number) => {
    console.log(`[DEBUG-HOOK] animate called, queue length:`, queueRef.current.length)
    // 动态速度计算：队列长时快，队列短时慢
    const queueLength = queueRef.current.length
    const speed = queueLength > 100
      ? minSpeed
      : Math.max(minSpeed, Math.min(maxSpeed, maxSpeed - (queueLength / 100) * (maxSpeed - minSpeed)))

    if (timestamp - lastUpdateRef.current >= speed) {
      const char = queueRef.current.shift()
      if (char !== undefined) {
        console.log(`[DEBUG-HOOK] Animating char:`, char)
        setDisplayedText(prev => {
          const newText = prev + char
          console.log(`[DEBUG-HOOK] New displayedText:`, newText)
          return newText
        })
      }
      lastUpdateRef.current = timestamp
    }

    // 检查是否完成当前 segment
    if (queueRef.current.length === 0) {
      // 标记当前 segment 为完成
      setCompletedTextIndices(prev => {
        const newSet = new Set([...prev, activeTextIndex])

        // 查找下一个待处理的 text segment
        const nextIndex = pendingTextSegmentsRef.current.shift()

        if (nextIndex !== undefined) {
          // 开始下一个 segment
          const nextSegment = segments[nextIndex] as TextSegment
          if (nextSegment) {
            // 初始化下一个 segment
            queueRef.current = nextSegment.content.split('')
            previousTextRef.current = ''  // 初始化为空字符串
            setDisplayedText('')
            setActiveTextIndex(nextIndex)
            onSegmentStartRef.current?.(nextIndex)

            // 继续动画
            animationFrameRef.current = requestAnimationFrame(animate)
          }
        } else {
          // 所有 text segments 完成
          setActiveTextIndex(-1)
          setIsAllComplete(true)
          onAllCompleteRef.current?.()
          animationFrameRef.current = null
        }

        return newSet
      })
    } else {
      // 继续动画
      animationFrameRef.current = requestAnimationFrame(animate)
    }
  }, [minSpeed, maxSpeed, segments])

  // 初始化和更新逻辑
  useEffect(() => {
    console.log('[DEBUG-HOOK] segments changed:', {
      segmentsCount: segments?.length || 0,
      enabled,
      currentActiveIndex: activeTextIndex
    })

    if (!enabled || !segments || segments.length === 0) {
      console.log('[DEBUG-HOOK] Early return: enabled=', enabled, 'segments=', segments?.length)
      resetState()
      return
    }

    console.log('[DEBUG-HOOK] Initializing typewriter with segments:', segments)

    // 检查是否已经有活跃的 segment，且是同一个
    const hasActiveSegment = activeTextIndex !== -1
    const activeSegmentExists = hasActiveSegment && segments[activeTextIndex] && segments[activeTextIndex].type === 'text'

    if (hasActiveSegment && activeSegmentExists) {
      // 已经有活跃的 segment，检查是否需要处理流式更新
      console.log('[DEBUG-HOOK] Active segment exists, will handle stream updates separately')
      return
    }

    console.log('[DEBUG-HOOK] Processing segments for initialization...')
    // 遍历 segments，分类处理
    const newDisplayedSegments: MessageSegment[] = []
    const pendingTextIndices: number[] = []

    segments.forEach((segment, index) => {
      console.log(`[DEBUG-HOOK] Processing segment ${index}:`, segment.type)
      if (segment.type === 'text') {
        // text segment
        const textSegment = segment as TextSegment
        // 检查是否已完成（这里简化处理，实际应该从状态中获取）
        if (textSegment.content && textSegment.content.length > 0) {
          pendingTextIndices.push(index)
          console.log(`[DEBUG-HOOK] Added text segment ${index} to pending queue:`, textSegment.content)
        }
      } else {
        // toolCall/reasoning: 立即加入 displayedSegments
        newDisplayedSegments.push(segment)
        console.log(`[DEBUG-HOOK] Added ${segment.type} segment to displayedSegments`)
      }
    })

    console.log('[DEBUG-HOOK] Pending text indices:', pendingTextIndices)
    // 存储待处理的 text segment 索引
    pendingTextSegmentsRef.current = pendingTextIndices

    // 如果有待处理的 text segments，开始第一个
    if (pendingTextIndices.length > 0) {
      const firstIndex = pendingTextIndices[0]
      const firstSegment = segments[firstIndex] as TextSegment
      console.log(`[DEBUG-HOOK] Starting with first segment ${firstIndex}`)
      startTypewriterForSegment(firstSegment, firstIndex, true) // 强制重启

      // 注意：text segment 不会立即加入 displayedSegments
      // 它会在 typewriter 过程中通过 displayedText 显示
    } else {
      // 所有 text segments 都已完成或为空
      console.log('[DEBUG-HOOK] No pending text segments, showing all')
      setDisplayedSegments([...segments])
      setIsAllComplete(true)
    }

    // 更新 displayedSegments（只包含 toolCall/reasoning）
    // text segments 通过 displayedText 单独显示
    console.log('[DEBUG-HOOK] Set displayedSegments:', newDisplayedSegments)
    setDisplayedSegments([...newDisplayedSegments])

    // Cleanup function
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
  }, [segments, enabled, resetState, startTypewriterForSegment])

  // 处理流式更新的内容
  useEffect(() => {
    if (activeTextIndex === -1) return

    const currentSegment = segments[activeTextIndex] as TextSegment
    if (!currentSegment || currentSegment.type !== 'text') return

    const currentText = currentSegment.content
    const previousText = previousTextRef.current

    console.log(`[DEBUG-HOOK] Stream update for segment ${activeTextIndex}:`, {
      currentLength: currentText.length,
      previousLength: previousText.length,
      currentText: currentText.substring(0, 50)
    })

    if (currentText !== previousText) {
      // 计算新内容（当前文本减去之前已处理的长度）
      const newContent = currentText.slice(previousText.length)
      console.log(`[DEBUG-HOOK] New content to append:`, newContent)

      if (newContent) {
        // 追加到队列
        queueRef.current.push(...newContent.split(''))
        previousTextRef.current = currentText

        console.log(`[DEBUG-HOOK] Queue updated, new length:`, queueRef.current.length)

        // 如果动画已停止，重新开始
        if (animationFrameRef.current === null) {
          console.log(`[DEBUG-HOOK] Restarting animation for stream update`)
          animationFrameRef.current = requestAnimationFrame((timestamp) => {
            animate(timestamp)
          })
        }
      }
    }
  }, [segments, activeTextIndex, displayedText])

  return {
    displayedSegments,
    activeTextIndex,
    displayedText,
    completedTextIndices,
    isAllComplete
  }
}
