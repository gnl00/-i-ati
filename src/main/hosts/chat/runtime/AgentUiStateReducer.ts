import type { AgentEvent } from '@main/agent/runtime/events/AgentEvent'
import type { AgentStep } from '@main/agent/runtime/step/AgentStep'
import type { ToolResultFact } from '@main/agent/runtime/tools/ToolResultFact'
import type {
  AgentUiContentBlockState,
  AgentUiMessageState,
  AgentUiReasoningBlockState,
  AgentUiState,
  AgentUiTextBlockState,
  AgentUiToolCallBlockState,
  AgentUiToolCallState,
  AgentUiToolCallStatus
} from './AgentUiState'

const toToolCallState = (
  toolCall: IToolCall,
  existing?: AgentUiToolCallState
): AgentUiToolCallState => ({
  toolCallId: toolCall.id,
  toolCallIndex: toolCall.index,
  name: toolCall.function.name,
  args: toolCall.function.arguments,
  appearanceOrder: existing?.appearanceOrder,
  cost: existing?.cost,
  status: existing?.status ?? 'pending',
  result: existing?.result,
  error: existing?.error
})

const toToolResultStatus = (result: ToolResultFact): AgentUiToolCallStatus => {
  if (result.status === 'success') return 'success'
  if (result.status === 'aborted' || result.status === 'denied') return 'aborted'
  return 'failed'
}

const mergeToolCalls = (
  base: AgentUiToolCallState[],
  next: AgentUiToolCallState[]
): AgentUiToolCallState[] => {
  const merged = new Map<string, AgentUiToolCallState>()
  const order: string[] = []

  const push = (call: AgentUiToolCallState) => {
    if (!merged.has(call.toolCallId)) {
      order.push(call.toolCallId)
    }
    merged.set(call.toolCallId, {
      ...merged.get(call.toolCallId),
      ...call
    })
  }

  for (const call of base) push(call)
  for (const call of next) push(call)

  return order
    .map(id => merged.get(id)!)
    .sort((a, b) => {
      const aOrder = a.appearanceOrder ?? Number.MAX_SAFE_INTEGER
      const bOrder = b.appearanceOrder ?? Number.MAX_SAFE_INTEGER
      if (aOrder !== bOrder) return aOrder - bOrder
      const aIndex = a.toolCallIndex ?? Number.MAX_SAFE_INTEGER
      const bIndex = b.toolCallIndex ?? Number.MAX_SAFE_INTEGER
      if (aIndex !== bIndex) return aIndex - bIndex
      return a.toolCallId.localeCompare(b.toolCallId)
    })
}

const emptyMessageState = (): AgentUiMessageState => ({
  stepId: undefined,
  content: '',
  contentBlocks: [],
  toolCalls: []
})

const cloneContentBlock = (
  block: AgentUiContentBlockState
): AgentUiContentBlockState => ({ ...block })

const appendCommittedContent = (existingContent: string, stepContent: string): string => {
  const normalizedStepContent = stepContent.trim()
  if (!normalizedStepContent) {
    return existingContent
  }

  if (!existingContent.trim()) {
    return normalizedStepContent
  }

  return `${existingContent}\n\n${normalizedStepContent}`
}

const closeLastOpenStepBlock = (
  blocks: AgentUiContentBlockState[],
  stepId: string | undefined,
  endedAt: number
): AgentUiContentBlockState[] => {
  if (!stepId) {
    return blocks
  }

  const nextBlocks = [...blocks]
  for (let index = nextBlocks.length - 1; index >= 0; index -= 1) {
    const block = nextBlocks[index]
    if (block.stepId !== stepId || typeof block.endedAt === 'number') {
      continue
    }

    nextBlocks[index] = {
      ...block,
      endedAt: Math.max(block.startedAt, endedAt)
    }
    return nextBlocks
  }

  return nextBlocks
}

const getNextBlockOrdinal = (
  blocks: AgentUiContentBlockState[],
  stepId: string,
  kind: AgentUiContentBlockState['kind']
): number => {
  return blocks.filter((block) => block.stepId === stepId && block.kind === kind).length
}

const createTextBlock = (
  blocks: AgentUiContentBlockState[],
  stepId: string,
  content: string,
  timestamp: number,
  endedAt?: number
): AgentUiTextBlockState => ({
  blockId: `${stepId}:text:${getNextBlockOrdinal(blocks, stepId, 'text')}`,
  kind: 'text',
  stepId,
  content,
  startedAt: timestamp,
  ...(typeof endedAt === 'number' ? { endedAt } : {})
})

