export type TelegramSetupToolArgs = {
  bot_token?: string
}

export type TelegramSetupToolResponse = {
  success: boolean
  configured: boolean
  running: boolean
  starting: boolean
  botUsername?: string
  botId?: string
  message: string
}
