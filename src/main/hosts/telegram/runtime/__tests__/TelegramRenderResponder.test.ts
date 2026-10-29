import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@main/services/images/ImageAssetService', () => ({ imageAssetService: { read: vi.fn() } }))
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
  onTextDelivered?: (ids: number[]) => void
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
      onTextDelivered: args.onTextDelivered,
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

  it('records new text deliveries once and leaves the current conversation unchanged on edits', async () => {
    const onTextDelivered = vi.fn()
    const { responder } = createResponder({ onTextDelivered })
    await responder.handle(previewUpdated(createState({ text: 'Hello' })))
    expect(onTextDelivered).toHaveBeenCalledWith([77])
    await responder.handle(committedUpdated(createState({ text: 'Hello again' })))
    expect(onTextDelivered).toHaveBeenCalledTimes(1)
  })

  it('does not record failed sends or resend when route persistence fails', async () => {
    const onTextDelivered = vi.fn(() => { throw new Error('disk full') })
    const failed = createResponder({ onTextDelivered, sendMessage: vi.fn().mockRejectedValue(new Error('network')) })
    await failed.responder.handle(committedUpdated(createState({ text: 'Hello' })))
    expect(onTextDelivered).not.toHaveBeenCalled()
    const sent = createResponder({ onTextDelivered })
    await sent.responder.handle(committedUpdated(createState({ text: 'Hello' })))
    await sent.responder.handle(committedUpdated(createState({ text: 'Hello' })))
    expect(sent.sendMessage).toHaveBeenCalledTimes(1)
    expect(onTextDelivered).toHaveBeenCalledTimes(1)
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

  it('sends one reason at execution and leaves it unchanged on successful completion', async () => {
    const { responder, sendMessage, editMessageText } = createResponder()
    const args = JSON.stringify({ tool_call_reason: 'Check today’s task results.', secret: 'not displayed' })
    await responder.handle(toolDetected({ toolCallId: 'one', toolName: 'query', toolArgs: args }))
    expect(sendMessage).not.toHaveBeenCalled()
    await responder.handle(toolExecutionStarted({ toolCallId: 'one', toolName: 'query' }))
    await responder.handle(toolExecutionStarted({ toolCallId: 'one', toolName: 'query' }))
    await responder.handle(toolResult({ toolCallId: 'one', toolName: 'query', status: 'success' }))
    await responder.handle(committedUpdated(createState({ toolCalls: [toolCall({
      toolCallId: 'one', name: 'query', args, status: 'success'
    })] })))
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(sendMessage.mock.calls[0][1]).toBe('Check today’s task results.')
    expect(editMessageText).not.toHaveBeenCalled()
  })

  it('keeps parallel tool reasons in separate messages and updates only the failed tool', async () => {
    const sendMessage = vi.fn().mockResolvedValueOnce({ message_id: 101 }).mockResolvedValueOnce({ message_id: 102 }).mockResolvedValueOnce({ message_id: 103 })
    const { responder, editMessageText } = createResponder({ sendMessage })
    for (const id of ['1', '2', '3']) {
      await responder.handle(toolDetected({ toolCallId: id, toolName: 'query', toolArgs: JSON.stringify({ tool_call_reason: `reason${id}` }) }))
      await responder.handle(toolExecutionStarted({ toolCallId: id, toolName: 'query' }))
    }
    await responder.handle({ type: 'host.tool.result.available', timestamp: 1, result: {
      stepId: 'step-1', toolCallIndex: 1, toolCallId: '2', toolName: 'query', status: 'error', error: { message: 'Connection <failed> & unavailable' }
    } })
    await responder.handle(toolResult({ toolCallId: '3', toolName: 'query', status: 'success' }))
    await responder.handle(toolResult({ toolCallId: '1', toolName: 'query', status: 'success' }))
    expect(sendMessage.mock.calls.map(([, text]) => text)).toEqual(['reason1', 'reason2', 'reason3'])
    expect(editMessageText).toHaveBeenCalledExactlyOnceWith(123, 102,
      'reason2\n<pre><code>Connection &lt;failed&gt; &amp; unavailable</code></pre>',
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [] } })
  })

  it('deduplicates errors across committed segments, result facts and late execution events', async () => {
    const { responder, sendMessage, editMessageText } = createResponder()
    const args = JSON.stringify({ tool_call_reason: 'Read configuration.' })
    await responder.handle(committedUpdated(createState({ toolCalls: [toolCall({ toolCallId: 'one', name: 'read', args, status: 'running' })] })))
    await responder.handle(committedUpdated(createState({ toolCalls: [toolCall({ toolCallId: 'one', name: 'read', args, status: 'failed', error: 'File not found' })] })))
    await responder.handle(toolResult({ toolCallId: 'one', toolName: 'read', status: 'error' }))
    await responder.handle(toolExecutionStarted({ toolCallId: 'one', toolName: 'read' }))
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(editMessageText).toHaveBeenCalledTimes(1)
    expect(editMessageText.mock.calls[0][2]).toBe('Read configuration.\n<pre><code>File not found</code></pre>')
  })

  it('uses structured failure details after a committed failure without an error string', async () => {
    const { responder, sendMessage } = createResponder()
    await responder.handle(committedUpdated(createState({ toolCalls: [toolCall({ toolCallId: 'one', name: 'read', status: 'failed' })] })))
    expect(sendMessage).not.toHaveBeenCalled()
    await responder.handle({ type: 'host.tool.result.available', timestamp: 1, result: {
      stepId: 'step-1', toolCallIndex: 0, toolCallId: 'one', toolName: 'read', status: 'error',
      failure: { category: 'environment', code: 'NOT_FOUND', message: 'Missing file', recovery: { action: 'check_environment', message: 'Check path' } }
    } })
    expect(sendMessage.mock.calls[0][1]).toBe('read\n<pre><code>Missing file</code></pre>')
  })

  it('renders successful committed tools and assistant text separately without done labels', async () => {
    const { responder, sendMessage } = createResponder()
    await responder.handle(committedUpdated(createState({ text: 'Answer', toolCalls: [toolCall({
      toolCallId: 'one', name: 'web_search', args: '{"tool_call_reason":"Search documentation."}', status: 'success'
    })] })))
    expect(sendMessage.mock.calls.map(([, text]) => text)).toEqual(['Answer', 'Search documentation.'])
  })

  it.each(['error', 'timeout'] as const)('reports %s before execution in one message', async status => {
    const { responder, sendMessage } = createResponder()
    await responder.handle(toolResult({ toolCallId: 'one', toolName: 'web_search', status }))
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(sendMessage.mock.calls[0][1]).toBe(`web search\n<pre><code>${status === 'timeout' ? 'Tool execution timed out.' : 'Tool execution failed.'}</code></pre>`)
  })

  it.each(['aborted', 'denied'] as const)('keeps %s tools quiet without creating or editing notifications', async status => {
    const { responder, sendMessage, editMessageText } = createResponder()
    await responder.handle(toolResult({ toolCallId: 'queued', toolName: 'query', status }))
    expect(sendMessage).not.toHaveBeenCalled()
    await responder.handle(toolExecutionStarted({ toolCallId: 'started', toolName: 'query' }))
    await responder.handle(toolResult({ toolCallId: 'started', toolName: 'query', status }))
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(editMessageText).not.toHaveBeenCalled()
  })

  it.each([undefined, '{', 'null', '{"tool_call_reason":42}', '{"tool_call_reason":"  "}'])('uses the tool label for invalid reason args %s', async toolArgs => {
    const { responder, sendMessage } = createResponder()
    await responder.handle(toolDetected({ toolCallId: 'one', toolName: 'web_search', toolArgs }))
    await responder.handle(toolExecutionStarted({ toolCallId: 'one', toolName: 'web_search' }))
    expect(sendMessage.mock.calls[0][1]).toBe('web search')
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

  it('bounds and escapes the reason and error without displaying raw arguments', async () => {
    const { responder, sendMessage, editMessageText } = createResponder()
    await responder.handle(toolDetected({ toolCallId: 'one', toolName: 'query', toolArgs: JSON.stringify({
      tool_call_reason: '<tag>&' + 'x'.repeat(1000), secret: 'hidden-value'
    }) }))
    await responder.handle(toolExecutionStarted({ toolCallId: 'one', toolName: 'query' }))
    await responder.handle({ type: 'host.tool.result.available', timestamp: 1, result: {
      stepId: 'step-1', toolCallIndex: 0, toolCallId: 'one', toolName: 'query', status: 'error', error: { message: 'bad <value> & ' + 'x'.repeat(5000) }
    } })
    expect(sendMessage.mock.calls[0][1]).toMatch(/^&lt;tag&gt;&amp;x/)
    const text = editMessageText.mock.calls[0][2] as string
    expect(text).toContain('<pre><code>bad &lt;value&gt; &amp; ')
    expect(text).not.toContain('hidden-value')
    expect(text.length).toBeLessThan(3500)
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
