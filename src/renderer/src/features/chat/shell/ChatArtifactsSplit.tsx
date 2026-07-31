import { ArtifactsPanel } from '@renderer/features/artifacts'
import { useChatStore } from '@renderer/features/chat/state/chatStore'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup
} from '@renderer/shared/components/ui/resizable'
import React from 'react'

const ARTIFACTS_PANEL_TOP_INSET_PX = 48
const ARTIFACTS_PANEL_TOP_INSET_STYLE: React.CSSProperties = {
  paddingTop: ARTIFACTS_PANEL_TOP_INSET_PX
}
const ARTIFACTS_HANDLE_INSET_STYLE: React.CSSProperties = {
  marginTop: ARTIFACTS_PANEL_TOP_INSET_PX,
  marginBottom: 8
}

interface ChatArtifactsSplitProps {
  children: React.ReactNode
  groupId: string
  primaryPanelId: string
  artifactsPanelId: string
}

const ChatArtifactsSplit: React.FC<ChatArtifactsSplitProps> = ({
  children,
  groupId,
  primaryPanelId,
  artifactsPanelId
}) => {
  const artifactsPanelOpen = useChatStore(state => state.artifactsPanelOpen)
  const setArtifactsPanel = useChatStore(state => state.setArtifactsPanel)

  return (
    <ResizablePanelGroup
      direction="horizontal"
      className="flex-1 overflow-hidden"
      id={groupId}
    >
      <ResizablePanel
        defaultSize={artifactsPanelOpen ? 60 : 100}
        minSize={30}
        className="relative flex flex-col overflow-hidden"
        id={primaryPanelId}
      >
        {children}
      </ResizablePanel>

      {artifactsPanelOpen && (
        <>
          <ResizableHandle
            className="bg-transparent transition-colors duration-200 hover:bg-primary/10 active:bg-primary/20 [&>div]:hidden [&::before]:hidden"
            style={ARTIFACTS_HANDLE_INSET_STYLE}
          />
          <ResizablePanel
            defaultSize={40}
            minSize={25}
            maxSize={70}
            collapsible
            collapsedSize={0}
            onResize={(size) => {
              if (size === 0 && artifactsPanelOpen) {
                setArtifactsPanel(false)
              }
            }}
            className="overflow-hidden bg-transparent"
            id={artifactsPanelId}
          >
            <div
              className="h-full w-full overflow-hidden"
              style={ARTIFACTS_PANEL_TOP_INSET_STYLE}
            >
              <ArtifactsPanel />
            </div>
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  )
}

export default ChatArtifactsSplit
