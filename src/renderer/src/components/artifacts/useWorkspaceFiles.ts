import { useState, useCallback, useEffect } from 'react'
import { useChatContext } from '@renderer/context/ChatContext'
import { getWorkspacePath } from '@renderer/utils/workspaceUtils'
import { invokeDirectoryTree, invokeReadTextFile } from '@tools/fileOperations/renderer/FileOperationsInvoker'
import type { TreeNode } from '@tools/fileOperations/index.d'
import { type FileTreeNode } from './WorkspaceFileTree'
import { convertToRelativePath } from './artifactUtils'

interface UseWorkspaceFilesReturn {
  workspaceTree: FileTreeNode[]
  selectedFilePath: string | undefined
  selectedFileContent: string | undefined
  selectedFileName: string | undefined
  isLoadingTree: boolean
  isLoadingFile: boolean
  handleFileSelect: (path: string) => Promise<void>
  handleRefresh: () => void
}

export function useWorkspaceFiles(): UseWorkspaceFilesReturn {
  const { chatUuid } = useChatContext()

  // Workspace file tree state
  const [workspaceTree, setWorkspaceTree] = useState<FileTreeNode[]>([])
  const [selectedFilePath, setSelectedFilePath] = useState<string | undefined>()
  const [selectedFileContent, setSelectedFileContent] = useState<string | undefined>()
  const [selectedFileName, setSelectedFileName] = useState<string | undefined>()
  const [isLoadingTree, setIsLoadingTree] = useState(false)
  const [isLoadingFile, setIsLoadingFile] = useState(false)

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
      console.log('[useWorkspaceFiles] Loading workspace tree:', workspacePath)

      const result = await invokeDirectoryTree({
        directory_path: workspacePath,
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
  }, [chatUuid, convertToFileTreeNodes])

  // Read file content
  const handleFileSelect = useCallback(async (filePath: string) => {
    setSelectedFilePath(filePath)
    setSelectedFileName(filePath.split('/').pop())
    setIsLoadingFile(true)

    try {
      // Convert absolute path to relative path for IPC call
      const relativePath = convertToRelativePath(filePath)
      console.log('[useWorkspaceFiles] Reading file:', filePath, '-> relative:', relativePath)

      const result = await invokeReadTextFile({
        file_path: relativePath
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

  return {
    workspaceTree,
    selectedFilePath,
    selectedFileContent,
    selectedFileName,
    isLoadingTree,
    isLoadingFile,
    handleFileSelect,
    handleRefresh
  }
}
