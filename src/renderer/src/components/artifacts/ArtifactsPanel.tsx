import { Button } from '@renderer/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { useChatStore } from '@renderer/store/chatStore'
import {
  X
} from 'lucide-react'
import { useState } from 'react'
import ChatStatsPanel from '@renderer/components/chat/chatInput/toolbar/ChatStatsPanel'
import { ArtifactsFilesTab, FilesTabToolbar } from './ArtifactsFilesTab'
import { ArtifactsFooter } from './ArtifactsFooter'
import { ArtifactsPreviewTab } from './ArtifactsPreviewTab'
import { openWorkspaceFolder } from './artifactUtils'
import { useWorkspaceFiles } from './useWorkspaceFiles'

export const ArtifactsPanel: React.FC = () => {
  const { setArtifactsPanel, artifactsActiveTab, setArtifactsActiveTab } = useChatStore()
  const chatUuid = useChatStore(state => state.currentChatUuid)
  const [searchQuery, setSearchQuery] = useState('')

  // Get workspace files state for Files tab and Footer
  const files = useWorkspaceFiles()

  const handleOpenWorkspaceFolder = async () => {
    if (!chatUuid) return
    await openWorkspaceFolder(chatUuid, files.workspacePath)
  }

  const handleClose = () => {
    setArtifactsPanel(false)
  }

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
    <div className="h-full flex flex-col overflow-hidden rounded-lg border border-black/6 bg-zinc-50/95 shadow-xs backdrop-blur-xl dark:border-white/[0.08] dark:bg-zinc-950/95">
      <Tabs
        value={artifactsActiveTab}
        className="flex-1 flex flex-col min-h-0"
        onValueChange={setArtifactsActiveTab}
      >
        <div className="flex h-8 shrink-0 items-center gap-2 border-b border-black/[0.06] bg-white/80 px-2 dark:border-white/[0.08] dark:bg-zinc-950/80">
          <TabsList className="h-full min-w-0 flex-1 justify-start gap-4 rounded-none border-0 bg-transparent p-0 text-zinc-500 dark:text-zinc-500">
            <TabsTrigger
              value="stats"
              className="h-full rounded-none border-b-2 border-transparent bg-transparent px-0.5 py-0 text-[11px] font-medium text-zinc-500 shadow-none transition-[border-color,color] duration-200 hover:text-zinc-800 focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=active]:border-zinc-900 data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-zinc-950 data-[state=active]:shadow-none dark:text-zinc-500 dark:hover:text-zinc-200 dark:data-[state=active]:border-zinc-100 dark:data-[state=active]:text-zinc-50"
            >
              Stats
            </TabsTrigger>
            <TabsTrigger
              value="preview"
              className="h-full rounded-none border-b-2 border-transparent bg-transparent px-0.5 py-0 text-[11px] font-medium text-zinc-500 shadow-none transition-[border-color,color] duration-200 hover:text-zinc-800 focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=active]:border-zinc-900 data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-zinc-950 data-[state=active]:shadow-none dark:text-zinc-500 dark:hover:text-zinc-200 dark:data-[state=active]:border-zinc-100 dark:data-[state=active]:text-zinc-50"
            >
              Preview
            </TabsTrigger>
            <TabsTrigger
              value="files"
              className="h-full rounded-none border-b-2 border-transparent bg-transparent px-0.5 py-0 text-[11px] font-medium text-zinc-500 shadow-none transition-[border-color,color] duration-200 hover:text-zinc-800 focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=active]:border-zinc-900 data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-zinc-950 data-[state=active]:shadow-none dark:text-zinc-500 dark:hover:text-zinc-200 dark:data-[state=active]:border-zinc-100 dark:data-[state=active]:text-zinc-50"
            >
              Files
            </TabsTrigger>
          </TabsList>

          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-md text-zinc-500 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-zinc-400 dark:hover:bg-red-950/30 dark:hover:text-red-300"
            onClick={handleClose}
            title="Close artifacts"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>

        {/* Preview Tab Content */}
        <TabsContent
          value="preview"
          forceMount
          className="flex-1 min-h-0 m-0 flex flex-col overflow-hidden data-[state=inactive]:hidden data-[state=active]:animate-in data-[state=active]:fade-in data-[state=active]:duration-300"
        >
          <ArtifactsPreviewTab files={files} />
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

        {/* Stats Tab Content */}
        <TabsContent
          value="stats"
          className="flex-1 min-h-0 m-0 flex flex-col overflow-hidden data-[state=inactive]:hidden data-[state=active]:animate-in data-[state=active]:fade-in data-[state=active]:duration-300"
        >
          <ChatStatsPanel variant="inline" />
        </TabsContent>

        {/* Action Footer */}
        <ArtifactsFooter
          filesCount={filesCount}
          isLoading={files.isLoadingTree}
          onOpenWorkspaceFolder={handleOpenWorkspaceFolder}
        />
      </Tabs>
    </div>
  )
}
