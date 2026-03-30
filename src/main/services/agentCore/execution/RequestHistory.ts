export interface RequestHistory {
  syncRequest(request: IUnifiedRequest): void
  appendAssistantCycle(message: ChatMessage): void
  appendToolResult(message: ChatMessage): void
  getMessages(): ChatMessage[]
}
