import { cn } from '@renderer/lib/utils'
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
        'border-gray-200/70 bg-gray-100/80 dark:border-gray-700/70 dark:bg-gray-900/70'
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
                ? 'bg-white text-gray-900 shadow-xs dark:bg-gray-800 dark:text-gray-100'
                : 'text-gray-500 hover:bg-white/50 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800/50 dark:hover:text-gray-200'
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
                    ? 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300'
                    : 'bg-gray-200/70 text-gray-400 dark:bg-gray-800 dark:text-gray-500'
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
