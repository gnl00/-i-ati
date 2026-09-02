import { buildAssistantMessageFacts } from './assistantMessageFacts'
import {
  buildAssistantMessageHeaderProjection,
  buildAssistantMessageTranscriptProjection,
  buildOrderedSegmentItems,
  mapAssistantMessage,
  type AssistantMessageMapperContext,
  type AssistantMessageRenderState,
  type AssistantMessageSource,
  type OrderedSegmentRenderItem,
  type TextSegmentRenderItem,
  type SupportSegmentRenderItem
} from './assistantMessageMapper'

export type AssistantMessageProjectionIdentity = string | number

interface LayerSnapshot {
  present: boolean
  rawSegmentIds: string[]
  rawSegmentTypes: MessageSegment['type'][]
  rawVisibility: boolean[]
}

export interface AssistantMessageProjectionCache {
  messageIdentity?: AssistantMessageProjectionIdentity
  isLatest: boolean
  isStreaming: boolean
  committed: LayerSnapshot
  preview: LayerSnapshot
  orderedItems: OrderedSegmentRenderItem[]
  renderState: AssistantMessageRenderState
}

function isTranscriptVisible(segment: MessageSegment): boolean {
  return segment.presentation?.transcriptVisible !== false
}

function createLayerSnapshot(
  message: ChatMessage | undefined,
  present: boolean
): LayerSnapshot {
  const rawSegments = message?.segments ?? []

  return {
    present,
    rawSegmentIds: rawSegments.map(segment => segment.segmentId),
    rawSegmentTypes: rawSegments.map(segment => segment.type),
    rawVisibility: rawSegments.map(isTranscriptVisible)
  }
}

function createCacheSnapshot(args: {
  source: AssistantMessageSource
  context: AssistantMessageMapperContext
  orderedItems: OrderedSegmentRenderItem[]
  renderState: AssistantMessageRenderState
  messageIdentity?: AssistantMessageProjectionIdentity
}): AssistantMessageProjectionCache {
  return {
    messageIdentity: args.messageIdentity,
    isLatest: args.context.isLatest,
    isStreaming: args.context.isStreaming,
    committed: createLayerSnapshot(args.source.committedMessage, true),
    preview: createLayerSnapshot(args.source.previewMessage, Boolean(args.source.previewMessage)),
    orderedItems: args.orderedItems,
    renderState: args.renderState
  }
}

function buildOrderedItemsFromRenderState(
  renderState: AssistantMessageRenderState
): OrderedSegmentRenderItem[] {
  return [
    ...renderState.transcript.textItems.map(item => ({
      kind: 'text' as const,
      item
    })),
    ...renderState.transcript.supportItems.map(item => ({
      kind: 'support' as const,
      item
    }))
  ].sort((left, right) => left.item.order - right.item.order)
}

function createFullCache(args: {
  source: AssistantMessageSource
  context: AssistantMessageMapperContext
  messageIdentity?: AssistantMessageProjectionIdentity
}): AssistantMessageProjectionCache {
  const renderState = mapAssistantMessage(args.source, args.context)
  const orderedItems = buildOrderedItemsFromRenderState(renderState)

  return createCacheSnapshot({
    source: args.source,
    context: args.context,
    orderedItems,
    renderState,
    messageIdentity: args.messageIdentity
  })
}

function canReuseLayer(previous: LayerSnapshot, next: LayerSnapshot): boolean {
  if (previous.present !== next.present || next.rawSegmentIds.length < previous.rawSegmentIds.length) {
    return false
  }

  if (
    previous.rawSegmentIds.some(id => !id)
    || next.rawSegmentIds.some(id => !id)
    || new Set(previous.rawSegmentIds).size !== previous.rawSegmentIds.length
    || new Set(next.rawSegmentIds).size !== next.rawSegmentIds.length
  ) {
    return false
  }

  for (let index = 0; index < previous.rawSegmentIds.length; index += 1) {
    if (
      previous.rawSegmentIds[index] !== next.rawSegmentIds[index]
      || previous.rawSegmentTypes[index] !== next.rawSegmentTypes[index]
      || previous.rawVisibility[index] !== next.rawVisibility[index]
    ) {
      return false
    }
  }

  return true
}

