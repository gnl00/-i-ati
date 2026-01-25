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
import { useEffect, useMemo, useRef, useState } from 'react'
import type { UseWorkspaceFilesReturn } from './useWorkspaceFiles'
import { invokeReadTextFile } from '@renderer/tools/fileOperations/renderer/FileOperationsInvoker'
import { getLanguageFromPath } from './artifactUtils'
import type { FileTreeNode } from './WorkspaceFileTree'

type PreviewFile = {
  path: string
  content: string
  language: string
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const ArtifactsPreviewTab: React.FC<{
  files: UseWorkspaceFilesReturn
}> = ({ files }) => {
  const devServer = useDevServer()
  const devIframeRef = useRef<HTMLIFrameElement | null>(null)
  const staticIframeRef = useRef<HTMLIFrameElement | null>(null)

  const artifactTitle = 'Artifact Project'

  const fileNodes = useMemo(() => {
    const flat: FileTreeNode[] = []
    const walk = (node: FileTreeNode) => {
      if (node.type === 'file') {
        flat.push(node)
        return
      }
      node.children?.forEach(walk)
    }
    files.workspaceTree.forEach(walk)
    return flat
  }, [files.workspaceTree])

  const [previewFiles, setPreviewFiles] = useState<PreviewFile[]>([])

  const findMainPreviewFile = useMemo(() => {
    if (fileNodes.length === 0) return undefined
    const byName = (name: string) => fileNodes.find(f => f.name.toLowerCase() === name)
    const indexHtml = byName('index.html')
    if (indexHtml) return indexHtml
    const firstHtml = fileNodes.find(f => f.name.toLowerCase().endsWith('.html'))
    if (firstHtml) return firstHtml
    return fileNodes.find(f => f.name.toLowerCase().endsWith('.svg'))
  }, [fileNodes])

  useEffect(() => {
    let isActive = true

    const loadPreviewFiles = async () => {
      if (!findMainPreviewFile) {
        setPreviewFiles([])
        return
      }

      const mainResult = await invokeReadTextFile({ file_path: findMainPreviewFile.path })
      if (!mainResult.success || !mainResult.content) {
        setPreviewFiles([])
        return
      }

      const mainFile: PreviewFile = {
        path: findMainPreviewFile.path,
        content: mainResult.content,
        language: getLanguageFromPath(findMainPreviewFile.path)
      }

      if (mainFile.language !== 'html') {
        if (isActive) setPreviewFiles([mainFile])
        return
      }

      const refFiles: FileTreeNode[] = []
      const addRef = (ref: string) => {
        if (!ref || ref.startsWith('http') || ref.startsWith('//') || ref.startsWith('data:')) return
        const base = ref.split('?')[0].split('#')[0]
        const baseName = base.split('/').pop() || base
        const match = fileNodes.find((node) => {
          const nodeName = node.name.toLowerCase()
          if (nodeName === baseName.toLowerCase()) return true
          return node.path.toLowerCase().endsWith(base.toLowerCase())
        })
        if (match) refFiles.push(match)
      }

      const linkMatches = [...mainFile.content.matchAll(/<link[^>]*href=["']([^"']+)["'][^>]*>/gi)]
      linkMatches.forEach(match => addRef(match[1]))

      const scriptMatches = [...mainFile.content.matchAll(/<script[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi)]
      scriptMatches.forEach(match => addRef(match[1]))

      const uniqueRefs = Array.from(new Map(refFiles.map(node => [node.path, node])).values())

      const refContents = await Promise.all(
        uniqueRefs.map(async (node) => {
          const result = await invokeReadTextFile({ file_path: node.path })
          if (!result.success || !result.content) return null
          return {
            path: node.path,
            content: result.content,
            language: getLanguageFromPath(node.path)
          } as PreviewFile
        })
      )

      const allFiles = [mainFile, ...refContents.filter(Boolean) as PreviewFile[]]
      if (isActive) setPreviewFiles(allFiles)
    }

    loadPreviewFiles()

    return () => {
      isActive = false
    }
  }, [findMainPreviewFile, fileNodes])

  // Find previewable content (prefers index.html or first html/svg file)
  const previewContent = useMemo(() => {
    if (previewFiles.length === 0) return null

    // Priority 1: index.html
    let htmlFile = previewFiles.find(f => f.path.toLowerCase().endsWith('/index.html') || f.path.toLowerCase() === 'index.html')

    // Priority 2: first HTML file
    if (!htmlFile) htmlFile = previewFiles.find(f => f.language === 'html')

    // Priority 3: first SVG file
    if (!htmlFile) htmlFile = previewFiles.find(f => f.language === 'svg')

    if (!htmlFile) return null

    if (htmlFile.language === 'svg') {
      return `<!DOCTYPE html><html><body style="margin:0;display:flex;justify-content:center;align-items:center;height:100vh;background:#fafafa">${htmlFile.content}</body></html>`
    }

    let processedContent = htmlFile.content
    previewFiles.forEach(f => {
      if (f.path !== htmlFile?.path) {
        const fileName = f.path.split('/').pop() || f.path
        const safeName = escapeRegExp(fileName)
        // Inline CSS
        if (f.language === 'css') {
          processedContent = processedContent.replace(
            new RegExp(`<link[^>]*href=["'][^"']*${safeName}["'][^>]*>`, 'gi'),
            `<style>${f.content}</style>`
          )
        }
        // Inline JS
        if (f.language === 'javascript') {
          processedContent = processedContent.replace(
            new RegExp(`<script[^>]*src=["'][^"']*${safeName}["'][^>]*><\/script>`, 'gi'),
            `<script>${f.content}</script>`
          )
        }
      }
    })

    return processedContent
  }, [previewFiles])

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
          <PreviewShell
            address={`localhost:${devServer.devServerPort}`}
            statusDot="running"
            onReload={() => {
              if (devIframeRef.current) devIframeRef.current.src = devIframeRef.current.src
            }}
            onOpenExternal={() => window.open(`http://localhost:${devServer.devServerPort}`, '_blank')}
            onRestart={devServer.handleRestartDevServer}
            onStop={devServer.handleStopDevServer}
          >
            <iframe
              ref={devIframeRef}
              src={`http://localhost:${devServer.devServerPort}`}
              title="dev-server-preview"
              className="w-full flex-1 bg-white dark:bg-gray-900"
              sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
              allow="fullscreen"
            />
          </PreviewShell>
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
      <PreviewShell
        address={`${artifactTitle.toLowerCase().replace(/\s+/g, '-')}.local`}
        statusDot="static"
        onReload={() => {
          if (!staticIframeRef.current) return
          staticIframeRef.current.srcdoc = ''
          staticIframeRef.current.srcdoc = previewContent
        }}
        onOpenExternal={() => {
          const blob = new Blob([previewContent], { type: 'text/html' })
          const url = URL.createObjectURL(blob)
          window.open(url, '_blank')
        }}
      >
        <iframe
          ref={staticIframeRef}
          srcDoc={previewContent}
          title="artifact-preview"
          className="w-full flex-1 bg-white dark:bg-gray-900"
          sandbox="allow-scripts allow-same-origin"
        />
      </PreviewShell>
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

const PreviewShell: React.FC<{
  address: string
  statusDot: 'running' | 'static'
  onReload: () => void
  onOpenExternal?: () => void
  onRestart?: () => void
  onStop?: () => void
  children: React.ReactNode
}> = ({ address, statusDot, onReload, onOpenExternal, onRestart, onStop, children }) => {
  const dotColor = statusDot === 'running' ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-700'
  const badgeText = statusDot === 'running' ? 'LIVE' : 'STATIC'
  const badgeClass = statusDot === 'running'
    ? 'bg-emerald-100 text-emerald-700 border-emerald-200/70 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800/50'
    : 'bg-gray-100 text-gray-600 border-gray-200/70 dark:bg-gray-900/40 dark:text-gray-300 dark:border-gray-800/60'

  return (
    <div className="flex-1 flex flex-col p-3 overflow-hidden">
      <div className="flex-1 flex flex-col rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden shadow-xs">
        <div className="h-9 flex items-center gap-3 px-3 bg-gray-50 dark:bg-gray-950 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <div className="flex gap-1">
            <div className={cn("w-2 h-2 rounded-full", dotColor, statusDot === 'running' && 'animate-pulse')} />
            <div className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-700" />
            <div className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-700" />
          </div>
          <div className="flex-1 h-5.5 flex items-center px-2 gap-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded text-gray-400">
            <Globe className="w-2.5 h-2.5 text-green-500" />
            <span className="text-[9px] font-mono truncate select-all text-gray-700 dark:text-gray-300">
              {address}
            </span>
            <span className={cn(
              'ml-1 text-[8px] font-semibold tracking-widest px-1.5 py-[1px] rounded-full border',
              'uppercase select-none',
              badgeClass
            )}>
              {badgeText}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-gray-400 hover:text-blue-500"
              onClick={onReload}
              title="Reload page"
            >
              <RotateCw className="w-3 h-3" />
            </Button>
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
            {onRestart && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-gray-400 hover:text-orange-500"
                onClick={onRestart}
                title="Restart server"
              >
                <RefreshCw className="w-3 h-3" />
              </Button>
            )}
            {onStop && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-gray-400 hover:text-red-500"
                onClick={onStop}
                title="Stop server"
              >
                <StopCircle className="w-3 h-3" />
              </Button>
            )}
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}
