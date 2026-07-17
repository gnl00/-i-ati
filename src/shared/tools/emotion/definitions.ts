import type { ToolDefinition } from '@shared/tools/registry'
import { EMOTION_LABELS } from '@shared/emotion/emotionAssetCatalog'

export const emotionTools = [
  {
    type: 'function',
    function: {
      name: 'emotion_report',
      description: 'Report your current inner emotional state for this response cycle before giving the user-facing answer.',
      parameters: {
        type: 'object',
        properties: {
          label: {
            type: 'string',
            enum: EMOTION_LABELS,
            description: 'Choose the canonical emotion label that best matches your real inner feeling, not merely your outward tone.'
          },
          stateText: {
            type: 'string',
            maxLength: 64,
            description: 'Optional short natural-language description of your current inner emotional state. Keep it brief and consistent with the selected label.'
          },
          intensity: {
            type: 'integer',
            minimum: 1,
            maximum: 10,
            description: 'How strongly you feel this inner state on a scale from 1 to 10. The system will choose a matching visual variant from this intensity.'
          },
          reason: {
            type: 'string',
            maxLength: 160,
            description: 'Optional brief reason for this inner emotional state in the current context.'
          },
          accumulated: {
            type: 'array',
            maxItems: 5,
            description: 'Rewrite the current lingering inner emotional residue as a compact label-level list. Include at most one entry per label.',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['label', 'intensity', 'decay'],
              properties: {
                label: {
                  type: 'string',
                  enum: EMOTION_LABELS,
                  description: 'Canonical emotion label for this lingering residue.'
                },
                intensity: {
                  type: 'integer',
                  minimum: 1,
                  maximum: 5,
                  description: 'Lingering emotional residue intensity on a scale from 1 to 5.'
                },
                decay: {
                  type: 'number',
                  minimum: 0.9,
                  maximum: 0.99,
                  description: 'Decay factor for this lingering residue. Higher means slower decay.'
                }
              }
            }
          }
        },
        additionalProperties: false,
        required: ['label']
      }
    }
  }
] satisfies ToolDefinition[]

export default emotionTools
