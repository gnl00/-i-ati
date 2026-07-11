import React, { useEffect, useState } from 'react'
import { AlertTriangle, Bot, Check, Copy, ShieldAlert, Terminal } from 'lucide-react'
import { Button } from '@renderer/shared/components/ui/button'
import { cn } from '@renderer/shared/lib/utils'
import type { AgentConfirmationSource } from '@shared/tools/approval'

export interface CommandConfirmationRequest {
  command: string
  risk_level: 'risky' | 'dangerous'
  execution_reason: string
  possible_risk: string
  risk_score?: number
  agent?: AgentConfirmationSource
  pending_count?: number
}

interface CommandConfirmationProps {
  request: CommandConfirmationRequest
  onConfirm: () => void | Promise<void>
  onCancel: () => void | Promise<void>
  className?: string
  disabled?: boolean
  animateOnMount?: boolean
}

function getRiskLevelConfig(riskLevel: 'risky' | 'dangerous') {
  if (riskLevel === 'dangerous') {
    return {
      icon: ShieldAlert,
      label: 'Dangerous',
      title: 'Command requires explicit approval',
      shellBg: 'bg-black/5 backdrop-blur-3xl dark:bg-white/5',
      shellBorder: 'border-rose-200/55 dark:border-rose-900/55',
      iconBg: 'bg-rose-50 dark:bg-rose-950',
      iconColor: 'text-rose-500/80 dark:text-rose-300/85',
      badge: 'border-rose-300/80 bg-rose-50/85 text-rose-700 dark:border-rose-800/80 dark:bg-rose-950/40 dark:text-rose-200',
      titleColor: 'text-rose-950 dark:text-rose-50',
      reasonTone: 'text-rose-700 dark:text-rose-300',
      commandTone: 'text-rose-950 dark:text-rose-100',
      commandShell: 'border-rose-200/70 bg-white/70 backdrop-blur-3xl dark:border-rose-900/70 dark:bg-slate-950',
      executeButton: 'bg-rose-600 text-white hover:bg-rose-700 dark:bg-rose-600 dark:hover:bg-rose-500',
      cancelButton: 'text-slate-500 hover:bg-white/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900/70 dark:hover:text-slate-100'
    }
  }

  return {
    icon: AlertTriangle,
    label: 'Risky',
    title: 'Command may change local state',
    shellBg: 'bg-black/5 backdrop-blur-3xl dark:bg-white/5',
    shellBorder: 'border-amber-200/55 dark:border-amber-900/55',
    iconBg: 'bg-amber-50 dark:bg-amber-950',
    iconColor: 'text-amber-500/80 dark:text-amber-300/85',
    badge: 'border-amber-300/80 bg-amber-50/85 text-amber-700 dark:border-amber-800/80 dark:bg-amber-950/40 dark:text-amber-200',
    titleColor: 'text-amber-950 dark:text-amber-50',
    reasonTone: 'text-amber-700 dark:text-amber-300',
    commandTone: 'text-slate-900 dark:text-slate-100',
    commandShell: 'border-amber-200/70 bg-white/70 backdrop-blur-3xl dark:border-amber-900/70 dark:bg-slate-950',
    executeButton: 'bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white',
    cancelButton: 'text-slate-500 hover:bg-white/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900/70 dark:hover:text-slate-100'
  }
}

function getAgentLabel(agent?: AgentConfirmationSource): string | null {
  if (!agent) return null
  if (agent.kind === 'subagent') {
    return agent.role ? `Subagent · ${agent.role}` : 'Subagent'
  }
  return 'Main agent'
}

