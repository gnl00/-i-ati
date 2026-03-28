import { useDevServer } from './useDevServer'
import { ArtifactsEmptyState } from './ArtifactsEmptyState'
import { ArtifactsPreviewErrorState } from './ArtifactsPreviewErrorState'
import { ArtifactsPreviewShell } from './ArtifactsPreviewShell'
import {
  Loader2,
  Monitor,
  Play,
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
          <ArtifactsPreviewShell
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
          </ArtifactsPreviewShell>
        )}

        {/* State 4: Error - Show error message with retry */}
        {devServer.devServerStatus === 'error' && (
          <ArtifactsPreviewErrorState
            error={devServer.devServerError}
            logs={devServer.devServerLogs}
            port={devServer.devServerPort}
            showLogs={devServer.showErrorLogs}
            setShowLogs={devServer.setShowErrorLogs}
            onRetry={devServer.handleStartDevServer}
          />
        )}
      </>
    )
  }

  // 如果有预览内容，显示传统预览
  if (previewContent) {
    return (
      <ArtifactsPreviewShell
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
      </ArtifactsPreviewShell>
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
