import React from 'react'
import { Button } from '@renderer/components/ui/button'
import { Copy, Download, FolderOpen } from 'lucide-react'

interface ArtifactsFooterProps {
  activeTab: 'preview' | 'files'
  selectedFileContent?: string
  filesCount: number
  onCopyFile: () => void
  onDownloadFile: () => void
  onCopyWorkspacePath: () => void
  // For Preview Tab
  artifactFilesCount?: number
}

export const ArtifactsFooter: React.FC<ArtifactsFooterProps> = ({
  activeTab,
  selectedFileContent,
  filesCount,
  onCopyFile,
  onDownloadFile,
  onCopyWorkspacePath,
  artifactFilesCount = 0
}) => {
  return (
    <div className="h-12 flex items-center justify-between px-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-950/50 shrink-0">
      <div className="flex items-center gap-2">
        <div
          onClick={onCopyWorkspacePath}
          className='select-none cursor-pointer flex items-center gap-2'
        >
          <button
            className="rounded hover:bg-gray-200 dark:hover:bg-gray-700 p-1 transition-colors group"
            title="Copy workspace path"
          >
            <FolderOpen className="w-3 h-3 text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300" />
          </button>
          <div className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-[9px] font-bold uppercase tracking-wider">
            {filesCount} Files
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
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
      </div>
    </div>
  )
}
