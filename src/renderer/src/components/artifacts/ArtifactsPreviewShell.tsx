import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import { ExternalLink, Globe, RotateCw } from 'lucide-react'

export const ArtifactsPreviewShell: React.FC<{
  address: string
  statusDot: 'running' | 'static' | 'error'
  onReload?: () => void
  onOpenExternal?: () => void
  onStop?: () => void
  children: React.ReactNode
}> = ({ address, statusDot, onReload, onOpenExternal, onStop, children }) => {
  const badgeText = statusDot === 'running' ? 'LIVE' : statusDot === 'error' ? 'ERROR' : 'STATIC'
  const badgeClass = statusDot === 'running'
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200/70 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50'
    : statusDot === 'error'
      ? 'bg-red-50 text-red-700 border-red-200/70 dark:bg-red-950/35 dark:text-red-300 dark:border-red-800/50'
      : 'bg-zinc-100 text-zinc-600 border-zinc-200/80 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-800'

  const primaryDotClass = statusDot === 'running'
    ? 'bg-emerald-500'
    : statusDot === 'error'
      ? 'bg-red-500 dark:bg-red-400'
      : 'bg-zinc-300 dark:bg-zinc-700'

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-zinc-100/50 p-2.5 dark:bg-zinc-950">
      <div className="flex-1 flex flex-col overflow-hidden rounded-lg border border-black/[0.07] bg-white shadow-xs dark:border-white/[0.09] dark:bg-zinc-900">
        <div className="h-9 flex items-center gap-2.5 border-b border-black/[0.06] bg-zinc-50 px-2.5 dark:border-white/[0.08] dark:bg-zinc-950 shrink-0">
          <div className="flex gap-1">
            {onStop ? (
              <button
                type="button"
                onClick={onStop}
                title="Stop server"
                className="group/dot flex h-2.5 w-2.5 items-center justify-center rounded-full"
              >
                <div className="h-2.5 w-2.5 rounded-full bg-red-500 transition-transform duration-150 group-hover/dot:scale-110 dark:bg-red-400" />
              </button>
            ) : (
              <div className={cn("h-2.5 w-2.5 rounded-full", primaryDotClass)} />
            )}
            <div className="h-2.5 w-2.5 rounded-full bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-2.5 w-2.5 rounded-full bg-zinc-200 dark:bg-zinc-800" />
          </div>
          <div className="flex h-6 min-w-0 flex-1 items-center gap-2 rounded-md border border-black/[0.06] bg-white px-2 text-zinc-400 dark:border-white/[0.08] dark:bg-zinc-900">
            <Globe className={cn("h-2.5 w-2.5 shrink-0", statusDot === 'error' ? 'text-red-500' : 'text-emerald-500')} />
            <span className="min-w-0 flex-1 truncate font-mono text-[9px] text-zinc-700 selection:bg-blue-500/20 dark:text-zinc-300">
              {address}
            </span>
            <span className={cn(
              'shrink-0 rounded-full border px-1.5 py-px text-[8px] font-semibold uppercase tracking-[0.16em] select-none',
              badgeClass
            )}>
              {badgeText}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {onReload && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-blue-600 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-blue-300"
                onClick={onReload}
                title="Reload page"
              >
                <RotateCw className="h-3 w-3" />
              </Button>
            )}
            {onOpenExternal && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-blue-600 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-blue-300"
                onClick={onOpenExternal}
                title="Open in new window"
              >
                <ExternalLink className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}
