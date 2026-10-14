import React from 'react'
import { Textarea } from '@renderer/shared/components/ui/textarea'
import { cn } from '@renderer/shared/lib/utils'
import { useChatStore } from '@renderer/features/chat/state/chatStore'
import './SharedPromptSurface.css'

interface SharedPromptSurfaceProps {
  value: string
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void
  variant?: 'welcome' | 'chat'
  onSubmit?: () => void
  placeholder?: string
  expanded?: boolean
  disabled?: boolean
  isDragging?: boolean
  mediaGallery?: React.ReactNode
  textAttachmentGallery?: React.ReactNode
  topAccessory?: React.ReactNode
  skillSlot?: React.ReactNode
  dropIndicator?: React.ReactNode
  bodyOverlay?: React.ReactNode
  leftActions?: React.ReactNode
  centerActions?: React.ReactNode
  rightActions?: React.ReactNode
  className?: string
  bodyClassName?: string
  textareaClassName?: string
  surfaceRef?: React.Ref<HTMLDivElement>
  onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onCompositionStart?: (event: React.CompositionEvent<HTMLTextAreaElement>) => void
  onCompositionEnd?: (event: React.CompositionEvent<HTMLTextAreaElement>) => void
  onPaste?: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void
  onBlur?: (event: React.FocusEvent<HTMLTextAreaElement>) => void
  onDragEnter?: (event: React.DragEvent<HTMLTextAreaElement>) => void
  onDragLeave?: (event: React.DragEvent<HTMLTextAreaElement>) => void
  onDragOver?: (event: React.DragEvent<HTMLTextAreaElement>) => void
  onDrop?: (event: React.DragEvent<HTMLTextAreaElement>) => void
}

