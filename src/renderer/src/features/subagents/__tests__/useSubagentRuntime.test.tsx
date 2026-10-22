// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { useSubagentRuntime } from '../useSubagentRuntime'
import { useSubagentRuntimeStore } from '../subagentRuntimeStore'
import type { SubagentRecord } from '@tools/subagent/index.d'
const mocks = vi.hoisted(() => ({ subscribe: vi.fn(() => (): void => {}), snapshot: vi.fn() }))
vi.mock('@renderer/infrastructure/ipc', () => ({ subscribeRunEvents: mocks.subscribe, invokeSubagentSnapshot: mocks.snapshot }))

function Fixture({ chat }: { chat: string }): null { useSubagentRuntime(chat); return null }

it('restores saved status after remount and ignores a snapshot from a previous chat', async () => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  let finish!: (records: SubagentRecord[]) => void
  const record: SubagentRecord = { id: 'child', role: 'coder', task: 'inspect', status: 'interrupted', revision: 3, created_at: 1, parent_chat_uuid: 'chat' }
  mocks.snapshot.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  mocks.snapshot.mockResolvedValueOnce([])
  const node = document.createElement('div')
  const root = createRoot(node)
  await act(async () => root.render(<Fixture chat="chat" />))
  await act(async () => root.render(<Fixture chat="other" />))
  await act(async () => finish([record]))
  expect(useSubagentRuntimeStore.getState().recordsById).toEqual({})
  mocks.snapshot.mockResolvedValueOnce([record])
  await act(async () => root.render(<Fixture chat="chat" />))
  expect(useSubagentRuntimeStore.getState().recordsById.child.status).toBe('interrupted')
  await act(async () => root.unmount())
})
