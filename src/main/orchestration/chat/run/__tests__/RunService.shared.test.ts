import { expect, it, vi } from 'vitest'
import { ToolConfirmationManager } from '../infrastructure/tool-confirmation'
import type { RunRuntimeDeps } from '../runtime/RunRuntimeFactory'

const createRuntime = vi.hoisted(() => vi.fn())
vi.mock('../runtime/RunRuntimeFactory', () => ({ RunRuntimeFactory: class { create = createRuntime } }))
import { RunService } from '..'

it('shares the default runtime between Chat IPC and Telegram while injected runtimes stay isolated', async () => {
  const manager = new ToolConfirmationManager()
  createRuntime.mockReturnValue({ toolConfirmationManager: manager })
  const telegram = new RunService()
  const chat = new RunService()
  const isolated = new RunService({ toolConfirmationManager: new ToolConfirmationManager() } as RunRuntimeDeps)
  const emit = vi.fn()
  const promise = manager.request({ submissionId: 'run', chatUuid: 'chat', emit, setChatMeta: vi.fn() }, { toolCallId: 'call', name: 'exec' }, { peerId: '123' })
  const descriptor = chat.getToolConfirmationSnapshot('chat').confirmations[0]
  expect(createRuntime).toHaveBeenCalledTimes(1)
  expect(isolated.getToolConfirmationSnapshot('chat').confirmations).toEqual([])
  expect(chat.submitToolConfirmation({ ...descriptor, approved: true }, 'chat').ok).toBe(true)
  await expect(promise).resolves.toEqual({ approved: true })
  expect(telegram.submitTelegramToolConfirmation(descriptor.confirmationId, { approved: false }, { host: 'telegram', peerId: '123' })).toMatchObject({ ok: false, confirmation: { status: 'approved' } })
})
