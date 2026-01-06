import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Tabs, TabsContent } from '@renderer/components/ui/tabs'
import { AnimatedTabsList } from '@renderer/components/ui/animated-tabs'
import { useChatContext } from '@renderer/context/ChatContext'
import { toast } from 'sonner'
import { cn } from '@renderer/lib/utils'
import { useChatStore } from '@renderer/store'
import { useDevServerStore } from '@renderer/store/devServerStore'
import { getWorkspacePath } from '@renderer/utils/workspaceUtils'
import { invokeDirectoryTree, invokeReadTextFile } from '@tools/fileOperations/renderer/FileOperationsInvoker'
import type { TreeNode } from '@tools/fileOperations/index.d'
import {
  invokeCheckPreviewSh,
  invokeStartDevServer,
  invokeStopDevServer,
  invokeGetDevServerStatus
} from '@tools/devServer/renderer/DevServerInvoker'
import {
  AlertCircle,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  FileCode,
  FolderOpen,
  Globe,
  Loader2,
  Monitor,
  Play,
  RefreshCw,
  RotateCw,
  Search,
  StopCircle,
  Terminal,
  X
} from 'lucide-react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import SyntaxHighlighter from 'react-syntax-highlighter'
import { dracula } from 'react-syntax-highlighter/dist/esm/styles/hljs'
import { type FileTreeNode, WorkspaceFileTree } from './WorkspaceFileTree'

