import { useLayoutEffect, useRef, type ReactNode } from 'react'

/** Present completed content without changing text, layout, or persisted playback state. */
export function CleanOutputReveal({ reveal, children }: {
  reveal: boolean
  children: ReactNode
}): React.ReactElement {
  const elementRef = useRef<HTMLDivElement>(null)
  const settled = useRef(false)

  useLayoutEffect(() => {
    const element = elementRef.current
    if (!element) return
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (!reveal || motionPreference.matches) settled.current = true
    if (!reveal || settled.current) return

    let frame = 0
    let startedAt: number | undefined
    const finish = (): void => {
      settled.current = true
      cancelAnimationFrame(frame)
      element.style.maskImage = ''
      delete element.dataset.revealing
    }
    const tick = (now: number): void => {
      startedAt ??= now
      const progress = Math.min((now - startedAt) / 650, 1)
      const edge = -24 + progress * 148
      element.style.maskImage = `linear-gradient(to bottom, black ${edge - 24}%, transparent ${edge}%)`
      if (progress < 1) frame = requestAnimationFrame(tick)
      else finish()
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) finish()
    }
    const onMotionChange = (event: MediaQueryListEvent): void => {
      if (event.matches) finish()
    }
    const viewport = element.closest<HTMLElement>('[data-testid="message-scroller-viewport"]') ?? element
    element.style.maskImage = 'linear-gradient(to bottom, transparent, transparent)'
    element.dataset.revealing = 'true'
    frame = requestAnimationFrame(tick)
    motionPreference.addEventListener('change', onMotionChange)
    viewport.addEventListener('wheel', finish, { passive: true })
    viewport.addEventListener('touchmove', finish, { passive: true })
    viewport.addEventListener('pointerdown', finish)
    viewport.addEventListener('keydown', onKeyDown)
    return (): void => {
      cancelAnimationFrame(frame)
      element.style.maskImage = ''
      delete element.dataset.revealing
      motionPreference.removeEventListener('change', onMotionChange)
      viewport.removeEventListener('wheel', finish)
      viewport.removeEventListener('touchmove', finish)
      viewport.removeEventListener('pointerdown', finish)
      viewport.removeEventListener('keydown', onKeyDown)
    }
  }, [reveal])

  return <div ref={elementRef} className="flex min-w-0 flex-col" data-testid="clean-output-reveal">{children}</div>
}
