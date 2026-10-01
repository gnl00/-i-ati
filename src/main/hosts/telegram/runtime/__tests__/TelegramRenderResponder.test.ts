import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RUN_STATES } from '@shared/run/lifecycle-events'
import type {
  AgentRenderMessageState,
  AgentRenderToolCallState,
  HostRenderEvent
} from '@main/hosts/shared/render'
import { TelegramRenderResponder } from '../TelegramRenderResponder'

const createState = (args: {
  stepId?: string
  text?: string
  reasoning?: string
  toolCalls?: AgentRenderToolCallState[]
  failure?: AgentRenderMessageState['failure']
} = {}): AgentRenderMessageState => {
  const {
    stepId = 'step-1',
    text = '',
    reasoning = '',
    toolCalls = [],
    failure
  } = args

  return {
    stepId,
    content: text,
    blocks: [
      ...(reasoning
        ? [{
            kind: 'reasoning' as const,
            blockId: `${stepId}:reasoning:0`,
            stepId,
            content: reasoning,
            startedAt: 1
          }]
        : []),
      ...(text
        ? [{
            kind: 'text' as const,
            blockId: `${stepId}:text:0`,
            stepId,
            content: text,
            startedAt: 2
          }]
        : []),
      ...toolCalls.map((entry, index) => ({
        kind: 'tool' as const,
        blockId: `${stepId}:tool:${entry.toolCallId}`,
        stepId,
        toolCallId: entry.toolCallId,
        startedAt: index + 3
      }))
    ],
    toolCalls,
    ...(failure ? { failure } : {})
  }
}

const toolCall = (
  args: Partial<AgentRenderToolCallState> & Pick<AgentRenderToolCallState, 'toolCallId' | 'name' | 'status'>
): AgentRenderToolCallState => ({
  toolCallId: args.toolCallId,
  toolCallIndex: args.toolCallIndex ?? 0,
  name: args.name,
  status: args.status,
  ...(args.args ? { args: args.args } : {}),
  ...(args.cost !== undefined ? { cost: args.cost } : {}),
  ...(args.result !== undefined ? { result: args.result } : {}),
  ...(args.error ? { error: args.error } : {})
})

const previewUpdated = (preview: AgentRenderMessageState, timestamp = Date.now()): HostRenderEvent => ({
  type: 'host.preview.updated',
  timestamp,
  preview,
  previewEffect: 'replace'
})

const committedUpdated = (
  committed: AgentRenderMessageState,
  timestamp = Date.now(),
  previewWasActive = false
): HostRenderEvent => ({
  type: 'host.committed.updated',
  timestamp,
  committed,
  previewWasActive
})

const previewCleared = (timestamp = Date.now()): HostRenderEvent => ({
  type: 'host.preview.cleared',
  timestamp
})

const lifecycleUpdated = (state: typeof RUN_STATES[keyof typeof RUN_STATES], timestamp = Date.now()): HostRenderEvent => ({
  type: 'host.lifecycle.updated',
  timestamp,
  state
})

const toolDetected = (args: {
  toolCallId: string
  toolName: string
  toolArgs?: string
  timestamp?: number
}): HostRenderEvent => ({
  type: 'host.tool.detected',
  timestamp: args.timestamp ?? Date.now(),
  stepId: 'step-1',
  toolCallId: args.toolCallId,
  toolCallIndex: 0,
  toolName: args.toolName,
  ...(args.toolArgs ? { toolArgs: args.toolArgs } : {})
})

const toolResult = (args: {
  toolCallId: string
  toolName: string
  status: 'success' | 'error' | 'timeout' | 'aborted' | 'denied'
  timestamp?: number
}): HostRenderEvent => ({
  type: 'host.tool.result.available',
  timestamp: args.timestamp ?? Date.now(),
  result: {
    status: args.status,
    stepId: 'step-1',
    toolCallId: args.toolCallId,
    toolCallIndex: 0,
    toolName: args.toolName
  } as any
})

