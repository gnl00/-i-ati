import type { StateCreator } from 'zustand'

export type ChatViewState = {
  imageSrcBase64List: ClipbordImg[]
  webSearchEnable: boolean
  webSearchProcessing: boolean
  artifacts: boolean
  artifactsPanelOpen: boolean
  artifactsActiveTab: string
}

export type ChatViewActions = {
  toggleWebSearch: (state: boolean) => void
  setWebSearchProcessState: (state: boolean) => void
  toggleArtifacts: (state: boolean) => void
  toggleArtifactsPanel: () => void
  setArtifactsPanel: (open: boolean) => void
  setArtifactsActiveTab: (tab: string) => void
  setImageSrcBase64List: (imgs: ClipbordImg[]) => void
}

export const createInitialChatViewState = (): ChatViewState => ({
  imageSrcBase64List: [],
  webSearchEnable: false,
  webSearchProcessing: false,
  artifacts: false,
  artifactsPanelOpen: false,
  artifactsActiveTab: 'preview'
})

export function createChatViewActions<T extends ChatViewState>(
  set: Parameters<StateCreator<T>>[0]
): ChatViewActions {
  return {
    toggleWebSearch: (state) => set({ webSearchEnable: state } as Partial<T>),
    setWebSearchProcessState: (state) => set({ webSearchProcessing: state } as Partial<T>),
    toggleArtifacts: (state) => set({ artifacts: state } as Partial<T>),
    toggleArtifactsPanel: () => set((state) => ({ artifactsPanelOpen: !state.artifactsPanelOpen } as Partial<T>)),
    setArtifactsPanel: (open) => set({ artifactsPanelOpen: open } as Partial<T>),
    setArtifactsActiveTab: (tab) => set({ artifactsActiveTab: tab } as Partial<T>),
    setImageSrcBase64List: (imgs) => set({ imageSrcBase64List: imgs } as Partial<T>)
  }
}
