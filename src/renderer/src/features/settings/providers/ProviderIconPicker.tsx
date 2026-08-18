import React, { useMemo } from 'react'
import { ProviderIcon } from '@renderer/shared/components/ProviderIcon'
import { cn } from '@renderer/shared/lib/utils'
import { PROVIDER_ICON_DESCRIPTOR_MAP } from '@renderer/shared/lib/providerIcons'

type ProviderIconPickerProps = {
  value?: string
  onChange: (next?: string) => void
}

type IconOption = {
  key: string
  src: string
}

export const ProviderIconPicker: React.FC<ProviderIconPickerProps> = ({ value, onChange }) => {
  const options = useMemo<IconOption[]>(() => {
    const seen = new Set<string>()
    const unique: IconOption[] = []
    for (const [key, descriptor] of Object.entries(PROVIDER_ICON_DESCRIPTOR_MAP)) {
      if (seen.has(descriptor.src)) continue
      seen.add(descriptor.src)
      unique.push({ key, src: descriptor.src })
    }
    return unique
  }, [])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500 dark:text-(--app-text-secondary)">Icon</span>
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className={cn(
            'text-[11px] font-medium',
            'text-gray-500 hover:text-gray-700 dark:text-(--app-text-secondary) dark:hover:text-(--app-text-primary)',
            'transition-colors'
          )}
        >
          Use default
        </button>
      </div>
      <div className="grid grid-cols-6 gap-2">
        {options.map(option => {
          const isSelected = option.key === value
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => onChange(option.key)}
              className={cn(
                'group flex items-center justify-center rounded-lg p-2.5',
                'border border-transparent bg-white/70 dark:bg-(--app-surface-inset)',
                'hover:border-gray-200 dark:hover:border-(--app-border-standard) hover:shadow-xs dark:hover:bg-(--app-surface-hover)',
                'transition-all duration-200',
                isSelected && 'border-blue-300 dark:border-blue-500 bg-blue-50/70 dark:bg-blue-900/20'
              )}
              title={option.key}
            >
              <ProviderIcon
                provider={option.key}
                alt={option.key}
                className={cn(
                  'h-6 w-6 select-none',
                  'transition-transform duration-200',
                  isSelected ? 'scale-110' : 'group-hover:scale-105'
                )}
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}
