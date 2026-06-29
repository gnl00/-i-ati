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
  disabled?: boolean
}> = []

const invokeRunToolConfirm = vi.fn(async (_data: unknown) => ({ ok: true }))

vi.mock('framer-motion', async () => {
  const React = await import('react')

  const passthrough = (tag: string) => (
    React.forwardRef<HTMLElement, Record<string, unknown> & { children?: React.ReactNode }>(({
      children,
      animate: _animate,
      exit: _exit,
      initial: _initial,
      layout: _layout,
      transition: _transition,
      whileHover: _whileHover,
      whileTap: _whileTap,
      ...props
    }, ref) => React.createElement(tag, { ...props, ref } as any, children as React.ReactNode))
  )

  return {
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    motion: {
      div: passthrough('div')
    },
    useReducedMotion: () => false
  }
})

vi.mock('@renderer/invoker/ipcInvoker', () => ({
  invokeRunToolConfirm: (data: unknown) => invokeRunToolConfirm(data)
}))

vi.mock('../../chatMessage/assistant-message/CommandConfirmation', () => ({
  CommandConfirmation: (props: typeof commandConfirmationProps[number]) => {
    commandConfirmationProps.push(props)
    return (
      <div data-testid="command-confirmation">
        {props.request.command}
        {props.disabled ? ' disabled' : ''}
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

  it('renders generic tool confirmations without expanding long content args', async () => {
    useToolConfirmationStore.setState({
      pendingRequests: [
        {
          toolCallId: 'call-wiki',
          name: 'wiki_write',
          args: {
            name: 'loop-engineering-paradigm-shift',
            content: 'x'.repeat(2000),
            mode: 'upsert',
            chat_uuid: 'chat-1'
          },
          ui: {
            title: 'Confirm wiki_write',
            riskLevel: 'risky',
            reason: 'Tool "wiki_write" can mutate workspace state.',
            possibleRisk: 'Tool "wiki_write" can mutate workspace state.',
            riskScore: 5
          }
        }
      ]
    })

    await act(async () => {
      root.render(<ChatInputToolConfirmation />)
    })

    expect(container.textContent).toContain('wiki_write')
    expect(commandConfirmationProps[0].request).toMatchObject({
      command: 'wiki_write {"name":"loop-engineering-paradigm-shift","content":"[content: 2000 chars]","mode":"upsert"}',
      risk_level: 'risky',
      execution_reason: 'Confirm wiki_write',
      possible_risk: 'Tool "wiki_write" can mutate workspace state.'
    })
    expect(commandConfirmationProps[0].request.command).not.toContain('chat-1')
    expect(commandConfirmationProps[0].request.command).not.toContain('xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')
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

  it('switches to the next queued confirmation when the active request changes', async () => {
    useToolConfirmationStore.setState({
      pendingRequests: [
        {
          toolCallId: 'call-1',
          name: 'execute_command',
          args: {
            command: 'git reset --hard'
          }
        },
        {
          toolCallId: 'call-2',
          name: 'execute_command',
          args: {
            command: 'git clean -fd'
          }
        }
      ]
    })

    await act(async () => {
      root.render(<ChatInputToolConfirmation />)
    })

    expect(container.textContent).toContain('git reset --hard')

    await act(async () => {
      useToolConfirmationStore.setState({
        pendingRequests: [
          {
            toolCallId: 'call-2',
            name: 'execute_command',
            args: {
              command: 'git clean -fd'
            }
          }
        ]
      })
    })

    expect(container.textContent).toContain('git clean -fd')
  })

  it('marks the card disabled while the active confirmation is settling', async () => {
    let resolveConfirm: (() => void) | undefined
    invokeRunToolConfirm.mockImplementationOnce(() => new Promise(resolve => {
      resolveConfirm = () => resolve({ ok: true })
    }))

    useToolConfirmationStore.setState({
      pendingRequests: [
        {
          toolCallId: 'call-1',
          name: 'execute_command',
          args: {
            command: 'git push --force'
          }
        }
      ]
    })

    await act(async () => {
      root.render(<ChatInputToolConfirmation />)
    })

    await act(async () => {
      void commandConfirmationProps[0].onConfirm()
      await Promise.resolve()
    })

    expect(commandConfirmationProps.at(-1)?.disabled).toBe(true)
    expect(container.textContent).toContain('disabled')

    await act(async () => {
      resolveConfirm?.()
      await Promise.resolve()
    })
  })
})
