import { describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ run: vi.fn() }))
vi.mock('@main/orchestration/chat/run/infrastructure', () => ({ RunEventEmitterFactory: class {} }))
vi.mock('@main/hosts/chat/config/AppConfigStore', () => ({ AppConfigStore: class { getConfig(): object { return {} } } }))
vi.mock('../TitleJobService', () => ({ TitleJobService: class { run = state.run } }))
vi.mock('../CompressionJobService', () => ({ CompressionJobService: class {} }))
import { PostRunJobService } from '../PostRunJobService'
import type { PostRunJobInput } from '../types'

describe('post-run shutdown barrier', () => {
  it('waits for background work to settle before allowing database shutdown', async () => {
    let finish!: () => void
    state.run.mockReturnValue(new Promise<void>(resolve => { finish = resolve }))
    const jobs = new PostRunJobService()
    const running = jobs.run({} as PostRunJobInput, { title: 'pending', compression: 'skipped' })
    let drained = false
    const drain = jobs.waitForIdle().then(() => { drained = true })
    await Promise.resolve()
    expect(drained).toBe(false)
    finish()
    await running
    await drain
    expect(drained).toBe(true)
  })
  it('also drains failed jobs without leaving the shutdown barrier pending', async () => {
    state.run.mockRejectedValue(new Error('failed'))
    const jobs = new PostRunJobService()
    await jobs.run({} as PostRunJobInput, { title: 'pending', compression: 'skipped' })
    await jobs.waitForIdle()
  })
})
