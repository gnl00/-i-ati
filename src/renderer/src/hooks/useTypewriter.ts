import { useEffect, useRef, useState } from 'react'

interface TypewriterOptions {
  minSpeed?: number // Minimum interval in ms (faster typing)
  maxSpeed?: number // Maximum interval in ms (slower typing)
  enabled?: boolean // Whether typewriter effect is enabled
  onTyping?: () => void // Callback when typing occurs
}

export const useTypewriter = (text: string, options: TypewriterOptions = {}) => {
  const {
    minSpeed = 20,
    maxSpeed = 50,
    enabled = true,
    onTyping
  } = options

  const [displayedText, setDisplayedText] = useState('')
  const queueRef = useRef<string[]>([])
  const animationFrameRef = useRef<number | null>(null)
  const lastUpdateRef = useRef<number>(0)
  const previousTextRef = useRef('')
  const onTypingRef = useRef(onTyping)

  // Keep onTypingRef up to date
  useEffect(() => {
    onTypingRef.current = onTyping
  }, [onTyping])

  useEffect(() => {
    // If disabled, show full text immediately
    if (!enabled) {
      setDisplayedText(text)
      previousTextRef.current = text
      return
    }

    // Handle text updates (streaming)
    if (text !== previousTextRef.current) {
      const newContent = text.slice(previousTextRef.current.length)
      if (newContent) {
        // Add new characters to queue
        const chars = newContent.split('')
        queueRef.current.push(...chars)
      }
      previousTextRef.current = text
    }

    // Animation loop using requestAnimationFrame
    const animate = (timestamp: number) => {
      const queueLength = queueRef.current.length

      if (queueLength === 0) {
        animationFrameRef.current = null
        return
      }

      // Calculate dynamic speed based on queue length
      const speed = queueLength > 100
        ? minSpeed
        : Math.max(minSpeed, Math.min(maxSpeed, maxSpeed - (queueLength / 100) * (maxSpeed - minSpeed)))

      // Check if enough time has passed
      if (timestamp - lastUpdateRef.current >= speed) {
        const char = queueRef.current.shift()
        if (char) {
          setDisplayedText(prev => prev + char)
          // 调用回调通知父组件
          onTypingRef.current?.()
        }
        lastUpdateRef.current = timestamp
      }

      // Continue animation if queue has items
      if (queueRef.current.length > 0) {
        animationFrameRef.current = requestAnimationFrame(animate)
      } else {
        animationFrameRef.current = null
      }
    }

    // Start animation if not already running and queue has items
    if (animationFrameRef.current === null && queueRef.current.length > 0) {
      animationFrameRef.current = requestAnimationFrame(animate)
    }

    // Cleanup on unmount
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
  }, [text, enabled, minSpeed, maxSpeed])

  // Reset when text becomes empty
  useEffect(() => {
    if (!text) {
      setDisplayedText('')
      queueRef.current = []
      previousTextRef.current = ''
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      lastUpdateRef.current = 0
    }
  }, [text])

  return enabled ? displayedText : text
}
