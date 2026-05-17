export const MESSAGE_SOURCE = {
  SCHEDULE: 'schedule',
  STREAM_PREVIEW: 'stream_preview',
  TELEGRAM: 'telegram',
  SYSTEM_PROMPT: 'system_prompt',
  SKILLS_CONTEXT: 'skills_context',
  KNOWLEDGEBASE_CONTEXT: 'knowledgebase_context'
} as const

export type MessageSource = typeof MESSAGE_SOURCE[keyof typeof MESSAGE_SOURCE]

export const HIDDEN_MESSAGE_SOURCES = new Set<string>([
  MESSAGE_SOURCE.SYSTEM_PROMPT,
  MESSAGE_SOURCE.SKILLS_CONTEXT,
  MESSAGE_SOURCE.KNOWLEDGEBASE_CONTEXT
])
