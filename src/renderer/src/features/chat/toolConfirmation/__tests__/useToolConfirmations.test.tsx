// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { RunEvent } from '@shared/run/events'
import type { ToolConfirmation } from '@shared/tools/confirmation'
const ipc = vi.hoisted(() => ({ snapshot: vi.fn(), unsubscribe: vi.fn(), handler: undefined as ((event: RunEvent) => void) | undefined }))
vi.mock('@renderer/infrastructure/ipc', () => ({
  subscribeRunEvents: (handler: (event: RunEvent) => void): (() => void) => { ipc.handler = handler; return ipc.unsubscribe },
  invokeRunToolConfirm: vi.fn(), invokeToolConfirmationSnapshot: ipc.snapshot
}))
import { useToolConfirmations } from '../useToolConfirmations'
import { useToolConfirmationStore } from '../../state/toolConfirmationStore'
const pending: ToolConfirmation = { confirmationId: 'approval', submissionId: 'run', chatUuid: 'chat', toolCallId: 'tool', name: 'exec', status: 'pending', version: 1, createdAt: 1, expiresAt: 300001 }
let root: Root
let container: HTMLDivElement
function Harness({ chatUuid }: { chatUuid: string }): null { useToolConfirmations(chatUuid); return null }
beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  ipc.snapshot.mockReset()
  ipc.unsubscribe.mockClear()
  ipc.handler = undefined
  ipc.snapshot.mockImplementation(async () => {
    expect(ipc.handler).toBeDefined()
    return { version: 1, confirmations: [pending] }
  })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })

it('hydrates after subscribing, closes on remote resolution, and recovers on focus', async () => {
  await act(async () => root.render(<Harness chatUuid="chat" />))
  expect(useToolConfirmationStore.getState().pendingRequests).toHaveLength(1)
  act(() => ipc.handler?.({ type: 'tool.confirmation.resolved', payload: { ...pending, status: 'approved', version: 2 }, submissionId: 'run', chatUuid: 'chat', timestamp: 2, sequence: 2 }))
  expect(useToolConfirmationStore.getState().pendingRequests).toEqual([])
  ipc.snapshot.mockResolvedValue({ version: 3, confirmations: [{ ...pending, confirmationId: 'new', version: 3 }] })
  await act(async () => window.dispatchEvent(new Event('focus')))
  expect(useToolConfirmationStore.getState().pendingRequests[0].confirmationId).toBe('new')
  await act(async () => root.render(<Harness chatUuid="other" />))
  act(() => ipc.handler?.({ type: 'tool.confirmation.required', payload: pending, submissionId: 'run', chatUuid: 'chat', timestamp: 1, sequence: 1 }))
  expect(useToolConfirmationStore.getState().pendingRequests).toEqual([])
  expect(ipc.unsubscribe).toHaveBeenCalled()
})
