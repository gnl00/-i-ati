import { cn } from '@renderer/shared/lib/utils'
import { ChevronDown, ChevronRight, FileCode, Folder, FolderOpen, Link2 } from 'lucide-react'
import React, { useMemo, useState } from 'react'

export interface FileTreeNode {
  name: string
  path: string
  type: 'file' | 'directory' | 'symlink'
  children?: FileTreeNode[]
}

interface WorkspaceFileTreeProps {
  treeData: FileTreeNode[]
  selectedPath?: string
  onSelectFile: (path: string) => void
  searchQuery: string
}

export const WorkspaceFileTree: React.FC<WorkspaceFileTreeProps> = ({
  treeData,
  selectedPath,
  onSelectFile,
  searchQuery
}) => {
  // Track expanded directories by path
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())

  // Sort nodes: directories first, then alphabetically
  const sortNodes = (nodes: FileTreeNode[]): FileTreeNode[] => {
    return [...nodes].sort((a, b) => {
      // Directories first
      if (a.type === 'directory' && b.type === 'file') return -1
      if (a.type === 'file' && b.type === 'directory') return 1
      // Then alphabetically by name (case-insensitive)
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
  }

  // Filter tree based on search query
  const filteredTree = useMemo(() => {
    if (!searchQuery.trim()) return sortNodes(treeData)

    const query = searchQuery.toLowerCase()

    const filterNode = (node: FileTreeNode): FileTreeNode | null => {
      const nameMatches = node.name.toLowerCase().includes(query)

      if (node.type !== 'directory') {
        return nameMatches ? node : null
      }

      // For directories, check children recursively
      const filteredChildren = node.children
        ? sortNodes(node.children.map(filterNode).filter((n): n is FileTreeNode => n !== null))
        : []

      // Include directory if name matches OR it has matching children
      if (nameMatches || filteredChildren.length > 0) {
        return {
          ...node,
          children: filteredChildren
        }
      }

      return null
    }

    return sortNodes(treeData.map(filterNode).filter((n): n is FileTreeNode => n !== null))
  }, [treeData, searchQuery])

  // Auto-expand directories that have matching children when searching
  React.useEffect(() => {
    if (!searchQuery.trim()) return

    const collectExpandedPaths = (nodes: FileTreeNode[]): string[] => {
      const paths: string[] = []
      nodes.forEach(node => {
        if (node.type === 'directory' && node.children && node.children.length > 0) {
          paths.push(node.path)
          paths.push(...collectExpandedPaths(node.children))
        }
      })
      return paths
    }

    const pathsToExpand = collectExpandedPaths(filteredTree)
    setExpandedDirs(new Set(pathsToExpand))
  }, [searchQuery, filteredTree])

  const toggleDirectory = (path: string): void => {
    setExpandedDirs(prev => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  if (filteredTree.length === 0) {
    return (
      <div className="p-4 text-center text-xs text-zinc-400 dark:text-zinc-500">
        {searchQuery ? 'No files match your search' : 'Empty directory'}
      </div>
    )
  }

  return (
    <div className="py-1.5">
      {filteredTree.map(node => (
        <TreeNodeComponent
          key={node.path}
          node={node}
          level={0}
          expandedDirs={expandedDirs}
          selectedPath={selectedPath}
          onToggleDir={toggleDirectory}
          onSelectFile={onSelectFile}
        />
      ))}
    </div>
  )
}

interface TreeNodeComponentProps {
  node: FileTreeNode
  level: number
  expandedDirs: Set<string>
  selectedPath?: string
  onToggleDir: (path: string) => void
  onSelectFile: (path: string) => void
  parentIsUtility?: boolean
}

// Check if directory is a utility/generated folder that should be de-emphasized
const isUtilityFolder = (name: string): boolean => {
  const utilityFolders = [
    'node_modules',
    'dist',
    'build',
    '.next',
    '.nuxt',
    'out',
    'coverage',
    '.cache',
    '.turbo',
    '.vercel',
    '.netlify'
  ]
  const hiddenFolders = [
    '.git',
    '.vscode',
    '.idea',
    '.vs',
    '.DS_Store',
    '__pycache__',
    '.pytest_cache',
    '.mypy_cache',
    '.tox'
  ]

  return utilityFolders.includes(name) || hiddenFolders.includes(name) || name.startsWith('.')
}

const TreeNodeComponent: React.FC<TreeNodeComponentProps> = ({
  node,
  level,
  expandedDirs,
  selectedPath,
  onToggleDir,
  onSelectFile,
  parentIsUtility = false
}) => {
  const isExpanded = expandedDirs.has(node.path)
  const isSelected = selectedPath === node.path
  const paddingLeft = `${level * 12 + 8}px`
  // Check if this node or any parent is a utility folder
  const isUtility = parentIsUtility || (node.type === 'directory' && isUtilityFolder(node.name))

  if (node.type === 'directory') {
    return (
      <div>
        <button
          onClick={() => onToggleDir(node.path)}
          className={cn(
            "group flex w-full items-center gap-1.5 px-2 py-1 text-left text-[11px] transition-colors",
            "hover:bg-zinc-100 dark:hover:bg-zinc-900",
            isExpanded && "bg-zinc-50 dark:bg-zinc-900/70",
            isUtility && "opacity-55"
          )}
          style={{ paddingLeft }}
        >
          {isExpanded ? (
            <ChevronDown className={cn(
              "h-3 w-3 shrink-0",
              isUtility ? "text-zinc-300 dark:text-zinc-700" : "text-zinc-400"
            )} />
          ) : (
            <ChevronRight className={cn(
              "h-3 w-3 shrink-0",
              isUtility ? "text-zinc-300 dark:text-zinc-700" : "text-zinc-400"
            )} />
          )}
          {isExpanded ? (
            <FolderOpen className={cn(
              "h-3 w-3 shrink-0",
              isUtility ? "text-zinc-400 dark:text-zinc-700" : "text-blue-500"
            )} />
          ) : (
            <Folder className={cn(
              "h-3 w-3 shrink-0",
              isUtility ? "text-zinc-400 dark:text-zinc-700" : "text-blue-400"
            )} />
          )}
          <span className={cn(
            "truncate font-medium",
            isUtility ? "text-zinc-400 dark:text-zinc-600" : "text-zinc-700 dark:text-zinc-300"
          )}>
            {node.name}
          </span>
        </button>
        {isExpanded && node.children && (
          <div>
            {node.children.map(child => (
              <TreeNodeComponent
                key={child.path}
                node={child}
                level={level + 1}
                expandedDirs={expandedDirs}
                selectedPath={selectedPath}
                onToggleDir={onToggleDir}
                onSelectFile={onSelectFile}
                parentIsUtility={isUtility}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  // File node
  return (
    <button
      onClick={() => onSelectFile(node.path)}
      className={cn(
        "group flex w-full items-center gap-1.5 px-2 py-1 text-left text-[11px] transition-colors",
        isSelected
          ? "bg-blue-500/10 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"
          : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900",
        isUtility && "opacity-55"
      )}
      style={{ paddingLeft: `${level * 12 + 8 + 16}px` }} // Extra padding for file indentation
    >
      {node.type === 'symlink' ? (
        <Link2
          className={cn(
            'h-3 w-3 shrink-0',
            isSelected
              ? 'text-blue-500'
              : 'text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300'
          )}
        />
      ) : (
        <FileCode
          className={cn(
            "h-3 w-3 shrink-0",
            isUtility
              ? "text-zinc-300 dark:text-zinc-700"
              : isSelected
                ? "text-blue-500"
                : "text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300"
          )}
        />
      )}
      <span className={cn(
        "truncate",
        isUtility && !isSelected && "text-zinc-400 dark:text-zinc-600"
      )}>{node.name}</span>
    </button>
  )
}
