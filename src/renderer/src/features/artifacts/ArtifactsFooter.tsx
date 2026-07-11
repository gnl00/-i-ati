import React from 'react'
import { Button } from '@renderer/shared/components/ui/button'
import { FolderOpen } from 'lucide-react'

interface ArtifactsFooterProps {
  filesCount: number
  isLoading: boolean
  onOpenWorkspaceFolder: () => void
}

export const ArtifactsFooter: React.FC<ArtifactsFooterProps> = ({
  filesCount,
  isLoading,
  onOpenWorkspaceFolder,
}) => {
  const statusText = isLoading
    ? 'Indexing workspace'
    : filesCount === 1
      ? '1 file ready'
      : `${filesCount} files`

  return (
    <div className="h-9 flex items-center justify-between gap-3 border-t border-black/6 bg-white/70 px-2.5 text-[10px] text-zinc-500 dark:border-white/[0.08] dark:bg-zinc-950/70 dark:text-zinc-400 shrink-0">
      <div className="flex items-center gap-2">
        <div className="select-none flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-6 rounded-md border-black/8 bg-white/70 px-2 text-[10px] font-medium text-zinc-600 shadow-none transition-colors hover:bg-zinc-100 dark:border-white/[0.1] dark:bg-zinc-900/70 dark:text-zinc-300 dark:hover:bg-zinc-800"
            onClick={onOpenWorkspaceFolder}
            title="Open workspace folder"
          >
            <FolderOpen className="mr-1.5 h-3 w-3" />
            Open folder
          </Button>
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-1.5 truncate font-medium select-none">
        <span className="truncate">{statusText}</span>
      </div>
      {/* <div className="flex items-center gap-2">
        {activeTab === 'files' ? (
          <>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[10px] bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 hover:bg-gray-50"
              disabled={!selectedFileContent}
              onClick={onDownloadFile}
            >
              <Download className="w-3 h-3 mr-1.5" />
              Download
            </Button>
            <Button
              size="sm"
              variant="default"
              className="h-7 text-[10px] bg-blue-600 hover:bg-blue-700 text-white shadow-xs font-semibold"
              disabled={!selectedFileContent}
              onClick={onCopyFile}
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
              disabled={artifactFilesCount === 0}
              onClick={onDownloadFile}
            >
              <Download className="w-3 h-3 mr-1.5" />
              ZIP Project
            </Button>
            <Button
              size="sm"
              variant="default"
              className="h-7 text-[10px] bg-blue-600 hover:bg-blue-700 text-white shadow-xs font-semibold"
              disabled={artifactFilesCount === 0}
              onClick={onCopyFile}
            >
              <Copy className="w-3 h-3 mr-1.5" />
              Copy File
            </Button>
          </>
        )}
      </div> */}
    </div>
  )
}
