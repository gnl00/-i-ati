import { TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { cn } from '@renderer/lib/utils'
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'

export interface AnimatedTab {
  value: string
  label: string
  icon?: React.ReactNode
}

interface AnimatedTabsListProps {
  tabs: AnimatedTab[]
  value: string
  className?: string
  tabsListClassName?: string
  tabsTriggerClassName?: string
  scrollable?: boolean
  autoScrollActive?: boolean
}

export const AnimatedTabsList: React.FC<AnimatedTabsListProps> = ({
  tabs,
  value,
  className,
  tabsListClassName,
  tabsTriggerClassName,
  scrollable = false,
  autoScrollActive = false
}) => {
  const [indicatorStyle, setIndicatorStyle] = useState<{ left: number; width: number } | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const tabsListRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const previousValueRef = useRef<string | null>(null)

  const updateIndicator = () => {
    const activeTabObj = tabRefs.current.get(value)
    const listObj = tabsListRef.current

    if (activeTabObj && listObj) {
      setIndicatorStyle({
        left: activeTabObj.offsetLeft,
        width: activeTabObj.offsetWidth
      })
    }
  }

  // Use ResizeObserver for robust layout tracking
  useEffect(() => {
    const listObj = tabsListRef.current
    if (!listObj) return

    const resizeObserver = new ResizeObserver(() => {
      // Small debounce/raf could be added here if resizing is very heavy,
      // but usually direct update is fine for UI tabs
      requestAnimationFrame(updateIndicator)
    })

    resizeObserver.observe(listObj)
    return () => resizeObserver.disconnect()
  }, [value]) // Re-bind if value changes to ensure we measure the new active tab correctly

  // useLayoutEffect prevents the initial "jump" by calculating before paint
  useLayoutEffect(() => {
    updateIndicator()
  }, [value])

  useEffect(() => {
    if (!scrollable || !autoScrollActive) {
      return
    }

    const scrollContainer = scrollContainerRef.current
    const listObj = tabsListRef.current
    const activeTabObj = tabRefs.current.get(value)
    if (!scrollContainer || !listObj || !activeTabObj) {
      return
    }

    const previousValue = previousValueRef.current
    const currentIndex = tabs.findIndex(tab => tab.value === value)
    const previousIndex = previousValue ? tabs.findIndex(tab => tab.value === previousValue) : -1
    const movingLeft = previousIndex >= 0 && currentIndex < previousIndex
    const movingRight = previousIndex >= 0 && currentIndex > previousIndex
    const leadingGap = 8
    const trailingGap = 8
    const maxScrollLeft = Math.max(listObj.scrollWidth - scrollContainer.clientWidth, 0)

    let targetLeft = scrollContainer.scrollLeft

    if (movingLeft) {
      targetLeft = activeTabObj.offsetLeft + activeTabObj.offsetWidth - scrollContainer.clientWidth + trailingGap
    } else if (movingRight) {
      targetLeft = activeTabObj.offsetLeft - leadingGap
    } else {
      const activeLeft = activeTabObj.offsetLeft
      const activeRight = activeLeft + activeTabObj.offsetWidth
      const viewportLeft = scrollContainer.scrollLeft
      const viewportRight = viewportLeft + scrollContainer.clientWidth

      if (activeLeft < viewportLeft) {
        targetLeft = activeLeft - leadingGap
      } else if (activeRight > viewportRight) {
        targetLeft = activeRight - scrollContainer.clientWidth + trailingGap
      }
    }

    const clampedLeft = Math.min(Math.max(targetLeft, 0), maxScrollLeft)
    scrollContainer.scrollTo({
      left: clampedLeft,
      behavior: previousValue ? 'smooth' : 'auto'
    })

    previousValueRef.current = value
  }, [autoScrollActive, scrollable, value])

  return (
    <div
      ref={scrollContainerRef}
      className={cn(
        'min-w-0 max-w-full',
        scrollable && 'overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className
      )}
    >
      <TabsList
        ref={tabsListRef}
        className={cn(
          'relative flex items-center p-1 rounded-xl border',
          'bg-gray-100/50 dark:bg-black/40',
          'border-black/5 dark:border-white/5',
          scrollable ? 'inline-flex min-w-max flex-nowrap' : '',
          tabsListClassName
        )}
      >
        {/* Animated Indicator - Rendered BEHIND the triggers */}
        {indicatorStyle && (
          <div
            className="absolute left-0 top-1 bottom-1 rounded-lg shadow-xs bg-white dark:bg-gray-800 border border-black/5 dark:border-white/5 z-0 transition-all duration-300 ease-out will-change-transform"
            style={{
              transform: `translateX(${indicatorStyle.left}px)`,
              width: `${indicatorStyle.width}px`
            }}
          />
        )}

        {/* Tab Triggers - Rendered ON TOP of the indicator */}
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.value}
            ref={(el) => {
              if (el) tabRefs.current.set(tab.value, el)
              else tabRefs.current.delete(tab.value)
            }}
            value={tab.value}
            className={cn(
              'relative z-10 h-8 px-4 rounded-lg bg-transparent shrink-0',
              'text-xs font-semibold text-muted-foreground whitespace-nowrap',
              'data-[state=active]:text-foreground data-[state=active]:bg-transparent',
              'hover:text-foreground/80 transition-colors',
              'focus-visible:ring-0 focus-visible:bg-transparent',
              tabsTriggerClassName
            )}
          >
            <div className="flex items-center gap-2">
              {tab.icon && <span className="opacity-70 group-data-[state=active]:opacity-100 transition-opacity">{tab.icon}</span>}
              <span>{tab.label}</span>
            </div>
          </TabsTrigger>
        ))}
      </TabsList>
    </div>
  )
}