const toolExecutionStarted = (args: {
  toolCallId: string
  toolName: string
  timestamp?: number
}): HostRenderEvent => ({
  type: 'host.tool.execution.started',
  timestamp: args.timestamp ?? Date.now(),
  stepId: 'step-1',
  toolCallId: args.toolCallId,
  toolCallIndex: 0,
  toolName: args.toolName
})

const createResponder = (args: {
  sendMessage?: ReturnType<typeof vi.fn>
  editMessageText?: ReturnType<typeof vi.fn>
  messageId?: string
  threadId?: string
} = {}): {
  responder: TelegramRenderResponder
  sendMessage: ReturnType<typeof vi.fn>
  editMessageText: ReturnType<typeof vi.fn>
} => {
  const sendMessage = args.sendMessage ?? vi.fn(async () => ({ message_id: 77 }))
  const editMessageText = args.editMessageText ?? vi.fn(async () => true)

  return {
    sendMessage,
    editMessageText,
    responder: new TelegramRenderResponder({
      bot: {
        api: {
          sendMessage,
          editMessageText
        }
      } as any,
      envelope: {
        updateId: 1,
        messageId: args.messageId ?? '55',
        threadId: args.threadId,
        chatId: '123',
        chatType: 'supergroup',
        text: 'hello',
        media: [],
        isMentioned: false,
        replyToBot: false,
        receivedAt: Date.now()
      }
    })
  }
}