function buildNextDescriptors(facts: ReturnType<typeof buildAssistantMessageFacts>): Array<{
  layer: 'committed' | 'preview'
  sourceIndex: number
  segment: MessageSegment
}> {
  return [
    ...facts.transcript.committedSegments.map((segment, sourceIndex) => ({
      layer: 'committed' as const,
      sourceIndex,
      segment
    })),
    ...facts.transcript.previewSegments.map((segment, sourceIndex) => ({
      layer: 'preview' as const,
      sourceIndex,
      segment
    }))
  ]
}

function findFirstChangedIndex(
  previous: AssistantMessageProjectionCache,
  facts: ReturnType<typeof buildAssistantMessageFacts>
): number {
  const nextDescriptors = buildNextDescriptors(facts)
  const sharedLength = Math.min(previous.orderedItems.length, nextDescriptors.length)

  for (let index = 0; index < sharedLength; index += 1) {
    const previousItem = previous.orderedItems[index].item
    const nextDescriptor = nextDescriptors[index]

    if (
      previousItem.layer !== nextDescriptor.layer
      || previousItem.sourceIndex !== nextDescriptor.sourceIndex
      || previousItem.segment.segmentId !== nextDescriptor.segment.segmentId
      || previousItem.segment.type !== nextDescriptor.segment.type
      || previousItem.segment !== nextDescriptor.segment
    ) {
      return index
    }
  }

  return previous.orderedItems.length === nextDescriptors.length
    ? -1
    : sharedLength
}

function findRebuildStart(
  previous: AssistantMessageProjectionCache,
  facts: ReturnType<typeof buildAssistantMessageFacts>,
  changedIndex: number
): number {
  const changedEntry = previous.orderedItems[changedIndex]
  const committedLength = facts.transcript.committedSegments.length
  const nextSegment = changedIndex < committedLength
    ? facts.transcript.committedSegments[changedIndex]
    : facts.transcript.previewSegments[changedIndex - committedLength]
  if (
    changedEntry?.kind === 'text'
    && nextSegment?.type === 'text'
    && changedEntry.item.segment.content.length > 0
    && nextSegment.content.length > 0
  ) {
    return changedIndex
  }

  for (let index = changedIndex - 1; index >= 0; index -= 1) {
    const entry = previous.orderedItems[index]
    if (entry?.kind === 'text' && entry.item.segment.content.length > 0) {
      return index
    }
  }

  return 0
}

function buildOrderedSuffix(args: {
  facts: ReturnType<typeof buildAssistantMessageFacts>
  context: AssistantMessageMapperContext
  startIndex: number
}): OrderedSegmentRenderItem[] {
  const { facts, context, startIndex } = args
  const committedLength = facts.transcript.committedSegments.length

  if (startIndex < committedLength) {
    const committedItems = buildOrderedSegmentItems({
      segments: facts.transcript.committedSegments.slice(startIndex),
      layer: 'committed',
      orderOffset: startIndex,
      sourceIndexOffset: startIndex,
      isLatest: context.isLatest,
      isStreaming: context.isStreaming
    })
    const previewItems = facts.isOverlayPreview
      ? buildOrderedSegmentItems({
          segments: facts.transcript.previewSegments,
          layer: 'preview',
          orderOffset: committedLength,
          isLatest: context.isLatest,
          isStreaming: context.isStreaming
        })
      : []

    return [...committedItems, ...previewItems]
  }

  const previewStartIndex = startIndex - committedLength
  return facts.isOverlayPreview
    ? buildOrderedSegmentItems({
        segments: facts.transcript.previewSegments.slice(previewStartIndex),
        layer: 'preview',
        orderOffset: startIndex,
        sourceIndexOffset: previewStartIndex,
        isLatest: context.isLatest,
        isStreaming: context.isStreaming
      })
    : []
}