export const ArtifactsPanel: React.FC = () => {
  const { setArtifactsPanel, artifactsActiveTab, setArtifactsActiveTab } = useChatStore()
  const {
    setDevServerStatus,
    setDevServerPort,
    setDevServerLogs,
    setDevServerError,
    devServerStatus,
    devServerPort,
    devServerLogs,
    devServerError
  } = useDevServerStore()
  const { chatUuid } = useChatContext()

  // DevServer state
  const [hasPreviewSh, setHasPreviewSh] = useState(false)
  const [showErrorLogs, setShowErrorLogs] = useState(false)
  const currentDevServerStatus = chatUuid ? devServerStatus[chatUuid] || 'idle' : 'idle'
  const currentDevServerPort = chatUuid ? devServerPort[chatUuid] : null
  const currentDevServerError = chatUuid ? devServerError[chatUuid] : null
  const currentDevServerLogs = chatUuid ? devServerLogs[chatUuid] || [] : []

  // Workspace file tree state
  const [workspaceTree, setWorkspaceTree] = useState<FileTreeNode[]>([])
  const [selectedFilePath, setSelectedFilePath] = useState<string | undefined>()
  const [selectedFileContent, setSelectedFileContent] = useState<string | undefined>()
  const [selectedFileName, setSelectedFileName] = useState<string | undefined>()
  const [isLoadingTree, setIsLoadingTree] = useState(false)
  const [isLoadingFile, setIsLoadingFile] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Use ref to track latest dev server status for cleanup
  const devServerStatusRef = useRef(currentDevServerStatus)
  useEffect(() => {
    devServerStatusRef.current = currentDevServerStatus
  }, [currentDevServerStatus])

  const files = useMemo(() => [] as { path: string, content: string, language: string }[], [])
  const artifactTitle = 'Artifact Project'
  const selectedFile = files[0] || null

  // Convert API TreeNode to FileTreeNode
  const convertToFileTreeNodes = useCallback((apiTree: TreeNode): FileTreeNode[] => {
    const convert = (node: TreeNode): FileTreeNode => ({
      name: node.name,
      path: node.path,
      type: node.type,
      children: node.children?.map(convert)
    })

    return apiTree.children?.map(convert) || [convert(apiTree)]
  }, [])

  // Load workspace file tree
  const loadWorkspaceTree = useCallback(async () => {
    if (!chatUuid) {
      setWorkspaceTree([])
      return
    }

    setIsLoadingTree(true)
    try {
      const workspacePath = getWorkspacePath(chatUuid)
      console.log('[ArtifactsPanel] Loading workspace tree:', workspacePath)

      const result = await invokeDirectoryTree({
        directory_path: workspacePath,
        max_depth: 10
      })

      if (result.success && result.tree) {
        setWorkspaceTree(convertToFileTreeNodes(result.tree))
      } else {
        console.warn('[ArtifactsPanel] Failed to load workspace tree:', result.error)
        setWorkspaceTree([])
      }
    } catch (error) {
      console.error('[ArtifactsPanel] Error loading workspace tree:', error)
      setWorkspaceTree([])
    } finally {
      setIsLoadingTree(false)
    }
  }, [chatUuid, convertToFileTreeNodes])

  // Helper: Convert absolute path to relative path (relative to userData)
  // invokeDirectoryTree returns absolute paths, but invokeReadTextFile expects relative paths
  const convertToRelativePath = useCallback((absolutePath: string): string => {
    // Extract the part starting from "workspaces/" or return as-is if not found
    const workspacesIndex = absolutePath.indexOf('workspaces/')
    if (workspacesIndex !== -1) {
      return absolutePath.substring(workspacesIndex)
    }
    return absolutePath
  }, [])

  // Read file content
  const handleFileSelect = useCallback(async (filePath: string) => {
    setSelectedFilePath(filePath)
    setSelectedFileName(filePath.split('/').pop())
    setIsLoadingFile(true)

    try {
      // Convert absolute path to relative path for IPC call
      const relativePath = convertToRelativePath(filePath)
      console.log('[ArtifactsPanel] Reading file:', filePath, '-> relative:', relativePath)

      const result = await invokeReadTextFile({
        file_path: relativePath
      })

      if (result.success && result.content) {
        setSelectedFileContent(result.content)
      } else {
        console.warn('[ArtifactsPanel] Failed to read file:', result.error)
        setSelectedFileContent('// Failed to load file content\n// ' + (result.error || 'Unknown error'))
      }
    } catch (error: any) {
      console.error('[ArtifactsPanel] Error reading file:', error)
      setSelectedFileContent('// Error loading file\n// ' + (error.message || 'Unknown error'))
    } finally {
      setIsLoadingFile(false)
    }
  }, [convertToRelativePath])

  // Refresh workspace tree
  const handleRefresh = useCallback(() => {
    setSelectedFilePath(undefined)
    setSelectedFileContent(undefined)
    setSelectedFileName(undefined)
    loadWorkspaceTree()
  }, [loadWorkspaceTree])

  // DevServer: Check for preview.sh
  const checkForPreviewSh = useCallback(async () => {
    if (!chatUuid) {
      setHasPreviewSh(false)
      return
    }

    try {
      const result = await invokeCheckPreviewSh({ chatUuid })
      setHasPreviewSh(result.exists)
      console.log('[ArtifactsPanel] Preview.sh exists:', result.exists)
    } catch (error) {
      console.error('[ArtifactsPanel] Error checking preview.sh:', error)
      setHasPreviewSh(false)
    }
  }, [chatUuid])

  // DevServer: Start development server
  const handleStartDevServer = useCallback(async () => {
    if (!chatUuid) return

    console.log('[ArtifactsPanel] Starting dev server for:', chatUuid)
    setDevServerStatus(chatUuid, 'starting')
    setDevServerError(chatUuid, null)

    try {
      const result = await invokeStartDevServer({ chatUuid })

      if (result.success) {
        console.log('[ArtifactsPanel] Dev server started successfully')
        // Poll for status until port is detected or error occurs
        pollDevServerStatus()
      } else {
        console.error('[ArtifactsPanel] Failed to start dev server:', result.error)
        setDevServerStatus(chatUuid, 'error')
        setDevServerError(chatUuid, result.error || 'Failed to start development server')
      }
    } catch (error: any) {
      console.error('[ArtifactsPanel] Error starting dev server:', error)
      setDevServerStatus(chatUuid, 'error')
      setDevServerError(chatUuid, error.message || 'Failed to start development server')
    }
  }, [chatUuid, setDevServerStatus, setDevServerError])

  // DevServer: Stop development server
  const handleStopDevServer = useCallback(async () => {
    if (!chatUuid) return

    console.log('[ArtifactsPanel] Stopping dev server for:', chatUuid)

    try {
      const result = await invokeStopDevServer({ chatUuid })

      if (result.success) {
        console.log('[ArtifactsPanel] Dev server stopped successfully')
        setDevServerStatus(chatUuid, 'idle')
        setDevServerPort(chatUuid, null)
        setDevServerError(chatUuid, null)

        toast.success('Server Stopped', {
          description: 'Development server stopped successfully'
        })
      } else {
        console.error('[ArtifactsPanel] Failed to stop dev server:', result.error)
        toast.error('Error', {
          description: result.error || 'Failed to stop development server'
        })
      }
    } catch (error: any) {
      console.error('[ArtifactsPanel] Error stopping dev server:', error)
      toast.error('Error', {
        description: error.message || 'Failed to stop development server'
      })
    }
  }, [chatUuid, setDevServerStatus, setDevServerPort, setDevServerError])

  // DevServer: Restart development server
  const handleRestartDevServer = useCallback(async () => {
    if (!chatUuid) return

    console.log('[ArtifactsPanel] Restarting dev server for:', chatUuid)

    // First stop the server
    try {
      await invokeStopDevServer({ chatUuid })
      setDevServerStatus(chatUuid, 'idle')
      setDevServerPort(chatUuid, null)
      setDevServerError(chatUuid, null)

      // Wait a bit for cleanup
      await new Promise(resolve => setTimeout(resolve, 500))

      // Then start it again
      handleStartDevServer()

      toast('Restarting Server', {
        description: 'Development server is being restarted...'
      })
    } catch (error: any) {
      console.error('[ArtifactsPanel] Error restarting dev server:', error)
      toast.error('Error', {
        description: error.message || 'Failed to restart development server'
      })
    }
  }, [chatUuid, handleStartDevServer, setDevServerStatus, setDevServerPort, setDevServerError])

  // DevServer: Poll status until port is detected or timeout
  const pollDevServerStatus = useCallback(() => {
    if (!chatUuid) return

    let attempts = 0
    const maxAttempts = 30 // 30 seconds timeout

    const intervalId = setInterval(async () => {
      attempts++

      try {
        const statusResult = await invokeGetDevServerStatus({ chatUuid })

        if (statusResult.success) {
          setDevServerStatus(chatUuid, statusResult.status)

          if (statusResult.port) {
            setDevServerPort(chatUuid, statusResult.port)
            console.log('[ArtifactsPanel] Dev server port detected:', statusResult.port)
          }

          if (statusResult.logs && statusResult.logs.length > 0) {
            setDevServerLogs(chatUuid, statusResult.logs)
          }

          if (statusResult.error) {
            setDevServerError(chatUuid, statusResult.error)
          }

          // Stop polling if running, error, or timeout
          if (statusResult.status === 'running' || statusResult.status === 'error' || attempts >= maxAttempts) {
            clearInterval(intervalId)

            if (statusResult.status === 'running' && statusResult.port) {
              toast.success('Server Started', {
                description: `Development server running on port ${statusResult.port}`
              })
            } else if (attempts >= maxAttempts && statusResult.status === 'starting') {
              console.error('[ArtifactsPanel] Timeout waiting for port detection')
              console.error('[ArtifactsPanel] Collected logs:', statusResult.logs)
              console.error('[ArtifactsPanel] Server status:', statusResult.status)
              console.error('[ArtifactsPanel] Port:', statusResult.port)

              // Stop the server since we can't detect the port
              console.log('[ArtifactsPanel] Stopping server due to timeout')
              await invokeStopDevServer({ chatUuid })

              setDevServerStatus(chatUuid, 'error')
              setDevServerError(chatUuid, 'Timeout: Could not detect server port after 30 seconds. The server process has been stopped.')
              toast.error('Timeout', {
                description: 'Could not detect server port. Server stopped.'
              })
            }
          }
        }
      } catch (error: any) {
        console.error('[ArtifactsPanel] Error polling dev server status:', error)
        clearInterval(intervalId)
        setDevServerStatus(chatUuid, 'error')
        setDevServerError(chatUuid, error.message || 'Failed to get server status')
      }
    }, 1000) // Poll every second
  }, [chatUuid, setDevServerStatus, setDevServerPort, setDevServerLogs, setDevServerError])

  // Check for preview.sh when preview tab is opened
  useEffect(() => {
    if (artifactsActiveTab === 'preview' && chatUuid) {
      checkForPreviewSh()
    }
  }, [artifactsActiveTab, chatUuid, checkForPreviewSh])

  // Clean up dev server when workspace changes or component unmounts (artifacts toggle off)
  useEffect(() => {
    return () => {
      const status = devServerStatusRef.current
      console.log('[ArtifactsPanel] Cleanup triggered - chatUuid:', chatUuid, 'status:', status)

      if (chatUuid && status !== 'idle' && status !== 'stopped') {
        console.log('[ArtifactsPanel] Component unmounting or workspace changed, stopping dev server for:', chatUuid)

        // Immediately update store to prevent re-mounting issues
        setDevServerStatus(chatUuid, 'stopped')
        setDevServerPort(chatUuid, null)
        setDevServerError(chatUuid, null)

        // Call backend to actually stop the process
        invokeStopDevServer({ chatUuid }).then(result => {
          console.log('[ArtifactsPanel] Stop dev server result:', result)
        }).catch(err => {
          console.error('[ArtifactsPanel] Error stopping dev server:', err)
        })
      } else {
        console.log('[ArtifactsPanel] Skip cleanup - chatUuid:', chatUuid, 'status:', status)
      }
    }
  }, [chatUuid, setDevServerStatus, setDevServerPort, setDevServerError])

  // Load workspace tree on mount and when chatUuid changes
  useEffect(() => {
    loadWorkspaceTree()
  }, [loadWorkspaceTree])

  // Utility functions
  const getLanguageFromPath = (path: string): string => {
    const ext = path.split('.').pop()?.toLowerCase() || ''
    const languageMap: Record<string, string> = {
      'js': 'javascript',
      'jsx': 'javascript',
      'mjs': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'html': 'html',
      'htm': 'html',
      'css': 'css',
      'scss': 'css',
      'less': 'css',
      'json': 'json',
      'md': 'markdown',
      'py': 'python',
      'java': 'java',
      'go': 'go',
      'rs': 'rust',
      'rb': 'ruby',
      'php': 'php',
      'c': 'c',
      'cpp': 'cpp',
      'sh': 'bash',
      'yml': 'yaml',
      'yaml': 'yaml',
      'xml': 'xml',
      'sql': 'sql',
    }
    return languageMap[ext] || 'text'
  }

  const handleCopyFile = async () => {
    if (!selectedFileContent) return
    try {
      await navigator.clipboard.writeText(selectedFileContent)
      toast.success(`${selectedFileName} 已复制`, { duration: 1500 })
    } catch (err) {
      toast.error('复制失败', { duration: 1500 })
    }
  }

  const handleCopyWorkspacePath = useCallback(() => {
    if (!chatUuid) return
    const workspacePath = getWorkspacePath(chatUuid)
    navigator.clipboard.writeText(workspacePath)
    toast.success('Copied', { description: workspacePath, duration: 2000 })
  }, [chatUuid])

  const handleDownloadFile = () => {
    if (!selectedFileContent || !selectedFileName) return
    const blob = new Blob([selectedFileContent], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = selectedFileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success(`${selectedFileName} 已下载`, { duration: 1500 })
  }

  const countFilesInTree = (nodes: FileTreeNode[]): number => {
    return nodes.reduce((count, node) => {
      if (node.type === 'file') return count + 1
      if (node.children) return count + countFilesInTree(node.children)
      return count
    }, 0)
  }

  // Legacy handlers for artifact files (Preview tab)
  const handleClose = () => {
    setArtifactsPanel(false)
  }

  const handleCopy = async () => {
    if (!selectedFile) return
    try {
      await navigator.clipboard.writeText(selectedFile.content)
      toast.success(`${selectedFile.path} 已复制`, { duration: 1500 })
    } catch (err) {
      toast.error('复制失败', { duration: 1500 })
    }
  }

  const handleDownload = () => {
    if (!selectedFile) return
    const blob = new Blob([selectedFile.content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = selectedFile.path
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success(`${selectedFile.path} 已下载`, { duration: 1500 })
  }

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

  const artifactTabs = [
    {
      value: 'preview',
      label: 'Preview',
      icon: <Monitor className="w-3 h-3" />
    },
    {
      value: 'files',
      label: 'Files',
      icon: <FileCode className="w-3 h-3" />
    }
  ]

  return (
    <div className="h-full flex flex-col bg-background/95 backdrop-blur-xl rounded-lg dark:border-gray-800 overflow-hidden">
      <Tabs
        value={artifactsActiveTab}
        className="flex-1 flex flex-col min-h-0"
        onValueChange={setArtifactsActiveTab}
      >
        {/* Header with Tabs */}
        <div className="flex items-center justify-between px-1 py-1 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950 shrink-0">
          <AnimatedTabsList
            tabs={artifactTabs}
            value={artifactsActiveTab}
          />

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-full hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors"
            onClick={handleClose}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Preview Tab Content */}
        <TabsContent
          value="preview"
          className="flex-1 min-h-0 m-0 flex flex-col overflow-hidden data-[state=inactive]:hidden data-[state=active]:animate-in data-[state=active]:fade-in data-[state=active]:duration-300"
        >
          {/* Priority 1: DevServer Preview (if preview.sh exists) */}
          {hasPreviewSh ? (
            <>
              {/* State 1: Idle - Show ready message */}
              {currentDevServerStatus === 'idle' && (
                <div className="flex-1 flex items-center justify-center p-8">
                  <div className="flex flex-col items-center gap-6 max-w-md">
                    <button
                      onClick={handleStartDevServer}
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
              {currentDevServerStatus === 'starting' && (
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
              {currentDevServerStatus === 'running' && currentDevServerPort && (
                <div className="flex-1 flex flex-col p-3 overflow-hidden">
                  <div className="flex-1 flex flex-col rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden shadow-sm">
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
                          localhost:{currentDevServerPort}
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
                          onClick={() => window.open(`http://localhost:${currentDevServerPort}`, '_blank')}
                          title="Open in new window"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-gray-400 hover:text-orange-500"
                          onClick={handleRestartDevServer}
                          title="Restart server"
                        >
                          <RefreshCw className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-gray-400 hover:text-red-500"
                          onClick={handleStopDevServer}
                          title="Stop server"
                        >
                          <StopCircle className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                    {/* Dev Server iframe */}
                    <iframe
                      src={`http://localhost:${currentDevServerPort}`}
                      title="dev-server-preview"
                      className="w-full flex-1 bg-white dark:bg-gray-900"
                      sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
                      allow="fullscreen"
                    />
                  </div>
                </div>
              )}

              {/* State 4: Error - Show error message with retry */}
              {currentDevServerStatus === 'error' && (
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
                        onClick={handleStartDevServer}
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
                              currentDevServerError || 'Unknown error',
                              '',
                              'Server Logs:',
                              ...currentDevServerLogs,
                              '',
                              `Workspace: ${chatUuid}`,
                              `Timestamp: ${new Date().toISOString()}`
                            ].join('\n')

                            navigator.clipboard.writeText(errorInfo)
                            toast.success('Copied to Clipboard', {
                              description: 'Error details have been copied to clipboard'
                            })
                          }}
                          className="h-7 text-xs border-gray-300 text-gray-600 hover:bg-gray-100 hover:text-gray-800 hover:border-gray-400 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200 dark:hover:border-gray-500 transition-all"
                        >
                          <Copy className="w-3 h-3 mr-1" />
                          Copy Error
                        </Button>
                      </div>

                      {/* Common Error Hints */}
                      {currentDevServerError?.includes('code 127') && (
                        <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900/50 rounded p-3 mb-3">
                          <p className="text-xs text-yellow-800 dark:text-yellow-200 font-medium mb-1">
                            💡 Common Issue: Command Not Found
                          </p>
                          <p className="text-xs text-yellow-700 dark:text-yellow-300">
                            Exit code 127 usually means a command in preview.sh was not found. Check if npm/pnpm/bun is installed and available in PATH.
                          </p>
                        </div>
                      )}

                      {currentDevServerError?.includes('EADDRINUSE') && (
                        <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900/50 rounded p-3 mb-3">
                          <p className="text-xs text-yellow-800 dark:text-yellow-200 font-medium mb-1">
                            💡 Common Issue: Port Already in Use
                          </p>
                          <p className="text-xs text-yellow-700 dark:text-yellow-300">
                            Another process is using the port. Try stopping other dev servers or change the port in your preview.sh script.
                          </p>
                        </div>
                      )}

                      {currentDevServerError?.includes('ENOENT') && (
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
                          {currentDevServerError || 'No error message available'}
                        </p>
                      </div>

                      {/* Server Error Logs */}
                      {currentDevServerLogs.length > 0 && (
                        <div>
                          <div
                            className="flex items-center gap-2 mb-2 cursor-pointer select-none hover:opacity-70 transition-opacity"
                            onClick={() => setShowErrorLogs(!showErrorLogs)}
                          >
                            <ChevronRight
                              className={cn(
                                "w-4 h-4 text-gray-600 dark:text-gray-400 transition-transform duration-200",
                                showErrorLogs && "rotate-90"
                              )}
                            />
                            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                              Server Logs ({currentDevServerLogs.length} lines)
                            </span>
                          </div>

                          {showErrorLogs && (
                            <div className="max-h-64 overflow-y-auto bg-gray-950 dark:bg-black text-gray-300 p-3 rounded border border-gray-800 font-mono text-xs">
                              {currentDevServerLogs.map((log, index) => (
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
          ) : (
            /* Priority 2: Traditional Artifact Preview (no preview.sh) */
            <>
              {previewContent ? (
                <div className="flex-1 flex flex-col p-3 overflow-hidden">
                  <div className="flex-1 flex flex-col rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden shadow-sm">
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
              ) : (
                /* Priority 3: Empty State */
                <EmptyState icon={<Monitor className="w-10 h-10" />} title="Unable to Preview" description="This artifact doesn't seem to contain any previewable HTML or SVG content." />
              )}
            </>
          )}
        </TabsContent>

        {/* Files Tab Content - Workspace Files */}
        <TabsContent
          value="files"
          className="flex-1 min-h-0 m-0 flex flex-col overflow-hidden data-[state=inactive]:hidden data-[state=active]:animate-in data-[state=active]:fade-in data-[state=active]:duration-300"
        >
          {/* Toolbar: Search + Refresh */}
          <div className="h-10 flex items-center gap-2 px-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
              <Input
                placeholder="Search files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-7 pl-7 text-xs bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-blue-400 dark:focus:border-blue-600"
              />
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={handleRefresh}
              disabled={isLoadingTree}
            >
              <RefreshCw className={cn("w-3 h-3", isLoadingTree && "animate-spin")} />
            </Button>
          </div>

          {workspaceTree.length > 0 ? (
            <div className="flex-1 flex w-full overflow-hidden">
              {/* Left: File Tree */}
              <div className={cn(
                "border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 overflow-y-auto shrink-0",
                selectedFilePath ? "w-48 border-r" : "flex-1"
              )}>
                <WorkspaceFileTree
                  treeData={workspaceTree}
                  selectedPath={selectedFilePath}
                  onSelectFile={handleFileSelect}
                  searchQuery={searchQuery}
                />
              </div>

              {/* Right: Code Viewer - Only show when file is selected */}
              {selectedFilePath && (
                <div className="flex-1 flex flex-col overflow-hidden bg-[#282a36]">
                  <div className="h-8 flex items-center justify-between px-3 bg-black/20 border-b border-white/5 shrink-0">
                    <span className="text-[10px] font-mono text-gray-400">{selectedFileName}</span>
                    <div className="flex items-center gap-2">
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-gray-500 hover:text-white" onClick={handleCopyFile}>
                        <Copy className="w-3 h-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-gray-500 hover:text-white" onClick={handleDownloadFile}>
                        <Download className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-auto selection:bg-blue-500/30">
                    {isLoadingFile ? (
                      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                        Loading...
                      </div>
                    ) : (
                      <SyntaxHighlighter
                        language={getLanguageFromPath(selectedFilePath)}
                        style={dracula}
                        customStyle={{
                          margin: 0,
                          paddingTop: '0.5rem',
                          paddingBottom: '0.75rem',
                          paddingLeft: '0.75rem',
                          paddingRight: '0.75rem',
                          fontSize: '12px',
                          lineHeight: '1.6',
                          backgroundColor: 'transparent',
                          minHeight: '100%'
                        }}
                        showLineNumbers={true}
                        lineNumberStyle={{ minWidth: '2.5em', paddingRight: '1em', color: '#6272a4', opacity: 0.5 }}
                      >
                        {selectedFileContent || ''}
                      </SyntaxHighlighter>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <EmptyState
              icon={<FileCode className="w-10 h-10" />}
              title={isLoadingTree ? "Loading Workspace..." : "No Files in Workspace"}
              description={isLoadingTree ? "Please wait..." : "The workspace directory is empty or doesn't exist yet."}
            />
          )}
        </TabsContent>

        {/* Action Footer */}
        <div className="h-12 flex items-center justify-between px-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-950/50 shrink-0">
          <div className="flex items-center gap-2">
            {
              <div onClick={handleCopyWorkspacePath} className='select-none cursor-pointer flex items-center gap-2'>
                <button
                  className="rounded hover:bg-gray-200 dark:hover:bg-gray-700 p-1 transition-colors group"
                  title="Copy workspace path"
                >
                  <FolderOpen className="w-3 h-3 text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300" />
                </button>
                <div className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-[9px] font-bold uppercase tracking-wider">
                  {countFilesInTree(workspaceTree)} Files
                </div>
              </div>
            }
          </div>
          <div className="flex items-center gap-2">
            {artifactsActiveTab === 'files' ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[10px] bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 hover:bg-gray-50"
                  disabled={!selectedFileContent}
                  onClick={handleDownloadFile}
                >
                  <Download className="w-3 h-3 mr-1.5" />
                  Download
                </Button>
                <Button
                  size="sm"
                  variant="default"
                  className="h-7 text-[10px] bg-blue-600 hover:bg-blue-700 text-white shadow-sm font-semibold"
                  disabled={!selectedFileContent}
                  onClick={handleCopyFile}
                >
                  <Copy className="w-3 h-3 mr-1.5" />
                  Copy File
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[10px] bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 hover:bg-gray-50"
                  disabled={files.length === 0}
                  onClick={handleDownload}
                >
                  <Download className="w-3 h-3 mr-1.5" />
                  ZIP Project
                </Button>
                <Button
                  size="sm"
                  variant="default"
                  className="h-7 text-[10px] bg-blue-600 hover:bg-blue-700 text-white shadow-sm font-semibold"
                  disabled={files.length === 0}
                  onClick={handleCopy}
                >
                  <Copy className="w-3 h-3 mr-1.5" />
                  Copy File
                </Button>
              </>
            )}
          </div>
        </div>
      </Tabs>
    </div>
  )
}

const EmptyState = ({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) => (
  <div className="flex-1 w-full flex flex-col items-center justify-center p-8 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
    <div className="w-20 h-20 rounded-3xl bg-gray-50/50 dark:bg-gray-900/50 border border-black/5 dark:border-white/5 flex items-center justify-center text-gray-300 dark:text-gray-700 mb-6 shadow-sm">
      {icon}
    </div>
    <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-2">{title}</h3>
    <p className="text-xs text-gray-500 dark:text-gray-400 max-w-[240px] leading-relaxed">
      {description}
    </p>
  </div>
)
