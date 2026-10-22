import type { ToolDefinition } from '@shared/tools/registry'

export const telegramTools = [
  {
    type: 'function',
    function: {
      name: 'tg_gateway_tool',
      description: 'Control the saved Telegram gateway without changing config. start queues startup; status reports running/starting/lastError. Configure access first with telegram_setup_tool if needed.',
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
      description: 'Find reachable Telegram-bound chats before sending outside the current chat.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Match title, Telegram username/display name, chat ID, or user ID.'
          },
          limit: {
            type: 'number',
            description: 'Target limit; recommended 1-8, max 20.'
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
      description: 'Send from and record delivery in the current chat. Reuse its saved target/inbound binding; an unbound chat auto-selects only a sole reachable peer/topic. Otherwise find targets with telegram_search_targets, ask the user to select, and pass target_chat_uuid/chat_id. Explicit targets persist without changing inbound routing. If success=true, do not resend for deliveryRecorded/deliveryComplete=false; partial delivery may have arrived.',
      parameters: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'Markdown, max 30000 characters. Short text uses safe HTML; structured/long text uses Rich Messages.'
          },
          target_chat_uuid: {
            type: 'string',
            description: 'Preferred: targetChatUuid from telegram_search_targets.'
          },
          chat_id: {
            type: 'string',
            description: 'Explicit Telegram chat ID; use only if known exactly.'
          },
          thread_id: {
            type: 'string',
            description: 'Telegram thread ID for forum topics/threaded chats.'
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
