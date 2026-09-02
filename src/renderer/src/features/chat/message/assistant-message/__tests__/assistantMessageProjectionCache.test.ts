import { describe, expect, it } from 'vitest'
import {
  mapAssistantMessage,
  type AssistantMessageMapperContext,
  type AssistantMessageSource
} from '../model/assistantMessageMapper'
import {
  mapAssistantMessageIncrementally,
  type AssistantMessageProjectionCache
} from '../model/assistantMessageProjectionCache'

const context: AssistantMessageMapperContext = {
  isLatest: true,
  isStreaming: true,
  providerDefinitions: [],
  accounts: []
}

const textSegment = (id: string, content: string, timestamp = 1): TextSegment => ({
  type: 'text',
  segmentId: id,
  content,
  timestamp
})

const reasoningSegment = (
  id: string,
  content: string,
  timestamp = 2
): ReasoningSegment => ({
  type: 'reasoning',
  segmentId: id,
  content,
  timestamp
})

const toolCallSegment = (args: {
  id: string
  status?: string
  timestamp?: number
}): ToolCallSegment => ({
  type: 'toolCall',
  segmentId: args.id,
  name: 'read',
  toolCallId: args.id,
  toolCallIndex: 0,
  isError: false,
  timestamp: args.timestamp ?? 3,
  content: {
    toolName: 'read',
    status: args.status ?? 'completed'
  }
})

const errorSegment = (id: string, timestamp = 4): ErrorSegment => ({
  type: 'error',
  segmentId: id,
  content: 'failed',
  error: {
    name: 'ToolError',
    message: 'Tool failed',
    timestamp
  }
})

const message = (segments: MessageSegment[], content = ''): ChatMessage => ({
  role: 'assistant',
  content,
  segments
})

function source(committedMessage: ChatMessage, previewMessage?: ChatMessage): AssistantMessageSource {
  return { committedMessage, previewMessage }
}

function project(
  nextSource: AssistantMessageSource,
  nextContext = context,
  previousCache?: AssistantMessageProjectionCache,
  identity = 1
): AssistantMessageProjectionCache {
  return mapAssistantMessageIncrementally(
    nextSource,
    nextContext,
    previousCache,
    identity
  )
}

function expectMatchesReference(
  cache: AssistantMessageProjectionCache,
  nextSource: AssistantMessageSource,
  nextContext = context
): void {
  expect(cache.renderState).toEqual(mapAssistantMessage(nextSource, nextContext))
}

