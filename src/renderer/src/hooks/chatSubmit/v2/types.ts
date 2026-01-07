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
  systemPrompts: string[]
}

export interface PreparedRequest extends PreparedChat {
  request: IChatRequestV2 | IUnifiedRequest
}

export interface ToolRuntimeState {
  hasToolCall: boolean
  toolCalls: ToolCallProps[]
  toolCallResults?: any[]
}

export interface StreamingState {
  isContentHasThinkTag: boolean
  tools: ToolRuntimeState
}

export interface StreamingContext extends PreparedRequest {
  streaming: StreamingState
}

export interface PrepareMessageParams {
  input: {
    textCtx: string
    mediaCtx: ClipbordImg[] | string[]
    prompt?: string
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
    setMessages: (messages: MessageEntity[]) => void
    setCurrentReqCtrl: (ctrl: AbortController) => void
    setReadStreamState: (state: boolean) => void
    setShowLoadingIndicator: (state: boolean) => void
  }
  providers: IProvider[]
}

export interface BuildRequestParams {
  prepared: PreparedChat
}

export interface StreamingDeps {
  setMessages: (messages: MessageEntity[]) => void
  setShowLoadingIndicator: (state: boolean) => void
  beforeFetch: () => void
  afterFetch: () => void
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

export type StageKey = 'prepared' | 'requestReady' | 'streaming'

export interface StageOutputMap {
  prepared: PreparedChat
  requestReady: PreparedRequest
  streaming: StreamingContext
}

export type StageReducer<K extends StageKey> = (value: StageOutputMap[K]) => StageOutputMap[K]

export interface PipelineBuilderState extends Partial<StageOutputMap> { }

export interface PipelineBuilderV2 extends StreamingContextProvider {
  readonly state: PipelineBuilderState
  withStage<K extends StageKey>(stage: K, value: StageOutputMap[K]): PipelineBuilderV2
  getStage<K extends StageKey>(stage: K): StageOutputMap[K] | undefined
  requireStage<K extends StageKey>(stage: K): StageOutputMap[K]
  updateStage<K extends StageKey>(stage: K, reducer: StageReducer<K>): PipelineBuilderV2
  requireStreamingContext(): StreamingContext
  getLatestContext(): PreparedChat | PreparedRequest | StreamingContext | undefined
  getAbortController(): AbortController | undefined
  snapshot(): PipelineBuilderState
}

export interface StreamingFactoryCallbacks {
  onStateChange: (state: 'streaming' | 'toolCall') => void
}

export type SendRequestStage = (
  context: PreparedRequest,
  callbacks: StreamingFactoryCallbacks
) => Promise<StreamingContext>

export interface ChatPipelineMachineV2Deps {
  prepare: PrepareMessageFn
  buildRequest: (params: BuildRequestParams) => PreparedRequest
  sendRequest: SendRequestStage
  finalize: (builder: PipelineBuilderV2, deps: FinalizeDeps) => Promise<void>
}

export interface ChatPipelineMachineV2StartPayload {
  prepareParams: PrepareMessageParams
  finalizeDeps: FinalizeDeps
}

export type ChatPipelineMachineStatus =
  | 'idle'
  | 'preparing'
  | 'requesting'
  | 'streaming'
  | 'toolCall'
  | 'finalizing'
  | 'completed'
  | 'cancelled'
  | 'error'

export interface ChatPipelineMachineSnapshot {
  status: ChatPipelineMachineStatus
  context?: PreparedChat | PreparedRequest | StreamingContext
  error?: Error
}
