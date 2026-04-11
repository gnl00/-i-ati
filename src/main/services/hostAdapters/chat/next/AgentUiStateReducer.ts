import type { AgentEvent } from '@main/services/next/events/AgentEvent'
import type { AgentStep } from '@main/services/next/step/AgentStep'
import type { ToolResultFact } from '@main/services/next/tools/ToolResultFact'
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

const serializeTextBlocks = (blocks: AgentUiContentBlockState[]): string => {
  return blocks
    .filter((block): block is AgentUiTextBlockState => block.kind === 'text')
    .map(block => block.content.trim())
    .filter(Boolean)
    .join('\n\n')
}

const upsertTextBlock = (
  blocks: AgentUiContentBlockState[],
  stepId: string | undefined,
  content: string
): AgentUiContentBlockState[] => {
  if (!stepId || !content.trim()) {
    return blocks
  }

  const nextBlocks = [...blocks]
  const index = nextBlocks.findIndex((block) => block.kind === 'text' && block.stepId === stepId)
  const nextBlock: AgentUiTextBlockState = {
    kind: 'text',
    stepId,
    content
  }

  if (index >= 0) {
    nextBlocks[index] = nextBlock
    return nextBlocks
  }

  const lastBlock = nextBlocks[nextBlocks.length - 1]
  if (lastBlock?.kind === 'text' && lastBlock.content === content) {
    return nextBlocks
  }

  nextBlocks.push(nextBlock)
  return nextBlocks
}

const upsertReasoningBlock = (
  blocks: AgentUiContentBlockState[],
  stepId: string | undefined,
  reasoning: string | undefined
): AgentUiContentBlockState[] => {
  if (!stepId || !reasoning?.trim()) {
    return blocks
  }

  const nextBlocks = [...blocks]
  const index = nextBlocks.findIndex((block) => block.kind === 'reasoning' && block.stepId === stepId)
  const nextBlock: AgentUiReasoningBlockState = {
    kind: 'reasoning',
    stepId,
    content: reasoning
  }

  if (index >= 0) {
    nextBlocks[index] = nextBlock
    return nextBlocks
  }

  const lastBlock = nextBlocks[nextBlocks.length - 1]
  if (lastBlock?.kind === 'reasoning' && lastBlock.content === reasoning) {
    return nextBlocks
  }

  nextBlocks.push(nextBlock)
  return nextBlocks
}

const upsertToolCallBlock = (
  blocks: AgentUiContentBlockState[],
  stepId: string | undefined,
  toolCallId: string
): AgentUiContentBlockState[] => {
  if (!stepId) {
    return blocks
  }

  const exists = blocks.some((block) => (
    block.kind === 'toolCall' && block.toolCallId === toolCallId
  ))
  if (exists) {
    return blocks
  }

  return [
    ...blocks,
    {
      kind: 'toolCall',
      stepId,
      toolCallId
    } satisfies AgentUiToolCallBlockState
  ]
}

const ensureCommittedBlocksForStep = (
  blocks: AgentUiContentBlockState[],
  step: AgentStep
): AgentUiContentBlockState[] => {
  let nextBlocks = [...blocks]
  if (step.reasoning?.trim()) {
    nextBlocks = upsertReasoningBlock(nextBlocks, step.stepId, step.reasoning)
  }
  if (step.content.trim()) {
    nextBlocks = upsertTextBlock(nextBlocks, step.stepId, step.content)
  }
  for (const toolCall of step.toolCalls) {
    nextBlocks = upsertToolCallBlock(nextBlocks, step.stepId, toolCall.id)
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
      previewContentBlocks = upsertTextBlock(
        previewContentBlocks,
        event.stepId,
        event.snapshot.content
      )
    }

    if (event.delta.type === 'reasoning_delta') {
      previewContentBlocks = upsertReasoningBlock(
        previewContentBlocks,
        event.stepId,
        event.snapshot.reasoning
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
      previewContentBlocks = upsertToolCallBlock(
        previewContentBlocks,
        event.stepId,
        delta.toolCallId
      )
    }

    if (event.delta.type === 'tool_call_ready') {
      previewContentBlocks = upsertToolCallBlock(
        previewContentBlocks,
        event.stepId,
        event.delta.toolCall.id
      )
    }

    const snapshotToolCalls = event.snapshot.toolCalls.map((toolCall) => {
      const existing = previewToolCalls.find(call => call.toolCallId === toolCall.id)
      return toToolCallState(toolCall, existing)
    })
    for (const toolCall of event.snapshot.toolCalls) {
      previewContentBlocks = upsertToolCallBlock(
        previewContentBlocks,
        event.stepId,
        toolCall.id
      )
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
        ...this.state.preview.contentBlocks.map(cloneContentBlock)
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
        content: serializeTextBlocks(committedContentBlocks),
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
