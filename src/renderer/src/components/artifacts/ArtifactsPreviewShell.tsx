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
    ? 'bg-emerald-100 py-0 text-emerald-700 border-emerald-200/70 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800/50'
    : statusDot === 'error'
      ? 'bg-red-100 text-red-700 border-red-200/70 dark:bg-red-900/25 dark:text-red-300 dark:border-red-800/40'
      : 'bg-gray-100 text-gray-600 border-gray-200/70 dark:bg-gray-900/40 dark:text-gray-300 dark:border-gray-800/60'

  const primaryDotClass = statusDot === 'running'
    ? 'bg-green-500'
    : statusDot === 'error'
      ? 'bg-red-500 dark:bg-red-400'
      : 'bg-gray-300 dark:bg-gray-700'

  return (
    <div className="flex-1 flex flex-col p-3 overflow-hidden">
      <div className="flex-1 flex flex-col rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden shadow-xs">
        <div className="h-9 flex items-center gap-3 px-3 bg-gray-50 dark:bg-gray-950 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <div className="flex gap-1">
            {onStop ? (
              <button
                type="button"
                onClick={onStop}
                title="Stop server"
                className="group/dot flex h-2 w-2 items-center justify-center rounded-full"
              >
                <div className="h-2 w-2 rounded-full bg-red-500 transition-colors group-hover/dot:bg-red-600 group-hover/dot:scale-115 dark:bg-red-400 dark:group-hover/dot:bg-red-300" />
              </button>
            ) : (
              <div className={cn("w-2 h-2 rounded-full", primaryDotClass)} />
            )}
            <div className="w-2 h-2 rounded-full bg-gray-200 dark:bg-gray-700" />
            <div className="w-2 h-2 rounded-full bg-gray-200 dark:bg-gray-700" />
          </div>
          <div className="flex-1 h-5.5 flex items-center px-2 gap-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded text-gray-400">
            <Globe className={cn("w-2.5 h-2.5", statusDot === 'error' ? 'text-red-500' : 'text-green-500')} />
            <span className="text-[9px] font-mono truncate select-all text-gray-700 dark:text-gray-300">
              {address}
            </span>
            <span className={cn(
              'ml-1 text-[8px] font-semibold tracking-widest px-1.5 py-px rounded-full border uppercase select-none',
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
                className="h-6 w-6 text-gray-400 hover:text-blue-500"
                onClick={onReload}
                title="Reload page"
              >
                <RotateCw className="w-3 h-3" />
              </Button>
            )}
            {onOpenExternal && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-gray-400 hover:text-blue-500"
                onClick={onOpenExternal}
                title="Open in new window"
              >
                <ExternalLink className="w-3 h-3" />
              </Button>
            )}
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}
