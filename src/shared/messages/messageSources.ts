export const MESSAGE_SOURCE = {
  SCHEDULE: 'schedule',
  STREAM_PREVIEW: 'stream_preview',
  TELEGRAM: 'telegram',
  SYSTEM_PROMPT: 'system_prompt',
  SYSTEM_ENVIRONMENT_CONTEXT: 'system_environment_context',
  SKILLS_CONTEXT: 'skills_context',
  KNOWLEDGEBASE_CONTEXT: 'knowledgebase_context',
  AWAKE_CONTEXT: 'awake_context',
  COMPRESSION_SUMMARY: 'compression_summary',
  RUN_STOPPED: 'run_stopped'
} as const

export type MessageSource = typeof MESSAGE_SOURCE[keyof typeof MESSAGE_SOURCE]

export const HIDDEN_MESSAGE_SOURCES = new Set<string>([
  MESSAGE_SOURCE.SYSTEM_PROMPT,
  MESSAGE_SOURCE.SYSTEM_ENVIRONMENT_CONTEXT,
  MESSAGE_SOURCE.SKILLS_CONTEXT,
  MESSAGE_SOURCE.KNOWLEDGEBASE_CONTEXT,
  MESSAGE_SOURCE.AWAKE_CONTEXT,
  MESSAGE_SOURCE.COMPRESSION_SUMMARY,
  MESSAGE_SOURCE.RUN_STOPPED
])
