// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useToolConfirmationStore } from '@renderer/features/chat/state/toolConfirmationStore'
import { TOOL_CALL_REASON_PARAMETER_NAME } from '@shared/tools/definitions-utils'

const motionSettings = vi.hoisted(() => ({ reduced: false }))
const clipboardWriteText = vi.hoisted(() => vi.fn())

vi.mock('framer-motion', async () => {
  const React = await import('react')
  const passthrough = (tag: string) => (
    React.forwardRef<HTMLElement, Record<string, unknown> & { children?: React.ReactNode }>(({
      children,
      animate,
      initial,
      transition,
      ...props
    }, ref) => React.createElement(tag, {
      ...props,
      ref,
      'data-motion-animate': JSON.stringify(animate),
      'data-motion-initial': JSON.stringify(initial),
      'data-motion-transition': JSON.stringify(transition)
    } as any, children as React.ReactNode))
  )
  return {
    motion: {
      div: passthrough('div'),
      span: passthrough('span')
    },
    useReducedMotion: () => motionSettings.reduced
  }
})

import {
  ToolCallInspectorDetails
} from '../toolcall/ToolCallResult'
import { ToolCallInspectorContent } from '../toolcall/ToolCallInspectorContent'
import { ToolCallGroup } from '../toolcall/ToolCallGroup'
import { SubagentResults } from '../toolcall/SubagentResults'
import { useSubagentRuntimeStore } from '@renderer/features/subagents'
import { useChatStore } from '@renderer/features/chat/state/chatStore'

const createToolCall = (
  status = 'completed',
  result?: unknown,
  args: Record<string, unknown> = { query: 'latest status' }
): ToolCallSegment => ({
  type: 'toolCall',
  segmentId: 'segment-tool-1',
  name: 'search',
  content: {
    toolName: 'search',
    args,
    status,
    ...(result === undefined ? {} : { result })
  },
  timestamp: Date.now() - 100,
  executionStartedAt: Date.now() - 80,
  toolCallId: 'tool-1',
  cost: status === 'running' ? undefined : 80
})

const ToolGroupFixture = ({ toolCall }: { toolCall: ToolCallSegment }): React.ReactElement => <ToolCallGroup items={[{ key: toolCall.segmentId, segment: toolCall, layer: 'committed', order: 0, sourceIndex: 0, isStreamingTail: false }]} />