function splitItems(items: OrderedSegmentRenderItem[]): {
  textItems: TextSegmentRenderItem[]
  supportItems: SupportSegmentRenderItem[]
} {
  const textItems: TextSegmentRenderItem[] = []
  const supportItems: SupportSegmentRenderItem[] = []

  items.forEach((entry) => {
    if (entry.kind === 'text') {
      textItems.push(entry.item)
      return
    }

    supportItems.push(entry.item)
  })

  return { textItems, supportItems }
}

function sameHeader(
  previous: AssistantMessageRenderState['header'],
  next: AssistantMessageRenderState['header']
): boolean {
  return previous.badgeModel === next.badgeModel
    && previous.modelProvider === next.modelProvider
}

export function mapAssistantMessageIncrementally(
  source: AssistantMessageSource,
  context: AssistantMessageMapperContext,
  previousCache?: AssistantMessageProjectionCache,
  messageIdentity?: AssistantMessageProjectionIdentity
): AssistantMessageProjectionCache {
  const facts = buildAssistantMessageFacts(source)
  const nextCommitted = createLayerSnapshot(source.committedMessage, true)
  const nextPreview = createLayerSnapshot(source.previewMessage, Boolean(source.previewMessage))

  if (
    !previousCache
    || previousCache.messageIdentity !== messageIdentity
    || previousCache.isLatest !== context.isLatest
    || previousCache.isStreaming !== context.isStreaming
    || !canReuseLayer(previousCache.committed, nextCommitted)
    || !canReuseLayer(previousCache.preview, nextPreview)
  ) {
    return createFullCache({
      source,
      context,
      messageIdentity
    })
  }

  const header = buildAssistantMessageHeaderProjection(facts, context)
  const changedIndex = findFirstChangedIndex(previousCache, facts)

  if (changedIndex < 0) {
    const renderState = sameHeader(previousCache.renderState.header, header)
      ? previousCache.renderState
      : {
          header,
          transcript: previousCache.renderState.transcript
        }

    return {
      ...previousCache,
      messageIdentity,
      committed: nextCommitted,
      preview: nextPreview,
      renderState
    }
  }

  const startIndex = findRebuildStart(previousCache, facts, changedIndex)
  const prefixEntries = previousCache.orderedItems.slice(0, startIndex)
  const suffixEntries = buildOrderedSuffix({
    facts,
    context,
    startIndex
  })

  if (
    startIndex < changedIndex
    && suffixEntries.length > 0
    && previousCache.orderedItems[startIndex]?.kind === suffixEntries[0].kind
    && previousCache.orderedItems[startIndex]?.item.segment === suffixEntries[0].item.segment
  ) {
    suffixEntries[0] = previousCache.orderedItems[startIndex]
  }

  const nextOrderedItems = [...prefixEntries, ...suffixEntries]
  const prefixItems = splitItems(prefixEntries)
  const suffixProjection = buildAssistantMessageTranscriptProjection(
    suffixEntries,
    facts.isOverlayPreview
  )
  const supportUnits = [
    ...previousCache.renderState.transcript.supportUnits.filter(unit => unit.order < startIndex),
    ...suffixProjection.supportUnits
  ]
  const transcript = {
    isOverlayPreview: facts.isOverlayPreview,
    textItems: [...prefixItems.textItems, ...suffixProjection.textItems],
    supportItems: [...prefixItems.supportItems, ...suffixProjection.supportItems],
    supportUnits
  }

  return {
    messageIdentity,
    isLatest: context.isLatest,
    isStreaming: context.isStreaming,
    committed: nextCommitted,
    preview: nextPreview,
    orderedItems: nextOrderedItems,
    renderState: {
      header: sameHeader(previousCache.renderState.header, header)
        ? previousCache.renderState.header
        : header,
      transcript
    }
  }
}