const createReasoningBlock = (
  blocks: AgentUiContentBlockState[],
  stepId: string,
  content: string,
  timestamp: number,
  endedAt?: number
): AgentUiReasoningBlockState => ({
  blockId: `${stepId}:reasoning:${getNextBlockOrdinal(blocks, stepId, 'reasoning')}`,
  kind: 'reasoning',
  stepId,
  content,
  startedAt: timestamp,
  ...(typeof endedAt === 'number' ? { endedAt } : {})
})

const createToolCallBlock = (
  stepId: string,
  toolCallId: string,
  timestamp: number,
  endedAt?: number
): AgentUiToolCallBlockState => ({
  blockId: `${stepId}:tool:${toolCallId}`,
  kind: 'toolCall',
  stepId,
  toolCallId,
  startedAt: timestamp,
  ...(typeof endedAt === 'number' ? { endedAt } : {})
})

const appendTextDeltaBlock = (
  blocks: AgentUiContentBlockState[],
  stepId: string | undefined,
  contentDelta: string,
  timestamp: number
): AgentUiContentBlockState[] => {
  if (!stepId || contentDelta.length === 0) {
    return blocks
  }

  const nextBlocks = [...blocks]
  const lastBlock = nextBlocks[nextBlocks.length - 1]
  if (lastBlock?.kind === 'text' && lastBlock.stepId === stepId && typeof lastBlock.endedAt !== 'number') {
    nextBlocks[nextBlocks.length - 1] = {
      ...lastBlock,
      content: `${lastBlock.content}${contentDelta}`
    }
    return nextBlocks
  }

  return [
    ...closeLastOpenStepBlock(nextBlocks, stepId, timestamp),
    createTextBlock(nextBlocks, stepId, contentDelta, timestamp)
  ]
}

const appendReasoningDeltaBlock = (
  blocks: AgentUiContentBlockState[],
  stepId: string | undefined,
  reasoningDelta: string,
  timestamp: number
): AgentUiContentBlockState[] => {
  if (!stepId || reasoningDelta.length === 0) {
    return blocks
  }

  const nextBlocks = [...blocks]
  const lastBlock = nextBlocks[nextBlocks.length - 1]
  if (lastBlock?.kind === 'reasoning' && lastBlock.stepId === stepId && typeof lastBlock.endedAt !== 'number') {
    nextBlocks[nextBlocks.length - 1] = {
      ...lastBlock,
      content: `${lastBlock.content}${reasoningDelta}`
    }
    return nextBlocks
  }

  return [
    ...closeLastOpenStepBlock(nextBlocks, stepId, timestamp),
    createReasoningBlock(nextBlocks, stepId, reasoningDelta, timestamp)
  ]
}

const openToolCallBlock = (
  blocks: AgentUiContentBlockState[],
  stepId: string | undefined,
  toolCallId: string,
  timestamp: number
): AgentUiContentBlockState[] => {
  if (!stepId) {
    return blocks
  }

  const nextBlocks = [...blocks]
  const lastBlock = nextBlocks[nextBlocks.length - 1]
  if (
    lastBlock?.kind === 'toolCall'
    && lastBlock.stepId === stepId
    && lastBlock.toolCallId === toolCallId
    && typeof lastBlock.endedAt !== 'number'
  ) {
    return nextBlocks
  }

  return [
    ...closeLastOpenStepBlock(nextBlocks, stepId, timestamp),
    createToolCallBlock(stepId, toolCallId, timestamp)
  ]
}

const finalizeStepBlocks = (
  blocks: AgentUiContentBlockState[],
  stepId: string | undefined,
  endedAt: number
): AgentUiContentBlockState[] => {
  return closeLastOpenStepBlock(blocks, stepId, endedAt)
}

