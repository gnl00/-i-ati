import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToolExecutor } from '@main/agent/tools/ToolExecutor'
import { embeddedToolsRegistry } from '@tools/registry'
import { computerUseTools } from '@tools/computerUse/definitions'
import { computerUseToolMetadata } from '@tools/computerUse/metadata'
import { processComputerUse } from '../ComputerUseToolsProcessor'

const backend = vi.hoisted(() => ({
  diagnostics: vi.fn(async () => ({ available: true })),
  clickElement: vi.fn(async () => ({ clicked: true }))
}))

vi.mock('../ComputerUseBackendFactory', () => ({
  resolveComputerUseBackend: (): { kind: 'kwwk'; backend: typeof backend } => ({ kind: 'kwwk', backend })
}))
vi.mock('@main/services/mcpRuntime', () => ({
  mcpRuntimeService: { getToolSource: vi.fn(), callTool: vi.fn() }
}))
vi.mock('@main/tools/command/risk', () => ({ assessExecuteCommandReview: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
  embeddedToolsRegistry.register('computer_use', processComputerUse, computerUseTools[0], computerUseToolMetadata.computer_use)
})

describe('computer_use through ToolExecutor', () => {
  it('executes status with injected chat context and strips the public reason field', async () => {
    const requestConfirmation = vi.fn(async () => ({ approved: false }))
    const executor = new ToolExecutor({ chatUuid: 'chat-1', requestConfirmation })
    const [result] = await executor.execute([{
      id: 'status-1', function: 'computer_use',
      args: JSON.stringify({ action: 'status', tool_call_reason: 'Check availability' })
    }])
    expect(requestConfirmation).not.toHaveBeenCalled()
    expect(backend.diagnostics).toHaveBeenCalledExactlyOnceWith()
    expect(result.status).toBe('success')
  })

  it.each([false, true])('honors interaction confirmation approved=%s', async approved => {
    const requestConfirmation = vi.fn(async () => ({ approved }))
    const executor = new ToolExecutor({ chatUuid: 'chat-1', requestConfirmation })
    const [result] = await executor.execute([{
      id: 'click-1', function: 'computer_use',
      args: JSON.stringify({ action: 'click_element', snapshotId: 's1', elementIndex: 1, tool_call_reason: 'Click the observed button' })
    }])
    expect(requestConfirmation).toHaveBeenCalledOnce()
    expect(requestConfirmation.mock.calls[0]).toEqual([expect.objectContaining({
      name: 'computer_use', ui: expect.objectContaining({ riskLevel: 'dangerous' })
    })])
    if (approved) {
      expect(backend.clickElement).toHaveBeenCalledExactlyOnceWith({
        snapshotId: 's1', elementIndex: 1, includeScreenshotAfter: undefined
      })
      expect(result.status).toBe('success')
    } else {
      expect(backend.clickElement).not.toHaveBeenCalled()
      expect(result.status).toBe('aborted')
    }
  })
})
