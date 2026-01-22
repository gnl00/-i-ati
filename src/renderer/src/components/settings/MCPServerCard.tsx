import React from 'react'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import { Check, Code, ExternalLink } from 'lucide-react'

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
  if (!connectionType) return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
  if (connectionType === 'sse') return "bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/40"
  if (connectionType === 'npm') return "bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900/40"
  if (connectionType === 'STDIO') return "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40"
  if (connectionType === 'streamableHttp') return "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/40"
  return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
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
  const displayName = (title || name).substring((title || name).indexOf("/") + 1)

  return (
    <div
      className={cn(
        "group relative rounded-xl border transition-all duration-300 overflow-hidden will-change-transform",
        "bg-white dark:bg-gray-900/40",
        "border-gray-200/80 dark:border-gray-800/80",
        "shadow",
        "hover:shadow-md",
        "flex flex-col",
        installed && mode === 'registry' && "bg-gray-50/80 dark:bg-gray-900/20 border-gray-100 dark:border-gray-800/30 opacity-60 hover:opacity-100 grayscale-[0.5] hover:grayscale-0"
      )}
      style={animationDelay !== undefined ? {
        animationDelay: `${animationDelay}ms`,
        animation: 'fadeInUp 0.4s ease-out forwards',
        opacity: 0
      } : undefined}
    >
      {mode === 'registry' ? (
        <>
          <div className="p-3 flex items-start justify-between gap-4 flex-1">
            <div className="flex-1 min-w-0 relative">
              <div className="flex items-start gap-4 mb-3">
                <div className="h-11 w-11 rounded-xl bg-gray-50 dark:bg-gray-800/50 flex items-center justify-center flex-shrink-0 border border-gray-100 dark:border-gray-700/50 transition-all duration-300 shadow-sm group-hover:scale-105 will-change-transform">
                  {iconUrl ? (
                    <img
                      src={iconUrl}
                      alt=""
                      className="h-6 w-6 rounded-md opacity-90 group-hover:opacity-100 transition-opacity"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                        const parent = e.currentTarget.parentElement
                        if (parent) {
                          const fallback = document.createElement('span')
                          fallback.className = 'text-base font-bold text-gray-600 dark:text-gray-400 uppercase'
                          fallback.textContent = displayName.charAt(0)
                          parent.appendChild(fallback)
                        }
                      }}
                    />
                  ) : (
                    <span className="text-base font-bold text-gray-600 dark:text-gray-400 uppercase">
                      {displayName.charAt(0)}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h4 className="font-bold text-[14px] leading-tight tracking-tight truncate text-gray-900 dark:text-gray-100">
                      {displayName}
                    </h4>
                    <div className="flex items-center gap-1.5 select-none">
                      {version && (
                        <Badge variant="secondary" className="text-[9px] font-medium h-5 px-2 py-0.5 text-muted-foreground bg-gray-100 dark:bg-gray-800 border-none">
                          v{version}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground/60 font-mono tracking-tight truncate">
                    @{name}
                  </p>
                </div>
              </div>

              {description && (
                <p className="text-xs font-sans text-gray-600 dark:text-gray-400 line-clamp-2 leading-relaxed font-medium pl-1">
                  {description}
                </p>
              )}
            </div>

            {/* Available Badge */}
            <Badge
              variant="outline"
              className={cn(
                'text-[9px] font-bold px-2 py-0.5 h-5 uppercase tracking-wider rounded-md border-transparent transition-all duration-300 flex items-center gap-1.5',
                installed ? 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20' : 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
              )}
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className={cn("relative inline-flex rounded-full h-1.5 w-1.5", installed ? 'bg-yellow-500' : 'bg-blue-500')}></span>
              </span>
              Available
            </Badge>
          </div>

          <div className="bg-gray-50/50 dark:bg-gray-900/40 border-t border-gray-100 dark:border-gray-800/60 px-2 py-1.5 flex items-center justify-between gap-3 transition-colors group-hover:bg-gray-50/80 dark:group-hover:bg-gray-900/60">
            <div className="flex items-center gap-3 flex-wrap select-none pl-1">
              {connectionType && (
                <Badge
                  className={cn(
                    "text-[10px] font-medium px-2 py-0.5 h-5 border-none rounded-md transition-colors duration-200 cursor-default uppercase",
                    getConnectionBadgeClass(connectionType)
                  )}
                >
                  {connectionType}
                </Badge>
              )}
              {repository?.url && (
                <a
                  href={repository.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] font-medium text-muted-foreground hover:text-foreground flex items-center gap-1.5 group/link transition-colors px-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="h-3 w-3 opacity-50 group-hover/link:opacity-100 transition-opacity" />
                  <span className="hover:underline underline-offset-2 decoration-border/50">
                    {repository.source}
                  </span>
                </a>
              )}
            </div>
            <div>
              {installed ? (
                <div className="flex disabled cursor-default select-none items-center gap-1.5 px-2 py-2 rounded-xl bg-gray-100/80 dark:bg-gray-900/50 border border-gray-200/60 dark:border-gray-700/60 transition-all duration-300">
                  <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-[11px] font-bold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                    Installed
                  </span>
                </div>
              ) : (
                <Button
                  size="xs"
                  onClick={onInstall}
                  className={cn(
                    "px-3 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wide",
                    "bg-slate-700 dark:bg-slate-600",
                    "text-white dark:text-white",
                    "border border-slate-600/50 dark:border-slate-500/50",
                    "hover:bg-slate-800 dark:hover:bg-slate-500",
                    "hover:scale-105",
                    "active:scale-95",
                    "transition-all duration-200",
                    "will-change-transform"
                  )}
                >
                  Install
                </Button>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-col h-full">
          <div className="p-3 flex items-start justify-between gap-4 flex-1">
            <div className="flex-1 min-w-0 relative">
              <div className="flex items-start gap-4 mb-3">
                <div className="h-11 w-11 rounded-xl bg-gray-50 dark:bg-gray-800/50 flex items-center justify-center flex-shrink-0 border border-gray-100 dark:border-gray-700/50 transition-all duration-300 shadow-sm group-hover:scale-105 will-change-transform">
                  <span className="text-base font-bold text-gray-600 dark:text-gray-400 uppercase">
                    {displayName.charAt(0)}
                  </span>
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h4 className="font-bold text-[14px] leading-tight tracking-tight truncate text-gray-900 dark:text-gray-100">
                      {displayName}
                    </h4>
                    {version && (
                      <Badge variant="secondary" className="text-[9px] font-medium h-5 px-2 py-0.5 text-muted-foreground bg-gray-100 dark:bg-gray-800 border-none">
                        v{version}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground/60 font-mono tracking-tight truncate">
                    @{name}
                  </p>
                </div>
              </div>

              {description && (
                <p className="text-xs font-sans text-gray-600 dark:text-gray-400 line-clamp-2 leading-relaxed font-medium pl-1">
                  {description}
                </p>
              )}
            </div>

            <div className="flex flex-col items-end gap-2 flex-shrink-0 select-none">
              <Badge
                variant="outline"
                className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold px-2 py-0.5 h-5 uppercase tracking-wider rounded-md border-transparent bg-emerald-50 dark:bg-emerald-900/20 transition-all duration-300 flex items-center gap-1.5"
              >
                <span className="relative flex h-1.5 w-1.5">
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                </span>
                Running
              </Badge>
            </div>
          </div>

          {configDisplay ? (
            <div className="bg-gray-50/50 dark:bg-gray-900/40 border-t border-gray-100 dark:border-gray-800/60 px-2 py-1.5 flex items-center justify-between gap-3 transition-colors group-hover:bg-gray-50/80 dark:group-hover:bg-gray-900/60">
              <div className="flex flex-row items-center gap-2 flex-1 min-w-0">
                {connectionType && (
                  <Badge
                    className={cn(
                      "text-[10px] font-medium px-2 py-0.5 h-5 border-none rounded-md transition-colors duration-200 cursor-default uppercase w-fit flex-shrink-0",
                      getConnectionBadgeClass(connectionType)
                    )}
                  >
                    {connectionType}
                  </Badge>
                )}
                <code className="text-[11px] leading-relaxed text-muted-foreground/80 font-mono break-all line-clamp-1 flex-1 min-w-0" title={configDisplay}>
                  {configDisplay}
                </code>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onCopyConfig}
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-all duration-200"
                  title="Copy Configuration"
                >
                  <Code className="h-4 w-4" />
                </Button>
                <Button
                  size="xs"
                  onClick={onUninstall}
                  className={cn(
                    "px-3 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wide",
                    "bg-red-400 dark:bg-red-500",
                    "text-white dark:text-white",
                    "border border-red-500/50 dark:border-red-500/50",
                    "hover:bg-red-500 dark:hover:bg-red-600",
                    "hover:scale-105",
                    "active:scale-95",
                    "transition-all duration-200",
                    "will-change-transform"
                  )}
                >
                  Uninstall
                </Button>
              </div>
            </div>
          ) : (
            <div className="bg-gray-50/50 dark:bg-gray-900/40 border-t border-gray-100 dark:border-gray-800/60 px-2 py-1.5 flex items-center justify-between gap-3 transition-colors group-hover:bg-gray-50/80 dark:group-hover:bg-gray-900/60">
              <div className="flex-1">
                {connectionType ? (
                  <Badge
                    className={cn(
                      "text-[10px] font-medium px-2 py-0.5 h-5 border-none rounded-md transition-colors duration-200 cursor-default uppercase w-fit",
                      getConnectionBadgeClass(connectionType)
                    )}
                  >
                    {connectionType}
                  </Badge>
                ) : (
                  <p className="text-[10px] text-muted-foreground/60 italic">
                    No configuration specified
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onCopyConfig}
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-all duration-200"
                  title="Copy Configuration"
                >
                  <Code className="h-4 w-4" />
                </Button>
                <Button
                  size="xs"
                  onClick={onUninstall}
                  className={cn(
                    "px-3 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wide",
                    "bg-red-600 dark:bg-red-600",
                    "text-white dark:text-white",
                    "border border-red-500/50 dark:border-red-500/50",
                    "shadow-sm",
                    "hover:bg-red-700 dark:hover:bg-red-500",
                    "hover:scale-105",
                    "active:scale-95",
                    "transition-all duration-200",
                    "will-change-transform"
                  )}
                >
                  Uninstall
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default MCPServerCard
