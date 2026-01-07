export interface ToolCallProps {
  id?: string
  index?: number
  function: string
  args: string
}

export interface ChatInputState {
  textCtx: string
  mediaCtx: ClipbordImg[] | string[]
  tools?: any[]
}

export interface ChatSessionState {
  userMessageEntity: MessageEntity
  messageEntities: MessageEntity[]
  chatMessages: ChatMessage[]
  chatEntity: ChatEntity
  currChatId: number | undefined
  workspacePath: string
}

export interface ChatControlState {
  controller: AbortController
  signal: AbortSignal
}

export interface ChatMetaState {
  model: IModel
  provider: IProvider
}

export interface PreparedChat {
  input: ChatInputState
  session: ChatSessionState
  control: ChatControlState
  meta: ChatMetaState
}

export interface RequestReadyChat extends PreparedChat {
  request: IChatRequestV2 | IUnifiedRequest
}

export interface ToolRuntimeState {
  hasToolCall: boolean
  toolCalls: ToolCallProps[]
  toolCallResults?: any[]
}

export interface StreamingState {
  gatherContent: string
  gatherReasoning: string
  isContentHasThinkTag: boolean
  previousTextLength: number
  previousReasoningLength: number
  tools: ToolRuntimeState
}

export interface StreamingContext extends RequestReadyChat {
  streaming: StreamingState
}

export interface PrepareMessageParams {
  input: {
    textCtx: string
    mediaCtx: ClipbordImg[] | string[]
    tools?: any[]
  }
  model: IModel
  chat: {
    chatId?: number
    chatUuid?: string
    setChatId: (chatId: number) => void
    setChatUuid: (uuid: string) => void
    updateChatList: (chat: ChatEntity) => void
  }
  store: {
    messages: MessageEntity[]
    artifacts: boolean
    setMessages: (messages: MessageEntity[]) => void
    setCurrentReqCtrl: (ctrl: AbortController) => void
    setReadStreamState: (state: boolean) => void
    setShowLoadingIndicator: (state: boolean) => void
  }
  providers: IProvider[]
}

export interface BuildRequestParams {
  prepared: PreparedChat
  options: { tools?: any[], prompt?: string }
}

export interface StreamingDeps {
  setMessages: (messages: MessageEntity[]) => void
  setShowLoadingIndicator: (state: boolean) => void
  artifacts: boolean
}

export interface FinalizeDeps {
  chatTitle?: string
  setChatTitle: (title: string) => void
  setLastMsgStatus: (state: boolean) => void
  setReadStreamState: (state: boolean) => void
  updateChatList: (chat: ChatEntity) => void
  titleGenerateEnabled: boolean
  titleGenerateModel?: IModel
  selectedModel?: IModel
  providers: IProvider[]
}

export interface TitleRequestParams {
  content: string
  titleGenerateModel?: IModel
  selectedModel?: IModel
  providers: IProvider[]
  setChatTitle: (title: string) => void
}

export type PrepareMessageFn = (
  params: PrepareMessageParams
) => Promise<PreparedChat>

export interface StreamingContextProvider {
  requireStreamingContext(): StreamingContext
}

export interface PipelineState {
  prepared?: PreparedChat
  requestReady?: RequestReadyChat
  streaming?: StreamingContext
}

export interface PipelineBuilder extends StreamingContextProvider {
  state: PipelineState
  withPrepared(prepared: PreparedChat): PipelineBuilder
  withRequestReady(requestReady: RequestReadyChat): PipelineBuilder
  withStreaming(streaming: StreamingContext): PipelineBuilder
  getLatestContext(): PreparedChat | RequestReadyChat | StreamingContext | undefined
  getAbortController(): AbortController | undefined
}
