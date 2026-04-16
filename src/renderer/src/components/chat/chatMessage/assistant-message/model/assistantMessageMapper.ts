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

export interface AssistantMessageHeaderProjection {
  badgeModel?: string
  modelProvider?: string
  emotionLabel?: string
  emotionEmoji?: string
  emotionIntensity?: number
}

export interface AssistantMessageTranscriptProjection {
  isOverlayPreview: boolean
  textItems: TextSegmentRenderItem[]
  supportItems: SupportSegmentRenderItem[]
}

export interface AssistantMessageRenderState {
  header: AssistantMessageHeaderProjection
  transcript: AssistantMessageTranscriptProjection
}

function getSegmentRenderKey(segment: MessageSegment): string {
  if (segment.segmentId) {
    return segment.segmentId
  }

  const timestamp =
    'timestamp' in segment && typeof segment.timestamp === 'number'
      ? segment.timestamp
      : 'na'

  return `${segment.type}:missing:${timestamp}`
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
    const key = `${layer}-${getSegmentRenderKey(segment)}-${sourceIndex}`
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

  return {
    header: {
      badgeModel: facts.badge.model,
      modelProvider: resolveMessageProvider(facts.badge.modelRef, providerDefinitions, accounts),
      emotionLabel: facts.emotion.label,
      emotionEmoji: facts.emotion.emoji,
      emotionIntensity: facts.emotion.intensity
    },
    transcript: {
      isOverlayPreview: facts.isOverlayPreview,
      textItems,
      supportItems
    }
  }
}

export type {
  SegmentRenderLayer,
  SupportSegmentRenderItem,
  TextSegmentRenderItem
}
