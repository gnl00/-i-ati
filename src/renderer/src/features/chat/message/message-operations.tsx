import { CopyIcon, Pencil2Icon, ReloadIcon } from '@radix-ui/react-icons'
import { cn } from '@renderer/shared/lib/utils'
import React, { useState } from 'react'

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
  onCopyClick: () => void
  onEditClick?: () => void
  onRegenerateClick?: () => void
  showRegenerate?: boolean
}

const operationMetaTextClassName = "min-w-0 truncate text-[11px] font-medium leading-none text-gray-400 tabular-nums dark:text-gray-500"

interface OperationButtonProps {
  icon: React.ReactNode
  onClick?: () => void
  label: string
  delay?: number
}

const OperationButton: React.FC<OperationButtonProps> = ({
  icon,
  onClick,
  label,
  delay = 0
}) => {
  const [isPressed, setIsPressed] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    setIsPressed(true)
    onClick?.()

    // Remove focus after click to prevent persistent focus ring
    const target = e.currentTarget
    setTimeout(() => {
      setIsPressed(false)
      target?.blur()
    }, 300)
  }

  return (
    <div className="relative group">
      <button
        onClick={handleClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className={cn(
          "w-7 h-7 rounded-md flex items-center justify-center",
          "transition-all duration-300 ease-out",
          "hover:bg-gray-100 dark:hover:bg-gray-800",
          "hover:scale-110",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30",
          "backdrop-blur-sm",
          "message-operation-button",
          isPressed && "scale-95! ring-2 ring-blue-500/20"
        )}
        style={{
          '--op-delay': `${delay}ms`
        } as React.CSSProperties}
        aria-label={label}
      >
        <div className={cn(
          "transition-transform duration-200",
          "group-hover:rotate-12 group-active:rotate-0"
        )}>
          {icon}
        </div>
      </button>

      {/* Tooltip */}
      <div
        className={cn(
          "absolute bottom-full left-1/2 -translate-x-1/2 mb-2",
          "px-2 py-1 rounded text-xs font-medium whitespace-nowrap",
          "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900",
          "transition-all duration-200 pointer-events-none",
          "shadow-lg",
          showTooltip
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-1"
        )}
      >
        {label}
        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900 dark:border-t-gray-100" />
      </div>
    </div>
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
          className={cn(
            "absolute bottom-full left-1/2 -translate-x-1/2 mb-2",
            "rounded-md bg-gray-900 px-2.5 py-2 text-left text-[11px] font-medium leading-4 text-white",
            "shadow-lg dark:bg-gray-100 dark:text-gray-900",
            "transition-all duration-200 pointer-events-none whitespace-nowrap z-10",
            "opacity-100 translate-y-0"
          )}
        >
          {display.tooltipItems.map((item) => (
            <div key={item}>{item}</div>
          ))}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900 dark:border-t-gray-100" />
        </div>
      )}
    </div>
  )
}

/**
 * Message operation buttons (Copy, Edit, Regenerate).
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
  showRegenerate = false
}) => {
  const isUser = type === 'user'
  const assistantDateLabel = !isUser && typeof message?.createdAt === 'number'
    ? formatDateTime24h(message.createdAt)
    : null
  const assistantHoverVisibilityClassName = cn(
    "transition-all duration-300 ease-out",
    isHovered
      ? "opacity-100 translate-y-0"
      : "opacity-0 translate-y-2 pointer-events-none"
  )
  const actionControls = (
    <>
      <OperationButton
        icon={<CopyIcon className="w-4 h-4" />}
        onClick={onCopyClick}
        label="Copy"
        delay={0}
      />

      {!isUser && showRegenerate && onRegenerateClick && (
        <OperationButton
          icon={<ReloadIcon className="w-4 h-4" />}
          onClick={onRegenerateClick}
          label="Regenerate"
          delay={50}
        />
      )}

      <OperationButton
        icon={<Pencil2Icon className="w-4 h-4" />}
        onClick={onEditClick}
        label="Edit"
        delay={!isUser && showRegenerate ? 100 : 50}
      />
    </>
  )

  const metaControls = (
    <>
      {!isUser && tokenUsageDisplay && (
        <TokenUsageInfo display={tokenUsageDisplay} />
      )}

      {!isUser && assistantDateLabel && (
        <div className={cn(operationMetaTextClassName, "h-7 flex items-center")}>
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
            "gap-1 flex",
            assistantHoverVisibilityClassName
          )}
        >
          {actionControls}
        </div>

        <div
          data-testid="assistant-message-meta"
          className={cn(
            "ml-auto flex min-w-0 items-center justify-end gap-2 pr-2",
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
        "min-h-6 transition-all duration-300 ease-out",
        "mt-0.5 pr-2 gap-1 flex text-gray-500 dark:text-gray-400",
        isHovered
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-2 pointer-events-none"
      )}
    >
      {actionControls}
    </div>
  )
}
