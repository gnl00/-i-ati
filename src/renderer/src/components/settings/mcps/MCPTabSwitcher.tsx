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
        'inline-flex h-9 items-center gap-1 rounded-lg p-1 shadow-inner',
        'bg-gray-100 dark:bg-gray-900'
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
              'flex h-7 items-center gap-2 rounded-md px-3 text-[12px] font-medium transition-colors duration-150',
              active
                ? 'bg-white text-gray-900 shadow-xs dark:bg-gray-800 dark:text-gray-100'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            )}
          >
            <span>
              {tab.icon}
            </span>
            <span className="tracking-tight">
              {tab.label}
            </span>
            {tab.value === 'local' && (
              <span
                className={cn(
                  'rounded-md px-1.5 text-[10px] font-medium',
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
