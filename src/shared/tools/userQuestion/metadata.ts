import type { EmbeddedToolMetadataMap } from '../metadata-types'

export const userQuestionToolMetadata = {
  ask_user_question: {
    capability: 'chat',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  }
} satisfies EmbeddedToolMetadataMap
