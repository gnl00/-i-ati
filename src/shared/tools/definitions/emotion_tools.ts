import type { ToolDefinition } from '@shared/tools/registry'
import {
  EMOTION_ASSET_NAMES,
  EMOTION_LABELS
} from '@shared/emotion/emotionAssetCatalog'

export default [
  {
    type: 'function',
    function: {
      name: 'emotion_report',
      description: 'Report your current emotional state for this response cycle before giving the user-facing answer.',
      parameters: {
        type: 'object',
        properties: {
          label: {
            type: 'string',
            enum: EMOTION_LABELS,
            description: 'Choose the canonical emotion label that best matches your current feeling.'
          },
          stateText: {
            type: 'string',
            description: 'Optional short natural-language description of your current emotional state, such as calm, focused, playful, or concerned.'
          },
          emojiName: {
            type: 'string',
            enum: EMOTION_ASSET_NAMES,
            description: 'Choose one animated emotion asset name that matches the selected label.'
          },
          intensity: {
            type: 'integer',
            description: 'How strongly you feel this state on a scale from 1 to 10.'
          },
          reason: {
            type: 'string',
            description: 'Optional brief reason for this emotional state in the current context.'
          }
        },
        additionalProperties: false,
        required: ['label', 'emojiName']
      }
    }
  }
] satisfies ToolDefinition[]
