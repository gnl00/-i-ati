// @vitest-environment happy-dom

import { act } from 'react'
import type React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const persistenceMocks = vi.hoisted(() => ({
  getChatSkills: vi.fn(),
  getCompressedSummariesByChatId: vi.fn()
}))

vi.mock('@renderer/infrastructure/persistence/ChatSkillRepository', () => ({
  getChatSkills: persistenceMocks.getChatSkills
}))

vi.mock('@renderer/infrastructure/persistence/CompressedSummaryRepository', () => ({
  getCompressedSummariesByChatId: persistenceMocks.getCompressedSummariesByChatId
}))

import { useChatStatsData } from '../useChatStatsData'

type Snapshot = ReturnType<typeof useChatStatsData>

function Probe({
  chatId,
  revision,
  onSnapshot
}: {
  chatId: number | null
  revision: number
  onSnapshot: (snapshot: Snapshot) => void
}): React.JSX.Element | null {
  onSnapshot(useChatStatsData(chatId, revision))
  return null
}

describe('useChatStatsData', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    persistenceMocks.getChatSkills.mockReset()
    persistenceMocks.getCompressedSummariesByChatId.mockReset()
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  it('reloads active summary coverage after completion invalidation', async () => {
    const snapshots: Snapshot[] = []
    persistenceMocks.getChatSkills.mockResolvedValue(['review'])
    persistenceMocks.getCompressedSummariesByChatId
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: 9,
        status: 'active',
        messageIds: [1, 2]
      }])
      .mockRejectedValueOnce(new Error('database unavailable'))

    await act(async () => {
      root.render(<Probe chatId={1} revision={0} onSnapshot={snapshot => snapshots.push(snapshot)} />)
    })
    expect(snapshots.at(-1)?.activeCompressedMessageIds.size).toBe(0)

    await act(async () => {
      root.render(<Probe chatId={1} revision={1} onSnapshot={snapshot => snapshots.push(snapshot)} />)
    })

    expect(persistenceMocks.getCompressedSummariesByChatId).toHaveBeenCalledTimes(2)
    expect(persistenceMocks.getChatSkills).toHaveBeenCalledTimes(1)
    expect(snapshots.at(-1)?.activeCompressedMessageIds).toEqual(new Set([1, 2]))
    expect(snapshots.at(-1)?.compressionCount).toBe(1)

    await act(async () => {
      root.render(<Probe chatId={1} revision={2} onSnapshot={snapshot => snapshots.push(snapshot)} />)
    })

    expect(snapshots.at(-1)?.activeCompressedMessageIds).toEqual(new Set([1, 2]))
    expect(snapshots.at(-1)?.compressionCount).toBe(1)
    expect(persistenceMocks.getChatSkills).toHaveBeenCalledTimes(1)
  })

  it('publishes a summary snapshot while the skills query is still pending', async () => {
    const snapshots: Snapshot[] = []
    persistenceMocks.getChatSkills.mockReturnValue(new Promise<string[]>(() => undefined))
    persistenceMocks.getCompressedSummariesByChatId.mockResolvedValue([{
      id: 7,
      status: 'active',
      messageIds: [70]
    }])

    await act(async () => {
      root.render(<Probe chatId={7} revision={0} onSnapshot={snapshot => snapshots.push(snapshot)} />)
    })

    expect(snapshots.at(-1)?.hasSnapshot).toBe(true)
    expect(snapshots.at(-1)?.activeCompressedMessageIds).toEqual(new Set([70]))
    expect(snapshots.at(-1)?.activeSkills).toEqual([])
  })

  it('ignores a late persistence response from the previous chat', async () => {
    const snapshots: Snapshot[] = []
    let resolveFirstSummaries: (value: CompressedSummaryEntity[]) => void = () => undefined
    const firstSummaries = new Promise<CompressedSummaryEntity[]>(resolve => {
      resolveFirstSummaries = resolve
    })

    persistenceMocks.getChatSkills
      .mockImplementationOnce(() => new Promise<string[]>(() => undefined))
      .mockResolvedValueOnce(['chat-2-skill'])
    persistenceMocks.getCompressedSummariesByChatId
      .mockReturnValueOnce(firstSummaries)
      .mockResolvedValueOnce([{
        id: 2,
        status: 'active',
        messageIds: [22]
      }])

    await act(async () => {
      root.render(<Probe chatId={1} revision={0} onSnapshot={snapshot => snapshots.push(snapshot)} />)
    })
    await act(async () => {
      root.render(<Probe chatId={2} revision={0} onSnapshot={snapshot => snapshots.push(snapshot)} />)
    })

    resolveFirstSummaries([{
      id: 1,
      status: 'active',
      messageIds: [11]
    }] as CompressedSummaryEntity[])
    await act(async () => {
      await Promise.resolve()
    })

    expect(snapshots.at(-1)?.chatId).toBe(2)
    expect(snapshots.at(-1)?.activeCompressedMessageIds).toEqual(new Set([22]))
  })
})
