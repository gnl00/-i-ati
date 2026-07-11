import { Button } from '@renderer/shared/components/ui/button'
import { Input } from '@renderer/shared/components/ui/input'
import { WorkspaceFileTree } from './WorkspaceFileTree'
import { ArtifactsEmptyState } from './ArtifactsEmptyState'
import type { UseWorkspaceFilesReturn } from './useWorkspaceFiles'
import { copyFileToClipboard, getLanguageFromPath } from './artifactUtils'
import { cn } from '@renderer/shared/lib/utils'
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
    <div className="flex-1 flex w-full overflow-hidden bg-zinc-100/50 dark:bg-zinc-950">
      <div className={cn(
        "overflow-y-auto shrink-0 border-black/[0.06] bg-white/70 dark:border-white/[0.08] dark:bg-zinc-950",
        files.selectedFilePath ? "w-52 border-r" : "flex-1"
      )}>
        <WorkspaceFileTree
          treeData={files.workspaceTree}
          selectedPath={files.selectedFilePath}
          onSelectFile={files.handleFileSelect}
          searchQuery={searchQuery}
        />
      </div>

      {files.selectedFilePath && (
        <div className="flex-1 flex min-w-0 flex-col overflow-hidden bg-[#252735]">
          <div className="h-9 flex items-center justify-between gap-3 border-b border-white/8 bg-[#202230] px-3 shrink-0">
            <div className="flex min-w-0 items-center gap-2">
              <FileCode className="h-3.5 w-3.5 shrink-0 text-blue-300/80" />
              <span className="truncate font-mono text-[10px] font-medium text-zinc-200">{files.selectedFileName}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="ghost"
                className={cn(
                  "h-6 w-6 rounded-md border border-transparent bg-transparent text-zinc-500",
                  "transition-[background-color,border-color,color,transform] duration-200 ease-out",
                  "hover:-translate-y-px hover:border-white/15 hover:bg-white/10 hover:text-zinc-100",
                  "active:translate-y-0 active:scale-[0.97]"
                )}
                onClick={() => copyFileToClipboard(files.selectedFileContent || '', files.selectedFileName || '')}
                title="Copy file"
              >
                <Copy className="h-3 w-3" />
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
              <div className="flex h-full items-center justify-center text-xs text-zinc-400">
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
    <div className="h-10 flex items-center gap-2 border-b border-black/[0.06] bg-zinc-50/90 px-2.5 dark:border-white/[0.08] dark:bg-zinc-950 shrink-0">
      <div className="relative flex-1">
        <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-400" />
        <Input
          placeholder="Search files..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-7 rounded-md border-black/[0.08] bg-white pl-7 text-xs text-zinc-700 shadow-none placeholder:text-zinc-400 focus:border-blue-400 focus-visible:ring-0 focus-visible:ring-offset-0 dark:border-white/[0.1] dark:bg-zinc-900 dark:text-zinc-200 dark:focus:border-blue-500"
        />
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-blue-600 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-blue-300"
        onClick={onRefresh}
        disabled={isLoading}
        title="Refresh files"
      >
        <RefreshCw className={cn("h-3 w-3", isLoading && "animate-spin")} />
      </Button>
    </div>
  )
}
