import type {
  ChatInitialTranscriptSeed,
  ToolResultContentRepresentation
} from '@main/agent/contracts'
import type {
  ReadyToolResultCompaction
} from '@main/orchestration/chat/toolResultCompaction/ToolResultCompactionOverlay'
import { containsInlineImageData } from '@shared/tools/toolResultContent'
import { serializeSemanticCompactionToolResult } from './ToolResultRepresentationSerializer'

export const SEMANTIC_COMPACTION_REQUEST_MAX_CHARACTERS = 32_000

interface ResolvedToolContent {
  content: ChatMessage['content']
  contentRepresentation?: ToolResultContentRepresentation
}

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

      const resolvedContent = this.resolveToolContent(
        message,
        readyCompactionByMessage.get(message),
        persistedRawToolContentByMessage.get(message)
      )

      return {
        kind: 'tool',
        timestamp,
        toolCallId: message.toolCallId,
        toolName: message.name,
        ...resolvedContent
      }
    })
  }

  private resolveToolContent(
    message: ChatMessage,
    readyCompaction: ReadyToolResultCompaction | undefined,
    persistedRawContent: ChatMessage['content'] | undefined
  ): ResolvedToolContent {
    const rawContent = persistedRawContent ?? message.content
    if (!readyCompaction?.content) {
      return { content: rawContent }
    }

    const representation = serializeSemanticCompactionToolResult(readyCompaction.content)
    if (
      representation.length > SEMANTIC_COMPACTION_REQUEST_MAX_CHARACTERS
      || containsInlineImageData(representation)
      || representation.length >= this.serializedContentLength(rawContent)
    ) {
      return { content: rawContent }
    }

    return {
      content: representation,
      contentRepresentation: 'semantic_compaction'
    }
  }

  private serializedContentLength(content: ChatMessage['content']): number {
    if (typeof content === 'string') {
      return content.length
    }

    return JSON.stringify(content)?.length ?? 0
  }

  private extractReasoning(message: ChatMessage): string | undefined {
    const reasoning = (message.segments || [])
      .filter((segment): segment is ReasoningSegment => segment.type === 'reasoning')
      .map(segment => segment.content)
      .join('')

    return reasoning || undefined
  }
}
