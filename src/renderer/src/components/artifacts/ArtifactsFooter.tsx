import React from 'react'
import { Button } from '@renderer/components/ui/button'
import { FolderOpen } from 'lucide-react'

interface ArtifactsFooterProps {
  filesCount: number
  onOpenWorkspaceFolder: () => void
}

export const ArtifactsFooter: React.FC<ArtifactsFooterProps> = ({
  filesCount,
  onOpenWorkspaceFolder,
}) => {
  return (
    <div className="h-12 flex items-center justify-between px-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-950/50 shrink-0">
      <div className="flex items-center gap-2">
        <div className='select-none flex items-center gap-2'>
          <Button
            size="sm"
            variant="outline"
            className="h-6 rounded-lg px-2.5 text-[10px] border-gray-100 dark:border-gray-700"
            onClick={onOpenWorkspaceFolder}
            title="Open workspace folder"
          >
            <FolderOpen className="w-3 h-3 mr-1.5" />
            Open folder
          </Button>
          <div className="h-5 inline-flex items-center rounded-lg px-2.5 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-[10px] font-semibold tracking-wide">
            {filesCount} Files
          </div>
        </div>
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
