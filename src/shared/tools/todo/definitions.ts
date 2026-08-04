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
      description: 'Manage durable user-visible todo items. Set action to add, list, update, or delete; the processor validates action-specific fields.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['add', 'list', 'update', 'delete'],
            description: 'Operation to perform: add creates a todo, list retrieves todos, update changes a todo, and delete soft-deletes a todo.'
          },
          id: {
            type: 'string',
            description: 'Todo id. Required for action=update and action=delete.'
          },
          title: {
            type: 'string',
            description: 'Short todo title. Required for action=add; optional replacement title for action=update.'
          },
          notes: {
            type: ['string', 'null'],
            description: 'Optional details for action=add, or updated notes for action=update. Use null to clear notes during update.'
          },
          status: {
            ...todoStatusSchema,
            description: 'For action=list, filter by open, done, or all. For action=update, set open or done.'
          },
          priority: {
            ...todoPrioritySchema,
            description: 'Optional priority for action=add or action=list, or replacement priority for action=update. Use null to clear priority during update.'
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional tags for action=add, or replacement tag list for action=update.'
          },
          scope: {
            type: 'string',
            enum: ['current_chat', 'all'],
            description: 'For action=list, select current chat or all chats. Defaults to all.'
          },
          tag: {
            type: 'string',
            description: 'Optional tag filter for action=list.'
          },
          limit: {
            type: 'number',
            description: 'Optional maximum todos to return for action=list. Defaults to 50, max 200.'
          }
        },
        required: ['action'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  }
] satisfies ToolDefinition[]

export default todoTools