describe('TelegramRenderResponder', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('sends a text segment immediately and edits streamed updates with throttle', async () => {
    const { responder, sendMessage, editMessageText } = createResponder()

    await responder.handle(previewUpdated(createState({ text: 'Hel' })))

    expect(sendMessage).toHaveBeenCalledWith(123, 'Hel', {
      reply_parameters: { message_id: 55 }
    })

    await responder.handle(previewUpdated(createState({ text: 'Hello' })))
    expect(editMessageText).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(400)
    expect(editMessageText).toHaveBeenCalledWith(123, 77, 'Hello', {})
  })

  it('final committed text reuses the preview message by stable segment id', async () => {
    const { responder, sendMessage, editMessageText } = createResponder()

    await responder.handle(previewUpdated(createState({ text: 'Looking' })))
    await responder.handle(previewCleared())
    await responder.handle(committedUpdated(createState({ text: 'Looking it up' })))

    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(editMessageText).toHaveBeenCalledWith(123, 77, 'Looking it up', {})
  })

  it('sends later text blocks as independent messages', async () => {
    const sendMessage = vi
      .fn()
      .mockResolvedValueOnce({ message_id: 91 })
      .mockResolvedValueOnce({ message_id: 92 })
    const { responder } = createResponder({ sendMessage })

    await responder.handle(previewUpdated(createState({
      stepId: 'step-1',
      text: 'First cycle answer'
    })))
    await responder.handle(previewCleared())
    await responder.handle(previewUpdated(createState({
      stepId: 'step-2',
      text: 'And here is the final answer'
    })))

    expect(sendMessage).toHaveBeenNthCalledWith(1, 123, 'First cycle answer', {
      reply_parameters: { message_id: 55 }
    })
    expect(sendMessage).toHaveBeenNthCalledWith(2, 123, 'And here is the final answer', {
      reply_parameters: { message_id: 55 }
    })
  })

  it('waits for execution before announcing start and retains args in the result', async () => {
    const sendMessage = vi
      .fn()
      .mockResolvedValueOnce({ message_id: 120 })
      .mockResolvedValueOnce({ message_id: 121 })
    const { responder, editMessageText } = createResponder({ sendMessage })

    await responder.handle(toolDetected({
      toolCallId: 'tool-1',
      toolName: 'memory_retrieval',
      toolArgs: '{"query":"latest api"}'
    }))
    expect(sendMessage).not.toHaveBeenCalled()
    await responder.handle(toolExecutionStarted({ toolCallId: 'tool-1', toolName: 'memory_retrieval' }))
    await responder.handle(toolResult({
      toolCallId: 'tool-1',
      toolName: 'memory_retrieval',
      status: 'success'
    }))

    expect(sendMessage).toHaveBeenNthCalledWith(1, 123, '<blockquote>tool memory retrieval running</blockquote>\n<blockquote expandable>{&quot;query&quot;:&quot;latest api&quot;}</blockquote>', {
      reply_parameters: { message_id: 55 },
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [] }
    })
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(editMessageText).toHaveBeenCalledWith(123, 120, [
      '<blockquote>tool memory retrieval done</blockquote>',
      '<blockquote expandable>{&quot;query&quot;:&quot;latest api&quot;}</blockquote>'
    ].join('\n'), {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [] }
    })
  })

  it('keeps detected tool args when execution started follows readiness', async () => {
    const sendMessage = vi.fn(async () => ({ message_id: 122 }))
    const { responder, editMessageText } = createResponder({ sendMessage })

    await responder.handle(toolDetected({
      toolCallId: 'tool-1',
      toolName: 'memory_retrieval',
      toolArgs: '{"query":"latest api"}'
    }))
    await responder.handle(toolExecutionStarted({
      toolCallId: 'tool-1',
      toolName: 'memory_retrieval'
    }))

    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(sendMessage).toHaveBeenCalledWith(123, '<blockquote>tool memory retrieval running</blockquote>\n<blockquote expandable>{&quot;query&quot;:&quot;latest api&quot;}</blockquote>', {
      reply_parameters: { message_id: 55 },
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [] }
    })
    expect(editMessageText).not.toHaveBeenCalled()
  })

  it('renders committed text and tool segments as separate telegram messages', async () => {
    const sendMessage = vi
      .fn()
      .mockResolvedValueOnce({ message_id: 130 })
      .mockResolvedValueOnce({ message_id: 131 })
    const { responder } = createResponder({ sendMessage })

    await responder.handle(committedUpdated(createState({
      text: 'Looking it up',
      toolCalls: [
        toolCall({
          toolCallId: 'tool-1',
          name: 'memory_retrieval',
          status: 'success',
          result: { ok: true }
        })
      ]
    })))

    expect(sendMessage).toHaveBeenNthCalledWith(1, 123, 'Looking it up', {
      reply_parameters: { message_id: 55 }
    })
    expect(sendMessage).toHaveBeenNthCalledWith(2, 123, '<blockquote>tool memory retrieval done</blockquote>', {
      reply_parameters: { message_id: 55 },
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [] }
    })
  })

  it('edits the running tool message when committed tool status changes', async () => {
    const sendMessage = vi
      .fn()
      .mockResolvedValueOnce({ message_id: 140 })
      .mockResolvedValueOnce({ message_id: 141 })
      .mockResolvedValueOnce({ message_id: 142 })
    const editMessageText = vi.fn(async () => true)
    const { responder } = createResponder({ sendMessage, editMessageText })

    await responder.handle(committedUpdated(createState({
      text: 'Looking it up',
      toolCalls: [
        toolCall({
          toolCallId: 'tool-1',
          name: 'memory_retrieval',
          status: 'running'
        })
      ]
    })))
    await responder.handle(committedUpdated(createState({
      text: 'Looking it up',
      toolCalls: [
        toolCall({
          toolCallId: 'tool-1',
          name: 'memory_retrieval',
          status: 'success',
          result: { ok: true }
        })
      ]
    })))

    expect(sendMessage).toHaveBeenNthCalledWith(1, 123, 'Looking it up', {
      reply_parameters: { message_id: 55 }
    })
    expect(sendMessage).toHaveBeenNthCalledWith(2, 123, '<blockquote>tool memory retrieval running</blockquote>', {
      reply_parameters: { message_id: 55 },
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [] }
    })
    expect(sendMessage).toHaveBeenCalledTimes(2)
    expect(editMessageText).toHaveBeenCalledWith(123, 141, '<blockquote>tool memory retrieval done</blockquote>', {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [] }
    })
  })

  it('reports a result without inventing an execution start', async () => {
    const sendMessage = vi
      .fn()
      .mockResolvedValueOnce({ message_id: 150 })
      .mockResolvedValueOnce({ message_id: 151 })
    const { responder } = createResponder({ sendMessage })

    await responder.handle(toolResult({
      toolCallId: 'tool-1',
      toolName: 'web_search',
      status: 'error'
    }))

    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(sendMessage).toHaveBeenNthCalledWith(1, 123, '<blockquote>tool web search failed</blockquote>', {
      reply_parameters: { message_id: 55 },
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [] }
    })
  })

  it('does not duplicate done when committed tool segment follows result event', async () => {
    const sendMessage = vi
      .fn()
      .mockResolvedValueOnce({ message_id: 160 })
      .mockResolvedValueOnce({ message_id: 161 })
      .mockResolvedValueOnce({ message_id: 162 })
    const { responder } = createResponder({ sendMessage })

    await responder.handle(toolDetected({
      toolCallId: 'tool-1',
      toolName: 'memory_retrieval',
      toolArgs: '{"query":"latest api"}'
    }))
    await responder.handle(toolResult({
      toolCallId: 'tool-1',
      toolName: 'memory_retrieval',
      status: 'success'
    }))
    await responder.handle(committedUpdated(createState({
      text: 'Looking it up',
      toolCalls: [
        toolCall({
          toolCallId: 'tool-1',
          name: 'memory_retrieval',
          args: '{"query":"latest api"}',
          status: 'success',
          result: { ok: true }
        })
      ]
    })))

    expect(sendMessage).toHaveBeenCalledTimes(2)
    expect(sendMessage).toHaveBeenNthCalledWith(1, 123, [
      '<blockquote>tool memory retrieval done</blockquote>',
      '<blockquote expandable>{&quot;query&quot;:&quot;latest api&quot;}</blockquote>'
    ].join('\n'), {
      reply_parameters: { message_id: 55 },
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [] }
    })
    expect(sendMessage).toHaveBeenNthCalledWith(2, 123, 'Looking it up', {
      reply_parameters: { message_id: 55 }
    })
  })

  it('keeps emotion_report hidden in telegram output', async () => {
    const { responder, sendMessage } = createResponder()

    await responder.handle(committedUpdated(createState({
      text: 'Hi there',
      toolCalls: [
        toolCall({
          toolCallId: 'tool-1',
          name: 'emotion_report',
          status: 'success',
          result: {
            success: true,
            stimulus: { impact: 1, activation: 0, control: 0 }
          }
        })
      ]
    })))
    await responder.handle(toolDetected({
      toolCallId: 'tool-1',
      toolName: 'emotion_report',
      toolArgs: '{"impact":1,"activation":0,"control":0}'
    }))

    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(sendMessage).toHaveBeenCalledWith(123, 'Hi there', {
      reply_parameters: { message_id: 55 }
    })
  })

  it('trims long tool args in done messages', async () => {
    const { responder, sendMessage } = createResponder()
    const longArgs = JSON.stringify({ query: 'x'.repeat(1200) })

    await responder.handle(toolDetected({
      toolCallId: 'tool-1',
      toolName: 'web_search',
      toolArgs: longArgs
    }))
    await responder.handle(toolResult({
      toolCallId: 'tool-1',
      toolName: 'web_search',
      status: 'success'
    }))

    const text = sendMessage.mock.calls[0][1] as string
    expect(text).toMatch(/^<blockquote>tool web search done<\/blockquote>\n<blockquote expandable>/)
    expect(text).toContain('...</blockquote>')
    expect(text.length).toBeLessThan(longArgs.length)
  })

  it('escapes tool done args for telegram HTML messages', async () => {
    const { responder, sendMessage } = createResponder()
    const rawArgs = '{"query":"<tag>&\\"quote\\""}'

    await responder.handle(toolDetected({
      toolCallId: 'tool-1',
      toolName: 'web_search',
      toolArgs: rawArgs
    }))
    await responder.handle(toolResult({
      toolCallId: 'tool-1',
      toolName: 'web_search',
      status: 'success'
    }))

    expect(sendMessage).toHaveBeenNthCalledWith(1, 123, [
      '<blockquote>tool web search done</blockquote>',
      '<blockquote expandable>{&quot;query&quot;:&quot;&lt;tag&gt;&amp;\\&quot;quote\\&quot;&quot;}</blockquote>'
    ].join('\n'), {
      reply_parameters: { message_id: 55 },
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [] }
    })
  })

  it('flushes pending streamed text edits on completion', async () => {
    const { responder, editMessageText } = createResponder()

    await responder.handle(previewUpdated(createState({ text: 'Hel' })))
    await responder.handle(previewUpdated(createState({ text: 'Hello' })))
    await responder.handle(lifecycleUpdated(RUN_STATES.COMPLETED))

    expect(editMessageText).toHaveBeenCalledWith(123, 77, 'Hello', {})
  })

  it('uses thread and reply options when sending messages', async () => {
    const { responder, sendMessage } = createResponder({ threadId: '9', messageId: '56' })

    await responder.handle(committedUpdated(createState({ text: 'Hello' })))

    expect(sendMessage).toHaveBeenCalledWith(123, 'Hello', {
      message_thread_id: 9,
      reply_parameters: { message_id: 56 }
    })
  })

  it('ignores telegram message-not-modified edit failures', async () => {
    const editMessageText = vi.fn(async () => {
      throw new Error('Bad Request: message is not modified')
    })
    const { responder } = createResponder({ editMessageText })

    await responder.handle(previewUpdated(createState({ text: 'Hel' })))
    await responder.handle(previewUpdated(createState({ text: 'Hello' })))
    await vi.advanceTimersByTimeAsync(400)

    await expect(responder.handle(lifecycleUpdated(RUN_STATES.COMPLETED))).resolves.toBeUndefined()
  })
})


