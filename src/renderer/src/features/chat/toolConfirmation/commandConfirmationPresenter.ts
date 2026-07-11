import type { ToolConfirmationRequest } from '@renderer/features/chat/state/toolConfirmationStore'
import type { CommandConfirmationRequest } from '../message/assistant-message/CommandConfirmation'

const LONG_TEXT_ARG_KEYS = new Set(['body', 'content', 'markdown', 'text'])
const MAX_STRING_ARG_CHARS = 120
const MAX_TOOL_ARGS_CHARS = 360

function summarizeArgValue(key: string, value: unknown): unknown {
  if (typeof value === 'string') {
    if (LONG_TEXT_ARG_KEYS.has(key)) {
      return `[${key}: ${value.length} chars]`
    }
    if (value.length > MAX_STRING_ARG_CHARS) {
      return `${value.slice(0, MAX_STRING_ARG_CHARS)}...`
    }
    return value
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => summarizeArgValue(`${key}.${index}`, item))
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([nestedKey, nestedValue]) => [
        nestedKey,
        summarizeArgValue(nestedKey, nestedValue)
      ])
    )
  }

  return value
}

function formatToolArgs(args: unknown): string {
  if (!args || typeof args !== 'object') {
    return ''
  }

  const summarized = Object.fromEntries(
    Object.entries(args as Record<string, unknown>)
      .filter(([key]) => key !== 'chat_uuid')
      .map(([key, value]) => [key, summarizeArgValue(key, value)])
  )
  const serialized = JSON.stringify(summarized)
  if (!serialized || serialized === '{}') {
    return ''
  }
  return serialized.length > MAX_TOOL_ARGS_CHARS
    ? `${serialized.slice(0, MAX_TOOL_ARGS_CHARS)}...`
    : serialized
}

export function buildCommandConfirmationRequest(input: {
  pendingToolConfirm: Pick<ToolConfirmationRequest, 'toolCallId' | 'name' | 'ui' | 'args' | 'agent'> | null
  pendingToolConfirmCount: number
}): CommandConfirmationRequest | undefined {
  const {
    pendingToolConfirm,
    pendingToolConfirmCount
  } = input

  if (!pendingToolConfirm) {
    return undefined
  }

  const pendingCommand =
    pendingToolConfirm.ui?.command ||
    ((pendingToolConfirm.args as { command?: string } | undefined)?.command ?? '')

  return {
    command: pendingCommand,
    risk_level: pendingToolConfirm.ui?.riskLevel || 'risky',
    execution_reason: pendingToolConfirm.ui?.executionReason || pendingToolConfirm.ui?.title || 'Command requires approval',
    possible_risk: pendingToolConfirm.ui?.possibleRisk || pendingToolConfirm.ui?.reason || 'Potential risk not provided',
    risk_score: pendingToolConfirm.ui?.riskScore,
    agent: pendingToolConfirm.agent,
    pending_count: pendingToolConfirmCount
  }
}

export function buildToolConfirmationRequest(input: {
  pendingToolConfirm: Pick<ToolConfirmationRequest, 'toolCallId' | 'name' | 'ui' | 'args' | 'agent'> | null
  pendingToolConfirmCount: number
}): CommandConfirmationRequest | undefined {
  const {
    pendingToolConfirm,
    pendingToolConfirmCount
  } = input

  if (!pendingToolConfirm) {
    return undefined
  }

  if (pendingToolConfirm.name === 'execute_command') {
    return buildCommandConfirmationRequest(input)
  }

  const formattedArgs = formatToolArgs(pendingToolConfirm.args)
  const toolInvocation = formattedArgs
    ? `${pendingToolConfirm.name} ${formattedArgs}`
    : pendingToolConfirm.name

  return {
    command: toolInvocation,
    risk_level: pendingToolConfirm.ui?.riskLevel || 'risky',
    execution_reason: pendingToolConfirm.ui?.title || `${pendingToolConfirm.name} requires approval`,
    possible_risk: pendingToolConfirm.ui?.possibleRisk || pendingToolConfirm.ui?.reason || `Tool "${pendingToolConfirm.name}" can change local state.`,
    risk_score: pendingToolConfirm.ui?.riskScore,
    agent: pendingToolConfirm.agent,
    pending_count: pendingToolConfirmCount
  }
}
