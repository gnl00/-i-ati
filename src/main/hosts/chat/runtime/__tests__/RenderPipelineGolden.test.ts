import { describe, expect, it, vi } from 'vitest'
import type { AgentEvent } from '@main/agent/runtime/events/AgentEvent'
import { HostRenderEventMapper } from '@main/hosts/shared/render'
import { RUN_LIFECYCLE_EVENTS } from '@shared/run/lifecycle-events'
import { RUN_TOOL_EVENTS } from '@shared/run/tool-events'

/**
 * Golden end-to-end baseline for the render pipeline.
 *
 * 目的：
 * - 固定「AgentStepDraftDelta 序列 -> HostRenderEventMapper -> ChatRenderResponder」这条链路
 *   最终 emit 出的 host-facing 事件/patch 序列。
 * - 作为 P0（合并 HostRenderStateController 与 AgentRenderStateReducer）重构的安全网：
 *   重构只应改变内部 state 层数，不应改变这里断言的可观测 emit 序列。
 *
 * 这条测试刻意跑「真实的」HostRenderEventMapper + ChatRenderResponder，
 * 只 mock 掉最外层的 ChatEventMapper（IPC 出口）和 ChatStepStore（持久化），
 * 复用 ChatRenderResponder.test.ts 已有的 mock 风格与 fixture。
 */

const emittedEvents: Array<{ channel: string; payload: any }> = []

vi.mock('../../mapping/ChatEventMapper', () => ({
  ChatEventMapper: class {
    emitStreamPreviewUpdated = vi.fn((message: MessageEntity) => {
      emittedEvents.push({ channel: 'preview.updated', payload: message })
    })
    emitStreamPreviewSegmentUpdated = vi.fn((_target: unknown, patch: unknown) => {
      emittedEvents.push({ channel: 'preview.segment', payload: patch })
    })
    emitStreamPreviewCleared = vi.fn(() => {
      emittedEvents.push({ channel: 'preview.cleared', payload: undefined })
    })
    emitToolResultAttached = vi.fn((toolCallId: string) => {
      emittedEvents.push({ channel: 'tool.result.attached', payload: { toolCallId } })
    })
    emitMessageCreated = vi.fn((message: MessageEntity) => {
      emittedEvents.push({ channel: 'message.created', payload: message })
    })
    emitMessageUpdated = vi.fn((message: MessageEntity) => {
      emittedEvents.push({ channel: 'message.updated', payload: message })
    })
    emitMessageSegmentUpdated = vi.fn()
  }
}))

vi.mock('../../persistence/ChatStepStore', () => ({
  ChatStepStore: class {
    persistAssistantMessage = vi.fn((message: MessageEntity) => message)
    persistToolResultMessage = vi.fn((body: ChatMessage, chatId?: number, chatUuid?: string) => ({
      id: 900,
      chatId,
      chatUuid,
      body
    }))
  }
}))

import { ChatRenderResponder } from '../ChatRenderResponder'

const createResponder = () => {
  const runEvents: Array<{ channel: string; payload: any }> = []
  const emitter = {
    emit: vi.fn((channel: string, payload: any) => {
      runEvents.push({ channel, payload })
    })
  } as any

  const placeholder: MessageEntity = {
    id: 101,
    chatId: 1,
    chatUuid: 'chat-1',
    body: {
      role: 'assistant',
      content: '',
      segments: []
    }
  }

  const responder = new ChatRenderResponder(emitter, [placeholder], placeholder)
  return { responder, runEvents }
}

const dispatch = async (
  responder: ChatRenderResponder,
  mapper: HostRenderEventMapper,
  event: AgentEvent
): Promise<void> => {
  responder.connectRenderStateSource(mapper)
  for (const hostEvent of mapper.map(event)) {
    await responder.handle(hostEvent)
  }
}

