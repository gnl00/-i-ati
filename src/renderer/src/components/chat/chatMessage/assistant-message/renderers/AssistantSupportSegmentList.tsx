import { memo } from 'react'
import type { SupportRenderUnit, SupportSegmentRenderItem } from '../model/assistantMessageMapper'
import { AssistantSupportSegmentContent } from './AssistantSupportSegmentContent'
import {
  areSupportSegmentRenderItemListsEqual,
  areSupportSegmentRenderItemsEqual,
  SupportSegmentGroup
} from './SupportSegmentGroup'

const AssistantSupportSegmentItem = memo(({
  item
}: {
  item: SupportSegmentRenderItem
}) => (
  <AssistantSupportSegmentContent item={item} />
), (prevProps, nextProps) => areSupportSegmentRenderItemsEqual(prevProps.item, nextProps.item))

const areSupportRenderUnitsEqual = (
  previous: SupportRenderUnit[],
  next: SupportRenderUnit[]
): boolean => {
  if (previous.length !== next.length) return false

  return previous.every((unit, index) => {
    const nextUnit = next[index]
    if (unit.type !== nextUnit.type || unit.key !== nextUnit.key || unit.order !== nextUnit.order) {
      return false
    }

    if (unit.type === 'single' && nextUnit.type === 'single') {
      return areSupportSegmentRenderItemsEqual(unit.item, nextUnit.item)
    }

    if (unit.type === 'supportGroup' && nextUnit.type === 'supportGroup') {
      return areSupportSegmentRenderItemListsEqual(unit.items, nextUnit.items)
    }

    return false
  })
}

const AssistantSupportRenderUnit = memo(({
  unit
}: {
  unit: SupportRenderUnit
}) => {
  if (unit.type === 'supportGroup') {
    return <SupportSegmentGroup items={unit.items} />
  }

  return <AssistantSupportSegmentItem item={unit.item} />
}, (prevProps, nextProps) => areSupportRenderUnitsEqual([prevProps.unit], [nextProps.unit]))

export const AssistantSupportSegmentList = memo(({
  units
}: {
  units: SupportRenderUnit[]
}) => {
  return units.map((unit) => (
    <div key={unit.key} style={{ order: unit.order }}>
      <AssistantSupportRenderUnit unit={unit} />
    </div>
  ))
}, (prevProps, nextProps) => areSupportRenderUnitsEqual(prevProps.units, nextProps.units))
