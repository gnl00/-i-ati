import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { WorkspaceFileTree } from './WorkspaceFileTree'
import { ArtifactsEmptyState } from './ArtifactsEmptyState'
import type { UseWorkspaceFilesReturn } from './useWorkspaceFiles'
import { copyFileToClipboard, getLanguageFromPath } from './artifactUtils'
import { cn } from '@renderer/lib/utils'
import {
  Copy,
  FileCode,
  RefreshCw,
  Search
} from 'lucide-react'
import SyntaxHighlighter from 'react-syntax-highlighter'
import { dracula } from 'react-syntax-highlighter/dist/esm/styles/hljs'

export const ArtifactsFilesTab: React.FC<{
  files: UseWorkspaceFilesReturn
  searchQuery: string
}> = ({ files, searchQuery }) => {

  if (files.workspaceTree.length === 0) {
    return (
      <ArtifactsEmptyState
        icon={<FileCode className="w-10 h-10" />}
        title={files.isLoadingTree ? "Loading Workspace..." : "No Files in Workspace"}
        description={files.isLoadingTree ? "Please wait..." : "The workspace directory is empty or doesn't exist yet."}
      />
    )
  }

  return (
    <div className="flex-1 flex w-full overflow-hidden">
      {/* Left: File Tree */}
      <div className={cn(
        "border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 overflow-y-auto shrink-0",
        files.selectedFilePath ? "w-48 border-r" : "flex-1"
      )}>
        <WorkspaceFileTree
          treeData={files.workspaceTree}
          selectedPath={files.selectedFilePath}
          onSelectFile={files.handleFileSelect}
          searchQuery={searchQuery}
        />
      </div>

      {/* Right: Code Viewer - Only show when file is selected */}
      {files.selectedFilePath && (
        <div className="flex-1 flex flex-col overflow-hidden bg-[#282a36]">
          <div className="h-8 flex items-center justify-between px-3 bg-black/20 border-b border-white/5 shrink-0">
            <span className="text-[10px] font-mono text-gray-400">{files.selectedFileName}</span>
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="ghost"
                className={cn(
                  "h-6 w-6 rounded-md",
                  "text-gray-500 border border-transparent bg-transparent",
                  "transition-all duration-200 ease-out",
                  "hover:text-white hover:bg-white/10 hover:border-white/20 hover:-translate-y-px",
                  "active:translate-y-0 active:scale-[0.97]"
                )}
                onClick={() => copyFileToClipboard(files.selectedFileContent || '', files.selectedFileName || '')}
              >
                <Copy className="w-3 h-3" />
              </Button>
              {/* <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-gray-500 hover:text-white"
                onClick={() => downloadFile(files.selectedFileContent || '', files.selectedFileName || '')}
              >
                <Download className="w-3 h-3" />
              </Button> */}
            </div>
          </div>
          <div className="flex-1 overflow-auto selection:bg-blue-500/30">
            {files.isLoadingFile ? (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                Loading...
              </div>
            ) : (
              <SyntaxHighlighter
                language={getLanguageFromPath(files.selectedFilePath)}
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
                {files.selectedFileContent || ''}
              </SyntaxHighlighter>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Toolbar component (to be used in parent or integrated)
export const FilesTabToolbar: React.FC<{
  searchQuery: string
  onSearchChange: (value: string) => void
  onRefresh: () => void
  isLoading: boolean
}> = ({ searchQuery, onSearchChange, onRefresh, isLoading }) => {
  return (
    <div className="h-10 flex items-center gap-2 px-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 shrink-0">
      <div className="relative flex-1">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
        <Input
          placeholder="Search files..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-7 pl-7 text-xs bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-blue-400 dark:focus:border-blue-600"
        />
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        onClick={onRefresh}
        disabled={isLoading}
      >
        <RefreshCw className={cn("w-3 h-3", isLoading && "animate-spin")} />
      </Button>
    </div>
  )
}
