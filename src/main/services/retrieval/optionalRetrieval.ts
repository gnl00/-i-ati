import { abortableWait } from '@shared/utils/abortableWait'

export async function optionalRetrieval<T>(
  operation: (signal: AbortSignal) => Promise<T[]>,
  signal?: AbortSignal
): Promise<T[]> {
  signal?.throwIfAborted()
  const deadline = AbortSignal.timeout(2000)
  const retrievalSignal = signal ? AbortSignal.any([signal, deadline]) : deadline
  try {
    return await abortableWait(() => operation(retrievalSignal), retrievalSignal)
  } catch {
    signal?.throwIfAborted()
    if (deadline.aborted) console.debug('[Retrieval] Optional retrieval timed out after 2000ms')
    return []
  }
}
