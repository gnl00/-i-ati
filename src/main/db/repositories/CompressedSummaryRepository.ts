import type { CompressedSummaryDao } from '@main/db/dao/CompressedSummaryDao'
import {
  toCompressedSummaryEntity,
  toCompressedSummaryInsertRow
} from '@main/db/mappers/CompressedSummaryMapper'

type CompressedSummaryRepositoryDeps = {
  hasDb: () => boolean
  getSummaryRepo: () => CompressedSummaryDao | undefined
}

export class CompressedSummaryRepository {
  constructor(private readonly deps: CompressedSummaryRepositoryDeps) {}

  saveCompressedSummary(data: CompressedSummaryEntity): number {
    const summaryRepo = this.requireSummaryRepo()
    return summaryRepo.insert(toCompressedSummaryInsertRow(data))
  }

  getCompressedSummariesByChatId(chatId: number): CompressedSummaryEntity[] {
    const summaryRepo = this.requireSummaryRepo()
    const rows = summaryRepo.getByChatId(chatId)
    return rows.map(row => toCompressedSummaryEntity(row))
  }

  getActiveCompressedSummariesByChatId(chatId: number): CompressedSummaryEntity[] {
    const summaryRepo = this.requireSummaryRepo()
    const rows = summaryRepo.getActiveByChatId(chatId)
    return rows.map(row => toCompressedSummaryEntity(row))
  }

  updateCompressedSummaryStatus(id: number, status: 'active' | 'superseded' | 'invalid'): void {
    const summaryRepo = this.requireSummaryRepo()
    summaryRepo.updateStatus(id, status)
  }

  deleteCompressedSummary(id: number): void {
    const summaryRepo = this.requireSummaryRepo()
    summaryRepo.delete(id)
  }

  private requireSummaryRepo(): CompressedSummaryDao {
    if (!this.deps.hasDb()) throw new Error('Database not initialized')
    const repo = this.deps.getSummaryRepo()
    if (!repo) throw new Error('Compressed summary repository not initialized')
    return repo
  }
}
