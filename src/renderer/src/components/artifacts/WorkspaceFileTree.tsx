import { cn } from '@renderer/lib/utils'
import { ChevronDown, ChevronRight, FileCode, Folder, FolderOpen } from 'lucide-react'
import React, { useMemo, useState } from 'react'

export interface FileTreeNode {
  name: string
  path: string
  type: 'file' | 'directory'
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

  // Filter tree based on search query
  const filteredTree = useMemo(() => {
    if (!searchQuery.trim()) return treeData

    const query = searchQuery.toLowerCase()

    const filterNode = (node: FileTreeNode): FileTreeNode | null => {
      const nameMatches = node.name.toLowerCase().includes(query)

      if (node.type === 'file') {
        return nameMatches ? node : null
      }

      // For directories, check children recursively
      const filteredChildren = node.children
        ? node.children.map(filterNode).filter((n): n is FileTreeNode => n !== null)
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

    return treeData.map(filterNode).filter((n): n is FileTreeNode => n !== null)
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

  const toggleDirectory = (path: string) => {
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
      <div className="p-4 text-center text-gray-400 text-xs">
        {searchQuery ? 'No files match your search' : 'Empty directory'}
      </div>
    )
  }

  return (
    <div className="py-1">
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
}

const TreeNodeComponent: React.FC<TreeNodeComponentProps> = ({
  node,
  level,
  expandedDirs,
  selectedPath,
  onToggleDir,
  onSelectFile
}) => {
  const isExpanded = expandedDirs.has(node.path)
  const isSelected = selectedPath === node.path
  const paddingLeft = `${level * 12 + 8}px`

  if (node.type === 'directory') {
    return (
      <div>
        <button
          onClick={() => onToggleDir(node.path)}
          className={cn(
            "w-full flex items-center gap-1.5 px-2 py-1 text-left text-[11px] transition-colors group hover:bg-gray-100 dark:hover:bg-gray-800",
            isExpanded && "bg-gray-50 dark:bg-gray-900/50"
          )}
          style={{ paddingLeft }}
        >
          {isExpanded ? (
            <ChevronDown className="w-3 h-3 text-gray-400 shrink-0" />
          ) : (
            <ChevronRight className="w-3 h-3 text-gray-400 shrink-0" />
          )}
          {isExpanded ? (
            <FolderOpen className="w-3 h-3 text-blue-500 shrink-0" />
          ) : (
            <Folder className="w-3 h-3 text-blue-400 shrink-0" />
          )}
          <span className="truncate text-gray-700 dark:text-gray-300 font-medium">
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
        "w-full flex items-center gap-1.5 px-2 py-1 text-left text-[11px] transition-colors group",
        isSelected
          ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
          : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
      )}
      style={{ paddingLeft: `${level * 12 + 8 + 16}px` }} // Extra padding for file indentation
    >
      <FileCode
        className={cn(
          "w-3 h-3 shrink-0",
          isSelected ? "text-blue-500" : "text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300"
        )}
      />
      <span className="truncate">{node.name}</span>
    </button>
  )
}
