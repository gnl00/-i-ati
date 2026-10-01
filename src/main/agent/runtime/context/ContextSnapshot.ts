import type { ContextRecord } from './ContextRecord'

/** Terminal view of the manager's complete facts. The array is copied, records are not deep-frozen. */
export interface ContextSnapshot {
  transcriptId: string
  createdAt: number
  updatedAt: number
  records: readonly ContextRecord[]
}
