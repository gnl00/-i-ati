import type { CompressedSummaryRepository } from '../repositories/CompressedSummaryRepository'

type CompressedSummaryServiceDeps = {
  compressedSummaryRepository: () => CompressedSummaryRepository | undefined
}

export class CompressedSummaryService {
  constructor(private readonly deps: CompressedSummaryServiceDeps) {}

  saveCompressedSummary(data: CompressedSummaryEntity): number {
    return this.requireCompressedSummaryRepository().saveCompressedSummary(data)
  }

  getCompressedSummariesByChatId(chatId: number): CompressedSummaryEntity[] {
    return this.requireCompressedSummaryRepository().getCompressedSummariesByChatId(chatId)
  }

  getActiveCompressedSummariesByChatId(chatId: number): CompressedSummaryEntity[] {
    return this.requireCompressedSummaryRepository().getActiveCompressedSummariesByChatId(chatId)
  }

  updateCompressedSummaryStatus(id: number, status: 'active' | 'superseded' | 'invalid'): void {
    this.requireCompressedSummaryRepository().updateCompressedSummaryStatus(id, status)
  }

  deleteCompressedSummary(id: number): void {
    this.requireCompressedSummaryRepository().deleteCompressedSummary(id)
  }

  private requireCompressedSummaryRepository(): CompressedSummaryRepository {
    const repository = this.deps.compressedSummaryRepository()
    if (!repository) throw new Error('Compressed summary repository not initialized')
    return repository
  }
}
