import type { SupportSegmentRenderItem } from './assistantMessageMapper'

export type SupportRenderUnit =
  | {
      type: 'single'
      key: string
      order: number
      item: SupportSegmentRenderItem
    }
  | {
      type: 'supportGroup'
      key: string
      order: number
      items: SupportSegmentRenderItem[]
    }

const isGroupableSupportItem = (item: SupportSegmentRenderItem): boolean => (
  item.segment.type === 'toolCall' || item.segment.type === 'reasoning'
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

const toSingleUnit = (item: SupportSegmentRenderItem): SupportRenderUnit => ({
  type: 'single',
  key: item.key,
  order: item.order,
  item
})

const toSupportGroupUnit = (items: SupportSegmentRenderItem[]): SupportRenderUnit => ({
  type: 'supportGroup',
  key: `support-group:${items[0].key}`,
  order: items[0].order,
  items
})

export function buildSupportRenderUnits(
  items: SupportSegmentRenderItem[]
): SupportRenderUnit[] {
  const units: SupportRenderUnit[] = []
  let index = 0

  while (index < items.length) {
    const first = items[index]

    if (!isGroupableSupportItem(first)) {
      units.push(toSingleUnit(first))
      index += 1
      continue
    }

    const groupItems = [first]
    let cursor = index + 1

    while (cursor < items.length && canJoinSupportGroup(groupItems[groupItems.length - 1], items[cursor])) {
      groupItems.push(items[cursor])
      cursor += 1
    }

    units.push(groupItems.length > 1 ? toSupportGroupUnit(groupItems) : toSingleUnit(first))
    index = cursor
  }

  return units
}
