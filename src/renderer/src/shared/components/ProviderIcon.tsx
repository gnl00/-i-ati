import React from 'react'

import { getProviderIconDescriptor } from '@renderer/shared/lib/providerIcons'
import { cn } from '@renderer/shared/lib/utils'

interface ProviderIconProps {
  provider?: string
  alt: string
  className?: string
  disabled?: boolean
  draggable?: boolean
}

const enabledMonochromeClassName = [
  'text-gray-700 dark:text-(--app-text-body)',
  'group-hover:text-gray-900 dark:group-hover:text-(--app-text-primary)'
].join(' ')

const disabledMonochromeClassName = 'text-gray-400 dark:text-(--app-text-muted)'

export const ProviderIcon: React.FC<ProviderIconProps> = ({
  provider,
  alt,
  className,
  disabled = false,
  draggable = false
}) => {
  const descriptor = getProviderIconDescriptor(provider)

  if (descriptor.appearance === 'brand') {
    return (
      <img
        src={descriptor.src}
        alt={alt}
        aria-hidden={alt ? undefined : true}
        draggable={draggable}
        data-provider-icon-appearance={descriptor.appearance}
        className={cn(
          'inline-block shrink-0 object-contain select-none',
          disabled && 'grayscale opacity-45',
          className
        )}
      />
    )
  }

  return (
    <span
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      data-provider-icon-appearance={descriptor.appearance}
      className={cn(
        'inline-block shrink-0 bg-current select-none',
        disabled ? disabledMonochromeClassName : enabledMonochromeClassName,
        className
      )}
      style={{
        WebkitMaskImage: `url("${descriptor.src}")`,
        maskImage: `url("${descriptor.src}")`,
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskSize: 'contain',
        maskSize: 'contain'
      }}
    />
  )
}
