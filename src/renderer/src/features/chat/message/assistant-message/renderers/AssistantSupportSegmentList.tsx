import { memo, type ReactNode } from 'react'
import type {
  SupportLeafRenderUnit
} from '../model/assistantSupportGrouping'
import type { SupportRenderUnit, SupportSegmentRenderItem } from '../model/assistantMessageMapper'
import { AssistantSupportSegmentContent } from './AssistantSupportSegmentContent'
import {
  areSupportSegmentRenderItemListsEqual,
  areSupportSegmentRenderItemsEqual
} from '../model/supportSegmentEquality'
import { ToolCallGroup } from '../toolcall/ToolCallGroup'

const AssistantSupportSegmentItem = memo(({
  item,
  fullWidth = false,
  nestedDisclosure = false,
  onTypingChange
}: {
  item: SupportSegmentRenderItem
  fullWidth?: boolean
  nestedDisclosure?: boolean
  onTypingChange?: () => void
}) => (
  <AssistantSupportSegmentContent
    item={item}
    fullWidth={fullWidth}
    nestedDisclosure={nestedDisclosure}
    onTypingChange={onTypingChange}
  />
), (prevProps, nextProps) => (
  prevProps.fullWidth === nextProps.fullWidth
  && prevProps.nestedDisclosure === nextProps.nestedDisclosure
  && prevProps.onTypingChange === nextProps.onTypingChange
  && areSupportSegmentRenderItemsEqual(prevProps.item, nextProps.item)
))
AssistantSupportSegmentItem.displayName = 'AssistantSupportSegmentItem'

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

    if (unit.type === 'toolGroup' && nextUnit.type === 'toolGroup') {
      return areSupportSegmentRenderItemListsEqual(unit.items, nextUnit.items)
    }


    return false
  })
}

const AssistantSupportLeafUnit = memo(({
  unit,
  fullWidth = false,
  nestedDisclosure = false,
  onTypingChange
}: {
  unit: SupportLeafRenderUnit
  fullWidth?: boolean
  nestedDisclosure?: boolean
  onTypingChange?: () => void
}) => {
  if (unit.type === 'toolGroup') {
    return (
      <ToolCallGroup
        items={unit.items}
        fullWidth={fullWidth}
        nestedDisclosure={nestedDisclosure}
      />
    )
  }

  return (
    <AssistantSupportSegmentItem
      item={unit.item}
      fullWidth={fullWidth}
      nestedDisclosure={nestedDisclosure}
      onTypingChange={onTypingChange}
    />
  )
}, (prevProps, nextProps) => (
  prevProps.fullWidth === nextProps.fullWidth
  && prevProps.nestedDisclosure === nextProps.nestedDisclosure
  && prevProps.onTypingChange === nextProps.onTypingChange
  && areSupportRenderUnitsEqual([prevProps.unit], [nextProps.unit])
))
AssistantSupportLeafUnit.displayName = 'AssistantSupportLeafUnit'

interface AssistantSupportSegmentListProps {
  nestedDisclosure?: boolean
  units: SupportRenderUnit[]
  onTypingChange?: () => void
}

const AssistantSupportSegmentListComponent = ({
  units,
  onTypingChange,
  nestedDisclosure = false
}: AssistantSupportSegmentListProps): ReactNode => {
  return units.map((unit) => (
    <div key={unit.key} style={{ order: unit.order }}>
      <AssistantSupportLeafUnit unit={unit} fullWidth={nestedDisclosure} nestedDisclosure={nestedDisclosure} onTypingChange={onTypingChange} />
    </div>
  ))
}

export const AssistantSupportSegmentList = memo(AssistantSupportSegmentListComponent, (prevProps, nextProps) => (
  prevProps.onTypingChange === nextProps.onTypingChange
  && prevProps.nestedDisclosure === nextProps.nestedDisclosure
  && areSupportRenderUnitsEqual(prevProps.units, nextProps.units)
))
AssistantSupportSegmentList.displayName = 'AssistantSupportSegmentList'
