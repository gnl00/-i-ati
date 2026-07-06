import { cn } from '@renderer/lib/utils'
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@renderer/components/ui/tooltip'
import { Check, ChevronDown, ShieldCheck, ShieldQuestion } from 'lucide-react'
import React from 'react'
import type { PermissionApprovalMode } from '@shared/tools/approval'

interface PermissionApprovalModeSelectorProps {
  value: PermissionApprovalMode
  onChange: (mode: PermissionApprovalMode) => void
  variant?: 'default' | 'baseline' | 'surface'
}

const MODE_META: Record<PermissionApprovalMode, {
  label: string
  shortLabel: string
  tooltip: string
  icon: React.ComponentType<{ className?: string, strokeWidth?: number }>
}> = {
  manual: {
    label: 'Manual',
    shortLabel: 'Ask',
    tooltip: 'Manual: risky actions ask first',
    icon: ShieldQuestion
  },
  auto: {
    label: 'Auto',
    shortLabel: 'Auto',
    tooltip: 'Auto: approve actions in this chat',
    icon: ShieldCheck
  }
}

const wrapperClassName = () => cn(
  'app-undragable inline-flex shrink-0 items-center'
)

const triggerClassName = (variant: PermissionApprovalModeSelectorProps['variant']) => cn(
  'inline-flex h-8 shrink-0 items-center gap-1.5 border px-2 text-xs font-semibold',
  variant === 'default' ? 'rounded-2xl' : 'rounded-xl',
  'transition-all duration-200 ease-out focus-visible:outline-hidden focus-visible:ring-0 focus-visible:ring-offset-0',
  'active:scale-95 hover:shadow-xs',
  variant === 'default'
    ? 'border-slate-200/75 bg-white/45 text-slate-500 hover:border-slate-300 hover:bg-white/75 hover:text-slate-800 dark:border-slate-700/75 dark:bg-zinc-900/45 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-zinc-800/70'
    : 'border-border/30 bg-background/35 text-muted-foreground hover:border-border/55 hover:bg-foreground/[0.04] hover:text-foreground'
)

const PermissionApprovalModeSelector: React.FC<PermissionApprovalModeSelectorProps> = ({
  value,
  onChange,
  variant = 'baseline'
}) => {
  const [open, setOpen] = React.useState(false)
  const current = MODE_META[value]
  const CurrentIcon = current.icon

  const handleValueChange = (nextValue: string) => {
    onChange(nextValue === 'auto' ? 'auto' : 'manual')
  }

  return (
    <TooltipProvider delayDuration={350}>
      <div className={wrapperClassName()}>
        <Tooltip>
          <DropdownMenu open={open} onOpenChange={setOpen}>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={triggerClassName(variant)}
                  aria-label="Permission approval mode"
                >
                  <CurrentIcon className="h-3.5 w-3.5" strokeWidth={2} />
                  <span className="select-none">{current.shortLabel}</span>
                  <ChevronDown
                    className={cn(
                      'h-3 w-3 opacity-55 transition-transform duration-200',
                      open && 'rotate-180'
                    )}
                    strokeWidth={2}
                  />
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <DropdownMenuContent
              align="start"
              sideOffset={8}
              className={cn(
                'w-56 rounded-2xl border border-border/60 bg-popover/95 p-1.5 text-popover-foreground',
                'shadow-xl shadow-black/10 backdrop-blur-xl'
              )}
            >
              <DropdownMenuLabel className="px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground/75">
                Approval mode
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup value={value} onValueChange={handleValueChange}>
                {(Object.keys(MODE_META) as PermissionApprovalMode[]).map(mode => {
                  const meta = MODE_META[mode]
                  const Icon = meta.icon

                  return (
                    <DropdownMenuPrimitive.RadioItem
                      key={mode}
                      value={mode}
                      className={cn(
                        'relative my-0.5 flex cursor-pointer select-none items-center gap-2 rounded-lg border border-transparent px-2 py-2 text-xs font-medium text-foreground outline-hidden',
                        'transition-colors focus:bg-accent/70 data-[state=checked]:bg-foreground/[0.035]'
                      )}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={2} />
                      <span className="min-w-0 flex-1 truncate select-none">{meta.label}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {mode === 'manual' ? 'Ask first' : 'Approve'}
                      </span>
                      <span
                        className={cn(
                          'ml-2 grid h-5 w-5 shrink-0 place-items-center rounded-md border text-foreground shadow-xs',
                          mode === value
                            ? 'border-border/60 bg-background/85 opacity-100'
                            : 'border-transparent bg-transparent opacity-0'
                        )}
                      >
                        <DropdownMenuPrimitive.ItemIndicator>
                          <Check className="h-3.5 w-3.5" />
                        </DropdownMenuPrimitive.ItemIndicator>
                      </span>
                    </DropdownMenuPrimitive.RadioItem>
                  )
                })}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <TooltipContent className="rounded-lg border border-slate-700/50 bg-slate-900/95 px-3 py-1.5 text-xs text-slate-100 shadow-xl shadow-black/20 backdrop-blur-xl dark:border-slate-600/50 dark:bg-slate-800/95">
            <p className="font-medium">{current.tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  )
}

export default PermissionApprovalModeSelector
