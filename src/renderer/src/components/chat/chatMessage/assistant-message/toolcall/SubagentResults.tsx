import { cn } from '@renderer/lib/utils'
import { useSubagentRuntimeStore } from '@renderer/store/subagentRuntime'
import { Bot, CheckCircle2, Clock3, Loader2, ShieldAlert, XCircle } from 'lucide-react'
import React, { useMemo } from 'react'
import type { BuiltInSubagentRole, SubagentRecord, SubagentStatus } from '@tools/subagent/index.d'

type SubagentResultsProps = {
  toolName: string
  payload: any
}

const ROLE_LABELS: Record<BuiltInSubagentRole, string> = {
  general: 'General',
  researcher: 'Researcher',
  coder: 'Coder',
  reviewer: 'Reviewer'
}

function formatRoleLabel(role: string): string {
  return ROLE_LABELS[role as BuiltInSubagentRole]
    || role
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, char => char.toUpperCase())
}

function getStatusMeta(status: SubagentStatus | undefined) {
  switch (status) {
    case 'completed':
      return {
        label: 'Completed',
        icon: CheckCircle2,
        className: 'bg-emerald-100/85 text-emerald-700 dark:bg-emerald-900/24 dark:text-emerald-300'
      }
    case 'failed':
      return {
        label: 'Failed',
        icon: XCircle,
        className: 'bg-red-100/85 text-red-700 dark:bg-red-900/24 dark:text-red-300'
      }
    case 'cancelled':
      return {
        label: 'Cancelled',
        icon: ShieldAlert,
        className: 'bg-amber-100/85 text-amber-700 dark:bg-amber-900/24 dark:text-amber-200'
      }
    case 'running':
      return {
        label: 'Running',
        icon: Loader2,
        className: 'bg-blue-100/85 text-blue-700 dark:bg-blue-900/24 dark:text-blue-300'
      }
    case 'waiting_for_confirmation':
      return {
        label: 'Waiting for confirmation',
        icon: ShieldAlert,
        className: 'bg-amber-100/85 text-amber-700 dark:bg-amber-900/24 dark:text-amber-200'
      }
    case 'queued':
    default:
      return {
        label: 'Queued',
        icon: Clock3,
        className: 'bg-slate-100/85 text-slate-700 dark:bg-slate-800/80 dark:text-slate-300'
      }
  }
}

function normalizeSummary(summary?: string): string {
  if (!summary) return ''
  return summary
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n')
}

export const SubagentResults: React.FC<SubagentResultsProps> = React.memo(({ toolName, payload }) => {
  const baseSubagent = (payload?.subagent ?? payload) as SubagentRecord | undefined
  const liveSubagent = useSubagentRuntimeStore(state => (
    baseSubagent?.id ? state.recordsById[baseSubagent.id] : undefined
  ))
  const subagent = liveSubagent ?? baseSubagent
  const message = typeof payload?.message === 'string' ? payload.message : undefined
  const success = typeof payload?.success === 'boolean' ? payload.success : undefined

  const status = subagent?.status ?? (toolName === 'subagent_spawn' ? 'queued' : undefined)
  const statusMeta = getStatusMeta(status)
  const StatusIcon = statusMeta.icon
  const toolsUsed = subagent?.artifacts?.tools_used ?? []
  const filesTouched = subagent?.artifacts?.files_touched ?? []
  const summary = normalizeSummary(subagent?.summary)

  const duration = useMemo(() => {
    if (!subagent?.started_at || !subagent?.finished_at) return undefined
    return ((subagent.finished_at - subagent.started_at) / 1000).toFixed(3)
  }, [subagent?.finished_at, subagent?.started_at])

  if (!subagent) {
    return null
  }

  return (
    <div className="space-y-2.5 p-3 bg-slate-100/45 dark:bg-slate-900/28">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex items-start gap-2.5">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-200/60 text-slate-600 dark:bg-white/6 dark:text-slate-300">
            <Bot className="h-4 w-4" />
          </span>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-semibold leading-none',
                statusMeta.className
              )}>
                <StatusIcon className={cn('h-3 w-3', status === 'running' && 'animate-spin')} />
                {statusMeta.label}
              </span>
              <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                {formatRoleLabel(subagent.role)}
              </span>
              {duration && (
                <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                  {duration}s
                </span>
              )}
            </div>
            <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300 break-words">
              {subagent.task}
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-slate-200/65 px-2 py-1 text-[10px] font-mono text-slate-500 dark:bg-white/6 dark:text-slate-400">
          {toolName === 'subagent_spawn' ? 'SPAWN' : 'WAIT'}
        </span>
      </div>

      {(summary || subagent.error || message) && (
        <div className="rounded-xl bg-white/72 px-3 py-2 ring-1 ring-slate-200/45 dark:bg-white/4 dark:ring-white/6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
            {status === 'failed' ? 'Error' : 'Summary'}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
            {subagent.error || summary || message}
          </p>
          {success === false && !subagent.error && message && !summary && (
            <p className="mt-1 text-[10px] text-red-600 dark:text-red-300">
              Tool returned an unsuccessful result.
            </p>
          )}
        </div>
      )}

      {(toolsUsed.length > 0 || filesTouched.length > 0) && (
        <div className="space-y-2">
          {toolsUsed.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                Tools
              </span>
              {toolsUsed.map(tool => (
                <span
                  key={tool}
                  className="inline-flex items-center rounded-full bg-slate-200/70 px-2 py-0.5 text-[10px] font-mono text-slate-600 dark:bg-white/6 dark:text-slate-300"
                >
                  {tool}
                </span>
              ))}
            </div>
          )}

          {filesTouched.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                Files
              </span>
              {filesTouched.map(file => (
                <span
                  key={file}
                  className="inline-flex items-center rounded-full bg-blue-100/75 px-2 py-0.5 text-[10px] font-mono text-blue-700 dark:bg-blue-900/24 dark:text-blue-300"
                >
                  {file}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
})
