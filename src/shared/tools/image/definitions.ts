import type { ToolDefinition } from '../registry'

export const imageTools = [
  {
    type: 'function',
    function: {
      name: 'image_generate',
      description:
        'Generate and show one image from a text prompt using the explicitly configured Image Gen Model. Requires Settings → Tools → Model Routing → Image Gen Model; if missing, returns configuration guidance. Saves a stable image for history and sends it to the current conversation/topic for Telegram-origin runs. Do not automatically retry failed or uncertain generation requests. Does not edit or analyze existing images.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          prompt: {
            type: 'string',
            minLength: 1,
            maxLength: 16000,
            description: 'Describe the image to generate.',
          },
          caption: {
            type: 'string',
            maxLength: 1024,
            description: 'Optional plain-text image caption.',
          },
        },
        required: ['prompt'],
        $schema: 'http://json-schema.org/draft-07/schema#',
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'image_show',
      description:
        'Show one image to the user. Provide exactly one workspace-relative file or HTTP(S) URL, and optionally a caption. Chat displays an inline image; a Telegram-origin run sends it to the current conversation/topic. This does not analyze the image. A stable snapshot is saved for chat history.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          file: {
            type: 'string',
            minLength: 1,
            description: 'Workspace-relative image file path.',
          },
          url: {
            type: 'string',
            minLength: 1,
            description: 'HTTP(S) image URL to download and snapshot.',
          },
          caption: {
            type: 'string',
            maxLength: 1024,
            description: 'Optional plain-text image caption.',
          },
        },
        oneOf: [
          { required: ['file'], not: { required: ['url'] } },
          { required: ['url'], not: { required: ['file'] } },
        ],
        $schema: 'http://json-schema.org/draft-07/schema#',
      },
    },
  },
] satisfies ToolDefinition[]
