import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Search, X } from 'lucide-react'
import { Input } from '@renderer/shared/components/ui/input'
import { cn } from '@renderer/shared/lib/utils'

interface ChatTitleSearchProps {
  open: boolean
  value: string
  onChange: (value: string) => void
  onOpen: () => void
  onClose: () => void
  placeholder?: string
  label?: string
  className?: string
}

export function ChatTitleSearch({
  open,
  value,
  onChange,
  onOpen,
  onClose,
  placeholder = 'Search titles and messages...',
  label = 'Search chats',
  className,
}: ChatTitleSearchProps): React.ReactElement {
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => searchInputRef.current?.focus(), 120)
    return (): void => window.clearTimeout(timer)
  }, [open])
  return (
    <div className={cn('pointer-events-none sticky top-0 z-30 h-0', className)}>
      <motion.div
        initial={false}
        animate={{
          width: open ? 315 : 30,
          opacity: 1,
        }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="pointer-events-auto absolute top-0 right-2"
      >
        <div
          className={cn(
            'flex h-8.5 items-center overflow-hidden rounded-lg bg-white/70 backdrop-blur-xl dark:border-(--app-border-standard) dark:bg-(--app-surface-raised) dark:text-(--app-text-primary) dark:backdrop-blur-none ',
            open &&
              'border border-gray-200/45 shadow-[0_1px_1px_rgba(15,23,42,0.03)] dark:shadow-none',
          )}
        >
          <button
            type="button"
            onClick={open ? undefined : onOpen}
            className="h-8.5 w-8.5 shrink-0 flex justify-center items-center text-gray-500 transition-colors hover:bg-black/4 hover:text-gray-700 dark:text-(--app-text-secondary) dark:hover:bg-(--app-surface-hover) dark:hover:text-(--app-text-primary)"
            aria-label={label}
          >
            <Search className="-translate-x-[2px] h-3.5 w-3.5" />
          </button>

          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                key="chat-title-search-input"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                className="flex min-w-0 flex-1 items-center"
              >
                <Input
                  ref={searchInputRef}
                  value={value}
                  onChange={(event) => onChange(event.target.value)}
                  placeholder={placeholder}
                  className="h-8.5 min-w-0 border-0 bg-transparent pl-1.5 pr-2.5 text-[13px] shadow-none placeholder:text-gray-400 focus-visible:ring-0 focus-visible:ring-offset-0 dark:placeholder:text-gray-500"
                />
                <button
                  type="button"
                  onClick={onClose}
                  className="mr-1.5 flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-black/4 hover:text-gray-700 dark:text-(--app-text-secondary) dark:hover:bg-(--app-surface-hover) dark:hover:text-(--app-text-primary)"
                  aria-label="Close search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  )
}
