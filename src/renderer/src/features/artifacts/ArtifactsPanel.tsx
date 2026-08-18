import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/shared/components/ui/tabs'
import { ChatStatsPanel, useChatStore, type ArtifactsTab } from '@renderer/features/chat'
import { useEffect, useState } from 'react'
import { ArtifactsFilesTab, FilesTabToolbar } from './ArtifactsFilesTab'
import { ArtifactsFooter } from './ArtifactsFooter'
import { ArtifactsPreviewTab } from './ArtifactsPreviewTab'
import { ArtifactsToolsTab } from './ArtifactsToolsTab'
import { openWorkspaceFolder } from './artifactUtils'
import { useWorkspaceFiles } from './useWorkspaceFiles'

const tabTriggerClassName = 'h-6 min-w-14 rounded-md border border-transparent bg-transparent px-2 py-0 text-[11px] font-medium text-zinc-500 shadow-none outline-hidden transition-[background-color,border-color,color] duration-200 hover:bg-zinc-100/70 hover:text-zinc-800 focus-visible:ring-2 focus-visible:ring-zinc-500/60 focus-visible:ring-inset focus-visible:ring-offset-0 data-[state=active]:border-zinc-200 data-[state=active]:bg-zinc-100/70 data-[state=active]:font-semibold data-[state=active]:text-zinc-950 data-[state=active]:shadow-none dark:text-(--app-text-muted) dark:duration-150 dark:hover:bg-(--app-surface-hover) dark:hover:text-(--app-text-body) dark:focus-visible:ring-(--app-accent) dark:data-[state=active]:border-(--app-border-standard) dark:data-[state=active]:bg-(--app-surface-hover) dark:data-[state=active]:text-(--app-text-primary)'

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
        className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
      >
        <ArtifactsPreviewTab files={files} />
      </TabsContent>
      <TabsContent
        value="files"
        forceMount
        className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
      >
        {files.workspaceTree.length > 0 && (
          <FilesTabToolbar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onRefresh={files.handleRefresh}
            isLoading={files.isLoadingTree}
          />
        )}
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
  const { artifactsActiveTab, setArtifactsActiveTab } = useChatStore()
  const [searchQuery, setSearchQuery] = useState('')
  const isWorkspaceTabActive = artifactsActiveTab === 'preview' || artifactsActiveTab === 'files'
  const [hasMountedWorkspaceTabs, setHasMountedWorkspaceTabs] = useState(
    isWorkspaceTabActive
  )
  const shouldMountWorkspaceTabs = hasMountedWorkspaceTabs || isWorkspaceTabActive

  useEffect(() => {
    if (isWorkspaceTabActive) {
      setHasMountedWorkspaceTabs(true)
    }
  }, [isWorkspaceTabActive])

  return (
    <div className="h-full flex flex-col overflow-hidden rounded-lg border border-black/6 bg-zinc-50/95 shadow-xs backdrop-blur-xl dark:rounded-[10px] dark:border-(--app-border-subtle) dark:bg-(--app-surface) dark:shadow-none dark:backdrop-blur-none">
      <Tabs
        value={artifactsActiveTab}
        className="flex-1 flex flex-col min-h-0"
        onValueChange={(value) => setArtifactsActiveTab(value as ArtifactsTab)}
      >
        <div className="flex h-8 shrink-0 items-center gap-2 border-b border-black/[0.06] bg-white/80 px-2 dark:border-(--app-border-subtle) dark:bg-(--app-surface-raised)">
          <TabsList className="h-fit min-w-0 flex-1 self-center justify-start gap-1 rounded-none border-0 bg-transparent p-0 text-zinc-500 dark:text-(--app-text-muted)">
            <TabsTrigger
              value="stats"
              className={tabTriggerClassName}
            >
              Overview
            </TabsTrigger>
            <TabsTrigger value="tools" className={tabTriggerClassName}>
              Tools
            </TabsTrigger>
            <span className="mx-1 h-3 w-px bg-zinc-200 dark:bg-(--app-border-standard)" aria-hidden="true" />
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
        </div>

        <TabsContent
          value="tools"
          className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden dark:bg-(--app-surface) data-[state=inactive]:hidden"
        >
          <ArtifactsToolsTab />
        </TabsContent>

        <TabsContent
          value="stats"
          className="flex-1 min-h-0 m-0 flex flex-col overflow-hidden dark:bg-(--app-surface) data-[state=inactive]:hidden"
        >
          <ChatStatsPanel variant="inline" />
        </TabsContent>

        {shouldMountWorkspaceTabs && (
          <div className={artifactsActiveTab === 'preview' || artifactsActiveTab === 'files'
            ? 'flex min-h-0 flex-1 flex-col dark:bg-(--app-surface)'
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
