import { CheckIcon, CopyIcon, Pencil2Icon, ReloadIcon } from '@radix-ui/react-icons'
import {
  useCopyFeedback,
  type CopyActionHandler
} from '@renderer/shared/hooks/useCopyFeedback'
import { cn } from '@renderer/shared/lib/utils'
import { GitFork } from 'lucide-react'
import React, { useState } from 'react'
import { toast } from 'sonner'

export type { CopyActionHandler, CopyActionResult } from '@renderer/shared/hooks/useCopyFeedback'

const formatDateTime24h = (timestamp: number): string => {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

export interface MessageOperationButtonsProps {
  type: 'user' | 'assistant'
  message: Pick<ChatMessage, 'createdAt'> | undefined
  tokenUsageDisplay?: {
    compactLabel: string
    tooltipItems: string[]
    ariaLabel: string
  }
  isHovered: boolean
  onCopyClick: CopyActionHandler
  onEditClick?: () => void
  onRegenerateClick?: () => void
  onBranchClick?: () => void
  showRegenerate?: boolean
  showBranch?: boolean
}

const operationMetaTextClassName = 'min-w-0 truncate text-[11px] font-medium leading-none text-gray-400 tabular-nums dark:text-gray-500'
const operationTooltipSurfaceClassName = cn(
  'border border-transparent bg-gray-900 text-white shadow-lg',
  'dark:border-(--app-border-standard) dark:bg-(--app-surface-raised) dark:text-(--app-text-primary)',
  'dark:shadow-[0_12px_28px_-16px_rgba(0,0,0,0.72)]'
)
const operationTooltipArrowClassName = cn(
  'absolute top-full left-1/2 -mt-1 -translate-x-1/2 border-4 border-transparent border-t-gray-900',
  'dark:border-t-(--app-surface-raised)'
)
const operationButtonMotionClassName = cn(
  'transition-[color,background-color,box-shadow,transform] duration-[160ms] ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]',
  'motion-reduce:transition-colors motion-reduce:duration-0 motion-reduce:active:scale-none'
)

interface OperationButtonProps {
  icon: React.ReactNode
  onClick?: () => void
  label: string
  variant?: 'default' | 'compact'
  disabled?: boolean
}

const OperationButton: React.FC<OperationButtonProps> = ({
  icon,
  onClick,
  label,
  variant = 'default',
  disabled = false
}) => {
  const [showTooltip, setShowTooltip] = useState(false)
  const isCompact = variant === 'compact'

  return (
    <div className="relative group">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        onMouseEnter={isCompact || disabled ? undefined : (): void => setShowTooltip(true)}
        onMouseLeave={isCompact || disabled ? undefined : (): void => setShowTooltip(false)}
        className={cn(
          'flex items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2',
          operationButtonMotionClassName,
          'disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent disabled:active:scale-100 dark:disabled:text-(--app-text-muted) dark:disabled:hover:bg-transparent',
          isCompact
            ? [
              'h-6 w-6 text-zinc-400',
              'hover:bg-black/5 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-white/6 dark:hover:text-zinc-200',
              'focus-visible:ring-zinc-400/40 dark:focus-visible:ring-zinc-500/60'
            ]
            : [
              'h-7 w-7',
              'hover:bg-gray-100 dark:hover:bg-gray-800',
              'focus-visible:ring-blue-500/30',
              'backdrop-blur-sm'
            ]
        )}
        aria-label={label}
        title={isCompact ? label : undefined}
      >
        {icon}
      </button>

      {!isCompact && (
        <div
          role="tooltip"
          className={cn(
            'absolute bottom-full left-1/2 -translate-x-1/2 mb-2',
            'px-2 py-1 rounded text-xs font-medium whitespace-nowrap',
            operationTooltipSurfaceClassName,
            'pointer-events-none transition-[opacity,transform] duration-[160ms] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none',
            showTooltip
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 translate-y-1'
          )}
        >
          {label}
          <div className={operationTooltipArrowClassName} />
        </div>
      )}
    </div>
  )
}

export interface CopyButtonProps {
  onClick: CopyActionHandler
  label?: string
  variant?: 'default' | 'compact'
  feedbackKey?: unknown
}

export const CopyButton: React.FC<CopyButtonProps> = ({
  onClick,
  label = 'Copy',
  variant = 'default',
  feedbackKey
}) => {
  const { copied, successCount, triggerCopy } = useCopyFeedback(onClick, {
    resetKey: feedbackKey,
    onError: () => toast.error('Copy failed')
  })
  const currentLabel = copied ? 'Copied' : label
  const iconSizeClassName = variant === 'compact' ? 'h-3 w-3' : 'h-4 w-4'

  return (
    <>
      <OperationButton
        icon={(
          <span
            className={cn('relative block shrink-0', iconSizeClassName)}
            data-testid="copy-icon-slot"
          >
            <CopyIcon
              aria-hidden="true"
              data-testid="copy-icon"
              className={cn(
                'absolute inset-0 h-full w-full transition-[opacity,transform] duration-[160ms] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none',
                copied ? 'scale-[0.92] opacity-0' : 'scale-100 opacity-100'
              )}
            />
            <CheckIcon
              aria-hidden="true"
              data-testid="copy-success-icon"
              className={cn(
                'absolute inset-0 h-full w-full text-emerald-600 transition-[opacity,transform] duration-[160ms] ease-[cubic-bezier(0.23,1,0.32,1)] dark:text-emerald-400 motion-reduce:transition-none',
                copied ? 'scale-100 opacity-100' : 'scale-[0.92] opacity-0'
              )}
            />
          </span>
        )}
        onClick={(): void => {
          void triggerCopy()
        }}
        label={currentLabel}
        variant={variant}
      />
      <span
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {copied ? <span key={successCount}>Copied</span> : ''}
      </span>
    </>
  )
}

const TokenUsageInfo: React.FC<{
  display: NonNullable<MessageOperationButtonsProps['tokenUsageDisplay']>
}> = ({ display }) => {
  const [showTooltip, setShowTooltip] = useState(false)

  return (
    <div
      className="relative h-7 min-w-0 flex items-center"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span
        aria-label={display.ariaLabel}
        className={operationMetaTextClassName}
      >
        {display.compactLabel}
      </span>

      {showTooltip && (
        <div
          role="tooltip"
          className={cn(
            'absolute bottom-full left-1/2 -translate-x-1/2 mb-2',
            'rounded-md px-2.5 py-2 text-left text-[11px] font-medium leading-4',
            operationTooltipSurfaceClassName,
            'pointer-events-none whitespace-nowrap z-10 transition-[opacity,transform] duration-[160ms] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none',
            'opacity-100 translate-y-0'
          )}
        >
          {display.tooltipItems.map((item) => (
            <div key={item}>{item}</div>
          ))}
          <div className={operationTooltipArrowClassName} />
        </div>
      )}
    </div>
  )
}

/**
 * Message operation buttons (Copy, Edit, Regenerate, Branch).
 * Displays different button sets based on message type and hover state.
 */
export const MessageOperations: React.FC<MessageOperationButtonsProps> = ({
  type,
  message,
  tokenUsageDisplay,
  isHovered,
  onCopyClick,
  onEditClick,
  onRegenerateClick,
  onBranchClick,
  showRegenerate = false,
  showBranch = false
}) => {
  const isUser = type === 'user'
  const assistantDateLabel = !isUser && typeof message?.createdAt === 'number'
    ? formatDateTime24h(message.createdAt)
    : null
  const assistantHoverVisibilityClassName = cn(
    'transition-[opacity,transform] duration-[160ms] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none motion-reduce:translate-y-0',
    isHovered
      ? 'opacity-100 translate-y-0'
      : 'opacity-0 translate-y-1 pointer-events-none'
  )
  const actionControls = (
    <>
      <CopyButton onClick={onCopyClick} />

      {!isUser && showRegenerate && onRegenerateClick && (
        <OperationButton
          icon={<ReloadIcon className="w-4 h-4" />}
          onClick={onRegenerateClick}
          label="Regenerate"
        />
      )}

      {!isUser && showBranch && onBranchClick && (
        <OperationButton
          icon={<GitFork className="h-4 w-4" />}
          onClick={onBranchClick}
          label="Branch chat"
        />
      )}

      <OperationButton
        icon={<Pencil2Icon className="w-4 h-4" />}
        onClick={onEditClick}
        label="Edit"
        disabled
      />
    </>
  )

  const metaControls = (
    <>
      {!isUser && tokenUsageDisplay && (
        <TokenUsageInfo display={tokenUsageDisplay} />
      )}

      {!isUser && assistantDateLabel && (
        <div className={cn(operationMetaTextClassName, 'h-7 flex items-center')}>
          {assistantDateLabel}
        </div>
      )}
    </>
  )

  if (!isUser) {
    return (
      <div
        id="assistant-message-operation"
        className="mt-0.5 min-h-6 pl-2 flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 text-gray-500 dark:text-gray-400"
      >
        <div
          data-testid="assistant-message-actions"
          className={cn(
            'gap-1 flex',
            assistantHoverVisibilityClassName
          )}
        >
          {actionControls}
        </div>

        <div
          data-testid="assistant-message-meta"
          className={cn(
            'ml-auto flex min-w-0 items-center justify-end gap-2 pr-2',
            assistantHoverVisibilityClassName
          )}
        >
          {metaControls}
        </div>
      </div>
    )
  }

  return (
    <div
      id="usr-msg-operation"
      className={cn(
        'min-h-6 transition-[opacity,transform] duration-[160ms] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none motion-reduce:translate-y-0',
        'mt-0.5 pr-2 gap-1 flex text-gray-500 dark:text-gray-400',
        isHovered
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 translate-y-1 pointer-events-none'
      )}
    >
      {actionControls}
    </div>
  )
}
