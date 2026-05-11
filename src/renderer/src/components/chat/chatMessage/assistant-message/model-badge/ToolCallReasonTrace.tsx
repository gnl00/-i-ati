import React from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { cn } from '@renderer/lib/utils'
import type { ToolCallReasonItem } from '../model/toolCallReason'

interface ToolCallReasonTraceProps {
  items: ToolCallReasonItem[]
  activeItem?: ToolCallReasonItem
}

function getReasonKey(item: ToolCallReasonItem): string {
  return `${item.id}:${item.reason}`
}

export const ToolCallReasonTrace: React.FC<ToolCallReasonTraceProps> = ({
  items,
  activeItem
}) => {
  const shouldReduceMotion = useReducedMotion()
  const viewportRef = React.useRef<HTMLDivElement | null>(null)
  const latestItem = items.length > 0 ? items[items.length - 1] : undefined
  const activeItemKey = activeItem && !activeItem.isTerminal
    ? getReasonKey(activeItem)
    : undefined
  const fallbackActiveItemKey = React.useMemo(() => {
    const processingItem = items.find(item => !item.isTerminal)
    return processingItem ? getReasonKey(processingItem) : undefined
  }, [items])
  const activeKey = activeItemKey ?? fallbackActiveItemKey

  React.useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || !latestItem) {
      return
    }

    viewport.scrollTo({
      left: viewport.scrollWidth,
      behavior: shouldReduceMotion ? 'auto' : 'smooth'
    })
  }, [latestItem, shouldReduceMotion])

  if (items.length === 0) {
    return null
  }

  return (
    <div
      className={cn(
        'relative min-w-0 max-w-full overflow-hidden',
        'mask-[linear-gradient(to_right,transparent_0,black_18px,black_calc(100%_-_18px),transparent_100%)]'
      )}
    >
      <div
        ref={viewportRef}
        className={cn(
          'flex max-w-full items-center gap-1 overflow-x-auto overscroll-x-contain px-0.5 pb-1',
          '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
        )}
        aria-label="Tool call reason history"
      >
        <AnimatePresence initial={false}>
          {items.map((item, index) => {
            const itemKey = getReasonKey(item)
            const isActiveProcessing = itemKey === activeKey && !item.isTerminal

            return (
              <React.Fragment key={itemKey}>
                {index > 0 && (
                  <span
                    className="shrink-0 text-[11px] leading-5 text-slate-300 dark:text-slate-600"
                    aria-hidden="true"
                  >
                    -
                  </span>
                )}
                <motion.span
                  layout={!shouldReduceMotion}
                  initial={shouldReduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, x: 14, scale: 0.98 }}
                  animate={shouldReduceMotion
                    ? { opacity: 1 }
                    : { opacity: 1, x: 0, scale: 1 }}
                  exit={shouldReduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, x: -8, scale: 0.98 }}
                  transition={shouldReduceMotion
                    ? { duration: 0.01 }
                    : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className={cn(
                    'inline-flex max-w-[min(520px,72vw)] shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5',
                    'text-[10px] leading-5 shadow-[0_10px_30px_-24px_rgba(15,23,42,0.55)]',
                    'transition-[background-color,border-color,color,box-shadow] duration-300 ease-out',
                    isActiveProcessing
                      ? 'border-amber-200/55 bg-amber-50/92 text-amber-950 dark:border-amber-300/28 dark:bg-amber-300/12 dark:text-amber-100'
                      : 'border-slate-200/72 bg-white/72 text-slate-500 dark:border-white/8 dark:bg-white/5 dark:text-slate-400'
                  )}
                  title={item.reason}
                >
                  <span className={cn(
                    'shrink-0 text-[10px] font-semibold uppercase transition-colors duration-300 ease-out',
                    isActiveProcessing
                      ? 'text-amber-700 dark:text-amber-200'
                      : 'text-slate-400 dark:text-slate-500'
                  )}>
                    {item.toolName}
                  </span>
                  <span className="block min-w-0 truncate whitespace-nowrap">
                    {item.reason}
                  </span>
                </motion.span>
              </React.Fragment>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}
