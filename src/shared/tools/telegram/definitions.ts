import type { ToolDefinition } from '@shared/tools/registry'

export const telegramTools = [
  {
    type: 'function',
    function: {
      name: 'tg_gateway_tool',
      description: 'Start, stop, or inspect the configured Telegram gateway without changing its configuration. Start queues asynchronous startup; use status to check running, starting, and lastError. Configure bot access with telegram_setup_tool first when needed.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['start', 'stop', 'status'],
            description: 'Gateway operation to perform.'
          }
        },
        additionalProperties: false,
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'telegram_setup_tool',
      description: 'Configure Telegram bot access with a bot token, start the Telegram gateway, and persist the token only after startup succeeds.',
      parameters: {
        type: 'object',
        properties: {
          bot_token: {
            type: 'string',
            description: 'Telegram bot token from BotFather.'
          }
        },
        additionalProperties: false,
        required: ['bot_token']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'telegram_search_targets',
      description: 'Search reachable Telegram chat targets from existing Telegram-bound chats. Use this before proactively sending a Telegram message when the target is not the current chat.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Optional text query matched against chat title, Telegram username, display name, Telegram chat id, and Telegram user id.'
          },
          limit: {
            type: 'number',
            description: 'Maximum number of Telegram targets to return. Required. Recommended range: 1-8, max 20.'
          },
          include_archived: {
            type: 'boolean',
            description: 'Whether archived Telegram bindings should be included.'
          }
        },
        additionalProperties: false,
        required: ['limit']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'telegram_send_message',
      description: 'Send a Telegram message from the current chat and keep the delivery record in that chat. Reuse its saved delivery target or inbound binding. An unassociated chat automatically selects a target only when exactly one reachable Telegram peer/topic exists; otherwise ask the user to select a recipient using telegram_search_targets and pass target_chat_uuid or chat_id. An explicit target is saved for future sends without changing Telegram inbound routing. If success is true, never resend solely because deliveryRecorded or deliveryComplete is false; partial delivery may already have reached Telegram.',
      parameters: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'Markdown message text to send, at most 30000 characters. Short messages use safe HTML; structured and long messages use Rich Messages.'
          },
          target_chat_uuid: {
            type: 'string',
            description: 'Preferred target selector. Use the targetChatUuid returned by telegram_search_targets.'
          },
          chat_id: {
            type: 'string',
            description: 'Explicit Telegram chat id. Use only when you already know the exact Telegram chat id.'
          },
          thread_id: {
            type: 'string',
            description: 'Optional Telegram message thread id for forum topics or threaded chats.'
          },
          reply_to_message_id: {
            type: 'string',
            description: 'Optional Telegram message id to reply to.'
          }
        },
        additionalProperties: false,
        required: ['text']
      }
    }
  }
] satisfies ToolDefinition[]

export default telegramTools
