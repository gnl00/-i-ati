import { CopyIcon, Pencil2Icon, ReloadIcon } from '@radix-ui/react-icons'
import { cn } from '@renderer/lib/utils'
import React, { useState } from 'react'

export interface MessageOperationButtonsProps {
  type: 'user' | 'assistant'
  isHovered: boolean
  onCopyClick: () => void
  onEditClick?: () => void
  onRegenerateClick?: () => void
  showRegenerate?: boolean
}

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
    setTimeout(() => {
      setIsPressed(false)
      e.currentTarget.blur()
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
          isPressed && "scale-95! ring-2 ring-blue-500/20"
        )}
        style={{
          animation: `slideIn 0.3s ease-out ${delay}ms both`
        }}
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

/**
 * Message operation buttons (Copy, Edit, Regenerate).
 * Displays different button sets based on message type and hover state.
 */
export const MessageOperations: React.FC<MessageOperationButtonsProps> = ({
  type,
  isHovered,
  onCopyClick,
  onEditClick,
  onRegenerateClick,
  showRegenerate = false
}) => {
  const isUser = type === 'user'

  return (
    <>
      <style>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      <div
        id={isUser ? "usr-msg-operation" : "assistant-message-operation"}
        className={cn(
          "min-h-6 transition-all duration-300 ease-out",
          isUser
            ? "mt-0.5 pr-2 gap-1 flex text-gray-500 dark:text-gray-400"
            : "mt-0.5 pl-2 gap-1 flex text-gray-500 dark:text-gray-400",
          isHovered
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-2 pointer-events-none"
        )}
      >
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
      </div>
    </>
  )
}