// CSS drives the orbit; React only updates geometry when the composer resizes.
function PromptProgress({ active }: { active: boolean }): React.JSX.Element {
  const svgRef = React.useRef<SVGSVGElement>(null)
  const [geometry, setGeometry] = React.useState({ width: 0, height: 0, radius: 0 })

  React.useLayoutEffect(() => {
    const surface = svgRef.current?.parentElement
    if (!surface) return

    const measure = (): void => {
      const width = surface.clientWidth
      const height = surface.clientHeight
      const radius = Math.max(0, Math.min(
        parseFloat(getComputedStyle(surface).borderTopLeftRadius) - 1 || 0,
        (width - 2) / 2,
        (height - 2) / 2
      ))
      setGeometry(previous => previous.width === width && previous.height === height && previous.radius === radius
        ? previous
        : { width, height, radius })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(surface)
    // Also pick up the final radius after Welcome's expansion transition.
    surface.addEventListener('transitionend', measure)
    return (): void => {
      observer.disconnect()
      surface.removeEventListener('transitionend', measure)
    }
  }, [])

  const { width, height, radius } = geometry
  const perimeter = 2 * (width + height - 4) + (2 * Math.PI - 8) * radius
  const segmentLength = 120 / 48
  return (
    <svg
      ref={svgRef}
      className="shared-prompt-progress"
      data-active={active}
      aria-hidden="true"
      style={{
        '--prompt-orbit-length': `${perimeter}px`,
        '--prompt-orbit-duration': `${perimeter / 270}s`
      } as React.CSSProperties}
    >
      {width > 2 && height > 2 && Array.from({ length: 48 }, (_, index) => (
        <rect
          key={index}
          className="shared-prompt-comet-segment"
          x="1"
          y="1"
          width={width - 2}
          height={height - 2}
          rx={radius}
          fill="none"
          strokeDasharray={`${segmentLength + 0.4} ${perimeter - segmentLength - 0.4}`}
          style={{
            '--prompt-orbit-offset': `${index * segmentLength}px`,
            opacity: Math.pow(1 - index / 48, 1.7) * 0.95
          } as React.CSSProperties}
        />
      ))}
    </svg>
  )
}

const SharedPromptSurface = React.forwardRef<HTMLTextAreaElement, SharedPromptSurfaceProps>(({
  value,
  onChange,
  variant = 'welcome',
  placeholder = 'Ask @i what to work on...',
  expanded = false,
  disabled = false,
  isDragging = false,
  mediaGallery,
  textAttachmentGallery,
  topAccessory,
  skillSlot,
  dropIndicator,
  bodyOverlay,
  leftActions,
  centerActions,
  rightActions,
  className,
  bodyClassName,
  textareaClassName,
  surfaceRef,
  onKeyDown,
  onCompositionStart,
  onCompositionEnd,
  onPaste,
  onBlur,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop
}, ref) => {
  const runPhase = useChatStore(state => state.runPhase)
  const isAIThinking = runPhase === 'submitting' || runPhase === 'streaming'
  const [progressVisible, setProgressVisible] = React.useState(isAIThinking)

  React.useEffect(() => {
    if (isAIThinking) {
      setProgressVisible(true)
      return
    }
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (reducedMotion.matches) {
      setProgressVisible(false)
      return
    }
    const timeout = window.setTimeout(() => setProgressVisible(false), 180)
    const onMotionChange = (): void => {
      if (reducedMotion.matches) setProgressVisible(false)
    }
    reducedMotion.addEventListener('change', onMotionChange)
    return (): void => {
      window.clearTimeout(timeout)
      reducedMotion.removeEventListener('change', onMotionChange)
    }
  }, [isAIThinking])

  return (
    <div
      ref={surfaceRef}
      data-variant={variant}
      data-expanded={expanded ? 'true' : 'false'}
      data-dragging={isDragging ? 'true' : 'false'}
      data-has-top-accessory={topAccessory ? 'true' : 'false'}
      className={cn(
        'shared-prompt-surface relative overflow-hidden',
        disabled && 'opacity-[0.82]',
        className
      )}
    >
      {(isAIThinking || progressVisible) && <PromptProgress active={isAIThinking} />}

      <div className="shared-prompt-top-accessory min-w-0 overflow-hidden">
        {topAccessory}
      </div>

      <div
        className={cn(
          'shared-prompt-body relative min-h-0 overflow-hidden',
          bodyClassName
        )}
      >
        {skillSlot}

        {mediaGallery && (
          <div className="shared-prompt-gallery">
            {mediaGallery}
          </div>
        )}

        {textAttachmentGallery && <div className="mx-4 mt-2 max-h-60 overflow-auto">{textAttachmentGallery}</div>}

        {dropIndicator}

        <div className="shared-prompt-text-region relative">
          <Textarea
            ref={ref}
            className={cn(
              'shared-prompt-textarea w-full resize-none border-0 bg-transparent shadow-none',
              'px-5 pb-3 pt-3 text-[15px] font-medium leading-6 text-foreground',
              'focus-visible:outline-hidden focus-visible:ring-0 focus-visible:ring-offset-0',
              textareaClassName
            )}
            rows={1}
            aria-label={placeholder}
            placeholder={placeholder}
            value={value}
            disabled={disabled}
            onChange={onChange}
            onKeyDown={onKeyDown}
            onCompositionStart={onCompositionStart}
            onCompositionEnd={onCompositionEnd}
            onPaste={onPaste}
            onBlur={onBlur}
            onDragEnter={onDragEnter}
            onDragLeave={onDragLeave}
            onDragOver={onDragOver}
            onDrop={onDrop}
          />

          {bodyOverlay}
        </div>
      </div>

      <div
        className="shared-prompt-actions min-h-0 overflow-hidden"
        onClick={event => event.stopPropagation()}
      >
        <div className="shared-prompt-baseline grid min-h-10 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-2.5 pb-2 pt-1">
          <div className="shared-prompt-baseline-left flex min-w-0 items-center justify-start gap-2">
            {leftActions}
          </div>
          <div className="shared-prompt-baseline-center flex min-w-0 items-center justify-center gap-2">
            {centerActions}
          </div>
          <div className="shared-prompt-baseline-right flex min-w-0 items-center justify-end gap-2">
            {rightActions}
          </div>
        </div>
      </div>
    </div>
  )
})

SharedPromptSurface.displayName = 'SharedPromptSurface'

export default SharedPromptSurface
