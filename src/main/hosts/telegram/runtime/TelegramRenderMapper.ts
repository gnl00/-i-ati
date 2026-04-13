import { extractContentFromSegments } from '@main/services/messages/MessageSegmentContent'

const TELEGRAM_TOOL_FOOTER_HIDDEN_TOOLS = new Set(['emotion_report'])

export type TelegramRenderBlock = {
  kind: 'text' | 'tool'
  key: string
  text: string
}

export class TelegramRenderMapper {
  extractText(message?: MessageEntity): string {
    const fromSegments = message?.body.segments?.length
      ? extractContentFromSegments(message.body.segments)
      : ''
    const fromContent = typeof message?.body.content === 'string'
      ? message.body.content
      : ''

    return (fromSegments || fromContent || '').trim()
  }

  extractToolFooterLines(message?: MessageEntity): string[] {
    const segments = message?.body.segments
    if (!segments?.length) {
      return []
    }

    return segments
      .filter((segment): segment is ToolCallSegment => (
        segment.type === 'toolCall' &&
        !this.shouldHideToolFooter(segment)
      ))
      .map((segment) => this.formatToolFooterLine(segment))
      .filter(Boolean)
  }

  extractCommittedBlocks(message?: MessageEntity): TelegramRenderBlock[] {
    const segments = message?.body.segments
    if (segments?.length) {
      const blocks: TelegramRenderBlock[] = []
      let textBlockIndex = 0

      segments.forEach((segment, index) => {
        if (segment.type === 'text') {
          const text = segment.content.trim()
          if (!text) {
            return
          }

          blocks.push({
            kind: 'text',
            key: segment.segmentId || `text:${textBlockIndex++}:${index}`,
            text
          })
          return
        }

        if (segment.type === 'toolCall' && !this.shouldHideToolFooter(segment)) {
          const text = this.formatToolFooterLine(segment)
          if (!text) {
            return
          }

          blocks.push({
            kind: 'tool',
            key: `tool:${segment.toolCallId || segment.name || index}`,
            text
          })
        }
      })

      if (blocks.length > 0) {
        return blocks
      }
    }

    const fallbackText = this.extractText(message)
    if (!fallbackText) {
      return []
    }

    return [{
      kind: 'text',
      key: 'text:fallback',
      text: fallbackText
    }]
  }

  renderTransportText(args: {
    committedBlocks: TelegramRenderBlock[]
    activePreviewText: string
  }): string {
    const blocks = [...args.committedBlocks]
    if (args.activePreviewText.trim()) {
      blocks.push({
        kind: 'text',
        key: 'preview',
        text: args.activePreviewText.trim()
      })
    }

    let output = ''
    let previousKind: TelegramRenderBlock['kind'] | undefined

    for (const block of blocks) {
      if (block.kind === 'tool') {
        output = output
          ? `${output}\n\n> ${block.text}`
          : `> ${block.text}`
        previousKind = 'tool'
        continue
      }

      output = output
        ? previousKind === 'tool'
          ? `${output}\n${block.text}`
          : `${output}${block.text}`
        : block.text
      previousKind = 'text'
    }

    return output.trim()
  }

  private shouldHideToolFooter(segment: ToolCallSegment): boolean {
    const toolName = typeof segment.content?.toolName === 'string' ? segment.content.toolName : segment.name
    return TELEGRAM_TOOL_FOOTER_HIDDEN_TOOLS.has(toolName)
  }

  private formatToolFooterLine(segment: ToolCallSegment): string {
    const toolName = typeof segment.content?.toolName === 'string'
      ? segment.content.toolName
      : segment.name || 'tool'
    const label = toolName.replace(/_/g, ' ')
    const status = typeof segment.content?.status === 'string' ? segment.content.status : undefined
    const isError = Boolean(segment.isError)

    if (isError || status === 'failed' || status === 'aborted') {
      return `tool ${label} failed`
    }
    if (status === 'running' || status === 'executing' || status === 'pending') {
      return `tool ${label} running`
    }
    return `tool ${label} done`
  }
}
