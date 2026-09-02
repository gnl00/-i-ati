import type {
  SupportSegmentRenderItem,
  TextSegmentRenderItem
} from './assistantMessageMapper'

export type SupportLeafRenderUnit =
  | {
      type: 'single'
      key: string
      order: number
      item: SupportSegmentRenderItem
    }
  | {
      type: 'toolGroup'
      key: string
      order: number
      items: SupportSegmentRenderItem[]
    }

export type SupportRenderUnit =
  | SupportLeafRenderUnit
  | {
      type: 'completedWork'
      key: string
      order: number
      units: SupportLeafRenderUnit[]
    }

const isGroupableSupportItem = (item: SupportSegmentRenderItem): boolean => (
  item.segment.type === 'toolCall'
)

const canJoinSupportGroup = (
  previous: SupportSegmentRenderItem,
  next: SupportSegmentRenderItem
): boolean => {
  return previous.layer === next.layer
    && previous.order + 1 === next.order
    && isGroupableSupportItem(previous)
    && isGroupableSupportItem(next)
}

const toSingleUnit = (item: SupportSegmentRenderItem): SupportLeafRenderUnit => ({
  type: 'single',
  key: item.key,
  order: item.order,
  item
})

const toSupportGroupUnit = (items: SupportSegmentRenderItem[]): SupportLeafRenderUnit => ({
  type: 'toolGroup',
  key: `tool-group:${items[0].key}`,
  order: items[0].order,
  items
})

function mergeConsecutiveReasoningItems(
  items: SupportSegmentRenderItem[]
): SupportSegmentRenderItem[] {
  const mergedItems: SupportSegmentRenderItem[] = []
  let previousSourceItem: SupportSegmentRenderItem | undefined

  items.forEach((item) => {
    const previousMergedItem = mergedItems[mergedItems.length - 1]
    if (
      previousSourceItem?.segment.type !== 'reasoning'
      || item.segment.type !== 'reasoning'
      || previousSourceItem.layer !== item.layer
      || previousSourceItem.order + 1 !== item.order
      || previousMergedItem?.segment.type !== 'reasoning'
    ) {
      mergedItems.push(item)
      previousSourceItem = item
      return
    }

    const isStreamingTail = previousMergedItem.isStreamingTail || item.isStreamingTail
    mergedItems[mergedItems.length - 1] = {
      ...previousMergedItem,
      isStreamingTail,
      segment: {
        ...previousMergedItem.segment,
        content: [previousMergedItem.segment.content, item.segment.content]
          .filter(Boolean)
          .join('\n\n'),
        endedAt: isStreamingTail
          ? undefined
          : item.segment.endedAt ?? previousMergedItem.segment.endedAt
      }
    }
    previousSourceItem = item
  })

  return mergedItems
}

function buildLeafSupportRenderUnits(
  items: SupportSegmentRenderItem[]
): SupportLeafRenderUnit[] {
  const displayItems = mergeConsecutiveReasoningItems(items)
  const units: SupportLeafRenderUnit[] = []
  let index = 0

  while (index < displayItems.length) {
    const first = displayItems[index]

    if (!isGroupableSupportItem(first)) {
      units.push(toSingleUnit(first))
      index += 1
      continue
    }

    const groupItems = [first]
    let cursor = index + 1

    while (
      cursor < displayItems.length
      && canJoinSupportGroup(groupItems[groupItems.length - 1], displayItems[cursor])
    ) {
      groupItems.push(displayItems[cursor])
      cursor += 1
    }

    units.push(toSupportGroupUnit(groupItems))
    index = cursor
  }

  return units
}

function getStableBoundaryIdentity(segment: TextSegment): string {
  if (segment.segmentId) {
    return segment.segmentId.replace(/^(?:(?:preview|committed):)+/, '')
  }

  const timestamp = 'timestamp' in segment && typeof segment.timestamp === 'number'
    ? segment.timestamp
    : 'na'
  return `${segment.type}:${timestamp}`
}

function shouldBuildCompletedWorkGroup(items: SupportSegmentRenderItem[]): boolean {
  if (items.some(item => item.segment.type === 'error')) return false

  const completedWorkItemCount = items.filter(item => (
    item.segment.type === 'reasoning' || item.segment.type === 'toolCall'
  )).length
  return completedWorkItemCount > 1
}

export function buildSupportRenderUnits(
  items: SupportSegmentRenderItem[],
  textItems: TextSegmentRenderItem[] = []
): SupportRenderUnit[] {
  const visibleTextItems = textItems.filter(item => item.segment.content.length > 0)
  if (visibleTextItems.length === 0) {
    return buildLeafSupportRenderUnits(items)
  }

  const units: SupportRenderUnit[] = []
  let supportIndex = 0

  const appendWindow = (
    windowItems: SupportSegmentRenderItem[],
    boundary: TextSegmentRenderItem
  ): void => {
    if (!shouldBuildCompletedWorkGroup(windowItems)) {
      units.push(...buildLeafSupportRenderUnits(windowItems))
      return
    }

    units.push({
      type: 'completedWork',
      key: `completed-work:${getStableBoundaryIdentity(boundary.segment)}`,
      order: windowItems[0].order,
      units: buildLeafSupportRenderUnits(windowItems)
    })
  }

  visibleTextItems.forEach((boundary) => {
    const windowItems: SupportSegmentRenderItem[] = []

    while (
      supportIndex < items.length
      && items[supportIndex].order < boundary.order
    ) {
      windowItems.push(items[supportIndex])
      supportIndex += 1
    }

    appendWindow(windowItems, boundary)
  })

  units.push(...buildLeafSupportRenderUnits(items.slice(supportIndex)))
  return units
}
