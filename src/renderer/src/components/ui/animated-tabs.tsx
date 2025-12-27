import React, { useRef, useEffect, useState, useCallback } from 'react'
import { cn } from '@renderer/lib/utils'
import { TabsList, TabsTrigger } from '@renderer/components/ui/tabs'

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
  const tabsListRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 })

  // 更新滑动指示器位置
  const updateIndicator = useCallback(() => {
    // 使用 requestAnimationFrame 确保在正确的时机更新
    requestAnimationFrame(() => {
      const activeTab = tabRefs.current[value]
      const tabsList = tabsListRef.current

      if (activeTab && tabsList) {
        const tabsListRect = tabsList.getBoundingClientRect()
        const activeTabRect = activeTab.getBoundingClientRect()

        setIndicatorStyle({
          left: activeTabRect.left - tabsListRect.left,
          width: activeTabRect.width
        })
      }
    })
  }, [value])

  // 监听 value 变化，更新指示器
  useEffect(() => {
    updateIndicator()
  }, [value, updateIndicator])

  // 监听窗口大小变化，更新指示器
  useEffect(() => {
    const handleResize = () => updateIndicator()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [updateIndicator])

  // 初始化时更新一次
  useEffect(() => {
    const timer = setTimeout(updateIndicator, 100)
    return () => clearTimeout(timer)
  }, [updateIndicator])

  return (
    <TabsList
      ref={tabsListRef}
      className={cn(
        "bg-gray-100/80 dark:bg-gray-900/80 h-8 p-0.5 rounded-lg border border-black/5 dark:border-white/5 relative",
        tabsListClassName,
        className
      )}
    >
      {/* 滑动指示器 */}
      {indicatorStyle.width > 0 && (
        <div
          className="absolute bottom-0.5 top-0.5 rounded-md bg-white dark:bg-gray-700 shadow-sm z-0"
          style={{
            left: `${indicatorStyle.left}px`,
            width: `${indicatorStyle.width}px`,
            // Material Design 标准曲线，位置稍快，宽度稍慢，产生自然的"追赶"效果
            transition: 'left 250ms cubic-bezier(0.4, 0, 0.2, 1), width 300ms cubic-bezier(0.4, 0, 0.2, 1)',
            // 提示浏览器优化这些属性的动画性能
            willChange: 'left, width'
          }}
        />
      )}

      {/* Tabs */}
      {tabs.map((tab) => (
        <TabsTrigger
          key={tab.value}
          ref={(el) => {
            tabRefs.current[tab.value] = el
          }}
          value={tab.value}
          className={cn(
            "px-3 h-7 text-[11px] font-semibold rounded-md relative z-10 transition-colors duration-200",
            "data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400",
            "text-gray-600 dark:text-gray-400",
            "focus-visible:outline-none",
            tabsTriggerClassName
          )}
        >
          {tab.icon && <span className="mr-1.5">{tab.icon}</span>}
          {tab.label}
        </TabsTrigger>
      ))}
    </TabsList>
  )
}
