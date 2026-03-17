import React from 'react'
import { cn } from '@renderer/lib/utils'

interface InlineDeleteConfirmProps {
  onConfirm: () => void | Promise<void>
  ariaLabel: string
  title?: string
  idleLabel?: string
  busyLabel?: string
  width?: number
  height?: number
  revealOnGroupHover?: boolean
  disabled?: boolean
  iconClassName?: string
}

const InlineDeleteConfirm: React.FC<InlineDeleteConfirmProps> = ({
  onConfirm,
  ariaLabel,
  title,
  idleLabel,
  busyLabel = '...',
  width = 66,
  height = 24,
  revealOnGroupHover = false,
  disabled = false,
  iconClassName = 'text-[13px]'
}) => {
  const [confirming, setConfirming] = React.useState(false)
  const [loading, setLoading] = React.useState(false)

  const handleConfirm = async (): Promise<void> => {
    if (loading || disabled) {
      return
    }

    try {
      setLoading(true)
      await onConfirm()
      setConfirming(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative shrink-0" style={{ width, height }}>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={ariaLabel}
        title={title}
        tabIndex={confirming ? -1 : 0}
        disabled={disabled || loading}
        className={cn(
          'absolute inset-0 flex items-center justify-center rounded',
          'text-gray-400 hover:text-rose-500 dark:hover:text-rose-400',
          'hover:bg-rose-50 dark:hover:bg-rose-900/20',
          revealOnGroupHover ? 'opacity-0 group-hover:opacity-100 focus:opacity-100' : '',
          disabled || loading ? 'opacity-30' : ''
        )}
        style={{
          transition: 'opacity 140ms ease, transform 140ms ease, background-color 120ms ease, color 120ms ease',
          ...(confirming && {
            opacity: 0,
            transform: 'scale(0.7)',
            pointerEvents: 'none'
          })
        }}
      >
        <i className={cn('ri-delete-bin-line', iconClassName)} />
        {idleLabel && <span className="ml-1 text-[11px] font-medium">{idleLabel}</span>}
      </button>

      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{
          transition: 'opacity 160ms ease 30ms, transform 160ms ease 30ms',
          opacity: confirming ? 1 : 0,
          transform: confirming ? 'scale(1)' : 'scale(0.75)',
          pointerEvents: confirming ? 'auto' : 'none'
        }}
      >
        <button
          type="button"
          onClick={() => setConfirming(false)}
          tabIndex={confirming ? 0 : -1}
          className="h-[22px] px-2 text-[11px] font-medium text-gray-500 hover:text-gray-800 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700/60 rounded-l-md border border-gray-200 dark:border-gray-700 border-r-0"
          style={{ transition: 'background-color 120ms ease, color 120ms ease' }}
        >
          No
        </button>
        <button
          type="button"
          onClick={() => void handleConfirm()}
          tabIndex={confirming ? 0 : -1}
          disabled={disabled || loading}
          className="h-[22px] px-2 text-[11px] font-medium text-rose-500 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-r-md border border-gray-200 dark:border-gray-700 disabled:opacity-40"
          style={{ transition: 'background-color 120ms ease, color 120ms ease' }}
        >
          {loading ? busyLabel : 'Yes'}
        </button>
      </div>
    </div>
  )
}

export default InlineDeleteConfirm
