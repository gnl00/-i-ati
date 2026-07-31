import { memo } from 'react'
import type {
  SupportLeafRenderUnit
} from '../model/assistantSupportGrouping'
import type { SupportRenderUnit, SupportSegmentRenderItem } from '../model/assistantMessageMapper'
import { AssistantSupportSegmentContent } from './AssistantSupportSegmentContent'
import { AssistantCompletedWorkGroup } from './AssistantCompletedWorkGroup'
import {
  areSupportSegmentRenderItemListsEqual,
  areSupportSegmentRenderItemsEqual
} from '../model/supportSegmentEquality'
import { ToolCallGroup } from '../toolcall/ToolCallGroup'

const AssistantSupportSegmentItem = memo(({
  item,
  fullWidth = false,
  nestedDisclosure = false
}: {
  item: SupportSegmentRenderItem
  fullWidth?: boolean
  nestedDisclosure?: boolean
}) => (
  <AssistantSupportSegmentContent
    item={item}
    fullWidth={fullWidth}
    nestedDisclosure={nestedDisclosure}
  />
), (prevProps, nextProps) => (
  prevProps.fullWidth === nextProps.fullWidth
  && prevProps.nestedDisclosure === nextProps.nestedDisclosure
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

    if (unit.type === 'completedWork' && nextUnit.type === 'completedWork') {
      return areSupportRenderUnitsEqual(unit.units, nextUnit.units)
    }

    return false
  })
}

const AssistantSupportLeafUnit = memo(({
  unit,
  fullWidth = false,
  nestedDisclosure = false
}: {
  unit: SupportLeafRenderUnit
  fullWidth?: boolean
  nestedDisclosure?: boolean
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
    />
  )
}, (prevProps, nextProps) => (
  prevProps.fullWidth === nextProps.fullWidth
  && prevProps.nestedDisclosure === nextProps.nestedDisclosure
  && areSupportRenderUnitsEqual([prevProps.unit], [nextProps.unit])
))
AssistantSupportLeafUnit.displayName = 'AssistantSupportLeafUnit'

const AssistantSupportRenderUnit = memo(({
  unit
}: {
  unit: SupportRenderUnit
}) => {
  if (unit.type === 'completedWork') {
    return (
      <AssistantCompletedWorkGroup>
        {unit.units.map(childUnit => (
          <AssistantSupportLeafUnit
            key={childUnit.key}
            unit={childUnit}
            fullWidth
            nestedDisclosure
          />
        ))}
      </AssistantCompletedWorkGroup>
    )
  }

  return <AssistantSupportLeafUnit unit={unit} />
}, (prevProps, nextProps) => areSupportRenderUnitsEqual([prevProps.unit], [nextProps.unit]))
AssistantSupportRenderUnit.displayName = 'AssistantSupportRenderUnit'

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
AssistantSupportSegmentList.displayName = 'AssistantSupportSegmentList'
