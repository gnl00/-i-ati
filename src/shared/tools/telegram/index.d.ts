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

export type TelegramSearchTargetsArgs = {
  query?: string
  limit: number
  include_archived?: boolean
  chat_uuid?: string
}

export type TelegramSearchTargetMatchReason =
  | 'title'
  | 'username'
  | 'display_name'
  | 'chat_id'
  | 'user_id'

export type TelegramSearchTargetItem = {
  targetChatUuid: string
  chatTitle: string
  telegramChatId: string
  telegramThreadId?: string
  telegramUserId?: string
  username?: string
  displayName?: string
  chatType: 'private' | 'group' | 'supergroup' | 'channel'
  status: 'active' | 'archived'
  lastActiveAt: number
  matchReasons: TelegramSearchTargetMatchReason[]
}

export type TelegramSearchTargetsResponse = {
  success: boolean
  count: number
  running: boolean
  botUsername?: string
  botId?: string
  items: TelegramSearchTargetItem[]
  message: string
}

export type TelegramSendMessageArgs = {
  text?: string
  target_chat_uuid?: string
  chat_id?: string
  thread_id?: string
  reply_to_message_id?: string
  chat_uuid?: string
}

export type TelegramSendMessageResponse = {
  success: boolean
  sentMessageId?: string
  targetChatUuid?: string
  chatId?: string
  threadId?: string
  botUsername?: string
  botId?: string
  message: string
}
