import { create } from 'zustand'

type ChatState = {
  appVersion: string
  // Chat data
  selectedModel: IModel | undefined
  messages: MessageEntity[]
  imageSrcBase64List: ClipbordImg[]
  // Request state
  fetchState: boolean
  currentReqCtrl: AbortController | undefined
  readStreamState: boolean
  showLoadingIndicator: boolean
  // Feature toggles
  webSearchEnable: boolean
  webSearchProcessing: boolean
  artifacts: boolean
  artifactsPanelOpen: boolean
  artifactsActiveTab: string
}

type ChatAction = {
  setSelectedModel: (mode: IModel) => void
  setMessages: (msgs: MessageEntity[]) => void
  setImageSrcBase64List: (imgs: ClipbordImg[]) => void
  setFetchState: (state: boolean) => void
  setCurrentReqCtrl: (ctrl: AbortController | undefined) => void
  setReadStreamState: (state: boolean) => void
  setShowLoadingIndicator: (show: boolean) => void
  toggleWebSearch: (state: boolean) => void
  setWebSearchProcessState: (state: boolean) => void
  toggleArtifacts: (state: boolean) => void
  toggleArtifactsPanel: () => void
  setArtifactsPanel: (open: boolean) => void
  setArtifactsActiveTab: (tab: string) => void
}

export const useChatStore = create<ChatState & ChatAction>((set) => ({
  // @ts-ignore
  appVersion: __APP_VERSION__,

  // Chat state
  selectedModel: undefined,
  messages: [],
  imageSrcBase64List: [],

  // Request state
  fetchState: false,
  currentReqCtrl: undefined,
  readStreamState: false,
  showLoadingIndicator: false,

  // Feature toggles
  webSearchEnable: false,
  webSearchProcessing: false,
  artifacts: false,
  artifactsPanelOpen: false,
  artifactsActiveTab: 'preview',

  // Actions
  setSelectedModel: (mode: IModel) => set({ selectedModel: mode }),
  setMessages: (msgs: MessageEntity[]) => set({ messages: msgs }),
  setImageSrcBase64List: (imgs: ClipbordImg[]) => set({ imageSrcBase64List: imgs }),
  setFetchState: (state: boolean) => set({ fetchState: state }),
  setCurrentReqCtrl: (ctrl: AbortController | undefined) => set({ currentReqCtrl: ctrl }),
  setReadStreamState: (state: boolean) => set({ readStreamState: state }),
  setShowLoadingIndicator: (state: boolean) => set({ showLoadingIndicator: state }),
  toggleWebSearch: (state: boolean) => set({ webSearchEnable: state }),
  setWebSearchProcessState: (state: boolean) => set({ webSearchProcessing: state }),
  toggleArtifacts: (state: boolean) => set({ artifacts: state }),
  toggleArtifactsPanel: () => set((state) => ({ artifactsPanelOpen: !state.artifactsPanelOpen })),
  setArtifactsPanel: (open: boolean) => set({ artifactsPanelOpen: open }),
  setArtifactsActiveTab: (tab: string) => set({ artifactsActiveTab: tab })
}))
