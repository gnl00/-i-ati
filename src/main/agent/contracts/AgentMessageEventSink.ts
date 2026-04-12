export interface AgentMessageEventSink {
  emitMessageUpdated(message: MessageEntity): void
  emitStreamPreviewUpdated(message: MessageEntity): void
  emitStreamPreviewCleared(): void
  emitToolResultAttached(toolCallId: string, message: MessageEntity): void
}
