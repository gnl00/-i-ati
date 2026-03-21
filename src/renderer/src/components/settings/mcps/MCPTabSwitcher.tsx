import { cn } from '@renderer/lib/utils'
import { Globe, PackageCheck } from 'lucide-react'
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'

type MCPTabValue = 'local' | 'registry'

interface MCPTabSwitcherProps {
  value: MCPTabValue
  installedCount: number
  onValueChange: (value: MCPTabValue) => void
}

type IndicatorStyle = {
  left: number
  width: number
}

const tabs: Array<{
  value: MCPTabValue
  label: string
  icon: React.ReactNode
}> = [
  {
    value: 'local',
    label: 'Installed',
    icon: <PackageCheck className="h-3.5 w-3.5" />
  },
  {
    value: 'registry',
    label: 'Registry',
    icon: <Globe className="h-3.5 w-3.5" />
  }
]

const MCPTabSwitcher: React.FC<MCPTabSwitcherProps> = ({
  value,
  installedCount,
  onValueChange
}) => {
  const [indicatorStyle, setIndicatorStyle] = useState<IndicatorStyle | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<Map<MCPTabValue, HTMLButtonElement>>(new Map())

  const updateIndicator = () => {
    const activeTab = tabRefs.current.get(value)
    const container = containerRef.current

    if (!activeTab || !container) {
      return
    }

    setIndicatorStyle({
      left: activeTab.offsetLeft,
      width: activeTab.offsetWidth
    })
  }

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(updateIndicator)
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [value])

  useLayoutEffect(() => {
    updateIndicator()
  }, [value, installedCount])

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative inline-flex h-10 items-center rounded-2xl border p-1',
        'border-slate-200/80 bg-white/75 shadow-[0_8px_24px_-16px_rgba(15,23,42,0.35)] backdrop-blur-xl',
        'dark:border-white/10 dark:bg-slate-950/60 dark:shadow-[0_10px_28px_-18px_rgba(2,6,23,0.8)]'
      )}
    >
      {indicatorStyle && (
        <div
          className={cn(
            'absolute top-1 bottom-1 rounded-[14px] border',
            'border-white/70 bg-white shadow-[0_10px_24px_-18px_rgba(15,23,42,0.55)]',
            'dark:border-white/10 dark:bg-slate-900 dark:shadow-[0_10px_24px_-18px_rgba(2,6,23,0.9)]',
            'transition-[transform,width] duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)]'
          )}
          style={{
            transform: `translateX(${indicatorStyle.left}px)`,
            width: indicatorStyle.width
          }}
        />
      )}

      {tabs.map((tab) => {
        const active = tab.value === value
        return (
          <button
            key={tab.value}
            ref={(node) => {
              if (node) {
                tabRefs.current.set(tab.value, node)
              } else {
                tabRefs.current.delete(tab.value)
              }
            }}
            type="button"
            onClick={() => onValueChange(tab.value)}
            className={cn(
              'relative z-10 flex h-8 items-center gap-2 rounded-[14px] px-3.5 text-[11px] font-medium transition-colors duration-150',
              active
                ? 'text-slate-900 dark:text-slate-100'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            )}
          >
            <span className={cn(
              'transition-opacity duration-150',
              active ? 'opacity-100' : 'opacity-70'
            )}>
              {tab.icon}
            </span>
            <span className="tracking-tight">
              {tab.label}
            </span>
            {tab.value === 'local' && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[9px] font-semibold',
                  active
                    ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'
                    : 'bg-slate-100/70 text-slate-400 dark:bg-slate-800/80 dark:text-slate-500'
                )}
              >
                {installedCount}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export default MCPTabSwitcher
