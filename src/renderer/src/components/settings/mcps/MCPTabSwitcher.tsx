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
        'bg-slate-100 dark:bg-slate-900'
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
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
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
                    ? 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300'
                    : 'bg-slate-200/70 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
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
