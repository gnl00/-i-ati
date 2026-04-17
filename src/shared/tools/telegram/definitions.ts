import type { ToolDefinition } from '@shared/tools/registry'

export const telegramTools = [
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
      description: 'Proactively send a Telegram message through the configured Telegram bot. Prefer target_chat_uuid from telegram_search_targets, or rely on the current chat binding when already inside a Telegram chat.',
      parameters: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'Telegram message text to send.'
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
