import './CleanOutputStatus.css'
import { useReducedMotion } from 'framer-motion'
import { LoaderCircle, ShieldCheck, MessageCircleQuestion, Square } from 'lucide-react'
import type { CleanOutputProgress } from '../model/cleanOutput'
import { useEffect, useRef, useState } from 'react'

const phaseIcons = {
  working: LoaderCircle,
  thinking: LoaderCircle,
  tool: LoaderCircle,
  writing: LoaderCircle,
  approval: ShieldCheck,
  question: MessageCircleQuestion,
  cancelling: Square
}

export function CleanOutputStatus({ progress }: { progress: CleanOutputProgress }): React.ReactElement {
  const reducedMotion = useReducedMotion()
  const [display, setDisplay] = useState(progress)
  const latestProgress = useRef(progress)
  latestProgress.current = progress
  const urgent = ['cancelling', 'approval', 'question'].includes(progress.phase)
  useEffect(() => {
    if (urgent || reducedMotion) {
      setDisplay(progress)
    }
  }, [urgent, reducedMotion, progress])
  useEffect(() => {
    if (urgent || reducedMotion) return
    // Sample the latest target once per transition, without replaying obsolete states.
    const timer = window.setInterval(() => setDisplay(latestProgress.current), 150)
    return (): void => window.clearInterval(timer)
  }, [urgent, reducedMotion])
  const Icon = phaseIcons[display.phase]
  const busy = !['approval', 'question', 'cancelling'].includes(display.phase)
  return (
    <div role="status" aria-live="polite" aria-atomic="true" aria-label={display.label} className="my-1.5 flex h-7 min-w-0 items-center gap-2 overflow-hidden px-2 text-xs text-(--chat-text-secondary)">
      <span aria-hidden="true" className="inline-flex h-3.5 w-3.5 shrink-0" data-phase={display.phase}>
        <Icon className={`h-full w-full${busy && !reducedMotion ? ' motion-safe:animate-spin' : ''}`} />
      </span>
      <span aria-hidden="true" className="min-w-0 flex-1 overflow-hidden">
        <span
          className="clean-status-label"
          data-text={display.label}
          data-shimmer={busy}
        >{display.label}</span>
      </span>
    </div>
  )
}
