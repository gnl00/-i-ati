import React from 'react'
import { CopyIcon, Pencil2Icon, ReloadIcon } from '@radix-ui/react-icons'
import { cn } from '@renderer/lib/utils'

export interface MessageOperationButtonsProps {
  type: 'user' | 'assistant'
  isHovered: boolean
  onCopyClick: () => void
  onEditClick?: () => void
  onRegenerateClick?: () => void
  showRegenerate?: boolean
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
    <div
      className={cn(
        "min-h-[1.5rem] transition-opacity duration-200",
        isUser
          ? "mt-0.5 pr-2 space-x-1 flex text-gray-400 dark:text-gray-500"
          : "mt-0.5 pl-2 space-x-1 flex text-gray-500 dark:text-gray-400",
        isHovered ? "opacity-100" : "opacity-0 pointer-events-none"
      )}
    >
      {/* Copy Button */}
      <div className="hover:bg-gray-200 dark:hover:bg-gray-700 w-6 h-6 p-1 rounded-full flex justify-center items-center">
        <CopyIcon onClick={onCopyClick} />
      </div>

      {/* Regenerate Button (assistant only, latest only) */}
      {!isUser && showRegenerate && onRegenerateClick && (
        <div className="hover:bg-gray-200 dark:hover:bg-gray-700 w-6 h-6 p-1 rounded-full flex justify-center items-center">
          <ReloadIcon onClick={onRegenerateClick} />
        </div>
      )}

      {/* Edit Button */}
      <div className="hover:bg-gray-200 dark:hover:bg-gray-700 w-6 h-6 p-1 rounded-full flex justify-center items-center">
        <Pencil2Icon onClick={onEditClick} />
      </div>
    </div>
  )
}