describe('Telegram native drafts', () => {
  const createPrivate = (): {
    responder: TelegramRenderResponder
    draft: ReturnType<typeof vi.fn>
    send: ReturnType<typeof vi.fn>
  } => {
    const draft = vi.fn().mockResolvedValue(true)
    const send = vi.fn().mockResolvedValue({ message_id: 99 })
    return {
      draft, send,
      responder: new TelegramRenderResponder({
        bot: { api: { sendRichMessageDraft: draft, sendMessage: send, sendRichMessage: send } } as never,
        envelope: { updateId: 1, chatId: '123', chatType: 'private', messageId: '55', fromUserId: '123', text: '', media: [], isMentioned: false, replyToBot: false, receivedAt: 1 }
      })
    }
  }

  it('streams temporary previews, exposes Stop, and saves the final response once', async () => {
    vi.useFakeTimers()
    const { responder, draft, send } = createPrivate()
    await responder.handle(lifecycleUpdated(RUN_STATES.STREAMING))
    const draftId = draft.mock.calls[0][1]
    expect(draft.mock.calls[0][2]).toEqual({ html: '<tg-thinking>Thinking...</tg-thinking>' })
    await responder.handle(previewUpdated(createState({ text: '**Hello**' })))
    expect(draft).toHaveBeenLastCalledWith(123, draftId, { html: '<p><b>Hello</b></p>' }, { can_stop: true, keep_on_stop: true }, expect.objectContaining({ aborted: false }))
    expect(send).not.toHaveBeenCalled()
    await responder.handle(committedUpdated(createState({ text: '**Hello**' })))
    await responder.finish()
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(123, '<b>Hello</b>', expect.objectContaining({ parse_mode: 'HTML' }))
    const previous = draft.mock.calls.length
    await vi.advanceTimersByTimeAsync(30000)
    expect(draft).toHaveBeenCalledTimes(previous)
  })

  it('rejects stale draft stops, freezes previews and persists partial text on abort', async () => {
    vi.useFakeTimers()
    const { responder, draft, send } = createPrivate()
    await responder.handle(previewUpdated(createState({ text: 'Partial' })))
    const draftId = draft.mock.calls[0][1]
    expect(responder.stopDraft(draftId + 1)).toBe(false)
    expect(responder.stopDraft(draftId)).toBe(true)
    expect(draft.mock.calls[0][4].aborted).toBe(true)
    expect(responder.stopDraft(draftId)).toBe(false)
    await responder.handle(previewUpdated(createState({ text: 'Late token' })))
    await responder.handle(lifecycleUpdated(RUN_STATES.ABORTED))
    expect(send).toHaveBeenCalledWith(123, 'Partial', expect.anything())
    expect(draft).toHaveBeenCalledTimes(1)
    expect(responder.stopDraft(draftId)).toBe(false)
  })

  it('refreshes quiet drafts and supports stopping before the first text token', async () => {
    vi.useFakeTimers()
    const { responder, draft, send } = createPrivate()
    await responder.handle(lifecycleUpdated(RUN_STATES.STREAMING))
    await vi.advanceTimersByTimeAsync(15000)
    expect(draft).toHaveBeenCalledTimes(2)
    expect(responder.stopDraft(draft.mock.calls[0][1])).toBe(true)
    await responder.handle(lifecycleUpdated(RUN_STATES.ABORTED))
    expect(send).toHaveBeenCalledWith(123, 'Generation stopped.', expect.anything())
  })

  it('persists the latest queued text on failure and ignores events after finalization', async () => {
    vi.useFakeTimers()
    const { responder, draft, send } = createPrivate()
    await responder.handle(previewUpdated(createState({ text: 'Part' })))
    await responder.handle(previewUpdated(createState({ text: 'Partial latest' })))
    await responder.handle(lifecycleUpdated(RUN_STATES.FAILED))
    expect(send).toHaveBeenCalledWith(123, 'Partial latest', expect.anything())
    await responder.handle(previewUpdated(createState({ text: 'Late' })))
    expect(draft).toHaveBeenCalledTimes(1)
    await responder.finish()
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('uses persistent messages when the server explicitly rejects draft support', async () => {
    vi.useFakeTimers()
    const { responder, draft, send } = createPrivate()
    draft.mockRejectedValueOnce({ error_code: 404, description: 'Method not found' })
    await responder.handle(previewUpdated(createState({ text: 'Hello' })))
    expect(send).toHaveBeenCalledWith(123, 'Hello', expect.anything())
    expect(responder.stopDraft(draft.mock.calls[0][1])).toBe(false)
    await responder.finish()
  })
  it('does not resend uncertain final sends on repeated lifecycle events', async () => {
    const { responder, send } = createPrivate()
    send.mockRejectedValue(new Error('network timeout after send'))
    await responder.handle(previewUpdated(createState({ text: 'Partial' })))
    await responder.handle(lifecycleUpdated(RUN_STATES.COMPLETED))
    await responder.finish()
    await responder.handle(committedUpdated(createState({ text: 'Partial' })))
    expect(send).toHaveBeenCalledTimes(1)
    responder.dispose()
  })

  it('disposes draft timers and prevents further output at gateway shutdown', async () => {
    vi.useFakeTimers()
    const { responder, draft, send } = createPrivate()
    await responder.handle(previewUpdated(createState({ text: 'Partial' })))
    responder.dispose()
    await responder.handle(lifecycleUpdated(RUN_STATES.ABORTED))
    await vi.advanceTimersByTimeAsync(30000)
    expect(draft).toHaveBeenCalledTimes(1)
    expect(send).not.toHaveBeenCalled()
  })

})
