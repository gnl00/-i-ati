import React, { useRef, useState } from 'react'
import { Input } from '@renderer/shared/components/ui/input'
import { Search, Loader2, X } from 'lucide-react'
import { cn } from '@renderer/shared/lib/utils'

interface ExpandableSearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  /** Shows a spinning loader at the right side */
  loading?: boolean
  /** Called when Enter is pressed */
  onSubmit?: () => void
  /** When non-expandable, shows a clear (X) button when value is non-empty */
  showClear?: boolean
  /**
   * Expandable mode: collapsed → click to expand with animated width transition.
   * Fixed mode: always-visible search bar.
   * @default true
   */
  expandable?: boolean
  /**
   * Expanded width when in expandable mode.
   * @default 'w-[260px]'
   */
  expandedWidth?: string
  className?: string
}

const ExpandableSearchInput: React.FC<ExpandableSearchInputProps> = ({
  value,
  onChange,
  placeholder,
  disabled = false,
  loading = false,
  onSubmit,
  showClear = false,
  expandable = true,
  expandedWidth = 'w-[260px]',
  className
}) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const [expanded, setExpanded] = useState(false)

  const isEffectivelyExpanded = expanded || !!value.trim()

  const focus = (): void => {
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const handleExpand = (): void => {
    if (!expanded) {
      setExpanded(true)
      focus()
    } else {
      focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' && onSubmit) onSubmit()
    if (expandable && e.key === 'Escape' && isEffectivelyExpanded) {
      setExpanded(false)
      onChange('')
    }
  }

  const handleBlur = (): void => {
    if (expandable && !value.trim()) {
      setExpanded(false)
    }
  }

  // ── Non-expandable (fixed) mode ──────────────────────────────
  if (!expandable) {
    return (
      <div
        className={cn(
          'relative flex items-center rounded-lg',
          'bg-gray-100/80 shadow-inner dark:bg-(--app-surface-inset)',
          'ring-1 ring-inset ring-gray-200/70 dark:ring-(--app-border-standard)',
          'focus-within:bg-white dark:focus-within:bg-(--app-surface-inset) dark:focus-within:ring-(--app-accent)',
          className
        )}
      >
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 dark:text-(--app-text-muted)" />
        <Input
          ref={inputRef}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className="h-8 rounded-lg border-transparent bg-transparent pl-8 pr-8 text-[12px] text-gray-700 shadow-none placeholder:text-gray-400/70 dark:text-(--app-text-body) dark:placeholder:text-(--app-text-muted) focus-visible:border-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
          disabled={disabled}
        />
        {showClear && value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-gray-400 hover:text-gray-600 dark:text-(--app-text-muted) dark:hover:text-(--app-text-primary) transition-colors"
            aria-label="Clear search"
          >
            <X className="h-3 w-3" />
          </button>
        )}
        {loading && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-gray-400" />
        )}
      </div>
    )
  }

  // ── Expandable mode ──────────────────────────────────────────
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleExpand}
      onKeyDown={(e) => {
        if (!isEffectivelyExpanded && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          handleExpand()
        }
      }}
      className={cn(
        'relative flex items-center rounded-lg overflow-hidden transition-all duration-300 ease-out',
        'bg-gray-100/80 shadow-inner dark:bg-(--app-surface-inset)',
        'ring-1 ring-inset ring-gray-200/70 dark:ring-(--app-border-standard)',
        isEffectivelyExpanded
          ? cn(expandedWidth, 'focus-within:bg-white dark:focus-within:bg-(--app-surface-inset) dark:focus-within:ring-(--app-accent)')
          : 'w-8 h-8 cursor-pointer hover:ring-gray-300 dark:hover:ring-(--app-accent)',
        className
      )}
    >
      <Search
        className={cn(
          'pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 transition-colors duration-200',
          'text-gray-400 dark:text-(--app-text-muted)',
          isEffectivelyExpanded && 'text-gray-500 dark:text-(--app-text-secondary)'
        )}
      />
      <Input
        ref={inputRef}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className={cn(
          'h-8 rounded-lg border-transparent bg-transparent pl-8 pr-8 text-[12px] text-gray-700 shadow-none',
          'placeholder:text-gray-400/70 dark:text-(--app-text-body) dark:placeholder:text-(--app-text-muted)',
          'focus-visible:border-transparent focus-visible:ring-0 focus-visible:ring-offset-0',
          'transition-opacity duration-200',
          isEffectivelyExpanded ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        disabled={disabled}
      />
      {loading && (
        <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-gray-400" />
      )}
    </div>
  )
}

export default ExpandableSearchInput
