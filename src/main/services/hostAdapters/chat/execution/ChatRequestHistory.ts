import type { RequestHistory } from '@main/services/agentCore/execution'

export class ChatRequestHistory implements RequestHistory {
  private readonly messages: ChatMessage[]

  constructor(initialMessages: ChatMessage[]) {
    this.messages = [...initialMessages]
  }

  syncRequest(request: IUnifiedRequest): void {
    request.messages = [...this.messages]
  }

  appendAssistantCycle(message: ChatMessage): void {
    this.messages.push(message)
  }

  appendToolResult(message: ChatMessage): void {
    this.messages.push(message)
  }

  getMessages(): ChatMessage[] {
    return [...this.messages]
  }
}
