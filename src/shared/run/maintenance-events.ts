import type { SerializedError } from './lifecycle-events'

export type PostRunPlan = {
  title: 'pending' | 'skipped'
  compression: 'pending' | 'skipped'
}

export const RUN_MAINTENANCE_EVENTS = {
  POSTRUN_PLAN: 'postrun.plan',
  TITLE_GENERATION_STARTED: 'title.generation.started',
  TITLE_GENERATION_COMPLETED: 'title.generation.completed',
  TITLE_GENERATION_FAILED: 'title.generation.failed',
  COMPRESSION_STARTED: 'compression.started',
  COMPRESSION_COMPLETED: 'compression.completed',
  COMPRESSION_FAILED: 'compression.failed'
} as const

export type RunMaintenanceEventPayloads = {
  'postrun.plan': PostRunPlan
  'title.generation.started': { model: AccountModel; contentLength: number }
  'title.generation.completed': { title: string }
  'title.generation.failed': { error: SerializedError }
  'compression.started': { messageCount: number; chatId?: number; chatUuid?: string }
  'compression.completed': { result: CompressionResult }
  'compression.failed': { error: SerializedError; result?: CompressionResult }
}

