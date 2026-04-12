import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DefaultModelStreamExecutor } from '../ModelStreamExecutor'
import type { ModelResponseChunk } from '../ModelResponseChunk'

const { unifiedChatRequestMock, getRequestErrorMetadataMock, loggerWarnMock } = vi.hoisted(() => ({
  unifiedChatRequestMock: vi.fn(),
  getRequestErrorMetadataMock: vi.fn(),
  loggerWarnMock: vi.fn()
}))

vi.mock('@main/request/index', () => ({
  unifiedChatRequest: unifiedChatRequestMock,
  getRequestErrorMetadata: getRequestErrorMetadataMock
}))

vi.mock('@main/logging/LogService', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: loggerWarnMock,
    error: vi.fn()
  }))
}))

describe('DefaultModelStreamExecutor', () => {
  beforeEach(() => {
    vi.resetModules()
    unifiedChatRequestMock.mockReset()
    getRequestErrorMetadataMock.mockReset()
    loggerWarnMock.mockReset()
  })

  it('retries once for retriable pre-stream network failures', async () => {
    const networkError = new TypeError('fetch failed')

    unifiedChatRequestMock
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce({
        id: 'resp-1',
        model: 'test-model',
        content: 'done'
      })
    getRequestErrorMetadataMock.mockReturnValue({
      kind: 'network',
      retriable: true,
      message: 'fetch failed'
    })

    const executor = new DefaultModelStreamExecutor({
      retryDelayMs: 1,
      sleep: vi.fn(async () => {})
    })

    const stream = await executor.execute({
      request: {
        adapterPluginId: 'openai-response-compatible-adapter',
        baseUrl: 'https://example.invalid/v1',
        apiKey: 'test-key',
        model: 'test-model',
        messages: [{ role: 'user', content: 'hello', segments: [] }],
        stream: true
      }
    })

    const chunks: ModelResponseChunk[] = []
    for await (const chunk of stream) {
      chunks.push(chunk)
    }

    expect(unifiedChatRequestMock).toHaveBeenCalledTimes(2)
    expect(loggerWarnMock).toHaveBeenCalledWith('request.retry_scheduled', expect.objectContaining({
      attempt: 1,
      nextAttempt: 2,
      reasonKind: 'network'
    }))
    expect(chunks).toEqual([
      expect.objectContaining({
        kind: 'delta',
        responseId: 'resp-1',
        model: 'test-model',
        content: 'done'
      }),
      expect.objectContaining({
        kind: 'final',
        responseId: 'resp-1',
        model: 'test-model'
      })
    ])
  })

  it('does not retry non-retriable request errors', async () => {
    const error = new Error('bad request')

    unifiedChatRequestMock.mockRejectedValueOnce(error)
    getRequestErrorMetadataMock.mockReturnValue({
      kind: 'unknown',
      retriable: false,
      message: 'bad request'
    })

    const executor = new DefaultModelStreamExecutor({
      retryDelayMs: 1,
      sleep: vi.fn(async () => {})
    })

    await expect(executor.execute({
      request: {
        adapterPluginId: 'openai-response-compatible-adapter',
        baseUrl: 'https://example.invalid/v1',
        apiKey: 'test-key',
        model: 'test-model',
        messages: [{ role: 'user', content: 'hello', segments: [] }],
        stream: true
      }
    })).rejects.toThrow('bad request')

    expect(unifiedChatRequestMock).toHaveBeenCalledTimes(1)
    expect(loggerWarnMock).not.toHaveBeenCalled()
  })

  it('normalizes response output_item.done tool calls as snapshot arguments', async () => {
    unifiedChatRequestMock.mockResolvedValueOnce({
      [Symbol.asyncIterator]: async function *() {
        yield {
          id: 'call_1',
          model: 'test-model',
          content: '',
          toolCalls: [{
            id: 'call_1',
            index: 0,
            type: 'function',
            function: {
              name: 'memory_retrieval',
              arguments: '{"query":"Gn preferences greeting tone playful","chatId":0,"topK":5,"threshold":0.6}'
            }
          }],
          finishReason: 'tool_calls',
          raw: {
            type: 'response.output_item.done',
            item: {
              type: 'function_call',
              call_id: 'call_1',
              name: 'memory_retrieval',
              arguments: '{"query":"Gn preferences greeting tone playful","chatId":0,"topK":5,"threshold":0.6}'
            }
          }
        }
      }
    })

    const executor = new DefaultModelStreamExecutor()

    const stream = await executor.execute({
      request: {
        adapterPluginId: 'openai-response-compatible-adapter',
        baseUrl: 'https://example.invalid/v1',
        apiKey: 'test-key',
        model: 'test-model',
        messages: [{ role: 'user', content: 'hello', segments: [] }],
        stream: true
      }
    })

    const chunks: ModelResponseChunk[] = []
    for await (const chunk of stream) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual([
      expect.objectContaining({
        kind: 'delta',
        toolCalls: [
          expect.objectContaining({
            argumentsMode: 'snapshot',
            toolCall: expect.objectContaining({
              function: expect.objectContaining({
                arguments: '{"query":"Gn preferences greeting tone playful","chatId":0,"topK":5,"threshold":0.6}'
              })
            })
          })
        ],
        finishReason: 'tool_calls'
      }),
      expect.objectContaining({
        kind: 'final',
        responseId: 'call_1',
        model: 'test-model'
      })
    ])
  })

  it('normalizes response.function_call_arguments.done tool calls as snapshot arguments', async () => {
    unifiedChatRequestMock.mockResolvedValueOnce({
      [Symbol.asyncIterator]: async function *() {
        yield {
          id: 'call_2',
          model: 'test-model',
          content: '',
          toolCalls: [{
            id: 'call_2',
            index: 0,
            type: 'function',
            function: {
              name: 'memory_retrieval',
              arguments: '{"query":"snapshot from done","chatId":0}'
            }
          }],
          raw: {
            type: 'response.function_call_arguments.done',
            item_id: 'fc_123',
            output_index: 0,
            arguments: '{"query":"snapshot from done","chatId":0}'
          }
        }
      }
    })

    const executor = new DefaultModelStreamExecutor()

    const stream = await executor.execute({
      request: {
        adapterPluginId: 'openai-response-compatible-adapter',
        baseUrl: 'https://example.invalid/v1',
        apiKey: 'test-key',
        model: 'test-model',
        messages: [{ role: 'user', content: 'hello', segments: [] }],
        stream: true
      }
    })

    const chunks: ModelResponseChunk[] = []
    for await (const chunk of stream) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual([
      expect.objectContaining({
        kind: 'delta',
        toolCalls: [
          expect.objectContaining({
            argumentsMode: 'snapshot',
            toolCall: expect.objectContaining({
              function: expect.objectContaining({
                arguments: '{"query":"snapshot from done","chatId":0}'
              })
            })
          })
        ]
      }),
      expect.objectContaining({
        kind: 'final',
        responseId: 'call_2',
        model: 'test-model'
      })
    ])
  })

  it('aborts immediately during retry backoff', async () => {
    const controller = new AbortController()
    const networkError = new TypeError('fetch failed')

    unifiedChatRequestMock.mockRejectedValueOnce(networkError)
    getRequestErrorMetadataMock.mockReturnValue({
      kind: 'network',
      retriable: true,
      message: 'fetch failed'
    })

    const sleep = vi.fn((ms: number) => new Promise<void>(resolve => {
      setTimeout(resolve, ms)
    }))

    const executor = new DefaultModelStreamExecutor({
      retryDelayMs: 50,
      sleep
    })

    const execution = executor.execute({
      request: {
        adapterPluginId: 'openai-response-compatible-adapter',
        baseUrl: 'https://example.invalid/v1',
        apiKey: 'test-key',
        model: 'test-model',
        messages: [{ role: 'user', content: 'hello', segments: [] }],
        stream: true
      },
      signal: controller.signal
    })

    await vi.waitFor(() => {
      expect(loggerWarnMock).toHaveBeenCalledWith('request.retry_scheduled', expect.objectContaining({
        attempt: 1,
        nextAttempt: 2,
        reasonKind: 'network'
      }))
    })

    controller.abort()

    await expect(execution).rejects.toMatchObject({
      name: 'AbortError'
    })

    expect(unifiedChatRequestMock).toHaveBeenCalledTimes(1)
  })
})
