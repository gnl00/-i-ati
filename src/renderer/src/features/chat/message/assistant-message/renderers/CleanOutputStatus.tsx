import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { LoaderCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

export function CleanOutputStatus({ label }: { label: string }): React.ReactElement {
  const reducedMotion = useReducedMotion()
  const [displayLabel, setDisplayLabel] = useState(label)
  const latestLabel = useRef(label)
  latestLabel.current = label
  const urgent = label === 'Stopping…' || label.startsWith('Waiting for')
  useEffect(() => {
    if (urgent || reducedMotion) {
      setDisplayLabel(label)
    }
  }, [urgent, reducedMotion, label])
  useEffect(() => {
    if (urgent || reducedMotion) return
    // Sample the latest target once per transition, without replaying obsolete states.
    const timer = window.setInterval(() => setDisplayLabel(latestLabel.current), 150)
    return (): void => window.clearInterval(timer)
  }, [urgent, reducedMotion])
  return (
    <div role="status" aria-live="polite" aria-atomic="true" aria-label={displayLabel} className="my-1.5 flex h-7 min-w-0 items-center gap-2 overflow-hidden px-2 text-xs text-(--chat-text-secondary)">
      <span
        aria-hidden="true"
        className={'inline-flex h-3.5 w-3.5 shrink-0' + (reducedMotion
          ? ''
          : ' animate-spin will-change-transform motion-reduce:animate-none motion-reduce:will-change-auto')}
      >
        <LoaderCircle className="h-full w-full" />
      </span>
      <span aria-hidden="true" className="relative min-w-0 flex-1">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={displayLabel}
            className="block truncate"
            initial={reducedMotion ? false : { y: 4, opacity: 0, filter: 'blur(2px)' }}
            animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
            exit={reducedMotion ? { opacity: 0 } : { y: -4, opacity: 0, filter: 'blur(2px)' }}
            transition={{ duration: reducedMotion ? 0 : 0.15, ease: 'easeInOut' }}
          >{displayLabel}</motion.span>
        </AnimatePresence>
      </span>
    </div>
  )
}
