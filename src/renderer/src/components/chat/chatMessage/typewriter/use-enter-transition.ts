import { useLayoutEffect, useRef, useState } from 'react'

export function useEnterTransition(
  trigger: unknown,
  options?: {
    enabled?: boolean
    throttleMs?: number
  }
) {
  const enabled = options?.enabled ?? true
  const throttleMs = options?.throttleMs ?? 0
  const [entered, setEntered] = useState(!enabled)
  const lastTsRef = useRef<number>(0)

  useLayoutEffect(() => {
    if (!enabled) return

    if (throttleMs > 0) {
      const now = Date.now()
      const last = lastTsRef.current
      if (last && now - last < throttleMs) return
      lastTsRef.current = now
    }

    setEntered(false)
    const raf = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(raf)
  }, [enabled, throttleMs, trigger])

  return entered
}
