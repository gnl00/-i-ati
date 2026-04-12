import type { SerializedError } from '@shared/run/lifecycle-events'

const MAX_ERROR_CAUSE_DEPTH = 3

export const serializeError = (error: unknown, depth: number = 0): SerializedError => {
  const value = error as {
    name?: unknown
    message?: unknown
    stack?: unknown
    code?: unknown
    cause?: unknown
  } | undefined

  const serialized: SerializedError = {
    name: typeof value?.name === 'string' ? value.name : 'Error',
    message: typeof value?.message === 'string' ? value.message : 'Unknown error',
    stack: typeof value?.stack === 'string' ? value.stack : undefined,
    code: typeof value?.code === 'string' ? value.code : undefined
  }

  if (depth >= MAX_ERROR_CAUSE_DEPTH || !value?.cause) {
    return serialized
  }

  return {
    ...serialized,
    cause: serializeError(value.cause, depth + 1)
  }
}
