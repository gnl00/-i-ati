import { ChevronRight, Copy, RotateCw, Terminal } from 'lucide-react'
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
      <div className="flex-1 overflow-auto bg-white dark:bg-gray-900 p-4 md:p-5">
        <div className="mx-auto w-full max-w-3xl">
          <div
            className="overflow-scroll"
          >
            <div className="px-1 py-2">
              <div className="flex min-w-0 flex-col gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-500/90 dark:text-red-300/90">
                      Preview Unavailable
                    </p>
                    <h3 className="mt-0.5 text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                      Unable to Start Preview Process
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                      <pre className="max-h-48 overflow-auto rounded-xl border border-red-200/80 bg-white py-3 px-1 text-xs leading-6 text-red-700 dark:border-red-900/60 dark:bg-zinc-950 dark:text-red-200">
                        {error || 'No error message available'}
                      </pre>
                    </p>
                  </div>
                </div>

                {/* action buttons */}
                <div className="flex w-full flex-wrap items-center gap-2 pt-1">
                  <Button
                    onClick={onRetry}
                    size="sm"
                    className="h-9 rounded-xl bg-red-500/85 px-4 text-white shadow-[0_12px_24px_-18px_rgba(239,68,68,0.95)] transition-all hover:bg-red-600 hover:shadow-[0_16px_28px_-18px_rgba(220,38,38,0.95)] active:scale-[0.98] dark:bg-red-600 dark:hover:bg-red-500 whitespace-nowrap"
                  >
                    <RotateCw className="mr-1.5 h-3.5 w-3.5 opacity-90" />
                    Retry Preview
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleCopyDetails()}
                    className="h-9 rounded-xl border-zinc-100 bg-zinc-50/90 px-4 text-zinc-700 transition-colors hover:bg-zinc-100 active:scale-[0.98] dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-200 dark:hover:bg-zinc-800 whitespace-nowrap"
                  >
                    <Copy className="mr-1.5 h-3.5 w-3.5 opacity-80" />
                    Copy Details
                  </Button>
                </div>
              </div>
            </div>

            <div>
              {/* Server logs detail */}
              {logs.length > 0 && (
                <Accordion
                  type="single"
                  collapsible
                  value={showLogs ? 'logs' : ''}
                  onValueChange={(value) => setShowLogs(value === 'logs')}
                  className="rounded-2xl bg-zinc-100/50 p-2 dark:bg-zinc-900/48"
                >
                  <AccordionItem value="logs" className="border-0">
                    <AccordionTrigger className="py-3 text-left hover:no-underline">
                      <div className="flex w-full items-center justify-between gap-3 pr-1">
                        <div className="flex items-center gap-2">
                          <Terminal className="h-4 w-4 shrink-0 text-zinc-500 transition-transform duration-200 dark:text-zinc-400" />
                          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-300">
                            Server Logs
                          </span>
                        </div>
                        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 transition-colors duration-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
                          <ChevronRight
                            className={cn(
                              'h-4 w-4 transition-transform duration-200 ease-out',
                              showLogs && 'rotate-90'
                            )}
                          />
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-3 pt-0">
                      <div className="max-h-72 overflow-auto rounded-xl border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs leading-relaxed text-zinc-200">
                        {logs.map((log, index) => (
                          <div key={index} className="whitespace-pre-wrap break-all">
                            {log}
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}
            </div>
          </div>
        </div>
      </div>
    </ArtifactsPreviewShell>
  )
}
