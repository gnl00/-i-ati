import React from 'react'
import InlineDeleteConfirm from '../common/InlineDeleteConfirm'
import { cn } from '@renderer/lib/utils'
import {
  AlertCircle,
  Check,
  ExternalLink,
  Loader2,
  PackageOpen,
  Plug,
  SquareTerminal
} from 'lucide-react'

type RepositoryInfo = {
  url?: string
  source?: string
}

export type MCPServerCardMode = 'registry' | 'installed'

export interface MCPServerCardProps {
  mode: MCPServerCardMode
  name: string
  title?: string
  description?: string
  version?: string
  iconUrl?: string
  connectionType?: string
  repository?: RepositoryInfo
  installed?: boolean
  configDisplay?: string
  onInstall?: () => void
  onUninstall?: () => void
  onCopyConfig?: () => void
  animationDelay?: number
  runtimeStatus?: 'connected' | 'connecting' | 'error' | 'idle'
  runtimeError?: string
  toolCount?: number
}

const getConnectionTone = (connectionType?: string): string => {
  if (!connectionType) return 'bg-slate-100/80 text-slate-600 dark:bg-slate-800/70 dark:text-slate-300'
  if (connectionType === 'sse') return 'bg-sky-50/90 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300'
  if (connectionType === 'npm') return 'bg-amber-50/90 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
  if (connectionType === 'STDIO') return 'bg-violet-50/90 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300'
  if (connectionType === 'streamableHttp') return 'bg-emerald-50/90 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
  return 'bg-slate-100/80 text-slate-600 dark:bg-slate-800/70 dark:text-slate-300'
}

const getRuntimeMeta = (
  mode: MCPServerCardProps['mode'],
  isInstalled: boolean,
  runtimeStatus: MCPServerCardProps['runtimeStatus']
): {
  label: string
  tone: string
  icon: React.ReactNode
  background: string
} => {
  if (mode === 'registry' && !isInstalled) {
    return {
      label: 'Available',
      tone: 'text-sky-700 dark:text-sky-300',
      icon: <PackageOpen className="h-2.5 w-2.5" />,
      background: 'bg-sky-50/90 dark:bg-sky-950/40'
    }
  }

  switch (runtimeStatus) {
    case 'connected':
      return {
        label: 'Connected',
        tone: 'text-emerald-600 dark:text-emerald-400',
        icon: <Plug className="h-2.5 w-2.5" />,
        background: 'bg-emerald-50/90 dark:bg-emerald-950/40'
      }
    case 'connecting':
      return {
        label: 'Connecting',
        tone: 'text-amber-600 dark:text-amber-400',
        icon: <Loader2 className="h-2.5 w-2.5 animate-spin" />,
        background: 'bg-amber-50/90 dark:bg-amber-950/40'
      }
    case 'error':
      return {
        label: 'Failed',
        tone: 'text-rose-600 dark:text-rose-400',
        icon: <AlertCircle className="h-2.5 w-2.5" />,
        background: 'bg-rose-50/90 dark:bg-rose-950/40'
      }
    default:
      return {
        label: 'Idle',
        tone: 'text-slate-500 dark:text-slate-400',
        icon: <PackageOpen className="h-2.5 w-2.5" />,
        background: 'bg-slate-100/80 dark:bg-slate-800/80'
      }
  }
}

