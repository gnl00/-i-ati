import { AnimatedTabsList } from '@renderer/components/ui/animated-tabs'
import { Button } from '@renderer/components/ui/button'
import { Tabs, TabsContent } from '@renderer/components/ui/tabs'
import { useChatContext } from '@renderer/context/ChatContext'
import { useChatStore } from '@renderer/store'
import {
  FileCode,
  Monitor,
  X
} from 'lucide-react'
import { useState } from 'react'
import { ArtifactsFilesTab, FilesTabToolbar } from './ArtifactsFilesTab'
import { ArtifactsFooter } from './ArtifactsFooter'
import { ArtifactsPreviewTab } from './ArtifactsPreviewTab'
import { downloadFile, openWorkspaceFolder } from './artifactUtils'
import { useWorkspaceFiles } from './useWorkspaceFiles'

export const ArtifactsPanel: React.FC = () => {
  const { setArtifactsPanel, artifactsActiveTab, setArtifactsActiveTab } = useChatStore()
  const { chatUuid } = useChatContext()
  const [searchQuery, setSearchQuery] = useState('')

  // Get workspace files state for Files tab and Footer
  const files = useWorkspaceFiles()

  // Handlers for Footer actions
  const handleCopyFile = async () => {
    if (!files.selectedFileContent) return
    // TODO: Implement copy functionality
    console.log('Copy file:', files.selectedFileName)
  }

  const handleDownloadFile = () => {
    if (!files.selectedFileContent || !files.selectedFileName) return
    downloadFile(files.selectedFileContent, files.selectedFileName)
  }

  const handleOpenWorkspaceFolder = async () => {
    if (!chatUuid) return
    await openWorkspaceFolder(chatUuid, files.workspacePath)
  }

  // Artifact files for Preview tab (TODO: determine actual source)
  const artifactFilesCount = 0 // Placeholder

  const handleClose = () => {
    setArtifactsPanel(false)
  }

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

  // Calculate files count from workspace tree
  const filesCount = files.workspaceTree.reduce((count, node) => {
    if (node.type === 'file') return count + 1
    if (node.children) return count + node.children.reduce((childCount, childNode) => {
      if (childNode.type === 'file') return childCount + 1
      return childCount
    }, 0)
    return count
  }, 0)

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
          <ArtifactsPreviewTab />
        </TabsContent>

        {/* Files Tab Content */}
        <TabsContent
          value="files"
          className="flex-1 min-h-0 m-0 flex flex-col overflow-hidden data-[state=inactive]:hidden data-[state=active]:animate-in data-[state=active]:fade-in data-[state=active]:duration-300"
        >
          {/* Toolbar */}
          <FilesTabToolbar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onRefresh={files.handleRefresh}
            isLoading={files.isLoadingTree}
          />

          {/* Files Tab Content */}
          <ArtifactsFilesTab files={files} searchQuery={searchQuery} />
        </TabsContent>

        {/* Action Footer */}
        <ArtifactsFooter
          activeTab={artifactsActiveTab as 'preview' | 'files'}
          selectedFileContent={files.selectedFileContent}
          filesCount={filesCount}
          artifactFilesCount={artifactFilesCount}
          onCopyFile={handleCopyFile}
          onDownloadFile={handleDownloadFile}
          onOpenWorkspaceFolder={handleOpenWorkspaceFolder}
        />
      </Tabs>
    </div>
  )
}
