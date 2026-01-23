import React, { memo, useState } from 'react'
import { AlertCircle, ChevronDown, ChevronUp, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@renderer/components/ui/button'

interface ErrorMessageProps {
  error: {
    name: string
    message: string
    stack?: string
    code?: string
    timestamp: number
  }
}

/**
 * Error message component for displaying errors in chat.
 * Shows error icon, message, and collapsible details.
 */
export const ErrorMessage: React.FC<ErrorMessageProps> = memo(({ error }) => {
  const [isExpanded, setIsExpanded] = useState(false)

  const handleCopyError = () => {
    const errorText = `Error: ${error.name}\nMessage: ${error.message}\n${error.code ? `Code: ${error.code}\n` : ''}${error.stack ? `\nStack:\n${error.stack}` : ''}`
    navigator.clipboard.writeText(errorText)
    toast.success('Error details copied', { duration: 800 })
  }

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString()
  }

  return (
    <div className="my-2 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 p-3">
      {/* Error Header - Show name and message */}
      <div className="flex items-start gap-2">
        <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          {error.name && (
            <div className="text-xs font-semibold text-red-700 dark:text-red-300 mb-1">
              {error.name}
            </div>
          )}
          <p className="text-sm text-red-600 dark:text-red-300 wrap-break-word">
            {error.message}
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 mt-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopyError}
          className="h-7 px-2 text-xs text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30"
        >
          <Copy className="w-3 h-3 mr-1" />
          Copy Error
        </Button>

        {(error.name || error.code || error.stack) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-7 px-2 text-xs text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="w-3 h-3 mr-1" />
                Hide Details
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3 mr-1" />
                Show Details
              </>
            )}
          </Button>
        )}
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-red-200 dark:border-red-900/50 space-y-2">
          {error.name && (
            <div>
              <span className="text-xs font-semibold text-red-700 dark:text-red-300">
                Error Type:
              </span>
              <code className="ml-2 text-xs text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-1.5 py-0.5 rounded">
                {error.name}
              </code>
            </div>
          )}
          <div>
            <span className="text-xs font-semibold text-red-700 dark:text-red-300">
              Time:
            </span>
            <span className="ml-2 text-xs text-red-600 dark:text-red-400">
              {formatTimestamp(error.timestamp)}
            </span>
          </div>
          {error.code && (
            <div>
              <span className="text-xs font-semibold text-red-700 dark:text-red-300">
                Error Code:
              </span>
              <code className="ml-2 text-xs text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-1.5 py-0.5 rounded">
                {error.code}
              </code>
            </div>
          )}
          {error.stack && (
            <div>
              <span className="text-xs font-semibold text-red-700 dark:text-red-300 block mb-1">
                Stack Trace:
              </span>
              <pre className="text-xs text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 p-2 rounded overflow-x-auto whitespace-pre-wrap wrap-break-word">
                {error.stack}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
})

ErrorMessage.displayName = 'ErrorMessage'
