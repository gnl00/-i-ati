import React from 'react'
import { Badge } from '@renderer/components/ui/badge'
import { cn } from '@renderer/lib/utils'
import { Check, ExternalLink } from 'lucide-react'

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
}

const getConnectionBadgeClass = (connectionType?: string): string => {
  if (!connectionType) return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
  if (connectionType === 'sse') return "bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300"
  if (connectionType === 'npm') return "bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300"
  if (connectionType === 'STDIO') return "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
  if (connectionType === 'streamableHttp') return "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300"
  return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
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
  animationDelay
}) => {
  const displayName = (title || name).substring((title || name).indexOf('/') + 1)
  const isInstalled = mode === 'installed' || installed

  return (
    <div
      className={cn(
        'group relative rounded-xl border transition-all duration-300 overflow-hidden will-change-transform flex flex-col',
        'bg-white dark:bg-gray-900/40',
        'shadow-sm hover:shadow-md',
        // installed mode: subtle green left accent
        mode === 'installed'
          ? 'border-l-2 border-l-emerald-400 dark:border-l-emerald-600 border-gray-200/80 dark:border-gray-800/80'
          : 'border-gray-200/80 dark:border-gray-800/80',
        // registry mode already-installed: dim until hover
        installed && mode === 'registry' && 'opacity-60 hover:opacity-100 grayscale-[0.4] hover:grayscale-0'
      )}
      style={animationDelay !== undefined ? {
        animationDelay: `${animationDelay}ms`,
        animation: 'fadeInUp 0.4s ease-out forwards',
        opacity: 0
      } : undefined}
    >
      {/* ── Body ─────────────────────────────────────────────── */}
      <div className="p-3.5 flex flex-col gap-2 flex-1">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className="h-9 w-9 rounded-lg bg-gray-50 dark:bg-gray-800/60 flex items-center justify-center shrink-0 border border-gray-100 dark:border-gray-700/50 shadow-xs group-hover:scale-105 transition-transform duration-300 will-change-transform">
            {mode === 'registry' && iconUrl ? (
              <img
                src={iconUrl}
                alt=""
                className="h-5 w-5 rounded-md opacity-90 group-hover:opacity-100 transition-opacity"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                  const parent = e.currentTarget.parentElement
                  if (parent) {
                    const fallback = document.createElement('span')
                    fallback.className = 'text-sm font-bold text-gray-600 dark:text-gray-400 uppercase'
                    fallback.textContent = displayName.charAt(0)
                    parent.appendChild(fallback)
                  }
                }}
              />
            ) : (
              <span className="text-sm font-bold text-gray-600 dark:text-gray-400 uppercase">
                {displayName.charAt(0)}
              </span>
            )}
          </div>

          {/* Name row */}
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h4 className="font-semibold text-[13px] leading-tight tracking-tight text-gray-900 dark:text-gray-100 truncate">
                {displayName}
              </h4>
              {version && (
                <Badge variant="secondary" className="text-[9px] font-medium h-[17px] px-1.5 text-gray-400 bg-gray-100 dark:bg-gray-800 dark:text-gray-500 border-none select-none">
                  v{version}
                </Badge>
              )}
              {isInstalled && mode === 'registry' && (
                <span className="inline-flex items-center gap-1 text-[9px] font-medium text-emerald-600 dark:text-emerald-400 select-none">
                  <Check className="h-2.5 w-2.5" />
                  added
                </span>
              )}
            </div>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 font-mono tracking-tight truncate">
              @{name}
            </p>
          </div>
        </div>

        {/* Description — full width, left-aligned with card edge */}
        {description && (
          <p className="text-[11.5px] text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">
            {description}
          </p>
        )}
      </div>

      {/* ── Footer ───────────────────────────────────────────── */}
      <div className="border-t border-gray-100 dark:border-gray-800/60 px-3 py-2 flex items-center justify-between gap-2 bg-gray-50/50 dark:bg-gray-900/40 group-hover:bg-gray-50/80 dark:group-hover:bg-gray-900/60 transition-colors">
        {/* Left: connection type badge */}
        <div className="flex items-center gap-2 min-w-0">
          {connectionType && (
            <Badge
              className={cn(
                'text-[9.5px] font-medium px-1.5 py-0.5 h-[18px] border-none rounded-md cursor-default uppercase shrink-0',
                getConnectionBadgeClass(connectionType)
              )}
            >
              {connectionType}
            </Badge>
          )}
          {mode === 'registry' && repository?.url && (
            <a
              href={repository.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 flex items-center gap-1 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-2.5 w-2.5 shrink-0" />
              <span className="hover:underline underline-offset-2 truncate">{repository.source}</span>
            </a>
          )}
          {mode === 'installed' && configDisplay && (
            <code
              className="text-[10px] text-gray-400 dark:text-gray-500 font-mono truncate"
              title={configDisplay}
            >
              {configDisplay}
            </code>
          )}
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1 shrink-0">
          {mode === 'registry' ? (
            installed ? (
              <div className="flex cursor-default select-none items-center gap-1 px-2 py-0.5 rounded-md bg-gray-100/70 dark:bg-gray-800/50">
                <Check className="h-2.5 w-2.5 text-gray-400 dark:text-gray-500" />
                <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500">Added</span>
              </div>
            ) : (
              <button
                onClick={onInstall}
                className="h-7 px-3 rounded-md text-[11px] font-medium bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 active:scale-[0.97] transition-all duration-150 shadow-sm shadow-gray-900/10"
              >
                Install
              </button>
            )
          ) : (
            <>
              <button
                onClick={onCopyConfig}
                className="h-7 px-2.5 flex items-center gap-1 rounded-md text-[11px] font-medium text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-150"
                title="Copy JSON configuration"
              >
                <i className="ri-braces-line text-[12px]" />
                Copy
              </button>
              <button
                onClick={onUninstall}
                className="h-7 px-2.5 flex items-center gap-1 rounded-md text-[11px] font-medium text-gray-400 dark:text-gray-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all duration-150"
                title="Remove server"
              >
                <i className="ri-delete-bin-line text-[12px]" />
                Remove
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default MCPServerCard
