import type {
  AgentRenderMessageState,
  AgentRenderTextBlock,
  AgentRenderToolCallState
} from '@main/hosts/shared/render'
import { extractContentFromSegments } from '@main/services/messages/MessageSegmentContent'

const TELEGRAM_TOOL_FOOTER_HIDDEN_TOOLS = new Set(['emotion_report'])

export type TelegramRenderBlock = {
  kind: 'text' | 'tool'
  key: string
  text: string
}

export type TelegramTransportState = {
  text: string
  baseText: string
  footerLines: string[]
  hasCommittedBlocks: boolean
  usedStickyPreview: boolean
}

export class TelegramRenderMapper {
  extractText(state?: AgentRenderMessageState): string {
    const fromBlocks = this.extractTextBlocks(state).join('')
    const fromContent = typeof state?.content === 'string' ? state.content : ''
    const fromSegments = fromContent
      ? ''
      : extractContentFromSegments((state?.blocks || [])
        .filter((block): block is AgentRenderTextBlock => block.kind === 'text')
        .map((block) => ({
          type: 'text',
          segmentId: block.blockId,
          content: block.content,
          timestamp: block.startedAt
        } satisfies TextSegment)))

    return (fromBlocks || fromContent || fromSegments || '').trim()
  }

  extractToolFooterLines(state?: AgentRenderMessageState): string[] {
    const orderedCalls = this.extractOrderedToolCalls(state)
    if (orderedCalls.length === 0) {
      return []
    }

    return orderedCalls
      .filter((toolCall) => !this.shouldHideToolFooter(toolCall))
      .map((toolCall) => this.formatToolFooterLine(toolCall))
      .filter(Boolean)
  }

