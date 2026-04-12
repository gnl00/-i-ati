/**
 * ModelStreamExecutor
 *
 * 放置内容：
 * - 执行当前可真正发送的模型请求，并返回响应流
 *
 * 业务逻辑边界：
 * - 它位于可执行请求和规范化 `ModelResponseStream` 之间
 * - 它负责把当前 provider / unified response 形态规范化成 `ModelResponseChunk`
 * - 它不负责解析 chunk
 * - 它不直接改写 loop、transcript 或 host output
 */
import { createLogger } from '@main/logging/LogService'
import type { ModelResponseStream } from './ModelResponseStream'
import type { ModelResponseChunk, ModelToolCallChunk } from './ModelResponseChunk'
import type { RequestErrorMetadata } from '@main/request/index'

const logger = createLogger('ModelStreamExecutor')

export interface ModelStreamExecutorInput {
  request: IUnifiedRequest
  signal?: AbortSignal
}

export interface ModelStreamExecutor {
  execute(input: ModelStreamExecutorInput): Promise<ModelResponseStream>
}

export interface DefaultModelStreamExecutorOptions {
  maxAttempts?: number
  retryDelayMs?: number
  sleep?: (ms: number) => Promise<void>
}

const createAbortError = (): Error => {
  const error = new Error('Model stream execution aborted during retry backoff')
  error.name = 'AbortError'
  return error
}

const isAsyncIterable = <T>(value: unknown): value is AsyncIterable<T> => (
  Boolean(value)
  && typeof value === 'object'
  && Symbol.asyncIterator in (value as Record<PropertyKey, unknown>)
)

const isObject = (value: unknown): value is Record<string, any> => (
  Boolean(value) && typeof value === 'object'
)

const inferToolCallArgumentsMode = (raw: unknown): ModelToolCallChunk['argumentsMode'] => {
  if (!isObject(raw)) {
    return 'delta'
  }

  if (raw.type === 'response.function_call_arguments.done') {
    return 'snapshot'
  }

  if (raw.type === 'response.output_item.done' && raw.item?.type === 'function_call') {
    return 'snapshot'
  }

  if (Array.isArray(raw.output) && raw.output.some(item => item?.type === 'function_call')) {
    return 'snapshot'
  }

  return 'delta'
}

const normalizeToolCalls = (response: IUnifiedResponse): ModelToolCallChunk[] | undefined => {
  if (!response.toolCalls?.length) {
    return undefined
  }

  const argumentsMode = inferToolCallArgumentsMode(response.raw)
  return response.toolCalls.map(toolCall => ({
    toolCall,
    argumentsMode
  }))
}

const toDeltaChunk = (response: IUnifiedResponse): ModelResponseChunk => ({
  kind: 'delta',
  responseId: response.id,
  model: response.model,
  content: response.content || undefined,
  reasoning: response.reasoning,
  toolCalls: normalizeToolCalls(response),
  finishReason: response.finishReason,
  usage: response.usage,
  raw: response.raw
})

const toFinalChunk = (response?: Pick<IUnifiedResponse, 'id' | 'model' | 'raw'>): ModelResponseChunk => ({
  kind: 'final',
  responseId: response?.id,
  model: response?.model,
  raw: response?.raw
})

export class DefaultModelStreamExecutor implements ModelStreamExecutor {
  constructor(
    private readonly options: DefaultModelStreamExecutorOptions = {}
  ) {}

  async execute(input: ModelStreamExecutorInput): Promise<ModelResponseStream> {
    const { unifiedChatRequest, getRequestErrorMetadata } = await import('@main/request/index')
    const maxAttempts = Math.max(1, this.options.maxAttempts ?? 2)
    const retryDelayMs = this.options.retryDelayMs ?? 300
    const sleep = this.options.sleep ?? (async (ms: number) => {
      await new Promise(resolve => setTimeout(resolve, ms))
    })

    let lastError: unknown

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await unifiedChatRequest(
          input.request,
          input.signal ?? null,
          () => {},
          () => {}
        )

        if (isAsyncIterable<IUnifiedResponse>(response)) {
          return this.normalizeStreamingResponse(response)
        }

        return this.normalizeSingleResponse(response as IUnifiedResponse)
      } catch (error) {
        lastError = error
        const metadata = getRequestErrorMetadata(error)
        const shouldRetry = this.shouldRetry(error, metadata, input.signal, attempt, maxAttempts)

        if (!shouldRetry) {
          throw error
        }

        logger.warn('request.retry_scheduled', {
          adapterPluginId: input.request.adapterPluginId,
          baseUrl: input.request.baseUrl,
          model: input.request.model,
          attempt,
          nextAttempt: attempt + 1,
          retryDelayMs,
          reasonKind: metadata?.kind,
          reasonMessage: metadata?.message
        })

        await this.sleepWithAbort(retryDelayMs, input.signal, sleep)
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Model stream execution failed')
  }

  private async *normalizeStreamingResponse(
    response: AsyncIterable<IUnifiedResponse>
  ): AsyncGenerator<ModelResponseChunk, void, unknown> {
    let lastResponse: IUnifiedResponse | undefined

    for await (const chunk of response) {
      lastResponse = chunk
      yield toDeltaChunk(chunk)
    }

    yield toFinalChunk(lastResponse)
  }

  private async *normalizeSingleResponse(
    response: IUnifiedResponse
  ): AsyncGenerator<ModelResponseChunk, void, unknown> {
    yield toDeltaChunk(response)
    yield toFinalChunk(response)
  }

  private shouldRetry(
    error: unknown,
    metadata: RequestErrorMetadata | undefined,
    signal: AbortSignal | undefined,
    attempt: number,
    maxAttempts: number
  ): boolean {
    if (attempt >= maxAttempts) {
      return false
    }

    if (signal?.aborted) {
      return false
    }

    if (!(error instanceof Error)) {
      return false
    }

    if (!metadata?.retriable) {
      return false
    }

    return metadata.kind === 'network' || metadata.kind === 'http'
  }

  private async sleepWithAbort(
    delayMs: number,
    signal: AbortSignal | undefined,
    sleep: (ms: number) => Promise<void>
  ): Promise<void> {
    if (!signal) {
      await sleep(delayMs)
      return
    }

    if (signal.aborted) {
      throw createAbortError()
    }

    let cleanup: (() => void) | undefined
    const abortPromise = new Promise<never>((_, reject) => {
      const onAbort = () => {
        cleanup?.()
        reject(createAbortError())
      }
      cleanup = () => signal.removeEventListener('abort', onAbort)
      signal.addEventListener('abort', onAbort, { once: true })
      if (signal.aborted) {
        onAbort()
      }
    })

    await Promise.race([
      sleep(delayMs).finally(() => cleanup?.()),
      abortPromise
    ])

    if (signal.aborted) {
      throw createAbortError()
    }
  }
}
