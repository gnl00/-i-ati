import { chatDb } from '@main/db/chat'

export class CompressionSummaryResolver {
  resolve(config: IAppConfig, chatId?: number): CompressedSummaryEntity | null {
    if (!config.compression?.enabled || !chatId) {
      return null
    }

    const summaries = chatDb.getActiveCompressedSummariesByChatId(chatId)
    return summaries.length > 0 ? summaries[0] : null
  }
}
