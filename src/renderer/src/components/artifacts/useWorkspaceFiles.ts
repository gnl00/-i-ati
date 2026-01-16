import { useState, useCallback, useEffect, useMemo } from 'react'
import { useChatContext } from '@renderer/context/ChatContext'
import { getWorkspacePath } from '@renderer/utils/workspaceUtils'
import { getChatWorkspacePath } from '@renderer/utils/chatWorkspace'
import { invokeDirectoryTree, invokeReadTextFile } from '@tools/fileOperations/renderer/FileOperationsInvoker'
import type { TreeNode } from '@tools/fileOperations/index.d'
import { type FileTreeNode } from './WorkspaceFileTree'

export interface UseWorkspaceFilesReturn {
  workspaceTree: FileTreeNode[]
  selectedFilePath: string | undefined
  selectedFileContent: string | undefined
  selectedFileName: string | undefined
  workspacePath: string | undefined
  isLoadingTree: boolean
  isLoadingFile: boolean
  handleFileSelect: (path: string) => Promise<void>
  handleRefresh: () => void
}

export function useWorkspaceFiles(): UseWorkspaceFilesReturn {
  const { chatUuid, chatList } = useChatContext()

  // Workspace file tree state
  const [workspaceTree, setWorkspaceTree] = useState<FileTreeNode[]>([])
  const [selectedFilePath, setSelectedFilePath] = useState<string | undefined>()
  const [selectedFileContent, setSelectedFileContent] = useState<string | undefined>()
  const [selectedFileName, setSelectedFileName] = useState<string | undefined>()
  const [isLoadingTree, setIsLoadingTree] = useState(false)
  const [isLoadingFile, setIsLoadingFile] = useState(false)

  const currentWorkspacePath = useMemo(() => {
    return getChatWorkspacePath({ chatUuid, chatList })
  }, [chatUuid, chatList])
  const resolvedWorkspacePath = useMemo(() => {
    if (!chatUuid) return undefined
    return getWorkspacePath(chatUuid, currentWorkspacePath)
  }, [chatUuid, currentWorkspacePath])

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
    if (!chatUuid || !resolvedWorkspacePath) {
      setWorkspaceTree([])
      return
    }

    setIsLoadingTree(true)
    try {
      console.log('[useWorkspaceFiles] Loading workspace tree:', resolvedWorkspacePath)

      const result = await invokeDirectoryTree({
        directory_path: resolvedWorkspacePath!,
        max_depth: 10
      })

      if (result.success && result.tree) {
        setWorkspaceTree(convertToFileTreeNodes(result.tree))
      } else {
        console.warn('[useWorkspaceFiles] Failed to load workspace tree:', result.error)
        setWorkspaceTree([])
      }
    } catch (error) {
      console.error('[useWorkspaceFiles] Error loading workspace tree:', error)
      setWorkspaceTree([])
    } finally {
      setIsLoadingTree(false)
    }
  }, [chatUuid, resolvedWorkspacePath, convertToFileTreeNodes])

  // Read file content
  const handleFileSelect = useCallback(async (filePath: string) => {
    setSelectedFilePath(filePath)
    setSelectedFileName(filePath.split('/').pop())
    setIsLoadingFile(true)

    try {
      console.log('[useWorkspaceFiles] Reading file:', filePath)

      const result = await invokeReadTextFile({
        file_path: filePath
      })

      if (result.success && result.content) {
        setSelectedFileContent(result.content)
      } else {
        console.warn('[useWorkspaceFiles] Failed to read file:', result.error)
        setSelectedFileContent('// Failed to load file content\n// ' + (result.error || 'Unknown error'))
      }
    } catch (error: any) {
      console.error('[useWorkspaceFiles] Error reading file:', error)
      setSelectedFileContent('// Error loading file\n// ' + (error.message || 'Unknown error'))
    } finally {
      setIsLoadingFile(false)
    }
  }, [])

  // Refresh workspace tree
  const handleRefresh = useCallback(() => {
    setSelectedFilePath(undefined)
    setSelectedFileContent(undefined)
    setSelectedFileName(undefined)
    loadWorkspaceTree()
  }, [loadWorkspaceTree])

  // Load workspace tree on mount and when chatUuid changes
  useEffect(() => {
    loadWorkspaceTree()
  }, [loadWorkspaceTree])

  useEffect(() => {
    setSelectedFilePath(undefined)
    setSelectedFileContent(undefined)
    setSelectedFileName(undefined)
    setWorkspaceTree([])
  }, [resolvedWorkspacePath])

  return {
    workspaceTree,
    selectedFilePath,
    selectedFileContent,
    selectedFileName,
    workspacePath: resolvedWorkspacePath,
    isLoadingTree,
    isLoadingFile,
    handleFileSelect,
    handleRefresh
  }
}
