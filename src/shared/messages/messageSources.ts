export const MESSAGE_SOURCE = {
  SCHEDULE: 'schedule',
  STREAM_PREVIEW: 'stream_preview',
  TELEGRAM: 'telegram',
  SKILLS_CONTEXT: 'skills_context'
} as const

export type MessageSource = typeof MESSAGE_SOURCE[keyof typeof MESSAGE_SOURCE]

export const HIDDEN_MESSAGE_SOURCES = new Set<string>([
  MESSAGE_SOURCE.SKILLS_CONTEXT
])

