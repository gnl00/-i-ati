import { Button } from '@renderer/shared/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/shared/components/ui/tabs'
import { ChatStatsPanel, useChatStore, type ArtifactsTab } from '@renderer/features/chat'
import {
  X
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { ArtifactsFilesTab, FilesTabToolbar } from './ArtifactsFilesTab'
import { ArtifactsFooter } from './ArtifactsFooter'
import { ArtifactsPreviewTab } from './ArtifactsPreviewTab'
import { ArtifactsToolsTab } from './ArtifactsToolsTab'
import { openWorkspaceFolder } from './artifactUtils'
import { useWorkspaceFiles } from './useWorkspaceFiles'

const tabTriggerClassName = 'h-full min-w-12 rounded-none border-b-2 border-transparent bg-transparent px-1 py-0 text-[11px] font-medium text-zinc-500 shadow-none outline-hidden transition-[border-color,color] duration-200 hover:text-zinc-800 focus-visible:ring-2 focus-visible:ring-zinc-500/60 focus-visible:ring-inset focus-visible:ring-offset-0 data-[state=active]:border-zinc-900 data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-zinc-950 data-[state=active]:shadow-none dark:text-zinc-500 dark:hover:text-zinc-200 dark:focus-visible:ring-zinc-400/70 dark:data-[state=active]:border-zinc-100 dark:data-[state=active]:text-zinc-50'

const WorkspaceTabs: React.FC<{
  activeTab: ArtifactsTab
  searchQuery: string
  setSearchQuery: (query: string) => void
}> = ({
  activeTab,
  searchQuery,
  setSearchQuery
}) => {
  const chatUuid = useChatStore(state => state.currentChatUuid)
  const files = useWorkspaceFiles()

  const handleOpenWorkspaceFolder = async (): Promise<void> => {
    if (!chatUuid) return
    await openWorkspaceFolder(chatUuid, files.workspacePath)
  }

  const filesCount = files.workspaceTree.reduce((count, node) => {
    if (node.type === 'file') return count + 1
    if (node.children) return count + node.children.reduce((childCount, childNode) => {
      if (childNode.type === 'file') return childCount + 1
      return childCount
    }, 0)
    return count
  }, 0)

  return (
    <>
      <TabsContent
        value="preview"
        forceMount
        className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden data-[state=active]:animate-in data-[state=active]:fade-in data-[state=active]:duration-300"
      >
        <ArtifactsPreviewTab files={files} />
      </TabsContent>
      <TabsContent
        value="files"
        forceMount
        className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden data-[state=active]:animate-in data-[state=active]:fade-in data-[state=active]:duration-300"
      >
        <FilesTabToolbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onRefresh={files.handleRefresh}
          isLoading={files.isLoadingTree}
        />
        <ArtifactsFilesTab files={files} searchQuery={searchQuery} />
      </TabsContent>
      {(activeTab === 'preview' || activeTab === 'files') && (
        <ArtifactsFooter
          filesCount={filesCount}
          isLoading={files.isLoadingTree}
          onOpenWorkspaceFolder={handleOpenWorkspaceFolder}
        />
      )}
    </>
  )
}

export const ArtifactsPanel: React.FC = () => {
  const { setArtifactsPanel, artifactsActiveTab, setArtifactsActiveTab } = useChatStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [hasMountedWorkspaceTabs, setHasMountedWorkspaceTabs] = useState(
    artifactsActiveTab === 'preview' || artifactsActiveTab === 'files'
  )

  useEffect(() => {
    if (artifactsActiveTab === 'preview' || artifactsActiveTab === 'files') {
      setHasMountedWorkspaceTabs(true)
    }
  }, [artifactsActiveTab])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.isComposing || event.keyCode === 229) return

      event.preventDefault()
      event.stopPropagation()
      setArtifactsPanel(false)
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return (): void => document.removeEventListener('keydown', handleKeyDown, true)
  }, [setArtifactsPanel])

  const handleClose = (): void => {
    setArtifactsPanel(false)
  }

  return (
    <div className="h-full flex flex-col overflow-hidden rounded-lg border border-black/6 bg-zinc-50/95 shadow-xs backdrop-blur-xl dark:border-white/[0.08] dark:bg-zinc-950/95">
      <Tabs
        value={artifactsActiveTab}
        className="flex-1 flex flex-col min-h-0"
        onValueChange={(value) => setArtifactsActiveTab(value as ArtifactsTab)}
      >
        <div className="flex h-8 shrink-0 items-center gap-2 border-b border-black/[0.06] bg-white/80 px-2 dark:border-white/[0.08] dark:bg-zinc-950/80">
          <TabsList className="h-full min-w-0 flex-1 justify-start gap-4 rounded-none border-0 bg-transparent p-0 text-zinc-500 dark:text-zinc-500">
            <TabsTrigger
              value="stats"
              className={tabTriggerClassName}
            >
              Stats
            </TabsTrigger>
            <TabsTrigger value="tools" className={tabTriggerClassName}>
              Tools
            </TabsTrigger>
            <span className="h-3 w-px bg-zinc-200 dark:bg-zinc-800" aria-hidden="true" />
            <TabsTrigger
              value="preview"
              className={tabTriggerClassName}
            >
              Preview
            </TabsTrigger>
            <TabsTrigger
              value="files"
              className={tabTriggerClassName}
            >
              Files
            </TabsTrigger>
          </TabsList>

          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-md text-zinc-500 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-zinc-400 dark:hover:bg-red-950/30 dark:hover:text-red-300"
            onClick={handleClose}
            aria-label="Close artifacts"
            title="Close artifacts (Esc)"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>

        <TabsContent
          value="tools"
          className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
        >
          <ArtifactsToolsTab />
        </TabsContent>

        <TabsContent
          value="stats"
          className="flex-1 min-h-0 m-0 flex flex-col overflow-hidden data-[state=inactive]:hidden data-[state=active]:animate-in data-[state=active]:fade-in data-[state=active]:duration-300"
        >
          <ChatStatsPanel variant="inline" />
        </TabsContent>

        {hasMountedWorkspaceTabs && (
          <div className={artifactsActiveTab === 'preview' || artifactsActiveTab === 'files'
            ? 'flex min-h-0 flex-1 flex-col'
            : 'hidden'}
          >
            <WorkspaceTabs
              activeTab={artifactsActiveTab}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
            />
          </div>
        )}
      </Tabs>
    </div>
  )
}
