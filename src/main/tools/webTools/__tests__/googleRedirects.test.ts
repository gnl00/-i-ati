import { EventEmitter } from 'events'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('electron', () => ({ net: { request: mocks.request } }))
import { resolveGoogleResultUrls } from '../search-engine/google'

function request(): EventEmitter & { abort: ReturnType<typeof vi.fn>; followRedirect: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> } {
  return Object.assign(new EventEmitter(), { abort: vi.fn(), followRedirect: vi.fn(), end: vi.fn() })
}
const item = { link: 'https://www.google.com/goto?url=opaque', title: 'Article', snippet: 'Snippet' }

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks() })

describe('Google opaque redirects', () => {
  it('returns destination metadata and aborts before downloading the page', async () => {
    const req = request()
    mocks.request.mockReturnValue(req)
    const pending = resolveGoogleResultUrls([item], new AbortController().signal)
    req.emit('redirect', 302, 'GET', 'https://react.dev/reference/react/useEffect')
    expect(await pending).toEqual([{ ...item, link: 'https://react.dev/reference/react/useEffect' }])
    expect(req.abort).toHaveBeenCalledOnce()
  })

  it('follows an internal Google hop before resolving an external target', async () => {
    const req = request()
    mocks.request.mockReturnValue(req)
    const pending = resolveGoogleResultUrls([item], new AbortController().signal)
    req.emit('redirect', 302, 'GET', 'https://www.google.com/url?q=https://react.dev')
    expect(req.followRedirect).toHaveBeenCalledOnce()
    req.emit('redirect', 302, 'GET', 'https://react.dev/')
    expect(await pending).toEqual([{ ...item, link: 'https://react.dev/' }])
  })

  it('bounds an unresolved redirect and omits it', async () => {
    vi.useFakeTimers()
    const req = request()
    mocks.request.mockReturnValue(req)
    const pending = resolveGoogleResultUrls([item], new AbortController().signal)
    await vi.advanceTimersByTimeAsync(5000)
    expect(await pending).toEqual([])
    expect(req.abort).toHaveBeenCalledOnce()
  })

  it('propagates cancellation and aborts the request', async () => {
    const req = request()
    mocks.request.mockReturnValue(req)
    const controller = new AbortController()
    const pending = resolveGoogleResultUrls([item], controller.signal)
    const rejected = expect(pending).rejects.toThrow()
    controller.abort()
    await rejected
    expect(req.abort).toHaveBeenCalledOnce()
  })

  it.each(['error', 'response'])('omits redirects ending in %s', async event => {
    const req = request()
    mocks.request.mockReturnValue(req)
    const pending = resolveGoogleResultUrls([item], new AbortController().signal)
    req.emit(event, new Error('Failed'))
    expect(await pending).toEqual([])
  })

  it('rejects non-web redirect targets and leaves direct URLs untouched', async () => {
    const req = request()
    mocks.request.mockReturnValue(req)
    const direct = { ...item, link: 'https://react.dev/' }
    const pending = resolveGoogleResultUrls([item, direct], new AbortController().signal)
    req.emit('redirect', 302, 'GET', 'file:///etc/passwd')
    expect(await pending).toEqual([direct])
    expect(mocks.request).toHaveBeenCalledOnce()
  })
})
