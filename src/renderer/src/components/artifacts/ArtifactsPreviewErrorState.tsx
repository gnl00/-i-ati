import { AlertTriangle, ChevronRight, Copy, RotateCw, Terminal } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@renderer/components/ui/accordion'
import { cn } from '@renderer/lib/utils'
import { ArtifactsPreviewShell } from './ArtifactsPreviewShell'
import { toast } from 'sonner'

export const ArtifactsPreviewErrorState: React.FC<{
  error: string | null
  logs: string[]
  port: number | null
  showLogs: boolean
  setShowLogs: (show: boolean) => void
  onRetry: () => void
}> = ({ error, logs, port, showLogs, setShowLogs, onRetry }) => {
  const handleCopyDetails = async () => {
    const errorInfo = [
      'Development Server Error',
      '='.repeat(50),
      '',
      'Error Message:',
      error || 'Unknown error',
      '',
      'Server Logs:',
      ...logs,
      '',
      `Port: ${port ?? 'N/A'}`,
      `Timestamp: ${new Date().toISOString()}`
    ].join('\n')

    try {
      await navigator.clipboard.writeText(errorInfo)
      toast.success('Preview error details copied', { duration: 1000 })
    } catch {
      toast.error('Failed to copy preview error details')
    }
  }

  return (
    <ArtifactsPreviewShell
      address={port ? `localhost:${port}` : 'preview-runtime.local'}
      statusDot="error"
    >
      <div className="flex-1 overflow-auto bg-white p-4 dark:bg-gray-900 md:p-5">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300 motion-reduce:animate-none">
          <div className="rounded-xl border border-red-200/70 bg-red-50/60 p-4 dark:border-red-900/50 dark:bg-red-950/20">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-red-200 bg-white text-red-500 shadow-xs dark:border-red-900/70 dark:bg-zinc-950 dark:text-red-300">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-red-600/90 dark:text-red-300/90">
                  Preview Unavailable
                </p>
                <h3 className="mt-1 text-base font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                  Unable to start preview process
                </h3>
                <p className="mt-1 text-xs leading-5 text-red-700/80 dark:text-red-200/80">
                  The dev server stopped before the preview iframe could connect.
                </p>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-black/[0.07] bg-white shadow-xs dark:border-white/[0.08] dark:bg-zinc-950">
            <div className="border-b border-black/[0.06] bg-zinc-50 px-3 py-2 dark:border-white/[0.08] dark:bg-zinc-900/70">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                  Error message
                </span>
                {port && (
                  <span className="rounded-full border border-red-200/70 bg-red-50 px-2 py-0.5 font-mono text-[10px] text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
                    :{port}
                  </span>
                )}
              </div>
            </div>
            <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-words px-3 py-3 font-mono text-xs leading-5 text-zinc-800 dark:text-zinc-200">{error || 'No error message available'}</pre>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={onRetry}
              size="sm"
              className="h-8 rounded-lg bg-red-600/70 px-3 text-xs font-medium text-white shadow-xs transition-[background-color,box-shadow,transform] duration-150 hover:bg-red-500 hover:shadow-sm active:scale-[0.98] dark:bg-red-500 dark:hover:bg-red-400"
            >
              <RotateCw className="mr-1.5 h-3.5 w-3.5 opacity-90" />
              Retry Preview
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleCopyDetails()}
              className="h-8 rounded-lg border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 active:scale-[0.98] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              <Copy className="mr-1.5 h-3.5 w-3.5 opacity-80" />
              Copy Details
            </Button>
          </div>

          {logs.length > 0 && (
            <Accordion
              type="single"
              collapsible
              value={showLogs ? 'logs' : ''}
              onValueChange={(value) => setShowLogs(value === 'logs')}
              className="overflow-hidden rounded-xl border border-black/[0.07] bg-white shadow-xs dark:border-white/[0.08] dark:bg-zinc-950"
            >
              <AccordionItem value="logs" className="border-0">
                <AccordionTrigger className="px-3 py-2 text-left hover:no-underline">
                  <div className="flex w-full items-center justify-between gap-3 pr-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <Terminal className="h-3.5 w-3.5 shrink-0 text-zinc-500 dark:text-zinc-400" />
                      <span className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-300">
                        Server logs
                      </span>
                      <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                        {logs.length}
                      </span>
                    </div>
                    <span className="flex h-6 w-6 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500 transition-colors duration-150 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
                      <ChevronRight
                        className={cn(
                          'h-3.5 w-3.5 transition-transform duration-200 ease-out',
                          showLogs && 'rotate-90'
                        )}
                      />
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="border-t border-black/[0.06] bg-zinc-950 p-0 dark:border-white/[0.08]">
                  <div className="max-h-64 overflow-auto p-3 font-mono text-xs leading-5 text-zinc-200">
                    {logs.map((log, index) => (
                      <div key={index} className="whitespace-pre-wrap break-all">
                        {log || ' '}
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}
        </div>
      </div>
    </ArtifactsPreviewShell>
  )
}
