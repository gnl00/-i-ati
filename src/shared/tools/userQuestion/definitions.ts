import type { ToolDefinition } from '@shared/tools/registry'

const optionSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', minLength: 1, maxLength: 64 },
    label: { type: 'string', minLength: 1, maxLength: 160 },
    description: { type: 'string', maxLength: 500 },
    recommended: { type: 'boolean' }
  },
  required: ['id', 'label']
}

const questionSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', minLength: 1, maxLength: 64 },
    header: { type: 'string', maxLength: 80 },
    prompt: { type: 'string', minLength: 1, maxLength: 1000 },
    type: { type: 'string', enum: ['single_select', 'multi_select', 'text'] },
    required: { type: 'boolean' },
    options: { type: 'array', minItems: 1, maxItems: 12, items: optionSchema },
    min_selections: { type: 'integer', minimum: 0, maximum: 12 },
    max_selections: { type: 'integer', minimum: 1, maximum: 12 },
    placeholder: { type: 'string', maxLength: 200 },
    max_length: { type: 'integer', minimum: 1, maximum: 4000 },
    recommended_text: { type: 'string', maxLength: 4000 }
  },
  required: ['id', 'prompt', 'type', 'required']
}

export const userQuestionTools = [
  {
    type: 'function',
    function: {
      name: 'ask_user_question',
      description: 'Pause and ask the desktop user one to three decision questions. Call this tool by itself in a model step. Mark recommended options or provide recommended_text so the run can continue automatically after timeout.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          questions: {
            type: 'array',
            minItems: 1,
            maxItems: 3,
            items: questionSchema
          },
          timeout_seconds: {
            type: 'integer',
            minimum: 60,
            maximum: 300,
            description: 'Time to wait before automatically submitting recommended answers. Defaults to 60 seconds and cannot be shorter than one minute.'
          }
        },
        required: ['questions'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  }
] satisfies ToolDefinition[]

export default userQuestionTools