describe('render pipeline golden baseline', () => {
  it('produces a stable emit sequence for a reasoning + text + tool-call step', async () => {
    emittedEvents.length = 0
    const { responder, runEvents } = createResponder()
    const mapper = new HostRenderEventMapper()

    // 1. step 开始
    await dispatch(responder, mapper, {
      type: 'step.started',
      stepId: 'step-1',
      stepIndex: 0,
      timestamp: 100
    })

    // 2. reasoning delta（首个 reasoning block）
    await dispatch(responder, mapper, {
      type: 'step.delta',
      stepId: 'step-1',
      stepIndex: 0,
      timestamp: 101,
      delta: { type: 'reasoning_delta', timestamp: 101, reasoning: 'think-a' },
      snapshot: { content: '', reasoning: 'think-a', toolCalls: [] }
    } as AgentEvent)

    // 3. reasoning delta 追加（同一 block，应走 segment patch 优化路径）
    await dispatch(responder, mapper, {
      type: 'step.delta',
      stepId: 'step-1',
      stepIndex: 0,
      timestamp: 102,
      delta: { type: 'reasoning_delta', timestamp: 102, reasoning: 'think-b' },
      snapshot: { content: '', reasoning: 'think-athink-b', toolCalls: [] }
    } as AgentEvent)

    // 4. content delta（首个 text block，reasoning block 收口 -> full preview）
    await dispatch(responder, mapper, {
      type: 'step.delta',
      stepId: 'step-1',
      stepIndex: 0,
      timestamp: 110,
      delta: { type: 'content_delta', timestamp: 110, content: 'Hel' },
      snapshot: { content: 'Hel', reasoning: 'think-athink-b', toolCalls: [] }
    } as AgentEvent)

    // 5. content delta 追加（同一 text block，应走 text segment patch 优化路径）
    await dispatch(responder, mapper, {
      type: 'step.delta',
      stepId: 'step-1',
      stepIndex: 0,
      timestamp: 111,
      delta: { type: 'content_delta', timestamp: 111, content: 'lo' },
      snapshot: { content: 'Hello', reasoning: 'think-athink-b', toolCalls: [] }
    } as AgentEvent)

    // 6. tool_call_ready（tool 出现 -> full preview + tool.call.detected run event）
    await dispatch(responder, mapper, {
      type: 'step.delta',
      stepId: 'step-1',
      stepIndex: 0,
      timestamp: 120,
      delta: {
        type: 'tool_call_ready',
        timestamp: 120,
        toolCall: {
          id: 'tool-1',
          type: 'function',
          function: { name: 'read', arguments: '{"path":"README.md"}' },
          index: 0
        }
      },
      snapshot: {
        content: 'Hello',
        reasoning: 'think-athink-b',
        toolCalls: [{
          id: 'tool-1',
          type: 'function',
          function: { name: 'read', arguments: '{"path":"README.md"}' },
          index: 0
        }]
      }
    } as AgentEvent)

    // 7. step 完成（preview 清空 + committed 提交）
    await dispatch(responder, mapper, {
      type: 'step.completed',
      timestamp: 130,
      step: {
        status: 'completed',
        stepId: 'step-1',
        stepIndex: 0,
        startedAt: 100,
        completedAt: 130,
        content: 'Hello',
        reasoning: 'think-athink-b',
        toolCalls: [{
          id: 'tool-1',
          type: 'function',
          function: { name: 'read', arguments: '{"path":"README.md"}' },
          index: 0
        }],
        finishReason: 'tool_calls'
      }
    })

    // 8. tool 执行开始
    await dispatch(responder, mapper, {
      type: 'tool.execution_progress',
      phase: 'started',
      stepId: 'step-1',
      timestamp: 140,
      toolCallId: 'tool-1',
      toolCallIndex: 0,
      toolName: 'read'
    })

    // 9. tool 执行完成
    await dispatch(responder, mapper, {
      type: 'tool.execution_progress',
      phase: 'completed',
      timestamp: 150,
      result: {
        status: 'success',
        stepId: 'step-1',
        toolCallId: 'tool-1',
        toolCallIndex: 0,
        toolName: 'read',
        content: 'file content'
      }
    })

    // 10. 后续 step：补一段最终文本，step 完成，loop 完成
    await dispatch(responder, mapper, {
      type: 'step.completed',
      timestamp: 170,
      step: {
        status: 'completed',
        stepId: 'step-2',
        stepIndex: 1,
        startedAt: 160,
        completedAt: 170,
        content: 'Done.',
        toolCalls: [],
        finishReason: 'stop'
      }
    })

    await dispatch(responder, mapper, {
      type: 'loop.completed',
      timestamp: 180,
      result: {} as any
    } as AgentEvent)

    // --- 断言 1: IPC 出口 emit 的 channel 序列（增量语义 + 收尾顺序） ---
    const channelSequence = emittedEvents.map(entry => entry.channel)
    expect(channelSequence).toEqual([
      'preview.updated', // reasoning-a: 首个 block -> full preview
      'preview.segment', // reasoning-b: 同 block 追加 -> segment patch
      'preview.updated', // content 'Hel': reasoning 收口，新 text block -> full preview
      'preview.segment', // content 'lo': 同 text block 追加 -> segment patch
      'preview.updated', // tool_call_ready: tool 出现 -> full preview
      'preview.cleared', // step.completed
      'message.updated', // committed step-1
      'message.updated', // tool.execution started (running)
      'message.updated', // tool result committed (success) -> host.committed.updated precedes result attach
      'tool.result.attached', // tool result persisted as tool message
      'preview.cleared', // step-2.completed
      'message.updated', // committed step-2 (final text appended)
      'preview.cleared' // loop.completed
    ])

    // --- 断言 2: run event 出口（lifecycle + tool run events）序列 ---
    const runChannelSequence = runEvents.map(entry => entry.channel)
    expect(runChannelSequence).toEqual([
      RUN_LIFECYCLE_EVENTS.RUN_STATE_CHANGED, // step.started -> streaming
      RUN_TOOL_EVENTS.TOOL_CALL_DETECTED, // tool_call_ready
      RUN_LIFECYCLE_EVENTS.RUN_STATE_CHANGED, // tool exec started -> executing_tools
      RUN_TOOL_EVENTS.TOOL_EXECUTION_STARTED,
      RUN_TOOL_EVENTS.TOOL_EXECUTION_COMPLETED,
      RUN_LIFECYCLE_EVENTS.RUN_STATE_CHANGED // loop.completed -> completed
    ])

    // --- 断言 3: reasoning/text segment patch 携带正确的增量内容与稳定 segmentId ---
    const reasoningPatch = emittedEvents[1].payload as {
      segment: { segmentId: string; content: string }
    }
    expect(reasoningPatch.segment.segmentId).toBe('preview:step-1:reasoning:0')
    expect(reasoningPatch.segment.content).toBe('think-athink-b')

    const textPatch = emittedEvents[3].payload as {
      segment: { segmentId: string; content: string }
      content?: string
    }
    expect(textPatch.segment.segmentId).toBe('preview:step-1:text:0')
    expect(textPatch.segment.content).toBe('Hello')
    expect(textPatch.content).toBe('Hello')

    // --- 断言 4: tool.call.detected 携带完整 args ---
    const toolDetected = runEvents.find(
      entry => entry.channel === RUN_TOOL_EVENTS.TOOL_CALL_DETECTED
    )
    expect(toolDetected?.payload.toolCall).toEqual(
      expect.objectContaining({
        id: 'tool-1',
        name: 'read',
        args: '{"path":"README.md"}',
        status: 'pending'
      })
    )

    // --- 断言 5: 最终 committed message 的稳定形态（收尾正确） ---
    const finalBody = responder.getFinalAssistantMessage().body
    expect(finalBody.content).toBe('Hello\n\nDone.')
    expect(finalBody.segments).toEqual([
      expect.objectContaining({
        type: 'reasoning',
        segmentId: 'committed:step-1:reasoning:0',
        content: 'think-athink-b'
      }),
      expect.objectContaining({
        type: 'text',
        segmentId: 'committed:step-1:text:0',
        content: 'Hello'
      }),
      expect.objectContaining({
        type: 'toolCall',
        segmentId: 'committed:step-1:tool:tool-1',
        toolCallId: 'tool-1',
        content: expect.objectContaining({ status: 'success', result: 'file content' })
      }),
      expect.objectContaining({
        type: 'text',
        segmentId: 'committed:step-2:text:0',
        content: 'Done.'
      })
    ])
    expect(finalBody.toolCalls?.[0]?.function.arguments).toBe('{"path":"README.md"}')
  })

  // --- 盲区补强：只新增断言，不改上面的黄金基线 ---

  it('emits a redundant text segment patch on a usage-only delta over an open text block', async () => {
    // review 指出的现状行为：usage_delta 到达时若有 open text block，
    // computePreviewEffect 仍判为 text_append -> 发一次内容无变化的 segment patch。
    // 这里锁「现状」（不趁机改它）。
    emittedEvents.length = 0
    const { responder } = createResponder()
    const mapper = new HostRenderEventMapper()

    await dispatch(responder, mapper, {
      type: 'step.started',
      stepId: 'step-1',
      stepIndex: 0,
      timestamp: 100
    })

    // 首个 text block -> full preview
    await dispatch(responder, mapper, {
      type: 'step.delta',
      stepId: 'step-1',
      stepIndex: 0,
      timestamp: 101,
      delta: { type: 'content_delta', timestamp: 101, content: 'Hello' },
      snapshot: { content: 'Hello', reasoning: '', toolCalls: [] }
    } as AgentEvent)

    // usage-only delta：blocks 不变 -> 现状为 text_append -> segment patch
    await dispatch(responder, mapper, {
      type: 'step.delta',
      stepId: 'step-1',
      stepIndex: 0,
      timestamp: 102,
      delta: {
        type: 'usage_delta',
        timestamp: 102,
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }
      },
      snapshot: {
        content: 'Hello',
        reasoning: '',
        toolCalls: [],
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }
      }
    } as AgentEvent)

    const channelSequence = emittedEvents.map(entry => entry.channel)
    expect(channelSequence).toEqual([
      'preview.updated', // content 'Hello': 首个 text block -> full preview
      'preview.segment' // usage-only delta: open text block -> 冗余 text segment patch（锁现状）
    ])

    // usage 被 responder fold 住（供 getLastUsage）
    expect(responder.getLastUsage()).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15
    })
  })

  it('drives the streaming tool_call_started path (openToolBlock without tool_call_ready)', async () => {
    // review 盲区：仅 args 增量的 tool_call_started（无 tool_call_ready）走 openToolBlock。
    emittedEvents.length = 0
    const { responder, runEvents } = createResponder()
    const mapper = new HostRenderEventMapper()

    await dispatch(responder, mapper, {
      type: 'step.started',
      stepId: 'step-1',
      stepIndex: 0,
      timestamp: 100
    })

    await dispatch(responder, mapper, {
      type: 'step.delta',
      stepId: 'step-1',
      stepIndex: 0,
      timestamp: 110,
      delta: {
        type: 'tool_call_started',
        timestamp: 110,
        toolCallId: 'tool-1',
        toolCallIndex: 0,
        toolName: 'execute_command'
      },
      snapshot: { content: '', reasoning: '', toolCalls: [] }
    } as AgentEvent)

    const channelSequence = emittedEvents.map(entry => entry.channel)
    // tool block 首次出现 -> full preview（replace）。tool_call_started 不发 tool.detected。
    expect(channelSequence).toEqual(['preview.updated'])

    // openToolBlock 已经建出 tool block（preview 里含该 tool 段）
    const previewMessage = emittedEvents[0].payload as MessageEntity
    const toolSegment = previewMessage.body.segments.find(
      (segment: any) => segment.type === 'toolCall'
    ) as any
    expect(toolSegment?.toolCallId).toBe('tool-1')

    // tool_call_started 不产出 tool.call.detected run event（那是 tool_call_ready 的职责）
    const detected = runEvents.find(
      entry => entry.channel === RUN_TOOL_EVENTS.TOOL_CALL_DETECTED
    )
    expect(detected).toBeUndefined()
  })

  it('commits on step.failed and clears preview', async () => {
    // review 盲区：step.failed 的 committed 分支。
    emittedEvents.length = 0
    const { responder } = createResponder()
    const mapper = new HostRenderEventMapper()

    await dispatch(responder, mapper, {
      type: 'step.started',
      stepId: 'step-1',
      stepIndex: 0,
      timestamp: 100
    })
    await dispatch(responder, mapper, {
      type: 'step.delta',
      stepId: 'step-1',
      stepIndex: 0,
      timestamp: 101,
      delta: { type: 'content_delta', timestamp: 101, content: 'partial' },
      snapshot: { content: 'partial', reasoning: '', toolCalls: [] }
    } as AgentEvent)

    await dispatch(responder, mapper, {
      type: 'step.failed',
      timestamp: 130,
      step: {
        status: 'failed',
        stepId: 'step-1',
        stepIndex: 0,
        startedAt: 100,
        completedAt: 130,
        content: 'partial',
        toolCalls: [],
        failure: { message: 'boom' }
      }
    } as AgentEvent)

    const channelSequence = emittedEvents.map(entry => entry.channel)
    expect(channelSequence).toEqual([
      'preview.updated', // content 'partial'
      'preview.cleared', // step.failed clears preview
      'message.updated' // committed on failure
    ])

    const finalBody = responder.getFinalAssistantMessage().body
    expect(finalBody.content).toContain('partial')
  })

  it('commits on step.aborted and clears preview', async () => {
    // review 盲区：step.aborted 的 committed 分支。
    emittedEvents.length = 0
    const { responder } = createResponder()
    const mapper = new HostRenderEventMapper()

    await dispatch(responder, mapper, {
      type: 'step.started',
      stepId: 'step-1',
      stepIndex: 0,
      timestamp: 100
    })
    await dispatch(responder, mapper, {
      type: 'step.delta',
      stepId: 'step-1',
      stepIndex: 0,
      timestamp: 101,
      delta: { type: 'content_delta', timestamp: 101, content: 'half' },
      snapshot: { content: 'half', reasoning: '', toolCalls: [] }
    } as AgentEvent)

    await dispatch(responder, mapper, {
      type: 'step.aborted',
      timestamp: 130,
      step: {
        status: 'aborted',
        stepId: 'step-1',
        stepIndex: 0,
        startedAt: 100,
        completedAt: 130,
        content: 'half',
        toolCalls: [],
        abortReason: 'user cancelled'
      }
    } as AgentEvent)

    const channelSequence = emittedEvents.map(entry => entry.channel)
    expect(channelSequence).toEqual([
      'preview.updated', // content 'half'
      'preview.cleared', // step.aborted clears preview
      'message.updated' // committed on abort
    ])
  })

  it('drives the tool confirmation chain (awaiting_confirmation + confirmation_denied)', async () => {
    // review 盲区：tool 确认链。
    emittedEvents.length = 0
    const { responder, runEvents } = createResponder()
    const mapper = new HostRenderEventMapper()

    await dispatch(responder, mapper, {
      type: 'step.started',
      stepId: 'step-1',
      stepIndex: 0,
      timestamp: 100
    })

    // awaiting_confirmation：host.tool.confirmation.required -> ChatRenderResponder 无对应 emit
    await dispatch(responder, mapper, {
      type: 'tool.awaiting_confirmation',
      timestamp: 110,
      stepId: 'step-1',
      toolCallId: 'tool-1',
      toolCallIndex: 0,
      toolName: 'execute_command'
    } as AgentEvent)

    // confirmation_denied：host.committed.updated + host.tool.result.available
    await dispatch(responder, mapper, {
      type: 'tool.confirmation_denied',
      timestamp: 120,
      deniedResult: {
        status: 'denied',
        stepId: 'step-1',
        toolCallId: 'tool-1',
        toolCallIndex: 0,
        toolName: 'execute_command',
        error: { message: 'denied by user' }
      }
    } as AgentEvent)

    const channelSequence = emittedEvents.map(entry => entry.channel)
    // committed.updated -> message.updated；denied result -> tool.result.attached。
    // denied 不发 TOOL_EXECUTION_COMPLETED / FAILED（responder 对 status==='denied' 跳过）。
    expect(channelSequence).toEqual([
      'message.updated',
      'tool.result.attached'
    ])

    const runChannelSequence = runEvents.map(entry => entry.channel)
    expect(runChannelSequence).not.toContain(RUN_TOOL_EVENTS.TOOL_EXECUTION_FAILED)
    expect(runChannelSequence).not.toContain(RUN_TOOL_EVENTS.TOOL_EXECUTION_COMPLETED)
  })
})
