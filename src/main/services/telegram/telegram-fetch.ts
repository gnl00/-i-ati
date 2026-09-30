import { net } from 'electron'
import { createLogger } from '@main/logging/LogService'
import { redactSensitiveText } from '@shared/security/SensitiveTextRedactor'

const logger = createLogger('TelegramFetch')

export const telegramFetch: typeof fetch = async (input, init) => {
  const sourceSignal = init?.signal
  const controller = sourceSignal ? new AbortController() : undefined
  const abort = (): void => controller?.abort(sourceSignal?.reason)
  if (sourceSignal?.aborted) abort()
  else sourceSignal?.addEventListener('abort', abort, { once: true })

  try {
    const fetchRequest =
      typeof net?.fetch === 'function' ? net.fetch.bind(net) : fetch
    return await fetchRequest(
      input,
      controller ? { ...init, signal: controller.signal } : init,
    )
  } catch (error) {
    // Bot API URLs contain credentials. Never log the request or the raw error stack.
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url
    const token = url.match(/\/bot([^/]+)/)?.[1]
    const message = error instanceof Error ? error.message : String(error)
    const sanitized = token ? message.split(token).join('[REDACTED]') : message
    logger.error('request.failed', {
      name: error instanceof Error ? error.name : 'Error',
      message: redactSensitiveText(
        sanitized.replace(/\/bot[^/\s]+/g, '/bot[REDACTED]'),
      ).content,
    })
    throw error
  } finally {
    sourceSignal?.removeEventListener('abort', abort)
  }
}