const ensureCommittedBlocksForStep = (
  blocks: AgentUiContentBlockState[],
  step: AgentStep
): AgentUiContentBlockState[] => {
  let nextBlocks = finalizeStepBlocks(blocks, step.stepId, step.completedAt)

  const hasReasoningBlock = nextBlocks.some((block) => (
    block.kind === 'reasoning' && block.stepId === step.stepId
  ))
  if (!hasReasoningBlock && step.reasoning?.trim()) {
    nextBlocks = [
      ...nextBlocks,
      createReasoningBlock(nextBlocks, step.stepId, step.reasoning, step.startedAt, step.completedAt)
    ]
  }

  const hasTextBlock = nextBlocks.some((block) => (
    block.kind === 'text' && block.stepId === step.stepId
  ))
  if (!hasTextBlock && step.content.trim()) {
    nextBlocks = [
      ...nextBlocks,
      createTextBlock(nextBlocks, step.stepId, step.content, step.startedAt, step.completedAt)
    ]
  }

  for (const toolCall of step.toolCalls) {
    const hasToolCallBlock = nextBlocks.some((block) => (
      block.kind === 'toolCall' && block.stepId === step.stepId && block.toolCallId === toolCall.id
    ))
    if (!hasToolCallBlock) {
      nextBlocks = [
        ...nextBlocks,
        createToolCallBlock(step.stepId, toolCall.id, step.completedAt)
      ]
    }
  }
  return nextBlocks
}

export class AgentUiStateReducer {
  private nextToolCallAppearanceOrder = 0

  private state: AgentUiState = {
    committed: emptyMessageState(),
    preview: null,
    lastUsage: undefined
  }

  apply(event: AgentEvent): AgentUiState {
    switch (event.type) {
      case 'step.started':
        this.state = {
          ...this.state,
          preview: emptyMessageState()
        }
        return this.snapshot()
      case 'step.delta':
        this.applyStepDelta(event)
        return this.snapshot()
      case 'step.completed':
        this.commitStep(event.step)
        return this.snapshot()
      case 'step.failed':
        this.commitStep(event.step)
        return this.snapshot()
      case 'step.aborted':
        this.commitStep(event.step)
        return this.snapshot()
      case 'tool.awaiting_confirmation':
        this.updateToolCall(event.toolCallId, {
          toolCallId: event.toolCallId,
          toolCallIndex: event.toolCallIndex,
          name: event.toolName,
          status: 'pending'
        })
        return this.snapshot()
      case 'tool.confirmation_denied':
        this.applyToolResult(event.deniedResult)
        return this.snapshot()
      case 'tool.execution_progress':
        if (event.phase === 'started') {
          this.updateToolCall(event.toolCallId, {
            toolCallId: event.toolCallId,
            toolCallIndex: event.toolCallIndex,
            name: event.toolName,
            status: 'running'
          })
          return this.snapshot()
        }
        this.applyToolResult(event.result)
        return this.snapshot()
      case 'loop.completed':
      case 'loop.failed':
      case 'loop.aborted':
        this.state = {
          ...this.state,
          preview: null
        }
        return this.snapshot()
    }
  }

  snapshot(): AgentUiState {
    return {
      committed: {
        ...this.state.committed,
        contentBlocks: this.state.committed.contentBlocks.map(cloneContentBlock),
        toolCalls: [...this.state.committed.toolCalls]
      },
      preview: this.state.preview
        ? {
            ...this.state.preview,
            contentBlocks: this.state.preview.contentBlocks.map(cloneContentBlock),
            toolCalls: [...this.state.preview.toolCalls]
          }
        : null,
      lastUsage: this.state.lastUsage
    }
  }