describe('tool call presentation', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    useToolConfirmationStore.getState().activate('chat-1')
    clipboardWriteText.mockReset()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWriteText }
    })
    useChatStore.setState({
      currentChatUuid: 'chat-1',
      artifactsPanelOpen: false,
      artifactsActiveTab: 'stats',
      toolCallInspectorSelection: null,
      toolLiveOutputs: {},
      messages: [],
      preview: { message: null }
    })
  })

  it('renders live cancellation without regressing to an older subagent event', async () => {
    const record = { id: 'child-cancel', role: 'coder', task: 'Inspect this module', status: 'running' as const, created_at: 1, revision: 2 }
    useSubagentRuntimeStore.getState().clear()
    await act(async () => root.render(<SubagentResults action="cancel" payload={{ subagent: record }} />))
    expect(container.textContent).toContain('Running')
    await act(async () => useSubagentRuntimeStore.getState().upsert({ ...record, status: 'cancelling', revision: 3 }))
    expect(container.textContent).toContain('Cancelling')
    expect(container.textContent).toContain('CANCEL')
    await act(async () => useSubagentRuntimeStore.getState().upsert({ ...record, status: 'cancelled', revision: 4 }))
    await act(async () => useSubagentRuntimeStore.getState().upsert(record))
    expect(container.textContent).toContain('Cancelled')
    expect(container.textContent).not.toContain('Running')
    await act(async () => useSubagentRuntimeStore.getState().clear())
  })

  it('keeps an inspected historical run separate from the same child latest run', async () => {
    const record = { id: 'child-history', run_id: 'run-a', parent_submission_id: 'parent-a', role: 'coder', task: 'Original task', status: 'completed' as const, created_at: 1, revision: 4, summary: 'Original evidence', artifacts: { tools_used: ['read'], files_touched: ['original.ts'] } }
    useSubagentRuntimeStore.getState().clear()
    useSubagentRuntimeStore.getState().upsert({ ...record, run_id: 'run-b', parent_submission_id: 'parent-b', task: 'Followup task', status: 'running', revision: 6, summary: 'Followup evidence', artifacts: { tools_used: [], files_touched: ['followup.ts'] } })
    await act(async () => root.render(<SubagentResults action="inspect" payload={{ subagent: record }} />))
    expect(container.textContent).toContain('Completed')
    expect(container.textContent).toContain('Original task')
    expect(container.textContent).toContain('Original evidence')
    expect(container.textContent).toContain('original.ts')
    expect(container.textContent).not.toContain('Followup')
    expect(container.textContent).not.toContain('followup.ts')
    await act(async () => useSubagentRuntimeStore.getState().clear())
  })

  it('does not replace a newer result with an older snapshot of the same run', async () => {
    const record = { id: 'child-snapshot', run_id: 'run-a', role: 'coder', task: 'Inspect', status: 'completed' as const, created_at: 1, revision: 4 }
    useSubagentRuntimeStore.getState().clear()
    useSubagentRuntimeStore.getState().upsert({ ...record, status: 'running', revision: 2 })
    await act(async () => root.render(<SubagentResults action="wait" payload={{ subagent: record }} />))
    expect(container.textContent).toContain('Completed')
    expect(container.textContent).not.toContain('Running')
    await act(async () => useSubagentRuntimeStore.getState().clear())
  })

  it('does not project another run approval onto historical running evidence', async () => {
    const record = { id: 'child-approval', run_id: 'run-a', parent_submission_id: 'parent', role: 'coder', task: 'Original task', status: 'running' as const, created_at: 1, revision: 2 }
    useSubagentRuntimeStore.getState().clear()
    useSubagentRuntimeStore.getState().upsert({ ...record, run_id: 'run-b', revision: 6 })
    useToolConfirmationStore.getState().apply({ confirmationId: 'other-run', submissionId: 'parent', chatUuid: 'chat-1', toolCallId: 'exec', name: 'exec', status: 'pending', version: 1, createdAt: 1, expiresAt: 300001, agent: { kind: 'subagent', subagentId: record.id } })
    await act(async () => root.render(<SubagentResults action="inspect" payload={{ subagent: record }} />))
    expect(container.textContent).toContain('Running')
    expect(container.textContent).not.toContain('Waiting for confirmation')
    await act(async () => useSubagentRuntimeStore.getState().clear())
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  it('shows remote approval separately from actual tool execution', async () => {
    const pending = { confirmationId: 'approval', submissionId: 'run', chatUuid: 'chat-1', toolCallId: 'tool-1', name: 'search', status: 'pending' as const, version: 1, createdAt: 1, expiresAt: 300001 }
    useToolConfirmationStore.getState().apply(pending)
    await act(async () => root.render(<ToolGroupFixture toolCall={createToolCall('pending')} />))
    expect(container.textContent).toContain('awaiting approval')
    act(() => useToolConfirmationStore.getState().apply({ ...pending, status: 'approved', version: 2 }))
    expect(container.textContent).toContain('approved')
    expect(container.querySelector('button')?.getAttribute('aria-label')).toContain('status approved')
    await act(async () => root.render(<ToolGroupFixture toolCall={createToolCall('running')} />))
    expect(container.querySelector('button')?.getAttribute('aria-label')).toContain('status running')
    await act(async () => root.render(<ToolGroupFixture toolCall={createToolCall('completed')} />))
    expect(container.querySelector('button')?.getAttribute('aria-label')).toContain('status completed')
  })

  it('opens inline details and stores the selected identity without opening the Tools tab', async () => {
    await act(async () => root.render(<ToolGroupFixture toolCall={createToolCall()} />))
    const trigger = container.querySelector('button')!
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    await act(async () => trigger.click())
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(container.textContent).toContain('latest status')
    expect(useChatStore.getState().toolCallInspectorSelection?.segmentId).toBe('segment-tool-1')
    expect(useChatStore.getState().artifactsPanelOpen).toBe(false)
  })

  it('animates pending and running tools and stops at terminal states', async () => {
    for (const status of ['pending', 'running', 'completed', 'failed']) {
      await act(async () => root.render(<ToolGroupFixture toolCall={createToolCall(status)} />))
      const icon = container.querySelector('[data-testid="tool-call-trigger-status-segment-tool-1"] svg')
      const active = status === 'pending' || status === 'running'
      expect(icon?.classList.contains('animate-spin')).toBe(active)
      expect(icon?.classList.contains('motion-reduce:animate-none')).toBe(active)
    }
  })

  it('keeps the terminal duration visible in the tool row', async () => {
    await act(async () => root.render(<ToolGroupFixture toolCall={createToolCall()} />))
    expect(container.textContent).toContain('0.08s')
  })

  it('rounds the terminal duration to two decimal places', async () => {
    const toolCall = {
      ...createToolCall(),
      cost: 1086
    }
    await act(async () => root.render(<ToolGroupFixture toolCall={toolCall} />))

    expect(container.textContent).toContain('1.09s')
    expect(container.textContent).not.toContain('1.086s')
  })

  it.each([[60_000, '1m'], [225_000, '3m45s']])('formats a long tool duration of %s ms', async (cost, expected) => {
    await act(async () => root.render(<ToolGroupFixture toolCall={{ ...createToolCall(), cost: Number(cost) }} />))
    expect(container.textContent).toContain(expected)
  })

  it('updates the running duration from the execution start', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    await act(async () => root.render(<ToolGroupFixture toolCall={createToolCall('running')} />))
    expect(container.textContent).toContain('0.08s')

    await act(async () => vi.advanceTimersByTime(1000))
    expect(container.textContent).toContain('1.08s')
  })

  it('keeps the reason in the row and filters it from inspector parameters', async () => {
    const reason = 'Find the current renderer contract.'
    const toolCall = createToolCall('completed', { ok: true }, {
      query: 'renderer contract',
      [TOOL_CALL_REASON_PARAMETER_NAME]: reason
    })
    await act(async () => {
      root.render(
        <>
          <ToolGroupFixture toolCall={toolCall} />
          <ToolCallInspectorDetails
            toolCall={toolCall}
            toolResponse={toolCall.content}
          />
        </>
      )
    })

    expect(container.textContent).toContain(reason)
    expect(container.textContent).toContain('renderer contract')
    expect(container.textContent).not.toContain(TOOL_CALL_REASON_PARAMETER_NAME)
  })

  it('shows the original tool name and low-priority call metadata', async () => {
    const toolCall = {
      ...createToolCall(),
      name: 'web_search'
    }
    useChatStore.setState({
      messages: [{
        chatUuid: 'chat-1',
        body: {
          role: 'assistant',
          content: '',
          segments: [toolCall]
        }
      }],
      toolCallInspectorSelection: {
        chatUuid: 'chat-1',
        segmentId: toolCall.segmentId,
        toolCallId: toolCall.toolCallId
      }
    })

    await act(async () => root.render(<ToolCallInspectorContent />))

    const header = container.querySelector('header')
    expect(container.querySelector('h2')?.textContent).toBe('web_search')
    expect(header?.textContent).toContain('completed')
    expect(header?.textContent).toContain('call')
    expect(header?.textContent).toContain('tool-1')
    expect(header?.textContent).not.toContain('segment')
    expect(container.querySelector('button[aria-label="Copy call ID"]')).toBeNull()
    expect(container.querySelector('button[aria-label="Copy segment ID"]')).toBeNull()
  })

  it('shows Parameters, Execution output, and Result in one reading flow', async () => {
    const toolCall = createToolCall('completed', { success: true, value: 42 })
    await act(async () => {
      root.render(
        <ToolCallInspectorDetails
          toolCall={toolCall}
          toolResponse={toolCall.content}
          liveOutput={{
            submissionId: 'submission-1',
            sequence: 1,
            stdout: 'build complete\n',
            stderr: 'one warning\n',
            stdoutBytes: 15,
            stderrBytes: 12,
            stdoutPendingCarriageReturn: false,
            stderrPendingCarriageReturn: false
          }}
        />
      )
    })

    const text = container.textContent ?? ''
    const inspector = container.querySelector('[data-testid="tool-call-inspector-details"]')
    expect(inspector?.firstElementChild?.tagName).toBe('SECTION')
    expect(text.indexOf('Parameters')).toBeLessThan(text.indexOf('Execution output'))
    expect(text.indexOf('Execution output')).toBeLessThan(text.indexOf('Result'))
    expect(text).toContain('build complete')
    expect(text).toContain('one warning')
    expect(text).toContain('42')
  })

  it('caps the Parameters content viewport while keeping short content at natural height', async () => {
    const toolCall = createToolCall()
    await act(async () => {
      root.render(
        <ToolCallInspectorDetails
          toolCall={toolCall}
          toolResponse={toolCall.content}
        />
      )
    })

    const parametersContent = container.querySelector(
      '[data-testid="tool-inspector-parameters-content"]'
    )
    expect(parametersContent?.classList.contains('max-h-[min(280px,35vh)]')).toBe(true)
    expect(parametersContent?.classList.contains('overflow-y-auto')).toBe(true)
    expect(
      Array.from(parametersContent?.classList ?? []).some(className => /^h-/.test(className))
    ).toBe(false)
    expect(parametersContent?.textContent).toContain('latest status')
    expect(
      container.querySelector('[data-testid="tool-inspector-parameters"] button[aria-pressed]')
    ).toBeNull()
  })

  it('bounds a 1 MB parameter preview until Full while copy keeps the complete value', async () => {
    const parameterSentinel = 'PARAMETER-END-SENTINEL'
    const resultSentinel = 'RESULT-END-SENTINEL'
    const largeParameter = `${'x'.repeat(1024 * 1024)}${parameterSentinel}`
    const toolCall = createToolCall(
      'completed',
      { content: `${'r'.repeat(2_000)}${resultSentinel}` },
      { content: largeParameter }
    )

    await act(async () => {
      root.render(
        <ToolCallInspectorDetails
          toolCall={toolCall}
          toolResponse={toolCall.content}
        />
      )
    })

    const parametersSection = container.querySelector(
      '[data-testid="tool-inspector-parameters"]'
    )
    const resultSection = container.querySelector('[data-testid="tool-inspector-result"]')
    const parameterValue = parametersSection?.querySelector(
      '[data-testid="tool-inspector-parameter-value"]'
    )
    const fullButton = Array.from(parametersSection?.querySelectorAll('button') ?? [])
      .find(button => button.textContent === 'Full')

    expect(parameterValue?.textContent?.length).toBeLessThanOrEqual(1_500)
    expect(parametersSection?.textContent).not.toContain(parameterSentinel)
    expect(parametersSection?.textContent).toContain('Showing a shortened preview')
    expect(resultSection?.textContent).not.toContain(resultSentinel)
    expect(fullButton?.getAttribute('aria-pressed')).toBe('false')

    const copyButton = parametersSection?.querySelector<HTMLButtonElement>(
      'button[aria-label="Copy parameters"]'
    )
    await act(async () => {
      copyButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(clipboardWriteText).toHaveBeenLastCalledWith(
      JSON.stringify({ content: largeParameter }, null, 2)
    )

    await act(async () => {
      fullButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(parametersSection?.textContent).toContain(parameterSentinel)
    expect(resultSection?.textContent).not.toContain(resultSentinel)
  })

  it('stops serializing later fields after the parameter preview budget is exhausted', async () => {
    const serializeDeferredField = vi.fn(() => 'deferred value')
    const toolCall = createToolCall('completed', undefined, {
      content: 'x'.repeat(1024 * 1024),
      deferred: { toJSON: serializeDeferredField }
    })

    await act(async () => {
      root.render(
        <ToolCallInspectorDetails
          toolCall={toolCall}
          toolResponse={toolCall.content}
        />
      )
    })

    expect(serializeDeferredField).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Showing a shortened preview')

    const parametersSection = container.querySelector(
      '[data-testid="tool-inspector-parameters"]'
    )
    const fullButton = Array.from(parametersSection?.querySelectorAll('button') ?? [])
      .find(button => button.textContent === 'Full')

    await act(async () => {
      fullButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(serializeDeferredField).toHaveBeenCalledTimes(1)
    expect(parametersSection?.textContent).toContain('deferred value')
  })

  it('keeps terminal live output beside the terminal result', async () => {
    const toolCall = createToolCall('completed', { success: true, stdout: 'terminal payload' })
    await act(async () => {
      root.render(
        <ToolCallInspectorDetails
          toolCall={toolCall}
          toolResponse={toolCall.content}
          liveOutput={{
            submissionId: 'submission-1',
            sequence: 2,
            stdout: 'streamed output',
            stderr: '',
            stdoutBytes: 15,
            stderrBytes: 0,
            stdoutPendingCarriageReturn: false,
            stderrPendingCarriageReturn: false
          }}
        />
      )
    })

    expect(container.textContent).toContain('streamed output')
    expect(container.textContent).toContain('terminal payload')
  })

  it('copies parameters, execution output, and result independently', async () => {
    const args = {
      query: 'latest status',
      filters: {
        sources: ['docs', 'issues'],
        limit: 50
      }
    }
    const toolCall = createToolCall('completed', { success: true }, args)
    await act(async () => {
      root.render(
        <ToolCallInspectorDetails
          toolCall={toolCall}
          toolResponse={toolCall.content}
          liveOutput={{
            submissionId: 'submission-1',
            sequence: 2,
            stdout: 'standard output',
            stderr: 'standard error',
            stdoutBytes: 15,
            stderrBytes: 14,
            stdoutPendingCarriageReturn: false,
            stderrPendingCarriageReturn: false
          }}
        />
      )
    })

    for (const label of ['Copy parameters', 'Copy execution output', 'Copy result']) {
      const copyButton = container.querySelector<HTMLButtonElement>(
        `button[aria-label="${label}"]`
      )
      expect(copyButton?.className).toContain('h-6')
      expect(copyButton?.className).toContain('w-6')
      expect(copyButton?.className).toContain('duration-[160ms]')
      expect(copyButton?.className).toContain('active:scale-[0.97]')
      expect(copyButton?.title).toBe(label)

      await act(async () => {
        copyButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      expect(copyButton?.getAttribute('aria-label')).toBe('Copied')
      expect(copyButton?.title).toBe('Copied')
    }

    expect(clipboardWriteText).toHaveBeenNthCalledWith(1, JSON.stringify(args, null, 2))
    expect(clipboardWriteText).toHaveBeenNthCalledWith(2, 'standard output\nstandard error')
    expect(clipboardWriteText).toHaveBeenNthCalledWith(3, '{\n  "success": true\n}')
  })

  it('clears execution copy feedback when live output changes', async () => {
    const toolCall = createToolCall('completed', { success: true })
    const renderInspector = async (stdout: string): Promise<void> => {
      await act(async () => {
        root.render(
          <ToolCallInspectorDetails
            toolCall={toolCall}
            toolResponse={toolCall.content}
            liveOutput={{
              submissionId: 'submission-1',
              sequence: 2,
              stdout,
              stderr: '',
              stdoutBytes: stdout.length,
              stderrBytes: 0,
              stdoutPendingCarriageReturn: false,
              stderrPendingCarriageReturn: false
            }}
          />
        )
      })
    }

    await renderInspector('partial output')
    const copyButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Copy execution output"]'
    )
    await act(async () => {
      copyButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(copyButton?.getAttribute('aria-label')).toBe('Copied')

    await renderInspector('complete output')
    expect(copyButton?.getAttribute('aria-label')).toBe('Copy execution output')

    await act(async () => {
      copyButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(clipboardWriteText).toHaveBeenLastCalledWith('complete output')
    expect(copyButton?.getAttribute('aria-label')).toBe('Copied')
  })

  it('uses Preview and Full controls for long results', async () => {
    const toolCall = createToolCall('completed', {
      content: Array.from({ length: 240 }, (_, index) => `line ${index}`).join('\n')
    })
    await act(async () => {
      root.render(
        <ToolCallInspectorDetails
          toolCall={toolCall}
          toolResponse={toolCall.content}
        />
      )
    })

    const fullButton = Array.from(container.querySelectorAll('button'))
      .find(button => button.textContent === 'Full')
    expect(fullButton).toBeTruthy()
    expect(container.textContent).toContain('Showing a shortened preview')

    await act(async () => {
      fullButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(container.textContent).toContain('line 39')
  })

  it('removes spatial inspector motion when reduced motion is enabled', async () => {
    motionSettings.reduced = true
    const toolCall = createToolCall()
    await act(async () => {
      root.render(
        <ToolCallInspectorDetails
          toolCall={toolCall}
          toolResponse={toolCall.content}
        />
      )
    })

    const inspector = container.querySelector('[data-testid="tool-call-inspector-details"]')
    expect(inspector?.getAttribute('data-motion-initial')).toBe('{"opacity":0}')
    expect(inspector?.getAttribute('data-motion-transition')).toContain('"duration":0')
  })
})