export const CommandConfirmation: React.FC<CommandConfirmationProps> = ({
  request,
  onConfirm,
  onCancel,
  className,
  disabled = false,
  animateOnMount = true
}) => {
  const config = getRiskLevelConfig(request.risk_level)
  const Icon = config.icon
  const agentLabel = getAgentLabel(request.agent)
  const [isVisible, setIsVisible] = useState(!animateOnMount)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!animateOnMount) {
      setIsVisible(true)
      return
    }

    setIsVisible(false)
    const timer = setTimeout(() => setIsVisible(true), 50)
    return () => clearTimeout(timer)
  }, [animateOnMount])

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1200)
    return () => clearTimeout(timer)
  }, [copied])

  const handleCopy = async () => {
    await navigator.clipboard.writeText(request.command)
    setCopied(true)
  }

  return (
    <div
      data-testid="command-confirmation"
      aria-busy={disabled || undefined}
      className={cn(
        'my-2 flex max-h-full min-h-0 flex-col overflow-hidden',
        animateOnMount ? 'transition-transform duration-200 ease-out' : 'transition-none',
        isVisible ? 'translate-y-0' : 'translate-y-2',
        disabled && 'pointer-events-none',
        className
      )}
    >
      <div
        data-testid="command-confirmation-shell"
        className={cn(
          'relative flex max-h-full min-h-0 flex-auto flex-col overflow-hidden rounded-2xl shadow-[0_12px_28px_-24px_rgba(15,23,42,0.24)]',
          config.shellBg
        )}
      >
        <div className="relative flex max-h-full min-h-0 flex-auto flex-col p-2.5">
          <div
            data-testid="command-confirmation-header"
            className="grid shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2"
          >
            <div className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md', config.iconBg)}>
              <Icon className={cn('h-3 w-3', config.iconColor)} />
            </div>

            <div className="min-w-0">
              <h3 className={cn('line-clamp-2 min-w-0 wrap-break-word text-[12px] leading-4 font-medium', config.titleColor)}>
                {request.execution_reason || config.title}
              </h3>
              {(agentLabel || request.agent?.task || (request.pending_count && request.pending_count > 1)) && (
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] leading-none text-slate-500 dark:text-slate-400">
                  {agentLabel && (
                    <span className="inline-flex items-center gap-1">
                      <Bot className="h-2.5 w-2.5" />
                      {agentLabel}
                    </span>
                  )}
                  {request.agent?.task && (
                    <span className="max-w-[280px] truncate">
                      Task: {request.agent.task}
                    </span>
                  )}
                  {request.pending_count && request.pending_count > 1 && (
                    <span>+{request.pending_count - 1} more pending</span>
                  )}
                </div>
              )}
            </div>

            <div
              data-testid="command-confirmation-actions"
              className="flex shrink-0 self-start justify-end"
            >
              <div
                data-testid="command-confirmation-actions-shell"
                className="flex items-center justify-end gap-0.5 rounded-xl border border-white bg-white p-0.5 shadow-none dark:border-slate-800 dark:bg-slate-900"
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onCancel}
                  disabled={disabled}
                  className={cn(
                    'h-7 rounded-lg px-2.5 text-[10px] font-medium shadow-none transition-colors',
                    config.cancelButton
                  )}
                >
                  Cancel
                </Button>

                <Button
                  size="sm"
                  onClick={onConfirm}
                  disabled={disabled}
                  className={cn(
                    'h-7 rounded-lg px-2.5 text-[10px] font-semibold shadow-none transition-colors',
                    config.executeButton
                  )}
                >
                  Execute
                </Button>
              </div>
            </div>
          </div>

          <div
            data-testid="command-confirmation-review"
            className="mt-2.5 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin]"
          >
            <div className="space-y-1.5">
              <div className={cn(
                'rounded-xl border',
                config.commandShell
              )}>
                <div className="flex items-start gap-2 px-2.5 py-2">
                  <Terminal className="mt-0.5 h-3 w-3 shrink-0 text-slate-500 dark:text-slate-400" />
                  <div
                    data-testid="command-confirmation-command"
                    className="max-h-16 min-w-0 flex-1 overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin]"
                  >
                    <code
                      className={cn(
                        'block break-all text-[10px] leading-[1.4] font-mono',
                        config.commandTone
                      )}
                    >
                      {request.command}
                    </code>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopy}
                    aria-label="Copy command"
                    className="shrink-0 rounded-full p-1 text-slate-400 transition-colors hover:bg-white/70 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-900/70 dark:hover:text-slate-200"
                  >
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
              </div>

              <p className={cn('min-w-0 flex-1 wrap-break-word text-left text-[10px] leading-[1.4]', config.reasonTone)}>
                {request.possible_risk}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
