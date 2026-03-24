import React, { useEffect, useState } from 'react'
import { AlertTriangle, Bot, Check, Copy, ShieldAlert, Terminal } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
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
  onConfirm: () => void
  onCancel: () => void
  className?: string
}

function getRiskLevelConfig(riskLevel: 'risky' | 'dangerous') {
  if (riskLevel === 'dangerous') {
    return {
      icon: ShieldAlert,
      label: 'Dangerous',
      title: 'Command requires explicit approval',
      shellBg: 'bg-rose-950/[0.06] dark:bg-rose-950/28',
      shellBorder: 'border-rose-200/55 dark:border-rose-900/55',
      iconBg: 'bg-rose-500/8 dark:bg-rose-500/10',
      iconColor: 'text-rose-500/80 dark:text-rose-300/85',
      badge: 'border-rose-300/80 bg-rose-50/85 text-rose-700 dark:border-rose-800/80 dark:bg-rose-950/40 dark:text-rose-200',
      titleColor: 'text-rose-950 dark:text-rose-50',
      reasonTone: 'text-rose-700 dark:text-rose-300',
      commandTone: 'text-rose-950 dark:text-rose-100',
      commandShell: 'border-rose-200/48 bg-rose-50/34 dark:border-rose-900/30 dark:bg-rose-950/12',
      executeButton: 'bg-rose-600 text-white hover:bg-rose-700 dark:bg-rose-600 dark:hover:bg-rose-500',
      cancelButton: 'text-slate-500 hover:bg-white/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900/70 dark:hover:text-slate-100'
    }
  }

  return {
    icon: AlertTriangle,
    label: 'Risky',
    title: 'Command may change local state',
    shellBg: 'bg-amber-950/[0.04] dark:bg-amber-950/22',
    shellBorder: 'border-amber-200/55 dark:border-amber-900/55',
    iconBg: 'bg-amber-500/8 dark:bg-amber-500/10',
    iconColor: 'text-amber-500/80 dark:text-amber-300/85',
    badge: 'border-amber-300/80 bg-amber-50/85 text-amber-700 dark:border-amber-800/80 dark:bg-amber-950/40 dark:text-amber-200',
    titleColor: 'text-amber-950 dark:text-amber-50',
    reasonTone: 'text-amber-700 dark:text-amber-300',
    commandTone: 'text-slate-900 dark:text-slate-100',
    commandShell: 'border-amber-200/48 bg-amber-50/30 dark:border-amber-900/30 dark:bg-amber-950/10',
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
  className
}) => {
  const config = getRiskLevelConfig(request.risk_level)
  const Icon = config.icon
  const agentLabel = getAgentLabel(request.agent)
  const [isVisible, setIsVisible] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50)
    return () => clearTimeout(timer)
  }, [])

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
      className={cn(
        'my-2 transition-all duration-300 ease-out',
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2',
        className
      )}
    >
      <div
        className={cn(
          'relative overflow-hidden rounded-2xl shadow-[0_12px_28px_-24px_rgba(15,23,42,0.24)] backdrop-blur-xl',
          'bg-white/52 dark:bg-slate-950/34',
          config.shellBg
        )}
      >
        <div className="relative p-2.5">
          <div className="flex items-center gap-2">
            <div className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md', config.iconBg)}>
              <Icon className={cn('h-3 w-3', config.iconColor)} />
            </div>

            <div className="min-w-0 flex-1">
              <h3 className={cn('min-w-0 text-[12px] leading-none font-medium', config.titleColor)}>
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
                    <span className="truncate max-w-[280px]">
                      Task: {request.agent.task}
                    </span>
                  )}
                  {request.pending_count && request.pending_count > 1 && (
                    <span>+{request.pending_count - 1} more pending</span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="mt-2.5 space-y-1.5">
            <div className={cn(
              'rounded-xl border',
              config.commandShell
            )}>
              <div className="flex items-center gap-2 px-2.5 py-2">
                <Terminal className="h-3 w-3 shrink-0 text-slate-500 dark:text-slate-400" />
                <code
                  className={cn(
                    'flex-1 break-all text-[10px] leading-[1.4] font-mono',
                    config.commandTone
                  )}
                >
                  {request.command}
                </code>
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

            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
              <p className={cn('min-w-0 flex-1 text-[10px] leading-[1.4] text-left', config.reasonTone)}>
                {request.possible_risk}
              </p>

              <div className="shrink-0">
                <div className="flex items-center justify-end gap-1 rounded-full border border-white/60 bg-white/5 p-1 shadow-[0_10px_30px_-20px_rgba(15,23,42,0.45)] backdrop-blur-md dark:border-white/10 dark:bg-slate-900/55">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onCancel}
                  className={cn(
                    'h-6 rounded-full px-2.5 text-[10px] font-medium shadow-none transition-colors',
                    config.cancelButton
                  )}
                >
                  Cancel
                </Button>

                <Button
                  size="sm"
                  onClick={onConfirm}
                  className={cn(
                    'h-6 rounded-full px-2.5 text-[10px] font-semibold shadow-none transition-colors',
                    config.executeButton
                  )}
                >
                  Execute
                </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
