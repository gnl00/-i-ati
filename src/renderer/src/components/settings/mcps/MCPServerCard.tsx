import React from 'react'
import InlineDeleteConfirm from '../common/InlineDeleteConfirm'
import { cn } from '@renderer/lib/utils'
import {
  settingsOutlineButtonClassName,
  settingsPrimaryButtonClassName
} from '../common/SettingsLayout'
import type { RegistryServerItem } from './MCPServersManager.types'
import {
  AlertCircle,
  Check,
  Copy,
  Download,
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
  if (!connectionType) return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
  if (connectionType === 'sse') return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-200'
  if (connectionType === 'npm') return 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-200'
  if (connectionType === 'STDIO') return 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-200'
  if (connectionType === 'streamableHttp') return 'bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-200'
  return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
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
        tone: 'text-gray-500 dark:text-gray-400',
        icon: <PackageOpen className="h-2.5 w-2.5" />,
        background: 'bg-gray-100 dark:bg-gray-700'
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
  const configDisplay = mode === 'installed' ? getInstalledConfigDisplay(props.config) : undefined
  const detailText = mode === 'installed'
    ? configDisplay || description || 'Installed locally'
    : description || (repository?.url ? repository.source || 'Repository' : 'Available in official registry')

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl border transition-all duration-200',
        'bg-white dark:bg-gray-800',
        'border-gray-200 dark:border-gray-700',
        'hover:bg-gray-50/70 hover:shadow-xs dark:hover:bg-gray-700/40'
      )}
      style={animationDelay !== undefined ? {
        animationDelay: `${animationDelay}ms`,
        animation: 'fadeInUp 0.45s ease-out forwards',
        opacity: 0
      } : undefined}
    >
      <div className="relative flex h-full flex-col">
        <div className="flex flex-col gap-2 p-3 pb-2.5">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex min-w-0 items-baseline gap-1.5">
                <h4 className="min-w-0 truncate text-[13px] font-semibold tracking-tight text-gray-900 dark:text-gray-100">
                  {displayName}
                </h4>
                {version && (
                  <span className="shrink-0 rounded-sm bg-gray-100 px-1.5 text-[9.5px] font-medium leading-4 text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                    v{version}
                  </span>
                )}
              </div>
              <p className="truncate font-mono text-[10px] tracking-tight text-gray-400 dark:text-gray-500">
                @{name}
              </p>
            </div>

            {mode === 'registry' && isInstalled ? (
              <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md bg-emerald-50 px-2 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                <Check className="h-3 w-3" />
                Added
              </span>
            ) : (
              <span className={cn(
                'inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium',
                runtimeMeta.tone,
                runtimeMeta.background
              )}>
                {runtimeMeta.icon}
                {runtimeMeta.label}
              </span>
            )}
          </div>

          {mode === 'registry' && repository?.url && !description ? (
            <a
              href={repository.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-w-0 items-center gap-1 text-[11px] leading-5 text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-3 w-3 shrink-0" />
              <span className="min-w-0 truncate">{detailText}</span>
            </a>
          ) : mode === 'installed' && configDisplay ? (
            <code
              className="block min-w-0 truncate font-mono text-[10.5px] leading-5 text-gray-500 dark:text-gray-400"
              title={configDisplay}
            >
              {detailText}
            </code>
          ) : (
            <span className="line-clamp-1 text-[11.5px] leading-5 text-gray-500 dark:text-gray-400">
              {detailText}
            </span>
          )}

          {runtimeStatus === 'error' && runtimeError && (
            <p className="line-clamp-2 rounded-md bg-red-50 px-2 py-1.5 text-[10.5px] leading-relaxed text-red-600 dark:bg-red-900/40 dark:text-red-300">
              {runtimeError}
            </p>
          )}
        </div>

        <div className="mt-auto flex min-w-0 items-center justify-between gap-3 bg-gray-50/80 px-3 py-2 transition-colors duration-200 group-hover:bg-gray-100/70 dark:bg-gray-900/40 dark:group-hover:bg-gray-900/60">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {connectionType && (
              <span
                className={cn(
                  'inline-flex h-[18px] shrink-0 cursor-default select-none items-center rounded-md px-1.5 text-[9px] font-semibold uppercase tracking-[0.08em]',
                  getConnectionTone(connectionType)
                )}
              >
                {connectionType}
              </span>
            )}
            {typeof toolCount === 'number' && isInstalled && (
              <span className="inline-flex h-[18px] shrink-0 items-center gap-1 rounded-md bg-white px-1.5 text-[10px] font-medium text-gray-500 ring-1 ring-inset ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700">
                <SquareTerminal className="h-2.5 w-2.5" />
                {toolCount} tools
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
                  height={24}
                  iconClassName="text-[11px]"
                />
              ) : (
                <button
                  onClick={props.onInstall}
                  className={cn(settingsPrimaryButtonClassName, 'h-6 px-2.5 text-[10.5px]')}
                >
                  <Download className="h-3 w-3" />
                  Install
                </button>
              )
            ) : (
              <>
                <button
                  onClick={props.onCopyConfig}
                  className={cn(settingsOutlineButtonClassName, 'h-6 px-2 text-[10.5px] border-transparent')}
                  title="Copy JSON configuration"
                >
                  <Copy className="h-3 w-3" />
                  Copy
                </button>

                <InlineDeleteConfirm
                  onConfirm={async () => { props.onUninstall?.() }}
                  ariaLabel="Remove server"
                  title="Remove server"
                  idleLabel="Remove"
                  width={72}
                  height={24}
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
