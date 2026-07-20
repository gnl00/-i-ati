import type { ToolDefinition } from '@shared/tools/registry'

export const visionTools = [
  {
    type: 'function',
    function: {
      name: 'vision_analyze',
      description: 'Analyze current or historical images with the configured vision model. Call this when the user asks to read, inspect, OCR, compare, or extract information from an image. Use refs from <available_images>, such as message:101#image:1 or message:101. Write prompt as the direct visual task for the vision model.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          images: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              properties: {
                ref: {
                  type: 'string',
                  description: 'Image ref from <available_images>. Use message:<id>#image:<1-based index> for one image or message:<id> for all images in that message.'
                },
                url: {
                  type: 'string',
                  description: 'Direct image URL or data URL to analyze.'
                },
                raw_data: {
                  type: 'string',
                  description: 'Direct raw image data, usually a data URL or base64 payload.'
                }
              },
              additionalProperties: false
            },
            description: 'Images to analyze. Prefer ref values from <available_images>. Direct url/raw_data is supported for tool-generated image data.'
          },
          image_refs: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'string'
            },
            description: 'Top-level image refs from <available_images>, such as message:101#image:1 or message:101.'
          },
          urls: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'string'
            },
            description: 'Top-level direct image URLs to analyze.'
          },
          raw_data: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'string'
            },
            description: 'Top-level direct raw image data values, usually data URLs or base64 payloads.'
          },
          chat_uuid: {
            type: 'string',
            description: 'Runtime chat UUID used to resolve image refs. The runtime injects this when available.'
          },
          prompt: {
            type: 'string',
            description: 'Direct visual task for the vision model. Example: "Read the screenshot and extract the total amount."'
          },
          timeout_seconds: {
            type: 'number',
            minimum: 5,
            maximum: 120,
            description: 'Optional maximum analysis wait time in seconds. Defaults to 60 seconds and is clamped from 5 to 120 seconds.'
          }
        },
        required: ['prompt'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  }
] satisfies ToolDefinition[]

export default visionTools
