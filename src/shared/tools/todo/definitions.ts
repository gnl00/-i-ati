import type { ToolDefinition } from '@shared/tools/registry'

const todoStatusSchema = {
  type: 'string',
  enum: ['open', 'done', 'all']
}

const todoPrioritySchema = {
  type: ['string', 'null'],
  enum: ['low', 'medium', 'high', null]
}

export const todoTools = [
  {
    type: 'function',
    function: {
      name: 'todo',
      description: 'Manage durable user-visible todos; delete is a soft delete.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['add', 'list', 'update', 'delete'],
            description: 'Todo operation.'
          },
          id: {
            type: 'string',
            description: 'Required for update/delete.'
          },
          title: {
            type: 'string',
            description: 'Short title; required for add, replacement for update.'
          },
          notes: {
            type: ['string', 'null'],
            description: 'Notes for add/update; null clears on update.'
          },
          status: {
            ...todoStatusSchema,
            description: 'list: filter open/done/all; update: set open/done.'
          },
          priority: {
            ...todoPrioritySchema,
            description: 'add: priority; list: filter; update: replace or null to clear.'
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tags for add; replacement list for update.'
          },
          scope: {
            type: 'string',
            enum: ['current_chat', 'all'],
            description: 'List scope; default all.'
          },
          tag: {
            type: 'string',
            description: 'Tag filter for list.'
          },
          limit: {
            type: 'number',
            description: 'List limit; default 50, max 200.'
          }
        },
        required: ['action'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  }
] satisfies ToolDefinition[]

export default todoTools
