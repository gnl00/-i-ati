import DatabaseService from '@main/services/DatabaseService'

export class CompressionSummaryResolver {
  resolve(config: IAppConfig, chatId?: number): CompressedSummaryEntity | null {
    if (!config.compression?.enabled || !chatId) {
      return null
    }

    const summaries = DatabaseService.getActiveCompressedSummariesByChatId(chatId)
    return summaries.length > 0 ? summaries[0] : null
  }
}
