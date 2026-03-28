export interface AgentMessageEventSink {
  emitMessageUpdated(message: MessageEntity): void
  emitToolResultAttached(toolCallId: string, message: MessageEntity): void
}
