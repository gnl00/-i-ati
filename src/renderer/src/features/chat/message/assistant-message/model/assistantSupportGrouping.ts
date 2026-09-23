import type {
  SupportSegmentRenderItem
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

export type SupportRenderUnit = SupportLeafRenderUnit

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

export function buildSupportRenderUnits(
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
