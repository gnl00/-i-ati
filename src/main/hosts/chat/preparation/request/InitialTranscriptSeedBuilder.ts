import type { ChatInitialTranscriptSeed } from '@main/agent/contracts'

export class InitialTranscriptSeedBuilder {
  build(messages: ChatMessage[]): ChatInitialTranscriptSeed[] {
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
        content: message.content
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