const MCPServerCard: React.FC<MCPServerCardProps> = ({
  mode,
  name,
  title,
  description,
  version,
  iconUrl,
  connectionType,
  repository,
  installed,
  configDisplay,
  onInstall,
  onUninstall,
  onCopyConfig,
  animationDelay,
  runtimeStatus = 'idle',
  runtimeError,
  toolCount
}) => {
  const displayName = (title || name).substring((title || name).indexOf('/') + 1)
  const isInstalled = mode === 'installed' || Boolean(installed)
  const runtimeMeta = getRuntimeMeta(mode, isInstalled, runtimeStatus)

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-[18px] border transition-all duration-300',
        'bg-white/72 shadow-xs backdrop-blur-xl',
        'dark:bg-slate-950/55 dark:shadow-[0_14px_44px_-28px_rgba(2,6,23,0.78)]',
        'border-white/70 dark:border-white/10',
        'hover:-translate-y-0.5 hover:shadow-sm',
        mode === 'installed' && 'ring-1 ring-emerald-500/10 dark:ring-emerald-400/10',
        installed && mode === 'registry' && 'opacity-75 hover:opacity-100'
      )}
      style={animationDelay !== undefined ? {
        animationDelay: `${animationDelay}ms`,
        animation: 'fadeInUp 0.45s ease-out forwards',
        opacity: 0
      } : undefined}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-linear-to-br from-white/55 via-white/10 to-transparent dark:from-white/10 dark:via-white/3 dark:to-transparent" />

      <div className="relative flex h-full flex-col gap-2.5 p-3">
        <div className="flex items-start gap-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/70 bg-white/75 shadow-sm dark:border-white/10 dark:bg-slate-900/75">
            {mode === 'registry' && iconUrl ? (
              <img
                src={iconUrl}
                alt=""
                className="h-5.5 w-5.5 rounded-lg object-cover opacity-95"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                  const parent = e.currentTarget.parentElement
                  if (parent && !parent.querySelector('[data-fallback]')) {
                    const fallback = document.createElement('span')
                    fallback.dataset.fallback = 'true'
                    fallback.className = 'text-[13px] font-semibold text-slate-600 dark:text-slate-300 uppercase'
                    fallback.textContent = displayName.charAt(0)
                    parent.appendChild(fallback)
                  }
                }}
              />
            ) : (
              <span className="text-[13px] font-semibold uppercase text-slate-600 dark:text-slate-300">
                {displayName.charAt(0)}
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex min-w-0 items-start justify-between gap-2.5">
              <div className="min-w-0 space-y-0.5">
                <div className="flex min-w-0 items-center gap-1.5">
                  <h4 className="truncate text-[13px] font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                    {displayName}
                  </h4>
                  {version && (
                    <span className="shrink-0 rounded-md bg-slate-100/90 px-1.5 py-0.5 text-[9.5px] font-medium text-slate-500 dark:bg-slate-800/85 dark:text-slate-400">
                      v{version}
                    </span>
                  )}
                </div>
                <p className="truncate font-mono text-[10px] tracking-tight text-slate-400 dark:text-slate-500">
                  @{name}
                </p>
              </div>

              <div className="shrink-0">
                {mode === 'registry' && isInstalled ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50/90 px-2 py-0.75 text-[9.5px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                    <Check className="h-2.5 w-2.5" />
                    Added
                  </span>
                ) : (
                  <span className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.75 text-[9.5px] font-medium',
                    runtimeMeta.tone,
                    runtimeMeta.background
                  )}>
                    {runtimeMeta.icon}
                    {runtimeMeta.label}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {connectionType && (
                <span
                  className={cn(
                    'inline-flex h-[18px] cursor-default select-none items-center rounded-md px-2 py-0 text-[9px] font-semibold uppercase tracking-[0.08em]',
                    getConnectionTone(connectionType)
                  )}
                >
                  {connectionType}
                </span>
              )}
              {typeof toolCount === 'number' && isInstalled && (
                <span className="inline-flex items-center gap-1 rounded-md bg-slate-100/70 px-2 py-0.75 text-[9.5px] font-medium text-slate-500 dark:bg-slate-800/70 dark:text-slate-400">
                  <SquareTerminal className="h-2.5 w-2.5" />
                  {toolCount} tools
                </span>
              )}
            </div>
          </div>
        </div>

        {description && (
          <p className="line-clamp-2 text-[11.5px] leading-relaxed text-slate-500 dark:text-slate-400">
            {description}
          </p>
        )}

        {runtimeStatus === 'error' && runtimeError && (
          <p className="rounded-xl bg-rose-50/90 px-2.5 py-2 text-[10.5px] leading-relaxed text-rose-600 dark:bg-rose-950/30 dark:text-rose-300">
            {runtimeError}
          </p>
        )}

        <div className="mt-auto flex items-center justify-between gap-2.5 border-t border-slate-200/60 pt-2.5 dark:border-white/10">
          <div className="min-w-0 flex-1">
            {mode === 'registry' && repository?.url ? (
              <a
                href={repository.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex max-w-full items-center gap-1.5 text-[10.5px] font-medium text-slate-400 transition-colors hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-3 w-3 shrink-0" />
                <span className="truncate">{repository.source || 'Repository'}</span>
              </a>
            ) : mode === 'installed' && configDisplay ? (
              <code
                className="block truncate font-mono text-[10px] text-slate-400 dark:text-slate-500"
                title={configDisplay}
              >
                {configDisplay}
              </code>
            ) : (
              <span className="text-[10.5px] text-slate-400 dark:text-slate-500">
                {mode === 'registry' ? 'Available in official registry' : 'Installed locally'}
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {mode === 'registry' ? (
              isInstalled ? (
                <InlineDeleteConfirm
                  onConfirm={async () => { onUninstall?.() }}
                  ariaLabel="Remove server"
                  title="Remove server"
                  idleLabel="Remove"
                  width={72}
                  height={28}
                  iconClassName="text-[11px]"
                />
              ) : (
                <button
                  onClick={onInstall}
                  className="h-7 rounded-lg bg-slate-950 px-3 text-[10.5px] font-medium text-white transition-all duration-150 hover:bg-slate-800 active:scale-[0.97] dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                >
                  Install
                </button>
              )
            ) : (
              <>
                <button
                  onClick={onCopyConfig}
                  className="h-7 rounded-lg px-2.5 text-[10.5px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  title="Copy JSON configuration"
                >
                  Copy
                </button>

                <InlineDeleteConfirm
                  onConfirm={async () => { onUninstall?.() }}
                  ariaLabel="Remove server"
                  title="Remove server"
                  idleLabel="Remove"
                  width={72}
                  height={28}
                  iconClassName="text-[11px]"
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default MCPServerCard
