import { useState, type JSX, type MouseEvent } from 'react'
import { Moon, Sun, SunMoon } from 'lucide-react'

import { Button } from '@renderer/shared/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@renderer/shared/components/ui/tooltip'
import { cn } from '@renderer/shared/lib/utils'
import { useTheme } from '@renderer/shared/providers/ThemeProvider'

interface ModeToggleSlideProps {
  triggerClassName?: string
}

const themeOptions = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: SunMoon }
] as const

const defaultTriggerClassName = [
  'h-8 w-8 rounded-lg border border-transparent bg-transparent p-0',
  'text-slate-600 transition-[background-color,border-color,box-shadow,color,transform] duration-200',
  'hover:border-gray-200 hover:bg-gray-100 active:scale-[0.97]',
  'focus-visible:ring-2 focus-visible:ring-blue-400/50 focus-visible:ring-offset-1',
  'dark:text-zinc-400 dark:hover:border-white/8 dark:hover:bg-white/7',
  'dark:hover:shadow-[0_6px_16px_-12px_rgba(255,255,255,0.35)]',
  'dark:focus-visible:ring-sky-400/45'
].join(' ')

export function ModeToggleSlide({
  triggerClassName
}: ModeToggleSlideProps = {}): JSX.Element {
  const { theme, setTheme } = useTheme()
  const [shouldAnimate, setShouldAnimate] = useState(false)

  const currentThemeIndex = themeOptions.findIndex(option => option.value === theme)
  const safeCurrentThemeIndex = currentThemeIndex >= 0 ? currentThemeIndex : 0
  const nextThemeIndex = (safeCurrentThemeIndex + 1) % themeOptions.length
  const currentTheme = themeOptions[safeCurrentThemeIndex]
  const nextTheme = themeOptions[nextThemeIndex]

  const handleThemeChange = (event: MouseEvent<HTMLButtonElement>): void => {
    setShouldAnimate(event.detail > 0)
    setTheme(nextTheme.value)
  }

  return (
    <TooltipProvider delayDuration={400}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            aria-label={`Theme: ${currentTheme.label}. Switch to ${nextTheme.label}`}
            data-theme={currentTheme.value}
            className={cn(defaultTriggerClassName, triggerClassName)}
            onClick={handleThemeChange}
          >
            <span className="relative block h-4 w-4 overflow-hidden" aria-hidden="true">
              {themeOptions.map(({ value, Icon }, index) => {
                const isCurrent = index === safeCurrentThemeIndex
                const isNext = index === nextThemeIndex

                return (
                  <Icon
                    key={value}
                    data-theme-icon={value}
                    className={cn(
                      'absolute inset-0 h-4 w-4',
                      shouldAnimate && [
                        'transition-[transform,opacity] duration-[180ms]',
                        'ease-[cubic-bezier(0.77,0,0.175,1)]',
                        'motion-reduce:transition-none'
                      ],
                      isCurrent && 'translate-y-0 opacity-100',
                      isNext && 'translate-y-[125%] opacity-0',
                      !isCurrent && !isNext && '-translate-y-[125%] opacity-0'
                    )}
                  />
                )
              })}
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          align="end"
          sideOffset={6}
          className={[
            'rounded-lg border border-slate-700/50 bg-slate-900/95 px-2.5 py-1.5',
            'text-xs text-slate-100 shadow-xl shadow-black/20 backdrop-blur-xl',
            'dark:border-slate-600/50 dark:bg-slate-800/95 motion-reduce:animate-none'
          ].join(' ')}
        >
          {currentTheme.label} theme · Next: {nextTheme.label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
