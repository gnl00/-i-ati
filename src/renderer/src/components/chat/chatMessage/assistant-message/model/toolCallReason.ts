import { TOOL_CALL_REASON_PARAMETER_NAME } from '@shared/tools/definitions-utils'
import type { SupportSegmentRenderItem } from './assistantMessageMapper'

export interface ToolCallReasonItem {
  id: string
  toolName: string
  reason: string
  order: number
  isTerminal: boolean
}

export interface ToolCallReasonModel {
  items: ToolCallReasonItem[]
}

const TOOL_CALL_TERMINAL_STATUSES = new Set([
  'success',
  'completed',
  'failed',
  'error',
  'aborted',
  'denied',
  'timeout',
  'cancelled'
])

const TOOL_CALL_ACTIVE_STATUSES = new Set([
  'pending',
  'running'
])

const parseToolArgs = (args: unknown): Record<string, unknown> | undefined => {
  if (!args) return undefined
  if (typeof args === 'object' && !Array.isArray(args)) {
    return args as Record<string, unknown>
  }
  if (typeof args !== 'string') return undefined

  try {
    const parsed = JSON.parse(args)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined
  } catch {
    return undefined
  }
}

const getToolCallContent = (segment: ToolCallSegment): Record<string, unknown> => (
  segment.content && typeof segment.content === 'object'
    ? segment.content as Record<string, unknown>
    : {}
)

export const getReasonFromToolCall = (segment: ToolCallSegment): string | undefined => {
  const args = parseToolArgs(getToolCallContent(segment).args)
  const reason = args?.[TOOL_CALL_REASON_PARAMETER_NAME]
  return typeof reason === 'string' && reason.trim().length > 0
    ? reason.trim()
    : undefined
}

export const isToolCallTerminal = (segment: ToolCallSegment): boolean => {
  if (segment.isError) {
    return true
  }

  const content = getToolCallContent(segment)
  const status = typeof content.status === 'string'
    ? content.status.toLowerCase()
    : undefined

  if (status && TOOL_CALL_TERMINAL_STATUSES.has(status)) {
    return true
  }

  if (status && TOOL_CALL_ACTIVE_STATUSES.has(status)) {
    return false
  }

  return segment.cost !== undefined
    || content.result !== undefined
    || content.error !== undefined
    || content.raw !== undefined
}

export function buildToolCallReasonItem(
  item: SupportSegmentRenderItem
): ToolCallReasonItem | undefined {
  const { segment } = item
  if (segment.type !== 'toolCall') {
    return undefined
  }

  const reason = getReasonFromToolCall(segment)
  if (!reason) {
    return undefined
  }

  return {
    id: segment.toolCallId || segment.segmentId || `${segment.name}-${item.order}`,
    toolName: segment.name,
    reason,
    order: item.order,
    isTerminal: isToolCallTerminal(segment)
  }
}

export function buildToolCallReasonModel(
  supportItems: SupportSegmentRenderItem[]
): ToolCallReasonModel {
  const itemsById = new Map<string, ToolCallReasonItem>()

  for (const item of supportItems) {
    const reasonItem = buildToolCallReasonItem(item)
    if (!reasonItem) {
      continue
    }

    itemsById.set(reasonItem.id, reasonItem)
  }

  return {
    items: Array.from(itemsById.values()).sort((left, right) => left.order - right.order)
  }
}

export function buildActiveToolCallReason(
  supportItems: SupportSegmentRenderItem[]
): ToolCallReasonItem | undefined {
  return buildToolCallReasonModel(supportItems).items.find(item => !item.isTerminal)
}
