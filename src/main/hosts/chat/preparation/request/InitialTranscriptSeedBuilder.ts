import type { ChatInitialTranscriptSeed } from '@main/agent/contracts'
import type {
  ReadyToolResultCompaction
} from '@main/orchestration/chat/toolResultCompaction/ToolResultCompactionOverlay'

export class InitialTranscriptSeedBuilder {
  build(
    messages: ChatMessage[],
    readyCompactionByMessage: ReadonlyMap<ChatMessage, ReadyToolResultCompaction> = new Map(),
    persistedRawToolContentByMessage: ReadonlyMap<ChatMessage, ChatMessage['content']> = new Map()
  ): ChatInitialTranscriptSeed[] {
    return messages.map((message): ChatInitialTranscriptSeed => {
      const timestamp = message.createdAt

      if (message.role === 'user') {
        return {
          kind: 'user',
          timestamp,
          source: message.source,
          content: message.content
        }
      }

      if (message.role === 'assistant') {
        return {
          kind: 'assistant',
          timestamp,
          model: message.model,
          content: message.content,
          reasoning: this.extractReasoning(message),
          toolCalls: message.toolCalls ? [...message.toolCalls] : undefined
        }
      }

      return {
        kind: 'tool',
        timestamp,
        toolCallId: message.toolCallId,
        toolName: message.name,
        content: readyCompactionByMessage.get(message)?.content
          ?? persistedRawToolContentByMessage.get(message)
          ?? message.content
      }
    })
  }

  private extractReasoning(message: ChatMessage): string | undefined {
    const reasoning = (message.segments || [])
      .filter((segment): segment is ReasoningSegment => segment.type === 'reasoning')
      .map(segment => segment.content)
      .join('')

    return reasoning || undefined
  }
}
