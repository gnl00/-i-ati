import { describe, expect, it, vi } from 'vitest'
import { ToolExecutor } from '../tool-executor'

const { handlerMock } = vi.hoisted(() => ({
  handlerMock: vi.fn(async (args: any) => ({ ok: true, args }))
}))

vi.mock('@tools/registry', () => ({
  embeddedToolsRegistry: {
    isRegistered: vi.fn((name: string) => name === 'schedule_create' || name === 'plan_get_current_chat'),
    getHandler: vi.fn(() => handlerMock)
  }
}))

vi.mock('@main/mcp/client', () => ({
  toolCall: vi.fn()
}))

vi.mock('@main/tools/command/CommandProcessor', () => ({
  assessCommandRisk: vi.fn(() => ({ level: 'safe', reason: '' }))
}))

describe('ToolExecutor runtime context', () => {
  it('overrides chat_uuid for schedule tools from runtime context', async () => {
    const executor = new ToolExecutor({
      chatUuid: 'chat-runtime'
    })

    await executor.execute([{
      id: 'call-1',
      function: 'schedule_create',
      args: JSON.stringify({
        chat_uuid: 'chat-from-llm',
        goal: 'goal',
        run_at: '2026-02-06T18:00:00+08:00'
      })
    } as any])

    expect(handlerMock).toHaveBeenCalledTimes(1)
    const callArgs = handlerMock.mock.calls[0][0]
    expect(callArgs.chat_uuid).toBe('chat-runtime')
  })

  it('overrides chat_uuid for plan tools from runtime context', async () => {
    handlerMock.mockClear()
    const executor = new ToolExecutor({
      chatUuid: 'chat-runtime'
    })

    await executor.execute([{
      id: 'call-2',
      function: 'plan_get_current_chat',
      args: JSON.stringify({
        chat_uuid: 'chat-from-llm'
      })
    } as any])

    expect(handlerMock).toHaveBeenCalledTimes(1)
    const callArgs = handlerMock.mock.calls[0][0]
    expect(callArgs.chat_uuid).toBe('chat-runtime')
  })
})
