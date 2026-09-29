// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RUN_TOOL_EVENTS } from '@shared/run/tool-events'
import type { ToolConfirmation } from '@shared/tools/confirmation'
import { useTaskPlan } from '../useTaskPlan'

const runEventMock = vi.hoisted(() => ({
  handler: undefined as ((event: any) => void) | undefined,
  unsubscribe: vi.fn(),
  invokeRunToolConfirm: vi.fn(async () => ({ ok: true })),
  getPlansByChatUuid: vi.fn(async () => [])
}))

vi.mock('@renderer/infrastructure/ipc', () => ({
  invokeRunToolConfirm: runEventMock.invokeRunToolConfirm,
  subscribeRunEvents: vi.fn((handler: (event: any) => void) => {
    runEventMock.handler = handler
    return runEventMock.unsubscribe
  })
}))

vi.mock('@renderer/features/task-planner/TaskPlannerService', () => ({
  taskPlannerService: {
    getPlansByChatUuid: runEventMock.getPlansByChatUuid
  }
}))

const flushPromises = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('useTaskPlan', () => {
  let container: HTMLDivElement
  let root: Root
  let approvals: ToolConfirmation[] = []
  const confirm = vi.fn(async () => {})
  const cancel = vi.fn(async () => {})
  let hookResult: ReturnType<typeof useTaskPlan> | undefined

  function Probe(): null {
    hookResult = useTaskPlan('chat-1', { pending: approvals, confirm, cancel })
    return null
  }

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    runEventMock.handler = undefined
    runEventMock.unsubscribe.mockReset()
    runEventMock.invokeRunToolConfirm.mockClear()
    runEventMock.getPlansByChatUuid.mockClear()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    hookResult = undefined
    approvals = []
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  const renderProbe = async (): Promise<void> => {
    await act(async () => {
      root.render(<Probe />)
      await flushPromises()
    })
  }

  it('derives plan review from the authoritative approval projection and submits its identity', async () => {
    const base: ToolConfirmation = {
      confirmationId: 'approval', submissionId: 'run', chatUuid: 'chat-1', toolCallId: 'call-plan-create', name: 'plan',
      status: 'pending', version: 1, createdAt: 1, expiresAt: 300001,
      args: { action: 'update' }
    }
    approvals = [base]
    await renderProbe()
    expect(hookResult?.pendingPlanReview).toBeNull()
    approvals = [{ ...base, args: { action: 'create', goal: 'Ship feature', steps: [{ id: '2', title: 'Verify', status: 'todo' }] } }]
    await renderProbe()
    expect(hookResult?.pendingPlanReview).toMatchObject({ toolCallId: 'call-plan-create', plan: { goal: 'Ship feature', status: 'pending_review' } })
    await act(async () => hookResult?.approvePlanReview())
    expect(confirm).toHaveBeenCalledWith('approval')
    approvals = []
    await renderProbe()
    expect(hookResult?.pendingPlanReview).toBeNull()
  })

  it('refreshes plans after a canonical plan action without a plan result', async () => {
    await renderProbe()
    runEventMock.getPlansByChatUuid.mockClear()

    await act(async () => {
      runEventMock.handler?.({
        chatUuid: 'chat-1',
        type: RUN_TOOL_EVENTS.TOOL_CALL_DETECTED,
        payload: {
          toolCall: {
            id: 'call-plan-delete',
            name: 'plan',
            args: JSON.stringify({ action: 'delete', id: 'plan-1' })
          }
        }
      })
      runEventMock.handler?.({
        chatUuid: 'chat-1',
        type: RUN_TOOL_EVENTS.TOOL_EXECUTION_COMPLETED,
        payload: {
          toolCallId: 'call-plan-delete',
          result: { success: true },
          cost: 1
        }
      })
      await flushPromises()
    })

    expect(runEventMock.getPlansByChatUuid).toHaveBeenCalledWith('chat-1')
  })
})
