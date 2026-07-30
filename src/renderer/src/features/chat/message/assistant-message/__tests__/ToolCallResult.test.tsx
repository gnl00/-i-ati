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

    await act(async () => {
      container.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
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
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('keeps the terminal duration visible in the tool row', async () => {
    await act(async () => root.render(<ToolCallResult toolCall={createToolCall()} index={0} />))
    expect(container.textContent).toContain('0.080s')
  })

  it('updates the running duration from the execution start', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    await act(async () => root.render(<ToolCallResult toolCall={createToolCall('running')} index={0} />))
    expect(container.textContent).toContain('0.080s')

    await act(async () => vi.advanceTimersByTime(1000))
    expect(container.textContent).toContain('1.080s')
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
    const toolCall = createToolCall('completed', { success: true })
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
      expect(copyButton?.className).toContain('transition-colors')
      expect(copyButton?.title).toBe(label)

      await act(async () => {
        copyButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
    }

    expect(clipboardWriteText).toHaveBeenNthCalledWith(1, '{\n  "query": "latest status"\n}')
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
