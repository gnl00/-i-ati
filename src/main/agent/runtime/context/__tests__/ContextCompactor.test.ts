import { beforeEach, describe, expect, it, vi } from 'vitest'
import { compactContext } from '../ContextCompactor'
const { send, prepare } = vi.hoisted(() => ({
  send: vi.fn(),
  prepare: vi.fn()
}))
vi.mock('@main/request', () => ({
  unifiedChatRequest: send,
  prepareUnifiedRequestBody: prepare
}))
const requestSpec = {
  adapterPluginId: 'test',
  apiKey: '',
  baseUrl: '',
  model: 'gpt-4o',
  contextWindowTokens: 10_000
}
beforeEach(() => {
  send.mockReset().mockResolvedValue({ content: ' summary ' })
  prepare.mockReset().mockImplementation(async (request) => ({
    body: {
      messages: request.messages,
      system: request.systemPrompt,
      max_tokens: request.options.maxTokens
    }
  }))
})
describe('compactContext', () => {
  it('uses the shared summary prompt, no tools, sanitized overrides and the caller cancellation signal', async () => {
    const controller = new AbortController()
    expect(
      await compactContext({
        text: 'stable model evidence',
        previousSummary: 'prior facts',
        signal: controller.signal,
        requestSpec: {
          ...requestSpec,
          requestOverrides: {
            temperature: 0.2,
            thinking: { type: 'enabled' },
            tool_choice: 'auto'
          }
        }
      })
    ).toBe('summary')
    const request = send.mock.calls[0][0]
    expect(request.messages[0].content).toContain('stable model evidence')
    expect(request.messages[0].content).toContain('prior facts')
    expect(request.messages[0].content).toContain('Pending Tasks')
    expect(request.tools).toBeUndefined()
    expect(request.requestOverrides).toEqual({ temperature: 0.2 })
    expect(send.mock.calls[0][1]).toBe(controller.signal)
  })
  it('refuses oversized effective input before dispatch', async () => {
    prepare.mockResolvedValue({
      body: { messages: 'large evidence\n'.repeat(10_000), max_tokens: 2_048 }
    })
    await expect(compactContext({ text: 'small source', requestSpec })).rejects.toThrow(
      'Compression input exceeds'
    )
    expect(send).not.toHaveBeenCalled()
  })
  it('rejects empty summaries and checks cancellation after a slow provider', async () => {
    send.mockResolvedValue({ content: '' })
    await expect(compactContext({ text: 'source', requestSpec })).rejects.toThrow('empty summary')
    const controller = new AbortController()
    send.mockImplementation(async () => {
      controller.abort()
      return { content: 'summary' }
    })
    await expect(
      compactContext({
        text: 'source',
        requestSpec,
        signal: controller.signal
      })
    ).rejects.toThrow()
  })
})
