import type { ToolDefinition } from '@shared/tools/registry'

export const visionTools = [
  {
    type: 'function',
    function: {
      name: 'image_analyze',
      description: 'Inspect, OCR, compare, or extract from current/historical images with the configured vision model. Prefer refs from <available_images>.',
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
                  description: '<available_images> ref: message:<id>#image:<1-based index> for one image; message:<id> for all in a message.'
                },
                url: {
                  type: 'string',
                  description: 'Image URL or data URL.'
                },
                raw_data: {
                  type: 'string',
                  description: 'Image data URL or base64.'
                },
                file: {
                  type: 'string',
                  description: 'Workspace-relative image path; sent as a base64 data URL.'
                }
              },
              additionalProperties: false
            },
            description: 'Images by ref, URL, raw data, or workspace-relative path.'
          },
          image_refs: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'string'
            },
            description: '<available_images> refs, using the images.ref format.'
          },
          urls: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'string'
            },
            description: 'Direct image URLs.'
          },
          raw_data: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'string'
            },
            description: 'Image data URLs or base64 payloads.'
          },
          files: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'string'
            },
            description: 'Workspace-relative paths; sent as base64 data URLs.'
          },
          chat_uuid: {
            type: 'string',
            description: 'Runtime-injected chat UUID for image refs, when available.'
          },
          prompt: {
            type: 'string',
            description: 'Direct visual task for the vision model.'
          },
          timeout_seconds: {
            type: 'number',
            minimum: 5,
            maximum: 120,
            description: 'Wait in seconds; default 60, clamped to 5-120.'
          }
        },
        required: ['prompt'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  }
] satisfies ToolDefinition[]

export default visionTools
