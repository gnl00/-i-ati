import type { AssistantRepository, AssistantRow } from '@main/db/repositories/AssistantRepository'

type AssistantDataServiceDeps = {
  hasDb: () => boolean
  getAssistantRepo: () => AssistantRepository | undefined
}

export class AssistantDataService {
  constructor(private readonly deps: AssistantDataServiceDeps) {}

  saveAssistant(assistant: Assistant): string {
    const assistantRepo = this.requireAssistantRepo()
    assistantRepo.insert({
      id: assistant.id,
      name: assistant.name,
      icon: assistant.icon || null,
      description: assistant.description || null,
      model_account_id: assistant.modelRef.accountId,
      model_model_id: assistant.modelRef.modelId,
      system_prompt: assistant.systemPrompt,
      created_at: assistant.createdAt,
      updated_at: assistant.updatedAt,
      is_built_in: assistant.isBuiltIn ? 1 : 0,
      is_default: assistant.isDefault ? 1 : 0
    })
    console.log(`[DatabaseService] Saved assistant: ${assistant.id}`)
    return assistant.id
  }

  getAllAssistants(): Assistant[] {
    const assistantRepo = this.requireAssistantRepo()
    return assistantRepo.getAll().map(row => this.rowToAssistant(row))
  }

  deleteAllAssistants(): void {
    const assistantRepo = this.requireAssistantRepo()
    assistantRepo.deleteAll()
    console.log('[DatabaseService] Deleted all assistants')
  }

  getAssistantById(id: string): Assistant | undefined {
    const assistantRepo = this.requireAssistantRepo()
    const row = assistantRepo.getById(id)
    return row ? this.rowToAssistant(row) : undefined
  }

  updateAssistant(assistant: Assistant): void {
    const assistantRepo = this.requireAssistantRepo()
    assistantRepo.update({
      id: assistant.id,
      name: assistant.name,
      icon: assistant.icon || null,
      description: assistant.description || null,
      model_account_id: assistant.modelRef.accountId,
      model_model_id: assistant.modelRef.modelId,
      system_prompt: assistant.systemPrompt,
      created_at: assistant.createdAt ?? Date.now(),
      updated_at: assistant.updatedAt,
      is_built_in: assistant.isBuiltIn ? 1 : 0,
      is_default: assistant.isDefault ? 1 : 0
    })
    console.log(`[DatabaseService] Updated assistant: ${assistant.id}`)
  }

  deleteAssistant(id: string): void {
    const assistantRepo = this.requireAssistantRepo()
    assistantRepo.delete(id)
    console.log(`[DatabaseService] Deleted assistant: ${id}`)
  }

  private rowToAssistant(row: AssistantRow): Assistant {
    return {
      id: row.id,
      name: row.name,
      icon: row.icon || undefined,
      description: row.description || undefined,
      modelRef: {
        accountId: row.model_account_id,
        modelId: row.model_model_id
      },
      systemPrompt: row.system_prompt,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      isBuiltIn: row.is_built_in === 1,
      isDefault: row.is_default === 1
    }
  }

  private requireAssistantRepo(): AssistantRepository {
    if (!this.deps.hasDb()) throw new Error('Database not initialized')
    const repo = this.deps.getAssistantRepo()
    if (!repo) throw new Error('Assistant repository not initialized')
    return repo
  }
}
