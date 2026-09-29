import React from 'react'
import InlineDeleteConfirm from '../common/InlineDeleteConfirm'
import { cn } from '@renderer/shared/lib/utils'
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
import { Button } from '@renderer/shared/components/ui/button'
import { Switch } from '@renderer/shared/components/ui/switch'

type RuntimeStatus = 'connected' | 'connecting' | 'error' | 'idle'

interface MCPServerCardBaseProps {
  animationDelay?: number
  runtimeStatus?: RuntimeStatus
  runtimeError?: string
  toolCount?: number
  onConnectionToggle?: () => void | Promise<void>
  onUninstall?: () => void | Promise<void>
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
export type MCPServerCardProps =
  RegistryMCPServerCardProps | InstalledMCPServerCardProps

const getRuntimeMeta = (
  mode: MCPServerCardMode,
  isInstalled: boolean,
  runtimeStatus: RuntimeStatus
): {
  label: string
  tone: string
  icon: React.ReactNode
} => {
  if (mode === 'registry' && !isInstalled) {
    return {
      label: 'Available',
      tone: 'text-blue-600 dark:text-blue-300',
      icon: <PackageOpen className="h-2.5 w-2.5" />
    }
  }

  switch (runtimeStatus) {
    case 'connected':
      return {
        label: 'Connected',
        tone: 'text-emerald-600 dark:text-emerald-400',
        icon: <Plug className="h-2.5 w-2.5" />
      }
    case 'connecting':
      return {
        label: 'Connecting',
        tone: 'text-amber-600 dark:text-amber-400',
        icon: <Loader2 className="h-2.5 w-2.5 animate-spin" />
      }
    case 'error':
      return {
        label: 'Failed',
        tone: 'text-red-600 dark:text-red-400',
        icon: <AlertCircle className="h-2.5 w-2.5" />
      }
    default:
      return {
        label: 'Idle',
        tone: 'text-gray-500 dark:text-gray-400',
        icon: <PackageOpen className="h-2.5 w-2.5" />
      }
  }
}

const getDisplayName = (name: string, title?: string): string => {
  const displayName = title || name
  const slashIndex = displayName.indexOf('/')
  return slashIndex >= 0 ? displayName.substring(slashIndex + 1) : displayName
}

const getRegistryConnectionType = (
  item: RegistryServerItem
): string | undefined => {
  return (
    item.server.remotes?.[0]?.type || item.server.packages?.[0]?.registryType
  )
}

const getInstalledConnectionType = (
  config: LocalMcpServerConfig
): string | undefined => {
  return config.type || (config.command ? 'STDIO' : 'GENERIC')
}

const getInstalledConfigDisplay = (
  config: LocalMcpServerConfig
): string | undefined => {
  return (
    config.url ||
    (config.command
      ? `${config.command} ${config.args?.join(' ') || ''}`
      : undefined)
  )
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
  const displayName =
    mode === 'registry'
      ? getDisplayName(props.item.server.name, props.item.server.title)
      : getDisplayName(props.name)
  const description =
    mode === 'registry'
      ? props.item.server.description
      : props.metadata?.description
  const version =
    mode === 'registry' ? props.item.server.version : props.metadata?.version
  const connectionType =
    mode === 'registry'
      ? getRegistryConnectionType(props.item)
      : getInstalledConnectionType(props.config)
  const repository =
    mode === 'registry' ? props.item.server.repository : undefined
  const configDisplay =
    mode === 'installed' ? getInstalledConfigDisplay(props.config) : undefined
  const detailText =
    mode === 'installed'
      ? configDisplay || description || 'Installed locally'
      : description ||
        (repository?.url
          ? repository.source || 'Repository'
          : 'Available in official registry')
  const isConnected = runtimeStatus === 'connected'
  const isConnecting = runtimeStatus === 'connecting'
  const canToggleConnection = isInstalled && Boolean(props.onConnectionToggle)
  const connectionSwitchDisabled = isConnecting

  const runtimeErrorContent = runtimeStatus === 'error' && runtimeError && (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      className={cn(
        'h-6! max-w-full min-w-0 basis-full justify-start gap-1.5 rounded-lg! px-2!',
        'bg-red-50/80! text-left text-[10px] font-medium text-red-600 ring-1 ring-inset ring-red-100/80',
        'transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out',
        'hover:bg-red-100/80! hover:text-red-700 hover:ring-red-200/90',
        'focus-visible:ring-2 focus-visible:ring-red-400/25 focus-visible:ring-offset-0',
        'active:scale-[0.995]',
        'dark:bg-red-950/35! dark:text-red-300 dark:ring-red-900/45',
        'dark:hover:bg-red-900/45! dark:hover:text-red-200 dark:hover:ring-red-700/55'
      )}
      title="Click to copy error"
      onClick={(event) => {
        event.stopPropagation()
        if (runtimeError) {
          void navigator.clipboard?.writeText(runtimeError)
        }
      }}
    >
      <Copy className="h-3 w-3 shrink-0 opacity-70" />
      <span className="min-w-0 truncate">{runtimeError}</span>
    </Button>
  )

  return (
    <div
      className={cn(
        'group relative flex min-w-0 items-start gap-3 px-3 py-3',
        mode === 'installed' && 'flex-wrap',
        'border-b border-gray-100/80 bg-transparent dark:border-(--app-border-subtle)',
        'transition-colors duration-150',
        'hover:bg-white/70 dark:hover:bg-(--app-surface-hover)'
      )}
      style={
        animationDelay !== undefined
          ? {
              animationDelay: `${animationDelay}ms`,
              animation: 'fadeInUp 0.45s ease-out forwards',
              opacity: 0
            }
          : undefined
      }
    >
      {mode === 'installed' ? (
        <div className="min-w-0 flex-[1_1_240px] space-y-1.5">
          <h4
            title={name}
            className="truncate text-[13px] font-semibold tracking-tight text-gray-900 dark:text-gray-100"
          >
            {displayName}
          </h4>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-gray-500 dark:text-(--app-text-secondary)">
            {connectionType && <span>{connectionType.toUpperCase()}</span>}
            {typeof toolCount === 'number' && <span>{toolCount} tools</span>}
            {version && <span>v{version}</span>}
          </div>
          {configDisplay ? (
            <code
              title={configDisplay}
              className="block truncate font-mono text-[10.5px] leading-5 text-gray-500 dark:text-(--app-text-muted)"
            >
              {configDisplay}
            </code>
          ) : (
            <span className="block line-clamp-2 text-[11.5px] text-gray-500 dark:text-(--app-text-muted)">
              {detailText}
            </span>
          )}
          {runtimeErrorContent}
        </div>
      ) : (
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <h4 className="min-w-0 truncate text-[13px] font-semibold tracking-tight text-gray-900 dark:text-gray-100">
              {displayName}
            </h4>
            <span className="shrink truncate font-mono text-[10px] tracking-tight text-gray-400 dark:text-gray-500">
              @{name}
            </span>
            {version && (
              <span className="inline-flex h-[18px] shrink-0 items-center px-0 text-[9.5px] font-medium text-gray-500 dark:text-(--app-text-muted)">
                v{version}
              </span>
            )}
          </div>

          {mode === 'registry' && repository?.url && !description ? (
            <a
              href={repository.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex max-w-full min-w-0 items-center gap-1 text-[11.5px] leading-5 text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-3 w-3 shrink-0" />
              <span className="min-w-0 truncate">{detailText}</span>
            </a>
          ) : (
            <span className="line-clamp-2 text-[11.5px] leading-relaxed text-gray-500 dark:text-gray-400">
              {detailText}
            </span>
          )}

          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span
              className={cn(
                'inline-flex h-[18px] shrink-0 items-center gap-1 rounded-md px-1.5 text-[10px] font-medium',
                runtimeMeta.tone
              )}
            >
              {runtimeMeta.icon}
              {runtimeMeta.label}
            </span>
            {mode === 'registry' && isInstalled && (
              <span className="inline-flex h-[18px] shrink-0 items-center gap-1 px-0 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                <Check className="h-2.5 w-2.5" />
                Added
              </span>
            )}
            {connectionType && (
              <span
                className={cn(
                  'inline-flex h-[18px] shrink-0 cursor-default select-none items-center rounded-md px-1.5 text-[9px] font-semibold uppercase tracking-[0.08em]',
                  'text-gray-500 dark:text-(--app-text-secondary)'
                )}
              >
                {connectionType}
              </span>
            )}
            {typeof toolCount === 'number' && isInstalled && (
              <span className="inline-flex h-[18px] shrink-0 items-center gap-1 px-0 text-[10px] font-medium text-gray-500 dark:text-(--app-text-secondary)">
                <SquareTerminal className="h-2.5 w-2.5" />
                {toolCount} tools
              </span>
            )}
            {mode === 'registry' && repository?.url && description && (
              <a
                href={repository.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-[18px] max-w-[220px] min-w-0 items-center gap-1 rounded-md px-1.5 text-[10px] font-medium text-gray-400 transition-colors hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                <span className="min-w-0 truncate">
                  {repository.source || 'Repository'}
                </span>
              </a>
            )}
            {runtimeErrorContent}
          </div>
        </div>
      )}

      <div
        className={cn(
          'ml-auto flex shrink-0 gap-1.5',
          mode === 'installed' ? 'flex-col items-end' : 'items-center'
        )}
      >
        {canToggleConnection &&
          (mode === 'installed' ? (
            <div className="flex h-7 items-center gap-2 pr-1">
              {isConnecting && (
                <Loader2
                  aria-label="Connecting"
                  className="h-3 w-3 animate-spin text-gray-500"
                />
              )}
              <Switch
                checked={isConnected}
                title={runtimeMeta.label}
                aria-label={`${displayName}: ${isConnected ? 'Disconnect' : 'Connect'}`}
                disabled={connectionSwitchDisabled}
                onClick={(event) => event.stopPropagation()}
                onCheckedChange={() => {
                  if (!connectionSwitchDisabled)
                    void props.onConnectionToggle?.()
                }}
                className="h-5! w-9! [&>span]:h-4 [&>span]:w-4 [&>span]:data-[state=checked]:translate-x-4"
              />
            </div>
          ) : (
            <div
              className={cn(
                'flex h-8 items-center gap-2 rounded-xl border px-2.5 text-[11px] font-medium shadow-xs',
                'transition-[background-color,border-color,box-shadow] duration-200 ease-out',
                isConnected
                  ? 'border-amber-200/75 bg-amber-50/70 text-amber-800 shadow-[0_10px_28px_-24px_rgba(217,119,6,0.9)] dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-100'
                  : 'border-slate-200/75 bg-white/75 text-slate-500 dark:border-white/10 dark:bg-slate-900/45 dark:text-slate-300',
                connectionSwitchDisabled && 'opacity-70'
              )}
            >
              {isConnecting && (
                <Loader2 className="h-3 w-3 animate-spin text-amber-500 dark:text-amber-300" />
              )}
              {!isConnecting && (
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-[2px]',
                    isConnected
                      ? 'bg-amber-500 dark:bg-amber-300'
                      : 'bg-slate-300 dark:bg-slate-500'
                  )}
                />
              )}
              <span>
                {isConnecting
                  ? 'Connecting'
                  : isConnected
                    ? 'Connected'
                    : 'Idle'}
              </span>
              <Switch
                checked={isConnected}
                aria-label={`${displayName} Connected`}
                disabled={connectionSwitchDisabled}
                onClick={(event) => event.stopPropagation()}
                onCheckedChange={() => {
                  if (connectionSwitchDisabled) {
                    return
                  }
                  void props.onConnectionToggle?.()
                }}
                className={cn(
                  'h-5! w-10! border! p-[2px]',
                  'shadow-inner transition-[background-color,border-color,box-shadow] duration-200 ease-out',
                  'focus-visible:ring-2 focus-visible:ring-amber-500/20 focus-visible:ring-offset-0',
                  '[&>span]:h-4 [&>span]:w-4 [&>span]:bg-white [&>span]:shadow-xs [&>span]:transition-transform [&>span]:duration-200 [&>span]:ease-out',
                  'data-[state=checked]:border-amber-400/75! data-[state=checked]:bg-amber-500/90!',
                  'data-[state=checked]:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.26)]',
                  'data-[state=unchecked]:border-slate-300/70! data-[state=unchecked]:bg-slate-200/80!',
                  'data-[state=checked]:[&>span]:translate-x-5 data-[state=unchecked]:[&>span]:translate-x-0',
                  'dark:data-[state=checked]:border-amber-200/70! dark:data-[state=checked]:bg-amber-300/85!',
                  'dark:data-[state=unchecked]:border-slate-600/70! dark:data-[state=unchecked]:bg-slate-700/80!',
                  connectionSwitchDisabled
                    ? 'cursor-not-allowed opacity-60'
                    : isConnected
                      ? 'cursor-pointer hover:border-amber-500/85! hover:bg-amber-500! hover:shadow-[0_0_0_3px_rgba(245,158,11,0.12),inset_0_0_0_1px_rgba(255,255,255,0.26)] dark:hover:border-amber-100/80! dark:hover:bg-amber-300!'
                      : 'cursor-pointer hover:border-slate-400/80! hover:bg-slate-300/70! dark:hover:border-slate-500/90! dark:hover:bg-slate-600/80!'
                )}
              />
            </div>
          ))}

        {mode === 'registry' ? (
          isInstalled ? (
            <InlineDeleteConfirm
              onConfirm={async () => {
                await props.onUninstall?.()
              }}
              ariaLabel="Remove server"
              title="Remove server"
              idleLabel="Remove"
              width={72}
              height={28}
              iconClassName="text-[11px]"
            />
          ) : (
            <Button
              variant="ghost"
              size="xs"
              onClick={props.onInstall}
              className="shrink-0 flex items-center gap-1 justify-center px-2 text-[11px] h-7 font-semibold text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-all duration-200"
            >
              <Download className="h-3 w-3" />
              <span>Install</span>
            </Button>
          )
        ) : (
          <div
            className={cn(
              'flex items-center gap-1.5 opacity-0 pointer-events-none',
              'group-hover:opacity-100 group-hover:pointer-events-auto',
              'group-focus-within:opacity-100 group-focus-within:pointer-events-auto',
              'has-[[data-delete-active=true]]:opacity-100 has-[[data-delete-active=true]]:pointer-events-auto',
              '[@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto',
              'transition-opacity duration-150 motion-reduce:transition-none'
            )}
          >
            <Button
              variant="ghost"
              size="xs"
              onClick={props.onCopyConfig}
              className={cn(
                'h-7! w-[62px] shrink-0 justify-center gap-1 rounded-lg! px-2!',
                'text-[11px] font-medium text-gray-500 dark:text-(--app-text-secondary)',
                'hover:text-gray-900 dark:hover:text-(--app-text-primary) active:scale-[0.98]'
              )}
              title="Copy JSON configuration"
            >
              <Copy className="h-3 w-3" />
              Copy
            </Button>

            <InlineDeleteConfirm
              onConfirm={async () => {
                await props.onUninstall?.()
              }}
              ariaLabel="Remove server"
              title="Remove server"
              idleLabel="Remove"
              width={72}
              height={28}
              iconClassName="text-[11px]"
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default MCPServerCard
