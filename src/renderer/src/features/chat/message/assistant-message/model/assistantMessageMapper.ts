import {
  buildAssistantMessageFacts
} from './assistantMessageFacts'
import type { AssistantMessageFacts } from './assistantMessageFacts'
import {
  buildSupportRenderUnits,
  type SupportRenderUnit
} from './assistantSupportGrouping'

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

export type OrderedSegmentRenderItem =
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
}

export interface AssistantMessageTranscriptProjection {
  isOverlayPreview: boolean
  textItems: TextSegmentRenderItem[]
  supportItems: SupportSegmentRenderItem[]
  supportUnits: SupportRenderUnit[]
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

export function buildOrderedSegmentItems(args: {
  segments: MessageSegment[]
  layer: SegmentRenderLayer
  orderOffset: number
  isLatest: boolean
  isStreaming: boolean
  sourceIndexOffset?: number
}): OrderedSegmentRenderItem[] {
  const {
    segments,
    layer,
    orderOffset,
    isLatest,
    isStreaming,
    sourceIndexOffset = 0
  } = args
  const orderedItems: OrderedSegmentRenderItem[] = []

  segments.forEach((segment, sourceIndex) => {
    const itemSourceIndex = sourceIndexOffset + sourceIndex
    const key = `${layer}-${getSegmentRenderKey(segment)}-${itemSourceIndex}`
    const order = orderOffset + orderedItems.length

    if (segment.type === 'text') {
      orderedItems.push({
        kind: 'text',
        item: {
          key,
          layer,
          sourceIndex: itemSourceIndex,
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
        sourceIndex: itemSourceIndex,
        order,
        segment,
        isStreamingTail: layer === 'preview' && isLatest && isStreaming && sourceIndex === segments.length - 1
      }
    })
  })

  return orderedItems
}

export function buildAssistantMessageHeaderProjection(
  facts: Pick<AssistantMessageFacts, 'badge'>,
  context: Pick<AssistantMessageMapperContext, 'providerDefinitions' | 'accounts'>
): AssistantMessageHeaderProjection {
  return {
    badgeModel: facts.badge.model,
    modelProvider: resolveMessageProvider(
      facts.badge.modelRef,
      context.providerDefinitions,
      context.accounts
    )
  }
}

export function buildAssistantMessageTranscriptProjection(
  orderedItems: OrderedSegmentRenderItem[],
  isOverlayPreview: boolean
): AssistantMessageTranscriptProjection {
  const textItems = orderedItems
    .filter((entry): entry is { kind: 'text'; item: TextSegmentRenderItem } => entry.kind === 'text')
    .map(entry => entry.item)
  const supportItems = orderedItems
    .filter((entry): entry is { kind: 'support'; item: SupportSegmentRenderItem } => entry.kind === 'support')
    .map(entry => entry.item)
  const supportUnits = buildSupportRenderUnits(supportItems, textItems)

  return {
    isOverlayPreview,
    textItems,
    supportItems,
    supportUnits
  }
}

export function buildAssistantMessageOrderedItems(
  facts: AssistantMessageFacts,
  context: Pick<AssistantMessageMapperContext, 'isLatest' | 'isStreaming'>
): OrderedSegmentRenderItem[] {
  const committedOrderedItems = buildOrderedSegmentItems({
    segments: facts.transcript.committedSegments,
    layer: 'committed',
    orderOffset: 0,
    isLatest: context.isLatest,
    isStreaming: context.isStreaming
  })

  const previewOrderedItems = !facts.isOverlayPreview
    ? []
    : buildOrderedSegmentItems({
        segments: facts.transcript.previewSegments,
        layer: 'preview',
        orderOffset: committedOrderedItems.length,
        isLatest: context.isLatest,
        isStreaming: context.isStreaming
      })

  return [...committedOrderedItems, ...previewOrderedItems]
}

export function mapAssistantMessage(
  source: AssistantMessageSource,
  context: AssistantMessageMapperContext
): AssistantMessageRenderState {
  const { providerDefinitions, accounts } = context
  const facts = buildAssistantMessageFacts(source)
  const orderedItems = buildAssistantMessageOrderedItems(facts, context)

  return {
    header: buildAssistantMessageHeaderProjection(facts, {
      providerDefinitions,
      accounts
    }),
    transcript: buildAssistantMessageTranscriptProjection(orderedItems, facts.isOverlayPreview)
  }
}

export type {
  SegmentRenderLayer,
  SupportRenderUnit,
  SupportSegmentRenderItem,
  TextSegmentRenderItem
}
