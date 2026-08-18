import { cn } from '@renderer/shared/lib/utils'
import { Globe, PackageCheck } from 'lucide-react'
import React from 'react'

type MCPTabValue = 'local' | 'registry'

interface MCPTabSwitcherProps {
  value: MCPTabValue
  installedCount: number
  onValueChange: (value: MCPTabValue) => void
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
  return (
    <div
      className={cn(
        'inline-flex h-8 items-center gap-0.5 rounded-lg border p-0.5 shadow-inner shrink-0',
        'border-gray-200/70 bg-gray-100/80 dark:border-(--app-border-standard) dark:bg-(--app-surface-inset)'
      )}
    >
      {tabs.map((tab) => {
        const active = tab.value === value
        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => onValueChange(tab.value)}
            className={cn(
              'flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium transition-all duration-150',
              active
                ? 'bg-white text-gray-900 shadow-xs dark:bg-(--app-surface-hover) dark:text-(--app-text-primary) dark:shadow-none'
                : 'text-gray-500 hover:bg-white/50 hover:text-gray-700 dark:text-(--app-text-secondary) dark:hover:bg-(--app-surface-hover) dark:hover:text-(--app-text-primary)'
            )}
            aria-pressed={active}
          >
            <span className="shrink-0">
              {tab.icon}
            </span>
            <span className="tracking-tight">
              {tab.label}
            </span>
            {tab.value === 'local' && (
              <span
                className={cn(
                  'rounded px-1.5 text-[10px] font-medium leading-4',
                  active
                    ? 'bg-gray-100 text-gray-500 dark:bg-(--app-surface-inset) dark:text-(--app-text-secondary)'
                    : 'bg-gray-200/70 text-gray-400 dark:bg-(--app-surface) dark:text-(--app-text-muted)'
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
