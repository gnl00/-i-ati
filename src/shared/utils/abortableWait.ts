/** Stop waiting promptly; the operation must also observe signal to cancel its own work. */
export async function abortableWait<T>(
  operation: () => Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  signal?.throwIfAborted()
  if (!signal) return operation()
  let onAbort: () => void = () => {}
  try {
    return await new Promise<T>((resolve, reject) => {
      onAbort = (): void => reject(signal.reason)
      signal.addEventListener('abort', onAbort, { once: true })
      Promise.resolve().then(() => {
        signal.throwIfAborted()
        return operation()
      }).then(resolve, reject)
    })
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}
