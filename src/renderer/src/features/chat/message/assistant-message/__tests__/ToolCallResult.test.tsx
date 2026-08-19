// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
  ToolCallInspectorDetails,
  ToolCallResult
} from '../toolcall/ToolCallResult'
import { ToolCallInspectorContent } from '../toolcall/ToolCallInspectorContent'
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

describe('ToolCallResult', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
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

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  it('opens the Tools tab and stores only the selected identity', async () => {
    const toolCall = createToolCall()
    await act(async () => root.render(<ToolCallResult toolCall={toolCall} index={0} />))

    const result = container.querySelector('[data-testid="tool-call-result"]')
    const trigger = container.querySelector('button')
    const header = container.querySelector('[data-testid="tool-call-trigger-content-segment-tool-1"]')
    const status = container.querySelector('[data-testid="tool-call-trigger-status-segment-tool-1"]')
    const name = container.querySelector('[data-testid="tool-call-trigger-name-segment-tool-1"]')
    const inspectorIcon = container.querySelector('[data-testid="tool-call-inspector-icon-segment-tool-1"]')
    expect(result?.classList.contains('w-[90%]')).toBe(true)
    expect(result?.classList.contains('max-w-full')).toBe(true)
    expect(trigger?.classList.contains('w-full')).toBe(true)
    expect(trigger?.classList.contains('duration-150')).toBe(true)
    expect(trigger?.classList.contains('border-slate-200/24')).toBe(true)
    expect(trigger?.classList.contains('hover:border-slate-200/36')).toBe(true)
    expect(header?.classList.contains('grid-cols-[auto_minmax(0,1fr)_auto_auto]')).toBe(true)
    expect(status?.classList.contains('h-5')).toBe(true)
    expect(status?.classList.contains('rounded-md')).toBe(true)
    expect(status?.classList.contains('border-emerald-200/70')).toBe(true)
    expect(status?.classList.contains('bg-emerald-50/85')).toBe(true)
    expect(status?.querySelector('svg')?.classList.contains('text-emerald-700')).toBe(true)
    expect(name?.textContent).toBe('search')
    expect(name?.classList.contains('uppercase')).toBe(true)
    expect(inspectorIcon?.getAttribute('aria-hidden')).toBe('true')

    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(useChatStore.getState()).toMatchObject({
      artifactsPanelOpen: true,
      artifactsActiveTab: 'tools',
      toolCallInspectorSelection: {
        chatUuid: 'chat-1',
        segmentId: 'segment-tool-1',
        toolCallId: 'tool-1'
      }
    })
    expect(container.querySelector('button')?.getAttribute('aria-pressed')).toBe('true')
    expect(trigger?.classList.contains('border-slate-400/45')).toBe(true)
    expect(status?.classList.contains('scale-[1.03]')).toBe(true)
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('keeps the terminal duration visible in the tool row', async () => {
    await act(async () => root.render(<ToolCallResult toolCall={createToolCall()} index={0} />))
    expect(container.textContent).toContain('0.08s')
  })

  it('rounds the terminal duration to two decimal places', async () => {
    const toolCall = {
      ...createToolCall(),
      cost: 1086
    }
    await act(async () => root.render(<ToolCallResult toolCall={toolCall} index={0} />))

    expect(container.textContent).toContain('1.09s')
    expect(container.textContent).not.toContain('1.086s')
  })

  it('updates the running duration from the execution start', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    await act(async () => root.render(<ToolCallResult toolCall={createToolCall('running')} index={0} />))
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
          <ToolCallResult toolCall={toolCall} index={0} />
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
    expect(parametersContent?.classList.contains('custom-scrollbar')).toBe(true)
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
      expect(copyButton?.className).toContain('transition-all')
      expect(copyButton?.className).toContain('hover:scale-110')
      expect(copyButton?.title).toBe(label)

      await act(async () => {
        copyButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
    }

    expect(clipboardWriteText).toHaveBeenNthCalledWith(1, JSON.stringify(args, null, 2))
    expect(clipboardWriteText).toHaveBeenNthCalledWith(2, 'standard output\nstandard error')
    expect(clipboardWriteText).toHaveBeenNthCalledWith(3, '{\n  "success": true\n}')
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
