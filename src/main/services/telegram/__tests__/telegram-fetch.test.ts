import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { telegramFetch } from '../telegram-fetch'

const require = createRequire(import.meta.url)
const { AbortController: PolyfillAbortController } = require(
  join(dirname(require.resolve('grammy')), 'shim.node.js'),
) as { AbortController: typeof AbortController }

const { fetchMock, logError } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  logError: vi.fn(),
}))
vi.mock('electron', () => ({ net: { fetch: fetchMock } }))
vi.mock('@main/logging/LogService', () => ({
  createLogger: (): { error: typeof logError } => ({ error: logError }),
}))
afterEach(() => vi.resetAllMocks())

describe('telegramFetch', () => {
  it('converts a polyfill signal and forwards cancellation, then removes its listener', async () => {
    const source = new PolyfillAbortController()
    const remove = vi.spyOn(source.signal, 'removeEventListener')
    fetchMock.mockImplementation(async (_url, init) => {
      expect(init.signal).toBeInstanceOf(AbortSignal)
      source.abort()
      expect(init.signal.aborted).toBe(true)
      throw new DOMException('Cancelled', 'AbortError')
    })
    await expect(
      telegramFetch('https://api.telegram.org/bot123:fake/getMe', {
        signal: source.signal as unknown as AbortSignal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
  })

  it('preserves an already aborted signal and its reason', async () => {
    const source = new AbortController()
    source.abort('stop')
    fetchMock.mockImplementation(async (_url, init) => {
      expect(init.signal.aborted).toBe(true)
      expect(init.signal.reason).toBe('stop')
      return new Response('{}')
    })
    await telegramFetch('https://api.telegram.org', { signal: source.signal })
  })

  it('cleans up after success and retains request options', async () => {
    const source = new PolyfillAbortController()
    const remove = vi.spyOn(source.signal, 'removeEventListener')
    const response = new Response('{}')
    fetchMock.mockResolvedValue(response)
    expect(
      await telegramFetch('https://api.telegram.org', {
        signal: source.signal as unknown as AbortSignal,
        method: 'POST',
        body: '{}',
      }),
    ).toBe(response)
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      body: '{}',
    })
    expect(remove).toHaveBeenCalledOnce()
  })

  it('logs the underlying error with credentials redacted and rethrows it', async () => {
    const token = '123:fake-secret'
    const error = new TypeError(
      `Failed https://api.telegram.org/bot${token}/getMe; ${token}; api_key=secret`,
    )
    fetchMock.mockRejectedValue(error)
    await expect(
      telegramFetch(`https://api.telegram.org/bot${token}/getMe`),
    ).rejects.toBe(error)
    const diagnostic = logError.mock.calls[0][1]
    expect(diagnostic.name).toBe('TypeError')
    expect(diagnostic.message).toContain(
      'Failed https://api.telegram.org/bot[REDACTED]/getMe',
    )
    expect(diagnostic.message).not.toContain(token)
    expect(diagnostic.message).not.toContain('api_key=secret')
    expect(diagnostic).not.toHaveProperty('stack')
  })
})
