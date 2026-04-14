export type MessageSegmentPatch = {
  segment: MessageSegment
  replaceSegments?: MessageSegment[]
  content?: ChatMessage['content']
  toolCalls?: IToolCall[]
  typewriterCompleted?: boolean
}

export const CHAT_RENDER_EVENTS = {
  MESSAGE_CREATED: 'message.created',
  MESSAGE_UPDATED: 'message.updated',
  MESSAGE_SEGMENT_UPDATED: 'message.segment.updated',
  PREVIEW_UPDATED: 'preview.updated',
  PREVIEW_SEGMENT_UPDATED: 'preview.segment.updated',
  PREVIEW_CLEARED: 'preview.cleared',
  TOOL_RESULT_ATTACHED: 'tool.result.attached'
} as const

export type ChatRenderEventPayloads = {
  'message.created': { message: MessageEntity }
  'message.updated': { message: MessageEntity }
  'message.segment.updated': { messageId: number; patch: MessageSegmentPatch }
  'preview.updated': { message: MessageEntity }
  'preview.segment.updated': {
    chatId?: number
    chatUuid?: string
    patch: MessageSegmentPatch
  }
  'preview.cleared': {}
  'tool.result.attached': { toolCallId: string; message: MessageEntity }
}
