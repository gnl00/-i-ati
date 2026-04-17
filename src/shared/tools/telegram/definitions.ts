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
  }
] satisfies ToolDefinition[]

export default telegramTools