  private applyStepDelta(event: Extract<AgentEvent, { type: 'step.delta' }>): void {
    if (event.delta.type === 'usage_delta') {
      this.state = {
        ...this.state,
        lastUsage: event.delta.usage
      }
    }

    const preview = this.state.preview ?? emptyMessageState()
    let previewToolCalls = [...preview.toolCalls]
    let previewContentBlocks = [...preview.contentBlocks]

    if (event.delta.type === 'content_delta') {
      previewContentBlocks = appendTextDeltaBlock(
        previewContentBlocks,
        event.stepId,
        event.delta.content,
        event.timestamp
      )
    }

    if (event.delta.type === 'reasoning_delta') {
      previewContentBlocks = appendReasoningDeltaBlock(
        previewContentBlocks,
        event.stepId,
        event.delta.reasoning,
        event.timestamp
      )
    }

    if (event.delta.type === 'tool_call_started') {
      const delta = event.delta
      const existing = previewToolCalls.find(call => call.toolCallId === delta.toolCallId)
      previewToolCalls = mergeToolCalls(previewToolCalls, [{
        ...this.withAppearanceOrder({
          toolCallId: delta.toolCallId,
          toolCallIndex: delta.toolCallIndex,
          name: delta.toolName,
          status: 'pending'
        }, existing)
      }])
      previewContentBlocks = openToolCallBlock(
        previewContentBlocks,
        event.stepId,
        delta.toolCallId,
        event.timestamp
      )
    }

    if (event.delta.type === 'tool_call_ready') {
      previewContentBlocks = openToolCallBlock(
        previewContentBlocks,
        event.stepId,
        event.delta.toolCall.id,
        event.timestamp
      )
    }

    const snapshotToolCalls = event.snapshot.toolCalls.map((toolCall) => {
      const existing = previewToolCalls.find(call => call.toolCallId === toolCall.id)
      return toToolCallState(toolCall, existing)
    })
    for (const toolCall of event.snapshot.toolCalls) {
      const hasToolCallBlock = previewContentBlocks.some((block) => (
        block.kind === 'toolCall' && block.stepId === event.stepId && block.toolCallId === toolCall.id
      ))
      if (!hasToolCallBlock) {
        previewContentBlocks = openToolCallBlock(
          previewContentBlocks,
          event.stepId,
          toolCall.id,
          event.timestamp
        )
      }
    }

    this.state = {
      ...this.state,
      preview: {
        stepId: event.stepId,
        content: event.snapshot.content,
        contentBlocks: previewContentBlocks,
        toolCalls: mergeToolCalls(previewToolCalls, snapshotToolCalls)
      }
    }
  }

  private commitStep(step: AgentStep): void {
    let committedContentBlocks = this.state.committed.contentBlocks
    if (this.state.preview?.stepId === step.stepId) {
      committedContentBlocks = [
        ...committedContentBlocks,
        ...finalizeStepBlocks(this.state.preview.contentBlocks, step.stepId, step.completedAt)
          .map(cloneContentBlock)
      ]
    }
    committedContentBlocks = ensureCommittedBlocksForStep(committedContentBlocks, step)
    const mergedToolCalls = mergeToolCalls(
      this.state.committed.toolCalls,
      step.toolCalls.map(toolCall => {
        const existing =
          this.state.committed.toolCalls.find(call => call.toolCallId === toolCall.id)
          || this.state.preview?.toolCalls.find(call => call.toolCallId === toolCall.id)
        return this.withAppearanceOrder(toToolCallState(toolCall, existing), existing)
      })
    )

    this.state = {
      committed: {
        stepId: step.stepId,
        content: appendCommittedContent(this.state.committed.content, step.content),
        contentBlocks: committedContentBlocks,
        toolCalls: mergedToolCalls,
        failure: step.status === 'failed'
          ? step.failure
          : step.status === 'aborted'
            ? { message: step.abortReason }
            : undefined
      },
      preview: null,
      lastUsage: step.usage ?? this.state.lastUsage
    }
  }

  private applyToolResult(result: ToolResultFact): void {
    this.updateToolCall(result.toolCallId, {
      toolCallId: result.toolCallId,
      toolCallIndex: result.toolCallIndex,
      name: result.toolName,
      status: toToolResultStatus(result),
      cost: result.cost,
      result: result.content,
      error: result.error?.message
    })
  }

  private updateToolCall(toolCallId: string, next: AgentUiToolCallState): void {
    const updateMessage = (message: AgentUiMessageState): AgentUiMessageState => {
      const existing = message.toolCalls.find(call => call.toolCallId === toolCallId)
      return {
        ...message,
        toolCalls: mergeToolCalls(message.toolCalls, [{
          ...this.withAppearanceOrder({
            ...existing,
            ...next
          }, existing)
        }])
      }
    }

    this.state = {
      ...this.state,
      committed: updateMessage(this.state.committed),
      preview: this.state.preview ? updateMessage(this.state.preview) : null
    }
  }

  private withAppearanceOrder(
    next: AgentUiToolCallState,
    existing?: AgentUiToolCallState
  ): AgentUiToolCallState {
    if (existing?.appearanceOrder !== undefined) {
      return {
        ...next,
        appearanceOrder: existing.appearanceOrder
      }
    }

    if (next.appearanceOrder !== undefined) {
      return next
    }

    return {
      ...next,
      appearanceOrder: this.nextToolCallAppearanceOrder++
    }
  }
}
