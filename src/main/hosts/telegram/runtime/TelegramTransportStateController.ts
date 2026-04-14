import type { AgentRenderMessageState } from '@main/hosts/shared/render'
import { TelegramRenderMapper, type TelegramTransportState } from './TelegramRenderMapper'

type TelegramMessageSnapshots = {
  committedState?: AgentRenderMessageState
  previewState?: AgentRenderMessageState
  latestAssistantState?: AgentRenderMessageState
}

const emptyTransportState = (): TelegramTransportState => ({
  text: '',
  baseText: '',
  footerLines: [],
  hasCommittedBlocks: false,
  usedStickyPreview: false
})

export class TelegramTransportStateController {
  private readonly mapper: TelegramRenderMapper
  private stickyPreviewText = ''
  private stickyPreviewFooterLines: string[] = []
  private stickyPreviewForceAppend = false
  private latest = emptyTransportState()
  private lastSentBaseText = ''
  private lastSentFooterLines: string[] = []

  constructor(mapper = new TelegramRenderMapper()) {
    this.mapper = mapper
  }

  update(messages: TelegramMessageSnapshots): TelegramTransportState {
    const next = this.mapper.buildTransportState({
      committedState: messages.committedState,
      previewState: messages.previewState,
      stickyPreviewText: this.stickyPreviewText,
      stickyPreviewFooterLines: this.stickyPreviewFooterLines,
      stickyPreviewForceAppend: this.stickyPreviewForceAppend
    })

    if (!next.usedStickyPreview && this.stickyPreviewText) {
      this.clearStickyPreview()
    }

    this.latest = {
      ...next,
      footerLines: [...next.footerLines]
    }
    return this.snapshot()
  }

  captureStickyPreviewBase(messages: TelegramMessageSnapshots): void {
    const current = this.update(messages)
    if (current.hasCommittedBlocks) {
      this.clearStickyPreview()
      return
    }

    const candidate = this.lastSentBaseText.trim()
    if (!candidate) {
      return
    }

    this.stickyPreviewText = candidate
    this.stickyPreviewFooterLines = [...this.lastSentFooterLines]
    this.stickyPreviewForceAppend = this.mapper.hasOnlyStickyAppendHiddenTools(messages.latestAssistantState)
  }

  consumeStickyPreviewIfRendered(text: string): void {
    if (!this.stickyPreviewText) {
      return
    }

    if (text.startsWith(this.stickyPreviewText) || text === this.stickyPreviewText) {
      this.clearStickyPreview()
    }
  }

  markSent(): void {
    this.lastSentFooterLines = [...this.latest.footerLines]
    const candidate = this.latest.baseText.trim()
    if (!candidate) {
      return
    }
    this.lastSentBaseText = candidate
  }

  snapshot(): TelegramTransportState {
    return {
      ...this.latest,
      footerLines: [...this.latest.footerLines]
    }
  }

  private clearStickyPreview(): void {
    this.stickyPreviewText = ''
    this.stickyPreviewFooterLines = []
    this.stickyPreviewForceAppend = false
  }
}
