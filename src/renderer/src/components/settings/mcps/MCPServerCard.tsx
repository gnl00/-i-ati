import React from 'react'
import InlineDeleteConfirm from '../common/InlineDeleteConfirm'
import { cn } from '@renderer/lib/utils'
import type { RegistryServerItem } from './MCPServersManager.types'
import {
  AlertCircle,
  Check,
  ExternalLink,
  Loader2,
  PackageOpen,
  Plug,
  SquareTerminal
} from 'lucide-react'

type RuntimeStatus = 'connected' | 'connecting' | 'error' | 'idle'

interface MCPServerCardBaseProps {
  animationDelay?: number
  runtimeStatus?: RuntimeStatus
  runtimeError?: string
  toolCount?: number
  onUninstall?: () => void
}

interface RegistryMCPServerCardProps extends MCPServerCardBaseProps {
  mode: 'registry'
  item: RegistryServerItem
  installed?: boolean
  onInstall?: () => void
}

interface InstalledServerCardMetadata {
  description?: string
  version?: string
}

interface InstalledMCPServerCardProps extends MCPServerCardBaseProps {
  mode: 'installed'
  name: string
  config: LocalMcpServerConfig
  metadata?: InstalledServerCardMetadata
  onCopyConfig?: () => void
}

export type MCPServerCardMode = 'registry' | 'installed'
export type MCPServerCardProps = RegistryMCPServerCardProps | InstalledMCPServerCardProps

const getConnectionTone = (connectionType?: string): string => {
  if (!connectionType) return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
  if (connectionType === 'sse') return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-200'
  if (connectionType === 'npm') return 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-200'
  if (connectionType === 'STDIO') return 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-200'
  if (connectionType === 'streamableHttp') return 'bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-200'
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
}

const getRuntimeMeta = (
  mode: MCPServerCardMode,
  isInstalled: boolean,
  runtimeStatus: RuntimeStatus
): {
  label: string
  tone: string
  icon: React.ReactNode
  background: string
} => {
  if (mode === 'registry' && !isInstalled) {
    return {
      label: 'Available',
      tone: 'text-blue-600 dark:text-blue-300',
      icon: <PackageOpen className="h-2.5 w-2.5" />,
      background: 'bg-blue-50 dark:bg-blue-900/40'
    }
  }

  switch (runtimeStatus) {
    case 'connected':
      return {
        label: 'Connected',
        tone: 'text-emerald-600 dark:text-emerald-400',
        icon: <Plug className="h-2.5 w-2.5" />,
        background: 'bg-emerald-50 dark:bg-emerald-900/40'
      }
    case 'connecting':
      return {
        label: 'Connecting',
        tone: 'text-amber-600 dark:text-amber-400',
        icon: <Loader2 className="h-2.5 w-2.5 animate-spin" />,
        background: 'bg-amber-50 dark:bg-amber-900/40'
      }
    case 'error':
      return {
        label: 'Failed',
        tone: 'text-red-600 dark:text-red-400',
        icon: <AlertCircle className="h-2.5 w-2.5" />,
        background: 'bg-red-50 dark:bg-red-900/40'
      }
    default:
      return {
        label: 'Idle',
        tone: 'text-slate-500 dark:text-slate-400',
        icon: <PackageOpen className="h-2.5 w-2.5" />,
        background: 'bg-slate-100 dark:bg-slate-800'
      }
  }
}

const getDisplayName = (name: string, title?: string): string => {
  const displayName = title || name
  const slashIndex = displayName.indexOf('/')
  return slashIndex >= 0 ? displayName.substring(slashIndex + 1) : displayName
}

const getRegistryConnectionType = (item: RegistryServerItem): string | undefined => {
  return item.server.remotes?.[0]?.type || item.server.packages?.[0]?.registryType
}

const getInstalledConnectionType = (config: LocalMcpServerConfig): string | undefined => {
  return config.type || (config.command ? 'STDIO' : 'GENERIC')
}

const getInstalledConfigDisplay = (config: LocalMcpServerConfig): string | undefined => {
  return config.url || (config.command ? `${config.command} ${config.args?.join(' ') || ''}` : undefined)
}

const MCPServerCard: React.FC<MCPServerCardProps> = (props) => {
  const {
    mode,
    animationDelay,
    runtimeError,
    toolCount,
    runtimeStatus = 'idle'
  } = props

  const isInstalled = mode === 'installed' || Boolean(props.installed)
  const runtimeMeta = getRuntimeMeta(mode, isInstalled, runtimeStatus)

  const name = mode === 'registry' ? props.item.server.name : props.name
  const displayName = mode === 'registry'
    ? getDisplayName(props.item.server.name, props.item.server.title)
    : getDisplayName(props.name)
  const description = mode === 'registry' ? props.item.server.description : props.metadata?.description
  const version = mode === 'registry' ? props.item.server.version : props.metadata?.version
  const connectionType = mode === 'registry'
    ? getRegistryConnectionType(props.item)
    : getInstalledConnectionType(props.config)
  const repository = mode === 'registry' ? props.item.server.repository : undefined
  const iconUrl = mode === 'registry' ? props.item.server.icons?.[0]?.src : undefined
  const configDisplay = mode === 'installed' ? getInstalledConfigDisplay(props.config) : undefined

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl border transition-all duration-300',
        'bg-white dark:bg-slate-950',
        'border-slate-100 dark:border-slate-800',
        'hover:-translate-y-0.5 hover:shadow-xs'
      )}
      style={animationDelay !== undefined ? {
        animationDelay: `${animationDelay}ms`,
        animation: 'fadeInUp 0.45s ease-out forwards',
        opacity: 0
      } : undefined}
    >
      <div className="relative flex h-full flex-col gap-2.5 p-3">
        <div className="flex items-start gap-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 select-none">
            {mode === 'registry' && iconUrl ? (
              <img
                src={iconUrl}
                alt=""
                className="h-9 w-9 rounded-lg object-cover opacity-95"
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
              <span className="text-md font-semibold uppercase text-slate-600 dark:text-slate-300">
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
                    <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[9.5px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
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
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.75 text-[9.5px] font-medium text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
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
                <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.75 text-[9.5px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
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
          <p className="rounded-lg bg-red-50 px-2.5 py-2 text-[10.5px] leading-relaxed text-red-600 dark:bg-red-900/40 dark:text-red-300">
            {runtimeError}
          </p>
        )}

        <div className="mt-auto flex items-center justify-between gap-2.5 border-t border-slate-200 pt-3 dark:border-slate-800">
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
                  onConfirm={async () => { props.onUninstall?.() }}
                  ariaLabel="Remove server"
                  title="Remove server"
                  idleLabel="Remove"
                  width={72}
                  height={28}
                  iconClassName="text-[11px]"
                />
              ) : (
                <button
                  onClick={props.onInstall}
                  className="h-7 rounded-md bg-black px-3 text-[10.5px] font-medium text-white transition-all duration-150 hover:bg-black/70 active:scale-[0.97] dark:bg-blue-900 dark:hover:bg-blue-800"
                >
                  Install
                </button>
              )
            ) : (
              <>
                <button
                  onClick={props.onCopyConfig}
                  className="h-7 rounded-lg px-2.5 text-[10.5px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  title="Copy JSON configuration"
                >
                  Copy
                </button>

                <InlineDeleteConfirm
                  onConfirm={async () => { props.onUninstall?.() }}
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
