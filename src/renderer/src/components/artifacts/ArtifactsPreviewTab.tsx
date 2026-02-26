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
const normalizeRefPath = (value: string) => {
  let next = value.trim()
  if (!next) return ''
  if (next.startsWith('./')) next = next.slice(2)
  if (next.startsWith('/')) next = next.slice(1)
  next = next.replace(/\\/g, '/')
  while (next.includes('//')) next = next.replace(/\/\//g, '/')
  const parts = next.split('/')
  const resolved: string[] = []
  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') {
      resolved.pop()
      continue
    }
    resolved.push(part)
  }
  next = resolved.join('/')
  return next
}

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

  const hasPackageJson = useMemo(() => {
    return fileNodes.some(node => node.name.toLowerCase() === 'package.json')
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
        const base = normalizeRefPath(ref.split('?')[0].split('#')[0])
        const baseName = base.split('/').pop() || base
        const match = fileNodes.find((node) => {
          const nodeName = node.name.toLowerCase()
          if (nodeName === baseName.toLowerCase()) return true
          const normalizedPath = normalizeRefPath(node.path.toLowerCase())
          return normalizedPath.endsWith(base.toLowerCase())
        })
        if (match) refFiles.push(match)
      }

      // Collect linked assets referenced by the HTML to enable inline preview.
      const linkMatches = [...mainFile.content.matchAll(/<link[^>]*href=["']([^"']+)["'][^>]*>/gi)]
      linkMatches.forEach(match => addRef(match[1]))

      // Only inline local module scripts; avoid external or non-module scripts.
      const scriptMatches = [...mainFile.content.matchAll(/<script[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi)]
      scriptMatches.forEach(match => {
        const ref = match[1]
        if (!ref) return
        if (ref.startsWith('http') || ref.startsWith('//') || ref.startsWith('data:')) return
        if (!ref.startsWith('./') && !ref.startsWith('../') && !ref.startsWith('/')) return
        addRef(ref)
      })

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
          const relStylesheet = new RegExp(
            `<link(?=[^>]*href=["'][^"']*(?:./)?${safeName}["'])(?=[^>]*rel=["']stylesheet["'])[^>]*>`,
            'gi'
          )
          const relPreloadStyle = new RegExp(
            `<link(?=[^>]*href=["'][^"']*(?:./)?${safeName}["'])(?=[^>]*rel=["']preload["'])(?=[^>]*as=["']style["'])[^>]*>`,
            'gi'
          )
          processedContent = processedContent.replace(relStylesheet, `<style>${f.content}</style>`)
          processedContent = processedContent.replace(relPreloadStyle, `<style>${f.content}</style>`)
        }
        // Inline JS
        if (f.language === 'javascript') {
          const moduleScript = new RegExp(
            `<script(?=[^>]*src=["'][^"']*(?:./)?${safeName}["'])(?=[^>]*type=["']module["'])[^>]*><\\/script>`,
            'gi'
          )
          processedContent = processedContent.replace(moduleScript, `<script type="module">${f.content}</script>`)
        }
      }
    })

    return processedContent
  }, [previewFiles])

  // 如果存在 package.json，按动态项目展示 DevServer 预览
  if (hasPackageJson) {
    return (
      <>
        {/* State 1: Idle - Show ready message */}
        {(devServer.devServerStatus === 'idle' || devServer.devServerStatus === 'stopped') && (
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
          <div className="flex-1 overflow-auto p-4 md:p-6">
            <div className="mx-auto w-full max-w-6xl">
              <div
                className={cn(
                  "rounded-[1.75rem] border border-red-200/80 bg-white/85 p-4 shadow-xs backdrop-blur-xl",
                  "dark:border-red-900/60 dark:bg-zinc-950/70"
                )}
              >
                <div className="mb-4 flex flex-col gap-3 border-b border-red-100/80 pb-4 dark:border-red-900/50">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-200/70 bg-red-50/90 text-red-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                      <Terminal className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-500/90 dark:text-red-300/90">
                        Dev Server Failure
                      </p>
                      <h3 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 wrap-break-word">
                        Unable to Start Preview Process
                      </h3>
                    </div>
                  </div>
                  <div className="flex w-full flex-wrap items-center gap-2">
                    <Button
                      onClick={devServer.handleStartDevServer}
                      size="sm"
                      className="rounded-full bg-red-400 px-4 text-white hover:bg-red-700 active:scale-[0.98] dark:bg-red-600 dark:hover:bg-red-700 whitespace-nowrap"
                    >
                      <RotateCw className="mr-1.5 h-3.5 w-3.5" />
                      Retry Start
                    </Button>
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
                          `Port: ${devServer.devServerPort ?? 'N/A'}`,
                          `Timestamp: ${new Date().toISOString()}`
                        ].join('\n')
                        navigator.clipboard.writeText(errorInfo)
                      }}
                      className="rounded-full border-zinc-300 text-zinc-700 hover:bg-zinc-100 active:scale-[0.98] dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800 whitespace-nowrap"
                    >
                      <Copy className="mr-1.5 h-3.5 w-3.5" />
                      Copy Details
                    </Button>
                  </div>
                </div>

                <section className="rounded-2xl border border-red-200/80 bg-red-50/55 p-4 dark:border-red-900/50 dark:bg-red-950/25">
                  <div className="mb-2 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-300" />
                    <h4 className="text-sm font-semibold text-red-700 dark:text-red-300">Error Message</h4>
                  </div>
                  <pre className="max-h-56 overflow-auto rounded-xl border border-red-200/70 bg-white/85 p-3 text-xs leading-relaxed text-red-700 dark:border-red-900/60 dark:bg-zinc-950/65 dark:text-red-200">
                    {devServer.devServerError || 'No error message available'}
                  </pre>
                </section>

                {devServer.devServerLogs.length > 0 && (
                  <div className="mt-4 rounded-2xl border border-zinc-200/80 bg-zinc-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
                    <button
                      className="flex w-full items-center justify-between text-left"
                      onClick={() => devServer.setShowErrorLogs(!devServer.showErrorLogs)}
                    >
                      <div className="flex items-center gap-2">
                        <ChevronRight
                          className={cn(
                            "h-4 w-4 text-zinc-500 transition-transform duration-200 dark:text-zinc-400",
                            devServer.showErrorLogs && "rotate-90"
                          )}
                        />
                        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-300">
                          Server Logs
                        </span>
                      </div>
                      <span className="rounded-full border border-zinc-300 px-2 py-0.5 text-[11px] text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
                        {devServer.devServerLogs.length}
                      </span>
                    </button>
                    {devServer.showErrorLogs && (
                      <div className="mt-3 max-h-72 overflow-auto rounded-xl border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs leading-relaxed text-zinc-200">
                        {devServer.devServerLogs.map((log, index) => (
                          <div key={index} className="whitespace-pre-wrap break-all">
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
  onStop?: () => void
  children: React.ReactNode
}> = ({ address, statusDot, onReload, onOpenExternal, onStop, children }) => {
  const dotColor = statusDot === 'running' ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-700'
  const badgeText = statusDot === 'running' ? 'LIVE' : 'STATIC'
  const badgeClass = statusDot === 'running'
    ? 'bg-emerald-100 py-0 text-emerald-700 border-emerald-200/70 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800/50'
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
              'ml-1 text-[8px] font-semibold tracking-widest px-1.5 py-px rounded-full border',
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
            {/* {onRestart && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-gray-400 hover:text-orange-500"
                onClick={onRestart}
                title="Restart server"
              >
                <RefreshCw className="w-3 h-3" />
              </Button>
            )} */}
            {onStop && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-red-300 hover:text-red-500"
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
