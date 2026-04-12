import type { AssistantDao } from '@main/db/dao/AssistantDao'
import {
  toAssistantEntity,
  toAssistantRow
} from '@main/db/mappers/AssistantMapper'

type AssistantRepositoryDeps = {
  hasDb: () => boolean
  getAssistantRepo: () => AssistantDao | undefined
}

export class AssistantRepository {
  constructor(private readonly deps: AssistantRepositoryDeps) {}

  saveAssistant(assistant: Assistant): string {
    const assistantRepo = this.requireAssistantRepo()
    assistantRepo.insert(toAssistantRow(assistant))
    return assistant.id
  }

  getAllAssistants(): Assistant[] {
    const assistantRepo = this.requireAssistantRepo()
    return assistantRepo.getAll().map(row => toAssistantEntity(row))
  }

  deleteAllAssistants(): void {
    const assistantRepo = this.requireAssistantRepo()
    assistantRepo.deleteAll()
  }

  getAssistantById(id: string): Assistant | undefined {
    const assistantRepo = this.requireAssistantRepo()
    const row = assistantRepo.getById(id)
    return row ? toAssistantEntity(row) : undefined
  }

  updateAssistant(assistant: Assistant): void {
    const assistantRepo = this.requireAssistantRepo()
    assistantRepo.update(toAssistantRow(assistant))
  }

  deleteAssistant(id: string): void {
    const assistantRepo = this.requireAssistantRepo()
    assistantRepo.delete(id)
  }

  private requireAssistantRepo(): AssistantDao {
    if (!this.deps.hasDb()) throw new Error('Database not initialized')
    const repo = this.deps.getAssistantRepo()
    if (!repo) throw new Error('Assistant repository not initialized')
    return repo
  }
}
