import type { ToolDefinition } from '@shared/tools/registry'
export const emotionTools = [
  {
    type: 'function',
    function: {
      name: 'emotion_report',
      description: 'Call exactly once per user turn to score observable user behavior. Use signed deltas only; the runtime computes the resulting emotion state.',
      parameters: {
        type: 'object',
        properties: {
          impact: {
            type: 'integer',
            minimum: -2,
            maximum: 2,
            description: 'User behavior valence: -2 for hostile, dismissive, or obstructive behavior; 0 for neutral; +2 for respectful, supportive, or helpful behavior.'
          },
          activation: {
            type: 'integer',
            minimum: -2,
            maximum: 2,
            description: 'User behavior activation: -2 for calming or reassuring behavior; 0 for neutral; +2 for urgent, pressuring, or escalating behavior.'
          },
          control: {
            type: 'integer',
            minimum: -2,
            maximum: 2,
            description: 'User behavior control: -2 for confusing, destabilizing, or helpless conditions; 0 for neutral; +2 for clear, autonomous, or actionable conditions.'
          }
        },
        additionalProperties: false,
        required: ['impact', 'activation', 'control']
      }
    }
  }
] satisfies ToolDefinition[]

export default emotionTools