  extractCommittedBlocks(state?: AgentRenderMessageState): TelegramRenderBlock[] {
    if (state?.blocks.length) {
      const blocks: TelegramRenderBlock[] = []
      const toolCallMap = new Map(
        (state.toolCalls || []).map((toolCall) => [toolCall.toolCallId, toolCall] as const)
      )
      let textBlockIndex = 0

      state.blocks.forEach((block, index) => {
        if (block.kind === 'text') {
          const text = block.content.trim()
          if (!text) {
            return
          }

          blocks.push({
            kind: 'text',
            key: block.blockId || `text:${textBlockIndex++}:${index}`,
            text
          })
          return
        }

        if (block.kind === 'tool') {
          const toolCall = toolCallMap.get(block.toolCallId)
          if (!toolCall || this.shouldHideToolFooter(toolCall)) {
            return
          }

          const text = this.formatToolFooterLine(toolCall)
          if (!text) {
            return
          }

          blocks.push({
            kind: 'tool',
            key: `tool:${toolCall.toolCallId || toolCall.name || index}`,
            text
          })
        }
      })

      if (blocks.length > 0) {
        return blocks
      }
    }

    const fallbackText = this.extractText(state)
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

  buildTransportState(args: {
    committedState?: AgentRenderMessageState
    previewState?: AgentRenderMessageState
    stickyPreviewText: string
    stickyPreviewFooterLines: string[]
    stickyPreviewForceAppend: boolean
  }): TelegramTransportState {
    const committedBlocks = this.extractCommittedBlocks(args.committedState)
    const normalizedPreviewText = this.extractText(args.previewState).trim()
    const { text: previewText, usedStickyPreview } = this.composePreviewText({
      previewText: normalizedPreviewText,
      stickyPreviewText: args.stickyPreviewText,
      stickyPreviewForceAppend: args.stickyPreviewForceAppend,
      hasCommittedBlocks: committedBlocks.length > 0
    })
    const previewFooterLines = this.extractToolFooterLines(args.previewState)
    const footerLines = previewFooterLines.length > 0
      ? previewFooterLines
      : committedBlocks.length === 0 && previewText
        ? args.stickyPreviewFooterLines
        : []
    const baseText = this.renderTransportText({
      committedBlocks,
      activePreviewText: previewText
    })
    const text = footerLines.length === 0
      ? baseText
      : baseText
        ? `${baseText}\n\n${footerLines.map(line => `> ${line}`).join('\n')}`
        : footerLines.map(line => `> ${line}`).join('\n')

    return {
      text,
      baseText,
      footerLines,
      hasCommittedBlocks: committedBlocks.length > 0,
      usedStickyPreview
    }
  }

  hasOnlyStickyAppendHiddenTools(state?: AgentRenderMessageState): boolean {
    const toolCalls = state?.toolCalls || []
    if (toolCalls.length === 0) {
      return false
    }

    return toolCalls.every((toolCall) => this.shouldHideToolFooter(toolCall))
  }

  private composePreviewText(args: {
    previewText: string
    stickyPreviewText: string
    stickyPreviewForceAppend: boolean
    hasCommittedBlocks: boolean
  }): { text: string, usedStickyPreview: boolean } {
    const normalized = args.previewText.trim()
    if (!normalized) {
      return { text: '', usedStickyPreview: false }
    }

    if (args.hasCommittedBlocks) {
      return { text: normalized, usedStickyPreview: false }
    }

    if (!this.shouldUseStickyPreview({
      nextText: normalized,
      stickyPreviewText: args.stickyPreviewText,
      stickyPreviewForceAppend: args.stickyPreviewForceAppend
    })) {
      return { text: normalized, usedStickyPreview: false }
    }

    return {
      text: `${args.stickyPreviewText}${normalized}`,
      usedStickyPreview: true
    }
  }

  private shouldUseStickyPreview(args: {
    nextText: string
    stickyPreviewText: string
    stickyPreviewForceAppend: boolean
  }): boolean {
    if (!args.stickyPreviewText) {
      return false
    }

    if (args.nextText.startsWith(args.stickyPreviewText)) {
      return false
    }

    if (args.stickyPreviewForceAppend) {
      return true
    }

    return this.isAppendableTailText(args.nextText)
  }

  private isAppendableTailText(text: string): boolean {
    return text.length <= 8 && !/[\p{L}\p{N}]/u.test(text)
  }

  private extractTextBlocks(state?: AgentRenderMessageState): string[] {
    if (!state?.blocks.length) {
      return []
    }

    return state.blocks
      .filter((block): block is AgentRenderTextBlock => block.kind === 'text')
      .map((block) => block.content)
      .filter(Boolean)
  }

  private extractOrderedToolCalls(state?: AgentRenderMessageState): AgentRenderToolCallState[] {
    if (!state) {
      return []
    }

    const toolCallMap = new Map(
      (state.toolCalls || []).map((toolCall) => [toolCall.toolCallId, toolCall] as const)
    )
    const ordered: AgentRenderToolCallState[] = []
    const seen = new Set<string>()

    for (const block of state.blocks || []) {
      if (block.kind !== 'tool') {
        continue
      }

      const toolCall = toolCallMap.get(block.toolCallId)
      if (!toolCall || seen.has(toolCall.toolCallId)) {
        continue
      }

      ordered.push(toolCall)
      seen.add(toolCall.toolCallId)
    }

    for (const toolCall of state.toolCalls || []) {
      if (seen.has(toolCall.toolCallId)) {
        continue
      }
      ordered.push(toolCall)
    }

    return ordered
  }

  private shouldHideToolFooter(toolCall: AgentRenderToolCallState): boolean {
    const toolName = toolCall.name
    return TELEGRAM_TOOL_FOOTER_HIDDEN_TOOLS.has(toolName)
  }

  private formatToolFooterLine(toolCall: AgentRenderToolCallState): string {
    const toolName = toolCall.name || 'tool'
    const label = toolName.replace(/_/g, ' ')
    const status = toolCall.status
    const isError = Boolean(toolCall.error)

    if (isError || status === 'failed' || status === 'aborted') {
      return `tool ${label} failed`
    }
    if (status === 'running' || status === 'pending') {
      return `tool ${label} running`
    }
    return `tool ${label} done`
  }
}
