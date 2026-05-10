import type { ToolDefinition } from '@shared/tools/registry'

const todoStatusSchema = {
  type: 'string',
  enum: ['open', 'done']
}

const todoPrioritySchema = {
  type: 'string',
  enum: ['low', 'medium', 'high']
}

export const todoTools = [
  {
    type: 'function',
    function: {
      name: 'todo_add',
      description: 'Add a todo item for the current chat. Use for durable user-visible tasks that may be listed, updated, completed, or deleted later.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Short todo title.'
          },
          notes: {
            type: 'string',
            description: 'Optional details or context.'
          },
          priority: {
            ...todoPrioritySchema,
            description: 'Optional priority.'
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional tags for filtering.'
          }
        },
        required: ['title'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'todo_list',
      description: 'List todos. Defaults to all open todos across chats.',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['open', 'done', 'all'],
            description: 'Filter by status. Defaults to open.'
          },
          scope: {
            type: 'string',
            enum: ['current_chat', 'all'],
            description: 'Whether to list todos for the current chat or all chats. Defaults to all.'
          },
          tag: {
            type: 'string',
            description: 'Optional tag filter.'
          },
          priority: {
            ...todoPrioritySchema,
            description: 'Optional priority filter.'
          },
          limit: {
            type: 'number',
            description: 'Optional max number of todos to return. Defaults to 50, max 200.'
          }
        },
        required: [],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'todo_update',
      description: 'Update a todo item. Use status=done to complete it, and status=open to reopen it.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Todo id.'
          },
          title: {
            type: 'string',
            description: 'Updated title.'
          },
          notes: {
            type: ['string', 'null'],
            description: 'Updated notes, or null to clear.'
          },
          status: {
            ...todoStatusSchema,
            description: 'Updated status.'
          },
          priority: {
            type: ['string', 'null'],
            enum: ['low', 'medium', 'high', null],
            description: 'Updated priority, or null to clear.'
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Replacement tag list.'
          }
        },
        required: ['id'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'todo_delete',
      description: 'Soft-delete a todo item by id.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Todo id.'
          }
        },
        required: ['id'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  }
] satisfies ToolDefinition[]

export default todoTools
