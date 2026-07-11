import React from 'react'
import { Textarea } from '@renderer/components/ui/textarea'
import { cn } from '@renderer/lib/utils'
import { useChatStore } from '@renderer/store/chatStore'
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

const SharedPromptSurface = React.forwardRef<HTMLTextAreaElement, SharedPromptSurfaceProps>(({
  value,
  onChange,
  variant = 'welcome',
  placeholder = 'Ask @i what to work on...',
  expanded = false,
  disabled = false,
  isDragging = false,
  mediaGallery,
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

  return (
    <div
      ref={surfaceRef}
      data-variant={variant}
      data-expanded={expanded ? 'true' : 'false'}
      data-dragging={isDragging ? 'true' : 'false'}
      className={cn(
        'shared-prompt-surface relative overflow-hidden',
        disabled && 'opacity-[0.82]',
        className
      )}
    >
      {isAIThinking && (
        <div
          className="absolute left-0 right-0 top-0 h-[2px] overflow-hidden opacity-0 transition-opacity duration-150 data-[active=true]:opacity-100"
          data-active={isAIThinking}
        >
          <div className="shuttle-bar" />
        </div>
      )}

      <div
        className={cn(
          'shared-prompt-body relative min-h-0 overflow-hidden',
          bodyClassName
        )}
      >
        {mediaGallery && (
          <div className="shared-prompt-gallery">
            {mediaGallery}
          </div>
        )}

        {dropIndicator}

        <Textarea
          ref={ref}
          className={cn(
            'shared-prompt-textarea h-full w-full resize-none border-0 bg-transparent shadow-none',
            'px-5 pb-3 pt-3 text-[15px] font-medium leading-6 text-foreground',
            'placeholder:text-muted-foreground/56 focus-visible:outline-hidden focus-visible:ring-0 focus-visible:ring-offset-0',
            textareaClassName
          )}
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

      <div className="shared-prompt-actions min-h-0 overflow-hidden">
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
