import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

export type CopyActionResult = void | false
export type CopyActionHandler = () => CopyActionResult | Promise<CopyActionResult>

interface UseCopyFeedbackOptions {
  resetAfterMs?: number
  resetKey?: unknown
  onError?: (error: unknown) => void
}

interface UseCopyFeedbackResult {
  copied: boolean
  successCount: number
  triggerCopy: () => Promise<void>
}

export const useCopyFeedback = (
  onCopy: CopyActionHandler,
  {
    resetAfterMs = 1200,
    resetKey,
    onError
  }: UseCopyFeedbackOptions = {}
): UseCopyFeedbackResult => {
  const [copied, setCopied] = useState(false)
  const [successCount, setSuccessCount] = useState(0)
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)
  const attemptRef = useRef(0)
  const previousResetKeyRef = useRef(resetKey)

  const clearResetTimer = useCallback((): void => {
    if (resetTimerRef.current !== null) {
      clearTimeout(resetTimerRef.current)
      resetTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true

    return (): void => {
      mountedRef.current = false
      clearResetTimer()
    }
  }, [clearResetTimer])

  useLayoutEffect(() => {
    if (Object.is(previousResetKeyRef.current, resetKey)) return

    previousResetKeyRef.current = resetKey
    attemptRef.current += 1
    clearResetTimer()
    setCopied(false)
  }, [clearResetTimer, resetKey])

  const triggerCopy = useCallback(async (): Promise<void> => {
    const attempt = ++attemptRef.current

    try {
      const result = await onCopy()
      if (!mountedRef.current || attempt !== attemptRef.current) return

      clearResetTimer()
      if (result === false) {
        setCopied(false)
        return
      }

      setCopied(true)
      setSuccessCount(count => count + 1)
      resetTimerRef.current = setTimeout(() => {
        setCopied(false)
        resetTimerRef.current = null
      }, resetAfterMs)
    } catch (error) {
      if (!mountedRef.current || attempt !== attemptRef.current) return

      clearResetTimer()
      setCopied(false)
      onError?.(error)
    }
  }, [clearResetTimer, onCopy, onError, resetAfterMs])

  return { copied, successCount, triggerCopy }
}
