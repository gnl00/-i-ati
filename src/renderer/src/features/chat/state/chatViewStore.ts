import type { StateCreator } from 'zustand'

export type ArtifactsTab = 'stats' | 'tools' | 'preview' | 'files'

export type ToolCallInspectorSelection = {
  chatUuid: string
  segmentId: string
  toolCallId?: string
}

export type ChatViewState = {
  imageSrcBase64List: ClipbordImg[]
  webSearchEnable: boolean
  webSearchProcessing: boolean
  artifactsPanelOpen: boolean
  artifactsActiveTab: ArtifactsTab
  toolCallInspectorSelection: ToolCallInspectorSelection | null
}

export type ChatViewActions = {
  toggleWebSearch: (state: boolean) => void
  setWebSearchProcessState: (state: boolean) => void
  toggleArtifactsPanel: () => void
  setArtifactsPanel: (open: boolean) => void
  setArtifactsActiveTab: (tab: ArtifactsTab) => void
  selectToolCall: (selection: ToolCallInspectorSelection) => void
  inspectToolCall: (selection: ToolCallInspectorSelection) => void
  setImageSrcBase64List: (imgs: ClipbordImg[]) => void
}

export const createInitialChatViewState = (): ChatViewState => ({
  imageSrcBase64List: [],
  webSearchEnable: false,
  webSearchProcessing: false,
  artifactsPanelOpen: false,
  artifactsActiveTab: 'stats',
  toolCallInspectorSelection: null
})

export function createChatViewActions<T extends ChatViewState>(
  set: Parameters<StateCreator<T>>[0]
): ChatViewActions {
  return {
    toggleWebSearch: (state) => set({ webSearchEnable: state } as Partial<T>),
    setWebSearchProcessState: (state) => set({ webSearchProcessing: state } as Partial<T>),
    toggleArtifactsPanel: () => set((state) => ({ artifactsPanelOpen: !state.artifactsPanelOpen } as Partial<T>)),
    setArtifactsPanel: (open) => set({ artifactsPanelOpen: open } as Partial<T>),
    setArtifactsActiveTab: (tab) => set({ artifactsActiveTab: tab } as Partial<T>),
    selectToolCall: (selection) => set({ toolCallInspectorSelection: selection } as Partial<T>),
    inspectToolCall: (selection) => set({
      toolCallInspectorSelection: selection,
      artifactsActiveTab: 'tools',
      artifactsPanelOpen: true
    } as Partial<T>),
    setImageSrcBase64List: (imgs) => set({ imageSrcBase64List: imgs } as Partial<T>)
  }
}
