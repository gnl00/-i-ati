import { chatDb } from '@main/db/chat'

interface ChatSetTitleArgs {
  title: string
  chat_uuid?: string
}

interface ChatSetTitleResponse {
  success: boolean
  title?: string
  message: string
}

export async function processChatSetTitle(
  args: ChatSetTitleArgs
): Promise<ChatSetTitleResponse> {
  try {
    if (!args.chat_uuid) {
      return {
        success: false,
        message: 'chat_uuid is required.'
      }
    }

    const title = args.title?.trim()
    if (!title) {
      return {
        success: false,
        message: 'Title must be a non-empty string.'
      }
    }

    const chat = chatDb.getChatByUuid(args.chat_uuid)
    if (!chat?.id) {
      return {
        success: false,
        message: `Chat not found for uuid: ${args.chat_uuid}`
      }
    }

    const updatedChat = {
      ...chat,
      title,
      updateTime: Date.now()
    }
    chatDb.updateChat(updatedChat)

    return {
      success: true,
      title,
      message: `Chat title set to "${title}".`
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      message: `Failed to set chat title: ${message}`
    }
  }
}