describe('mapAssistantMessageIncrementally', () => {
  it('matches the complete mapper after appending to a 62-tool transcript and keeps the sealed prefix', () => {
    const tools = Array.from({ length: 62 }, (_, index) => toolCallSegment({
      id: `tool-${index}`
    }))
    const first = source(message([
      ...tools,
      textSegment('answer-1', 'answer')
    ], 'answer'))
    const second = source(message([
      ...tools,
      first.committedMessage.segments[62],
      textSegment('answer-2', ' more')
    ], 'answer more'))

    const firstCache = project(first)
    const secondCache = project(second, context, firstCache)

    expectMatchesReference(secondCache, second)
    expect(secondCache.renderState.transcript.supportUnits[0]).toBe(
      firstCache.renderState.transcript.supportUnits[0]
    )
    expect(secondCache.renderState.transcript.textItems[0]).toBe(
      firstCache.renderState.transcript.textItems[0]
    )
  })

  it('keeps completed work sealed while the first answer segment streams', () => {
    const tools = Array.from({ length: 62 }, (_, index) => toolCallSegment({
      id: `tool-${index}`
    }))
    const firstAnswer = textSegment('answer-1', 'answer')
    const first = source(message([
      ...tools,
      firstAnswer
    ], 'answer'))
    const second = source(message([
      ...tools,
      textSegment('answer-1', 'answer with more text')
    ], 'answer with more text'))

    const firstCache = project(first)
    const secondCache = project(second, context, firstCache)

    expectMatchesReference(secondCache, second)
    expect(secondCache.renderState.transcript.supportUnits[0]).toBe(
      firstCache.renderState.transcript.supportUnits[0]
    )
  })

  it('rebuilds the affected support tail when a tool changes status', () => {
    const first = source(message([
      reasoningSegment('reasoning-1', 'inspect'),
      toolCallSegment({ id: 'tool-1', status: 'completed' }),
      textSegment('answer-1', 'answer'),
      toolCallSegment({ id: 'tool-2', status: 'running' })
    ], 'answer'))
    const secondTool = toolCallSegment({ id: 'tool-2', status: 'failed' })
    const second = source(message([
      first.committedMessage.segments[0],
      first.committedMessage.segments[1],
      first.committedMessage.segments[2],
      secondTool
    ], 'answer'))

    const firstCache = project(first)
    const secondCache = project(second, context, firstCache)

    expectMatchesReference(secondCache, second)
    expect(secondCache.renderState.transcript.textItems[0]).toBe(
      firstCache.renderState.transcript.textItems[0]
    )
    expect(secondCache.renderState.transcript.supportUnits[0]).toBe(
      firstCache.renderState.transcript.supportUnits[0]
    )
  })

  it('matches the complete mapper when consecutive reasoning content changes', () => {
    const first = source(message([
      textSegment('context-1', 'context'),
      reasoningSegment('reasoning-1', 'inspect'),
      reasoningSegment('reasoning-2', 'compose'),
      textSegment('answer-1', 'answer')
    ], 'context answer'))
    const second = source(message([
      first.committedMessage.segments[0],
      first.committedMessage.segments[1],
      reasoningSegment('reasoning-2', 'compose and verify'),
      first.committedMessage.segments[3]
    ], 'context answer'))

    const secondCache = project(second, context, project(first))
    expectMatchesReference(secondCache, second)
  })

  it('matches the complete mapper when a new visible text boundary closes completed work', () => {
    const tools = Array.from({ length: 4 }, (_, index) => toolCallSegment({
      id: `tool-${index}`
    }))
    const first = source(message(tools))
    const second = source(message([
      ...tools,
      textSegment('answer-1', 'answer')
    ], 'answer'))

    const firstCache = project(first)
    const secondCache = project(second, context, firstCache)

    expectMatchesReference(secondCache, second)
    expect(secondCache.renderState.transcript.supportUnits[0]?.type).toBe('completedWork')
  })

  it('uses the complete mapper when transcript visibility changes', () => {
    const firstTool = toolCallSegment({ id: 'tool-1' })
    const first = source(message([
      firstTool,
      textSegment('answer-1', 'answer')
    ], 'answer'))
    const hiddenTool = {
      ...firstTool,
      presentation: {
        transcriptVisible: false
      }
    }
    const second = source(message([
      hiddenTool,
      first.committedMessage.segments[1]
    ], 'answer'))

    const firstCache = project(first)
    const secondCache = project(second, context, firstCache)

    expectMatchesReference(secondCache, second)
    expect(secondCache.renderState.transcript.supportItems).toHaveLength(0)
    expect(secondCache.renderState.transcript.textItems[0]).not.toBe(
      firstCache.renderState.transcript.textItems[0]
    )
  })

  it('matches grouping when an error remains a standalone support unit', () => {
    const first = source(message([
      reasoningSegment('reasoning-1', 'inspect'),
      errorSegment('error-1'),
      textSegment('answer-1', 'answer'),
      toolCallSegment({ id: 'tool-1', status: 'running' })
    ], 'answer'))
    const second = source(message([
      first.committedMessage.segments[0],
      first.committedMessage.segments[1],
      first.committedMessage.segments[2],
      toolCallSegment({ id: 'tool-1', status: 'completed' })
    ], 'answer'))

    const secondCache = project(second, context, project(first))
    expectMatchesReference(secondCache, second)
    expect(secondCache.renderState.transcript.supportUnits.map(unit => unit.type)).toEqual([
      'single',
      'single',
      'toolGroup'
    ])
  })

  it('falls back across preview-to-committed layer changes', () => {
    const previewSegments = [
      reasoningSegment('preview-reasoning', 'inspect'),
      textSegment('preview-answer', 'answer')
    ]
    const first = source(
      message([]),
      message(previewSegments, 'answer')
    )
    const second = source(
      message([
        reasoningSegment('committed-reasoning', 'inspect'),
        textSegment('committed-answer', 'answer')
      ], 'answer')
    )

    const firstCache = project(first)
    const secondCache = project(second, { ...context, isStreaming: false }, firstCache)

    expectMatchesReference(secondCache, second, { ...context, isStreaming: false })
    expect(secondCache.renderState.transcript.isOverlayPreview).toBe(false)
    expect(secondCache.renderState.transcript.textItems[0]).not.toBe(
      firstCache.renderState.transcript.textItems[0]
    )
  })

  it('falls back for deletion, replacement, and reorder transitions', () => {
    const first = source(message([
      reasoningSegment('reasoning-1', 'inspect'),
      textSegment('answer-1', 'answer'),
      toolCallSegment({ id: 'tool-1' }),
      toolCallSegment({ id: 'tool-2' })
    ], 'answer'))
    const firstCache = project(first)

    const deletion = source(message([
      first.committedMessage.segments[0],
      first.committedMessage.segments[1],
      first.committedMessage.segments[2]
    ], 'answer'))
    const replacement = source(message([
      first.committedMessage.segments[0],
      textSegment('replacement', 'answer'),
      first.committedMessage.segments[2],
      first.committedMessage.segments[3]
    ], 'answer'))
    const reorder = source(message([
      first.committedMessage.segments[0],
      first.committedMessage.segments[1],
      first.committedMessage.segments[3],
      first.committedMessage.segments[2]
    ], 'answer'))

    for (const next of [deletion, replacement, reorder]) {
      const nextCache = project(next, context, firstCache)
      expectMatchesReference(nextCache, next)
      expect(nextCache.renderState.transcript.textItems[0]).not.toBe(
        firstCache.renderState.transcript.textItems[0]
      )
    }
  })

  it('updates provider headers while reusing the transcript projection', () => {
    const firstContext: AssistantMessageMapperContext = {
      ...context,
      providerDefinitions: [{ id: 'openai', iconKey: 'openai' } as ProviderDefinition],
      accounts: [{ id: 'account-1', providerId: 'openai' } as ProviderAccount]
    }
    const secondContext: AssistantMessageMapperContext = {
      ...firstContext,
      providerDefinitions: [{ id: 'anthropic', iconKey: 'anthropic' } as ProviderDefinition],
      accounts: [{ id: 'account-1', providerId: 'anthropic' } as ProviderAccount]
    }
    const first = source({
      ...message([textSegment('answer-1', 'answer')], 'answer'),
      model: 'claude',
      modelRef: {
        accountId: 'account-1',
        modelId: 'claude'
      }
    })
    const second = source({
      ...first.committedMessage,
      model: 'claude'
    })

    const firstCache = project(first, firstContext)
    const secondCache = project(second, secondContext, firstCache)

    expectMatchesReference(secondCache, second, secondContext)
    expect(secondCache.renderState.header.modelProvider).toBe('anthropic')
    expect(secondCache.renderState.transcript).toBe(
      firstCache.renderState.transcript
    )
  })

  it('falls back when streaming context changes and refreshes the tail marker', () => {
    const first = source(message([
      textSegment('answer-1', 'answer'),
      toolCallSegment({ id: 'tool-1', status: 'running' })
    ], 'answer'))
    const firstCache = project(first)
    const secondCache = project(
      first,
      { ...context, isStreaming: false },
      firstCache
    )

    expectMatchesReference(secondCache, first, { ...context, isStreaming: false })
    expect(secondCache.renderState.transcript.supportUnits[0]).not.toBe(
      firstCache.renderState.transcript.supportUnits[0]
    )
  })

  it('resets cache reuse when the message identity changes', () => {
    const first = source(message([textSegment('answer-1', 'first')], 'first'))
    const second = source(message([textSegment('answer-1', 'second')], 'second'))
    const firstCache = project(first, context, undefined, 1)
    const secondCache = project(second, context, firstCache, 2)

    expectMatchesReference(secondCache, second)
    expect(secondCache.renderState.transcript.textItems[0]).not.toBe(
      firstCache.renderState.transcript.textItems[0]
    )
  })
})
