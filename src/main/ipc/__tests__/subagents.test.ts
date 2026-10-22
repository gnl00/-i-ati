import { expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ handle: vi.fn(), list: vi.fn(() => []) }))
vi.mock('electron', () => ({ ipcMain: { handle: mocks.handle } }))
vi.mock('@main/services/subagent/subagent-run-service', () => ({ default: { list: mocks.list } }))
import { registerSubagentHandlers } from '../subagents'
import { SUBAGENT_SNAPSHOT_CHANNEL } from '@shared/subagent/events'

it('validates the chat identity and returns its child snapshots', () => {
  registerSubagentHandlers()
  const handler = mocks.handle.mock.calls.find(([channel]) => channel === SUBAGENT_SNAPSHOT_CHANNEL)![1]
  for (const input of [null, {}, { chatUuid: '' }, { chatUuid: 1 }, { chatUuid: 'x'.repeat(257) }]) expect(() => handler({}, input)).toThrow('Invalid')
  expect(handler({}, { chatUuid: 'chat' })).toEqual([])
  expect(mocks.list).toHaveBeenCalledExactlyOnceWith('chat')
})
