import {
  buildAssistantMessageFacts
} from './assistantMessageFacts'

type SegmentRenderLayer = 'committed' | 'preview'

type SegmentRenderItem = {
  key: string
  layer: SegmentRenderLayer
  sourceIndex: number
  order: number
  segment: MessageSegment
}

type SupportSegmentRenderItem = SegmentRenderItem & {
  isStreamingTail: boolean
}

type TextSegmentRenderItem = SegmentRenderItem & {
  segment: TextSegment
}

type OrderedSegmentRenderItem =
  | { kind: 'text'; item: TextSegmentRenderItem }
  | { kind: 'support'; item: SupportSegmentRenderItem }

type AssistantMessagePlaybackInput = Pick<ChatMessage, 'role' | 'source' | 'typewriterCompleted'> & {
  segments: TextSegment[]
}

export interface AssistantMessageSource {
  committedMessage: ChatMessage
  previewMessage?: ChatMessage
}

export interface AssistantMessageMapperContext {
  isLatest: boolean
  isStreaming: boolean
  providerDefinitions: ProviderDefinition[]
  accounts: ProviderAccount[]
}

export interface AssistantMessageRenderState {
  header: {
    badgeModel?: string
    modelProvider?: string
    emotionLabel?: string
    emotionEmoji?: string
    emotionIntensity?: number
  }
  blocks: {
    isOverlayPreview: boolean
    textItems: TextSegmentRenderItem[]
    supportItems: SupportSegmentRenderItem[]
  }
  playback: {
    committed: AssistantMessagePlaybackInput
    preview: AssistantMessagePlaybackInput
  }
  presence: {
    hasContent: boolean
    hasSegments: boolean
    hasToolCalls: boolean
  }
}

export const EMPTY_PREVIEW_MESSAGE: ChatMessage = {
  role: 'assistant',
  content: '',
  segments: [],
  source: 'stream_preview',
  typewriterCompleted: true
}

function getSegmentRenderKey(segment: MessageSegment): string {
  return segment.segmentId
}

export function buildAssistantMessagePlaybackInput(
  message: ChatMessage | undefined,
  segments: TextSegment[]
): AssistantMessagePlaybackInput {
  return {
    role: message?.role ?? 'assistant',
    source: message?.source,
    typewriterCompleted: message?.typewriterCompleted,
    segments
  }
}

function resolveMessageProvider(
  modelRef: ModelRef | undefined,
  providerDefinitions: ProviderDefinition[],
  accounts: ProviderAccount[]
): string | undefined {
  if (!modelRef) return undefined

  const account = accounts.find(item => item.id === modelRef.accountId)
  if (!account) return undefined

  const definition = providerDefinitions.find(item => item.id === account.providerId)
  return definition?.iconKey || definition?.id || account.providerId
}

function buildOrderedSegmentItems(args: {
  segments: MessageSegment[]
  layer: SegmentRenderLayer
  orderOffset: number
  isLatest: boolean
  isStreaming: boolean
}): OrderedSegmentRenderItem[] {
  const { segments, layer, orderOffset, isLatest, isStreaming } = args
  const orderedItems: OrderedSegmentRenderItem[] = []

  segments.forEach((segment, sourceIndex) => {
    const key = `${layer}-${getSegmentRenderKey(segment)}`
    const order = orderOffset + orderedItems.length

    if (segment.type === 'text') {
      orderedItems.push({
        kind: 'text',
        item: {
          key,
          layer,
          sourceIndex,
          order,
          segment
        }
      })
      return
    }

    orderedItems.push({
      kind: 'support',
      item: {
        key,
        layer,
        sourceIndex,
        order,
        segment,
        isStreamingTail: layer === 'preview' && isLatest && isStreaming && sourceIndex === segments.length - 1
      }
    })
  })

  return orderedItems
}

export function mapAssistantMessage(
  source: AssistantMessageSource,
  context: AssistantMessageMapperContext
): AssistantMessageRenderState {
  const { committedMessage, previewMessage } = source
  const { isLatest, isStreaming, providerDefinitions, accounts } = context
  const facts = buildAssistantMessageFacts(source)

  const committedOrderedItems = buildOrderedSegmentItems({
    segments: facts.transcript.committedSegments,
    layer: 'committed',
    orderOffset: 0,
    isLatest,
    isStreaming
  })

  const previewOrderedItems = !facts.isOverlayPreview
    ? []
    : buildOrderedSegmentItems({
        segments: facts.transcript.previewSegments,
        layer: 'preview',
        orderOffset: committedOrderedItems.length,
        isLatest,
        isStreaming
      })

  const orderedItems = [...committedOrderedItems, ...previewOrderedItems]
  const textItems = orderedItems
    .filter((entry): entry is { kind: 'text'; item: TextSegmentRenderItem } => entry.kind === 'text')
    .map(entry => entry.item)
  const supportItems = orderedItems
    .filter((entry): entry is { kind: 'support'; item: SupportSegmentRenderItem } => entry.kind === 'support')
    .map(entry => entry.item)
  const committedTextSegments = textItems
    .filter((item) => item.layer === 'committed')
    .map((item) => item.segment)
  const previewTextSegments = textItems
    .filter((item) => item.layer === 'preview')
    .map((item) => item.segment)

  return {
    header: {
      badgeModel: facts.badge.model,
      modelProvider: resolveMessageProvider(facts.badge.modelRef, providerDefinitions, accounts),
      emotionLabel: facts.emotion.label,
      emotionEmoji: facts.emotion.emoji,
      emotionIntensity: facts.emotion.intensity
    },
    blocks: {
      isOverlayPreview: facts.isOverlayPreview,
      textItems,
      supportItems
    },
    playback: {
      committed: buildAssistantMessagePlaybackInput(committedMessage, committedTextSegments),
      preview: buildAssistantMessagePlaybackInput(previewMessage ?? EMPTY_PREVIEW_MESSAGE, previewTextSegments)
    },
    presence: {
      hasContent: facts.presence.hasContent,
      hasSegments: orderedItems.length > 0,
      hasToolCalls: facts.presence.hasToolCalls
    }
  }
}

export type {
  SegmentRenderLayer,
  SupportSegmentRenderItem,
  TextSegmentRenderItem,
  AssistantMessagePlaybackInput
}
