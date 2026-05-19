// @vitest-environment happy-dom

import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useToolConfirmationStore } from '@renderer/store/toolConfirmation'

const commandConfirmationProps: Array<{
  request: {
    command: string
    risk_level: 'risky' | 'dangerous'
    execution_reason: string
    possible_risk: string
    pending_count?: number
  }
  onConfirm: () => void | Promise<void>
  onCancel: () => void | Promise<void>
}> = []

const invokeRunToolConfirm = vi.fn(async () => ({ ok: true }))

vi.mock('@renderer/invoker/ipcInvoker', () => ({
  invokeRunToolConfirm: (data: unknown) => invokeRunToolConfirm(data)
}))

vi.mock('../../chatMessage/assistant-message/CommandConfirmation', () => ({
  CommandConfirmation: (props: typeof commandConfirmationProps[number]) => {
    commandConfirmationProps.push(props)
    return (
      <div data-testid="command-confirmation">
        {props.request.command}
      </div>
    )
  }
}))

import { ChatInputToolConfirmation } from '../ChatInputToolConfirmation'

describe('ChatInputToolConfirmation', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    commandConfirmationProps.length = 0
    invokeRunToolConfirm.mockClear()
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    useToolConfirmationStore.setState({
      pendingRequests: []
    })
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it('renders execute_command confirmation from the input area queue', async () => {
    useToolConfirmationStore.setState({
      pendingRequests: [
        {
          toolCallId: 'call-1',
          name: 'execute_command',
          ui: {
            command: 'rm -rf /tmp/x',
            riskLevel: 'dangerous',
            executionReason: 'Need cleanup',
            possibleRisk: 'Deletes files'
          }
        },
        {
          toolCallId: 'call-2',
          name: 'execute_command',
          args: {
            command: 'pwd'
          }
        }
      ]
    })

    await act(async () => {
      root.render(<ChatInputToolConfirmation />)
    })

    expect(container.textContent).toContain('rm -rf /tmp/x')
    expect(commandConfirmationProps[0].request).toMatchObject({
      command: 'rm -rf /tmp/x',
      risk_level: 'dangerous',
      execution_reason: 'Need cleanup',
      possible_risk: 'Deletes files',
      pending_count: 2
    })
  })

  it('confirms and cancels the active pending request', async () => {
    useToolConfirmationStore.setState({
      pendingRequests: [
        {
          toolCallId: 'call-1',
          name: 'execute_command',
          args: {
            command: 'pnpm test'
          }
        }
      ]
    })

    await act(async () => {
      root.render(<ChatInputToolConfirmation />)
    })

    await act(async () => {
      await commandConfirmationProps[0].onConfirm()
    })

    expect(invokeRunToolConfirm).toHaveBeenCalledWith({
      toolCallId: 'call-1',
      approved: true
    })

    await act(async () => {
      useToolConfirmationStore.setState({
        pendingRequests: [
          {
            toolCallId: 'call-2',
            name: 'execute_command',
            args: {
              command: 'rm -rf build'
            }
          }
        ]
      })
    })

    await act(async () => {
      root.render(<ChatInputToolConfirmation />)
    })

    await act(async () => {
      await commandConfirmationProps.at(-1)?.onCancel()
    })

    expect(invokeRunToolConfirm).toHaveBeenCalledWith({
      toolCallId: 'call-2',
      approved: false,
      reason: 'user abort'
    })
  })
})
