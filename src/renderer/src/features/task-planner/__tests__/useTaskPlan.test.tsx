// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RUN_TOOL_EVENTS } from '@shared/run/tool-events'
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
  let hookResult: ReturnType<typeof useTaskPlan> | undefined

  function Probe(): null {
    hookResult = useTaskPlan('chat-1')
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

  it('shows the plan review only for canonical plan action=create', async () => {
    await renderProbe()

    await act(async () => {
      runEventMock.handler?.({
        type: RUN_TOOL_EVENTS.TOOL_CONFIRMATION_REQUIRED,
        payload: {
          toolCallId: 'call-plan-update',
          name: 'plan',
          args: { action: 'update', plan: { id: 'plan-1' } }
        }
      })
    })
    expect(hookResult?.pendingPlanReview).toBeNull()

    await act(async () => {
      runEventMock.handler?.({
        type: RUN_TOOL_EVENTS.TOOL_CONFIRMATION_REQUIRED,
        payload: {
          toolCallId: 'call-plan-create',
          name: 'plan',
          args: {
            action: 'create',
            goal: 'Ship feature',
            steps: [{ id: '2', title: 'Verify', status: 'todo' }]
          }
        }
      })
    })

    expect(hookResult?.pendingPlanReview).toMatchObject({
      toolCallId: 'call-plan-create',
      plan: {
        goal: 'Ship feature',
        status: 'pending_review'
      }
    })
  })

  it('refreshes plans after a canonical plan action without a plan result', async () => {
    await renderProbe()
    runEventMock.getPlansByChatUuid.mockClear()

    await act(async () => {
      runEventMock.handler?.({
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
