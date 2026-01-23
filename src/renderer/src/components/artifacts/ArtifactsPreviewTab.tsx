import { Button } from '@renderer/components/ui/button'
import { useDevServer } from './useDevServer'
import { ArtifactsEmptyState } from './ArtifactsEmptyState'
import { cn } from '@renderer/lib/utils'
import {
  AlertCircle,
  ChevronRight,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  Monitor,
  Play,
  RefreshCw,
  RotateCw,
  StopCircle,
  Terminal
} from 'lucide-react'
import { useMemo } from 'react'

export const ArtifactsPreviewTab: React.FC = () => {
  const devServer = useDevServer()

  // TODO: 需要确定 artifact files 的实际数据来源
  // 目前使用空数组作为占位符
  const files = useMemo(() => [] as { path: string, content: string, language: string }[], [])
  const artifactTitle = 'Artifact Project'

  // Find previewable content (prefers index.html or first html/svg file)
  const previewContent = useMemo(() => {
    if (files.length === 0) return null

    // Priority 1: index.html
    let htmlFile = files.find(f => f.path.toLowerCase() === 'index.html')

    // Priority 2: first HTML file
    if (!htmlFile) htmlFile = files.find(f => f.language === 'html')

    // Priority 3: first SVG file
    if (!htmlFile) htmlFile = files.find(f => f.language === 'svg')

    if (!htmlFile) return null

    if (htmlFile.language === 'svg') {
      return `<!DOCTYPE html><html><body style="margin:0;display:flex;justify-content:center;align-items:center;height:100vh;background:#fafafa">${htmlFile.content}</body></html>`
    }

    let processedContent = htmlFile.content
    files.forEach(f => {
      if (f.path !== htmlFile?.path) {
        // Inline CSS
        if (f.language === 'css') {
          processedContent = processedContent.replace(
            new RegExp(`<link[^>]*href=["']${f.path}["'][^>]*>`, 'gi'),
            `<style>${f.content}</style>`
          )
        }
        // Inline JS
        if (f.language === 'javascript') {
          processedContent = processedContent.replace(
            new RegExp(`<script[^>]*src=["']${f.path}["'][^>]*><\/script>`, 'gi'),
            `<script>${f.content}</script>`
          )
        }
      }
    })

    return processedContent
  }, [files])

  // 如果有 preview.sh，显示 DevServer 预览
  if (devServer.hasPreviewSh) {
    return (
      <>
        {/* State 1: Idle - Show ready message */}
        {devServer.devServerStatus === 'idle' && (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="flex flex-col items-center gap-6 max-w-md">
              <button
                onClick={devServer.handleStartDevServer}
                className="w-20 h-20 rounded-full bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center hover:bg-blue-100 dark:hover:bg-blue-900/40 hover:scale-110 transition-all cursor-pointer group"
                title="Start Preview Server"
              >
                <Play className="w-10 h-10 text-blue-500 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
              </button>
              <div className="text-center">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Preview Ready
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Click the Play button to start preview
                </p>
              </div>
            </div>
          </div>
        )}

        {/* State 2: Starting - Show loading spinner */}
        {devServer.devServerStatus === 'starting' && (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="flex flex-col items-center gap-6">
              <Loader2 className="w-16 h-16 animate-spin text-blue-500" />
              <div className="text-center">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Starting Development Server
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Please wait while the server initializes...
                </p>
              </div>
            </div>
          </div>
        )}

        {/* State 3: Running - Show iframe preview */}
        {devServer.devServerStatus === 'running' && devServer.devServerPort && (
          <div className="flex-1 flex flex-col p-3 overflow-hidden">
            <div className="flex-1 flex flex-col rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden shadow-xs">
              {/* Browser Bar */}
              <div className="h-9 flex items-center gap-3 px-3 bg-gray-50 dark:bg-gray-950 border-b border-gray-100 dark:border-gray-800 shrink-0">
                <div className="flex gap-1">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <div className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-700" />
                  <div className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-700" />
                </div>
                <div className="flex-1 h-5.5 flex items-center px-2 gap-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded text-gray-400">
                  <Globe className="w-2.5 h-2.5 text-green-500" />
                  <span className="text-[9px] font-mono truncate select-all text-gray-700 dark:text-gray-300">
                    localhost:{devServer.devServerPort}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-gray-400 hover:text-blue-500"
                    onClick={() => {
                      const iframe = document.querySelector('iframe[title="dev-server-preview"]') as HTMLIFrameElement
                      if (iframe) iframe.src = iframe.src
                    }}
                    title="Reload page"
                  >
                    <RotateCw className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-gray-400 hover:text-blue-500"
                    onClick={() => window.open(`http://localhost:${devServer.devServerPort}`, '_blank')}
                    title="Open in new window"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-gray-400 hover:text-orange-500"
                    onClick={devServer.handleRestartDevServer}
                    title="Restart server"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-gray-400 hover:text-red-500"
                    onClick={devServer.handleStopDevServer}
                    title="Stop server"
                  >
                    <StopCircle className="w-3 h-3" />
                  </Button>
                </div>
              </div>
              {/* Dev Server iframe */}
              <iframe
                src={`http://localhost:${devServer.devServerPort}`}
                title="dev-server-preview"
                className="w-full flex-1 bg-white dark:bg-gray-900"
                sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
                allow="fullscreen"
              />
            </div>
          </div>
        )}

        {/* State 4: Error - Show error message with retry */}
        {devServer.devServerStatus === 'error' && (
          <div className="flex-1 flex flex-col pt-4 px-8 pb-8 overflow-auto">
            <div className="flex flex-col gap-6 max-w-3xl mx-auto w-full">
              {/* Single row: Icon - Title - Button */}
              <div className="flex items-center gap-4">
                {/* Left: Error Icon */}
                <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-950/30 flex items-center justify-center shrink-0">
                  <Terminal className="w-5 h-5 text-red-500" />
                </div>

                {/* Middle: Title */}
                <h3 className="text-lg font-bold text-red-600 dark:text-red-400 flex-1">
                  Failed to Start
                </h3>

                {/* Right: Retry Button */}
                <Button
                  onClick={devServer.handleStartDevServer}
                  variant="outline"
                  size="default"
                  className="border-orange-500 text-orange-600 hover:bg-orange-50 dark:border-orange-500 dark:text-orange-400 dark:hover:bg-orange-950/20 transition-all shrink-0"
                >
                  <RotateCw className="w-4 h-4 mr-2" />
                  Retry Start Server
                </Button>
              </div>

              {/* Error Details Card */}
              <div className="w-full bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-lg p-4">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                    <h4 className="text-sm font-semibold text-red-700 dark:text-red-300">Error Details</h4>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const errorInfo = [
                        'Development Server Error',
                        '='.repeat(50),
                        '',
                        'Error Message:',
                        devServer.devServerError || 'Unknown error',
                        '',
                        'Server Logs:',
                        ...devServer.devServerLogs,
                        '',
                        `Workspace: ${devServer.devServerPort}`,
                        `Timestamp: ${new Date().toISOString()}`
                      ].join('\n')

                      navigator.clipboard.writeText(errorInfo)
                    }}
                    className="h-7 text-xs border-gray-300 text-gray-600 hover:bg-gray-100 hover:text-gray-800 hover:border-gray-400 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200 dark:hover:border-gray-500 transition-all"
                  >
                    <Copy className="w-3 h-3 mr-1" />
                    Copy Error
                  </Button>
                </div>

                {/* Common Error Hints */}
                {devServer.devServerError?.includes('code 127') && (
                  <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900/50 rounded p-3 mb-3">
                    <p className="text-xs text-yellow-800 dark:text-yellow-200 font-medium mb-1">
                      💡 Common Issue: Command Not Found
                    </p>
                    <p className="text-xs text-yellow-700 dark:text-yellow-300">
                      Exit code 127 usually means a command in preview.sh was not found. Check if npm/pnpm/bun is installed and available in PATH.
                    </p>
                  </div>
                )}

                {devServer.devServerError?.includes('EADDRINUSE') && (
                  <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900/50 rounded p-3 mb-3">
                    <p className="text-xs text-yellow-800 dark:text-yellow-200 font-medium mb-1">
                      💡 Common Issue: Port Already in Use
                    </p>
                    <p className="text-xs text-yellow-700 dark:text-yellow-300">
                      Another process is using the port. Try stopping other dev servers or change the port in your preview.sh script.
                    </p>
                  </div>
                )}

                {devServer.devServerError?.includes('ENOENT') && (
                  <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900/50 rounded p-3 mb-3">
                    <p className="text-xs text-yellow-800 dark:text-yellow-200 font-medium mb-1">
                      💡 Common Issue: File or Directory Not Found
                    </p>
                    <p className="text-xs text-yellow-700 dark:text-yellow-300">
                      A file or directory referenced in preview.sh does not exist. Check your script paths.
                    </p>
                  </div>
                )}

                {/* Error Message */}
                <div className="bg-white dark:bg-gray-900 rounded border border-red-200 dark:border-red-900/50 p-3 mb-3">
                  <p className="text-xs font-mono text-red-600 dark:text-red-400 whitespace-pre-wrap break-all">
                    {devServer.devServerError || 'No error message available'}
                  </p>
                </div>

                {/* Server Error Logs */}
                {devServer.devServerLogs.length > 0 && (
                  <div>
                    <div
                      className="flex items-center gap-2 mb-2 cursor-pointer select-none hover:opacity-70 transition-opacity"
                      onClick={() => devServer.setShowErrorLogs(!devServer.showErrorLogs)}
                    >
                      <ChevronRight
                        className={cn(
                          "w-4 h-4 text-gray-600 dark:text-gray-400 transition-transform duration-200",
                          devServer.showErrorLogs && "rotate-90"
                        )}
                      />
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        Server Logs ({devServer.devServerLogs.length} lines)
                      </span>
                    </div>

                    {devServer.showErrorLogs && (
                      <div className="max-h-64 overflow-y-auto bg-gray-950 dark:bg-black text-gray-300 p-3 rounded border border-gray-800 font-mono text-xs">
                        {devServer.devServerLogs.map((log, index) => (
                          <div key={index} className="whitespace-pre-wrap break-all leading-relaxed">
                            {log}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  // 如果有预览内容，显示传统预览
  if (previewContent) {
    return (
      <div className="flex-1 flex flex-col p-3 overflow-hidden">
        <div className="flex-1 flex flex-col rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden shadow-xs">
          {/* Minimal Browser Bar */}
          <div className="h-9 flex items-center gap-3 px-3 bg-gray-50 dark:bg-gray-950 border-b border-gray-100 dark:border-gray-800 shrink-0">
            <div className="flex gap-1">
              <div className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-700" />
              <div className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-700" />
              <div className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-700" />
            </div>
            <div className="flex-1 h-5.5 flex items-center px-2 gap-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded text-gray-400">
              <Globe className="w-2.5 h-2.5" />
              <span className="text-[9px] font-mono truncate select-all">{artifactTitle.toLowerCase().replace(/\s+/g, '-')}.local</span>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-400 hover:text-blue-500">
                <RotateCw className="w-3 h-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-gray-400 hover:text-blue-500"
                onClick={() => {
                  const blob = new Blob([previewContent], { type: 'text/html' })
                  const url = URL.createObjectURL(blob)
                  window.open(url, '_blank')
                }}
              >
                <ExternalLink className="w-3 h-3" />
              </Button>
            </div>
          </div>
          <iframe
            srcDoc={previewContent}
            title="artifact-preview"
            className="w-full flex-1 bg-white"
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      </div>
    )
  }

  // 否则显示空状态
  return (
    <ArtifactsEmptyState
      icon={<Monitor className="w-10 h-10" />}
      title="Unable to Preview"
      description="This artifact doesn't seem to contain any previewable HTML or SVG content."
    />
  )
}
