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
}

export const AnimatedTabsList: React.FC<AnimatedTabsListProps> = ({
  tabs,
  value,
  className,
  tabsListClassName,
  tabsTriggerClassName
}) => {
  const [indicatorStyle, setIndicatorStyle] = useState<{ left: number; width: number } | null>(null)
  const tabsListRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map())

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

  return (
    <TabsList
      ref={tabsListRef}
      className={cn(
        "relative flex items-center p-1 rounded-xl border",
        "bg-gray-100/50 dark:bg-black/40",
        "border-black/5 dark:border-white/5",
        tabsListClassName,
        className
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
            "relative z-10 h-8 px-4 rounded-lg bg-transparent",
            "text-xs font-semibold text-muted-foreground",
            "data-[state=active]:text-foreground data-[state=active]:bg-transparent",
            "hover:text-foreground/80 transition-colors",
            "focus-visible:ring-0 focus-visible:bg-transparent",
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
  )
}
