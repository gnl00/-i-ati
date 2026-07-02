import {
  sanitizeCompressionContent,
  sanitizeRawImageData,
  sanitizeRawImageDataUrls
} from '@shared/services/RawImageDataSanitizer'

type ToolCallEntry = {
  call: IToolCall
  result?: MessageEntity
}

export class CompressionTranscriptBuilder {
  build(messages: MessageEntity[]): string {
    const blocks: string[] = []

    for (let index = 0; index < messages.length; index += 1) {
      const message = messages[index]

      if (message.body.role === 'user') {
        blocks.push(this.buildUserBlock(message))
        continue
      }

      if (message.body.role === 'assistant') {
        const { block, consumedCount } = this.buildAssistantBlock(message, messages, index)
        blocks.push(block)
        index += consumedCount
        continue
      }

      if (message.body.role === 'tool') {
        blocks.push(this.buildOrphanToolResultBlock(message))
        continue
      }

      blocks.push(this.buildGenericBlock(message))
    }

    return blocks.join('\n')
  }

  private buildUserBlock(message: MessageEntity): string {
    return [
      `<user id="${this.messageId(message)}">`,
      this.formatContent(message.body.content),
      '</user>'
    ].join('\n')
  }

  private buildAssistantBlock(
    message: MessageEntity,
    messages: MessageEntity[],
    index: number
  ): { block: string; consumedCount: number } {
    const toolEntries = this.collectToolEntries(message, messages, index)
    const parts = [
      `<assistant id="${this.messageId(message)}">`,
      this.formatContent(message.body.content)
    ]

    toolEntries.forEach(entry => {
      parts.push(this.buildToolBlock(entry))
    })

    parts.push('</assistant>')

    return {
      block: parts.join('\n'),
      consumedCount: toolEntries.filter(entry => entry.result).length
    }
  }

  private collectToolEntries(
    message: MessageEntity,
    messages: MessageEntity[],
    index: number
  ): ToolCallEntry[] {
    const toolCalls = message.body.toolCalls ?? []
    if (toolCalls.length === 0) {
      return []
    }

    const resultsByCallId = new Map<string, MessageEntity>()
    for (let nextIndex = index + 1; nextIndex < messages.length; nextIndex += 1) {
      const next = messages[nextIndex]
      if (next.body.role !== 'tool') {
        break
      }
      if (next.body.toolCallId) {
        resultsByCallId.set(next.body.toolCallId, next)
      }
    }

    return toolCalls.map(call => ({
      call,
      result: resultsByCallId.get(call.id)
    }))
  }

  private buildToolBlock(entry: ToolCallEntry): string {
    const parts = [
      `<tool name="${entry.call.function.name}" call_id="${entry.call.id}">`,
      '<param>',
      this.formatStructuredText(entry.call.function.arguments),
      '</param>'
    ]

    if (entry.result) {
      parts.push(
        `<result message_id="${this.messageId(entry.result)}">`,
        this.formatContent(entry.result.body.content),
        '</result>'
      )
    }

    parts.push('</tool>')
    return parts.join('\n')
  }

  private buildOrphanToolResultBlock(message: MessageEntity): string {
    return [
      `<tool_result id="${this.messageId(message)}" tool_call_id="${message.body.toolCallId ?? ''}" orphan="true">`,
      this.formatContent(message.body.content),
      '</tool_result>'
    ].join('\n')
  }

  private buildGenericBlock(message: MessageEntity): string {
    return [
      `<message id="${this.messageId(message)}" role="${message.body.role}">`,
      this.formatContent(message.body.content),
      '</message>'
    ].join('\n')
  }

  private messageId(message: MessageEntity): string {
    return String(message.id ?? 'unknown')
  }

  private formatContent(content: ChatMessage['content']): string {
    if (typeof content === 'string') {
      return this.formatStructuredText(content)
    }

    return JSON.stringify(sanitizeCompressionContent(content), null, 2)
  }

  private formatStructuredText(text: string): string {
    const sanitizedText = sanitizeRawImageDataUrls(text)
    try {
      return JSON.stringify(sanitizeRawImageData(JSON.parse(sanitizedText)), null, 2)
    } catch {
      return sanitizedText
    }
  }
}
