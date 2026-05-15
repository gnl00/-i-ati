import { AnimatedTabsList } from '@renderer/components/ui/animated-tabs'
import { Button } from '@renderer/components/ui/button'
import { Tabs, TabsContent } from '@renderer/components/ui/tabs'
import { useChatStore } from '@renderer/store/chatStore'
import {
  BoxIcon,
  FileCode,
  Monitor,
  X
} from 'lucide-react'
import { useState } from 'react'
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
  const workspaceStatus = files.isLoadingTree
    ? 'Indexing'
    : filesCount > 0
      ? 'Ready'
      : 'Empty'

  return (
    <div className="h-full flex flex-col overflow-hidden rounded-lg border border-black/6 bg-zinc-50/95 shadow-xs backdrop-blur-xl dark:border-white/[0.08] dark:bg-zinc-950/95">
      <Tabs
        value={artifactsActiveTab}
        className="flex-1 flex flex-col min-h-0"
        onValueChange={setArtifactsActiveTab}
      >
        <div className="grid h-11 shrink-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 border-b border-black/[0.06] bg-white/80 px-2.5 dark:border-white/[0.08] dark:bg-zinc-950/80">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-black/[0.06] bg-zinc-100 text-zinc-600 dark:border-white/[0.08] dark:bg-zinc-900 dark:text-zinc-300">
              <BoxIcon className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[11px] font-semibold leading-4 text-zinc-800 dark:text-zinc-100">
                Artifacts
              </div>
              <div className="flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">
                <span>{workspaceStatus}</span>
              </div>
            </div>
          </div>

          <AnimatedTabsList
            tabs={artifactTabs}
            value={artifactsActiveTab}
            tabsListClassName="h-8 rounded-lg border-black/[0.06] bg-zinc-100/80 p-0.5 dark:border-white/[0.08] dark:bg-zinc-900/80"
            tabsTriggerClassName="h-7 rounded-md px-3 text-[11px]"
          />

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-md text-zinc-500 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-zinc-400 dark:hover:bg-red-950/30 dark:hover:text-red-300"
            onClick={handleClose}
            title="Close artifacts"
          >
            <X className="h-3.5 w-3.5" />
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
