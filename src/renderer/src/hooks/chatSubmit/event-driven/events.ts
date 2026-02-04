export type ChatSubmitEventType =
  | 'submission.started'
  | 'submission.aborted'
  | 'submission.failed'
  | 'submission.completed'
  | 'session.ready'
  | 'messages.loaded'
  | 'message.created'
  | 'message.updated'
  | 'message.segment.appended'
  | 'request.built'
  | 'request.sent'
  | 'stream.started'
  | 'stream.chunk'
  | 'stream.completed'
  | 'tool.call.detected'
  | 'tool.call.flushed'
  | 'tool.call.attached'
  | 'tool.exec.started'
  | 'tool.exec.requires_confirmation'
  | 'tool.exec.completed'
  | 'tool.exec.failed'
  | 'tool.result.attached'
  | 'tool.result.persisted'
  | 'chat.updated'
  | 'title.generate.started'
  | 'title.generate.completed'
  | 'title.generate.failed'
  | 'compression.started'
  | 'compression.completed'
  | 'compression.failed'

type SerializedError = {
  name: string
  message: string
  stack?: string
}

export type ChatSubmitEventPayloads = {
  'submission.started': { modelRef: ModelRef }
  'submission.aborted': { reason?: string }
  'submission.failed': { error: Error }
  'submission.completed': { assistantMessageId: number }
  'session.ready': {
    chatEntity: ChatEntity
    workspacePath: string
    controller: AbortController
  }
  'messages.loaded': { messages: MessageEntity[] }
  'message.created': { message: MessageEntity }
  'message.updated': { message: MessageEntity }
  'message.segment.appended': { messageId?: number; segment: MessageSegment }
  'request.built': { messageCount: number }
  'request.sent': { messageCount: number }
  'stream.started': { stream: boolean }
  'stream.chunk': { contentDelta?: string; reasoningDelta?: string }
  'stream.completed': { ok: boolean; usage?: ITokenUsage }
  'tool.call.detected': { toolCall: import('../types').ToolCall }
  'tool.call.flushed': { toolCalls: IToolCall[] }
  'tool.call.attached': { toolCallIds: string[]; messageId?: number }
  'tool.exec.started': { toolCallId: string; name: string }
  'tool.exec.requires_confirmation': {
    toolCallId: string
    name: string
    args?: unknown
    ui?: {
      title?: string
      riskLevel?: 'risky' | 'dangerous'
      reason?: string
      command?: string
    }
  }
  'tool.exec.completed': { toolCallId: string; result: any; cost: number }
  'tool.exec.failed': { toolCallId: string; error: Error }
  'tool.result.attached': { toolCallId: string; message: MessageEntity }
  'tool.result.persisted': { toolCallId: string; message: MessageEntity }
  'chat.updated': { chatEntity: ChatEntity }
  'title.generate.started': { model: AccountModel; contentLength: number }
  'title.generate.completed': { title: string }
  'title.generate.failed': { error: SerializedError }
  'compression.started': { messageCount: number }
  'compression.completed': { result: CompressionResult }
  'compression.failed': { error: SerializedError; result?: CompressionResult }
}

export type ChatSubmitEventMeta = {
  submissionId: string
  chatId?: number
  chatUuid?: string
  cycle?: number
}

export type ChatSubmitEventEnvelope<T extends ChatSubmitEventType = ChatSubmitEventType> =
  ChatSubmitEventMeta & {
    type: T
    payload: ChatSubmitEventPayloads[T]
    timestamp: number
    sequence: number
  }

export type ChatSubmitEvent =
  { [K in ChatSubmitEventType]: ChatSubmitEventEnvelope<K> }[ChatSubmitEventType]
